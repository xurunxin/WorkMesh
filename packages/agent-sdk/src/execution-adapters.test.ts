import { describe, expect, it, vi } from 'vitest'
import { WorkMeshClient } from './index.js'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const timestamp = '2025-01-01T00:00:00Z'
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const confirmation = (action: 'complete' | 'stop_ack', operationKey: string) => ({
  session: { id, state: action === 'complete' ? 'completed' : 'canceled', revision: 8 },
  action: { kind: action, operationKey, confirmation: 'confirmed', unavailableReason: null },
  originalResult: { operationId: action === 'complete' ? 'completeAgentSession' : 'acknowledgeAgentSessionStop', sessionId: id,
    revision: 7, state: action === 'complete' ? 'completed' : 'canceled', resultReference: { type: 'agent_session', id, revision: 7 }, eventReference: { id, cursor: '9007199254740993' } },
  cleanup: action === 'complete' ? null : { cleanupSummary: 'Released owned resources', residualRisks: [] },
})
const lease = { id, workspace_id: id, session_id: id, holder_actor_id: id, resource_type: 'work_item', resource_id: id,
  kind: 'exclusive', status: 'active', reason: 'Execute', expires_at: timestamp, heartbeat_at: timestamp,
  renew_count: 0, version: 2, revision: 2, released_at: null, released_by_actor_id: null, audit_reason: null,
  revoked_at: null, revoked_by_actor_id: null, created_at: timestamp, updated_at: timestamp }

describe('M1 SDK typed execution adapters', () => {
  it.each(['complete', 'stop_ack'] as const)('confirms %s using the installation slot with no refresh or write headers', async action => {
    const key = 'original key/+?&'
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response(confirmation(action, key))).mockResolvedValueOnce(response({ id }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'original-e', coordinationToken: 'c', installationToken: 'installation', fetch })
    expect(await client.getSessionExecutionResult(id, { action, operationKey: key }, { ifMatch: 999, idempotencyKey: 'must-not-send' })).toMatchObject({ originalResult: { revision: 7 }, session: { revision: 8 } })
    const address = new URL(String(fetch.mock.calls[0]![0]))
    expect(address.pathname).toBe(`/api/v1/agent-sessions/${id}/execution-result`)
    expect(address.searchParams.get('operationKey')).toBe(key)
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer installation')
    expect(headers.has('idempotency-key')).toBe(false)
    expect(headers.has('if-match')).toBe(false)
    await client.getServerInfo()
    expect(new Headers(fetch.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer original-e')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each([401, 403, 404])('preserves confirmation denial %s without changing identity or retrying', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({ error: { code: 'NOT_FOUND', message: 'Unavailable', correlationId: 'origin-denial' } }, status))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e', installationToken: 'installation', fetch })
    await expect(client.getSessionExecutionResult(id, { action: 'complete', operationKey: 'key' })).rejects.toMatchObject({ code: 'NOT_FOUND', correlationId: 'origin-denial' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('fails closed without installation and on a response for another action key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(confirmation('complete', 'other-key')))
    await expect(new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e', fetch }).getSessionExecutionResult(id, { action: 'complete', operationKey: 'key' })).rejects.toMatchObject({ code: 'INSTALLATION_TOKEN_REQUIRED' })
    expect(fetch).not.toHaveBeenCalled()
    await expect(new WorkMeshClient({ baseUrl: 'http://fixture', installationToken: 'installation', fetch }).getSessionExecutionResult(id, { action: 'complete', operationKey: 'key' })).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })
  it('stop ACK keeps its original E and exact key/body even with C and installation slots', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('Lost response')).mockResolvedValueOnce(response({ id, state: 'canceled' }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e', coordinationToken: 'c', installationToken: 'installation', fetch, retry: { maxAttempts: 1 } })
    const body = { cleanupSummary: 'Owned resource cleaned', residualRisks: ['Unknown remote residue'] }
    const options = { ifMatch: 4, idempotencyKey: 'stable-stop' }
    await expect(client.stopAcknowledgement(id, body, options)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    await client.stopAcknowledgement(id, body, options)
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer e')
      expect(new Headers(init?.headers).get('if-match')).toBe('"revision-4"')
      expect(new Headers(init?.headers).get('idempotency-key')).toBe('stable-stop')
      expect(init?.body).toBe(JSON.stringify(body))
    }
    const withoutE = new WorkMeshClient({ baseUrl: 'http://fixture', coordinationToken: 'c', installationToken: 'installation', fetch })
    expect(() => withoutE.stopAcknowledgement(id, body, options)).toThrowError(expect.objectContaining({ code: 'AGENT_SESSION_TOKEN_REQUIRED' }))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('Lease heartbeat omits If-Match while renew/release preserve version and keys', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response(lease))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e', fetch })
    await client.heartbeatLease(id, { ifMatch: 99, idempotencyKey: 'heartbeat' })
    await client.renewLease(id, { ttlSeconds: 300 }, { ifMatch: 2, idempotencyKey: 'renew' })
    await client.releaseLease(id, { reason: 'Done' }, { ifMatch: 2, idempotencyKey: 'release' })
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).has('if-match')).toBe(false)
    for (const [, init] of fetch.mock.calls.slice(1)) expect(new Headers(init?.headers).get('if-match')).toBe('"revision-2"')
    expect(fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('idempotency-key'))).toEqual(['heartbeat', 'renew', 'release'])
  })
  it('typed list readers preserve signed cursor and reject malformed wire data', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response({ items: [], nextCursor: 'signed+/cursor' })).mockResolvedValueOnce(response({ items: [lease], nextCursor: null })).mockResolvedValueOnce(response({ items: [{ id: other }], nextCursor: null }))
    const client = new WorkMeshClient({ baseUrl: 'http://fixture', sessionToken: 'e', fetch })
    expect(await client.listSessions({ state: 'executing', agentId: id }, { cursor: 'signed+/cursor', limit: 1 })).toEqual({ items: [], nextCursor: 'signed+/cursor' })
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('cursor')).toBe('signed+/cursor')
    expect((await client.listLeases()).items[0]).toMatchObject({ version: 2, revision: 2 })
    await expect(client.listApprovals()).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })
})
