"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { MeetingRoom } from "@/components/meeting-room"
import { RequireAuth } from "@/components/require-auth"
import { newRoomCode } from "@/lib/utils"

function Fallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading meeting</span>
    </div>
  )
}

function MeetingEntry() {
  const router = useRouter()
  const params = useSearchParams()
  const room = params.get("room")

  // Everyone in a call must agree on the room key, so a code can never be
  // generated during render — it would differ per participant and per reload.
  // Mint one, put it in the URL, and join that.
  const [minted] = useState(() => (room && room !== "new" ? null : newRoomCode()))

  const titleParam = params.get("title")
  useEffect(() => {
    if (!minted) return
    const suffix = titleParam ? `&title=${encodeURIComponent(titleParam)}` : ""
    router.replace(`/meeting?room=${minted}${suffix}`)
  }, [minted, titleParam, router])

  const roomCode = room && room !== "new" ? room : minted
  if (!roomCode) return <Fallback />

  return <MeetingRoom roomCode={roomCode} title={titleParam} />
}

export default function MeetingPage() {
  return (
    <RequireAuth>
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={<Fallback />}>
        <MeetingEntry />
      </Suspense>
    </RequireAuth>
  )
}
