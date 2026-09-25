import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applyMigrations, createDb } from '@workmesh/db'
import { documentResponseSchema, documentHistoryResponseSchema, documentDiffResponseSchema, sessionContextResponseSchema } from '@workmesh/contracts'
import { buildApp } from '../src/server.js'
import { seedAgentSessionBearer } from './agent-session-test-credentials.js'

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl || !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error('Document integration requires RUN_INTEGRATION=1 and a dedicated *test* database')
const db = createDb(databaseUrl)
const app = buildApp({ logger: { level: 'error' } })
type Reply = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; body: string; json: <T>() => T }
let cookie = '', csrf = '', teamId = '', projectId = '', workItemId = '', actorId = ''
const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>
const agentCall = (token: string, method: 'GET' | 'POST', url: string, payload?: object, headers: Record<string, string> = {}): Promise<Reply> =>
  app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), ...headers } }) as unknown as Promise<Reply>
const etag = (revision: number): Record<string, string> => ({ 'if-match': `"revision-${revision}"` })
const hash = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`

describe('ordinary versioned Documents', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE workspaces CASCADE')
    const installed = await app.inject({ method: 'POST', url: '/api/v1/auth/install',
      payload: { name: 'Document Test', slug: `documents-${randomUUID().slice(0, 8)}`, adminName: 'Admin',
        email: `${randomUUID()}@documents.test`, password: 'documents-test-password' },
      headers: { 'idempotency-key': randomUUID(), 'x-workmesh-bootstrap-token': process.env.WORKMESH_BOOTSTRAP_TOKEN! },
    }) as unknown as Reply
    expect(installed.statusCode, installed.body).toBe(200)
    const rawCookie = Array.isArray(installed.headers['set-cookie']) ? installed.headers['set-cookie'][0] : installed.headers['set-cookie']
    cookie = String(rawCookie ?? '').split(';')[0] ?? ''
    csrf = installed.json<{ csrfToken: string }>().csrfToken
    actorId = (await call('GET', '/api/v1/auth/me')).json<{ actor: { id: string } }>().actor.id
    teamId = (await call('GET', '/api/v1/teams')).json<{ items: Array<{ id: string }> }>().items[0]!.id
    const project = await call('POST', '/api/v1/projects', { teamId, name: 'Document Project', description: 'Description remains unchanged.' })
    expect(project.statusCode, project.body).toBe(200)
    projectId = project.json<{ id: string }>().id
    const ready = (await call('GET', `/api/v1/teams/${teamId}/states`)).json<{ items: Array<{ id: string; name: string }> }>().items.find(item => item.name === 'Ready')!.id
    const work = await call('POST', '/api/v1/work-items', { teamId, projectId, title: 'Document Issue', statusId: ready, responsibleHumanActorId: actorId })
    expect(work.statusCode, work.body).toBe(200)
    workItemId = work.json<{ id: string }>().id
  }, 300_000)
  afterAll(async () => { await app.close(); await db.end() })

  it('keeps immutable history with idempotency, conflicts, export, restore and archive', async () => {
    const markdown = '# Design\n\nFirst draft.\n'
    const key = randomUUID()
    const body = { ownerType: 'project', ownerId: projectId, title: 'Design', markdown }
    const createdResponse = await call('POST', '/api/v1/documents', body, { 'idempotency-key': key })
    expect(createdResponse.statusCode, createdResponse.body).toBe(200)
    const created = documentResponseSchema.parse(createdResponse.json())
    expect(created).toMatchObject({ ownerType: 'project', ownerId: projectId, revision: 1,
      currentRevision: { authorActorId: actorId, revisionNumber: 1, contentHash: hash(markdown) } })
    const replay = await call('POST', '/api/v1/documents', body, { 'idempotency-key': key })
    expect(replay.statusCode).toBe(200)
    expect(replay.json()).toEqual(createdResponse.json())
    expect((await call('POST', '/api/v1/documents', { ...body, title: 'Other' }, { 'idempotency-key': key })).statusCode).toBe(409)
    expect((await call('GET', `/api/v1/documents?ownerType=project&ownerId=${projectId}`)).json<{ items: unknown[] }>().items).toHaveLength(1)

    const nextMarkdown = '# Design\n\nSecond draft.\n'
    const updateBody = { title: 'Design v2', markdown: nextMarkdown, baseRevisionId: created.currentRevision.id,
      baseContentHash: created.currentRevision.contentHash, changeSummary: 'Expand design' }
    const concurrent = await Promise.all([
      call('PATCH', `/api/v1/documents/${created.id}`, updateBody, etag(1)),
      call('PATCH', `/api/v1/documents/${created.id}`, { ...updateBody, markdown: `${nextMarkdown}\nAlternate` }, etag(1)),
    ])
    expect(concurrent.map(response => response.statusCode).sort()).toEqual([200, 409])
    const revised = documentResponseSchema.parse(concurrent.find(response => response.statusCode === 200)!.json())
    expect((await call('PATCH', `/api/v1/documents/${created.id}`, updateBody, etag(1))).statusCode).toBe(409)
    const history = documentHistoryResponseSchema.parse((await call('GET', `/api/v1/documents/${created.id}/history?limit=1`)).json())
    expect(history.revisions).toHaveLength(1)
    expect(history.nextCursor).toBe('2')
    const historyTail = documentHistoryResponseSchema.parse((await call('GET', `/api/v1/documents/${created.id}/history?cursor=${history.nextCursor}`)).json())
    expect(historyTail.revisions.map(item => item.id)).toEqual([created.currentRevision.id])
    const diff = documentDiffResponseSchema.parse((await call('GET', `/api/v1/documents/${created.id}/diff?fromRevisionId=${created.currentRevision.id}&toRevisionId=${revised.currentRevision.id}`)).json())
    expect(diff.changes.some(change => change.kind === 'added')).toBe(true)
    const exported = await call('GET', `/api/v1/documents/${created.id}/export?revisionId=${created.currentRevision.id}`)
    expect(exported.statusCode).toBe(200)
    expect(exported.body).toBe(markdown)
    expect((await db.query<{ markdown: string }>('SELECT markdown FROM document_revisions WHERE id=$1', [created.currentRevision.id])).rows[0]!.markdown).toBe(markdown)
    await expect(db.query('UPDATE document_revisions SET markdown=$2 WHERE id=$1', [created.currentRevision.id, 'tampered'])).rejects.toThrow()

    const restoredResponse = await call('POST', `/api/v1/documents/${created.id}/restore`, {
      revisionId: created.currentRevision.id, baseRevisionId: revised.currentRevision.id,
      baseContentHash: revised.currentRevision.contentHash, changeSummary: 'Restore original draft',
    }, etag(2))
    expect(restoredResponse.statusCode, restoredResponse.body).toBe(200)
    const restored = documentResponseSchema.parse(restoredResponse.json())
    expect(restored.currentRevision).toMatchObject({ revisionNumber: 3, restoredFromRevisionId: created.currentRevision.id,
      baseRevisionId: revised.currentRevision.id, markdown })
    expect(restored.currentRevision.id).not.toBe(created.currentRevision.id)
    const archivedResponse = await call('POST', `/api/v1/documents/${created.id}/archive`, { reason: 'Pause editing' }, etag(3))
    expect(archivedResponse.statusCode, archivedResponse.body).toBe(200)
    const archived = documentResponseSchema.parse(archivedResponse.json())
    expect(archived.status).toBe('archived')
    expect((await call('PATCH', `/api/v1/documents/${created.id}`, { ...updateBody, baseRevisionId: restored.currentRevision.id,
      baseContentHash: restored.currentRevision.contentHash }, etag(4))).statusCode).toBe(409)
    const unarchived = await call('POST', `/api/v1/documents/${created.id}/unarchive`, { reason: 'Resume editing' }, etag(4))
    expect(unarchived.statusCode, unarchived.body).toBe(200)
    expect(documentResponseSchema.parse(unarchived.json()).status).toBe('active')
    expect((await db.query<{ count: number }>("SELECT count(*)::int AS count FROM domain_events WHERE aggregate_id=$1 AND event_type LIKE 'document.%'", [created.id])).rows[0]!.count).toBe(5)
    expect((await db.query<{ description: string }>('SELECT description FROM projects WHERE id=$1', [projectId])).rows[0]!.description).toBe('Description remains unchanged.')
  })

  it('rejects cross-owner reads and records the real Agent actor on an Issue document', async () => {
    const pinnedResponse = await call('POST', '/api/v1/documents', {
      ownerType: 'work_item', ownerId: workItemId, title: 'Pinned brief', markdown: '# Brief\n\nInitial.',
    })
    expect(pinnedResponse.statusCode, pinnedResponse.body).toBe(200)
    const pinnedDocument = documentResponseSchema.parse(pinnedResponse.json())
    const capabilities = ['work:read', 'work:write']
    const registration = await call('POST', '/api/v1/agents/register', {
      slug: `document-agent-${randomUUID().slice(0, 8)}`, name: 'Document Agent', provider: 'fake', version: '1',
      supportedProtocols: ['native_http'], requestedCapabilities: capabilities, approvedCapabilities: capabilities, maxConcurrency: 1,
    })
    expect(registration.statusCode, registration.body).toBe(200)
    const agentId = registration.json<{ id: string }>().id
    const grant = await app.inject({ method: 'PUT', url: `/api/v1/agents/${agentId}/team-access/${teamId}`,
      payload: { approvedCapabilities: capabilities }, headers: { cookie, 'x-csrf-token': csrf, 'idempotency-key': randomUUID() } }) as unknown as Reply
    expect(grant.statusCode, grant.body).toBe(200)
    const work = await call('GET', `/api/v1/work-items/${workItemId}`)
    const started = await call('POST', `/api/v1/work-items/${workItemId}/agent-session`, {
      agentId, principalHumanActorId: actorId, role: 'executor', requestedCapabilities: capabilities,
      initialPrompt: 'Edit the exact Issue document.', budget: {},
    }, etag(work.json<{ revision: number }>().revision))
    expect(started.statusCode, started.body).toBe(200)
    const sessionId = started.json<{ session: { id: string } }>().session.id
    const token = await seedAgentSessionBearer(db, sessionId, agentId)
    const ack = await agentCall(token, 'POST', `/api/v1/agent-sessions/${sessionId}/ack`, { summary: 'Ready to edit', externalUrls: [] })
    expect(ack.statusCode, ack.body).toBe(200)
    const executing = await agentCall(token, 'POST', `/api/v1/agent-sessions/${sessionId}/state`,
      { state: 'executing', reason: 'Write ordinary document' }, etag(ack.json<{ revision: number }>().revision))
    expect(executing.statusCode, executing.body).toBe(200)
    const contextBefore = await agentCall(token, 'GET', `/api/v1/agent-sessions/${sessionId}/context`)
    expect(contextBefore.statusCode, contextBefore.body).toBe(200)
    const pinnedBefore = sessionContextResponseSchema.parse(contextBefore.json()).documentPins.find(pin => pin.documentId === pinnedDocument.id)
    expect(pinnedBefore).toMatchObject({ revisionId: pinnedDocument.currentRevision.id,
      contentHash: pinnedDocument.currentRevision.contentHash })
    const changedPinned = await call('PATCH', `/api/v1/documents/${pinnedDocument.id}`, {
      title: 'Pinned brief', markdown: '# Brief\n\nUpdated.',
      baseRevisionId: pinnedDocument.currentRevision.id, baseContentHash: pinnedDocument.currentRevision.contentHash,
    }, etag(1))
    expect(changedPinned.statusCode, changedPinned.body).toBe(200)
    const contextAfter = await agentCall(token, 'GET', `/api/v1/agent-sessions/${sessionId}/context`)
    expect(sessionContextResponseSchema.parse(contextAfter.json()).documentPins.find(pin => pin.documentId === pinnedDocument.id)).toEqual(pinnedBefore)
    const created = await agentCall(token, 'POST', '/api/v1/documents', {
      ownerType: 'work_item', ownerId: workItemId, title: 'Agent notes', markdown: '# Notes\n\nEvidence captured.',
    })
    expect(created.statusCode, created.body).toBe(200)
    const document = documentResponseSchema.parse(created.json())
    expect(document.currentRevision.authorActorId).toBe((await db.query<{ agent_actor_id: string }>('SELECT agent_actor_id FROM agent_sessions WHERE id=$1', [sessionId])).rows[0]!.agent_actor_id)
    expect((await agentCall(token, 'GET', `/api/v1/documents/${document.id}`)).statusCode).toBe(200)
    expect((await agentCall(token, 'GET', `/api/v1/documents?ownerType=project&ownerId=${projectId}`)).statusCode).toBe(200)
    const other = await call('POST', '/api/v1/work-items', { teamId, projectId, title: 'Other Issue', statusId: work.json<{ status_id: string }>().status_id, responsibleHumanActorId: actorId })
    const otherId = other.json<{ id: string }>().id
    expect((await agentCall(token, 'GET', `/api/v1/documents?ownerType=work_item&ownerId=${otherId}`)).statusCode).toBe(403)
    expect((await agentCall(token, 'POST', '/api/v1/documents', { ownerType: 'work_item', ownerId: otherId, title: 'Denied', markdown: 'No' })).statusCode).toBe(403)
    const stopping = await call('POST', `/api/v1/agent-sessions/${sessionId}/signals`, { signal: 'stop', reason: 'Done' }, etag(executing.json<{ revision: number }>().revision))
    expect(stopping.statusCode, stopping.body).toBe(200)
    const stoppedWrite = await agentCall(token, 'POST', '/api/v1/documents', { ownerType: 'work_item', ownerId: workItemId, title: 'Stopped', markdown: 'No' })
    expect(stoppedWrite.statusCode).toBe(409)
    expect(stoppedWrite.json<{ error: { code: string } }>().error.code).toBe('SESSION_NOT_ACTIVE')
  })

  it('rejects a cross-Team owner and rolls back a failed event write', async () => {
    const otherTeam = await call('POST', '/api/v1/teams', {
      name: 'Other Document Team', key: `D${randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase()}`,
    })
    expect(otherTeam.statusCode, otherTeam.body).toBe(200)
    await expect(db.query(
      `INSERT INTO documents(workspace_id,team_id,project_id,title,current_revision_id,created_by_actor_id)
       VALUES ((SELECT workspace_id FROM projects WHERE id=$1),$2,$1,'Cross Team',$3,$4)`,
      [projectId, otherTeam.json<{ id: string }>().id, randomUUID(), actorId],
    )).rejects.toMatchObject({ code: 'P0001', message: 'INVALID_DOCUMENT_PROJECT_OWNER' })

    const created = await call('POST', '/api/v1/documents', {
      ownerType: 'project', ownerId: projectId, title: 'Atomic draft', markdown: 'Before failure',
    })
    expect(created.statusCode, created.body).toBe(200)
    const document = documentResponseSchema.parse(created.json())
    await db.query(`CREATE FUNCTION fail_test_document_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'INJECTED_DOCUMENT_EVENT_FAILURE'; END; $$`)
    await db.query(`CREATE TRIGGER fail_test_document_event BEFORE INSERT ON domain_events
      FOR EACH ROW WHEN (NEW.aggregate_type='document' AND NEW.aggregate_id='${document.id}'::uuid)
      EXECUTE FUNCTION fail_test_document_event()`)
    try {
      const failed = await call('PATCH', `/api/v1/documents/${document.id}`, {
        title: 'Atomic draft', markdown: 'Should roll back',
        baseRevisionId: document.currentRevision.id, baseContentHash: document.currentRevision.contentHash,
      }, etag(1))
      expect(failed.statusCode).toBe(500)
      const current = documentResponseSchema.parse((await call('GET', `/api/v1/documents/${document.id}`)).json())
      expect(current).toMatchObject({ revision: 1, currentRevision: { id: document.currentRevision.id, markdown: 'Before failure' } })
      expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM document_revisions WHERE document_id=$1', [document.id])).rows[0]!.count).toBe(1)
      expect((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id
        WHERE e.aggregate_type='document' AND e.aggregate_id=$1`, [document.id])).rows[0]!.count).toBe(1)
    } finally {
      await db.query('DROP TRIGGER fail_test_document_event ON domain_events')
      await db.query('DROP FUNCTION fail_test_document_event()')
    }
  })
})
