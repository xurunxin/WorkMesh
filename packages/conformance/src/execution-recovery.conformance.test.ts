import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { WorkMeshClient } from '@workmesh/agent-sdk'
import type { AgentSessionExecutionResult } from '@workmesh/contracts'
import { createSessionLifecycleWorker } from '../../../apps/worker/src/session-lifecycle.js'
import { createExecutionRecoveryFixture, saveExecutionEvidence } from './execution-recovery.fixture.js'

type Fixture = Awaited<ReturnType<typeof createExecutionRecoveryFixture>>
let fixture: Fixture
let previousWaits: string | undefined
const tool = async <T>(client: Client, name: string, arguments_: Record<string, unknown>): Promise<T> => {
  const result = await client.callTool({ name, arguments: arguments_ })
  expect(result.isError, JSON.stringify(result.structuredContent)).not.toBe(true)
  return (result.structuredContent as { data: T }).data
}
const completeBody = { summary: 'M1 direct completion', noArtifactReason: 'Lifecycle conformance produces no product artifact.', artifactIds: [], checks: [], limitations: [] }
const failingAfterCommit = (token: string, suffix: string) => {
  let discarded = false
  const fetcher: typeof globalThis.fetch = async (url, options) => {
    const result = await fetch(url, options)
    if (!discarded && options?.method === 'POST' && String(url).endsWith(suffix) && result.ok) {
      await result.text(); discarded = true
      throw new TypeError('M1 intentionally discarded the committed response')
    }
    return result
  }
  return new WorkMeshClient({ baseUrl: fixture.baseUrl, sessionToken: token, fetch: fetcher, retry: { maxAttempts: 1 } })
}
const snapshotWait = async (sessionId: string) => {
  const waits = (await fixture.db.query<{ id: string; status: string; source_turn_id: string; source_attempt_id: string; continuation_turn_id: string | null; approval_action_payload_hash: string | null }>('SELECT * FROM workbench_execution_waits WHERE agent_session_id=$1 ORDER BY created_at,id', [sessionId])).rows
  const turns = (await fixture.db.query<{ id: string; status: string }>('SELECT id,status FROM workbench_turns WHERE agent_session_id=$1 ORDER BY created_at,id', [sessionId])).rows
  const attempts = (await fixture.db.query<{ id: string; status: string }>('SELECT id,status FROM workbench_runner_attempts WHERE agent_session_id=$1 ORDER BY created_at,id', [sessionId])).rows
  const leases = (await fixture.db.query<{ id: string; status: string }>('SELECT id,status FROM leases WHERE session_id=$1 ORDER BY created_at,id', [sessionId])).rows
  return { waits, turns, attempts, leases }
}

