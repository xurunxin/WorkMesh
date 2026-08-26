import {
  recoveryItemSchema,
  type RecoveryCondition,
  type RecoveryItem,
} from '@workmesh/contracts'

export type RecoveryRow = Readonly<{
  condition: RecoveryCondition
  lifecycle: 'active' | 'resolved'
  happened_at: Date | string
  source_type: string
  source_id: string
  source_status: string
  source_revision: number
  event_cursor: string | null
  workspace_id: string
  team_id: string | null
  project_id: string | null
  project_name: string | null
  work_item_id: string | null
  work_item_title: string | null
  session_id: string
  plan_step_id: string | null
  session_state: RecoveryItem['authority']['sessionState']
  session_revision: number
  session_updated_at: Date | string
  state_reason: string | null
  error_code: string | null
  error_summary: string | null
  heartbeat_health: 'healthy' | 'degraded' | 'stale'
  acknowledged_at: Date | string | null
  last_heartbeat_at: Date | string | null
  delegation_id: string
  delegation_status: RecoveryItem['authority']['delegationStatus']
  responsible_human_id: string | null
  responsible_human_name: string | null
  agent_actor_id: string
  agent_name: string
  connection_status: RecoveryItem['authority']['connectionStatus']
  active_executor: boolean
  latest_session_id: string | null
  latest_session_state: RecoveryItem['authority']['sessionState']
  lease_id: string | null
  lease_status: 'active' | 'released' | 'expired' | 'revoked' | null
  lease_version: number | null
  lease_expires_at: Date | string | null
  replacement_lease_id: string | null
  approval_id: string | null
  approval_status: string | null
  approval_revision: number | null
  approval_expires_at: Date | string | null
  replacement_approval_id: string | null
  retry_session_id: string | null
  retry_session_revision: number | null
  retry_count: number
  context_snapshot_id: string | null
  artifacts: unknown
  message_count: string | number
  failed_validation_count: string | number
  budget: unknown
}>

const terminalStates = new Set(['completed', 'failed', 'canceled'])
const iso = (value: Date | string): string => value instanceof Date
  ? value.toISOString()
  : new Date(value).toISOString()
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {}

const severity = (condition: RecoveryCondition): RecoveryItem['severity'] => {
  if (['lease_lost', 'budget_exhausted', 'validation_attempts_exhausted'].includes(condition)) return 'critical'
  if (['session_failed', 'session_stale', 'heartbeat_timeout', 'assignment_without_active_executor', 'approval_expired'].includes(condition)) return 'high'
  return 'medium'
}

const presentation = (row: RecoveryRow): { title: string; summary: string; impact: string } => {
  const detail = row.error_summary ?? row.state_reason
  const values: Record<RecoveryCondition, { title: string; summary: string; impact: string }> = {
    missing_first_heartbeat: { title: 'Agent did not send its first heartbeat', summary: 'The Session acknowledged work but has not established a current heartbeat.', impact: 'Execution currentness cannot be guaranteed; dependent work should remain blocked until the Session is refreshed or replaced.' },
    heartbeat_timeout: { title: 'Agent heartbeat timed out', summary: 'The durable heartbeat health projection is stale.', impact: 'The assignment may still exist, but dangerous execution controls require refreshed authority and Session state.' },
    session_stale: { title: 'Agent Session is stale', summary: detail ?? 'The Session is outside its supported execution freshness boundary.', impact: 'Ordinary writes are fenced; retry must create a distinct replacement Session.' },
    session_failed: { title: 'Agent Session failed', summary: detail ?? 'The Session reached a terminal failure.', impact: 'The failed Session remains immutable; unfinished work requires review, Retry, or Handoff.' },
    session_canceled: { title: 'Agent Session was canceled', summary: detail ?? 'The Session ended without completing the requested work.', impact: 'The terminal Session cannot be revived in place; preserved evidence and remaining work must be reviewed.' },
    session_blocked: { title: 'Agent Session is blocked', summary: detail ?? 'The Session reported a blocker that prevents safe progress.', impact: 'Downstream work remains blocked until the source condition is resolved or execution is handed off.' },
    assignment_without_active_executor: { title: 'Assignment has no active executor', summary: 'An executor Delegation remains assigned but no current lease-backed executor projection exists.', impact: 'The assignment is historical or terminal-only and must not be presented as actively executing.' },
    lease_lost: { title: 'Execution Lease was lost', summary: 'The Session Lease expired, was released, or was revoked while work was still active.', impact: 'Lease-dependent writes are unsafe until the authoritative Lease policy reacquires or transfers ownership.' },
    approval_expired: { title: 'Approval expired before use', summary: 'The protected action no longer has a current usable Approval.', impact: 'The exact action payload and source revision must be revalidated before a new Approval is requested.' },
    validation_attempts_exhausted: { title: 'Repeated validation failed', summary: `${Number(row.failed_validation_count)} validation or error facts were recorded without a later successful validation artifact.`, impact: 'Automatic recovery bounds are exhausted for this projection; a Human should review evidence and choose a scoped alternative.' },
    completion_evidence_missing: { title: 'Completion evidence is missing', summary: 'The Session completed without a linked Artifact, result evidence, or explicit no-artifact explanation.', impact: 'Completion cannot be verified until evidence or an explicit accepted explanation is recorded.' },
    budget_exhausted: { title: 'Execution budget was exhausted', summary: detail ?? 'The Session stopped after reaching a configured budget or attempt bound.', impact: 'Further execution requires an explicit budget/policy review and a distinct authorized attempt.' },
  }
  return values[row.condition]
}

