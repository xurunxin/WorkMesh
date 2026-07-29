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

type TeamResolution =
  | { kind: 'none' }
  | { kind: 'resolved'; teamId: string | null }
  | { kind: 'unresolved' }

type ExplicitResourceKind =
  | 'workspace'
  | 'team'
  | 'project'
  | 'work_item'
  | 'comment'
  | 'agent_definition'
  | 'delegation'
  | 'agent_session'
  | 'artifact'
  | 'artifact_upload_intent'
  | 'approval'
  | 'work_room'
  | 'room_message'
  | 'inbox_item'
  | 'lease'
  | 'handoff'
  | 'decision'
  | 'repository'
  | 'provider_connection'
  | 'provider_action'
  | 'pull_request'
  | 'automation_rule'
  | 'automation_run'
  | 'loop'
  | 'template'
  | 'a2a_binding'

const resourceSegments: Readonly<Record<string, {
  kind: ExplicitResourceKind
  resolver: ResourceResolverId
}>> = {
  workspaces: { kind: 'workspace', resolver: 'workspace' },
  teams: { kind: 'team', resolver: 'team' },
  projects: { kind: 'project', resolver: 'project' },
  'work-items': { kind: 'work_item', resolver: 'work_item' },
  comments: { kind: 'comment', resolver: 'comment' },
  agents: { kind: 'agent_definition', resolver: 'agent_definition' },
  delegations: { kind: 'delegation', resolver: 'delegation' },
  'agent-sessions': { kind: 'agent_session', resolver: 'agent_session' },
  artifacts: { kind: 'artifact', resolver: 'artifact' },
  'artifact-upload-intents': { kind: 'artifact_upload_intent', resolver: 'artifact' },
  approvals: { kind: 'approval', resolver: 'approval' },
  rooms: { kind: 'work_room', resolver: 'work_room' },
  messages: { kind: 'room_message', resolver: 'work_room' },
  inbox: { kind: 'inbox_item', resolver: 'inbox_item' },
  leases: { kind: 'lease', resolver: 'lease' },
  handoffs: { kind: 'handoff', resolver: 'handoff' },
  decisions: { kind: 'decision', resolver: 'decision' },
  repositories: { kind: 'repository', resolver: 'repository' },
  'provider-connections': { kind: 'provider_connection', resolver: 'provider_connection' },
  'provider-webhooks': { kind: 'provider_connection', resolver: 'provider_connection' },
  'provider-actions': { kind: 'provider_action', resolver: 'provider_action' },
  'pull-requests': { kind: 'pull_request', resolver: 'pull_request' },
  'automation-rules': { kind: 'automation_rule', resolver: 'automation' },
  'automation-runs': { kind: 'automation_run', resolver: 'automation' },
  loops: { kind: 'loop', resolver: 'automation' },
  templates: { kind: 'template', resolver: 'template' },
  'a2a-bindings': { kind: 'a2a_binding', resolver: 'a2a_binding' },
}

function explicitResourceTarget(
  request: FastifyRequest,
  resolver: ResourceResolverId,
): { kind: ExplicitResourceKind; id: string } | null {
  const params = pathParams(request)
  const segments = (request.routeOptions.url ?? '').split('/').filter(Boolean)
  const candidates: Array<{
    kind: ExplicitResourceKind
    resolver: ResourceResolverId
    id: string
  }> = []
  for (let index = 1; index < segments.length; index += 1) {
    const parameter = segments[index]
    const resource = resourceSegments[segments[index - 1]!]
    if (!parameter?.startsWith(':') || !resource) continue
    const value = params[parameter.slice(1)]
    if (typeof value === 'string') candidates.push({ ...resource, id: value })
  }
  const target = candidates.filter(candidate => candidate.resolver === resolver).at(-1)
    ?? candidates[0]
  return target ? { kind: target.kind, id: target.id } : null
}

