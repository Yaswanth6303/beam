"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Calendar, Clock, Loader2, Plus, TriangleAlert, Video, Trash2 } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { useAuth } from "@/components/auth-provider"
import { JoinMeetingDialog } from "@/components/join-meeting-dialog"
import { NewMeetingDialog } from "@/components/new-meeting-dialog"
import { RequireAuth } from "@/components/require-auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getHistory, deleteHistory, clearHistory } from "@/lib/api"
import { initialsOf, type MeetingRecord } from "@/lib/types"

function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const daysAgo = Math.floor(
    (startOfToday.getTime() - date.getTime()) / 86_400_000
  )

  if (daysAgo < 0) return `Today · ${time}`
  if (daysAgo === 0) return `Yesterday · ${time}`
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`
}

function DashboardContent() {
  const { session } = useAuth()
  const router = useRouter()
  const [history, setHistory] = useState<MeetingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (meetingCode: string) => {
    if (!session) return
    try {
      await deleteHistory(session.token, meetingCode)
      setHistory((prev) => prev.filter((m) => m.meetingCode !== meetingCode))
    } catch (err: unknown) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to delete meeting")
    }
  }

  const handleClearAll = async () => {
    if (!session) return
    if (!window.confirm("Are you sure you want to clear all your meeting history?")) return
    try {
      await clearHistory(session.token)
      setHistory([])
    } catch (err: unknown) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to clear history")
    }
  }

  useEffect(() => {
    if (!session) return
    let cancelled = false

    getHistory(session.token)
      .then((records) => {
        if (!cancelled) setHistory(records)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load your history"
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session])

  if (!session) return null

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <AppHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6 md:py-10">
        {/* Profile */}
        <section className="mb-8 flex flex-col items-start gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:gap-5">
          <Avatar size="lg" className="size-16">
            <AvatarFallback className="text-lg">
              {initialsOf(session.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {session.name}
            </h1>
            <p className="text-sm text-muted-foreground">{session.username}</p>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <span className="size-1.5 rounded-full bg-primary" />
            Available
          </Badge>
        </section>

        {/* Quick actions */}
        <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NewMeetingDialog
            trigger={
              <button
                type="button"
                className="group flex flex-col gap-4 rounded-2xl bg-primary p-6 text-left text-primary-foreground ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary-foreground/15">
                  <Plus className="size-5" />
                </span>
                <div>
                  <h2 className="font-medium">New meeting</h2>
                  <p className="text-sm text-primary-foreground/80">
                    Start an instant call and invite others
                  </p>
                </div>
              </button>
            }
          />

          <JoinMeetingDialog
            trigger={
              <button
                type="button"
                className="group flex flex-col gap-4 rounded-2xl bg-card p-6 text-left ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Video className="size-5" />
                </span>
                <div>
                  <h2 className="font-medium">Join meeting</h2>
                  <p className="text-sm text-muted-foreground">
                    Enter a code to join an existing call
                  </p>
                </div>
              </button>
            }
          />

          <div className="group flex flex-col gap-4 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Calendar className="size-5" />
            </span>
            <div>
              <h2 className="font-medium">Schedule</h2>
              <p className="text-sm text-muted-foreground">
                Plan a meeting for later
              </p>
            </div>
          </div>
        </section>

        {/* History */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold tracking-tight">
                Recent meetings
              </h2>
            </div>
            {history.length > 0 && !loading && !error && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-8 px-2 text-muted-foreground hover:text-destructive"
              >
                Clear all
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading your meetings…
              </div>
            ) : error ? (
              <div className="flex items-center justify-center gap-2 p-10 text-sm text-destructive">
                <TriangleAlert className="size-4 shrink-0" />
                {error}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center gap-1 p-10 text-center">
                <p className="font-medium">No meetings yet</p>
                <p className="text-sm text-muted-foreground">
                  Meetings you start or join will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((meeting) => (
                  <li
                    key={meeting._id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {meeting.title || meeting.meetingCode}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatWhen(meeting.date)} · {meeting.meetingCode}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => handleDelete(meeting.meetingCode)}
                        title="Delete from history"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() =>
                          router.push(
                            `/meeting?room=${encodeURIComponent(meeting.meetingCode)}`
                          )
                        }
                      >
                        Rejoin
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  )
}
