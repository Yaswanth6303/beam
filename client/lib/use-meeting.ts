"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

import { API_URL } from "@/lib/api"
import { readPreferences } from "@/lib/preferences"
import type { ChatMessage, Participant } from "@/lib/types"

const PEER_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
}

/** Payloads relayed verbatim by the server's `signal` handler (socketManager.ts).
 *  The server never inspects them, so we piggyback presence on the same channel:
 *  the REST API models no display names or mute state for peers. */
type SignalPayload =
  | { sdp: RTCSessionDescriptionInit }
  | { ice: RTCIceCandidateInit }
  | { name: string }
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
 *  replaceTrack on even when the mic was never granted. */
function silentTrack() {
  const ctx = new AudioContext()
  const destination = ctx.createMediaStreamDestination()
  const oscillator = ctx.createOscillator()
  oscillator.connect(destination)
  oscillator.start()
  const track = destination.stream.getAudioTracks()[0]
  track.enabled = false
  return track
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
}: {
  roomCode: string
  displayName: string
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<Record<string, PeerState>>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connected, setConnected] = useState(false)
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
  // Read inside socket callbacks that are registered once, so keep them in refs.
  const displayNameRef = useRef(displayName)
  const stateRef = useRef({ muted: false, videoOn: true })

  displayNameRef.current = displayName

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

      // Introduce ourselves; the server relays this untouched.
      emitSignal(peerId, { name: displayNameRef.current })
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
    setPeers((prev) => {
      const { [peerId]: _removed, ...rest } = prev
      return rest
    })
  }, [])

  // ---- Local media -------------------------------------------------------
  useEffect(() => {
    let cancelled = false

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
        stream = new MediaStream([blackTrack(), silentTrack()])
        setMicOn(false)
        setVideoOn(false)
        stateRef.current = { muted: true, videoOn: false }
      }

      if (cancelled) {
        for (const track of stream.getTracks()) track.stop()
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
      watchSpeaking(stream, setSelfSpeaking)
    }

    void start()

    return () => {
      cancelled = true
      for (const track of localStreamRef.current?.getTracks() ?? []) track.stop()
      localStreamRef.current = null
    }
  }, [])

  // ---- Signalling --------------------------------------------------------
  useEffect(() => {
    if (!localStream) return

    const socket = io(API_URL, { transports: ["websocket", "polling"] })
    socketRef.current = socket

    socket.on("connect", () => {
      selfIdRef.current = socket.id ?? ""
      setConnected(true)
      // The server treats the argument as an opaque room key.
      socket.emit("join-call", roomCode)
    })

    socket.on("disconnect", () => setConnected(false))

    socket.on("user-joined", (joinedId: string, clients: string[]) => {
      const selfId = selfIdRef.current
      const iAmTheNewcomer = joinedId === selfId

      for (const peerId of clients) {
        if (peerId === selfId) continue
        const isNew = !connectionsRef.current[peerId]
        const pc = ensureConnection(peerId)

        // The server broadcasts `user-joined` to the whole room, so both sides
        // would offer at once. Only peers already present offer to the newcomer;
        // the newcomer waits for those offers. That avoids SDP glare.
        if (!iAmTheNewcomer && peerId === joinedId && isNew) {
          void (async () => {
            try {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              emitSignal(peerId, { sdp: pc.localDescription!.toJSON() })
            } catch (error) {
              console.error("Failed to create offer", error)
            }
          })()
        }
      }
    })

    socket.on("signal", (fromId: string, raw: string) => {
      if (fromId === selfIdRef.current) return

      let payload: SignalPayload
      try {
        payload = JSON.parse(raw)
      } catch {
        return
      }

      if ("name" in payload) {
        ensureConnection(fromId)
        patchPeer(fromId, { name: payload.name })
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

      void (async () => {
        try {
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
        } catch (error) {
          console.error("Signal handling failed", error)
        }
      })()
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
  }, [localStream, roomCode, ensureConnection, closeConnection, emitSignal, patchPeer])

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
    // The server echoes this back to everyone including us, so do not append
    // locally — the `chat-message` listener adds it once.
    socketRef.current?.emit("chat-message", text, displayNameRef.current)
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
