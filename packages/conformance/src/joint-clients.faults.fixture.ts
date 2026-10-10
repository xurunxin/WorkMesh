import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { DocumentResponse, EventEnvelope } from '@workmesh/contracts'
import { createJointClientsFixture } from './joint-clients.fixture.js'
import { createExternalConsumer } from './joint-clients.external.js'
import type { ModelInput } from './planning-collaboration.fixture.js'
import { saveJointEvidence } from './joint-clients.reporter.js'

function received(input: ModelInput): unknown {
  let value = input.messages.filter(message => message.role === 'tool').at(-1)?.content
  for (let count = 0; count < 2 && typeof value === 'string'; count++) value = JSON.parse(value) as unknown
  assert.ok(value, 'Controlled Pi model has not received the previous tool result')
  return value
}

export async function runClientRevisionFaults() {
  const f = await createJointClientsFixture()
  let external: Awaited<ReturnType<typeof createExternalConsumer>> | undefined
  try {
    const owner = await f.pairClient('pi'), e = await f.createClientExecution(owner, 'M5 shared lawful owner/Session')
    // Same original installation and exact Session, independently minted E.
    // These are two consumers of one owner, never cross-Session impersonation.
    const o = await f.refreshExecution(owner, e.sessionId, e.workItemId)
    external = await createExternalConsumer({ baseUrl: f.baseUrl, sessionToken: o.token,
      allowedTools: ['get_agent_session', 'get_session_plan', 'publish_plan', 'create_document', 'get_document', 'update_document'] })
    const session = () => external!.invoke<{ revision: number }>('get_agent_session', { id: e.sessionId })
    const step = randomUUID()
    const body = (title: string) => ({ changeSummary: title, steps: [{ id: step, ordinal: 0, title, status: 'pending' }] })
    const publish = (revision: number, title: string) => external!.invoke('publish_plan', { sessionId: e.sessionId, revision, idempotencyKey: randomUUID(), ...body(title) })
    await publish((await session()).revision, 'Shared stable step')
    for (const order of ['O-P', 'P-O'] as const) {
      let base = 0, originalPlan: unknown, running: unknown, oConflict: unknown
      const captures = await f.pi(e, owner.token, [
        async () => ({ name: 'workmesh_get_session', arguments: {} }),
        async input => {
          base = (received(input) as { revision: number }).revision
          assert.equal((await session()).revision, base)
          return { name: 'workmesh_get_session_plan', arguments: {} }
        },
        async input => {
          originalPlan = received(input)
          assert.deepEqual(await external!.invoke('get_session_plan', { id: e.sessionId }), originalPlan)
          running = (await f.db.query('SELECT id,status,attempt_no FROM workbench_runner_attempts WHERE agent_session_id=$1 AND status=\'running\'', [e.sessionId])).rows
          assert.equal((running as unknown[]).length, 1)
          if (order === 'O-P') await publish(base, 'O commits first')
          return { name: 'workmesh_publish_plan', arguments: { ifMatch: base, ...body('P commits with original revision') } }
        },
        async input => {
          const result = received(input)
          if (order === 'O-P') assert.match(JSON.stringify(result), /"code":"REVISION_CONFLICT"/)
          else {
            assert.ok(!('error' in (result as object)))
            await assert.rejects(publish(base, 'O stale original revision'), error => {
              oConflict = String(error); return /"code":"REVISION_CONFLICT"/.test(String(error))
            })
          }
          return { name: 'workmesh_get_session_plan', arguments: {} }
        },
      ])
      const latest: { steps: Array<{ id: string }> } = await external.invoke('get_session_plan', { id: e.sessionId })
      assert.equal(latest.steps[0]!.id, step)
      if (order === 'O-P') {
        // A new model intent reads the current revision before explicitly merging.
        const merge = await f.pi(e, owner.token, [
          async () => ({ name: 'workmesh_get_session', arguments: {} }),
          async input => ({ name: 'workmesh_publish_plan', arguments: { ifMatch: (received(input) as { revision: number }).revision, ...body('P explicitly merges current O facts') } }),
        ])
        saveJointEvidence(`fault-plan-${order}-merge.json`, { captures: merge })
      } else await publish((await session()).revision, 'O explicitly merges current P facts')
      const after: { steps: Array<{ id: string }> } = await external.invoke('get_session_plan', { id: e.sessionId })
      assert.equal(after.steps[0]!.id, step)
      saveJointEvidence(`fault-plan-${order}.json`, { sessionId: e.sessionId, sameOwnerInstallation: owner.connectionId, originalPlan, base, running, captures, oConflict, after, oldAttemptOverlap: false })
    }
    const initial = await external.invoke<DocumentResponse>('create_document', { ownerType: 'work_item', ownerId: e.workItemId, title: 'Shared lawful Document', markdown: 'Original 中文', idempotencyKey: randomUUID() })
    for (const order of ['O-P', 'P-O'] as const) {
      let base!: DocumentResponse, oConflict: unknown
      const update = (document: DocumentResponse, markdown: string) => ({ documentId: document.id, title: document.title, markdown,
        baseRevisionId: document.currentRevision.id, baseContentHash: document.currentRevision.contentHash, changeSummary: markdown })
      const captures = await f.pi(e, owner.token, [
        async () => ({ name: 'workmesh_get_document', arguments: { documentId: initial.id } }),
        async input => {
          base = received(input) as DocumentResponse
          assert.deepEqual(await external!.invoke('get_document', { documentId: initial.id }), base)
          if (order === 'O-P') await external!.invoke('update_document', { ...update(base, 'O first 中文'), revision: base.revision, idempotencyKey: randomUUID() })
          return { name: 'workmesh_update_document', arguments: { ...update(base, 'P original revision 中文'), ifMatch: base.revision } }
        },
        async input => {
          const result = received(input)
          if (order === 'O-P') assert.match(JSON.stringify(result), /"code":"REVISION_CONFLICT"/)
          else await assert.rejects(external!.invoke('update_document', { ...update(base, 'O stale 中文'), revision: base.revision, idempotencyKey: randomUUID() }), error => {
            oConflict = String(error); return /"code":"REVISION_CONFLICT"/.test(String(error))
          })
          return { name: 'workmesh_get_document', arguments: { documentId: initial.id } }
        },
      ])
      const latest = await external.invoke<DocumentResponse>('get_document', { documentId: initial.id })
      const merged: DocumentResponse = await external.invoke('update_document', { ...update(latest, latest.currentRevision.markdown + '\nExplicit merged intent'), revision: latest.revision, idempotencyKey: randomUUID() })
      assert.equal(merged.revision, base.revision + 2)
      saveJointEvidence(`fault-document-${order}.json`, { base, captures, oConflict, merged })
    }
  } finally { await external?.close(); await f.close() }
}

