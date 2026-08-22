"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Check, LogOut, TriangleAlert } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { RequireAuth } from "@/components/require-auth"
import {
  SettingsSection,
  SettingsShell,
  ToggleRow,
} from "@/components/settings-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changePassword } from "@/lib/api"
import { usePreferences, type Preferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

const themes: { value: Preferences["theme"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
]

function PasswordSection() {
  const { session, updateSession } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 3000)
    return () => clearTimeout(id)
  }, [done])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!session) return

    const form = e.currentTarget
    const data = new FormData(form)
    const current = String(data.get("currentPassword"))
    const next = String(data.get("newPassword"))
    const confirm = String(data.get("confirmPassword"))

    if (next !== confirm) {
      setError("The new passwords do not match")
      return
    }

    setSaving(true)
    setError(null)
    try {
      // The server issues a fresh token, so swap it into the stored session.
      const result = await changePassword(session.token, current, next)
      updateSession({ token: result.token })
      form.reset()
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsSection
      title="Password"
      description="Use at least 6 characters. You stay signed in on this device."
    >
      <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
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
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? "Updating…" : "Update password"}
          </Button>
          {done && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4" />
              Password updated
            </span>
          )}
        </div>
      </form>
    </SettingsSection>
  )
}

function SettingsContent() {
  const { signOut } = useAuth()
  const { preferences, update, loaded } = usePreferences()

  return (
    <SettingsShell
      title="Settings"
      description="Security, meeting defaults, and appearance."
    >
      <PasswordSection />

      <SettingsSection
        title="Meeting defaults"
        description="How your devices start when you join a call. Saved on this device."
      >
        <div className="flex flex-col">
          <ToggleRow
            label="Join muted"
            description="Start every meeting with your microphone off"
            checked={preferences.joinMuted}
            onChange={(next) => update({ joinMuted: next })}
          />
          <ToggleRow
            label="Join with camera off"
            description="Start every meeting with your video turned off"
            checked={preferences.joinCameraOff}
            onChange={(next) => update({ joinCameraOff: next })}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Appearance"
        description="Meetings always use the dark stage for video contrast."
      >
        <div
          role="radiogroup"
          aria-label="Theme"
          className="inline-flex gap-1 rounded-xl bg-muted p-1"
        >
          {themes.map((theme) => {
            const active = loaded && preferences.theme === theme.value
            return (
              <button
                key={theme.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => update({ theme: theme.value })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {theme.label}
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Sign out"
        description="Clears the session stored on this device."
      >
        <Button variant="destructive" size="lg" onClick={signOut}>
          <LogOut />
          Sign out
        </Button>
      </SettingsSection>
    </SettingsShell>
  )
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  )
}
