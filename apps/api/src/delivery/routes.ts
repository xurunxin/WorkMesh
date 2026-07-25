import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  artifactUploadIntentInputSchema,
  ciRetryInputSchema,
  completionSuggestionDecisionInputSchema,
  completionSuggestionInputSchema,
  deliveryArtifactInputSchema,
  mergeIntentInputSchema,
  milestoneInputSchema,
  projectDependencyInputSchema,
  projectUpdatePublishInputSchema,
  projectUpdateInputSchema,
  providerActionInputSchema,
  providerConnectionInputSchema,
  repositoryContextInputSchema,
  repositoryInputSchema,
  structuredReviewInputSchema,
  type ProviderActionInput,
} from '@workmesh/contracts'
import { appendEvent, withTx } from '@workmesh/db'
import {
  assertAcyclicProjectDependencies,
  assertMergeReady,
  assertRevision,
  canonicalActionApprovalPayload,
  canonicalMergeApprovalPayload,
  DomainError,
  parseRevision,
} from '@workmesh/domain'
import { verifyGitHubWebhookSignature } from '@workmesh/git-provider'
import { artifactStorageFromEnvironment } from '@workmesh/artifact-storage'
import { mutate, type CommandContext } from '../commands.js'
import { assertSanitized } from '../agent/commands.js'
import { assertAgentWrite, loadAgentSessionForMutation } from '../agent/guard.js'
import type { ApiActor, RequestMeta } from '../agent/types.js'

type Helpers = {
  db: Pool
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
  readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>
}
type RepositoryRow = {
  id: string
  workspace_id: string
  connection_id: string
  team_id: string
  external_id: string
  full_name: string
  default_branch: string
  required_checks: string[]
  provider: 'fake' | 'github'
}
type RepositoryContextRow = RepositoryRow & {
  context_id: string
  project_id: string | null
  work_item_id: string | null
  session_id: string | null
  base_branch: string
  base_sha: string
  branch_pattern: string
  allowed_paths: string[]
  permissions: Array<'read' | 'write_branch' | 'open_pr' | 'review' | 'merge' | 'ci'>
  guidance_manifest_hash: string
  context_created_at: Date
}
const uuid = z.string().uuid()
const actor = (request: FastifyRequest) => request.actor as unknown as ApiActor
const command = <T>(db: Pool, meta: RequestMeta, fn: (tx: PoolClient) => Promise<T>) =>
  mutate(db, meta as unknown as CommandContext, fn)
const one = <T>(rows: T[]): T => {
  const row = rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Resource not found')
  return row
}
const id = (request: FastifyRequest): string =>
  uuid.parse((request.params as { id?: unknown }).id)
const connectionId = (request: FastifyRequest): string =>
  uuid.parse((request.params as { connectionId?: unknown }).connectionId)
const updateId = (request: FastifyRequest): string =>
  uuid.parse((request.params as { updateId?: unknown }).updateId)
const checkId = (request: FastifyRequest): string =>
  z.string().min(1).max(500).parse((request.params as { checkId?: unknown }).checkId)
