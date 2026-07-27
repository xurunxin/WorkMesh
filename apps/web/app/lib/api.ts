'use client'

export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const csrfStorageKey = 'workmesh.csrf-token'
const logicalAttempts = new Map<string, { key: string; requestIdentity: string }>()

type ApiErrorBody = { error?: { code?: string; message?: string } }
export type ListResponse<T> = { items: T[]; nextCursor: string | null }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string, public readonly retryAfterSeconds?: number) {
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

async function responseError(response: Response): Promise<ApiError> {
  const rawRetryAfter = response.headers.get('retry-after')
  const retryAfter = rawRetryAfter ? Number(rawRetryAfter) : Number.NaN
  try {
    const body = await response.json() as ApiErrorBody
    return new ApiError(response.status, body.error?.message ?? `Request failed (${response.status})`, body.error?.code, Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined)
  } catch {
    return new ApiError(response.status, `Request failed (${response.status})`, undefined, Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined)
  }
}

export async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.method && init.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID())
  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' })
  if (!response.ok) throw await responseError(response)
  return response.json() as Promise<T>
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stable(nested)]))
  return value
}

function mutationRequestIdentity(path: string, init: RequestInit): string {
  let body: unknown = init.body ?? null
  if (typeof body === 'string') {
    try { body = stable(JSON.parse(body) as unknown) } catch { /* Compare non-JSON bodies exactly. */ }
  }
  return JSON.stringify({ method: init.method ?? 'POST', path, body })
}

async function logicalMutation<T>(
  operation: string,
  requestIdentity: string,
  request: (key: string) => Promise<T>,
): Promise<T> {
  const current = logicalAttempts.get(operation)
  const attempt = current?.requestIdentity === requestIdentity
    ? current
    : { key: crypto.randomUUID(), requestIdentity }
  logicalAttempts.set(operation, attempt)
  try {
    const result = await request(attempt.key)
    if (logicalAttempts.get(operation)?.key === attempt.key) logicalAttempts.delete(operation)
    return result
  } catch (reason) {
    const retryableResponse = reason instanceof ApiError
      && (reason.status === 429 || reason.status >= 500)
    if (reason instanceof ApiError && !retryableResponse && logicalAttempts.get(operation)?.key === attempt.key)
      logicalAttempts.delete(operation)
    throw reason
  }
}

export function publicMutation<T>(operation: string, path: string, init: RequestInit): Promise<T> {
  return logicalMutation(operation, mutationRequestIdentity(path, init), key => {
    const headers = new Headers(init.headers)
    headers.set('Idempotency-Key', key)
    return publicRequest<T>(path, { ...init, headers })
  })
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
  if (!response.ok) throw await responseError(response)
  return response.json() as Promise<T>
}

export async function apiListRequest<T>(path: string, init: RequestInit = {}): Promise<ListResponse<T>> {
  return apiRequest<ListResponse<T>>(path, init)
}

export function pagedPath(path: string, cursor: string | null, limit = 100): string {
  const parsed = new URL(path, 'http://workmesh.local')
  parsed.searchParams.set('limit', String(Math.min(200, Math.max(1, limit))))
  if (cursor) parsed.searchParams.set('cursor', cursor)
  else parsed.searchParams.delete('cursor')
  return `${parsed.pathname}${parsed.search}`
}

export function appendUniquePage<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const merged = new Map(current.map(item => [item.id, item]))
  for (const item of incoming) merged.set(item.id, item)
  return [...merged.values()]
}

export function apiMutation<T>(operation: string, path: string, init: RequestInit): Promise<T> {
  return logicalMutation(operation, mutationRequestIdentity(path, init), key => {
    const headers = new Headers(init.headers)
    headers.set('Idempotency-Key', key)
    return apiRequest<T>(path, { ...init, headers })
  })
}

export function json(body: unknown): HeadersInit {
  return { 'Content-Type': 'application/json' }
}
