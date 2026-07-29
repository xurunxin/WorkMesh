import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { DomainError, assertLoopAdmission, dryRunAutomation, evaluateAutomationCondition } from '@workmesh/domain'
import { appendEvent } from './index.js'
import { lockAgentAuthorityPlan } from './agent-locks.js'

type AutomationCondition = Parameters<typeof evaluateAutomationCondition>[0]
type AutomationAction = Parameters<typeof dryRunAutomation>[1][number]

export type Stage4CommandMeta = {
  workspaceId: string
  actorId: string
  correlationId: string
  idempotencyKey?: string
}

export type Stage4AdmissionAuthorization =
  | { kind: 'trusted_worker' }
  | { kind: 'human' }
  | { kind: 'agent'; sessionId: string }

async function assertAdmissionAuthorization(
  tx: PoolClient,
  meta: Stage4CommandMeta,
  teamId: string | null,
  authorization: Stage4AdmissionAuthorization,
): Promise<void> {
  if (authorization.kind === 'trusted_worker') return
  if (authorization.kind === 'human') {
    const allowed = await tx.query(
      `SELECT 1 FROM actors actor
        WHERE actor.id=$1 AND actor.workspace_id=$2 AND actor.kind='human' AND actor.is_active
          AND (actor.workspace_role='admin' OR $3::uuid IS NULL OR EXISTS (
            SELECT 1 FROM memberships member
             WHERE member.workspace_id=actor.workspace_id AND member.team_id=$3
               AND member.actor_id=actor.id
               AND member.role IN ('admin','maintainer','member')
          ))`,
      [meta.actorId, meta.workspaceId, teamId],
    )
    if (!allowed.rowCount) throw new DomainError('FORBIDDEN', 'Automation Team authorization is required')
    return
  }
  if (!teamId) throw new DomainError('FORBIDDEN', 'Automation Team authorization is required')
  const allowed = await tx.query(
    `SELECT 1 FROM agent_sessions session
      JOIN delegations delegation ON delegation.id=session.delegation_id
        AND delegation.status='active'
      JOIN agent_definitions agent ON agent.id=session.agent_id AND agent.is_active
      JOIN agent_team_access access ON access.workspace_id=session.workspace_id
        AND access.agent_id=session.agent_id AND access.team_id=session.team_id
        AND access.revoked_at IS NULL
     WHERE session.id=$1 AND session.workspace_id=$2 AND session.agent_actor_id=$3
       AND session.team_id=$4
       AND session.state IN ('queued','acknowledged','executing','awaiting_input','awaiting_approval')
       AND 'work:write'=ANY(delegation.permissions_snapshot)
       AND 'work:write'=ANY(agent.approved_capabilities)
       AND 'work:write'=ANY(access.approved_capabilities)
       AND (delegation.capability_scope->'teamIds') ? $4::text`,
    [authorization.sessionId, meta.workspaceId, meta.actorId, teamId],
  )
  if (!allowed.rowCount) throw new DomainError('FORBIDDEN', 'Automation Team authorization is required')
}

type RuleVersionRow = {
  rule_id: string
  rule_version_id: string
  team_id: string | null
  state: 'active' | 'paused' | 'disabled'
  condition: AutomationCondition | null
  actions: AutomationAction[]
  max_attempts: number
}

