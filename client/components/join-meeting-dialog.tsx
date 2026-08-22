"use client"

import type React from "react"

import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function JoinMeetingDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter()
  const [code, setCode] = useState("")

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const room = code.trim()
    if (!room) return
    router.push(`/meeting?room=${encodeURIComponent(room)}`)
  }

  return (
    <Dialog>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a meeting</DialogTitle>
          <DialogDescription>
            Enter the meeting code or link your host shared with you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="room-code">Meeting code</Label>
            <Input
              id="room-code"
              placeholder="e.g. beam-4821"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!code.trim()}
          >
            Join now
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
