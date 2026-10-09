import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunnerApi } from './run-session.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('Runner受保护请求恢复契约', () => {
  it('Stop finally保留准确E且丢响应仅安装只读确认，无刷新或普通Activity', async () => {
    vi.stubEnv('WORKMESH_API_URL', 'http://127.0.0.1:3001')
    vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN', 'fixture-installation')
    vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN', 'fixture-runner-service-token-00000001')
    const id = '11111111-1111-4111-8111-111111111111'
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'original-e', expiresAt: '2099-01-01T00:00:00Z' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id, state: 'executing', revision: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id, state: 'stopping', revision: 3 })))
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        session: { id, state: 'canceled', revision: 4 },
        action: { kind: 'stop_ack', operationKey: 'cleanup-original', confirmation: 'confirmed', unavailableReason: null },
        originalResult: { operationId: 'acknowledgeAgentSessionStop', sessionId: id, revision: 4, state: 'canceled',
          resultReference: { type: 'agent_session', id, revision: 4 }, eventReference: null },
        cleanup: { cleanupSummary: 'Scratch removed.', residualRisks: [] },
      })))
    vi.stubGlobal('fetch', fetch)
    const api = new RunnerApi(id)
    await api.request('GET', `/api/v1/agent-sessions/${id}`)
    await api.stopAfterCleanup('Scratch removed.', [], 'cleanup-original')
    expect(fetch).toHaveBeenCalledTimes(5)
    const ack = fetch.mock.calls[3]!
    expect(String(ack[0])).toContain('/stop-ack')
    expect(ack[1].headers).toMatchObject({ Authorization: 'Bearer original-e', 'If-Match': '"revision-3"', 'Idempotency-Key': 'cleanup-original' })
    const confirm = fetch.mock.calls[4]!
    expect(String(confirm[0])).toContain('action=stop_ack&operationKey=cleanup-original')
    expect(confirm[1].headers).toEqual({ Authorization: 'Bearer fixture-installation' })
    expect(fetch.mock.calls.filter(call => String(call[0]).includes('/token/refresh'))).toHaveLength(1)
    expect(fetch.mock.calls.some(call => String(call[0]).includes('/activities') || String(call[0]).includes('/release'))).toBe(false)
    expect(ack[1].signal.aborted).toBe(false)
  })
  it.each([401, 403])('请求前刷新可用，受保护%s不刷新/重发且错误完整', async status => {
    vi.stubEnv('WORKMESH_API_URL', 'http://127.0.0.1:3001')
    vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN', 'fixture-installation')
    vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN', 'fixture-runner-service-token-00000001')
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sessionToken: 'fixture-e', expiresAt: '2099-01-01T00:00:00Z' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'DELEGATION_NOT_ACTIVE', message: 'Delegation revoked', correlationId: 'exact-trace', details: { currentRevision: 8 } } }), { status }))
    vi.stubGlobal('fetch', fetch)
    const api = new RunnerApi('11111111-1111-4111-8111-111111111111')
    await expect(api.request('GET', `/api/v1/agent-sessions/${api.sessionId}`)).rejects.toMatchObject({ code: 'DELEGATION_NOT_ACTIVE', message: 'Delegation revoked', details: { currentRevision: 8 }, correlationId: 'exact-trace' })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(fetch.mock.calls[0]![0])).toContain('/token/refresh')
  })
})
