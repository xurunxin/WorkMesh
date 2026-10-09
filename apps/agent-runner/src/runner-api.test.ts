import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunnerApi } from './run-session.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('Runner受保护请求恢复契约', () => {
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
