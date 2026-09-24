import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  llmConnectionCreateInputSchema,
  llmConnectionResponseSchema,
  llmConnectionUpdateInputSchema,
  llmModelResponseSchema,
  llmModelUpsertInputSchema,
} from '@workmesh/contracts'
import { appendEvent } from '@workmesh/db'
import { DomainError, assertRevision, parseRevision } from '@workmesh/domain'
import { mutate, type CommandContext } from './commands.js'
import type { ApiActor } from './agent/types.js'
import type { Paginator } from './pagination.js'

type ConnectionRow = {
  id: string; workspace_id: string; scope: 'personal' | 'team' | 'workspace'
  owner_actor_id: string | null; team_id: string | null; name: string
  api_type: 'openai-completions' | 'openai-responses'; base_url: string
  status: 'active' | 'disabled' | 'revoked'; revision: number
  created_by_actor_id: string; created_at: Date; updated_at: Date; revoked_at: Date | null
  can_manage?: boolean
}
type ModelRow = {
  id: string; connection_id: string; external_model_id: string; display_name: string
  enabled: boolean; capabilities: unknown; revision: number; created_at: Date; updated_at: Date
}

const one = <T>(rows: T[]): T => {
  if (!rows[0]) throw new DomainError('NOT_FOUND', 'LLM connection was not found')
  return rows[0]
}
const actor = (request: FastifyRequest): ApiActor => request.actor as ApiActor
const requireHuman = (current: ApiActor): void => {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human account required')
}
const id = (request: FastifyRequest): string => z.string().uuid().parse((request.params as { id?: unknown }).id)
const masterKey = (): string => {
  const key = process.env.WORKMESH_MASTER_KEY
  if (!key) throw new DomainError('INTERNAL_ERROR', 'LLM secret storage is unavailable')
  return key
}
const secretFingerprint = (secret: string): string =>
  createHmac('sha256', masterKey()).update('workbench-llm-idempotency-v1\0').update(secret).digest('hex')

export function normalizeLlmBaseUrl(raw: string, allowPrivate: boolean): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new DomainError('VALIDATION_ERROR', 'Use an HTTPS base URL without credentials, query, or fragment')
  const host = url.hostname.toLowerCase()
  const privateHost = isIP(host) !== 0 || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
  const allowlist = (process.env.WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST ?? '').split(',').map(value => value.trim().toLowerCase())
  if (privateHost && (!allowPrivate || !allowlist.includes(host)))
    throw new DomainError('FORBIDDEN', 'Private model endpoint must be explicitly allowlisted by the deployment and configured by a workspace administrator')
  if (/%2f|%5c|%00/i.test(url.pathname))
    throw new DomainError('VALIDATION_ERROR', 'Encoded path separators are not allowed in model base URLs')
  url.pathname = url.pathname.replace(/\/(chat\/completions|responses)\/?$/, '').replace(/\/+$/, '') || '/'
  if (/\/(chat\/completions|responses)\/?$/.test(url.pathname))
    throw new DomainError('VALIDATION_ERROR', 'Model endpoint path appears more than once')
  return url.toString().replace(/\/$/, '')
}

const connectionResponse = (row: ConnectionRow) => llmConnectionResponseSchema.parse({
  id: row.id, workspace_id: row.workspace_id, scope: row.scope,
  scope_id: row.scope === 'personal' ? row.owner_actor_id : row.scope === 'team' ? row.team_id : null,
  name: row.name, api_type: row.api_type, base_url: row.base_url, status: row.status,
  secret_status: row.status === 'revoked' ? 'missing' : 'configured',
  can_manage: row.can_manage ?? true,
  created_by_actor_id: row.created_by_actor_id, revision: row.revision,
  created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
  revoked_at: row.revoked_at?.toISOString() ?? null,
})
const modelResponse = (row: ModelRow) => llmModelResponseSchema.parse({
  id: row.id, connection_id: row.connection_id, external_model_id: row.external_model_id,
  display_name: row.display_name, enabled: row.enabled, capabilities: row.capabilities,
  revision: row.revision, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
})
const eventScope = (row: ConnectionRow) => ({
  teamId: row.team_id ?? undefined,
  audienceActorId: row.owner_actor_id ?? undefined,
})

