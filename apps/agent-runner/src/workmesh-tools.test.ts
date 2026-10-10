import { describe, expect, it } from 'vitest'
import { appendActivityInputSchema, createAgentCapabilityManifest, qualifyAgentCapabilityManifest, featureKeySchema,
  type AgentCapabilityManifest } from '@workmesh/contracts'
import { createWorkMeshTools, type RunnerToolApi, type SessionCompletionIntent, type SessionFailureIntent } from './workmesh-tools.js'
import type { Capability } from '@workmesh/contracts'
import { ExecutionLifecycle } from './execution-lifecycle.js'
import { RunnerApiError } from './run-session.js'

const sessionId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const documentId = '33333333-3333-4333-8333-333333333333'
const baseRevisionId = '44444444-4444-4444-8444-444444444444'

function manifest(capabilities: Capability[]): AgentCapabilityManifest {
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as
    Record<(typeof featureKeySchema.options)[number], boolean>
  const original = createAgentCapabilityManifest({
    actorId: ownerId, sessionId, sessionState: 'executing', sessionRevision: 2,
    effectiveCapabilities: capabilities,
    capabilityScope: { workspaceId: ownerId, teamIds: [ownerId], projectIds: [ownerId],
      workItemIds: [], repositoryIds: [], capabilities },
    supportedProtocols: ['native_http'], pushConfigured: false, features,
  })
  return qualifyAgentCapabilityManifest(original, { identity: { actorId: ownerId, sessionId,
    credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'project' },
    features, workItemId: null, projectId: ownerId })
}

