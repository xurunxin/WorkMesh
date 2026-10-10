import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunnerApi } from './run-session.js'
import { ExecutionLifecycle } from './execution-lifecycle.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

const sessionId = '11111111-1111-4111-8111-111111111111'
const replay = { transportReplay: { operationId: 'createDocument' as const, attemptId: sessionId } }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const transport = (code = 'UND_ERR_SOCKET') => new TypeError('fetch failed', { cause: Object.assign(new Error('transport'), { code }) })
function setup(...responses: Array<Response | Error | (() => Promise<Response>)>) {
  vi.stubEnv('WORKMESH_API_URL', 'http://127.0.0.1:3001')
  vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN', 'fixture-installation')
  vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN', 'fixture-runner-service-token-00000001')
  const fetch = vi.fn().mockResolvedValueOnce(json({ sessionToken: 'held-e', expiresAt: '2099-01-01T00:00:00Z' }))
  for (const response of responses) {
    if (typeof response === 'function') fetch.mockImplementationOnce(response)
    else if (response instanceof Error) fetch.mockRejectedValueOnce(response)
    else fetch.mockResolvedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetch)
  return { fetch, api: new RunnerApi(sessionId) }
}
const running = () => json({ attemptStatus: 'running', turnStatus: 'running', delegationStatus: 'active', sessionState: 'executing' })

describe('普通工具原请求传输重放', () => {
  it.each(['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT'])('仅准确cause %s一次同字节/身份重放', async code => {
    const {api,fetch}=setup(transport(code),running(),json({id:'original-document'}))
    const body={markdown:'中文\n原正文'}
    expect(await api.request('POST','/api/v1/documents',body,7,'same-key',replay)).toEqual({id:'original-document'})
    expect(fetch).toHaveBeenCalledTimes(4)
    const first=fetch.mock.calls[1]!,second=fetch.mock.calls[3]!
    expect(first[0].toString()).toBe(second[0].toString())
    expect(first[1].body).toBe(second[1].body)
    expect(first[1].headers).toEqual(second[1].headers)
    expect(second[1].headers).toMatchObject({Authorization:'Bearer held-e','Idempotency-Key':'same-key','If-Match':'"revision-7"'})
    expect(fetch.mock.calls[2]![1].headers.Authorization).toBe('Bearer held-e')
    expect(fetch.mock.calls.filter(call=>String(call[0]).includes('/token/refresh'))).toHaveLength(1)
  })
  it.each([400,401,403,409,408,500,503])('明确HTTP%s不重发',async status=>{
    const {api,fetch}=setup(json({error:{code:'DENIED',message:'拒绝'}},status))
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toMatchObject({status,code:'DENIED'})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each([new TypeError('unclassified'),transport('ENOTFOUND'),transport('CERT_HAS_EXPIRED'),transport('ECONNREFUSED'),new SyntaxError('JSON')])('非白名单错误不重发：%s',async error=>{
    const {api,fetch}=setup(error)
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toBe(error)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('第二次明确拒绝保首因，不允许生命周期自动完成',async()=>{
    const first=transport(),{api,fetch}=setup(first,running(),json({error:{code:'DELEGATION_NOT_ACTIVE',message:'撤权'}},403))
    const lifecycle=new ExecutionLifecycle()
    await expect(lifecycle.tool(()=>lifecycle.request('POST',()=>api.request('POST','/api/v1/documents',{},undefined,'key',replay))))
      .rejects.toMatchObject({code:'DELEGATION_NOT_ACTIVE',cause:first,unreconciled:true})
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(lifecycle.reconciled).toBe(false)
  })
  it('两次失响应仍unknown且零第三次发送',async()=>{
    const first=transport(),{api,fetch}=setup(first,running(),transport())
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toMatchObject({cause:first,unreconciled:true})
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it.each(['stopping','canceled','paused'])('准入Session%s时不发送第二业务请求',async sessionState=>{
    const first=transport(),{api,fetch}=setup(first,json({attemptStatus:'running',turnStatus:'running',delegationStatus:'active',sessionState}))
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toMatchObject({cause:first,unreconciled:true})
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('关闭或取消阻止重放且保首次commit不确定性',async()=>{
    const controller=new AbortController()
    const first=transport()
    const {api,fetch}=setup(async()=>{controller.abort();throw first})
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',{...replay,signal:controller.signal})).rejects.toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('准入耗尽固定截止预算，不延长截止或重发',async()=>{
    vi.useFakeTimers()
    const first=transport(),{api,fetch}=setup(first,async()=>{vi.setSystemTime(Date.now()+30_001);return running()})
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toMatchObject({cause:first,unreconciled:true})
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it.each(['close','expire'] as const)('首次提交失响应后%s禁止业务重放，保留首cause',async kind=>{
    vi.useFakeTimers()
    const first=transport()
    const {api,fetch}=setup(async()=>{if(kind==='close')api.closeExecution();else vi.setSystemTime(new Date('2100-01-01'));throw first})
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).rejects.toMatchObject({cause:first,unreconciled:true})
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('后台GET更新held token时，原写重放仍用原冻结E而非可变字段',async()=>{
    vi.useFakeTimers()
    vi.stubEnv('WORKMESH_API_URL','http://127.0.0.1:3001')
    vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN','fixture-installation')
    vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN','fixture-runner-service-token-00000001')
    const api=new RunnerApi(sessionId),first=transport()
    let refreshCount=0
    const requests:Array<{path:string;headers:Record<string,string>}>=[]
    let writes=0
    const fetch=vi.fn(async(url:URL,options:RequestInit)=>{
      const headers=options.headers as Record<string,string>;requests.push({path:url.pathname,headers})
      if(url.pathname.endsWith('/token/refresh'))return json({sessionToken:++refreshCount===1?'original-e':'background-e',expiresAt:new Date(Date.now()+70_000).toISOString()})
      if(url.pathname.endsWith('/status'))return running()
      if(options.method==='GET')return json({revision:9})
      if(++writes===1){vi.setSystemTime(Date.now()+12_000);await api.request('GET',`/api/v1/agent-sessions/${sessionId}`);throw first}
      return json({id:'original-result'})
    })
    vi.stubGlobal('fetch',fetch)
    await expect(api.request('POST','/api/v1/documents',{},undefined,'key',replay)).resolves.toEqual({id:'original-result'})
    expect(refreshCount).toBe(2)
    expect(requests.filter(row=>row.path==='/api/v1/documents').map(row=>row.headers.Authorization)).toEqual(['Bearer original-e','Bearer original-e'])
    expect(requests.find(row=>row.path.endsWith('/status'))!.headers.Authorization).toBe('Bearer original-e')
  })
  it.each([['GET','/api/v1/documents'],['POST','/api/v1/provider-actions'],['POST',`/api/v1/workbench/runner-attempts/${sessionId}/settle`]] as const)('非白名单%s %s保持单发',async(method,path)=>{
    const first=transport(),{api,fetch}=setup(first)
    await expect(api.request(method,path,{},undefined,'key',replay)).rejects.toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
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
