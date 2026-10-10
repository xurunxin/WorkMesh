import { startFakeProviderBackend } from './joint-clients.provider.fixture.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { DocumentResponse, ProviderActionProjection, ReviewDelegationResponse } from '@workmesh/contracts'
import type { Execution } from './mcp-coverage.fixture.js'
import { canonicalMergeApprovalPayload } from '@workmesh/domain'
import { createJointClientsFixture } from './joint-clients.fixture.js'
import { createExternalConsumer } from './joint-clients.external.js'
import { createDeliveryRecoveryFixture, deliveryCapabilities, sha256 } from './delivery-recovery.fixture.js'
import { saveJointEvidence } from './joint-clients.reporter.js'

type Fixture = Awaited<ReturnType<typeof createJointClientsFixture>>
type Connection = Awaited<ReturnType<Fixture['pairClient']>>
type Kind = 'opencode' | 'pi'
const writes = new Set(['publish_plan', 'create_document', 'update_document', 'post_work_room_message', 'claim_inbox_item', 'acknowledge_inbox_item', 'reply_inbox_item', 'offer_handoff', 'create_child_session', 'create_review_delegation', 'request_approval', 'consume_approval', 'publish_artifact', 'complete_session', 'acquire_lease', 'create_repository_branch', 'create_repository_commit', 'open_pull_request', 'merge_pull_request', 'publish_delivery_artifact', 'publish_structured_review', 'transition_agent_session_state'])
const allowed = ['get_agent_session', 'get_session_context', 'get_session_plan', 'list_documents', 'get_document', 'get_work_room', 'list_inbox_items', 'get_inbox_item', 'list_child_sessions', 'get_approval', 'get_repository_context', 'get_provider_action', ...writes]
const aliases: Record<string, string> = { publish_plan: 'publish_plan', post_work_room_message: 'send_room_message', transition_agent_session_state: 'transition_state' }

async function consumer(f: Fixture, connection: Connection, execution: Execution) {
  const external = connection.clientType === 'opencode' ? await createExternalConsumer({ baseUrl: f.baseUrl, sessionToken: execution.token, allowedTools: allowed }) : undefined
  const call = async <T>(name: string, input: Record<string, unknown> = {}): Promise<T> => {
    let result: unknown
    if (external) {
      const args = { ...input }
      if (['get_session', 'get_session_context', 'get_session_plan'].includes(name)) args.id = execution.sessionId
      if (['publish_plan', 'post_work_room_message', 'request_approval', 'consume_approval', 'publish_artifact', 'complete_session', 'acquire_lease', 'create_review_delegation', 'publish_structured_review', 'create_repository_branch', 'create_repository_commit', 'open_pull_request', 'merge_pull_request', 'publish_delivery_artifact', 'transition_agent_session_state'].includes(name)) args.sessionId = execution.sessionId
      if (['create_child_session', 'list_child_sessions'].includes(name)) args.parentSessionId = execution.sessionId
      if (name === 'offer_handoff') args.fromSessionId = execution.sessionId
      if ('ifMatch' in args) { args.revision = args.ifMatch; delete args.ifMatch }
      if (writes.has(name)) args.idempotencyKey ??= randomUUID()
      result = await external.invoke(name === 'get_session' ? 'get_agent_session' : name, args)
    } else {
      const args = { ...input }; delete args.idempotencyKey
      const captures = await f.pi(execution, connection.token, [async () => ({ name: `workmesh_${aliases[name] ?? name}`, arguments: args })])
      const raw = captures.at(-1)?.results.at(-1)
      assert.ok(raw, `Pi model did not receive ${name}`)
      const outer: unknown = JSON.parse(raw)
      result = typeof outer === 'string' ? JSON.parse(outer) as unknown : outer
      saveJointEvidence(`journey-pi-${name}-${randomUUID()}.json`, { sessionId: execution.sessionId, captures, result })
      if (result && typeof result === 'object' && 'error' in result && result.error !== null) throw new Error(JSON.stringify(result))
    }
    assert.ok(!/X-Amz-Signature|"uploadUrl"|"downloadUrl"|"requiredHeaders"/i.test(JSON.stringify(result)), 'Signed transfer material reached model')
    saveJointEvidence(`journey-result-${randomUUID()}.json`, { client: connection.clientType, sessionId: execution.sessionId, tool: name, result })
    return result as T
  }
  return { call, close: async () => { await external?.close() } }
}

