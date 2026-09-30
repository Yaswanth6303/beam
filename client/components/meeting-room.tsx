"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2, MonitorUp, TriangleAlert, Users } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { CallChatPanel } from "@/components/call-chat-panel"
import { CallControls } from "@/components/call-controls"
import { CallEndedScreen } from "@/components/call-ended"
import { CallPeoplePanel } from "@/components/call-people-panel"
import { Logo } from "@/components/logo"
import { ParticipantGrid } from "@/components/participant-grid"
import { ParticipantTile } from "@/components/participant-tile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { addToHistory } from "@/lib/api"
import { useMeeting } from "@/lib/use-meeting"
import { cn } from "@/lib/utils"

function formatElapsed(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0")
  const seconds = String(totalSeconds % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

export function MeetingRoom({
  roomCode,
  title,
}: {
  roomCode: string
  /** Null when the host never named the call; only real names are persisted. */
  title: string | null
}) {
  const displayTitle = title || "Instant meeting"
  const { session } = useAuth()
  const displayName = session?.name ?? "Guest"

  const {
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
  } = useMeeting({ roomCode, displayName, token: session?.token ?? "" })

  const [ended, setEnded] = useState(false)
  const [panel, setPanel] = useState<"chat" | "people">("chat")
  const [panelOpen, setPanelOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (ended) return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [ended])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  // Record the visit once per room so it shows up on the dashboard.
  const recordedRef = useRef("")
  useEffect(() => {
    if (!session || recordedRef.current === roomCode) return
    recordedRef.current = roomCode
    addToHistory(session.token, roomCode, title ?? undefined).catch((error) => {
      console.error("Could not save meeting to history", error)
    })
  }, [session, roomCode, title])

  // Count messages that arrive from peers while the chat panel is closed.
  const seenCountRef = useRef(0)
  useEffect(() => {
    const chatOpen = panelOpen && panel === "chat"
    if (chatOpen) {
      seenCountRef.current = messages.length
      setUnreadCount(0)
      return
    }
    setUnreadCount(
      messages.slice(seenCountRef.current).filter((message) => !message.self)
        .length
    )
  }, [messages, panelOpen, panel])

  // The chat and people panels share one side rail: clicking the active one
  // closes it, clicking the other swaps the content in place.
  function togglePanel(next: "chat" | "people") {
    const closing = panelOpen && panel === next
    setPanelOpen(!closing)
    setPanel(next)
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function handleLeave() {
    leave()
    setEnded(true)
    setPanelOpen(false)
  }

  if (ended) {
    return (
      <CallEndedScreen
        title={displayTitle}
        roomCode={roomCode}
        duration={formatElapsed(elapsed)}
        participantCount={participants.length}
        // Rejoining needs a fresh socket and peer-connection set; a reload is
        // the simplest way to get one.
        onRejoin={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="dark flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo href="/dashboard" showText={false} />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {displayTitle}
            </h1>
            <p className="truncate text-xs text-muted-foreground">{roomCode}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 tabular-nums">
            <span
              className={cn(
                "size-1.5 rounded-full",
                connected ? "animate-pulse bg-red-500" : "bg-muted-foreground"
              )}
            />
            {formatElapsed(elapsed)}
          </Badge>
          <Badge
            variant="secondary"
            className="cursor-pointer gap-1.5 tabular-nums transition-colors hover:bg-secondary/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            render={
              <button
                type="button"
                onClick={() => togglePanel("people")}
                aria-expanded={panelOpen && panel === "people"}
                aria-label={`People in this meeting: ${participants.length}`}
              />
            }
          >
            <Users />
            {participants.length}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyCode}
            aria-label="Copy meeting code"
          >
            {copied ? <Check /> : <Copy />}
            <span className="hidden sm:inline">
              {copied ? "Copied" : "Copy code"}
            </span>
          </Button>
        </div>
      </header>

      {mediaError && (
        <div className="flex shrink-0 items-center justify-center gap-2 bg-destructive/15 px-4 py-2 text-xs text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" />
          {mediaError}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 md:gap-4 md:p-4">
          <div className="min-h-0 flex-1 overflow-hidden">
            {connectionError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-muted/50 text-sm text-destructive ring-1 ring-foreground/10">
                <TriangleAlert className="size-5" />
                {connectionError}
              </div>
            ) : !connected ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-muted/50 text-sm text-muted-foreground ring-1 ring-foreground/10">
                <Loader2 className="size-5 animate-spin" />
                Connecting to the meeting…
              </div>
            ) : sharing ? (
              <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
                <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-2xl bg-muted p-6 text-center ring-1 ring-foreground/10">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <MonitorUp className="size-6" />
                  </span>
                  <div>
                    <p className="font-medium">You are presenting your screen</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Everyone in this meeting can see your shared window.
                    </p>
                  </div>
                  <Button variant="outline" onClick={toggleSharing}>
                    Stop sharing
                  </Button>
                </div>

                <div className="flex h-24 shrink-0 gap-3 overflow-x-auto sm:h-28 lg:h-auto lg:w-56 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
                  {participants.map((participant) => (
                    <ParticipantTile
                      key={participant.id}
                      participant={participant}
                      label={participant.isSelf ? "You" : undefined}
                      className="aspect-video h-full w-auto shrink-0 lg:h-auto lg:w-full"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <ParticipantGrid participants={participants} />
            )}
          </div>

          <div className="flex shrink-0 justify-center">
            <CallControls
              micOn={micOn}
              videoOn={videoOn}
              sharing={sharing}
              chatOpen={panelOpen && panel === "chat"}
              peopleOpen={panelOpen && panel === "people"}
              unreadCount={unreadCount}
              onToggleMic={toggleMic}
              onToggleVideo={toggleVideo}
              onToggleSharing={toggleSharing}
              onToggleChat={() => togglePanel("chat")}
              onTogglePeople={() => togglePanel("people")}
              onLeave={handleLeave}
            />
          </div>
        </div>

        <aside
          inert={!panelOpen}
          className={cn(
            "absolute inset-y-0 right-0 z-30 w-full max-w-sm overflow-hidden bg-card transition-transform duration-300 ease-out md:static md:max-w-none md:shrink-0 md:transition-[width]",
            panelOpen
              ? "translate-x-0 border-l border-border/70 md:w-80"
              : "translate-x-full md:w-0 md:translate-x-0"
          )}
        >
          {panel === "chat" ? (
            <CallChatPanel
              open={panelOpen}
              messages={messages}
              onSend={sendMessage}
              onClose={() => setPanelOpen(false)}
            />
          ) : (
            <CallPeoplePanel
              participants={participants}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </aside>
      </div>
    </div>
  )
}