export async function admitAutomationOccurrence(
  tx: PoolClient,
  input: {
    meta: Stage4CommandMeta
    ruleId: string
    occurrenceKey: string
    eventId?: string
    scheduledFor?: Date
    payload: Record<string, unknown>
    dryRun: boolean
    authorization: Stage4AdmissionAuthorization
  },
): Promise<{ id: string; duplicate: boolean; status: string; trace: unknown }> {
  const rule = (await tx.query<RuleVersionRow>(
    `SELECT rule.id AS rule_id,rule.current_version_id AS rule_version_id,rule.team_id,rule.state,
            version.condition,version.actions,version.max_attempts
       FROM automation_rules rule
       JOIN automation_rule_versions version ON version.id=rule.current_version_id
      WHERE rule.id=$1 AND rule.workspace_id=$2
      FOR UPDATE OF rule`,
    [input.ruleId, input.meta.workspaceId],
  )).rows[0]
  if (!rule) throw new Error('AUTOMATION_RULE_NOT_FOUND')
  await assertAdmissionAuthorization(tx, input.meta, rule.team_id, input.authorization)
  if (!input.dryRun && rule.state !== 'active') throw new Error('AUTOMATION_RULE_NOT_ACTIVE')

  const trace = dryRunAutomation(rule.condition ?? undefined, rule.actions, input.payload)
  if (input.dryRun) {
    const run = (await tx.query<{ id: string }>(
      `INSERT INTO automation_runs(
         workspace_id,team_id,rule_id,rule_version_id,dry_run,status,trace,max_attempts,finished_at
       ) VALUES($1,$2,$3,$4,true,'dry_run',$5,$6,now()) RETURNING id`,
      [input.meta.workspaceId, rule.team_id, rule.rule_id, rule.rule_version_id, trace, rule.max_attempts],
    )).rows[0]!
    await appendEvent(tx, {
      workspaceId: input.meta.workspaceId,
      teamId: rule.team_id ?? undefined,
      actorId: input.meta.actorId,
      correlationId: input.meta.correlationId,
      idempotencyKey: input.meta.idempotencyKey,
      type: 'automation.rule.dry_run_completed',
      aggregateType: 'automation_run',
      aggregateId: run.id,
      payload: { ruleId: rule.rule_id, ruleVersionId: rule.rule_version_id, trace },
    })
    return { id: run.id, duplicate: false, status: 'dry_run', trace }
  }

  const occurrence = await tx.query<{ id: string }>(
    `INSERT INTO automation_occurrences(
       workspace_id,rule_id,rule_version_id,occurrence_key,event_id,scheduled_for,payload
     ) VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(rule_id,occurrence_key) DO NOTHING RETURNING id`,
    [
      input.meta.workspaceId,
      rule.rule_id,
      rule.rule_version_id,
      input.occurrenceKey,
      input.eventId ?? null,
      input.scheduledFor ?? null,
      input.payload,
    ],
  )
  if (!occurrence.rowCount) {
    const existing = (await tx.query<{ id: string; status: string; trace: unknown }>(
      `SELECT run.id,run.status,run.trace
         FROM automation_occurrences occurrence
         JOIN automation_runs run ON run.occurrence_id=occurrence.id
        WHERE occurrence.rule_id=$1 AND occurrence.occurrence_key=$2`,
      [rule.rule_id, input.occurrenceKey],
    )).rows[0]
    if (!existing) throw new Error('AUTOMATION_OCCURRENCE_IN_PROGRESS')
    return { ...existing, duplicate: true }
  }

  const matched = evaluateAutomationCondition(rule.condition ?? undefined, input.payload)
  const run = (await tx.query<{ id: string; status: string }>(
    `INSERT INTO automation_runs(
       workspace_id,team_id,rule_id,rule_version_id,occurrence_id,status,trace,max_attempts,finished_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status`,
    [
      input.meta.workspaceId,
      rule.team_id,
      rule.rule_id,
      rule.rule_version_id,
      occurrence.rows[0]!.id,
      matched ? 'pending' : 'succeeded',
      { matched, evaluatedAt: new Date().toISOString() },
      rule.max_attempts,
      matched ? null : new Date(),
    ],
  )).rows[0]!
  if (matched) {
    for (const [ordinal, action] of rule.actions.entries()) {
      await tx.query(
        `INSERT INTO automation_effects(run_id,action_ordinal,effect_key,action)
         VALUES($1,$2,$3,$4)`,
        [run.id, ordinal, `${run.id}:${ordinal}`, action],
      )
    }
  }
  await appendEvent(tx, {
    workspaceId: input.meta.workspaceId,
    teamId: rule.team_id ?? undefined,
    actorId: input.meta.actorId,
    correlationId: input.meta.correlationId,
    idempotencyKey: input.meta.idempotencyKey,
    type: matched ? 'automation.run.admitted' : 'automation.run.skipped',
    aggregateType: 'automation_run',
    aggregateId: run.id,
    payload: {
      ruleId: rule.rule_id,
      ruleVersionId: rule.rule_version_id,
      occurrenceId: occurrence.rows[0]!.id,
      occurrenceKey: input.occurrenceKey,
    },
  })
  return { id: run.id, duplicate: false, status: run.status, trace: { matched } }
}

type LoopRow = {
  id: string
  workspace_id: string
  team_id: string | null
  project_id: string | null
  owner_actor_id: string
  agent_id: string
  agent_actor_id: string
  approved_capabilities: string[]
  run_template_version_id: string
  template_body: Record<string, unknown>
  budget: Record<string, unknown>
  no_overlap: boolean
  state: string
}

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const notificationPriorityRank: Record<string, number> = {
  input: 0,
  approval: 1,
  agent_failure: 2,
  mention: 3,
  handoff: 4,
  update: 5,
}

export async function admitNotification(
  tx: PoolClient,
  input: {
    workspaceId: string
    recipientActorId: string
    priority: string
    kind: string
    title: string
    body: string
    sourceType: string
    sourceId: string
    dedupeKey: string
    requestedChannels: Array<'in_app' | 'browser' | 'webhook'>
  },
): Promise<{ id: string; channels: string[]; digest: string; suppressed: boolean }> {
  const recipient = await tx.query(
    `SELECT 1 FROM actors WHERE id=$1 AND workspace_id=$2 AND kind='human' AND is_active`,
    [input.recipientActorId, input.workspaceId],
  )
  if (!recipient.rowCount) throw new Error('NOTIFICATION_RECIPIENT_INVALID')
  const preference = (await tx.query<{
    channels: Array<'in_app' | 'browser' | 'webhook'>
    digest: 'immediate' | 'hourly' | 'daily'
    minimum_priority: string
    muted_kinds: string[]
    webhook_url: string | null
  }>(
    `SELECT channels,digest,minimum_priority,muted_kinds,webhook_url
       FROM notification_preferences WHERE workspace_id=$1 AND actor_id=$2`,
    [input.workspaceId, input.recipientActorId],
  )).rows[0]
  const minimum = preference?.minimum_priority ?? 'update'
  const suppressed = (preference?.muted_kinds ?? []).includes(input.kind)
    || (notificationPriorityRank[input.priority] ?? 99) > (notificationPriorityRank[minimum] ?? 99)
  const channels = suppressed ? [] : input.requestedChannels.filter(channel =>
    (!preference || preference.channels.includes(channel))
    && (channel !== 'webhook' || Boolean(preference?.webhook_url)))
  const notification = (await tx.query<{ id: string }>(
    `INSERT INTO notifications(
       workspace_id,recipient_actor_id,priority,kind,title,body,source_type,source_id,dedupe_key
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(workspace_id,recipient_actor_id,dedupe_key)
     DO UPDATE SET dedupe_key=EXCLUDED.dedupe_key RETURNING id`,
    [
      input.workspaceId, input.recipientActorId, input.priority, input.kind, input.title,
      input.body, input.sourceType, input.sourceId, input.dedupeKey,
    ],
  )).rows[0]!
  for (const channel of channels) {
    await tx.query(
      `INSERT INTO notification_deliveries(notification_id,channel,effect_key,available_at)
       VALUES($1,$2,$3,CASE $4
         WHEN 'hourly' THEN date_trunc('hour',now())+interval '1 hour'
         WHEN 'daily' THEN date_trunc('day',now())+interval '1 day'
         ELSE now() END)
       ON CONFLICT(notification_id,channel) DO NOTHING`,
      [notification.id, channel, `notification:${notification.id}:${channel}`, preference?.digest ?? 'immediate'],
    )
  }
  return { id: notification.id, channels, digest: preference?.digest ?? 'immediate', suppressed }
}

