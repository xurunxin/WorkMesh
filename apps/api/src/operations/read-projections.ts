import type { Pool, PoolClient } from 'pg'
import { principalTeamAuthorityPredicate, withTx } from '@workmesh/db'
import { DomainError, rollupInitiative } from '@workmesh/domain'
import { a2aTaskEventPageSchema, automationRunDetailResponseSchema, usageSummaryResponseSchema, type UsageSummaryQuery } from '@workmesh/contracts'
import { mapStreamEvent, type WorkMeshStreamEvent } from '@workmesh/a2a-adapter'
import type { ApiActor } from '../agent/types.js'
import { liveHumanTeamReadPredicate, liveSessionReadPredicate, type ReadAuthorizationClock } from '../live-read-authorization.js'

type QueryDb = Pool | PoolClient
const bind = (values: unknown[], value: unknown): string => { values.push(value); return `$${values.length}` }

// One row survives missing/revoked authority: callers must reject before
// interpreting an empty aggregate, rather than accidentally returning zero.
function agentAuthority(current: ApiActor, workspace: string, values: unknown[], unused: readonly string[] = [], clock: ReadAuthorizationClock = 'now()'): string {
  const session = bind(values, current.agentSessionId ?? null)
  const live = liveSessionReadPredicate(current, 'scoped.id', workspace, values, 'work:read', clock)
  return `authority AS (
    SELECT scoped.id,scoped.agent_id,scoped.team_id,scoped.project_id,
           item.project_id AS work_item_project_id,${unused.map((value,index)=>`${value} AS parameter_${index},`).join('')}
           coalesce(${live} AND ${principalTeamAuthorityPredicate('delegation.principal_human_actor_id',workspace,'scoped.team_id')},false) AS authority_allowed
      FROM (SELECT 1) locator
      LEFT JOIN agent_sessions scoped ON scoped.id=${session}::uuid AND scoped.workspace_id=${workspace}
      LEFT JOIN delegations delegation ON delegation.id=scoped.delegation_id AND delegation.workspace_id=${workspace}
      LEFT JOIN work_items item ON item.id=scoped.work_item_id AND item.workspace_id=${workspace} AND item.deleted_at IS NULL
  )`
}
function requireAuthority(allowed: boolean): void {
  if (!allowed) throw new DomainError('SESSION_SCOPE_DENIED','Current Session authority is no longer active')
}
function requireTarget<T>(target: T | null | undefined): T {
  if (target == null) throw new DomainError('NOT_FOUND','Resource not found')
  return target
}

export async function readInitiativeRollup(db: QueryDb, current: ApiActor, initiativeId: string, costsEnabled: boolean) {
  const values: unknown[]=[initiativeId,current.workspaceId,current.workspaceRole==='admin',current.id,costsEnabled]
  const authority = current.kind==='agent' ? agentAuthority(current,'$2',values,['$3::boolean','$4::uuid']) : null
  const visibility = authority
    ? `project.deleted_at IS NULL AND link.workspace_id=$2 AND EXISTS (
        SELECT 1 FROM authority scoped WHERE scoped.authority_allowed AND scoped.team_id=project.team_id
          AND (scoped.project_id=project.id OR scoped.work_item_project_id=project.id))`
    : `($3::boolean OR EXISTS (SELECT 1 FROM memberships member
         WHERE member.workspace_id=project.workspace_id AND member.team_id=project.team_id AND member.actor_id=$4))`
  const sql = `SELECT project.id,project.status,coalesce(health.health,'unknown')::text AS health,
              coalesce(work.completed_items,0)::int AS completed_items,coalesce(work.total_items,0)::int AS total_items,
              coalesce(usage.cost_buckets,'[]'::jsonb) AS cost_buckets
    FROM initiative_projects link JOIN projects project ON project.id=link.project_id
    LEFT JOIN LATERAL (SELECT count(item.id) FILTER (WHERE state.category='completed') AS completed_items,count(item.id) AS total_items
      FROM work_items item JOIN workflow_states state ON state.id=item.status_id
      WHERE item.project_id=project.id AND item.deleted_at IS NULL) work ON true
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('currency',bucket.currency,'knownCostMinor',bucket.known_cost_minor::text,'hasUnknownCost',bucket.has_unknown_cost) ORDER BY bucket.currency) AS cost_buckets
      FROM (SELECT record.currency,coalesce(sum(record.cost_minor) FILTER (WHERE record.cost_source<>'unknown'),0) AS known_cost_minor,
        bool_or(record.cost_source='unknown') AS has_unknown_cost FROM usage_records record
        WHERE $5::boolean AND record.project_id=project.id GROUP BY record.currency) bucket) usage ON true
    LEFT JOIN LATERAL (SELECT update.health FROM project_health_updates update
      WHERE update.project_id=project.id AND update.status='published' ORDER BY update.published_at DESC LIMIT 1) health ON true
    WHERE link.initiative_id=$1 AND project.workspace_id=$2 AND ${visibility}
    ORDER BY link.sort_order,project.id LIMIT 201`
  type Project = { id:string; status:string; health:'on_track'|'at_risk'|'off_track'|'unknown'; completed_items:number; total_items:number;
    cost_buckets:Array<{currency:string;knownCostMinor:string;hasUnknownCost:boolean}> }
  let projects: Project[]
  if (authority) {
    const result=(await db.query<{authority_allowed:boolean;projects:Project[]}>(
      `WITH ${authority}, visible_projects AS (${sql})
       SELECT authority_allowed,coalesce((SELECT jsonb_agg(visible_projects) FROM visible_projects),'[]'::jsonb) AS projects FROM authority`,values)).rows[0]!
    requireAuthority(result.authority_allowed)
    projects=result.projects
    if (!projects.length) throw new DomainError('NOT_FOUND','Initiative has no authorized linked project')
  } else projects=(await db.query<Project>(sql,values)).rows
  if (projects.length>200) throw new DomainError('INITIATIVE_ROLLUP_LIMIT_EXCEEDED','Initiative rollup is limited to 200 visible projects')
  return rollupInitiative(projects.map(project=>({ id:project.id,status:project.status,health:project.health,
    completedItems:project.completed_items,totalItems:project.total_items,costBuckets:project.cost_buckets })))
}

