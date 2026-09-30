"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { MessagesSquare, SendHorizontal, X } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { initialsOf, type ChatMessage } from "@/lib/types"

export function CallChatPanel({
  open,
  messages,
  onSend,
  onClose,
}: {
  open: boolean
  messages: ChatMessage[]
  onSend: (text: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [messages, open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft("")
  }

  return (
    <div className="flex h-full w-full flex-col bg-card md:w-80">
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Meeting chat</h2>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close chat panel"
        >
          <X />
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-center text-xs text-muted-foreground">
            Messages are visible to everyone in this call.
          </p>

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex items-start gap-2.5",
                message.self && "flex-row-reverse"
              )}
            >
              <Avatar size="sm" className="mt-0.5 shrink-0">
                <AvatarFallback>{initialsOf(message.author)}</AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "flex min-w-0 flex-col gap-1",
                  message.self && "items-end"
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium">
                    {message.self ? "You" : message.author}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {message.time}
                  </span>
                </div>
                <p
                  className={cn(
                    "w-fit rounded-xl px-3 py-2 text-sm leading-relaxed text-pretty break-words",
                    message.self
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm bg-muted text-foreground"
                  )}
                >
                  {message.text}
                </p>
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-border/70 p-3"
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message"
          aria-label="Message"
          // The server drops anything longer.
          maxLength={2000}
          className="h-9 rounded-full px-3.5"
        />
        <Button
          type="submit"
          size="icon-lg"
          className="shrink-0 rounded-full"
          disabled={!draft.trim()}
          aria-label="Send message"
        >
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}
