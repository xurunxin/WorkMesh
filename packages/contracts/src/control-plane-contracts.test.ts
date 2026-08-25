import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  actionPreviewResponseSchema,
  agentRouteManifest,
  controlCenterResponseSchema,
  controlPlaneInvalidationsForEvent,
  mcpPolicyBindings,
  routePolicyManifest,
} from './index.js'

const id = '00000000-0000-4000-8000-000000000001'
const now = '2026-08-26T00:00:00.000Z'

describe('Human Control Plane read contracts', () => {
  it('versions and bounds every initial Control Center collection', () => {
    const section = { items: [], nextCursor: null }
    expect(controlCenterResponseSchema.parse({
      projectionVersion: 1,
      scope: { workspaceId: id, projectId: null },
      project: null,
      revision: 1,
      freshness: { state: 'current', observedAt: now, sourceUpdatedAt: now },
      collections: {
        attention: section,
        running: section,
        risks: section,
        recently_verified: section,
        ready_work: section,
        blocked_work: section,
      },
    }).projectionVersion).toBe(1)
  })

  it('makes Action Preview advisory, revision-bound, expiring, and non-authoritative', () => {
    const preview = actionPreviewResponseSchema.parse({
      projectionVersion: 1,
      action: 'stop',
      allowed: true,
      reasonCode: 'control.allowed',
      sourceRevision: 4,
      currentState: 'executing',
      targetState: 'stopping',
      affectedResources: [{ type: 'agent_session', id, revision: 4 }],
      consequences: [{ code: 'session.transition.stopping', summary: 'Stops ordinary writes.' }],
      reversible: false,
      releaseLease: true,
      preserveArtifacts: true,
      preserveUncommittedWork: 'runtime_dependent',
      nextWorkItemState: null,
      invalidatedApprovals: [],
      requiredReason: true,
      requiredApproval: { required: false, approvalType: null },
      warnings: ['The final command revalidates authority.'],
      expiresAt: '2026-08-26T00:00:30.000Z',
      freshness: { state: 'current', observedAt: now, sourceUpdatedAt: now, invalidAfter: '2026-08-26T00:00:30.000Z' },
      advisory: true,
    })
    expect(preview).toMatchObject({ advisory: true, sourceRevision: 4, releaseLease: true })
  })

  it('binds all five REST and MCP reads to stable read policies', async () => {
    const routes = agentRouteManifest.map(route => `${route.method} ${route.path}`)
    expect(routes).toEqual(expect.arrayContaining([
      'GET /api/v1/control-center',
      'GET /api/v1/projects/{projectId}/control-center',
      'GET /api/v1/agent-sessions/{sessionId}/explanation',
      'GET /api/v1/work-items/{workItemId}/execution-summary',
      'POST /api/v1/agent-sessions/{sessionId}/control-preview',
    ]))
    const preview = routePolicyManifest.find(policy => policy.operationId === 'previewAgentSessionControl')
    expect(preview).toMatchObject({ actorKinds: ['human', 'agent'], idempotency: 'none', revision: 'none', resourceResolverId: 'none' })
    expect(preview?.agent.capabilities).toEqual(['work:read'])
    expect(mcpPolicyBindings['tool:preview_agent_session_control']).toMatchObject({ operationId: 'previewAgentSessionControl' })
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).toContain('operationId: previewAgentSessionControl')
    expect(openapi).toContain('$ref: "#/components/schemas/RunExplanation"')
  })

  it('targets realtime invalidation to affected projection scopes and fragments', () => {
    const invalidations = controlPlaneInvalidationsForEvent({
      cursor: '1', id, event_type: 'agent.session.state_changed', event_version: 1,
      workspace_id: id, team_id: null, audience_actor_id: null,
      audience: { visibility: 'workspace', workspaceId: id, teamId: null, actorId: null },
      scopes: [{ type: 'project', id: '00000000-0000-4000-8000-000000000002' }],
      invalidates: [
        { type: 'session', id: '00000000-0000-4000-8000-000000000003' },
        { type: 'work_item', id: '00000000-0000-4000-8000-000000000004' },
      ],
      aggregate_type: 'agent_session', aggregate_id: '00000000-0000-4000-8000-000000000003', aggregate_revision: 2,
      actor_id: id, correlation_id: 'correlation', idempotency_key: null, payload: {}, occurred_at: now,
    })
    expect(invalidations).toEqual(expect.arrayContaining([
      expect.objectContaining({ projection: 'control_center', scopeId: id, fragments: expect.arrayContaining(['running','risks','recently_verified']) }),
      expect.objectContaining({ projection: 'control_center', scopeId: '00000000-0000-4000-8000-000000000002' }),
      expect.objectContaining({ projection: 'run_explanation', scopeId: '00000000-0000-4000-8000-000000000003' }),
      expect.objectContaining({ projection: 'control_preview', scopeId: '00000000-0000-4000-8000-000000000003' }),
      expect.objectContaining({ projection: 'execution_summary', scopeId: '00000000-0000-4000-8000-000000000004' }),
    ]))
  })
})
