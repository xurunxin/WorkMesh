import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type Agent,
  type AgentSession,
  type AgentState,
  type Approval,
  approvalActionability,
  approvedAgentCapabilitiesForTeam,
  agentDelegationScopeKey,
  canAgentExecuteWorkForTeam,
  canManageAgentTeamAccess,
  canPauseAgentSession,
  canRetryAgentSession,
  classifyApprovalDecisionFailure,
  decideApproval,
  formatApprovalPayload,
  createAgentSession,
  grantAgentTeamAccess,
  revokeAgentTeamAccess,
  retryAgentSession,
  isCurrentAgentDelegationScope,
  normalizeApproval,
} from './agents'
import { ApiError } from './api'

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

    const result = await createAgentSession({
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

    await expect(createAgentSession(input)).rejects.toThrow('response was lost')
    await expect(createAgentSession(input)).resolves.toEqual(session)

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

    await expect(createAgentSession(input)).rejects.toThrow('Revision conflict')
    await expect(createAgentSession(input)).resolves.toEqual(session)

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
        agent_id: agent.id, team_id: agentTeamId, approved_capabilities: ['work:read', 'work:write', 'plan:write'],
        status: 'active', approved_by_actor_id: '00000000-0000-4000-8000-000000000013', revision: 1,
        created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:00:00.000Z', revoked_at: null,
      }],
    }
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ delegation: { id: session.delegation_id, revision: 1 }, session }))
    vi.stubGlobal('fetch', fetchMock)

    expect(approvedAgentCapabilitiesForTeam(restrictedAgent, agentTeamId)).toEqual(['work:read', 'work:write', 'plan:write'])
    expect(canAgentExecuteWorkForTeam(restrictedAgent, agentTeamId)).toBe(true)
    await expect(createAgentSession({
      workItemId: session.work_item_id,
      workItemTeamId: agentTeamId,
      workItemRevision: 7,
      humanActorId: '00000000-0000-4000-8000-000000000013',
      agent: restrictedAgent,
      prompt: 'Run the restricted acceptance checks.',
      budget: {},
    })).resolves.toEqual(session)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).requestedCapabilities).toEqual(['work:read', 'work:write', 'plan:write'])
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
    const missingWrite: Agent = {
      ...agent,
      team_access: [{ ...agent.team_access[0]!, approved_capabilities: ['work:read'] }],
    }

    expect(approvedAgentCapabilitiesForTeam(withoutGrant, agentTeamId)).toEqual([])
    expect(approvedAgentCapabilitiesForTeam(withoutIntersection, agentTeamId)).toEqual([])
    expect(canAgentExecuteWorkForTeam(missingWrite, agentTeamId)).toBe(false)
    await expect(createAgentSession({ ...baseInput, agent: withoutGrant })).rejects.toThrow('requires work:read and work:write')
    await expect(createAgentSession({ ...baseInput, agent: withoutIntersection })).rejects.toThrow('requires work:read and work:write')
    await expect(createAgentSession({ ...baseInput, agent: missingWrite })).rejects.toThrow('requires work:read and work:write')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses a new request identity when the Agent or prompt changes after an unknown result', async () => {
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

    await expect(createAgentSession(input)).rejects.toThrow('response was lost')
    await expect(createAgentSession({ ...input, prompt: 'Run the updated acceptance checks.' })).resolves.toEqual(session)

    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)

    const changedAgent: Agent = { ...agent, id: '00000000-0000-4000-8000-000000000099' }
    await expect(createAgentSession({ ...input, agent: changedAgent, prompt: 'Run the updated acceptance checks.' })).resolves.toEqual(session)
    const thirdKey = new Headers(fetchMock.mock.calls[2]![1]?.headers).get('Idempotency-Key')
    expect(thirdKey).toBeTruthy()
    expect(thirdKey).not.toBe(secondKey)
  })

  it('does not apply an older pending delegation result after the Work Item scope changes', async () => {
    const scopeA = agentDelegationScopeKey({ workItemId: 'work-a', workItemTeamId: agentTeamId, workItemRevision: 7, humanActorId: 'human-a' })
    const scopeB = agentDelegationScopeKey({ workItemId: 'work-b', workItemTeamId: agentTeamId, workItemRevision: 3, humanActorId: 'human-b' })
    let currentScope = scopeA
    let latest: AgentSession | null = null
    const pending = Promise.resolve(session)
    const capturedScope = currentScope
    currentScope = scopeB
    const result = await pending
    if (isCurrentAgentDelegationScope(currentScope, capturedScope)) latest = result

    expect(latest).toBeNull()
    expect(isCurrentAgentDelegationScope(currentScope, scopeA)).toBe(false)
    expect(isCurrentAgentDelegationScope(currentScope, scopeB)).toBe(true)
  })

  it('keeps the delegation display scope stable across a Work Item revision refresh', () => {
    const scopeAtCreate = agentDelegationScopeKey({ workItemId: 'work-a', workItemTeamId: agentTeamId, workItemRevision: 7, humanActorId: 'human-a' })
    const scopeAfterRefresh = agentDelegationScopeKey({ workItemId: 'work-a', workItemTeamId: agentTeamId, workItemRevision: 8, humanActorId: 'human-a' })

    expect(scopeAfterRefresh).toBe(scopeAtCreate)
    expect(isCurrentAgentDelegationScope(scopeAfterRefresh, scopeAtCreate)).toBe(true)
  })
})

