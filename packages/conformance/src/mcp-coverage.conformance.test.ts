import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type { AdapterDiscovery, QualifiedAgentCapabilityManifest } from '@workmesh/contracts'
import { createMcpCoverageFixture, saveEvidence } from './mcp-coverage.fixture.js'

type Fixture = Awaited<ReturnType<typeof createMcpCoverageFixture>>
let fixture: Fixture
const tool = async <T>(client: Client, name: string, input: Record<string, unknown> = {}): Promise<T> => {
  const result = await client.callTool({ name, arguments: input })
  expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true)
  return (result.structuredContent as { data: T }).data
}
const discovery = (client: Client) => tool<{ manifest: QualifiedAgentCapabilityManifest; projection: AdapterDiscovery }>(client, 'get_agent_discovery')
describe('真实API、MCP与Pi资格和恢复链', () => {
  beforeAll(async () => { fixture = await createMcpCoverageFixture() })
  afterAll(async () => { if (fixture) await fixture.close() })

  it('同一C分别发现两种mode，Context与同次投影一致，verify无需目标参数', async () => {
    const read = await fixture.connect('read-only'), write = await fixture.connect('read-write')
    const r = await discovery(read), w = await discovery(write)
    expect(r.manifest.discovery).toEqual(w.manifest.discovery)
    const readonlyTools = (await read.listTools()).tools.map(item => item.name)
    const tools = (await write.listTools()).tools
    expect(readonlyTools).toContain('verify_connection')
    expect(readonlyTools).not.toContain('create_project')
    expect(tools.map(item => item.name)).toContain('create_project')
    expect(tools.map(item => item.name)).not.toContain('create_comment')
    await tool(read, 'verify_connection')
    await tool(write, 'verify_connection')
    const context = await tool<{ allowedOperations: string[]; discovery: AdapterDiscovery }>(read, 'get_workmesh_context')
    expect(context.allowedOperations).toEqual(context.discovery.allowedOperations)
    expect(context.allowedOperations).toEqual(r.projection.allowedOperations)
    const denied = await read.callTool({ name: 'create_project', arguments: { teamId: fixture.teamId, name: 'Must not write', idempotencyKey: randomUUID() } })
    expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
    await tool(read, 'get_server_info')
    saveEvidence('c-discovery.json', { readonlyTools, tools, readonlyProjection: r.projection, writeProjection: w.projection, denied })
  })

  it('仅E Token读取自身resource和等价tool，异Session拒绝后继续合法读取', async () => {
    const execution = await fixture.createExecution()
    for (const mode of ['read-only', 'read-write'] as const) {
      const client = await fixture.connect(mode, execution)
      const d = await discovery(client)
      expect(d.manifest.discovery.identity).toMatchObject({ sessionId: execution.sessionId, credentialMode: 'agent_session', sessionKind: 'execution' })
      const names = (await client.listTools()).tools.map(item => item.name)
      expect(names).toEqual(expect.arrayContaining(['get_agent_session', 'get_session_context', 'get_session_plan']))
      expect(names).not.toContain('create_project')
      const resource = await client.readResource({ uri: `workmesh://session/${execution.sessionId}` })
      const session = await tool<{ id: string }>(client, 'get_agent_session', { id: execution.sessionId })
      const content = resource.contents[0]
      if (!content || !('text' in content)) throw new Error('Expected JSON text resource')
      expect(JSON.parse(content.text)).toMatchObject(session)
      const foreign = await client.callTool({ name: 'get_agent_session', arguments: { id: randomUUID() } })
      expect(foreign).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_BINDING_MISMATCH' } } })
      await tool(client, 'get_session_context', { id: execution.sessionId })
      saveEvidence(`e-${mode}.json`, { names, projection: d.projection, foreign })
    }
    await expect(execution.client.getCurrentAgentConnectionIdentity()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    await execution.client.getSession(execution.sessionId)
  })

  it('双客户端C bridge绑定两个准确E，省略work room目标保留当前C', async () => {
    const first = await fixture.createExecution('M0 bridge first'), second = await fixture.createExecution('M0 bridge second')
    const [a, b] = await Promise.all([fixture.connect('read-write'), fixture.connect('read-write')])
    const results = await Promise.all([tool<{ id: string }>(a, 'get_agent_session', { id: first.sessionId }), tool<{ id: string }>(b, 'get_agent_session', { id: second.sessionId })])
    expect(results.map(result => result.id)).toEqual([first.sessionId, second.sessionId])
    // C的Team scope不等于execution owner；省略目标保持当前身份及原范围拒绝。
    const room = await a.callTool({ name: 'get_work_room', arguments: { workItemId: first.workItemId } })
    expect(room).toMatchObject({ isError: true, structuredContent: { error: { code: 'RESOURCE_SCOPE_DENIED' } } })
    await tool(a, 'verify_connection')
    const identity = await fixture.coordination.getCurrentAgentConnectionIdentity()
    expect(identity.coordination_session.id).not.toBe(first.sessionId)
  })

  it('写入重连/同key并发只产生一条事实，异体冲突及旧revision保全currentRevision', async () => {
    const execution = await fixture.createExecution('M0 idempotency'), mcp = await fixture.connect('read-write', execution)
    const input = { ownerType: 'work_item' as const, ownerId: execution.workItemId, title: 'M0 idempotent fact', markdown: 'Original', idempotencyKey: randomUUID() }
    const [first, second] = await Promise.all([tool<{ id: string }>(mcp, 'create_document', input), tool<{ id: string }>(mcp, 'create_document', input)])
    expect(first.id).toBe(second.id)
    const reconnect = await fixture.connect('read-write', execution)
    expect((await tool<{ id: string }>(reconnect, 'create_document', input)).id).toBe(first.id)
    const conflict = await reconnect.callTool({ name: 'create_document', arguments: { ...input, markdown: 'Changed' } })
    expect(conflict).toMatchObject({ isError: true, structuredContent: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } } })
    const current = await execution.client.getDocument(first.id)
    const stale = await reconnect.callTool({ name: 'update_document', arguments: { documentId: first.id, title: current.title, markdown: 'Forbidden stale write', revision: current.revision + 1, baseRevisionId: current.currentRevision.id, baseContentHash: current.currentRevision.contentHash, idempotencyKey: randomUUID() } })
    expect(stale).toMatchObject({ isError: true, structuredContent: { error: { code: 'REVISION_CONFLICT', currentRevision: current.revision } } })
    expect((await execution.client.getDocument(first.id)).currentRevision.contentHash).toBe(current.currentRevision.contentHash)
    const facts = await fixture.db.query<{ count: number }>('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1 AND title=$2', [execution.workItemId, input.title])
    expect(facts.rows[0]?.count).toBe(1)
    const newAction = await tool<{ id: string }>(reconnect, 'create_document', { ...input, idempotencyKey: randomUUID() })
    expect(newAction.id).not.toBe(first.id)
    expect((await fixture.db.query<{ count: number }>('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1 AND title=$2', [execution.workItemId, input.title])).rows[0]?.count).toBe(2)
    let dropped = false
    const lostResponse = new WorkMeshClient({ baseUrl: fixture.baseUrl, sessionToken: execution.token, retry: { baseDelayMs: 0 }, fetch: async (url, options) => {
      const response = await fetch(url, options)
      if (String(url).endsWith('/documents') && !dropped) { dropped = true; await response.text(); throw new TypeError('M0 response discarded after commit') }
      return response
    } })
    const replayed = await lostResponse.createDocument({ ownerType: 'work_item', ownerId: execution.workItemId, title: 'M0 lost response fact', markdown: 'Once' }, { idempotencyKey: randomUUID() })
    expect(replayed.id).toBeTruthy()
    expect((await fixture.db.query<{ count: number }>('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1 AND title=$2', [execution.workItemId, 'M0 lost response fact'])).rows[0]?.count).toBe(1)
    saveEvidence('idempotency-and-revision.json', { documentId: first.id, conflict, stale, dropped, replayedId: replayed.id })
  })

  it('下游事务失败不吞错误且回滚事实；resource重放不新增领域event/outbox', async () => {
    const execution = await fixture.createExecution('M0 transaction'), client = await fixture.connect('read-write', execution)
    const snapshot = async () => (await fixture.db.query<{ events: number; outbox: number }>('SELECT (SELECT count(*)::int FROM domain_events) AS events,(SELECT count(*)::int FROM outbox_events) AS outbox')).rows[0]!
    const before = await snapshot()
    await client.readResource({ uri: `workmesh://session/${execution.sessionId}/context` })
    await client.readResource({ uri: `workmesh://session/${execution.sessionId}/context` })
    expect(await snapshot()).toEqual(before)
    await fixture.db.query("CREATE FUNCTION m0_document_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.title='M0 rollback fact' THEN RAISE EXCEPTION 'M0 injected downstream failure'; END IF; RETURN NEW; END $$")
    await fixture.db.query('CREATE TRIGGER m0_document_failure BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION m0_document_failure()')
    try {
      const failed = await client.callTool({ name: 'create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M0 rollback fact', markdown: 'Rollback', idempotencyKey: randomUUID() } })
      expect(failed).toMatchObject({ isError: true, structuredContent: { error: { code: 'INTERNAL_ERROR', correlationId: expect.any(String) } } })
      expect(await snapshot()).toEqual(before)
      expect((await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM documents WHERE title='M0 rollback fact'")).rows[0]?.count).toBe(0)
      saveEvidence('transaction-failure.json', failed)
    } finally { await fixture.db.query('DROP TRIGGER m0_document_failure ON documents'); await fixture.db.query('DROP FUNCTION m0_document_failure()') }
  })

  it('真实Pi模型收到准确E子集、调用产生Document/工具活动/Turn事实', async () => {
    const execution = await fixture.createExecution('M0 Pi real turn')
    const result = await fixture.runPi(execution)
    expect(result.stderr, result.stdout).toBe('')
    expect(result.captures.length).toBe(4)
    for (const capture of result.captures) {
      expect(capture.tools).toEqual(expect.arrayContaining(['workmesh_create_document', 'workmesh_get_work_item']))
      expect(capture.tools).not.toContain('workmesh_create_project')
      expect(capture.tools).not.toContain('workmesh_update_work_item')
    }
    expect(result.captures[3]?.receivedToolResults).toBe(3)
    expect(result.captures[2]?.toolResults.join(' ')).toContain('NOT_FOUND')
    expect(result.captures[2]?.toolResults.join(' ')).toContain('correlationId')
    expect((await fixture.db.query<{ status: string }>('SELECT status FROM workbench_turns WHERE id=$1', [result.turnId])).rows[0]?.status).toBe('settled')
    expect((await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1 AND title='M0 Pi fact'", [execution.workItemId])).rows[0]?.count).toBe(1)
    const invocations = (await fixture.db.query<{ tool_name: string; call_count: number }>('SELECT tool_name,call_count FROM workbench_tool_invocations WHERE turn_id=$1 ORDER BY sequence', [result.turnId])).rows
    expect(invocations).toEqual([{ tool_name: 'workmesh_create_document', call_count: 1 }, { tool_name: 'workmesh_get_document', call_count: 1 }, { tool_name: 'workmesh_get_work_item', call_count: 1 }])
    const activities = (await fixture.db.query<{ summary: string }>('SELECT summary FROM agent_activities WHERE session_id=$1', [execution.sessionId])).rows.map(row => row.summary)
    expect(activities).toEqual(expect.arrayContaining(['Pi createDocument started.', 'Pi createDocument succeeded.']))
    saveEvidence('pi-durable-facts.json', { turnId: result.turnId, invocations, activities })
  })

  it('API/MCP重启后重新发现和durable cursor恢复，Stop拒普通调用且SDK专用ACK仍可走', async () => {
    const execution = await fixture.createExecution('M0 restart Stop'), client = await fixture.connect('read-write', execution)
    const events = await execution.client.listEvents({ cursor: '0', limit: 500 })
    const cursor = events.at(-1)?.cursor
    expect(cursor).toBeTruthy()
    await fixture.restart()
    const reconnected = await fixture.connect('read-write', execution)
    expect((await discovery(reconnected)).manifest.agent.sessionId).toBe(execution.sessionId)
    const resumed = await execution.client.listEvents({ cursor: cursor!, limit: 500 })
    expect(resumed.every(event => BigInt(event.cursor) > BigInt(cursor!))).toBe(true)
    const session = await execution.client.getSession<{ revision: number }>(execution.sessionId)
    const stopping = await fixture.human<{ revision: number }>('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'M0 Stop fixture' }, session.revision)
    const denied = await client.callTool({ name: 'append_activity', arguments: { sessionId: execution.sessionId, kind: 'message', summary: 'Must stop', idempotencyKey: randomUUID() } })
    expect(denied.isError).toBe(true)
    await execution.client.stopAcknowledgement(execution.sessionId, { cleanupSummary: 'M0 no external effects', residualRisks: [] }, { ifMatch: stopping.revision, idempotencyKey: randomUUID() })
    saveEvidence('restart-stop.json', { cursor, resumedCursors: resumed.map(event => event.cursor), denied, cleanupEntry: 'SDK stopAcknowledgement' })
  })

  it('queued只握手；非活跃状态无普通发现，准确E仅列有条件Stop恢复，stale保留ACK恢复', async () => {
    const execution = await fixture.createExecution('M0 state gates')
    const client = await fixture.connect('read-write', execution)
    const states: Array<{ state: string; code: string | null }> = []
    // 仅test DB的状态夹具；不放宽route/domain，不把fixture更新计作领域命令。
    for (const state of ['queued', 'paused', 'stopping', 'completed'] as const) {
      await fixture.db.query("UPDATE agent_sessions SET state=$2::text::agent_session_state,ended_at=CASE WHEN $2::text='completed' THEN clock_timestamp() ELSE NULL END WHERE id=$1", [execution.sessionId, state])
      if (state === 'queued') {
        const manifest = await execution.client.getQualifiedAgentCapabilities()
        expect(manifest.discovery.operations.find(operation => operation.operationId === 'getAgentSession' && operation.variant === null)?.eligibility).toMatchObject({ status: 'blocked', reasons: expect.arrayContaining(['SESSION_STATE_DENIED']) })
        const denied = await client.callTool({ name: 'get_agent_session', arguments: { id: execution.sessionId } })
        expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
        states.push({ state, code: null })
      } else {
        await expect(execution.client.getQualifiedAgentCapabilities()).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' })
        const recovery = await client.listTools()
        expect(recovery.tools.map(item => item.name)).toEqual(['stop_ack'])
        expect(recovery.tools[0]?._meta).toMatchObject({ workmesh: { recoveryOnly: true } })
        const denied = await client.callTool({ name: 'get_agent_session', arguments: { id: execution.sessionId } })
        expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_NOT_ACTIVE', correlationId: expect.any(String) } } })
        states.push({ state, code: 'SESSION_NOT_ACTIVE' })
      }
    }
    await fixture.db.query("UPDATE agent_sessions SET state='stale',ended_at=NULL WHERE id=$1", [execution.sessionId])
    await expect(execution.client.getQualifiedAgentCapabilities()).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' })
    await fixture.coordination.acknowledge(execution.sessionId, { summary: 'M0 stale recovery' }, { idempotencyKey: randomUUID() })
    expect((await fixture.db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]?.state).toBe('acknowledged')
    saveEvidence('state-gates.json', states)
  })

  it('直接E ACK提交后注入丢响应，同key/body只一条事实，新key仍拒绝', async () => {
    const execution = await fixture.createExecution('M0 lost ACK', true)
    let lost = false, calls = 0
    const sdk = new WorkMeshClient({ baseUrl: fixture.baseUrl, sessionToken: execution.token, retry: { maxAttempts: 1 }, fetch: async (url, init) => {
      calls++
      const response = await fetch(url, init)
      if (!lost && String(url).endsWith('/ack') && response.ok) {
        lost = true
        await response.text()
        throw new TypeError('M0 injected loss after durable ACK commit')
      }
      return response
    } })
    const client = await fixture.connectSdk(sdk)
    const args = { sessionId: execution.sessionId, summary: 'M0 committed ACK', idempotencyKey: randomUUID() }
    const before = (await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE event_type='agent.session.acknowledged' AND aggregate_id=$1", [execution.sessionId])).rows[0]!.count
    // 真实 REST 已提交；SDK 传输注入丢响应，MCP 返回失败而客户端以原逻辑身份恢复。
    expect((await client.callTool({ name: 'ack_agent_session', arguments: args })).isError).toBe(true)
    expect((await fixture.db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]?.state).toBe('acknowledged')
    const replay = await tool(client, 'ack_agent_session', args)
    const fresh = await client.callTool({ name: 'ack_agent_session', arguments: { ...args, idempotencyKey: randomUUID() } })
    expect(fresh).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_NOT_ACTIVE', correlationId: expect.any(String) } } })
    const after = (await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE event_type='agent.session.acknowledged' AND aggregate_id=$1", [execution.sessionId])).rows[0]!.count
    expect(after - before).toBe(1)
    expect(calls).toBe(3)
    saveEvidence('review3-ack-replay.json', { replay, fresh, acknowledgedFactsAdded: after - before, protectedRequests: calls, responseLoss: 'actual REST response read then SDK transport throws; MCP uses real in-memory transport' })
  })

  it('stale ACK及stopping/terminal诊断heartbeat经MCP到REST，撤Delegation仍拒绝', async () => {
    const execution = await fixture.createExecution('M0 own Token recovery'), client = await fixture.connect('read-write', execution)
    await fixture.db.query("UPDATE agent_sessions SET state='stale' WHERE id=$1", [execution.sessionId])
    await expect(execution.client.getQualifiedAgentCapabilities()).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' })
    const restored = await tool(client, 'ack_agent_session', { sessionId: execution.sessionId, summary: 'M0 exact stale ACK', idempotencyKey: randomUUID() })
    const session = await execution.client.getSession<{ revision: number }>(execution.sessionId)
    const stopping = await fixture.human<{ revision: number }>('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'M0 diagnostic fixture' }, session.revision)
    const heartbeat = { sessionId: execution.sessionId, usage: { runtimeSeconds: 2 }, idempotencyKey: randomUUID() }
    await tool(client, 'heartbeat', heartbeat)
    await execution.client.stopAcknowledgement(execution.sessionId, { cleanupSummary: 'M0 diagnostic cleanup', residualRisks: [] }, { ifMatch: stopping.revision, idempotencyKey: randomUUID() })
    await tool(client, 'heartbeat', { ...heartbeat, idempotencyKey: randomUUID() })
    const state = (await fixture.db.query<{ state: string }>('SELECT state FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]!.state
    expect(['completed', 'failed', 'canceled']).toContain(state)
    expect((await client.listTools()).tools.map(item => item.name)).toEqual(['stop_ack'])
    const terminalRead = await client.callTool({ name: 'get_agent_session', arguments: { id: execution.sessionId } })
    expect(terminalRead).toMatchObject({ isError: true, structuredContent: { error: { code: 'SESSION_NOT_ACTIVE', correlationId: expect.any(String) } } })
    const grant = (await fixture.db.query<{ id: string; revision: number }>('SELECT d.id,d.revision FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id WHERE s.id=$1', [execution.sessionId])).rows[0]!
    await fixture.human('POST', `/api/v1/delegations/${grant.id}/revoke`, {}, grant.revision)
    const denied = await client.callTool({ name: 'heartbeat', arguments: { ...heartbeat, idempotencyKey: randomUUID() } })
    expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'UNAUTHENTICATED', correlationId: expect.any(String) } } })
    const stale = await fixture.createExecution('M0 revoked stale')
    const staleClient = await fixture.connect('read-write', stale)
    await fixture.db.query("UPDATE agent_sessions SET state='stale' WHERE id=$1", [stale.sessionId])
    const staleGrant = (await fixture.db.query<{ id: string; revision: number }>('SELECT d.id,d.revision FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id WHERE s.id=$1', [stale.sessionId])).rows[0]!
    await fixture.human('POST', `/api/v1/delegations/${staleGrant.id}/revoke`, {}, staleGrant.revision)
    const deniedAck = await staleClient.callTool({ name: 'ack_agent_session', arguments: { sessionId: stale.sessionId, summary: 'Must not recover revoked Session', idempotencyKey: randomUUID() } })
    expect(deniedAck).toMatchObject({ isError: true, structuredContent: { error: { code: 'UNAUTHENTICATED', correlationId: expect.any(String) } } })
    saveEvidence('review3-recovery-diagnostic.json', { restored, state, denied, deniedAck })
  })

  it('安装交接准确目标可inspect/reject，另一真实Agent和无安装E拒绝', async () => {
    const source = await fixture.createExecution('M0 exact installation handoff'), other = await fixture.pairTarget()
    const handoff = await source.client.offerHandoff<{ id: string }>({ fromSessionId: source.sessionId, targetAgentId: fixture.agentId, summary: 'M0 own installation handoff', requestedCapabilities: ['work:read', 'work:write'] }, { idempotencyKey: randomUUID() })
    const c = await fixture.connect('read-write'), foreign = await fixture.connect('read-write', undefined, other.token)
    const names = (await c.listTools()).tools.map(item => item.name)
    expect(names).toEqual(expect.arrayContaining(['inspect_pending_handoff', 'reject_handoff']))
    const inspection = await tool<{ handoff: { id: string } }>(c, 'inspect_pending_handoff', { handoffId: handoff.id })
    expect(inspection.handoff.id).toBe(handoff.id)
    const wrongRead = await foreign.callTool({ name: 'inspect_pending_handoff', arguments: { handoffId: handoff.id } })
    expect(wrongRead).toMatchObject({ isError: true, structuredContent: { error: { code: 'NOT_FOUND' } } })
    const wrongWrite = await foreign.callTool({ name: 'reject_handoff', arguments: { handoffId: handoff.id, machineReason: 'manual_reject', idempotencyKey: randomUUID() } })
    expect(wrongWrite).toMatchObject({ isError: true, structuredContent: { error: { code: 'FORBIDDEN' } } })
    const e = await fixture.connect('read-write', source)
    for (const name of ['inspect_pending_handoff', 'reject_handoff'])
      expect(await e.callTool({ name, arguments: { handoffId: handoff.id, machineReason: 'manual_reject', idempotencyKey: randomUUID() } })).toMatchObject({ isError: true, structuredContent: { error: { code: 'INSTALLATION_TOKEN_REQUIRED' } } })
    await tool(c, 'reject_handoff', { handoffId: handoff.id, machineReason: 'manual_reject', idempotencyKey: randomUUID() })
    expect((await fixture.db.query<{ status: string }>('SELECT status FROM handoffs WHERE id=$1', [handoff.id])).rows[0]?.status).toBe('rejected')
    saveEvidence('review3-installation-handoff.json', { names, handoffId: handoff.id, wrongRead, wrongWrite, status: 'rejected' })
  })

  it('发现后撤Connection/Team grant仍拒绝，不以刷新或重新发现恢复授权', async () => {
    const c = await fixture.connect('read-write')
    await tool(c, 'verify_connection')
    const before = (await fixture.db.query<{ revision: number }>('SELECT revision FROM agent_connections WHERE id=$1', [fixture.connectionId])).rows[0]!
    await fixture.human('DELETE', `/api/v1/agent-connections/${fixture.connectionId}`, undefined, before.revision)
    const denied = await c.callTool({ name: 'create_project', arguments: { teamId: fixture.teamId, name: 'After revocation', idempotencyKey: randomUUID() } })
    expect(denied).toMatchObject({ isError: true, structuredContent: { error: { code: 'UNAUTHENTICATED' } } })
    expect((await fixture.db.query<{ count: number }>("SELECT count(*)::int AS count FROM projects WHERE name='After revocation'")).rows[0]?.count).toBe(0)
    saveEvidence('live-revocation.json', denied)
  })
})
