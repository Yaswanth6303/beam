"use client"

import { useEffect } from "react"

import { applyTheme, readPreferences } from "@/lib/preferences"

/** Applies the saved theme once on load. The stored value is device-local, so
 *  it cannot be resolved during SSR. */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readPreferences().theme)
  }, [])

  return null
}
