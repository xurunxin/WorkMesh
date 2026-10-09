import { describe, expect, it, vi } from 'vitest'
import { createAgentCapabilityManifest, qualifyAgentCapabilityManifest, featureKeySchema, capabilitySchema, type Capability } from '@workmesh/contracts'
import { WorkMeshClient } from './index.js'

const actor = '11111111-1111-4111-8111-111111111111'
const c = '22222222-2222-4222-8222-222222222222'
const e = '33333333-3333-4333-8333-333333333333'
const other = '44444444-4444-4444-8444-444444444444'
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const manifest = (sessionId: string, capabilities: Capability[] = [...capabilitySchema.options], actorId = actor, reviewer = false) => {
  const coordination = sessionId === c
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as Record<typeof featureKeySchema.options[number], boolean>
  const old = createAgentCapabilityManifest({ actorId, sessionId, sessionState: 'executing', sessionRevision: 1,
    effectiveCapabilities: capabilities, capabilityScope: { workspaceId: actor, teamIds: [actor], projectIds: [actor], workItemIds: coordination ? [] : [sessionId], repositoryIds: [actor], capabilities }, supportedProtocols: ['mcp'], pushConfigured: false, features })
  return qualifyAgentCapabilityManifest(old, { identity: { actorId, sessionId, credentialMode: coordination ? 'coordination_connection' : 'agent_session', sessionKind: coordination ? 'coordination' : 'execution', delegationRole: coordination ? 'coordinator' : reviewer ? 'reviewer' : 'executor', delegationScopeType: coordination ? 'team' : 'work_item' }, features, workItemId: coordination ? null : sessionId, projectId: null })
}

describe('qualified SDK身份及恢复边界', () => {
  it('直接E自身读取没有安装刷新，qualified与legacy请求分开', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(manifest(e))).mockResolvedValueOnce(response({ id: e }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e-token', fetch })
    await client.getQualifiedAgentCapabilities()
    await client.getSession(e)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['http://fixture/api/v1/agent-capabilities?discovery=qualified', `http://fixture/api/v1/agent-sessions/${e}`])
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer e-token')
  })
  it.each([401, 403])('受保护%s保全完整错误且不refresh/retry', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ error: { code: 'FORBIDDEN', message: 'Grant revoked', details: { currentRevision: 9 }, correlationId: 'server-trace' } }, status))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e-token', installationToken: 'install', fetch })
    await expect(client.getSession(e)).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Grant revoked', correlationId: 'server-trace', details: { currentRevision: 9 } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('stale ACK维持refresh→ACK，不先读拒stale manifest', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({ sessionToken: 'stale-e', expiresAt: '2099-01-01T00:00:00Z' })).mockResolvedValueOnce(response({ id: e, state: 'acknowledged' }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', coordinationToken: 'connection', installationToken: 'connection', fetch })
    await client.acknowledge(e, { summary: 'Recover stale' }, { idempotencyKey: 'durable-ack' })
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([`http://fixture/api/v1/agent-sessions/${e}/token/refresh`, `http://fixture/api/v1/agent-sessions/${e}/ack`])
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('idempotency-key')).toBe('durable-ack')
  })
  it('C省略可选room目标保留当前凭据路径', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ id: actor }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', coordinationToken: 'connection', fetch })
    await client.getRoom({ workItemId: e })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).get('x-workmesh-installation-token')).toBe('connection')
  })
  it('两个目标并发只用各自Token核资格/执行，当前C随后保持自身身份', async () => {
    const calls: Array<{ url: string; authorization: string | null; connection: string | null }> = []
    const fetch: typeof globalThis.fetch = async (url, options) => {
      const address = String(url), headers = new Headers(options?.headers)
      calls.push({ url: address, authorization: headers.get('authorization'), connection: headers.get('x-workmesh-installation-token') })
      if (address.endsWith('/token/refresh')) return response({ sessionToken: address.includes(other) ? 'other-token' : 'e-token', expiresAt: '2099-01-01T00:00:00Z' })
      if (address.includes('agent-capabilities')) return response(manifest(headers.get('authorization') === 'Bearer e-token' ? e : headers.get('authorization') === 'Bearer other-token' ? other : c))
      return response({ id: address.includes(other) ? other : e })
    }
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', coordinationToken: 'connection', installationToken: 'connection', fetch })
    await Promise.all([client.getSession(e), client.getSession(other)])
    await client.listTeams()
    for (const id of [e, other]) expect(calls.find(call => call.url.endsWith(`/agent-sessions/${id}`))?.authorization).toBe(id === e ? 'Bearer e-token' : 'Bearer other-token')
    expect(calls.at(-1)?.authorization).toBeNull()
    expect(calls.at(-1)?.connection).toBe('connection')
  })
  it('目标actor错绑立即终止，零目标命令、零共享身份写入', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(manifest(c))).mockResolvedValueOnce(response({ sessionToken: 'wrong-actor', expiresAt: '2099-01-01T00:00:00Z' })).mockResolvedValueOnce(response(manifest(e, [...capabilitySchema.options], other)))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', coordinationToken: 'connection', installationToken: 'connection', fetch })
    const set = vi.spyOn(client, 'setSessionToken')
    await expect(client.getSession(e)).rejects.toMatchObject({ code: 'SESSION_BINDING_MISMATCH' })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(set).not.toHaveBeenCalled()
  })
  it('两层manifest身份不一致拒绝，不能作为目标资格', async () => {
    const wrong = manifest(e)
    wrong.discovery.identity.actorId = other
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(wrong))
    await expect(new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'token', fetch }).getQualifiedAgentCapabilities()).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