const artifactReferences = (value: unknown): RecoveryItem['preservedWork']['artifacts'] => {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    const item = record(candidate)
    if (typeof item.id !== 'string') return []
    const uri = typeof item.uri === 'string' && /^https?:\/\//.test(item.uri) ? item.uri : undefined
    return [{
      type: typeof item.type === 'string' ? item.type : 'artifact',
      id: item.id,
      ...(typeof item.title === 'string' ? { title: item.title } : {}),
      ...(uri ? { uri } : {}),
      ...(typeof item.status === 'string' ? { status: item.status } : {}),
    }]
  })
}

const action = (
  id: string,
  kind: RecoveryItem['actions'][number]['kind'],
  label: string,
  method: 'GET' | 'POST',
  path: string,
  tradeoff: string,
  options: Partial<Pick<RecoveryItem['actions'][number], 'consequencePreviewPath' | 'dangerous' | 'requiresCurrent' | 'requiresApproval' | 'requiresReason'>> = {},
): RecoveryItem['actions'][number] => ({
  id, kind, label, method, path,
  consequencePreviewPath: options.consequencePreviewPath ?? null,
  dangerous: options.dangerous ?? method === 'POST',
  requiresCurrent: options.requiresCurrent ?? method === 'POST',
  requiredCapabilities: method === 'POST' ? ['work:write'] : ['work:read'],
  requiresApproval: options.requiresApproval ?? false,
  requiresReason: options.requiresReason ?? method === 'POST',
  tradeoff,
})

const actions = (row: RecoveryRow): RecoveryItem['actions'] => {
  const result = [
    action('refresh', 'refresh', 'Refresh recovery facts', 'GET', `/api/v1/recovery-items/v1:${row.condition}:${row.source_id}`, 'Keeps the current snapshot visible while revalidating this authorized source.', { dangerous: false, requiresCurrent: false, requiresReason: false }),
    action('open_run', 'open_run', 'Open Run details', 'GET', `/agent-sessions/${row.session_id}`, 'Inspects the source Session and causal timeline without mutating it.', { dangerous: false, requiresCurrent: false, requiresReason: false }),
  ]
  if (row.work_item_id) result.push(action('open_work_item', 'open_work_item', 'Open Work Item', 'GET', `/?view=issues&workItem=${row.work_item_id}`, 'Returns to the responsible work context.', { dangerous: false, requiresCurrent: false, requiresReason: false }))
  if (row.lifecycle === 'resolved') return result
  if (['missing_first_heartbeat', 'heartbeat_timeout', 'session_stale', 'session_failed', 'session_canceled', 'session_blocked', 'assignment_without_active_executor', 'budget_exhausted', 'validation_attempts_exhausted'].includes(row.condition)) {
    result.push(action('retry', 'retry', 'Preview and Retry', 'POST', `/api/v1/agent-sessions/${row.session_id}/retry`, 'Creates a distinct linked Session; the source Session remains immutable.', { consequencePreviewPath: `/api/v1/agent-sessions/${row.session_id}/control-preview`, dangerous: true, requiresCurrent: true, requiresReason: true }))
    result.push(action('handoff', 'handoff', 'Preview Handoff', 'POST', '/api/v1/handoffs', 'Preserves the context/evidence packet while transferring remaining work through governed Handoff.', { consequencePreviewPath: `/api/v1/agent-sessions/${row.session_id}/control-preview`, dangerous: true, requiresCurrent: true, requiresReason: true }))
  }
  if (row.condition === 'lease_lost') result.push(action('reacquire_lease', 'reacquire_lease', 'Reacquire Lease', 'POST', '/api/v1/leases', 'Revalidates the Session, Delegation, resource scope, and current Lease owner before acquisition.', { dangerous: true, requiresCurrent: true, requiresReason: true }))
  if (row.condition === 'approval_expired' && row.approval_id) result.push(action('renew_approval', 'renew_approval', 'Review and re-request Approval', 'GET', `/?view=inbox&queue=needs-you&attention=v1:approval:${row.approval_id}`, 'The expired Approval is not reused; the current payload and revision must be reviewed.', { dangerous: false, requiresCurrent: false, requiresReason: false }))
  if (['missing_first_heartbeat', 'heartbeat_timeout'].includes(row.condition)) result.push(action('reconnect', 'reconnect', 'Inspect Agent connection', 'GET', `/agents/${row.agent_actor_id}`, 'Connection diagnostics may explain heartbeat loss without changing Session state.', { dangerous: false, requiresCurrent: false, requiresReason: false }))
  return result
}

