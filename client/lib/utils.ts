import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// No 0/o/1/l, so codes survive being read aloud or retyped.
const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"

/** Room codes are the only thing standing between a meeting and a stranger,
 *  so they come from a CSPRNG with ~60 bits of entropy (e.g. beam-k3xq-7mfa-p2wd). */
export function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return `beam-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`
}
