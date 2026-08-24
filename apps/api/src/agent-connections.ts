import { createHmac, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import {
  agentConnectionCreateInputSchema,
  agentConnectionPatchInputSchema,
  agentConnectionRedeemInputSchema,
  agentConnectionCurrentIdentitySchema,
  agentConnectionResponseSchema,
  agentWellKnownResponseSchema,
  coordinationSessionClosedEventPayloadSchema,
  coordinationSessionOpenedEventPayloadSchema,
  coordinationSessionRefreshedEventPayloadSchema,
  type AgentConnectionResponse,
  type AgentConnectionCreateInput,
  type AgentConnectionCurrentIdentity,
  workmeshSkillManifest,
} from '@workmesh/contracts'
import { appendEvent, opaqueToken, tokenHash, withTx } from '@workmesh/db'
import { DomainError, assertRevision, parseRevision } from '@workmesh/domain'
import { authClientContext, authIdempotentTransaction } from './auth-idempotency.js'
import type { ApiActor, RequestMeta } from './agent/types.js'
import { mutate, type CommandContext } from './commands.js'
import { reconcileConnectionInstallationToken } from './connection-installation-token.js'
import type { Paginator } from './pagination.js'

const skill = workmeshSkillManifest
const pairingTokenPrefix = 'wmp_'
const installationTokenPrefix = 'wmi_'

const connectionToken = (prefix: string): string => `${prefix}${opaqueToken()}`

type ConnectionRow = {
  id: string; workspace_id: string; team_id: string; agent_id: string; agent_actor_id: string
  principal_human_actor_id: string; delegation_id: string; name: string; agent_slug: string
  client_type: 'codex' | 'opencode' | 'pi' | 'generic_mcp'; status: 'pending' | 'active' | 'rotating' | 'revoked'
  requested_capabilities: string[]; granted_capabilities: string[]; grant_agent_delegate: boolean
  notes: string | null; skill_version: string | null; skill_sha256: string | null
  active_credential_fingerprint_prefix: string | null; pairing_code_expires_at: Date | null
  last_used_at: Date | null; rotated_at: Date | null; revoked_at: Date | null
  revision: number; created_at: Date; updated_at: Date
}

async function expireConnectionInstallationTokens(
  tx: PoolClient,
  connectionId: string,
  expiresAt: Date,
): Promise<void> {
  await tx.query(
    `UPDATE agent_installation_tokens installation
        SET expires_at=$2
       FROM agent_connection_credentials credential
      WHERE credential.connection_id=$1
        AND credential.status='overlap'
        AND installation.token_hash=credential.token_hash`,
    [connectionId, expiresAt],
  )
}

async function revokeConnectionInstallationTokens(
  tx: PoolClient,
  connectionId: string,
  statuses: readonly string[],
): Promise<void> {
  await tx.query(
    `UPDATE agent_installation_tokens installation
        SET revoked_at=COALESCE(installation.revoked_at,now())
       FROM agent_connection_credentials credential
      WHERE credential.connection_id=$1
        AND credential.status=ANY($2::text[])
        AND installation.token_hash=credential.token_hash`,
    [connectionId, statuses],
  )
}

type AuthenticatedConnectionRow = ConnectionRow & {
  credential_id: string
  credential_fingerprint_prefix: string
  credential_status: 'active' | 'overlap' | 'rotated' | 'revoked'
  credential_overlap_until: Date | null
}

type CoordinationRow = {
  id: string
  agent_session_id: string
  connection_id: string
  workspace_id: string
  team_id: string
  agent_id: string
  agent_actor_id: string
  principal_human_actor_id: string
  delegation_id: string
  granted_capabilities: string[]
  expires_at: Date
  refreshed_at: Date | null
}

type CoordinationBackingSessionRow = {
  id: string
  workspace_id: string
  team_id: string | null
  agent_id: string
  agent_actor_id: string
  delegation_id: string
  state: string
  session_kind: 'execution' | 'coordination'
  coordination_connection_id: string | null
  ended_at: Date | null
  revision: number
  sequence: string
}

export type CoordinationIdentityDiagnosticReason =
  | 'pairing_code_not_credential'
  | 'credential_unknown'
  | 'credential_inactive'
  | 'connection_inactive'
  | 'agent_inactive'
  | 'agent_capability_inactive'
  | 'agent_actor_inactive'
  | 'principal_inactive'
  | 'team_inactive'
  | 'team_grant_inactive'
  | 'delegation_inactive'
  | 'delegation_binding_invalid'

export class CoordinationIdentityResolutionError extends DomainError {
  readonly diagnosticId = randomUUID()

  constructor(
    readonly diagnosticReason: CoordinationIdentityDiagnosticReason,
    readonly credentialAuditFingerprint: string,
    readonly recognizedCredentialFingerprintPrefix?: string,
  ) {
    super('UNAUTHENTICATED', 'Installation Token is invalid or inactive')
    this.name = 'CoordinationIdentityResolutionError'
  }
}

const coordinationAuthorityStates = new Set([
  'acknowledged',
  'planning',
  'executing',
  'awaiting_input',
  'awaiting_approval',
  'blocked',
])

const sameStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === left.length
    && rightSet.size === right.length
    && leftSet.size === rightSet.size
    && [...leftSet].every(value => rightSet.has(value))
}

const credentialAuditFingerprint = (
  auditSecret: string,
  installationToken: string,
): string => createHmac('sha256', auditSecret)
  .update('workmesh:coordination-auth:v1\0')
  .update(installationToken)
  .digest('hex')
  .slice(0, 24)

function identityFailure(
  reason: CoordinationIdentityDiagnosticReason,
  auditFingerprint: string,
  recognizedFingerprintPrefix?: string,
): never {
  throw new CoordinationIdentityResolutionError(
    reason,
    auditFingerprint,
    recognizedFingerprintPrefix,
  )
}

const coordinationResources = (teamId: string) => ({
  scopes: [{ type: 'team' as const, id: teamId }],
  invalidates: [{ type: 'team' as const, id: teamId }],
})

