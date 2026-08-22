/** Shapes shared across the app. These mirror what the backend actually
 *  returns — anything the UI shows beyond this is derived on the client. */

/** Response body of POST /api/v1/users/login. Stored as the local session. */
export type Session = {
  token: string
  name: string
  username: string
}

/** A row from GET /api/v1/users/get_all_activity (the Meeting model). */
export type MeetingRecord = {
  _id: string
  user_id: string
  meetingCode: string
  title?: string
  date: string
}

/** A tile on the call stage. `stream` is absent until tracks arrive. */
export type Participant = {
  id: string
  name: string
  stream?: MediaStream
  isSelf?: boolean
  isSpeaking?: boolean
  muted?: boolean
  videoOn?: boolean
}

export type ChatMessage = {
  id: string
  author: string
  time: string
  text: string
  self?: boolean
}

/** Two-letter monogram for avatar fallbacks — the backend stores no images. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
