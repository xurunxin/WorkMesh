import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  createDocumentInputSchema, documentArchiveInputSchema, documentDiffResponseSchema,
  documentHistoryResponseSchema, documentPinSchema, documentResponseSchema, documentRevisionSchema,
  restoreDocumentRevisionInputSchema, updateDocumentInputSchema,
  type DocumentPin, type DocumentResponse, type DocumentRevision,
} from '@workmesh/contracts'
import { appendEvent } from '@workmesh/db'
import { assertRevision, DomainError, parseRevision } from '@workmesh/domain'
import { assertAgentWrite, assertExactAgentProjectBinding, loadAgentSessionForMutation } from './agent/guard.js'
import { assertSafeText } from './agent/commands.js'
import type { ApiActor, RequestMeta } from './agent/types.js'
import { authorizeTeamMutation, mutate } from './commands.js'

type Queryable = Pick<Pool | PoolClient, 'query'>
type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
  readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>
}
type Owner = { ownerType: 'project' | 'work_item'; ownerId: string; teamId: string; projectId: string | null }
type DocumentRow = {
  id: string; workspace_id: string; team_id: string; project_id: string | null; work_item_id: string | null
  title: string; status: 'active' | 'archived'; revision: number; current_revision_id: string
  created_by_actor_id: string; archived_at: Date | null; created_at: Date; updated_at: Date
}
type RevisionRow = {
  id: string; revision_number: number; base_revision_id: string | null; restored_from_revision_id: string | null
  title: string; markdown: string; content_hash: string; change_summary: string | null
  author_actor_id: string; created_at: Date
}
const idParams = z.object({ id: z.string().uuid() })
const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const ownerOf = (row: DocumentRow): Owner => row.project_id
  ? { ownerType: 'project', ownerId: row.project_id, teamId: row.team_id, projectId: row.project_id }
  : { ownerType: 'work_item', ownerId: row.work_item_id!, teamId: row.team_id, projectId: null }