export async function readAutomationRun(db: QueryDb, current: ApiActor, runId: string) {
  const values:unknown[]=[runId,current.workspaceId,current.workspaceRole==='admin',current.id]
  if (current.kind==='agent') {
    const authority=agentAuthority(current,'$2',values,['$3::boolean','$4::uuid'])
    const result=(await db.query<{authority_allowed:boolean;body:unknown}>(
      `WITH ${authority} SELECT authority_allowed,(SELECT to_jsonb(run)||jsonb_build_object('effects',
        coalesce((SELECT jsonb_agg(effect ORDER BY effect.action_ordinal) FROM automation_effects effect WHERE effect.run_id=run.id),'[]'::jsonb))
        FROM automation_runs run WHERE run.id=$1 AND run.workspace_id=$2 AND run.session_id=authority.id AND authority.authority_allowed) AS body FROM authority`,values)).rows[0]!
    requireAuthority(result.authority_allowed)
    return automationRunDetailResponseSchema.parse(requireTarget(result.body))
  }
  const result=(await db.query(
    `SELECT run.*,coalesce(jsonb_agg(effect ORDER BY effect.action_ordinal) FILTER (WHERE effect.id IS NOT NULL),'[]') AS effects
      FROM automation_runs run LEFT JOIN automation_effects effect ON effect.run_id=run.id
      WHERE run.id=$1 AND run.workspace_id=$2 AND ($3::boolean OR run.team_id IS NULL OR EXISTS (
        SELECT 1 FROM memberships member WHERE member.workspace_id=run.workspace_id AND member.team_id=run.team_id AND member.actor_id=$4)) GROUP BY run.id`,values)).rows[0]
  return requireTarget(result)
}