export async function runExternalContractFaults() {
  const f = await createJointClientsFixture()
  let external: Awaited<ReturnType<typeof createExternalConsumer>> | undefined
  let api: Awaited<ReturnType<typeof f.startApi>> | undefined
  try {
    const h2 = await f.secondHuman(), owner = await f.pairClient('opencode', undefined, h2.id)
    const e = await f.createClientExecution(owner, 'M5 external security/recovery')
    api = await f.startApi()
    external = await createExternalConsumer({ baseUrl: api.url, sessionToken: e.token,
      allowedTools: ['get_agent_session', 'get_document', 'create_document', 'publish_plan', 'acquire_lease', 'stop_ack'] })
    const key = randomUUID(), input = { ownerType: 'work_item', ownerId: e.workItemId, title: 'M5 original external intent', markdown: '中文 durable original fact', idempotencyKey: key }
    const document = await external.invoke<DocumentResponse>('create_document', input)
    assert.deepEqual(await external.invoke('get_document', { documentId: document.id }), document)
    const counts = async () => (await f.db.query('SELECT (SELECT count(*) FROM documents WHERE id=$1)::int AS documents,(SELECT count(*) FROM document_revisions WHERE document_id=$1)::int AS revisions', [document.id])).rows[0]
    const originalFacts = await counts()
    const denied = async (name: string, args: Record<string, unknown>, code: string) => {
      let actual = ''
      await assert.rejects(external!.invoke(name, args), error => { actual = String(error); return actual.replaceAll('\\', '').includes(`"code":"${code}"`) && actual.includes('correlationId') })
      saveJointEvidence(`external-denial-${randomUUID()}.json`, { name, code, modelReceivedError: actual, sessionId: e.sessionId })
    }
    await external.restartMcp()
    assert.deepEqual(await external.invoke('create_document', input), document)
    const originalApiPid = api.child.pid, port = Number(new URL(api.url).port)
    await api.stop(); api = await f.startApi(port)
    assert.notEqual(api.child.pid, originalApiPid)
    assert.deepEqual(await external.invoke('create_document', input), document)
    assert.deepEqual(await counts(), originalFacts)
    await denied('create_document', { ...input, markdown: 'Different logical body' }, 'IDEMPOTENCY_KEY_REUSED')
    // Same ordinary principal and exact E; Human login stays outside the client.
    const membership = (await f.db.query<{ workspace_id: string; role: string }>('SELECT workspace_id,role FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, h2.id])).rows[0]!
    await f.db.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, h2.id])
    try {
      await denied('get_document', { documentId: document.id }, 'SESSION_SCOPE_DENIED')
      await denied('create_document', input, 'SESSION_SCOPE_DENIED')
      await denied('create_document', { ...input, idempotencyKey: randomUUID() }, 'SESSION_SCOPE_DENIED')
    } finally { await f.db.query('INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,$4)', [membership.workspace_id, f.teamId, h2.id, membership.role]) }
    assert.deepEqual(await external.invoke('create_document', input), document)
    assert.deepEqual(await counts(), originalFacts)
    const revision = (await external.invoke<{ revision: number }>('get_agent_session', { id: e.sessionId })).revision
    const rollbackKey = randomUUID()
    await f.db.query(`CREATE FUNCTION m5_external_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM domain_events WHERE id=NEW.domain_event_id AND session_id='${e.sessionId}'::uuid AND event_type='agent.plan.published') THEN RAISE EXCEPTION 'M5 external owned rollback'; END IF; RETURN NEW; END $$`)
    await f.db.query('CREATE TRIGGER m5_external_rollback BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION m5_external_rollback()')
    try {
      await denied('publish_plan', { sessionId: e.sessionId, revision, idempotencyKey: rollbackKey, changeSummary: 'Actual O rollback', steps: [{ id: randomUUID(), ordinal: 0, title: 'Must roll back', status: 'pending' }] }, 'INTERNAL_ERROR')
      const facts = (await f.db.query('SELECT (SELECT count(*) FROM agent_plan_versions WHERE session_id=$1)::int AS plans,(SELECT count(*) FROM domain_events WHERE session_id=$1 AND event_type=\'agent.plan.published\')::int AS events,(SELECT count(*) FROM api_idempotency_keys WHERE idempotency_key=$2)::int AS receipts', [e.sessionId, rollbackKey])).rows[0]
      assert.deepEqual(facts, { plans: 0, events: 0, receipts: 0 })
      saveJointEvidence('external-transaction-rollback.json', { facts, sessionId: e.sessionId, rollbackKey, injection: 'owned outbox trigger', full5xxRetry: false })
    } finally { await f.db.query('DROP TRIGGER m5_external_rollback ON outbox_events'); await f.db.query('DROP FUNCTION m5_external_rollback()') }
    await external.invoke('acquire_lease', { sessionId: e.sessionId, resourceType: 'work_item', resourceId: e.workItemId, ttlSeconds: 300, reason: 'External owned cleanup', idempotencyKey: randomUUID() })
    const beforeStop = await h2.request<{ revision: number }>('GET', `/api/v1/agent-sessions/${e.sessionId}`)
    await h2.request('POST', `/api/v1/agent-sessions/${e.sessionId}/signals`, { signal: 'stop', reason: 'Actual O obeys server Stop' }, beforeStop.revision)
    await denied('create_document', { ...input, idempotencyKey: randomUUID() }, 'SESSION_NOT_ACTIVE')
    const stopping = await h2.request<{ revision: number }>('GET', `/api/v1/agent-sessions/${e.sessionId}`)
    await external.invoke('stop_ack', { sessionId: e.sessionId, revision: stopping.revision, cleanupSummary: 'Original E, no retry of unknown effects; owned lease released', residualRisks: [], idempotencyKey: randomUUID() })
    const final = await h2.request<{ state: string }>('GET', `/api/v1/agent-sessions/${e.sessionId}`)
    assert.equal(final.state, 'canceled')
    assert.equal((await f.db.query("SELECT count(*)::int AS count FROM leases WHERE session_id=$1 AND status='active'", [e.sessionId])).rows[0]!.count, 0)
    saveJointEvidence('external-security-recovery-stop.json', { sessionId: e.sessionId, documentId: document.id, originalFacts, afterFacts: await counts(), originalApiPid, restartedApiPid: api.child.pid, samePort: port, final, humanMembershipRestored: true, originalETokenRetained: true })
  } finally { await external?.close(); await api?.stop(); await f.close() }
}

