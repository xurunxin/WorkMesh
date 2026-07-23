'use client'

export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const csrfStorageKey = 'workmesh.csrf-token'

type ApiErrorBody = { error?: { message?: string } }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}

export function saveCsrfToken(token: string): void {
  sessionStorage.setItem(csrfStorageKey, token)
}

export function clearCsrfToken(): void {
  sessionStorage.removeItem(csrfStorageKey)
}

function csrfToken(): string | null {
  return sessionStorage.getItem(csrfStorageKey)
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as ApiErrorBody
    return body.error?.message ?? `Request failed (${response.status})`
  } catch {
    return `Request failed (${response.status})`
  }
}

export async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.method && init.method !== 'GET') headers.set('Idempotency-Key', crypto.randomUUID())
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  return response.json() as Promise<T>
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  const isMutation = init.method !== undefined && init.method !== 'GET'
  if (isMutation) {
    const token = csrfToken()
    if (!token) throw new ApiError(401, 'Your session expired. Please sign in again.')
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID())
    headers.set('X-CSRF-Token', token)
  }
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  return response.json() as Promise<T>
}

export function json(body: unknown): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
