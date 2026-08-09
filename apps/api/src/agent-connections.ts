import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import {
  agentConnectionCreateInputSchema,
  agentConnectionPatchInputSchema,
  agentConnectionRedeemInputSchema,
  agentConnectionResponseSchema,
  agentWellKnownResponseSchema,
  type AgentConnectionResponse,
  type AgentConnectionCreateInput,
  workmeshSkillManifest,
} from '@workmesh/contracts'
import { appendEvent, opaqueToken, tokenHash, withTx } from '@workmesh/db'
import { DomainError, assertRevision, parseRevision } from '@workmesh/domain'
import { authClientContext, authIdempotentTransaction } from './auth-idempotency.js'
import type { ApiActor, RequestMeta } from './agent/types.js'
import { mutate, type CommandContext } from './commands.js'

const skill = workmeshSkillManifest

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
  const code = opaqueToken()
  const expiresAt = new Date(Date.now() + 10 * 60_000)
  await tx.query(
    `INSERT INTO agent_connection_pairings(connection_id,code_hash,purpose,expected_agent_slug,expected_client_type,expires_at,overlap_until)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [connectionId, tokenHash(code), purpose, slug, clientType, expiresAt, overlapUntil],
  )
  return { code, expiresAt }
}

const connectUrl = (webOrigin: string, code: string) => `${webOrigin.replace(/\/$/, '')}/connect#${code}`
const mcpUrl = (webOrigin: string) => `${webOrigin.replace(/\/$/, '')}/mcp`
const skillDownloadUrl = (webOrigin: string) => `${webOrigin.replace(/\/$/, '')}/skills/workmesh-1.1.0.md`

export function registerAgentConnectionRoutes(app: FastifyInstance, input: {
  db: Pool
  webOrigin: string
  meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta
  header: (request: FastifyRequest, name: string) => string | undefined
}): void {
  const { db, webOrigin, meta, header } = input
  const id = (request: FastifyRequest) => (request.params as { id: string }).id

  app.get('/.well-known/workmesh-agent', async () => agentWellKnownResponseSchema.parse({
    protocolVersion: 'v1', mcpUrl: mcpUrl(webOrigin), wellKnownUrl: `${webOrigin.replace(/\/$/, '')}/.well-known/workmesh-agent`,
    apiVersion: 'v1', supportedClients: ['codex', 'opencode', 'pi', 'generic_mcp'], skill,
  }))

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
      let agent = (await tx.query<{ id: string; actor_id: string }>(
        'SELECT id,actor_id FROM agent_definitions WHERE workspace_id=$1 AND slug=$2 FOR UPDATE',
        [context.actor.workspaceId, body.agentSlug],
      )).rows[0]
      if (!agent) {
        const actor = one((await tx.query<{ id: string }>(
          "INSERT INTO actors(workspace_id,kind,display_name,is_active) VALUES($1,'agent',$2,true) RETURNING id",
          [context.actor.workspaceId, body.name],
        )).rows)
        agent = one((await tx.query<{ id: string; actor_id: string }>(
          `INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,manifest,supported_protocols,skills,requested_capabilities,approved_capabilities,output_artifact_types,max_concurrency)
           VALUES($1,$2,$3,$4,$5,ARRAY['mcp']::agent_protocol[],ARRAY['workmesh'], $6,$6,'{}',1) RETURNING id,actor_id`,
          [context.actor.workspaceId, actor.id, body.agentSlug, body.name, { provider: body.clientType, version: 'coordination-v1' }, body.requestedCapabilities],
        )).rows)
      }
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
      return { connection: response(updated), connect_url: connectUrl(webOrigin, issued.code), skill }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/v1/agent-connections/redeem', async request => {
    const body = agentConnectionRedeemInputSchema.parse(request.body)
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
      const installationToken = opaqueToken()
      const fingerprintPrefix = tokenHash(installationToken).slice(0, 12)
      if (pairing.purpose === 'rotation')
        await tx.query("UPDATE agent_connection_credentials SET status='overlap',overlap_until=$2 WHERE connection_id=$1 AND status='active'", [row.id, pairing.overlap_until])
      await tx.query(
        `INSERT INTO agent_connection_credentials(connection_id,token_hash,fingerprint_prefix,status)
         VALUES($1,$2,$3,'active')`, [row.id, tokenHash(installationToken), fingerprintPrefix],
      )
      await tx.query('UPDATE agent_connection_pairings SET consumed_at=now() WHERE id=$1', [pairing.id])
      row = one((await tx.query<ConnectionRow>(
        `UPDATE agent_connections SET status=CASE WHEN $2='rotation' THEN 'rotating' ELSE 'active' END,
         active_credential_fingerprint_prefix=$3,pairing_code_expires_at=NULL,skill_version=$4,skill_sha256=$5,revision=revision+1,updated_at=now()
         WHERE id=$1 RETURNING *`, [row.id, pairing.purpose, fingerprintPrefix, skill.version, skill.sha256],
      )).rows)
      await appendEvent(tx, { workspaceId: row.workspace_id, teamId: row.team_id, actorId: row.agent_actor_id, correlationId: request.correlationId, idempotencyKey: request.idempotencyKey, type: 'agent.connection.pairing_redeemed', aggregateType: 'agent_connection', aggregateId: row.id, revision: row.revision, payload: { clientType: body.client.type }, resources: { scopes: [{ type: 'team', id: row.team_id }], invalidates: [{ type: 'team', id: row.team_id }] } })
      return { status: 200, body: {
        connection: response(row), installation_token: installationToken,
        mcp: { transport: 'streamable_http' as const, url: mcpUrl(webOrigin), auth: { type: 'installation_token' as const, header: 'X-WorkMesh-Installation-Token' as const } },
        skill: { ...skill, download_url: skillDownloadUrl(webOrigin) }, principal_human_actor_id: row.principal_human_actor_id,
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
      await tx.query("UPDATE agent_coordination_sessions SET status='closed',closed_at=now(),updated_at=now() WHERE connection_id=$1 AND status='active'", [row.id])
      await tx.query("UPDATE agent_sessions SET state='canceled',state_reason='coordination connection revoked',ended_at=now(),revision=revision+1,updated_at=now() WHERE coordination_connection_id=$1 AND state NOT IN ('completed','failed','canceled')", [row.id])
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
      return { connection: response(row), connect_url: connectUrl(webOrigin, issued.code), pairing_code_expires_at: issued.expiresAt.toISOString(), overlap_until: overlapUntil.toISOString() }
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
      row = one((await tx.query<ConnectionRow>("UPDATE agent_connections SET status='active',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [row.id])).rows)
      await connectionEvent(tx, context, row, 'agent.connection.rotation_confirmed', {}); return response(row)
    })
  })
}

export async function resolveCoordinationIdentity(db: Pool, installationToken: string) {
  return withTx(db, async tx => {
    const row = one((await tx.query<ConnectionRow & { credential_id: string }>(
      `SELECT c.*,credential.id AS credential_id FROM agent_connection_credentials credential
       JOIN agent_connections c ON c.id=credential.connection_id
       JOIN agent_definitions agent ON agent.id=c.agent_id AND agent.is_active
       JOIN actors actor ON actor.id=c.agent_actor_id AND actor.is_active
       JOIN actors principal ON principal.id=c.principal_human_actor_id AND principal.is_active
       JOIN agent_team_access grant_row ON grant_row.workspace_id=c.workspace_id AND grant_row.agent_id=c.agent_id AND grant_row.team_id=c.team_id AND grant_row.revoked_at IS NULL
       JOIN delegations delegation ON delegation.id=c.delegation_id AND delegation.status='active'
       WHERE credential.token_hash=$1 AND c.status IN ('active','rotating')
         AND (credential.status='active' OR (credential.status='overlap' AND credential.overlap_until>now())) FOR UPDATE OF c,credential`,
      [tokenHash(installationToken)],
    )).rows, 'UNAUTHENTICATED')
    await tx.query('UPDATE agent_connection_credentials SET last_used_at=now() WHERE id=$1', [row.credential_id])
    let session = (await tx.query<{ id: string; expires_at: Date; refreshed_at: Date | null }>("SELECT agent_session_id AS id,expires_at,refreshed_at FROM agent_coordination_sessions WHERE connection_id=$1 AND status='active' FOR UPDATE", [row.id])).rows[0]
    if (session && session.expires_at.getTime() <= Date.now()) {
      await tx.query("UPDATE agent_coordination_sessions SET status='closed',closed_at=now(),updated_at=now() WHERE agent_session_id=$1", [session.id])
      const canceled = (await tx.query<{ revision: number; sequence: string }>("UPDATE agent_sessions SET state='canceled',state_reason='coordination session expired',ended_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND state NOT IN ('completed','failed','canceled') RETURNING revision,sequence", [session.id])).rows[0]
      if (canceled)
        await appendEvent(tx, {
          workspaceId: row.workspace_id, teamId: row.team_id, actorId: row.agent_actor_id,
          correlationId: `agent-connection:${row.id}:expire:${session.id}`,
          type: 'agent.session.state_changed', aggregateType: 'agent_session', aggregateId: session.id,
          revision: canceled.revision, sessionId: session.id, sessionSequence: canceled.sequence,
          payload: { state: 'canceled', reason: 'coordination session expired', connectionId: row.id },
          resources: { scopes: [{ type: 'team', id: row.team_id }], invalidates: [{ type: 'team', id: row.team_id }] },
        })
      session = undefined
    }
    if (!session) {
      const agentSession = one((await tx.query<{ id: string }>(
        `INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,state,state_reason,acknowledged_at,last_heartbeat_at,session_kind,coordination_connection_id)
         VALUES($1,$2,$3,$4,$5,'executing','coordination connection',now(),now(),'coordination',$6) RETURNING id`,
        [row.workspace_id,row.team_id,row.agent_id,row.agent_actor_id,row.delegation_id,row.id],
      )).rows)
      session = one((await tx.query<{ id: string; expires_at: Date; refreshed_at: Date | null }>(
        `INSERT INTO agent_coordination_sessions(agent_session_id,connection_id,workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,delegation_id,granted_capabilities,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '1 hour') RETURNING agent_session_id AS id,expires_at,refreshed_at`,
        [agentSession.id,row.id,row.workspace_id,row.team_id,row.agent_id,row.agent_actor_id,row.principal_human_actor_id,row.delegation_id,row.granted_capabilities],
      )).rows)
      await appendEvent(tx, {
        workspaceId: row.workspace_id, teamId: row.team_id, actorId: row.agent_actor_id,
        correlationId: `agent-connection:${row.id}:create:${agentSession.id}`,
        type: 'agent.session.created', aggregateType: 'agent_session', aggregateId: agentSession.id,
        revision: 1, sessionId: agentSession.id, sessionSequence: 0,
        payload: { delegationId: row.delegation_id, connectionId: row.id, sessionKind: 'coordination' },
        resources: { scopes: [{ type: 'team', id: row.team_id }], invalidates: [{ type: 'team', id: row.team_id }] },
      })
    }
    else if (session.expires_at.getTime() < Date.now() + 15 * 60_000)
      session = one((await tx.query<{ id: string; expires_at: Date; refreshed_at: Date | null }>("UPDATE agent_coordination_sessions SET expires_at=now()+interval '1 hour',refreshed_at=now(),updated_at=now() WHERE agent_session_id=$1 RETURNING agent_session_id AS id,expires_at,refreshed_at", [session.id])).rows)
    await tx.query('UPDATE agent_connections SET last_used_at=now(),updated_at=now() WHERE id=$1', [row.id])
    return {
      connection: response({ ...row, last_used_at: new Date() }), agent_actor_id: row.agent_actor_id,
      principal_human_actor_id: row.principal_human_actor_id, team_id: row.team_id,
      granted_capabilities: row.granted_capabilities,
      coordination_session: { id: session.id, connection_id: row.id, session_kind: 'coordination' as const, role: 'coordinator' as const, delegation_scope: 'team' as const, granted_capabilities: row.granted_capabilities, expires_at: session.expires_at.toISOString(), refreshed_at: session.refreshed_at?.toISOString() ?? null, team_id: row.team_id, principal_human_actor_id: row.principal_human_actor_id },
    }
  })
}