const appendCoordinationOpened = async (
  tx: PoolClient,
  row: ConnectionRow,
  session: { id: string; revision: number; sequence: string; expires_at: Date },
  reason: 'initial' | 'expired' | 'recovered_terminal_backing' | 'recovered_invalid_backing',
) => appendEvent(tx, {
  workspaceId: row.workspace_id,
  teamId: row.team_id,
  actorId: row.agent_actor_id,
  correlationId: `agent-connection:${row.id}:coordination-opened:${session.id}`,
  type: 'agent.coordination_session.opened',
  aggregateType: 'agent_session',
  aggregateId: session.id,
  revision: session.revision,
  sessionId: session.id,
  sessionSequence: session.sequence,
  payload: coordinationSessionOpenedEventPayloadSchema.parse({
    connectionId: row.id,
    sessionId: session.id,
    reason,
    expiresAt: session.expires_at.toISOString(),
  }),
  resources: coordinationResources(row.team_id),
})

const appendCoordinationRefreshed = async (
  tx: PoolClient,
  row: ConnectionRow,
  session: { id: string; revision: number; sequence: string },
  previousExpiresAt: Date,
  expiresAt: Date,
) => appendEvent(tx, {
  workspaceId: row.workspace_id,
  teamId: row.team_id,
  actorId: row.agent_actor_id,
  correlationId: `agent-connection:${row.id}:coordination-refreshed:${session.id}:${expiresAt.toISOString()}`,
  type: 'agent.coordination_session.refreshed',
  aggregateType: 'agent_session',
  aggregateId: session.id,
  revision: session.revision,
  sessionId: session.id,
  sessionSequence: session.sequence,
  payload: coordinationSessionRefreshedEventPayloadSchema.parse({
    connectionId: row.id,
    sessionId: session.id,
    previousExpiresAt: previousExpiresAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  }),
  resources: coordinationResources(row.team_id),
})

const appendCoordinationClosed = async (
  tx: PoolClient,
  row: ConnectionRow,
  session: {
    id: string
    workspace_id: string
    team_id: string | null
  },
  reason: 'expired' | 'terminal_backing' | 'invalid_binding' | 'invalid_backing' | 'connection_revoked',
  actorId = row.agent_actor_id,
  correlationId?: string,
) => {
  const resourceScopeMatches = session.workspace_id === row.workspace_id
    && session.team_id === row.team_id
  const safeCorrelationId = correlationId ?? (resourceScopeMatches
    ? `agent-connection:${row.id}:coordination-closed:${session.id}:${reason}`
    : `agent-connection:${row.id}:coordination-closed:${reason}:resource-scope-mismatch`)
  return appendEvent(tx, {
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    actorId,
    correlationId: safeCorrelationId,
    type: 'agent.coordination_session.closed',
    aggregateType: 'agent_connection',
    aggregateId: row.id,
    revision: row.revision,
    payload: coordinationSessionClosedEventPayloadSchema.parse(resourceScopeMatches
      ? {
          connectionId: row.id,
          sessionId: session.id,
          reason,
        }
      : {
          connectionId: row.id,
          reason,
          sessionReferenceOmitted: 'resource_scope_mismatch',
        }),
    resources: coordinationResources(row.team_id),
  })
}

const response = (row: ConnectionRow): AgentConnectionResponse => agentConnectionResponseSchema.parse({
  id: row.id, workspace_id: row.workspace_id, team_id: row.team_id,
  agent_actor_id: row.agent_actor_id, principal_human_actor_id: row.principal_human_actor_id,
  name: row.name, agent_slug: row.agent_slug, client_type: row.client_type, status: row.status,
  requested_capabilities: row.requested_capabilities, granted_capabilities: row.granted_capabilities,
  grant_agent_delegate: row.grant_agent_delegate, skill_version: row.skill_version,
  skill_sha256: row.skill_sha256, credential_fingerprint_prefix: row.active_credential_fingerprint_prefix,
  pairing_code_expires_at: row.pairing_code_expires_at?.toISOString() ?? null,
  last_used_at: row.last_used_at?.toISOString() ?? null, rotated_at: row.rotated_at?.toISOString() ?? null,
  revoked_at: row.revoked_at?.toISOString() ?? null, revision: row.revision, redacted_token: true,
  created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
})

const requireAdmin = (actor: ApiActor): void => {
  if (actor.kind !== 'human' || actor.workspaceRole !== 'admin')
    throw new DomainError('FORBIDDEN', 'Workspace Admin is required')
}

const one = <T>(rows: readonly T[], code = 'AGENT_CONNECTION_NOT_FOUND'): T => {
  const row = rows[0]
  if (!row) throw new DomainError(code, 'Agent Connection was not found')
  return row
}

const connectionEvent = async (tx: PoolClient, meta: RequestMeta, row: ConnectionRow, type: string, payload: Record<string, unknown>) =>
  appendEvent(tx, {
    workspaceId: row.workspace_id, teamId: row.team_id, actorId: meta.actor.id,
    correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey,
    type, aggregateType: 'agent_connection', aggregateId: row.id, revision: row.revision,
    payload, resources: { scopes: [{ type: 'team', id: row.team_id }], invalidates: [{ type: 'team', id: row.team_id }] },
  })

const getLocked = async (tx: PoolClient, workspaceId: string, id: string) => one((await tx.query<ConnectionRow>(
  'SELECT * FROM agent_connections WHERE id=$1 AND workspace_id=$2 FOR UPDATE', [id, workspaceId],
)).rows)

const createPairing = async (tx: PoolClient, connectionId: string, slug: string, clientType: string, purpose: 'initial' | 'rotation', overlapUntil: Date | null = null) => {
  const code = connectionToken(pairingTokenPrefix)
  const expiresAt = new Date(Date.now() + 10 * 60_000)
  await tx.query(
    `INSERT INTO agent_connection_pairings(connection_id,code_hash,purpose,expected_agent_slug,expected_client_type,expires_at,overlap_until)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [connectionId, tokenHash(code), purpose, slug, clientType, expiresAt, overlapUntil],
  )
  return { code, expiresAt }
}

export const resolveAgentConnectionEndpointUrls = (input: {
  webOrigin: string
  publicMcpOrigin: string
}) => {
  const webOrigin = input.webOrigin.replace(/\/$/, '')
  const publicMcpOrigin = input.publicMcpOrigin.replace(/\/$/, '')
  return {
    connectUrl: (code: string) => `${webOrigin}/connect#${code}`,
    mcpUrl: `${publicMcpOrigin}/mcp`,
    skillDownloadUrl: `${webOrigin}/skills/workmesh-1.1.0.md`,
    wellKnownUrl: `${publicMcpOrigin}/.well-known/workmesh-agent`,
  }
}

