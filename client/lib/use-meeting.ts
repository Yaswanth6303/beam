"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import { API_URL } from "@/lib/api"
import { readPreferences } from "@/lib/preferences"
import type { ChatMessage, Participant } from "@/lib/types"

const TURN_URLS = process.env.NEXT_PUBLIC_TURN_URLS

/** STUN finds a direct route; TURN relays media when there is none (strict
 *  NATs, corporate firewalls, some mobile carriers). Without TURN those users
 *  join the call but never see or hear anyone. */
const PEER_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(TURN_URLS
      ? [
          {
            urls: TURN_URLS.split(",").map((url) => url.trim()),
            username: process.env.NEXT_PUBLIC_TURN_USERNAME,
            credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
}

/** Payloads relayed verbatim by the server's `signal` handler (socketManager.ts).
 *  The server never inspects them, so we piggyback mute state on the same
 *  channel. Display names are not sent this way: the server attaches the
 *  verified account name to `user-joined`, so peers cannot spoof them. */
type SignalPayload =
  | { sdp: RTCSessionDescriptionInit }
  | { ice: RTCIceCandidateInit }
  | { state: { muted: boolean; videoOn: boolean } }

type PeerState = {
  name: string
  muted: boolean
  videoOn: boolean
  stream?: MediaStream
  speaking: boolean
}

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** A silent audio track, used so a peer always has an audio sender to
 *  replaceTrack on even when the mic was never granted. `close` releases the
 *  AudioContext behind it; browsers cap how many can be open at once. */
function silentTrack() {
  const ctx = new AudioContext()
  const destination = ctx.createMediaStreamDestination()
  const oscillator = ctx.createOscillator()
  oscillator.connect(destination)
  oscillator.start()
  const track = destination.stream.getAudioTracks()[0]
  track.enabled = false
  return { track, close: () => void ctx.close() }
}

/** A 2x2 black video track, same idea as `silentTrack` for the camera. */
function blackTrack() {
  const canvas = Object.assign(document.createElement("canvas"), {
    width: 2,
    height: 2,
  })
  canvas.getContext("2d")?.fillRect(0, 0, 2, 2)
  const track = canvas.captureStream(1).getVideoTracks()[0]
  track.enabled = false
  return track
}

/** Polls an audio track's short-term volume so the design's speaking ring works.
 *  Nothing on the server reports who is talking, so each client measures it. */
function watchSpeaking(stream: MediaStream, onChange: (speaking: boolean) => void) {
  if (stream.getAudioTracks().length === 0) return () => {}

  let ctx: AudioContext
  try {
    ctx = new AudioContext()
  } catch {
    return () => {}
  }

  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)

  const samples = new Uint8Array(analyser.frequencyBinCount)
  let speaking = false
  let quietTicks = 0

  const timer = setInterval(() => {
    analyser.getByteFrequencyData(samples)
    const average = samples.reduce((sum, v) => sum + v, 0) / samples.length

    if (average > 18) {
      quietTicks = 0
      if (!speaking) {
        speaking = true
        onChange(true)
      }
    } else if (speaking && ++quietTicks > 6) {
      // Require a short run of quiet frames so pauses between words don't flicker.
      speaking = false
      onChange(false)
    }
  }, 150)

  return () => {
    clearInterval(timer)
    void ctx.close()
  }
}

export function useMeeting({
  roomCode,
  displayName,
  token,
}: {
  roomCode: string
  displayName: string
  /** The session JWT; the signalling server refuses unauthenticated sockets. */
  token: string
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<Record<string, PeerState>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [micOn, setMicOn] = useState(true)
  const [videoOn, setVideoOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [selfSpeaking, setSelfSpeaking] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const selfIdRef = useRef<string>("")
  const connectionsRef = useRef<Record<string, RTCPeerConnection>>({})
  const localStreamRef = useRef<MediaStream | null>(null)
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null)
  const speakingCleanupRef = useRef<Record<string, () => void>>({})
  /** Per-peer promise chain. Each signal waits for the previous one from the
   *  same peer, so an ICE candidate is never applied while the offer it
   *  belongs to is still being set (addIceCandidate would throw). */
  const signalQueueRef = useRef<Record<string, Promise<void>>>({})
  // Read inside socket callbacks that are registered once, so keep it in a ref.
  const stateRef = useRef({ muted: false, videoOn: true })

  const emitSignal = useCallback((toId: string, payload: SignalPayload) => {
    socketRef.current?.emit("signal", toId, JSON.stringify(payload))
  }, [])

  /** Tell every peer our current mute/camera state — the design shows it per tile. */
  const broadcastState = useCallback(
    (next: { muted: boolean; videoOn: boolean }) => {
      stateRef.current = next
      for (const id of Object.keys(connectionsRef.current)) {
        emitSignal(id, { state: next })
      }
    },
    [emitSignal]
  )

  const patchPeer = useCallback((id: string, patch: Partial<PeerState>) => {
    setPeers((prev) => {
      const existing = prev[id]
      if (!existing) return prev
      return { ...prev, [id]: { ...existing, ...patch } }
    })
  }, [])

  /** Creates the RTCPeerConnection for `peerId` if we do not already have one. */
  const ensureConnection = useCallback(
    (peerId: string) => {
      const existing = connectionsRef.current[peerId]
      if (existing) return existing

      const pc = new RTCPeerConnection(PEER_CONFIG)
      connectionsRef.current[peerId] = pc

      const stream = localStreamRef.current
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream)
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) emitSignal(peerId, { ice: event.candidate.toJSON() })
      }

      pc.ontrack = (event) => {
        const remote = event.streams[0]
        if (!remote) return

        patchPeer(peerId, { stream: remote })

        speakingCleanupRef.current[peerId]?.()
        speakingCleanupRef.current[peerId] = watchSpeaking(remote, (speaking) =>
          patchPeer(peerId, { speaking })
        )
      }

      setPeers((prev) =>
        prev[peerId]
          ? prev
          : {
              ...prev,
              [peerId]: {
                name: "Guest",
                muted: false,
                videoOn: true,
                speaking: false,
              },
            }
      )

      // Share our mute/camera state; the server relays this untouched.
      emitSignal(peerId, { state: stateRef.current })

      return pc
    },
    [emitSignal, patchPeer]
  )

  const closeConnection = useCallback((peerId: string) => {
    connectionsRef.current[peerId]?.close()
    delete connectionsRef.current[peerId]
    speakingCleanupRef.current[peerId]?.()
    delete speakingCleanupRef.current[peerId]
    delete signalQueueRef.current[peerId]
    setPeers((prev) => {
      const { [peerId]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  // ---- Local media -------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    // AudioContexts opened for this stream, closed when the hook unmounts.
    const cleanups: (() => void)[] = []

    async function start() {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        })
      } catch {
        // Joining without a camera or mic is still useful, so fall back to
        // placeholder tracks rather than dropping the user out of the call.
        if (cancelled) return
        setMediaError("Camera and microphone unavailable — joining muted.")
        const silent = silentTrack()
        cleanups.push(silent.close)
        stream = new MediaStream([blackTrack(), silent.track])
        setMicOn(false)
        setVideoOn(false)
        stateRef.current = { muted: true, videoOn: false }
      }

      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
        for (const cleanup of cleanups) cleanup()
        return
      }

      // Apply the device defaults chosen in Settings before anyone connects.
      const { joinMuted, joinCameraOff } = readPreferences()
      if (joinMuted) {
        for (const track of stream.getAudioTracks()) track.enabled = false
        setMicOn(false)
      }
      if (joinCameraOff) {
        for (const track of stream.getVideoTracks()) track.enabled = false
        setVideoOn(false)
      }
      stateRef.current = {
        muted: joinMuted || stateRef.current.muted,
        videoOn: !joinCameraOff && stateRef.current.videoOn,
      }

      localStreamRef.current = stream
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null
      setLocalStream(stream)
      cleanups.push(watchSpeaking(stream, setSelfSpeaking))
    }

    void start()

    return () => {
      cancelled = true
      for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
      localStreamRef.current = null
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  // ---- Signalling --------------------------------------------------------
  useEffect(() => {
    if (!localStream) return

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      auth: { token },
    })
    socketRef.current = socket

    socket.on("connect", () => {
      selfIdRef.current = socket.id ?? ""
      setConnected(true)
      setConnectionError(null)
      // The server treats the argument as an opaque room key.
      socket.emit("join-call", roomCode)
    })

    socket.on("connect_error", (error) => {
      // An auth rejection will not fix itself on retry, so stop and say so.
      if (error.message === "Unauthorized") {
        socket.disconnect()
        setConnectionError("Your session has expired. Sign in again to join.")
      }
    })

    socket.on("disconnect", () => setConnected(false))

    /** Runs `task` after every earlier signal task for the same peer. */
    const enqueue = (peerId: string, task: () => Promise<void>) => {
      const previous = signalQueueRef.current[peerId] ?? Promise.resolve()
      signalQueueRef.current[peerId] = previous.then(task).catch((error) => {
        console.error("Signal handling failed", error)
      })
    }

    socket.on(
      "user-joined",
      (joinedId: string, clients: string[], names: Record<string, string>) => {
        const selfId = selfIdRef.current
        const iAmTheNewcomer = joinedId === selfId

        for (const peerId of clients) {
          if (peerId === selfId) continue
          const isNew = !connectionsRef.current[peerId]
          const pc = ensureConnection(peerId)
          // Names come from the server's verified account, not from peers.
          const name = names[peerId]
          if (name) patchPeer(peerId, { name })

          // The server broadcasts `user-joined` to the whole room, so both sides
          // would offer at once. Only peers already present offer to the newcomer;
          // the newcomer waits for those offers. That avoids SDP glare.
          if (!iAmTheNewcomer && peerId === joinedId && isNew) {
            enqueue(peerId, async () => {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              emitSignal(peerId, { sdp: pc.localDescription!.toJSON() })
            })
          }
        }
      }
    )

    socket.on("signal", (fromId: string, raw: string) => {
      if (fromId === selfIdRef.current) return

      let payload: SignalPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      if ("state" in payload) {
        ensureConnection(fromId)
        patchPeer(fromId, {
          muted: payload.state.muted,
          videoOn: payload.state.videoOn,
        })
        return
      }

      const pc = ensureConnection(fromId)

      enqueue(fromId, async () => {
        if ("sdp" in payload) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          if (payload.sdp.type === "offer") {
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            emitSignal(fromId, { sdp: pc.localDescription!.toJSON() })
          }
        } else if ("ice" in payload) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.ice))
        }
      })
    })

    socket.on("user-left", (id: string) => closeConnection(id))

    socket.on(
      "chat-message",
      (text: string, sender: string, socketIdSender: string) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `${socketIdSender}-${prev.length}-${Date.now()}`,
            author: sender,
            time: nowLabel(),
            text,
            self: socketIdSender === selfIdRef.current,
          },
        ])
      }
    )

    return () => {
      for (const id of Object.keys(connectionsRef.current)) closeConnection(id)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [localStream, roomCode, token, ensureConnection, closeConnection, emitSignal, patchPeer])

  // ---- Controls ----------------------------------------------------------
  const toggleMic = useCallback(() => {
    const next = !micOn
    for (const track of localStreamRef.current?.getAudioTracks() ?? []) {
      track.enabled = next
    }
    setMicOn(next)
    broadcastState({ muted: !next, videoOn: stateRef.current.videoOn })
  }, [micOn, broadcastState])

  const toggleVideo = useCallback(() => {
    const next = !videoOn
    for (const track of localStreamRef.current?.getVideoTracks() ?? []) {
      track.enabled = next
    }
    setVideoOn(next)
    broadcastState({ muted: stateRef.current.muted, videoOn: next })
  }, [videoOn, broadcastState])

  /** Swaps the outgoing video track in place. `replaceTrack` keeps the existing
   *  m-line, so screen sharing needs no renegotiation round trip. */
  const replaceVideoTrack = useCallback((track: MediaStreamTrack | null) => {
    for (const pc of Object.values(connectionsRef.current)) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video")
      void sender?.replaceTrack(track)
    }
  }, [])

  const stopSharing = useCallback(() => {
    const stream = localStreamRef.current
    const camera = cameraTrackRef.current
    if (!stream) return

    for (const track of stream.getVideoTracks()) {
      if (track !== camera) {
        track.stop()
        stream.removeTrack(track)
      }
    }

    if (camera) {
      if (!stream.getVideoTracks().includes(camera)) stream.addTrack(camera)
      camera.enabled = videoOn
      replaceVideoTrack(camera)
    }

    setSharing(false)
    setLocalStream(new MediaStream(stream.getTracks()))
  }, [replaceVideoTrack, videoOn])

  const startSharing = useCallback(async () => {
    const stream = localStreamRef.current
    if (!stream) return

    let display: MediaStream
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true })
    } catch {
      return // The user dismissed the picker.
    }

    const screenTrack = display.getVideoTracks()[0]
    if (!screenTrack) return

    for (const track of stream.getVideoTracks()) stream.removeTrack(track)
    stream.addTrack(screenTrack)
    replaceVideoTrack(screenTrack)

    // Fires when the user stops sharing from the browser's own bar.
    screenTrack.onended = () => stopSharing()

    setSharing(true)
    setLocalStream(new MediaStream(stream.getTracks()))
  }, [replaceVideoTrack, stopSharing])

  const toggleSharing = useCallback(() => {
    if (sharing) stopSharing()
    else void startSharing()
  }, [sharing, startSharing, stopSharing])

  const sendMessage = useCallback((text: string) => {
    // The server stamps our verified name and echoes this back to everyone
    // including us, so do not append locally — the listener adds it once.
    socketRef.current?.emit("chat-message", text)
  }, [])

  const leave = useCallback(() => {
    for (const id of Object.keys(connectionsRef.current)) closeConnection(id)
    socketRef.current?.disconnect()
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
    localStreamRef.current = null
    setLocalStream(null)
    setConnected(false)
  }, [closeConnection])

  const participants: Participant[] = [
    {
      id: "self",
      name: displayName,
      stream: localStream ?? undefined,
      isSelf: true,
      muted: !micOn,
      videoOn: videoOn || sharing,
      isSpeaking: selfSpeaking && micOn,
    },
    ...Object.entries(peers).map(([id, peer]) => ({
      id,
      name: peer.name,
      stream: peer.stream,
      muted: peer.muted,
      videoOn: peer.videoOn,
      isSpeaking: peer.speaking && !peer.muted,
    })),
  ]

  return {
    participants,
    messages,
    connected,
    connectionError,
    mediaError,
    micOn,
    videoOn,
    sharing,
    toggleMic,
    toggleVideo,
    toggleSharing,
    sendMessage,
    leave,
  }
}
