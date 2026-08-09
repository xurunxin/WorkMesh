import type { PoolClient, QueryResultRow } from 'pg'
import type {
  AppendEventInput,
  EventResource,
  EventResourceMetadata,
  EventResourceType,
} from './events.js'

type QueryableTransaction = Pick<PoolClient, 'query'>

type ResourceSeedRow = QueryResultRow & {
  resource_type: EventResourceType
  resource_id: string
}

type ResourceAuthorityRow = QueryResultRow & {
  workspace_id: string
  team_id: string | null
  project_id: string | null
  work_item_id: string | null
  session_id: string | null
  room_id: string | null
  artifact_id: string | null
  delivery_id: string | null
}

export type ResolvedEventResources = Readonly<{
  teamId?: string
  audienceActorId?: string
  resources: Required<EventResourceMetadata>
}>

type PrivateAudienceRow = QueryResultRow & {
  audience_actor_id: string
  is_private: boolean
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const directAggregateResourceTypes = {
  workspace: 'workspace',
  team: 'team',
  project: 'project',
  work_item: 'work_item',
  agent_session: 'session',
  artifact: 'artifact',
  delivery: 'delivery',
  webhook_delivery: 'delivery',
  provider_webhook_delivery: 'delivery',
  room: 'room',
  work_room: 'room',
} as const satisfies Readonly<Record<string, EventResourceType>>

/**
 * Every aggregate type currently written by production code must have an
 * explicit resolution strategy. Unknown types fail closed instead of silently
 * degrading to Workspace or Team visibility.
 */
export const supportedEventAggregateTypes = [
  ...Object.keys(directAggregateResourceTypes),
  'actor',
  'session',
  'saved_view',
  'workflow_state',
  'comment',
  'agent',
  'agent_team_access',
  'delegation',
  'agent_activity',
  'agent_plan_version',
  'approval',
  'inbox_item',
  'lease',
  'room_message',
  'decision',
  'plan_step_comment',
  'assignment_proposal',
  'handoff',
  'context_delta',
  'provider_connection',
  'repository',
  'repository_context',
  'provider_action',
  'artifact_upload_intent',
  'pull_request',
  'project_milestone',
  'project_update',
  'project_health_update',
  'completion_suggestion',
  'cycle',
  'initiative',
  'advanced_saved_view',
  'automation_rule',
  'automation_run',
  'automation_effect',
  'loop',
  'usage_record',
  'budget_policy',
  'notification',
  'template',
  'a2a_binding',
  'a2a_task',
] as const

const supportedAggregateTypes = new Set<string>(supportedEventAggregateTypes)

export type SqlParameterBinding = Readonly<{
  sql: string
  values: unknown[]
}>

export const remapSqlParameters = (
  sql: string,
  sourceValues: readonly unknown[],
): SqlParameterBinding => {
  const mappedIndexes = new Map<number, number>()
  const values: unknown[] = []
  const remappedSql = sql.replace(/\$(\d+)/g, (_placeholder, rawIndex: string) => {
    const sourceIndex = Number(rawIndex)
    if (
      !Number.isSafeInteger(sourceIndex)
      || sourceIndex < 1
      || sourceIndex > sourceValues.length
    )
      throw new Error('DOMAIN_EVENT_SQL_PARAMETER_INVALID')
    let mappedIndex = mappedIndexes.get(sourceIndex)
    if (mappedIndex === undefined) {
      mappedIndex = mappedIndexes.size + 1
      mappedIndexes.set(sourceIndex, mappedIndex)
      values.push(sourceValues[sourceIndex - 1])
    }
    return `$${mappedIndex}`
  })
  return { sql: remappedSql, values }
}

/**
 * Private event forms are deliberately inventoried here. Their audience must
 * be proven from durable ownership state and explicitly supplied by the
 * producer; neither a missing owner nor a Workspace resource may widen them.
 */
export const privateEventAudienceForms = [
  'aggregate:session',
  'aggregate:saved_view',
  'aggregate:notification',
  'aggregate:advanced_saved_view:private',
  'event:notification.preferences_updated',
] as const

const payloadResourceKeys: ReadonlyArray<
  readonly [string, EventResourceType]
> = [
  ['projectId', 'project'],
  ['dependsOnProjectId', 'project'],
  ['workItemId', 'work_item'],
  ['sessionId', 'session'],
  ['acceptedSessionId', 'session'],
  ['fromSessionId', 'session'],
  ['childSessionId', 'session'],
  ['parentSessionId', 'session'],
  ['reviewerSessionId', 'session'],
  ['roomId', 'room'],
  ['artifactId', 'artifact'],
  ['deliveryId', 'delivery'],
  ['projectIds', 'project'],
  ['artifactIds', 'artifact'],
]

const validateResource = (resource: EventResource): void => {
  if (!uuidPattern.test(resource.id))
    throw new Error('DOMAIN_EVENT_RESOURCE_ID_INVALID')
}

const uniqueResources = (
  resources: readonly EventResource[],
): EventResource[] => {
  const seen = new Set<string>()
  const result: EventResource[] = []
  for (const resource of resources) {
    validateResource(resource)
    const key = `${resource.type}:${resource.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(resource)
  }
  return result
}

const payloadSeeds = (payload: Record<string, unknown>): EventResource[] => {
  const result: EventResource[] = []
  for (const [key, type] of payloadResourceKeys) {
    const value = payload[key]
    const ids = Array.isArray(value) ? value : [value]
    for (const id of ids)
      if (typeof id === 'string' && uuidPattern.test(id))
        result.push({ type, id })
  }
  return result
}

const aggregateSeedSql: Readonly<Record<string, string>> = {
  actor:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM actors WHERE id=$1 AND workspace_id=$2`,
  session:
    `SELECT 'workspace'::text AS resource_type,actor.workspace_id AS resource_id
       FROM sessions credential
       JOIN actors actor ON actor.id=credential.actor_id
      WHERE credential.id=$1 AND actor.workspace_id=$2`,
  saved_view:
    `SELECT CASE WHEN team_id IS NULL THEN 'workspace' ELSE 'team' END AS resource_type,
            COALESCE(team_id,workspace_id) AS resource_id
       FROM saved_views WHERE id=$1 AND workspace_id=$2`,
  workflow_state:
    `SELECT 'team'::text AS resource_type,team_id AS resource_id
       FROM workflow_states WHERE id=$1 AND workspace_id=$2`,
  comment:
    `SELECT 'work_item'::text AS resource_type,channel.work_item_id AS resource_id
       FROM comments comment
       JOIN channels channel ON channel.id=comment.channel_id
      WHERE comment.id=$1 AND comment.workspace_id=$2
        AND channel.workspace_id=$2`,
  agent:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM agent_definitions WHERE id=$1 AND workspace_id=$2`,
  agent_team_access:
    `SELECT 'team'::text AS resource_type,access.team_id AS resource_id
       FROM agent_team_access access
      WHERE access.agent_id=$1 AND access.workspace_id=$2
        AND access.team_id=$3`,
  delegation:
    `SELECT CASE
              WHEN delegation.work_item_id IS NOT NULL THEN 'work_item'
              WHEN delegation.scope_type='project' THEN 'project'
              ELSE 'team'
            END AS resource_type,
            CASE
              WHEN delegation.work_item_id IS NOT NULL
                THEN delegation.work_item_id
              WHEN delegation.scope_type='project' THEN delegation.scope_id
              ELSE delegation.team_id
            END AS resource_id
       FROM delegations delegation
      WHERE delegation.id=$1 AND delegation.workspace_id=$2`,
  agent_activity:
    `SELECT 'session'::text AS resource_type,activity.session_id AS resource_id
       FROM agent_activities activity
       JOIN agent_sessions session ON session.id=activity.session_id
      WHERE activity.id=$1 AND session.workspace_id=$2`,
  agent_plan_version:
    `SELECT 'session'::text AS resource_type,plan.session_id AS resource_id
       FROM agent_plan_versions plan
       JOIN agent_sessions session ON session.id=plan.session_id
      WHERE plan.id=$1 AND session.workspace_id=$2`,
  approval:
    `SELECT 'session'::text AS resource_type,approval.session_id AS resource_id
       FROM approvals approval
      WHERE approval.id=$1 AND approval.workspace_id=$2`,
  inbox_item:
    `SELECT CASE
              WHEN inbox.source_room_message_id IS NOT NULL THEN 'room'
              WHEN inbox.session_id IS NOT NULL THEN 'session'
              ELSE 'team'
            END AS resource_type,
            COALESCE(message.channel_id,inbox.session_id,inbox.team_id) AS resource_id
       FROM inbox_items inbox
       LEFT JOIN room_messages message
         ON message.id=inbox.source_room_message_id
        AND message.workspace_id=inbox.workspace_id
      WHERE inbox.id=$1 AND inbox.workspace_id=$2`,
  lease:
    `SELECT 'session'::text AS resource_type,lease.session_id AS resource_id
       FROM leases lease
      WHERE lease.id=$1 AND lease.workspace_id=$2
     UNION ALL
     SELECT 'work_item'::text,lease.resource_id
       FROM leases lease
      WHERE lease.id=$1 AND lease.workspace_id=$2
        AND lease.resource_type='work_item'`,
  room_message:
    `SELECT 'room'::text AS resource_type,message.channel_id AS resource_id
       FROM room_messages message
       JOIN work_room_channels channel ON channel.id=message.channel_id
      WHERE message.id=$1 AND message.workspace_id=$2
        AND channel.workspace_id=$2`,
  decision:
    `SELECT CASE
              WHEN decision.work_item_id IS NOT NULL THEN 'work_item'
              WHEN decision.project_id IS NOT NULL THEN 'project'
              ELSE 'session'
            END AS resource_type,
            COALESCE(
              decision.work_item_id,
              decision.project_id,
              decision.session_id
            ) AS resource_id
       FROM decisions decision
      WHERE decision.id=$1 AND decision.workspace_id=$2`,
  plan_step_comment:
    `SELECT 'session'::text AS resource_type,plan.session_id AS resource_id
       FROM plan_step_comments comment
       JOIN agent_plan_versions plan ON plan.id=comment.plan_version_id
       JOIN agent_sessions session ON session.id=plan.session_id
      WHERE comment.id=$1 AND session.workspace_id=$2`,
  assignment_proposal:
    `SELECT 'session'::text AS resource_type,proposal.session_id AS resource_id
       FROM assignment_proposals proposal
       JOIN agent_sessions session ON session.id=proposal.session_id
      WHERE proposal.id=$1 AND session.workspace_id=$2`,
  handoff:
    `SELECT 'session'::text AS resource_type,handoff.from_session_id AS resource_id
       FROM handoffs handoff
      WHERE handoff.id=$1 AND handoff.workspace_id=$2`,
  context_delta:
    `SELECT 'session'::text AS resource_type,delta.session_id AS resource_id
       FROM context_deltas delta
       JOIN agent_sessions session ON session.id=delta.session_id
      WHERE delta.id=$1 AND session.workspace_id=$2`,
  provider_connection:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM provider_connections WHERE id=$1 AND workspace_id=$2`,
  repository:
    `SELECT 'team'::text AS resource_type,team_id AS resource_id
       FROM repositories WHERE id=$1 AND workspace_id=$2`,
  repository_context:
    `SELECT CASE
              WHEN context.session_id IS NOT NULL THEN 'session'
              WHEN context.work_item_id IS NOT NULL THEN 'work_item'
              WHEN context.project_id IS NOT NULL THEN 'project'
              ELSE 'team'
            END AS resource_type,
            COALESCE(
              context.session_id,
              context.work_item_id,
              context.project_id,
              repository.team_id
            ) AS resource_id
       FROM repository_contexts context
       JOIN repositories repository ON repository.id=context.repository_id
      WHERE context.id=$1 AND context.workspace_id=$2
        AND repository.workspace_id=$2`,
  provider_action:
    `SELECT CASE
              WHEN action.session_id IS NOT NULL THEN 'session'
              WHEN action.work_item_id IS NOT NULL THEN 'work_item'
              WHEN action.project_id IS NOT NULL THEN 'project'
              ELSE 'team'
            END AS resource_type,
            COALESCE(
              action.session_id,
              action.work_item_id,
              action.project_id,
              repository.team_id
            ) AS resource_id
       FROM provider_actions action
       JOIN repositories repository ON repository.id=action.repository_id
      WHERE action.id=$1 AND action.workspace_id=$2
        AND repository.workspace_id=$2`,
  artifact_upload_intent:
    `SELECT 'session'::text AS resource_type,intent.session_id AS resource_id
       FROM artifact_upload_intents intent
      WHERE intent.id=$1 AND intent.workspace_id=$2`,
  pull_request:
    `SELECT CASE WHEN pull.work_item_id IS NULL THEN 'team' ELSE 'work_item' END
              AS resource_type,
            COALESCE(pull.work_item_id,repository.team_id) AS resource_id
       FROM pull_request_projections pull
       JOIN repositories repository ON repository.id=pull.repository_id
      WHERE pull.id=$1 AND pull.workspace_id=$2
        AND repository.workspace_id=$2`,
  project_milestone:
    `SELECT 'project'::text AS resource_type,milestone.project_id AS resource_id
       FROM project_milestones milestone
      WHERE milestone.id=$1 AND milestone.workspace_id=$2`,
  project_update:
    `SELECT 'project'::text AS resource_type,update.project_id AS resource_id
       FROM project_updates update
      WHERE update.id=$1 AND update.workspace_id=$2`,
  project_health_update:
    `SELECT 'project'::text AS resource_type,update.project_id AS resource_id
       FROM project_health_updates update
      WHERE update.id=$1 AND update.workspace_id=$2`,
  completion_suggestion:
    `SELECT 'work_item'::text AS resource_type,
            suggestion.work_item_id AS resource_id
       FROM completion_suggestions suggestion
      WHERE suggestion.id=$1 AND suggestion.workspace_id=$2`,
  cycle:
    `SELECT CASE WHEN team_id IS NULL THEN 'workspace' ELSE 'team' END AS resource_type,
            COALESCE(team_id,workspace_id) AS resource_id
       FROM cycles WHERE id=$1 AND workspace_id=$2`,
  initiative:
    `SELECT CASE WHEN link.project_id IS NULL THEN 'workspace' ELSE 'project' END
              AS resource_type,
            COALESCE(link.project_id,initiative.workspace_id) AS resource_id
       FROM initiatives initiative
       LEFT JOIN initiative_projects link ON link.initiative_id=initiative.id
      WHERE initiative.id=$1 AND initiative.workspace_id=$2`,
  advanced_saved_view:
    `SELECT CASE WHEN team_id IS NULL THEN 'workspace' ELSE 'team' END AS resource_type,
            COALESCE(team_id,workspace_id) AS resource_id
       FROM advanced_saved_views WHERE id=$1 AND workspace_id=$2`,
  automation_rule:
    `SELECT CASE WHEN team_id IS NULL THEN 'workspace' ELSE 'team' END AS resource_type,
            COALESCE(team_id,workspace_id) AS resource_id
       FROM automation_rules WHERE id=$1 AND workspace_id=$2`,
  automation_run:
    `SELECT CASE
              WHEN run.session_id IS NOT NULL THEN 'session'
              WHEN loop.project_id IS NOT NULL THEN 'project'
              WHEN COALESCE(run.team_id,loop.team_id) IS NOT NULL THEN 'team'
              ELSE 'workspace'
            END AS resource_type,
            COALESCE(
              run.session_id,
              loop.project_id,
              run.team_id,
              loop.team_id,
              run.workspace_id
            ) AS resource_id
       FROM automation_runs run
       LEFT JOIN loops loop ON loop.id=run.loop_id
      WHERE run.id=$1 AND run.workspace_id=$2`,
  automation_effect:
    `SELECT CASE
              WHEN run.session_id IS NOT NULL THEN 'session'
              WHEN loop.project_id IS NOT NULL THEN 'project'
              WHEN COALESCE(run.team_id,loop.team_id) IS NOT NULL THEN 'team'
              ELSE 'workspace'
            END AS resource_type,
            COALESCE(
              run.session_id,
              loop.project_id,
              run.team_id,
              loop.team_id,
              run.workspace_id
            ) AS resource_id
       FROM automation_effects effect
       JOIN automation_runs run ON run.id=effect.run_id
       LEFT JOIN loops loop ON loop.id=run.loop_id
      WHERE effect.id=$1 AND run.workspace_id=$2`,
  loop:
    `SELECT CASE
              WHEN project_id IS NOT NULL THEN 'project'
              WHEN team_id IS NOT NULL THEN 'team'
              ELSE 'workspace'
            END AS resource_type,
            COALESCE(project_id,team_id,workspace_id) AS resource_id
       FROM loops WHERE id=$1 AND workspace_id=$2`,
  usage_record:
    `SELECT 'session'::text AS resource_type,usage.session_id AS resource_id
       FROM usage_records usage
      WHERE usage.id=$1 AND usage.workspace_id=$2`,
  budget_policy:
    `SELECT CASE
              WHEN policy.scope_type='workspace' THEN 'workspace'
              WHEN policy.scope_type='team' THEN 'team'
              WHEN policy.scope_type='project' THEN 'project'
              WHEN policy.scope_type='session' THEN 'session'
              WHEN policy.scope_type='loop' AND loop.project_id IS NOT NULL
                THEN 'project'
              WHEN policy.scope_type='loop' AND loop.team_id IS NOT NULL
                THEN 'team'
              ELSE 'workspace'
            END AS resource_type,
            CASE
              WHEN policy.scope_type IN (
                'workspace','team','project','session'
              ) THEN policy.scope_id
              WHEN policy.scope_type='loop' AND loop.project_id IS NOT NULL
                THEN loop.project_id
              WHEN policy.scope_type='loop' AND loop.team_id IS NOT NULL
                THEN loop.team_id
              ELSE policy.workspace_id
            END AS resource_id
       FROM budget_policies policy
       LEFT JOIN loops loop
         ON policy.scope_type='loop' AND loop.id=policy.scope_id
      WHERE policy.id=$1 AND policy.workspace_id=$2`,
  notification:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM notifications WHERE id=$1 AND workspace_id=$2`,
  template:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM templates WHERE id=$1 AND workspace_id=$2`,
  a2a_binding:
    `SELECT 'workspace'::text AS resource_type,workspace_id AS resource_id
       FROM a2a_agent_bindings WHERE id=$1 AND workspace_id=$2`,
  a2a_task:
    `SELECT 'session'::text AS resource_type,session.id AS resource_id
       FROM agent_sessions session
      WHERE session.id=$4 AND session.workspace_id=$2`,
}

const authoritySql: Readonly<Record<EventResourceType, string>> = {
  workspace:
    `SELECT workspace.id AS workspace_id,
            NULL::uuid AS team_id,NULL::uuid AS project_id,
            NULL::uuid AS work_item_id,NULL::uuid AS session_id,
            NULL::uuid AS room_id,NULL::uuid AS artifact_id,
            NULL::uuid AS delivery_id
       FROM workspaces workspace WHERE workspace.id=$1`,
  team:
    `SELECT team.workspace_id,team.id AS team_id,
            NULL::uuid AS project_id,NULL::uuid AS work_item_id,
            NULL::uuid AS session_id,NULL::uuid AS room_id,
            NULL::uuid AS artifact_id,NULL::uuid AS delivery_id
       FROM teams team WHERE team.id=$1`,
  project:
    `SELECT project.workspace_id,project.team_id,project.id AS project_id,
            NULL::uuid AS work_item_id,NULL::uuid AS session_id,
            NULL::uuid AS room_id,NULL::uuid AS artifact_id,
            NULL::uuid AS delivery_id
       FROM projects project WHERE project.id=$1`,
  work_item:
    `SELECT item.workspace_id,item.team_id,item.project_id,
            item.id AS work_item_id,NULL::uuid AS session_id,
            NULL::uuid AS room_id,NULL::uuid AS artifact_id,
            NULL::uuid AS delivery_id
       FROM work_items item WHERE item.id=$1`,
  session:
    `SELECT session.workspace_id,session.team_id,
            COALESCE(session.project_id,item.project_id) AS project_id,
            session.work_item_id,session.id AS session_id,
            NULL::uuid AS room_id,NULL::uuid AS artifact_id,
            NULL::uuid AS delivery_id
       FROM agent_sessions session
       LEFT JOIN work_items item ON item.id=session.work_item_id
      WHERE session.id=$1`,
  room:
    `SELECT room.workspace_id,room.team_id,
            COALESCE(room.project_id,session.project_id,item.project_id)
              AS project_id,
            COALESCE(room.work_item_id,session.work_item_id) AS work_item_id,
            room.session_id,room.id AS room_id,
            NULL::uuid AS artifact_id,NULL::uuid AS delivery_id
       FROM work_room_channels room
       LEFT JOIN agent_sessions session ON session.id=room.session_id
       LEFT JOIN work_items item
         ON item.id=COALESCE(room.work_item_id,session.work_item_id)
      WHERE room.id=$1`,
  artifact:
    `SELECT artifact.workspace_id,session.team_id,
            COALESCE(session.project_id,item.project_id) AS project_id,
            COALESCE(artifact.work_item_id,session.work_item_id)
              AS work_item_id,
            artifact.session_id,NULL::uuid AS room_id,
            artifact.id AS artifact_id,NULL::uuid AS delivery_id
       FROM artifacts artifact
       JOIN agent_sessions session ON session.id=artifact.session_id
       LEFT JOIN work_items item
         ON item.id=COALESCE(artifact.work_item_id,session.work_item_id)
      WHERE artifact.id=$1`,
  delivery:
    `SELECT connection.workspace_id,repository.team_id,
            NULL::uuid AS project_id,NULL::uuid AS work_item_id,
            NULL::uuid AS session_id,NULL::uuid AS room_id,
            NULL::uuid AS artifact_id,delivery.id AS delivery_id
       FROM provider_webhook_deliveries delivery
       JOIN provider_connections connection ON connection.id=delivery.connection_id
       LEFT JOIN repositories repository ON repository.id=delivery.repository_id
      WHERE delivery.id=$1
     UNION ALL
     SELECT agent.workspace_id,session.team_id,session.project_id,
            session.work_item_id,delivery.session_id,NULL::uuid,
            NULL::uuid,delivery.id
       FROM agent_webhook_deliveries delivery
       JOIN agent_definitions agent ON agent.id=delivery.agent_id
       LEFT JOIN agent_sessions session ON session.id=delivery.session_id
      WHERE delivery.id=$1
     UNION ALL
     SELECT notification.workspace_id,NULL::uuid,NULL::uuid,NULL::uuid,
            NULL::uuid,NULL::uuid,NULL::uuid,delivery.id
       FROM notification_deliveries delivery
       JOIN notifications notification ON notification.id=delivery.notification_id
      WHERE delivery.id=$1`,
}

const resourcesFromAuthority = (
  authority: ResourceAuthorityRow,
): EventResource[] => {
  const resources: EventResource[] = [
    { type: 'workspace', id: authority.workspace_id },
  ]
  for (const [type, id] of [
    ['team', authority.team_id],
    ['project', authority.project_id],
    ['work_item', authority.work_item_id],
    ['session', authority.session_id],
    ['room', authority.room_id],
    ['artifact', authority.artifact_id],
    ['delivery', authority.delivery_id],
  ] as const)
    if (id) resources.push({ type, id })
  return resources
}

async function aggregateSeeds(
  tx: QueryableTransaction,
  input: AppendEventInput,
): Promise<EventResource[]> {
  if (!supportedAggregateTypes.has(input.aggregateType))
    throw new Error('DOMAIN_EVENT_AGGREGATE_RESOURCE_UNSUPPORTED')
  const direct =
    directAggregateResourceTypes[
      input.aggregateType as keyof typeof directAggregateResourceTypes
    ]
  if (direct) return [{ type: direct, id: input.aggregateId }]

  const sql = aggregateSeedSql[input.aggregateType]
  if (!sql) throw new Error('DOMAIN_EVENT_AGGREGATE_RESOURCE_UNSUPPORTED')
  const payloadSessionId =
    typeof input.payload?.sessionId === 'string'
      ? input.payload.sessionId
      : input.sessionId ?? null
  const values = [
    input.aggregateId,
    input.workspaceId,
    input.teamId ?? null,
    payloadSessionId,
  ]
  const binding = remapSqlParameters(sql, values)
  const result = await tx.query<ResourceSeedRow>(
    binding.sql,
    binding.values,
  )
  if (result.rows.length === 0)
    throw new Error('DOMAIN_EVENT_AGGREGATE_RESOURCE_NOT_FOUND')
  return result.rows.map(row => ({
    type: row.resource_type,
    id: row.resource_id,
  }))
}

async function resolveAuthority(
  tx: QueryableTransaction,
  resource: EventResource,
): Promise<ResourceAuthorityRow> {
  const result = await tx.query<ResourceAuthorityRow>(
    authoritySql[resource.type],
    [resource.id],
  )
  if (result.rows.length !== 1)
    throw new Error('DOMAIN_EVENT_RESOURCE_AUTHORITY_NOT_FOUND')
  return result.rows[0]!
}

async function resolveAudienceActorId(
  tx: QueryableTransaction,
  input: AppendEventInput,
): Promise<string | undefined> {
  let privateAudienceSql: string | undefined
  if (input.aggregateType === 'session') {
    privateAudienceSql =
      `SELECT credential.actor_id AS audience_actor_id,true AS is_private
         FROM sessions credential
         JOIN actors actor ON actor.id=credential.actor_id
        WHERE credential.id=$1 AND actor.workspace_id=$2`
  } else if (input.aggregateType === 'saved_view') {
    privateAudienceSql =
      `SELECT owner_actor_id AS audience_actor_id,true AS is_private
         FROM saved_views WHERE id=$1 AND workspace_id=$2`
  } else if (input.aggregateType === 'notification') {
    privateAudienceSql =
      `SELECT recipient_actor_id AS audience_actor_id,true AS is_private
         FROM notifications WHERE id=$1 AND workspace_id=$2`
  } else if (input.aggregateType === 'advanced_saved_view') {
    privateAudienceSql =
      `SELECT owner_actor_id AS audience_actor_id,
              scope='private' AS is_private
         FROM advanced_saved_views WHERE id=$1 AND workspace_id=$2`
  } else if (input.type === 'notification.preferences_updated') {
    privateAudienceSql =
      `SELECT preference.actor_id AS audience_actor_id,true AS is_private
         FROM notification_preferences preference
        WHERE preference.actor_id=$1 AND preference.workspace_id=$2`
  }

  if (privateAudienceSql) {
    const result = await tx.query<PrivateAudienceRow>(
      privateAudienceSql,
      [input.aggregateId, input.workspaceId],
    )
    if (result.rows.length !== 1)
      throw new Error('DOMAIN_EVENT_PRIVATE_AUDIENCE_NOT_FOUND')
    const privateAudience = result.rows[0]!
    if (privateAudience.is_private) {
      if (!input.audienceActorId)
        throw new Error('DOMAIN_EVENT_PRIVATE_AUDIENCE_REQUIRED')
      if (input.audienceActorId !== privateAudience.audience_actor_id)
        throw new Error('DOMAIN_EVENT_PRIVATE_AUDIENCE_MISMATCH')
    }
  }

  if (!input.audienceActorId) return undefined
  const actor = await tx.query(
    `SELECT 1 FROM actors
      WHERE id=$1 AND workspace_id=$2`,
    [input.audienceActorId, input.workspaceId],
  )
  if (actor.rows.length !== 1)
    throw new Error('DOMAIN_EVENT_AUDIENCE_ACTOR_NOT_FOUND')
  return input.audienceActorId
}

export async function resolveEventResources(
  tx: QueryableTransaction,
  input: AppendEventInput,
): Promise<ResolvedEventResources> {
  const audienceActorId = await resolveAudienceActorId(tx, input)
  const seeds = uniqueResources([
    { type: 'workspace', id: input.workspaceId },
    ...(input.teamId ? [{ type: 'team' as const, id: input.teamId }] : []),
    ...(input.sessionId
      ? [{ type: 'session' as const, id: input.sessionId }]
      : []),
    ...await aggregateSeeds(tx, input),
    ...payloadSeeds(input.payload ?? {}),
    ...(input.resources?.scopes ?? []),
    ...(input.resources?.invalidates ?? []),
  ])
  const authorities: ResourceAuthorityRow[] = []
  for (const resource of seeds)
    authorities.push(await resolveAuthority(tx, resource))
  for (const authority of authorities)
    if (authority.workspace_id !== input.workspaceId)
      throw new Error('DOMAIN_EVENT_RESOURCE_WORKSPACE_MISMATCH')

  const teamIds = new Set(
    authorities.flatMap(authority =>
      authority.team_id ? [authority.team_id] : []),
  )
  if (input.teamId && [...teamIds].some(teamId => teamId !== input.teamId))
    throw new Error('DOMAIN_EVENT_RESOURCE_TEAM_MISMATCH')
  if (
    teamIds.size > 1
    && input.aggregateType !== 'initiative'
    && input.aggregateType !== 'project'
  )
    throw new Error('DOMAIN_EVENT_RESOURCE_TEAM_MISMATCH')

  const scopes = uniqueResources(
    authorities.flatMap(resourcesFromAuthority),
  )
  const nonWorkspaceInvalidates = scopes.filter(
    resource => resource.type !== 'workspace',
  )
  return {
    audienceActorId,
    teamId:
      input.teamId
      ?? (teamIds.size === 1 ? [...teamIds][0] : undefined),
    resources: {
      scopes,
      invalidates:
        nonWorkspaceInvalidates.length > 0
          ? nonWorkspaceInvalidates
          : scopes.filter(resource => resource.type === 'workspace'),
    },
  }
}
