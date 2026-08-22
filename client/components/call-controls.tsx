"use client"

import type { ReactNode } from "react"
import {
  MessagesSquare,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

function ControlButton({
  label,
  active = false,
  danger = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={danger ? "destructive" : active ? "default" : "secondary"}
            size="icon-lg"
            onClick={onClick}
            aria-pressed={active}
            aria-label={label}
            className={cn(
              "size-11 rounded-full [&_svg:not([class*='size-'])]:size-5",
              !danger && !active && "bg-secondary/80 hover:bg-secondary"
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function CallControls({
  micOn,
  videoOn,
  sharing,
  chatOpen,
  peopleOpen,
  unreadCount,
  onToggleMic,
  onToggleVideo,
  onToggleSharing,
  onToggleChat,
  onTogglePeople,
  onLeave,
}: {
  micOn: boolean
  videoOn: boolean
  sharing: boolean
  chatOpen: boolean
  peopleOpen: boolean
  unreadCount: number
  onToggleMic: () => void
  onToggleVideo: () => void
  onToggleSharing: () => void
  onToggleChat: () => void
  onTogglePeople: () => void
  onLeave: () => void
}) {
  return (
    <TooltipProvider delay={200}>
      <div className="flex items-center gap-2 rounded-full bg-card/90 p-2 ring-1 ring-foreground/10 backdrop-blur-md">
        <ControlButton
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          danger={!micOn}
          onClick={onToggleMic}
        >
          {micOn ? <Mic /> : <MicOff />}
        </ControlButton>

        <ControlButton
          label={videoOn ? "Turn off camera" : "Turn on camera"}
          danger={!videoOn}
          onClick={onToggleVideo}
        >
          {videoOn ? <Video /> : <VideoOff />}
        </ControlButton>

        <ControlButton
          label={sharing ? "Stop sharing screen" : "Share screen"}
          active={sharing}
          onClick={onToggleSharing}
        >
          <MonitorUp />
        </ControlButton>

        <div className="relative">
          <ControlButton
            label={chatOpen ? "Close chat" : "Open chat"}
            active={chatOpen}
            onClick={onToggleChat}
          >
            <MessagesSquare />
          </ControlButton>
          {unreadCount > 0 && !chatOpen && (
            <span className="pointer-events-none absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground ring-2 ring-card tabular-nums">
              {unreadCount > 9 ? "9+" : unreadCount}
              <span className="sr-only">unread messages</span>
            </span>
          )}
        </div>

        <ControlButton
          label={peopleOpen ? "Close people" : "Show people"}
          active={peopleOpen}
          onClick={onTogglePeople}
        >
          <Users />
        </ControlButton>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          size="lg"
          onClick={onLeave}
          aria-label="Leave meeting"
          className="h-11 gap-2 rounded-full bg-red-600 px-4 text-white hover:bg-red-500 [&_svg:not([class*='size-'])]:size-5"
        >
          <PhoneOff />
          <span className="hidden text-sm font-medium sm:inline">Leave</span>
        </Button>
      </div>
    </TooltipProvider>
  )
}