const hash = (value: Buffer | string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`
const masterKey = (): string => {
  const value = process.env.WORKMESH_MASTER_KEY
  if (!value) throw new DomainError('INTERNAL_ERROR', 'WORKMESH_MASTER_KEY is required for provider secrets')
  return value
}
const emit = (
  tx: PoolClient,
  meta: RequestMeta,
  type: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  teamId?: string,
) => appendEvent(tx, {
  workspaceId: meta.actor.workspaceId, teamId, actorId: meta.actor.id,
  correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
  type, aggregateType, aggregateId, payload,
})

function requireHuman(current: ApiActor, admin = false): void {
  if (current.kind !== 'human' || (admin && current.workspaceRole !== 'admin'))
    throw new DomainError('FORBIDDEN', admin ? 'Workspace administrator role is required' : 'Human authorization is required')
}

async function requireCurrentTeamWriter(tx: PoolClient, current: ApiActor, teamId: string): Promise<void> {
  requireHuman(current)
  if (current.workspaceRole === 'admin') return
  const membership = await tx.query(
    `SELECT 1 FROM memberships m JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id
      WHERE m.workspace_id=$1 AND m.team_id=$2 AND m.actor_id=$3 AND t.deleted_at IS NULL
        AND m.role IN ('admin','maintainer','member')`,
    [current.workspaceId, teamId, current.id],
  )
  if (!membership.rowCount) throw new DomainError('FORBIDDEN', 'Current Team write membership is required')
}

async function repository(tx: PoolClient, workspaceId: string, repositoryId: string, lock = false): Promise<RepositoryRow> {
  const row = (await tx.query<RepositoryRow>(
    `SELECT r.id,r.workspace_id,r.connection_id,r.team_id,r.external_id,r.full_name,r.default_branch,r.required_checks,c.provider
       FROM repositories r JOIN provider_connections c ON c.id=r.connection_id
      WHERE r.id=$1 AND r.workspace_id=$2 AND r.active AND c.active${lock ? ' FOR UPDATE OF r' : ''}`,
    [repositoryId, workspaceId],
  )).rows[0]
  if (!row) throw new DomainError('REPOSITORY_NOT_FOUND', 'Repository not found')
  return row
}

async function assertRepositoryRead(tx: PoolClient, current: ApiActor, repositoryId: string): Promise<RepositoryRow> {
  if (current.kind === 'human') {
    const repo = await repository(tx, current.workspaceId, repositoryId)
    if (current.workspaceRole === 'admin') return repo
    const member = await tx.query(
      'SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3',
      [current.workspaceId, repo.team_id, current.id],
    )
    if (!member.rowCount) throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Repository not found')
    return repo
  }
  const context = (await applicableAgentRepositoryContexts(tx, current, repositoryId)).rows[0]
  if (!context) throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Repository not found')
  return context
}

function applicableAgentRepositoryContexts(
  tx: PoolClient,
  current: ApiActor,
  repositoryId?: string,
) {
  if (current.kind !== 'agent' || !current.agentSessionId)
    throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An agent session token is required')
  return tx.query<RepositoryContextRow>(
    `WITH applicable AS (
       SELECT r.id,r.workspace_id,r.connection_id,r.team_id,r.external_id,r.full_name,r.default_branch,
              r.required_checks,c.provider,rc.id AS context_id,rc.project_id,rc.work_item_id,rc.session_id,
              rc.base_branch,rc.base_sha,rc.branch_pattern,rc.allowed_paths,rc.permissions,
              rc.guidance_manifest_hash,rc.created_at AS context_created_at,
              row_number() OVER (
                PARTITION BY r.id
                ORDER BY CASE WHEN rc.session_id IS NOT NULL THEN 0 WHEN rc.work_item_id IS NOT NULL THEN 1 ELSE 2 END,
                         rc.created_at DESC,rc.id DESC
              ) AS context_rank
         FROM agent_sessions s
         JOIN delegations d ON d.id=s.delegation_id AND d.status='active'
         JOIN agent_definitions a ON a.id=s.agent_id AND a.is_active
         JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id
           AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
         JOIN repository_contexts rc ON rc.workspace_id=s.workspace_id
           AND ((rc.session_id IS NOT NULL AND rc.session_id=s.id)
             OR (rc.work_item_id IS NOT NULL AND rc.work_item_id=s.work_item_id)
             OR (rc.project_id IS NOT NULL AND rc.project_id=s.project_id))
         JOIN repositories r ON r.id=rc.repository_id AND r.workspace_id=s.workspace_id
           AND r.team_id=s.team_id AND r.active
         JOIN provider_connections c ON c.id=r.connection_id AND c.workspace_id=s.workspace_id AND c.active
        WHERE s.id=$1 AND s.workspace_id=$2
          AND s.state NOT IN ('completed','failed','canceled')
          AND ($3::uuid IS NULL OR r.id=$3)
          AND 'repo:read'=ANY(d.permissions_snapshot)
          AND 'repo:read'=ANY(a.approved_capabilities)
          AND 'repo:read'=ANY(ata.approved_capabilities)
          AND coalesce(d.capability_scope->'repositoryIds','[]'::jsonb) ? r.id::text
     )
     SELECT id,workspace_id,connection_id,team_id,external_id,full_name,default_branch,
            required_checks,provider,context_id,project_id,work_item_id,session_id,
            base_branch,base_sha,branch_pattern,allowed_paths,permissions,
            guidance_manifest_hash,context_created_at
       FROM applicable WHERE context_rank=1 ORDER BY full_name`,
    [current.agentSessionId, current.workspaceId, repositoryId ?? null],
  )
}

async function assertAgentRepositoryWrite(
  tx: PoolClient,
  current: ApiActor,
  input: {
    sessionId: string
    workItemId: string
    repositoryId: string
    projectId?: string
    planStepId?: string
  },
  capability: 'repo:write_branch' | 'repo:open_pr' | 'repo:merge' | 'artifact:write',
  contextPermission: 'read' | 'write_branch' | 'open_pr' | 'review' | 'merge' = 'read',
) {
  if (current.kind !== 'agent' || current.agentSessionId !== input.sessionId)
    throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An agent session token is required')
  const session = await loadAgentSessionForMutation(tx, current, input.sessionId)
  await assertDeliveryTarget(tx, current, session, input)
  assertAgentWrite({
    actor: current, session, sessionId: input.sessionId, capability,
    operation: 'artifact', idempotencyKey: 'delivery-command',
    resourceId: input.workItemId,
  })
  const context = (await applicableAgentRepositoryContexts(tx, current, input.repositoryId)).rows[0]
  if (!context) throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Repository not found')
  if (!context.permissions.includes(contextPermission))
    throw new DomainError('CAPABILITY_DENIED', `Repository context does not allow ${contextPermission}`)
  return { repo: context as RepositoryRow, session, context }
}

async function prepareAgentPullRequestAccess(
  tx: PoolClient,
  current: ApiActor,
  sessionId: string,
  capability: 'artifact:write' | 'repo:merge' | 'ci:run',
  contextPermission: 'review' | 'merge' | 'ci',
) {
  if (current.kind !== 'agent' || current.agentSessionId !== sessionId)
    throw new DomainError('AGENT_IDENTITY_REQUIRED', 'An agent session token is required')
  const session = await loadAgentSessionForMutation(tx, current, sessionId)
  assertAgentWrite({
    actor: current, session, sessionId, capability, operation: 'artifact',
    idempotencyKey: 'pull-request-command', resourceId: session.work_item_id,
  })
  const applicable = (await applicableAgentRepositoryContexts(tx, current)).rows
  const contexts = applicable.filter((context, index, rows) => rows.findIndex(candidate => candidate.id === context.id) === index)
    .filter(context => context.permissions.includes(contextPermission))
  if (contexts.length === 0)
    throw new DomainError('CAPABILITY_DENIED', `Repository context does not allow ${contextPermission}`)
  return { session, repositoryIds: [...new Set(contexts.map(context => context.id))] }
}

async function assertDeliveryTarget(
  tx: PoolClient,
  current: ApiActor,
  session: Awaited<ReturnType<typeof loadAgentSessionForMutation>>,
  input: { workItemId: string; projectId?: string; planStepId?: string },
): Promise<void> {
  if (session.work_item_id !== input.workItemId)
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'Delivery target is outside the session work item')
  const workItem = one((await tx.query<{ project_id: string | null }>(
    'SELECT project_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
    [input.workItemId, current.workspaceId],
  )).rows)
  if (input.projectId !== undefined && input.projectId !== workItem.project_id)
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'Delivery project does not own the session work item')
  if (input.planStepId !== undefined) {
    if (!session.current_plan_version_id)
      throw new DomainError('RESOURCE_SCOPE_DENIED', 'Delivery plan step is outside the current plan')
    const step = await tx.query(
      'SELECT 1 FROM agent_plan_steps WHERE plan_version_id=$1 AND id=$2',
      [session.current_plan_version_id, input.planStepId],
    )
    if (!step.rowCount)
      throw new DomainError('RESOURCE_SCOPE_DENIED', 'Delivery plan step is outside the current plan')
  }
}

function allowedPath(path: string, scopes: string[]): boolean {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return false
  return scopes.some((scope) => {
    const prefix = scope.replaceAll('\\', '/').replace(/\/\*\*$/, '').replace(/\*$/, '')
    const directory = prefix.replace(/\/$/, '')
    return directory === '' || normalized === directory || normalized.startsWith(`${directory}/`)
  })
}

function matchesBranchPattern(pattern: string, workItemKey: string, branch: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = escaped
    .replaceAll('\\{workItemKey\\}', workItemKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .replaceAll('\\{slug\\}', '[a-z0-9]+(?:-[a-z0-9]+)*')
  return new RegExp(`^${expression}$`).test(branch)
}

async function assertCreatedDeliveryBranch(
  tx: PoolClient,
  input: { repositoryId: string; sessionId: string; workItemId: string; branch: string },
): Promise<void> {
  const created = await tx.query(
    `SELECT 1 FROM provider_actions
      WHERE repository_id=$1 AND session_id=$2 AND work_item_id=$3
        AND kind='create_branch' AND status='completed' AND payload->>'name'=$4
      LIMIT 1`,
    [input.repositoryId, input.sessionId, input.workItemId, input.branch],
  )
  if (!created.rowCount)
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'Delivery branch was not created by this session for this work item and repository')
}

async function assertEvidenceArtifacts(
  tx: PoolClient,
  input: {
    workspaceId: string
    projectId: string
    workItemId?: string
    repositoryId?: string
    artifactIds: string[]
  },
): Promise<void> {
  const artifactIds = [...new Set(input.artifactIds)]
  if (artifactIds.length === 0) return
  const linked = await tx.query<{ artifact_id: string }>(
    `SELECT l.artifact_id
       FROM artifact_links l
       JOIN artifacts a ON a.id=l.artifact_id AND a.workspace_id=l.workspace_id
      WHERE l.workspace_id=$1 AND l.project_id=$2
        AND ($3::uuid IS NULL OR l.work_item_id=$3)
        AND ($4::uuid IS NULL OR l.repository_id IS NULL OR l.repository_id=$4)
        AND l.artifact_id=ANY($5::uuid[])`,
    [input.workspaceId, input.projectId, input.workItemId ?? null, input.repositoryId ?? null, artifactIds],
  )
  if (linked.rowCount !== artifactIds.length)
    throw new DomainError('RESOURCE_SCOPE_DENIED', 'Evidence artifacts must be linked to the same workspace and delivery target')
}

export function registerDeliveryRoutes(app: FastifyInstance, h: Helpers): void {
  app.post('/api/v1/provider-connections', async (request) => {
    const body = providerConnectionInputSchema.parse(request.body)
    requireHuman(actor(request), true)
    return command(h.db, h.meta(request, { ...body, webhookSecret: '[REDACTED]', privateKey: body.privateKey ? '[REDACTED]' : undefined }), async tx => {
      const service = one((await tx.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name,is_active) VALUES($1,'service',$2,true) RETURNING id",
        [actor(request).workspaceId, `${body.displayName} provider`],
      )).rows)
      const row = one((await tx.query(
        `INSERT INTO provider_connections(workspace_id,provider,external_account_id,display_name,installation_id,service_actor_id,webhook_secret_ciphertext,credentials_ciphertext)
         VALUES($1,$2,$3,$4,$5,$6,pgp_sym_encrypt($7,$9),
           CASE WHEN $8::text IS NULL THEN NULL ELSE pgp_sym_encrypt($8,$9) END)
         RETURNING id,workspace_id,provider,external_account_id,display_name,installation_id,service_actor_id,active,revision,created_at,updated_at`,
        [
          actor(request).workspaceId, body.provider, body.externalAccountId, body.displayName,
          body.installationId ?? null, service.id, body.webhookSecret,
          body.provider === 'github' ? JSON.stringify({ appId: body.appId, privateKey: body.privateKey }) : null,
          masterKey(),
        ],
      )).rows)
      await emit(tx, h.meta(request, { provider: body.provider }), 'provider.connection.created', 'provider_connection', String((row as { id: string }).id), { provider: body.provider })
      return row
    })
  })

  app.post('/api/v1/provider-webhooks/:connectionId/github', { bodyLimit: 1_048_576 }, async (request, reply) => {
    const delivery = h.header(request, 'x-github-delivery')
    const eventName = h.header(request, 'x-github-event')
    const signature = h.header(request, 'x-hub-signature-256')
    if (!delivery || delivery.length > 200 || !eventName || eventName.length > 100 || !signature || signature.length > 80)
      throw new DomainError('PROVIDER_SIGNATURE_INVALID', 'Required GitHub delivery headers are missing or invalid')
    const rawBody = request.rawBody
    if (!rawBody) throw new DomainError('PROVIDER_SIGNATURE_INVALID', 'Exact raw webhook bytes were not captured')
    const payload = z.record(z.unknown()).parse(request.body)
    const result = await withTx(h.db, async tx => {
      const connection = (await tx.query<{ id: string; workspace_id: string; service_actor_id: string; secret: string }>(
        `SELECT id,workspace_id,service_actor_id,pgp_sym_decrypt(webhook_secret_ciphertext,$2) AS secret
           FROM provider_connections WHERE id=$1 AND provider='github' AND active FOR UPDATE`,
        [connectionId(request), masterKey()],
      )).rows[0]
      if (!connection || !verifyGitHubWebhookSignature(connection.secret, rawBody, signature))
        throw new DomainError('PROVIDER_SIGNATURE_INVALID', 'GitHub webhook signature is invalid')
      const bodyHash = hash(rawBody)
      const previous = (await tx.query<{ id: string; body_hash: string }>(
        'SELECT id,body_hash FROM provider_webhook_deliveries WHERE connection_id=$1 AND delivery_id=$2',
        [connection.id, delivery],
      )).rows[0]
      if (previous) {
        if (previous.body_hash !== bodyHash)
          throw new DomainError('PROVIDER_DELIVERY_CONFLICT', 'Delivery ID was replayed with different bytes')
        return { id: previous.id, replay: true }
      }
      const externalRepositoryId = String((payload.repository as Record<string, unknown> | undefined)?.id ?? '')
      const repo = externalRepositoryId ? (await tx.query<{ id: string; team_id: string }>(
        'SELECT id,team_id FROM repositories WHERE connection_id=$1 AND external_id=$2 AND active',
        [connection.id, externalRepositoryId],
      )).rows[0] : undefined
      const row = one((await tx.query<{ id: string }>(
        `INSERT INTO provider_webhook_deliveries(connection_id,repository_id,delivery_id,event_name,body_hash,payload)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [connection.id, repo?.id ?? null, delivery, eventName, bodyHash, payload],
      )).rows)
      await appendEvent(tx, {
        workspaceId: connection.workspace_id, teamId: repo?.team_id, actorId: connection.service_actor_id,
        correlationId: request.correlationId, idempotencyKey: delivery,
        type: 'provider.webhook.received', aggregateType: 'provider_webhook_delivery',
        aggregateId: row.id, payload: { eventName, deliveryId: delivery, bodyHash },
      })
      return { id: row.id, replay: false }
    })
    reply.code(result.replay ? 200 : 202)
    return result
  })

  app.get('/api/v1/repositories', async request => withTx(h.db, async tx => {
    const current = actor(request)
    if (current.kind === 'agent') {
      const contexts = (await applicableAgentRepositoryContexts(tx, current)).rows
      return [...new Map(contexts.map(context => [context.id, {
        id: context.id, workspace_id: context.workspace_id, connection_id: context.connection_id,
        team_id: context.team_id, external_id: context.external_id, full_name: context.full_name,
        default_branch: context.default_branch, required_checks: context.required_checks,
      }])).values()]
    }
    return (await tx.query(
      `SELECT r.* FROM repositories r WHERE r.workspace_id=$1 AND
       ($2='admin' OR EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=r.workspace_id AND m.team_id=r.team_id AND m.actor_id=$3))
       ORDER BY r.full_name`,
      [current.workspaceId, current.workspaceRole, current.id],
    )).rows
  }))

  app.post('/api/v1/repositories', async request => {
    const body = repositoryInputSchema.parse(request.body)
    requireHuman(actor(request), true)
    await h.readableTeam(request, body.teamId)
    return command(h.db, h.meta(request, body), async tx => {
      const connection = await tx.query('SELECT 1 FROM provider_connections WHERE id=$1 AND workspace_id=$2 AND active', [body.connectionId, actor(request).workspaceId])
      if (!connection.rowCount) throw new DomainError('PROVIDER_CONNECTION_NOT_FOUND', 'Provider connection not found')
      const row = one((await tx.query(
        `INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch,clone_url,required_checks)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [actor(request).workspaceId, body.connectionId, body.teamId, body.externalId, body.fullName, body.defaultBranch, body.cloneUrl ?? null, body.requiredChecks],
      )).rows)
      await emit(tx, h.meta(request, body), 'repository.connected', 'repository', String((row as { id: string }).id), { fullName: body.fullName }, body.teamId)
      return row
    })
  })

  app.get('/api/v1/repositories/:id/context', async request => withTx(h.db, async tx => {
    const current = actor(request)
    let contextIds: string[] | undefined
    if (current.kind === 'agent') {
      contextIds = (await applicableAgentRepositoryContexts(tx, current, id(request))).rows.map(context => context.context_id)
      if (contextIds.length === 0) throw new DomainError('REPOSITORY_ACCESS_DENIED', 'Repository not found')
    } else await assertRepositoryRead(tx, current, id(request))
    return (await tx.query(
      `SELECT rc.*,coalesce(jsonb_agg(jsonb_build_object(
         'path',g.path,'blobSha',g.blob_sha,'contentHash',g.content_hash,'content',g.content) ORDER BY g.ordinal)
        FILTER(WHERE g.context_id IS NOT NULL),'[]'::jsonb) AS guidance
       FROM repository_contexts rc LEFT JOIN repository_guidance_entries g ON g.context_id=rc.id
       WHERE rc.repository_id=$1 AND ($2::uuid[] IS NULL OR rc.id=ANY($2))
       GROUP BY rc.id ORDER BY rc.created_at DESC`,
      [id(request), contextIds ?? null],
    )).rows
  }))

  app.post('/api/v1/repositories/:id/context', async request => {
    const body = repositoryContextInputSchema.parse(request.body)
    requireHuman(actor(request))
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const repo = await repository(tx, actor(request).workspaceId, id(request), true)
      const member = actor(request).workspaceRole === 'admin' || (await tx.query(
        "SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3 AND role IN ('admin','maintainer')",
        [actor(request).workspaceId, repo.team_id, actor(request).id],
      )).rowCount
      if (!member) throw new DomainError('FORBIDDEN', 'Team maintainer role is required')
      const linkedResource = body.projectId
        ? await tx.query('SELECT 1 FROM projects WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND deleted_at IS NULL', [body.projectId, actor(request).workspaceId, repo.team_id])
        : body.workItemId
          ? await tx.query('SELECT 1 FROM work_items WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND deleted_at IS NULL', [body.workItemId, actor(request).workspaceId, repo.team_id])
          : await tx.query('SELECT 1 FROM agent_sessions WHERE id=$1 AND workspace_id=$2 AND team_id=$3', [body.sessionId, actor(request).workspaceId, repo.team_id])
      if (!linkedResource.rowCount)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Repository context target must belong to the repository team')
      const action = one((await tx.query(
        `INSERT INTO provider_actions(
           workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
           project_id,kind,intent_key,payload,expected_head_sha)
         VALUES($1,$2,$3,$4,$5,$6,$7,'resolve_repository_context',$8,$9,$10)
         RETURNING *`,
        [actor(request).workspaceId, repo.connection_id, repo.id, actor(request).id,
          body.sessionId ?? null, body.workItemId ?? null, body.projectId ?? null,
          h.meta(request, body).idempotencyKey, body, body.baseSha],
      )).rows)
      await emit(tx, h.meta(request, body), 'repository.context.resolution_requested',
        'provider_action', String((action as { id: string }).id),
        { repositoryId: repo.id, baseSha: body.baseSha }, repo.team_id)
      return action
    })
  })

  app.post('/api/v1/provider-actions', async request => {
    const body = providerActionInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body), async tx => {
      const capability = body.kind === 'open_pull_request' ? 'repo:open_pr' : 'repo:write_branch'
      const contextPermission = body.kind === 'open_pull_request' ? 'open_pr' : 'write_branch'
      const { repo, context } = await assertAgentRepositoryWrite(tx, actor(request), body, capability, contextPermission)
      const workItem = one((await tx.query<{ team_key: string; number: number }>(
        `SELECT t.key AS team_key,w.number FROM work_items w JOIN teams t ON t.id=w.team_id
          WHERE w.id=$1 AND w.workspace_id=$2 AND w.deleted_at IS NULL`,
        [body.workItemId, actor(request).workspaceId],
      )).rows)
      const workItemKey = `${workItem.team_key}-${workItem.number}`
      if (body.kind === 'create_branch') {
        if (body.baseSha !== context.base_sha)
          throw new DomainError('REPOSITORY_HEAD_CHANGED', 'Branch intent must use the pinned base SHA and write permission')
        if (body.name === repo.default_branch || !matchesBranchPattern(context.branch_pattern, workItemKey, body.name))
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Branch name must match the pinned work-item pattern and cannot be the default branch')
      }
      if (body.kind === 'create_commit') {
        if (body.files.some((file) => !allowedPath(file.path, context.allowed_paths)))
          throw new DomainError('REPOSITORY_PATH_DENIED', 'Commit contains a path outside the pinned repository scope')
        if (body.branch === repo.default_branch || !matchesBranchPattern(context.branch_pattern, workItemKey, body.branch))
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Commit branch must match the pinned work-item pattern and cannot be the default branch')
        await assertCreatedDeliveryBranch(tx, { ...body, branch: body.branch })
      }
      if (body.kind === 'open_pull_request') {
        if (body.baseBranch !== context.base_branch)
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Pull request base branch must match the pinned repository context')
        if (body.headBranch === repo.default_branch || !matchesBranchPattern(context.branch_pattern, workItemKey, body.headBranch))
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Pull request head must match the pinned work-item pattern and cannot be the default branch')
        await assertCreatedDeliveryBranch(tx, { ...body, branch: body.headBranch })
      }
      const action = one((await tx.query(
        `INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,project_id,plan_step_id,kind,intent_key,payload,expected_head_sha)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [actor(request).workspaceId, repo.connection_id, repo.id, actor(request).id, body.sessionId, body.workItemId, body.projectId ?? null, body.planStepId ?? null, body.kind, h.meta(request, body).idempotencyKey, body, body.kind === 'create_commit' ? body.expectedHeadSha : body.kind === 'create_branch' ? body.baseSha : null],
      )).rows)
      await emit(tx, h.meta(request, body), 'provider.action.requested', 'provider_action', String((action as { id: string }).id), { kind: body.kind, repositoryId: repo.id }, repo.team_id)
      return action
    })
  })

  app.post('/api/v1/delivery-artifacts', async request => {
    const body = deliveryArtifactInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body), async tx => {
      assertSanitized(body, 'artifact')
      const repositoryId = body.repositoryId
      if (repositoryId) await assertAgentRepositoryWrite(tx, actor(request), { ...body, repositoryId }, 'artifact:write')
      else {
        if (actor(request).kind !== 'agent') throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Agent session token required')
        const session = await loadAgentSessionForMutation(tx, actor(request), body.sessionId)
        await assertDeliveryTarget(tx, actor(request), session, body)
        assertAgentWrite({ actor: actor(request), session, sessionId: body.sessionId, capability: 'artifact:write', operation: 'artifact', idempotencyKey: h.meta(request, body).idempotencyKey, resourceId: body.workItemId })
      }
      let pullRequestHeadSha: string | undefined
      if (body.pullRequestId) {
        const pullRequest = await tx.query<{ head_sha: string }>(
          `SELECT head_sha FROM pull_request_projections
            WHERE id=$1 AND workspace_id=$2 AND work_item_id=$3
              AND ($4::uuid IS NULL OR repository_id=$4)`,
          [body.pullRequestId, actor(request).workspaceId, body.workItemId, body.repositoryId ?? null],
        )
        if (!pullRequest.rowCount)
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Artifact pull request is outside the delivery target')
        pullRequestHeadSha = pullRequest.rows[0]!.head_sha
        if (body.headSha !== pullRequestHeadSha)
          throw new DomainError('MERGE_HEAD_CHANGED', 'Artifact must bind the current pull-request head')
      }
      const artifact = one((await tx.query<{ id: string }>(
        `INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri,checksum,source_tool,metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [actor(request).workspaceId, body.sessionId, body.workItemId, actor(request).id, body.type, body.title, body.uri ?? null, body.checksum, body.sourceTool, { ...body.metadata, command: body.command, result: body.result }],
      )).rows)
      await tx.query(
        `INSERT INTO artifact_links(artifact_id,workspace_id,project_id,work_item_id,session_id,plan_step_id,repository_id,pull_request_id,provenance)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [artifact.id, actor(request).workspaceId, body.projectId ?? null, body.workItemId, body.sessionId, body.planStepId ?? null, body.repositoryId ?? null, body.pullRequestId ?? null, { producerActorId: actor(request).id, sourceTool: body.sourceTool, checksum: body.checksum, headSha: pullRequestHeadSha, createdAt: new Date().toISOString() }],
      )
      await emit(tx, h.meta(request, body), 'artifact.published', 'artifact', artifact.id, { type: body.type, checksum: body.checksum })
      return artifact
    })
  })

  app.post('/api/v1/artifact-upload-intents', async request => {
    const body = artifactUploadIntentInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body), async tx => {
      assertSanitized(body, 'artifact upload')
      await assertAgentRepositoryWrite(tx, actor(request), body, 'artifact:write')
      const workItem = one((await tx.query<{ project_id: string | null }>(
        'SELECT project_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL',
        [body.workItemId, actor(request).workspaceId],
      )).rows)
      if (body.projectId && body.projectId !== workItem.project_id)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Upload project must be derived from its work item')
      let pullRequestId: string | null = null
      let headSha: string | null = null
      if (body.pullRequestId) {
        const pullRequest = (await tx.query<{ id: string; head_sha: string }>(
          `SELECT id,head_sha FROM pull_request_projections
            WHERE id=$1 AND workspace_id=$2 AND repository_id=$3 AND work_item_id=$4`,
          [body.pullRequestId, actor(request).workspaceId, body.repositoryId, body.workItemId],
        )).rows[0]
        if (!pullRequest || pullRequest.head_sha !== body.headSha)
          throw new DomainError('MERGE_HEAD_CHANGED', 'Upload pull request must match the current scoped head')
        pullRequestId = pullRequest.id
        headSha = pullRequest.head_sha
      }
      const storageKey = `${actor(request).workspaceId}/${randomUUID()}/${body.filename}`
      const row = one((await tx.query<{ id: string; expires_at: Date }>(
        `INSERT INTO artifact_upload_intents(
           workspace_id,work_item_id,session_id,project_id,plan_step_id,repository_id,pull_request_id,
           head_sha,source_tool,requested_by_actor_id,storage_key,filename,mime_type,size_bytes,
           expected_checksum,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()+interval '15 minutes')
         RETURNING id,expires_at`,
        [actor(request).workspaceId, body.workItemId, body.sessionId, workItem.project_id,
          body.planStepId ?? null, body.repositoryId, pullRequestId, headSha, body.sourceTool,
          actor(request).id, storageKey, body.filename, body.mimeType, body.sizeBytes, body.checksum],
      )).rows)
      const expires = row.expires_at.toISOString()
      const uploadUrl = await artifactStorageFromEnvironment().createUploadUrl({
        key: storageKey, checksum: body.checksum, sizeBytes: body.sizeBytes, mimeType: body.mimeType,
      }, 900)
      await emit(tx, h.meta(request, body), 'artifact.upload.requested', 'artifact_upload_intent', row.id, { checksum: body.checksum, sizeBytes: body.sizeBytes })
      return {
        id: row.id, uploadUrl, expiresAt: expires, requiredChecksum: body.checksum,
        requiredHeaders: {
          'content-type': body.mimeType,
          'content-length': String(body.sizeBytes),
          'x-amz-checksum-sha256': Buffer.from(body.checksum.slice(7), 'hex').toString('base64'),
        },
      }
    })
  })

  app.post('/api/v1/artifact-upload-intents/:id/finalize', async request => {
    z.object({}).parse(request.body ?? {})
    const uploadId = id(request)
    const result = await command<{
      id: string
      status: 'expired' | 'uploaded' | 'verified'
    }>(h.db, h.meta(request, {}, { id: uploadId }), async tx => {
      if (actor(request).kind !== 'agent') throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Agent session token required')
      const upload = one((await tx.query<{
        session_id: string; work_item_id: string; status: string; expires_at: Date
      }>('SELECT session_id,work_item_id,status,expires_at FROM artifact_upload_intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [
        uploadId, actor(request).workspaceId,
      ])).rows)
      if (upload.session_id !== actor(request).agentSessionId)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Upload intent belongs to another session')
      const session = await loadAgentSessionForMutation(tx, actor(request), upload.session_id)
      assertAgentWrite({
        actor: actor(request), session, sessionId: upload.session_id, capability: 'artifact:write',
        operation: 'artifact', idempotencyKey: h.meta(request, {}).idempotencyKey, resourceId: upload.work_item_id,
      })
      if (upload.status === 'expired') return { id: uploadId, status: 'expired' }
      if (upload.status === 'verified') return { id: uploadId, status: 'verified' }
      if (upload.expires_at.getTime() <= Date.now()) {
        const expired = await tx.query(
          `UPDATE artifact_upload_intents
              SET status='expired',claimed_at=NULL,claimed_by=NULL
            WHERE id=$1 AND status IN ('pending','uploaded')
            RETURNING id`,
          [uploadId],
        )
        if (expired.rowCount)
          await emit(
            tx,
            h.meta(request, {}),
            'artifact.upload.expired',
            'artifact_upload_intent',
            uploadId,
            { previousStatus: upload.status },
          )
        return { id: uploadId, status: 'expired' }
      }
      if (upload.status !== 'pending' && upload.status !== 'uploaded')
        throw new DomainError('CONFLICT', 'Upload intent cannot be finalized')
      await tx.query(
        "UPDATE artifact_upload_intents SET status='uploaded',available_at=now(),claimed_at=NULL,claimed_by=NULL WHERE id=$1",
        [uploadId],
      )
      await emit(tx, h.meta(request, {}), 'artifact.upload.finalization_requested', 'artifact_upload_intent', uploadId, {})
      return { id: uploadId, status: 'uploaded' }
    })
    if (result.status === 'expired')
      throw new DomainError('ARTIFACT_UPLOAD_EXPIRED', 'Upload intent has expired')
    return result
  })

  app.get('/api/v1/artifact-upload-intents/:id/download', async request => {
    const upload = one((await h.db.query<{
      storage_key: string; session_id: string; team_id: string; status: string
    }>(
      `SELECT u.storage_key,u.session_id,w.team_id,u.status
         FROM artifact_upload_intents u JOIN work_items w ON w.id=u.work_item_id
        WHERE u.id=$1 AND u.workspace_id=$2`,
      [id(request), actor(request).workspaceId],
    )).rows)
    if (actor(request).kind === 'agent') {
      if (actor(request).agentSessionId !== upload.session_id)
        throw new DomainError('RESOURCE_SCOPE_DENIED', 'Artifact download is outside the session scope')
    } else await h.readableTeam(request, upload.team_id)
    if (upload.status !== 'verified') throw new DomainError('CONFLICT', 'Artifact upload has not been verified')
    return { downloadUrl: await artifactStorageFromEnvironment().createDownloadUrl(upload.storage_key, 300) }
  })

  app.post('/api/v1/pull-requests/:id/reviews', async request => {
    const body = structuredReviewInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      assertSanitized(body, 'structured review')
      const access = await prepareAgentPullRequestAccess(tx, actor(request), body.sessionId, 'artifact:write', 'review')
      const pr = one((await tx.query<{ repository_id: string; work_item_id: string; head_sha: string; producer_actor_id: string; team_id: string }>(
        `SELECT pr.repository_id,pr.work_item_id,pr.head_sha,pr.producer_actor_id,r.team_id
           FROM pull_request_projections pr JOIN repositories r ON r.id=pr.repository_id
          WHERE pr.id=$1 AND pr.workspace_id=$2 AND pr.repository_id=ANY($3::uuid[])
            AND pr.work_item_id=$4 FOR UPDATE OF pr`,
        [id(request), actor(request).workspaceId, access.repositoryIds, access.session.work_item_id],
      )).rows)
      const delegation = one((await tx.query<{ role: string }>('SELECT role FROM delegations WHERE id=$1', [access.session.delegation_id])).rows)
      if (delegation.role !== 'reviewer' || actor(request).id === pr.producer_actor_id)
        throw new DomainError('REVIEWER_CONFLICT', 'Review requires an independent reviewer delegation')
      if (body.headSha !== pr.head_sha) throw new DomainError('MERGE_HEAD_CHANGED', 'Review must bind the current pull-request head')
      const artifact = await tx.query(
        `SELECT 1
           FROM artifacts a
           JOIN artifact_links l ON l.artifact_id=a.id AND l.workspace_id=a.workspace_id
          WHERE a.id=$1 AND a.workspace_id=$2 AND a.session_id=$3 AND a.producer_actor_id=$4
            AND a.type='code_review' AND a.checksum IS NOT NULL AND a.source_tool IS NOT NULL
            AND l.session_id=$3 AND l.work_item_id=$5 AND l.repository_id=$6
            AND l.pull_request_id=$7
            AND l.provenance->>'checksum'=a.checksum
            AND l.provenance->>'sourceTool'=a.source_tool
            AND l.provenance->>'headSha'=$8`,
        [body.artifactId, actor(request).workspaceId, body.sessionId, actor(request).id,
          pr.work_item_id, pr.repository_id, id(request), pr.head_sha],
      )
      if (!artifact.rowCount) throw new DomainError('NOT_FOUND', 'Linked current-head reviewer code_review artifact not found')
      const review = one((await tx.query<{ id: string }>(
        `INSERT INTO structured_reviews(
           pull_request_id,reviewer_session_id,reviewer_actor_id,artifact_id,head_sha,verdict,summary,evidence,metadata)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id(request), body.sessionId, actor(request).id, body.artifactId, body.headSha,
          body.verdict, body.summary, body.evidence, body.metadata],
      )).rows)
      for (const finding of body.findings)
        await tx.query(
          `INSERT INTO structured_review_findings(
             review_id,severity,title,body,path,line,file,summary,evidence,recommendation)
           VALUES($1,$2,$3,$4,$5,$6,$5,$3,$4,$7)`,
          [review.id, finding.severity, finding.summary, finding.evidence,
            finding.file, finding.line, finding.recommendation],
        )
      await emit(tx, h.meta(request, body), 'pull_request.reviewed', 'pull_request', id(request), { reviewId: review.id, verdict: body.verdict, headSha: body.headSha }, pr.team_id)
      return { ...review, findings: body.findings }
    })
  })

  app.post('/api/v1/pull-requests/:id/merge', async request => {
    const body = mergeIntentInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const access = await prepareAgentPullRequestAccess(tx, actor(request), body.sessionId, 'repo:merge', 'merge')
      const pr = one((await tx.query<{
        id: string; repository_id: string; external_id: string; work_item_id: string; head_sha: string;
        producer_actor_id: string; connection_id: string; provider: string; team_id: string; required_checks: string[]
      }>(
        `SELECT pr.id,pr.repository_id,pr.external_id,pr.work_item_id,pr.head_sha,pr.producer_actor_id,
          r.connection_id,r.team_id,r.required_checks,c.provider
         FROM pull_request_projections pr JOIN repositories r ON r.id=pr.repository_id
         JOIN provider_connections c ON c.id=r.connection_id
         WHERE pr.id=$1 AND pr.workspace_id=$2 AND pr.state='open'
           AND pr.repository_id=ANY($3::uuid[]) AND pr.work_item_id=$4 FOR UPDATE OF pr`,
        [id(request), actor(request).workspaceId, access.repositoryIds, access.session.work_item_id],
      )).rows)
      if (body.headSha !== pr.head_sha) throw new DomainError('MERGE_HEAD_CHANGED', 'Merge intent head is stale')
      const approval = one((await tx.query<{
        session_id: string; status: string; action_name: string; action_payload_hash: string;
        action_payload_sanitized: Record<string, unknown>; expires_at: Date; consumed_at: Date | null
      }>('SELECT * FROM approvals WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [body.approvalId, actor(request).workspaceId])).rows)
      const payload = {
        provider: pr.provider, connectionId: pr.connection_id, repositoryId: pr.repository_id,
        pullRequestId: pr.external_id, headSha: pr.head_sha, method: body.method,
      }
      const canonicalHash = hash(canonicalMergeApprovalPayload(payload))
      if (approval.session_id !== body.sessionId || approval.status !== 'approved' || approval.action_name !== 'provider.pull_request.merge' ||
        approval.expires_at.getTime() <= Date.now() || approval.consumed_at || canonicalHash !== body.actionPayloadHash ||
        approval.action_payload_hash !== canonicalHash || canonicalMergeApprovalPayload(approval.action_payload_sanitized as typeof payload) !== canonicalMergeApprovalPayload(payload))
        throw new DomainError('MERGE_APPROVAL_MISMATCH', 'Approval does not bind this exact provider, repository, PR, head and method')
      const reviews = (await tx.query<{
        id: string; reviewer_actor_id: string; head_sha: string;
        verdict: 'approved' | 'changes_requested' | 'commented'
      }>(
        'SELECT id,reviewer_actor_id,head_sha,verdict FROM structured_reviews WHERE pull_request_id=$1 AND head_sha=$2 ORDER BY created_at,id',
        [pr.id, pr.head_sha],
      )).rows
      const findings = (await tx.query<{
        severity: 'blocking' | 'high' | 'medium' | 'low'; file: string; line: number;
        summary: string; evidence: string; recommendation: string
      }>(
        `SELECT severity,file,line,summary,evidence,recommendation
           FROM structured_review_findings
          WHERE review_id=ANY($1::uuid[])`,
        [reviews.map(review => review.id)],
      )).rows
      const checks = (await tx.query<{ name: string; status: 'queued' | 'running' | 'passed' | 'failed' | 'skipped'; required: boolean; head_sha: string }>(
        `SELECT configured.name,latest.status,true AS required,latest.head_sha
           FROM unnest($2::text[]) AS configured(name)
           JOIN LATERAL (
             SELECT c.status,c.head_sha
               FROM ci_check_projections c
              WHERE c.pull_request_id=$1 AND c.name=configured.name AND c.head_sha=$3
              ORDER BY c.provider_observed_at DESC NULLS LAST,
                       c.provider_observation_rank DESC,c.updated_at DESC,c.external_id DESC
              LIMIT 1
           ) latest ON true`,
        [pr.id, pr.required_checks, pr.head_sha],
      )).rows
      if (checks.length !== pr.required_checks.length)
        throw new DomainError('MERGE_CHECKS_BLOCKED', 'One or more configured required checks have not reported')
      assertMergeReady({
        approvalHeadSha: body.headSha, currentHeadSha: pr.head_sha,
        producerActorId: pr.producer_actor_id,
        reviews: reviews.map(review => ({
          reviewerActorId: review.reviewer_actor_id,
          headSha: review.head_sha,
          verdict: review.verdict,
        })),
        findings,
        checks: checks.map((check) => ({ ...check, headSha: check.head_sha })),
      })
      await tx.query(
        `INSERT INTO merge_approval_bindings(approval_id,connection_id,repository_id,pull_request_id,provider_pull_request_id,head_sha,method,canonical_payload_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [body.approvalId, pr.connection_id, pr.repository_id, pr.id, pr.external_id, pr.head_sha, body.method, canonicalHash],
      )
      const action = one((await tx.query(
        `INSERT INTO provider_actions(workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,kind,intent_key,payload,expected_head_sha,approval_id)
         VALUES($1,$2,$3,$4,$5,$6,'merge_pull_request',$7,$8,$9,$10) RETURNING *`,
        [actor(request).workspaceId, pr.connection_id, pr.repository_id, actor(request).id, body.sessionId, pr.work_item_id, h.meta(request, body).idempotencyKey, payload, pr.head_sha, body.approvalId],
      )).rows)
      await emit(tx, h.meta(request, body), 'pull_request.merge_requested', 'pull_request', pr.id, { actionId: (action as { id: string }).id, headSha: pr.head_sha }, pr.team_id)
      return action
    })
  })

  app.post('/api/v1/pull-requests/:id/checks/:checkId/retry', async request => {
    const body = ciRetryInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body, { id: id(request), checkId: checkId(request) }), async tx => {
      const access = await prepareAgentPullRequestAccess(tx, actor(request), body.sessionId, 'ci:run', 'ci')
      const check = one((await tx.query<{
        repository_id: string; work_item_id: string; head_sha: string; external_id: string;
        name: string; status: string; connection_id: string; provider: string; team_id: string
      }>(
        `SELECT pr.repository_id,pr.work_item_id,pr.head_sha,ci.external_id,ci.name,ci.status,
                r.connection_id,r.team_id,c.provider
           FROM ci_check_projections ci
           JOIN pull_request_projections pr ON pr.id=ci.pull_request_id
           JOIN repositories r ON r.id=pr.repository_id
           JOIN provider_connections c ON c.id=r.connection_id
          WHERE pr.id=$1 AND pr.workspace_id=$2 AND pr.repository_id=ANY($3::uuid[])
            AND pr.work_item_id=$4 AND ci.external_id=$5 AND ci.head_sha=pr.head_sha
          FOR UPDATE OF ci`,
        [id(request), actor(request).workspaceId, access.repositoryIds,
          access.session.work_item_id, checkId(request)],
      )).rows)
      if (body.headSha !== check.head_sha)
        throw new DomainError('MERGE_HEAD_CHANGED', 'CI retry must bind the current pull-request head')
      if (!['failed', 'skipped'].includes(check.status))
        throw new DomainError('CI_RETRY_NOT_ALLOWED', 'Only a failed or skipped current-head check can be retried')
      const payload = {
        provider: check.provider,
        connectionId: check.connection_id,
        repositoryId: check.repository_id,
        pullRequestId: id(request),
        checkRunId: check.external_id,
        headSha: check.head_sha,
      }
      const canonicalHash = hash(canonicalActionApprovalPayload(payload))
      const approval = one((await tx.query<{
        session_id: string; status: string; action_name: string; action_payload_hash: string;
        action_payload_sanitized: Record<string, unknown>; expires_at: Date; consumed_at: Date | null
      }>('SELECT * FROM approvals WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [body.approvalId, actor(request).workspaceId])).rows)
      if (approval.session_id !== body.sessionId || approval.status !== 'approved' ||
          approval.action_name !== 'provider.ci.retry' || approval.expires_at.getTime() <= Date.now() ||
          approval.consumed_at || body.actionPayloadHash !== canonicalHash ||
          approval.action_payload_hash !== canonicalHash ||
          canonicalActionApprovalPayload(approval.action_payload_sanitized) !== canonicalActionApprovalPayload(payload))
        throw new DomainError('CI_RETRY_APPROVAL_MISMATCH',
          'Approval does not bind this exact provider, repository, PR, check and head')
      const action = one((await tx.query(
        `INSERT INTO provider_actions(
           workspace_id,connection_id,repository_id,requested_by_actor_id,session_id,work_item_id,
           kind,intent_key,payload,expected_head_sha,approval_id)
         VALUES($1,$2,$3,$4,$5,$6,'retry_ci_check',$7,$8,$9,$10) RETURNING *`,
        [actor(request).workspaceId, check.connection_id, check.repository_id, actor(request).id,
          body.sessionId, check.work_item_id, h.meta(request, body).idempotencyKey,
          payload, check.head_sha, body.approvalId],
      )).rows)
      await emit(tx, h.meta(request, body), 'ci.check.retry_requested', 'provider_action',
        String((action as { id: string }).id),
        { pullRequestId: id(request), checkRunId: check.external_id, headSha: check.head_sha },
        check.team_id)
      return action
    })
  })

  app.get('/api/v1/projects/:id/delivery', async request => withTx(h.db, async tx => {
    const project = one((await tx.query<{ team_id: string }>('SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL', [id(request), actor(request).workspaceId])).rows)
    await h.readableTeam(request, project.team_id)
    const [
      milestones, updates, artifacts, dependencies, suggestions, pullRequests,
      providerReviews, structuredReviews, structuredFindings, checks, mergeApprovals,
    ] = await Promise.all([
      tx.query(`SELECT m.*,count(w.id)::int AS total,count(w.id) FILTER(WHERE s.category='completed')::int AS completed
        FROM project_milestones m LEFT JOIN work_items w ON w.milestone_id=m.id AND w.deleted_at IS NULL
        LEFT JOIN workflow_states s ON s.id=w.status_id WHERE m.project_id=$1 GROUP BY m.id ORDER BY m.created_at`, [id(request)]),
      tx.query('SELECT * FROM project_updates WHERE project_id=$1 ORDER BY created_at DESC', [id(request)]),
      tx.query('SELECT a.*,l.plan_step_id,l.repository_id,l.pull_request_id FROM artifacts a JOIN artifact_links l ON l.artifact_id=a.id WHERE l.project_id=$1 ORDER BY a.created_at DESC', [id(request)]),
      tx.query(
        `SELECT d.depends_on_project_id,p.name AS depends_on_project_name,
                p.status AS depends_on_project_status
           FROM project_dependencies d
           JOIN projects p ON p.id=d.depends_on_project_id AND p.workspace_id=$2
          WHERE d.project_id=$1
          ORDER BY p.name,p.id`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query('SELECT * FROM completion_suggestions WHERE project_id=$1 ORDER BY created_at DESC', [id(request)]),
      tx.query<{
        id: string
        provider: string
        number: number
        state: string
        head_sha: string
        head_branch: string
        uri: string
        source_delivery_id: string | null
        provider_action_id: string | null
      }>(
        `SELECT pr.id,c.provider,pr.number,pr.state,pr.head_sha,pr.head_branch,pr.uri,
                pr.source_delivery_id,l.provenance->>'providerActionId' AS provider_action_id
           FROM pull_request_projections pr
           JOIN repositories r ON r.id=pr.repository_id
           JOIN provider_connections c ON c.id=r.connection_id
           JOIN work_items w ON w.id=pr.work_item_id
           LEFT JOIN artifact_links l ON l.artifact_id=pr.artifact_id
          WHERE w.project_id=$1 AND pr.workspace_id=$2
          ORDER BY pr.updated_at DESC`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query<{
        pull_request_id: string; state: string; head_sha: string; author_external_id: string;
        author_login: string | null; uri: string | null; source_delivery_id: string
      }>(
        `SELECT rv.pull_request_id,rv.state,rv.head_sha,rv.author_external_id,rv.author_login,rv.uri,rv.source_delivery_id
           FROM provider_review_projections rv
           JOIN pull_request_projections pr ON pr.id=rv.pull_request_id
           JOIN work_items w ON w.id=pr.work_item_id
          WHERE w.project_id=$1 AND rv.workspace_id=$2
          ORDER BY rv.updated_at DESC`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query<{
        id: string; pull_request_id: string; verdict: string; head_sha: string;
        reviewer_actor_id: string; artifact_id: string; summary: string
      }>(
        `SELECT sr.id,sr.pull_request_id,sr.verdict,sr.head_sha,sr.reviewer_actor_id,sr.artifact_id,sr.summary
           FROM structured_reviews sr
           JOIN pull_request_projections pr ON pr.id=sr.pull_request_id
           JOIN work_items w ON w.id=pr.work_item_id
          WHERE w.project_id=$1 AND pr.workspace_id=$2
          ORDER BY sr.created_at DESC`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query<{
        review_id: string; severity: string; file: string; line: number;
        summary: string; evidence: string; recommendation: string
      }>(
        `SELECT f.review_id,f.severity,f.file,f.line,f.summary,f.evidence,f.recommendation
           FROM structured_review_findings f
           JOIN structured_reviews sr ON sr.id=f.review_id
           JOIN pull_request_projections pr ON pr.id=sr.pull_request_id
           JOIN work_items w ON w.id=pr.work_item_id
          WHERE w.project_id=$1 AND pr.workspace_id=$2
          ORDER BY f.created_at,f.id`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query<{
        pull_request_id: string
        name: string
        status: string
        required: boolean
        head_sha: string
        details_url: string | null
        source_delivery_id: string | null
      }>(
        `SELECT DISTINCT ON(ci.pull_request_id,ci.name)
                ci.pull_request_id,ci.name,ci.status,ci.required,ci.head_sha,ci.details_url,ci.source_delivery_id
           FROM ci_check_projections ci
           JOIN pull_request_projections pr ON pr.id=ci.pull_request_id
           JOIN work_items w ON w.id=pr.work_item_id
          WHERE w.project_id=$1 AND pr.workspace_id=$2 AND ci.head_sha=pr.head_sha
          ORDER BY ci.pull_request_id,ci.name,
                   ci.provider_observed_at DESC NULLS LAST,
                   ci.provider_observation_rank DESC,ci.updated_at DESC,ci.external_id DESC`,
        [id(request), actor(request).workspaceId],
      ),
      tx.query<{
        approval_id: string; provider: string; repository: string; pull_request_id: string;
        pull_request_number: number; head_sha: string; method: string; status: string;
        invalidated_at: Date | null; invalidation_reason: string | null
      }>(
        `SELECT b.approval_id,c.provider,r.full_name AS repository,b.pull_request_id,
                pr.number AS pull_request_number,b.head_sha,b.method,
                CASE WHEN b.invalidated_at IS NOT NULL THEN 'invalidated' ELSE a.status::text END AS status,
                b.invalidated_at,b.invalidation_reason
           FROM merge_approval_bindings b
           JOIN approvals a ON a.id=b.approval_id
           JOIN provider_connections c ON c.id=b.connection_id
           JOIN repositories r ON r.id=b.repository_id
           JOIN pull_request_projections pr ON pr.id=b.pull_request_id
           JOIN work_items w ON w.id=pr.work_item_id
          WHERE w.project_id=$1 AND pr.workspace_id=$2
          ORDER BY b.created_at DESC`,
        [id(request), actor(request).workspaceId],
      ),
    ])
    return {
      milestones: milestones.rows,
      updates: updates.rows,
      artifacts: artifacts.rows,
      dependencies: dependencies.rows,
      completionSuggestions: suggestions.rows,
      providerPullRequests: pullRequests.rows.map(pullRequest => ({
        id: pullRequest.id,
        provider: pullRequest.provider,
        number: pullRequest.number,
        state: pullRequest.state,
        headSha: pullRequest.head_sha,
        headBranch: pullRequest.head_branch,
        uri: pullRequest.uri,
        provenance: pullRequest.source_delivery_id
          ? { source: 'provider_webhook', sourceId: pullRequest.source_delivery_id }
          : { source: 'provider_action', sourceId: pullRequest.provider_action_id },
        checks: checks.rows.filter(check => check.pull_request_id === pullRequest.id).map(check => ({
          name: check.name,
          status: check.status,
          required: check.required,
          headSha: check.head_sha,
          detailsUrl: check.details_url,
          provenance: { source: 'provider_webhook', sourceId: check.source_delivery_id },
        })),
      })),
      providerReviews: providerReviews.rows.map(review => ({
        pullRequestId: review.pull_request_id, state: review.state, headSha: review.head_sha,
        author: { providerId: review.author_external_id, login: review.author_login },
        uri: review.uri, provenance: { source: 'provider_webhook', sourceId: review.source_delivery_id },
        authority: 'provider_observation',
      })),
      workMeshStructuredReviews: structuredReviews.rows.map(review => ({
        pullRequestId: review.pull_request_id, verdict: review.verdict, headSha: review.head_sha,
        reviewerActorId: review.reviewer_actor_id, artifactId: review.artifact_id, summary: review.summary,
        findings: structuredFindings.rows.filter(finding => finding.review_id === review.id).map(finding => ({
          severity: finding.severity,
          file: finding.file,
          line: finding.line,
          summary: finding.summary,
          evidence: finding.evidence,
          recommendation: finding.recommendation,
        })),
        authority: 'workmesh_structured_review',
      })),
      mergeApprovals: mergeApprovals.rows.map(approval => ({
        approvalId: approval.approval_id,
        provider: approval.provider,
        repository: approval.repository,
        pullRequestId: approval.pull_request_id,
        pullRequestNumber: approval.pull_request_number,
        headSha: approval.head_sha,
        method: approval.method,
        status: approval.status,
        invalidatedAt: approval.invalidated_at?.toISOString() ?? null,
        invalidationReason: approval.invalidation_reason,
      })),
    }
  }))

  app.post('/api/v1/projects/:id/milestones', async request => {
    const body = milestoneInputSchema.parse(request.body)
    requireHuman(actor(request))
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const project = one((await tx.query<{ team_id: string }>('SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2', [id(request), actor(request).workspaceId])).rows)
      await h.readableTeam(request, project.team_id)
      const row = one((await tx.query(
        'INSERT INTO project_milestones(workspace_id,project_id,name,description,target_date) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [actor(request).workspaceId, id(request), body.name, body.description ?? null, body.targetDate ?? null],
      )).rows)
      await emit(tx, h.meta(request, body), 'project.milestone.created', 'project_milestone', String((row as { id: string }).id), { projectId: id(request) }, project.team_id)
      return row
    })
  })

  app.post('/api/v1/projects/:id/updates', async request => {
    const body = projectUpdateInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const project = one((await tx.query<{ team_id: string }>('SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2', [id(request), actor(request).workspaceId])).rows)
      let evidenceWorkItemId: string | undefined
      if (actor(request).kind === 'human') {
        await requireCurrentTeamWriter(tx, actor(request), project.team_id)
      } else {
        const sessionId = actor(request).agentSessionId!
        const session = await loadAgentSessionForMutation(tx, actor(request), sessionId)
        const scopedWorkItem = session.work_item_id
          ? ((await tx.query('SELECT 1 FROM work_items WHERE id=$1 AND workspace_id=$2 AND project_id=$3 AND deleted_at IS NULL', [
              session.work_item_id, actor(request).workspaceId, id(request),
            ])).rowCount ?? 0) > 0
          : false
        if (session.project_id !== id(request) && !scopedWorkItem)
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Project update is outside the session scope')
        assertAgentWrite({ actor: actor(request), session, sessionId, capability: 'work:write', operation: 'activity', idempotencyKey: h.meta(request, body).idempotencyKey, resourceId: session.project_id ?? session.work_item_id })
        evidenceWorkItemId = session.work_item_id ?? undefined
      }
      await assertEvidenceArtifacts(tx, {
        workspaceId: actor(request).workspaceId,
        projectId: id(request),
        workItemId: evidenceWorkItemId,
        artifactIds: body.evidenceArtifactIds,
      })
      const row = one((await tx.query(
        `INSERT INTO project_updates(workspace_id,project_id,author_actor_id,health,body,status,evidence_artifact_ids)
         VALUES($1,$2,$3,$4,$5,'draft',$6) RETURNING *`,
        [actor(request).workspaceId, id(request), actor(request).id, body.health, body.body, body.evidenceArtifactIds],
      )).rows)
      await emit(tx, h.meta(request, body), 'project.update.drafted', 'project_update', String((row as { id: string }).id), { projectId: id(request), health: body.health }, project.team_id)
      return row
    })
  })

  app.post('/api/v1/projects/:id/updates/:updateId/publish', async request => {
    const body = projectUpdatePublishInputSchema.parse(request.body ?? {})
    requireHuman(actor(request))
    return command(h.db, h.meta(request, body, { id: id(request), updateId: updateId(request) }), async tx => {
      const update = one((await tx.query<{
        id: string
        team_id: string
        status: 'draft' | 'published'
        revision: number
        health: string
      }>(
        `SELECT u.id,p.team_id,u.status,u.revision,u.health
           FROM project_updates u JOIN projects p ON p.id=u.project_id AND p.workspace_id=u.workspace_id
          WHERE u.id=$1 AND u.project_id=$2 AND u.workspace_id=$3 AND p.deleted_at IS NULL
          FOR UPDATE OF u`,
        [updateId(request), id(request), actor(request).workspaceId],
      )).rows)
      await requireCurrentTeamWriter(tx, actor(request), update.team_id)
      assertRevision(parseRevision(h.header(request, 'if-match')), update.revision)
      if (update.status !== 'draft') throw new DomainError('INVALID_STATE_TRANSITION', 'Only draft project updates can be published')
      const published = one((await tx.query(
        `UPDATE project_updates
            SET status='published',published_at=now(),revision=revision+1
          WHERE id=$1 AND revision=$2 RETURNING *`,
        [update.id, update.revision],
      )).rows)
      await emit(tx, h.meta(request, body, { id: id(request), updateId: update.id }),
        'project.update.published', 'project_update', update.id,
        { projectId: id(request), health: update.health, revision: update.revision + 1 }, update.team_id)
      return published
    })
  })

  app.post('/api/v1/projects/:id/dependencies', async request => {
    const body = projectDependencyInputSchema.parse(request.body)
    requireHuman(actor(request))
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [actor(request).workspaceId])
      const projects = await tx.query<{ id: string; team_id: string }>('SELECT id,team_id FROM projects WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND deleted_at IS NULL', [actor(request).workspaceId, [id(request), body.dependsOnProjectId]])
      if (projects.rowCount !== 2) throw new DomainError('NOT_FOUND', 'Project not found')
      for (const project of projects.rows) await h.readableTeam(request, project.team_id)
      const edges = (await tx.query<{ project_id: string; depends_on_project_id: string }>(
        `SELECT d.project_id,d.depends_on_project_id
           FROM project_dependencies d
           JOIN projects p ON p.id=d.project_id
          WHERE p.workspace_id=$1`,
        [actor(request).workspaceId],
      )).rows
      assertAcyclicProjectDependencies([...edges.map((edge) => ({ projectId: edge.project_id, dependsOnProjectId: edge.depends_on_project_id })), { projectId: id(request), dependsOnProjectId: body.dependsOnProjectId }])
      const row = one((await tx.query(
        'INSERT INTO project_dependencies(project_id,depends_on_project_id,created_by_actor_id) VALUES($1,$2,$3) RETURNING *',
        [id(request), body.dependsOnProjectId, actor(request).id],
      )).rows)
      await emit(tx, h.meta(request, body), 'project.dependency.created', 'project', id(request), { dependsOnProjectId: body.dependsOnProjectId })
      return row
    })
  })

  app.post('/api/v1/projects/:id/completion-suggestions', async request => {
    const body = completionSuggestionInputSchema.parse(request.body)
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      if (actor(request).kind !== 'agent') throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Agent session token required')
      const workItem = one((await tx.query<{ project_id: string; team_id: string }>('SELECT project_id,team_id FROM work_items WHERE id=$1 AND workspace_id=$2', [body.workItemId, actor(request).workspaceId])).rows)
      if (workItem.project_id !== id(request)) throw new DomainError('RESOURCE_SCOPE_DENIED', 'Work item does not belong to this project')
      const sessionId = actor(request).agentSessionId!
      const session = await loadAgentSessionForMutation(tx, actor(request), sessionId)
      await assertDeliveryTarget(tx, actor(request), session, { workItemId: body.workItemId, projectId: id(request) })
      assertAgentWrite({ actor: actor(request), session, sessionId, capability: 'work:write', operation: 'activity', idempotencyKey: h.meta(request, body).idempotencyKey, resourceId: body.workItemId })
      let repositoryId: string | undefined
      if (body.pullRequestId) {
        const pullRequest = (await tx.query<{ repository_id: string }>(
          `SELECT pr.repository_id
             FROM pull_request_projections pr
             JOIN work_items w ON w.id=pr.work_item_id
            WHERE pr.id=$1 AND pr.workspace_id=$2 AND pr.work_item_id=$3 AND w.project_id=$4`,
          [body.pullRequestId, actor(request).workspaceId, body.workItemId, id(request)],
        )).rows[0]
        if (!pullRequest)
          throw new DomainError('RESOURCE_SCOPE_DENIED', 'Pull request is outside the completion target')
        repositoryId = pullRequest.repository_id
      }
      await assertEvidenceArtifacts(tx, {
        workspaceId: actor(request).workspaceId,
        projectId: id(request),
        workItemId: body.workItemId,
        repositoryId,
        artifactIds: body.evidenceArtifactIds,
      })
      const row = one((await tx.query(
        `INSERT INTO completion_suggestions(workspace_id,project_id,work_item_id,pull_request_id,suggested_by_actor_id,rationale,evidence_artifact_ids)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [actor(request).workspaceId, id(request), body.workItemId, body.pullRequestId ?? null, actor(request).id, body.rationale, body.evidenceArtifactIds],
      )).rows)
      await emit(tx, h.meta(request, body), 'work_item.completion_suggested', 'work_item', body.workItemId, { suggestionId: (row as { id: string }).id }, workItem.team_id)
      return row
    })
  })

  app.post('/api/v1/completion-suggestions/:id/decision', async request => {
    const body = completionSuggestionDecisionInputSchema.parse(request.body)
    requireHuman(actor(request))
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const suggestion = one((await tx.query<{
        id: string
        project_id: string
        work_item_id: string
        team_id: string
        status: 'open' | 'accepted' | 'dismissed'
        revision: number
      }>(
        `SELECT s.id,s.project_id,s.work_item_id,w.team_id,s.status,s.revision
           FROM completion_suggestions s
           JOIN work_items w ON w.id=s.work_item_id AND w.workspace_id=s.workspace_id
          WHERE s.id=$1 AND s.workspace_id=$2 AND w.deleted_at IS NULL
          FOR UPDATE OF s`,
        [id(request), actor(request).workspaceId],
      )).rows)
      await requireCurrentTeamWriter(tx, actor(request), suggestion.team_id)
      assertRevision(parseRevision(h.header(request, 'if-match')), suggestion.revision)
      if (suggestion.status !== 'open')
        throw new DomainError('INVALID_STATE_TRANSITION', 'Only open completion suggestions can be decided')
      const decided = one((await tx.query(
        `UPDATE completion_suggestions
            SET status=$2,decided_by_actor_id=$3,decided_at=now(),revision=revision+1
          WHERE id=$1 AND revision=$4 RETURNING *`,
        [suggestion.id, body.decision, actor(request).id, suggestion.revision],
      )).rows)
      await emit(tx, h.meta(request, body), `work_item.completion_suggestion.${body.decision}`,
        'completion_suggestion', suggestion.id,
        {
          projectId: suggestion.project_id,
          workItemId: suggestion.work_item_id,
          status: body.decision,
          revision: suggestion.revision + 1,
        }, suggestion.team_id)
      return decided
    })
  })
}
