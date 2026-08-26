import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkMeshClient, WorkMeshCursorExpiredError, WorkMeshSdkError, iterateListPages, redactForLog, stableIdempotencyKey, verifyWebhook } from './index.js'
import { createHmac } from 'node:crypto'

describe('WorkMeshClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const realtimeEvent = {
    cursor: '9007199254740993',
    id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    event_type: 'work_item.updated',
    event_version: 2,
    workspace_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    team_id: null,
    audience_actor_id: null,
    audience: {
      visibility: 'workspace',
      workspaceId: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
      teamId: null,
      actorId: null,
    },
    scopes: [{
      type: 'workspace',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    }],
    invalidates: [{
      type: 'work_item',
      id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    }],
    aggregate_type: 'work_item',
    aggregate_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    aggregate_revision: 1,
    actor_id: 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438',
    correlation_id: 'event-test',
    idempotency_key: null,
    payload: {},
    occurred_at: '2026-07-28T00:00:00.000Z',
  }

  it('binds Control Center, explanation, execution summary, and preview routes', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await client.getControlCenter('running', { cursor: 'next', limit: 25 })
    await client.getProjectControlCenter('project/id', 'risks', { limit: 10 })
    await client.explainAgentSession('session/id', { attention: 'true', timeWindow: '7d' })
    await client.getWorkItemExecutionSummary('work/item')
    await client.previewAgentSessionControl('session/id', 'stop')
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://workmesh.test/api/v1/control-center?collection=running&cursor=next&limit=25',
      'https://workmesh.test/api/v1/projects/project%2Fid/control-center?collection=risks&limit=10',
      'https://workmesh.test/api/v1/agent-sessions/session%2Fid/explanation?attention=true&timeWindow=7d',
      'https://workmesh.test/api/v1/work-items/work%2Fitem/execution-summary',
      'https://workmesh.test/api/v1/agent-sessions/session%2Fid/control-preview',
    ])
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ action: 'stop' }) })
  })

  it('binds structured planning methods to the versioned REST routes and headers', async () => {
    const fetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'coordination-token',
      fetch,
    })

    await client.listProjectMilestones('project/id', { cursor: 'next', limit: 25 })
    await client.createMilestone('project/id', { name: 'M1' }, { idempotencyKey: 'create-milestone' })
    await client.updateMilestone('milestone/id', { targetDate: null }, { ifMatch: 3, idempotencyKey: 'update-milestone' })
    await client.createWorkItemRelation('work/item', { targetWorkItemId: '11111111-1111-4111-8111-111111111111', kind: 'blocks' }, { idempotencyKey: 'add-relation' })
    await client.deleteWorkItemRelation('work/item', 'relation/id', { ifMatch: 4, idempotencyKey: 'remove-relation' })

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://workmesh.test/api/v1/projects/project%2Fid/milestones?cursor=next&limit=25',
      'https://workmesh.test/api/v1/projects/project%2Fid/milestones',
      'https://workmesh.test/api/v1/milestones/milestone%2Fid',
      'https://workmesh.test/api/v1/work-items/work%2Fitem/relations',
      'https://workmesh.test/api/v1/work-items/work%2Fitem/relations/relation%2Fid',
    ])
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({
        'x-workmesh-installation-token': 'coordination-token',
        'idempotency-key': 'update-milestone',
        'if-match': '"revision-3"',
      }),
    })
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({
      method: 'DELETE',
      headers: expect.objectContaining({ 'if-match': '"revision-4"' }),
    })
  })

  it('reads the exact Agent Connection identity with the coordination credential header', async () => {
    const identity = {
      connection: { id: 'connection-id' },
      authenticated_credential: {
        fingerprint_prefix: '0123456789ab',
        status: 'active',
        overlap_until: null,
      },
    }
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(identity), { status: 200 }),
    )
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'wmi_exact-credential',
      fetch,
    })

    await expect(client.getCurrentAgentConnectionIdentity()).resolves.toEqual(identity)
    expect(fetch).toHaveBeenCalledWith(
      'https://workmesh.test/api/v1/agent-connections/current-identity',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-workmesh-installation-token': 'wmi_exact-credential',
        }),
      }),
    )
  })

  it('lists exact decimal event cursors above 2^53', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([realtimeEvent]), { status: 200 }),
    )
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      sessionToken: 'session-token',
      fetch,
    })

    await expect(client.listEvents({
      cursor: '9007199254740992',
      limit: 25,
    })).resolves.toEqual([realtimeEvent])
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://workmesh.test/api/v1/events?cursor=9007199254740992&limit=25',
    )
  })

  it('streams typed events and preserves Last-Event-ID exactly', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(
      `id: ${realtimeEvent.cursor}\ndata: ${JSON.stringify(realtimeEvent)}\n\n`,
      {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      },
    ))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      sessionToken: 'session-token',
      fetch,
    })
    const stream = client.streamEvents({ cursor: '9007199254740992' })

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: realtimeEvent,
    })
    expect(fetch.mock.calls[0]?.[1].headers['last-event-id'])
      .toBe('9007199254740992')
    await stream.return()
  })

  it('surfaces CURSOR_EXPIRED without retrying or moving caller state', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'CURSOR_EXPIRED',
        message: 'expired',
        correlationId: 'cursor-expired-test',
        details: {
          minimumCursor: '9007199254740993',
          resyncCursor: '9007199254740993',
          resyncRequired: true,
        },
      },
    }), { status: 409 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      sessionToken: 'session-token',
      fetch,
    })

    const error = await client.streamEvents({ cursor: '0' }).next()
      .then(() => undefined, reason => reason)
    expect(error).toBeInstanceOf(WorkMeshCursorExpiredError)
    expect(error).toMatchObject({
      code: 'CURSOR_EXPIRED',
      minimumCursor: '9007199254740993',
      resyncCursor: '9007199254740993',
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('retries documented realtime capacity responses with bounded policy', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 'REALTIME_CAPACITY_EXCEEDED',
          message: 'capacity',
          correlationId: 'capacity-test',
          details: { retryable: true, retryAfterSeconds: 1 },
        },
      }), {
        status: 503,
        headers: { 'retry-after': '0' },
      }))
      .mockResolvedValueOnce(new Response(
        `id: ${realtimeEvent.cursor}\ndata: ${JSON.stringify(realtimeEvent)}\n\n`,
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      ))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      sessionToken: 'session-token',
      fetch,
      retry: { maxAttempts: 2, baseDelayMs: 0 },
    })
    const stream = client.streamEvents({ cursor: '0' })

    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: realtimeEvent,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    await stream.return()
  })

  it('reads release, features, and the negotiated Agent capability manifest', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ serverVersion: '1.0.0' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        features: [{ key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: false }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ profileVersion: '1.0', operations: [] }), { status: 200 }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.example.test',
      sessionToken: 'session-token',
      fetch,
    })
    await expect(client.getServerInfo()).resolves.toMatchObject({ serverVersion: '1.0.0' })
    await expect(client.getFeatures()).resolves.toMatchObject({
      features: [{ key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', enabled: false }],
    })
    await expect(client.getAgentCapabilities({ profileVersion: '1.0' })).resolves.toMatchObject({ profileVersion: '1.0' })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.example.test/api/v1/info')
    expect(fetch.mock.calls[1]?.[0]).toBe('https://workmesh.example.test/api/v1/features')
    expect(fetch.mock.calls[2]?.[0]).toBe('https://workmesh.example.test/api/v1/agent-capabilities')
    expect((fetch.mock.calls[2]?.[1] as RequestInit | undefined)?.headers).toMatchObject({ 'workmesh-client-profile': '1.0' })
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

  it('keeps a connection bridge on coordination auth and refreshes each exact execution session request-locally', async () => {
    const fetch = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/work-items/work-1/claim')) {
        return new Response(JSON.stringify({
          delegation: { id: 'delegation-a' },
          session: { id: 'session-a' },
          exchangeToken: 'exchange-a',
        }), { status: 201 })
      }
      if (url.endsWith('/agent-sessions/session-a/token/exchange')) {
        return new Response(JSON.stringify({ sessionToken: 'bootstrap-a' }), { status: 200 })
      }
      if (url.includes('/work-items?claimable=true')) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 })
      }
      if (url.endsWith('/agent-sessions/session-a/token/refresh')) {
        return new Response(JSON.stringify({ sessionToken: 'execution-a' }), { status: 200 })
      }
      if (url.endsWith('/agent-sessions/session-a/ack')) {
        return new Response(JSON.stringify({ id: 'session-a', revision: 2 }), { status: 200 })
      }
      if (url.endsWith('/agent-sessions/session-b/token/refresh')) {
        return new Response(JSON.stringify({ sessionToken: 'execution-b' }), { status: 200 })
      }
      if (url.endsWith('/agent-sessions/session-b')) {
        return new Response(JSON.stringify({ id: 'session-b' }), { status: 200 })
      }
      if (url.endsWith('/handoffs/handoff-1/request')) {
        return new Response(JSON.stringify({ id: 'handoff-1', status: 'requested' }), { status: 200 })
      }
      return new Response(JSON.stringify({ method: init?.method, url }), { status: 404 })
    })
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'connection-token',
      installationToken: 'connection-token',
      fetch,
    })

    const claimed = await client.claimWorkItem('work-1', {}, { ifMatch: 1, idempotencyKey: 'claim-1' })
    await client.exchangeClaimedSessionToken(claimed.session.id, claimed.exchangeToken, { idempotencyKey: 'exchange-1' })
    await client.listClaimableWorkItems()
    await client.acknowledge('session-a', { summary: 'accepted' }, { idempotencyKey: 'ack-a' })
    await client.getSession('session-b')
    await client.requestHandoff(
      'handoff-1',
      { reason: 'ready for transfer' },
      { sessionId: 'session-a', idempotencyKey: 'handoff-request' },
    )

    const calls = fetch.mock.calls.map(([input, init]) => ({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    }))
    expect(calls[0]?.headers).toMatchObject({ 'x-workmesh-installation-token': 'connection-token' })
    expect(calls[1]?.headers).toMatchObject({ authorization: 'Bearer connection-token' })
    expect(calls[2]?.headers).toMatchObject({ 'x-workmesh-installation-token': 'connection-token' })
    expect(calls[2]?.headers.authorization).toBeUndefined()
    expect(calls[3]?.url).toContain('/agent-sessions/session-a/token/refresh')
    expect(calls[3]?.headers).toMatchObject({ authorization: 'Bearer connection-token' })
    expect(calls[4]?.headers).toMatchObject({ authorization: 'Bearer execution-a' })
    expect(calls[5]?.url).toContain('/agent-sessions/session-b/token/refresh')
    expect(calls[5]?.headers).toMatchObject({ authorization: 'Bearer connection-token' })
    expect(calls[6]?.headers).toMatchObject({ authorization: 'Bearer execution-b' })
    expect(calls[7]?.url).toContain('/agent-sessions/session-a/token/refresh')
    expect(calls[7]?.headers).toMatchObject({ authorization: 'Bearer connection-token' })
    expect(calls[8]?.url).toContain('/handoffs/handoff-1/request')
    expect(calls[8]?.headers).toMatchObject({ authorization: 'Bearer execution-a' })
    expect(JSON.parse(String(calls[8]?.body))).toEqual({ reason: 'ready for transfer' })
    expect(String(calls[8]?.body)).not.toContain('sourceSessionId')
    const sessionARefreshKeys = calls
      .filter(call => call.url.includes('/agent-sessions/session-a/token/refresh'))
      .map(call => call.headers['idempotency-key'])
    expect(sessionARefreshKeys).toHaveLength(2)
    expect(sessionARefreshKeys[0]).not.toBe(sessionARefreshKeys[1])
    expect(JSON.stringify(calls)).not.toContain('bootstrap-a')
  })

  it('rebuilds exact-session authorization independently in separate stateless bridge clients', async () => {
    const makeFetch = (sessionId: string, sessionToken: string) => vi.fn().mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith(`/agent-sessions/${sessionId}/token/refresh`)) {
        return new Response(JSON.stringify({ sessionToken }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: sessionId, revision: 2 }), { status: 200 })
    })
    const firstFetch = makeFetch('session-a', 'execution-a')
    const secondFetch = makeFetch('session-b', 'execution-b')
    const first = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'connection-token',
      installationToken: 'connection-token',
      fetch: firstFetch,
    })
    const second = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'connection-token',
      installationToken: 'connection-token',
      fetch: secondFetch,
    })

    await Promise.all([
      first.appendActivity('session-a', { kind: 'message', summary: 'first' }),
      second.complete('session-b', {
        summary: 'done',
        artifactIds: [],
        checks: [],
        limitations: [],
        noArtifactReason: 'No artifact required.',
      }),
    ])

    expect(firstFetch.mock.calls[0]?.[1].headers.authorization).toBe('Bearer connection-token')
    expect(firstFetch.mock.calls[1]?.[1].headers.authorization).toBe('Bearer execution-a')
    expect(secondFetch.mock.calls[0]?.[1].headers.authorization).toBe('Bearer connection-token')
    expect(secondFetch.mock.calls[1]?.[1].headers.authorization).toBe('Bearer execution-b')
  })

  it('propagates cancellation through the exact-session refresh before sending the target request', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation(async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }))
    const client = new WorkMeshClient({
      baseUrl: 'https://workmesh.test',
      coordinationToken: 'connection-token',
      installationToken: 'connection-token',
      fetch,
    })

    const request = client.appendActivity(
      'session-a',
      { kind: 'message', summary: 'cancel before target' },
      { signal: controller.signal },
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    controller.abort(new Error('caller canceled'))

    await expect(request).rejects.toThrow('caller canceled')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[1].signal).toBe(controller.signal)
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

  it('transitions an Agent Session with its exact current revision', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'session-1', revision: 9 }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })
    await expect(client.transitionState('session-1', 'executing', 'Begin conformance.', { ifMatch: 8, idempotencyKey: 'state-key' }))
      .resolves.toMatchObject({ id: 'session-1', revision: 9 })
    expect(fetch.mock.calls[0]?.[0]).toBe('https://workmesh.test/api/v1/agent-sessions/session-1/state')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ state: 'executing', reason: 'Begin conformance.' }),
      headers: expect.objectContaining({ 'if-match': '"revision-8"', 'idempotency-key': 'state-key' }),
    })
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

  it('uses the native Inbox routes with explicit empty mutation bodies', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'inbox-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'inbox-1', status: 'claimed' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'inbox-1', status: 'acknowledged' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'reply-1' }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })

    await client.listInbox('open', { cursor: 'opaque', limit: 17 })
    await client.getInboxItem('inbox-1')
    await client.claimInboxItem('inbox-1', { idempotencyKey: 'claim-key' })
    await client.acknowledgeInboxItem('inbox-1', { idempotencyKey: 'ack-key' })
    await client.replyInboxItem(
      'inbox-1',
      { body: 'Handled with evidence.' },
      { ifMatch: 4, idempotencyKey: 'reply-key' },
    )

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://workmesh.test/api/v1/inbox?status=open&cursor=opaque&limit=17',
      'https://workmesh.test/api/v1/inbox/inbox-1',
      'https://workmesh.test/api/v1/inbox/inbox-1/claim',
      'https://workmesh.test/api/v1/inbox/inbox-1/acknowledge',
      'https://workmesh.test/api/v1/inbox/inbox-1/reply',
    ])
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      body: '{}',
      headers: expect.objectContaining({ 'idempotency-key': 'claim-key' }),
    })
    expect(fetch.mock.calls[3]?.[1]).toMatchObject({
      body: '{}',
      headers: expect.objectContaining({ 'idempotency-key': 'ack-key' }),
    })
    expect(fetch.mock.calls[4]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'idempotency-key': 'reply-key',
        'if-match': '"revision-4"',
      }),
    })
  })

  it('reads the authorized Human Attention projection without local classification', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'v1:decision:decision-1' }), { status: 200 }))
    const client = new WorkMeshClient({ baseUrl: 'https://workmesh.test', sessionToken: 'session-token', fetch })

    await client.listHumanAttention({
      kind: 'decision',
      status: 'open',
      projectId: 'project-1',
      workItemId: 'work-1',
      sessionId: 'session-1',
    }, { cursor: 'opaque', limit: 17 })
    await client.getHumanAttention('v1:decision:decision-1')

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://workmesh.test/api/v1/human-attention?kind=decision&status=open&projectId=project-1&workItemId=work-1&sessionId=session-1&cursor=opaque&limit=17',
      'https://workmesh.test/api/v1/human-attention/v1%3Adecision%3Adecision-1',
    ])
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
