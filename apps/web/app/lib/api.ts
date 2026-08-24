'use client'

const fallbackApiBase = typeof process !== 'undefined' && process.env
  ? (process.env.NEXT_PUBLIC_API_URL_TEST ?? 'http://localhost:3001')
  : 'http://localhost:3001'
export const apiBase = process.env.NEXT_PUBLIC_API_URL ?? (typeof window === 'undefined' ? fallbackApiBase : '')

const csrfStorageKey = 'workmesh.csrf-token'
const logicalAttempts = new Map<string, { key: string; requestIdentity: string }>()
const logicalAttemptStoragePrefix = 'workmesh.idempotency.'

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown; correlationId?: string; safeNextAction?: string } }
export type ListResponse<T> = { items: T[]; nextCursor: string | null }

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly retryAfterSeconds?: number,
    public readonly details?: unknown,
    public readonly correlationId?: string,
    public readonly safeNextAction?: string,
  ) {
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
    return new ApiError(
      response.status,
      body.error?.message ?? `Request failed (${response.status})`,
      body.error?.code,
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined,
      body.error?.details,
      body.error?.correlationId,
      body.error?.safeNextAction,
    )
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

const sha256RoundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const

const sha256RotateRight = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount))

/** Small synchronous fallback for environments without Web Crypto (for example older test DOMs). */
function sha256Hex(value: string): string {
  const encoded = new TextEncoder().encode(value)
  const bitLength = encoded.length * 8
  const paddedLength = ((encoded.length + 9 + 63) >> 6) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(encoded)
  padded[encoded.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19
  const words = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]!
      const y = words[index - 2]!
      const sigma0 = sha256RotateRight(x, 7) ^ sha256RotateRight(x, 18) ^ (x >>> 3)
      const sigma1 = sha256RotateRight(y, 17) ^ sha256RotateRight(y, 19) ^ (y >>> 10)
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0
    }
    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = sha256RotateRight(e, 6) ^ sha256RotateRight(e, 11) ^ sha256RotateRight(e, 25)
      const choose = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choose + sha256RoundConstants[index]! + words[index]!) >>> 0
      const sigma0 = sha256RotateRight(a, 2) ^ sha256RotateRight(a, 13) ^ sha256RotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(word => word.toString(16).padStart(8, '0')).join('')
}

function mutationRequestIdentity(path: string, init: RequestInit): string {
  let body: unknown = init.body ?? null
  if (typeof body === 'string') {
    try { body = stable(JSON.parse(body) as unknown) } catch { /* Compare non-JSON bodies exactly. */ }
  }
  const ifMatch = new Headers(init.headers).get('If-Match')
  const canonical = JSON.stringify({ method: init.method ?? 'POST', path, ifMatch, body })
  // Keep identity derivation synchronous so two same-tick calls share the
  // logical attempt before the first network response can clear it.
  return `request-${sha256Hex(canonical)}`
}

function readStoredAttempt(operation: string): { key: string; requestIdentity: string } | undefined {
  if (typeof sessionStorage === 'undefined') return undefined
  const raw = sessionStorage.getItem(`${logicalAttemptStoragePrefix}${operation}`)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as { key?: unknown; requestIdentity?: unknown }
    return typeof parsed.key === 'string' && typeof parsed.requestIdentity === 'string'
      ? { key: parsed.key, requestIdentity: parsed.requestIdentity }
      : undefined
  } catch { return undefined }
}

function storeAttempt(operation: string, attempt: { key: string; requestIdentity: string }): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`${logicalAttemptStoragePrefix}${operation}`, JSON.stringify(attempt))
}

function clearStoredAttempt(operation: string, key: string): void {
  if (typeof sessionStorage === 'undefined') return
  const storageKey = `${logicalAttemptStoragePrefix}${operation}`
  const stored = readStoredAttempt(operation)
  if (stored?.key === key) sessionStorage.removeItem(storageKey)
}

async function logicalMutation<T>(
  operation: string,
  requestIdentity: string,
  request: (key: string) => Promise<T>,
): Promise<T> {
  const current = logicalAttempts.get(operation) ?? readStoredAttempt(operation)
  const attempt = current?.requestIdentity === requestIdentity
    ? current
    : { key: crypto.randomUUID(), requestIdentity }
  logicalAttempts.set(operation, attempt)
  storeAttempt(operation, attempt)
  try {
    const result = await request(attempt.key)
    if (logicalAttempts.get(operation)?.key === attempt.key) logicalAttempts.delete(operation)
    clearStoredAttempt(operation, attempt.key)
    return result
  } catch (reason) {
    const retryableResponse = reason instanceof ApiError
      && ([408, 425, 429].includes(reason.status) || reason.status >= 500)
    if (reason instanceof ApiError && !retryableResponse && logicalAttempts.get(operation)?.key === attempt.key) {
      logicalAttempts.delete(operation)
      clearStoredAttempt(operation, attempt.key)
    }
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
  if (response.status === 204) return undefined as T
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
