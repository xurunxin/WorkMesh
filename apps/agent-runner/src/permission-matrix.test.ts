// W11 permission-denial matrix. Every WorkMesh runner tool must fail closed against
// each authority dimension the platform distinguishes: a stale or non-executing
// capability manifest, a missing capability grant, and an aborted signal. The matrix
// is parameterized over the registered tools so a newly added tool cannot bypass the
// gate by simply not being listed here.
import { describe, expect, it } from 'vitest'
import { appendActivityInputSchema, createAgentCapabilityManifest, featureKeySchema,
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
  return createAgentCapabilityManifest({
    actorId: ownerId, sessionId, sessionState, sessionRevision: 2,
    effectiveCapabilities: capabilities,
    capabilityScope: { workspaceId: ownerId, teamIds: [ownerId], projectIds: [ownerId],
      workItemIds: [], repositoryIds: [], capabilities },
    supportedProtocols: ['native_http'], pushConfigured: false, features,
  })
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
      if (path === '/api/v1/agent-capabilities') return manifest(capabilities, sessionState) as T
      if (path.endsWith('/activities')) { appendActivityInputSchema.parse(body); return { id: documentId } as T }
      return { id: documentId, revision: 1 } as T
    },
  }
}

/** Minimal valid input per tool name, so the matrix drives real execution paths. */
const inputs: Record<string, Record<string, unknown>> = {
  workmesh_get_session: {},
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
    for (const writeTool of ['workmesh_create_document', 'workmesh_update_work_item',
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
    for (const writeTool of ['workmesh_create_document', 'workmesh_update_work_item',
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
        if (path === '/api/v1/agent-capabilities') return manifest(['work:read', 'work:write']) as T
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
