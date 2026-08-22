import type { MeetingRecord, Session } from "@/lib/types"

/** Base URL of the Express + Socket.IO server (server/src/app.ts). */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const USERS_URL = `${API_URL}/api/v1/users`

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function parse(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    // fetch only rejects on network-level failures, so the server is
    // unreachable, CORS blocked the call, or the browser is offline.
    throw new ApiError("Cannot reach the server. Is it running?", 0)
  }

  const body = await parse(res)

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && body.message) ||
      `Request failed (${res.status})`
    throw new ApiError(message, res.status)
  }

  return body as T
}

/** POST /register — the backend keys users on `username`; we pass the email. */
export function register(name: string, username: string, password: string) {
  return request<{ message: string }>(`${USERS_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, username, password }),
  })
}

/** POST /login — returns the JWT plus the display name we cache as a session. */
export function login(username: string, password: string) {
  return request<Session>(`${USERS_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
}

/** GET /get_all_activity — the backend reads the token from the query string. */
export function getHistory(token: string) {
  return request<MeetingRecord[]>(
    `${USERS_URL}/get_all_activity?token=${encodeURIComponent(token)}`
  )
}

/** Newer routes authenticate with a bearer header instead of a token field. */
function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
}

export type Profile = {
  name: string
  username: string
  memberSince: string
  meetingCount: number
}

/** GET /profile */
export function getProfile(token: string) {
  return request<Profile>(`${USERS_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** PATCH /profile — the display name is the only editable field. */
export function updateProfile(token: string, name: string) {
  return request<{ name: string; username: string }>(`${USERS_URL}/profile`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  })
}

/** POST /change_password — returns a freshly issued token on success. */
export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
) {
  return request<{ message: string; token: string }>(
    `${USERS_URL}/change_password`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  )
}

/** POST /add_to_activity — records that this user joined `meetingCode`. */
export function addToHistory(
  token: string,
  meetingCode: string,
  title?: string
) {
  return request<{ message: string }>(`${USERS_URL}/add_to_activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, meeting_code: meetingCode, title }),
  })
}

/** DELETE /delete_from_activity — removes a meeting code from history. */
export function deleteHistory(token: string, meetingCode: string) {
  return request<{ message: string }>(
    `${USERS_URL}/delete_from_activity?token=${encodeURIComponent(
      token
    )}&meeting_code=${encodeURIComponent(meetingCode)}`,
    {
      method: "DELETE",
    }
  )
}

/** DELETE /clear_activity — removes all meetings from history. */
export function clearHistory(token: string) {
  return request<{ message: string }>(
    `${USERS_URL}/clear_activity?token=${encodeURIComponent(token)}`,
    {
      method: "DELETE",
    }
  )
}

