import { readFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import { createWorkMeshMcpServer, mcpPolicyBindings } from './index.js'
import { WorkMeshSdkError, type WorkMeshClient } from '@workmesh/agent-sdk'

const sessionId = '00000000-0000-4000-8000-000000000001'
const workItemId = '00000000-0000-4000-8000-000000000002'
const projectId = '00000000-0000-4000-8000-000000000003'
const repositoryId = '00000000-0000-4000-8000-000000000004'
const pullRequestId = '00000000-0000-4000-8000-000000000005'
const artifactId = '00000000-0000-4000-8000-000000000006'
const workspaceId = '00000000-0000-4000-8000-000000000007'
const teamId = '00000000-0000-4000-8000-000000000008'

const currentConnectionIdentity = (capabilities = ['work:read', 'work:write']) => ({
  connection: { id: projectId },
  coordination_session: { id: sessionId },
  agent_actor_id: artifactId,
  principal_human_actor_id: workItemId,
  team_id: teamId,
  granted_capabilities: capabilities,
  authenticated_credential: {
    fingerprint_prefix: '0123456789ab',
    status: 'active',
    overlap_until: null,
  },
})

async function connected(mode: 'read-only' | 'read-write', client: WorkMeshClient, coordination = false) {
  const server = createWorkMeshMcpServer({ client, mode, coordination })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const protocol = new Client({ name: 'mcp-test-client', version: '1.0.0' })
  await protocol.connect(clientTransport)
  return { server, protocol }
}

describe('WorkMesh MCP adapter', () => {
  it('claims an eligible Issue and returns only a recoverable execution bridge receipt', async () => {
    const exchangeToken = 'exchange-secret-must-not-escape'
    const sessionToken = 'session-secret-must-not-escape'
    const claimWorkItem = vi.fn().mockResolvedValue({
      delegation: { id: artifactId, role: 'executor' },
      session: { id: sessionId, state: 'queued', revision: 1 },
      exchangeToken,
    })
    const exchangeClaimedSessionToken = vi.fn().mockResolvedValue({
      sessionToken,
      expiresAt: '2026-08-24T14:00:00.000Z',
    })
    const listClaimableWorkItems = vi.fn().mockResolvedValue({
      items: [{ id: workItemId, revision: 4 }],
      nextCursor: null,
    })
    const requestHandoff = vi.fn().mockResolvedValue({
      id: projectId,
      status: 'requested',
    })
    const api = {
      claimWorkItem,
      exchangeClaimedSessionToken,
      listClaimableWorkItems,
      requestHandoff,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const tools = (await protocol.listTools()).tools
      const names = tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining(['list_claimable_work_items', 'claim_work_item']))
      expect(names).not.toContain('start_agent_session')
      expect(tools.find(tool => tool.name === 'list_claimable_work_items')?.description)
        .toContain('live work:read and work:write authorization')
      expect(tools.find(tool => tool.name === 'list_claimable_work_items')?.description)
        .toContain('or no non-terminal execution remains')
      expect(tools.find(tool => tool.name === 'claim_work_item')?.description)
        .toContain('Terminal history stays immutable')

      const claimable = await protocol.callTool({
        name: 'list_claimable_work_items',
        arguments: { limit: 25 },
      })
      expect(claimable.isError).not.toBe(true)
      expect(listClaimableWorkItems).toHaveBeenCalledWith({ cursor: undefined, limit: 25 })

      const claimed = await protocol.callTool({
        name: 'claim_work_item',
        arguments: {
          workItemId,
          revision: 4,
          requestedCapabilities: ['work:read', 'work:write'],
          initialPrompt: 'Take ownership and deliver this Issue.',
          idempotencyKey: 'claim-stable-key',
        },
      })
      expect(claimed.isError, JSON.stringify(claimed.structuredContent)).not.toBe(true)
      expect(claimWorkItem).toHaveBeenCalledWith(workItemId, {
        requestedCapabilities: ['work:read', 'work:write'],
        initialPrompt: 'Take ownership and deliver this Issue.',
        contextSnapshotId: undefined,
        budget: undefined,
      }, { ifMatch: 4, idempotencyKey: 'claim-stable-key' })
      expect(exchangeClaimedSessionToken).toHaveBeenCalledWith(
        sessionId,
        exchangeToken,
        { idempotencyKey: expect.stringMatching(/^coordination:claim_work_item_exchange:/) },
      )
      expect(claimed.structuredContent).toMatchObject({
        data: {
          delegation: { id: artifactId },
          session: { id: sessionId },
          executionAuth: {
            mode: 'connection_session_bridge',
            sessionId,
            expiresAt: '2026-08-24T14:00:00.000Z',
          },
        },
      })
      expect(JSON.stringify(claimed.structuredContent)).not.toContain(exchangeToken)
      expect(JSON.stringify(claimed.structuredContent)).not.toContain(sessionToken)

      const requested = await protocol.callTool({
        name: 'request_handoff',
        arguments: {
          handoffId: projectId,
          sourceSessionId: sessionId,
          reason: 'ready for transfer',
          idempotencyKey: 'handoff-request-key',
        },
      })
      expect(requested.isError).not.toBe(true)
      expect(requestHandoff).toHaveBeenCalledWith(
        projectId,
        { reason: 'ready for transfer' },
        { sessionId, idempotencyKey: 'handoff-request-key' },
      )
    } finally { await protocol.close(); await server.close() }
  })

  it('keeps explicit mutation idempotency keys out of API request bodies', async () => {
    const createProject = vi.fn().mockResolvedValue({ id: projectId, revision: 1 })
    const createWorkItem = vi.fn().mockResolvedValue({ id: workItemId, revision: 1 })
    const acquireLease = vi.fn().mockResolvedValue({ id: artifactId, revision: 1 })
    const publishArtifact = vi.fn().mockResolvedValue({ id: artifactId, revision: 1 })
    const api = {
      createProject,
      createWorkItem,
      acquireLease,
      publishArtifact,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const project = await protocol.callTool({
        name: 'create_project',
        arguments: {
          teamId,
          name: 'Production acceptance',
          idempotencyKey: 'create-project-stable-key',
        },
      })
      const created = await protocol.callTool({
        name: 'create_work_item',
        arguments: {
          teamId,
          projectId,
          title: 'Production intake acceptance',
          description: 'Exercise the explicit MCP idempotency boundary.',
          statusId: repositoryId,
          priority: 'low',
          labels: ['acceptance'],
          idempotencyKey: 'create-work-item-stable-key',
        },
      })
      const lease = await protocol.callTool({
        name: 'acquire_lease',
        arguments: {
          sessionId,
          resourceType: 'work_item',
          resourceId: workItemId,
          reason: 'Exercise the explicit MCP idempotency boundary.',
          idempotencyKey: 'acquire-lease-stable-key',
        },
      })
      const artifact = await protocol.callTool({
        name: 'publish_artifact',
        arguments: {
          sessionId,
          workItemId,
          type: 'test_report',
          title: 'Production acceptance result',
          idempotencyKey: 'publish-artifact-stable-key',
        },
      })
      expect(project.isError, JSON.stringify(project.structuredContent)).not.toBe(true)
      expect(created.isError, JSON.stringify(created.structuredContent)).not.toBe(true)
      expect(lease.isError, JSON.stringify(lease.structuredContent)).not.toBe(true)
      expect(artifact.isError, JSON.stringify(artifact.structuredContent)).not.toBe(true)
      expect(createProject).toHaveBeenCalledWith(expect.objectContaining({
        teamId,
        name: 'Production acceptance',
      }), { idempotencyKey: 'create-project-stable-key' })
      expect(createWorkItem).toHaveBeenCalledWith(expect.objectContaining({
        teamId,
        projectId,
        title: 'Production intake acceptance',
        description: 'Exercise the explicit MCP idempotency boundary.',
        statusId: repositoryId,
        priority: 'low',
        labels: ['acceptance'],
      }), { idempotencyKey: 'create-work-item-stable-key' })
      expect(acquireLease).toHaveBeenCalledWith(expect.objectContaining({
        sessionId,
        resourceType: 'work_item',
        resourceId: workItemId,
        reason: 'Exercise the explicit MCP idempotency boundary.',
      }), { idempotencyKey: 'acquire-lease-stable-key' })
      expect(publishArtifact).toHaveBeenCalledWith(expect.objectContaining({
        sessionId,
        workItemId,
        type: 'test_report',
        title: 'Production acceptance result',
      }), { idempotencyKey: 'publish-artifact-stable-key' })
      for (const mutation of [createProject, createWorkItem, acquireLease, publishArtifact]) {
        expect(mutation.mock.calls[0]?.[0]).not.toHaveProperty('idempotencyKey')
      }
    } finally { await protocol.close(); await server.close() }
  })

  it('bootstraps a fresh coordination Agent and resolves a stable Project reference in two calls', async () => {
    const manifest = {
      profileVersion: '1.0.0',
      agent: {
        actorId: artifactId,
        sessionId,
        sessionState: 'executing',
        sessionRevision: 4,
        effectiveCapabilities: ['work:read', 'work:write'],
        capabilityScope: { workspaceId, teamIds: [teamId], projectIds: [], workItemIds: [], repositoryIds: [], capabilities: ['work:read', 'work:write'] },
        supportedProtocols: ['mcp'],
      },
      operations: [
        { operationId: 'createProject', supported: true, eligibleByCapability: true },
        { operationId: 'deleteProject', supported: false, eligibleByCapability: false },
      ],
      delivery: { realtime: { durableCursor: true } },
      extensions: [],
    }
    const team = { id: teamId, key: 'WM', name: 'WorkMesh', revision: 2 }
    const project = { id: projectId, team_id: teamId, name: 'Kaneo UI Adoption', revision: 3 }
    const listTeams = vi.fn().mockResolvedValue({ items: [team], nextCursor: null })
    const listWorkflowStates = vi.fn().mockResolvedValue({
      items: [
        { id: repositoryId, team_id: teamId, name: 'Backlog', category: 'backlog', position: 0 },
        { id: pullRequestId, team_id: teamId, name: 'Ready', category: 'planned', position: 1 },
      ],
      nextCursor: null,
    })
    const listProjects = vi.fn().mockResolvedValue({ items: [project], nextCursor: null })
    const api = {
      getAgentCapabilities: vi.fn().mockResolvedValue(manifest),
      getCurrentAgentConnectionIdentity: vi.fn().mockResolvedValue(currentConnectionIdentity()),
      listTeams,
      listWorkflowStates,
      listProjects,
      getServerInfo: vi.fn().mockResolvedValue({ release: '1.0.0' }),
      getFeatures: vi.fn().mockResolvedValue({ features: { coordinationMcp: true } }),
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const context = await protocol.callTool({ name: 'get_workmesh_context', arguments: {} })
      expect(context.isError, JSON.stringify(context.structuredContent)).not.toBe(true)
      expect(context.structuredContent).toMatchObject({
        data: {
          identity: { actorId: artifactId, sessionId, sessionRevision: 4 },
          connectionIdentity: {
            connection: { id: projectId },
            authenticated_credential: { fingerprint_prefix: '0123456789ab' },
          },
          team: { id: teamId, key: 'WM', ref: 'WM' },
          defaultWorkflowState: { id: pullRequestId, name: 'Ready', ref: 'WM/state/ready' },
          eventCursor: { cursor: '0', semantics: 'replay_from_origin' },
          allowedOperations: ['createProject'],
        },
      })
      const identity = await protocol.callTool({ name: 'get_current_identity', arguments: {} })
      expect(identity.structuredContent).toMatchObject({
        data: {
          actorId: artifactId,
          sessionId,
          connectionIdentity: {
            connection: { id: projectId },
            principal_human_actor_id: workItemId,
          },
        },
      })
      const resolved = await protocol.callTool({
        name: 'resolve_identifier',
        arguments: { kind: 'project', ref: 'WM/kaneo-ui-adoption~000000000003' },
      })
      expect(resolved.isError).not.toBe(true)
      expect(resolved.structuredContent).toEqual({
        data: {
          kind: 'project',
          id: projectId,
          ref: 'WM/kaneo-ui-adoption~000000000003',
          displayName: 'Kaneo UI Adoption',
          revision: 3,
          teamRef: 'WM',
        },
      })
      expect(listTeams).toHaveBeenCalledTimes(2)
      expect(listWorkflowStates).toHaveBeenCalledWith(teamId, { limit: 200 })
      expect(listProjects).toHaveBeenCalledWith({ teamId }, { cursor: undefined, limit: 200 })
    } finally { await protocol.close(); await server.close() }
  })

  it('gives a stable UUID suffix precedence over duplicate Project and Milestone names', async () => {
    const team = { id: teamId, key: 'WM', name: 'WorkMesh', revision: 2 }
    const projects = [
      { id: projectId, team_id: teamId, name: 'Duplicate name', revision: 3 },
      { id: repositoryId, team_id: teamId, name: 'Duplicate name', revision: 4 },
    ]
    const milestones = [
      { id: artifactId, project_id: projectId, name: 'Duplicate phase', revision: 2 },
      { id: workspaceId, project_id: projectId, name: 'Duplicate phase', revision: 5 },
    ]
    const api = {
      listTeams: vi.fn().mockResolvedValue({ items: [team], nextCursor: null }),
      listProjects: vi.fn().mockResolvedValue({ items: projects, nextCursor: null }),
      listProjectMilestones: vi.fn().mockResolvedValue({ items: milestones, nextCursor: null }),
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api, true)
    try {
      const project = await protocol.callTool({
        name: 'resolve_identifier',
        arguments: { kind: 'project', ref: 'WM/duplicate-name~000000000003' },
      })
      expect(project.isError, JSON.stringify(project.structuredContent)).not.toBe(true)
      expect(project.structuredContent).toMatchObject({ data: { id: projectId, ref: 'WM/duplicate-name~000000000003' } })

      const milestone = await protocol.callTool({
        name: 'resolve_identifier',
        arguments: {
          kind: 'milestone',
          projectRef: 'WM/old-project-name~000000000003',
          ref: 'WM/old-project-name~000000000003#old-phase~000000000006',
        },
      })
      expect(milestone.isError, JSON.stringify(milestone.structuredContent)).not.toBe(true)
      expect(milestone.structuredContent).toMatchObject({ data: { id: artifactId, ref: 'WM/duplicate-name~000000000003#duplicate-phase~000000000006' } })
    } finally { await protocol.close(); await server.close() }
  })

  it('prepares a deterministic Project import without calling any WorkMesh API', async () => {
    const apiCalls = {
      getAgentCapabilities: vi.fn(),
      listTeams: vi.fn(),
      listProjects: vi.fn(),
      createProject: vi.fn(),
      createMilestone: vi.fn(),
      createWorkItem: vi.fn(),
      createWorkItemRelation: vi.fn(),
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    }
    const api = apiCalls as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api, true)
    const base = {
      teamRef: 'WM',
      defaultStatus: 'Ready',
      project: {
        sourceId: 'kaneo-project',
        name: 'WorkMesh Human Experience — Kaneo UI Adoption',
        summary: 'Selective Kaneo UI adoption.',
        provenance: { provider: 'github', sourceUrl: 'https://github.com/usekaneo/kaneo', sourceIdentifier: 'usekaneo/kaneo' },
      },
      milestones: [
        { sourceId: 'm2', name: 'M2 Agent ergonomics' },
        { sourceId: 'm1', name: 'M1 Human foundation' },
      ],
      workItems: [
        { sourceId: 'issue-2', title: 'Child delivery', status: 'Ready', parentSourceId: 'issue-1', milestoneSourceId: 'm2', priority: 'high' },
        { sourceId: 'issue-1', title: 'Parent delivery', status: 'Backlog', milestoneSourceId: 'm1', labels: ['roadmap:post-ga'] },
      ],
      relations: [
        { sourceId: 'relation-1', sourceWorkItemId: 'issue-1', targetWorkItemId: 'issue-2', kind: 'blocks' },
      ],
    }
    try {
      const first = await protocol.callTool({ name: 'prepare_project_import', arguments: base })
      const reordered = await protocol.callTool({
        name: 'prepare_project_import',
        arguments: { ...base, milestones: [...base.milestones].reverse(), workItems: [...base.workItems].reverse() },
      })
      expect(first.isError, JSON.stringify(first.structuredContent)).not.toBe(true)
      expect(reordered.isError, JSON.stringify(reordered.structuredContent)).not.toBe(true)
      const prepared = (first.structuredContent as { data: { contentHash: string; plan: { milestones: { sourceId: string }[]; workItems: { sourceId: string }[] }; counts: Record<string, number> } }).data
      expect(prepared.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect((reordered.structuredContent as { data: { contentHash: string } }).data.contentHash).toBe(prepared.contentHash)
      expect(prepared.plan.milestones.map(item => item.sourceId)).toEqual(['m1', 'm2'])
      expect(prepared.plan.workItems.map(item => item.sourceId)).toEqual(['issue-1', 'issue-2'])
      expect(prepared.counts).toEqual({ projects: 1, milestones: 2, workItems: 2, relations: 1 })
      for (const call of Object.values(apiCalls)) expect(call).not.toHaveBeenCalled()
    } finally { await protocol.close(); await server.close() }
  })

  it('resumes apply_project_import after response loss and replays the complete source mapping', async () => {
    const team = { id: teamId, key: 'WM', name: 'WorkMesh', revision: 2 }
    const states = [
      { id: repositoryId, team_id: teamId, name: 'Backlog', category: 'backlog', position: 0 },
      { id: pullRequestId, team_id: teamId, name: 'Ready', category: 'planned', position: 1 },
    ]
    const stored = new Map<string, unknown>()
    const keys: string[] = []
    let loseSecondWorkItemResponse = true
    const replay = async <T>(key: string, value: T, loseResponse = false): Promise<T> => {
      keys.push(key)
      if (stored.has(key)) return stored.get(key) as T
      stored.set(key, value)
      if (loseResponse) throw new WorkMeshSdkError('response lost after commit', { code: 'NETWORK_ERROR' })
      return value
    }
    const createProject = vi.fn(async (_input: { name: string }, options: { idempotencyKey: string }) =>
      replay(options.idempotencyKey, { id: projectId, revision: 1 }))
    const createMilestone = vi.fn(async (_projectId: string, input: { name: string }, options: { idempotencyKey: string }) =>
      replay(options.idempotencyKey, { id: repositoryId, project_id: projectId, name: input.name, revision: 1 }))
    let workItemNumber = 0
    const createWorkItem = vi.fn(async (input: { title: string }, options: { idempotencyKey: string }) => {
      const existing = stored.get(options.idempotencyKey)
      const number = existing ? (existing as { number: number }).number : ++workItemNumber
      const result = { id: number === 1 ? workItemId : artifactId, number, revision: 1 }
      const lose = input.title === 'Child delivery' && loseSecondWorkItemResponse
      loseSecondWorkItemResponse = lose ? false : loseSecondWorkItemResponse
      return replay(options.idempotencyKey, result, lose)
    })
    const createWorkItemRelation = vi.fn(async (_workItemId: string, input: { targetWorkItemId: string; kind: string }, options: { idempotencyKey: string }) =>
      replay(options.idempotencyKey, { id: sessionId, source_work_item_id: workItemId, target_work_item_id: input.targetWorkItemId, kind: input.kind, revision: 1 }))
    const api = {
      listTeams: vi.fn().mockResolvedValue({ items: [team], nextCursor: null }),
      listWorkflowStates: vi.fn().mockResolvedValue({ items: states, nextCursor: null }),
      createProject,
      createMilestone,
      createWorkItem,
      createWorkItemRelation,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    const source = {
      teamRef: 'WM',
      defaultStatus: 'Ready',
      project: { sourceId: 'project', name: 'Kaneo UI Adoption' },
      milestones: [{ sourceId: 'm1', name: 'Foundation' }],
      workItems: [
        { sourceId: 'issue-1', title: 'Parent delivery', status: 'Backlog', milestoneSourceId: 'm1' },
        { sourceId: 'issue-2', title: 'Child delivery', parentSourceId: 'issue-1', milestoneSourceId: 'm1', labels: ['roadmap:post-ga'] },
      ],
      relations: [{ sourceId: 'r1', sourceWorkItemId: 'issue-1', targetWorkItemId: 'issue-2', kind: 'blocks' }],
    }
    try {
      const prepared = await protocol.callTool({ name: 'prepare_project_import', arguments: source })
      expect(prepared.isError).not.toBe(true)
      const preparation = (prepared.structuredContent as { data: { contentHash: string; plan: object } }).data
      const first = await protocol.callTool({ name: 'apply_project_import', arguments: preparation })
      expect(first.isError).toBe(true)
      expect(first.structuredContent).toMatchObject({ error: { code: 'NETWORK_ERROR' } })

      const resumed = await protocol.callTool({ name: 'apply_project_import', arguments: preparation })
      const replayed = await protocol.callTool({ name: 'apply_project_import', arguments: preparation })
      expect(resumed.isError, JSON.stringify(resumed.structuredContent)).not.toBe(true)
      expect(replayed.isError, JSON.stringify(replayed.structuredContent)).not.toBe(true)
      expect(replayed.structuredContent).toEqual(resumed.structuredContent)
      expect(resumed.structuredContent).toMatchObject({
        data: {
          contentHash: preparation.contentHash,
          complete: true,
          persistedBy: 'api_idempotency_keys',
          mapping: {
            project: { sourceId: 'project', targetId: projectId },
            milestones: [{ sourceId: 'm1', targetId: repositoryId }],
            workItems: [
              { sourceId: 'issue-1', targetId: workItemId, targetRef: 'WM-1' },
              { sourceId: 'issue-2', targetId: artifactId, targetRef: 'WM-2' },
            ],
            relations: [{ sourceId: 'r1', targetId: sessionId }],
          },
        },
      })
      expect(new Set(keys).size).toBe(5)
      expect(createProject).toHaveBeenCalledTimes(3)
      expect(createMilestone).toHaveBeenCalledTimes(3)
      expect(createWorkItem).toHaveBeenCalledTimes(6)
      expect(createWorkItemRelation).toHaveBeenCalledTimes(2)
    } finally { await protocol.close(); await server.close() }
  })

  it('returns actionable revision conflicts with correlation and current revision', async () => {
    const updateProject = vi.fn().mockRejectedValue(new WorkMeshSdkError(
      'Resource has changed',
      {
        code: 'REVISION_CONFLICT',
        status: 409,
        correlationId: 'correlation-revision',
        details: { expectedRevision: 2, currentRevision: 5 },
      },
    ))
    const api = {
      updateProject,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const result = await protocol.callTool({
        name: 'update_project',
        arguments: { projectId, revision: 2, name: 'Rebased name' },
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toEqual({
        error: {
          code: 'REVISION_CONFLICT',
          message: 'Resource has changed',
          correlationId: 'correlation-revision',
          details: { expectedRevision: 2, currentRevision: 5 },
          currentRevision: 5,
          safeNextAction: 'Refetch the resource, reapply the intended change to revision 5, and retry once with that revision.',
        },
      })
    } finally { await protocol.close(); await server.close() }
  })

  it('publishes stable schemas for bootstrap, resolution, prepare, and apply', async () => {
    const api = { listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const tools = Object.fromEntries((await protocol.listTools()).tools.map(entry => [entry.name, entry]))
      expect(Object.keys(tools).filter(name => ['get_workmesh_context', 'resolve_identifier', 'prepare_project_import', 'apply_project_import'].includes(name)).sort()).toEqual([
        'apply_project_import',
        'get_workmesh_context',
        'prepare_project_import',
        'resolve_identifier',
      ])
      expect(tools.get_workmesh_context?.inputSchema).toMatchObject({ type: 'object', properties: {} })
      expect(tools.resolve_identifier?.inputSchema).toMatchObject({
        type: 'object',
        required: ['kind', 'ref'],
        properties: { kind: { type: 'string' }, ref: { type: 'string' }, teamRef: { type: 'string' }, projectRef: { type: 'string' } },
      })
      expect(tools.prepare_project_import?.inputSchema).toMatchObject({
        type: 'object',
        required: ['teamRef', 'defaultStatus', 'project'],
        properties: { milestones: { type: 'array' }, workItems: { type: 'array' }, relations: { type: 'array' } },
      })
      expect(tools.apply_project_import?.inputSchema).toMatchObject({
        type: 'object',
        required: ['contentHash', 'plan'],
        properties: { contentHash: { type: 'string' }, plan: { type: 'object' } },
      })
    } finally { await protocol.close(); await server.close() }
  })

  it('returns a generated correlation ID and safe repair action for local import validation errors', async () => {
    const api = { listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api, true)
    try {
      const result = await protocol.callTool({
        name: 'prepare_project_import',
        arguments: {
          teamRef: 'WM',
          defaultStatus: 'Ready',
          project: { sourceId: 'project', name: 'Broken import' },
          workItems: [{ sourceId: 'issue-1', title: 'Orphan', milestoneSourceId: 'missing' }],
        },
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent, JSON.stringify(result)).toMatchObject({
        error: {
          code: 'IMPORT_REFERENCE_INVALID',
          details: { sourceId: 'issue-1', milestoneSourceId: 'missing' },
          safeNextAction: 'Correct the source plan, run prepare_project_import again, and apply only the newly returned hash and plan.',
        },
      })
      expect((result.structuredContent as { error: { correlationId: string } }).error.correlationId).toMatch(/^mcp:[0-9a-f-]{36}$/)
    } finally { await protocol.close(); await server.close() }
  })

  it('normalizes pre-handler schema failures into the structured WorkMesh error envelope', async () => {
    const api = { listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api, true)
    try {
      const result = await protocol.callTool({
        name: 'prepare_project_import',
        arguments: {
          defaultStatus: 'Ready',
          project: { sourceId: 'project', name: 42 },
        },
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent, JSON.stringify(result)).toMatchObject({
        error: {
          code: 'MCP_INPUT_INVALID',
          message: 'MCP tool input failed validation',
          safeNextAction: 'Correct the arguments against the published MCP tool schema, then retry the call.',
        },
      })
      expect((result.structuredContent as { error: { correlationId: string; details: { issues: unknown[] } } }).error.correlationId).toMatch(/^mcp:[0-9a-f-]{36}$/)
      expect((result.structuredContent as { error: { details: { issues: unknown[] } } }).error.details.issues.length).toBeGreaterThan(0)
    } finally { await protocol.close(); await server.close() }
  })

  it('fails verify_connection when the Team live authorization probe is unavailable', async () => {
    const manifest = {
      agent: {
        actorId: artifactId,
        sessionId,
        effectiveCapabilities: ['work:read'],
        capabilityScope: { teamIds: [teamId] },
      },
    }
    const getAgentCapabilities = vi.fn().mockResolvedValue(manifest)
    const listTeams = vi.fn().mockRejectedValue(new WorkMeshSdkError(
      'Team discovery is unavailable',
      {
        code: 'LIVE_PROBE_UNAVAILABLE',
        status: 503,
        correlationId: 'correlation-live-probe',
      },
    ))
    const api = {
      getAgentCapabilities,
      getCurrentAgentConnectionIdentity: vi.fn().mockResolvedValue(
        currentConnectionIdentity(['work:read']),
      ),
      listTeams,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const result = await protocol.callTool({ name: 'verify_connection', arguments: {} })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toEqual({
        error: {
          code: 'LIVE_PROBE_UNAVAILABLE',
          message: 'Team discovery is unavailable',
          correlationId: 'correlation-live-probe',
          details: undefined,
          safeNextAction: 'Inspect the correlation ID, resolve the reported cause, and retry only when the operation remains safe and idempotent.',
        },
      })
      expect(getAgentCapabilities).toHaveBeenCalledOnce()
      expect(listTeams).toHaveBeenCalledWith({ limit: 1 })
    } finally { await protocol.close(); await server.close() }
  })

  it('binds every MCP resource and tool to a REST operation policy', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')
    const registrations = [...source.matchAll(/register(Resource|Tool)\('([^']+)'/g)]
      .map(match => `${match[1]?.toLowerCase()}:${match[2]}`)
      .sort()
    expect(Object.keys(mcpPolicyBindings).sort()).toEqual(registrations)
    for (const binding of Object.values(mcpPolicyBindings)) {
      expect(binding.policyId).toBe(`route.${binding.operationId}`)
    }
  })

  it('omits mutation tools in read-only mode', async () => {
    const api = { listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const names = (await protocol.listTools()).tools.map(tool => tool.name)
      expect(names).toContain('list_work_items')
      expect(names).toContain('list_session_activities')
      expect(names).toContain('get_work_item')
      expect(names).toContain('list_inbox_items')
      expect(names).toContain('get_inbox_item')
      expect(names).toContain('list_human_attention')
      expect(names).toContain('get_human_attention')
      expect(names).not.toContain('send_message')
      expect(names).not.toContain('ack_agent_session')
      expect(names).not.toContain('claim_inbox_item')
      const resources = (await protocol.listResources()).resources.map(item => item.name)
      expect(resources).toContain('agent-capabilities')
    } finally { await protocol.close(); await server.close() }
  })

  it('forwards Human Attention filters through the read-only MCP surface', async () => {
    const listHumanAttention = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
    const getHumanAttention = vi.fn().mockResolvedValue({ id: 'v1:decision:decision-1' })
    const api = {
      listHumanAttention,
      getHumanAttention,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      await protocol.callTool({
        name: 'list_human_attention',
        arguments: { kind: 'decision', status: 'open', projectId, cursor: 'opaque', limit: 17 },
      })
      await protocol.callTool({
        name: 'get_human_attention',
        arguments: { attentionId: 'v1:decision:decision-1' },
      })
      expect(listHumanAttention).toHaveBeenCalledWith(
        { kind: 'decision', status: 'open', projectId },
        { cursor: 'opaque', limit: 17 },
      )
      expect(getHumanAttention).toHaveBeenCalledWith('v1:decision:decision-1')
    } finally { await protocol.close(); await server.close() }
  })

  it('reads the exact Session revision and transitions to executing through MCP', async () => {
    const session = { id: sessionId, state: 'acknowledged', revision: 8 }
    const getSession = vi.fn().mockResolvedValue(session)
    const transitionState = vi.fn().mockResolvedValue({ ...session, state: 'executing', revision: 9 })
    const api = { getSession, transitionState, listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    try {
      const resourceResult = await protocol.readResource({ uri: `workmesh://session/${sessionId}` })
      expect(resourceResult.contents[0]).toMatchObject({ text: JSON.stringify(session) })
      expect(getSession).toHaveBeenCalledWith(sessionId)
      const toolResult = await protocol.callTool({
        name: 'transition_agent_session_state',
        arguments: { sessionId, state: 'executing', reason: 'Run conformance.', revision: 8, idempotencyKey: 'state-key' },
      })
      expect(toolResult.isError).not.toBe(true)
      expect(transitionState).toHaveBeenCalledWith(sessionId, 'executing', 'Run conformance.', { ifMatch: 8, idempotencyKey: 'state-key' })
    } finally { await protocol.close(); await server.close() }
  })

  it('preserves the shared Work Item executor projection through MCP', async () => {
    const projected = {
      id: workItemId,
      responsible_human: { actor_id: 'human-1', display_name: 'Alex' },
      active_executor: {
        agent_id: 'agent-1',
        session_id: sessionId,
        lease_id: 'lease-1',
        execution_state: 'executing',
      },
      shared_reviewers: [{ agent_id: 'agent-2', session_id: 'session-2', lease_id: 'lease-2' }],
    }
    const getWorkItem = vi.fn().mockResolvedValue(projected)
    const api = { listWorkItems: vi.fn(), getWorkItem } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const result = await protocol.callTool({
        name: 'get_work_item',
        arguments: { workItemId },
      })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toEqual({ data: projected })
      expect(getWorkItem).toHaveBeenCalledWith(workItemId)
    } finally { await protocol.close(); await server.close() }
  })

  it('exposes versioned Guidance as a read-only MCP resource', async () => {
    const guidance = {
      scope: 'workspace', scopeId: workspaceId, documentId: '00000000-0000-4000-8000-000000000008',
      status: 'active', revision: 3, markdown: '# Workspace guidance', updatedAt: '2026-08-03T00:00:00.000Z',
      currentRevision: {
        id: '00000000-0000-4000-8000-000000000009', revisionNumber: 2,
        contentHash: `sha256:${'a'.repeat(64)}`, changeSummary: 'Clarify evidence',
        authorActorId: '00000000-0000-4000-8000-000000000010', authorDisplayName: 'Admin',
        publishedAt: '2026-08-03T00:00:00.000Z',
      },
    }
    const getGuidance = vi.fn().mockResolvedValue(guidance)
    const api = { getGuidance, listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const result = await protocol.readResource({ uri: `workmesh://workspace/${workspaceId}/guidance` })
      expect(getGuidance).toHaveBeenCalledWith('workspace', workspaceId)
      expect(result.contents[0]).toEqual(expect.objectContaining({
        uri: `workmesh://workspace/${workspaceId}/guidance`,
        mimeType: 'application/json',
        text: JSON.stringify(guidance),
      }))
      expect((await protocol.listTools()).tools.map(tool => tool.name).filter(name => name.includes('guidance'))).toEqual([])
    } finally { await protocol.close(); await server.close() }
  })

  it('exposes Inbox mutations only in read-write mode and routes them through the SDK', async () => {
    const claimInboxItem = vi.fn().mockResolvedValue({ id: artifactId, status: 'claimed' })
    const acknowledgeInboxItem = vi.fn().mockResolvedValue({ id: artifactId, status: 'acknowledged' })
    const replyInboxItem = vi.fn().mockResolvedValue({ id: 'reply-1' })
    const api = {
      claimInboxItem,
      acknowledgeInboxItem,
      replyInboxItem,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    try {
      const names = (await protocol.listTools()).tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining([
        'claim_inbox_item',
        'acknowledge_inbox_item',
        'reply_inbox_item',
      ]))
      await protocol.callTool({
        name: 'claim_inbox_item',
        arguments: { inboxItemId: artifactId, idempotencyKey: 'claim-key' },
      })
      await protocol.callTool({
        name: 'acknowledge_inbox_item',
        arguments: { inboxItemId: artifactId, idempotencyKey: 'ack-key' },
      })
      await protocol.callTool({
        name: 'reply_inbox_item',
        arguments: {
          inboxItemId: artifactId,
          body: 'Handled with evidence.',
          revision: 4,
          idempotencyKey: 'reply-key',
        },
      })
      expect(claimInboxItem).toHaveBeenCalledWith(artifactId, { idempotencyKey: 'claim-key' })
      expect(acknowledgeInboxItem).toHaveBeenCalledWith(artifactId, { idempotencyKey: 'ack-key' })
      expect(replyInboxItem).toHaveBeenCalledWith(
        artifactId,
        { body: 'Handled with evidence.', payload: undefined },
        { ifMatch: 4, idempotencyKey: 'reply-key' },
      )
    } finally { await protocol.close(); await server.close() }
  })

  it('routes an MCP message tool call to the upstream SDK', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ id: sessionId, revision: 2 })
    const api = { sendMessage, listWorkItems: vi.fn(), getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    try {
      const result = await protocol.callTool({ name: 'send_message', arguments: { sessionId, bodyMarkdown: 'Please verify the test evidence.' } })
      expect(result.isError).not.toBe(true)
      expect(sendMessage).toHaveBeenCalledWith(sessionId, 'Please verify the test evidence.', { idempotencyKey: undefined })
    } finally { await protocol.close(); await server.close() }
  })

  it('preserves upstream authorization denial code and correlation ID', async () => {
    const listWorkItems = vi.fn().mockRejectedValue(new WorkMeshSdkError(
      'scope denied',
      {
        code: 'RESOURCE_SCOPE_DENIED',
        status: 403,
        correlationId: 'correlation-denial',
      },
    ))
    const api = { listWorkItems, getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const result = await protocol.callTool({
        name: 'list_work_items',
        arguments: {},
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toEqual({
        error: {
          code: 'RESOURCE_SCOPE_DENIED',
          message: 'scope denied',
          correlationId: 'correlation-denial',
          details: undefined,
          safeNextAction: 'Do not retry the out-of-scope resource; use get_workmesh_context to select a resource inside the bound Team.',
        },
      })
    } finally { await protocol.close(); await server.close() }
  })

  it('forwards MCP cursor and limit through the SDK page helper', async () => {
    const listWorkItems = vi.fn().mockResolvedValue({ items: [{ id: 'work-1' }], nextCursor: 'next' })
    const api = { listWorkItems, getWorkItem: vi.fn() } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const result = await protocol.callTool({
        name: 'list_work_items',
        arguments: { teamId: '00000000-0000-4000-8000-000000000001', search: 'human experience', cursor: 'opaque', limit: 17 },
      })
      expect(result.isError).not.toBe(true)
      expect(listWorkItems).toHaveBeenCalledWith(
        { teamId: '00000000-0000-4000-8000-000000000001', search: 'human experience' },
        { cursor: 'opaque', limit: 17 },
      )
      expect(result.structuredContent).toEqual({ data: { items: [{ id: 'work-1' }], nextCursor: 'next' } })
    } finally { await protocol.close(); await server.close() }
  })

  it('uses the shared PostgreSQL bigint cursor boundary', async () => {
    const listEvents = vi.fn().mockResolvedValue({
      items: [],
      nextCursor: '9223372036854775807',
    })
    const api = {
      listEvents,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const accepted = await protocol.callTool({
        name: 'list_events',
        arguments: { cursor: '9223372036854775807' },
      })
      expect(accepted.isError).not.toBe(true)
      expect(listEvents).toHaveBeenCalledWith({
        cursor: '9223372036854775807',
        limit: undefined,
      })

      const rejected = await protocol.callTool({
        name: 'list_events',
        arguments: { cursor: '9223372036854775808' },
      })
      expect(rejected.isError).toBe(true)
      expect(rejected.content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining(
            'Cursor exceeds the PostgreSQL bigint range',
          ),
        }),
      ]))
      expect(listEvents).toHaveBeenCalledTimes(1)
    } finally { await protocol.close(); await server.close() }
  })

  it('continues session activities with the opaque cursor returned by page one', async () => {
    const getActivities = vi.fn()
      .mockResolvedValueOnce({
        items: [{ id: 'activity-1' }],
        nextCursor: 'opaque.activity.cursor',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'activity-2' }],
        nextCursor: null,
      })
    const api = {
      getActivities,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-only', api)
    try {
      const first = await protocol.callTool({
        name: 'list_session_activities',
        arguments: { sessionId, limit: 1 },
      })
      expect(first.isError).not.toBe(true)
      expect(first.structuredContent).toEqual({
        data: {
          items: [{ id: 'activity-1' }],
          nextCursor: 'opaque.activity.cursor',
        },
      })

      const cursor = (first.structuredContent as {
        data: { nextCursor: string }
      }).data.nextCursor
      const second = await protocol.callTool({
        name: 'list_session_activities',
        arguments: { sessionId, cursor, limit: 1 },
      })
      expect(second.isError).not.toBe(true)
      expect(second.structuredContent).toEqual({
        data: {
          items: [{ id: 'activity-2' }],
          nextCursor: null,
        },
      })
      expect(getActivities).toHaveBeenNthCalledWith(1, sessionId, {
        cursor: undefined,
        limit: 1,
      })
      expect(getActivities).toHaveBeenNthCalledWith(2, sessionId, {
        cursor: 'opaque.activity.cursor',
        limit: 1,
      })
    } finally { await protocol.close(); await server.close() }
  })

  it('uses direct exact-head code_review evidence and keeps signed uploads file-only', async () => {
    const publishDeliveryArtifact = vi.fn().mockResolvedValue({ id: artifactId })
    const publishStructuredReview = vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000007' })
    const api = {
      publishDeliveryArtifact,
      publishStructuredReview,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    const headSha = 'reviewed-head'
    const checksum = `sha256:${'a'.repeat(64)}`
    try {
      const tools = (await protocol.listTools()).tools
      expect(tools.map(item => item.name)).toEqual(expect.arrayContaining([
        'publish_delivery_artifact',
        'request_artifact_upload',
        'finalize_artifact_upload',
        'publish_structured_review',
      ]))
      const byName = (name: string) => tools.find(item => item.name === name)!
      expect(byName('publish_delivery_artifact').description).toContain(
        'official structured-review path publishes type code_review here',
      )
      expect(byName('request_artifact_upload').description).toContain(
        'artifact type file, which cannot satisfy publish_structured_review',
      )
      expect(byName('finalize_artifact_upload').description).toContain(
        'type file artifact is not structured-review authority',
      )
      expect(byName('publish_structured_review').description).toContain(
        'artifactId must come from publish_delivery_artifact with type code_review',
      )
      const reviewArtifactSchema = byName('publish_structured_review').inputSchema
        .properties?.artifactId as { description?: string } | undefined
      expect(reviewArtifactSchema?.description).toContain(
        'request/finalize_artifact_upload produces ineligible file evidence',
      )
      const artifact = await protocol.callTool({
        name: 'publish_delivery_artifact',
        arguments: {
          repositoryId,
          pullRequestId,
          headSha,
          workItemId,
          sessionId,
          projectId,
          type: 'code_review',
          title: 'MCP exact-head review evidence',
          checksum,
          sourceTool: 'workmesh-mcp-reviewer',
          result: 'passed',
        },
      })
      expect(artifact.isError).not.toBe(true)
      expect(publishDeliveryArtifact).toHaveBeenCalledWith({
        repositoryId,
        pullRequestId,
        headSha,
        workItemId,
        sessionId,
        projectId,
        planStepId: undefined,
        type: 'code_review',
        title: 'MCP exact-head review evidence',
        uri: undefined,
        checksum,
        sourceTool: 'workmesh-mcp-reviewer',
        command: undefined,
        result: 'passed',
        metadata: {},
      }, { idempotencyKey: undefined })
      const review = await protocol.callTool({
        name: 'publish_structured_review',
        arguments: {
          pullRequestId,
          sessionId,
          artifactId,
          headSha,
          verdict: 'approved',
          summary: 'MCP evidence satisfies the exact-head precondition.',
          findings: [],
        },
      })
      expect(review.isError).not.toBe(true)
      expect(publishStructuredReview).toHaveBeenCalledWith(pullRequestId, {
        sessionId,
        artifactId,
        headSha,
        verdict: 'approved',
        summary: 'MCP evidence satisfies the exact-head precondition.',
        findings: [],
        evidence: [],
        metadata: {},
      }, { idempotencyKey: undefined })
    } finally { await protocol.close(); await server.close() }
  })

  it('exposes exact approved CI retry and agent draft-only project updates', async () => {
    const retryCiCheck = vi.fn().mockResolvedValue({ id: 'retry-action' })
    const draftProjectUpdate = vi.fn().mockResolvedValue({ id: 'update', status: 'draft' })
    const api = {
      retryCiCheck,
      draftProjectUpdate,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api)
    try {
      const tools = (await protocol.listTools()).tools
      expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
        'retry_ci_check',
        'draft_project_update',
      ]))
      await protocol.callTool({
        name: 'retry_ci_check',
        arguments: {
          pullRequestId,
          checkRunId: 'check-42',
          sessionId,
          approvalId: artifactId,
          actionPayloadHash: `sha256:${'a'.repeat(64)}`,
          headSha: 'head',
        },
      })
      await protocol.callTool({
        name: 'draft_project_update',
        arguments: {
          projectId,
          sessionId,
          health: 'at_risk',
          body: 'CI is still failing.',
        },
      })
      expect(retryCiCheck).toHaveBeenCalledWith(pullRequestId, 'check-42', {
        sessionId,
        approvalId: artifactId,
        actionPayloadHash: `sha256:${'a'.repeat(64)}`,
        headSha: 'head',
      }, { idempotencyKey: undefined })
      expect(draftProjectUpdate).toHaveBeenCalledWith(projectId, {
        health: 'at_risk',
        body: 'CI is still failing.',
        evidenceArtifactIds: undefined,
      }, { sessionId, idempotencyKey: undefined })
    } finally { await protocol.close(); await server.close() }
  })

  it('returns a bounded secret-safe bootstrap receipt after live Connection verification', async () => {
    const manifest = {
      profileVersion: '1.0',
      agent: {
        actorId: artifactId,
        sessionId,
        effectiveCapabilities: ['work:read'],
        capabilityScope: { teamIds: [teamId] },
      },
      credential: 'installation-secret-must-not-escape',
    }
    const api = {
      getAgentCapabilities: vi.fn().mockResolvedValue(manifest),
      getCurrentAgentConnectionIdentity: vi.fn().mockResolvedValue(
        currentConnectionIdentity(['work:read']),
      ),
      listTeams: vi.fn().mockResolvedValue({ items: [{ id: teamId }], nextCursor: null }),
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const result = await protocol.callTool({ name: 'verify_connection', arguments: {} })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        data: {
          liveProbe: { teamId, teamDiscovery: 'ok' },
          bootstrap: {
            verified: true,
            transport: 'streamable_http',
            profileVersion: '1.0',
            identityBoundary: 'Installation identity is not an Agent Session or Delegation.',
            requiredNextTools: ['get_workmesh_context'],
            authorityEvaluatedPerRequest: true,
          },
        },
      })
      const bootstrap = (result.structuredContent as { data: { bootstrap: unknown } }).data.bootstrap
      expect(JSON.stringify(bootstrap)).not.toContain('installation-secret-must-not-escape')
    } finally { await protocol.close(); await server.close() }
  })

  it('exposes structured Milestone, hierarchy, and relation operations to coordination clients', async () => {
    const milestoneId = '00000000-0000-4000-8000-000000000008'
    const relationId = '00000000-0000-4000-8000-000000000009'
    const listProjectMilestones = vi.fn().mockResolvedValue({ items: [], nextCursor: null })
    const createMilestone = vi.fn().mockResolvedValue({ id: milestoneId, revision: 1 })
    const updateMilestone = vi.fn().mockResolvedValue({ id: milestoneId, revision: 2 })
    const createWorkItemRelation = vi.fn().mockResolvedValue({ id: relationId, revision: 1 })
    const deleteWorkItemRelation = vi.fn().mockResolvedValue({ id: relationId, revision: 2 })
    const api = {
      listProjectMilestones,
      createMilestone,
      updateMilestone,
      createWorkItemRelation,
      deleteWorkItemRelation,
      listWorkItems: vi.fn(),
      getWorkItem: vi.fn(),
    } as unknown as WorkMeshClient
    const { server, protocol } = await connected('read-write', api, true)
    try {
      const names = (await protocol.listTools()).tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining([
        'list_project_milestones',
        'create_milestone',
        'update_milestone',
        'add_work_item_relation',
        'remove_work_item_relation',
      ]))
      await protocol.callTool({ name: 'list_project_milestones', arguments: { projectId, limit: 25 } })
      await protocol.callTool({ name: 'create_milestone', arguments: { projectId, name: 'MCP parity', idempotencyKey: 'milestone-create' } })
      await protocol.callTool({ name: 'update_milestone', arguments: { milestoneId, revision: 1, targetDate: '2026-09-01', idempotencyKey: 'milestone-update' } })
      await protocol.callTool({ name: 'add_work_item_relation', arguments: { workItemId, targetWorkItemId: artifactId, kind: 'blocks', idempotencyKey: 'relation-add' } })
      await protocol.callTool({ name: 'remove_work_item_relation', arguments: { workItemId, relationId, revision: 1, idempotencyKey: 'relation-remove' } })

      expect(listProjectMilestones).toHaveBeenCalledWith(projectId, { cursor: undefined, limit: 25 })
      expect(createMilestone).toHaveBeenCalledWith(projectId, { name: 'MCP parity', description: undefined, targetDate: undefined }, { idempotencyKey: 'milestone-create' })
      expect(updateMilestone).toHaveBeenCalledWith(milestoneId, { name: undefined, description: undefined, targetDate: '2026-09-01' }, { ifMatch: 1, idempotencyKey: 'milestone-update' })
      expect(createWorkItemRelation).toHaveBeenCalledWith(workItemId, { targetWorkItemId: artifactId, kind: 'blocks' }, { idempotencyKey: 'relation-add' })
      expect(deleteWorkItemRelation).toHaveBeenCalledWith(workItemId, relationId, { ifMatch: 1, idempotencyKey: 'relation-remove' })
    } finally { await protocol.close(); await server.close() }
  })
})
