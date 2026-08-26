import { createHash, randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  agentExecutionCapacitySqlPredicate,
  appendEvent,
  assertAgentExecutionCapacityAfterLock,
  lockAgentAuthorityPlan,
  withTx,
} from '@workmesh/db'
import { DomainError, assertRevision, inheritChildBudget, parseRevision } from '@workmesh/domain'
import { acquireLeaseInputSchema, assignmentProposalInputSchema, contextDeltaInputSchema, decisionInputSchema, handoffInputSchema, handoffRejectInputSchema, roomMessageInputSchema } from '@workmesh/contracts'
import { mutate, type CommandContext } from '../commands.js'
import { isHeartbeatReplay, recordHeartbeatKey } from '../heartbeat-idempotency.js'
import {
  lockExecutionInstallationAuthorities,
  locateExecutionInstallationAuthority,
  provisionNewSessionDelivery,
  queueWebhookDeliveries,
  type ExecutionInstallationAuthority,
} from '../agent/commands.js'
import {
  assertAgentWrite,
  authorizeCommandInTx,
  loadAgentSessionForMutation,
  revalidateLockedAgentSessionForMutation,
  type AgentSessionAuthorityLocator,
} from '../agent/guard.js'
import type { ApiActor, RequestMeta } from '../agent/types.js'
import type { Paginator } from '../pagination.js'
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from '../live-read-authorization.js'
import { readGuidance } from '../guidance.js'

type Helpers = { db: Pool; meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta; header: (request: FastifyRequest, name: string) => string | undefined; readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>; paginator: Paginator }
type Subject = 'work_item' | 'project' | 'session'
const uuid = z.string().uuid()
const actor = (request: FastifyRequest) => request.actor as unknown as ApiActor
const id = (request: FastifyRequest) => uuid.parse((request.params as { id?: unknown }).id)
const command = <T>(db: Pool, meta: RequestMeta, fn: (tx: PoolClient) => Promise<T>) => mutate(db, meta as unknown as CommandContext, fn)
const leaseResponse = <T extends { version: number }>(lease: T): T & { revision: number } => ({
  ...lease,
  revision: lease.version,
})

async function session(tx: PoolClient, workspaceId: string, id: string) {
  const row = (await tx.query<{ id:string; workspace_id:string; team_id:string; work_item_id:string|null; work_item_exists:boolean; work_item_project_id:string|null; project_id:string|null; project_exists:boolean; plan_step_id:string|null; plan_step_version_id:string|null; current_plan_version_id:string|null; context_snapshot_id:string|null; parent_session_id:string|null; delegation_id:string; agent_id:string; agent_actor_id:string; budget:Record<string, unknown>; max_child_sessions:number; state:string; revision:number }>(
    `SELECT current_session.id,current_session.workspace_id,current_session.team_id,
            current_session.work_item_id,
            live_work_item.id IS NOT NULL AS work_item_exists,
            live_work_item_project.id AS work_item_project_id,
            current_session.project_id,
            live_session_project.id IS NOT NULL AS project_exists,
            current_session.plan_step_id,
            current_session.plan_step_version_id,
            current_session.current_plan_version_id,
            current_session.context_snapshot_id,
            current_session.parent_session_id,current_session.delegation_id,
            current_session.agent_id,current_session.agent_actor_id,
            current_session.budget,current_session.max_child_sessions,
            current_session.state,current_session.revision
       FROM agent_sessions current_session
       LEFT JOIN work_items live_work_item
         ON live_work_item.id=current_session.work_item_id
        AND live_work_item.workspace_id=current_session.workspace_id
        AND live_work_item.deleted_at IS NULL
       LEFT JOIN projects live_work_item_project
         ON live_work_item_project.id=live_work_item.project_id
        AND live_work_item_project.workspace_id=current_session.workspace_id
        AND live_work_item_project.deleted_at IS NULL
       LEFT JOIN projects live_session_project
         ON live_session_project.id=current_session.project_id
        AND live_session_project.workspace_id=current_session.workspace_id
        AND live_session_project.deleted_at IS NULL
      WHERE current_session.id=$1 AND current_session.workspace_id=$2`,
    [id, workspaceId],
  )).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Agent session not found')
  return row
}
async function assertSessionWrite(tx: PoolClient, current: ApiActor, sessionId: string) {
  if (current.kind === 'agent') {
    const authority = await loadAgentSessionForMutation(tx, current, sessionId)
    assertAgentWrite({
      actor: current,
      session: authority,
      sessionId,
      capability: 'work:write',
      operation: 'activity',
      idempotencyKey: 'collaboration-live-authority',
    })
  }
  const row = await session(tx, current.workspaceId, sessionId)
  if (current.kind !== 'agent') await assertHumanTeam(tx,current,row.team_id)
  return row
}

type LockedCollaborationSessionTargets = Readonly<{
  installationAuthorities: ReadonlyMap<string, ExecutionInstallationAuthority>
}>

async function lockCollaborationSessionTargets(
  tx: PoolClient,
  current: ApiActor,
  sourceSessionId: string,
  targetAgentIds: readonly string[],
): Promise<LockedCollaborationSessionTargets> {
  const source = (await tx.query<{
    agent_id: string
    delegation_id: string
    team_id: string
    work_item_id: string | null
    project_id: string | null
    work_item_project_id: string | null
    principal_human_actor_id: string
    session_token_id: string | null
    installation_token_id: string | null
  }>(
    `SELECT session.agent_id,session.delegation_id,session.team_id,
            session.work_item_id,session.project_id,item.project_id AS work_item_project_id,
            delegation.principal_human_actor_id,
            credential.id AS session_token_id,credential.installation_token_id
       FROM agent_sessions session
       JOIN delegations delegation ON delegation.id=session.delegation_id
       LEFT JOIN work_items item ON item.id=session.work_item_id
       LEFT JOIN agent_session_tokens credential
         ON credential.session_id=session.id
        AND credential.token_hash=$3
      WHERE session.id=$1 AND session.workspace_id=$2`,
    [sourceSessionId,current.workspaceId,current.credentialHash ?? null],
  )).rows[0]
  if (!source) throw new DomainError('NOT_FOUND','Source Agent Session not found')
  const targets=[...new Set(targetAgentIds)]
  const targetSessionIds=targets.length
    ? (await tx.query<{id:string}>(
        `SELECT id FROM agent_sessions session
          WHERE session.agent_id=ANY($1::uuid[])
            AND session.workspace_id=$2
            AND ${agentExecutionCapacitySqlPredicate('session')}`,
        [targets,current.workspaceId],
      )).rows.map(row=>row.id)
    : []
  const installationAuthorities = new Map<string, ExecutionInstallationAuthority>()
  for (const agentId of targets) {
    const authority = await locateExecutionInstallationAuthority(tx, {
      agentId,
      teamId: source.team_id,
      principalHumanActorId: source.principal_human_actor_id,
    })
    if (authority) installationAuthorities.set(agentId, authority)
  }
  const sourceInstallationAuthority = source.installation_token_id
    ? await locateExecutionInstallationAuthority(tx, {
        agentId: source.agent_id,
        teamId: source.team_id,
        principalHumanActorId: source.principal_human_actor_id,
        installationTokenId: source.installation_token_id,
      })
    : undefined
  if (current.kind === 'agent' && source.installation_token_id && !sourceInstallationAuthority)
    throw new DomainError(
      'DELEGATION_NOT_ACTIVE',
      'Source Session installation authority is no longer active',
    )
  await lockExecutionInstallationAuthorities(tx, [
    ...(sourceInstallationAuthority ? [sourceInstallationAuthority] : []),
    ...installationAuthorities.values(),
  ])
  await lockAgentAuthorityPlan(tx,{
    definitionIds:[source.agent_id,...targets],
    teamGrants:[source.agent_id,...targets].map(agentId=>({
      workspaceId:current.workspaceId,
      agentId,
      teamId:source.team_id,
    })),
    delegationIds:[
      source.delegation_id,
      ...[...installationAuthorities.values()].flatMap(authority =>
        authority.connection_delegation_id
          ? [authority.connection_delegation_id]
          : []),
    ],
    sessionIds:[sourceSessionId,...targetSessionIds],
    sessionTokenIds:source.session_token_id?[source.session_token_id]:[],
    installationTokenIds:[
      ...(source.installation_token_id?[source.installation_token_id]:[]),
      ...[...installationAuthorities.values()].map(authority => authority.id),
    ],
    workItemIds:source.work_item_id?[source.work_item_id]:[],
    projectIds:[
      ...(source.project_id?[source.project_id]:[]),
      ...(source.work_item_project_id?[source.work_item_project_id]:[]),
    ],
  })
  return { installationAuthorities }
}
function assertDecisionSubjectInSessionScope(
  currentSession: {
    id: string
    work_item_id: string | null
    work_item_exists: boolean
    work_item_project_id: string | null
    project_id: string | null
    project_exists: boolean
  },
  subject: Subject,
  subjectId: string,
): void {
  const inScope = subject === 'session'
    ? currentSession.id === subjectId
    : subject === 'work_item'
      ? currentSession.work_item_id === subjectId && currentSession.work_item_exists
      : currentSession.work_item_id
        ? currentSession.work_item_project_id === subjectId
        : currentSession.project_id === subjectId && currentSession.project_exists
  if (!inScope) throw new DomainError('RESOURCE_SCOPE_DENIED', 'Decision subject is outside the current live Session scope')
}
async function assertSessionMessageWrite(
  tx: PoolClient,
  current: ApiActor,
  sessionId: string,
  intent: string,
  idempotencyKey: string,
  authorityLocator?: AgentSessionAuthorityLocator,
) {
  const row = await session(tx, current.workspaceId, sessionId)
  if (current.kind !== 'agent') return row
  const reviewResult = intent === 'review_result'
  if (!authorityLocator) {
    throw new DomainError(
      'AGENT_SESSION_NOT_FOUND',
      'The merged Room authority plan did not include the source Session',
    )
  }
  const authority = await revalidateLockedAgentSessionForMutation(
    tx,
    current,
    sessionId,
    authorityLocator,
  )
  assertAgentWrite({
    actor: current,
    session: authority,
    sessionId,
    capability: reviewResult ? 'artifact:write' : 'work:write',
    operation: 'room_message',
    idempotencyKey,
  })
  if (reviewResult) {
    const delegation = (await tx.query<{ role:string }>(
      'SELECT role FROM delegations WHERE id=$1',
      [row.delegation_id],
    )).rows[0]
    if (delegation?.role !== 'reviewer') throw new DomainError('CAPABILITY_DENIED', 'Review results require a reviewer delegation with artifact:write')
  }
  return row
}
async function assertLeaseResourceScope(tx: PoolClient, current: ApiActor, s: Awaited<ReturnType<typeof session>>, resourceType: 'work_item' | 'plan_step', resourceId: string) {
  if (resourceType === 'work_item') {
    if (s.work_item_id !== resourceId) throw new DomainError('RESOURCE_SCOPE_DENIED', 'Work-item lease must match the session work item')
    return
  }
  const delegation = (await tx.query<{ scope_type:string; scope_id:string }>('SELECT scope_type,scope_id FROM delegations WHERE id=$1', [s.delegation_id])).rows[0]
  if (delegation?.scope_type === 'plan_step' && delegation.scope_id === resourceId) return
  const allowed = await tx.query('SELECT 1 FROM agent_plan_steps ps JOIN agent_plan_versions pv ON pv.id=ps.plan_version_id WHERE ps.id=$1 AND (pv.id=$2 OR pv.id=(SELECT current_plan_version_id FROM agent_sessions WHERE id=$3))', [resourceId, s.current_plan_version_id, s.parent_session_id ?? s.id])
  if (!allowed.rowCount) throw new DomainError('RESOURCE_SCOPE_DENIED', 'Plan-step lease is outside the session plan scope')
}
async function assertHumanTeam(tx: PoolClient, current: ApiActor, teamId: string) {
  if (current.kind !== 'human') throw new DomainError('FORBIDDEN', 'Human authorization is required')
  if (current.workspaceRole === 'admin') return
  const found = await tx.query('SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3', [current.workspaceId, teamId, current.id])
  if (!found.rowCount) throw new DomainError('FORBIDDEN', 'Team membership is required')
}

type RoomMessageAuthorityLocator = {
  channel: {
    id: string
    team_id: string
    subject_kind: Subject
    subject_id: string
  }
  actorDefinitionIds: Map<string,string>
  sourceSession?: AgentSessionAuthorityLocator
}

async function lockRoomMessageAuthorityPlan(
  tx: PoolClient,
  current: ApiActor,
  channelId: string,
  sourceSessionId: string | undefined,
  recipientActorIds: readonly string[],
  recipientSessionIds: readonly string[],
): Promise<RoomMessageAuthorityLocator> {
  const channel = (await tx.query<RoomMessageAuthorityLocator['channel']>(
    `SELECT id,team_id,subject_kind,subject_id
       FROM work_room_channels
      WHERE id=$1 AND workspace_id=$2`,
    [channelId,current.workspaceId],
  )).rows[0]
  if (!channel) throw new DomainError('NOT_FOUND','Room not found')

  const recipientActors = recipientActorIds.length
    ? (await tx.query<{actor_id:string;kind:'human'|'agent';definition_id:string|null}>(
        `SELECT recipient.id AS actor_id,recipient.kind,definition.id AS definition_id
           FROM actors recipient
           LEFT JOIN agent_definitions definition
             ON definition.actor_id=recipient.id
            AND definition.workspace_id=recipient.workspace_id
          WHERE recipient.workspace_id=$1
            AND recipient.id=ANY($2::uuid[])
          ORDER BY recipient.id`,
        [current.workspaceId,[...recipientActorIds]],
      )).rows
    : []
  const actorDefinitionIds = new Map<string,string>()
  for (const recipient of recipientActors) {
    if (recipient.kind==='agent'&&recipient.definition_id)
      actorDefinitionIds.set(recipient.actor_id,recipient.definition_id)
  }

  const sessionIds=new Set<string>(recipientSessionIds)
  if(sourceSessionId) sessionIds.add(sourceSessionId)
  if(channel.subject_kind==='session') sessionIds.add(channel.subject_id)
  const recipientAgentIds=[...actorDefinitionIds.values()]
  if(recipientAgentIds.length) {
    const candidateSessions=(await tx.query<{id:string}>(
      `SELECT id FROM agent_sessions
        WHERE workspace_id=$1 AND agent_id=ANY($2::uuid[])
        ORDER BY id`,
      [current.workspaceId,recipientAgentIds],
    )).rows
    for(const candidate of candidateSessions) sessionIds.add(candidate.id)
  }

  const sessions=sessionIds.size
    ? (await tx.query<{
        id:string
        agent_id:string
        delegation_id:string
        team_id:string
        work_item_id:string|null
        project_id:string|null
        work_item_project_id:string|null
        session_token_id:string|null
        installation_token_id:string|null
      }>(
        `SELECT session.id,session.agent_id,session.delegation_id,session.team_id,
                session.work_item_id,session.project_id,
                item.project_id AS work_item_project_id,
                credential.id AS session_token_id,
                credential.installation_token_id
           FROM agent_sessions session
           LEFT JOIN work_items item
             ON item.id=session.work_item_id
            AND item.workspace_id=session.workspace_id
           LEFT JOIN agent_session_tokens credential
             ON credential.session_id=session.id
            AND session.id=$3
            AND credential.token_hash=$4
          WHERE session.workspace_id=$1
            AND session.id=ANY($2::uuid[])
          ORDER BY session.id`,
        [
          current.workspaceId,
          [...sessionIds],
          sourceSessionId??null,
          current.kind==='agent'?(current.credentialHash??null):null,
        ],
      )).rows
    : []
  const sessionById=new Map(sessions.map(row=>[row.id,row]))
  if(sourceSessionId&&!sessionById.has(sourceSessionId))
    throw new DomainError('NOT_FOUND','Source Agent Session not found')
  for(const exactSessionId of recipientSessionIds) {
    if(!sessionById.has(exactSessionId))
      throw new DomainError(
        'MESSAGE_RECIPIENT_OUT_OF_SCOPE',
        'Exact Session recipient is unavailable or outside this Work Room',
      )
  }

  let subjectWorkItemId:string|null=null
  let subjectProjectId:string|null=null
  if(channel.subject_kind==='work_item') {
    const item=(await tx.query<{project_id:string|null}>(
      'SELECT project_id FROM work_items WHERE id=$1 AND workspace_id=$2',
      [channel.subject_id,current.workspaceId],
    )).rows[0]
    subjectWorkItemId=channel.subject_id
    subjectProjectId=item?.project_id??null
  } else if(channel.subject_kind==='project') {
    subjectProjectId=channel.subject_id
  }

  const definitions=new Set(recipientAgentIds)
  const delegations=new Set<string>()
  const grants=new Map<string,{workspaceId:string;agentId:string;teamId:string}>()
  const workItems=new Set<string>()
  const projects=new Set<string>()
  const sessionTokens=new Set<string>()
  const installationTokens=new Set<string>()
  for(const target of sessions) {
    definitions.add(target.agent_id)
    delegations.add(target.delegation_id)
    grants.set(
      `${current.workspaceId}:${target.agent_id}:${target.team_id}`,
      {workspaceId:current.workspaceId,agentId:target.agent_id,teamId:target.team_id},
    )
    if(target.work_item_id) workItems.add(target.work_item_id)
    if(target.project_id) projects.add(target.project_id)
    if(target.work_item_project_id) projects.add(target.work_item_project_id)
    if(target.session_token_id) sessionTokens.add(target.session_token_id)
    if(target.installation_token_id) installationTokens.add(target.installation_token_id)
  }
  for(const agentId of recipientAgentIds) {
    grants.set(
      `${current.workspaceId}:${agentId}:${channel.team_id}`,
      {workspaceId:current.workspaceId,agentId,teamId:channel.team_id},
    )
  }
  if(subjectWorkItemId) workItems.add(subjectWorkItemId)
  if(subjectProjectId) projects.add(subjectProjectId)
  await lockAgentAuthorityPlan(tx,{
    definitionIds:[...definitions],
    teamGrants:[...grants.values()],
    delegationIds:[...delegations],
    sessionIds:[...sessionIds],
    sessionTokenIds:[...sessionTokens],
    installationTokenIds:[...installationTokens],
    workItemIds:[...workItems],
    projectIds:[...projects],
  })
  return {
    channel,
    actorDefinitionIds,
    sourceSession:sourceSessionId?sessionById.get(sourceSessionId):undefined,
  }
}

