import crypto from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import type { Pool } from 'pg'
import {
  routePolicyManifest,
  type ResourceResolverId,
  type RoutePolicyManifestEntry,
} from '@workmesh/contracts'
import {
  DomainError,
  evaluateRouteAuthorization,
  type AuthorizationStage,
} from '@workmesh/domain'
import type { ApiActor } from '../agent/types.js'

const policiesById = new Map(routePolicyManifest.map(policy => [policy.policyId, policy]))
const activeSessionStates = new Set([
  'acknowledged',
  'planning',
  'executing',
  'awaiting_input',
  'awaiting_approval',
  'blocked',
])

type AgentFacts = {
  id: string
  state: string
  parent_session_id: string | null
  team_id: string
  work_item_id: string | null
  project_id: string | null
  delegation_status: string
  capability_scope: {
    teamIds?: string[]
    workItemIds?: string[]
    projectIds?: string[]
  }
  permissions_snapshot: string[]
  definition_capabilities: string[]
  team_capabilities: string[] | null
  agent_active: boolean
}

const pathParams = (request: FastifyRequest): Record<string, unknown> =>
  request.params && typeof request.params === 'object'
    ? request.params as Record<string, unknown>
    : {}

const queryParams = (request: FastifyRequest): Record<string, unknown> =>
  request.query && typeof request.query === 'object'
    ? request.query as Record<string, unknown>
    : {}

export function policyForRequest(request: FastifyRequest): RoutePolicyManifestEntry {
  const policyId = request.routeOptions.config.workmeshPolicyId
  const policy = policyId ? policiesById.get(policyId) : undefined
  if (!policy) throw new DomainError('FORBIDDEN', 'The route has no registered authorization policy')
  return policy
}

async function resolveTeamId(
  db: Pool,
  request: FastifyRequest,
  resolver: ResourceResolverId,
): Promise<string | null> {
  const params = pathParams(request)
  const query = queryParams(request)
  const directTeamId = params.teamId ?? query.teamId
  if (typeof directTeamId === 'string') return directTeamId
  const id = params.id
  if (typeof id !== 'string') return null
  if (resolver === 'team') return id

  const tables: Partial<Record<ResourceResolverId, readonly [string, string, string]>> = {
    project: ['projects', 'id', 'team_id'],
    work_item: ['work_items', 'id', 'team_id'],
    agent_session: ['agent_sessions', 'id', 'team_id'],
    work_room: ['work_rooms', 'id', 'team_id'],
    repository: ['repositories', 'id', 'team_id'],
    automation: request.routeOptions.url?.includes('/loops')
      ? ['loops', 'id', 'team_id']
      : ['automation_rules', 'id', 'team_id'],
    template: ['templates', 'id', 'team_id'],
  }
  const table = tables[resolver]
  if (!table) return null
  const result = await db.query<{ team_id: string | null }>(
    `SELECT ${table[2]} AS team_id FROM ${table[0]}
     WHERE ${table[1]}=$1 AND workspace_id=$2`,
    [id, request.actor!.workspaceId],
  )
  return result.rows[0]?.team_id ?? null
}

async function humanTeamRole(
  db: Pool,
  actor: ApiActor,
  teamId: string | null,
): Promise<'admin' | 'maintainer' | 'member' | undefined> {
  if (actor.workspaceRole === 'admin') return 'admin'
  if (!teamId) {
    // Collection creates cannot inspect protected request bodies in preHandler.
    // Their command handlers must resolve and revalidate the body-owned Team in
    // the transaction; this value represents only the already-proved existence
    // of an active membership from identity resolution.
    return 'maintainer'
  }
  return (await db.query<{ role: 'admin' | 'maintainer' | 'member' }>(
    `SELECT m.role FROM memberships m
     JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id
     WHERE m.workspace_id=$1 AND m.team_id=$2 AND m.actor_id=$3
       AND t.deleted_at IS NULL`,
    [actor.workspaceId, teamId, actor.id],
  )).rows[0]?.role
}