function resourceTeamSql(kind: ExplicitResourceKind): string {
  switch (kind) {
    case 'workspace': return 'SELECT NULL::uuid AS team_id FROM workspaces WHERE id=$1 AND id=$2'
    case 'team': return 'SELECT id AS team_id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL'
    case 'project': return 'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL'
    case 'work_item': return 'SELECT team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL'
    case 'comment': return 'SELECT w.team_id FROM comments c JOIN channels ch ON ch.id=c.channel_id JOIN work_items w ON w.id=ch.work_item_id AND w.workspace_id=ch.workspace_id WHERE c.id=$1 AND ch.workspace_id=$2 AND c.deleted_at IS NULL AND w.deleted_at IS NULL'
    case 'agent_definition': return 'SELECT NULL::uuid AS team_id FROM agent_definitions WHERE id=$1 AND workspace_id=$2'
    case 'delegation': return 'SELECT team_id FROM delegations WHERE id=$1 AND workspace_id=$2'
    case 'agent_session': return 'SELECT team_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2'
    case 'artifact': return 'SELECT s.team_id FROM artifacts a JOIN agent_sessions s ON s.id=a.session_id AND s.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2'
    case 'artifact_upload_intent': return 'SELECT w.team_id FROM artifact_upload_intents i JOIN work_items w ON w.id=i.work_item_id AND w.workspace_id=i.workspace_id WHERE i.id=$1 AND i.workspace_id=$2 AND w.deleted_at IS NULL'
    case 'approval': return 'SELECT s.team_id FROM approvals a JOIN agent_sessions s ON s.id=a.session_id AND s.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2'
    case 'work_room': return 'SELECT team_id FROM work_room_channels WHERE id=$1 AND workspace_id=$2'
    case 'room_message': return 'SELECT c.team_id FROM room_messages m JOIN work_room_channels c ON c.id=m.channel_id AND c.workspace_id=m.workspace_id WHERE m.id=$1 AND m.workspace_id=$2'
    case 'inbox_item': return 'SELECT team_id FROM inbox_items WHERE id=$1 AND workspace_id=$2'
    case 'lease': return 'SELECT s.team_id FROM leases l JOIN agent_sessions s ON s.id=l.session_id AND s.workspace_id=l.workspace_id WHERE l.id=$1 AND l.workspace_id=$2'
    case 'handoff': return 'SELECT s.team_id FROM handoffs h JOIN agent_sessions s ON s.id=h.from_session_id AND s.workspace_id=h.workspace_id WHERE h.id=$1 AND h.workspace_id=$2'
    case 'decision': return 'SELECT COALESCE(w.team_id,p.team_id,s.team_id) AS team_id FROM decisions d LEFT JOIN work_items w ON w.id=d.work_item_id AND w.workspace_id=d.workspace_id LEFT JOIN projects p ON p.id=d.project_id AND p.workspace_id=d.workspace_id LEFT JOIN agent_sessions s ON s.id=d.session_id AND s.workspace_id=d.workspace_id WHERE d.id=$1 AND d.workspace_id=$2'
    case 'repository': return 'SELECT team_id FROM repositories WHERE id=$1 AND workspace_id=$2'
    case 'provider_connection': return 'SELECT NULL::uuid AS team_id FROM provider_connections WHERE id=$1 AND workspace_id=$2'
    case 'provider_action': return 'SELECT r.team_id FROM provider_actions a JOIN repositories r ON r.id=a.repository_id AND r.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2'
    case 'pull_request': return 'SELECT r.team_id FROM pull_request_projections p JOIN repositories r ON r.id=p.repository_id AND r.workspace_id=p.workspace_id WHERE p.id=$1 AND p.workspace_id=$2'
    case 'automation_rule': return 'SELECT team_id FROM automation_rules WHERE id=$1 AND workspace_id=$2'
    case 'automation_run': return 'SELECT team_id FROM automation_runs WHERE id=$1 AND workspace_id=$2'
    case 'loop': return 'SELECT team_id FROM loops WHERE id=$1 AND workspace_id=$2'
    case 'template': return 'SELECT team_id FROM templates WHERE id=$1 AND workspace_id=$2'
    case 'a2a_binding': return 'SELECT NULL::uuid AS team_id FROM a2a_agent_bindings WHERE id=$1 AND workspace_id=$2'
  }
}