async function source(f: Fixture, connection: Connection, title: string, projectId?: string): Promise<Execution> {
  if (connection.clientType === 'pi') return f.createClientExecution(connection, title, projectId)
  const states = await f.coordination.listWorkflowStates<{ id: string; name: string }>(f.teamId)
  const work = await f.human<{ id: string; revision: number }>('POST', '/api/v1/work-items', { teamId: f.teamId, title, responsibleHumanActorId: f.humanActorId, statusId: states.items.find(row => row.name === 'Ready')!.id, ...(projectId ? { projectId } : {}) })
  const c = await createExternalConsumer({ baseUrl: f.baseUrl, installationToken: connection.token, allowedTools: ['verify_connection', 'get_workmesh_context', 'list_claimable_work_items', 'claim_work_item', 'ack_agent_session'] })
  try {
    await c.invoke('verify_connection', {})
    await c.invoke('get_workmesh_context', {})
    await c.invoke('list_claimable_work_items', { limit: 100 })
    const claimed = await c.invoke<{ session: { id: string } }>('claim_work_item', { workItemId: work.id, revision: work.revision, idempotencyKey: randomUUID() })
    await c.invoke('ack_agent_session', { sessionId: claimed.session.id, summary: 'Actual OpenCode acknowledges its claim', idempotencyKey: randomUUID() })
    const e = await f.refreshExecution(connection, claimed.session.id, work.id)
    const actor = await consumer(f, connection, e)
    try {
      const facts = await actor.call<{ revision: number }>('get_session')
      await actor.call('transition_agent_session_state', { state: 'executing', reason: 'Actual OpenCode executes its claim', ifMatch: facts.revision })
    } finally { await actor.close() }
    return e
  } finally { await c.close() }
}

