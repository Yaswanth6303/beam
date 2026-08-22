"use client"

import { useCallback, useEffect, useState } from "react"

/** Device and appearance choices. The backend models none of these, so they
 *  live on the device rather than the account. */
export type Preferences = {
  /** Join calls with the microphone already muted. */
  joinMuted: boolean
  /** Join calls with the camera already off. */
  joinCameraOff: boolean
  theme: "light" | "dark" | "system"
}

export const DEFAULT_PREFERENCES: Preferences = {
  joinMuted: false,
  joinCameraOff: false,
  theme: "light",
}

const STORAGE_KEY = "beam.preferences"

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

/** The root element carries `light`/`dark`; globals.css keys its tokens off it. */
export function applyTheme(theme: Preferences["theme"]) {
  const prefersDark =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : theme === "dark"

  const root = document.documentElement
  root.classList.toggle("dark", prefersDark)
  root.classList.toggle("light", !prefersDark)
}

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loaded, setLoaded] = useState(false)

  // localStorage is unavailable during SSR, so read after mount.
  useEffect(() => {
    setPreferences(readPreferences())
    setLoaded(true)
  }, [])

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      if (patch.theme) applyTheme(patch.theme)
      return next
    })
  }, [])

  return { preferences, update, loaded }
}
