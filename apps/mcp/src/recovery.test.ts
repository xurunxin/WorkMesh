import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { WorkMeshClient, WorkMeshSdkError } from '@workmesh/agent-sdk'
import { createAgentCapabilityManifest, qualifyAgentCapabilityManifest, capabilitySchema, featureKeySchema } from '@workmesh/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createWorkMeshMcpServer } from './index.js'

const id = '11111111-1111-4111-8111-111111111111'
const foreign = '22222222-2222-4222-8222-222222222222'
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
async function connect(api: WorkMeshClient, mode: 'read-only' | 'read-write' = 'read-write') {
  const server = createWorkMeshMcpServer({ client: api, mode })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'recovery-client', version: '1.0.0' })
  await client.connect(b)
  return { client, close: async () => { await client.close(); await server.close() } }
}

describe('MCP 既有恢复与安装用途调用边界', () => {
  it('原 E 在执行时可发现带明确前提的 Stop ACK，stopping 仅列恢复入口且不刷新；readonly/C 不得借此恢复', async () => {
    const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as Record<typeof featureKeySchema.options[number], boolean>
    const manifest = createAgentCapabilityManifest({ actorId: id, sessionId: id, sessionState: 'executing', sessionRevision: 1,
      effectiveCapabilities: capabilitySchema.options, capabilityScope: { workspaceId: id, teamIds: [id], projectIds: [], workItemIds: [id], repositoryIds: [], capabilities: capabilitySchema.options },
      supportedProtocols: ['mcp'], pushConfigured: false, features })
    const qualified = qualifyAgentCapabilityManifest(manifest, { identity: { actorId: id, sessionId: id, credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'work_item' }, features, workItemId: id, projectId: null })
    const fetcher = vi.fn()
    const api = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'original-e', fetch: fetcher })
    const qualify = vi.spyOn(api, 'getQualifiedAgentCapabilities').mockResolvedValue(qualified)
    const mcp = await connect(api)
    try {
      const listed = (await mcp.client.listTools()).tools.find(tool => tool.name === 'stop_ack')
      expect(listed?._meta).toMatchObject({ workmesh: { recoveryOnly: true, eligibility: { status: 'requires_target_check', pendingChecks: ['original_execution_token', 'live_authority', 'session_stopping'] } } })
      qualify.mockRejectedValue(new WorkMeshSdkError('Ordinary manifest unavailable', { code: 'SESSION_NOT_ACTIVE', status: 409 }))
      expect((await mcp.client.listTools()).tools.map(tool => tool.name)).toEqual(['stop_ack'])
      qualify.mockRejectedValue(new WorkMeshSdkError('Revoked', { code: 'SESSION_SCOPE_DENIED', status: 403 }))
      await expect(mcp.client.listTools()).rejects.toThrow('Revoked')
      expect(fetcher).not.toHaveBeenCalled()
    } finally { await mcp.close() }
    for (const [mode, token] of [['read-only', 'original-e'], ['read-write', undefined]] as const) {
      const other = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: token, coordinationToken: token ? undefined : 'c', fetch: fetcher })
      vi.spyOn(other, 'getQualifiedAgentCapabilities').mockResolvedValue(qualified)
      const denied = await connect(other, mode)
      try { expect((await denied.client.listTools()).tools.map(tool => tool.name)).not.toContain('stop_ack') }
      finally { await denied.close() }
    }
  })
  it('stop_ack 使用原 E，停止后没有 manifest/refresh/Activity，撤权拒绝不换身份', async () => {
    let revoked = false
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`http://api.test/api/v1/agent-sessions/${id}/stop-ack`)
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer original-e')
      expect(headers.get('if-match')).toBe('"revision-7"')
      expect(headers.get('idempotency-key')).toBe('stop-key')
      expect(JSON.parse(String(init?.body))).toEqual({ cleanupSummary: 'Owned resources cleared', residualRisks: ['Unknown residue'] })
      return revoked ? response({ error: { code: 'FORBIDDEN', message: 'Revoked', correlationId: 'stop-revoked' } }, 403) : response({ id, state: 'canceled' })
    })
    const api = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'original-e', coordinationToken: 'c', installationToken: 'installation', fetch: fetcher })
    const mcp = await connect(api)
    const args = { sessionId: id, revision: 7, cleanupSummary: 'Owned resources cleared', residualRisks: ['Unknown residue'], idempotencyKey: 'stop-key' }
    try {
      expect((await mcp.client.callTool({ name: 'stop_ack', arguments: args })).isError).not.toBe(true)
      revoked = true
      expect(await mcp.client.callTool({ name: 'stop_ack', arguments: args })).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN', correlationId: 'stop-revoked' } } })
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { await mcp.close() }
    for (const [mode, sessionToken, expectedCode] of [['read-only', 'original-e', 'FORBIDDEN'], ['read-write', undefined, 'AGENT_SESSION_TOKEN_REQUIRED']] as const) {
      const denied = await connect(new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken, coordinationToken: 'c', installationToken: 'installation', fetch: fetcher }), mode)
      try { expect(await denied.client.callTool({ name: 'stop_ack', arguments: args })).toMatchObject({ isError: true, structuredContent: { error: { code: expectedCode } } }) }
      finally { await denied.close() }
    }
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('执行确认直接用安装用途身份，readonly可用，错目标拒绝且没有 manifest 或刷新', async () => {
    const key = 'original/key?&'
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const address = new URL(String(url))
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer exact-installation')
      expect(address.searchParams.get('operationKey')).toBe(key)
      expect(address.pathname.endsWith('/execution-result')).toBe(true)
      expect(new Headers(init?.headers).has('idempotency-key')).toBe(false)
      if (address.pathname.includes(foreign)) return response({ error: { code: 'NOT_FOUND', message: 'Unavailable', correlationId: 'wrong-origin' } }, 404)
      return response({ session: { id, state: 'canceled', revision: 8 },
        action: { kind: 'stop_ack', operationKey: key, confirmation: 'confirmed', unavailableReason: null },
        originalResult: { operationId: 'acknowledgeAgentSessionStop', sessionId: id, revision: 7, state: 'canceled', resultReference: { type: 'agent_session', id, revision: 7 }, eventReference: null },
        cleanup: { cleanupSummary: 'Cleared', residualRisks: [] } })
    })
    const mcp = await connect(new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'must-not-use-e', coordinationToken: 'must-not-use-c', installationToken: 'exact-installation', fetch: fetcher }), 'read-only')
    try {
      const args = { sessionId: id, action: 'stop_ack', operationKey: key }
      expect(await mcp.client.callTool({ name: 'get_session_execution_result', arguments: args })).toMatchObject({ structuredContent: { data: { originalResult: { revision: 7 }, session: { revision: 8 } } } })
      expect(await mcp.client.callTool({ name: 'get_session_execution_result', arguments: { ...args, sessionId: foreign } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'NOT_FOUND', correlationId: 'wrong-origin' } } })
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { await mcp.close() }
  })
  it('直接 E 的 ACK 丢响应后同 key 重放到 REST，新 key 仍拒绝', async () => {
    let committedKey: string | null = null
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(_url)).toContain(`/agent-sessions/${id}/ack`)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer own-session')
      const key = new Headers(init?.headers).get('idempotency-key')!
      if (!committedKey) { committedKey = key; throw new TypeError('Lost committed ACK response') }
      return key === committedKey ? response({ id: 'receipt', state: 'acknowledged' })
        : response({ error: { code: 'SESSION_NOT_ACTIVE', message: 'Only queued or stale sessions can be acknowledged', correlationId: 'new-ack' } }, 409)
    })
    const api = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'own-session', fetch: fetcher, retry: { maxAttempts: 1 } })
    const mcp = await connect(api)
    const args = { sessionId: id, summary: 'ACK', idempotencyKey: 'same-ack-key' }
    try {
      expect((await mcp.client.callTool({ name: 'ack_agent_session', arguments: args })).isError).toBe(true)
      expect((await mcp.client.callTool({ name: 'ack_agent_session', arguments: args })).isError).not.toBe(true)
      expect(await mcp.client.callTool({ name: 'ack_agent_session', arguments: { ...args, idempotencyKey: 'new-ack-key' } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_NOT_ACTIVE' } } })
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally { await mcp.close() }
  })

  it.each(['ack_agent_session', 'heartbeat'])('%s 用原 E Token 到 REST，撤权 403 不刷新重发', async name => {
    let revoked = false
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toContain(`/agent-sessions/${id}/${name === 'heartbeat' ? 'heartbeat' : 'ack'}`)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer own-session')
      return revoked ? response({ error: { code: 'FORBIDDEN', message: 'Revoked', correlationId: 'revoked' } }, 403) : response({ id })
    })
    const api = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'own-session', installationToken: 'configured-installation', fetch: fetcher })
    const mcp = await connect(api)
    const args = { sessionId: id, idempotencyKey: 'recovery-key', ...(name === 'heartbeat' ? { usage: { runtimeSeconds: 1 } } : { summary: 'Recover stale' }) }
    try {
      expect((await mcp.client.callTool({ name, arguments: args })).isError).not.toBe(true)
      revoked = true
      expect(await mcp.client.callTool({ name, arguments: args })).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN', correlationId: 'revoked' } } })
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { await mcp.close() }
  })

  it.each(['inspect_pending_handoff', 'reject_handoff'])('%s 使用安装 Bearer，错目标拒绝且无 manifest/刷新', async name => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer exact-installation')
      expect(String(url)).toContain('/handoffs/')
      return String(url).includes(foreign) ? response({ error: { code: 'NOT_FOUND', message: 'Unavailable target', correlationId: 'target' } }, 404) : response({ id })
    })
    const api = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'must-not-use-session', coordinationToken: 'must-not-use-coordination', installationToken: 'exact-installation', fetch: fetcher })
    const mcp = await connect(api)
    const args = { handoffId: id, ...(name === 'reject_handoff' ? { machineReason: 'manual_reject', idempotencyKey: 'reject-key' } : {}) }
    try {
      expect((await mcp.client.callTool({ name, arguments: args })).isError).not.toBe(true)
      expect(await mcp.client.callTool({ name, arguments: { ...args, handoffId: foreign } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'NOT_FOUND', correlationId: 'target' } } })
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { await mcp.close() }
    const noInstall = new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'own-session', fetch: fetcher })
    const denied = await connect(noInstall)
    try {
      expect(await denied.client.callTool({ name, arguments: args })).toMatchObject({ isError: true, structuredContent: { error: { code: 'INSTALLATION_TOKEN_REQUIRED' } } })
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { await denied.close() }
  })

  it('只读 cached ACK 调用仍在任何 REST 请求前拒绝', async () => {
    const fetcher = vi.fn()
    const mcp = await connect(new WorkMeshClient({ baseUrl: 'http://api.test', sessionToken: 'own-session', fetch: fetcher }), 'read-only')
    try {
      expect(await mcp.client.callTool({ name: 'ack_agent_session', arguments: { sessionId: id, summary: 'ACK', idempotencyKey: 'ack-key' } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
      expect(fetcher).not.toHaveBeenCalled()
    } finally { await mcp.close() }
  })
})