async function waitForApproval(f: Fixture, connection: Connection, e: Execution, actor: Awaited<ReturnType<typeof consumer>>, h2: Awaited<ReturnType<Fixture['secondHuman']>>, approval: { id: string; action_payload_hash: string; revision: number }) {
  if (connection.clientType === 'pi') {
    let waiting: unknown, resumed: unknown
    const captures = await f.pi(e, connection.token, [
      async () => ({ name: 'workmesh_wait', arguments: { state: 'awaiting_approval', reason: 'Await exact Human approval', approval: { id: approval.id, actionPayloadHash: approval.action_payload_hash } } }),
      async () => ({ name: 'workmesh_get_session', arguments: {} }),
    ], { resumeAfterWait: async () => {
      waiting = (await f.db.query('SELECT id,status,source_turn_id,continuation_turn_id FROM workbench_execution_waits WHERE agent_session_id=$1', [e.sessionId])).rows
      assert.equal((waiting as Array<{ status: string }>).at(-1)?.status, 'pending')
      const beforeWorker = await f.startLifecycleWorker()
      assert.equal(await beforeWorker.reconcile(), 0)
      await beforeWorker.close()
      await h2.request('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'H2 approves original action/hash' }, approval.revision)
      const workers = await Promise.all([f.startLifecycleWorker(), f.startLifecycleWorker()])
      try {
        const count = await Promise.all(workers.map(worker => worker.reconcile()))
        assert.equal(count.reduce((sum, n) => sum + n, 0), 1)
        assert.ok(workers.every(worker => worker.pid !== beforeWorker.pid))
        assert.deepEqual(await Promise.all(workers.map(worker => worker.reconcile())), [0, 0])
      } finally { for (const worker of workers) await worker.close() }
      resumed = (await f.db.query('SELECT id,status,source_turn_id,continuation_turn_id FROM workbench_execution_waits WHERE agent_session_id=$1', [e.sessionId])).rows
    } })
    saveJointEvidence(`joint-pi-public-wait-${e.sessionId}.json`, { waiting, resumed, captures, approvalId: approval.id, approvalHash: approval.action_payload_hash })
  } else {
    const current = await actor.call<{ revision: number }>('get_session')
    await actor.call('transition_agent_session_state', { ifMatch: current.revision, state: 'awaiting_approval', reason: 'Await exact H2 approval' })
    const publicWait = await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${e.sessionId}`)
    assert.equal(publicWait.state, 'awaiting_approval')
    await h2.request('POST', `/api/v1/approvals/${approval.id}/decide`, { decision: 'approved', reason: 'H2 approves original action/hash' }, approval.revision)
    const latest = await actor.call<{ revision: number }>('get_session')
    await actor.call('transition_agent_session_state', { ifMatch: latest.revision, state: 'executing', reason: 'Human decided exact pending action' })
    saveJointEvidence(`joint-opencode-public-wait-${e.sessionId}.json`, { approvalId: approval.id, publicWait, humanDecision: 'actual REST', originalHash: approval.action_payload_hash })
  }
}

export async function runCoreJourney(kind: Kind) {
  const previousWaits = process.env.WORKMESH_EXECUTION_WAITS_ENABLED
  process.env.WORKMESH_EXECUTION_WAITS_ENABLED = 'true'
  const f = await createJointClientsFixture(), peers: Array<Awaited<ReturnType<typeof consumer>>> = []
  try {
    const h2 = await f.secondHuman(), a = await f.pairClient(kind), b = await f.pairClient(kind === 'pi' ? 'opencode' : 'pi')
    await f.attachReceiver(b)
    const e = await source(f, a, `M5 ${kind} no Git`), actor = await consumer(f, a, e); peers.push(actor)
    const revision = (await actor.call<{ revision: number }>('get_session')).revision, step = randomUUID()
    await actor.call('publish_plan', { ifMatch: revision, changeSummary: 'Core collaboration and Handoff', steps: [{ id: step, ordinal: 0, title: 'Required peer evidence', status: 'pending' }] })
    const plan = await actor.call<{ id: string }>('get_session_plan')
    const document = await actor.call<DocumentResponse>('create_document', { ownerType: 'work_item', ownerId: e.workItemId, title: '共同中文上下文', markdown: '完整工具结果与领域证据' })
    assert.deepEqual(await actor.call<DocumentResponse>('get_document', { documentId: document.id }), document)
    await actor.call('list_documents', { ownerType: 'work_item', ownerId: e.workItemId, limit: 1 })
    await actor.call('acquire_lease', { resourceType: 'work_item', resourceId: e.workItemId, reason: 'Core owned lease', ttlSeconds: 300 })
    const child = await actor.call<{ id: string }>('create_child_session', { agentId: b.agentId, planVersionId: plan.id, planStepId: step, required: true, role: 'executor', initialPrompt: 'Deliver visible collaboration evidence' })
    const childE = await f.receive(child.id, b.token), peer = await consumer(f, b, childE); peers.push(peer)
    const room = await actor.call<{ id: string }>('get_work_room', { workItemId: e.workItemId })
    const peerActor = (await f.db.query<{ actor_id: string }>('SELECT actor_id FROM agent_definitions WHERE id=$1', [b.agentId])).rows[0]!.actor_id
    const message = await actor.call<{ id: string }>('post_work_room_message', { roomId: room.id, recipientActorId: peerActor, intent: 'ask', body: 'Read the claimed shared context and reply', requiresResponse: true })
    const inbox = await peer.call<{ items: Array<{ id: string; source_id: string }> }>('list_inbox_items', { status: 'open', limit: 100 })
    const item = inbox.items.find(row => row.source_id === message.id); assert.ok(item)
    await peer.call('claim_inbox_item', { inboxItemId: item.id })
    await peer.call('get_inbox_item', { inboxItemId: item.id })
    await peer.call('acknowledge_inbox_item', { inboxItemId: item.id })
    const detail = await peer.call<{ revision: number }>('get_inbox_item', { inboxItemId: item.id })
    await peer.call('reply_inbox_item', { inboxItemId: item.id, ifMatch: detail.revision, body: 'Exact claimed peer result verified', payload: { documentId: document.id } })
    // Ordinary children inherit only work:read/work:write. Their visible Inbox
    // reply is the evidence; artifact authority is not added for this test.
    await peer.call('complete_session', { ifMatch: (await peer.call<{ revision: number }>('get_session')).revision, summary: 'Required child completed with visible Inbox reply', noArtifactReason: 'Ordinary child has no artifact:write; exact Inbox reply records its result' })
    const children = await actor.call<{ items: Array<{ state: string }> }>('list_child_sessions', { childSessionId: child.id })
    assert.equal(children.items[0]!.state, 'completed')
    await actor.call('publish_plan', { ifMatch: (await actor.call<{ revision: number }>('get_session')).revision, changeSummary: 'Live parent verified required child', steps: [{ id: step, ordinal: 0, title: 'Required peer evidence', status: 'completed' }] })
    const handoff = await actor.call<{ id: string }>('offer_handoff', { targetAgentId: b.agentId, summary: 'New B owns remaining work', remainingWork: ['Own Plan and approval', 'Complete own delivery'], requestedCapabilities: ['work:read', 'work:write', 'plan:write', 'artifact:write', 'message:write'], leaseTransferPolicy: 'release' })
    const accepted = await h2.request<{ session: { id: string } }>('POST', `/api/v1/handoffs/${handoff.id}/accept`, { initialPrompt: 'H2 accepts exact remaining scope' })
    const successor = await f.receive(accepted.session.id, b.token), next = await consumer(f, b, successor); peers.push(next)
    await next.call('get_session_context')
    const nextStep = randomUUID()
    await next.call('publish_plan', { ifMatch: (await next.call<{ revision: number }>('get_session')).revision, changeSummary: 'B owns a new Plan', steps: [{ id: nextStep, ordinal: 0, title: 'Deliver approved remaining work', status: 'completed' }] })
    // requestApproval hashes recursively sorted object keys, not insertion order.
    const payload = { documentId: document.id, operation: 'm5.core.delivery', sessionId: successor.sessionId }
    const approval = await next.call<{ id: string; revision: number; action_payload_hash: string }>('request_approval', { approvalType: 'manual', actionName: 'm5.core.delivery', actionPayloadSanitized: payload, actionPayloadHash: sha256(JSON.stringify(payload)), riskLevel: 'low', rationaleSummary: 'Exact controlled core delivery', expiresAt: new Date(Date.now() + 600_000).toISOString() })
    await waitForApproval(f, b, successor, next, h2, approval)
    const approved = await next.call<{ revision: number }>('get_approval', { approvalId: approval.id })
    await next.call('consume_approval', { approvalId: approval.id, ifMatch: approved.revision, actionPayloadHash: approval.action_payload_hash })
    const artifact = await next.call<{ id: string }>('publish_artifact', { type: 'test_report', title: 'B approved delivery', metadata: { documentId: document.id, approvalId: approval.id } })
    await next.call('complete_session', { ifMatch: (await next.call<{ revision: number }>('get_session')).revision, summary: 'New B delivered approved core work', artifactIds: [artifact.id] })
    const final = await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${successor.sessionId}`); assert.equal(final.state, 'completed')
    const facts = (await f.db.query('SELECT s.id,s.state,d.status AS delegation_status FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id WHERE s.id=ANY($1::uuid[])', [[e.sessionId, childE.sessionId, successor.sessionId]])).rows
    assert.equal(facts.find(row => row.id === e.sessionId)?.delegation_status, 'completed')
    const denied = await fetch(`${f.baseUrl}/api/v1/agent-sessions/${e.sessionId}`, { headers: { authorization: `Bearer ${e.token}` } })
    assert.equal((await denied.json() as { error: { code: string } }).error.code, 'DELEGATION_NOT_ACTIVE')
    saveJointEvidence(`joint-${kind === 'opencode' ? 'O' : 'P'}-N.json`, { final, facts, child: children, handoffId: handoff.id, documentId: document.id, artifactId: artifact.id, approvalId: approval.id, oldAStatus: denied.status, participants: [a.clientType, b.clientType], h2: h2.id, SDKPreparation: kind === 'pi' ? 'Pi cannot claim as E; C claim/ACK preparatory only' : 'Human Ready item; actual OpenCode C claim/ACK' })
  } finally {
    for (const actor of peers.reverse()) await actor.close(); await f.close()
    if (previousWaits === undefined) delete process.env.WORKMESH_EXECUTION_WAITS_ENABLED
    else process.env.WORKMESH_EXECUTION_WAITS_ENABLED = previousWaits
  }
}

