import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import {
  archiveGuidanceInputSchema,
  guidancePinSchema,
  rollbackGuidanceInputSchema,
  publishGuidanceInputSchema,
  type GuidancePin,
  type GuidanceResponse,
  type GuidanceRevisionMetadata,
  type GuidanceScope,
} from '@workmesh/contracts'
import { appendEvent } from '@workmesh/db'
import { assertRevision, DomainError, parseRevision } from '@workmesh/domain'
import { z } from 'zod'
import { mutate } from './commands.js'
import { assertSafeText } from './agent/commands.js'
import type { ApiActor, RequestMeta } from './agent/types.js'

type Queryable = Pick<Pool | PoolClient, 'query'>
type GuidanceHelpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
}
type ScopeRecord = { id: string; teamId: string | null; updatedAt: Date }
type DocumentRow = {
  id: string
  status: 'active' | 'archived'
  revision: number
  current_revision_id: string | null
  updated_at: Date
}
type RevisionRow = {
  id: string
  revision_number: number
  markdown: string
  content_hash: string
  change_summary: string
  author_actor_id: string
  author_display_name: string
  published_at: Date
}

export const guidancePrecedence = [
  'workspace', 'team', 'project', 'repository', 'work_item', 'session_human_prompt',
] as const

const scopeId = (request: FastifyRequest): string =>
  z.object({ id: z.string().uuid() }).parse(request.params).id
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const guidanceUri = (scope: GuidanceScope, id: string): string => `workmesh://${scope}/${id}/guidance`
const sha256 = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`
const revisionMetadata = (row: RevisionRow): GuidanceRevisionMetadata => ({
  id: row.id,
  revisionNumber: row.revision_number,
  contentHash: row.content_hash,
  changeSummary: row.change_summary,
  authorActorId: row.author_actor_id,
  authorDisplayName: row.author_display_name,
  publishedAt: row.published_at.toISOString(),
})

async function loadScope(
  db: Queryable,
  workspaceId: string,
  scope: GuidanceScope,
  id: string,
  lock = false,
): Promise<ScopeRecord> {
  const suffix = lock ? ' FOR UPDATE' : ''
  if (scope === 'workspace') {
    const row = (await db.query<{ id: string; updated_at: Date }>(
      `SELECT id,updated_at FROM workspaces WHERE id=$1 AND id=$2${suffix}`,
      [id, workspaceId],
    )).rows[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Workspace not found')
    return { id: row.id, teamId: null, updatedAt: row.updated_at }
  }
  if (scope === 'team') {
    const row = (await db.query<{ id: string; updated_at: Date }>(
      `SELECT id,updated_at FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL${suffix}`,
      [id, workspaceId],
    )).rows[0]
    if (!row) throw new DomainError('NOT_FOUND', 'Team not found')
    return { id: row.id, teamId: row.id, updatedAt: row.updated_at }
  }
  const row = (await db.query<{ id: string; team_id: string; updated_at: Date }>(
    `SELECT id,team_id,updated_at FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL${suffix}`,
    [id, workspaceId],
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Project not found')
  return { id: row.id, teamId: row.team_id, updatedAt: row.updated_at }
}

async function assertGuidanceManager(
  tx: PoolClient,
  current: ApiActor,
  scope: GuidanceScope,
  target: ScopeRecord,
): Promise<void> {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Only Humans can manage Guidance')
  if (scope === 'workspace') {
    if (current.workspaceRole !== 'admin') throw new DomainError('FORBIDDEN', 'Workspace administrator role is required')
    return
  }
  if (current.workspaceRole === 'admin') return
  const role = (await tx.query<{ role: string }>(
    'SELECT role FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
    [current.workspaceId, target.teamId, current.id],
  )).rows[0]?.role
  if (role !== 'admin' && role !== 'maintainer') {
    throw new DomainError('FORBIDDEN', 'Team maintainer role is required')
  }
}

async function loadDocument(
  db: Queryable,
  workspaceId: string,
  scope: GuidanceScope,
  id: string,
  lock = false,
): Promise<DocumentRow | undefined> {
  const suffix = lock ? ' FOR UPDATE' : ''
  return (await db.query<DocumentRow>(
    `SELECT id,status,revision,current_revision_id,updated_at
       FROM guidance_documents
      WHERE workspace_id=$1 AND scope_type=$2 AND scope_id=$3${suffix}`,
    [workspaceId, scope, id],
  )).rows[0]
}

async function loadRevision(db: Queryable, workspaceId: string, revisionId: string): Promise<RevisionRow | undefined> {
  return (await db.query<RevisionRow>(
    `SELECT revision.id,revision.revision_number,revision.markdown,
            revision.content_hash,revision.change_summary,
            revision.author_actor_id,actor.display_name AS author_display_name,
            revision.published_at
       FROM guidance_revisions revision
       JOIN actors actor ON actor.id=revision.author_actor_id
                        AND actor.workspace_id=revision.workspace_id
      WHERE revision.workspace_id=$1 AND revision.id=$2`,
    [workspaceId, revisionId],
  )).rows[0]
}

export async function readGuidance(
  db: Queryable,
  workspaceId: string,
  scope: GuidanceScope,
  id: string,
): Promise<GuidanceResponse> {
  const target = await loadScope(db, workspaceId, scope, id)
  const document = await loadDocument(db, workspaceId, scope, id)
  if (!document) return {
    scope, scopeId: id, documentId: null, status: 'unpublished', revision: 0,
    currentRevision: null, markdown: '', updatedAt: target.updatedAt.toISOString(),
  }
  const current = document.current_revision_id
    ? await loadRevision(db, workspaceId, document.current_revision_id)
    : undefined
  if (document.current_revision_id && !current) throw new DomainError('INTERNAL_ERROR', 'Guidance current revision is unavailable')
  return {
    scope,
    scopeId: id,
    documentId: document.id,
    status: document.status,
    revision: document.revision,
    currentRevision: current ? revisionMetadata(current) : null,
    markdown: document.status === 'active' ? current?.markdown ?? '' : '',
    updatedAt: document.updated_at.toISOString(),
  }
}

export async function resolveGuidancePins(
  db: Queryable,
  input: { workspaceId: string; teamId: string; projectId?: string | null },
): Promise<GuidancePin[]> {
  const scopes: Array<readonly [GuidanceScope, string]> = [
    ['workspace', input.workspaceId],
    ['team', input.teamId],
    ...(input.projectId ? [['project', input.projectId] as const] : []),
  ]
  const rows = await db.query<RevisionRow & { scope_type: GuidanceScope; scope_id: string }>(
    `SELECT document.scope_type,document.scope_id,revision.id,
            revision.revision_number,revision.markdown,revision.content_hash,
            revision.change_summary,revision.author_actor_id,
            actor.display_name AS author_display_name,revision.published_at
       FROM guidance_documents document
       JOIN guidance_revisions revision
         ON revision.id=document.current_revision_id
        AND revision.workspace_id=document.workspace_id
       JOIN actors actor ON actor.id=revision.author_actor_id
                        AND actor.workspace_id=revision.workspace_id
      WHERE document.workspace_id=$1 AND document.status='active'
        AND (document.scope_type,document.scope_id) IN (
          SELECT value.scope_type::guidance_scope_type,value.scope_id::uuid
            FROM jsonb_to_recordset($2::jsonb) AS value(scope_type text,scope_id text)
        )`,
    [input.workspaceId, JSON.stringify(scopes.map(([scope, id]) => ({ scope_type: scope, scope_id: id })))],
  )
  const byScope = new Map(rows.rows.map(row => [`${row.scope_type}:${row.scope_id}`, row]))
  return scopes.flatMap(([scope, id]) => {
    const row = byScope.get(`${scope}:${id}`)
    return row ? [guidancePinSchema.parse({
      scope,
      scopeId: id,
      uri: guidanceUri(scope, id),
      revisionId: row.id,
      revisionNumber: row.revision_number,
      contentHash: row.content_hash,
    })] : []
  })
}

export async function materializeSessionContextSnapshot(
  tx: PoolClient,
  input: {
    workspaceId: string
    teamId: string
    projectId?: string | null
    workItemId?: string | null
    workItem: Record<string, unknown> | null
    actorId: string
  },
): Promise<{ id: string; guidancePins: GuidancePin[] }> {
  const pins = await resolveGuidancePins(tx, input)
  const manifest = {
    scope: { workspaceId: input.workspaceId, teamId: input.teamId, projectId: input.projectId ?? null },
    workItem: input.workItem,
    guidance: { precedence: guidancePrecedence, revisions: pins },
  }
  const sources = pins.map(pin => ({
    sourceType: 'guidance', uri: pin.uri, hash: pin.contentHash,
    revisionId: pin.revisionId, revisionNumber: pin.revisionNumber,
  }))
  const contentHash = sha256(JSON.stringify(manifest))
  const created = await tx.query<{ id: string }>(
    `INSERT INTO context_snapshots(
       workspace_id,work_item_id,manifest,sources,content_hash,created_by_actor_id
     ) VALUES($1,$2,$3,$4::jsonb,$5,$6)
     ON CONFLICT(workspace_id,content_hash) DO NOTHING RETURNING id`,
    [input.workspaceId, input.workItemId ?? null, manifest, JSON.stringify(sources), contentHash, input.actorId],
  )
  const id = created.rows[0]?.id ?? (await tx.query<{ id: string }>(
    'SELECT id FROM context_snapshots WHERE workspace_id=$1 AND content_hash=$2',
    [input.workspaceId, contentHash],
  )).rows[0]?.id
  if (!id) throw new DomainError('INTERNAL_ERROR', 'Context snapshot could not be materialized')
  return { id, guidancePins: pins }
}

export async function guidancePinsFromSnapshot(
  db: Queryable,
  workspaceId: string,
  snapshotId: string | null,
): Promise<GuidancePin[]> {
  if (!snapshotId) return []
  const snapshots = await db.query<{ manifest: unknown; sources: unknown }>(
    `WITH RECURSIVE lineage AS (
       SELECT id,parent_snapshot_id,manifest,sources,0 AS depth
         FROM context_snapshots WHERE id=$1 AND workspace_id=$2
       UNION ALL
       SELECT parent.id,parent.parent_snapshot_id,parent.manifest,parent.sources,lineage.depth+1
         FROM context_snapshots parent
         JOIN lineage ON lineage.parent_snapshot_id=parent.id
        WHERE parent.workspace_id=$2
     ) SELECT manifest,sources FROM lineage ORDER BY depth DESC`,
    [snapshotId, workspaceId],
  )
  const pins = new Map<string, GuidancePin>()
  for (const snapshot of snapshots.rows) {
    const manifest = snapshot.manifest
    if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
      const guidance = (manifest as Record<string, unknown>).guidance
      if (guidance && typeof guidance === 'object' && !Array.isArray(guidance)) {
        const parsed = z.array(guidancePinSchema).safeParse((guidance as Record<string, unknown>).revisions)
        if (parsed.success) for (const pin of parsed.data) pins.set(`${pin.scope}:${pin.scopeId}`, pin)
      }
      const additions = (manifest as Record<string, unknown>).additions
      if (Array.isArray(additions)) for (const addition of additions) {
        if (!addition || typeof addition !== 'object' || Array.isArray(addition)) continue
        const value = addition as Record<string, unknown>
        const parsed = guidancePinSchema.safeParse({
          scope: value.scope, scopeId: value.scopeId, uri: value.uri,
          revisionId: value.revisionId, revisionNumber: value.revisionNumber,
          contentHash: value.hash,
        })
        if (value.sourceType === 'guidance' && parsed.success) pins.set(`${parsed.data.scope}:${parsed.data.scopeId}`, parsed.data)
      }
    }
  }
  return [...pins.values()].sort((left, right) =>
    guidancePrecedence.indexOf(left.scope) - guidancePrecedence.indexOf(right.scope))
}

async function publishGuidance(
  h: GuidanceHelpers,
  request: FastifyRequest,
  scope: GuidanceScope,
): Promise<GuidanceResponse> {
  const id = scopeId(request)
  const body = publishGuidanceInputSchema.parse(request.body)
  assertSafeText(body.markdown, 'guidance markdown')
  assertSafeText(body.changeSummary, 'guidance change summary')
  const expected = parseRevision(h.header(request, 'if-match'))
  const meta = h.meta(request, body, { id })
  return mutate(h.db, meta, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${meta.actor.workspaceId}:guidance:${scope}:${id}`])
    const target = await loadScope(tx, meta.actor.workspaceId, scope, id, true)
    await assertGuidanceManager(tx, meta.actor, scope, target)
    let document = await loadDocument(tx, meta.actor.workspaceId, scope, id, true)
    assertRevision(expected, document?.revision ?? 0)
    const contentHash = sha256(body.markdown)
    if (document?.current_revision_id) {
      const current = await loadRevision(tx, meta.actor.workspaceId, document.current_revision_id)
      if (current?.content_hash === contentHash && document.status === 'active') {
        throw new DomainError('CONFLICT', 'Guidance content is unchanged')
      }
    }
    if (!document) {
      document = (await tx.query<DocumentRow>(
        `INSERT INTO guidance_documents(workspace_id,scope_type,scope_id)
         VALUES($1,$2,$3)
         RETURNING id,status,revision,current_revision_id,updated_at`,
        [meta.actor.workspaceId, scope, id],
      )).rows[0]!
    }
    const nextRevision = (await tx.query<{ next_revision: number }>(
      'SELECT coalesce(max(revision_number),0)::int+1 AS next_revision FROM guidance_revisions WHERE document_id=$1',
      [document.id],
    )).rows[0]!.next_revision
    const published = (await tx.query<RevisionRow>(
      `INSERT INTO guidance_revisions(
         workspace_id,document_id,revision_number,markdown,content_hash,
         change_summary,author_actor_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,revision_number,markdown,content_hash,change_summary,
                 author_actor_id,(SELECT display_name FROM actors WHERE id=$7) AS author_display_name,
                 published_at`,
      [meta.actor.workspaceId, document.id, nextRevision, body.markdown, contentHash, body.changeSummary, meta.actor.id],
    )).rows[0]!
    const nextDocumentRevision = expected === 0 ? 1 : expected + 1
    await tx.query(
      `UPDATE guidance_documents
          SET current_revision_id=$2,status='active',revision=$3,
              archived_at=NULL,archived_by_actor_id=NULL,updated_at=now()
        WHERE id=$1`,
      [document.id, published.id, nextDocumentRevision],
    )
    await tx.query(
      `INSERT INTO guidance_audit_facts(
         workspace_id,document_id,action,from_revision_id,to_revision_id,actor_id,reason
       ) VALUES($1,$2,'published',$3,$4,$5,$6)`,
      [meta.actor.workspaceId, document.id, document.current_revision_id, published.id, meta.actor.id, body.changeSummary],
    )
    await appendEvent(tx, {
      workspaceId: meta.actor.workspaceId, teamId: target.teamId ?? undefined,
      actorId: meta.actor.id, correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
      type: 'guidance.published', aggregateType: scope, aggregateId: id,
      revision: nextDocumentRevision,
      payload: { scope, scopeId: id, guidanceRevisionId: published.id, guidanceRevisionNumber: nextRevision, contentHash },
    })
    return readGuidance(tx, meta.actor.workspaceId, scope, id)
  })
}