export async function admitLoopRun(
  tx: PoolClient,
  input: {
    meta: Stage4CommandMeta
    loopId: string
    occurrenceKey: string
    scheduledFor: Date
    authorization: Stage4AdmissionAuthorization
    notificationChannels?: ReadonlyArray<'in_app' | 'browser' | 'webhook'>
  },
): Promise<{ runId: string; sessionId: string; duplicate: boolean }> {
  const loopLocator = (await tx.query<{
    agent_id: string
    workspace_id: string
    team_id: string | null
    project_id: string | null
  }>(
    `SELECT agent_id,workspace_id,team_id,project_id
       FROM loops
      WHERE id=$1 AND workspace_id=$2`,
    [input.loopId,input.meta.workspaceId],
  )).rows[0]
  if (!loopLocator) throw new Error('LOOP_NOT_FOUND')
  let locatorTeamId=loopLocator.team_id
  if (!locatorTeamId && loopLocator.project_id) {
    locatorTeamId=(await tx.query<{team_id:string}>(
      'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2',
      [loopLocator.project_id,loopLocator.workspace_id],
    )).rows[0]?.team_id??null
  }
  if (!locatorTeamId) {
    locatorTeamId=(await tx.query<{team_id:string}>(
      `SELECT team_id FROM agent_team_access
        WHERE workspace_id=$1 AND agent_id=$2
        ORDER BY created_at,team_id LIMIT 1`,
      [loopLocator.workspace_id,loopLocator.agent_id],
    )).rows[0]?.team_id??null
  }
  if (!locatorTeamId) throw new Error('LOOP_TEAM_SCOPE_REQUIRED')
  await lockAgentAuthorityPlan(tx,{
    definitionIds:[loopLocator.agent_id],
    teamGrants:[{
      workspaceId:loopLocator.workspace_id,
      agentId:loopLocator.agent_id,
      teamId:locatorTeamId,
    }],
    projectIds:loopLocator.project_id?[loopLocator.project_id]:[],
  })
  const loop = (await tx.query<LoopRow>(
    `SELECT loop.*,agent.actor_id AS agent_actor_id,agent.approved_capabilities,
            template.body AS template_body
       FROM loops loop
       JOIN agent_definitions agent ON agent.id=loop.agent_id AND agent.is_active
       JOIN template_versions template ON template.id=loop.run_template_version_id
      WHERE loop.id=$1 AND loop.workspace_id=$2 FOR UPDATE OF loop`,
    [input.loopId, input.meta.workspaceId],
  )).rows[0]
  if (!loop) throw new Error('LOOP_NOT_FOUND')
  if (
    loop.agent_id!==loopLocator.agent_id
    || loop.workspace_id!==loopLocator.workspace_id
    || loop.team_id!==loopLocator.team_id
    || loop.project_id!==loopLocator.project_id
  ) throw new Error('LOOP_AUTHORITY_BINDING_CHANGED')
  if (loop.state !== 'active') throw new Error('LOOP_NOT_ACTIVE')
  let teamId = loop.team_id
  if (!teamId && loop.project_id) {
    teamId = (await tx.query<{ team_id: string }>(
      'SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2',
      [loop.project_id, loop.workspace_id],
    )).rows[0]?.team_id ?? null
  }
  if (!teamId) {
    teamId = (await tx.query<{ team_id: string }>(
      `SELECT team_id FROM agent_team_access
        WHERE workspace_id=$1 AND agent_id=$2 AND revoked_at IS NULL
        ORDER BY created_at LIMIT 1`,
      [loop.workspace_id, loop.agent_id],
    )).rows[0]?.team_id ?? null
  }
  if (!teamId) throw new Error('LOOP_TEAM_SCOPE_REQUIRED')
  await assertAdmissionAuthorization(tx, input.meta, teamId, input.authorization)

  const existing = (await tx.query<{ run_id: string; session_id: string }>(
    `SELECT run.id AS run_id,run.session_id
       FROM automation_runs run
      WHERE run.loop_id=$1 AND run.trace->>'occurrenceKey'=$2`,
    [loop.id, input.occurrenceKey],
  )).rows[0]
  if (existing?.session_id) return { runId: existing.run_id, sessionId: existing.session_id, duplicate: true }

  const activeRunCount = Number((await tx.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM automation_runs
      WHERE loop_id=$1 AND status IN ('pending','claimed','running')`,
    [loop.id],
  )).rows[0]?.count ?? 0)
  const requestedCostMinor = String(loop.budget.maxCostMinor ?? '0')
  const requestedTokens = Number((loop.budget.maxTokens as number | undefined) ?? 0)
  const budgetCurrency = typeof loop.budget.currency === 'string' ? loop.budget.currency.toUpperCase() : 'USD'
  const consumed = (await tx.query<{ cost: string; tokens: string }>(
    `SELECT coalesce(sum(cost_minor),0)::text AS cost,
            coalesce(sum(coalesce(input_tokens,0)+coalesce(output_tokens,0)),0)::text AS tokens
       FROM usage_records WHERE workspace_id=$1
         AND session_id IN (SELECT session_id FROM automation_runs WHERE loop_id=$2)
         AND currency=$3`,
    [loop.workspace_id, loop.id, budgetCurrency],
  )).rows[0]
  const consumedCostMinor = consumed?.cost ?? '0'
  const consumedTokens = Number(consumed?.tokens ?? 0)
  const policy = (await tx.query<{
    hard_cost_minor: string | null
    soft_cost_minor: string | null
    hard_tokens: string | null
    soft_tokens: string | null
  }>(
    `SELECT hard_cost_minor::text,soft_cost_minor::text,
            hard_tokens::text,soft_tokens::text FROM budget_policies
      WHERE workspace_id=$1 AND scope_type='loop' AND scope_id=$2 AND currency=$3
      ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
    [loop.workspace_id, loop.id, budgetCurrency],
  )).rows[0]
  assertLoopAdmission({
    noOverlap: loop.no_overlap,
    activeRunCount,
    requestedCostMinor,
    consumedCostMinor,
    hardCostMinor: policy?.hard_cost_minor ?? undefined,
    requestedTokens,
    consumedTokens,
    hardTokens: policy?.hard_tokens ? Number(policy.hard_tokens) : undefined,
  })

  const teamGrant = (await tx.query<{ approved_capabilities: string[] }>(
    `SELECT approved_capabilities FROM agent_team_access
      WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL`,
    [loop.workspace_id, loop.agent_id, teamId],
  )).rows[0]
  if (!teamGrant) throw new Error('LOOP_AGENT_TEAM_ACCESS_REVOKED')
  const requestedCapabilities = stringArray(loop.template_body.requiredCapabilities)
  const allowed = requestedCapabilities.filter(capability =>
    loop.approved_capabilities.includes(capability) && teamGrant.approved_capabilities.includes(capability))
  if (allowed.length !== requestedCapabilities.length) throw new Error('LOOP_TEMPLATE_CAPABILITY_DENIED')

  const run = (await tx.query<{ id: string }>(
    `INSERT INTO automation_runs(
       workspace_id,team_id,loop_id,status,trace,max_attempts,available_at,enforce_no_overlap
     ) VALUES($1,$2,$3,'pending',$4,$5,$6,$7) RETURNING id`,
    [
      loop.workspace_id,
      teamId,
      loop.id,
      { occurrenceKey: input.occurrenceKey, scheduledFor: input.scheduledFor.toISOString() },
      Number((loop.budget.maxRetries as number | undefined) ?? 5),
      input.scheduledFor,
      loop.no_overlap,
    ],
  )).rows[0]!
  const delegation = (await tx.query<{ id: string }>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,role,scope_type,scope_id,
       permissions_snapshot,capability_scope
     ) VALUES($1,$2,$3,$4,$5,'executor','automation',$6,$7,$8) RETURNING id`,
    [
      loop.workspace_id,
      teamId,
      loop.agent_id,
      loop.agent_actor_id,
      loop.owner_actor_id,
      loop.id,
      allowed,
      { teamIds: [teamId], projectIds: loop.project_id ? [loop.project_id] : [], automationIds: [loop.id] },
    ],
  )).rows[0]!
  const session = (await tx.query<{ id: string }>(
    `INSERT INTO agent_sessions(
       workspace_id,team_id,agent_id,agent_actor_id,delegation_id,automation_run_id,budget
     ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [loop.workspace_id, teamId, loop.agent_id, loop.agent_actor_id, delegation.id, run.id, loop.budget],
  )).rows[0]!
  await tx.query('UPDATE automation_runs SET session_id=$1 WHERE id=$2', [session.id, run.id])
  await tx.query(
    `INSERT INTO loop_budget_reservations(loop_id,automation_run_id,amount)
     VALUES($1,$2,$3)`,
    [loop.id, run.id, { maxCostMinor: requestedCostMinor, currency: budgetCurrency }],
  )
  const softCostMinor = policy?.soft_cost_minor ?? undefined
  const softTokens = policy?.soft_tokens ? Number(policy.soft_tokens) : undefined
  const projectedCostMinor = (BigInt(consumedCostMinor) + BigInt(requestedCostMinor)).toString()
  const softCostReached = softCostMinor !== undefined && BigInt(projectedCostMinor) > BigInt(softCostMinor)
  const softTokensReached = softTokens !== undefined && consumedTokens + requestedTokens > softTokens
  const notificationChannels = input.notificationChannels ?? ['in_app', 'browser', 'webhook']
  if ((softCostReached || softTokensReached) && notificationChannels.length > 0) {
    await admitNotification(tx, {
      workspaceId: loop.workspace_id,
      recipientActorId: loop.owner_actor_id,
      priority: 'update',
      kind: 'budget.soft_limit',
      title: 'Loop soft budget reached',
      body: softCostReached
        ? `Reserved usage may exceed ${softCostMinor} ${budgetCurrency} minor units.`
        : `Reserved usage may exceed ${softTokens} tokens.`,
      sourceType: 'automation_run',
      sourceId: run.id,
      dedupeKey: `loop-soft-budget:${run.id}`,
      requestedChannels: [...notificationChannels],
    })
    await appendEvent(tx, {
      workspaceId: loop.workspace_id,
      teamId,
      actorId: input.meta.actorId,
      correlationId: input.meta.correlationId,
      idempotencyKey: input.meta.idempotencyKey,
      type: 'budget.soft_limit_reached',
      aggregateType: 'automation_run',
      aggregateId: run.id,
      payload: {
        loopId: loop.id,
        softCostMinor,
        projectedCostMinor,
        softTokens,
        projectedTokens: consumedTokens + requestedTokens,
        currency: budgetCurrency,
      },
    })
  }
  await tx.query('UPDATE loops SET next_run_at=NULL,updated_at=now() WHERE id=$1', [loop.id])
  await appendEvent(tx, {
    workspaceId: loop.workspace_id,
    teamId,
    actorId: input.meta.actorId,
    correlationId: input.meta.correlationId,
    idempotencyKey: input.meta.idempotencyKey,
    type: 'loop.run.admitted',
    aggregateType: 'automation_run',
    aggregateId: run.id,
    payload: {
      loopId: loop.id,
      sessionId: session.id,
      runTemplateVersionId: loop.run_template_version_id,
      occurrenceKey: input.occurrenceKey,
    },
  })
  await appendEvent(tx, {
    workspaceId: loop.workspace_id,
    teamId,
    actorId: input.meta.actorId,
    correlationId: input.meta.correlationId,
    idempotencyKey: input.meta.idempotencyKey,
    type: 'agent.session.created',
    aggregateType: 'agent_session',
    aggregateId: session.id,
    revision: 1,
    payload: { automationRunId: run.id, loopId: loop.id },
  })
  return { runId: run.id, sessionId: session.id, duplicate: false }
}

