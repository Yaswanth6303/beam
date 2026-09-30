"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Check, Loader2, TriangleAlert } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { RequireAuth } from "@/components/require-auth"
import { SettingsSection, SettingsShell } from "@/components/settings-shell"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getProfile, updateProfile, type Profile } from "@/lib/api"
import { initialsOf } from "@/lib/types"

function ProfileContent() {
  const { session, updateSession } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session) return
    let cancelled = false

    getProfile(session.token)
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setName(data.name)
        // The cached name can lag if it changed on another device.
        if (data.name !== session.name) updateSession({ name: data.name })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load profile")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [session, updateSession])

  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(id)
  }, [saved])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return

    setSaving(true)
    setError(null)
    try {
      const updated = await updateProfile(session.token, name.trim())
      updateSession({ name: updated.name })
      setProfile((current) =>
        current ? { ...current, name: updated.name } : current
      )
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes")
    } finally {
      setSaving(false)
    }
  }

  if (!session) return null

  const dirty = name.trim() !== (profile?.name ?? "") && name.trim().length > 0

  return (
    <SettingsShell
      title="Profile"
      description="Your account details and how you appear in meetings."
    >
      <SettingsSection title="Display name">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your profile…
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar size="lg" className="size-14">
                <AvatarFallback>{initialsOf(name || session.name)}</AvatarFallback>
              </Avatar>
              <p className="text-sm text-muted-foreground">
                Peers see this name on your tile and next to your chat messages.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={80}
                required
              />
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <TriangleAlert className="size-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="submit" size="lg" disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        )}
      </SettingsSection>

      <SettingsSection
        title="Account"
        description="Your email is your sign-in identity and cannot be changed."
      >
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="mt-1 truncate text-sm font-medium">
              {session.username}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Member since</dt>
            <dd className="mt-1 text-sm font-medium">
              {profile
                ? new Date(profile.memberSince).toLocaleDateString([], {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Meetings</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {profile?.meetingCount ?? "—"}
            </dd>
          </div>
        </dl>
      </SettingsSection>
    </SettingsShell>
  )
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  )
}
