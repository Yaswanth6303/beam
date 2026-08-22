import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Room codes are opaque keys to the signalling server; any unique string works. */
export function newRoomCode() {
  return `beam-${Math.floor(1000 + Math.random() * 9000)}`
}
