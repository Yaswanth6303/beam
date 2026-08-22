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
import { newRoomCode } from "@/lib/utils"

/** Starts a call. The optional name is what `Meeting.title` stores, so the
 *  dashboard can list something friendlier than a room code. */
export function NewMeetingDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter()
  const [title, setTitle] = useState("")

  function handleStart(e: React.FormEvent) {
    e.preventDefault()
    const room = newRoomCode()
    const name = title.trim()
    router.push(
      `/meeting?room=${room}${name ? `&title=${encodeURIComponent(name)}` : ""}`
    )
  }

  return (
    <Dialog>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a meeting</DialogTitle>
          <DialogDescription>
            Give it a name so you can find it later, or just start right away.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleStart} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="meeting-title">
              Meeting name{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="meeting-title"
              placeholder="e.g. Product Sync"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" className="w-full">
            Start meeting
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