export async function runGitJourney(kind: Kind) {
  const previousWaits = process.env.WORKMESH_EXECUTION_WAITS_ENABLED
  process.env.WORKMESH_EXECUTION_WAITS_ENABLED = 'true'
  const joint = await createJointClientsFixture({ capabilities: deliveryCapabilities }), peers: Array<Awaited<ReturnType<typeof consumer>>> = []
  const owner = await joint.pairClient(kind, deliveryCapabilities), h2 = await joint.secondHuman()
  const git = await createDeliveryRecoveryFixture(async () => ({ ...joint,
    createExecution: (title?: string, _queued?: boolean, _budget?: Record<string, number>, projectId?: string) => source(joint, owner, title ?? 'M5 Git', projectId),
    registerTarget: async capabilities => joint.attachReceiver(await joint.pairClient(kind === 'pi' ? 'opencode' : 'pi', capabilities)),
  }))
  const backend = await startFakeProviderBackend(git.provider)
  let worker: Awaited<ReturnType<typeof joint.startLifecycleWorker>> | undefined
  const workerPids: Array<number | undefined> = []
  try {
    const s = await git.prepare('pi'), p = s.parent, actor = await consumer(joint, owner, p); peers.push(actor)
    const link = { workItemId: p.workItemId, projectId: s.projectId, repositoryId: s.repositoryId, planStepId: s.step }
    await actor.call('get_session_plan')
    await actor.call('acquire_lease', { resourceType: 'work_item', resourceId: p.workItemId, ttlSeconds: 3600, reason: 'Controlled fakeGit delivery' })
    const context = await actor.call<Array<{ base_sha: string }>>('get_repository_context', { repositoryId: s.repositoryId }); assert.equal(context[0]!.base_sha, 'base')
    worker = await joint.startLifecycleWorker(backend); workerPids.push(worker.pid)
    const confirm = async (id: string) => {
      await worker!.reconcile()
      const action = await actor.call<ProviderActionProjection>('get_provider_action', { id })
      assert.equal(action.status, 'completed'); assert.equal(action.effect, 'committed'); return action
    }
    const branch = await actor.call<{ id: string }>('create_repository_branch', { ...link, name: s.branch, baseSha: 'base' }); await confirm(branch.id)
    const commit = await actor.call<{ id: string }>('create_repository_commit', { ...link, branch: s.branch, expectedHeadSha: 'base', message: 'M5 controlled client delivery', files: [{ path: 'src/m5.ts', content: 'export const m5 = true\n' }] }); await confirm(commit.id)
    await worker.close(); worker = await joint.startLifecycleWorker(backend); workerPids.push(worker.pid)
    assert.notEqual(workerPids[0], workerPids[1])
    const opened = await actor.call<{ id: string }>('open_pull_request', { ...link, baseBranch: 'main', headBranch: s.branch, title: 'M5 actual O/P delivery', body: 'Exact tool evidence', draft: false })
    const action = await confirm(opened.id)
    assert.ok(action.kind === 'open_pull_request' && action.result?.projectionId)
    const pr = action.result.projectionId, head = action.result.headSha
    await git.db.query(`INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload) VALUES($1,$2,$3,'check_run',$4,$5)`, [s.connectionId, s.repositoryId, randomUUID(), sha256(head), { check_run: { id: 42, name: 'required', status: 'completed', conclusion: 'success', head_sha: head, updated_at: new Date().toISOString(), pull_requests: [{ number: action.result.number }] } }])
    await worker.reconcile()
    const evidence = await actor.call<{ id: string }>('publish_delivery_artifact', { ...link, pullRequestId: pr, headSha: head, type: 'test_report', title: 'Actual client current-head test', checksum: sha256(head), sourceTool: 'M5 local consumer', result: 'passed', metadata: { headSha: head } })
    const review = await actor.call<ReviewDelegationResponse>('create_review_delegation', { reviewerAgentId: s.target.agentId, planStepId: s.reviewStep, planVersionId: s.planId, initialPrompt: 'Review exact head and approved repository', ttlSeconds: 3600, repositoryIds: [s.repositoryId] })
    const reviewer = await git.receive(review.session.id, s.target.token)
    const peerConnection = (await git.db.query<{ id: string; principal_human_actor_id: string }>('SELECT id,principal_human_actor_id FROM agent_connections WHERE agent_id=$1', [s.target.agentId])).rows[0]!
    const reviewerConnection = { ...owner, connectionId: peerConnection.id, principalHumanActorId: peerConnection.principal_human_actor_id, token: s.target.token, agentId: s.target.agentId, clientType: (kind === 'pi' ? 'opencode' : 'pi') as Kind }
    const peer = await consumer(joint, reviewerConnection, reviewer); peers.push(peer)
    await peer.call('get_repository_context', { repositoryId: s.repositoryId })
    const room = (await git.db.query<{ id: string }>("SELECT id FROM work_room_channels WHERE subject_kind='session' AND subject_id=$1", [p.sessionId])).rows[0]!.id
    await peer.call('post_work_room_message', { roomId: room, intent: 'review_result', body: 'Independent actual client verified current head', payload: { pullRequestId: pr, headSha: head } })
    const artifact = await peer.call<{ id: string }>('publish_delivery_artifact', { ...link, planStepId: undefined, pullRequestId: pr, headSha: head, type: 'code_review', title: 'Independent current-head review', checksum: sha256('review:' + head), sourceTool: 'M5 peer consumer', result: 'passed', metadata: { headSha: head } })
    await peer.call('publish_structured_review', { pullRequestId: pr, artifactId: artifact.id, headSha: head, verdict: 'approved', summary: 'Current head independently reviewed', findings: [], evidence: [evidence.id], metadata: {} })
    await peer.call('complete_session', { ifMatch: (await peer.call<{ revision: number }>('get_session')).revision, summary: 'Own independent review evidence delivered', artifactIds: [artifact.id] })
    const children = await actor.call<{ items: Array<{ state: string }> }>('list_child_sessions', { childSessionId: reviewer.sessionId }); assert.equal(children.items[0]!.state, 'completed')
    const payload = { provider: 'fake' as const, connectionId: s.connectionId, repositoryId: s.repositoryId, pullRequestId: action.result.providerPullRequestId, headSha: head, method: 'squash' as const }
    const hash = sha256(canonicalMergeApprovalPayload(payload))
    const approval = await actor.call<{ id: string; revision: number; action_payload_hash: string }>('request_approval', { approvalType: 'merge', actionName: 'provider.pull_request.merge', actionPayloadSanitized: payload, actionPayloadHash: hash, riskLevel: 'high', rationaleSummary: 'H2 approves exact current head', expiresAt: new Date(Date.now() + 600000).toISOString() })
    await waitForApproval(joint, owner, p, actor, h2, approval)
    const merged = await actor.call<{ id: string }>('merge_pull_request', { pullRequestId: pr, approvalId: approval.id, actionPayloadHash: hash, headSha: head, method: 'squash' }); await confirm(merged.id)
    await actor.call('complete_session', { ifMatch: (await actor.call<{ revision: number }>('get_session')).revision, summary: 'Actual O/P fakeGit delivery complete', artifactIds: [evidence.id] })
    const final = await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${p.sessionId}`); assert.equal(final.state, 'completed')
    assert.equal((await git.db.query('SELECT status FROM approvals WHERE id=$1', [approval.id])).rows[0]!.status, 'consumed')
    const events = (await git.db.query('SELECT e.id,e.event_type,o.id AS outbox_id FROM domain_events e JOIN outbox_events o ON o.domain_event_id=e.id WHERE e.session_id=ANY($1::uuid[])', [[p.sessionId, reviewer.sessionId]])).rows
    saveJointEvidence(`joint-${kind === 'opencode' ? 'O' : 'P'}-G.json`, { participants: [kind, reviewerConnection.clientType], final, children, parent: p.sessionId, reviewer: reviewer.sessionId, actions: [branch.id, commit.id, opened.id, merged.id], workerPids, providerCalls: backend.calls, artifacts: [evidence.id, artifact.id], approvalId: approval.id, head, events, preparation: ['Human repository/context', 'privileged executor repository scope', 'SDK initial Plan (actual consumers read it)', 'provider check webhook fixture'] })
  } finally {
    for (const actor of peers.reverse()) await actor.close(); await worker?.close(); await backend.close(); await git.close()
    if (previousWaits === undefined) delete process.env.WORKMESH_EXECUTION_WAITS_ENABLED
    else process.env.WORKMESH_EXECUTION_WAITS_ENABLED = previousWaits
  }
}
