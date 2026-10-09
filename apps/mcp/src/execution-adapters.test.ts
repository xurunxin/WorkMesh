import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it, vi } from 'vitest'
import { capabilitySchema, featureKeySchema, createAgentCapabilityManifest, qualifyAgentCapabilityManifest, type Capability } from '@workmesh/contracts'
import type { WorkMeshClient } from '@workmesh/agent-sdk'
import { createWorkMeshMcpServer } from './index.js'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const recoveryId = `v1:session_failed:${id}`
const qualified = (capabilities: Capability[] = [...capabilitySchema.options]) => {
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, false])) as Record<typeof featureKeySchema.options[number], boolean>
  const manifest = createAgentCapabilityManifest({ actorId: id, sessionId: id, sessionState: 'executing', sessionRevision: 4,
    effectiveCapabilities: capabilities, capabilityScope: { workspaceId: id, teamIds: [id], workItemIds: [id], projectIds: [], repositoryIds: [], capabilities },
    features, supportedProtocols: ['mcp'], pushConfigured: false })
  return qualifyAgentCapabilityManifest(manifest, { identity: { actorId: id, sessionId: id, credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'work_item' }, features, workItemId: id, projectId: null })
}
async function connect(mode: 'read-only' | 'read-write', capabilities: Capability[] = [...capabilitySchema.options]) {
  const api = { getQualifiedAgentCapabilities: vi.fn().mockResolvedValue(qualified(capabilities)),
    discoveryCredentialConfiguration: { session: true, coordination: false, installationBridge: false },
    listSessions: vi.fn().mockResolvedValue({ items: [], nextCursor: 'signed-cursor' }),
    listPlanVersions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listApprovals: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), getApproval: vi.fn().mockResolvedValue({ id }),
    listLeases: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listRecoveryItems: vi.fn().mockResolvedValue({ items: [], nextCursor: null }), getRecoveryItem: vi.fn().mockResolvedValue({ id: recoveryId }),
    heartbeatLease: vi.fn().mockResolvedValue({ id, version: 4, revision: 4 }), renewLease: vi.fn().mockResolvedValue({ id, version: 5, revision: 5 }), releaseLease: vi.fn().mockResolvedValue({ id, version: 5, revision: 5 }),
    consumeApproval: vi.fn().mockResolvedValue({ id }) }
  const server = createWorkMeshMcpServer({ client: api as unknown as WorkMeshClient, mode })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'execution-adapters-client', version: '1.0.0' })
  await client.connect(b)
  return { api, client, close: async () => { await client.close(); await server.close() } }
}

describe('M1 MCP execution and lease adapters', () => {
  it('advertises actual named reads and forwards opaque cursors without exposing Human controls', async () => {
    const mcp = await connect('read-only')
    try {
      const names = (await mcp.client.listTools()).tools.map(tool => tool.name)
      expect(names).toEqual(expect.arrayContaining(['list_agent_sessions', 'list_session_plan_versions', 'list_approvals', 'get_approval', 'list_leases', 'list_recovery_items', 'get_recovery_item']))
      for (const forbidden of ['renew_lease', 'release_lease', 'heartbeat_lease', 'stop_ack', 'decide_approval', 'force_release_lease', 'pause_session', 'resume_session']) expect(names).not.toContain(forbidden)
      await mcp.client.callTool({ name: 'list_agent_sessions', arguments: { state: 'executing', cursor: 'signed+/cursor', limit: 2 } })
      expect(mcp.api.listSessions).toHaveBeenCalledWith({ state: 'executing' }, { cursor: 'signed+/cursor', limit: 2 })
      await mcp.client.callTool({ name: 'list_session_plan_versions', arguments: { sessionId: id, cursor: 'plan-cursor', limit: 2 } })
      expect(mcp.api.listPlanVersions).toHaveBeenCalledWith(id, { cursor: 'plan-cursor', limit: 2 })
      await mcp.client.callTool({ name: 'get_recovery_item', arguments: { recoveryId } })
      expect(mcp.api.getRecoveryItem).toHaveBeenCalledWith(recoveryId)
      expect(await mcp.client.callTool({ name: 'list_session_plan_versions', arguments: { sessionId: other } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_BINDING_MISMATCH' } } })
      expect(mcp.api.listPlanVersions).toHaveBeenCalledTimes(1)
    } finally { await mcp.close() }
  })
  it('Lease maintenance uses lease version and original operation key; readonly cached calls cannot write', async () => {
    const mcp = await connect('read-write')
    try {
      expect((await mcp.client.callTool({ name: 'heartbeat_lease', arguments: { leaseId: id, sessionId: id, idempotencyKey: 'lease-heartbeat' } })).isError).not.toBe(true)
      expect(mcp.api.heartbeatLease).toHaveBeenCalledWith(id, { sessionId: id, idempotencyKey: 'lease-heartbeat' })
      expect((await mcp.client.callTool({ name: 'renew_lease', arguments: { leaseId: id, sessionId: id, version: 4, ttlSeconds: 300, idempotencyKey: 'lease-renew' } })).isError).not.toBe(true)
      expect(mcp.api.renewLease).toHaveBeenCalledWith(id, { ttlSeconds: 300, reason: undefined }, { sessionId: id, ifMatch: 4, idempotencyKey: 'lease-renew' })
      expect(await mcp.client.callTool({ name: 'renew_lease', arguments: { leaseId: id, sessionId: other, version: 4, ttlSeconds: 300 } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_BINDING_MISMATCH' } } })
      expect(mcp.api.renewLease).toHaveBeenCalledTimes(1)
    } finally { await mcp.close() }
    const readonly = await connect('read-only')
    try {
      expect(await readonly.client.callTool({ name: 'release_lease', arguments: { leaseId: id, version: 4 } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
      expect(readonly.api.releaseLease).not.toHaveBeenCalled()
    } finally { await readonly.close() }
  })
  it('retains sha256 prefix for approval consumption and rejects bare hex before the SDK', async () => {
    const mcp = await connect('read-write')
    const hash = `sha256:${'a'.repeat(64)}`
    try {
      expect((await mcp.client.callTool({ name: 'consume_approval', arguments: { approvalId: id, sessionId: id, revision: 4, actionPayloadHash: hash, idempotencyKey: 'consume-original' } })).isError).not.toBe(true)
      expect(mcp.api.consumeApproval).toHaveBeenCalledWith(id, { actionPayloadHash: hash }, { sessionId: id, ifMatch: 4, idempotencyKey: 'consume-original' })
      expect(await mcp.client.callTool({ name: 'consume_approval', arguments: { approvalId: id, sessionId: id, revision: 4, actionPayloadHash: 'a'.repeat(64) } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'MCP_INPUT_INVALID' } } })
      expect(mcp.api.consumeApproval).toHaveBeenCalledTimes(1)
    } finally { await mcp.close() }
  })
  it('missing live capability is a refusal before Lease SDK invocation', async () => {
    const mcp = await connect('read-write', ['work:read'])
    try {
      expect(await mcp.client.callTool({ name: 'renew_lease', arguments: { leaseId: id, sessionId: id, version: 4 } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
      expect(mcp.api.renewLease).not.toHaveBeenCalled()
    } finally { await mcp.close() }
  })
})
