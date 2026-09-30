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

let unauthorizedHandler: (() => void) | null = null

/** Called when an authenticated request comes back 401 — the token expired or
 *  was revoked by a password change elsewhere. AuthProvider signs out. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

/** Authenticated routes take the token as a bearer header, never in the URL,
 *  so it stays out of server logs and browser history. */
async function authedRequest<T>(url: string, token: string, init: RequestInit = {}) {
  try {
    return await request<T>(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) unauthorizedHandler?.()
    throw error
  }
}

export type Profile = {
  name: string
  username: string
  memberSince: string
  meetingCount: number
}

/** GET /profile */
export function getProfile(token: string) {
  return authedRequest<Profile>(`${USERS_URL}/profile`, token)
}

/** PATCH /profile — the display name is the only editable field. */
export function updateProfile(token: string, name: string) {
  return authedRequest<{ name: string; username: string }>(
    `${USERS_URL}/profile`,
    token,
    { method: "PATCH", body: JSON.stringify({ name }) }
  )
}

/** POST /change_password — returns a freshly issued token on success. */
export function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string
) {
  return authedRequest<{ message: string; token: string }>(
    `${USERS_URL}/change_password`,
    token,
    { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }
  )
}

/** GET /get_all_activity */
export function getHistory(token: string) {
  return authedRequest<MeetingRecord[]>(`${USERS_URL}/get_all_activity`, token)
}

/** POST /add_to_activity — records that this user joined `meetingCode`. */
export function addToHistory(
  token: string,
  meetingCode: string,
  title?: string
) {
  return authedRequest<{ message: string }>(`${USERS_URL}/add_to_activity`, token, {
    method: "POST",
    body: JSON.stringify({ meeting_code: meetingCode, title }),
  })
}

/** DELETE /delete_from_activity — removes a meeting code from history. */
export function deleteHistory(token: string, meetingCode: string) {
  return authedRequest<{ message: string }>(
    `${USERS_URL}/delete_from_activity?meeting_code=${encodeURIComponent(meetingCode)}`,
    token,
    { method: "DELETE" }
  )
}

/** DELETE /clear_activity — removes all meetings from history. */
export function clearHistory(token: string) {
  return authedRequest<{ message: string }>(`${USERS_URL}/clear_activity`, token, {
    method: "DELETE",
  })
}
