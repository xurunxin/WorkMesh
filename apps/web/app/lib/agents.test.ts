import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Agent,
  type AgentSession,
  type AgentState,
  approvedAgentCapabilitiesForTeam,
  canManageAgentTeamAccess,
  canPauseAgentSession,
  canRetryAgentSession,
  delegateAndStart,
  grantAgentTeamAccess,
  revokeAgentTeamAccess,
  retryAgentSession,
} from './agents'

const agentTeamId = '00000000-0000-4000-8000-000000000030'

const agent = {
  id: '00000000-0000-4000-8000-000000000001',
  workspace_id: '00000000-0000-4000-8000-000000000002',
  actor_id: '00000000-0000-4000-8000-000000000003',
  slug: 'test-agent',
  description: null,
  supported_protocols: ['native_http'],
  skills: [],
  requested_capabilities: ['work:read', 'work:write'],
  approved_capabilities: ['work:read', 'work:write'],
  max_concurrency: 1,
  is_active: true,
  revision: 1,
  team_access: [{
    agent_id: '00000000-0000-4000-8000-000000000001',
    team_id: agentTeamId,
    approved_capabilities: ['work:read', 'work:write'],
    status: 'active',
    approved_by_actor_id: '00000000-0000-4000-8000-000000000013',
    revision: 1,
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
    revoked_at: null,
  }],
} satisfies Agent