export async function readUsageSummary(db: QueryDb, current: ApiActor, query: UsageSummaryQuery) {
  const values:unknown[]=[current.workspaceId,query.agentId??null,query.sessionId??null,query.projectId??null,query.from??null,query.to??null,current.workspaceRole==='admin',current.id]
  const agent=current.kind==='agent'
  const authority=agent ? agentAuthority(current,'$1',values,['$7::boolean','$8::uuid']) : null
  const filters = `($2::uuid IS NULL OR $2=authority.agent_id) AND ($3::uuid IS NULL OR $3=authority.id)
    AND ($4::uuid IS NULL OR $4=coalesce(authority.project_id,authority.work_item_project_id))`
  const visible = agent
    ? `EXISTS (SELECT 1 FROM authority WHERE authority_allowed AND ${filters} AND usage.session_id=authority.id
        AND usage.agent_id=authority.agent_id AND usage.project_id IS NOT DISTINCT FROM coalesce(authority.project_id,authority.work_item_project_id))`
    : `($7::boolean OR EXISTS (SELECT 1 FROM agent_sessions session LEFT JOIN memberships member
        ON member.workspace_id=session.workspace_id AND member.team_id=session.team_id AND member.actor_id=$8
        WHERE session.id=usage.session_id AND (member.actor_id IS NOT NULL OR session.team_id IS NULL)))`
  const result=(await db.query<{authority_allowed:boolean;filters_allowed:boolean;body:unknown}>(
    `WITH ${authority ? authority+',' : ''} visible_usage AS (SELECT usage.* FROM usage_records usage WHERE usage.workspace_id=$1
      AND ($2::uuid IS NULL OR usage.agent_id=$2) AND ($3::uuid IS NULL OR usage.session_id=$3) AND ($4::uuid IS NULL OR usage.project_id=$4)
      AND ($5::timestamptz IS NULL OR usage.occurred_at>=$5) AND ($6::timestamptz IS NULL OR usage.occurred_at<$6) AND ${visible}),
    totals AS (SELECT coalesce(sum(input_tokens),0)::text AS input_tokens,coalesce(sum(output_tokens),0)::text AS output_tokens,
      coalesce(sum(runtime_ms),0)::text AS runtime_ms,coalesce(sum(tool_calls),0)::text AS tool_calls,count(*) FILTER (WHERE cost_source='unknown')::int AS unknown_cost_records FROM visible_usage),
    buckets AS (SELECT currency,coalesce(sum(cost_minor) FILTER (WHERE cost_source<>'unknown'),0)::text AS known_cost_minor,
      count(*) FILTER (WHERE cost_source='unknown')::int AS unknown_cost_records FROM visible_usage GROUP BY currency)
    SELECT ${agent ? `authority_allowed,coalesce(${filters},false) AS filters_allowed,` : 'true AS authority_allowed,true AS filters_allowed,'}
      to_jsonb(totals)||jsonb_build_object('currency_buckets',coalesce((SELECT jsonb_agg(buckets ORDER BY currency) FROM buckets),'[]'::jsonb)) AS body
      FROM totals ${agent ? 'CROSS JOIN authority' : ''}`,values)).rows[0]!
  requireAuthority(result.authority_allowed)
  if (!result.filters_allowed) throw new DomainError('RESOURCE_SCOPE_DENIED','Usage filters must match the current Session, Agent and Project')
  return usageSummaryResponseSchema.parse(result.body)
}

type ScannedEvent = { cursor:string;id:string;event_type:string;aggregate_id:string;payload:Record<string,unknown>;occurred_at:string }
function mappedEvent(taskId:string,sessionId:string,event:ScannedEvent) {
  if (event.aggregate_id!==sessionId && event.payload.sessionId!==sessionId) return undefined
  let mapped:WorkMeshStreamEvent|undefined
  if (event.event_type.includes('state')) {
    const state=event.payload.state
    if (typeof state==='string' && ['queued','executing','awaiting_input','awaiting_approval','completed','failed','canceled'].includes(state))
      mapped={type:'session.state_changed',sessionId,state:state as Extract<WorkMeshStreamEvent,{type:'session.state_changed'}>['state'],occurredAt:new Date(event.occurred_at).toISOString()}
  } else if (event.event_type==='agent.activity.created' && typeof event.payload.bodyMarkdown==='string')
    mapped={type:'session.message',sessionId,messageId:event.id,bodyMarkdown:event.payload.bodyMarkdown,occurredAt:new Date(event.occurred_at).toISOString()}
  else if (event.event_type.includes('artifact') && typeof event.payload.title==='string')
    mapped={type:'artifact.created',sessionId,artifactId:typeof event.payload.artifactId==='string'?event.payload.artifactId:event.aggregate_id,
      title:event.payload.title,uri:typeof event.payload.uri==='string'?event.payload.uri:undefined,occurredAt:new Date(event.occurred_at).toISOString()}
  return mapped ? mapStreamEvent(taskId,mapped) : undefined
}