async function archiveGuidance(
  h: GuidanceHelpers,
  request: FastifyRequest,
  scope: GuidanceScope,
): Promise<GuidanceResponse> {
  const id = scopeId(request)
  const body = archiveGuidanceInputSchema.parse(request.body)
  assertSafeText(body.reason, 'guidance archive reason')
  const expected = parseRevision(h.header(request, 'if-match'))
  const meta = h.meta(request, body, { id })
  return mutate(h.db, meta, async tx => {
    const target = await loadScope(tx, meta.actor.workspaceId, scope, id, true)
    await assertGuidanceManager(tx, meta.actor, scope, target)
    const document = await loadDocument(tx, meta.actor.workspaceId, scope, id, true)
    if (!document) throw new DomainError('NOT_FOUND', 'Guidance has not been published')
    assertRevision(expected, document.revision)
    if (document.status === 'archived') throw new DomainError('CONFLICT', 'Guidance is already archived')
    const nextRevision = document.revision + 1
    await tx.query(
      `UPDATE guidance_documents
          SET status='archived',revision=$2,archived_at=now(),
              archived_by_actor_id=$3,updated_at=now()
        WHERE id=$1`,
      [document.id, nextRevision, meta.actor.id],
    )
    await tx.query(
      `INSERT INTO guidance_audit_facts(
         workspace_id,document_id,action,from_revision_id,to_revision_id,actor_id,reason
       ) VALUES($1,$2,'archived',$3,NULL,$4,$5)`,
      [meta.actor.workspaceId, document.id, document.current_revision_id, meta.actor.id, body.reason],
    )
    await appendEvent(tx, {
      workspaceId: meta.actor.workspaceId, teamId: target.teamId ?? undefined,
      actorId: meta.actor.id, correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
      type: 'guidance.archived', aggregateType: scope, aggregateId: id,
      revision: nextRevision, payload: { scope, scopeId: id, previousRevisionId: document.current_revision_id },
    })
    return readGuidance(tx, meta.actor.workspaceId, scope, id)
  })
}

