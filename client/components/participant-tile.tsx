"use client"

import { useEffect, useRef } from "react"
import { MicOff } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initialsOf, type Participant } from "@/lib/types"

const barClasses = [
  "h-1.5 [animation-delay:0ms]",
  "h-3 [animation-delay:150ms]",
  "h-2 [animation-delay:300ms]",
]

export function ParticipantTile({
  participant,
  label,
  className,
  style,
}: {
  participant: Participant
  label?: string
  className?: string
  /** The stage passes measured pixel dimensions; the filmstrip uses classes. */
  style?: React.CSSProperties
}) {
  const name = label ?? participant.name
  const videoRef = useRef<HTMLVideoElement>(null)
  const showVideo = Boolean(participant.stream && participant.videoOn)

  // srcObject is a property, not an attribute, so it cannot be set from JSX.
  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    const stream = participant.stream ?? null
    if (element.srcObject !== stream) element.srcObject = stream
  }, [participant.stream])

  return (
    <div
      style={style}
      className={cn(
        // Sizing is owned by the caller so tiles can either fill a measured
        // stage cell or keep a fixed aspect ratio (the presenting filmstrip).
        "relative min-h-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10",
        participant.isSpeaking && "ring-2 ring-primary",
        className
      )}
    >
      {/* The <video> also plays the peer's audio, so it stays mounted while
          there is a stream and is only hidden when their camera is off —
          unmounting it would silence them too. */}
      {participant.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // Never play our own audio back — it would echo.
          muted={participant.isSelf}
          className={cn(
            "size-full object-cover",
            !showVideo && "hidden",
            // Mirror our own camera the way every call app does. A shared
            // screen goes through the same tile and must not be flipped.
            participant.isSelf && "-scale-x-100"
          )}
        />
      )}

      {showVideo ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Avatar size="lg" className="size-14 md:size-16">
            <AvatarFallback>{initialsOf(name)}</AvatarFallback>
          </Avatar>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-2 md:p-2.5">
        <span className="truncate rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {name}
        </span>
        {participant.muted && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm">
            <MicOff className="size-3.5" />
            <span className="sr-only">Microphone off</span>
          </span>
        )}
      </div>

      {participant.isSpeaking && (
        <span className="absolute top-2 right-2 flex items-end gap-0.5 rounded-md bg-black/50 px-1.5 py-1.5 backdrop-blur-sm md:top-2.5 md:right-2.5">
          {barClasses.map((bar) => (
            <span
              key={bar}
              className={cn("w-0.5 animate-pulse rounded-full bg-primary", bar)}
            />
          ))}
          <span className="sr-only">Speaking</span>
        </span>
      )}
    </div>
  )
}
