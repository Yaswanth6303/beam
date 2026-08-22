"use client"

import { useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { Loader2 } from "lucide-react"

import { useAuth } from "@/components/auth-provider"

/** Gates a page behind a stored session, bouncing signed-out users to /signin. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) router.replace("/signin")
  }, [loading, session, router])

  if (loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  return <>{children}</>
}