async function rollbackGuidance(
  h: GuidanceHelpers,
  request: FastifyRequest,
  scope: GuidanceScope,
): Promise<GuidanceResponse> {
  const id = scopeId(request)
  const body = rollbackGuidanceInputSchema.parse(request.body)
  assertSafeText(body.reason, 'guidance rollback reason')
  const expected = parseRevision(h.header(request, 'if-match'))
  const meta = h.meta(request, body, { id })
  return mutate(h.db, meta, async tx => {
    const target = await loadScope(tx, meta.actor.workspaceId, scope, id, true)
    await assertGuidanceManager(tx, meta.actor, scope, target)
    const document = await loadDocument(tx, meta.actor.workspaceId, scope, id, true)
    if (!document) throw new DomainError('NOT_FOUND', 'Guidance has not been published')
    assertRevision(expected, document.revision)
    const targetRevision = (await tx.query<{ id: string }>(
      'SELECT id FROM guidance_revisions WHERE id=$1 AND workspace_id=$2 AND document_id=$3',
      [body.revisionId, meta.actor.workspaceId, document.id],
    )).rows[0]
    if (!targetRevision) throw new DomainError('NOT_FOUND', 'Guidance revision not found')
    if (document.status === 'active' && document.current_revision_id === targetRevision.id) {
      throw new DomainError('CONFLICT', 'Guidance already points to this revision')
    }
    const nextRevision = document.revision + 1
    await tx.query(
      `UPDATE guidance_documents
          SET current_revision_id=$2,status='active',revision=$3,
              archived_at=NULL,archived_by_actor_id=NULL,updated_at=now()
        WHERE id=$1`,
      [document.id, targetRevision.id, nextRevision],
    )
    await tx.query(
      `INSERT INTO guidance_audit_facts(
         workspace_id,document_id,action,from_revision_id,to_revision_id,actor_id,reason
       ) VALUES($1,$2,'rolled_back',$3,$4,$5,$6)`,
      [meta.actor.workspaceId, document.id, document.current_revision_id, targetRevision.id, meta.actor.id, body.reason],
    )
    await appendEvent(tx, {
      workspaceId: meta.actor.workspaceId, teamId: target.teamId ?? undefined,
      actorId: meta.actor.id, correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
      type: 'guidance.rolled_back', aggregateType: scope, aggregateId: id,
      revision: nextRevision,
      payload: { scope, scopeId: id, fromRevisionId: document.current_revision_id, toRevisionId: targetRevision.id },
    })
    return readGuidance(tx, meta.actor.workspaceId, scope, id)
  })
}