async function authorizeActorRecipient(
  tx: PoolClient,
  current: ApiActor,
  teamId: string,
  subjectKind: Subject,
  subjectId: string,
  recipientId: string,
  locatorDefinitionId?: string,
): Promise<string | undefined> {
  const recipient = (await tx.query<{ kind:'human'|'agent'; is_active:boolean }>(
    `SELECT kind,is_active FROM actors
      WHERE id=$1 AND workspace_id=$2`,
    [recipientId, current.workspaceId],
  )).rows[0]
  if (!recipient?.is_active) {
    throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Message recipient is unavailable')
  }
  if (recipient.kind === 'human') {
    const allowed = await tx.query(
      `SELECT 1 FROM actors recipient
        WHERE recipient.id=$1 AND recipient.workspace_id=$2
          AND (
            recipient.workspace_role='admin'
            OR EXISTS (
              SELECT 1 FROM memberships membership
               WHERE membership.workspace_id=recipient.workspace_id
                 AND membership.team_id=$3
                 AND membership.actor_id=recipient.id
            )
          )`,
      [recipientId, current.workspaceId, teamId],
    )
    if (!allowed.rowCount) {
      throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Message recipient lacks active Team access')
    }
    return undefined
  }
  const definition = (await tx.query<{ id:string }>(
    `SELECT id FROM agent_definitions
      WHERE actor_id=$1 AND workspace_id=$2 AND is_active
        AND 'work:read'=ANY(approved_capabilities)`,
    [recipientId, current.workspaceId],
  )).rows[0]
  if (!definition || definition.id!==locatorDefinitionId) {
    throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Agent recipient is unavailable')
  }
  const teamAccess = await tx.query(
    `SELECT 1 FROM agent_team_access
      WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3
        AND revoked_at IS NULL
        AND 'work:read'=ANY(approved_capabilities)`,
    [current.workspaceId, definition.id, teamId],
  )
  if (!teamAccess.rowCount) {
    throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Agent recipient lacks active Team access')
  }
  const eligible = await tx.query(
    `SELECT 1
       FROM delegations delegation
       JOIN agent_sessions target_session
         ON target_session.delegation_id=delegation.id
        AND target_session.workspace_id=delegation.workspace_id
      WHERE delegation.workspace_id=$1
        AND delegation.agent_id=$2
        AND delegation.status='active'
        AND target_session.agent_actor_id=$3
        AND target_session.team_id=$4
        AND target_session.state IN(
          'acknowledged','planning','executing',
          'awaiting_input','awaiting_approval','blocked'
        )
        AND 'work:read'=ANY(delegation.permissions_snapshot)
        AND COALESCE(delegation.capability_scope->'teamIds','[]'::jsonb)
            ? target_session.team_id::text
        AND (
          (
            $5='work_item'
            AND target_session.work_item_id=$6
            AND EXISTS (
              SELECT 1 FROM work_items target_work_item
               WHERE target_work_item.id=target_session.work_item_id
                 AND target_work_item.workspace_id=$1
                 AND target_work_item.deleted_at IS NULL
            )
            AND COALESCE(delegation.capability_scope->'workItemIds','[]'::jsonb)
                ? target_session.work_item_id::text
          )
          OR (
            $5='project'
            AND EXISTS (
              SELECT 1 FROM projects target_project
               WHERE target_project.id=$6
                 AND target_project.workspace_id=$1
                 AND target_project.deleted_at IS NULL
            )
            AND (
              (
                target_session.work_item_id IS NOT NULL
                AND COALESCE(
                  delegation.capability_scope->'workItemIds',
                  '[]'::jsonb
                ) ? target_session.work_item_id::text
                AND EXISTS (
                  SELECT 1 FROM work_items target_work_item
                   WHERE target_work_item.id=target_session.work_item_id
                     AND target_work_item.workspace_id=$1
                     AND target_work_item.project_id=$6
                     AND target_work_item.deleted_at IS NULL
                )
              )
              OR (
                target_session.work_item_id IS NULL
                AND target_session.project_id=$6
                AND COALESCE(
                  delegation.capability_scope->'projectIds',
                  '[]'::jsonb
                ) ? $6::text
              )
            )
          )
      )
      ORDER BY target_session.id
      LIMIT 1`,
    [current.workspaceId, definition.id, recipientId, teamId, subjectKind, subjectId],
  )
  if (!eligible.rowCount) {
    throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Agent recipient has no active in-scope Session')
  }
  return definition.id
}
async function assertExactHandoffTargetAccess(tx: PoolClient, workspaceId: string, teamId: string, targetAgentId: string, requiredCapabilities: string[]) {
  const found = await tx.query(
    `SELECT 1
       FROM agent_definitions a
       JOIN agent_team_access ata ON ata.workspace_id=a.workspace_id AND ata.agent_id=a.id
      WHERE a.id=$1 AND a.workspace_id=$2 AND a.is_active
        AND ata.team_id=$3 AND ata.revoked_at IS NULL
        AND 'work:read'=ANY(a.approved_capabilities)
        AND 'work:read'=ANY(ata.approved_capabilities)
        AND a.approved_capabilities @> $4::text[]
        AND ata.approved_capabilities @> $4::text[]`,
    [targetAgentId,workspaceId,teamId,requiredCapabilities],
  )
  if(!found.rowCount) throw new DomainError('CAPABILITY_DENIED','Exact handoff target lacks active Team access or required read capability')
}
async function subjectTeam(tx: PoolClient, workspaceId: string, kind: Subject, subjectId: string): Promise<string> {
  const sql = kind === 'work_item' ? 'SELECT team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL' : kind === 'project' ? 'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL' : 'SELECT team_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2'
  const row = (await tx.query<{ team_id:string }>(sql, [subjectId, workspaceId])).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Room subject not found')
  return row.team_id
}
async function room(tx: PoolClient, workspaceId: string, kind: Subject, subjectId: string) {
  const teamId = await subjectTeam(tx, workspaceId, kind, subjectId)
  return (await tx.query<{ id:string; team_id:string }>('INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,subject_kind,subject_id) DO UPDATE SET team_id=EXCLUDED.team_id RETURNING id,team_id', [workspaceId, kind, subjectId, teamId])).rows[0]!
}
async function emit(tx: PoolClient, meta: RequestMeta, type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, teamId?: string, target?: { audienceActorId?: string; sessionId?: string }) {
  return appendEvent(tx, { workspaceId: meta.actor.workspaceId, teamId, audienceActorId: target?.audienceActorId, actorId: meta.actor.id, correlationId: meta.correlationId, idempotencyKey: meta.idempotencyKey, type, aggregateType, aggregateId, payload, sessionId: target?.sessionId })
}
async function inbox(tx: PoolClient, meta: RequestMeta, input: {
  recipient: string | undefined; recipientSessionId?: string; sourceSessionId?: string; teamId: string;
  kind: 'ask' | 'review_request' | 'blocker' | 'handoff' | 'mention'; sourceId: string;
  sourceType?: 'room_message' | 'handoff'; payload: Record<string, unknown>; requiresResponse?: boolean;
}) {
  const { recipient, recipientSessionId, sourceSessionId, teamId, kind, sourceId, payload } = input
  const sourceType = input.sourceType ?? 'room_message'
  if (!recipient) return
  const target = (await tx.query<{ kind:string }>('SELECT kind FROM actors WHERE id=$1 AND workspace_id=$2', [recipient, meta.actor.workspaceId])).rows[0]
  if (!target) return
  if (target.kind === 'agent' && kind === 'handoff' && !recipientSessionId) return
  await tx.query(
    `INSERT INTO inbox_items(
       workspace_id,recipient_human_actor_id,recipient_actor_id,
       recipient_session_id,session_id,team_id,kind,source_type,source_id,
       source_room_message_id,requires_response,payload
     ) VALUES(
       $1,CASE WHEN $2='human' THEN $3::uuid END,$3,$4,$5,$6,$7,
       $8,$9,CASE WHEN $8='room_message' THEN $9::uuid END,$10,$11
     ) ON CONFLICT DO NOTHING`,
    [meta.actor.workspaceId, target.kind, recipient, recipientSessionId ?? null, sourceSessionId ?? null, teamId, kind, sourceType, sourceId, input.requiresResponse ?? false, payload],
  )
}