export async function readA2ATaskEventPage(db:Pool,current:ApiActor,bindingId:string,taskId:string,after:string) {
  return withTx(db,async tx=>{
    // Connection defaults may be REPEATABLE READ. The final derived write must
    // see revocations committed after the scan and evaluate expiry at its own time.
    await tx.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED')
    const values:unknown[]=[bindingId,taskId,current.workspaceId,after]
    const agent=current.kind==='agent'
    const authority=agent ? agentAuthority(current,'$3',values,[], 'statement_timestamp()') : null
    const humanGate=agent ? null : liveHumanTeamReadPredicate(current,'session.workspace_id','session.team_id',values,'statement_timestamp()')
    const targetSQL=`SELECT session.id AS session_id FROM a2a_agent_bindings binding
      JOIN a2a_task_bindings task ON task.binding_id=binding.id AND task.external_task_id=$2
      JOIN agent_sessions session ON session.id=task.session_id AND session.workspace_id=binding.workspace_id
      WHERE binding.id=$1 AND binding.workspace_id=$3 AND binding.active AND ${agent
        ? `binding.agent_id=session.agent_id AND binding.protocol_version='0.3' AND EXISTS (SELECT 1 FROM authority WHERE authority_allowed AND authority.id=session.id)`
        : humanGate}`
    const scan=(await tx.query<{authority_allowed:boolean;session_id:string|null;events:ScannedEvent[]}>(
      `WITH ${authority ? authority+',' : ''} target AS (${targetSQL}), scanned AS (
        SELECT event.cursor::text,event.id,event.event_type,event.aggregate_id,event.payload,event.occurred_at FROM domain_events event
        WHERE event.workspace_id=$3 AND event.cursor>$4::bigint AND EXISTS (SELECT 1 FROM target) ORDER BY event.cursor LIMIT 200)
       SELECT ${agent ? '(SELECT authority_allowed FROM authority)' : 'true'} AS authority_allowed,
         (SELECT session_id FROM target) AS session_id,coalesce((SELECT jsonb_agg(scanned) FROM scanned),'[]'::jsonb) AS events`,values)).rows[0]!
    requireAuthority(scan.authority_allowed)
    const sessionId=requireTarget(scan.session_id)
    const mapped=scan.events.flatMap(event=>{const payload=mappedEvent(taskId,sessionId,event);return payload ? [{id:event.id,cursor:event.cursor,payload}] : []})
    const mappedParameter=bind(values,JSON.stringify(mapped))
    const scannedParameter=bind(values,scan.events.map(event=>event.id))
    const sessionParameter=bind(values,sessionId)
    // Re-evaluate the exact authority and immutable event ownership in the
    // final INSERT statement, including empty pages. No unguarded per-event write.
    const final=(await tx.query<{authority_allowed:boolean;target_allowed:boolean;source_allowed:boolean}>(
      `WITH ${authority ? authority+',' : ''} target AS (${targetSQL}), gate AS (
        SELECT ${agent ? '(SELECT authority_allowed FROM authority)' : `EXISTS (${targetSQL})`} AS authority_allowed,
          EXISTS (SELECT 1 FROM target WHERE session_id=${sessionParameter}::uuid) AS target_allowed,
          NOT EXISTS (SELECT 1 FROM unnest(${scannedParameter}::uuid[]) expected(id) WHERE NOT EXISTS (
            SELECT 1 FROM domain_events original WHERE original.id=expected.id AND original.workspace_id=$3 AND original.cursor>$4::bigint)) AS source_allowed),
      inserted AS (INSERT INTO a2a_deliveries(binding_id,delivery_id,external_task_id,direction,sequence,session_id,domain_event_id,payload,status,processed_at)
        SELECT $1,'event:'||entry.id,$2,'outbound',entry.cursor::bigint,${sessionParameter}::uuid,entry.id,entry.payload,'processed',now()
        FROM jsonb_to_recordset(${mappedParameter}::jsonb) entry(id uuid,cursor text,payload jsonb) CROSS JOIN gate
        WHERE gate.authority_allowed AND gate.target_allowed AND gate.source_allowed AND EXISTS (
          SELECT 1 FROM domain_events original WHERE original.id=entry.id AND original.workspace_id=$3
            AND (original.aggregate_id=${sessionParameter}::uuid OR original.payload->>'sessionId'=${sessionParameter}::text))
        ON CONFLICT(binding_id,domain_event_id) WHERE domain_event_id IS NOT NULL DO NOTHING RETURNING id)
      SELECT gate.*,(SELECT count(*) FROM inserted) AS inserted_count FROM gate`,values)).rows[0]!
    requireAuthority(final.authority_allowed)
    if (!final.target_allowed || !final.source_allowed) throw new DomainError('NOT_FOUND','A2A task binding or scanned events are no longer visible')
    return a2aTaskEventPageSchema.parse({events:mapped.map(entry=>({cursor:entry.cursor,event:entry.payload})),cursor:scan.events.at(-1)?.cursor??after})
  })
}