export async function runEventReplayFaults() {
  const f = await createJointClientsFixture()
  let external: Awaited<ReturnType<typeof createExternalConsumer>> | undefined
  let floorWorkspace: string | undefined, originalFloor = '0'
  try {
    const owner = await f.pairClient('pi'), e = await f.createClientExecution(owner, 'M5 durable O/P cursor')
    const token = await f.refreshExecution(owner, e.sessionId, e.workItemId)
    external = await createExternalConsumer({ baseUrl: f.baseUrl, sessionToken: token.token,
      allowedTools: ['list_events', 'get_agent_session', 'create_document', 'get_work_room', 'post_work_room_message'] })
    const room = await external.invoke<{ id: string }>('get_work_room', { workItemId: e.workItemId })
    const messageBody = { sessionId: e.sessionId, roomId: room.id, intent: 'inform', body: 'Original durable Room intent', idempotencyKey: randomUUID() }
    const message = await external.invoke<{ id: string }>('post_work_room_message', messageBody)
    assert.deepEqual(await external.invoke('post_work_room_message', messageBody), message)
    assert.equal((await f.db.query('SELECT count(*)::int AS count FROM room_messages WHERE id=$1', [message.id])).rows[0]!.count, 1)
    const all = await external.invoke<EventEnvelope[]>('list_events', { cursor: '0', limit: 500 })
    assert.ok(all.length)
    const cursor = all.at(-1)!.cursor
    const document = await external.invoke<DocumentResponse>('create_document', { ownerType: 'work_item', ownerId: e.workItemId, title: 'M5 cursor durable fact', markdown: '授权事件恢复', idempotencyKey: randomUUID() })
    await external.restartMcp()
    const resumed = await external.invoke<EventEnvelope[]>('list_events', { cursor, limit: 500 })
    assert.ok(resumed.some(event => event.aggregate_id === document.id))
    assert.ok(resumed.every(event => BigInt(event.cursor) > BigInt(cursor)))
    let pEvents: EventEnvelope[] = []
    const captures = await f.pi(e, owner.token, [
      async () => ({ name: 'workmesh_list_events', arguments: { cursor, limit: 500 } }),
      async input => { pEvents = received(input) as EventEnvelope[]; assert.ok(Array.isArray(pEvents)); assert.ok(pEvents.some(event => event.aggregate_id === document.id)); return { name: 'workmesh_get_document', arguments: { documentId: document.id } } },
    ])
    const workspaceId = (await f.db.query<{ workspace_id: string }>('SELECT workspace_id FROM teams WHERE id=$1', [f.teamId])).rows[0]!.workspace_id
    const floor = (await f.db.query<{ cursor: string }>('SELECT max(cursor)::text AS cursor FROM domain_events WHERE workspace_id=$1', [workspaceId])).rows[0]!.cursor
    floorWorkspace = workspaceId
    originalFloor = (await f.db.query<{ floor: string }>('SELECT pruned_through_cursor::text AS floor FROM event_retention_state WHERE workspace_id=$1', [workspaceId])).rows[0]!.floor
    await f.db.query('UPDATE event_retention_state SET pruned_through_cursor=$2::bigint WHERE workspace_id=$1', [workspaceId, floor])
    let oError = ''
    await assert.rejects(external.invoke('list_events', { cursor: '0', limit: 25 }), error => { oError = String(error); return oError.includes('CURSOR_EXPIRED') && oError.includes('resyncCursor') })
    const resync = await external.invoke<EventEnvelope[]>('list_events', { cursor: floor, limit: 25 })
    assert.ok(resync.every(event => BigInt(event.cursor) > BigInt(floor)))
    let pError: unknown
    const retry = await f.pi(e, owner.token, [
      async () => ({ name: 'workmesh_list_events', arguments: { cursor: '0', limit: 25 } }),
      async input => { pError = received(input); assert.match(JSON.stringify(pError), /CURSOR_EXPIRED/); assert.match(JSON.stringify(pError), /resyncCursor/); return { name: 'workmesh_list_events', arguments: { cursor: floor, limit: 25 } } },
      async input => { const events = received(input) as EventEnvelope[]; assert.ok(events.every(event => BigInt(event.cursor) > BigInt(floor))); return { name: 'workmesh_get_document', arguments: { documentId: document.id } } },
    ])
    await f.db.query('UPDATE event_retention_state SET pruned_through_cursor=0 WHERE workspace_id=$1', [workspaceId])
    const peer = await f.pairClient('opencode'); await f.attachReceiver(peer)
    const step = randomUUID()
    await e.client.publishPlan(e.sessionId, { changeSummary: 'Protocol preparation for signed delivery replay', steps: [{ id: step, ordinal: 0, title: 'Signed receiver', status: 'pending', dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [] }] }, { ifMatch: (await e.client.getSession<{ revision: number }>(e.sessionId)).revision })
    const plan = await e.client.getPlan<{ id: string }>(e.sessionId)
    const child = await e.client.createChildSession(e.sessionId, { agentId: peer.agentId, planVersionId: plan.id, planStepId: step, initialPrompt: 'Owned signed replay receiver', role: 'executor', required: false })
    await f.receive(child.id, peer.token)
    const before = (await f.db.query('SELECT id,status FROM agent_webhook_deliveries WHERE session_id=$1', [child.id])).rows
    const replay = await f.replayDelivery(child.id)
    assert.equal(replay.duplicate, 409); assert.equal(replay.stale, 401); assert.equal(replay.invalid, 401)
    const after = (await f.db.query('SELECT id,status FROM agent_webhook_deliveries WHERE session_id=$1', [child.id])).rows
    assert.deepEqual(after, before)
    saveJointEvidence('joint-events-replay-resync.json', { message, messageBody, cursor, resumed, pEvents, captures, floor, oError, resync, pError, retry, replay, before, after, retentionFloorInjection: 'owned DB fixture, restored without pruning rows', secretRecorded: false })
  } finally {
    if (floorWorkspace) { await f.db.query('UPDATE event_retention_state SET pruned_through_cursor=$2::bigint WHERE workspace_id=$1', [floorWorkspace, originalFloor]); saveJointEvidence('joint-retention-floor-restored.json', { workspaceId: floorWorkspace, restoredFloor: originalFloor }) }
    await external?.close(); await f.close()
  }
}