async function loadAgentFacts(
  db: Pool,
  actor: ApiActor,
): Promise<AgentFacts | undefined> {
  if (!actor.agentSessionId) return undefined
  return (await db.query<AgentFacts>(
    `SELECT s.id,s.state,s.parent_session_id,s.team_id,s.work_item_id,s.project_id,
      d.status AS delegation_status,d.capability_scope,d.permissions_snapshot,
      a.approved_capabilities AS definition_capabilities,a.is_active AS agent_active,
      ata.approved_capabilities AS team_capabilities
     FROM agent_sessions s
     JOIN delegations d ON d.id=s.delegation_id
     JOIN agent_definitions a ON a.id=s.agent_id
     LEFT JOIN agent_team_access ata
       ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id
      AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
     WHERE s.id=$1 AND s.workspace_id=$2 AND s.agent_actor_id=$3`,
    [actor.agentSessionId, actor.workspaceId, actor.id],
  )).rows[0]
}

async function targetSessionBound(
  db: Pool,
  request: FastifyRequest,
  actor: ApiActor,
  resolver: ResourceResolverId,
): Promise<boolean> {
  if (resolver !== 'agent_session') return true
  const target = pathParams(request).id
  if (typeof target !== 'string' || !actor.agentSessionId) return true
  if (target === actor.agentSessionId) return true
  return Boolean((await db.query(
    `WITH RECURSIVE descendants(id) AS (
       SELECT id FROM agent_sessions
        WHERE parent_session_id=$1 AND workspace_id=$2
       UNION ALL
       SELECT child.id FROM agent_sessions child
       JOIN descendants parent ON child.parent_session_id=parent.id
        WHERE child.workspace_id=$2
     )
     SELECT 1 FROM descendants WHERE id=$3`,
    [actor.agentSessionId, actor.workspaceId, target],
  )).rowCount)
}

function resourceInScope(
  request: FastifyRequest,
  facts: AgentFacts,
  teamId: string | null,
): boolean {
  const params = pathParams(request)
  const query = queryParams(request)
  const scope = facts.capability_scope ?? {}
  if (!scope.teamIds?.includes(teamId ?? facts.team_id)) return false
  const workItemId = request.routeOptions.url?.includes('/work-items/')
    ? params.id
    : query.workItemId
  if (
    typeof workItemId === 'string'
    && !scope.workItemIds?.includes(workItemId)
  ) return false
  const projectId = request.routeOptions.url?.includes('/projects/')
    ? params.id
    : query.projectId
  if (
    typeof projectId === 'string'
    && !scope.projectIds?.includes(projectId)
  ) return false
  return true
}

function sessionActiveForOperation(state: string, operationId: string): boolean {
  if (operationId === 'acknowledgeAgentSession') return state === 'queued'
  if (operationId === 'acknowledgeAgentSessionStop') return state === 'stopping'
  return activeSessionStates.has(state)
}

export async function authorizeRequest(
  db: Pool,
  request: FastifyRequest,
  policy: RoutePolicyManifestEntry = policyForRequest(request),
): Promise<void> {
  if (
    policy.authentication === 'public'
    || policy.authentication === 'provider_signature'
  ) return
  const actor = request.actor
  if (!actor) throw new DomainError('UNAUTHENTICATED', 'An authenticated principal is required')
  const teamId = await resolveTeamId(db, request, policy.resourceResolverId)
  const agentFacts = actor.kind === 'agent' ? await loadAgentFacts(db, actor) : undefined
  const liveCapabilities = agentFacts
    ? agentFacts.permissions_snapshot.filter(capability =>
      agentFacts.definition_capabilities.includes(capability)
      && Boolean(agentFacts.team_capabilities?.includes(capability)))
    : []
  const installationTarget = policy.authentication === 'installation_target'
  const decision = evaluateRouteAuthorization(policy, {
    principalKind: actor.kind,
    workspaceRole: actor.workspaceRole,
    teamRole: actor.kind === 'human'
      ? await humanTeamRole(db, actor, teamId)
      : undefined,
    sessionBound: installationTarget
      ? actor.authentication === 'installation_target'
      : agentFacts
        ? await targetSessionBound(db, request, actor, policy.resourceResolverId)
        : false,
    sessionActive: agentFacts
      ? sessionActiveForOperation(agentFacts.state, policy.operationId)
      : false,
    delegationActive: agentFacts?.delegation_status === 'active'
      && agentFacts.agent_active
      && Boolean(agentFacts.team_capabilities),
    liveCapabilities,
    resourceInScope: installationTarget
      ? true
      : agentFacts
        ? resourceInScope(request, agentFacts, teamId)
        : false,
    // Approval and Lease are mutable command facts. The request pass only
    // identifies the route; command handlers revalidate them under lock.
    approvalValid: true,
    leaseValid: true,
    revisionPresent: request.headers['if-match'] !== undefined,
    idempotencyPresent: request.idempotencyKey !== undefined,
  })
  if (!decision.allowed) {
    throw new DomainError(decision.code, decision.reason, {
      authorizationStage: decision.stage,
      policyId: policy.policyId,
    })
  }
}