describe('decideApproval', () => {
  const approval: Approval = {
    id: '00000000-0000-4000-8000-0000000000a1',
    session_id: '00000000-0000-4000-8000-0000000000a2',
    approval_type: 'merge_pull_request',
    action_name: 'Merge PR #42',
    risk_level: 'high',
    rationale_summary: 'Squash merges a platform-blocking change.',
    status: 'pending',
    revision: 4,
    expires_at: '2026-08-23T00:00:00.000Z',
    created_at: '2026-08-22T22:00:00.000Z',
  }
  const decisionResponse = (status: 'pending' | 'approved' | 'rejected') => ({
    approval: { ...approval, status, revision: approval.revision + 1 },
    decision: {
      actor_id: '00000000-0000-4000-8000-0000000000a3',
      decision: status === 'rejected' ? 'rejected' as const : 'approved' as const,
      source: 'human' as const,
      policy_workspace_id: null,
      policy_revision: null,
      reason: 'Recorded reason',
      decided_at: '2026-08-22T22:10:00.000Z',
    },
    quorum: { required: 1, approved: status === 'approved' ? 1 : 0, rejected: status === 'rejected' ? 1 : 0, reached: status === 'approved' },
    status,
  })

  let storageValues: Map<string, string>

  beforeEach(() => {
    storageValues = new Map([['workmesh.csrf-token', 'csrf-token']])
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storageValues.set(key, value)),
      removeItem: vi.fn((key: string) => storageValues.delete(key)),
    })
    // decideApproval uses apiMutation, which has its own logical
    // operation dedupe map keyed by the function call identity. Reset
    // the module graph so the freshly-imported `decideApproval` binds
    // to a fresh `logicalAttempts` map and the per-test isolation
    // holds (otherwise the first "idempotency" test would see the key
    // minted by the first "posts to /decide" test).
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts to /decide with the correct method, headers, and body', async () => {
    const { decideApproval: decideFresh } = await import('./agents')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(decisionResponse('approved')))
    vi.stubGlobal('fetch', fetchMock)

    await expect(decideFresh(approval, 'approved', 'Manual override')).resolves.toMatchObject({ status: 'approved', approval: { status: 'approved' } })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(new URL(String(url)).pathname).toBe(`/api/v1/approvals/${approval.id}/decide`)
    expect(init?.method).toBe('POST')
    const headers = new Headers(init?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('If-Match')).toBe('"revision-4"')
    expect(headers.get('Idempotency-Key')).toBeTruthy()
    expect(JSON.parse(String(init?.body))).toEqual({ decision: 'approved', reason: 'Manual override' })
  })

  it('falls back to a default reason when none is supplied', async () => {
    const { decideApproval: decideFresh } = await import('./agents')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(decisionResponse('rejected')))
    vi.stubGlobal('fetch', fetchMock)

    await decideFresh(approval, 'rejected')

    const [, init] = fetchMock.mock.calls[0]!
    expect(JSON.parse(String(init?.body))).toEqual({ decision: 'rejected', reason: 'Human rejected without additional feedback' })
  })

  it('reuses the same idempotency key on identical URL+body so a double-click cannot double-write', async () => {
    const { decideApproval: decideFresh } = await import('./agents')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(decisionResponse('approved')))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([
      decideFresh(approval, 'approved'),
      decideFresh(approval, 'approved'),
    ])

    // apiMutation only shares the idempotency key, not the in-flight
    // promise; the server is responsible for collapsing the two writes
    // to one. We assert the same key on both calls so the server can do
    // its job.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
  })

  it('generates a fresh idempotency key when the decision changes', async () => {
    const { decideApproval: decideFresh } = await import('./agents')
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(decisionResponse('rejected')))
    vi.stubGlobal('fetch', fetchMock)

    await decideFresh(approval, 'approved')
    await decideFresh(approval, 'rejected')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstKey = new Headers(fetchMock.mock.calls[0]![1]?.headers).get('Idempotency-Key')
    const secondKey = new Headers(fetchMock.mock.calls[1]![1]?.headers).get('Idempotency-Key')
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })
})

