"use client"

import { useEffect, useRef, useState } from "react"

import { ParticipantTile } from "@/components/participant-tile"
import type { Participant } from "@/lib/types"

/** Webcam feeds are landscape; tiles keep this ratio so `object-cover` on the
 *  <video> crops as little as possible. */
const ASPECT = 16 / 9

export type Layout = { cols: number; rows: number; width: number; height: number }

/**
 * Picks the column count that yields the largest 16:9 tile for `count` people
 * in a `containerW` x `containerH` box. Breakpoint-based column counts cannot
 * do this: the right answer depends on the container's aspect ratio, which
 * changes when the chat panel opens or the window is resized.
 */
export function bestLayout(
  count: number,
  containerW: number,
  containerH: number,
  gap: number
): Layout {
  const empty = { cols: 1, rows: 1, width: 0, height: 0 }
  if (count < 1 || containerW <= 0 || containerH <= 0) return empty

  let best = empty

  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)

    // Space available per cell, before the aspect ratio is enforced.
    let width = (containerW - (cols - 1) * gap) / cols
    let height = (containerH - (rows - 1) * gap) / rows
    if (width <= 0 || height <= 0) continue

    // Shrink the longer dimension so the tile is exactly 16:9.
    if (width / height > ASPECT) width = height * ASPECT
    else height = width / ASPECT

    if (width * height > best.width * best.height) {
      best = { cols, rows, width, height }
    }
  }

  return best.width > 0 ? best : empty
}

export function ParticipantGrid({ participants }: { participants: Participant[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // The stage resizes on window resize and when the side panel slides open, so
  // measure the element rather than inferring size from breakpoints.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const gap = size.width >= 768 ? 16 : 12
  const layout = bestLayout(participants.length, size.width, size.height, gap)

  // Pinning the row width to exactly `cols` tiles keeps flex-wrap from slipping
  // an extra tile onto a row, while letting a short final row stay centred.
  const rowWidth = layout.cols * layout.width + (layout.cols - 1) * gap

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
    >
      {layout.width > 0 && (
        <div
          className="flex flex-wrap items-center justify-center"
          style={{ gap, width: rowWidth }}
        >
          {participants.map((participant) => (
            <ParticipantTile
              key={participant.id}
              participant={participant}
              label={participant.isSelf ? "You" : undefined}
              className="shrink-0"
              style={{ width: layout.width, height: layout.height }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