export async function runClientScopeConcurrencyFaults() {
  const f = await createJointClientsFixture(), clients: Array<Awaited<ReturnType<typeof createExternalConsumer>>> = []
  try {
    const h2 = await f.secondHuman(), a = await f.pairClient('opencode'), b = await f.pairClient('pi', undefined, h2.id)
    const ae = await f.createClientExecution(a, 'M5 scope A'), be = await f.createClientExecution(b, 'M5 scope B')
    const external = await createExternalConsumer({ baseUrl: f.baseUrl, sessionToken: ae.token,
      allowedTools: ['create_document', 'get_document', 'get_agent_session', 'transition_agent_session_state'] }); clients.push(external)
    const document = await external.invoke<DocumentResponse>('create_document', { ownerType: 'work_item', ownerId: ae.workItemId, title: 'A scope positive', markdown: 'A only', idempotencyKey: randomUUID() })
    let denial: unknown
    const captures = await f.pi(be, b.token, [
      async () => ({ name: 'workmesh_get_document', arguments: { documentId: document.id } }),
      async input => { denial = received(input); assert.match(JSON.stringify(denial), /RESOURCE_SCOPE_DENIED/); assert.match(JSON.stringify(denial), /correlationId/); return { name: 'workmesh_create_document', arguments: { ownerType: 'work_item', ownerId: be.workItemId, title: 'B scope positive', markdown: 'B only' } } },
    ], { contextHuman: h2.request })
    const bDocument = (await f.db.query<{ id: string }>('SELECT id FROM documents WHERE work_item_id=$1', [be.workItemId])).rows[0]!
    let oDenied = ''
    await assert.rejects(external.invoke('get_document', { documentId: bDocument.id }), error => { oDenied = String(error); return oDenied.includes('RESOURCE_SCOPE_DENIED') && oDenied.includes('correlationId') })
    assert.equal((await external.invoke<DocumentResponse>('get_document', { documentId: document.id })).currentRevision.markdown, 'A only')
    const teamProject = await h2.request<{ id: string }>('POST', '/api/v1/projects', { teamId: h2.team2, name: 'M5 authorized H2 second-Team project' })
    const teamDocument = await h2.request<DocumentResponse>('POST', '/api/v1/documents', { ownerType: 'project', ownerId: teamProject.id, title: 'Authorized H2 second-Team positive', markdown: 'Second Team protected body' })
    assert.equal((await h2.request<DocumentResponse>('GET', `/api/v1/documents/${teamDocument.id}`)).currentRevision.markdown, 'Second Team protected body')
    let oCrossTeam = ''
    await assert.rejects(external.invoke('get_document', { documentId: teamDocument.id }), error => { oCrossTeam = String(error); return oCrossTeam.includes('RESOURCE_SCOPE_DENIED') && oCrossTeam.includes('correlationId') })
    let pCrossTeam: unknown
    const crossTeamCaptures = await f.pi(be, b.token, [
      async () => ({ name: 'workmesh_get_document', arguments: { documentId: teamDocument.id } }),
      async input => { pCrossTeam = received(input); assert.match(JSON.stringify(pCrossTeam), /RESOURCE_SCOPE_DENIED/); assert.match(JSON.stringify(pCrossTeam), /correlationId/); return { name: 'workmesh_get_document', arguments: { documentId: bDocument.id } } },
    ], { contextHuman: h2.request })
    const revision = (await external.invoke<{ revision: number }>('get_agent_session', { id: ae.sessionId })).revision
    let illegal = ''
    await assert.rejects(external.invoke('transition_agent_session_state', { sessionId: ae.sessionId, revision, state: 'queued', reason: 'Must reject executing to queued', idempotencyKey: randomUUID() }), error => { illegal = String(error); return illegal.includes('INVALID_SESSION_TRANSITION') && illegal.includes('correlationId') })
    assert.equal((await external.invoke<{ revision: number }>('get_agent_session', { id: ae.sessionId })).revision, revision)

    const states = await f.coordination.listWorkflowStates<{ id: string; name: string }>(f.teamId)
    const work = await f.human<{ id: string; revision: number }>('POST', '/api/v1/work-items', { teamId: f.teamId, title: 'M5 actual concurrent claim', statusId: states.items.find(row => row.name === 'Ready')!.id, responsibleHumanActorId: f.humanActorId })
    const c = await f.pairClient('opencode'), d = await f.pairClient('opencode')
    let arrived = 0, release!: () => void
    const barrier = new Promise<void>(done => { release = done })
    const beforeToolSend = async () => { if (++arrived === 2) release(); await barrier }
    const contenders = await Promise.all([c, d].map(connection => createExternalConsumer({ baseUrl: f.baseUrl, installationToken: connection.token, allowedTools: ['claim_work_item'], beforeToolSend })))
    clients.push(...contenders)
    const race = await Promise.allSettled(contenders.map(client => client.invoke('claim_work_item', { workItemId: work.id, revision: work.revision, idempotencyKey: randomUUID() })))
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1)
    const rejection = race.find(result => result.status === 'rejected') as PromiseRejectedResult
    assert.match(String(rejection.reason), /REVISION_CONFLICT|WORK_ITEM_ALREADY_ASSIGNED/)
    assert.match(String(rejection.reason), /correlationId/)
    const sessions = (await f.db.query('SELECT id,agent_id,agent_actor_id,delegation_id FROM agent_sessions WHERE work_item_id=$1 AND session_kind=\'execution\'', [work.id])).rows
    assert.equal(sessions.length, 1)
    saveJointEvidence('joint-scope-state-concurrency.json', { h2: h2.id, agents: [a.agentId, b.agentId], sessions: [ae.sessionId, be.sessionId], document, bDocument, captures, denial, oDenied, illegal, unchangedRevision: revision,
      crossTeam: { humanReadPositive: true, teamDocumentId: teamDocument.id, oCrossTeam, pCrossTeam, crossTeamCaptures },
      simultaneousModelBarrier: { arrived }, claimRace: race.map(result => result.status === 'fulfilled' ? { status: result.status, value: result.value } : { status: result.status, reason: String(result.reason) }), admittedSessions: sessions })
  } finally { for (const client of clients.reverse()) await client.close(); await f.close() }
}