async function loadOwner(db: Queryable, workspaceId: string, ownerType: Owner['ownerType'], ownerId: string): Promise<Owner> {
  if (ownerType === 'project') {
    const row = (await db.query<{ team_id: string }>(
      'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
      [ownerId, workspaceId],
    )).rows[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Project not found')
    return { ownerType, ownerId, teamId: row.team_id, projectId: ownerId }
  }
  const row = (await db.query<{ team_id: string; project_id: string | null }>(
    'SELECT team_id,project_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
    [ownerId, workspaceId],
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Work item not found')
  return { ownerType, ownerId, teamId: row.team_id, projectId: row.project_id }
}

async function loadDocument(db: Queryable, workspaceId: string, id: string, lock = false): Promise<DocumentRow> {
  const row = (await db.query<DocumentRow>(
    `SELECT d.* FROM documents d
       LEFT JOIN projects p ON p.id=d.project_id AND p.workspace_id=d.workspace_id
       LEFT JOIN work_items w ON w.id=d.work_item_id AND w.workspace_id=d.workspace_id
      WHERE d.id=$1 AND d.workspace_id=$2
        AND (d.project_id IS NULL OR p.deleted_at IS NULL)
        AND (d.work_item_id IS NULL OR w.deleted_at IS NULL)${lock ? ' FOR UPDATE OF d' : ''}`,
    [id, workspaceId],
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Document not found')
  return row
}

async function loadRevision(db: Queryable, workspaceId: string, documentId: string, revisionId: string): Promise<RevisionRow> {
  const row = (await db.query<RevisionRow>(
    'SELECT * FROM document_revisions WHERE id=$1 AND workspace_id=$2 AND document_id=$3',
    [revisionId, workspaceId, documentId],
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Document revision not found')
  return row
}

const revisionDto = (row: RevisionRow): DocumentRevision => documentRevisionSchema.parse({
  id: row.id, revisionNumber: row.revision_number, baseRevisionId: row.base_revision_id,
  restoredFromRevisionId: row.restored_from_revision_id, title: row.title, markdown: row.markdown,
  contentHash: row.content_hash, changeSummary: row.change_summary, authorActorId: row.author_actor_id,
  createdAt: row.created_at.toISOString(),
})
async function documentDto(db: Queryable, row: DocumentRow): Promise<DocumentResponse> {
  const current = await loadRevision(db, row.workspace_id, row.id, row.current_revision_id)
  return documentResponseSchema.parse({
    id: row.id, ownerType: row.project_id ? 'project' : 'work_item', ownerId: row.project_id ?? row.work_item_id,
    teamId: row.team_id, title: row.title, status: row.status, revision: row.revision,
    currentRevision: revisionDto(current), createdByActorId: row.created_by_actor_id,
    archivedAt: row.archived_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  })
}

async function assertExactAgentOwner(db: Queryable, current: ApiActor, owner: Owner): Promise<void> {
  if (current.kind !== 'agent') return
  const row = (await db.query<{ work_item_id: string | null; project_id: string | null; work_item_project_id: string | null;
    capability_scope: { teamIds?: string[]; workItemIds?: string[]; projectIds?: string[] } }>(
    `SELECT s.work_item_id,s.project_id,w.project_id AS work_item_project_id,d.capability_scope
       FROM agent_sessions s LEFT JOIN work_items w ON w.id=s.work_item_id AND w.workspace_id=s.workspace_id AND w.deleted_at IS NULL
       JOIN delegations d ON d.id=s.delegation_id AND d.workspace_id=s.workspace_id
      WHERE s.id=$1 AND s.workspace_id=$2 AND s.agent_actor_id=$3 AND s.team_id=$4`,
    [current.agentSessionId ?? null, current.workspaceId, current.id, owner.teamId],
  )).rows[0]
  if (!row || !row.capability_scope.teamIds?.includes(owner.teamId) || (owner.ownerType === 'work_item'
    ? row.work_item_id !== owner.ownerId || !row.capability_scope.workItemIds?.includes(owner.ownerId)
    : row.work_item_id
      ? row.work_item_project_id !== owner.ownerId || !row.capability_scope.workItemIds?.includes(row.work_item_id)
      : row.project_id !== owner.ownerId || !row.capability_scope.projectIds?.includes(owner.ownerId))) {
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'Agent Session is not bound to this document owner')
  }
}

async function assertWrite(h: Helpers, request: FastifyRequest, tx: PoolClient, owner: Owner): Promise<void> {
  const current = actor(request)
  if (current.kind === 'human') {
    await authorizeTeamMutation(tx, h.meta(request, request.body), owner.teamId)
    return
  }
  const sessionId = current.agentSessionId
  if (!sessionId) throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An Agent Session token is required')
  const session = await loadAgentSessionForMutation(tx, current, sessionId)
  await assertExactAgentOwner(tx, current, owner)
  if (owner.ownerType === 'project') assertExactAgentProjectBinding(session, owner.ownerId)
  assertAgentWrite({
    actor: current, session, sessionId, capability: 'work:write', operation: 'activity',
    idempotencyKey: request.idempotencyKey!,
    resourceId: owner.ownerType === 'work_item' ? owner.ownerId : session.work_item_id ?? owner.ownerId,
  })
}

async function assertRead(h: Helpers, request: FastifyRequest, owner: Owner): Promise<void> {
  await h.readableTeam(request, owner.teamId)
  await assertExactAgentOwner(h.db, actor(request), owner)
}

async function appendDocumentEvent(tx: PoolClient, meta: RequestMeta, row: DocumentRow, type: string, payload: Record<string, unknown>): Promise<void> {
  await appendEvent(tx, {
    workspaceId: meta.actor.workspaceId, teamId: row.team_id, actorId: meta.actor.id,
    correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
    type, aggregateType: 'document', aggregateId: row.id, revision: row.revision, payload,
  })
}

function lineChanges(from: string, to: string) {
  const left = from.split('\n'), right = to.split('\n')
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
  let suffix = 0
  while (suffix < left.length - prefix && suffix < right.length - prefix
    && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix += 1
  return [
    ...left.slice(0, prefix).map((text, i) => ({ kind: 'context' as const, oldLine: i + 1, newLine: i + 1, text })),
    ...left.slice(prefix, left.length - suffix).map((text, i) => ({ kind: 'removed' as const, oldLine: prefix + i + 1, newLine: null, text })),
    ...right.slice(prefix, right.length - suffix).map((text, i) => ({ kind: 'added' as const, oldLine: null, newLine: prefix + i + 1, text })),
    ...left.slice(left.length - suffix).map((text, i) => ({ kind: 'context' as const, oldLine: left.length - suffix + i + 1, newLine: right.length - suffix + i + 1, text })),
  ]
}

export async function resolveDocumentPins(db: Queryable, input: {
  workspaceId: string; teamId: string; projectId?: string | null; workItemId?: string | null
}): Promise<DocumentPin[]> {
  const rows = await db.query<{
    id: string; project_id: string | null; work_item_id: string | null;
    current_revision_id: string; revision_number: number; content_hash: string
  }>(
    `SELECT d.id,d.project_id,d.work_item_id,d.current_revision_id,
            r.revision_number,r.content_hash
       FROM documents d JOIN document_revisions r ON r.id=d.current_revision_id AND r.workspace_id=d.workspace_id
      WHERE d.workspace_id=$1 AND d.team_id=$2 AND d.status='active'
        AND (($3::uuid IS NOT NULL AND d.project_id=$3) OR ($4::uuid IS NOT NULL AND d.work_item_id=$4))
      ORDER BY d.id LIMIT 201`,
    [input.workspaceId, input.teamId, input.projectId ?? null, input.workItemId ?? null],
  )
  if (rows.rows.length > 200) throw new DomainError('VALIDATION_ERROR', 'Session context exceeds the document pin limit')
  return rows.rows.map(row => documentPinSchema.parse({
    documentId: row.id, ownerType: row.project_id ? 'project' : 'work_item',
    ownerId: row.project_id ?? row.work_item_id,
    uri: `workmesh://document/${row.id}/revisions/${row.current_revision_id}`,
    revisionId: row.current_revision_id, revisionNumber: row.revision_number,
    contentHash: row.content_hash,
  }))
}

export async function documentPinsFromSnapshot(db: Queryable, workspaceId: string, snapshotId: string | null): Promise<DocumentPin[]> {
  if (!snapshotId) return []
  const rows = await db.query<{ manifest: unknown }>(
    `WITH RECURSIVE lineage AS (
       SELECT id,parent_snapshot_id,manifest,0 AS depth FROM context_snapshots WHERE id=$1 AND workspace_id=$2
       UNION ALL
       SELECT parent.id,parent.parent_snapshot_id,parent.manifest,lineage.depth+1
         FROM context_snapshots parent JOIN lineage ON lineage.parent_snapshot_id=parent.id
        WHERE parent.workspace_id=$2
     ) SELECT manifest FROM lineage ORDER BY depth DESC`,
    [snapshotId, workspaceId],
  )
  const pins = new Map<string, DocumentPin>()
  for (const row of rows.rows) {
    if (!row.manifest || typeof row.manifest !== 'object' || Array.isArray(row.manifest)) continue
    const documents = (row.manifest as Record<string, unknown>).documents
    if (!documents || typeof documents !== 'object' || Array.isArray(documents)) continue
    const parsed = z.array(documentPinSchema).safeParse((documents as Record<string, unknown>).revisions)
    if (parsed.success) for (const pin of parsed.data) pins.set(pin.documentId, pin)
  }
  return [...pins.values()].sort((left, right) => left.documentId.localeCompare(right.documentId))
}

export function registerDocumentRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/documents', async request => {
    const query = z.object({ ownerType: z.enum(['project', 'work_item']), ownerId: z.string().uuid(),
      cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query)
    const owner = await loadOwner(h.db, actor(request).workspaceId, query.ownerType, query.ownerId)
    await assertRead(h, request, owner)
    const rows = await h.db.query<DocumentRow>(
      `SELECT * FROM documents d WHERE workspace_id=$1 AND ${owner.ownerType === 'project' ? 'project_id' : 'work_item_id'}=$2
         AND ($3::uuid IS NULL OR (d.created_at,d.id)<(
           SELECT cursor.created_at,cursor.id FROM documents cursor
            WHERE cursor.id=$3 AND cursor.workspace_id=$1 AND cursor.${owner.ownerType === 'project' ? 'project_id' : 'work_item_id'}=$2))
       ORDER BY created_at DESC,id DESC LIMIT $4`,
      [actor(request).workspaceId, owner.ownerId, query.cursor ?? null, query.limit + 1],
    )
    const page = rows.rows.slice(0, query.limit)
    return { items: await Promise.all(page.map(row => documentDto(h.db, row))),
      nextCursor: rows.rows.length > query.limit ? page.at(-1)!.id : null }
  })
  app.post('/api/v1/documents', async request => {
    const body = createDocumentInputSchema.parse(request.body)
    assertSafeText(body.title, 'document title'); assertSafeText(body.markdown, 'document markdown')
    assertSafeText(body.changeSummary, 'document change summary')
    const meta = h.meta(request, body)
    return mutate(h.db, meta, async tx => {
      const owner = await loadOwner(tx, meta.actor.workspaceId, body.ownerType, body.ownerId)
      await assertWrite(h, request, tx, owner)
      const id = randomUUID(), revisionId = randomUUID(), hash = sha256(body.markdown)
      const row = (await tx.query<DocumentRow>(
        `INSERT INTO documents(id,workspace_id,team_id,project_id,work_item_id,title,current_revision_id,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [id, meta.actor.workspaceId, owner.teamId, owner.ownerType === 'project' ? owner.ownerId : null,
          owner.ownerType === 'work_item' ? owner.ownerId : null, body.title, revisionId, meta.actor.id],
      )).rows[0]!
      await tx.query(
        `INSERT INTO document_revisions(id,workspace_id,document_id,revision_number,title,markdown,content_hash,change_summary,author_actor_id)
         VALUES($1,$2,$3,1,$4,$5,$6,$7,$8)`,
        [revisionId, meta.actor.workspaceId, id, body.title, body.markdown, hash, body.changeSummary ?? null, meta.actor.id],
      )
      await appendDocumentEvent(tx, meta, row, 'document.created', { ownerType: body.ownerType, ownerId: body.ownerId, revisionId, contentHash: hash })
      return documentDto(tx, row)
    })
  })
  app.get('/api/v1/documents/:id', async request => {
    const { id } = idParams.parse(request.params)
    const row = await loadDocument(h.db, actor(request).workspaceId, id)
    await assertRead(h, request, ownerOf(row))
    return documentDto(h.db, row)
  })
  app.patch('/api/v1/documents/:id', async request => {
    const { id } = idParams.parse(request.params), body = updateDocumentInputSchema.parse(request.body)
    assertSafeText(body.title, 'document title'); assertSafeText(body.markdown, 'document markdown')
    assertSafeText(body.changeSummary, 'document change summary')
    const expected = parseRevision(h.header(request, 'if-match')), meta = h.meta(request, body, { id })
    return mutate(h.db, meta, async tx => {
      const row = await loadDocument(tx, meta.actor.workspaceId, id)
      await assertWrite(h, request, tx, ownerOf(row))
      const locked = await loadDocument(tx, meta.actor.workspaceId, id, true)
      assertRevision(expected, locked.revision)
      if (locked.status !== 'active') throw new DomainError('CONFLICT', 'Archived document cannot be edited')
      const current = await loadRevision(tx, meta.actor.workspaceId, id, locked.current_revision_id)
      if (current.id !== body.baseRevisionId || current.content_hash !== body.baseContentHash)
        throw new DomainError('CONFLICT', 'Document base revision is stale')
      const hash = sha256(body.markdown)
      if (current.title === body.title && current.content_hash === hash) throw new DomainError('CONFLICT', 'Document content is unchanged')
      const revisionId = randomUUID(), next = locked.revision + 1
      const nextContentRevision = current.revision_number + 1
      await tx.query(
        `INSERT INTO document_revisions(id,workspace_id,document_id,revision_number,base_revision_id,title,markdown,content_hash,change_summary,author_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [revisionId, meta.actor.workspaceId, id, nextContentRevision, current.id, body.title, body.markdown, hash, body.changeSummary ?? null, meta.actor.id],
      )
      const updated = (await tx.query<DocumentRow>(
        'UPDATE documents SET title=$2,current_revision_id=$3,revision=$4,updated_at=now() WHERE id=$1 RETURNING *',
        [id, body.title, revisionId, next],
      )).rows[0]!
      await appendDocumentEvent(tx, meta, updated, 'document.revised', { revisionId, baseRevisionId: current.id, contentHash: hash })
      return documentDto(tx, updated)
    })
  })
  app.get('/api/v1/documents/:id/history', async request => {
    const { id } = idParams.parse(request.params)
    const query = z.object({ cursor: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query)
    const row = await loadDocument(h.db, actor(request).workspaceId, id)
    await assertRead(h, request, ownerOf(row))
    const revisions = await h.db.query<RevisionRow>(
      `SELECT * FROM document_revisions WHERE workspace_id=$1 AND document_id=$2 AND ($3::int IS NULL OR revision_number<$3)
       ORDER BY revision_number DESC LIMIT $4`,
      [actor(request).workspaceId, id, query.cursor ?? null, query.limit + 1],
    )
    const page = revisions.rows.slice(0, query.limit)
    return documentHistoryResponseSchema.parse({ document: await documentDto(h.db, row),
      revisions: page.map(item => { const { markdown: _, ...metadata } = revisionDto(item); return metadata }),
      nextCursor: revisions.rows.length > query.limit ? String(page.at(-1)!.revision_number) : null })
  })
  app.get('/api/v1/documents/:id/revisions/:revisionId', async request => {
    const { id, revisionId } = z.object({ id: z.string().uuid(), revisionId: z.string().uuid() }).parse(request.params)
    const row = await loadDocument(h.db, actor(request).workspaceId, id)
    await assertRead(h, request, ownerOf(row))
    return revisionDto(await loadRevision(h.db, actor(request).workspaceId, id, revisionId))
  })
  app.get('/api/v1/documents/:id/diff', async request => {
    const { id } = idParams.parse(request.params)
    const query = z.object({ fromRevisionId: z.string().uuid(), toRevisionId: z.string().uuid() }).parse(request.query)
    const row = await loadDocument(h.db, actor(request).workspaceId, id)
    await assertRead(h, request, ownerOf(row))
    const from = revisionDto(await loadRevision(h.db, actor(request).workspaceId, id, query.fromRevisionId))
    const to = revisionDto(await loadRevision(h.db, actor(request).workspaceId, id, query.toRevisionId))
    const { markdown: oldMarkdown, ...fromMetadata } = from
    const { markdown: newMarkdown, ...toMetadata } = to
    return documentDiffResponseSchema.parse({ from: fromMetadata, to: toMetadata, changes: lineChanges(oldMarkdown, newMarkdown) })
  })
  app.get('/api/v1/documents/:id/export', async (request, reply: FastifyReply) => {
    const { id } = idParams.parse(request.params)
    const query = z.object({ revisionId: z.string().uuid().optional() }).parse(request.query)
    const row = await loadDocument(h.db, actor(request).workspaceId, id)
    await assertRead(h, request, ownerOf(row))
    const revision = await loadRevision(h.db, actor(request).workspaceId, id, query.revisionId ?? row.current_revision_id)
    reply.header('Content-Disposition', `attachment; filename="document-${id}-r${revision.revision_number}.md"`)
    reply.type('text/markdown; charset=utf-8')
    return revision.markdown
  })
  for (const action of ['archive', 'unarchive'] as const) app.post(`/api/v1/documents/:id/${action}`, async request => {
    const { id } = idParams.parse(request.params), body = documentArchiveInputSchema.parse(request.body)
    assertSafeText(body.reason, 'document status reason')
    const expected = parseRevision(h.header(request, 'if-match')), meta = h.meta(request, body, { id })
    return mutate(h.db, meta, async tx => {
      const row = await loadDocument(tx, meta.actor.workspaceId, id, true)
      if (meta.actor.kind !== 'human') throw new DomainError('FORBIDDEN', 'Only Humans can change document archive status')
      await authorizeTeamMutation(tx, meta, row.team_id)
      assertRevision(expected, row.revision)
      if (row.status === (action === 'archive' ? 'archived' : 'active')) throw new DomainError('CONFLICT', 'Document is already in this state')
      const updated = (await tx.query<DocumentRow>(
        `UPDATE documents SET status=$2,revision=revision+1,archived_at=${action === 'archive' ? 'now()' : 'NULL'},
          archived_by_actor_id=$3,updated_at=now() WHERE id=$1 RETURNING *`,
        [id, action === 'archive' ? 'archived' : 'active', action === 'archive' ? meta.actor.id : null],
      )).rows[0]!
      await appendDocumentEvent(tx, meta, updated, action === 'archive' ? 'document.archived' : 'document.unarchived',
        { revisionId: row.current_revision_id, reason: body.reason })
      return documentDto(tx, updated)
    })
  })
  app.post('/api/v1/documents/:id/restore', async request => {
    const { id } = idParams.parse(request.params), body = restoreDocumentRevisionInputSchema.parse(request.body)
    assertSafeText(body.changeSummary, 'document restore summary')
    const expected = parseRevision(h.header(request, 'if-match')), meta = h.meta(request, body, { id })
    return mutate(h.db, meta, async tx => {
      const row = await loadDocument(tx, meta.actor.workspaceId, id)
      await assertWrite(h, request, tx, ownerOf(row))
      const locked = await loadDocument(tx, meta.actor.workspaceId, id, true)
      assertRevision(expected, locked.revision)
      if (locked.status !== 'active') throw new DomainError('CONFLICT', 'Archived document cannot be restored')
      const current = await loadRevision(tx, meta.actor.workspaceId, id, locked.current_revision_id)
      if (current.id !== body.baseRevisionId || current.content_hash !== body.baseContentHash)
        throw new DomainError('CONFLICT', 'Document base revision is stale')
      const target = await loadRevision(tx, meta.actor.workspaceId, id, body.revisionId)
      if (target.title === current.title && target.content_hash === current.content_hash)
        throw new DomainError('CONFLICT', 'Target revision has the current content')
      const revisionId = randomUUID(), next = locked.revision + 1
      const nextContentRevision = current.revision_number + 1
      await tx.query(
        `INSERT INTO document_revisions(id,workspace_id,document_id,revision_number,base_revision_id,restored_from_revision_id,title,markdown,content_hash,change_summary,author_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [revisionId, meta.actor.workspaceId, id, nextContentRevision, current.id, target.id,
          target.title, target.markdown, target.content_hash, body.changeSummary, meta.actor.id],
      )
      const updated = (await tx.query<DocumentRow>(
        'UPDATE documents SET title=$2,current_revision_id=$3,revision=$4,updated_at=now() WHERE id=$1 RETURNING *',
        [id, target.title, revisionId, next],
      )).rows[0]!
      await appendDocumentEvent(tx, meta, updated, 'document.restored', { revisionId, restoredFromRevisionId: target.id, baseRevisionId: current.id, contentHash: target.content_hash })
      return documentDto(tx, updated)
    })
  })
}
