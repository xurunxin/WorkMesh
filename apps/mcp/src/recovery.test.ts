import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
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
