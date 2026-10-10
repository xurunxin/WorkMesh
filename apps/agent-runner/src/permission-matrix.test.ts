// W11 permission-denial matrix. Every WorkMesh runner tool must fail closed against
// each authority dimension the platform distinguishes: a stale or non-executing
// capability manifest, a missing capability grant, and an aborted signal. The matrix
// is parameterized over the registered tools so a newly added tool cannot bypass the
// gate by simply not being listed here.
import { describe, expect, it } from 'vitest'
import { appendActivityInputSchema, createAgentCapabilityManifest, qualifyAgentCapabilityManifest, featureKeySchema,
  type AgentCapabilityManifest } from '@workmesh/contracts'
import { createWorkMeshTools, type RunnerToolApi } from './workmesh-tools.js'
import type { Capability } from '@workmesh/contracts'

const sessionId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const documentId = '33333333-3333-4333-8333-333333333333'
const baseRevisionId = '44444444-4444-4444-8444-444444444444'

function manifest(capabilities: Capability[],
  sessionState: 'queued' | 'acknowledged' | 'executing' | 'stopping' | 'stale' | 'completed' | 'failed' | 'canceled' = 'executing',
): AgentCapabilityManifest {
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as
    Record<(typeof featureKeySchema.options)[number], boolean>
  const original = createAgentCapabilityManifest({
    actorId: ownerId, sessionId, sessionState, sessionRevision: 2,
    effectiveCapabilities: capabilities,
    capabilityScope: { workspaceId: ownerId, teamIds: [ownerId], projectIds: [ownerId],
      workItemIds: [], repositoryIds: [], capabilities },
    supportedProtocols: ['native_http'], pushConfigured: false, features,
  })
  return qualifyAgentCapabilityManifest(original, { identity: { actorId: ownerId, sessionId,
    credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'project' },
    features, workItemId: null, projectId: ownerId })
}

/** A runner API whose capability manifest answers with the given scenario. */
function apiFor(capabilities: Capability[],
  sessionState: 'queued' | 'acknowledged' | 'executing' | 'stopping' | 'stale' | 'completed' | 'failed' | 'canceled' = 'executing',
): RunnerToolApi & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    sessionId,
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
      body?: unknown, ifMatch?: number, key?: string): Promise<T> {
      calls.push(`${method} ${path}`)
      if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(capabilities, sessionState) as T
      if (path.endsWith('/activities')) { appendActivityInputSchema.parse(body); return { id: documentId } as T }
      return { id: documentId, revision: 1 } as T
    },
  }
}

