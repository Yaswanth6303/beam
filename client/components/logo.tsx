import Link from "next/link"
import { Video } from "lucide-react"

import { cn } from "@/lib/utils"

export function Logo({
  className,
  href = "/",
  showText = true,
}: {
  className?: string
  href?: string
  showText?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Video className="size-4" />
      </span>
      {showText && (
        <span className="text-lg font-semibold tracking-tight">Beam</span>
      )}
    </Link>
  )
}