const executorState = (row: RecoveryRow): RecoveryItem['executor']['state'] => {
  if (row.active_executor) return 'active_executor'
  if (row.delegation_status !== 'active') return 'unassigned'
  if (row.latest_session_id === row.session_id && row.latest_session_state && terminalStates.has(row.latest_session_state)) return 'terminal_only_assignment'
  return 'historical_assignment'
}

const leaseState = (row: RecoveryRow, observedAt: Date): RecoveryItem['lease']['status'] => {
  if (!row.lease_id) return 'none'
  if (row.lease_status === 'active' && row.lease_expires_at && new Date(row.lease_expires_at) <= observedAt) return 'expired'
  if (row.lease_status === 'released') return 'released'
  if (row.lease_status === 'revoked') return 'revoked'
  if (row.lease_status === 'expired') return 'expired'
  return row.active_executor ? 'active' : 'lost'
}

export function projectRecoveryRow(row: RecoveryRow, observedAt: Date): RecoveryItem {
  const copy = presentation(row)
  const itemActions = actions(row)
  const budget = record(row.budget)
  const configuredLimit = typeof budget.maxRetries === 'number' && Number.isInteger(budget.maxRetries) && budget.maxRetries > 0
    ? budget.maxRetries
    : null
  const stale = ['missing_first_heartbeat', 'heartbeat_timeout', 'session_stale', 'lease_lost'].includes(row.condition)
  const sourceUpdatedAt = iso(row.session_updated_at)
  const freshnessState = stale ? 'stale' as const : row.event_cursor ? 'current' as const : 'partial' as const
  const resolvedBy = row.retry_session_id
    ? { type: 'session', id: row.retry_session_id, ...(row.retry_session_revision ? { revision: row.retry_session_revision } : {}), label: 'Replacement Session' }
    : row.replacement_lease_id ? { type: 'lease', id: row.replacement_lease_id, label: 'Replacement Lease' }
      : row.replacement_approval_id ? { type: 'approval', id: row.replacement_approval_id, label: 'Replacement Approval' }
        : undefined
  const recommended = itemActions.find(item => item.id === (row.condition === 'lease_lost' ? 'reacquire_lease' : row.condition === 'approval_expired' ? 'renew_approval' : 'retry'))
    ?? itemActions[0]
  return recoveryItemSchema.parse({
    projectionVersion: 1,
    id: `v1:${row.condition}:${row.source_id}`,
    condition: row.condition,
    lifecycle: row.lifecycle,
    severity: severity(row.condition),
    title: copy.title,
    summary: copy.summary,
    happenedAt: iso(row.happened_at),
    scope: {
      workspaceId: row.workspace_id,
      teamId: row.team_id,
      projectId: row.project_id,
      projectName: row.project_name,
      workItemId: row.work_item_id,
      workItemTitle: row.work_item_title,
      sessionId: row.session_id,
      planStepId: row.plan_step_id,
      responsibleHuman: row.responsible_human_id && row.responsible_human_name
        ? { id: row.responsible_human_id, kind: 'human', displayName: row.responsible_human_name }
        : null,
    },
    source: { type: row.source_type, id: row.source_id, status: row.source_status, revision: row.source_revision, eventCursor: row.event_cursor, updatedAt: sourceUpdatedAt },
    freshness: { state: freshnessState, observedAt: observedAt.toISOString(), sourceUpdatedAt },
    executor: {
      state: executorState(row),
      active: row.active_executor,
      agent: { id: row.agent_actor_id, kind: 'agent', displayName: row.agent_name },
      delegationId: row.delegation_id,
      delegationStatus: row.delegation_status,
      sessionState: row.session_state,
      connectionStatus: row.connection_status,
    },
    lease: { id: row.lease_id, status: leaseState(row, observedAt), version: row.lease_version, expiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null },
    authority: { sessionState: row.session_state, delegationStatus: row.delegation_status, connectionStatus: row.connection_status, currentStateRequired: itemActions.some(item => item.requiresCurrent) },
    preservedWork: {
      artifacts: artifactReferences(row.artifacts),
      messages: Number(row.message_count),
      contextSnapshotId: row.context_snapshot_id,
      uncommitted: terminalStates.has(row.session_state ?? '') ? 'unknown' : 'runtime_dependent',
      uncommittedExplanation: terminalStates.has(row.session_state ?? '')
        ? 'Only committed Artifacts, messages, and context are durable; uncommitted runtime work is unknown.'
        : 'Uncommitted work depends on the Agent runtime and is not claimed as preserved by WorkMesh.',
    },
    attempts: {
      used: row.retry_count,
      limit: configuredLimit,
      remaining: configuredLimit === null ? null : Math.max(0, configuredLimit - row.retry_count),
      circuitBreaker: configuredLimit === null ? 'unsupported' : row.retry_count >= configuredLimit ? 'open' : 'closed',
    },
    downstreamImpact: copy.impact,
    recommendedActionId: recommended?.id ?? null,
    actions: itemActions,
    ...(resolvedBy ? { resolvedBy } : {}),
    technicalDetailsPath: `/api/v1/recovery-items/v1:${row.condition}:${row.source_id}`,
  })
}

