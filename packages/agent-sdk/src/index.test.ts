import { describe, expect, it, vi } from 'vitest'
import { WorkMeshClient, WorkMeshSdkError, redactForLog, stableIdempotencyKey, verifyWebhook } from './index.js'
import { createHmac } from 'node:crypto'

describe('WorkMeshClient', () => {
  it('uses stable idempotency and does not retry conflicts', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'PLAN_REVISION_CONFLICT', message: 'changed', correlationId: 'cor-1' } }), { status: 409 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'secret', fetch, retry: { baseDelayMs: 0 } })
    await expect(client.publishPlan('session-1', { changeSummary: 'plan', steps: [] })).rejects.toMatchObject({ code: 'PLAN_REVISION_CONFLICT', status: 409 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(stableIdempotencyKey('session-1', 'plan', 'same-intent')).toBe(stableIdempotencyKey('session-1', 'plan', 'same-intent'))
  })

  it('retries a rate limit and never exposes the authorization value to logs', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x', revision: 2 }), { status: 200 }))
    const warn = vi.fn()
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'very-secret', fetch, logger: { warn, debug: vi.fn() }, retry: { baseDelayMs: 0, maxAttempts: 2 } })
    await expect(client.heartbeat('session-1', { usage: { runtimeSeconds: 1 } })).resolves.toEqual({ id: 'x', revision: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refreshes an expired session token exactly once with the installation token', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'expired', correlationId: 'cor-1' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'refreshed-session-token', expiresAt: '2026-07-23T00:00:00.000Z' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'x', revision: 2 }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'expired-session-token', installationToken: 'installation-token', fetch })
    await expect(client.heartbeat('session-1', { usage: { runtimeSeconds: 1 } })).resolves.toEqual({ id: 'x', revision: 2 })
    expect(fetch.mock.calls[1]?.[1].headers.authorization).toBe('Bearer installation-token')
    expect(fetch.mock.calls[2]?.[1].headers.authorization).toBe('Bearer refreshed-session-token')
  })

  it('redacts nested sensitive values before logging', () => {
    expect(redactForLog({ outer: [{ nested: { token: 'never-log', safe: 'ok' } }], authorization: 'Bearer never-log' })).toEqual({ outer: [{ nested: { token: '[REDACTED]', safe: 'ok' } }], authorization: '[REDACTED]' })
  })

  it('uses the atomic delegation-and-session endpoint with If-Match', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ delegation: { id: 'delegation' }, session: { id: 'session' } }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await client.delegateAndStart('00000000-0000-4000-8000-000000000003', { agentId: '00000000-0000-4000-8000-000000000004', principalHumanActorId: '00000000-0000-4000-8000-000000000005', requestedCapabilities: ['work:read'], initialPrompt: 'Investigate.' }, { ifMatch: 7 })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.test/api/v1/work-items/00000000-0000-4000-8000-000000000003/agent-session')
    expect(fetch.mock.calls[0]?.[1].headers['if-match']).toBe('"revision-7"')
  })

  it('uses a new default key per public mutation while retaining it for retry and explicit callers', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'one', revision: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'two', revision: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'three', revision: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'four', revision: 4 }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch, retry: { baseDelayMs: 0 } })
    await client.heartbeat('session-1', { usage: { runtimeSeconds: 1 } })
    await client.heartbeat('session-1', { usage: { runtimeSeconds: 2 } })
    await client.appendActivity('session-1', { kind: 'message', summary: 'retry me' })
    await client.sendMessage('session-1', 'explicit', { idempotencyKey: 'caller-provided-key' })
    const keys = fetch.mock.calls.map(call => call[1].headers['idempotency-key'])
    expect(keys[0]).not.toBe(keys[1])
    expect(keys[2]).toBe(keys[3])
    expect(keys[4]).toBe('caller-provided-key')
  })
})

describe('verifyWebhook', () => {
  it('accepts a rotated secret and rejects expired deliveries', () => {
    const raw = '{"events":[]}', timestamp = 1000
    const signature = createHmac('sha256', 'old').update(`${timestamp}.${raw}`).digest('hex')
    expect(verifyWebhook(raw, { 'WorkMesh-Timestamp': String(timestamp), 'WorkMesh-Signature': `v1=${signature}` }, { secrets: ['new', 'old'], now: new Date(timestamp * 1000) }).secretIndex).toBe(1)
    expect(() => verifyWebhook(raw, { 'WorkMesh-Timestamp': String(timestamp), 'WorkMesh-Signature': `v1=${signature}` }, { secrets: ['old'], now: new Date((timestamp + 301) * 1000) })).toThrow(WorkMeshSdkError)
  })
})