export function registerAgentConnectionRoutes(app: FastifyInstance, input: {
  db: Pool
  webOrigin: string
  publicMcpOrigin: string
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
  paginator: Paginator
}): void {
  const { db, meta, header, paginator } = input
  const endpointUrls = resolveAgentConnectionEndpointUrls(input)
  const id = (request: FastifyRequest) => (request.params as { id: string }).id

  app.get('/.well-known/workmesh-agent', async () => agentWellKnownResponseSchema.parse({
    protocolVersion: 'v1', mcpUrl: endpointUrls.mcpUrl, wellKnownUrl: endpointUrls.wellKnownUrl,
    apiVersion: 'v1', supportedClients: ['codex', 'opencode', 'pi', 'generic_mcp'], skill,
  }))

  app.get('/api/v1/agent-connections', async request => {
    const actor = request.actor as ApiActor
    requireAdmin(actor)
    const page = await paginator.query<ConnectionRow & { status_rank: number }>(
      db,
      request,
      request.query,
      {
        route: '/api/v1/agent-connections',
        filters: {},
        sort: [
          {
            key: 'status_rank',
            sql: "CASE connection.status WHEN 'active' THEN 0 WHEN 'rotating' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END",
            direction: 'ASC',
          },
          { key: 'updated_at', sql: 'connection.updated_at', direction: 'DESC' },
          { key: 'id', sql: 'connection.id', direction: 'DESC' },
        ],
      },
      `SELECT connection.*,
              CASE connection.status WHEN 'active' THEN 0 WHEN 'rotating' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END AS status_rank
         FROM agent_connections connection
        WHERE connection.workspace_id=$1`,
      [actor.workspaceId],
    )
    return { items: page.items.map(response), nextCursor: page.nextCursor }
  })

  app.post('/api/v1/agent-connections', async (request, reply) => {
    const body = agentConnectionCreateInputSchema.parse(request.body)
    const context = meta(request, body)
    requireAdmin(context.actor)
    const result = await mutate(db, context as unknown as CommandContext, async tx => {
      one((await tx.query('SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL', [body.teamId, context.actor.workspaceId])).rows, 'NOT_FOUND')
      const principal = body.principalHumanActorId ?? context.actor.id
      one((await tx.query(
        `SELECT a.id FROM actors a WHERE a.id=$1 AND a.workspace_id=$2 AND a.kind='human' AND a.is_active
         AND (a.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=a.workspace_id AND m.team_id=$3 AND m.actor_id=a.id))`,
        [principal, context.actor.workspaceId, body.teamId],
      )).rows, 'FORBIDDEN')
      if (body.grantAgentDelegate && !body.requestedCapabilities.includes('agent:delegate'))
        throw new DomainError('AGENT_CONNECTION_PRIVILEGE_ESCALATION', 'agent:delegate must be explicitly requested')
      let agent = (await tx.query<{
        id: string
        actor_id: string
        approved_capabilities: string[]
      }>(
        `SELECT id,actor_id,approved_capabilities
           FROM agent_definitions
          WHERE workspace_id=$1 AND slug=$2
          FOR UPDATE`,
        [context.actor.workspaceId, body.agentSlug],
      )).rows[0]
      if (!agent) {
        const actor = one((await tx.query<{ id: string }>(
          "INSERT INTO actors(workspace_id,kind,display_name,is_active) VALUES($1,'agent',$2,true) RETURNING id",
          [context.actor.workspaceId, body.name],
        )).rows)
        agent = one((await tx.query<{
          id: string
          actor_id: string
          approved_capabilities: string[]
        }>(
          `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,manifest,supported_protocols,skills,requested_capabilities,approved_capabilities,output_artifact_types,max_concurrency)
           VALUES($1,$2,$3,$4,$5,ARRAY['mcp']::agent_protocol[],ARRAY['workmesh'], $6,$6,'{}',1)
           RETURNING id,actor_id,approved_capabilities`,
          [context.actor.workspaceId, actor.id, body.agentSlug, body.name, { provider: body.clientType, version: 'coordination-v1' }, body.requestedCapabilities],
        )).rows)
      }
      if (body.requestedCapabilities.some(capability =>
        !agent.approved_capabilities.includes(capability)))
        throw new DomainError(
          'CAPABILITY_DENIED',
          'Connection capabilities require matching Agent definition approval',
        )
      await tx.query(
        `INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities,revoked_at)
         VALUES($1,$2,$3,$4,$5,NULL) ON CONFLICT(agent_id,team_id) DO NOTHING`,
        [context.actor.workspaceId, agent.id, body.teamId, context.actor.id, body.requestedCapabilities],
      )
      const teamAccess = one((await tx.query<{ approved_capabilities: string[]; revoked_at: Date | null }>(
        `SELECT approved_capabilities,revoked_at FROM agent_team_access
          WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3`,
        [context.actor.workspaceId, agent.id, body.teamId],
      )).rows, 'CAPABILITY_DENIED')
      if (teamAccess.revoked_at || body.requestedCapabilities.some(capability => !teamAccess.approved_capabilities.includes(capability)))
        throw new DomainError('CAPABILITY_DENIED', 'Connection capabilities require an active matching Agent Team grant')
      const delegation = one((await tx.query<{ id: string }>(
        `INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,status)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'coordinator','team',$2::uuid,$6,
           jsonb_build_object('workspaceId',$1::text,'teamIds',jsonb_build_array($2::text),'projectIds','[]'::jsonb,'workItemIds','[]'::jsonb,'repositoryIds','[]'::jsonb,'capabilities',to_jsonb($6::text[])),'active') RETURNING id`,
        [context.actor.workspaceId, body.teamId, agent.id, agent.actor_id, principal, body.requestedCapabilities],
      )).rows)
      const actualId = randomUUID()
      const row = one((await tx.query<ConnectionRow>(
        `INSERT INTO agent_connections(id,workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,delegation_id,name,agent_slug,client_type,requested_capabilities,granted_capabilities,grant_agent_delegate,notes,skill_version,skill_sha256,created_by_actor_id)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [actualId, context.actor.workspaceId, body.teamId, agent.id, agent.actor_id, principal, delegation.id, body.name, body.agentSlug, body.clientType, body.requestedCapabilities, body.grantAgentDelegate, body.notes ?? null, skill.version, skill.sha256, context.actor.id],
      )).rows)
      const issued = await createPairing(tx, row.id, body.agentSlug, body.clientType, 'initial')
      const updated = one((await tx.query<ConnectionRow>('UPDATE agent_connections SET pairing_code_expires_at=$2 WHERE id=$1 RETURNING *', [row.id, issued.expiresAt])).rows)
      await connectionEvent(tx, context, updated, 'agent.connection.created', { clientType: body.clientType })
      return { connection: response(updated), connect_url: endpointUrls.connectUrl(issued.code), skill }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/v1/agent-connections/redeem', async request => {
    const body = agentConnectionRedeemInputSchema.parse(request.body)
    if (body.pairingCode.startsWith(installationTokenPrefix))
      throw new DomainError('AGENT_CONNECTION_PAIRING_INVALID', 'An Installation Token cannot be redeemed; use the one-time wmp_ pairing URL fragment')
    const codeHash = tokenHash(body.pairingCode)
    let replay
    try {
      replay = await authIdempotentTransaction(db, {
      idempotencyKey: request.idempotencyKey!, subject: codeHash, operation: 'redeemAgentConnection', request: body, clientContext: authClientContext(request),
    }, async tx => {
      const pairing = one((await tx.query<{ id: string; connection_id: string; purpose: 'initial' | 'rotation'; expected_agent_slug: string; expected_client_type: string; attempts: number; expires_at: Date; overlap_until: Date | null; consumed_at: Date | null }>(
        'SELECT * FROM agent_connection_pairings WHERE code_hash=$1 FOR UPDATE', [codeHash],
      )).rows, 'AGENT_CONNECTION_PAIRING_INVALID')
      if (pairing.attempts >= 8) throw new DomainError('AGENT_CONNECTION_PAIRING_LOCKED', 'Pairing code is locked')
      if (pairing.consumed_at) throw new DomainError('AGENT_CONNECTION_PAIRING_CONSUMED', 'Pairing code was already consumed')
      if (pairing.expires_at.getTime() <= Date.now()) throw new DomainError('AGENT_CONNECTION_PAIRING_EXPIRED', 'Pairing code expired')
      if (pairing.expected_agent_slug !== body.agentSlug || pairing.expected_client_type !== body.client.type) {
        throw new DomainError('AGENT_CONNECTION_CLIENT_TYPE_MISMATCH', 'Pairing identity does not match its envelope')
      }
      let row = one((await tx.query<ConnectionRow>('SELECT * FROM agent_connections WHERE id=$1 FOR UPDATE', [pairing.connection_id])).rows)
      if (row.status === 'revoked') throw new DomainError('AGENT_CONNECTION_REVOKED', 'Connection is revoked')
      const installationToken = connectionToken(installationTokenPrefix)
      const installationTokenHash = tokenHash(installationToken)
      const fingerprintPrefix = installationTokenHash.slice(0, 12)
      if (pairing.purpose === 'rotation') {
        await tx.query("UPDATE agent_connection_credentials SET status='overlap',overlap_until=$2 WHERE connection_id=$1 AND status='active'", [row.id, pairing.overlap_until])
        await expireConnectionInstallationTokens(tx, row.id, pairing.overlap_until!)
      }
      await tx.query(
        `INSERT INTO agent_connection_credentials(connection_id,token_hash,fingerprint_prefix,status)
         VALUES($1,$2,$3,'active')`, [row.id, installationTokenHash, fingerprintPrefix],
      )
      await reconcileConnectionInstallationToken(tx, {
        agentId: row.agent_id,
        credentialHash: installationTokenHash,
        expiresAt: null,
        createdByActorId: row.agent_actor_id,
      })
      await tx.query('UPDATE agent_connection_pairings SET consumed_at=now() WHERE id=$1', [pairing.id])
      row = one((await tx.query<ConnectionRow>(
        `UPDATE agent_connections SET status=CASE WHEN $2='rotation' THEN 'rotating' ELSE 'active' END,
         active_credential_fingerprint_prefix=$3,pairing_code_expires_at=NULL,skill_version=$4,skill_sha256=$5,revision=revision+1,updated_at=now()
         WHERE id=$1 RETURNING *`, [row.id, pairing.purpose, fingerprintPrefix, skill.version, skill.sha256],
      )).rows)
      await appendEvent(tx, { workspaceId: row.workspace_id, teamId: row.team_id, actorId: row.agent_actor_id, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, type: 'agent.connection.pairing_redeemed', aggregateType: 'agent_connection', aggregateId: row.id, revision: row.revision, payload: { clientType: body.client.type }, resources: { scopes: [{ type: 'team', id: row.team_id }], invalidates: [{ type: 'team', id: row.team_id }] } })
      return { status: 200, body: {
        connection: response(row), installation_token: installationToken,
        mcp: { transport: 'streamable_http' as const, url: endpointUrls.mcpUrl, auth: { type: 'installation_token' as const, header: 'X-WorkMesh-Installation-Token' as const } },
        skill: { ...skill, download_url: endpointUrls.skillDownloadUrl }, principal_human_actor_id: row.principal_human_actor_id,
        team_id: row.team_id, idempotency_replay: { replayable_until: new Date(Date.now() + 15 * 60_000).toISOString(), replay_returns_identical_body: true as const },
      } }
      })
    } catch (error) {
      if (error instanceof DomainError && error.code === 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH')
        await db.query('UPDATE agent_connection_pairings SET attempts=LEAST(attempts+1,10) WHERE code_hash=$1 AND consumed_at IS NULL', [codeHash])
      throw error
    }
    return replay.body
  })

  app.get('/api/v1/agent-connections/current-identity', async request => {
    if (request.actor?.authentication !== 'coordination_connection'
      || !request.coordinationIdentity)
      throw new DomainError('UNAUTHENTICATED', 'An active Agent Connection is required')
    return agentConnectionCurrentIdentitySchema.parse(request.coordinationIdentity)
  })

  app.get('/api/v1/agent-connections/:id', async request => {
    const actor = request.actor as ApiActor; requireAdmin(actor)
    return response(one((await db.query<ConnectionRow>('SELECT * FROM agent_connections WHERE id=$1 AND workspace_id=$2', [id(request), actor.workspaceId])).rows))
  })

  app.patch('/api/v1/agent-connections/:id', async request => {
    const body = agentConnectionPatchInputSchema.parse(request.body); const context = meta(request, body, { id: id(request) }); requireAdmin(context.actor)
    return mutate(db, context as unknown as CommandContext, async tx => {
      let row = await getLocked(tx, context.actor.workspaceId, id(request)); assertRevision(parseRevision(header(request, 'if-match')), row.revision)
      if (body.principalHumanActorId) one((await tx.query("SELECT id FROM actors WHERE id=$1 AND workspace_id=$2 AND kind='human' AND is_active AND (workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships WHERE workspace_id=$2 AND team_id=$3 AND actor_id=$1))", [body.principalHumanActorId, row.workspace_id, row.team_id])).rows, 'FORBIDDEN')
      row = one((await tx.query<ConnectionRow>(`UPDATE agent_connections SET name=COALESCE($2,name),principal_human_actor_id=COALESCE($3,principal_human_actor_id),notes=CASE WHEN $4 THEN $5 ELSE notes END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`, [row.id, body.name ?? null, body.principalHumanActorId ?? null, body.notes !== undefined, body.notes ?? null])).rows)
      if (body.principalHumanActorId) {
        await tx.query('UPDATE delegations SET principal_human_actor_id=$2,revision=revision+1,updated_at=now() WHERE id=$1', [row.delegation_id, body.principalHumanActorId])
        await tx.query(
          `UPDATE agent_coordination_sessions SET principal_human_actor_id=$2,updated_at=now()
            WHERE connection_id=$1 AND status='active'`,
          [row.id, body.principalHumanActorId],
        )
      }
      await connectionEvent(tx, context, row, 'agent.connection.updated', { fields: Object.keys(body) }); return response(row)
    })
  })

  app.delete('/api/v1/agent-connections/:id', async (request, reply) => {
    const context = meta(request, {}, { id: id(request) }); requireAdmin(context.actor)
    await mutate(db, context as unknown as CommandContext, async tx => {
      let row = await getLocked(tx, context.actor.workspaceId, id(request)); assertRevision(parseRevision(header(request, 'if-match')), row.revision)
      await tx.query("UPDATE agent_connection_credentials SET status='revoked',revoked_at=now() WHERE connection_id=$1 AND status IN ('active','overlap')", [row.id])
      await revokeConnectionInstallationTokens(tx, row.id, ['revoked'])
      const activeCoordination = (await tx.query<{
        id: string
        agent_session_id: string
        revision: number
        sequence: string
        session_workspace_id: string
        session_team_id: string | null
        session_agent_actor_id: string
      }>(
        `SELECT coordination.id,coordination.agent_session_id,
                session.revision,session.sequence,
                session.workspace_id AS session_workspace_id,
                session.team_id AS session_team_id,
                session.agent_actor_id AS session_agent_actor_id
           FROM agent_coordination_sessions coordination
           JOIN agent_sessions session ON session.id=coordination.agent_session_id
          WHERE coordination.connection_id=$1 AND coordination.status='active'
          FOR UPDATE OF coordination,session`,
        [row.id],
      )).rows
      await tx.query("UPDATE agent_coordination_sessions SET status='closed',closed_at=now(),updated_at=now() WHERE connection_id=$1 AND status='active'", [row.id])
      for (const coordination of activeCoordination)
        await appendCoordinationClosed(
          tx,
          row,
          {
            id: coordination.agent_session_id,
            workspace_id: coordination.session_workspace_id,
            team_id: coordination.session_team_id,
          },
          'connection_revoked',
          context.actor.id,
          context.correlationId,
        )
      const canceledSessions = (await tx.query<{
        id: string
        revision: number
        sequence: string
        workspace_id: string
        team_id: string | null
        agent_actor_id: string
      }>(
        `UPDATE agent_sessions
            SET state='canceled',state_reason='coordination connection revoked',
                ended_at=now(),revision=revision+1,updated_at=now()
          WHERE (
              id=ANY($2::uuid[])
              OR (coordination_connection_id=$1 AND session_kind='coordination')
            )
            AND state NOT IN ('completed','failed','canceled')
        RETURNING id,revision,sequence,workspace_id,team_id,agent_actor_id`,
        [row.id, activeCoordination.map(coordination => coordination.agent_session_id)],
      )).rows
      for (const canceled of canceledSessions)
        await appendEvent(tx, {
          workspaceId: canceled.workspace_id,
          actorId: canceled.agent_actor_id,
          correlationId: `agent-session:${canceled.id}:connection-revoked`,
          type: 'agent.session.state_changed',
          aggregateType: 'agent_session',
          aggregateId: canceled.id,
          revision: canceled.revision,
          sessionId: canceled.id,
          sessionSequence: canceled.sequence,
          payload: {
            state: 'canceled',
            reason: 'coordination connection revoked',
          },
        })
      await tx.query("UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE id=$1", [row.delegation_id, context.actor.id])
      row = one((await tx.query<ConnectionRow>("UPDATE agent_connections SET status='revoked',revoked_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [row.id])).rows)
      await connectionEvent(tx, context, row, 'agent.connection.revoked', {}); return response(row)
    })
    return reply.code(204).send()
  })

  app.post('/api/v1/agent-connections/:id/rotate', async (request, reply) => {
    const context = meta(request, {}, { id: id(request) }); requireAdmin(context.actor)
    const result = await mutate(db, context as unknown as CommandContext, async tx => {
      let row = await getLocked(tx, context.actor.workspaceId, id(request)); assertRevision(parseRevision(header(request, 'if-match')), row.revision)
      if (row.status !== 'active') throw new DomainError('INVALID_STATE_TRANSITION', 'Only an active Connection can rotate')
      const overlapUntil = new Date(Date.now() + 15 * 60_000)
      const issued = await createPairing(tx, row.id, row.agent_slug, row.client_type, 'rotation', overlapUntil)
      row = one((await tx.query<ConnectionRow>("UPDATE agent_connections SET status='rotating',pairing_code_expires_at=$2,rotated_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [row.id, issued.expiresAt])).rows)
      await connectionEvent(tx, context, row, 'agent.connection.rotated', { overlapUntil: overlapUntil.toISOString() })
      return { connection: response(row), connect_url: endpointUrls.connectUrl(issued.code), pairing_code_expires_at: issued.expiresAt.toISOString(), overlap_until: overlapUntil.toISOString() }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/v1/agent-connections/:id/rotate-confirm', async request => {
    const context = meta(request, {}, { id: id(request) }); requireAdmin(context.actor)
    return mutate(db, context as unknown as CommandContext, async tx => {
      let row = await getLocked(tx, context.actor.workspaceId, id(request)); assertRevision(parseRevision(header(request, 'if-match')), row.revision)
      if (row.status !== 'rotating') throw new DomainError('INVALID_STATE_TRANSITION', 'Connection is not rotating')
      const rotation = one((await tx.query<{ consumed_at: Date | null; has_active: boolean; has_overlap: boolean }>(
        `SELECT pairing.consumed_at,
                EXISTS(SELECT 1 FROM agent_connection_credentials WHERE connection_id=pairing.connection_id AND status='active') AS has_active,
                EXISTS(SELECT 1 FROM agent_connection_credentials WHERE connection_id=pairing.connection_id AND status='overlap') AS has_overlap
           FROM agent_connection_pairings pairing
          WHERE pairing.connection_id=$1 AND pairing.purpose='rotation'
          ORDER BY pairing.created_at DESC,pairing.id DESC LIMIT 1 FOR UPDATE`,
        [row.id],
      )).rows, 'INVALID_STATE_TRANSITION')
      if (!rotation.consumed_at || !rotation.has_active || !rotation.has_overlap)
        throw new DomainError('INVALID_STATE_TRANSITION', 'Rotation pairing must be redeemed before confirmation')
      await tx.query("UPDATE agent_connection_credentials SET status='rotated',revoked_at=now() WHERE connection_id=$1 AND status='overlap'", [row.id])
      await revokeConnectionInstallationTokens(tx, row.id, ['rotated'])
      row = one((await tx.query<ConnectionRow>("UPDATE agent_connections SET status='active',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [row.id])).rows)
      await connectionEvent(tx, context, row, 'agent.connection.rotation_confirmed', {}); return response(row)
    })
  })
}

export async function resolveCoordinationIdentity(
  db: Pool,
  installationToken: string,
  options: { auditSecret: string },
): Promise<AgentConnectionCurrentIdentity> {
  const auditFingerprint = credentialAuditFingerprint(
    options.auditSecret,
    installationToken,
  )
  if (installationToken.startsWith(pairingTokenPrefix))
    identityFailure('pairing_code_not_credential', auditFingerprint)

  return withTx(db, async tx => {
    const row = (await tx.query<AuthenticatedConnectionRow>(
      `SELECT connection.*,
              credential.id AS credential_id,
              credential.fingerprint_prefix AS credential_fingerprint_prefix,
              credential.status AS credential_status,
              credential.overlap_until AS credential_overlap_until
         FROM agent_connection_credentials credential
         JOIN agent_connections connection ON connection.id=credential.connection_id
        WHERE credential.token_hash=$1
        FOR UPDATE OF connection,credential`,
      [tokenHash(installationToken)],
    )).rows[0]
    if (!row) identityFailure('credential_unknown', auditFingerprint)

    const credentialIsActive = row.credential_status === 'active'
      || (row.credential_status === 'overlap'
        && row.credential_overlap_until !== null
        && row.credential_overlap_until.getTime() > Date.now())
    if (!credentialIsActive)
      identityFailure('credential_inactive', auditFingerprint, row.credential_fingerprint_prefix)
    if (row.status !== 'active' && row.status !== 'rotating')
      identityFailure('connection_inactive', auditFingerprint, row.credential_fingerprint_prefix)

    const agent = (await tx.query<{
      workspace_id: string
      actor_id: string
      is_active: boolean
      approved_capabilities: string[]
    }>(
      `SELECT workspace_id,actor_id,is_active,approved_capabilities
         FROM agent_definitions WHERE id=$1 FOR UPDATE`,
      [row.agent_id],
    )).rows[0]
    if (!agent || !agent.is_active || agent.workspace_id !== row.workspace_id)
      identityFailure('agent_inactive', auditFingerprint, row.credential_fingerprint_prefix)
    if (agent.actor_id !== row.agent_actor_id)
      identityFailure('delegation_binding_invalid', auditFingerprint, row.credential_fingerprint_prefix)
    const definitionEffectiveCapabilities = row.granted_capabilities.filter(capability =>
      agent.approved_capabilities.includes(capability))
    if (!sameStringSet(definitionEffectiveCapabilities, row.granted_capabilities))
      identityFailure('agent_capability_inactive', auditFingerprint, row.credential_fingerprint_prefix)

    const teamGrant = (await tx.query<{
      approved_capabilities: string[]
      revoked_at: Date | null
    }>(
      `SELECT approved_capabilities,revoked_at
         FROM agent_team_access
        WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3
        FOR UPDATE`,
      [row.workspace_id, row.agent_id, row.team_id],
    )).rows[0]
    if (!teamGrant || teamGrant.revoked_at
      || row.granted_capabilities.some(capability => !teamGrant.approved_capabilities.includes(capability)))
      identityFailure('team_grant_inactive', auditFingerprint, row.credential_fingerprint_prefix)

    const delegation = (await tx.query<{
      workspace_id: string
      team_id: string
      agent_id: string
      agent_actor_id: string
      principal_human_actor_id: string
      role: string
      scope_type: string
      scope_id: string
      permissions_snapshot: string[]
      capability_scope: Record<string, unknown>
      status: string
    }>(
      `SELECT workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,
              role,scope_type,scope_id,permissions_snapshot,capability_scope,status
         FROM delegations WHERE id=$1 FOR UPDATE`,
      [row.delegation_id],
    )).rows[0]
    if (!delegation || delegation.status !== 'active')
      identityFailure('delegation_inactive', auditFingerprint, row.credential_fingerprint_prefix)
    const scopedCapabilities = Array.isArray(delegation.capability_scope.capabilities)
      ? delegation.capability_scope.capabilities.filter((value): value is string => typeof value === 'string')
      : []
    if (
      delegation.workspace_id !== row.workspace_id
      || delegation.team_id !== row.team_id
      || delegation.agent_id !== row.agent_id
      || delegation.agent_actor_id !== row.agent_actor_id
      || delegation.principal_human_actor_id !== row.principal_human_actor_id
      || delegation.role !== 'coordinator'
      || delegation.scope_type !== 'team'
      || delegation.scope_id !== row.team_id
      || row.granted_capabilities.some(capability => !delegation.permissions_snapshot.includes(capability))
      || row.granted_capabilities.some(capability => !scopedCapabilities.includes(capability))
    ) identityFailure('delegation_binding_invalid', auditFingerprint, row.credential_fingerprint_prefix)

    const actors = (await tx.query<{
      id: string
      kind: 'human' | 'agent' | 'service'
      is_active: boolean
    }>(
      'SELECT id,kind,is_active FROM actors WHERE id=ANY($1::uuid[])',
      [[row.agent_actor_id, row.principal_human_actor_id]],
    )).rows
    const agentActor = actors.find(actor => actor.id === row.agent_actor_id)
    if (!agentActor || agentActor.kind !== 'agent' || !agentActor.is_active)
      identityFailure('agent_actor_inactive', auditFingerprint, row.credential_fingerprint_prefix)
    const principal = actors.find(actor => actor.id === row.principal_human_actor_id)
    if (!principal || principal.kind !== 'human' || !principal.is_active)
      identityFailure('principal_inactive', auditFingerprint, row.credential_fingerprint_prefix)

    const team = (await tx.query<{ id: string }>(
      'SELECT id FROM teams WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL',
      [row.workspace_id, row.team_id],
    )).rows[0]
    if (!team) identityFailure('team_inactive', auditFingerprint, row.credential_fingerprint_prefix)

    let coordination = (await tx.query<CoordinationRow>(
      `SELECT id,agent_session_id,connection_id,workspace_id,team_id,agent_id,
              agent_actor_id,principal_human_actor_id,delegation_id,
              granted_capabilities,expires_at,refreshed_at
         FROM agent_coordination_sessions
        WHERE connection_id=$1 AND status='active'
        FOR UPDATE`,
      [row.id],
    )).rows[0]
    const backingSessions = (await tx.query<CoordinationBackingSessionRow>(
      `SELECT id,workspace_id,team_id,agent_id,agent_actor_id,delegation_id,state,
              session_kind,coordination_connection_id,ended_at,revision,sequence
         FROM agent_sessions
        WHERE ($1::uuid IS NOT NULL AND id=$1)
           OR (coordination_connection_id=$2 AND session_kind='coordination'
               AND state NOT IN ('completed','failed','canceled'))
        ORDER BY id
        FOR UPDATE`,
      [coordination?.agent_session_id ?? null, row.id],
    )).rows
    let backing = coordination
      ? backingSessions.find(session => session.id === coordination!.agent_session_id)
      : undefined
    const liveBackings = backingSessions.filter(session =>
      session.session_kind === 'coordination'
      && session.coordination_connection_id === row.id
      && !['completed', 'failed', 'canceled'].includes(session.state),
    )

    let openReason: 'initial' | 'expired' | 'recovered_terminal_backing' | 'recovered_invalid_backing' =
      liveBackings.length > 0 ? 'recovered_invalid_backing' : 'initial'
    let closeReason: 'expired' | 'terminal_backing' | 'invalid_binding' | 'invalid_backing' | undefined
    if (coordination) {
      const bindingValid = coordination.connection_id === row.id
        && coordination.workspace_id === row.workspace_id
        && coordination.team_id === row.team_id
        && coordination.agent_id === row.agent_id
        && coordination.agent_actor_id === row.agent_actor_id
        && coordination.principal_human_actor_id === row.principal_human_actor_id
        && coordination.delegation_id === row.delegation_id
        && sameStringSet(coordination.granted_capabilities, row.granted_capabilities)
        && backing?.workspace_id === row.workspace_id
        && backing.team_id === row.team_id
        && backing.agent_id === row.agent_id
        && backing.agent_actor_id === row.agent_actor_id
        && backing.delegation_id === row.delegation_id
        && backing.session_kind === 'coordination'
        && backing.coordination_connection_id === row.id
      if (coordination.expires_at.getTime() <= Date.now()) {
        openReason = 'expired'
        closeReason = 'expired'
      } else if (backing && ['completed', 'failed', 'canceled'].includes(backing.state)) {
        openReason = 'recovered_terminal_backing'
        closeReason = 'terminal_backing'
      } else if (!bindingValid) {
        openReason = 'recovered_invalid_backing'
        closeReason = 'invalid_binding'
      } else if (!backing
        || backing.ended_at !== null
        || !coordinationAuthorityStates.has(backing.state)
        || liveBackings.length !== 1
        || liveBackings[0]?.id !== backing.id) {
        openReason = 'recovered_invalid_backing'
        closeReason = 'invalid_backing'
      }
    }

    if (!coordination || closeReason) {
      if (coordination && closeReason) {
        await tx.query(
          "UPDATE agent_coordination_sessions SET status='closed',closed_at=now(),updated_at=now() WHERE id=$1 AND status='active'",
          [coordination.id],
        )
        await appendCoordinationClosed(
          tx,
          row,
          backing ?? {
            id: coordination.agent_session_id,
            workspace_id: coordination.workspace_id,
            team_id: coordination.team_id,
          },
          closeReason,
        )
      }
      const canceled = (await tx.query<CoordinationBackingSessionRow>(
        `UPDATE agent_sessions
            SET state='canceled',
                state_reason=$2,
                ended_at=now(),revision=revision+1,updated_at=now()
          WHERE (
              id=$3
              OR (coordination_connection_id=$1 AND session_kind='coordination')
            )
            AND state NOT IN ('completed','failed','canceled')
        RETURNING id,workspace_id,team_id,agent_id,agent_actor_id,delegation_id,state,
                  session_kind,coordination_connection_id,ended_at,revision,sequence`,
        [
          row.id,
          closeReason === 'expired'
            ? 'coordination session expired'
            : 'coordination backing session recovered',
          coordination?.agent_session_id ?? null,
        ],
      )).rows
      for (const canceledSession of canceled) {
        await appendEvent(tx, {
          workspaceId: canceledSession.workspace_id,
          actorId: canceledSession.agent_actor_id,
          correlationId: `agent-session:${canceledSession.id}:coordination-recovered`,
          type: 'agent.session.state_changed',
          aggregateType: 'agent_session',
          aggregateId: canceledSession.id,
          revision: canceledSession.revision,
          sessionId: canceledSession.id,
          sessionSequence: canceledSession.sequence,
          payload: {
            state: 'canceled',
            reason: closeReason === 'expired'
              ? 'coordination session expired'
              : 'coordination backing session recovered',
          },
        })
      }
      const agentSession = one((await tx.query<{
        id: string
        revision: number
        sequence: string
      }>(
        `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,
                                    delegation_id,state,state_reason,acknowledged_at,
                                    last_heartbeat_at,session_kind,coordination_connection_id)
         VALUES($1,$2,$3,$4,$5,'executing','coordination connection',now(),now(),
                'coordination',$6)
         RETURNING id,revision,sequence`,
        [row.workspace_id, row.team_id, row.agent_id, row.agent_actor_id,
          row.delegation_id, row.id],
      )).rows)
      coordination = one((await tx.query<CoordinationRow>(
        `INSERT INTO agent_coordination_sessions(agent_session_id,connection_id,
                  workspace_id,team_id,agent_id,agent_actor_id,
                  principal_human_actor_id,delegation_id,granted_capabilities,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 hour')
         RETURNING id,agent_session_id,connection_id,workspace_id,team_id,agent_id,
                   agent_actor_id,principal_human_actor_id,delegation_id,
                   granted_capabilities,expires_at,refreshed_at`,
        [agentSession.id, row.id, row.workspace_id, row.team_id, row.agent_id,
          row.agent_actor_id, row.principal_human_actor_id, row.delegation_id,
          row.granted_capabilities],
      )).rows)
      backing = {
        id: agentSession.id,
        workspace_id: row.workspace_id,
        team_id: row.team_id,
        agent_id: row.agent_id,
        agent_actor_id: row.agent_actor_id,
        delegation_id: row.delegation_id,
        state: 'executing',
        session_kind: 'coordination',
        coordination_connection_id: row.id,
        ended_at: null,
        revision: agentSession.revision,
        sequence: agentSession.sequence,
      }
      await appendEvent(tx, {
        workspaceId: row.workspace_id,
        teamId: row.team_id,
        actorId: row.agent_actor_id,
        correlationId: `agent-connection:${row.id}:create:${agentSession.id}`,
        type: 'agent.session.created',
        aggregateType: 'agent_session',
        aggregateId: agentSession.id,
        revision: agentSession.revision,
        sessionId: agentSession.id,
        sessionSequence: agentSession.sequence,
        payload: {
          delegationId: row.delegation_id,
          connectionId: row.id,
          sessionKind: 'coordination',
        },
        resources: coordinationResources(row.team_id),
      })
      await appendCoordinationOpened(tx, row, {
        id: agentSession.id,
        revision: agentSession.revision,
        sequence: agentSession.sequence,
        expires_at: coordination.expires_at,
      }, openReason)
    } else if (coordination.expires_at.getTime() < Date.now() + 15 * 60_000) {
      const previousExpiresAt = coordination.expires_at
      coordination = one((await tx.query<CoordinationRow>(
        `UPDATE agent_coordination_sessions
            SET expires_at=now()+interval '1 hour',refreshed_at=now(),updated_at=now()
          WHERE id=$1 AND status='active'
        RETURNING id,agent_session_id,connection_id,workspace_id,team_id,agent_id,
                  agent_actor_id,principal_human_actor_id,delegation_id,
                  granted_capabilities,expires_at,refreshed_at`,
        [coordination.id],
      )).rows)
      await appendCoordinationRefreshed(tx, row, backing!, previousExpiresAt, coordination.expires_at)
    }

    await tx.query(
      'UPDATE agent_connection_credentials SET last_used_at=now() WHERE id=$1',
      [row.credential_id],
    )
    const lastUsedAt = new Date()
    await tx.query(
      'UPDATE agent_connections SET last_used_at=$2,updated_at=now() WHERE id=$1',
      [row.id, lastUsedAt],
    )
    return agentConnectionCurrentIdentitySchema.parse({
      connection: response({ ...row, last_used_at: lastUsedAt }),
      agent_actor_id: row.agent_actor_id,
      principal_human_actor_id: row.principal_human_actor_id,
      team_id: row.team_id,
      granted_capabilities: row.granted_capabilities,
      coordination_session: {
        id: coordination.agent_session_id,
        connection_id: row.id,
        session_kind: 'coordination',
        role: 'coordinator',
        delegation_scope: 'team',
        granted_capabilities: row.granted_capabilities,
        expires_at: coordination.expires_at.toISOString(),
        refreshed_at: coordination.refreshed_at?.toISOString() ?? null,
        team_id: row.team_id,
        principal_human_actor_id: row.principal_human_actor_id,
      },
      authenticated_credential: {
        fingerprint_prefix: row.credential_fingerprint_prefix,
        status: row.credential_status,
        overlap_until: row.credential_overlap_until?.toISOString() ?? null,
      },
    })
  })
}
