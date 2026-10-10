import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createJointClientsFixture } from './joint-clients.fixture.js'
import { fingerprint, saveJointEvidence } from './joint-clients.reporter.js'
import { createDeliveryRecoveryFixture, deliveryCapabilities, sha256 } from './delivery-recovery.fixture.js'
import type { ProviderActionProjection, ReviewDelegationResponse } from '@workmesh/contracts'
import { canonicalMergeApprovalPayload } from '@workmesh/domain'
import { tokenHash } from '@workmesh/db'
import { mutate } from '../../../apps/api/src/commands.js'
import { agentMutate } from '../../../apps/api/src/agent/commands.js'
import { assertAgentPrincipalInTx, loadAgentSessionForMutation } from '../../../apps/api/src/agent/guard.js'
import type { ApiActor } from '../../../apps/api/src/agent/types.js'

let f: Awaited<ReturnType<typeof createJointClientsFixture>>
describe('M5 真实Pi单toolCall受限传输重放', () => {
  beforeAll(async () => { f = await createJointClientsFixture() })
  afterAll(async () => { if (f) await f.close() })
  it('活跃workspace admin无membership仍合法；principal共享锁使删除在事务提交后生效', async () => {
    const admin = await f.createExecution('M5 admin without Team membership')
    const membership = (await f.db.query<{ workspace_id: string; role: string }>(
      'SELECT workspace_id,role FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, f.humanActorId],
    )).rows[0]
    try {
      await f.db.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, f.humanActorId])
      const result = await admin.client.createDocument({ ownerType: 'work_item', ownerId: admin.workItemId, title: 'Admin positive', markdown: 'Current admin authority' })
      expect(result.id).toBeTruthy()
      saveJointEvidence('review-admin-membership-positive.json', { sessionId: admin.sessionId, documentId: result.id, actualREST: true, principalWorkspaceAdmin: true, teamMembershipAbsent: true, actualModel: false })
    } finally {
      if (membership) await f.db.query('INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,$4)', [membership.workspace_id, f.teamId, f.humanActorId, membership.role])
    }
    const h2 = await f.secondHuman(), connection = await f.pairClient('pi', undefined, h2.id)
    const execution = await f.createClientExecution(connection, 'M5 membership serializes commit')
    const row = (await f.db.query<{ agent_actor_id: string; workspace_id: string }>('SELECT agent_actor_id,workspace_id FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]!
    const actor: ApiActor = { id: row.agent_actor_id, workspaceId: row.workspace_id, kind: 'agent', displayName: 'M5', workspaceRole: 'member', csrfToken: '', agentSessionId: execution.sessionId, credentialHash: tokenHash(execution.token) }
    const authority = await f.db.connect(), withdrawal = await f.db.connect()
    let deletion: Promise<unknown> | undefined
    try {
      await authority.query('BEGIN')
      await assertAgentPrincipalInTx(authority, actor)
      const pid = (await withdrawal.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid
      deletion = withdrawal.query('DELETE FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3', [row.workspace_id, f.teamId, h2.id])
      let blockers: number[] = []
      for (let count = 0; count < 100 && !blockers.length; count++) {
        blockers = (await authority.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [pid])).rows[0]!.blockers
        if (!blockers.length) await new Promise<void>(done => setTimeout(done, 10))
      }
      expect(blockers.length).toBeGreaterThan(0)
      await authority.query('COMMIT')
      await deletion
      await authority.query('BEGIN')
      await expect(assertAgentPrincipalInTx(authority, actor)).rejects.toMatchObject({ code: 'DELEGATION_NOT_ACTIVE' })
      saveJointEvidence('review-membership-transaction-lock.json', { sessionId: execution.sessionId, withdrawalBackend: pid, actualBlockers: blockers, deletionCommittedOnlyAfterAuthorityCommit: true, nextTransactionRejected: true })
    } finally {
      await authority.query('ROLLBACK')
      await deletion
      authority.release(); withdrawal.release()
      await f.db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer') ON CONFLICT DO NOTHING", [row.workspace_id, f.teamId, h2.id])
    }
  })
  it.each(['document', 'plan', 'room'] as const)('新增完整header指纹：%s首commit失响应→Runner原请求回执→模型实收，业务effect一次', async kind => {
    const execution = await f.createExecution(`M5 ${kind} original request`)
    const room = kind === 'room' ? await execution.client.getRoom<{ id: string }>({ workItemId: execution.workItemId }) : undefined
    const revision = (await execution.client.getSession<{ revision: number }>(execution.sessionId)).revision
    const step = randomUUID()
    const path = kind === 'document' ? '/api/v1/documents' : kind === 'plan' ? `/api/v1/agent-sessions/${execution.sessionId}/plan` : `/api/v1/rooms/${room!.id}/messages`
    const proxy = await f.lossProxy(f.baseUrl, (value, method) => value === path && method !== 'GET')
    const name = kind === 'document' ? 'workmesh_create_document' : kind === 'plan' ? 'workmesh_publish_plan' : 'workmesh_send_room_message'
    const args = kind === 'document' ? { ownerType: 'work_item', ownerId: execution.workItemId, title: `M5 ${kind}`, markdown: '原事务证据' }
      : kind === 'plan' ? { ifMatch: revision, changeSummary: 'M5 original plan', steps: [{ id: step, title: 'Exact step', ordinal: 0, status: 'pending' }] }
      : { roomId: room!.id, intent: 'status', body: 'M5 original room message' }
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name, arguments: args })], { apiUrl: proxy.url })
    expect(proxy.observed).toHaveLength(2)
    const [first, second] = proxy.observed
    expect(first).toMatchObject({ responseLost: true, status: 200 })
    expect(second).toMatchObject({ responseLost: false, method: first!.method, path: first!.path, bodyHash: first!.bodyHash, headersHash: first!.headersHash, key: first!.key, revision: first!.revision, eHash: first!.eHash })
    expect(captures.filter(capture => capture.call?.name === name)).toHaveLength(1)
    expect(captures.at(-1)!.results).toHaveLength(1)
    const result = JSON.parse(JSON.parse(captures.at(-1)!.results[0]!) as string) as Record<string, unknown>
    expect(result.error).toBeUndefined()
    const receipts = (await f.db.query('SELECT count(*)::int AS count FROM api_idempotency_keys WHERE idempotency_key=$1', [first!.key])).rows[0]!
    expect(receipts.count).toBe(1)
    const effectTable = kind === 'document' ? 'documents' : kind === 'plan' ? 'agent_plan_versions' : 'room_messages'
    const effectId = kind === 'plan' ? (await execution.client.getPlan<{ id: string }>(execution.sessionId)).id : result.id
    expect((await f.db.query(`SELECT count(*)::int AS count FROM ${effectTable} WHERE id=$1`, [effectId])).rows[0]!.count).toBe(1)
    const effectCount = kind === 'document'
      ? (await f.db.query('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1 AND title=$2', [execution.workItemId, `M5 ${kind}`])).rows[0]!.count
      : kind === 'plan' ? (await f.db.query('SELECT count(*)::int AS count FROM agent_plan_versions WHERE session_id=$1', [execution.sessionId])).rows[0]!.count
        : (await f.db.query('SELECT count(*)::int AS count FROM room_messages WHERE channel_id=$1 AND body=$2', [room!.id, 'M5 original room message'])).rows[0]!.count
    expect(effectCount).toBe(1)
    const events = (await f.db.query('SELECT event.event_type,event.aggregate_id,event.id,outbox.id AS outbox_id FROM domain_events event JOIN outbox_events outbox ON outbox.domain_event_id=event.id WHERE event.idempotency_key=$1', [first!.key])).rows
    expect(events.length).toBeGreaterThan(0)
    expect(new Set(events.map(event=>event.event_type)).size).toBe(events.length)
    saveJointEvidence(`pi-original-${kind}.json`, { kind, sessionId: execution.sessionId, captures, requests: proxy.observed, receipts, events, effectId, effectCount, actualPiProcess: true, protocolReplay: false })
  })
  it.each(['timeout', 'body'] as const)('真实Pi %s丢响应：原工具第二HTTP及原回执', async lossMode => {
    const execution = await f.createExecution(`M5 actual ${lossMode}`)
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', { lossMode })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: lossMode, markdown: '真实流／超时恢复' } })], { apiUrl: proxy.url })
    expect(proxy.observed).toHaveLength(2)
    expect(proxy.observed[1]).toMatchObject({ key: proxy.observed[0]!.key, bodyHash: proxy.observed[0]!.bodyHash, eHash: proxy.observed[0]!.eHash })
    expect(captures.at(-1)!.results[0]).not.toContain('error')
    saveJointEvidence(`pi-actual-${lossMode}.json`, { captures, requests: proxy.observed, actualPiProcess: true })
  })
  it('API真实PID重启：保原Runner/Attempt/DB/port及请求预算后重放原事务', async () => {
    const execution = await f.createExecution('M5 real API restart')
    let api = await f.startApi(); const beforePid = api.child.pid, port = Number(new URL(api.url).port)
    const proxy = await f.lossProxy(api.url, (path, method) => path === '/api/v1/documents' && method === 'POST', { afterFirstCommit: async () => { await api.stop(); api = await f.startApi(port) } })
    try {
      const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'API restart', markdown: 'durable original response' } })], { apiUrl: proxy.url })
      expect(api.child.pid).not.toBe(beforePid)
      expect(proxy.observed).toHaveLength(2)
      expect(proxy.observed[1]).toMatchObject({ key: proxy.observed[0]!.key, bodyHash: proxy.observed[0]!.bodyHash, eHash: proxy.observed[0]!.eHash })
      expect(captures.at(-1)!.results[0]).not.toContain('error')
      saveJointEvidence('pi-actual-api-restart.json', { beforePid, afterPid: api.child.pid, port, requests: proxy.observed, captures, actualApiProcessRestart: true })
    } finally { await api.stop() }
  })
  it('两次丢响应：真实单toolCall最多两HTTP，保不确定结果且不完成Session', async () => {
    const execution = await f.createExecution('M5 both responses lost')
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', { losses: 2 })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 unreconciled', markdown: 'Committed once; receipt unavailable' } })], { apiUrl: proxy.url })
    expect(proxy.observed).toHaveLength(2)
    expect(proxy.observed[1]).toMatchObject({ key: proxy.observed[0]!.key, bodyHash: proxy.observed[0]!.bodyHash, eHash: proxy.observed[0]!.eHash })
    expect(captures.at(-1)!.results[0]).toContain('RUNNER_TOOL_RESULT_UNRECONCILED')
    const session = await f.human<{ state: string }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)
    expect(session.state).not.toBe('completed')
    const documents = (await f.db.query('SELECT id FROM documents WHERE work_item_id=$1 AND title=$2', [execution.workItemId, 'M5 unreconciled'])).rows
    expect(documents).toHaveLength(1)
    saveJointEvidence('pi-both-responses-lost.json', { captures, requests: proxy.observed, documents, session, originalCausePreserved: 'unit regression separately proves cause identity', thirdSend: false })
  })
  it('首次完整HTTP拒绝：真实Pi模型实收结构化错误，零传输重放及业务写', async () => {
    const execution = await f.createExecution('M5 received denial')
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST')
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: randomUUID(), title: 'M5 denied', markdown: 'No write' } })], { apiUrl: proxy.url })
    expect(proxy.observed).toHaveLength(1)
    expect(proxy.observed[0]!.responseLost).toBe(false)
    expect(proxy.observed[0]!.status).toBeGreaterThanOrEqual(400)
    expect(captures.at(-1)!.results[0]).toContain('correlationId')
    expect((await f.db.query("SELECT count(*)::int AS count FROM documents WHERE title='M5 denied'")).rows[0]!.count).toBe(0)
    saveJointEvidence('pi-first-http-denial.json', { captures, requests: proxy.observed, businessWrites: 0 })
  })
  it('Plan事务outbox故障：完整5xx不重放，Plan/event/outbox/receipt整体回滚', async () => {
    const execution = await f.createExecution('M5 Plan rollback'), step = randomUUID()
    const revision = (await execution.client.getSession<{ revision: number }>(execution.sessionId)).revision
    const before = (await f.db.query('SELECT count(*)::int AS count FROM agent_plan_versions WHERE session_id=$1', [execution.sessionId])).rows[0]!.count
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === `/api/v1/agent-sessions/${execution.sessionId}/plan` && method === 'PUT')
    await f.db.query(`CREATE FUNCTION m5_plan_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM domain_events WHERE id=NEW.domain_event_id AND session_id='${execution.sessionId}'::uuid AND event_type='agent.plan.published') THEN RAISE EXCEPTION 'M5 owned rollback'; END IF; RETURN NEW; END $$`)
    await f.db.query('CREATE TRIGGER m5_plan_rollback BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION m5_plan_rollback()')
    try {
      const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_publish_plan', arguments: { ifMatch: revision, changeSummary: 'M5 rollback', steps: [{ id: step, title: 'Rollback', ordinal: 0, status: 'pending' }] } })], { apiUrl: proxy.url })
      expect(proxy.observed).toHaveLength(1); expect(proxy.observed[0]!.status).toBe(500)
      expect((await f.db.query('SELECT count(*)::int AS count FROM agent_plan_versions WHERE session_id=$1', [execution.sessionId])).rows[0]!.count).toBe(before)
      expect((await f.db.query("SELECT count(*)::int AS count FROM domain_events WHERE session_id=$1 AND event_type='agent.plan.published'", [execution.sessionId])).rows[0]!.count).toBe(0)
      expect((await f.db.query('SELECT count(*)::int AS count FROM api_idempotency_keys WHERE idempotency_key=$1', [proxy.observed[0]!.key])).rows[0]!.count).toBe(0)
      saveJointEvidence('pi-plan-transaction-rollback.json', { captures, requests: proxy.observed, planCountBefore: before, planCountAfter: before, events: 0, receipts: 0 })
    } finally { await f.db.query('DROP TRIGGER m5_plan_rollback ON outbox_events'); await f.db.query('DROP FUNCTION m5_plan_rollback()') }
  })
  it('首commit后Human Stop：真实Runner禁止第二业务HTTP，原E Stop_ACK与持久Lease清理', async () => {
    const execution = await f.createExecution('M5 Stop before replay')
    await execution.client.acquireLease({ sessionId: execution.sessionId, resourceType: 'work_item', resourceId: execution.workItemId, ttlSeconds: 300, reason: 'M5 Stop cleanup' })
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', { afterFirstCommit: async () => {
      const session = await f.human<{ revision: number }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)
      await f.human('POST', `/api/v1/agent-sessions/${execution.sessionId}/signals`, { signal: 'stop', reason: 'M5 first effect committed, no resend' }, session.revision)
    } })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 stop replay', markdown: 'First effect only' } })], { apiUrl: proxy.url })
    expect(proxy.observed).toHaveLength(1)
    const stopAck = proxy.transport.find(row => row.path.endsWith('/stop-ack'))
    expect(stopAck?.status).toBe(200)
    expect(stopAck?.eHash).toBe(proxy.observed[0]!.eHash)
    expect((await f.db.query("SELECT count(*)::int AS count FROM leases WHERE session_id=$1 AND status='active'", [execution.sessionId])).rows[0]!.count).toBe(0)
    expect((await f.human<{ state: string }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)).state).toBe('canceled')
    saveJointEvidence('pi-stop-before-replay.json', { captures, requests: proxy.observed, transport: proxy.transport, secondBusinessSend: false, modelErrorAfterStop: 'not required; lifecycle cancels model', activeLeases: 0 })
  })
  it.each(['R-first', 'P-first'] as const)('%s 同一owner/Session准确E合法竞争：Pi真实Attempt与协议客户端stale revision分列', async order => {
    const connection = await f.pairClient('pi'), execution = await f.createClientExecution(connection, `M5 same Session ${order}`), step = randomUUID()
    const revision = (await execution.client.getSession<{ revision: number }>(execution.sessionId)).revision
    const body = { changeSummary: 'Same owner first intent', steps: [{ id: step, title: 'Stable step', ordinal: 0, status: 'pending' as const, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }
    let protocolConflict: unknown
    const captures = await f.pi(execution, connection.token, [async () => {
      const attempt = (await f.db.query("SELECT status FROM workbench_runner_attempts WHERE agent_session_id=$1 ORDER BY created_at DESC LIMIT 1", [execution.sessionId])).rows[0]!
      expect(attempt.status).toBe('running')
      if (order === 'R-first') await execution.client.publishPlan(execution.sessionId, body, { ifMatch: revision })
      return { name: 'workmesh_publish_plan', arguments: { ...body, ifMatch: revision } }
    }, async () => {
      if (order === 'P-first') {
        try { await execution.client.publishPlan(execution.sessionId, body, { ifMatch: revision }) } catch (error) { protocolConflict = error; expect(error).toMatchObject({ code: 'REVISION_CONFLICT' }) }
        expect(protocolConflict).toBeDefined()
      }
      return { name: 'workmesh_get_session_plan', arguments: {} }
    }, async () => ({ name: 'workmesh_publish_plan', arguments: { ifMatch: (await execution.client.getSession<{ revision: number }>(execution.sessionId)).revision, changeSummary: 'Explicit new intent merged latest', steps: [{ id: step, title: 'Stable step', ordinal: 0, status: 'completed' }] } })])
    if (order === 'R-first') expect(captures.at(-1)!.results[0]).toContain('REVISION_CONFLICT')
    for (const capture of captures) if (capture.call) expect(capture.tools).toContain(capture.call.name)
    expect(captures.at(-1)!.results[1]).not.toContain('error')
    const plans = (await f.db.query('SELECT id FROM agent_plan_versions WHERE session_id=$1', [execution.sessionId])).rows
    expect(plans).toHaveLength(2)
    expect((await execution.client.getPlan<{ steps: Array<{ id: string; status: string }> }>(execution.sessionId)).steps).toContainEqual(expect.objectContaining({ id: step, status: 'completed' }))
    saveJointEvidence(`pi-same-owner-${order}.json`, { captures, sessionId: execution.sessionId, order, plans, protocolConflict: protocolConflict ? 'REVISION_CONFLICT' : null, protocolIdentity: 'same original installation/exact Session E', actualOpenCode: false, fullF5: false })
  })
  it('真实Pi首commit后经Human REST撤Delegation：原E拒绝、零第二业务HTTP、不确定结果保全', async () => {
    const connection = await f.pairClient('pi'), execution = await f.createClientExecution(connection, 'M5 real membership revoke')
    let revoked = false
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      afterFirstCommit: async () => {
        const delegation = (await f.db.query<{ id: string; revision: number }>('SELECT d.id,d.revision FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id WHERE s.id=$1', [execution.sessionId])).rows[0]!
        await f.human('POST', `/api/v1/delegations/${delegation.id}/revoke`, {}, delegation.revision)
        revoked = true
      },
    })
    const captures = await f.pi(execution, connection.token, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 real member', markdown: 'Original committed business fact' } })], {
        apiUrl: proxy.url,
      })
      saveJointEvidence('pi-delegation-revoke-observation.json', { revoked, captures, requests: proxy.observed, transport: proxy.transport })
      expect(revoked).toBe(true)
      expect(proxy.observed).toHaveLength(1)
      const refusal = proxy.transport.find(row => row.status >= 400)
      expect(refusal).toBeDefined()
      expect(refusal!.eHash).toBe(proxy.observed[0]!.eHash)
      expect(captures.filter(capture => capture.call?.name === 'workmesh_create_document')).toHaveLength(1)
      expect((await f.db.query('SELECT state FROM agent_sessions WHERE id=$1', [execution.sessionId])).rows[0]!.state).not.toBe('completed')
      const facts = (await f.db.query('SELECT d.status,t.revoked_at FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id JOIN agent_session_tokens t ON t.session_id=s.id WHERE s.id=$1', [execution.sessionId])).rows
      expect(facts.every(row => row.status === 'revoked' && row.revoked_at)).toBe(true)
      saveJointEvidence('pi-delegation-revoke-before-replay.json', { captures, requests: proxy.observed, transport: proxy.transport, facts, preparation: 'Human REST revokeDelegation; original principal and installation unchanged', secondBusinessSend: false, originalPrincipalRetained: true, modelErrorReceived: captures.at(-1)?.results.some(result => result.includes('error')) ?? false })
  })
  it('成员资格删除拒绝原E status/同key回执/新key写；恢复后原回执单事实，Pi保留首次不确定性', async () => {
    const human = await f.secondHuman()
    const connection = await f.pairClient('pi', undefined, human.id)
    const execution = await f.createClientExecution(connection, 'M5 exact membership withdrawal')
    const membership = (await f.db.query<{ workspace_id: string; role: string }>(
      'SELECT workspace_id,role FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, human.id],
    )).rows[0]!
    let deleted = false, restored = false
    const observations: Array<{ kind: string; status: number; originalEHash: string; data: unknown }> = []
    const restore = async () => {
      if (deleted && !restored) {
        await f.db.query('INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,$4)',
          [membership.workspace_id, f.teamId, human.id, membership.role])
        restored = true
      }
    }
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      afterFirstCommit: async () => {
        await f.db.query('DELETE FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
          [membership.workspace_id, f.teamId, human.id])
        deleted = true
      },
      afterResponse: async (path, status) => {
        if (deleted && !restored && path.endsWith('/status')) {
          expect(status).toBeGreaterThanOrEqual(400)
          // Explicit diagnostics are separate from the actual single Pi toolCall.
          observations.push({ kind: 'same-key-denied', ...await proxy.reconcileOriginal(0) })
          observations.push({ kind: 'new-key-denied', ...await proxy.reconcileOriginal(0, randomUUID()) })
          expect(observations.every(row => row.status >= 400)).toBe(true)
          const actor = (await f.db.query<{ id: string; workspace_id: string }>(
            'SELECT agent_actor_id AS id,workspace_id FROM agent_sessions WHERE id=$1', [execution.sessionId],
          )).rows[0]!
          const apiActor: ApiActor = { id: actor.id, workspaceId: actor.workspace_id, kind: 'agent', displayName: 'M5 revoked principal',
            workspaceRole: 'member', csrfToken: '', agentSessionId: execution.sessionId, credentialHash: tokenHash(execution.token) }
          const receipt = (await f.db.query<{ operation: string; request_hash: string }>(
            'SELECT operation,request_hash FROM api_idempotency_keys WHERE actor_id=$1 AND idempotency_key=$2',
            [actor.id, proxy.observed[0]!.key],
          )).rows[0]!
          const context = { actor: apiActor, idempotencyKey: proxy.observed[0]!.key!, correlationId: randomUUID(),
            operation: receipt.operation, requestHash: receipt.request_hash }
          // Bypass route preflight to prove both receipt paths and the post-lock guard independently.
          const mustNotRun = async () => { throw new Error('M5_REPLAY_HANDLER_MUST_NOT_RUN') }
          await expect(mutate(f.db, context, mustNotRun)).rejects.toMatchObject({ code: 'DELEGATION_NOT_ACTIVE' })
          await expect(agentMutate(f.db, context, mustNotRun)).rejects.toMatchObject({ code: 'DELEGATION_NOT_ACTIVE' })
          const tx = await f.db.connect()
          try {
            await tx.query('BEGIN')
            await expect(loadAgentSessionForMutation(tx, apiActor, execution.sessionId)).rejects.toMatchObject({ code: 'DELEGATION_NOT_ACTIVE' })
          } finally { await tx.query('ROLLBACK'); tx.release() }
          await restore()
          observations.push({ kind: 'restored-original-receipt', ...await proxy.reconcileOriginal(0) })
        }
      },
    })
    try {
      const captures = await f.pi(execution, connection.token, [async () => ({ name: 'workmesh_create_document',
        arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 member authority', markdown: 'First commit remains unknown to the failed tool' } })], { apiUrl: proxy.url, contextHuman: human.request })
      expect(deleted && restored).toBe(true)
      expect(proxy.errors).toEqual([])
      expect(proxy.observed).toHaveLength(1)
      expect(proxy.transport.some(row => row.path.endsWith('/status') && row.status >= 400 && row.eHash === proxy.observed[0]!.eHash)).toBe(true)
      expect(observations.at(-1)).toMatchObject({ status: 200, originalEHash: proxy.observed[0]!.eHash })
      expect(captures.at(-1)!.results[0]).toContain('correlationId')
      const effects = (await f.db.query('SELECT id FROM documents WHERE work_item_id=$1', [execution.workItemId])).rows
      expect(effects).toHaveLength(1)
      const events = (await f.db.query('SELECT e.id,e.event_type,o.id AS outbox_id FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id WHERE e.idempotency_key=$1', [proxy.observed[0]!.key])).rows
      expect(events.filter(row => row.event_type === 'document.created')).toHaveLength(1)
      const attempts = (await f.db.query('SELECT status,external_effects_reconciled FROM workbench_runner_attempts WHERE agent_session_id=$1', [execution.sessionId])).rows
      expect(attempts).toEqual([expect.objectContaining({ external_effects_reconciled: false })])
      saveJointEvidence('review-membership-original-e.json', { preparation: 'H2 member/maintainer; same principal, installation and E throughout; privileged membership deletion/restoration only', captures, requests: proxy.observed, transport: proxy.transport, observations, effects, events, attempts, explicitDiagnosticsNotRunnerRetry: true })
    } finally { await restore() }
  })
  it('新增真实Pi：准入后第二业务HTTP明确拒绝，保首commit不确定cause并模型实收', async () => {
    const execution = await f.createExecution('M5 second exact HTTP denial')
    const definition = (await f.db.query<{ id: string; approved_capabilities: string[] }>('SELECT a.id,a.approved_capabilities FROM agent_definitions a JOIN agent_sessions s ON s.agent_id=a.id WHERE s.id=$1', [execution.sessionId])).rows[0]!
    let committed = false, narrowed = false, restored = false
    const restore = async () => { if (narrowed && !restored) { await f.db.query('UPDATE agent_definitions SET approved_capabilities=$2 WHERE id=$1', [definition.id, definition.approved_capabilities]); restored = true } }
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      afterFirstCommit: async () => { committed = true },
      afterResponse: async (path, status) => {
        if (committed && !narrowed && path.endsWith('/status') && status === 200) {
          await f.db.query("UPDATE agent_definitions SET approved_capabilities=array_remove(approved_capabilities,'work:write') WHERE id=$1", [definition.id]); narrowed = true
        }
        if (narrowed && path === '/api/v1/documents' && status >= 400) await restore()
      },
    })
    try {
      const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 second refusal', markdown: 'Committed first, receipt refused later' } })], { apiUrl: proxy.url })
      expect(committed && narrowed && restored).toBe(true)
      expect(proxy.observed).toHaveLength(2)
      expect(proxy.observed[1]).toMatchObject({ key: proxy.observed[0]!.key, bodyHash: proxy.observed[0]!.bodyHash, headersHash: proxy.observed[0]!.headersHash, eHash: proxy.observed[0]!.eHash })
      expect(proxy.observed[1]!.status).toBeGreaterThanOrEqual(400)
      expect(captures.at(-1)!.results[0]).toContain('correlationId')
      expect((await f.db.query('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1', [execution.workItemId])).rows[0]!.count).toBe(1)
      expect((await f.human<{ state: string }>('GET', `/api/v1/agent-sessions/${execution.sessionId}`)).state).not.toBe('completed')
      const attempts = (await f.db.query('SELECT status,external_effects_reconciled,error_code FROM workbench_runner_attempts WHERE agent_session_id=$1', [execution.sessionId])).rows
      expect(attempts).toEqual([expect.objectContaining({ external_effects_reconciled: false })])
      saveJointEvidence('pi-second-http-denial.json', { captures, requests: proxy.observed, transport: proxy.transport, attempts, effectCount: 1, preparation: 'privileged fixture narrows original definition only after successful held-E admission; restores only after actual second HTTP refusal', firstCommitStillUnreconciled: attempts[0]!.external_effects_reconciled === false })
    } finally { await restore() }
  })
  it('新增真实Pi：首commit后原E在服务器到期，原准入401、零第二业务HTTP', async () => {
    const execution = await f.createExecution('M5 original server E expiry')
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      afterFirstCommit: async () => { await f.db.query('UPDATE agent_session_tokens SET expires_at=clock_timestamp() WHERE session_id=$1', [execution.sessionId]) },
    })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 held E expired', markdown: 'One effect remains' } })], { apiUrl: proxy.url })
    saveJointEvidence('pi-server-e-expiry-observation.json', { captures, requests: proxy.observed, transport: proxy.transport, errors: proxy.errors })
    expect(proxy.errors).toEqual([])
    expect(proxy.observed).toHaveLength(1)
    expect(proxy.transport.some(row => row.path.endsWith('/status') && row.key === proxy.observed[0]!.key && row.status === 401 && row.eHash === proxy.observed[0]!.eHash)).toBe(true)
    expect((await f.db.query('SELECT count(*)::int AS count FROM documents WHERE work_item_id=$1', [execution.workItemId])).rows[0]!.count).toBe(1)
    saveJointEvidence('pi-server-e-expiry.json', { captures, requests: proxy.observed, transport: proxy.transport, secondBusinessSend: false, preparation: 'privileged DB fault expires actual original Session credentials after commit; does not add a public TTL setting or refresh identity', localHeldExpiryBoundary: 'separate unit evidence; server expiry here is actual HTTP/DB' })
  })
  it('新增真实Pi：Human只停止当前Turn，Attempt终止但Session仍live，零第二业务HTTP', async () => {
    const execution = await f.createExecution('M5 current Attempt stopped')
    let facts: Record<string, unknown>[] = []
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      afterFirstCommit: async () => {
        const row = (await f.db.query<{ turn_id: string; conversation_id: string; revision: number }>("SELECT a.turn_id,t.conversation_id,c.revision FROM workbench_runner_attempts a JOIN workbench_turns t ON t.id=a.turn_id JOIN workbench_conversations c ON c.id=t.conversation_id WHERE a.agent_session_id=$1 AND a.status='running'", [execution.sessionId])).rows[0]!
        await f.human('POST', `/api/v1/workbench/conversations/${row.conversation_id}/turns/${row.turn_id}/stop`, { stopMode: 'immediate', reason: 'M5 stop only current Turn after first commit' }, row.revision)
        facts = (await f.db.query('SELECT a.status AS attempt_status,t.status AS turn_status,s.state AS session_state FROM workbench_runner_attempts a JOIN workbench_turns t ON t.id=a.turn_id JOIN agent_sessions s ON s.id=a.agent_session_id WHERE a.turn_id=$1', [row.turn_id])).rows
      },
    })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 Attempt ended', markdown: 'No second business send' } })], { apiUrl: proxy.url })
    saveJointEvidence('pi-attempt-ended-observation.json', { captures, requests: proxy.observed, transport: proxy.transport, errors: proxy.errors, facts })
    expect(proxy.errors).toEqual([])
    expect(proxy.observed).toHaveLength(1)
    expect(facts).toEqual([expect.objectContaining({ attempt_status: 'aborted', turn_status: 'stopped', session_state: 'executing' })])
    saveJointEvidence('pi-attempt-ended-before-replay.json', { captures, requests: proxy.observed, transport: proxy.transport, facts, preparation: 'actual Human REST stopMode immediate; Session/Delegation authority not widened', secondBusinessSend: false })
  })
  it('新增真实Pi：后台refresh实际换当前E，原toolCall仍重放冻结旧E与完整headers', async () => {
    const execution = await f.createExecution('M5 background actual Token update')
    const minted: string[] = []
    const proxy = await f.lossProxy(f.baseUrl, (path, method) => path === '/api/v1/documents' && method === 'POST', {
      serializeRecovery: false,
      responseTransform: async (path, data) => {
        if (!path.endsWith('/token/refresh')) return data
        const value = JSON.parse(data.toString()) as { sessionToken: string; expiresAt: string }
        if (!value.sessionToken) return data
        const expiresAt = new Date(Date.now() + 66_000)
        await f.db.query('UPDATE agent_session_tokens SET expires_at=$2 WHERE token_hash=$1', [fingerprint(value.sessionToken), expiresAt])
        minted.push(fingerprint('Bearer ' + value.sessionToken))
        return Buffer.from(JSON.stringify({ ...value, expiresAt: expiresAt.toISOString() }))
      },
      afterFirstCommit: async () => {
        const deadline = Date.now() + 12_000
        while (!proxy.transport.some(row => row.path.endsWith('/status') && row.status === 200 && row.eHash !== proxy.observed[0]!.eHash)) {
          if (Date.now() >= deadline) throw new Error('M5_BACKGROUND_REFRESH_NOT_OBSERVED')
          await new Promise(done => setTimeout(done, 40))
        }
      },
    })
    const captures = await f.pi(execution, f.connectionToken, [async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: execution.workItemId, title: 'M5 original frozen E', markdown: 'Background update cannot replace original identity' } })], { apiUrl: proxy.url })
    expect(minted.length).toBeGreaterThan(1)
    expect(proxy.observed).toHaveLength(2)
    expect(proxy.observed[1]).toMatchObject({ key: proxy.observed[0]!.key, bodyHash: proxy.observed[0]!.bodyHash, headersHash: proxy.observed[0]!.headersHash, eHash: proxy.observed[0]!.eHash })
    expect(proxy.observed[1]!.status).toBe(200)
    expect(captures.at(-1)!.results[0]).not.toContain('error')
    saveJointEvidence('pi-background-token-update.json', { captures, requests: proxy.observed, transport: proxy.transport, mintedHashes: minted, preparation: 'privileged fixture shortens real minted DB expiry and matching response to 66 seconds; ordinary backend contract remains 15 minutes; actual background refresh and new-E status HTTP precede original replay', actualPiProcess: true, originalBusinessIdentityPreserved: true })
  })
  it('两Human/两真实Pi连接：新B Session承接Plan/证据/完成，Handoff旧A E四项拒绝', async () => {
    const h2 = await f.secondHuman()
    const a = await f.pairClient('pi'), b = await f.pairClient('pi')
    await f.attachReceiver(b)
    const source = await f.createClientExecution(a, 'M5 Pi core/Handoff supplementary'), step = randomUUID()
    const captures = await f.pi(source, a.token, [
      async () => ({ name: 'workmesh_get_session', arguments: {} }),
      async () => ({ name: 'workmesh_publish_plan', arguments: { ifMatch: (await source.client.getSession<{ revision: number }>(source.sessionId)).revision, changeSummary: 'M5 A plan', steps: [{ id: step, title: 'Handoff remaining work', ordinal: 0, status: 'pending' }] } }),
      async () => ({ name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: source.workItemId, title: 'M5 core', markdown: '中文上下文\n可见证据' } }),
      async () => ({ name: 'workmesh_list_documents', arguments: { ownerType: 'work_item', ownerId: source.workItemId, limit: 1 } }),
      async () => ({ name: 'workmesh_offer_handoff', arguments: { targetAgentId: b.agentId, summary: 'M5 precise remaining work', remainingWork: ['Own B plan and evidence'], acceptanceCriteria: ['B completed'], requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write', 'message:write'], leaseTransferPolicy: 'release' } }),
    ])
    const handoff = (await f.db.query<{ id: string }>('SELECT id FROM handoffs WHERE from_session_id=$1', [source.sessionId])).rows[0]!
    const accepted = await h2.request<{ session: { id: string } }>('POST', `/api/v1/handoffs/${handoff.id}/accept`, { initialPrompt: 'H2 accepts exact B continuation' })
    const successor = await f.receive(accepted.session.id, b.token), nextStep = randomUUID()
    const nextCaptures = await f.pi(successor, b.token, [
      async () => ({ name: 'workmesh_get_session_context', arguments: {} }),
      async () => ({ name: 'workmesh_publish_plan', arguments: { ifMatch: (await successor.client.getSession<{ revision: number }>(successor.sessionId)).revision, changeSummary: 'B owns new Plan', steps: [{ id: nextStep, title: 'Deliver remaining result', ordinal: 0, status: 'completed' }] } }),
      async () => ({ name: 'workmesh_publish_artifact', arguments: { type: 'test_report', title: 'M5 B evidence', metadata: { result: 'controlled core completed' } } }),
      async () => ({ name: 'workmesh_complete_session', arguments: { ifMatch: (await successor.client.getSession<{ revision: number }>(successor.sessionId)).revision, summary: 'B delivered remaining work', artifactIds: (await f.db.query<{ id: string }>('SELECT id FROM artifacts WHERE session_id=$1', [successor.sessionId])).rows.map(row => row.id) } }),
    ])
    expect((await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${successor.sessionId}`)).state).toBe('completed')
    const delegation = (await f.db.query('SELECT d.status FROM delegations d JOIN agent_sessions s ON s.delegation_id=d.id WHERE s.id=$1', [source.sessionId])).rows[0]!
    expect(delegation.status).toBe('completed')
    const oldRevision = (await f.db.query<{ revision: number }>('SELECT revision FROM agent_sessions WHERE id=$1', [source.sessionId])).rows[0]!.revision
    const requests = [ ['GET', `/api/v1/agent-sessions/${source.sessionId}`, undefined],
      ['PUT', `/api/v1/agent-sessions/${source.sessionId}/plan`, { changeSummary: 'Forbidden old A', steps: [{ id: step, title: 'Still pending', ordinal: 0, status: 'pending' }] }],
      ['POST', '/api/v1/approvals', { sessionId: source.sessionId, approvalType: 'manual', actionName: 'm5.closed-source', actionPayloadSanitized: {}, actionPayloadHash: `sha256:${'0'.repeat(64)}`, riskLevel: 'low', rationaleSummary: 'Rejected old A', expiresAt: new Date(Date.now() + 600000).toISOString() }],
      ['POST', `/api/v1/agent-sessions/${source.sessionId}/complete`, { summary: 'Rejected old A', artifactIds: [], checks: [], limitations: [], noArtifactReason: 'Source delegation completed' }] ] as const
    const denials = []
    for (const [method, path, body] of requests) {
      const response = await fetch(f.baseUrl + path, { method, headers: { authorization: `Bearer ${source.token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'if-match': `"revision-${oldRevision}"` }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const result = await response.json() as { error: { code: string } }
      denials.push({ method, path, status: response.status, result })
      saveJointEvidence('pi-old-source-denials.json', { denials })
      expect(response.ok).toBe(false)
      expect(result.error.code).toBe('DELEGATION_NOT_ACTIVE')
    }
    saveJointEvidence('pi-core-handoff-supplementary.json', { source: { sessionId: source.sessionId, agentId: a.agentId }, successor: { sessionId: successor.sessionId, agentId: b.agentId }, h2: h2.id, captures, nextCaptures, delegation, denials, oldADenials: 'REST protocol; no old A model round', fullPN: false, missing: ['OpenCode collaborator', 'approval/wait in this chain', 'complete N3 Inbox/Lease sequence'] })
  })
})

describe('M5真实Pi producer/reviewer fakeGit补充链（外部客户端缺口独列）', () => {
  it('两个实际Pi Connection：branch/commit/PR/current-head→review双证据→Human merge批准→父子完成', async () => {
    const joint = await createJointClientsFixture({ capabilities: deliveryCapabilities })
    const owner = await joint.pairClient('pi', deliveryCapabilities)
    const h2 = await joint.secondHuman()
    const git = await createDeliveryRecoveryFixture(async () => ({ ...joint,
      createExecution: (title?: string, _queued?: boolean, _budget?: Record<string, number>, projectId?: string) => joint.createClientExecution(owner, title ?? 'M5 Git', projectId),
      registerTarget: async capabilities => joint.attachReceiver(await joint.pairClient('pi', capabilities)),
    }))
    try {
      const s = await git.prepare('pi'), p = s.parent
      const invoke = <T>(name: string, body: Record<string, unknown>) => git.piCall<T>(p, owner.token, name, body)
      const link = { workItemId: p.workItemId, projectId: s.projectId, repositoryId: s.repositoryId, planStepId: s.step }
      await invoke('workmesh_acquire_lease', { resourceType: 'work_item', resourceId: p.workItemId, ttlSeconds: 3600, reason: 'M5 controlled Git chain' })
      const context = await invoke<Array<{ base_sha: string; allowed_paths: string[] }>>('workmesh_get_repository_context', { repositoryId: s.repositoryId })
      expect(context[0]).toMatchObject({ base_sha: 'base', allowed_paths: ['src/**'] })
      const confirm = async (id: string) => {
        await git.worker().tick()
        const action = await invoke<ProviderActionProjection>('workmesh_get_provider_action', { id })
        expect(action).toMatchObject({ id, status: 'completed', effect: 'committed' })
        return action
      }
      const branch = await invoke<{ id: string }>('workmesh_create_repository_branch', { ...link, name: s.branch, baseSha: 'base' }); await confirm(branch.id)
      const commit = await invoke<{ id: string }>('workmesh_create_repository_commit', { ...link, branch: s.branch, expectedHeadSha: 'base', message: 'M5 real Pi fakeGit', files: [{ path: 'src/m5.ts', content: 'export const m5 = true\n' }] }); await confirm(commit.id)
      const opened = await invoke<{ id: string }>('workmesh_open_pull_request', { ...link, baseBranch: 'main', headBranch: s.branch, title: 'M5 Pi controlled delivery', body: 'Actual tool evidence', draft: false })
      const action = await confirm(opened.id)
      if (action.kind !== 'open_pull_request' || !action.result?.projectionId) throw new Error('M5_NO_CURRENT_PR')
      const pr = action.result.projectionId, head = action.result.headSha
      await git.db.query(`INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload) VALUES($1,$2,$3,'check_run',$4,$5)`, [s.connectionId, s.repositoryId, randomUUID(), sha256(head), { check_run: { id: 42, name: 'required', status: 'completed', conclusion: 'success', head_sha: head, updated_at: new Date().toISOString(), pull_requests: [{ number: action.result.number }] } }])
      await git.worker().tick()
      const evidence = await invoke<{ id: string }>('workmesh_publish_delivery_artifact', { ...link, pullRequestId: pr, headSha: head, type: 'test_report', title: 'M5 current head test', checksum: sha256(head), sourceTool: 'M5 Pi local', result: 'passed', metadata: { headSha: head } })
      const review = await invoke<ReviewDelegationResponse>('workmesh_create_review_delegation', { reviewerAgentId: s.target.agentId, planStepId: s.reviewStep, planVersionId: s.planId, initialPrompt: 'Review current approved repository', ttlSeconds: 3600, repositoryIds: [s.repositoryId] })
      const reviewer = await git.receive(review.session.id, s.target.token)
      const r = <T>(name: string, body: Record<string, unknown>) => git.piCall<T>(reviewer, s.target.token, name, body)
      await r('workmesh_get_repository_context', { repositoryId: s.repositoryId })
      const room = (await git.db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [p.sessionId])).rows[0]!.id
      await r('workmesh_send_room_message', { roomId: room, intent: 'review_result', body: 'M5 reviewer verified current fakeGit head', payload: { pullRequestId: pr, headSha: head } })
      const artifact = await r<{ id: string }>('workmesh_publish_delivery_artifact', { ...link, planStepId: undefined, pullRequestId: pr, headSha: head, type: 'code_review', title: 'M5 independent reviewer', checksum: sha256('review:' + head), sourceTool: 'M5 Pi reviewer', result: 'passed', metadata: { headSha: head } })
      await r('workmesh_publish_structured_review', { pullRequestId: pr, artifactId: artifact.id, headSha: head, verdict: 'approved', summary: 'Actual current head reviewed', findings: [], evidence: [evidence.id], metadata: {} })
      await r('workmesh_complete_session', { ifMatch: (await reviewer.client.getSession<{ revision: number }>(reviewer.sessionId)).revision, summary: 'Independent evidence delivered', artifactIds: [artifact.id] })
      const children = await invoke<{ items: Array<{ state: string }> }>('workmesh_list_child_sessions', { childSessionId: reviewer.sessionId })
      expect(children.items[0]!.state).toBe('completed')
      const payload = { provider: 'fake' as const, connectionId: s.connectionId, repositoryId: s.repositoryId, pullRequestId: action.result.providerPullRequestId, headSha: head, method: 'squash' as const }
      const hash = sha256(canonicalMergeApprovalPayload(payload))
      const approval = await invoke<{ id: string; revision: number }>('workmesh_request_approval', { approvalType: 'merge', actionName: 'provider.pull_request.merge', actionPayloadSanitized: payload, actionPayloadHash: hash, riskLevel: 'high', rationaleSummary: 'H2 must approve exact head', expiresAt: new Date(Date.now() + 600000).toISOString() })
      await h2.request('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'H2 approves exact fakeGit evidence' }, approval.revision)
      const merge = await invoke<{ id: string }>('workmesh_merge_pull_request', { pullRequestId: pr, approvalId: approval.id, actionPayloadHash: hash, headSha: head, method: 'squash' }); await confirm(merge.id)
      await invoke('workmesh_complete_session', { ifMatch: (await p.client.getSession<{ revision: number }>(p.sessionId)).revision, summary: 'M5 fakeGit evidence delivered', artifactIds: [evidence.id] })
      expect((await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${p.sessionId}`)).state).toBe('completed')
      expect((await git.db.query('SELECT status FROM approvals WHERE id=$1', [approval.id])).rows[0]!.status).toBe('consumed')
      const events = (await git.db.query('SELECT event.event_type,event.id,outbox.id AS outbox_id FROM domain_events event JOIN outbox_events outbox ON outbox.domain_event_id=event.id WHERE event.session_id=ANY($1::uuid[])', [[p.sessionId, reviewer.sessionId]])).rows
      saveJointEvidence('pi-fakegit-supplementary-chain.json', { ownerAgent: owner.agentId, reviewerAgent: s.target.agentId, parentSession: p.sessionId, reviewerSession: reviewer.sessionId, repositoryId: s.repositoryId, head, actions: [branch.id, commit.id, opened.id, merge.id], artifacts: [evidence.id, artifact.id], approvalId: approval.id, h2: h2.id, context, children, events, producer: 'actual Pi', reviewer: 'actual Pi; OpenCode unavailable', fullPG: false, preparation: ['SDK claim/ACK/context', 'privileged executor repository scope', 'provider webhook fixture'] })
    } finally { await git.close() }
  })
})
