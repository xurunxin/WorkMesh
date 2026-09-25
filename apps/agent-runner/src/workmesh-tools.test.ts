import { describe, expect, it } from 'vitest'
import { appendActivityInputSchema, createAgentCapabilityManifest, featureKeySchema,
  type AgentCapabilityManifest } from '@workmesh/contracts'
import { createWorkMeshTools, type RunnerToolApi } from './workmesh-tools.js'
import type { Capability } from '@workmesh/contracts'

const sessionId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const documentId = '33333333-3333-4333-8333-333333333333'
const baseRevisionId = '44444444-4444-4444-8444-444444444444'

function manifest(capabilities: Capability[]): AgentCapabilityManifest {
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as
    Record<(typeof featureKeySchema.options)[number], boolean>
  return createAgentCapabilityManifest({
    actorId: ownerId, sessionId, sessionState: 'executing', sessionRevision: 2,
    effectiveCapabilities: capabilities,
    capabilityScope: { workspaceId: ownerId, teamIds: [ownerId], projectIds: [ownerId],
      workItemIds: [], repositoryIds: [], capabilities },
    supportedProtocols: ['native_http'], pushConfigured: false, features,
  })
}

describe('Pi WorkMesh tools', () => {
  it('offers only live eligible operations and replays a write with the same durable operation key', async () => {
    const calls: Array<{ method: string; path: string; key?: string; ifMatch?: number }> = []
    const api: RunnerToolApi = {
      sessionId,
      async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
        body?: unknown, ifMatch?: number, key?: string): Promise<T> {
        calls.push({ method, path, key, ifMatch })
        if (path === '/api/v1/agent-capabilities') return manifest(['work:read', 'work:write']) as T
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

  it('validates the document base and refuses a stale or malformed write before any API mutation', async () => {
    const calls: string[] = []
    const api: RunnerToolApi = {
      sessionId,
      async request<T>(_method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string): Promise<T> {
        calls.push(path)
        if (path === '/api/v1/agent-capabilities') return manifest(['work:read', 'work:write']) as T
        return {} as T
      },
    }
    const tools = await createWorkMeshTools(api, 'attempt-2', () => undefined)
    const update = tools.find(tool => tool.name === 'workmesh_update_document')!
    await expect(update.execute('pi-call-2', { documentId, ifMatch: 1, title: 'T', markdown: '',
      baseRevisionId, baseContentHash: 'sha256:bad' }, undefined, undefined, {} as never))
      .rejects.toThrow()
    expect(calls).toEqual(['/api/v1/agent-capabilities'])
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
        if (path === '/api/v1/agent-capabilities') return manifest(['work:read', 'work:write']) as T
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
        if (path === '/api/v1/agent-capabilities') return manifest(['work:read', 'work:write']) as T
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
        if (path === '/api/v1/agent-capabilities')
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
        if (path === '/api/v1/agent-capabilities')
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
        if (path === '/api/v1/agent-capabilities')
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
})