describe('approval viewer actionability', () => {
  const rawApproval = {
    id: 'approval-a',
    session_id: 'session-a',
    approval_type: 'deploy',
    action_name: 'Deploy release',
    risk_level: 'high',
    rationale_summary: 'Ship the accepted release.',
    status: 'pending',
    revision: 2,
    expires_at: '2099-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    action_payload_sanitized: { repository: 'acme/workmesh', scope: 'release' },
    action_payload_hash: `sha256:${'b'.repeat(64)}`,
  }

  it('normalizes snake-case and camel-case actionability projections', () => {
    expect(normalizeApproval({
      ...rawApproval,
      viewer_actionability: { status: 'actionable', allowed_decisions: ['approved', 'rejected'] },
    }).viewer_actionability).toEqual({ status: 'actionable', allowed_decisions: ['approved', 'rejected'] })
    expect(normalizeApproval({
      ...rawApproval,
      viewerActionability: { status: 'blocked', reason: 'authority_revoked' },
    }).viewer_actionability).toEqual({ status: 'blocked', reason: 'authority_revoked' })
  })

  it('retains the server-sanitized action scope and payload in the Web model', () => {
    const approval = normalizeApproval(rawApproval)
    expect(approval.action_payload_sanitized).toEqual({ repository: 'acme/workmesh', scope: 'release' })
    expect(approval.action_payload_hash).toBe(`sha256:${'b'.repeat(64)}`)
    expect(formatApprovalPayload(approval.action_payload_sanitized)).toContain('acme/workmesh')
  })

  it('retains immutable decision reasons and quorum facts in approval projections', () => {
    const approval = normalizeApproval({
      ...rawApproval,
      decisions: [{
        actor_id: 'human-a',
        decision: 'approved',
        reason: 'Keep rollback evidence attached before proceeding.',
        source: 'human',
        policy_workspace_id: null,
        policy_revision: null,
        decided_at: '2026-08-28T00:01:00.000Z',
      }],
      quorum: { required: 2, approved: 1, rejected: 0, reached: false },
    })

    expect(approval.decisions).toEqual([expect.objectContaining({
      decision: 'approved',
      reason: 'Keep rollback evidence attached before proceeding.',
      source: 'human',
    })])
    expect(approval.quorum).toEqual({ required: 2, approved: 1, rejected: 0, reached: false })
  })

  it('normalizes camel-case decision fields without losing attached requirements', () => {
    const approval = normalizeApproval({
      ...rawApproval,
      decisions: [{
        actorId: 'human-a',
        decision: 'approved',
        reason: 'Run the migration only after the backup check.',
        source: 'human',
        policyWorkspaceId: null,
        policyRevision: null,
        decidedAt: '2026-08-28T00:01:00.000Z',
      }],
      quorum: { required: 1, approved: 1, rejected: 0, reached: true },
    })

    expect(approval.decisions?.[0]).toMatchObject({
      actor_id: 'human-a',
      reason: 'Run the migration only after the backup check.',
      decided_at: '2026-08-28T00:01:00.000Z',
    })
  })

  it('fails closed when an old or malformed Human projection omits actionability', () => {
    const legacy = normalizeApproval(rawApproval)
    expect(approvalActionability(legacy, Date.parse('2027-01-01T00:00:00.000Z'))).toEqual({ status: 'blocked', reason: 'authority_revoked' })
    expect(approvalActionability({ ...legacy, expires_at: '2020-01-01T00:00:00.000Z' }, Date.parse('2027-01-01T00:00:00.000Z'))).toEqual({ status: 'blocked', reason: 'expired' })
    expect(approvalActionability({ ...legacy, status: 'approved' })).toEqual({ status: 'blocked', reason: 'already_decided' })
  })

  it('classifies recoverable and authority failures without exposing private diagnostics', () => {
    expect(classifyApprovalDecisionFailure(new ApiError(403, 'private detail'))).toBe('forbidden')
    expect(classifyApprovalDecisionFailure(new ApiError(409, 'private detail', 'REVISION_CONFLICT'))).toBe('conflict')
    expect(classifyApprovalDecisionFailure(new ApiError(422, 'private detail', 'APPROVAL_EXPIRED'))).toBe('expired')
    expect(classifyApprovalDecisionFailure(new ApiError(409, 'private detail', 'DELEGATION_NOT_ACTIVE'))).toBe('authority_inactive')
    expect(classifyApprovalDecisionFailure(new ApiError(503, 'private detail'))).toBe('server')
    expect(classifyApprovalDecisionFailure(new TypeError('Failed to fetch'))).toBe('network')
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