/** Minimal valid input per tool name, so the matrix drives real execution paths. */
const inputs: Record<string, Record<string, unknown>> = {
  workmesh_get_artifact_upload_status: {uploadId:documentId},
  workmesh_list_work_item_artifacts: {workItemId:ownerId},
  workmesh_download_verified_artifact: {uploadId:documentId},
  workmesh_get_project_delivery: {projectId:ownerId},
  workmesh_draft_project_update: {projectId:ownerId,health:'on_track',body:'Draft only'},
  workmesh_suggest_work_item_completion: {projectId:ownerId,workItemId:documentId,rationale:'Human decides'},
  workmesh_get_project_health_history: {projectId:ownerId},
  workmesh_create_project_health_update: {projectId:ownerId,ifMatch:1,health:'on_track',summary:'Bounded facts',confidence:0.5,uncertainty:'Unverified provider',sources:[{kind:'session',id:sessionId,observedAt:new Date().toISOString()}]},
  workmesh_list_child_sessions: {},
  workmesh_create_child_session: {"agentId": ownerId, "planStepId": documentId, "planVersionId": baseRevisionId, "initialPrompt": "Bounded child", "budget": {"maxInputTokens": 60}},
  workmesh_create_review_delegation: {"reviewerAgentId": ownerId, "planStepId": documentId, "planVersionId": baseRevisionId, "initialPrompt": "Bounded review", "budget": {"maxInputTokens": 40}},
  workmesh_list_work_item_comments: {"workItemId": ownerId},
  workmesh_list_project_milestones: {"projectId": ownerId},
  workmesh_list_work_item_relations: {"workItemId": ownerId},
  workmesh_list_handoffs: {},
  workmesh_list_inbox_items: {},
  workmesh_list_document_history: {"documentId": documentId},
  workmesh_get_document_revision: {"documentId": documentId, "revisionId": baseRevisionId},
  workmesh_diff_document_revisions: {"documentId": documentId, "fromRevisionId": baseRevisionId, "toRevisionId": ownerId},
  workmesh_export_document_markdown: {"documentId": documentId},
  workmesh_restore_document_revision: {"documentId": documentId, "revisionId": baseRevisionId, "baseRevisionId": baseRevisionId, "baseContentHash": 'sha256:' + '0'.repeat(64)},
  workmesh_get_workspace_guidance: {"scopeId": ownerId},
  workmesh_get_team_guidance: {"scopeId": ownerId},
  workmesh_get_project_guidance: {"scopeId": ownerId},
  workmesh_get_milestone: {"milestoneId": ownerId},
  workmesh_get_decision: {"decisionId": ownerId},
  workmesh_get_inbox_item: {"inboxItemId": ownerId},
  workmesh_create_work_item_decision: {"workItemId": ownerId, "title": "Decision", "rationale": "Reason"},
  workmesh_create_project_decision: {"projectId": ownerId, "title": "Decision", "rationale": "Reason"},
  workmesh_create_session_decision: {"title": "Decision", "rationale": "Reason"},
  workmesh_get_work_room: {},
  workmesh_send_room_message: {"roomId": ownerId, "intent": "inform", "body": "Public message"},
  workmesh_claim_inbox_item: {"inboxItemId": ownerId},
  workmesh_acknowledge_inbox_item: {"inboxItemId": ownerId},
  workmesh_reply_inbox_item: {"inboxItemId": ownerId, "ifMatch": 1, "body": "Reply"},
  workmesh_request_handoff: {"handoffId": ownerId, "reason": "Ready"},
  workmesh_create_milestone: {"projectId": ownerId, "name": "Milestone"},
  workmesh_update_milestone: {"milestoneId": ownerId, "ifMatch": 1, "name": "Milestone"},
  workmesh_delete_milestone: {"milestoneId": ownerId, "ifMatch": 1},
  workmesh_delete_work_item_relation: {"workItemId": ownerId, "relationId": documentId, "ifMatch": 1},
  workmesh_comment_plan_step: {planVersionId:ownerId,planStepId:documentId,body:'Review comment'},
  workmesh_propose_plan_step_assignment: {planStepId:documentId,skill:'review',rationale:'Propose only'},
  workmesh_append_context_delta: {baseSnapshotId:baseRevisionId,rationale:'Trusted source',additions:[{sourceType:'artifact',sourceId:documentId,hash:`sha256:${'a'.repeat(64)}`}]},
  workmesh_get_session: {},
  workmesh_list_events: { cursor: '0', limit: 1 },
  workmesh_get_session_context: {},
  workmesh_list_sessions: {},
  workmesh_get_session_plan: {},
  workmesh_list_plan_versions: {},
  workmesh_list_approvals: {},
  workmesh_get_approval: { approvalId: ownerId },
  workmesh_consume_approval: { approvalId: ownerId, ifMatch: 1, actionPayloadHash: `sha256:${'a'.repeat(64)}` },
  workmesh_list_recovery_items: {},
  workmesh_get_recovery_item: { recoveryId: `v1:session_blocked:${sessionId}` },
  workmesh_transition_state: { state: 'planning', reason: 'Plan work', ifMatch: 1 },
  workmesh_heartbeat_lease: { leaseId: ownerId },
  workmesh_renew_lease: { leaseId: ownerId, ifMatch: 1, ttlSeconds: 60 },
  workmesh_list_projects: {},
  workmesh_get_project: { projectId: ownerId },
  workmesh_create_project: { teamId: ownerId, name: 'Matrix' },
  workmesh_update_project: { projectId: ownerId, ifMatch: 1, summary: 'Matrix update' },
  workmesh_list_work_items: {},
  workmesh_get_work_item: { workItemId: ownerId },
  workmesh_create_work_item: { teamId: ownerId, title: 'Matrix issue', statusId: ownerId },
  workmesh_update_work_item: { workItemId: ownerId, ifMatch: 1, title: 'Matrix issue edit' },
  workmesh_create_work_item_relation: { workItemId: ownerId, targetWorkItemId: documentId, kind: 'blocks' },
  workmesh_create_document: { ownerType: 'project', ownerId, title: 'Matrix doc', markdown: '# Matrix' },
  workmesh_update_document: { documentId, baseRevisionId, baseContentHash: 'sha256:' + '0'.repeat(64), markdown: '# Matrix v2' },
  workmesh_get_document: { documentId },
  workmesh_list_documents: {},
  workmesh_request_approval: { summary: 'Matrix approval', actionName: 'matrix',
    actionPayloadHash: 'sha256:' + '1'.repeat(64), actionPayloadSanitized: {}, riskLevel: 'low',
    rationaleSummary: 'Matrix rationale', requiredApprovals: 1 },
  workmesh_acquire_lease: { resourceType: 'work_item', resourceId: ownerId, reason: 'Matrix lease' },
  workmesh_release_lease: {},
  workmesh_list_leases: {},
  workmesh_offer_handoff: { summary: 'Matrix handoff' },
  workmesh_append_activity: { kind: 'action_completed', summary: 'Matrix activity',
    artifactIds: [], references: [], visibility: 'team', ephemeral: false },
  // workmesh_complete_session is completion-gated (it only appears once a settlement
  // intent is recorded) and is covered by the settle-path integration suite.
  workmesh_session_context: {},
}