export const recoveryProjectionSql = `WITH recovery_sessions AS (
  SELECT session.*,work.title AS work_item_title,work.responsible_human_actor_id,
         project.name AS project_name,delegation.status::text AS delegation_status,
         agent_actor.display_name AS agent_name,responsible.display_name AS responsible_human_name,
         connection.status AS connection_status,
         executor.session_id IS NOT NULL AS active_executor,
         latest_session.id AS latest_session_id,latest_session.state::text AS latest_session_state,
         lost_lease.id AS lease_id,lost_lease.status::text AS lease_status,lost_lease.version AS lease_version,
         lost_lease.expires_at AS lease_expires_at,replacement_lease.id AS replacement_lease_id,
         expired_approval.id AS approval_id,expired_approval.status::text AS approval_status,
         expired_approval.revision AS approval_revision,expired_approval.expires_at AS approval_expires_at,
         replacement_approval.id AS replacement_approval_id,
         retry.id AS retry_session_id,retry.revision AS retry_session_revision,
         artifacts.items AS artifacts,COALESCE(messages.count,0) AS message_count,
         COALESCE(validation.failed_count,0) AS failed_validation_count,
         validation.passed AS validation_passed,event.cursor::text AS event_cursor
    FROM agent_sessions session
    JOIN delegations delegation ON delegation.id=session.delegation_id AND delegation.workspace_id=session.workspace_id
    JOIN actors agent_actor ON agent_actor.id=session.agent_actor_id AND agent_actor.workspace_id=session.workspace_id
    LEFT JOIN work_items work ON work.id=session.work_item_id AND work.workspace_id=session.workspace_id AND work.deleted_at IS NULL
    LEFT JOIN projects project ON project.id=COALESCE(session.project_id,work.project_id) AND project.workspace_id=session.workspace_id AND project.deleted_at IS NULL
    LEFT JOIN actors responsible ON responsible.id=work.responsible_human_actor_id AND responsible.workspace_id=session.workspace_id AND responsible.kind='human'
    LEFT JOIN LATERAL (SELECT candidate.status FROM agent_connections candidate WHERE candidate.workspace_id=session.workspace_id AND candidate.team_id=session.team_id AND candidate.agent_id=session.agent_id ORDER BY CASE candidate.status WHEN 'active' THEN 0 WHEN 'rotating' THEN 1 ELSE 2 END,candidate.updated_at DESC LIMIT 1) connection ON true
    LEFT JOIN LATERAL (SELECT projection.session_id FROM work_item_executor_projections projection WHERE projection.workspace_id=session.workspace_id AND projection.session_id=session.id AND projection.lease_expires_at>now() LIMIT 1) executor ON true
    LEFT JOIN LATERAL (SELECT candidate.id,candidate.state FROM agent_sessions candidate WHERE candidate.workspace_id=session.workspace_id AND candidate.delegation_id=session.delegation_id AND candidate.session_kind='execution' ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1) latest_session ON true
    LEFT JOIN LATERAL (SELECT lease.id,lease.status,lease.version,lease.expires_at FROM leases lease WHERE lease.workspace_id=session.workspace_id AND lease.session_id=session.id AND (lease.status<>'active' OR lease.expires_at<=now()) ORDER BY lease.updated_at DESC,lease.id DESC LIMIT 1) lost_lease ON true
    LEFT JOIN LATERAL (SELECT lease.id FROM leases lease WHERE lease.workspace_id=session.workspace_id AND lease.session_id=session.id AND lease.status='active' AND lease.expires_at>now() ORDER BY lease.updated_at DESC,lease.id DESC LIMIT 1) replacement_lease ON true
    LEFT JOIN LATERAL (SELECT approval.id,approval.status,approval.revision,approval.expires_at,approval.action_name FROM approvals approval WHERE approval.workspace_id=session.workspace_id AND approval.session_id=session.id AND (approval.status='expired' OR (approval.status='pending' AND approval.expires_at<=now())) ORDER BY approval.updated_at DESC,approval.id DESC LIMIT 1) expired_approval ON true
    LEFT JOIN LATERAL (SELECT approval.id FROM approvals approval WHERE approval.workspace_id=session.workspace_id AND approval.session_id=session.id AND approval.status='pending' AND approval.expires_at>now() AND (expired_approval.action_name IS NULL OR approval.action_name=expired_approval.action_name) ORDER BY approval.created_at DESC,approval.id DESC LIMIT 1) replacement_approval ON true
    LEFT JOIN LATERAL (SELECT candidate.id,candidate.revision FROM agent_sessions candidate WHERE candidate.workspace_id=session.workspace_id AND candidate.retry_of_session_id=session.id ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1) retry ON true
    LEFT JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',artifact.id,'type',artifact.type,'title',artifact.title,'uri',artifact.uri,'status',COALESCE(artifact.metadata->>'validationStatus',artifact.metadata->>'status')) ORDER BY artifact.created_at DESC,artifact.id DESC),'[]'::jsonb) AS items FROM artifacts artifact WHERE artifact.workspace_id=session.workspace_id AND artifact.session_id=session.id) artifacts ON true
    LEFT JOIN LATERAL (SELECT count(*) AS count FROM room_messages message WHERE message.workspace_id=session.workspace_id AND message.session_id=session.id) messages ON true
    LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE activity.kind='error' OR activity.tool_invocation->>'status'='failed') AS failed_count,EXISTS(SELECT 1 FROM artifacts artifact WHERE artifact.workspace_id=session.workspace_id AND artifact.session_id=session.id AND (artifact.metadata->>'validationStatus'='passed' OR artifact.metadata->>'status'='passed')) AS passed FROM agent_activities activity WHERE activity.session_id=session.id) validation ON true
    LEFT JOIN LATERAL (SELECT source.cursor FROM domain_events source WHERE source.workspace_id=session.workspace_id AND source.aggregate_type='agent_session' AND source.aggregate_id=session.id ORDER BY source.cursor DESC LIMIT 1) event ON true
   WHERE session.workspace_id=$1 AND session.session_kind='execution'
), recovery AS (
  SELECT condition.condition,condition.happened_at,
         CASE
           WHEN condition.condition='lease_lost' THEN 'lease'
           WHEN condition.condition='approval_expired' THEN 'approval'
           ELSE 'agent_session'
         END AS source_type,
         CASE
           WHEN condition.condition='lease_lost' THEN session.lease_id
           WHEN condition.condition='approval_expired' THEN session.approval_id
           ELSE session.id
         END AS source_id,
         CASE
           WHEN condition.condition='lease_lost' THEN session.lease_status
           WHEN condition.condition='approval_expired' THEN session.approval_status
           ELSE session.state::text
         END AS source_status,
         CASE
           WHEN condition.condition='lease_lost' THEN session.lease_version
           WHEN condition.condition='approval_expired' THEN session.approval_revision
           ELSE session.revision
         END AS source_revision,
         CASE
           WHEN condition.condition='lease_lost' AND session.replacement_lease_id IS NOT NULL THEN 'resolved'
           WHEN condition.condition='approval_expired' AND session.replacement_approval_id IS NOT NULL THEN 'resolved'
           WHEN session.retry_session_id IS NOT NULL THEN 'resolved'
           ELSE 'active'
         END AS lifecycle,
         session.event_cursor,session.workspace_id,session.team_id,COALESCE(session.project_id,session.work_item_id_project) AS project_id,
         session.project_name,session.work_item_id,session.work_item_title,session.id AS session_id,session.plan_step_id,
         session.state::text AS session_state,session.revision AS session_revision,session.updated_at AS session_updated_at,
         session.state_reason,session.error_code,session.error_summary,session.heartbeat_health,session.acknowledged_at,session.last_heartbeat_at,
         session.delegation_id,session.delegation_status,session.responsible_human_actor_id AS responsible_human_id,session.responsible_human_name,
         session.agent_actor_id,session.agent_name,session.connection_status,session.active_executor,session.latest_session_id,session.latest_session_state,
         session.lease_id,session.lease_status,session.lease_version,session.lease_expires_at,session.replacement_lease_id,
         session.approval_id,session.approval_status,session.approval_revision,session.approval_expires_at,session.replacement_approval_id,
         session.retry_session_id,session.retry_session_revision,session.retry_count,session.context_snapshot_id,session.artifacts,session.message_count,
         session.failed_validation_count,session.budget
    FROM (
      SELECT base.*,work.project_id AS work_item_id_project
        FROM recovery_sessions base
        LEFT JOIN work_items work ON work.id=base.work_item_id AND work.workspace_id=base.workspace_id
    ) session
    CROSS JOIN LATERAL (
      SELECT 'missing_first_heartbeat'::text AS condition,session.acknowledged_at AS happened_at WHERE session.acknowledged_at IS NOT NULL AND session.last_heartbeat_at IS NULL AND session.heartbeat_health<>'healthy' AND session.state NOT IN ('completed','failed','canceled')
      UNION ALL SELECT 'heartbeat_timeout',COALESCE(session.last_heartbeat_at,session.updated_at) WHERE session.heartbeat_health='stale' AND session.state<>'stale'
      UNION ALL SELECT 'session_stale',session.updated_at WHERE session.state='stale'
      UNION ALL SELECT 'session_failed',COALESCE(session.ended_at,session.updated_at) WHERE session.state='failed'
      UNION ALL SELECT 'session_canceled',COALESCE(session.ended_at,session.updated_at) WHERE session.state='canceled'
      UNION ALL SELECT 'session_blocked',session.updated_at WHERE session.state='blocked'
      UNION ALL SELECT 'assignment_without_active_executor',session.updated_at WHERE session.delegation_status='active' AND NOT session.active_executor AND session.latest_session_id=session.id AND session.state NOT IN ('completed','failed','canceled')
      UNION ALL SELECT 'lease_lost',session.lease_expires_at WHERE session.lease_id IS NOT NULL AND session.state NOT IN ('completed','failed','canceled')
      UNION ALL SELECT 'approval_expired',session.approval_expires_at WHERE session.approval_id IS NOT NULL
      UNION ALL SELECT 'validation_attempts_exhausted',session.updated_at WHERE session.failed_validation_count>=3 AND NOT session.validation_passed
      UNION ALL SELECT 'completion_evidence_missing',COALESCE(session.ended_at,session.updated_at) WHERE session.state='completed' AND jsonb_array_length(session.artifacts)=0 AND jsonb_array_length(session.result_evidence)=0 AND session.no_artifact_reason IS NULL
      UNION ALL SELECT 'budget_exhausted',COALESCE(session.ended_at,session.updated_at) WHERE session.state='failed' AND (session.error_code ILIKE '%BUDGET%' OR session.state_reason ILIKE '%budget%' OR session.error_summary ILIKE '%budget%')
    ) condition
)
SELECT recovery.*,to_char(recovery.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS happened_cursor
  FROM recovery
 WHERE recovery.workspace_id=$1`