describe('Pi WorkMesh tools', () => {
  it('M2计划评论/提案/context delta固定自身身份，验证来源并复用同调用幂等包装',async()=>{
    const calls:Array<{path:string;body:unknown;key?:string}>=[]
    const api:RunnerToolApi={sessionId,async request<T>(_method:Parameters<RunnerToolApi['request']>[0],path:string,body?:unknown,_revision?:number,key?:string):Promise<T>{
      if(path==='/api/v1/agent-capabilities?discovery=qualified')return manifest(['work:read','work:write','plan:write']) as T
      calls.push({path,body,key});return {id:documentId} as T
    }}
    const tools=await createWorkMeshTools(api,'M2 collaboration',()=>undefined)
    const invoke=async(name:string,input:unknown)=>tools.find(t=>t.name===name)!.execute(name,input,undefined,undefined,{} as never)
    await invoke('workmesh_comment_plan_step',{planVersionId:ownerId,planStepId:documentId,body:'Exact Plan'})
    await invoke('workmesh_propose_plan_step_assignment',{planStepId:documentId,skill:'review',rationale:'No automatic assignment'})
    await invoke('workmesh_append_context_delta',{baseSnapshotId:baseRevisionId,rationale:'Trusted',additions:[{sourceType:'artifact',sourceId:documentId,hash:`sha256:${'a'.repeat(64)}`}]})
    const writes=calls.filter(c=>!c.path.endsWith('/activities'))
    expect(writes.map(c=>c.path)).toEqual(['plan/comments','assignment-proposals','context-deltas'].map(s=>`/api/v1/agent-sessions/${sessionId}/${s}`))
    expect(writes.every(c=>Boolean(c.key))).toBe(true)
    await expect(invoke('workmesh_propose_plan_step_assignment',{planStepId:documentId,agentId:ownerId,skill:'review',rationale:'Ambiguous'})).rejects.toThrow()
  })
  it('M2长分页重读同cursor缩小limit，保留完整后页与正文，不把事实截成ID', async () => {
    const paths: string[] = []
    const api: RunnerToolApi = { sessionId, async request<T>(_method: Parameters<RunnerToolApi['request']>[0],path: string):Promise<T> {
      if(path==='/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read','work:write']) as T
      paths.push(path)
      const limit = Number(new URL(path,'http://fixture.invalid').searchParams.get('limit'))
      return {items:Array.from({length:limit},(_,i)=>({id:`item-${i}`,body:'x'.repeat(30000)})),nextCursor:`next-${limit}`} as T
    } }
    const tools = await createWorkMeshTools(api,'M2 page',()=>undefined)
    const page = await tools.find(tool=>tool.name==='workmesh_list_work_item_comments')!.execute('page',{workItemId:ownerId,limit:4,cursor:'same-cursor'},undefined,undefined,{} as never)
    expect(paths).toHaveLength(3)
    for(const path of paths) expect(new URL(path,'http://fixture.invalid').searchParams.get('cursor')).toBe('same-cursor')
    const content = page.content[0] as {type:'text';text:string}
    expect(JSON.parse(content.text)).toEqual({items:[{id:'item-0',body:'x'.repeat(30000)}],nextCursor:'next-1'})
  })

  it('M2透传Handoff全包/Inbox payload/规划step字段，父身份固定且Human接受工具缺席', async () => {
    const calls: Array<{path:string;body:unknown}> = []
    const api: RunnerToolApi = {sessionId,async request<T>(_method: Parameters<RunnerToolApi['request']>[0],path: string,body?: unknown):Promise<T> {
      if(path==='/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read','work:write','plan:write']) as T
      calls.push({path,body});return {id:documentId} as T
    }}
    const tools = await createWorkMeshTools(api,'M2 contracts',()=>undefined)
    await tools.find(tool=>tool.name==='workmesh_offer_handoff')!.execute('handoff',{targetSkill:'review',summary:'Structured package',status:'draft',completedWork:['done'],openQuestions:['question'],risks:['risk'],requestedAction:'Review',leaseTransferPolicy:'release',artifactIds:[documentId],contextSnapshotId:baseRevisionId,requestedCapabilities:['work:read','work:write']},undefined,undefined,{} as never)
    expect(calls.find(call=>call.path==='/api/v1/handoffs')!.body).toMatchObject({fromSessionId:sessionId,targetSkill:'review',remainingWork:[],status:'draft',contextSnapshotId:baseRevisionId})
    await tools.find(tool=>tool.name==='workmesh_reply_inbox_item')!.execute('reply',{inboxItemId:documentId,ifMatch:2,body:'Reply',payload:{verified:true}},undefined,undefined,{} as never)
    expect(calls.find(call=>call.path.endsWith('/reply'))!.body).toEqual({body:'Reply',payload:{verified:true}})
    await tools.find(tool=>tool.name==='workmesh_publish_plan')!.execute('plan',{ifMatch:2,changeSummary:'Plan',steps:[{id:ownerId,title:'Step',ordinal:0,ownerActorId:ownerId,expectedArtifacts:['test_report'],status:'canceled',cancellationReason:'Human changed scope'}]},undefined,undefined,{} as never)
    expect(calls.find(call=>call.path.endsWith('/plan'))!.body).toMatchObject({steps:[expect.objectContaining({expectedArtifacts:['test_report'],ownerActorId:ownerId,cancellationReason:'Human changed scope'})]})
    expect(tools.some(tool=>tool.name==='workmesh_accept_handoff')).toBe(false)
  })
  it.each([new RunnerApiError(500, 'INTERNAL_ERROR'), new SyntaxError('truncated committed response'),
    new TypeError('committed response lost')])('真实工具包装写响应错误仍阻止自动等待：%s', async failure => {
    const lifecycle = new ExecutionLifecycle()
    const api: RunnerToolApi = { sessionId, async request<T>(method: Parameters<RunnerToolApi['request']>[0], path: string): Promise<T> {
      return lifecycle.request(method, async () => {
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        throw failure
      })
    } }
    const tools = await createWorkMeshTools(api, 'uncertain-attempt', () => undefined)
    const state = tools.find(tool => tool.name === 'workmesh_transition_state')!
    await expect(lifecycle.tool(() => state.execute('state-uncertain',
      { state: 'planning', reason: '整理计划', ifMatch: 2 }, undefined, undefined, {} as never))).rejects.toThrow()
    lifecycle.close('wait')
    expect(lifecycle.reconciled).toBe(false)
  })

  it('等待仅产生意图，不写状态或Activity，普通状态与租约心跳无前置Activity', async () => {
    const calls: Array<{ path: string; ifMatch?: number }> = []
    const waits: unknown[] = []
    const api: RunnerToolApi = { sessionId, async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      path: string, _body?: unknown, ifMatch?: number): Promise<T> {
      if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
      calls.push({ path, ifMatch }); return { revision: 3 } as T
    } }
    const tools = await createWorkMeshTools(api, 'wait-attempt', () => undefined, undefined, intent => waits.push(intent))
    await tools.find(tool => tool.name === 'workmesh_wait')!.execute('wait-call',
      { state: 'awaiting_input', reason: '请提供测试输入' }, undefined, undefined, {} as never)
    expect(waits).toEqual([{ state: 'awaiting_input', reason: '请提供测试输入' }])
    expect(calls).toEqual([])
    await tools.find(tool => tool.name === 'workmesh_transition_state')!.execute('state-call',
      { state: 'planning', reason: '整理计划', ifMatch: 2 }, undefined, undefined, {} as never)
    expect(calls).toEqual([{ path: `/api/v1/agent-sessions/${sessionId}/state`, ifMatch: 2 }])
    await tools.find(tool => tool.name === 'workmesh_heartbeat_lease')!.execute('lease-heartbeat',
      { leaseId: documentId }, undefined, undefined, {} as never)
    expect(calls.at(-1)).toEqual({ path: `/api/v1/leases/${documentId}/heartbeat`, ifMatch: undefined })
    expect(calls.some(call => call.path.endsWith('/activities'))).toBe(false)
  })
  it('offers only live eligible operations and replays a write with the same durable operation key', async () => {
    const calls: Array<{ method: string; path: string; key?: string; ifMatch?: number }> = []
    const api: RunnerToolApi = {
      sessionId,
      async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown, ifMatch?: number, key?: string): Promise<T> {
        calls.push({ method, path, key, ifMatch })
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        if (path.endsWith('/activities')) appendActivityInputSchema.parse(body)
        return { id: documentId, revision: 1 } as T
      },
    }
    let invoked = 0
    const tools = await createWorkMeshTools(api, 'attempt-1', () => { invoked += 1 })
    expect(tools.map(tool => tool.name)).toContain('workmesh_create_document')
    expect(tools.map(tool => tool.name)).not.toContain('workmesh_archive_document')
    const create = tools.find(tool => tool.name === 'workmesh_create_document')!
    const input = { ownerType: 'project', ownerId, title: 'Roadmap', markdown: '# Roadmap' }
    await create.execute('pi-call-1', input, undefined, undefined, {} as never)
    await create.execute('pi-call-1', input, undefined, undefined, {} as never)
    expect(invoked).toBe(2)
    const writes = calls.filter(call => call.path === '/api/v1/documents')
    expect(writes).toHaveLength(2)
    expect(writes[0]?.key).toBe(writes[1]?.key)
    expect(calls.filter(call => call.path.endsWith('/activities'))).toHaveLength(4)
  })

  it('preserves structured REST errors for Pi and permits a later allowed read', async () => {
    const denied = Object.assign(new Error('Resource not found'), { code: 'NOT_FOUND',
      details: { operation: 'getDocument' }, correlationId: 'm0-trace' })
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read']) as T
        if (path.startsWith('/api/v1/documents/')) throw denied
        return { id: ownerId } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-error', () => undefined)
    const read = tools.find(tool => tool.name === 'workmesh_get_document')!
    await expect(read.execute('missing', { documentId }, undefined, undefined, {} as never))
      .rejects.toMatchObject({ message: JSON.stringify({ error: { code: 'NOT_FOUND',
        message: 'Resource not found', details: { operation: 'getDocument' }, correlationId: 'm0-trace' } }) })
    await expect(tools.find(tool => tool.name === 'workmesh_get_work_item')!
      .execute('allowed', { workItemId: ownerId }, undefined, undefined, {} as never)).resolves.toMatchObject({ content: expect.any(Array) })
  })

  it('validates the document base and refuses a stale or malformed write before any API mutation', async () => {
    const calls: string[] = []
    const api: RunnerToolApi = {
      sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string): Promise<T> {
        calls.push(path)
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        return {} as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-2', () => undefined)
    const update = tools.find(tool => tool.name === 'workmesh_update_document')!
    await expect(update.execute('pi-call-2', { documentId, ifMatch: 1, title: 'T', markdown: '',
      baseRevisionId, baseContentHash: 'sha256:bad' }, undefined, undefined, {} as never))
      .rejects.toThrow()
    expect(calls).toEqual(['/api/v1/agent-capabilities?discovery=qualified'])
  })

  it('hides write tools when live capabilities only allow reading', async () => {
    const api: RunnerToolApi = { sessionId,
      async request<T>(): Promise<T> { return manifest(['work:read']) as T },
    }
    const tools = await createWorkMeshTools(api, 'attempt-3', () => undefined)
    expect(tools.some(tool => tool.name === 'workmesh_create_document')).toBe(false)
    expect(tools.some(tool => tool.name === 'workmesh_update_document')).toBe(false)
    expect(tools.some(tool => tool.name === 'workmesh_get_document')).toBe(true)
  })

  it('reports a successful oversized write without returning its full Markdown', async () => {
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        return { id: documentId, revision: 1,
          currentRevision: { id: baseRevisionId, contentHash: `sha256:${'a'.repeat(64)}`, markdown: 'x'.repeat(60_000) } } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-4', () => undefined)
    const create = tools.find(tool => tool.name === 'workmesh_create_document')!
    const result = await create.execute('pi-call-4',
      { ownerType: 'project', ownerId, title: 'Large document', markdown: 'x'.repeat(60_000) },
      undefined, undefined, {} as never)
    const text = result.content.find(block => block.type === 'text')
    expect(text?.type === 'text' ? JSON.parse(text.text) : null).toMatchObject({
      truncated: true, id: documentId, revision: 1,
    })
  })

  it('does not misreport a committed write as failed when completion activity is unavailable', async () => {
    const calls: string[] = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown): Promise<T> {
        calls.push(path)
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        if (path.endsWith('/activities') && (body as { toolInvocation?: { status?: string } })?.toolInvocation?.status === 'succeeded')
          throw new Error('SESSION_STOPPED')
        return { id: documentId, revision: 1 } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-5', () => undefined)
    const create = tools.find(tool => tool.name === 'workmesh_create_document')!
    const result = await create.execute('pi-call-5',
      { ownerType: 'project', ownerId, title: 'Proof', markdown: '# Proof' },
      undefined, undefined, {} as never)
    const text = result.content.find(block => block.type === 'text')
    expect(text?.type === 'text' ? JSON.parse(text.text) : null).toMatchObject({
      result: { id: documentId, revision: 1 }, auditWarning: expect.any(String),
    })
    expect(calls.filter(path => path === '/api/v1/documents')).toHaveLength(1)
    expect(calls.filter(path => path.endsWith('/activities'))).toHaveLength(2)
  })

  it('binds approval, lease, artifact, and handoff requests to the exact Session', async () => {
    const calls: Array<{ path: string; body: unknown }> = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified')
          return manifest(['work:read', 'work:write', 'artifact:write', 'agent:delegate']) as T
        calls.push({ path, body })
        return { id: documentId } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-6', () => undefined)
    const names = tools.map(tool => tool.name)
    for (const name of ['workmesh_request_approval', 'workmesh_acquire_lease',
      'workmesh_publish_artifact', 'workmesh_offer_handoff']) expect(names).toContain(name)
    expect(names).not.toContain('workmesh_decide_approval')
    const run = async (name: string, input: unknown) => {
      await tools.find(tool => tool.name === name)!.execute(`call-${name}`, input,
        undefined, undefined, {} as never)
    }
    await run('workmesh_request_approval', { approvalType: 'plan', actionName: 'publish',
      actionPayloadSanitized: { planVersion: 1 }, actionPayloadHash: `sha256:${'a'.repeat(64)}`,
      riskLevel: 'medium', rationaleSummary: 'Human review requested',
      expiresAt: '2026-10-01T00:00:00Z' })
    await run('workmesh_acquire_lease', { resourceType: 'work_item', resourceId: ownerId,
      ttlSeconds: 60, reason: 'Coordinate edits' })
    await run('workmesh_publish_artifact', { type: 'document', title: 'Result' })
    await run('workmesh_offer_handoff', { targetAgentId: ownerId,
      summary: 'Continue with review', remainingWork: ['Review the result'] })
    expect(calls.find(call => call.path === '/api/v1/approvals')?.body).toMatchObject({ sessionId })
    expect(calls.find(call => call.path === '/api/v1/leases')?.body).toMatchObject({ sessionId })
    expect(calls.find(call => call.path === '/api/v1/artifacts')?.body).toMatchObject({ sessionId })
    expect(calls.find(call => call.path === '/api/v1/handoffs')?.body).toMatchObject({ fromSessionId: sessionId })
  })

  it('publishes a whole plan using the supplied Session revision before appending audit activity', async () => {
    const calls: Array<{ path: string; ifMatch?: number }> = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        _body?: unknown, ifMatch?: number): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified')
          return manifest(['work:read', 'work:write', 'plan:write']) as T
        calls.push({ path, ifMatch })
        return { id: documentId, revision: 3 } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-7', () => undefined)
    const getSession = tools.find(tool => tool.name === 'workmesh_get_session')!
    expect(getSession).toBeDefined()
    await getSession.execute('call-read-session', {}, undefined, undefined, {} as never)
    const publish = tools.find(tool => tool.name === 'workmesh_publish_plan')!
    expect(publish).toBeDefined()
    await publish.execute('call-plan', { ifMatch: 2, changeSummary: 'Initial plan',
      steps: [{ id: documentId, title: 'First step', ordinal: 0 }] },
    undefined, undefined, {} as never)
    expect(calls[0]?.path).toBe(`/api/v1/agent-sessions/${sessionId}`)
    expect(calls[1]).toEqual({ path: `/api/v1/agent-sessions/${sessionId}/plan`, ifMatch: 2 })
    expect(calls[2]?.path).toBe(`/api/v1/agent-sessions/${sessionId}/activities`)
    expect(calls).toHaveLength(3)
  })

  it('appends one human-visible activity with a sanitized tool reference', async () => {
    const calls: Array<{ path: string; body: unknown }> = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified')
          return manifest(['work:read', 'work:write']) as T
        calls.push({ path, body })
        return { id: documentId } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-8', () => undefined)
    const append = tools.find(tool => tool.name === 'workmesh_append_activity')!
    await append.execute('call-progress', { kind: 'status', summary: 'Document drafted.' },
      undefined, undefined, {} as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.path).toBe(`/api/v1/agent-sessions/${sessionId}/activities`)
    expect(appendActivityInputSchema.parse(calls[0]?.body)).toMatchObject({
      visibility: 'team', toolInvocation: { toolName: 'appendAgentActivity',
        inputSanitized: { toolCallId: 'call-progress', runnerAttemptId: 'attempt-8' } },
    })
  })

  it('releases only a versioned lease through the exact Session API authority', async () => {
    const calls: Array<{ path: string; body: unknown; ifMatch?: number; key?: string }> = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown, ifMatch?: number, key?: string): Promise<T> {
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        calls.push({ path, body, ifMatch, key })
        return { id: documentId, version: 2 } as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-release', () => undefined)
    const list = tools.find(tool => tool.name === 'workmesh_list_leases')!
    expect(list).toBeDefined()
    await list.execute('list-call', {}, undefined, undefined, {} as never)
    expect(calls[0]?.path).toBe(`/api/v1/leases?sessionId=${sessionId}&limit=50`)
    const release = tools.find(tool => tool.name === 'workmesh_release_lease')!
    expect(release).toBeDefined()
    await expect(release.execute('bad-version', { leaseId: documentId, ifMatch: 0 },
      undefined, undefined, {} as never)).rejects.toThrow()
    expect(calls).toHaveLength(1)
    await release.execute('release-call', { leaseId: documentId, ifMatch: 1,
      reason: 'Work finished' }, undefined, undefined, {} as never)
    expect(calls.find(call => call.path === `/api/v1/leases/${documentId}/release`))
      .toMatchObject({ body: { reason: 'Work finished' }, ifMatch: 1,
        key: expect.stringMatching(/^pi-[a-f0-9]{64}$/) })
  })

  it('queues exact failure intent without treating its acknowledgment as Session failure', async () => {
    const intents:SessionFailureIntent[]=[]
    const calls:string[]=[]
    const api:RunnerToolApi={sessionId,async request<T>(_method:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',path:string):Promise<T>{calls.push(path);return manifest(['work:read','work:write']) as T}}
    const tools=await createWorkMeshTools(api,'failure-attempt',()=>undefined,undefined,undefined,intent=>intents.push(intent))
    const fail=tools.find(tool=>tool.name==='workmesh_fail_session')!
    expect(fail).toBeDefined()
    await expect(fail.execute('invalid',{ifMatch:0,code:'FAIL',summary:'Invalid revision'},undefined,undefined,{} as never)).rejects.toThrow()
    const result=await fail.execute('failure-call',{ifMatch:2,code:'TEST_FAILURE',summary:'Explicit failure',retryable:false,evidence:['Public evidence']},undefined,undefined,{} as never)
    expect(result.content[0]).toMatchObject({text:expect.stringContaining('requested_after_failed_turn_settlement')})
    expect(intents).toEqual([{ifMatch:2,idempotencyKey:expect.stringMatching(/^pi-[a-f0-9]{64}$/),body:{code:'TEST_FAILURE',summary:'Explicit failure',retryable:false,evidence:['Public evidence']}}])
    expect(calls).toEqual(['/api/v1/agent-capabilities?discovery=qualified'])
    const absent=await createWorkMeshTools({...api,async request<T>():Promise<T>{return manifest(['work:read']) as T}},'failure-attempt',()=>undefined,undefined,undefined,()=>undefined)
    expect(absent.map(tool=>tool.name)).not.toContain('workmesh_fail_session')
  })

  it('queues evidence-backed completion without ending the Session before the public answer', async () => {
    const calls: string[] = []
    const intents: SessionCompletionIntent[] = []
    const api: RunnerToolApi = { sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string): Promise<T> {
        calls.push(path)
        if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest(['work:read', 'work:write']) as T
        return {} as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-complete', () => undefined,
      intent => intents.push(intent))
    const complete = tools.find(tool => tool.name === 'workmesh_complete_session')!
    expect(complete).toBeDefined()
    expect(tools.map(tool => tool.name)).not.toContain('workmesh_accept_handoff')
    await expect(complete.execute('invalid', { ifMatch: 2, summary: 'Done' },
      undefined, undefined, {} as never)).rejects.toThrow('Completion requires evidence')
    const result = await complete.execute('complete-call', { ifMatch: 2,
      summary: 'Document published', noArtifactReason: 'The document is stored on the Issue.' },
    undefined, undefined, {} as never)
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('queued_after_turn_settlement') })
    expect(calls).toEqual(['/api/v1/agent-capabilities?discovery=qualified'])
    expect(intents).toEqual([{ body: { summary: 'Document published', artifactIds: [], checks: [],
      limitations: [], noArtifactReason: 'The document is stored on the Issue.' },
      ifMatch: 2, idempotencyKey: expect.stringMatching(/^pi-[a-f0-9]{64}$/) }])
  })
})
