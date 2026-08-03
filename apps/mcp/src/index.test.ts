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

async function connected(mode: 'read-only' | 'read-write', client: WorkMeshClient) {
  const server = createWorkMeshMcpServer({ client, mode })
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const protocol = new Client({ name: 'mcp-test-client', version: '1.0.0' })
  await protocol.connect(clientTransport)
  return { server, protocol }
}

describe('WorkMesh MCP adapter', () => {
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
      expect(names).not.toContain('send_message')
      expect(names).not.toContain('ack_agent_session')
      expect(names).not.toContain('claim_inbox_item')
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
        arguments: { teamId: '00000000-0000-4000-8000-000000000001', cursor: 'opaque', limit: 17 },
      })
      expect(result.isError).not.toBe(true)
      expect(listWorkItems).toHaveBeenCalledWith(
        { teamId: '00000000-0000-4000-8000-000000000001' },
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
})