export function registerCollaborationRoutes(app: FastifyInstance, h: Helpers): void {
  app.get('/api/v1/rooms', async request => {
    const q = z.object({ workItemId: uuid.optional(), projectId: uuid.optional(), sessionId: uuid.optional() }).parse(request.query)
    const supplied = Object.entries(q).filter(([, value]) => value)
    if (supplied.length !== 1) throw new DomainError('VALIDATION_ERROR', 'Exactly one room subject is required')
    const [key, value] = supplied[0]!; const kind: Subject = key === 'workItemId' ? 'work_item' : key === 'projectId' ? 'project' : 'session'
    const result = (await h.db.query<{id:string;team_id:string}>(
      `SELECT channel.id,channel.team_id
         FROM work_room_channels channel
        WHERE channel.workspace_id=$1
          AND channel.subject_kind=$2
          AND channel.subject_id=$3
          AND (
            channel.subject_kind<>'project'
            OR EXISTS (
              SELECT 1 FROM projects room_project
               WHERE room_project.id=channel.subject_id
                 AND room_project.workspace_id=channel.workspace_id
                 AND room_project.deleted_at IS NULL
            )
          )`,
      [actor(request).workspaceId, kind, value],
    )).rows[0]
    if (!result) throw new DomainError('NOT_FOUND', 'Work Room not found')
    if (actor(request).kind === 'agent') {
      if (!actor(request).agentSessionId) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH', 'Agent token is not scoped to a session')
      const values: unknown[] = [
        actor(request).agentSessionId,
        actor(request).workspaceId,
      ]
      const liveAuthorization = liveSessionReadPredicate(
        actor(request),
        'own.id',
        'own.workspace_id',
        values,
      )
      const own = (await h.db.query<{id:string;work_item_id:string|null;project_id:string|null}>(
        `SELECT own.id,own.work_item_id,own.project_id
           FROM agent_sessions own
          WHERE own.id=$1
            AND own.workspace_id=$2
            AND ${liveAuthorization}`,
        values,
      )).rows[0]
      if (!own) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH', 'Agent token is not scoped to an active session')
      const allowed = kind === 'session'
        ? own.id === value
        : kind === 'work_item'
          ? own.work_item_id === value
          : own.work_item_id
            ? Boolean((await h.db.query('SELECT 1 FROM work_items WHERE id=$1 AND workspace_id=$2 AND project_id=$3 AND deleted_at IS NULL', [own.work_item_id, actor(request).workspaceId, value])).rowCount)
            : own.project_id === value
      if (!allowed) throw new DomainError('RESOURCE_SCOPE_DENIED', 'Agent token cannot resolve this Work Room')
    } else await h.readableTeam(request, result.team_id)
    return { ...result, subject_kind: kind, subject_id: value }
  })
  app.get('/api/v1/rooms/:id/timeline', async request => {
    const channelId = id(request)
    const channel = (await h.db.query<{ team_id:string }>('SELECT team_id FROM work_room_channels WHERE id=$1 AND workspace_id=$2', [channelId, actor(request).workspaceId])).rows[0]
    if (!channel) throw new DomainError('NOT_FOUND', 'Room not found'); if (actor(request).kind !== 'human') throw new DomainError('FORBIDDEN', 'Room timeline is human-visible collaboration context'); await h.readableTeam(request, channel.team_id)
    // Projection deliberately unions durable facts only; a resolution is a separate immutable fact.
    const values: unknown[] = [channelId, actor(request).workspaceId]
    const liveAuthorization = liveHumanTeamReadPredicate(
      actor(request),
      'authorized_room.workspace_id',
      'authorized_room.team_id',
      values,
    )
    const page = h.paginator.prepare(request, request.query, {
      route: '/api/v1/rooms/:id/timeline',
      filters: { roomId: channelId },
      sort: [{ key: 'created_at', sql: 'timeline.created_at', direction: 'ASC' }, { key: 'id', sql: 'timeline.id', direction: 'ASC' }],
    }, values)
    page.values.push(page.limit + 1)
    await page.beforeQuery()
    const rows = (await h.db.query(`
      WITH RECURSIVE room AS (
        SELECT authorized_room.id,authorized_room.subject_kind,authorized_room.subject_id
          FROM work_room_channels authorized_room
         WHERE authorized_room.id=$1 AND authorized_room.workspace_id=$2
           AND ${liveAuthorization}
      ),
      session_scope(id) AS (
        SELECT s.id FROM agent_sessions s JOIN room r ON
          (r.subject_kind='session' AND s.id=r.subject_id) OR
          (r.subject_kind='work_item' AND s.work_item_id=r.subject_id) OR
          (r.subject_kind='project' AND s.work_item_id IN (SELECT id FROM work_items WHERE project_id=r.subject_id))
        UNION ALL SELECT child.id FROM agent_sessions child JOIN session_scope parent ON child.parent_session_id=parent.id
      )
      SELECT * FROM (
        SELECT m.id, m.created_at, 'message' AS kind, m.intent::text AS subtype,
          jsonb_build_object('body', m.body, 'actorId', m.author_actor_id,
            'actorDisplayName', a.display_name, 'actorKind', a.kind, 'sessionId', m.session_id,
            'planStepId', NULL, 'createdAt', m.created_at,
            'recipientActorId', m.recipient_actor_id, 'replyToMessageId', m.reply_to_message_id,
            'threadId', m.thread_id, 'requiresResponse', m.requires_response,
            'resolution', CASE WHEN rr.id IS NULL THEN NULL ELSE jsonb_build_object('id', rr.id, 'resolvedAt', rr.created_at, 'resolvedByActorId', rr.resolved_by_actor_id, 'resolution', rr.resolution) END,
            'payload', m.structured_payload) AS payload
        FROM room_messages m
        JOIN actors a ON a.id=m.author_actor_id
        LEFT JOIN room_message_response_resolutions rr ON rr.message_id=m.id
        WHERE m.channel_id IN (SELECT id FROM room)
           OR m.channel_id IN (SELECT c.id FROM work_room_channels c WHERE c.subject_kind='session' AND c.subject_id IN (SELECT id FROM session_scope))
        UNION ALL
        SELECT d.id,d.created_at,'decision',d.status,
          jsonb_build_object('title',d.title,'rationale',d.rationale,'selectedOption',d.selected_option,'evidence',d.evidence,'sessionId',d.session_id)
        FROM decisions d JOIN room c ON
          (c.subject_kind='work_item' AND c.subject_id=d.work_item_id) OR
          (c.subject_kind='project' AND c.subject_id=d.project_id) OR
          (c.subject_kind='session' AND c.subject_id=d.session_id) OR
          d.session_id IN (SELECT id FROM session_scope)

        UNION ALL
        SELECT aa.id,aa.created_at,'activity',aa.kind,jsonb_build_object('summary',aa.summary,'sessionId',aa.session_id,'actorId',aa.actor_id)
        FROM agent_activities aa WHERE aa.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT cd.id,cd.created_at,'context_delta','delta',jsonb_build_object('sessionId',cd.session_id,'baseSnapshotId',cd.base_snapshot_id,'sourceSnapshotId',cd.source_snapshot_id,'additions',cd.additions,'contentHash',cd.content_hash,'rationale',cd.rationale,'historyLink',cd.history_link,'createdByActorId',cd.created_by_actor_id)
        FROM context_deltas cd WHERE cd.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT psc.id,psc.created_at,'step_comment','comment',jsonb_build_object('sessionId',pv.session_id,'planVersionId',psc.plan_version_id,'planStepId',psc.step_id,'actorId',psc.author_actor_id,'actorDisplayName',a.display_name,'actorKind',a.kind,'createdAt',psc.created_at,'body',psc.body,'references',psc.references_json)
        FROM plan_step_comments psc JOIN agent_plan_versions pv ON pv.id=psc.plan_version_id JOIN actors a ON a.id=psc.author_actor_id WHERE pv.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT ps.id,pv.created_at,'plan_step',ps.status::text,jsonb_build_object('sessionId',pv.session_id,'planVersionId',pv.id,'planStepId',ps.id,'title',ps.title,'description',ps.description,'ownerActorId',ps.owner_actor_id,'ordinal',ps.ordinal,'dependsOn',coalesce((SELECT jsonb_agg(depends_on_step_id ORDER BY depends_on_step_id) FROM agent_plan_step_dependencies WHERE plan_version_id=pv.id AND step_id=ps.id),'[]'::jsonb),'acceptanceCriteria',ps.acceptance_criteria,'expectedArtifacts',ps.expected_artifacts)
        FROM agent_plan_steps ps JOIN agent_plan_versions pv ON pv.id=ps.plan_version_id WHERE pv.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT ap.id,ap.created_at,'assignment','proposal',jsonb_build_object('sessionId',ap.session_id,'planVersionId',ap.plan_version_id,'planStepId',ap.plan_step_id,'agentId',ap.agent_id,'skill',ap.skill,'rationale',ap.rationale,'proposedByActorId',ap.proposed_by_actor_id)
        FROM assignment_proposals ap WHERE ap.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT ar.id,ar.created_at,'artifact',ar.type,jsonb_build_object('sessionId',ar.session_id,'workItemId',ar.work_item_id,'title',ar.title,'uri',ar.uri,'mimeType',ar.mime_type,'checksum',ar.checksum,'metadata',ar.metadata)
        FROM artifacts ar WHERE ar.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT ap.id,ap.created_at,'approval',ap.status::text,jsonb_build_object('sessionId',ap.session_id,'approvalType',ap.approval_type,'actionName',ap.action_name,'riskLevel',ap.risk_level,'requiredApprovals',ap.required_approvals,'expiresAt',ap.expires_at)
        FROM approvals ap WHERE ap.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT hf.id,hf.created_at,'handoff',hf.status::text,jsonb_build_object('summary',hf.summary,'fromSessionId',hf.from_session_id,'acceptedSessionId',hf.accepted_session_id,'completedAt',hf.completed_at)
        FROM handoffs hf WHERE hf.from_session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT l.id,l.created_at,'lease',l.status::text,jsonb_build_object('sessionId',l.session_id,'resourceType',l.resource_type,'resourceId',l.resource_id,'kind',l.kind,'expiresAt',l.expires_at)
        FROM leases l JOIN room c ON (c.subject_kind='work_item' AND c.subject_id=l.resource_id AND l.resource_type='work_item')
          OR l.session_id IN (SELECT id FROM session_scope)
        UNION ALL
        SELECT e.id,e.occurred_at,'event',e.event_type,jsonb_build_object('aggregateType',e.aggregate_type,'aggregateId',e.aggregate_id,'payload',e.payload)
        FROM domain_events e JOIN room c ON
          (e.aggregate_type='agent_session' AND e.aggregate_id IN (SELECT id FROM session_scope)) OR
          (c.subject_kind='work_item' AND c.subject_id=e.aggregate_id AND e.aggregate_type='work_item')
      ) timeline
      WHERE true${page.predicate ? ` AND ${page.predicate}` : ''}
      ORDER BY ${page.orderBy} LIMIT $${page.values.length}`, page.values)).rows
    return page.finish(rows as Record<string, unknown>[])
  })
  app.post('/api/v1/rooms/:id/messages', async request => {
    const channelId = id(request); const body = roomMessageInputSchema.parse(request.body)
    const actorRecipients = [...new Set(body.recipientActorIds ?? (body.recipientActorId ? [body.recipientActorId] : []))]
    const recipientSessionIds = [...new Set(body.recipientSessionIds ?? (body.recipientSessionId ? [body.recipientSessionId] : []))]
    return command(h.db, h.meta(request, body, { id: channelId }), async tx => {
      const authorityLocator=await lockRoomMessageAuthorityPlan(
        tx,
        actor(request),
        channelId,
        body.sessionId,
        actorRecipients,
        recipientSessionIds,
      )
      const channel = (await tx.query<{ team_id:string;subject_kind:Subject;subject_id:string }>(
        `SELECT channel.team_id,channel.subject_kind,channel.subject_id
           FROM work_room_channels channel
          WHERE channel.id=$1
            AND channel.workspace_id=$2
            AND (
              channel.subject_kind<>'project'
              OR EXISTS (
                SELECT 1 FROM projects room_project
                 WHERE room_project.id=channel.subject_id
                   AND room_project.workspace_id=channel.workspace_id
                   AND room_project.deleted_at IS NULL
              )
            )
          FOR UPDATE OF channel`,
        [channelId, actor(request).workspaceId],
      )).rows[0]; if (!channel) throw new DomainError('NOT_FOUND','Room not found')
      if(
        channel.team_id!==authorityLocator.channel.team_id
        || channel.subject_kind!==authorityLocator.channel.subject_kind
        || channel.subject_id!==authorityLocator.channel.subject_id
      ) throw new DomainError(
        'MESSAGE_RECIPIENT_OUT_OF_SCOPE',
        'Room authority binding changed while the message was being authorized',
      )
      if (actor(request).kind === 'human') await assertHumanTeam(tx, actor(request), channel.team_id); if (body.sessionId) await assertSessionMessageWrite(tx, actor(request), body.sessionId, body.intent, request.idempotencyKey!, authorityLocator.sourceSession)
      if (actor(request).kind === 'agent' && !body.sessionId) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH','Agent messages require their session id')
      if (body.sessionId) {
        const messageSession=(await tx.query<{team_id:string;work_item_id:string|null;work_item_exists:boolean;work_item_project_id:string|null;project_id:string|null;project_exists:boolean}>(
          `SELECT message_session.team_id,message_session.work_item_id,
                  message_scope_item.id IS NOT NULL AS work_item_exists,
                  message_scope_project.id AS work_item_project_id,
                  message_session.project_id,
                  message_session_project.id IS NOT NULL AS project_exists
             FROM agent_sessions message_session
             LEFT JOIN work_items message_scope_item
              ON message_scope_item.id=message_session.work_item_id
              AND message_scope_item.workspace_id=message_session.workspace_id
              AND message_scope_item.deleted_at IS NULL
             LEFT JOIN projects message_scope_project
               ON message_scope_project.id=message_scope_item.project_id
              AND message_scope_project.workspace_id=message_session.workspace_id
              AND message_scope_project.deleted_at IS NULL
             LEFT JOIN projects message_session_project
               ON message_session_project.id=message_session.project_id
              AND message_session_project.workspace_id=message_session.workspace_id
              AND message_session_project.deleted_at IS NULL
            WHERE message_session.id=$1
              AND message_session.workspace_id=$2`,
          [body.sessionId,actor(request).workspaceId],
        )).rows[0]
        const inSessionTree = channel.subject_kind === 'session' && Boolean((await tx.query(`
          WITH RECURSIVE lineage(id,parent_session_id) AS (
            SELECT id,parent_session_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2
            UNION ALL
            SELECT parent.id,parent.parent_session_id
            FROM agent_sessions parent JOIN lineage child ON child.parent_session_id=parent.id
          )
          SELECT 1 FROM lineage WHERE id=$3`,[body.sessionId,actor(request).workspaceId,channel.subject_id])).rowCount)
        const inRoom = messageSession && messageSession.team_id===channel.team_id && (channel.subject_kind==='session' ? inSessionTree : channel.subject_kind==='work_item' ? messageSession.work_item_exists && messageSession.work_item_id===channel.subject_id : messageSession.work_item_id ? messageSession.work_item_project_id===channel.subject_id : messageSession.project_exists && messageSession.project_id===channel.subject_id)
        if (!inRoom) throw new DomainError('RESOURCE_SCOPE_DENIED','Message session is outside this Work Room')
      }
      if (body.intent === 'review_result') {
        if (!body.sessionId) throw new DomainError('REVIEW_SESSION_REQUIRED','Review results must identify a reviewer session')
        const review = (await tx.query<{role:string;agent_actor_id:string}>('SELECT d.role,s.agent_actor_id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id WHERE s.id=$1',[body.sessionId])).rows[0]
        if (actor(request).kind !== 'agent' || actor(request).agentSessionId !== body.sessionId || review?.agent_actor_id !== actor(request).id || review.role !== 'reviewer') throw new DomainError('FORBIDDEN','Only the exact reviewer session may publish review results')
      }
      const recent = (await tx.query<{ count:number }>("SELECT count(*)::int AS count FROM room_messages WHERE channel_id=$1 AND author_actor_id=$2 AND created_at>now()-interval '1 minute'", [channelId, actor(request).id])).rows[0]!.count
      if (recent >= 30) throw new DomainError('MESSAGE_RATE_LIMITED', 'Too many messages in this room; use a concise status update')
      if (body.intent === 'status') {
        const statusRecent = (await tx.query<{ count:number }>("SELECT count(*)::int AS count FROM room_messages WHERE channel_id=$1 AND author_actor_id=$2 AND intent='status' AND created_at>now()-interval '1 minute'", [channelId, actor(request).id])).rows[0]!.count
        if (statusRecent >= 6) throw new DomainError('MESSAGE_RATE_LIMITED', 'Status messages are limited to six per minute')
        const fingerprint = createHash('sha256').update(JSON.stringify(body.payload)).digest('hex')
        const duplicate = await tx.query("SELECT 1 FROM room_messages WHERE channel_id=$1 AND author_actor_id=$2 AND intent='status' AND structured_payload=$3 AND created_at>now()-interval '60 seconds'", [channelId, actor(request).id, body.payload])
        if (duplicate.rowCount) throw new DomainError('MESSAGE_NOISE_SUPPRESSED', 'An identical status update was recently posted', { retryAfterSeconds: 60, fingerprint })
      }
      for (const relatedId of [body.replyToMessageId, body.threadId]) if (relatedId) {
        const related = await tx.query('SELECT 1 FROM room_messages WHERE id=$1 AND channel_id=$2', [relatedId, channelId])
        if (!related.rowCount) throw new DomainError('VALIDATION_ERROR', 'Reply and thread references must remain in the same Work Room')
      }
      if (channel.subject_kind === 'session' && actorRecipients.length > 0) throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Session Work Rooms require exact Session recipients')
      const exactSessionRecipients: Array<{ id:string; actor_id:string; agent_id:string }> = []
      for (const recipientSessionId of recipientSessionIds) {
        const exact = (await tx.query<{ id:string;actor_id:string;agent_id:string }>(
          `SELECT target_session.id,target_session.agent_actor_id AS actor_id,
                  target_session.agent_id
             FROM agent_sessions target_session
             JOIN actors target_actor
               ON target_actor.id=target_session.agent_actor_id
              AND target_actor.workspace_id=target_session.workspace_id
              AND target_actor.kind='agent'
              AND target_actor.is_active
             JOIN delegations target_delegation
               ON target_delegation.id=target_session.delegation_id
              AND target_delegation.status='active'
             LEFT JOIN work_items target_scope_item
               ON target_scope_item.id=target_session.work_item_id
              AND target_scope_item.workspace_id=target_session.workspace_id
              AND target_scope_item.deleted_at IS NULL
             LEFT JOIN projects target_scope_project
               ON target_scope_project.id=target_scope_item.project_id
              AND target_scope_project.workspace_id=target_session.workspace_id
              AND target_scope_project.deleted_at IS NULL
             LEFT JOIN projects target_session_project
               ON target_session_project.id=target_session.project_id
              AND target_session_project.workspace_id=target_session.workspace_id
              AND target_session_project.deleted_at IS NULL
             JOIN agent_definitions target_definition
               ON target_definition.id=target_session.agent_id
              AND target_definition.workspace_id=target_session.workspace_id
              AND target_definition.is_active
             JOIN agent_team_access target_team_access
               ON target_team_access.workspace_id=target_session.workspace_id
              AND target_team_access.agent_id=target_session.agent_id
              AND target_team_access.team_id=target_session.team_id
              AND target_team_access.revoked_at IS NULL
            WHERE target_session.id=$1
              AND target_session.workspace_id=$2
              AND target_session.team_id=$3
              AND target_session.state IN(
                'acknowledged','planning','executing',
                'awaiting_input','awaiting_approval','blocked'
              )
               AND 'work:read'=ANY(target_delegation.permissions_snapshot)
               AND 'work:read'=ANY(target_definition.approved_capabilities)
               AND 'work:read'=ANY(target_team_access.approved_capabilities)
               AND COALESCE(target_delegation.capability_scope->'teamIds','[]'::jsonb)
                   ? target_session.team_id::text
               AND (
                 (
                   target_session.work_item_id IS NOT NULL
                   AND target_scope_item.id IS NOT NULL
                   AND COALESCE(
                     target_delegation.capability_scope->'workItemIds',
                     '[]'::jsonb
                   ) ? target_session.work_item_id::text
                 )
                 OR (
                   target_session.work_item_id IS NULL
                   AND (
                     target_session.project_id IS NULL
                     OR (
                       target_session_project.id IS NOT NULL
                       AND COALESCE(
                         target_delegation.capability_scope->'projectIds',
                         '[]'::jsonb
                       ) ? target_session.project_id::text
                     )
                   )
                 )
               )
               AND (
                ($4='work_item' AND target_session.work_item_id=$5)
                OR (
                  $4='project'
                  AND EXISTS (
                    SELECT 1 FROM projects room_project
                     WHERE room_project.id=$5
                       AND room_project.workspace_id=$2
                       AND room_project.deleted_at IS NULL
                  )
                  AND (
                    (
                      target_session.work_item_id IS NOT NULL
                      AND target_scope_project.id=$5
                    )
                    OR (
                      target_session.work_item_id IS NULL
                      AND target_session_project.id=$5
                      AND COALESCE(
                        target_delegation.capability_scope->'projectIds',
                        '[]'::jsonb
                      ) ? $5::text
                    )
                  )
                )
                 OR (
                   $4='session'
                   AND EXISTS(
                     WITH RECURSIVE lineage(id) AS (
                       SELECT $5::uuid
                       UNION ALL
                       SELECT child.id
                         FROM agent_sessions child
                         JOIN lineage parent ON child.parent_session_id=parent.id
                        WHERE child.workspace_id=$2
                     )
                     SELECT 1 FROM lineage WHERE id=target_session.id
                   )
                 )
               )
             `,
          [recipientSessionId, actor(request).workspaceId, channel.team_id, channel.subject_kind, channel.subject_id],
        )).rows[0]
        if (!exact) throw new DomainError('MESSAGE_RECIPIENT_OUT_OF_SCOPE', 'Exact Session recipient is unavailable or outside this Work Room')
        exactSessionRecipients.push(exact)
      }
      const uniqueRecipients = [...new Set([...actorRecipients, ...exactSessionRecipients.map(exact => exact.actor_id)])]
      const actorWebhookAgentIds = new Map<string,string>()
      for (const recipientId of actorRecipients) {
        const agentId = await authorizeActorRecipient(
          tx,
          actor(request),
          channel.team_id,
          channel.subject_kind,
          channel.subject_id,
          recipientId,
          authorityLocator.actorDefinitionIds.get(recipientId),
        )
        if (agentId) actorWebhookAgentIds.set(recipientId, agentId)
      }
      const row = (await tx.query('INSERT INTO room_messages(channel_id,workspace_id,author_actor_id,session_id,intent,recipient_actor_id,reply_to_message_id,thread_id,body,structured_payload,requires_response) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [channelId, actor(request).workspaceId, actor(request).id, body.sessionId ?? null, body.intent, uniqueRecipients[0] ?? null, body.replyToMessageId ?? null, body.threadId ?? null, body.body, body.payload, body.requiresResponse])).rows[0] as { id:string }
      for (const recipientId of uniqueRecipients) await tx.query('INSERT INTO room_message_recipients(message_id,actor_id) VALUES($1,$2)', [row.id, recipientId])
      for (const exact of exactSessionRecipients) await tx.query('INSERT INTO room_message_session_recipients(message_id,workspace_id,session_id,actor_id) VALUES($1,$2,$3,$4)', [row.id, actor(request).workspaceId, exact.id, exact.actor_id])
      if (body.intent === 'answer' && body.replyToMessageId) {
        await tx.query('INSERT INTO room_message_response_resolutions(message_id,resolved_by_actor_id,resolution) SELECT id,$2,$3 FROM room_messages WHERE id=$1 AND requires_response=true', [body.replyToMessageId, actor(request).id, `answer:${row.id}`])
        await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND source_type='room_message' AND source_id=$3 AND status='open'", [actor(request).workspaceId, actor(request).id, body.replyToMessageId])
      }
      let inboxActorRecipients = actorRecipients
      if (['ask','review_request','blocker','handoff'].includes(body.intent) && body.sessionId) {
        const responsibleHuman=(await tx.query<{ responsible_human_actor_id:string|null }>(
          `SELECT item.responsible_human_actor_id
             FROM agent_sessions source_session
             JOIN work_items item
               ON item.id=source_session.work_item_id
              AND item.workspace_id=source_session.workspace_id
            WHERE source_session.id=$1
              AND source_session.workspace_id=$2`,
          [body.sessionId,actor(request).workspaceId],
        )).rows[0]?.responsible_human_actor_id
        if(responsibleHuman) {
          await authorizeActorRecipient(
            tx,
            actor(request),
            channel.team_id,
            channel.subject_kind,
            channel.subject_id,
            responsibleHuman,
            authorityLocator.actorDefinitionIds.get(responsibleHuman),
          )
          inboxActorRecipients=[...new Set([...inboxActorRecipients,responsibleHuman])]
        }
      }
      const inboxKind = body.intent === 'inform' ? 'mention' : ['ask','review_request','blocker','handoff'].includes(body.intent) ? body.intent as 'ask' | 'review_request' | 'blocker' | 'handoff' : undefined
      if (inboxKind) {
        for (const recipient of inboxActorRecipients) await inbox(tx, h.meta(request, body), { recipient, sourceSessionId: body.sessionId, teamId: channel.team_id, kind: inboxKind, sourceId: row.id, payload: { intent: body.intent, channelId }, requiresResponse: body.requiresResponse })
        for (const exact of exactSessionRecipients) await inbox(tx, h.meta(request, body), { recipient: exact.actor_id, recipientSessionId: exact.id, sourceSessionId: body.sessionId, teamId: channel.team_id, kind: inboxKind, sourceId: row.id, payload: { intent: body.intent, channelId }, requiresResponse: body.requiresResponse })
      }
      const eventPayload={intent:body.intent,channelId}
      if (actorRecipients.length === 0 && exactSessionRecipients.length === 0) {
        await emit(tx,h.meta(request,body),'room.message.posted','room_message',row.id,eventPayload,channel.team_id)
      }
      for (const recipient of actorRecipients) {
        const eventId=await emit(tx,h.meta(request,body),'room.message.posted','room_message',row.id,eventPayload,channel.team_id,{audienceActorId:recipient})
        const targetAgentId=actorWebhookAgentIds.get(recipient)
        if(targetAgentId) await queueWebhookDeliveries(tx,targetAgentId,eventId,'room.message.posted',undefined,{messageId:row.id,channelId,intent:body.intent})
      }
      for (const exact of exactSessionRecipients) {
        const eventId=await emit(tx,h.meta(request,body),'room.message.posted','room_message',row.id,eventPayload,channel.team_id,{audienceActorId:exact.actor_id,sessionId:exact.id})
        await queueWebhookDeliveries(tx,exact.agent_id,eventId,'room.message.posted',exact.id,{messageId:row.id,channelId,intent:body.intent,sessionId:exact.id})
      }
      if (actorRecipients.length > 0 || exactSessionRecipients.length > 0) {
        await emit(tx,h.meta(request,body),'room.message.human_visibility_recorded','room_message',row.id,eventPayload,channel.team_id)
      }
      return row
    })
  })
  app.post('/api/v1/messages/:id/resolve', async request => {
    const body = z.object({ reason: z.string().min(1).max(10000).optional() }).parse(request.body ?? {})
    return command(h.db, h.meta(request, body, { id: id(request) }), async tx => {
      const row = (await tx.query<{ id:string; channel_id:string; team_id:string }>('SELECT m.id,m.channel_id,c.team_id FROM room_messages m JOIN work_room_channels c ON c.id=m.channel_id WHERE m.id=$1 AND m.workspace_id=$2 FOR UPDATE',[id(request),actor(request).workspaceId])).rows[0]
      if(!row) throw new DomainError('NOT_FOUND','Message not found')
      await assertHumanTeam(tx,actor(request),row.team_id)
      await tx.query('INSERT INTO room_message_response_resolutions(message_id,resolved_by_actor_id,resolution) VALUES($1,$2,$3)',[row.id,actor(request).id,'human_resolved'])
      await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND source_type='room_message' AND source_id=$3 AND status='open'",[actor(request).workspaceId,actor(request).id,row.id])
      await emit(tx,h.meta(request,body),'room.message.resolved','room_message',row.id,{ reason: body.reason ?? null },row.team_id)
      return {id:row.id,resolved:true}
    })
  })

  app.post('/api/v1/work-items/:id/decisions', async request => createDecision(h, request, 'work_item', id(request)))
  app.post('/api/v1/projects/:id/decisions', async request => createDecision(h, request, 'project', id(request)))
  app.post('/api/v1/agent-sessions/:id/decisions', async request => createDecision(h, request, 'session', id(request)))
  app.get('/api/v1/decisions/:id', async request => {
    const decisionId=id(request)
    const row=(await h.db.query<{work_item_id:string|null;project_id:string|null;session_id:string|null;team_id:string}>(`
      SELECT d.*,coalesce(w.team_id,p.team_id,s.team_id) AS team_id
      FROM decisions d
      LEFT JOIN work_items w ON w.id=d.work_item_id
      LEFT JOIN projects p ON p.id=d.project_id
      LEFT JOIN agent_sessions s ON s.id=d.session_id
      WHERE d.id=$1 AND d.workspace_id=$2`,[decisionId,actor(request).workspaceId])).rows[0]
    if(!row) throw new DomainError('NOT_FOUND','Decision not found')
    if(actor(request).kind==='human') await h.readableTeam(request,row.team_id)
    else {
      const own=(await h.db.query<{id:string;work_item_id:string|null;work_item_exists:boolean;work_item_project_id:string|null;project_id:string|null;project_exists:boolean}>(
        `SELECT own_session.id,own_session.work_item_id,
                own_scope_item.id IS NOT NULL AS work_item_exists,
                own_scope_project.id AS work_item_project_id,
                own_session.project_id,
                own_session_project.id IS NOT NULL AS project_exists
           FROM agent_sessions own_session
           LEFT JOIN work_items own_scope_item
             ON own_scope_item.id=own_session.work_item_id
            AND own_scope_item.workspace_id=own_session.workspace_id
            AND own_scope_item.deleted_at IS NULL
           LEFT JOIN projects own_scope_project
             ON own_scope_project.id=own_scope_item.project_id
            AND own_scope_project.workspace_id=own_session.workspace_id
            AND own_scope_project.deleted_at IS NULL
           LEFT JOIN projects own_session_project
             ON own_session_project.id=own_session.project_id
            AND own_session_project.workspace_id=own_session.workspace_id
            AND own_session_project.deleted_at IS NULL
          WHERE own_session.id=$1
            AND own_session.workspace_id=$2
            AND own_session.agent_actor_id=$3`,
        [actor(request).agentSessionId,actor(request).workspaceId,actor(request).id],
      )).rows[0]
      const allowed=own && (
        row.work_item_id
          ? own.work_item_exists && row.work_item_id===own.work_item_id
          : row.project_id
            ? (
                own.work_item_id
                  ? own.work_item_exists && row.project_id===own.work_item_project_id
                  : own.project_exists && row.project_id===own.project_id
              )
            : row.session_id===own.id
      )
      if(!allowed) throw new DomainError('RESOURCE_SCOPE_DENIED','Decision is outside the agent session scope')
    }
    const [affectedResources,relations]=await Promise.all([h.db.query('SELECT resource_type AS "resourceType",resource_id AS "resourceId",impact FROM decision_affected_resources WHERE decision_id=$1 ORDER BY resource_type,resource_id',[decisionId]),h.db.query('SELECT kind,related_decision_id AS "relatedDecisionId",created_at AS "createdAt" FROM decision_relations WHERE decision_id=$1 ORDER BY created_at',[decisionId])])
    return {...row as object,affectedResources:affectedResources.rows,relations:relations.rows}
  })
  for (const action of ['finalize','supersede','reverse'] as const) app.post(`/api/v1/decisions/:id/${action}`, async request => command(h.db,h.meta(request,request.body,{id:id(request)}),async tx=>{
    if(actor(request).kind!=='human') throw new DomainError('FORBIDDEN','Human final decision required')
    const row=(await tx.query<{id:string;revision:number;status:string;work_item_id:string|null;project_id:string|null;session_id:string|null;team_id:string}>("SELECT d.*,COALESCE(s.team_id,w.team_id,p.team_id) AS team_id FROM decisions d LEFT JOIN agent_sessions s ON s.id=d.session_id LEFT JOIN work_items w ON w.id=d.work_item_id LEFT JOIN projects p ON p.id=d.project_id WHERE d.id=$1 AND d.workspace_id=$2 FOR UPDATE OF d",[id(request),actor(request).workspaceId])).rows[0]
    if(!row) throw new DomainError('NOT_FOUND','Decision not found'); await assertHumanTeam(tx,actor(request),row.team_id); assertRevision(parseRevision(h.header(request,'if-match')),row.revision)
    const selected=z.object({selectedOption:z.string().max(2000).optional(),reason:z.string().min(1).max(10000).optional(),replacementDecisionId:uuid.optional()}).parse(request.body)
    if (action !== 'finalize' && !selected.reason) throw new DomainError('VALIDATION_ERROR','Superseding or reversing a Decision requires a Human-authored reason')
    if (action === 'finalize') {
      if(row.status!=='proposed') throw new DomainError('DECISION_TRANSITION_CONFLICT','Only a proposed decision may be finalized')
      const result=(await tx.query("INSERT INTO decisions(workspace_id,work_item_id,project_id,session_id,proposed_by_actor_id,finalized_by_actor_id,title,rationale,options,selected_option,evidence,status,finalized_at) SELECT workspace_id,work_item_id,project_id,session_id,$2,$2,title,COALESCE($3,rationale),options,COALESCE($4,selected_option),evidence,'final',now() FROM decisions WHERE id=$1 RETURNING *",[row.id,actor(request).id,selected.reason??null,selected.selectedOption??null])).rows[0]
      if(!(await tx.query("INSERT INTO decision_transition_consumptions(target_decision_id,transition_type,derived_decision_id,consumed_by_actor_id) VALUES($1,'finalize',$2,$3) ON CONFLICT(target_decision_id) DO NOTHING RETURNING id",[row.id,(result as {id:string}).id,actor(request).id])).rowCount) throw new DomainError('DECISION_TRANSITION_CONFLICT','Decision was already finalized')
      await tx.query('INSERT INTO decision_affected_resources(decision_id,resource_type,resource_id,impact) SELECT $1,resource_type,resource_id,impact FROM decision_affected_resources WHERE decision_id=$2',[(result as {id:string}).id,row.id]); await emit(tx,h.meta(request,selected),'decision.recorded','decision',(result as {id:string}).id,{replaces:row.id},row.team_id); return result
    }
    if(row.status!=='final') throw new DomainError('DECISION_TRANSITION_CONFLICT','Only a final decision may be superseded or reversed')
    const relation = action === 'supersede' ? 'supersedes' : 'reverses'
    const result=(await tx.query("INSERT INTO decisions(workspace_id,work_item_id,project_id,session_id,proposed_by_actor_id,finalized_by_actor_id,title,rationale,options,selected_option,evidence,status,finalized_at) SELECT workspace_id,work_item_id,project_id,session_id,$2,$2,title,COALESCE($3,rationale),options,COALESCE($4,selected_option),evidence,'final',now() FROM decisions WHERE id=$1 RETURNING *",[row.id,actor(request).id,selected.reason??null,selected.selectedOption??null])).rows[0] as {id:string}
    if(!(await tx.query("INSERT INTO decision_transition_consumptions(target_decision_id,transition_type,derived_decision_id,consumed_by_actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(target_decision_id) DO NOTHING RETURNING id",[row.id,action,result.id,actor(request).id])).rowCount) throw new DomainError('DECISION_TRANSITION_CONFLICT','Decision transition was already recorded')
    await tx.query('INSERT INTO decision_affected_resources(decision_id,resource_type,resource_id,impact) SELECT $1,resource_type,resource_id,impact FROM decision_affected_resources WHERE decision_id=$2',[result.id,row.id]); await tx.query('INSERT INTO decision_relations(decision_id,related_decision_id,kind,created_by_actor_id) VALUES($1,$2,$3,$4)',[result.id,row.id,relation,actor(request).id])
    await emit(tx,h.meta(request,selected),`decision.${action}d`,'decision',result.id,{targetDecisionId:row.id,reason:selected.reason??null},row.team_id); return result
  }))

  app.post('/api/v1/leases', async request => acquireLease(h,request))
  for (const action of ['heartbeat','renew','release','force-release'] as const) app.post(`/api/v1/leases/:id/${action}`, async request => leaseAction(h,request,action))
  app.get('/api/v1/leases', async request => {
    const q=z.object({sessionId:uuid.optional(),resourceId:uuid.optional()}).parse(request.query)
    const current=actor(request); const values:unknown[]=[current.workspaceId]; const where=['l.workspace_id=$1']
    if(q.sessionId){values.push(q.sessionId);where.push(`l.session_id=$${values.length}`)}
    if(q.resourceId){values.push(q.resourceId);where.push(`l.resource_id=$${values.length}`)}
    if(current.kind==='agent'){
      values.push(current.agentSessionId)
      where.push(`l.session_id=$${values.length}`)
      where.push(liveSessionReadPredicate(
        current,
        's.id',
        's.workspace_id',
        values,
      ))
    }
    else if(current.workspaceRole!=='admin'){values.push(current.id);where.push(`EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=l.workspace_id AND m.team_id=s.team_id AND m.actor_id=$${values.length})`)}
    const page = await h.paginator.query<{ version: number } & Record<string, unknown>>(
      h.db, request, request.query, {
        route: '/api/v1/leases',
        filters: { sessionId: q.sessionId ?? null, resourceId: q.resourceId ?? null },
        sort: [{ key: 'created_at', sql: 'l.created_at', direction: 'DESC' }, { key: 'id', sql: 'l.id', direction: 'DESC' }],
      },
      `SELECT l.*,s.team_id FROM leases l JOIN agent_sessions s ON s.id=l.session_id
       WHERE ${where.join(' AND ')}`,
      values,
    )
    return { items: page.items.map(leaseResponse), nextCursor: page.nextCursor }
  })

  app.post('/api/v1/agent-sessions/:id/plan/comments', async request => { const sessionId=id(request); const body=z.object({planVersionId:uuid,planStepId:uuid,body:z.string().min(1).max(50000),references:z.array(z.unknown()).max(100).default([])}).parse(request.body); return command(h.db,h.meta(request,body,{id:sessionId}),async tx=>{const s=await assertSessionWrite(tx,actor(request),sessionId); const valid=await tx.query('SELECT 1 FROM agent_plan_steps ps JOIN agent_plan_versions pv ON pv.id=ps.plan_version_id JOIN agent_sessions s ON s.id=$3 WHERE ps.id=$1 AND pv.id=$2 AND pv.session_id=$3 AND s.current_plan_version_id=pv.id',[body.planStepId,body.planVersionId,sessionId]); if(!valid.rowCount)throw new DomainError('STALE_PLAN_VERSION','Comments must target a step in the session current plan'); const row=(await tx.query('INSERT INTO plan_step_comments(plan_version_id,step_id,author_actor_id,body,references_json) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING *',[body.planVersionId,body.planStepId,actor(request).id,body.body,JSON.stringify(body.references)])).rows[0] as {id:string}; await emit(tx,h.meta(request,body),'plan.step.commented','plan_step_comment',row.id,{sessionId,stepId:body.planStepId},s.team_id);return row}) })
  app.post('/api/v1/agent-sessions/:id/assignment-proposals', async request => { const sessionId=id(request);const body=assignmentProposalInputSchema.parse(request.body);return command(h.db,h.meta(request,body,{id:sessionId}),async tx=>{const s=await assertSessionWrite(tx,actor(request),sessionId); const plan=(await tx.query<{current_plan_version_id:string}>('SELECT current_plan_version_id FROM agent_sessions WHERE id=$1',[sessionId])).rows[0];if(!plan?.current_plan_version_id)throw new DomainError('NOT_FOUND','No current plan');if(!(await tx.query('SELECT 1 FROM agent_plan_steps ps JOIN agent_plan_versions pv ON pv.id=ps.plan_version_id WHERE ps.id=$1 AND pv.id=$2 AND pv.session_id=$3',[body.planStepId,plan.current_plan_version_id,sessionId])).rowCount)throw new DomainError('STALE_PLAN_VERSION','Assignment must target a step in the session current plan');const row=(await tx.query('INSERT INTO assignment_proposals(session_id,plan_version_id,plan_step_id,proposed_by_actor_id,agent_id,skill,rationale) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[sessionId,plan.current_plan_version_id,body.planStepId,actor(request).id,body.agentId??null,body.skill??null,body.rationale])).rows[0]as{id:string};if(body.agentId)await tx.query('INSERT INTO routing_records(workspace_id,source_session_id,target_agent_id,requested_skill,required_capabilities,rationale) VALUES($1,$2,$3,$4,$5,$6)',[actor(request).workspaceId,sessionId,body.agentId,body.skill??null,[],{rationale:body.rationale,rule:'exact-agent-or-skill'}]);await emit(tx,h.meta(request,body),'plan.assignment.proposed','assignment_proposal',row.id,{sessionId,planStepId:body.planStepId},s.team_id);return row}) })
  app.post('/api/v1/agent-sessions/:id/children', async request => createChild(h,request))
  app.post('/api/v1/agent-sessions/:id/context-deltas', async request => appendDelta(h,request))
  app.post('/api/v1/agent-sessions/:id/review-delegations', async request => createReview(h,request))
  app.post('/api/v1/handoffs', async request => offerHandoff(h,request))
  app.get('/api/v1/handoffs', async request => {
    const current=actor(request)
    const values:unknown[]=[current.workspaceId]
    let authorization=''
    if(current.kind==='agent'){
      values.push(current.agentSessionId)
      const currentSessionSql=`$${values.length}`
      const liveAuthorization=liveSessionReadPredicate(
        current,
        currentSessionSql,
        'h.workspace_id',
        values,
      )
      authorization=` AND EXISTS(
        SELECT 1
          FROM agent_sessions current_scope
         WHERE current_scope.id=${currentSessionSql}
           AND current_scope.workspace_id=h.workspace_id
           AND current_scope.team_id=s.team_id
           AND (
             current_scope.work_item_id IS NULL
             OR current_scope.work_item_id=s.work_item_id
           )
           AND (
             current_scope.project_id IS NULL
             OR current_scope.project_id=s.project_id
           )
           AND (
             h.from_session_id=current_scope.id
             OR h.target_agent_id=current_scope.agent_id
           )
      ) AND ${liveAuthorization}`
    }
    else if(current.workspaceRole!=='admin'){values.push(current.id);authorization=' AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=h.workspace_id AND m.team_id=s.team_id AND m.actor_id=$2)'}
    return h.paginator.query(h.db,request,request.query,{route:'/api/v1/handoffs',filters:{},sort:[{key:'created_at',sql:'h.created_at',direction:'DESC'},{key:'id',sql:'h.id',direction:'DESC'}]},`SELECT h.*,s.team_id FROM handoffs h JOIN agent_sessions s ON s.id=h.from_session_id WHERE h.workspace_id=$1${authorization}`,values)
  })
  app.get('/api/v1/handoffs/:id/inspect', async request => {
    const handoffId=id(request); const current=actor(request)
    if(current.kind!=='agent' || current.agentSessionId) throw new DomainError('FORBIDDEN','Only an exact-target installation identity may inspect a requested handoff')
    const handoff=(await h.db.query(
      `SELECT h.*
         FROM handoffs h
         JOIN agent_sessions s ON s.id=h.from_session_id AND s.workspace_id=h.workspace_id
         JOIN delegations source_grant ON source_grant.id=s.delegation_id AND source_grant.status='active'
         JOIN agent_definitions target ON target.id=h.target_agent_id AND target.workspace_id=h.workspace_id AND target.is_active
         JOIN agent_team_access ata ON ata.workspace_id=h.workspace_id AND ata.agent_id=target.id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
        WHERE h.id=$1 AND h.workspace_id=$2 AND h.status='requested' AND target.actor_id=$3
          AND s.state NOT IN ('stopping','completed','failed','canceled')
          AND 'work:read'=ANY(source_grant.permissions_snapshot)
          AND 'work:read'=ANY(target.approved_capabilities)
          AND 'work:read'=ANY(ata.approved_capabilities)
          AND target.approved_capabilities @> CASE WHEN cardinality(h.requested_capabilities)>0 THEN h.requested_capabilities ELSE source_grant.permissions_snapshot END
          AND ata.approved_capabilities @> CASE WHEN cardinality(h.requested_capabilities)>0 THEN h.requested_capabilities ELSE source_grant.permissions_snapshot END`,
      [handoffId,current.workspaceId,current.id],
    )).rows[0] as Record<string,unknown>|undefined
    if(!handoff) throw new DomainError('NOT_FOUND','Requested handoff is not available to this installation')
    const snapshotId=handoff.context_snapshot_id as string|null; const context=snapshotId?(await h.db.query('SELECT id,work_item_id,manifest,sources,content_hash,token_estimate,truncation,parent_snapshot_id,snapshot_kind,history_link,created_at FROM context_snapshots WHERE id=$1 AND workspace_id=$2',[snapshotId,current.workspaceId])).rows[0]??null:null
    return { handoff, contextSnapshot: context }
  })
  app.post('/api/v1/handoffs/:id/accept', async request => acceptHandoff(h,request))
  app.post('/api/v1/handoffs/:id/reject', async request => rejectHandoff(h,request))
  app.post('/api/v1/handoffs/:id/request', async request => transitionHandoff(h, request, 'requested'))
  app.post('/api/v1/handoffs/:id/cancel', async request => transitionHandoff(h, request, 'canceled'))
  app.post('/api/v1/handoffs/:id/complete', async request => transitionHandoff(h, request, 'completed'))
}

async function transitionHandoff(h: Helpers, request: FastifyRequest, status: 'requested' | 'canceled' | 'completed') {
  const handoffId = id(request); const body = z.object({ reason: z.string().min(1).max(10_000).optional() }).parse(request.body)
  return command(h.db, h.meta(request, body, { id: handoffId }), async tx => {
    const handoff=(await tx.query<{from_session_id:string;status:string;target_agent_id:string|null;accepted_session_id:string|null;scope_type:'project'|'work_item'|'plan_step'|null;scope_id:string|null;lease_transfer_policy:'retain'|'transfer'|'release';requested_capabilities:string[]}>('SELECT from_session_id,status,target_agent_id,accepted_session_id,scope_type,scope_id,lease_transfer_policy,requested_capabilities FROM handoffs WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[handoffId,actor(request).workspaceId])).rows[0]
    if (!handoff) throw new DomainError('NOT_FOUND', 'Handoff not found')
    const source=await session(tx,actor(request).workspaceId,handoff.from_session_id)
    if (status === 'requested' && actor(request).kind === 'agent') await assertSessionWrite(tx,actor(request),source.id)
    else await assertHumanTeam(tx,actor(request),source.team_id)
    if(status==='requested') {
      if(['stopping','completed','failed','canceled'].includes(source.state)) throw new DomainError('SESSION_NOT_ACTIVE','Handoff source session is not active')
      const sourceGrant=(await tx.query<{permissions_snapshot:string[]}>("SELECT permissions_snapshot FROM delegations WHERE id=$1 AND status='active'",[source.delegation_id])).rows[0]
      if(!sourceGrant) throw new DomainError('DELEGATION_NOT_ACTIVE','Handoff source delegation is unavailable')
      const required=handoff.requested_capabilities.length?handoff.requested_capabilities:sourceGrant.permissions_snapshot
      if(!required.includes('work:read')) throw new DomainError('CAPABILITY_DENIED','Handoff inspection requires delegated work:read')
      if(handoff.target_agent_id) await assertExactHandoffTargetAccess(tx,actor(request).workspaceId,source.team_id,handoff.target_agent_id,required)
    }
    if (status === 'completed') {
      if (!handoff.accepted_session_id) throw new DomainError('HANDOFF_NOT_ACCEPTED','Handoff has no accepted target session')
      const accepted=(await tx.query<{state:string;result_summary:string|null;result_evidence:Record<string,unknown>}>('SELECT state,result_summary,result_evidence FROM agent_sessions WHERE id=$1 AND parent_session_id=$2 FOR UPDATE',[handoff.accepted_session_id,source.id])).rows[0]
      if (!accepted || accepted.state!=='completed' || !accepted.result_summary || Object.keys(accepted.result_evidence ?? {}).length===0) throw new DomainError('HANDOFF_TARGET_INCOMPLETE','Accepted handoff session must complete with evidence before the handoff can complete',{acceptedSessionId:handoff.accepted_session_id,state:accepted?.state??null})
      if (handoff.lease_transfer_policy!=='retain') {
        const scopeType=handoff.scope_type??'work_item'; const scopeId=handoff.scope_id??source.work_item_id
        const remaining=(await tx.query<{count:number}>("SELECT count(*)::int AS count FROM leases WHERE session_id=$1 AND status='active' AND ($2='project' OR ($2='work_item' AND resource_type='work_item' AND resource_id=$3) OR ($2='plan_step' AND resource_type='plan_step' AND resource_id=$3))",[source.id,scopeType,scopeId])).rows[0]!.count
        if(remaining) throw new DomainError('HANDOFF_LEASE_POLICY_INCOMPLETE','Source leases still violate the handoff transfer policy',{remaining})
      }
    }
    const timestampColumn = status === 'requested' ? 'requested_at' : status === 'completed' ? 'completed_at' : 'decided_at'
    const allowed = status === 'requested' ? ['draft'] : status === 'completed' ? ['accepted'] : ['draft','requested']
    const row = (await tx.query(`UPDATE handoffs SET status=$2,${timestampColumn}=now(),revision=revision+1 WHERE id=$1 AND status=ANY($3::handoff_status[]) RETURNING *`, [handoffId, status, allowed])).rows[0] as { id:string } | undefined
    if (!row) throw new DomainError('CONFLICT', 'Handoff is not in a transitionable state')
    if (status === 'requested') { const responsible=(await tx.query<{responsible_human_actor_id:string}>('SELECT responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2',[source.work_item_id,actor(request).workspaceId])).rows[0]?.responsible_human_actor_id; await inbox(tx,h.meta(request,body),{recipient:responsible,sourceSessionId:source.id,teamId:source.team_id,kind:'handoff',sourceType:'handoff',sourceId:row.id,payload:{fromSessionId:source.id}}) }
    const eventId=await emit(tx, h.meta(request, body), `handoff.${status}`, 'handoff', row.id, { reason: body.reason ?? null }, source.team_id)
    if (status==='requested' && handoff.target_agent_id) await queueWebhookDeliveries(tx,handoff.target_agent_id,eventId,'handoff.requested',undefined,{handoffId,rowId:row.id,fromSessionId:source.id,targetAgentId:handoff.target_agent_id})
    return row
  })
}

async function createDecision(h:Helpers, request:FastifyRequest, subject:Subject, subjectId:string) {
  const body=decisionInputSchema.parse(request.body)
  const current=actor(request)
  return command(h.db,h.meta(request,body,{id:subjectId}),async tx=>{
    const decisionSessionId=current.kind==='agent'
      ? current.agentSessionId
      : body.sessionId ?? (subject==='session' ? subjectId : null)
    if(current.kind==='agent') {
      if(!decisionSessionId) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH','Agent Decisions require a Session credential')
      const currentSession=await authorizeCommandInTx(tx,{
        actor:current,
        sessionId:decisionSessionId,
        capability:'work:write',
        operation:'decision',
        idempotencyKey:request.idempotencyKey!,
      })
      if(body.sessionId && body.sessionId!==decisionSessionId) throw new DomainError('AGENT_SESSION_TOKEN_MISMATCH','Decision sessionId must match the authenticated Agent Session')
      assertDecisionSubjectInSessionScope(currentSession,subject,subjectId)
    }
    const teamId=await subjectTeam(tx,current.workspaceId,subject,subjectId)
    if(current.kind==='human') {
      await assertHumanTeam(tx,current,teamId)
      if(decisionSessionId) await assertSessionWrite(tx,current,decisionSessionId)
    }
    const columns = subject === 'session'
      ? 'workspace_id,session_id,proposed_by_actor_id,title,rationale,options,selected_option,evidence,status,finalized_by_actor_id,finalized_at'
      : `workspace_id,${subject}_id,session_id,proposed_by_actor_id,title,rationale,options,selected_option,evidence,status,finalized_by_actor_id,finalized_at`
    const values = subject === 'session'
      ? [current.workspaceId,subjectId,current.id,body.title,body.rationale,JSON.stringify(body.options),body.selectedOption??null,JSON.stringify(body.evidence),current.kind==='human'?'final':'proposed',current.kind==='human'?current.id:null,current.kind==='human'?new Date():null]
      : [current.workspaceId,subjectId,decisionSessionId,current.id,body.title,body.rationale,JSON.stringify(body.options),body.selectedOption??null,JSON.stringify(body.evidence),current.kind==='human'?'final':'proposed',current.kind==='human'?current.id:null,current.kind==='human'?new Date():null]
    const row=(await tx.query(`INSERT INTO decisions(${columns}) VALUES(${values.map((_, index)=>`$${index+1}`).join(',')}) RETURNING *`,values)).rows[0] as {id:string}
    for (const resource of body.affectedResources) await tx.query('INSERT INTO decision_affected_resources(decision_id,resource_type,resource_id,impact) VALUES($1,$2,$3,$4)',[row.id,resource.resourceType,resource.resourceId,resource.impact])
    await emit(tx,h.meta(request,body), current.kind==='human'?'decision.finalized':'decision.proposed','decision',row.id,{subject,subjectId},teamId)
    return row
  })
}

async function acquireLease(h:Helpers,request:FastifyRequest) {
  const body=acquireLeaseInputSchema.parse(request.body)
  return command(h.db,h.meta(request,body),async tx=>{
    const s=await assertSessionWrite(tx,actor(request),body.sessionId)
    await assertLeaseResourceScope(tx, actor(request), s, body.resourceType, body.resourceId)
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor(request).workspaceId}:${body.resourceType}:${body.resourceId}`])
    if (s.work_item_id) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor(request).workspaceId}:work-item-executor:${s.work_item_id}`])
    }
    await tx.query("UPDATE leases SET status='expired',updated_at=now(),audit_reason=COALESCE(audit_reason,'expired before acquisition') WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3 AND status='active' AND expires_at<=now()",[actor(request).workspaceId,body.resourceType,body.resourceId])
    const conflicts=(await tx.query<{id:string;session_id:string;holder_actor_id:string;expires_at:Date;kind:string}>("SELECT id,session_id,holder_actor_id,expires_at,kind FROM leases WHERE workspace_id=$1 AND resource_type=$2 AND resource_id=$3 AND status='active' AND (kind='exclusive' OR $4::lease_kind='exclusive') FOR UPDATE",[actor(request).workspaceId,body.resourceType,body.resourceId,body.kind])).rows
    if(conflicts.length) throw new DomainError('LEASE_CONFLICT','Resource already leased',{holderSessionId:conflicts[0]!.session_id,holderActorId:conflicts[0]!.holder_actor_id,leaseId:conflicts[0]!.id,expiresAt:conflicts[0]!.expires_at,resourceType:body.resourceType,resourceId:body.resourceId})
    const row=(await tx.query("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7::text || ' seconds')::interval) RETURNING *",[actor(request).workspaceId,body.sessionId,body.resourceType,body.resourceId,body.kind,body.reason,body.ttlSeconds])).rows[0] as {id:string;version:number}
    await emit(tx,h.meta(request,body),'lease.acquired','lease',row.id,{sessionId:body.sessionId,resourceType:body.resourceType,resourceId:body.resourceId,kind:body.kind},s.team_id)
    return leaseResponse(row)
  })
}
async function leaseAction(h:Helpers,request:FastifyRequest,action:'heartbeat'|'renew'|'release'|'force-release') {
  const leaseId=id(request); const body=z.object({ttlSeconds:z.number().int().min(10).max(3600).optional(),reason:z.string().min(1).max(2000).optional()}).parse(request.body)
  if (action === 'heartbeat') {
    const meta = h.meta(request,body,{id:leaseId})
    return withTx(h.db, async tx => {
      const row=(await tx.query<{id:string;session_id:string;status:string;version:number;team_id:string;heartbeat_idempotency_key:string|null;heartbeat_request_hash:string|null}>(
        'SELECT l.*,s.team_id FROM leases l JOIN agent_sessions s ON s.id=l.session_id WHERE l.id=$1 AND l.workspace_id=$2 FOR UPDATE OF l',
        [leaseId,actor(request).workspaceId],
      )).rows[0]
      if(!row) throw new DomainError('NOT_FOUND','Lease not found')
      await assertSessionWrite(tx,actor(request),row.session_id)
      if(row.status!=='active') throw new DomainError('CONFLICT','Lease is not active')
      if (await isHeartbeatReplay(tx, {
        resourceKind: 'lease',
        resourceId: leaseId,
        idempotencyKey: meta.idempotencyKey,
        requestHash: meta.requestHash,
      })) {
        return leaseResponse(row)
      }
      const changed=(await tx.query<{version:number}>(
        `UPDATE leases
            SET heartbeat_at=now(),updated_at=now(),
                heartbeat_idempotency_key=$2,heartbeat_request_hash=$3
          WHERE id=$1 RETURNING *`,
        [leaseId,meta.idempotencyKey,meta.requestHash],
      )).rows[0]!
      await recordHeartbeatKey(tx, {
        resourceKind: 'lease',
        resourceId: leaseId,
        idempotencyKey: meta.idempotencyKey,
        requestHash: meta.requestHash,
      })
      return leaseResponse(changed)
    })
  }
  return command(h.db,h.meta(request,body,{id:leaseId}),async tx=>{
    const row=(await tx.query<{id:string;session_id:string;status:string;version:number;team_id:string}>('SELECT l.*,s.team_id FROM leases l JOIN agent_sessions s ON s.id=l.session_id WHERE l.id=$1 AND l.workspace_id=$2 FOR UPDATE OF l',[leaseId,actor(request).workspaceId])).rows[0]
    if(!row) throw new DomainError('NOT_FOUND','Lease not found')
    if(action==='force-release') {
      if(actor(request).kind!=='human') throw new DomainError('FORBIDDEN','Only humans can force release a lease')
      await assertHumanTeam(tx,actor(request),row.team_id)
      assertRevision(parseRevision(h.header(request,'if-match')),row.version)
      if(!body.reason) throw new DomainError('VALIDATION_ERROR','Force release requires an audit reason')
    } else {
      await assertSessionWrite(tx,actor(request),row.session_id)
      assertRevision(parseRevision(h.header(request,'if-match')),row.version)
    }
    if(action==='renew') {
      const changed=(await tx.query<{version:number}>("UPDATE leases SET expires_at=now()+($2::text || ' seconds')::interval,heartbeat_at=now(),renew_count=renew_count+1,version=version+1,updated_at=now() WHERE id=$1 AND status='active' AND expires_at>now() RETURNING *",[leaseId,body.ttlSeconds??300])).rows[0]
      if(!changed) throw new DomainError('LEASE_EXPIRED','Lease is not active or has expired')
      await emit(tx,h.meta(request,body),'lease.renewed','lease',leaseId,{ttlSeconds:body.ttlSeconds??300})
      return leaseResponse(changed)
    }
    const status=action==='force-release'?'revoked':'released'
    const changed=(await tx.query<{version:number}>('UPDATE leases SET status=$2,released_at=now(),released_by_actor_id=$3,audit_reason=$4,version=version+1,updated_at=now() WHERE id=$1 AND status=$5 RETURNING *',[leaseId,status,actor(request).id,body.reason??null,'active'])).rows[0]
    if(!changed) throw new DomainError('CONFLICT','Lease is no longer active')
    await emit(tx,h.meta(request,body),`lease.${status}`,'lease',leaseId,{reason:body.reason??null})
    return leaseResponse(changed)
  })
}

async function createChild(h:Helpers,request:FastifyRequest){
  const parentId=id(request); const body=z.object({agentId:uuid,planStepId:uuid,planVersionId:uuid,role:z.enum(['executor','reviewer','researcher']).default('executor'),initialPrompt:z.string().min(1).max(50000),required:z.boolean().default(true),budget:z.record(z.number()).optional()}).parse(request.body)
  return command(h.db,h.meta(request,body,{id:parentId}),async tx=>{
    const lockedTargets=await lockCollaborationSessionTargets(tx,actor(request),parentId,[body.agentId])
    const parent=await assertSessionWrite(tx,actor(request),parentId)
    const currentPlan=(await tx.query<{id:string}>('SELECT id FROM agent_plan_versions WHERE id=$1 AND session_id=$2 AND id=(SELECT current_plan_version_id FROM agent_sessions WHERE id=$2)',[body.planVersionId,parentId])).rows[0]
    if(!currentPlan) throw new DomainError('STALE_PLAN_VERSION','Child sessions must use the parent current plan version')
    const step=(await tx.query<{max_child_sessions:number}>('SELECT max_child_sessions FROM agent_plan_steps WHERE plan_version_id=$1 AND id=$2',[body.planVersionId,body.planStepId])).rows[0]
    if(!step) throw new DomainError('NOT_FOUND','Plan step is not part of the current plan version')
    const stable=(await tx.query('SELECT 1 FROM agent_plan_step_identities WHERE session_id=$1 AND stable_step_id=$2',[parentId,body.planStepId])).rowCount
    if(!stable) throw new DomainError('PLAN_STEP_IDENTITY_MISSING','Plan step does not have a stable identity for this session')
    const count=(await tx.query<{count:number}>(`SELECT count(*)::int AS count FROM agent_sessions session WHERE session.parent_session_id=$1 AND ${agentExecutionCapacitySqlPredicate('session')}`,[parentId])).rows[0]!.count
    if(count>=parent.max_child_sessions)throw new DomainError('CHILD_SESSION_LIMIT','Parent child-session limit reached',{maxChildren:parent.max_child_sessions,activeChildren:count})
    const stepCount=(await tx.query<{count:number}>(`SELECT count(*)::int AS count FROM agent_sessions session WHERE session.parent_session_id=$1 AND session.plan_step_id=$2 AND session.plan_step_version_id=$3 AND ${agentExecutionCapacitySqlPredicate('session')}`,[parentId,body.planStepId,body.planVersionId])).rows[0]!.count
    if(stepCount>=step.max_child_sessions)throw new DomainError('PLAN_STEP_CHILD_SESSION_LIMIT','Plan step child-session limit reached',{maxChildren:step.max_child_sessions,activeChildren:stepCount})
    const agent=(await tx.query<{id:string;actor_id:string;approved_capabilities:string[]}>("SELECT id,actor_id,approved_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active=true",[body.agentId,actor(request).workspaceId])).rows[0]
    if(!agent)throw new DomainError('NOT_FOUND','Target agent not found')
    const access=(await tx.query<{approved_capabilities:string[]}>('SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL',[actor(request).workspaceId,agent.id,parent.team_id])).rows[0]
    const parentGrant=(await tx.query<{permissions_snapshot:string[]}>('SELECT permissions_snapshot FROM delegations WHERE id=$1 AND status=$2',[parent.delegation_id,'active'])).rows[0]
    const caps=['work:read','work:write']; if(!parentGrant || !access || !caps.every(cap=>parentGrant.permissions_snapshot.includes(cap)&&agent.approved_capabilities.includes(cap)&&access.approved_capabilities.includes(cap)))throw new DomainError('CAPABILITY_DENIED','Child capabilities must be authorized by the parent delegation, target agent, and team grant')
    await assertAgentExecutionCapacityAfterLock(tx,{workspaceId:actor(request).workspaceId,agentId:agent.id})
    const budget=inheritChildBudget(parent.budget as Record<string,number>,body.budget??{})
    const reservations=(await tx.query<{reserved:Record<string,number>}>('SELECT reserved FROM session_budget_reservations WHERE parent_session_id=$1 AND status=$2 FOR UPDATE',[parentId,'reserved'])).rows
    for(const [key,value] of Object.entries(budget)){const used=reservations.reduce((sum,row)=>sum+Number(row.reserved[key]??0),0);const cap=Number((parent.budget as Record<string,number>)[key]??Infinity);if(used+Number(value)>cap)throw new DomainError('CHILD_BUDGET_EXCEEDED','Child budget exceeds parent reservation',{key,used,requested:value,cap})}
    const delegation=(await tx.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,parent_delegation_id) SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,d.principal_human_actor_id,NULL,$5::delegation_role,'plan_step',$6::uuid,$7::text[],jsonb_build_object('workspaceId',$1::uuid,'teamIds',jsonb_build_array($2::uuid),'workItemIds',jsonb_build_array(s.work_item_id),'projectIds','[]'::jsonb,'repositoryIds','[]'::jsonb,'capabilities',$7::text[]),s.delegation_id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id WHERE s.id=$8::uuid RETURNING id",[actor(request).workspaceId,parent.team_id,agent.id,agent.actor_id,body.role,body.planStepId,caps,parentId])).rows[0] as {id:string}
    const child=(await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,parent_session_id,work_item_id,plan_step_id,plan_step_version_id,context_snapshot_id,state,state_reason,budget,inherited_budget,required_for_parent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',$11,$12,$12,$13) RETURNING *",[actor(request).workspaceId,parent.team_id,agent.id,agent.actor_id,delegation.id,parentId,parent.work_item_id,body.planStepId,body.planVersionId,parent.context_snapshot_id,body.initialPrompt,budget,body.required])).rows[0]as{id:string}
    await tx.query('INSERT INTO session_budget_reservations(parent_session_id,child_session_id,allocation,reserved) VALUES($1,$2,$3,$3)',[parentId,child.id,budget])
    await tx.query("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'session',$2,$3) ON CONFLICT DO NOTHING",[actor(request).workspaceId,child.id,parent.team_id])
    await tx.query('INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)',[child.id,actor(request).id,body.initialPrompt])
    await tx.query('INSERT INTO routing_records(workspace_id,source_session_id,target_agent_id,required_capabilities,outcome,sort_rank,rationale) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor(request).workspaceId,parentId,agent.id,caps,'selected',1,{rule:'exact-agent',budgetReserved:budget}])
    const installationAuthority=lockedTargets.installationAuthorities.get(agent.id)
    if(!installationAuthority) throw new DomainError('NOT_FOUND','Active installation token not found for the exact child Session authority')
    await provisionNewSessionDelivery(tx,h.meta(request,body),{sessionId:child.id,agentId:agent.id,delegationId:delegation.id,teamId:parent.team_id,workItemId:parent.work_item_id,initialPrompt:body.initialPrompt,installationAuthority})
    await emit(tx,h.meta(request,body),'agent.session.child_created','agent_session',child.id,{parentSessionId:parentId,planStepId:body.planStepId,required:body.required},parent.team_id);return child
  })
}

async function appendDelta(h:Helpers,request:FastifyRequest){
  const sessionId=id(request); const body=contextDeltaInputSchema.parse(request.body)
  return command(h.db,h.meta(request,body,{id:sessionId}),async tx=>{
    const s=await assertSessionWrite(tx,actor(request),sessionId)
    if(s.work_item_id && !s.work_item_exists) throw new DomainError('RESOURCE_SCOPE_DENIED','Context sources require the current live session Work Item')
    const effectiveProjectId=s.work_item_id ? s.work_item_project_id : s.project_id
    const base=(await tx.query<{work_item_id:string|null;manifest:unknown;sources:unknown}>('SELECT work_item_id,manifest,sources FROM context_snapshots WHERE id=$1 AND workspace_id=$2 AND work_item_id IS NOT DISTINCT FROM $3',[body.baseSnapshotId,actor(request).workspaceId,s.work_item_id])).rows[0]
    if(!base)throw new DomainError('RESOURCE_SCOPE_DENIED','Base context snapshot is outside this session scope')
    const resolvedAdditions:Array<Record<string,unknown>>=[]
    for(const addition of body.additions) {
      if (addition.sourceType!=='guidance' && (!addition.sourceId || addition.uri)) throw new DomainError('VALIDATION_ERROR','Internal context additions require only an authorized source id')
      if (addition.sourceType==='guidance') {
        if (addition.sourceId || !addition.uri) throw new DomainError('VALIDATION_ERROR','Guidance context additions require only an authorized WorkMesh URI')
        const uri=new URL(addition.uri); const workspaceUri=`workmesh://workspace/${actor(request).workspaceId}/guidance`; const teamUri=`workmesh://team/${s.team_id}/guidance`; const projectUri=effectiveProjectId?`workmesh://project/${effectiveProjectId}/guidance`:null
        if (![workspaceUri,teamUri,projectUri].includes(uri.toString().replace(/\/$/,''))) throw new DomainError('RESOURCE_SCOPE_DENIED','Guidance URI is outside the session scope')
        const normalized=uri.toString().replace(/\/$/,'')
        const target=normalized===workspaceUri
          ? {scope:'workspace' as const,id:actor(request).workspaceId}
          : normalized===teamUri
            ? {scope:'team' as const,id:s.team_id}
            : {scope:'project' as const,id:effectiveProjectId!}
        const guidance=await readGuidance(tx,actor(request).workspaceId,target.scope,target.id)
        if(guidance.status!=='active'||!guidance.currentRevision) throw new DomainError('NOT_FOUND','Guidance is not currently published')
        if (addition.hash!==guidance.currentRevision.contentHash) throw new DomainError('VALIDATION_ERROR','Guidance hash does not match the authorized source')
        resolvedAdditions.push({...addition,scope:target.scope,scopeId:target.id,revisionId:guidance.currentRevision.id,revisionNumber:guidance.currentRevision.revisionNumber})
        continue
      }
      if(addition.sourceType==='artifact' && addition.sourceId) {
        const found=(await tx.query<{checksum:string|null}>('SELECT checksum FROM artifacts WHERE id=$1 AND workspace_id=$2 AND (session_id=$3 OR work_item_id=$4)',[addition.sourceId,actor(request).workspaceId,sessionId,s.work_item_id])).rows[0]
        if(!found)throw new DomainError('RESOURCE_SCOPE_DENIED','Context artifact is not readable by this session')
        if(found.checksum && found.checksum!==addition.hash) throw new DomainError('VALIDATION_ERROR','Context artifact hash does not match its immutable checksum')
      } else if(addition.sourceType==='work_item' && addition.sourceId!==s.work_item_id) throw new DomainError('RESOURCE_SCOPE_DENIED','Context work item must match the session work item')
      else if(addition.sourceType==='plan_step' && addition.sourceId) await assertLeaseResourceScope(tx,actor(request),s,'plan_step',addition.sourceId)
      else if(addition.sourceType==='message' && addition.sourceId) {
        const found=await tx.query("SELECT 1 FROM room_messages m JOIN work_room_channels c ON c.id=m.channel_id WHERE m.id=$1 AND m.workspace_id=$2 AND (c.subject_kind='work_item' AND c.subject_id=$3 OR c.subject_kind='session' AND c.subject_id=$4 OR c.subject_kind='project' AND c.subject_id=$5)",[addition.sourceId,actor(request).workspaceId,s.work_item_id,sessionId,effectiveProjectId])
        if(!found.rowCount)throw new DomainError('RESOURCE_SCOPE_DENIED','Context message is not readable by this session')
      }
      resolvedAdditions.push(addition)
    }
    const hash='sha256:'+createHash('sha256').update(JSON.stringify({base:body.baseSnapshotId,additions:resolvedAdditions})).digest('hex');const history={kind:'delta',baseSnapshotId:body.baseSnapshotId,sessionId};const additionsJson=JSON.stringify(resolvedAdditions)
    const snap=(await tx.query("INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,sources,content_hash,token_estimate,truncation,created_by_actor_id,parent_snapshot_id,snapshot_kind,history_link) VALUES($1,$2,$3,$4::jsonb,$5,0,$6,$7,$8,'delta',$9) RETURNING *",[actor(request).workspaceId,s.work_item_id,{baseSnapshotId:body.baseSnapshotId,additions:resolvedAdditions},additionsJson,hash,{reason:'stage2_delta'},actor(request).id,body.baseSnapshotId,history])).rows[0]as{id:string}
    const delta=(await tx.query('INSERT INTO context_deltas(session_id,base_snapshot_id,source_snapshot_id,additions,content_hash,rationale,history_link,created_by_actor_id) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8) RETURNING *',[sessionId,body.baseSnapshotId,snap.id,additionsJson,hash,body.rationale,history,actor(request).id])).rows[0]
    await tx.query('UPDATE agent_sessions SET context_snapshot_id=$2,revision=revision+1,updated_at=now() WHERE id=$1',[sessionId,snap.id]);await emit(tx,h.meta(request,body),'context.delta.appended','context_delta',(delta as {id:string}).id,{sessionId,snapshotId:snap.id},s.team_id);return {snapshot:snap,delta}
  })
}

async function createReview(h:Helpers,request:FastifyRequest) {
  const sessionId=id(request); const body=z.object({reviewerAgentId:uuid,planStepId:uuid,planVersionId:uuid,initialPrompt:z.string().min(1).max(50000),ttlSeconds:z.number().int().min(10).max(3600).default(300)}).parse(request.body)
  return command(h.db,h.meta(request,body,{id:sessionId}),async tx=>{
    const lockedTargets=await lockCollaborationSessionTargets(tx,actor(request),sessionId,[body.reviewerAgentId])
    const parent=await assertSessionWrite(tx,actor(request),sessionId)
    const plan=(await tx.query('SELECT 1 FROM agent_plan_versions WHERE id=$1 AND session_id=$2 AND id=(SELECT current_plan_version_id FROM agent_sessions WHERE id=$2)',[body.planVersionId,sessionId])).rowCount
    const step=(await tx.query('SELECT 1 FROM agent_plan_steps WHERE plan_version_id=$1 AND id=$2',[body.planVersionId,body.planStepId])).rowCount
    const stable=(await tx.query('SELECT 1 FROM agent_plan_step_identities WHERE session_id=$1 AND stable_step_id=$2',[sessionId,body.planStepId])).rowCount
    if(!plan || !step || !stable) throw new DomainError('STALE_PLAN_VERSION','Review must target a stable step in the current plan')
    const target=(await tx.query<{id:string;actor_id:string;approved_capabilities:string[]}>('SELECT id,actor_id,approved_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active=true',[body.reviewerAgentId,actor(request).workspaceId])).rows[0]
    if(!target) throw new DomainError('NOT_FOUND','Reviewer agent not found')
    const access=(await tx.query<{approved_capabilities:string[]}>('SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL',[actor(request).workspaceId,target.id,parent.team_id])).rows[0]
    const source=(await tx.query<{principal_human_actor_id:string;capability_scope:Record<string,unknown>;permissions_snapshot:string[]}>('SELECT principal_human_actor_id,capability_scope,permissions_snapshot FROM delegations WHERE id=$1 AND status=$2',[parent.delegation_id,'active'])).rows[0]
    // `work:write` is a narrow, plan-step-scoped delegation capability needed
    // for ACK/state/heartbeat protocol writes. Reviewers still lack plan:write.
    const reviewCaps=['work:read','work:write','artifact:write']
    if(!source || !access || !reviewCaps.every(cap=>source.permissions_snapshot.includes(cap)&&target.approved_capabilities.includes(cap)&&access.approved_capabilities.includes(cap))) throw new DomainError('CAPABILITY_DENIED','Review capabilities must be authorized by the parent delegation, reviewer, and team grant')
    await assertAgentExecutionCapacityAfterLock(tx,{workspaceId:actor(request).workspaceId,agentId:target.id})
    const delegation=(await tx.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,parent_delegation_id) VALUES($1,$2,$3,$4,$5,NULL,'reviewer','plan_step',$6,$7,$8,$9) RETURNING id",[actor(request).workspaceId,parent.team_id,target.id,target.actor_id,source.principal_human_actor_id,body.planStepId,reviewCaps,{...source.capability_scope,capabilities:reviewCaps},parent.delegation_id])).rows[0] as {id:string}
    const child=(await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,parent_session_id,work_item_id,plan_step_id,plan_step_version_id,context_snapshot_id,state,state_reason,budget,inherited_budget,required_for_parent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',$11,$12,$12,true) RETURNING *",[actor(request).workspaceId,parent.team_id,target.id,target.actor_id,delegation.id,parent.id,parent.work_item_id,body.planStepId,body.planVersionId,parent.context_snapshot_id,body.initialPrompt,parent.budget])).rows[0] as {id:string}
    await tx.query("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'session',$2,$3) ON CONFLICT DO NOTHING",[actor(request).workspaceId,child.id,parent.team_id])
    await tx.query('INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)',[child.id,actor(request).id,body.initialPrompt])
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${actor(request).workspaceId}:plan_step:${body.planStepId}`])
    await tx.query("UPDATE leases SET status='expired',updated_at=now(),audit_reason=COALESCE(audit_reason,'expired before review delegation') WHERE workspace_id=$1 AND resource_type='plan_step' AND resource_id=$2 AND status='active' AND expires_at<=now()",[actor(request).workspaceId,body.planStepId])
    const conflict=(await tx.query("SELECT id FROM leases WHERE workspace_id=$1 AND resource_type='plan_step' AND resource_id=$2 AND status='active' AND kind='exclusive' FOR UPDATE",[actor(request).workspaceId,body.planStepId])).rows[0]
    if(conflict) throw new DomainError('LEASE_CONFLICT','Plan step is exclusively leased')
    const reviewLease=(await tx.query("INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,'plan_step',$3,'review_shared','review delegation',now()+($4::text || ' seconds')::interval) RETURNING *",[actor(request).workspaceId,child.id,body.planStepId,body.ttlSeconds])).rows[0] as {id:string}
    const installationAuthority=lockedTargets.installationAuthorities.get(target.id)
    if(!installationAuthority) throw new DomainError('NOT_FOUND','Active installation token not found for the exact review Session authority')
    await provisionNewSessionDelivery(tx,h.meta(request,body),{sessionId:child.id,agentId:target.id,delegationId:delegation.id,teamId:parent.team_id,workItemId:parent.work_item_id,initialPrompt:body.initialPrompt,installationAuthority})
    await emit(tx,h.meta(request,body),'review.delegation.created','lease',reviewLease.id,{sessionId,childSessionId:child.id,planStepId:body.planStepId},parent.team_id)
    return {session:child,lease:reviewLease}
  })
}

async function offerHandoff(h:Helpers,request:FastifyRequest) {
  const body=handoffInputSchema.parse(request.body)
  return command(h.db,h.meta(request,body),async tx=>{
    await lockCollaborationSessionTargets(
      tx,
      actor(request),
      body.fromSessionId,
      body.targetAgentId ? [body.targetAgentId] : [],
    )
    const s=await assertSessionWrite(tx,actor(request),body.fromSessionId)
    const scopeType=body.scopeType ?? 'work_item'; const scopeId=body.scopeId ?? s.work_item_id
    if (!scopeId) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff scope must resolve within the source session')
    if (scopeType === 'workspace') throw new DomainError('VALIDATION_ERROR','Workspace-scoped handoffs are not supported')
    if (scopeType === 'work_item' && (!s.work_item_exists || scopeId !== s.work_item_id)) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff work-item scope must match the live source session Work Item')
    if (scopeType === 'project' && (s.work_item_id ? !s.work_item_exists || scopeId !== s.work_item_project_id : scopeId !== s.project_id)) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff project scope must match the source session')
    if (scopeType === 'plan_step') await assertLeaseResourceScope(tx,actor(request),s,'plan_step',scopeId)
    const sourceGrant=(await tx.query<{permissions_snapshot:string[]}>("SELECT permissions_snapshot FROM delegations WHERE id=$1 AND status='active'",[s.delegation_id])).rows[0]
    if(!sourceGrant) throw new DomainError('DELEGATION_NOT_ACTIVE','Handoff source delegation is unavailable')
    const required=body.requestedCapabilities.length?body.requestedCapabilities:sourceGrant.permissions_snapshot
    if(!required.includes('work:read')) throw new DomainError('CAPABILITY_DENIED','Handoff inspection requires delegated work:read')
    if(body.targetAgentId) await assertExactHandoffTargetAccess(tx,actor(request).workspaceId,s.team_id,body.targetAgentId,required)
    const baseSnapshotId=body.contextSnapshotId ?? (await tx.query<{context_snapshot_id:string|null}>('SELECT context_snapshot_id FROM agent_sessions WHERE id=$1',[s.id])).rows[0]?.context_snapshot_id
    if (!baseSnapshotId) throw new DomainError('CONTEXT_SNAPSHOT_REQUIRED','Handoff requires a source context snapshot')
    const base=(await tx.query<{manifest:unknown;sources:unknown;content_hash:string}>('SELECT manifest,sources,content_hash FROM context_snapshots WHERE id=$1 AND workspace_id=$2 AND work_item_id IS NOT DISTINCT FROM $3',[baseSnapshotId,actor(request).workspaceId,s.work_item_id])).rows[0]
    if (!base) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff context snapshot is outside the source work scope')
    const snapshotHash=`sha256:${createHash('sha256').update(JSON.stringify({baseSnapshotId,summary:body.summary,nonce:randomUUID()})).digest('hex')}`
    const snapshot=(await tx.query("INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,sources,content_hash,token_estimate,truncation,created_by_actor_id,parent_snapshot_id,snapshot_kind,history_link) VALUES($1,$2,$3::jsonb,$4::jsonb,$5,0,$6::jsonb,$7,$8,'handoff',$9::jsonb) RETURNING id",[
      actor(request).workspaceId,
      s.work_item_id,
      JSON.stringify({baseSnapshotId,manifest:base.manifest,handoff:{summary:body.summary,completedWork:body.completedWork,remainingWork:body.remainingWork,openQuestions:body.openQuestions,risks:body.risks,acceptanceCriteria:body.acceptanceCriteria}}),
      JSON.stringify(base.sources),
      snapshotHash,
      JSON.stringify({reason:'handoff'}),
      actor(request).id,
      baseSnapshotId,
      JSON.stringify({kind:'handoff',baseSnapshotId,fromSessionId:s.id}),
    ])).rows[0] as {id:string}
    const row=(await tx.query(`INSERT INTO handoffs(workspace_id,from_session_id,target_agent_id,target_skill,scope_type,scope_id,summary,completed_work,remaining_work,open_questions,risks,acceptance_criteria,requested_action,lease_transfer_policy,artifact_ids,context_snapshot_id,requested_capabilities,status,requested_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::handoff_status,CASE WHEN $18::handoff_status='requested'::handoff_status THEN now() ELSE NULL END) RETURNING *`,[
      actor(request).workspaceId,body.fromSessionId,body.targetAgentId??null,body.targetSkill??null,scopeType,scopeId,body.summary,JSON.stringify(body.completedWork),JSON.stringify(body.remainingWork),JSON.stringify(body.openQuestions),JSON.stringify(body.risks),JSON.stringify(body.acceptanceCriteria),body.requestedAction??null,body.leaseTransferPolicy,body.artifactIds,snapshot.id,body.requestedCapabilities,body.status
    ])).rows[0] as {id:string}
    const responsible=(await tx.query<{responsible_human_actor_id:string}>('SELECT responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2',[s.work_item_id,actor(request).workspaceId])).rows[0]?.responsible_human_actor_id
    if (body.status==='requested') await inbox(tx,h.meta(request,body),{recipient:responsible,sourceSessionId:body.fromSessionId,teamId:s.team_id,kind:'handoff',sourceType:'handoff',sourceId:row.id,payload:{fromSessionId:body.fromSessionId,targetAgentId:body.targetAgentId,targetSkill:body.targetSkill}})
    const eventId=await emit(tx,h.meta(request,body),`handoff.${body.status}`,'handoff',row.id,{fromSessionId:body.fromSessionId,leaseTransferPolicy:body.leaseTransferPolicy},s.team_id)
    if (body.status==='requested' && body.targetAgentId) await queueWebhookDeliveries(tx,body.targetAgentId,eventId,'handoff.requested',undefined,{handoffId:row.id,fromSessionId:body.fromSessionId,targetAgentId:body.targetAgentId})
    return row
  })
}
async function recordHandoffRoutingAttempt(h: Helpers, request: FastifyRequest, handoffId: string, input: { agentId?: string }) {
  if (actor(request).kind !== 'human') throw new DomainError('FORBIDDEN','Human acceptance is required')
  const attemptKey=h.meta(request,input,{id:handoffId}).idempotencyKey
  await withTx(h.db, async tx => {
    const replay=await tx.query('SELECT 1 FROM api_idempotency_keys WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3',[actor(request).workspaceId,actor(request).id,attemptKey])
    if(replay.rowCount) return
    const handoff=(await tx.query<{from_session_id:string;target_agent_id:string|null;target_skill:string|null;status:string;requested_capabilities:string[]}>('SELECT from_session_id,target_agent_id,target_skill,status,requested_capabilities FROM handoffs WHERE id=$1 AND workspace_id=$2 FOR SHARE',[handoffId,actor(request).workspaceId])).rows[0]
    if(!handoff) throw new DomainError('NOT_FOUND','Handoff not found')
    const source=await session(tx,actor(request).workspaceId,handoff.from_session_id); await assertHumanTeam(tx,actor(request),source.team_id)
    if(['stopping','completed','failed','canceled'].includes(source.state)) throw new DomainError('SESSION_NOT_ACTIVE','Handoff source session is not active')
    if(handoff.status!=='requested') throw new DomainError('CONFLICT','Handoff is no longer pending')
    if(handoff.target_agent_id && input.agentId && input.agentId!==handoff.target_agent_id) throw new DomainError('ROUTING_TARGET_LOCKED','An exact-target handoff cannot be re-routed during acceptance')
    const sourceDel=(await tx.query<{permissions_snapshot:string[]}>('SELECT permissions_snapshot FROM delegations WHERE id=$1 AND status=\'active\'',[source.delegation_id])).rows[0]
    if(!sourceDel) throw new DomainError('DELEGATION_NOT_ACTIVE','Handoff source delegation is unavailable')
    const required=handoff.requested_capabilities.length?handoff.requested_capabilities:sourceDel.permissions_snapshot
    const exactId=handoff.target_agent_id??input.agentId
    const capacityPredicate=agentExecutionCapacitySqlPredicate('s')
    const candidates=(await tx.query<{id:string}>(exactId ? `SELECT a.id FROM agent_definitions a JOIN agent_team_access ata ON ata.agent_id=a.id AND ata.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2 AND a.is_active AND ata.team_id=$3 AND ata.revoked_at IS NULL AND a.approved_capabilities @> $4::text[] AND ata.approved_capabilities @> $4::text[] AND (SELECT count(*) FROM agent_sessions s WHERE s.agent_id=a.id AND ${capacityPredicate})<a.max_concurrency` : `SELECT a.id FROM agent_definitions a JOIN agent_team_access ata ON ata.agent_id=a.id AND ata.workspace_id=a.workspace_id WHERE a.workspace_id=$1 AND a.is_active AND ata.team_id=$2 AND ata.revoked_at IS NULL AND a.skills @> ARRAY[$3]::text[] AND a.approved_capabilities @> $4::text[] AND ata.approved_capabilities @> $4::text[] AND (SELECT count(*) FROM agent_sessions s WHERE s.agent_id=a.id AND ${capacityPredicate})<a.max_concurrency ORDER BY (SELECT count(*) FROM agent_sessions s WHERE s.agent_id=a.id AND ${capacityPredicate}),a.slug,a.id`,exactId?[exactId,actor(request).workspaceId,source.team_id,required]:[actor(request).workspaceId,source.team_id,handoff.target_skill,required])).rows
    const selected=candidates[0]?.id??null; const outcome=selected?'selected':'no_candidate'
    await tx.query("INSERT INTO routing_attempts(workspace_id,handoff_id,source_session_id,attempt_key,requested_skill,required_capabilities,candidate_count,selected_agent_id,outcome,failure_code,rationale) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(workspace_id,handoff_id,attempt_key) DO NOTHING",[actor(request).workspaceId,handoffId,source.id,attemptKey,handoff.target_skill,required,candidates.length,selected,outcome,selected?null:'ROUTING_TARGET_REQUIRED',{rule:'preflight',exactTargetId:exactId,candidateIds:candidates.map(candidate=>candidate.id)}])
  })
}
async function acceptHandoff(h:Helpers,request:FastifyRequest) {
  const handoffId=id(request); const body=z.object({agentId:uuid.optional(),initialPrompt:z.string().min(1).max(50000).default('Accepted handoff'),failureInjection:z.enum(['afterSession']).optional()}).parse(request.body)
  await recordHandoffRoutingAttempt(h,request,handoffId,body)
  return command(h.db,h.meta(request,body,{id:handoffId}),async tx=>{
    if(actor(request).kind!=='human') throw new DomainError('FORBIDDEN','Human acceptance is required')
    if (body.failureInjection && process.env.RUN_INTEGRATION !== '1') throw new DomainError('FORBIDDEN','Failure injection is available only in integration tests')
    const handoffLocator=(await tx.query<{
      from_session_id:string
      target_agent_id:string|null
      target_skill:string|null
    }>('SELECT from_session_id,target_agent_id,target_skill FROM handoffs WHERE id=$1 AND workspace_id=$2',[handoffId,actor(request).workspaceId])).rows[0]
    if(!handoffLocator) throw new DomainError('NOT_FOUND','Handoff not found')
    const targetAgentIds=handoffLocator.target_agent_id||body.agentId
      ? [handoffLocator.target_agent_id??body.agentId!]
      : handoffLocator.target_skill
        ? (await tx.query<{id:string}>(
            'SELECT id FROM agent_definitions WHERE workspace_id=$1',
            [actor(request).workspaceId],
          )).rows.map(row=>row.id)
        : []
    const lockedTargets=await lockCollaborationSessionTargets(
      tx,
      actor(request),
      handoffLocator.from_session_id,
      targetAgentIds,
    )
    const handoff=(await tx.query<{from_session_id:string;target_agent_id:string|null;target_skill:string|null;status:string;scope_type:'project'|'work_item'|'plan_step'|null;scope_id:string|null;requested_capabilities:string[];lease_transfer_policy:'retain'|'transfer'|'release';context_snapshot_id:string|null}>('SELECT * FROM handoffs WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[handoffId,actor(request).workspaceId])).rows[0]
    if(!handoff) throw new DomainError('NOT_FOUND','Handoff not found')
    if(handoff.from_session_id!==handoffLocator.from_session_id||handoff.target_agent_id!==handoffLocator.target_agent_id||handoff.target_skill!==handoffLocator.target_skill)
      throw new DomainError('CONFLICT','Handoff routing changed while authority was acquired')
    if(handoff.status!=='requested') throw new DomainError('CONFLICT','Handoff is no longer pending')
    const source=await session(tx,actor(request).workspaceId,handoff.from_session_id); await assertHumanTeam(tx,actor(request),source.team_id)
    if(['stopping','completed','failed','canceled'].includes(source.state)) throw new DomainError('SESSION_NOT_ACTIVE','Handoff source session is not active')
    const sourceDel=(await tx.query<{principal_human_actor_id:string;permissions_snapshot:string[];capability_scope:Record<string,unknown>}>('SELECT principal_human_actor_id,permissions_snapshot,capability_scope FROM delegations WHERE id=$1 AND status=\'active\' FOR UPDATE',[source.delegation_id])).rows[0]
    if(!sourceDel) throw new DomainError('DELEGATION_NOT_ACTIVE','Handoff source delegation is unavailable')
    const requested=handoff.requested_capabilities.length ? handoff.requested_capabilities : sourceDel.permissions_snapshot
    if (handoff.target_agent_id && body.agentId && body.agentId!==handoff.target_agent_id) throw new DomainError('ROUTING_TARGET_LOCKED','An exact-target handoff cannot be re-routed during acceptance')
    let targetId=handoff.target_agent_id??body.agentId
    if (!targetId && handoff.target_skill) {
      const candidates=(await tx.query<{id:string;slug:string;active_sessions:number;max_concurrency:number}>(`
        SELECT a.id,a.slug,a.max_concurrency,
          (SELECT count(*)::int FROM agent_sessions active
           WHERE active.agent_id=a.id AND ${agentExecutionCapacitySqlPredicate('active')}) AS active_sessions
        FROM agent_definitions a
        JOIN agent_team_access ata ON ata.agent_id=a.id AND ata.workspace_id=a.workspace_id
        WHERE a.workspace_id=$1 AND a.is_active=true
          AND ata.team_id=$2 AND ata.revoked_at IS NULL
          AND a.skills @> ARRAY[$3]::text[]
          AND a.approved_capabilities @> $4::text[]
          AND ata.approved_capabilities @> $4::text[]
          AND (SELECT count(*) FROM agent_sessions active
               WHERE active.agent_id=a.id AND ${agentExecutionCapacitySqlPredicate('active')}) < a.max_concurrency
        ORDER BY active_sessions,a.slug,a.id
        `,[actor(request).workspaceId,source.team_id,handoff.target_skill,requested])).rows
      for (let index=0; index<candidates.length; index++) await tx.query("INSERT INTO routing_records(workspace_id,source_session_id,target_agent_id,requested_skill,required_capabilities,outcome,sort_rank,rationale) VALUES($1,$2,$3,$4,$5,'candidate',$6,$7)",[actor(request).workspaceId,source.id,candidates[index]!.id,handoff.target_skill,requested,index+1,{rule:'skill+capability+team+status+concurrency',activeSessions:candidates[index]!.active_sessions,maxConcurrency:candidates[index]!.max_concurrency,slug:candidates[index]!.slug}])
      targetId=candidates[0]?.id
      if(!targetId) throw new DomainError('ROUTING_TARGET_REQUIRED','No active, team-authorized agent matches the requested skill')
      await tx.query('UPDATE handoffs SET routing_snapshot=$2 WHERE id=$1',[handoffId,{requestedSkill:handoff.target_skill,requiredCapabilities:requested,candidateIds:candidates.map(candidate=>candidate.id),selectedAgentId:targetId,ordering:['active_sessions','slug','id'],filters:['skill','capability','team_access','active_status','concurrency']}])
    }
    if(!targetId) throw new DomainError('ROUTING_TARGET_REQUIRED','A handoff target must be selected')
    const target=(await tx.query<{id:string;actor_id:string;approved_capabilities:string[];skills:string[];slug:string}>('SELECT id,actor_id,approved_capabilities,skills,slug FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active=true',[targetId,actor(request).workspaceId])).rows[0]
    if(!target) throw new DomainError('NOT_FOUND','Target agent not found')
    if(handoff.target_skill && !target.skills.includes(handoff.target_skill)) throw new DomainError('CAPABILITY_DENIED','Selected handoff target does not advertise the requested skill')
    const teamAccess=(await tx.query<{approved_capabilities:string[]}>('SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL',[actor(request).workspaceId,target.id,source.team_id])).rows[0]
    if(!teamAccess) throw new DomainError('CAPABILITY_DENIED','Target agent is not authorized for the source team')
    const capacity=await assertAgentExecutionCapacityAfterLock(tx,{workspaceId:actor(request).workspaceId,agentId:target.id})
    const caps=requested.filter(cap=>sourceDel.permissions_snapshot.includes(cap) && target.approved_capabilities.includes(cap) && teamAccess.approved_capabilities.includes(cap))
    if(caps.length!==requested.length) throw new DomainError('CAPABILITY_DENIED','Handoff target lacks requested capabilities')
    if(!caps.includes('work:write')) throw new DomainError('CAPABILITY_DENIED','Accepted handoff sessions require scoped work:write for lifecycle protocol operations')
    if (!handoff.target_skill) await tx.query('UPDATE handoffs SET routing_snapshot=$2 WHERE id=$1',[handoffId,{exactAgentId:target.id,requiredCapabilities:requested,selectedAgentId:target.id,filters:['capability','team_access','active_status','concurrency'],activeSessions:capacity.activeExecutionSessionCount,maxConcurrency:capacity.maxConcurrency,slug:target.slug}])
    if (handoff.context_snapshot_id) {
      const context=(await tx.query('SELECT 1 FROM context_snapshots WHERE id=$1 AND workspace_id=$2 AND work_item_id IS NOT DISTINCT FROM $3',[handoff.context_snapshot_id,actor(request).workspaceId,source.work_item_id])).rowCount
      if(!context) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff context snapshot is outside the source work scope')
    }
    const scopeType=handoff.scope_type ?? 'work_item'; const scopeId=handoff.scope_id ?? source.work_item_id
    if (!scopeId || (scopeType==='work_item' && (!source.work_item_exists || scopeId!==source.work_item_id)) || (scopeType==='project' && (source.work_item_id ? !source.work_item_exists || scopeId!==source.work_item_project_id : scopeId!==source.project_id))) throw new DomainError('RESOURCE_SCOPE_DENIED','Handoff scope is outside the source session')
    if (scopeType==='plan_step') await assertLeaseResourceScope(tx,actor(request),source,'plan_step',scopeId)
    // The active-executor uniqueness constraint is per work item.  This is safe
    // before child creation because the entire accepted-handoff transition is one transaction.
    const completedSource=await tx.query("UPDATE delegations SET status='completed',revision=revision+1,updated_at=now() WHERE id=$1 AND status='active' RETURNING id",[source.delegation_id])
    if(!completedSource.rowCount) throw new DomainError('DELEGATION_NOT_ACTIVE','Handoff source delegation is no longer active')
    const planStepVersionId = scopeType==='plan_step' ? (await tx.query<{id:string}>('SELECT id FROM agent_plan_versions WHERE session_id=$1 AND id=(SELECT current_plan_version_id FROM agent_sessions WHERE id=$1) AND EXISTS(SELECT 1 FROM agent_plan_steps WHERE plan_version_id=agent_plan_versions.id AND id=$2)',[source.id,scopeId])).rows[0]?.id : null
    if(scopeType==='plan_step' && !planStepVersionId) throw new DomainError('STALE_PLAN_VERSION','Handoff plan step is no longer in the source current plan')
    const del=(await tx.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,parent_delegation_id) VALUES($1,$2,$3,$4,$5,$6,'executor',$7,$8,$9,$10,$11) RETURNING id",[actor(request).workspaceId,source.team_id,target.id,target.actor_id,sourceDel.principal_human_actor_id,source.work_item_id,scopeType,scopeId,caps,{...sourceDel.capability_scope,capabilities:caps},source.delegation_id])).rows[0] as {id:string}
    const childProjectId=source.work_item_id ? null : scopeType==='project' ? scopeId : source.project_id
    const child=(await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,parent_session_id,work_item_id,project_id,plan_step_id,plan_step_version_id,state,state_reason,budget,inherited_budget,context_snapshot_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued',$11,$12,$12,$13) RETURNING *",[actor(request).workspaceId,source.team_id,target.id,target.actor_id,del.id,source.id,source.work_item_id,childProjectId,scopeType==='plan_step'?scopeId:null,planStepVersionId,body.initialPrompt,source.budget,handoff.context_snapshot_id])).rows[0] as {id:string}
    await tx.query('INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)',[child.id,actor(request).id,body.initialPrompt])
    if (body.failureInjection === 'afterSession') throw new Error('HANDOFF_INJECTED_FAILURE_AFTER_SESSION')
    await tx.query("INSERT INTO routing_records(workspace_id,source_session_id,target_agent_id,requested_skill,required_capabilities,outcome,sort_rank,rationale) SELECT workspace_id,$2,$3,target_skill,$4,'selected',1,jsonb_build_object('reason','handoff accepted') FROM handoffs WHERE id=$1",[handoffId,source.id,target.id,caps])
    if(handoff.lease_transfer_policy!=='retain') {
      const leases=(await tx.query<{id:string;resource_type:string;resource_id:string;kind:string;expires_at:Date}>("SELECT * FROM leases WHERE session_id=$1 AND status='active' AND ($2='project' OR ($2='work_item' AND resource_type='work_item' AND resource_id=$3) OR ($2='plan_step' AND resource_type='plan_step' AND resource_id=$3)) FOR UPDATE",[source.id,scopeType,scopeId])).rows
      for(const lease of leases) {
        await tx.query("UPDATE leases SET status='released',released_at=now(),released_by_actor_id=$2,audit_reason=$3,version=version+1,updated_at=now() WHERE id=$1",[lease.id,actor(request).id,`handoff ${handoff.lease_transfer_policy}`])
        if(handoff.lease_transfer_policy==='transfer') await tx.query('INSERT INTO leases(workspace_id,session_id,resource_type,resource_id,kind,reason,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor(request).workspaceId,child.id,lease.resource_type,lease.resource_id,lease.kind,'handoff transfer',lease.expires_at])
      }
    }
    const installationAuthority=lockedTargets.installationAuthorities.get(target.id)
    if(!installationAuthority) throw new DomainError('NOT_FOUND','Active installation token not found for the exact handoff Session authority')
    await provisionNewSessionDelivery(tx,h.meta(request,body),{sessionId:child.id,agentId:target.id,delegationId:del.id,teamId:source.team_id,workItemId:source.work_item_id,initialPrompt:body.initialPrompt,installationAuthority})
    await tx.query("UPDATE handoffs SET status='accepted',accepted_session_id=$2,resolved_agent_id=$3,resolved_delegation_id=$4,decided_at=now(),revision=revision+1 WHERE id=$1",[handoffId,child.id,target.id,del.id])
    await tx.query(
      `INSERT INTO inbox_items(
         workspace_id,recipient_actor_id,recipient_session_id,session_id,team_id,
         kind,source_type,source_id,payload
       ) VALUES($1,$2,$3,$3,$4,'handoff','handoff',$5,$6)
       ON CONFLICT DO NOTHING`,
      [actor(request).workspaceId,target.actor_id,child.id,source.team_id,handoffId,{fromSessionId:source.id,acceptedSessionId:child.id}],
    )
    await emit(tx,h.meta(request,body),'handoff.accepted','handoff',handoffId,{acceptedSessionId:child.id,resolvedAgentId:target.id},source.team_id)
    return {handoffId,session:child}
  })
}
async function rejectHandoff(h:Helpers,request:FastifyRequest) {
  const handoffId=id(request); const body=handoffRejectInputSchema.parse(request.body)
  return command(h.db,h.meta(request,body,{id:handoffId}),async tx=>{
    const handoff=(await tx.query<{from_session_id:string;target_agent_id:string|null}>('SELECT from_session_id,target_agent_id FROM handoffs WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[handoffId,actor(request).workspaceId])).rows[0]
    if(!handoff) throw new DomainError('NOT_FOUND','Handoff not found')
    const source=await session(tx,actor(request).workspaceId,handoff.from_session_id)
    if (actor(request).kind === 'human') { await assertHumanTeam(tx,actor(request),source.team_id); if(!body.reason) throw new DomainError('VALIDATION_ERROR','Human rejection requires a reason') }
    else { if (!handoff.target_agent_id) throw new DomainError('FORBIDDEN','Only the exact target agent may reject this handoff'); const target=actor(request).agentSessionId ? (await tx.query<{agent_id:string;agent_actor_id:string}>('SELECT agent_id,agent_actor_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2',[actor(request).agentSessionId,actor(request).workspaceId])).rows[0] : (await tx.query<{agent_id:string;agent_actor_id:string}>('SELECT d.id AS agent_id,d.actor_id AS agent_actor_id FROM agent_definitions d WHERE d.actor_id=$1 AND d.workspace_id=$2',[actor(request).id,actor(request).workspaceId])).rows[0]; if(!target || target.agent_actor_id!==actor(request).id || target.agent_id!==handoff.target_agent_id || !body.machineReason) throw new DomainError('FORBIDDEN','Only the exact target installation or session may reject with a machine reason') }
    const row=(await tx.query("UPDATE handoffs SET status='rejected',rejected_by_actor_id=$2,machine_reject_reason=$3,decided_at=now(),revision=revision+1 WHERE id=$1 AND status='requested' RETURNING *",[handoffId,actor(request).id,actor(request).kind==='agent'?body.machineReason:null])).rows[0] as {id:string}|undefined
    if(!row) throw new DomainError('CONFLICT','Handoff is no longer pending')
    await emit(tx,h.meta(request,body),'handoff.rejected','handoff',row.id,{reason:body.reason??null,machineReason:body.machineReason??null},source.team_id)
    return row
  })
}