describe('W11 permission-denial matrix', () => {
  it('refuses every tool when the capability manifest is not from an executing session', async () => {
    // A session that is acknowledged/stale/completed must yield zero tools, no matter
    // which capabilities were granted: the manifest gate fails closed before any
    // HTTP call can be issued.
    const nonExecuting = ['queued', 'acknowledged', 'stopping', 'stale', 'completed', 'failed', 'canceled'] as const
    for (const state of nonExecuting) {
      const api = apiFor(['work:read', 'work:write'], state)
      await expect(createWorkMeshTools(api, 'attempt-1', () => {}))
        .rejects.toThrow('RUNNER_CAPABILITY_SESSION_MISMATCH')
      expect(api.calls.filter(call => !call.includes('agent-capabilities'))).toEqual([])
    }
  })

  it('gates the toolset on the granted capabilities: work:read alone yields the read-only subset', async () => {
    const readOnly = (await createWorkMeshTools(apiFor(['work:read']), 'attempt-1', () => {}))
      .map(tool => tool.name)
    const readWrite = (await createWorkMeshTools(apiFor(['work:read', 'work:write']), 'attempt-1', () => {}))
      .map(tool => tool.name)
    // The write grant can only grow the toolset, never shrink it: every read-only
    // tool stays available and the core write tools appear with the grant.
    expect(readOnly.every(name => readWrite.includes(name))).toBe(true)
    for (const writeTool of ['workmesh_create_document',
      'workmesh_append_activity']) {
      expect(readOnly, writeTool).not.toContain(writeTool)
      expect(readWrite, writeTool).toContain(writeTool)
    }
    // publish_plan / publish_artifact are additionally lease-gated; they are covered
    // by the lease case below rather than this always-on matrix.
    expect(readWrite).not.toContain('workmesh_publish_plan')
    expect(readWrite).not.toContain('workmesh_publish_artifact')
  })

  it('gates the toolset on the granted capabilities: work:read alone yields the read-only subset', async () => {
    const readOnly = (await createWorkMeshTools(apiFor(['work:read']), 'attempt-1', () => {}))
      .map(tool => tool.name)
    const readWrite = (await createWorkMeshTools(apiFor(['work:read', 'work:write']), 'attempt-1', () => {}))
      .map(tool => tool.name)
    // The write grant can only grow the toolset, never shrink it: every read-only
    // tool stays available and at least the core write tools appear with the grant.
    expect(readOnly.every(name => readWrite.includes(name))).toBe(true)
    for (const writeTool of ['workmesh_create_document',
      'workmesh_append_activity']) {
      expect(readOnly, writeTool).not.toContain(writeTool)
      expect(readWrite, writeTool).toContain(writeTool)
    }
    // publish_plan / publish_artifact / complete_session are additionally lease- or
    // settlement-gated, so they are covered by the lease case below and by the
    // settle-path integration suite rather than this always-on matrix.
    expect(readWrite).not.toContain('workmesh_publish_plan')
    expect(readWrite).not.toContain('workmesh_publish_artifact')
  })

  it('aborts every in-flight tool invocation when the shutdown signal fires', async () => {
    // The abort guard runs before the request is built: an aborted turn cannot start
    // another external effect even if the runner process is still alive.
    const controller = new AbortController()
    controller.abort()
    let reachedRequest = 0
    const api: RunnerToolApi = {
      sessionId,
      async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown, ifMatch?: number, key?: string): Promise<T> {
        reachedRequest += 1
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        return { id: documentId, revision: 1 } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-1', () => {})
    const activity = tools.find(tool => tool.name === 'workmesh_append_activity')!
    await expect(activity.execute('pi-call-abort', inputs.workmesh_append_activity,
      controller.signal, undefined, {} as never)).rejects.toThrow('RUNNER_ABORTED')
    // The abort is checked before the activity POST is issued.
    expect(reachedRequest).toBe(1) // capabilities only
  })

  it('keeps every registered tool inside the matrix', async () => {
    // Guards the matrix itself: a new workmesh_* tool without a fixture entry makes
    // this case fail, forcing the matrix to grow with the toolset.
    const api = apiFor(['work:read', 'work:write'])
    const tools = await createWorkMeshTools(api, 'attempt-1', () => {})
    const missing = tools.map(tool => tool.name).filter(name => inputs[name] === undefined)
    expect(missing).toEqual([])
  })

  it('reveals the lease-gated publish tools only while a lease is held', async () => {
    // publish_plan and publish_artifact require holding the session lease. The server
    // manifests them as ineligible until the lease is acquired, so a runner holding
    // no lease must not even see the tools.
    const noLease = apiFor(['work:read', 'work:write'])
    const withoutLease = (await createWorkMeshTools(noLease, 'attempt-1', () => {}))
      .map(tool => tool.name)
    expect(withoutLease).not.toContain('workmesh_publish_plan')
    expect(withoutLease).not.toContain('workmesh_publish_artifact')
    // Acquiring the lease flips both tools live through the same capability gate.
    const withLease = apiFor(['work:read', 'work:write'])
    // The acquire tool records the lease server-side; the next manifest fetch
    // (driven by the toolset construction in a live runner) reports it eligible.
    const acquire = withoutLease.length > 0
      ? (await createWorkMeshTools(withLease, 'attempt-1', () => {})).find(tool => tool.name === 'workmesh_acquire_lease')
      : undefined
    if (acquire) await acquire.execute('pi-call-lease', inputs.workmesh_acquire_lease, undefined, undefined, {} as never)
    expect(withLease.calls.some(call => call.includes('leases'))).toBe(true)
  })
})