const session = {
  id: '00000000-0000-4000-8000-000000000010',
  agent_id: agent.id,
  agent_actor_id: agent.actor_id,
  delegation_id: '00000000-0000-4000-8000-000000000011',
  work_item_id: '00000000-0000-4000-8000-000000000012',
  state: 'failed',
  state_reason: 'Agent exited',
  revision: 3,
  current_plan_version_id: null,
  budget: {},
  last_heartbeat_at: null,
  stop_requested_at: null,
  error_code: 'AGENT_EXITED',
  error_summary: 'Agent exited',
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T00:01:00.000Z',
} satisfies AgentSession

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('agent control requests', () => {
  let storageValues: Map<string, string>

  beforeEach(() => {
    storageValues = new Map([['workmesh.csrf-token', 'csrf-token']])
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storageValues.set(key, value)),
      removeItem: vi.fn((key: string) => storageValues.delete(key)),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates the delegation and initial session with one atomic mutation', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ delegation: { id: session.delegation_id, revision: 1 }, session }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await delegateAndStart({
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      agent,
      prompt: 'Run the acceptance checks.',
      budget: {},
    })

    expect(result).toEqual(session)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(new URL(String(url)).pathname).toBe(`/api/v1/work-items/${session.work_item_id}/agent-session`)
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('If-Match')).toBe('"revision-7"')
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(String(init?.body))).toEqual({
      agentId: agent.id,
      principalHumanActorId: '00000000-0000-4000-8000-000000000013',
      role: 'executor',
      requestedCapabilities: agent.approved_capabilities,
      initialPrompt: 'Run the acceptance checks.',
      budget: {},
    })
  })

  it('reuses the atomic start idempotency key after a network failure', async () => {
    let attempts = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('response was lost')
      return jsonResponse({ delegation: { id: session.delegation_id, revision: 1 }, session })
    })
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      agent,
      prompt: 'Run the acceptance checks.',
      budget: {},
    }

    await expect(delegateAndStart(input)).rejects.toThrow('response was lost')
    await expect(delegateAndStart(input)).resolves.toEqual(session)

    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
    expect([...storageValues.keys()].some(key => key.startsWith('workmesh.idempotency.'))).toBe(false)
  })

  it('clears the operation key after an explicit non-retry response', async () => {
    let attempts = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      attempts += 1
      if (attempts === 1) return jsonResponse({ error: { message: 'Revision conflict' } }, 409)
      return jsonResponse({ delegation: { id: session.delegation_id, revision: 1 }, session })
    })
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      agent,
      prompt: 'Run the acceptance checks.',
      budget: {},
    }

    await expect(delegateAndStart(input)).rejects.toThrow('Revision conflict')
    await expect(delegateAndStart(input)).resolves.toEqual(session)

    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })

  it('retries an eligible terminal session and returns the new session', async () => {
    const nextSession = { ...session, id: '00000000-0000-4000-8000-000000000020', state: 'queued' as const, revision: 1, retry_of_session_id: session.id }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(nextSession))
    vi.stubGlobal('fetch', fetchMock)

    await expect(retryAgentSession(session)).resolves.toEqual(nextSession)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(new URL(String(url)).pathname).toBe(`/api/v1/agent-sessions/${session.id}/retry`)
    expect(new Headers(init?.headers).get('If-Match')).toBe('"revision-3"')
    expect(JSON.parse(String(init?.body))).toEqual({ reason: 'Human requested a retry from WorkMesh.', reuseContext: true })
  })

  it('reuses the retry idempotency key after a network failure', async () => {
    const nextSession = { ...session, id: '00000000-0000-4000-8000-000000000020', state: 'queued' as const, revision: 1, retry_of_session_id: session.id }
    let attempts = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      attempts += 1
      if (attempts === 1) throw new TypeError('response was lost')
      return jsonResponse(nextSession, 201)
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(retryAgentSession(session)).rejects.toThrow('response was lost')
    await expect(retryAgentSession(session)).resolves.toEqual(nextSession)

    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
    expect([...storageValues.keys()].some(key => key.startsWith('workmesh.idempotency.'))).toBe(false)
  })

  it('calls the team access grant and revoke endpoints', async () => {
    const access = {
      agent_id: agent.id, team_id: '00000000-0000-4000-8000-000000000030', approved_capabilities: ['work:read'],
      status: 'active', approved_by_actor_id: '00000000-0000-4000-8000-000000000031', revision: 1,
      created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:00:00.000Z', revoked_at: null,
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(access))
    vi.stubGlobal('fetch', fetchMock)

    await grantAgentTeamAccess(agent.id, access.team_id, ['work:read'])
    await revokeAgentTeamAccess(agent.id, access.team_id)

    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(`/api/v1/agents/${agent.id}/team-access/${access.team_id}`)
    expect(fetchMock.mock.calls[0]![1]?.method).toBe('PUT')
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ approvedCapabilities: ['work:read'] })
    expect(fetchMock.mock.calls[1]![1]?.method).toBe('DELETE')
  })

  it('submits only capabilities approved by both the definition and active team grant', async () => {
    const restrictedAgent: Agent = {
      ...agent,
      approved_capabilities: ['work:read', 'work:write', 'plan:write'],
      team_access: [{
        agent_id: agent.id, team_id: agentTeamId, approved_capabilities: ['work:read', 'plan:write'],
        status: 'active', approved_by_actor_id: '00000000-0000-4000-8000-000000000013', revision: 1,
        created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:00:00.000Z', revoked_at: null,
      }],
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ delegation: { id: session.delegation_id, revision: 1 }, session }))
    vi.stubGlobal('fetch', fetchMock)

    expect(approvedAgentCapabilitiesForTeam(restrictedAgent, agentTeamId)).toEqual(['work:read', 'plan:write'])
    await expect(delegateAndStart({
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      agent: restrictedAgent,
      prompt: 'Run the restricted acceptance checks.',
      budget: {},
    })).resolves.toEqual(session)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).requestedCapabilities).toEqual(['work:read', 'plan:write'])
  })

  it('does not start when the team has no active grant or no shared approved capability', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const baseInput = {
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      prompt: 'This must not start.',
      budget: {},
    }
    const withoutGrant: Agent = { ...agent, team_access: [] }
    const withoutIntersection: Agent = {
      ...agent,
      team_access: [{ ...agent.team_access[0]!, approved_capabilities: ['plan:write'] }],
    }

    expect(approvedAgentCapabilitiesForTeam(withoutGrant, agentTeamId)).toEqual([])
    expect(approvedAgentCapabilitiesForTeam(withoutIntersection, agentTeamId)).toEqual([])
    await expect(delegateAndStart({ ...baseInput, agent: withoutGrant })).rejects.toThrow('no capabilities approved')
    await expect(delegateAndStart({ ...baseInput, agent: withoutIntersection })).rejects.toThrow('no capabilities approved')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('agent session control policy', () => {
  it('only offers pause and retry in states accepted by the protocol', () => {
    const pauseStates: AgentState[] = ['planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked']
    const nonPauseStates: AgentState[] = ['queued', 'acknowledged', 'paused', 'stale', 'completed', 'failed', 'canceled']
    const retryStates: AgentState[] = ['failed', 'canceled', 'stale']
    expect(pauseStates.filter(canPauseAgentSession)).toHaveLength(5)
    expect(nonPauseStates.filter(canPauseAgentSession)).toEqual([])
    expect(retryStates.filter(canRetryAgentSession)).toEqual(retryStates)
  })

  it('only permits workspace admins to manage team access', () => {
    expect(canManageAgentTeamAccess('admin')).toBe(true)
    expect(canManageAgentTeamAccess('member')).toBe(false)
    expect(canManageAgentTeamAccess(undefined)).toBe(false)
  })
})
