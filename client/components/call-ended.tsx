"use client"

import Link from "next/link"
import { Clock, PhoneOff, RotateCcw, Users } from "lucide-react"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"

export function CallEndedScreen({
  title,
  roomCode,
  duration,
  participantCount,
  onRejoin,
}: {
  title: string
  roomCode: string
  duration: string
  participantCount: number
  onRejoin: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 md:px-6">
        <Logo href="/dashboard" />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center gap-6 rounded-2xl bg-card p-6 text-center ring-1 ring-foreground/10 sm:p-8">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <PhoneOff className="size-6" />
            </span>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                You left the meeting
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {title} · {roomCode}
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/60 p-3 text-left">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  Duration
                </p>
                <p className="mt-1 font-medium tabular-nums">{duration}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3 text-left">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3.5" />
                  People
                </p>
                <p className="mt-1 font-medium tabular-nums">
                  {participantCount}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={onRejoin}>
                <RotateCcw />
                Rejoin
              </Button>
              <Button
                render={<Link href="/dashboard" />}
                variant="outline"
                size="lg"
                className="flex-1"
              >
                Back to home
              </Button>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Left by mistake? Rejoin with the same code — everyone else is still
            there.
          </p>
        </div>
      </main>
    </div>
  )
}
