"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import * as api from "@/lib/api"
import type { Session } from "@/lib/types"

const STORAGE_KEY = "beam.session"

type AuthValue = {
  session: Session | null
  /** True until the stored session has been read; guards render on first paint. */
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => void
  /** Keeps the cached session in step after a profile or password change. */
  updateSession: (patch: Partial<Session>) => void
}

const AuthContext = createContext<AuthValue | null>(null)

function readStoredSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.token ? (parsed as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // localStorage is not available during SSR, so hydrate after mount.
  useEffect(() => {
    setSession(readStoredSession())
    setLoading(false)
  }, [])

  const persist = useCallback((next: Session) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setSession(next)
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      persist(await api.login(email, password))
    },
    [persist]
  )

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      // /register returns only a message, so sign in straight after to get a token.
      await api.register(name, email, password)
      persist(await api.login(email, password))
    },
    [persist]
  )

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    router.push("/")
  }, [router])

  // A 401 on any authenticated call means the stored token is dead (expired,
  // or revoked by a password change on another device), so drop it and send
  // the user to sign in rather than leaving every page showing an error.
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      window.localStorage.removeItem(STORAGE_KEY)
      setSession(null)
      router.replace("/signin")
    })
    return () => api.setUnauthorizedHandler(null)
  }, [router])

  const updateSession = useCallback((patch: Partial<Session>) => {
    setSession((current) => {
      if (!current) return current
      const next = { ...current, ...patch }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ session, loading, signIn, signUp, signOut, updateSession }),
    [session, loading, signIn, signUp, signOut, updateSession]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>")
  return context
}