export async function runPiAtomicSettleFaults() {
  const f = await createJointClientsFixture()
  let triggerPresent = false
  try {
    const owner = await f.pairClient('pi'), e = await f.createClientExecution(owner, 'M5 actual Pi atomic completion rollback')
    await f.db.query("CREATE FUNCTION m5_atomic_settle_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.topic='agent.session.completed' THEN RAISE EXCEPTION 'M5 owned atomic settle rollback'; END IF; RETURN NEW; END $$")
    await f.db.query('CREATE TRIGGER m5_atomic_settle_fault BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION m5_atomic_settle_fault()')
    triggerPresent = true
    let rolledBack: unknown
    const proxy = await f.lossProxy(f.baseUrl, path => path.endsWith('/settle'), { losses: 0, afterResponse: async (path, status) => {
      if (!path.endsWith('/settle') || status !== 500 || !triggerPresent) return
      const facts = (await f.db.query("SELECT s.state,t.status AS turn_status,a.status AS attempt_status,(SELECT count(*)::int FROM workbench_messages m WHERE m.runner_attempt_id=a.id) AS messages,(SELECT count(*)::int FROM domain_events d WHERE d.aggregate_id=s.id AND d.event_type='agent.session.completed') AS completions FROM agent_sessions s JOIN workbench_runner_attempts a ON a.agent_session_id=s.id JOIN workbench_turns t ON t.id=a.turn_id WHERE s.id=$1", [e.sessionId])).rows
      assert.equal(facts.length, 1)
      assert.deepEqual(facts[0], { state: 'executing', turn_status: 'running', attempt_status: 'running', messages: 0, completions: 0 })
      rolledBack = facts
      await f.db.query('DROP TRIGGER m5_atomic_settle_fault ON outbox_events'); await f.db.query('DROP FUNCTION m5_atomic_settle_fault()'); triggerPresent = false
    } })
    const captures = await f.pi(e, owner.token, [async () => ({ name: 'workmesh_complete_session', arguments: { ifMatch: (await e.client.getSession<{ revision: number }>(e.sessionId)).revision, summary: 'Actual Pi atomic completion', noArtifactReason: 'Controlled text-only operational result' } })], { apiUrl: proxy.url })
    assert.ok(rolledBack)
    assert.equal(proxy.observed.length, 2)
    assert.deepEqual(proxy.observed.map(row => row.status), [500, 200])
    for (const key of ['bodyHash', 'headersHash', 'eHash', 'key'] as const) assert.equal(proxy.observed[0]![key], proxy.observed[1]![key])
    const final = (await f.db.query("SELECT s.state,t.status AS turn_status,a.status AS attempt_status,(SELECT count(*)::int FROM domain_events d WHERE d.aggregate_id=s.id AND d.event_type='agent.session.completed') AS completions FROM agent_sessions s JOIN workbench_runner_attempts a ON a.agent_session_id=s.id JOIN workbench_turns t ON t.id=a.turn_id WHERE s.id=$1", [e.sessionId])).rows[0]!
    assert.deepEqual(final, { state: 'completed', turn_status: 'settled', attempt_status: 'settled', completions: 1 })
    saveJointEvidence('joint-pi-atomic-settle-rollback.json', { captures, rolledBack, final, actualRunnerRequests: proxy.observed, recovery: 'existing outer settle replay, independent of ordinary-tool replay', proxyNeverReplays: true })

    const live = await f.createClientExecution(owner, 'M5 actual Pi explicit completion refusal warning')
    const refused = await f.lossProxy(f.baseUrl, path => path.endsWith('/settle'), { losses: 0 })
    const warningCaptures = await f.pi(live, owner.token, [async () => ({ name: 'workmesh_complete_session', arguments: { ifMatch: (await live.client.getSession<{ revision: number }>(live.sessionId)).revision - 1, summary: 'Stale completion must remain refused', noArtifactReason: 'Text-only refused result' } })], { apiUrl: refused.url })
    const warningFacts = (await f.db.query("SELECT s.state,t.status AS turn_status,a.status AS attempt_status FROM agent_sessions s JOIN workbench_runner_attempts a ON a.agent_session_id=s.id JOIN workbench_turns t ON t.id=a.turn_id WHERE s.id=$1", [live.sessionId])).rows[0]!
    assert.deepEqual(warningFacts, { state: 'executing', turn_status: 'settled', attempt_status: 'settled' })
    const warnings = (await f.db.query("SELECT kind,summary,details_markdown,visibility FROM agent_activities WHERE session_id=$1 AND kind='warning'", [live.sessionId])).rows
    assert.equal(warnings.length, 1)
    assert.ok(refused.transport.some(row => row.status === 409 && row.errorCode === 'REVISION_CONFLICT'))
    assert.ok(refused.transport.some(row => row.status === 200 && row.path.endsWith('/settle')))
    saveJointEvidence('joint-pi-completion-refusal-warning.json', { warningCaptures, warningFacts, warnings, requests: refused.transport, completionRefused: true, ordinaryTerminalExemption: false })
  } finally {
    if (triggerPresent) { await f.db.query('DROP TRIGGER m5_atomic_settle_fault ON outbox_events'); await f.db.query('DROP FUNCTION m5_atomic_settle_fault()') }
    await f.close()
  }
}
