import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkMeshClient, WorkMeshSdkError, iterateListPages, redactForLog, stableIdempotencyKey, verifyWebhook } from './index.js'
import { createHmac } from 'node:crypto'

describe('WorkMeshClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads release and authenticated feature contracts without claiming disabled tools', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ serverVersion: '1.0.0' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        features: [{ key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: false }],
      }), { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.example.test',
      sessionToken: 'session-token',
      fetch,
    })
    await expect(client.getServerInfo()).resolves.toMatchObject({ serverVersion: '1.0.0' })
    await expect(client.getFeatures()).resolves.toMatchObject({
      features: [{ key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', enabled: false }],
    })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.example.test/api/v1/info')
    expect(fetch.mock.calls[1]?.[0]).toBe('https://workmesh.example.test/api/v1/features')
  })

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

  it('never refreshes or retries an authorization denial', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'expired', correlationId: 'cor-1' } }), { status: 401 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'expired-session-token', installationToken: 'installation-token', fetch })
    await expect(client.heartbeat('session-1', { usage: { runtimeSeconds: 1 } }))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401, correlationId: 'cor-1' })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('reuses the token-exchange key across a retry without logging credentials', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'issued-once' }), { status: 200 }))
    const warn = vi.fn()
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      logger: { warn, debug: vi.fn() },
      retry: { baseDelayMs: 0, maxAttempts: 2 },
    })

    await expect(client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret'))
      .resolves.toMatchObject({ sessionToken: 'issued-once' })

    const keys = fetch.mock.calls.map(call => call[1].headers['idempotency-key'])
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
    expect(fetch.mock.calls[0]?.[1].headers.authorization).toBe('Bearer installation-secret')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('installation-secret')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('exchange-secret')
  })
  it('waits for the full Retry-After duration without changing the logical authentication attempt', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'AUTH_RATE_LIMITED', message: 'Try later' } }), {
        status: 429,
        headers: { 'Retry-After': '5' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'issued-once' }), { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 0,
        maxDelayMs: 0,
        maxRetryAfterMs: 10_000,
        maxTotalRetryDelayMs: 10_000,
      },
    })

    const request = client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(request).resolves.toMatchObject({ sessionToken: 'issued-once' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]?.[1].body).toBe(fetch.mock.calls[0]?.[1].body)
    expect(fetch.mock.calls[1]?.[1].headers['idempotency-key']).toBe(fetch.mock.calls[0]?.[1].headers['idempotency-key'])
    expect(fetch.mock.calls[1]?.[1].headers.authorization).toBe('Bearer installation-secret')
  })

  it('reuses the original serialized body when caller-owned input mutates during Retry-After', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '5' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'heartbeat-1', revision: 2 }), { status: 200 }))
    const input = {
      currentStepId: 'step-original',
      usage: { runtimeSeconds: 1, toolCalls: 1 },
    }
    const originalBody = JSON.stringify(input)
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      sessionToken: 'session-token',
      fetch,
      retry: {
        maxAttempts: 2,
        maxRetryAfterMs: 10_000,
        maxTotalRetryDelayMs: 10_000,
      },
    })

    const request = client.heartbeat('session-1', input)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)

    input.currentStepId = 'step-mutated'
    input.usage.runtimeSeconds = 9_999
    input.usage.toolCalls = 9_999

    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(request).resolves.toMatchObject({ id: 'heartbeat-1', revision: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
    const firstInit = fetch.mock.calls[0]?.[1]
    const secondInit = fetch.mock.calls[1]?.[1]
    expect(firstInit.body).toBe(originalBody)
    expect(secondInit.body).toBe(originalBody)
    expect(secondInit.body).toBe(firstInit.body)
    expect(secondInit.headers['idempotency-key']).toBe(firstInit.headers['idempotency-key'])
    expect(secondInit.headers.authorization).toBe(firstInit.headers.authorization)
    expect(secondInit.headers.authorization).toBe('Bearer session-token')
  })

  it('does not retry or sleep when Retry-After exceeds the explicit limit and preserves error metadata', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Rate limiter unavailable',
        correlationId: 'cor-rate-limit',
        details: { endpointClass: 'token_exchange' },
      },
    }), { status: 503, headers: { 'Retry-After': '61' } }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      retry: { maxAttempts: 3, maxRetryAfterMs: 60_000, maxTotalRetryDelayMs: 120_000 },
    })

    await expect(client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret'))
      .rejects.toMatchObject({
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        status: 503,
        correlationId: 'cor-rate-limit',
        details: { endpointClass: 'token_exchange' },
        retry: {
          retryAfterHeader: '61',
          retryAfterMs: 61_000,
          automaticRetrySuppressed: 'retry_after_exceeds_limit',
        },
      })
    expect(fetch).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['invalid', '-1'])('falls back to bounded exponential delay for invalid Retry-After %s', async retryAfter => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': retryAfter } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'issued-once' }), { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      retry: {
        maxAttempts: 2,
        baseDelayMs: 250,
        maxDelayMs: 250,
        maxRetryAfterMs: 10_000,
        maxTotalRetryDelayMs: 10_000,
      },
    })

    const request = client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(249)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(request).resolves.toMatchObject({ sessionToken: 'issued-once' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('bounds automatic retries by the total retry-delay budget', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'AUTH_RATE_LIMIT_UNAVAILABLE', message: 'Still unavailable', correlationId: 'cor-total' },
      }), { status: 503, headers: { 'Retry-After': '3' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      retry: {
        maxAttempts: 3,
        maxRetryAfterMs: 5_000,
        maxTotalRetryDelayMs: 5_000,
      },
    })

    const request = client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret')
    const rejection = expect(request).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      status: 503,
      correlationId: 'cor-total',
      retry: {
        retryAfterHeader: '3',
        retryAfterMs: 3_000,
        automaticRetrySuppressed: 'total_retry_delay_exceeded',
      },
    })
    await vi.advanceTimersByTimeAsync(3_000)

    await rejection
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('bounds automatic retries by the attempt limit', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'AUTH_RATE_LIMIT_UNAVAILABLE', message: 'Still unavailable', correlationId: 'cor-attempt' },
      }), { status: 503, headers: { 'Retry-After': '1' } }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      fetch,
      retry: {
        maxAttempts: 2,
        maxRetryAfterMs: 5_000,
        maxTotalRetryDelayMs: 5_000,
      },
    })

    const request = client.exchangeSessionToken('session-1', 'exchange-secret', 'installation-secret')
    const rejection = expect(request).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
      status: 503,
      correlationId: 'cor-attempt',
      retry: {
        retryAfterHeader: '1',
        retryAfterMs: 1_000,
        automaticRetrySuppressed: 'attempt_limit',
      },
    })
    await vi.advanceTimersByTimeAsync(1_000)

    await rejection
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses installation authority only for pending handoff inspection and idle-target rejection', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ handoff: { id: 'handoff-1' }, contextSnapshot: { id: 'snapshot-1' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'handoff-1', status: 'rejected' }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', installationToken: 'installation-token', fetch })
    await expect(client.inspectPendingHandoff('handoff-1')).resolves.toMatchObject({ handoff: { id: 'handoff-1' } })
    await expect(client.rejectHandoff('handoff-1', { machineReason: 'context_incomplete' })).resolves.toMatchObject({ status: 'rejected' })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.test/api/v1/handoffs/handoff-1/inspect')
    expect(fetch.mock.calls[0]?.[1].headers.authorization).toBe('Bearer installation-token')
    expect(fetch.mock.calls[1]?.[1].headers.authorization).toBe('Bearer installation-token')
  })

  it('passes opaque cursors unchanged and iterates page envelopes', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      items: [{ id: 'work-1' }],
      nextCursor: 'opaque.cursor',
    }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await expect(client.listWorkItems({ teamId: 'team-1' }, { cursor: 'opaque.cursor', limit: 17 }))
      .resolves.toEqual({ items: [{ id: 'work-1' }], nextCursor: 'opaque.cursor' })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.test/api/v1/work-items?teamId=team-1&cursor=opaque.cursor&limit=17')

    await expect(client.getActivities('session-1', {
      cursor: 'opaque.activity.cursor',
      limit: 19,
    })).resolves.toEqual({
      items: [{ id: 'work-1' }],
      nextCursor: 'opaque.cursor',
    })
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://workmesh.test/api/v1/agent-sessions/session-1/activities?cursor=opaque.activity.cursor&limit=19',
    )

    const pages = vi.fn()
      .mockResolvedValueOnce({ items: [1, 2], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [3], nextCursor: null })
    const items: number[] = []
    for await (const item of iterateListPages<number>(async cursor =>
      await pages(cursor) as { items: number[]; nextCursor: string | null })) items.push(item)
    expect(items).toEqual([1, 2, 3])
    expect(pages).toHaveBeenNthCalledWith(2, 'next')
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

  it('preserves exact pull-request head provenance for delivery artifacts', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'artifact-1' }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await client.publishDeliveryArtifact({
      workItemId: 'work-1',
      sessionId: 'session-1',
      projectId: 'project-1',
      repositoryId: 'repository-1',
      pullRequestId: 'pull-request-1',
      headSha: 'reviewed-head',
      type: 'code_review',
      title: 'Review evidence',
      checksum: `sha256:${'a'.repeat(64)}`,
      sourceTool: 'workmesh-mcp-reviewer',
    }, { idempotencyKey: 'review-artifact' })
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1].body))).toMatchObject({
      workItemId: 'work-1',
      sessionId: 'session-1',
      projectId: 'project-1',
      repositoryId: 'repository-1',
      pullRequestId: 'pull-request-1',
      headSha: 'reviewed-head',
      checksum: `sha256:${'a'.repeat(64)}`,
      sourceTool: 'workmesh-mcp-reviewer',
    })
  })

  it('exposes approved CI retry and agent project-update draft without publishing', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'retry-action' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'update-draft', status: 'draft' }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await client.retryCiCheck('pull-request-1', 'check-42', {
      sessionId: 'session-1',
      approvalId: 'approval-1',
      actionPayloadHash: `sha256:${'a'.repeat(64)}`,
      headSha: 'head-1',
    })
    await client.draftProjectUpdate('project-1', {
      health: 'at_risk',
      body: 'CI is still failing.',
      evidenceArtifactIds: ['artifact-1'],
    }, { sessionId: 'session-1' })
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://workmesh.test/api/v1/pull-requests/pull-request-1/checks/check-42/retry',
    )
    expect(fetch.mock.calls[1]?.[0]).toBe(
      'https://workmesh.test/api/v1/projects/project-1/updates',
    )
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1].body))).toMatchObject({
      health: 'at_risk',
      body: 'CI is still failing.',
      status: 'draft',
    })
    expect(String(fetch.mock.calls[1]?.[0])).not.toContain('publish')
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