async function resolveTeam(
  db: Pool,
  request: FastifyRequest,
  resolver: ResourceResolverId,
  operationId: string,
): Promise<TeamResolution> {
  const params = pathParams(request)
  const query = queryParams(request)
  const directTeamId = params.teamId ?? query.teamId
  const target = explicitResourceTarget(request, resolver)
    ?? (typeof directTeamId === 'string'
      ? { kind: 'team' as const, id: directTeamId }
      : null)
  if (!target) return { kind: 'none' }
  if (target.kind === 'inbox_item') {
    const actor = request.actor!
    const agentSessionId = actor.kind === 'agent' ? actor.agentSessionId : undefined
    const claim = operationId === 'claimInboxItem'
    const result = await db.query<{ team_id: string | null }>(
      `SELECT team_id
         FROM inbox_items
        WHERE id=$1 AND workspace_id=$2
          AND (
            ($3='human' AND recipient_human_actor_id=$4)
            OR (
              $3='agent'
              AND $5::uuid IS NOT NULL
              AND (
                recipient_session_id=$5
                OR claimed_by_session_id=$5
                OR (
                  $6::boolean
                  AND recipient_human_actor_id IS NULL
                  AND recipient_actor_id=$4
                  AND recipient_session_id IS NULL
                  AND claimed_by_session_id IS NULL
                  AND status='open'
                )
              )
            )
          )`,
      [
        target.id,
        actor.workspaceId,
        actor.kind,
        actor.id,
        agentSessionId ?? null,
        claim,
      ],
    )
    if (!result.rows[0]) return { kind: 'unresolved' }
    return { kind: 'resolved', teamId: result.rows[0].team_id }
  }
  const result = await db.query<{ team_id: string | null }>(
    resourceTeamSql(target.kind),
    [target.id, request.actor!.workspaceId],
  )
  if (!result.rows[0]) return { kind: 'unresolved' }
  return {
    kind: 'resolved',
    teamId: result.rows[0].team_id,
  }
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
  // Heartbeats remain an authenticated diagnostic projection after stop, stale, or terminal state.
  // The command gate revalidates exact Session authority under lock and cannot restore execution.
  if (operationId === 'heartbeatAgentSession') return true
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
  if (policy.authentication === 'bootstrap') {
    if (request.bootstrapAuthorization) return
    throw new DomainError('UNAUTHENTICATED', 'Bootstrap authentication failed', {
      authorizationStage: 'identity',
      policyId: policy.policyId,
      suppressAuthorizationDenial: true,
      bootstrapAuthenticationFailure: true,
    })
  }
  const actor = request.actor
  if (!actor) throw new DomainError('UNAUTHENTICATED', 'An authenticated principal is required')
  if (!policy.actorKinds.includes(actor.kind)) {
    throw new DomainError('FORBIDDEN', 'The authenticated principal kind is not allowed for this route', {
      authorizationStage: 'identity',
      policyId: policy.policyId,
    })
  }
  const teamResolution = await resolveTeam(
    db,
    request,
    policy.resourceResolverId,
    policy.operationId,
  )
  if (teamResolution.kind === 'unresolved') {
    throw new DomainError('NOT_FOUND', 'Resource not found', {
      authorizationStage: 'resource_scope',
      dedupeAuthorizationDenial: true,
      policyId: policy.policyId,
    })
  }
  const teamId = teamResolution.kind === 'resolved' ? teamResolution.teamId : null
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
  const details = input.error.details as {
    authorizationStage?: AuthorizationStage
    dedupeAuthorizationDenial?: boolean
    suppressAuthorizationDenial?: boolean
  } | undefined
  if (details?.suppressAuthorizationDenial) return
  const concealedAuthorizationNotFound = input.error.code === 'NOT_FOUND'
    && details?.authorizationStage === 'resource_scope'
  if (!authorizationCodes.has(input.error.code) && !concealedAuthorizationNotFound) return
  let policy: RoutePolicyManifestEntry
  try {
    policy = policyForRequest(input.request)
  } catch {
    return
  }
  const params = pathParams(input.request)
  const query = queryParams(input.request)
  const resourceParts = [
    ...Object.entries(params),
    ...(typeof query.teamId === 'string' && typeof params.teamId !== 'string'
      ? [['teamId', query.teamId] as const]
      : []),
  ]
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
    || details?.dedupeAuthorizationDenial === true
    ? keyedFingerprint(input.auditSecret, [
      input.request.actor?.id ?? null,
      input.request.actor?.agentSessionId ?? null,
      policy.policyId,
      input.error.code,
      resourceFingerprint,
      minute,
    ])
    : null
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
