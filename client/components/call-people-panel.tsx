"use client"

import { Mic, MicOff, Users, Video, VideoOff, X } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { initialsOf, type Participant } from "@/lib/types"

function StatusIcon({ off, children }: { off: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
        off ? "bg-destructive/15 text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </span>
  )
}

export function CallPeoplePanel({
  participants,
  onClose,
}: {
  participants: Participant[]
  onClose: () => void
}) {
  return (
    <div className="flex h-full w-full flex-col bg-card md:w-80">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">People</h2>
          <Badge variant="secondary" className="tabular-nums">
            {participants.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close people panel"
        >
          <X />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-0.5 p-2">
          {participants.map((participant) => (
            <li
              key={participant.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60"
            >
              <Avatar className="shrink-0">
                <AvatarFallback>{initialsOf(participant.name)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {participant.name}
                  {participant.isSelf && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      (You)
                    </span>
                  )}
                </p>
                {participant.isSpeaking && (
                  <p className="text-xs text-primary">Speaking</p>
                )}
              </div>

              <StatusIcon off={Boolean(participant.muted)}>
                {participant.muted ? <MicOff /> : <Mic />}
                <span className="sr-only">
                  {participant.muted ? "Microphone off" : "Microphone on"}
                </span>
              </StatusIcon>
              <StatusIcon off={!participant.videoOn}>
                {participant.videoOn ? <Video /> : <VideoOff />}
                <span className="sr-only">
                  {participant.videoOn ? "Camera on" : "Camera off"}
                </span>
              </StatusIcon>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}
