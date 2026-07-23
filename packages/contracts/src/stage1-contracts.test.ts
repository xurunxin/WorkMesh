import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  agentApiErrorCodeSchema,
  agentEventEnvelopeSchema,
  agentRegistrationInputSchema,
  agentTeamAccessInputSchema,
  approvalEventEnvelopeSchema,
  stage1RouteManifest,
  completeAgentSessionInputSchema,
  planVersionHistoryResponseSchema,
  publishPlanInputSchema,
  sessionContextResponseSchema,
} from './index.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'

describe('Stage 1 agent contracts', () => {
  it('requires a completion evidence source or explicit no-artifact rationale', () => {
    expect(() => completeAgentSessionInputSchema.parse({ summary: 'Finished' })).toThrow()
    expect(completeAgentSessionInputSchema.parse({ summary: 'No output was required', noArtifactReason: 'Investigation confirmed the existing configuration.' }).noArtifactReason).toContain('Investigation')
  })

  it('models stable plan steps with dependency and cancellation fields', () => {
    const plan = publishPlanInputSchema.parse({
      changeSummary: 'Initial plan',
      steps: [{ id, title: 'Inspect', ordinal: 0, dependsOn: [], status: 'pending', acceptanceCriteria: [], expectedArtifacts: [] }],
    })
    expect(plan.steps[0]?.id).toBe(id)
  })

  it('exposes all Stage 1 agent mutations with idempotency and revision metadata', () => {
    const planRoute = stage1RouteManifest.find(route => route.method === 'PUT' && route.path === '/api/v1/agent-sessions/{id}/plan')
    const activityRoute = stage1RouteManifest.find(route => route.method === 'POST' && route.path === '/api/v1/agent-sessions/{id}/activities')
    expect(planRoute).toMatchObject({ mutation: true, revisioned: true })
    expect(activityRoute).toMatchObject({ mutation: true })
  })

  it('includes immutable plan history for compare views', () => {
    const route = stage1RouteManifest.find(candidate => candidate.method === 'GET' && candidate.path === '/api/v1/agent-sessions/{id}/plans')
    expect(route).toBeDefined()
    const version = { id, session_id: id, parent_version_id: null, change_summary: 'Initial', author_actor_id: id, created_at: '2026-07-23T00:00:00.000Z', steps: [] }
    expect(planVersionHistoryResponseSchema.parse([{ ...version, revision: 1 }, { ...version, id: 'b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438', revision: 2 }])).toHaveLength(2)
    expect(() => planVersionHistoryResponseSchema.parse([{ ...version, revision: 2 }, { ...version, id: 'b7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438', revision: 1 }])).toThrow()
  })

  it('separates requested capabilities from admin-approved team access', () => {
    expect(() => agentRegistrationInputSchema.parse({
      name: 'Coder', slug: 'coder', provider: 'internal', version: '1', supportedProtocols: ['native_http'],
      requestedCapabilities: ['work:read'], approvedCapabilities: ['repo:merge'],
    })).toThrow(/subset/)
    expect(agentTeamAccessInputSchema.parse({ approvedCapabilities: ['work:read'] }).approvedCapabilities).toEqual(['work:read'])
    expect(stage1RouteManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'PUT', path: '/api/v1/agents/{id}/team-access/{teamId}', mutation: true }),
      expect.objectContaining({ method: 'DELETE', path: '/api/v1/agents/{id}/team-access/{teamId}', mutation: true }),
    ]))
  })

  it('covers atomic start, retry, refresh and approval consumption routes', () => {
    expect(stage1RouteManifest).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'POST', path: '/api/v1/work-items/{id}/agent-session', mutation: true, revisioned: true }),
      expect.objectContaining({ method: 'POST', path: '/api/v1/agent-sessions/{id}/retry', mutation: true, revisioned: true }),
      expect.objectContaining({ method: 'POST', path: '/api/v1/agent-sessions/{id}/token/refresh', mutation: true }),
      expect.objectContaining({ method: 'POST', path: '/api/v1/approvals/{id}/consume', mutation: true, revisioned: true }),
    ]))
    expect(() => publishPlanInputSchema.parse({ changeSummary: 'Approved change', steps: [{ id, title: 'Ship', ordinal: 0 }], approvalId: id })).toThrow(/together/)
  })

  it('keeps session context as an aggregate response contract', () => {
    expect(sessionContextResponseSchema.keyof().options).toEqual(expect.arrayContaining(['session', 'workItem', 'plan', 'contextSnapshotId', 'guidanceUris']))
  })

  it('documents every Stage 1 route in OpenAPI with the required mutation headers', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    for (const route of stage1RouteManifest) {
      const escapedPath = route.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pathStart = openapi.search(new RegExp(`^  ${escapedPath}:$`, 'm'))
      expect(pathStart).toBeGreaterThanOrEqual(0)
      const nextPath = openapi.slice(pathStart + 1).search(/^  \/[^\n]+:$/m)
      const pathBlock = openapi.slice(pathStart, nextPath === -1 ? undefined : pathStart + 1 + nextPath)
      expect(pathBlock).toMatch(new RegExp(`operationId:|${route.method.toLowerCase()}:`))
      if ('mutation' in route && route.mutation) expect(pathBlock).toContain('#/components/parameters/IdempotencyKey')
      if ('revisioned' in route && route.revisioned) expect(pathBlock).toContain('#/components/parameters/IfMatch')
    }
  })

  it('keeps agent event envelopes forward compatible and exposes machine error codes', () => {
    const event = agentEventEnvelopeSchema.parse({
      cursor: 1, id, event_type: 'agent.session.created', event_version: 1, workspace_id: id,
      aggregate_type: 'agent_session', aggregate_id: id, aggregate_revision: 1, actor_id: id,
      correlation_id: 'correlation-1', idempotency_key: null, payload: {}, occurred_at: '2026-07-23T00:00:00.000Z', futureField: true,
    })
    expect(event.futureField).toBe(true)
    expect(agentApiErrorCodeSchema.parse('INVALID_SESSION_TRANSITION')).toBe('INVALID_SESSION_TRANSITION')
  })

  it('separates approval request, vote, terminal, and expiry event semantics', async () => {
    const envelope = { cursor: 1, id, event_version: 1, workspace_id: id, aggregate_type: 'approval', aggregate_id: id, aggregate_revision: 1, actor_id: id, correlation_id: 'approval-1', idempotency_key: null, session_id: id, sequence: 1, occurred_at: '2026-07-23T00:00:00.000Z' }
    const quorum = { required: 2, approved: 1, rejected: 0, reached: false }
    expect(approvalEventEnvelopeSchema.parse({ ...envelope, event_type: 'approval.decision.recorded', payload: { approvalId: id, decision: { actor_id: id, decision: 'approved', reason: 'Looks safe', decided_at: '2026-07-23T00:00:00.000Z' }, quorum, status: 'pending' } }).event_type).toBe('approval.decision.recorded')
    expect(() => approvalEventEnvelopeSchema.parse({ ...envelope, event_type: 'approval.requested', payload: { approvalId: id, sessionId: id, status: 'approved', actionName: 'deploy', actionPayloadHash: `sha256:${'a'.repeat(64)}`, requiredApprovals: 2, expiresAt: '2026-07-24T00:00:00.000Z' } })).toThrow()
    expect(() => approvalEventEnvelopeSchema.parse({ ...envelope, event_type: 'approval.approved', payload: { approvalId: id, status: 'pending', quorum, finalizedAt: '2026-07-23T00:00:00.000Z' } })).toThrow()
    expect(approvalEventEnvelopeSchema.parse({ ...envelope, event_type: 'approval.expired', payload: { approvalId: id, status: 'expired', expiredAt: '2026-07-24T00:00:00.000Z' } }).event_type).toBe('approval.expired')
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).toContain('approval.decision.recorded')
    expect(openapi).toContain('ApprovalEventEnvelope:')
  })
})
