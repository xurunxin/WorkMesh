import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiRequest,
  apiListRequest,
  appendUniquePage,
  pagedPath,
  publicMutation,
} from './api'

describe('auth mutation idempotency', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('retains one key only for the same canonical request after response loss', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const invoke = () => publicMutation<{ csrfToken: string }>('login-test', '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.test', password: 'secret-password' }),
    })

    await expect(invoke()).rejects.toThrow('response lost')
    await expect(invoke()).resolves.toEqual({ csrfToken: 'csrf' })

    const first = new Headers(fetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const second = new Headers(fetch.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(first).toBeTruthy()
    expect(second).toBe(first)
    expect([...values.keys()].some(key => key.startsWith('workmesh.auth-idempotency.'))).toBe(false)
  })

  it.each([
    {
      operation: 'login-changed-request',
      path: '/api/v1/auth/login',
      first: { email: 'alice@example.test', password: 'first-password' },
      changed: { password: 'changed-password', email: 'alice@example.test' },
    },
    {
      operation: 'install-changed-request',
      path: '/api/v1/auth/install',
      first: { name: 'One', slug: 'one', adminName: 'Alice', email: 'alice@example.test', password: 'first-password' },
      changed: { password: 'changed-password', email: 'alice@example.test', adminName: 'Alice', slug: 'one', name: 'One' },
    },
  ])('uses a new key when $operation payload changes but reuses it for canonical equality', async ({ operation, path, first, changed }) => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('first response lost'))
      .mockRejectedValueOnce(new TypeError('changed response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const invoke = (body: object) => publicMutation<{ csrfToken: string }>(operation, path, {
      method: 'POST',
      body: JSON.stringify(body),
    })

    await expect(invoke(first)).rejects.toThrow('first response lost')
    await expect(invoke(changed)).rejects.toThrow('changed response lost')
    await expect(invoke(changed)).resolves.toEqual({ csrfToken: 'csrf' })

    const keys = fetch.mock.calls.map(call => new Headers(call[1]?.headers).get('Idempotency-Key'))
    expect(keys[1]).not.toBe(keys[0])
    expect(keys[2]).toBe(keys[1])
    expect([...values.values()].join('')).not.toContain('password')
  })

  it('does not retry authorization denials and starts a later logical attempt with a new key', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Invalid credentials' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const invoke = () => publicMutation<{ csrfToken: string }>('login-denial-test', '/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.test', password: 'secret-password' }),
    })

    await expect(invoke()).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(invoke()).resolves.toEqual({ csrfToken: 'csrf' })

    const first = new Headers(fetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const second = new Headers(fetch.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(second).not.toBe(first)
  })

  it.each([429, 503])('retains the logical attempt key after retryable HTTP %s', async status => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Try again' } }), { status }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const invoke = () => publicMutation<{ csrfToken: string }>(
      `login-retryable-${status}`,
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: 'alice@example.test', password: 'secret-password' }),
      },
    )

    await expect(invoke()).rejects.toMatchObject({ status })
    await expect(invoke()).resolves.toEqual({ csrfToken: 'csrf' })

    const first = new Headers(fetch.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const second = new Headers(fetch.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(second).toBe(first)
  })

  it('preserves an explicit bootstrap header without persisting it in browser storage', async () => {
    const bootstrapToken = 'test-bootstrap-token-sentinel'
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: 'csrf' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)

    await publicMutation('install-bootstrap-header', '/api/v1/auth/install', {
      method: 'POST',
      headers: { 'X-WorkMesh-Bootstrap-Token': bootstrapToken },
      body: JSON.stringify({ name: 'Workspace' }),
    })

    const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
    expect(headers.get('X-WorkMesh-Bootstrap-Token')).toBe(bootstrapToken)
    expect([...values.values()].join('')).not.toContain(bootstrapToken)
  })

  it('exposes uniform rate-limit code and Retry-After metadata to the auth UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'AUTH_RATE_LIMITED', message: 'Authentication request is temporarily rate limited' } }), { status: 429, headers: { 'Retry-After': '3' } })))
    await expect(publicMutation('login-rate-metadata', '/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: 'alice@example.test', password: 'wrong-password' }) })).rejects.toMatchObject({
      status: 429, code: 'AUTH_RATE_LIMITED', retryAfterSeconds: 3, message: 'Authentication request is temporarily rate limited',
    })
  })

  it('accepts a successful mutation with an empty 204 response', async () => {
    values.set('workmesh.csrf-token', 'csrf')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(apiRequest<void>('/api/v1/agent-connections/connection-id', {
      method: 'DELETE',
      headers: { 'If-Match': '"revision-1"' },
    })).resolves.toBeUndefined()
  })
})

describe('paged list requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preserves the typed page envelope and opaque continuation cursor', async () => {
    const response = {
      items: [{ id: 'first' }],
      nextCursor: 'opaque.signed-cursor',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    ))

    await expect(apiListRequest<{ id: string }>('/api/v1/work-items?limit=100'))
      .resolves.toEqual(response)
  })

  it('adds or replaces bounded page parameters without changing effective filters', () => {
    const first = pagedPath('/api/v1/work-items?teamId=team-1&mine=true', null, 100)
    expect(first).toBe('/api/v1/work-items?teamId=team-1&mine=true&limit=100')
    expect(pagedPath(first, 'opaque.cursor', 500)).toBe(
      '/api/v1/work-items?teamId=team-1&mine=true&limit=200&cursor=opaque.cursor',
    )
  })

  it('de-duplicates appended pages by stable id while accepting refreshed records', () => {
    expect(appendUniquePage(
      [{ id: 'first', title: 'old' }],
      [{ id: 'first', title: 'new' }, { id: 'second', title: 'later' }],
    )).toEqual([
      { id: 'first', title: 'new' },
      { id: 'second', title: 'later' },
    ])
  })
})