async function guidanceHistory(db: Queryable, workspaceId: string, scope: GuidanceScope, id: string) {
  await loadScope(db, workspaceId, scope, id)
  const document = await loadDocument(db, workspaceId, scope, id)
  if (!document) return { scope, scopeId: id, documentId: null, revision: 0, status: 'unpublished' as const, currentRevisionId: null, revisions: [], audit: [] }
  const revisions = await db.query<RevisionRow>(
    `SELECT revision.id,revision.revision_number,revision.markdown,
            revision.content_hash,revision.change_summary,
            revision.author_actor_id,actor.display_name AS author_display_name,
            revision.published_at
       FROM guidance_revisions revision
       JOIN actors actor ON actor.id=revision.author_actor_id
      WHERE revision.workspace_id=$1 AND revision.document_id=$2
      ORDER BY revision.revision_number DESC LIMIT 200`,
    [workspaceId, document.id],
  )
  const audit = await db.query<{
    id: string; action: 'published' | 'archived' | 'rolled_back'; from_revision_id: string | null
    to_revision_id: string | null; actor_id: string; actor_display_name: string; reason: string; created_at: Date
  }>(
    `SELECT fact.id,fact.action,fact.from_revision_id,fact.to_revision_id,
            fact.actor_id,actor.display_name AS actor_display_name,
            fact.reason,fact.created_at
       FROM guidance_audit_facts fact
       JOIN actors actor ON actor.id=fact.actor_id
      WHERE fact.workspace_id=$1 AND fact.document_id=$2
      ORDER BY fact.created_at DESC,fact.id DESC LIMIT 500`,
    [workspaceId, document.id],
  )
  return {
    scope, scopeId: id, documentId: document.id, revision: document.revision,
    status: document.status, currentRevisionId: document.current_revision_id,
    revisions: revisions.rows.map(revisionMetadata),
    audit: audit.rows.map(row => ({
      id: row.id, action: row.action, fromRevisionId: row.from_revision_id,
      toRevisionId: row.to_revision_id, actorId: row.actor_id,
      actorDisplayName: row.actor_display_name, reason: row.reason,
      createdAt: row.created_at.toISOString(),
    })),
  }
}