export async function executeAutomationAction(
  tx: PoolClient,
  input: {
    meta: Stage4CommandMeta
    runId: string
    actionOrdinal: number
    action: AutomationAction
    notificationChannels?: ReadonlyArray<'in_app' | 'browser' | 'webhook'>
  },
): Promise<Record<string, unknown>> {
  const authority = (await tx.query<{
    workspace_id: string
    team_id: string | null
    state: string
    actor_id: string
    actor_active: boolean
    team_authorized: boolean
    loop_authorized: boolean
  }>(
    `SELECT run.workspace_id,run.team_id,coalesce(rule.state::text,loop.state::text) AS state,
            coalesce(rule.created_by_actor_id,loop.owner_actor_id) AS actor_id,
            actor.is_active AS actor_active,
            (actor.workspace_role='admin' OR run.team_id IS NULL OR EXISTS (
              SELECT 1 FROM memberships member
               WHERE member.workspace_id=run.workspace_id AND member.team_id=run.team_id
                 AND member.actor_id=actor.id
            )) AS team_authorized,
            (loop.id IS NULL OR EXISTS (
              SELECT 1 FROM agent_sessions session
              JOIN delegations delegation ON delegation.id=session.delegation_id
                AND delegation.status='active'
              JOIN agent_definitions agent ON agent.id=session.agent_id AND agent.is_active
              JOIN agent_team_access access ON access.workspace_id=session.workspace_id
                AND access.agent_id=session.agent_id AND access.team_id=session.team_id
                AND access.revoked_at IS NULL
             WHERE session.id=run.session_id AND session.automation_run_id=run.id
               AND session.state IN ('queued','acknowledged','executing','awaiting_input','awaiting_approval')
            )) AS loop_authorized
       FROM automation_runs run
       LEFT JOIN automation_rules rule ON rule.id=run.rule_id
       LEFT JOIN loops loop ON loop.id=run.loop_id
       JOIN actors actor ON actor.id=coalesce(rule.created_by_actor_id,loop.owner_actor_id)
      WHERE run.id=$1 FOR UPDATE OF run`,
    [input.runId],
  )).rows[0]
  if (!authority || authority.workspace_id !== input.meta.workspaceId) throw new Error('AUTOMATION_RUN_NOT_FOUND')
  if (!authority.actor_active || !authority.team_authorized || !authority.loop_authorized || authority.state !== 'active')
    throw new Error('AUTOMATION_AUTHORITY_REVOKED')

  const parameters = input.action.parameters
  if (parameters.requiresApproval === true) {
    const approvalId = typeof parameters.approvalId === 'string' ? parameters.approvalId : ''
    const approval = await tx.query(
      `SELECT 1 FROM approvals approval
        WHERE approval.id=$1 AND approval.workspace_id=$2 AND approval.status='approved'
          AND approval.expires_at>now() AND approval.consumed_at IS NULL
        FOR UPDATE`,
      [approvalId, authority.workspace_id],
    )
    if (!approval.rowCount) throw new Error('AUTOMATION_APPROVAL_REQUIRED')
    await tx.query(
      `UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now()
        WHERE id=$1`,
      [approvalId],
    )
  }
  let result: Record<string, unknown>
  if (input.action.type === 'create_work_item') {
    const teamId = typeof parameters.teamId === 'string' ? parameters.teamId : authority.team_id
    const title = typeof parameters.title === 'string' ? parameters.title.trim() : ''
    if (!teamId || !title || (authority.team_id && teamId !== authority.team_id))
      throw new Error('AUTOMATION_ACTION_INVALID')
    const state = (await tx.query<{ id: string }>(
      `SELECT state.id FROM workflow_states state
        WHERE state.workspace_id=$1 AND state.team_id=$2
          AND ($3::uuid IS NULL OR state.id=$3)
          AND NOT state.is_archived
        ORDER BY (state.category='backlog') DESC,state.position LIMIT 1`,
      [authority.workspace_id, teamId,
        typeof parameters.statusId === 'string' ? parameters.statusId : null],
    )).rows[0]
    if (!state) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const number = (await tx.query<{ number: number }>(
      `UPDATE teams SET next_work_item_number=next_work_item_number+1,revision=revision+1,updated_at=now()
        WHERE id=$1 AND workspace_id=$2 RETURNING next_work_item_number-1 AS number`,
      [teamId, authority.workspace_id],
    )).rows[0]?.number
    if (!number) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const item = (await tx.query<{ id: string; revision: number }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,description,status_id,priority,
         responsible_human_actor_id,labels,project_id
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,revision`,
      [
        authority.workspace_id, teamId, number, title,
        typeof parameters.description === 'string' ? parameters.description : null,
        state.id, typeof parameters.priority === 'string' ? parameters.priority : 'none',
        typeof parameters.responsibleHumanActorId === 'string' ? parameters.responsibleHumanActorId : authority.actor_id,
        stringArray(parameters.labels),
        typeof parameters.projectId === 'string' ? parameters.projectId : null,
      ],
    )).rows[0]!
    result = { workItemId: item.id, number, revision: item.revision }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id, teamId, actorId: authority.actor_id,
      correlationId: input.meta.correlationId, type: 'work_item.created',
      aggregateType: 'work_item', aggregateId: item.id, revision: item.revision,
      payload: { runId: input.runId, actionOrdinal: input.actionOrdinal, number, title },
    })
  } else if (input.action.type === 'send_message') {
    const sessionId = typeof parameters.sessionId === 'string' ? parameters.sessionId : ''
    const bodyMarkdown = typeof parameters.bodyMarkdown === 'string' ? parameters.bodyMarkdown.trim() : ''
    if (!sessionId || !bodyMarkdown) throw new Error('AUTOMATION_ACTION_INVALID')
    const session = (await tx.query<{ team_id: string; sequence: number; agent_actor_id: string }>(
      `UPDATE agent_sessions SET sequence=sequence+1,revision=revision+1,updated_at=now()
        WHERE id=$1 AND workspace_id=$2
          AND ($3::uuid IS NULL OR team_id=$3)
          AND state IN ('queued','acknowledged','executing','awaiting_input','awaiting_approval')
        RETURNING team_id,sequence,agent_actor_id`,
      [sessionId, authority.workspace_id, authority.team_id],
    )).rows[0]
    if (!session) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const activity = (await tx.query<{ id: string }>(
      `INSERT INTO agent_activities(
         session_id,actor_id,sequence,kind,summary,details_markdown
       ) VALUES($1,$2,$3,'message',$4,$4) RETURNING id`,
      [sessionId, authority.actor_id, session.sequence, bodyMarkdown],
    )).rows[0]!
    result = { sessionId, activityId: activity.id, sequence: session.sequence }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id, teamId: session.team_id, actorId: authority.actor_id,
      correlationId: input.meta.correlationId, type: 'agent.activity.created',
      aggregateType: 'agent_session', aggregateId: sessionId,
      payload: { runId: input.runId, activityId: activity.id, kind: 'message' },
    })
  } else if (input.action.type === 'request_approval') {
    const sessionId = typeof parameters.sessionId === 'string' ? parameters.sessionId : ''
    const actionName = typeof parameters.actionName === 'string' ? parameters.actionName : ''
    const payloadHash = typeof parameters.actionPayloadHash === 'string' ? parameters.actionPayloadHash : ''
    const expiresAt = typeof parameters.expiresAt === 'string' ? new Date(parameters.expiresAt) : null
    if (!sessionId || !actionName || !/^sha256:[a-f0-9]{64}$/.test(payloadHash)
      || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())
      throw new Error('AUTOMATION_ACTION_INVALID')
    const session = (await tx.query<{ team_id: string }>(
      `SELECT team_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2
        AND ($3::uuid IS NULL OR team_id=$3)
        AND state IN ('queued','acknowledged','executing','awaiting_input','awaiting_approval')
        FOR UPDATE`,
      [sessionId, authority.workspace_id, authority.team_id],
    )).rows[0]
    if (!session) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const approval = (await tx.query<{ id: string }>(
      `INSERT INTO approvals(
         workspace_id,session_id,requested_by_actor_id,approval_type,action_name,
         action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,
         required_approvals,expires_at
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        authority.workspace_id, sessionId, authority.actor_id,
        typeof parameters.approvalType === 'string' ? parameters.approvalType : 'automation',
        actionName,
        typeof parameters.actionPayloadSanitized === 'object' && parameters.actionPayloadSanitized
          ? parameters.actionPayloadSanitized : {},
        payloadHash,
        typeof parameters.riskLevel === 'string' ? parameters.riskLevel : 'medium',
        typeof parameters.rationaleSummary === 'string' ? parameters.rationaleSummary : 'Requested by automation',
        typeof parameters.requiredApprovals === 'number' ? parameters.requiredApprovals : 1,
        expiresAt,
      ],
    )).rows[0]!
    result = { approvalId: approval.id, sessionId }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id, teamId: session.team_id, actorId: authority.actor_id,
      correlationId: input.meta.correlationId, type: 'approval.requested',
      aggregateType: 'approval', aggregateId: approval.id,
      payload: { runId: input.runId, sessionId, actionName },
    })
  } else if (input.action.type === 'create_project_update') {
    const projectId = typeof parameters.projectId === 'string' ? parameters.projectId : ''
    const body = typeof parameters.body === 'string' ? parameters.body.trim() : ''
    const health = typeof parameters.health === 'string' ? parameters.health : 'unknown'
    if (!projectId || !body) throw new Error('AUTOMATION_ACTION_INVALID')
    const project = (await tx.query<{ team_id: string }>(
      `SELECT team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL
        AND ($3::uuid IS NULL OR team_id=$3) FOR UPDATE`,
      [projectId, authority.workspace_id, authority.team_id],
    )).rows[0]
    if (!project) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const update = (await tx.query<{ id: string; revision: number }>(
      `INSERT INTO project_updates(
         workspace_id,project_id,author_actor_id,health,body,status,evidence_artifact_ids
       ) VALUES($1,$2,$3,$4,$5,'draft',$6) RETURNING id,revision`,
      [authority.workspace_id, projectId, authority.actor_id, health, body,
        stringArray(parameters.evidenceArtifactIds)],
    )).rows[0]!
    result = { projectUpdateId: update.id, projectId, revision: update.revision, status: 'draft' }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id, teamId: project.team_id, actorId: authority.actor_id,
      correlationId: input.meta.correlationId, type: 'project.update.drafted',
      aggregateType: 'project_update', aggregateId: update.id, revision: update.revision,
      payload: { runId: input.runId, projectId },
    })
  } else if (input.action.type === 'update_work_item' || input.action.type === 'add_label') {
    const workItemId = typeof parameters.workItemId === 'string' ? parameters.workItemId : ''
    const expectedRevision = typeof parameters.expectedRevision === 'number' ? parameters.expectedRevision : -1
    const row = (await tx.query<{ revision: number; labels: string[]; team_id: string }>(
      `SELECT revision,labels,team_id FROM work_items
        WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE`,
      [workItemId, authority.workspace_id],
    )).rows[0]
    if (!row || (authority.team_id && row.team_id !== authority.team_id)) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    if (row.revision !== expectedRevision) throw new Error('REVISION_CONFLICT')
    if (input.action.type === 'add_label') {
      const label = typeof parameters.label === 'string' ? parameters.label : ''
      if (!label) throw new Error('AUTOMATION_ACTION_INVALID')
      const labels = [...new Set([...row.labels, label])]
      await tx.query(
        'UPDATE work_items SET labels=$1,revision=revision+1,updated_at=now() WHERE id=$2',
        [labels, workItemId],
      )
      result = { workItemId, labels, revision: row.revision + 1 }
    } else {
      const statusId = typeof parameters.statusId === 'string' ? parameters.statusId : null
      const priority = typeof parameters.priority === 'string' ? parameters.priority : null
      await tx.query(
        `UPDATE work_items SET status_id=coalesce($1,status_id),priority=coalesce($2,priority),
                revision=revision+1,updated_at=now() WHERE id=$3`,
        [statusId, priority, workItemId],
      )
      result = { workItemId, revision: row.revision + 1 }
    }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id,
      teamId: row.team_id,
      actorId: authority.actor_id,
      correlationId: input.meta.correlationId,
      type: 'work_item.automation_updated',
      aggregateType: 'work_item',
      aggregateId: workItemId,
      revision: row.revision + 1,
      payload: { runId: input.runId, actionOrdinal: input.actionOrdinal, action: input.action.type },
    })
  } else if (input.action.type === 'delegate_agent' || input.action.type === 'start_session') {
    const workItemId = typeof parameters.workItemId === 'string' ? parameters.workItemId : ''
    const agentId = typeof parameters.agentId === 'string' ? parameters.agentId : ''
    const principalHumanActorId = typeof parameters.principalHumanActorId === 'string'
      ? parameters.principalHumanActorId
      : authority.actor_id
    const requestedCapabilities = stringArray(parameters.capabilities)
    const targetLocator=(await tx.query<{team_id:string;project_id:string|null}>(
      `SELECT team_id,project_id FROM work_items
        WHERE id=$1 AND workspace_id=$2`,
      [workItemId,authority.workspace_id],
    )).rows[0]
    if(!targetLocator) throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    const activeTargetSessionIds=(await tx.query<{id:string}>(
      `SELECT id FROM agent_sessions
        WHERE agent_id=$1 AND state NOT IN ('completed','failed','canceled')`,
      [agentId],
    )).rows.map(row=>row.id)
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[agentId],
      teamGrants:[{
        workspaceId:authority.workspace_id,
        agentId,
        teamId:targetLocator.team_id,
      }],
      sessionIds:activeTargetSessionIds,
      workItemIds:[workItemId],
      projectIds:targetLocator.project_id?[targetLocator.project_id]:[],
    })
    const target = (await tx.query<{
      team_id: string
      project_id: string | null
      responsible_human_actor_id: string | null
      agent_actor_id: string
      agent_capabilities: string[]
      team_capabilities: string[]
    }>(
      `SELECT item.team_id,item.project_id,item.responsible_human_actor_id,
              agent.actor_id AS agent_actor_id,agent.approved_capabilities AS agent_capabilities,
              access.approved_capabilities AS team_capabilities
         FROM work_items item
         JOIN agent_definitions agent ON agent.id=$3 AND agent.workspace_id=item.workspace_id AND agent.is_active
         JOIN agent_team_access access ON access.workspace_id=item.workspace_id
           AND access.agent_id=agent.id AND access.team_id=item.team_id AND access.revoked_at IS NULL
         JOIN actors principal ON principal.id=$4 AND principal.workspace_id=item.workspace_id
           AND principal.kind='human' AND principal.is_active
        WHERE item.id=$1 AND item.workspace_id=$2 AND item.deleted_at IS NULL`,
      [workItemId, authority.workspace_id, agentId, principalHumanActorId],
    )).rows[0]
    if (!target || (authority.team_id && target.team_id !== authority.team_id))
      throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    if(target.team_id!==targetLocator.team_id||target.project_id!==targetLocator.project_id)
      throw new Error('AUTOMATION_TARGET_SCOPE_DENIED')
    if (!target.responsible_human_actor_id) throw new Error('RESPONSIBLE_HUMAN_REQUIRED')
    if (!requestedCapabilities.every(capability =>
      target.agent_capabilities.includes(capability) && target.team_capabilities.includes(capability)))
      throw new Error('AUTOMATION_AGENT_CAPABILITY_DENIED')
    const delegation = (await tx.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id,permissions_snapshot,capability_scope
       ) VALUES($1,$2,$3,$4,$5,$6,'triager','work_item',$6,$7,$8) RETURNING id`,
      [
        authority.workspace_id,
        target.team_id,
        agentId,
        target.agent_actor_id,
        principalHumanActorId,
        workItemId,
        requestedCapabilities,
        { teamIds: [target.team_id], workItemIds: [workItemId], projectIds: target.project_id ? [target.project_id] : [] },
      ],
    )).rows[0]!
    const session = (await tx.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,budget
       ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        authority.workspace_id,
        target.team_id,
        agentId,
        target.agent_actor_id,
        delegation.id,
        workItemId,
        parameters.budget ?? {},
      ],
    )).rows[0]!
    result = { delegationId: delegation.id, sessionId: session.id, workItemId }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id,
      teamId: target.team_id,
      actorId: authority.actor_id,
      correlationId: input.meta.correlationId,
      type: 'agent.session.created',
      aggregateType: 'agent_session',
      aggregateId: session.id,
      revision: 1,
      payload: { automationRunId: input.runId, workItemId, delegationId: delegation.id },
    })
  } else if (input.action.type === 'notify') {
    const recipientActorId = typeof parameters.recipientActorId === 'string' ? parameters.recipientActorId : authority.actor_id
    const notification = await admitNotification(tx, {
      workspaceId: authority.workspace_id,
      recipientActorId,
      priority: typeof parameters.priority === 'string' ? parameters.priority : 'update',
      kind: typeof parameters.kind === 'string' ? parameters.kind : 'automation.notice',
      title: typeof parameters.title === 'string' ? parameters.title : 'Automation update',
      body: typeof parameters.body === 'string' ? parameters.body : '',
      sourceType: 'automation_run',
      sourceId: input.runId,
      dedupeKey: `${input.runId}:${input.actionOrdinal}`,
      requestedChannels: [...(input.notificationChannels ?? ['in_app', 'browser', 'webhook'])],
    })
    result = { notificationId: notification.id, channels: notification.channels, suppressed: notification.suppressed }
    await appendEvent(tx, {
      workspaceId: authority.workspace_id,
      teamId: authority.team_id ?? undefined,
      actorId: authority.actor_id,
      correlationId: input.meta.correlationId,
      type: 'notification.created',
      aggregateType: 'notification',
      aggregateId: notification.id,
      audienceActorId: recipientActorId,
      payload: { runId: input.runId },
    })
  } else if (input.action.type === 'call_webhook') {
    // The worker performs the external call only after this transaction commits.
    result = { externalEffect: true, checkpointRequired: true }
  } else {
    throw new Error(`AUTOMATION_ACTION_UNSUPPORTED:${input.action.type}`)
  }
  return result
}