const authorizationCodes = new Set([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF_FAILED',
  'SESSION_SCOPE_DENIED',
  'SESSION_NOT_ACTIVE',
  'SESSION_STOPPED',
  'DELEGATION_NOT_ACTIVE',
  'CAPABILITY_DENIED',
  'RESOURCE_SCOPE_DENIED',
  'APPROVAL_REQUIRED',
  'LEASE_CONFLICT',
  'IF_MATCH_REQUIRED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'PROVIDER_SIGNATURE_INVALID',
  'FEATURE_DISABLED',
])

const stageForCode = (code: string): AuthorizationStage | 'handler' => {
  if (code === 'UNAUTHENTICATED' || code === 'CSRF_FAILED') return 'identity'
  if (code.startsWith('SESSION_')) return 'session'
  if (code.startsWith('DELEGATION_')) return 'delegation'
  if (code.startsWith('CAPABILITY_')) return 'capability'
  if (code.includes('SCOPE')) return 'resource_scope'
  if (code.startsWith('APPROVAL_')) return 'approval'
  if (code.startsWith('LEASE_')) return 'lease'
  if (code.startsWith('IF_MATCH') || code.includes('REVISION')) return 'revision'
  if (code.startsWith('IDEMPOTENCY')) return 'idempotency'
  if (code === 'FORBIDDEN') return 'human_role'
  return 'handler'
}

function keyedFingerprint(secret: string, value: unknown): string {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(value)).digest('hex')
}

export async function recordAuthorizationDenial(input: {
  db: Pool
  request: FastifyRequest
  error: DomainError
  auditSecret: string
}): Promise<void> {
  if (!authorizationCodes.has(input.error.code)) return
  let policy: RoutePolicyManifestEntry
  try {
    policy = policyForRequest(input.request)
  } catch {
    return
  }
  const params = pathParams(input.request)
  const resourceParts = Object.entries(params)
    .filter(([, value]) => typeof value === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
  const resourceFingerprint = resourceParts.length
    ? keyedFingerprint(input.auditSecret, resourceParts)
    : null
  const minute = new Date().toISOString().slice(0, 16)
  const dedupeKey = policy.operationId.includes('Heartbeat')
    || policy.operationId === 'heartbeatLease'
    || input.error.code === 'PROVIDER_SIGNATURE_INVALID'
    || input.error.code === 'FEATURE_DISABLED'
    ? keyedFingerprint(input.auditSecret, [
      input.request.actor?.id ?? null,
      input.request.actor?.agentSessionId ?? null,
      policy.policyId,
      input.error.code,
      resourceFingerprint,
      minute,
    ])
    : null
  const details = input.error.details as {
    authorizationStage?: AuthorizationStage
  } | undefined

  await input.db.query(
    `INSERT INTO authorization_denials(
      correlation_id,policy_id,operation_id,transport,principal_kind,
      principal_actor_id,principal_session_id,workspace_id,route_template,
      reason_code,authorization_stage,resource_fingerprint,dedupe_key
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT DO NOTHING`,
    [
      input.request.id,
      policy.policyId,
      policy.operationId,
      policy.bindings.sse ? 'sse' : 'rest',
      input.request.actor?.kind ?? null,
      input.request.actor?.id ?? null,
      input.request.actor?.agentSessionId ?? null,
      input.request.actor?.workspaceId ?? null,
      policy.path,
      input.error.code,
      details?.authorizationStage ?? stageForCode(input.error.code),
      resourceFingerprint,
      dedupeKey,
    ],
  )
}