async function authorize(tx: PoolClient, current: ApiActor, row: ConnectionRow, mode: 'read' | 'manage'): Promise<void> {
  requireHuman(current)
  if (row.workspace_id !== current.workspaceId) throw new DomainError('NOT_FOUND', 'LLM connection was not found')
  if (row.scope === 'personal') {
    if (row.owner_actor_id === current.id) return
    throw new DomainError('NOT_FOUND', 'LLM connection was not found')
  }
  if (current.workspaceRole === 'admin') return
  if (row.scope === 'workspace') {
    if (mode === 'read') return
    throw new DomainError('FORBIDDEN', 'Workspace administrator role required')
  }
  const membership = await tx.query<{ role: string }>(
    'SELECT role FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
    [current.workspaceId, row.team_id, current.id],
  )
  const role = membership.rows[0]?.role
  if (!role) throw new DomainError('NOT_FOUND', 'LLM connection was not found')
  if (mode === 'manage' && role !== 'admin' && role !== 'maintainer')
    throw new DomainError('FORBIDDEN', 'Team maintainer role required')
}

async function canManage(tx: PoolClient, current: ApiActor, row: ConnectionRow): Promise<boolean> {
  if (row.scope === 'personal') return row.owner_actor_id === current.id
  if (current.workspaceRole === 'admin') return true
  if (row.scope === 'workspace') return false
  const member = await tx.query<{ role: string }>(
    'SELECT role FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
    [current.workspaceId, row.team_id, current.id],
  )
  return ['admin', 'maintainer'].includes(member.rows[0]?.role ?? '')
}

async function locked(tx: PoolClient, current: ApiActor, connectionId: string): Promise<ConnectionRow> {
  return one((await tx.query<ConnectionRow>(
    'SELECT * FROM workbench_llm_connections WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
    [current.workspaceId, connectionId],
  )).rows)
}
async function authorizeCreate(tx: PoolClient, current: ApiActor, scope: string, teamId?: string): Promise<void> {
  requireHuman(current)
  if (scope === 'workspace' && current.workspaceRole !== 'admin')
    throw new DomainError('FORBIDDEN', 'Workspace administrator role required')
  if (scope !== 'team') return
  const membership = await tx.query<{ role: string }>(
    `SELECT member.role FROM teams team LEFT JOIN memberships member
     ON member.workspace_id=team.workspace_id AND member.team_id=team.id AND member.actor_id=$3
     WHERE team.workspace_id=$1 AND team.id=$2 AND team.deleted_at IS NULL`,
    [current.workspaceId, teamId, current.id])
  if (!membership.rowCount) throw new DomainError('NOT_FOUND', 'Team was not found')
  if (current.workspaceRole !== 'admin' && !['admin', 'maintainer'].includes(membership.rows[0]?.role ?? ''))
    throw new DomainError('FORBIDDEN', 'Team maintainer role required')
}

type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext
  header: (request: FastifyRequest, name: string) => string | undefined
  paginator: Paginator
}

export function registerWorkbenchLlmConnectionRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/workbench/llm-connections', async request => {
    const current = actor(request); requireHuman(current)
    const page = await h.paginator.query<ConnectionRow>(h.db, request, request.query, {
      route: '/api/v1/workbench/llm-connections', filters: {},
      sort: [{ key: 'created_at', sql: 'connection.created_at', direction: 'DESC' }, { key: 'id', sql: 'connection.id', direction: 'DESC' }],
    }, `SELECT connection.id,connection.workspace_id,connection.scope,connection.owner_actor_id,
      connection.team_id,connection.name,connection.api_type,connection.base_url,connection.status,
      connection.revision,connection.created_by_actor_id,connection.created_at,connection.updated_at,
      CASE WHEN connection.scope='personal' THEN connection.owner_actor_id=$2
        WHEN $3='admin' THEN true WHEN connection.scope='workspace' THEN false
        ELSE EXISTS (SELECT 1 FROM memberships manager WHERE manager.workspace_id=$1
          AND manager.team_id=connection.team_id AND manager.actor_id=$2
          AND manager.role IN ('admin','maintainer')) END AS can_manage,
      connection.revoked_at FROM workbench_llm_connections connection
      WHERE connection.workspace_id=$1 AND (connection.scope='workspace'
        OR connection.owner_actor_id=$2
        OR (connection.scope='team' AND EXISTS (
          SELECT 1 FROM memberships member WHERE member.workspace_id=$1
            AND member.team_id=connection.team_id AND member.actor_id=$2)))`,
    [current.workspaceId, current.id, current.workspaceRole])
    return { items: page.items.map(connectionResponse), nextCursor: page.nextCursor }
  })

  app.post('/api/v1/workbench/llm-connections', async (request, reply) => {
    const body = llmConnectionCreateInputSchema.parse(request.body)
    const current = actor(request); requireHuman(current)
    const context = h.meta(request, { ...body, secretMaterial: secretFingerprint(body.secretMaterial) })
    const result = await mutate(h.db, context, async tx => {
      await authorizeCreate(tx, current, body.scope, body.teamId)
      const baseUrl = normalizeLlmBaseUrl(body.baseUrl, current.workspaceRole === 'admin')
      const row = one((await tx.query<ConnectionRow>(
        `INSERT INTO workbench_llm_connections
         (workspace_id,scope,owner_actor_id,team_id,name,api_type,base_url,secret_ciphertext,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,pgp_sym_encrypt($8,$9),$10) RETURNING *`,
        [current.workspaceId, body.scope, body.scope === 'personal' ? current.id : null,
          body.scope === 'team' ? body.teamId : null, body.name, body.apiType, baseUrl,
          body.secretMaterial, masterKey(), current.id],
      )).rows)
      await appendEvent(tx, { workspaceId: current.workspaceId, actorId: current.id, ...eventScope(row),
        correlationId: context.correlationId, idempotencyKey: context.idempotencyKey,
        type: 'workbench.llm_connection.created', aggregateType: 'workbench_llm_connection',
        aggregateId: row.id, revision: row.revision,
        payload: { llmConnectionId: row.id, scope: row.scope, apiType: row.api_type },
        resources: { scopes: [{ type: 'workspace', id: current.workspaceId }], invalidates: [{ type: 'workspace', id: current.workspaceId }] },
      })
      return connectionResponse(row)
    }, { authorizeReplay: tx => authorizeCreate(tx, current, body.scope, body.teamId) })
    return reply.code(201).send(result)
  })

  app.get('/api/v1/workbench/llm-connections/:id', async request => {
    const current = actor(request)
    const client = await h.db.connect()
    try {
      const row = one((await client.query<ConnectionRow>(
        'SELECT * FROM workbench_llm_connections WHERE workspace_id=$1 AND id=$2', [current.workspaceId, id(request)],
      )).rows)
      await authorize(client, current, row, 'read')
      row.can_manage = await canManage(client, current, row)
      const models = await client.query<ModelRow>(
        'SELECT * FROM workbench_llm_models WHERE workspace_id=$1 AND connection_id=$2 ORDER BY created_at,id',
        [current.workspaceId, row.id],
      )
      return { ...connectionResponse(row), models: models.rows.map(modelResponse) }
    } finally { client.release() }
  })

  app.patch('/api/v1/workbench/llm-connections/:id', async request => {
    const body = llmConnectionUpdateInputSchema.parse(request.body)
    const current = actor(request); requireHuman(current)
    const connectionId = id(request)
    const context = h.meta(request, { ...body, secretMaterial: body.secretMaterial ? secretFingerprint(body.secretMaterial) : undefined }, { id: connectionId })
    return mutate(h.db, context, async tx => {
      const before = await locked(tx, current, connectionId)
      await authorize(tx, current, before, 'manage')
      if (before.status === 'revoked') throw new DomainError('VALIDATION_ERROR', 'Revoked connection cannot be changed')
      assertRevision(parseRevision(h.header(request, 'if-match')), before.revision)
      const baseUrl = body.baseUrl === undefined ? before.base_url : normalizeLlmBaseUrl(body.baseUrl, current.workspaceRole === 'admin')
      const row = one((await tx.query<ConnectionRow>(
        `UPDATE workbench_llm_connections SET name=COALESCE($3,name),api_type=COALESCE($4,api_type),
          base_url=$5,status=COALESCE($6,status),
          secret_ciphertext=CASE WHEN $7::text IS NULL THEN secret_ciphertext ELSE pgp_sym_encrypt($7,$8) END,
          revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING *`,
        [current.workspaceId, connectionId, body.name ?? null, body.apiType ?? null, baseUrl,
          body.status ?? null, body.secretMaterial ?? null, masterKey()],
      )).rows)
      await appendEvent(tx, { workspaceId: current.workspaceId, actorId: current.id, ...eventScope(row),
        correlationId: context.correlationId, idempotencyKey: context.idempotencyKey,
        type: 'workbench.llm_connection.updated', aggregateType: 'workbench_llm_connection', aggregateId: row.id,
        revision: row.revision, payload: { llmConnectionId: row.id, revision: row.revision },
        resources: { scopes: [{ type: 'workspace', id: current.workspaceId }], invalidates: [{ type: 'workspace', id: current.workspaceId }] },
      })
      return connectionResponse(row)
    }, { authorizeReplay: async tx => authorize(tx, current, await locked(tx, current, connectionId), 'manage') })
  })

  app.delete('/api/v1/workbench/llm-connections/:id', async (request, reply) => {
    const current = actor(request); requireHuman(current)
    const connectionId = id(request)
    const context = h.meta(request, {}, { id: connectionId })
    await mutate(h.db, context, async tx => {
      const before = await locked(tx, current, connectionId)
      await authorize(tx, current, before, 'manage')
      assertRevision(parseRevision(h.header(request, 'if-match')), before.revision)
      if (before.status === 'revoked') throw new DomainError('VALIDATION_ERROR', 'Connection is already revoked')
      const row = one((await tx.query<ConnectionRow>(
        `UPDATE workbench_llm_connections SET status='revoked',revoked_at=now(),
          secret_ciphertext=pgp_sym_encrypt('', $3),revision=revision+1,updated_at=now()
          WHERE workspace_id=$1 AND id=$2 RETURNING *`, [current.workspaceId, connectionId, masterKey()],
      )).rows)
      await appendEvent(tx, { workspaceId: current.workspaceId, actorId: current.id, ...eventScope(row),
        correlationId: context.correlationId, idempotencyKey: context.idempotencyKey,
        type: 'workbench.llm_connection.revoked', aggregateType: 'workbench_llm_connection', aggregateId: row.id,
        revision: row.revision, payload: { llmConnectionId: row.id, reason: 'owner_revoked' },
        resources: { scopes: [{ type: 'workspace', id: current.workspaceId }], invalidates: [{ type: 'workspace', id: current.workspaceId }] },
      })
      return connectionResponse(row)
    }, { authorizeReplay: async tx => authorize(tx, current, await locked(tx, current, connectionId), 'manage') })
    return reply.code(204).send()
  })

  app.post('/api/v1/workbench/llm-connections/:id/models', async (request, reply) => {
    const body = llmModelUpsertInputSchema.parse(request.body)
    const current = actor(request); requireHuman(current)
    const connectionId = id(request)
    const context = h.meta(request, body, { id: connectionId })
    const result = await mutate(h.db, context, async tx => {
      const connection = await locked(tx, current, connectionId)
      await authorize(tx, current, connection, 'manage')
      if (connection.status === 'revoked') throw new DomainError('VALIDATION_ERROR', 'Connection is revoked')
      assertRevision(parseRevision(h.header(request, 'if-match')), connection.revision)
      const inserted = await tx.query<ModelRow>(
        `INSERT INTO workbench_llm_models
         (workspace_id,connection_id,external_model_id,display_name,enabled,capabilities)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,external_model_id) DO NOTHING RETURNING *`,
        [current.workspaceId, connectionId, body.externalModelId, body.displayName, body.enabled, body.capabilities],
      )
      const wasCreated = inserted.rowCount === 1
      const row = wasCreated ? one(inserted.rows) : one((await tx.query<ModelRow>(
        `UPDATE workbench_llm_models SET display_name=$4,enabled=$5,capabilities=$6,
          revision=revision+1,updated_at=now()
          WHERE workspace_id=$1 AND connection_id=$2 AND external_model_id=$3 RETURNING *`,
        [current.workspaceId, connectionId, body.externalModelId, body.displayName, body.enabled, body.capabilities],
      )).rows)
      await appendEvent(tx, { workspaceId: current.workspaceId, actorId: current.id, ...eventScope(connection),
        correlationId: context.correlationId, idempotencyKey: context.idempotencyKey,
        type: wasCreated ? 'workbench.llm_model.created' : 'workbench.llm_model.updated', aggregateType: 'workbench_llm_model', aggregateId: row.id,
        revision: row.revision, payload: { llmConnectionId: connectionId, llmModelId: row.id },
        resources: { scopes: [{ type: 'workspace', id: current.workspaceId }], invalidates: [{ type: 'workspace', id: current.workspaceId }] },
      })
      const newRevision = connection.revision + 1
      await tx.query(
        'UPDATE workbench_llm_connections SET revision=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2',
        [current.workspaceId, connectionId, newRevision],
      )
      await appendEvent(tx, { workspaceId: current.workspaceId, actorId: current.id, ...eventScope(connection),
        correlationId: context.correlationId, idempotencyKey: context.idempotencyKey,
        type: 'workbench.llm_connection.updated', aggregateType: 'workbench_llm_connection', aggregateId: connectionId,
        revision: newRevision, payload: { llmConnectionId: connectionId, revision: newRevision },
        resources: { scopes: [{ type: 'workspace', id: current.workspaceId }], invalidates: [{ type: 'workspace', id: current.workspaceId }] },
      })
      return modelResponse(row)
    }, { authorizeReplay: async tx => authorize(tx, current, await locked(tx, current, connectionId), 'manage') })
    return reply.code(201).send(result)
  })
}