const lineChanges = (from: string, to: string) => {
  const oldLines = from.split('\n')
  const newLines = to.split('\n')
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < oldLines.length - prefix && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix += 1
  return [
    ...oldLines.slice(0, prefix).map((text, index) => ({ kind: 'context' as const, oldLine: index + 1, newLine: index + 1, text })),
    ...oldLines.slice(prefix, oldLines.length - suffix).map((text, index) => ({ kind: 'removed' as const, oldLine: prefix + index + 1, newLine: null, text })),
    ...newLines.slice(prefix, newLines.length - suffix).map((text, index) => ({ kind: 'added' as const, oldLine: null, newLine: prefix + index + 1, text })),
    ...oldLines.slice(oldLines.length - suffix).map((text, index) => ({
      kind: 'context' as const,
      oldLine: oldLines.length - suffix + index + 1,
      newLine: newLines.length - suffix + index + 1,
      text,
    })),
  ]
}

async function guidanceDiff(db: Queryable, workspaceId: string, scope: GuidanceScope, id: string, request: FastifyRequest) {
  await loadScope(db, workspaceId, scope, id)
  const query = z.object({ fromRevisionId: z.string().uuid(), toRevisionId: z.string().uuid() }).parse(request.query)
  const document = await loadDocument(db, workspaceId, scope, id)
  if (!document) throw new DomainError('NOT_FOUND', 'Guidance has not been published')
  const rows = await db.query<RevisionRow>(
    `SELECT revision.id,revision.revision_number,revision.markdown,
            revision.content_hash,revision.change_summary,
            revision.author_actor_id,actor.display_name AS author_display_name,
            revision.published_at
       FROM guidance_revisions revision
       JOIN actors actor ON actor.id=revision.author_actor_id
      WHERE revision.workspace_id=$1 AND revision.document_id=$2
        AND revision.id=ANY($3::uuid[])`,
    [workspaceId, document.id, [query.fromRevisionId, query.toRevisionId]],
  )
  const from = rows.rows.find(row => row.id === query.fromRevisionId)
  const to = rows.rows.find(row => row.id === query.toRevisionId)
  if (!from || !to) throw new DomainError('NOT_FOUND', 'Guidance revision not found')
  return { scope, scopeId: id, from: revisionMetadata(from), to: revisionMetadata(to), changes: lineChanges(from.markdown, to.markdown) }
}

export function registerGuidanceRoutes(app: FastifyInstance, h: GuidanceHelpers): void {
  for (const scope of ['workspace', 'team', 'project'] as const) {
    const plural = `${scope}s`
    const root = `/api/v1/${plural}/:id/guidance`
    app.get(root, request => readGuidance(h.db, actor(request).workspaceId, scope, scopeId(request)))
    app.put(root, request => publishGuidance(h, request, scope))
    app.get(`${root}/history`, request => guidanceHistory(h.db, actor(request).workspaceId, scope, scopeId(request)))
    app.get(`${root}/diff`, request => guidanceDiff(h.db, actor(request).workspaceId, scope, scopeId(request), request))
    app.post(`${root}/archive`, request => archiveGuidance(h, request, scope))
    app.post(`${root}/rollback`, request => rollbackGuidance(h, request, scope))
  }
}