describe('M1 真实 HTTP、MCP、Pi 执行与恢复', () => {
  beforeAll(async () => {
    previousWaits = process.env.WORKMESH_EXECUTION_WAITS_ENABLED
    process.env.WORKMESH_EXECUTION_WAITS_ENABLED = 'true'
    fixture = await createExecutionRecoveryFixture()
  })
  afterAll(async () => {
    if (fixture) await fixture.close()
    if (previousWaits === undefined) delete process.env.WORKMESH_EXECUTION_WAITS_ENABLED
    else process.env.WORKMESH_EXECUTION_WAITS_ENABLED = previousWaits
  })

  it('具名 SDK/MCP 读取 Plan/context/批准/恢复，Lease 心跳续租释放保持准确 version', async () => {
    const execution = await fixture.createExecution('M1 named lifecycle')
    const mcp = await fixture.connect('read-write', execution)
    const session = await execution.client.getSession<{ revision: number }>(execution.sessionId)
    const stepId = randomUUID()
    await execution.client.publishPlan(execution.sessionId, { changeSummary: 'M1 immutable plan', steps: [{ id: stepId, title: 'Verify lifecycle', status: 'completed', ordinal: 0, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }, { ifMatch: session.revision, idempotencyKey: randomUUID() })
    expect((await execution.client.listSessions()).items.map(item => item.id)).toEqual([execution.sessionId])
    expect((await execution.client.listPlanVersions(execution.sessionId)).items).toHaveLength(1)
    expect(await tool(mcp, 'get_session_context', { id: execution.sessionId })).toMatchObject({ session: { id: execution.sessionId } })
    expect(await tool(mcp, 'list_session_plan_versions', { sessionId: execution.sessionId })).toMatchObject({ items: [{ revision: 1 }], nextCursor: null })
    expect(await tool(mcp, 'list_approvals', { sessionId: execution.sessionId })).toMatchObject({ items: [], nextCursor: null })
    expect(await tool(mcp, 'list_recovery_items', { sessionId: execution.sessionId, condition: 'lease_lost' })).toMatchObject({ items: [], nextCursor: null })
    const acquired = await execution.client.acquireLease<{ id: string; version: number }>({ sessionId: execution.sessionId, resourceType: 'work_item', resourceId: execution.workItemId, ttlSeconds: 300, reason: 'M1 lease lifecycle' }, { idempotencyKey: randomUUID() })
    const heartbeatKey = randomUUID()
    const beforeHeartbeat = (await fixture.db.query<{ count: string }>('SELECT count(*)::text AS count FROM domain_events')).rows[0]!.count
    const heartbeat = await tool<{ version: number; revision: number }>(mcp, 'heartbeat_lease', { leaseId: acquired.id, sessionId: execution.sessionId, idempotencyKey: heartbeatKey })
    expect(heartbeat).toMatchObject({ version: acquired.version, revision: acquired.version })
    await tool(mcp, 'heartbeat_lease', { leaseId: acquired.id, sessionId: execution.sessionId, idempotencyKey: heartbeatKey })
    expect((await fixture.db.query<{ count: string }>('SELECT count(*)::text AS count FROM domain_events')).rows[0]!.count).toBe(beforeHeartbeat)
    const renewed = await tool<{ version: number }>(mcp, 'renew_lease', { leaseId: acquired.id, sessionId: execution.sessionId, version: acquired.version, ttlSeconds: 300, idempotencyKey: randomUUID() })
    expect(renewed.version).toBe(acquired.version + 1)
    expect((await execution.client.listLeases()).items).toEqual(expect.arrayContaining([expect.objectContaining({ id: acquired.id, version: renewed.version })]))
    await expect(execution.client.releaseLease(acquired.id, { reason: 'Stale must reject' }, { ifMatch: acquired.version, idempotencyKey: randomUUID() })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    const released = await tool<{ status: string; version: number }>(mcp, 'release_lease', { leaseId: acquired.id, sessionId: execution.sessionId, version: renewed.version, reason: 'Done', idempotencyKey: randomUUID() })
    expect(released).toMatchObject({ status: 'released', version: renewed.version + 1 })
    const recovery = await execution.client.listRecoveryItems({ sessionId: execution.sessionId, condition: 'lease_lost' })
    expect(recovery.items).toHaveLength(1)
    const recoveryId = recovery.items[0]!.id
    expect(await execution.client.getRecoveryItem(recoveryId)).toMatchObject({ id: recoveryId, condition: 'lease_lost' })
    expect(await tool(mcp, 'get_recovery_item', { recoveryId })).toMatchObject({ id: recoveryId, condition: 'lease_lost' })
    saveExecutionEvidence('named-lifecycle.json', { sessionId: execution.sessionId, leaseId: acquired.id, heartbeat, renewed, released })
  })

  it.each(['complete', 'stop_ack'] as const)('%s 丢响应后普通终态 E 拒绝，原 Connection 确认零事实，提前 refresh 的其他 Connection 拒绝', async action => {
    const execution = await fixture.createExecution(`M1 exact origin ${action}`)
    const second = await fixture.pairSameAgent()
    const [firstContext, secondContext] = await Promise.all([
      fixture.connect('read-only').then(client => tool<{ identity: { actorId: string }; team: { id: string } }>(client, 'get_workmesh_context', {})),
      fixture.connect('read-only', undefined, second.token).then(client => tool<{ identity: { actorId: string }; team: { id: string } }>(client, 'get_workmesh_context', {})),
    ])
    expect(firstContext.identity.actorId).toBe(secondContext.identity.actorId)
    expect(firstContext.team.id).toBe(fixture.teamId)
    expect(secondContext.team.id).toBe(fixture.teamId)
    const otherExecution = await fixture.refreshExecution(execution, second.token)
    expect(await otherExecution.client.getSession(execution.sessionId)).toMatchObject({ id: execution.sessionId })
    const key = randomUUID()
    const current = await execution.client.getSession<{ revision: number }>(execution.sessionId)
    let revision = current.revision
    if (action === 'stop_ack') {
      const stopped = await fixture.human<{ revision: number }>('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'M1 controlled cleanup' }, revision)
      revision = stopped.revision
    }
    const lost = failingAfterCommit(execution.token, action === 'complete' ? '/complete' : '/stop-ack')
    const stopBody = { cleanupSummary: 'Only owned resources cleaned', residualRisks: ['External residue is unverified'] }
    const options = { ifMatch: revision, idempotencyKey: key }
    await expect(action === 'complete' ? lost.complete(execution.sessionId, completeBody, options) : lost.stopAcknowledgement(execution.sessionId, stopBody, options)).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    await expect(action === 'complete' ? execution.client.complete(execution.sessionId, completeBody, options) : execution.client.stopAcknowledgement(execution.sessionId, stopBody, options)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' })
    await expect(execution.client.getSession(execution.sessionId)).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' })
    const before = await fixture.facts()
    const confirmed = await fixture.coordination.getSessionExecutionResult(execution.sessionId, { action, operationKey: key })
    expect(confirmed).toMatchObject({ action: { confirmation: 'confirmed' }, originalResult: { sessionId: execution.sessionId, state: action === 'complete' ? 'completed' : 'canceled' } })
    if (action === 'stop_ack') expect(confirmed.cleanup).toEqual(stopBody)
    else expect(confirmed.cleanup).toBeNull()
    const reconnect = await fixture.connect('read-only')
    expect(await tool<AgentSessionExecutionResult>(reconnect, 'get_session_execution_result', { sessionId: execution.sessionId, action, operationKey: key })).toEqual(confirmed)
    await expect(second.client.getSessionExecutionResult(execution.sessionId, { action, operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(fixture.coordination.getSessionExecutionResult(execution.sessionId, { action: action === 'complete' ? 'stop_ack' : 'complete', operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(fixture.coordination.getSessionExecutionResult(randomUUID(), { action, operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await fixture.facts()).toEqual(before)
    await fixture.restart()
    expect(await fixture.coordination.getSessionExecutionResult(execution.sessionId, { action, operationKey: key })).toEqual(confirmed)
    saveExecutionEvidence(`origin-double-connection-${action}.json`, { sessionId: execution.sessionId, firstConnectionId: fixture.connectionId, otherConnectionId: second.id,
      sourceSetup: 'Explicit privileged second Connection alias: public same agentSlug/Team creation has a unique constraint; real current HTTP validates both live contexts and refreshes',
      firstContext, secondContext, key, confirmed, before, after: await fixture.facts() })
  })

  it('同 Agent 双 native 安装只允许实际原 E 来源，旧 null/unproven 和撤权均关闭', async () => {
    const execution = await fixture.createExecution('M1 native exact origin')
    const [first, second] = await Promise.all([fixture.nativeInstallation(), fixture.nativeInstallation()])
    const original = await fixture.refreshExecution(execution, first.token)
    const foreign = await fixture.refreshExecution(execution, second.token)
    expect(await foreign.client.getSession(execution.sessionId)).toMatchObject({ id: execution.sessionId })
    const session = await original.client.getSession<{ revision: number }>(execution.sessionId)
    const key = randomUUID()
    await original.client.complete(execution.sessionId, completeBody, { ifMatch: session.revision, idempotencyKey: key })
    const before = await fixture.facts()
    expect(await first.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).toMatchObject({ action: { confirmation: 'confirmed' } })
    await expect(second.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await fixture.facts()).toEqual(before)
    await fixture.db.query('DELETE FROM agent_session_tokens WHERE session_id=$1', [execution.sessionId])
    expect(await first.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).toMatchObject({ action: { confirmation: 'confirmed' } })
    await fixture.db.query(`UPDATE api_idempotency_keys SET execution_source_kind='unproven',execution_installation_token_id=NULL,execution_connection_id=NULL WHERE idempotency_key=$1`, [key])
    await expect(first.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await fixture.db.query(`UPDATE api_idempotency_keys SET execution_source_kind=NULL,execution_session_id=NULL,execution_session_token_id=NULL,execution_installation_token_id=NULL,execution_connection_id=NULL WHERE idempotency_key=$1`, [key])
    await expect(first.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await fixture.db.query('UPDATE agent_installation_tokens SET revoked_at=now() WHERE id=$1', [first.id])
    await expect(first.client.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: key })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    saveExecutionEvidence('origin-double-native.json', { sessionId: execution.sessionId, firstInstallationId: first.id, otherInstallationId: second.id, sourceSetup: 'Explicit privileged test fixture; no public second-native issuance endpoint', tokenDeletionConfirmed: true, unprovenRejected: true, revokedRejected: true })
  })

  it.each(['awaiting_approval', 'awaiting_input', 'blocked'] as const)('真实 Pi %s 公开结算→Human 准确触发→唯一续 Turn/新 Attempt→完成', async state => {
    const execution = await fixture.createExecution(`M1 Pi wait ${state}`)
    await execution.client.acquireLease({ sessionId: execution.sessionId, resourceType: 'work_item', resourceId: execution.workItemId, reason: 'M1 Pi owned lease', ttlSeconds: 300 }, { idempotencyKey: randomUUID() })
    let approval: { id: string; actionPayloadHash: string } | undefined
    if (state === 'awaiting_approval') {
      const payload = { action: 'm1-lifecycle-approval' }
      const actual = await execution.client.requestApproval({ sessionId: execution.sessionId, approvalType: 'm1_fixture', actionName: 'M1 approved lifecycle', actionPayloadSanitized: payload,
        actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`, riskLevel: 'low', rationaleSummary: 'Real approval producer-to-wait persistence conformance', expiresAt: new Date(Date.now() + 600_000).toISOString() }, { idempotencyKey: randomUUID() }) as unknown as { id: string; action_payload_hash: string }
      // Use the producer's original returned hash, never a second hand-written fixture.
      expect(actual.action_payload_hash).toMatch(/^sha256:[a-f0-9]{64}$/)
      approval = { id: actual.id, actionPayloadHash: actual.action_payload_hash }
      expect(await execution.client.getApproval(actual.id)).toMatchObject({ action_payload_hash: approval.actionPayloadHash })
      const reads = await fixture.connect('read-only', execution)
      expect(await tool(reads, 'get_approval', { approvalId: actual.id })).toMatchObject({ id: actual.id, action_payload_hash: approval.actionPayloadHash })
    }
    const pi = await fixture.createPi(execution, { state, reason: 'M1 waits for a precise Human trigger', approval })
    await pi.run('wait')
    const waiting = await snapshotWait(execution.sessionId)
    expect(waiting.waits).toHaveLength(1)
    expect(waiting.waits[0]).toMatchObject({ status: 'pending', source_turn_id: pi.turnId, continuation_turn_id: null })
    expect(waiting.turns).toEqual([{ id: pi.turnId, status: 'settled' }])
    expect(waiting.attempts).toHaveLength(1)
    expect(waiting.attempts[0]?.status).toBe('settled')
    expect(waiting.leases.every(lease => lease.status !== 'active')).toBe(true)
    expect(pi.captures[0]?.tools).toContain('workmesh_wait')
    const publicReplies = await fixture.db.query<{ content_markdown: string }>("SELECT content_markdown FROM workbench_messages WHERE turn_id=$1 AND role='assistant'", [pi.turnId])
    expect(publicReplies.rows[0]?.content_markdown.length).toBeGreaterThan(0)
    const publicMessages = await fixture.human<{ items: Array<{ turn_id: string; role: string; content_markdown: string }> }>('GET', `/api/v1/workbench/conversations/${pi.conversationId}/messages`)
    expect(publicMessages.items).toEqual(expect.arrayContaining([expect.objectContaining({ turn_id: pi.turnId, role: 'assistant', content_markdown: publicReplies.rows[0]!.content_markdown })]))
    const worker = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-wait-${randomUUID()}` })
    expect(await worker.reconcileWorkbenchWaits()).toBe(0)
    // Restart monitor has no model call or another Attempt. One real waiting case
    // crosses the unchanged two-minute per-model-Turn ceiling.
    if (state === 'awaiting_input') {
      await pi.run('wait')
      const captureCount = pi.captures.length
      await new Promise(done => setTimeout(done, 121_000))
      expect(pi.captures).toHaveLength(captureCount)
      expect(await snapshotWait(execution.sessionId)).toEqual(waiting)
    }
    if (approval) {
      const current = await execution.client.getApproval(approval.id)
      await fixture.human('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'M1 Human permits exact action' }, current.revision)
    } else await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/prompt`, { bodyMarkdown: 'M1 precise Session input: continue now.' })
    const concurrent = await Promise.all([worker.reconcileWorkbenchWaits(), worker.reconcileWorkbenchWaits()])
    expect(concurrent.reduce((sum, changed) => sum + changed, 0)).toBe(1)
    expect(await worker.reconcileWorkbenchWaits()).toBe(0)
    const resumed = await snapshotWait(execution.sessionId)
    expect(resumed.waits[0]).toMatchObject({ status: 'continued', continuation_turn_id: expect.any(String) })
    expect(resumed.turns).toHaveLength(2)
    expect(resumed.attempts).toHaveLength(1)
    const legacyTurns = await fetch(`${fixture.baseUrl}/api/v1/agent-sessions/${execution.sessionId}/workbench-turns`, { headers: { authorization: `Bearer ${execution.token}`, 'x-workmesh-runner-token': process.env.WORKMESH_RUNNER_SERVICE_TOKEN! } })
    expect(legacyTurns.ok).toBe(true)
    expect((await legacyTurns.json() as { items: unknown[] }).items).toHaveLength(0)
    await pi.run('continue')
    const completed = await fixture.human<{ state: string }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)
    expect(completed.state).toBe('completed')
    const final = await snapshotWait(execution.sessionId)
    expect(final.attempts).toHaveLength(2)
    expect(final.attempts.every(attempt => attempt.status === 'settled')).toBe(true)
    expect(final.turns.every(turn => turn.status === 'settled')).toBe(true)
    expect(approval ? final.waits[0]?.approval_action_payload_hash : null).toBe(approval?.actionPayloadHash ?? null)
    const internalCompletion = (await fixture.db.query<{ idempotency_key: string }>("SELECT idempotency_key FROM domain_events WHERE session_id=$1 AND event_type='agent.session.completed'", [execution.sessionId])).rows[0]!
    await expect(fixture.coordination.getSessionExecutionResult(execution.sessionId, { action: 'complete', operationKey: internalCompletion.idempotency_key })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await fixture.human('GET', `/api/v1/agent-sessions/${execution.sessionId}/execution-result?action=complete&operationKey=${encodeURIComponent(internalCompletion.idempotency_key)}`)).toMatchObject({ action: { confirmation: 'unavailable', unavailableReason: 'receipt_missing' } })
    saveExecutionEvidence(`pi-wait-${state}.json`, { sessionId: execution.sessionId, waiting, resumed, final, captures: pi.captures, completion: completed, usedOriginalReturnedApprovalHash: approval?.actionPayloadHash ?? null })
  })

  it.each(['prompt', 'approval'] as const)('真实 Pi 提前排队→等待→%s→复用 Turn 获得完整上下文并完成', async trigger => {
    const execution = await fixture.createExecution(`M1 queued continuation ${trigger}`)
    let approval: { id: string; actionPayloadHash: string } | undefined
    if (trigger === 'approval') {
      const payload = { action: 'queued-continuation' }
      const actual = await execution.client.requestApproval({ sessionId: execution.sessionId, approvalType: 'm1_fixture',
        actionName: 'queued-continuation', actionPayloadSanitized: payload,
        actionPayloadHash: `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
        riskLevel: 'low', rationaleSummary: 'Queued Turn continuation', expiresAt: new Date(Date.now() + 600_000).toISOString() },
      { idempotencyKey: randomUUID() }) as unknown as { id: string; action_payload_hash: string }
      approval = { id: actual.id, actionPayloadHash: actual.action_payload_hash }
    }
    let queuedId = ''
    const pi = await fixture.createPi(execution, { state: approval ? 'awaiting_approval' : 'awaiting_input', reason: 'Wait after early queued input', approval }, async conversationId => {
      expect((await snapshotWait(execution.sessionId)).turns[0]?.status).toBe('running')
      const conversation = await fixture.human<{ revision: number }>('GET', `/api/v1/workbench/conversations/${conversationId}`)
      const queued = await fixture.human<{ turn: { id: string } }>('POST', `/api/v1/workbench/conversations/${conversationId}/turns`,
        { messageMarkdown: 'Early queued user request before waiting.' }, conversation.revision)
      queuedId = queued.turn.id
    })
    await pi.run('wait')
    const waiting = await snapshotWait(execution.sessionId)
    expect(waiting.turns).toHaveLength(2)
    const publicReply = (await fixture.db.query<{ content_markdown: string }>(
      "SELECT content_markdown FROM workbench_messages WHERE turn_id=$1 AND role='assistant'", [pi.turnId])).rows[0]!.content_markdown
    const worker = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-queued-${randomUUID()}` })
    expect(await worker.reconcileWorkbenchWaits()).toBe(0)
    const triggerText = 'Accurate later prompt for queued continuation.'
    if (approval) {
      const current = await execution.client.getApproval(approval.id)
      await fixture.human('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'Approve exact queued continuation' }, current.revision)
    } else await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/prompt`, { bodyMarkdown: triggerText })
    expect((await Promise.all([worker.reconcileWorkbenchWaits(), worker.reconcileWorkbenchWaits()])).reduce((sum, count) => sum + count, 0)).toBe(1)
    expect((await snapshotWait(execution.sessionId)).waits[0]?.continuation_turn_id).toBe(queuedId)
    expect((await snapshotWait(execution.sessionId)).turns).toHaveLength(2)
    expect((await fixture.db.query("SELECT id FROM domain_events WHERE aggregate_id=$1 AND event_type='workbench.turn.queued'", [queuedId])).rowCount).toBe(1)
    await pi.run('continue')
    const received = pi.captures.find(capture => capture.phase === 'continue')!.receivedMessages
    expect(received).toContain(publicReply)
    expect(received).toContain(approval ? approval.id : triggerText)
    const final = await snapshotWait(execution.sessionId)
    expect(final.turns).toHaveLength(2); expect(final.attempts).toHaveLength(2)
    expect(final.turns.every(turn => turn.status === 'settled')).toBe(true)
    expect(final.attempts.every(attempt => attempt.status === 'settled')).toBe(true)
    expect(await fixture.human('GET', `/api/v1/agent-sessions/${execution.sessionId}`)).toMatchObject({ state: 'completed' })
    saveExecutionEvidence(`review-queued-${trigger}.json`, { waiting, final, queuedId, captures: pi.captures })
  })

  it.each(['prompt-to-prompt', 'prompt-to-message', 'message-to-message'] as const)('失效旧输入 %s 不遮挡另一合法 Human 的真实 Pi 唯一续接', async path => {
    const execution = await fixture.createExecution(`M1 revoked input ${path}`)
    const pi = await fixture.createPi(execution, { state: 'awaiting_input', reason: 'Wait for authorized input' })
    await pi.run('wait')
    const workspaceId = (await fixture.db.query<{ workspace_id: string }>('SELECT workspace_id FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]!.workspace_id
    // Explicit privileged adversarial setup: the old author was a legal Team
    // member when posting, then loses membership before reconciliation.
    const oldHuman = (await fixture.db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name,email,password_hash,workspace_role) VALUES($1,'human','Old input author',$2,'fixture-only','member') RETURNING id", [workspaceId, `${randomUUID()}@m1.test`])).rows[0]!.id
    await fixture.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')", [workspaceId, fixture.teamId, oldHuman])
    let obsoleteId: string
    if (path.startsWith('prompt')) {
      obsoleteId = (await fixture.db.query<{ id: string }>('INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3) RETURNING id', [execution.sessionId, oldHuman, 'Obsolete prompt.'])).rows[0]!.id
      await fixture.db.query(`INSERT INTO domain_events(workspace_id,team_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id,session_id,payload)
        VALUES($1,$2,'agent.session.prompted','agent_session',$3,$4,$5,$3,$6)`,
      [workspaceId, fixture.teamId, execution.sessionId, oldHuman, randomUUID(), { promptId: obsoleteId }])
    } else {
      obsoleteId = (await fixture.db.query<{ id: string }>(`INSERT INTO workbench_messages(workspace_id,conversation_id,sequence,role,author_actor_id,content_markdown)
        SELECT workspace_id,id,next_message_sequence,'user',$2,'Obsolete message.' FROM workbench_conversations WHERE id=$1 RETURNING id`, [pi.conversationId, oldHuman])).rows[0]!.id
      await fixture.db.query('UPDATE workbench_conversations SET next_message_sequence=next_message_sequence+1 WHERE id=$1', [pi.conversationId])
    }
    await fixture.db.query('DELETE FROM memberships WHERE actor_id=$1', [oldHuman])
    const first = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-input-${randomUUID()}` })
    expect(await first.reconcileWorkbenchWaits()).toBe(0)
    let triggerId: string
    const legalText = 'Later input by a currently authorized Human.'
    if (path.endsWith('prompt')) {
      await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/prompt`, { bodyMarkdown: legalText })
      triggerId = (await fixture.db.query<{ id: string }>('SELECT id FROM agent_session_prompts WHERE session_id=$1 AND body_markdown=$2', [execution.sessionId, legalText])).rows[0]!.id
    } else {
      const conversation = await fixture.human<{ revision: number }>('GET', `/api/v1/workbench/conversations/${pi.conversationId}`)
      await fixture.human('POST', `/api/v1/workbench/conversations/${pi.conversationId}/turns`, { messageMarkdown: legalText }, conversation.revision)
      triggerId = (await fixture.db.query<{ id: string }>('SELECT id FROM workbench_messages WHERE conversation_id=$1 AND content_markdown=$2', [pi.conversationId, legalText])).rows[0]!.id
    }
    const restarted = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-input-restart-${randomUUID()}` })
    expect((await Promise.all([first.reconcileWorkbenchWaits(), restarted.reconcileWorkbenchWaits()])).reduce((sum, count) => sum + count, 0)).toBe(1)
    const resumed = await snapshotWait(execution.sessionId)
    expect(resumed.waits[0]).toMatchObject(path.endsWith('prompt') ? { trigger_prompt_id: triggerId, trigger_message_id: null } : { trigger_message_id: triggerId, trigger_prompt_id: null })
    await pi.run('continue')
    expect(pi.captures.find(capture => capture.phase === 'continue')!.receivedMessages).toContain(legalText)
    expect(await restarted.reconcileWorkbenchWaits()).toBe(0)
    const final = await snapshotWait(execution.sessionId)
    expect(final.turns).toHaveLength(2); expect(final.attempts).toHaveLength(2)
    expect(final.attempts.every(attempt => attempt.status === 'settled')).toBe(true)
    expect(await fixture.human('GET', `/api/v1/agent-sessions/${execution.sessionId}`)).toMatchObject({ state: 'completed' })
    saveExecutionEvidence(`review-invalid-input-${path}.json`, { obsoleteId, oldHuman, triggerId, final, captures: pi.captures })
  })

  it('真实 Pi 等待中 Human pause 优先，准确输入不能自动解除 pause，Stop 先提交不续接', async () => {
    const execution = await fixture.createExecution('M1 wait pause Stop')
    const pi = await fixture.createPi(execution, { state: 'blocked', reason: 'M1 needs Human input' })
    await pi.run('wait')
    let current = await execution.client.getSession<{ revision: number }>(execution.sessionId)
    await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'pause', reason: 'M1 Human pause stays authoritative' }, current.revision)
    await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/prompt`, { bodyMarkdown: 'Valid input arrived while paused.' })
    const worker = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-pause-${randomUUID()}` })
    expect(await worker.reconcileWorkbenchWaits()).toBe(0)
    expect((await snapshotWait(execution.sessionId)).turns).toHaveLength(1)
    current = await fixture.human('GET', `/api/v1/agent-sessions/${execution.sessionId}`)
    await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'Stop wins over pending input' }, current.revision)
    await worker.reconcileWorkbenchWaits()
    const stopped = await snapshotWait(execution.sessionId)
    expect(stopped.turns).toHaveLength(1)
    expect(stopped.attempts).toHaveLength(1)
    expect(stopped.attempts[0]?.status).toBe('settled')
    expect(stopped.waits[0]).toMatchObject({ status: 'canceled', continuation_turn_id: null })
    const capturesBefore = pi.captures.length
    await pi.run('continue')
    expect(pi.captures).toHaveLength(capturesBefore)
    expect(await snapshotWait(execution.sessionId)).toEqual(stopped)
    const publicTurns = await fixture.human<{ items: Array<{ id: string; status: string }> }>('GET', `/api/v1/workbench/conversations/${pi.conversationId}/turns`)
    expect(publicTurns.items).toEqual([expect.objectContaining({ id: pi.turnId, status: 'settled' })])
    saveExecutionEvidence('pi-wait-pause-stop.json', { sessionId: execution.sessionId, stopped })
  })

  it('真实 Pi 等待后准确输入已到达，Human 撤 Delegation 优先且不创建续 Turn/Attempt', async () => {
    const execution = await fixture.createExecution('M1 wait revoked before continuation')
    const pi = await fixture.createPi(execution, { state: 'awaiting_input', reason: 'M1 waits for authorized input' })
    await pi.run('wait')
    await fixture.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/prompt`, { bodyMarkdown: 'Accurate input cannot override revoked authority.' })
    const authority = (await fixture.db.query<{ id: string; revision: number }>('SELECT delegation.id,delegation.revision FROM delegations delegation JOIN agent_sessions session ON session.delegation_id=delegation.id WHERE session.id=$1', [execution.sessionId])).rows[0]!
    await fixture.human('POST', `/api/v1/delegations/${authority.id}/revoke`, {}, authority.revision)
    const worker = createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-revoked-${randomUUID()}` })
    expect(await worker.reconcileWorkbenchWaits()).toBe(0)
    const closed = await snapshotWait(execution.sessionId)
    expect(closed.waits[0]).toMatchObject({ status: 'canceled', continuation_turn_id: null })
    expect(closed.turns).toEqual([{ id: pi.turnId, status: 'settled' }])
    expect(closed.attempts).toHaveLength(1)
    expect(closed.attempts[0]?.status).toBe('settled')
    // The public revoke command also revokes issued E Tokens in its transaction;
    // this request therefore fails at authentication before the delegation gate.
    expect((await fixture.db.query<{ revoked: boolean }>(
      'SELECT bool_and(revoked_at IS NOT NULL) AS revoked FROM agent_session_tokens WHERE session_id=$1',
      [execution.sessionId])).rows[0]!.revoked).toBe(true)
    await expect(execution.client.getSession(execution.sessionId)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
    const mcp = await fixture.connect('read-only', execution)
    const rejected = await mcp.callTool({ name: 'get_agent_session', arguments: { id: execution.sessionId } })
    expect(rejected.isError).toBe(true)
    expect(rejected.structuredContent).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(pi.captures).toHaveLength(1)
    expect(await snapshotWait(execution.sessionId)).toEqual(closed)
    saveExecutionEvidence('pi-wait-revoked.json', { sessionId: execution.sessionId, closed, captures: pi.captures, rejected: rejected.structuredContent })
  })

  it('真实 Pi 模型运行期间 Stop 关闭模型与工具，finally 专用 stopAck 保存清理事实', async () => {
    const execution = await fixture.createExecution('M1 Pi controlled Stop')
    const pi = await fixture.createPi(execution, null)
    const runner = await pi.run('stop')
    const session = await fixture.human<{ state: string }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)
    expect(session.state).toBe('canceled')
    const ack = (await fixture.db.query<{ id: string; summary: string; details_markdown: string | null }>("SELECT id,summary,details_markdown FROM agent_activities WHERE session_id=$1 AND kind='stop_ack'", [execution.sessionId])).rows
    expect(ack).toHaveLength(1)
    expect(ack[0]?.summary).toBe('Pi model stopped and the Runner scratch directory cleanup completed.')
    expect(JSON.parse(ack[0]!.details_markdown!)).toEqual([])
    expect((await fixture.db.query("SELECT 1 FROM domain_events WHERE session_id=$1 AND event_type='agent.session.completed'", [execution.sessionId])).rows).toHaveLength(0)
    expect(pi.captures).toHaveLength(1)
    expect(pi.captures[0]?.phase).toBe('stop')
    expect(pi.captures[0]?.returnedToolCalls).toEqual([])
    const resourceRecords = runner.stdout.split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line) as { runnerResource?: { path: string; sessionId: string; status: string } }).flatMap(record => record.runnerResource ? [record.runnerResource] : [])
    expect(resourceRecords).toHaveLength(2)
    expect(resourceRecords.map(resource => resource.status)).toEqual(['created', 'removed'])
    expect(resourceRecords.every(resource => resource.sessionId === execution.sessionId && !existsSync(resource.path))).toBe(true)
    const afterStop = await snapshotWait(execution.sessionId)
    await createSessionLifecycleWorker({ db: fixture.db, workerId: `m1-stop-final-${randomUUID()}` }).reconcileWorkbenchWaits()
    expect(await snapshotWait(execution.sessionId)).toEqual(afterStop)
    saveExecutionEvidence('pi-stop-finally.json', { sessionId: execution.sessionId, session, ack, captures: pi.captures, resourceRecords, afterStop })
  })
})
