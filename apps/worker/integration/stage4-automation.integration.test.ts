import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  admitAutomationOccurrence,
  admitLoopRun,
  admitNotification,
  admitChannelEvent, createChannelTarget, updateChannelTarget, claimChannelNotifications, prepareChannelSend, settleChannelSend, reconcileChannelSend,

  appendEvent,
  applyMigrations,
  createDb,
  installWorkspace,
  withTx,
} from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
import { createSessionLifecycleWorker } from '../src/session-lifecycle.js'
import { createOutboxWorker } from '../src/index.js'
import { createAutomationWorker as createBaseAutomationWorker } from '../src/automation.js'

const enabledFeatures = loadFeatureConfig({
  WORKMESH_BETA_PLANNING: 'true',
  WORKMESH_BETA_TEMPLATES: 'true',
  WORKMESH_BETA_COSTS: 'true',
  WORKMESH_BETA_GITEA: 'true',
  WORKMESH_BETA_OPERATIONS_UI: 'true',
  WORKMESH_EXPERIMENTAL_AUTOMATION: 'true',
  WORKMESH_EXPERIMENTAL_AGENT_LOOPS: 'true',
  WORKMESH_EXPERIMENTAL_A2A: 'true',
  WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS: 'true',
  WORKMESH_EXPERIMENTAL_MULTI_RUNTIME: 'true',
})
const createAutomationWorker = (
  options: Parameters<typeof createBaseAutomationWorker>[0],
) => createBaseAutomationWorker({ ...options, features: enabledFeatures })

const databaseUrl = process.env.DATABASE_URL
if (process.env.RUN_INTEGRATION !== '1' || !databaseUrl) throw new Error('Stage 4 Worker integration requires RUN_INTEGRATION=1 and DATABASE_URL.')
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error('Stage 4 Worker integration requires a dedicated *test* database.')
const db = createDb(databaseUrl)

type Fixture = {
  workspaceId: string
  teamId: string
  humanId: string
  workItemId: string
  agentId: string
  agentActorId: string
  templateVersionId: string
}
let fixture: Fixture

const meta = (suffix: string) => ({
  workspaceId: fixture.workspaceId,
  actorId: fixture.humanId,
  correlationId: `stage4:${suffix}:${randomUUID()}`,
})

type AgentAdmissionPersistenceCounts = {
  delegation_count: number
  session_count: number
  agent_event_count: number
  agent_outbox_count: number
}

async function agentAdmissionPersistenceCounts(agentId: string): Promise<AgentAdmissionPersistenceCounts> {
  return (await db.query<AgentAdmissionPersistenceCounts>(
    `SELECT
       (SELECT count(*)::int FROM delegations WHERE workspace_id=$1 AND agent_id=$2) AS delegation_count,
       (SELECT count(*)::int FROM agent_sessions WHERE workspace_id=$1 AND agent_id=$2) AS session_count,
       (SELECT count(*)::int FROM domain_events
         WHERE workspace_id=$1 AND event_type IN ('agent.delegation.created','agent.session.created')) AS agent_event_count,
       (SELECT count(*)::int FROM outbox_events outbox
         JOIN domain_events event ON event.id=outbox.domain_event_id
        WHERE event.workspace_id=$1
          AND event.event_type IN ('agent.delegation.created','agent.session.created')) AS agent_outbox_count`,
    [fixture.workspaceId, agentId],
  )).rows[0]!
}

async function createRule(
  name: string,
  action: { type: string; parameters: Record<string, unknown> }
    | Array<{ type: string; parameters: Record<string, unknown> }>,
  maxAttempts = 3,
  trigger: Record<string, unknown> = { type: 'event', eventTypes: ['work_item.created'] },
): Promise<string> {
  const rule = (await db.query<{ id: string }>(
    `INSERT INTO automation_rules(workspace_id,team_id,name,created_by_actor_id)
     VALUES($1,$2,$3,$4) RETURNING id`,
    [fixture.workspaceId, fixture.teamId, `${name}-${randomUUID()}`, fixture.humanId],
  )).rows[0]!
  const version = (await db.query<{ id: string }>(
    `INSERT INTO automation_rule_versions(
      rule_id,version,trigger,actions,max_attempts,created_by_actor_id
    ) VALUES($1,1,$2,$3,$4,$5) RETURNING id`,
    [rule.id, trigger, JSON.stringify(Array.isArray(action) ? action : [action]), maxAttempts, fixture.humanId],
  )).rows[0]!
  await db.query('UPDATE automation_rules SET current_version_id=$1 WHERE id=$2', [version.id, rule.id])
  return rule.id
}

async function createLoop(name: string, input: {
  ownerActorId?: string
  noOverlap?: boolean
  maxCostMinor?: number | string
  maxTokens?: number
  agentId?: string
} = {}): Promise<string> {
  return (await db.query<{ id: string }>(
    `INSERT INTO loops(
      workspace_id,team_id,name,owner_actor_id,agent_id,run_template_version_id,trigger,budget,
      no_overlap,visibility,failure_notification
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'team','owner') RETURNING id`,
    [fixture.workspaceId, fixture.teamId, `${name}-${randomUUID()}`, input.ownerActorId ?? fixture.humanId,
      input.agentId ?? fixture.agentId, fixture.templateVersionId, { type: 'schedule', cron: '* * * * *', timezone: 'UTC' },
      {
        maxCostMinor: input.maxCostMinor ?? 100,
        maxTokens: input.maxTokens ?? 1_000,
        currency: 'USD',
        maxRetries: 3,
      },
      input.noOverlap ?? true],
  )).rows[0]!.id
}

describe('Stage 4 durable Automation and Loop runtime', () => {
  beforeAll(async () => {
    await applyMigrations(db)
    await db.query('TRUNCATE TABLE workspaces CASCADE')
    const installed = await installWorkspace(db, {
      workspaceName: 'Stage 4 Automation',
      workspaceSlug: `stage4-${randomUUID()}`,
      adminName: 'Stage 4 Admin',
      email: `stage4-${randomUUID()}@example.test`,
      password: 'stage-four-integration-password',
    })
    const state = (await db.query<{ id: string }>(
      "SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog' ORDER BY position LIMIT 1",
      [installed.teamId],
    )).rows[0]!
    const item = (await db.query<{ id: string }>(
      `INSERT INTO work_items(
        workspace_id,team_id,number,title,status_id,responsible_human_actor_id,labels
      ) VALUES($1,$2,1,'Scheduled triage',$3,$4,'{}') RETURNING id`,
      [installed.workspaceId, installed.teamId, state.id, installed.actorId],
    )).rows[0]!
    await db.query(
      'UPDATE teams SET next_work_item_number=2 WHERE id=$1',
      [installed.teamId],
    )
    const agentActor = (await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Stage 4 Agent') RETURNING id",
      [installed.workspaceId],
    )).rows[0]!
    const capabilities = ['work:read', 'work:write']
    const agent = (await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(
        workspace_id,actor_id,slug,display_name,supported_protocols,requested_capabilities,
        approved_capabilities,max_concurrency
      ) VALUES($1,$2,$3,'Stage 4 Agent',ARRAY['native_http']::agent_protocol[],$4,$4,100) RETURNING id`,
      [installed.workspaceId, agentActor.id, `stage4-${randomUUID()}`, capabilities],
    )).rows[0]!
    await db.query(
      `INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities)
       VALUES($1,$2,$3,$4,$5)`,
      [installed.workspaceId, agent.id, installed.teamId, installed.actorId, capabilities],
    )
    const template = (await db.query<{ id: string }>(
      `INSERT INTO templates(workspace_id,kind,name,owner_actor_id,status)
       VALUES($1,'agent_run',$2,$3,'active') RETURNING id`,
      [installed.workspaceId, `triage-${randomUUID()}`, installed.actorId],
    )).rows[0]!
    const templateVersion = (await db.query<{ id: string }>(
      `INSERT INTO template_versions(template_id,version,body,change_summary,created_by_actor_id)
       VALUES($1,1,$2,'Initial',$3) RETURNING id`,
      [template.id, { requiredCapabilities: capabilities }, installed.actorId],
    )).rows[0]!
    await db.query('UPDATE templates SET current_version_id=$1 WHERE id=$2', [templateVersion.id, template.id])
    fixture = {
      workspaceId: installed.workspaceId,
      teamId: installed.teamId,
      humanId: installed.actorId,
      workItemId: item.id,
      agentId: agent.id,
      agentActorId: agentActor.id,
      templateVersionId: templateVersion.id,
    }
  }, 120_000)
  afterAll(async () => { await db.end() })

  it('deduplicates an event occurrence and produces exactly one action', async () => {
    const revision = (await db.query<{ revision: number }>('SELECT revision FROM work_items WHERE id=$1', [fixture.workItemId])).rows[0]!.revision
    const ruleId = await createRule('dedupe', {
      type: 'add_label',
      parameters: { workItemId: fixture.workItemId, expectedRevision: revision, label: 'triaged' },
    })
    const occurrenceKey = `event:${randomUUID()}`
    const first = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('dedupe-1'), ruleId, occurrenceKey, eventId: randomUUID(),
      payload: { work: { id: fixture.workItemId } }, dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    const replay = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('dedupe-2'), ruleId, occurrenceKey, eventId: randomUUID(),
      payload: { work: { id: fixture.workItemId } }, dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    expect(replay).toMatchObject({ id: first.id, duplicate: true })
    const worker = createAutomationWorker({ db, workerId: `dedupe-${randomUUID()}` })
    await worker.tick()
    expect((await db.query<{ labels: string[] }>('SELECT labels FROM work_items WHERE id=$1', [fixture.workItemId])).rows[0]!.labels)
      .toContain('triaged')
    expect((await db.query('SELECT 1 FROM automation_effects WHERE run_id=$1', [first.id])).rowCount).toBe(1)
  })

  it('dead-letters an exhausted predecessor and permanently blocks later ordinals', async () => {
    const blockedTitle = `Blocked after DLQ ${randomUUID()}`
    const ruleId = await createRule('dlq', [
      { type: 'request_approval', parameters: {} },
      { type: 'create_work_item', parameters: { teamId: fixture.teamId, title: blockedTitle } },
    ], 2)
    const admitted = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('dlq'), ruleId, occurrenceKey: `event:${randomUUID()}`,
      payload: {}, dryRun: false, authorization: { kind: 'trusted_worker' },
    }))
    const firstWorker = createAutomationWorker({ db, workerId: `dlq-first-${randomUUID()}` })
    const secondWorker = createAutomationWorker({ db, workerId: `dlq-second-${randomUUID()}` })
    const firstClaims = await Promise.all([firstWorker.claimEffects(), secondWorker.claimEffects()])
    const firstRunClaims = firstClaims.flat().filter(effect => effect.runId === admitted.id)
    expect(firstRunClaims).toHaveLength(1)
    expect(firstRunClaims[0]!.actionOrdinal).toBe(0)
    const firstOwner = firstClaims[0].includes(firstRunClaims[0]!) ? firstWorker : secondWorker
    await firstOwner.executeEffect(firstRunClaims[0]!)
    expect((await db.query<{ status: string }>(
      'SELECT status FROM automation_effects WHERE run_id=$1 AND action_ordinal=1',
      [admitted.id],
    )).rows[0]!.status).toBe('pending')
    await db.query("UPDATE automation_effects SET available_at=now() WHERE run_id=$1 AND status='pending'", [admitted.id])
    const retryClaims = await Promise.all([firstWorker.claimEffects(), secondWorker.claimEffects()])
    const retryRunClaims = retryClaims.flat().filter(effect => effect.runId === admitted.id)
    expect(retryRunClaims).toHaveLength(1)
    expect(retryRunClaims[0]!.actionOrdinal).toBe(0)
    const retryOwner = retryClaims[0].includes(retryRunClaims[0]!) ? firstWorker : secondWorker
    await retryOwner.executeEffect(retryRunClaims[0]!)
    expect((await db.query<{ status: string }>('SELECT status FROM automation_runs WHERE id=$1', [admitted.id])).rows[0]!.status)
      .toBe('dead')
    expect((await db.query<{ action_ordinal: number; status: string; attempt_count: number }>(
      'SELECT action_ordinal,status,attempt_count FROM automation_effects WHERE run_id=$1 ORDER BY action_ordinal',
      [admitted.id],
    )).rows).toEqual([
      expect.objectContaining({ action_ordinal: 0, status: 'dead', attempt_count: 2 }),
      expect.objectContaining({ action_ordinal: 1, status: 'pending', attempt_count: 0 }),
    ])
    const afterDlq = await firstWorker.claimEffects()
    expect(afterDlq.some(effect => effect.runId === admitted.id)).toBe(false)
    expect((await db.query(
      'SELECT 1 FROM work_items WHERE workspace_id=$1 AND title=$2',
      [fixture.workspaceId, blockedTitle],
    )).rowCount).toBe(0)
    await db.query("UPDATE automation_rules SET state='paused' WHERE id=$1", [ruleId])
  })

  it('retries Automation Session admission after execution capacity becomes available', async () => {
    await db.query('UPDATE agent_definitions SET max_concurrency=1 WHERE id=$1', [fixture.agentId])
    let createdSessionId: string | undefined
    try {
      const blockerLoopId = await createLoop('automation-capacity-blocker', { noOverlap: false })
      const blocker = await withTx(db, tx => admitLoopRun(tx, {
        meta: meta('automation-capacity-blocker'),
        loopId: blockerLoopId,
        occurrenceKey: `schedule:${randomUUID()}`,
        scheduledFor: new Date(),
        authorization: { kind: 'trusted_worker' },
      }))
      if (!blocker.sessionId) throw new Error('Expected blocker Session')

      const ruleId = await createRule('capacity-retry', {
        type: 'start_session',
        parameters: {
          workItemId: fixture.workItemId,
          agentId: fixture.agentId,
          capabilities: ['work:read', 'work:write'],
          budget: {},
        },
      })
      const admitted = await withTx(db, tx => admitAutomationOccurrence(tx, {
        meta: meta('capacity-retry'),
        ruleId,
        occurrenceKey: `event:${randomUUID()}`,
        eventId: randomUUID(),
        payload: {},
        dryRun: false,
        authorization: { kind: 'trusted_worker' },
      }))
      const worker = createAutomationWorker({ db, workerId: `capacity-retry-${randomUUID()}` })
      const first = (await worker.claimEffects()).find(effect => effect.runId === admitted.id)
      expect(first).toBeDefined()
      const persistenceBeforeCapacityFailure = await agentAdmissionPersistenceCounts(fixture.agentId)
      await worker.executeEffect(first!)
      expect((await db.query<{
        status: string
        attempt_count: number
        last_error: string
      }>(
        'SELECT status,attempt_count,last_error FROM automation_effects WHERE id=$1',
        [first!.id],
      )).rows[0]).toMatchObject({
        status: 'pending',
        attempt_count: 1,
        last_error: expect.stringContaining('Agent execution concurrency limit reached'),
      })
      expect((await db.query(
        `SELECT 1 FROM agent_sessions
          WHERE agent_id=$1 AND work_item_id=$2
            AND session_kind='execution'
            AND state NOT IN ('completed','failed','canceled')`,
        [fixture.agentId, fixture.workItemId],
      )).rowCount).toBe(0)
      expect(await agentAdmissionPersistenceCounts(fixture.agentId))
        .toEqual(persistenceBeforeCapacityFailure)

      await db.query(
        "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
        [blocker.sessionId],
      )
      await db.query('UPDATE automation_effects SET available_at=now() WHERE id=$1', [first!.id])
      const retry = (await worker.claimEffects()).find(effect => effect.runId === admitted.id)
      expect(retry).toBeDefined()
      await worker.executeEffect(retry!)
      expect((await db.query<{ status: string }>(
        'SELECT status FROM automation_effects WHERE id=$1',
        [first!.id],
      )).rows[0]!.status).toBe('completed')
      createdSessionId = (await db.query<{ id: string }>(
        `SELECT id FROM agent_sessions
          WHERE agent_id=$1 AND work_item_id=$2
            AND session_kind='execution'
            AND state NOT IN ('completed','failed','canceled')`,
        [fixture.agentId, fixture.workItemId],
      )).rows[0]?.id
      expect(createdSessionId).toMatch(/^[0-9a-f-]{36}$/)
      await db.query("UPDATE automation_rules SET state='paused' WHERE id=$1", [ruleId])
    } finally {
      if (createdSessionId) {
        await db.query(
          "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
          [createdSessionId],
        )
      }
      await db.query('UPDATE agent_definitions SET max_concurrency=100 WHERE id=$1', [fixture.agentId])
    }
  })

  it('serializes action ordinals across concurrent workers', async () => {
    const firstTitle = `Ordered first ${randomUUID()}`
    const secondTitle = `Ordered second ${randomUUID()}`
    const ruleId = await createRule('ordinal-order', [
      { type: 'notify', parameters: { recipientActorId: fixture.humanId, title: firstTitle } },
      { type: 'notify', parameters: { recipientActorId: fixture.humanId, title: secondTitle } },
    ])
    const admitted = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('ordinal-order'),
      ruleId,
      occurrenceKey: `event:${randomUUID()}`,
      payload: {},
      dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    const workerA = createAutomationWorker({ db, workerId: `ordinal-a-${randomUUID()}` })
    const workerB = createAutomationWorker({ db, workerId: `ordinal-b-${randomUUID()}` })
    const initialClaims = await Promise.all([workerA.claimEffects(), workerB.claimEffects()])
    const runClaims = initialClaims.flat().filter(effect => effect.runId === admitted.id)
    expect(runClaims).toHaveLength(1)
    expect(runClaims[0]!.actionOrdinal).toBe(0)
    const initialOwner = initialClaims[0].includes(runClaims[0]!) ? workerA : workerB
    await initialOwner.executeEffect(runClaims[0]!)
    expect((await db.query(
      'SELECT 1 FROM notifications WHERE workspace_id=$1 AND title=$2',
      [fixture.workspaceId, secondTitle],
    )).rowCount).toBe(0)

    const laterClaims = await Promise.all([workerA.claimEffects(), workerB.claimEffects()])
    const laterRunClaims = laterClaims.flat().filter(effect => effect.runId === admitted.id)
    expect(laterRunClaims).toHaveLength(1)
    expect(laterRunClaims[0]!.actionOrdinal).toBe(1)
    const owner = laterClaims[0].includes(laterRunClaims[0]!) ? workerA : workerB
    await owner.executeEffect(laterRunClaims[0]!)
    expect((await db.query<{ title: string }>(
      'SELECT title FROM notifications WHERE workspace_id=$1 AND title=ANY($2::text[]) ORDER BY title',
      [fixture.workspaceId, [firstTitle, secondTitle]],
    )).rows.map(row => row.title).sort()).toEqual([firstTitle, secondTitle].sort())
    expect((await db.query<{ status: string }>(
      'SELECT status FROM automation_runs WHERE id=$1',
      [admitted.id],
    )).rows[0]!.status).toBe('succeeded')
    await db.query("UPDATE automation_rules SET state='paused' WHERE id=$1", [ruleId])
  })

  it('delivers notifications independently of Beta Planning and skips a disabled webhook at the queue head', async () => {
    await db.query(
      `INSERT INTO notification_preferences(
         workspace_id,actor_id,channels,digest,minimum_priority,muted_kinds,webhook_url
       ) VALUES($1,$2,$3,'immediate','update','{}',$4)
       ON CONFLICT(workspace_id,actor_id) DO UPDATE
       SET channels=EXCLUDED.channels,webhook_url=EXCLUDED.webhook_url`,
      [
        fixture.workspaceId,
        fixture.humanId,
        ['in_app', 'webhook'],
        'https://notifications.example.test/workmesh',
      ],
    )
    await withTx(db, tx => admitNotification(tx, {
      workspaceId: fixture.workspaceId,
      recipientActorId: fixture.humanId,
      priority: 'update',
      kind: 'queue.head.webhook',
      title: 'Disabled webhook at queue head',
      body: 'Must not block allowed notification channels.',
      sourceType: 'work_item',
      sourceId: fixture.workItemId,
      dedupeKey: `queue-head-webhook:${randomUUID()}`,
      requestedChannels: ['webhook'],
    }))
    await withTx(db, tx => admitNotification(tx, {
      workspaceId: fixture.workspaceId,
      recipientActorId: fixture.humanId,
      priority: 'update',
      kind: 'queue.allowed.in_app',
      title: 'Allowed in-app notification',
      body: 'This delivery remains claimable.',
      sourceType: 'work_item',
      sourceId: fixture.workItemId,
      dedupeKey: `queue-allowed-in-app:${randomUUID()}`,
      requestedChannels: ['in_app'],
    }))
    const planningOnly = createBaseAutomationWorker({
      db,
      workerId: `planning-notifications-${randomUUID()}`,
      features: loadFeatureConfig({ WORKMESH_BETA_PLANNING: 'true' }),
    })
    const claims = await planningOnly.claimNotifications(1)
    expect(claims).toHaveLength(1)
    expect(claims[0]!.channel).toBe('in_app')

    let browserDeliveries = 0
    const disabledPlanning = createBaseAutomationWorker({
      db,
      workerId: `disabled-planning-${randomUUID()}`,
      features: loadFeatureConfig({ WORKMESH_EXPERIMENTAL_AUTOMATION: 'true' }),
      sink: {
        callWebhook: async () => ({ status: 202 }),
        deliverBrowser: async () => {
          browserDeliveries += 1
          return {}
        },
      },
    })
    await disabledPlanning.deliverNotification(claims[0]!)
    expect(browserDeliveries).toBe(0)
    const remaining = await disabledPlanning.claimNotifications()
    expect(remaining.length).toBeGreaterThan(0)
    expect(remaining.every(delivery => delivery.channel !== 'webhook')).toBe(true)
  })

  it('atomically enforces Loop overlap, budget cutoff, rollback, and revocation', async () => {
    const loopId = await createLoop('overlap')
    await withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-first'), loopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-overlap'), loopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow('Loop already has an active run')

    const parallelLoopId = await createLoop('parallel', { noOverlap: false })
    const parallelFirst = await withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-parallel-first'),
      loopId: parallelLoopId,
      occurrenceKey: `schedule:${randomUUID()}`,
      scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))
    const parallelSecond = await withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-parallel-second'),
      loopId: parallelLoopId,
      occurrenceKey: `schedule:${randomUUID()}`,
      scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))
    expect(parallelSecond.runId).not.toBe(parallelFirst.runId)

    const budgetLoopId = await createLoop('budget', { noOverlap: false, maxCostMinor: 101 })
    await db.query(
      `INSERT INTO budget_policies(
        workspace_id,scope_type,scope_id,currency,hard_cost_minor,created_by_actor_id
      ) VALUES($1,'loop',$2,'USD',100,$3)`,
      [fixture.workspaceId, budgetLoopId, fixture.humanId],
    )
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-budget'), loopId: budgetLoopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow('hard budget')

    const preciseBudgetLoopId = await createLoop('precise-budget', {
      noOverlap: false,
      maxCostMinor: '9007199254740993',
    })
    await db.query(
      `INSERT INTO budget_policies(
        workspace_id,scope_type,scope_id,currency,hard_cost_minor,created_by_actor_id
      ) VALUES($1,'loop',$2,'USD',$3,$4)`,
      [fixture.workspaceId, preciseBudgetLoopId, '9007199254740992', fixture.humanId],
    )
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-precise-budget'),
      loopId: preciseBudgetLoopId,
      occurrenceKey: `schedule:${randomUUID()}`,
      scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow('hard budget')

    const tokenBudgetLoopId = await createLoop('token-budget', {
      noOverlap: false,
      maxCostMinor: 1,
      maxTokens: 101,
    })
    await db.query(
      `INSERT INTO budget_policies(
        workspace_id,scope_type,scope_id,currency,hard_tokens,created_by_actor_id
      ) VALUES($1,'loop',$2,'USD',100,$3)`,
      [fixture.workspaceId, tokenBudgetLoopId, fixture.humanId],
    )
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-token-budget'),
      loopId: tokenBudgetLoopId,
      occurrenceKey: `schedule:${randomUUID()}`,
      scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow('hard token budget')

    const rollbackLoopId = await createLoop('rollback', { ownerActorId: fixture.agentActorId })
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-rollback'), loopId: rollbackLoopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow()
    expect((await db.query('SELECT 1 FROM automation_runs WHERE loop_id=$1', [rollbackLoopId])).rowCount).toBe(0)

    const revokedLoopId = await createLoop('revoked')
    await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2', [fixture.agentId, fixture.teamId])
    await expect(withTx(db, tx => admitLoopRun(tx, {
      meta: meta('loop-revoked'), loopId: revokedLoopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
      authorization: { kind: 'trusted_worker' },
    }))).rejects.toThrow('LOOP_AGENT_TEAM_ACCESS_REVOKED')
    expect((await db.query('SELECT 1 FROM automation_runs WHERE loop_id=$1', [revokedLoopId])).rowCount).toBe(0)
    await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2', [fixture.agentId, fixture.teamId])
  })

  it('durably defers one scheduled Loop occurrence while execution capacity is full', async () => {
    await db.query(
      `UPDATE agent_sessions
          SET state='completed',ended_at=coalesce(ended_at,now())
        WHERE agent_id=$1 AND session_kind='execution'
          AND state NOT IN ('completed','failed','canceled')`,
      [fixture.agentId],
    )
    await db.query('UPDATE agent_definitions SET max_concurrency=1 WHERE id=$1', [fixture.agentId])
    try {
      const blockerLoopId = await createLoop('capacity-blocker', { noOverlap: false })
      const blocker = await withTx(db, tx => admitLoopRun(tx, {
        meta: meta('capacity-blocker'),
        loopId: blockerLoopId,
        occurrenceKey: `schedule:${randomUUID()}`,
        scheduledFor: new Date(),
        authorization: { kind: 'trusted_worker' },
      }))
      expect(blocker.deferred).not.toBe(true)
      if (!blocker.sessionId) throw new Error('Expected blocker Session')

      const deferredLoopId = await createLoop('capacity-deferred', { noOverlap: false })
      const occurrenceKey = `schedule:${randomUUID()}`
      const scheduledFor = new Date()
      const persistenceBeforeDeferral = await agentAdmissionPersistenceCounts(fixture.agentId)
      const deferred = await withTx(db, tx => admitLoopRun(tx, {
        meta: meta('capacity-deferred'),
        loopId: deferredLoopId,
        occurrenceKey,
        scheduledFor,
        authorization: { kind: 'trusted_worker' },
      }))
      expect(deferred).toMatchObject({
        sessionId: null,
        duplicate: false,
        deferred: true,
      })
      const deferredRow = (await db.query<{
        status: string
        session_id: string | null
        trace: Record<string, unknown>
      }>(
        'SELECT status,session_id,trace FROM automation_runs WHERE id=$1',
        [deferred.runId],
      )).rows[0]!
      expect(deferredRow).toMatchObject({
        status: 'failed',
        session_id: null,
        trace: { occurrenceKey, deferredReason: 'AGENT_CONCURRENCY_LIMIT' },
      })
      expect(await agentAdmissionPersistenceCounts(fixture.agentId)).toEqual(persistenceBeforeDeferral)

      const earlyReplay = await withTx(db, tx => admitLoopRun(tx, {
        meta: meta('capacity-deferred-replay'),
        loopId: deferredLoopId,
        occurrenceKey,
        scheduledFor,
        authorization: { kind: 'trusted_worker' },
      }))
      expect(earlyReplay).toMatchObject({
        runId: deferred.runId,
        sessionId: null,
        duplicate: true,
        deferred: true,
      })
      expect((await db.query(
        `SELECT 1 FROM automation_runs
          WHERE loop_id=$1 AND trace->>'occurrenceKey'=$2`,
        [deferredLoopId, occurrenceKey],
      )).rowCount).toBe(1)

      await db.query(
        "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
        [blocker.sessionId],
      )
      await db.query(
        "UPDATE automation_runs SET available_at=now()-interval '1 second' WHERE id=$1",
        [deferred.runId],
      )
      const resumed = await withTx(db, tx => admitLoopRun(tx, {
        meta: meta('capacity-deferred-resume'),
        loopId: deferredLoopId,
        occurrenceKey,
        scheduledFor,
        authorization: { kind: 'trusted_worker' },
      }))
      expect(resumed.runId).toBe(deferred.runId)
      expect(resumed.deferred).not.toBe(true)
      expect(resumed.sessionId).toMatch(/^[0-9a-f-]{36}$/)
      expect((await db.query(
        `SELECT 1 FROM automation_runs
          WHERE loop_id=$1 AND trace->>'occurrenceKey'=$2`,
        [deferredLoopId, occurrenceKey],
      )).rowCount).toBe(1)
      if (resumed.sessionId) {
        await db.query(
          "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
          [resumed.sessionId],
        )
      }
    } finally {
      await db.query('UPDATE agent_definitions SET max_concurrency=100 WHERE id=$1', [fixture.agentId])
    }
  })

  it('gates loop soft and failure notification admission by Planning and External Webhooks', async () => {
    await db.query(
      'DELETE FROM notification_preferences WHERE workspace_id=$1 AND actor_id=$2',
      [fixture.workspaceId, fixture.humanId],
    )
    const admit = async (
      name: string,
      channels: ReadonlyArray<'in_app' | 'browser' | 'webhook'>,
    ) => {
      const loopId = await createLoop(name, { noOverlap: false })
      await db.query(
        `INSERT INTO budget_policies(
           workspace_id,scope_type,scope_id,currency,soft_cost_minor,created_by_actor_id)
         VALUES($1,'loop',$2,'USD',0,$3)`,
        [fixture.workspaceId, loopId, fixture.humanId],
      )
      return withTx(db, tx => admitLoopRun(tx, {
        meta: meta(name), loopId, occurrenceKey: `schedule:${randomUUID()}`, scheduledFor: new Date(),
        authorization: { kind: 'trusted_worker' }, notificationChannels: channels,
      }))
    }

    const disabled = await admit('planning-disabled', [])
    await db.query("UPDATE agent_sessions SET state='failed',ended_at=now() WHERE id=$1", [disabled.sessionId])
    const disabledWorker = createBaseAutomationWorker({
      db,
      workerId: `planning-disabled-${randomUUID()}`,
      features: loadFeatureConfig({ WORKMESH_EXPERIMENTAL_AGENT_LOOPS: 'true' }),
    })
    await disabledWorker.reconcileLoopRuns()
    expect((await db.query(
      'SELECT 1 FROM notifications WHERE source_id=$1',
      [disabled.runId],
    )).rowCount).toBe(0)
    expect((await db.query(
      `SELECT 1 FROM notification_deliveries delivery
       JOIN notifications notification ON notification.id=delivery.notification_id
       WHERE notification.source_id=$1`,
      [disabled.runId],
    )).rowCount).toBe(0)

    const internalOnly = await admit('external-disabled', ['in_app', 'browser'])
    await db.query("UPDATE agent_sessions SET state='failed',ended_at=now() WHERE id=$1", [internalOnly.sessionId])
    const internalWorker = createBaseAutomationWorker({
      db,
      workerId: `external-disabled-${randomUUID()}`,
      features: loadFeatureConfig({
        WORKMESH_BETA_PLANNING: 'true',
        WORKMESH_EXPERIMENTAL_AGENT_LOOPS: 'true',
      }),
    })
    await internalWorker.reconcileLoopRuns()
    expect((await db.query<{ channel: string }>(
      `SELECT delivery.channel FROM notification_deliveries delivery
       JOIN notifications notification ON notification.id=delivery.notification_id
       WHERE notification.source_id=$1 ORDER BY delivery.channel`,
      [internalOnly.runId],
    )).rows.map(row => row.channel)).toEqual(['in_app', 'in_app'])
    expect((await db.query(
      `SELECT 1 FROM notification_deliveries delivery
       JOIN notifications notification ON notification.id=delivery.notification_id
       WHERE notification.source_id=$1 AND delivery.channel='webhook'`,
      [internalOnly.runId],
    )).rowCount).toBe(0)
  })

  it('delivers generic browser push deep links and invalidates gone subscriptions', async () => {
    await db.query(
      `INSERT INTO notification_preferences(workspace_id,actor_id,channels)
       VALUES($1,$2,ARRAY['in_app','browser']::notification_channel[])
       ON CONFLICT(workspace_id,actor_id) DO UPDATE SET channels=EXCLUDED.channels,digest='immediate'`,
      [fixture.workspaceId, fixture.humanId],
    )
    const createSubscription = async (suffix: string) => (await db.query<{ id: string }>(
      `INSERT INTO browser_push_subscriptions(
         workspace_id,actor_id,device_id,endpoint,endpoint_hash,p256dh,auth_secret
       ) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        fixture.workspaceId,
        fixture.humanId,
        `device-${suffix}-${randomUUID()}`,
        `https://push.example.test/${suffix}/${randomUUID()}`,
        `sha256:${randomUUID().replaceAll('-', '').padEnd(64, '0')}`,
        `p256dh-${suffix}`,
        `auth-${suffix}`,
      ],
    )).rows[0]!.id

    const deliveredSubscriptionId = await createSubscription('delivered')
    const approvalId = randomUUID()
    const notification = await withTx(db, tx => admitNotification(tx, {
      workspaceId: fixture.workspaceId,
      recipientActorId: fixture.humanId,
      priority: 'approval',
      kind: 'approval.requested',
      title: 'Approval required',
      body: 'Open WorkMesh to review a pending approval.',
      sourceType: 'approval',
      sourceId: approvalId,
      dedupeKey: `browser-push-success:${randomUUID()}`,
      requestedChannels: ['browser'],
    }))
    const deliveredInputs: Array<Record<string, unknown>> = []
    const deliveryWorker = createBaseAutomationWorker({
      db,
      workerId: `browser-success-${randomUUID()}`,
      features: loadFeatureConfig({}),
      sink: {
        callWebhook: async () => ({ status: 202 }),
        deliverBrowser: async input => {
          deliveredInputs.push(input)
          return { receipt: 'push-receipt' }
        },
      },
    })
    const successClaim = (await deliveryWorker.claimNotifications(100))
      .find(claim => claim.notificationId === notification.id && claim.browserPushSubscriptionId === deliveredSubscriptionId)
    expect(successClaim).toBeDefined()
    await deliveryWorker.deliverNotification(successClaim!)
    expect(deliveredInputs).toEqual([expect.objectContaining({
      title: 'Approval required',
      body: 'Open WorkMesh to review a pending approval.',
      url: `/?view=inbox&attentionSelected=${encodeURIComponent(`v1:approval:${approvalId}`)}`,
    })])
    expect(JSON.stringify(deliveredInputs[0])).not.toMatch(/reason|credential|payload/i)
    expect((await db.query<{ status: string; last_delivered_at: Date | null }>(
      'SELECT status,last_delivered_at FROM browser_push_subscriptions WHERE id=$1',
      [deliveredSubscriptionId],
    )).rows[0]).toMatchObject({ status: 'active', last_delivered_at: expect.any(Date) })

    const goneSubscriptionId = await createSubscription('gone')
    const goneNotification = await withTx(db, tx => admitNotification(tx, {
      workspaceId: fixture.workspaceId,
      recipientActorId: fixture.humanId,
      priority: 'approval',
      kind: 'approval.requested',
      title: 'Approval required',
      body: 'Open WorkMesh to review a pending approval.',
      sourceType: 'approval',
      sourceId: randomUUID(),
      dedupeKey: `browser-push-gone:${randomUUID()}`,
      requestedChannels: ['browser'],
    }))
    const goneWorker = createBaseAutomationWorker({
      db,
      workerId: `browser-gone-${randomUUID()}`,
      features: loadFeatureConfig({}),
      sink: {
        callWebhook: async () => ({ status: 202 }),
        deliverBrowser: async () => {
          throw Object.assign(new Error('subscription gone'), { statusCode: 410 })
        },
      },
    })
    const goneClaim = (await goneWorker.claimNotifications(100))
      .find(claim => claim.notificationId === goneNotification.id && claim.browserPushSubscriptionId === goneSubscriptionId)
    expect(goneClaim).toBeDefined()
    await goneWorker.deliverNotification(goneClaim!)
    expect((await db.query<{ status: string; last_failure_code: string }>(
      'SELECT status,last_failure_code FROM browser_push_subscriptions WHERE id=$1',
      [goneSubscriptionId],
    )).rows[0]).toEqual({ status: 'invalid', last_failure_code: '410' })
    expect((await db.query<{ status: string; last_error: string }>(
      `SELECT status,last_error FROM notification_deliveries
        WHERE notification_id=$1 AND browser_push_subscription_id=$2`,
      [goneNotification.id, goneSubscriptionId],
    )).rows[0]).toEqual({ status: 'dead', last_error: 'BROWSER_PUSH_SUBSCRIPTION_INVALID:410' })
  })

  it('executes every declared internal action through the same authority boundary', async () => {
    const projectId = (await db.query<{ id: string }>(
      `INSERT INTO projects(workspace_id,team_id,name) VALUES($1,$2,$3) RETURNING id`,
      [fixture.workspaceId, fixture.teamId, `Automation project ${randomUUID()}`],
    )).rows[0]!.id
    const delegationId = (await db.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,
         role,scope_type,scope_id,permissions_snapshot,capability_scope
       ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8) RETURNING id`,
      [fixture.workspaceId, fixture.teamId, fixture.agentId, fixture.agentActorId, fixture.humanId,
        fixture.workItemId, ['work:read', 'work:write'], {
          teamIds: [fixture.teamId], workItemIds: [fixture.workItemId], projectIds: [projectId],
        }],
    )).rows[0]!.id
    const sessionId = (await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state
       ) VALUES($1,$2,$3,$4,$5,$6,'executing') RETURNING id`,
      [fixture.workspaceId, fixture.teamId, fixture.agentId, fixture.agentActorId,
        delegationId, fixture.workItemId],
    )).rows[0]!.id
    const actions = [
      {
        name: 'create-item',
        action: {
          type: 'create_work_item',
          parameters: { teamId: fixture.teamId, projectId, title: 'Created by automation' },
        },
      },
      {
        name: 'send-message',
        action: { type: 'send_message', parameters: { sessionId, bodyMarkdown: 'Automation checkpoint.' } },
      },
      {
        name: 'request-approval',
        action: {
          type: 'request_approval',
          parameters: {
            sessionId,
            actionName: 'automation.review',
            actionPayloadHash: `sha256:${'a'.repeat(64)}`,
            actionPayloadSanitized: { action: 'review' },
            riskLevel: 'medium',
            rationaleSummary: 'Automation requires human review.',
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        },
      },
      {
        name: 'project-update',
        action: {
          type: 'create_project_update',
          parameters: { projectId, health: 'at_risk', body: 'Automation drafted this update.' },
        },
      },
    ]
    for (const entry of actions) {
      const ruleId = await createRule(entry.name, entry.action)
      await withTx(db, tx => admitAutomationOccurrence(tx, {
        meta: meta(entry.name),
        ruleId,
        occurrenceKey: `event:${randomUUID()}`,
        payload: {},
        dryRun: false,
        authorization: { kind: 'trusted_worker' },
      }))
    }
    await createAutomationWorker({ db, workerId: `actions-${randomUUID()}` }).tick()
    expect((await db.query(
      `SELECT 1 FROM work_items WHERE project_id=$1 AND title='Created by automation'`,
      [projectId],
    )).rowCount).toBe(1)
    expect((await db.query(
      `SELECT 1 FROM agent_activities WHERE session_id=$1 AND details_markdown='Automation checkpoint.'`,
      [sessionId],
    )).rowCount).toBe(1)
    expect((await db.query(
      `SELECT 1 FROM approvals WHERE session_id=$1 AND action_name='automation.review'`,
      [sessionId],
    )).rowCount).toBe(1)
    expect((await db.query(
      `SELECT 1 FROM project_updates WHERE project_id=$1 AND status='draft'
        AND body='Automation drafted this update.'`,
      [projectId],
    )).rowCount).toBe(1)
  })

  it('revalidates authority after claim and does not repeat a webhook after a post-success crash', async () => {
    const pausedRuleId = await createRule('pause-after-claim', {
      type: 'create_work_item',
      parameters: { teamId: fixture.teamId, title: 'Must not be created' },
    })
    const pausedRun = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('pause-after-claim'),
      ruleId: pausedRuleId,
      occurrenceKey: `event:${randomUUID()}`,
      payload: {},
      dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    const pauseWorker = createAutomationWorker({ db, workerId: `pause-${randomUUID()}` })
    const [claimed] = await pauseWorker.claimEffects()
    expect(claimed?.runId).toBe(pausedRun.id)
    await db.query("UPDATE automation_rules SET state='paused' WHERE id=$1", [pausedRuleId])
    await pauseWorker.executeEffect(claimed!)
    expect((await db.query<{ status: string; last_error: string }>(
      'SELECT status,last_error FROM automation_effects WHERE run_id=$1',
      [pausedRun.id],
    )).rows[0]).toMatchObject({ status: 'pending', last_error: 'AUTOMATION_AUTHORITY_REVOKED' })
    expect((await db.query(
      `SELECT 1 FROM work_items WHERE workspace_id=$1 AND title='Must not be created'`,
      [fixture.workspaceId],
    )).rowCount).toBe(0)

    const revokedRuleId = await createRule('owner-revoked-after-claim', {
      type: 'create_work_item',
      parameters: { teamId: fixture.teamId, title: 'Revoked owner item' },
    })
    const revokedRun = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('owner-revoked-after-claim'),
      ruleId: revokedRuleId,
      occurrenceKey: `event:${randomUUID()}`,
      payload: {},
      dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    const revokeWorker = createAutomationWorker({ db, workerId: `revoke-${randomUUID()}` })
    const revokedEffect = (await revokeWorker.claimEffects()).find(effect => effect.runId === revokedRun.id)
    await db.query('UPDATE actors SET is_active=false WHERE id=$1', [fixture.humanId])
    await revokeWorker.executeEffect(revokedEffect!)
    await db.query('UPDATE actors SET is_active=true WHERE id=$1', [fixture.humanId])
    expect((await db.query<{ last_error: string }>(
      'SELECT last_error FROM automation_effects WHERE run_id=$1',
      [revokedRun.id],
    )).rows[0]!.last_error).toBe('AUTOMATION_AUTHORITY_REVOKED')

    const webhookRuleId = await createRule('webhook-crash', {
      type: 'call_webhook',
      parameters: { url: 'https://webhook.example.test/events', payload: { safe: true } },
    })
    const webhookRun = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('webhook-crash'),
      ruleId: webhookRuleId,
      occurrenceKey: `event:${randomUUID()}`,
      payload: {},
      dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    let sends = 0
    let crash = true
    const webhookWorker = createAutomationWorker({
      db,
      workerId: `webhook-${randomUUID()}`,
      sink: {
        async callWebhook() {
          sends += 1
          return { status: 204, receipt: `receipt-${sends}` }
        },
        async deliverBrowser() { return {} },
      },
      async afterExternalDelivery() {
        if (crash) {
          crash = false
          throw new Error('SIMULATED_CRASH_AFTER_EXTERNAL_SUCCESS')
        }
      },
    })
    const webhookEffect = (await webhookWorker.claimEffects()).find(effect => effect.runId === webhookRun.id)
    await webhookWorker.executeEffect(webhookEffect!)
    await db.query(
      "UPDATE automation_effects SET available_at=now() WHERE run_id=$1 AND status='pending'",
      [webhookRun.id],
    )
    const replayEffect = (await webhookWorker.claimEffects()).find(effect => effect.runId === webhookRun.id)
    await webhookWorker.executeEffect(replayEffect!)
    expect(sends).toBe(1)
    expect((await db.query<{ state: string }>(
      `SELECT intent.state FROM automation_external_effect_intents intent
       JOIN automation_effects effect ON effect.id=intent.effect_id WHERE effect.run_id=$1`,
      [webhookRun.id],
    )).rows[0]!.state).toBe('uncertain')

    const rebindRuleId = await createRule('webhook-rebind', {
      type: 'call_webhook',
      parameters: { url: 'https://webhook.example.test/events', payload: {} },
    })
    const rebindRun = await withTx(db, tx => admitAutomationOccurrence(tx, {
      meta: meta('webhook-rebind'),
      ruleId: rebindRuleId,
      occurrenceKey: `event:${randomUUID()}`,
      payload: {},
      dryRun: false,
      authorization: { kind: 'trusted_worker' },
    }))
    const rebindWorker = createAutomationWorker({
      db,
      workerId: `rebind-${randomUUID()}`,
      dnsLookup: async () => [{ address: '::ffff:127.0.0.1', family: 6 }],
    })
    const rebindEffect = (await rebindWorker.claimEffects()).find(effect => effect.runId === rebindRun.id)
    await rebindWorker.executeEffect(rebindEffect!)
    expect((await db.query<{ last_error: string }>(
      'SELECT last_error FROM automation_effects WHERE run_id=$1',
      [rebindRun.id],
    )).rows[0]!.last_error).toContain('UNSAFE_WEBHOOK_TARGET')
  })

  it('runs the scheduled triage demo end to end and creates an auditable Session', async () => {
    const clock = new Date('2026-07-26T12:00:30Z')
    const ruleId = await createRule('scheduled-triage', {
      type: 'delegate_agent',
      parameters: {
        workItemId: fixture.workItemId,
        agentId: fixture.agentId,
        principalHumanActorId: fixture.humanId,
        capabilities: ['work:read', 'work:write'],
        budget: { maxCostMinor: 100, currency: 'USD' },
      },
    }, 3, { type: 'schedule', cron: '* * * * *', timezone: 'UTC' })
    const worker = createAutomationWorker({ db, workerId: `triage-${randomUUID()}`, now: () => clock })
    await worker.tick()
    const run = (await db.query<{ id: string; status: string }>(
      'SELECT id,status FROM automation_runs WHERE rule_id=$1 ORDER BY created_at DESC LIMIT 1',
      [ruleId],
    )).rows[0]!
    expect(run.status).toBe('succeeded')
    const session = (await db.query<{ id: string; state: string }>(
      `SELECT session.id,session.state FROM agent_sessions session
       JOIN domain_events event ON event.aggregate_id=session.id AND event.event_type='agent.session.created'
       WHERE event.payload->>'automationRunId'=$1`,
      [run.id],
    )).rows[0]
    expect(session).toEqual(expect.objectContaining({ state: 'queued' }))
    expect((await db.query(
      `SELECT 1 FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id
       WHERE event.aggregate_id=$1 AND event.event_type='agent.session.created'`,
      [session!.id],
    )).rowCount).toBe(1)
  })

  it('admits a durable domain-event trigger exactly once across replay', async () => {
    const eventType =
      `stage4.acceptance.event_${randomUUID().replaceAll('-', '_')}`
    const revision = (await db.query<{ revision: number }>(
      'SELECT revision FROM work_items WHERE id=$1',
      [fixture.workItemId],
    )).rows[0]!.revision
    const ruleId = await createRule('event-replay', {
      type: 'add_label',
      parameters: {
        workItemId: fixture.workItemId,
        expectedRevision: revision,
        label: 'event-triggered',
      },
    }, 3, { type: 'event', eventTypes: [eventType] })
    await withTx(db, tx => appendEvent(tx, {
      workspaceId: fixture.workspaceId,
      teamId: fixture.teamId,
      actorId: fixture.humanId,
      correlationId: `event-trigger:${randomUUID()}`,
      type: eventType,
      aggregateType: 'work_item',
      aggregateId: fixture.workItemId,
      payload: { work: { id: fixture.workItemId } },
    }))
    const worker = createAutomationWorker({ db, workerId: `event-${randomUUID()}` })
    await worker.admitEventRules()
    await worker.admitEventRules()
    expect((await db.query(
      `SELECT 1 FROM automation_occurrences WHERE rule_id=$1`,
      [ruleId],
    )).rowCount).toBe(1)
    await worker.tick()
    expect((await db.query<{ labels: string[] }>(
      'SELECT labels FROM work_items WHERE id=$1',
      [fixture.workItemId],
    )).rows[0]!.labels).toContain('event-triggered')
  })

  it('fails closed before scheduled or event admission when child action features are disabled', async () => {
    const eventType =
      `stage4.child_disabled.event_${randomUUID().replaceAll('-', '_')}`
    const scheduledRuleId = await createRule(
      'disabled-scheduled-webhook',
      { type: 'call_webhook', parameters: { url: 'https://example.test/hook' } },
      3,
      { type: 'schedule', cron: '* * * * *', timezone: 'UTC' },
    )
    const eventRuleId = await createRule(
      'disabled-event-notify',
      [
        { type: 'add_label', parameters: { workItemId: fixture.workItemId, expectedRevision: 1, label: 'must-not-run' } },
        { type: 'notify', parameters: { recipientActorId: fixture.humanId, title: 'Must not notify' } },
      ],
      3,
      { type: 'event', eventTypes: [eventType] },
    )
    await withTx(db, tx => appendEvent(tx, {
      workspaceId: fixture.workspaceId,
      teamId: fixture.teamId,
      actorId: fixture.humanId,
      correlationId: `child-disabled:${randomUUID()}`,
      type: eventType,
      aggregateType: 'work_item',
      aggregateId: fixture.workItemId,
      payload: {},
    }))
    const worker = createBaseAutomationWorker({
      db,
      workerId: `child-disabled-${randomUUID()}`,
      features: loadFeatureConfig({ WORKMESH_EXPERIMENTAL_AUTOMATION: 'true' }),
    })
    await worker.scheduleDueRules()
    await worker.admitEventRules()
    const ruleIds = [scheduledRuleId, eventRuleId]
    expect((await db.query(
      'SELECT 1 FROM automation_occurrences WHERE rule_id=ANY($1::uuid[])',
      [ruleIds],
    )).rowCount).toBe(0)
    expect((await db.query(
      'SELECT 1 FROM automation_runs WHERE rule_id=ANY($1::uuid[])',
      [ruleIds],
    )).rowCount).toBe(0)
    expect((await db.query(
      `SELECT 1 FROM automation_effects effect
       JOIN automation_runs run ON run.id=effect.run_id
       WHERE run.rule_id=ANY($1::uuid[])`,
      [ruleIds],
    )).rowCount).toBe(0)
  })

  describe('C1 channel delivery contract', () => {
    const features = loadFeatureConfig({ WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS: 'true' })
    const target = (name = 'C1 target') => withTx(db, tx => createChannelTarget(tx, meta('channel-target'), { name, provider: 'wecom', enabled: true, secretMaterial: 'https://channel.example.test/hook?key=' + randomUUID() }))
    const source = async () => withTx(db, async tx => {
      const row = (await tx.query<{id:string}>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id,payload)
        VALUES($1,$2,$3,'ask','activity',$4,'{"summary":"Private source content must never leave WorkMesh"}') RETURNING id`, [fixture.workspaceId,fixture.humanId,fixture.teamId,randomUUID()])).rows[0]!
      const eventId = await appendEvent(tx, { ...meta('channel-source'), type: 'inbox.item.created', aggregateType: 'inbox_item', aggregateId: row.id, revision: 1 })
      return {id:row.id,eventId}
    })
    const claim = (worker: string, limit = 25) => withTx(db, tx => claimChannelNotifications(tx, worker, ['wecom'], limit, 60))
    const expire = (id: string) => db.query(`UPDATE notification_deliveries SET claimed_at=now()-interval '61 seconds' WHERE id=$1`,[id])
    const state = async (id: string) => (await db.query<{status:string;outcome:string;revision:number;effect_key:string;attempt_count:number;claim_fence:number}>(`SELECT status,outcome,revision,effect_key,attempt_count,claim_fence FROM notification_deliveries WHERE id=$1`,[id])).rows[0]!
    beforeEach(async () => {
      await db.query(`UPDATE notification_deliveries SET status='dead',outcome='failed',claimed_at=NULL,claimed_by=NULL WHERE intent_id IS NOT NULL`)
      await db.query(`UPDATE notification_channel_targets SET enabled=false`)
      await db.query(`UPDATE outbox_events SET status='delivered',locked_at=NULL,locked_by=NULL`)
      await db.query(`UPDATE actors SET is_active=true,workspace_role='admin' WHERE id=$1`, [fixture.humanId])
    })
    it('admits only exact assigned Human targets and deduplicates concurrent source replay and fan-out', async () => {
      const one=await target('one'),two=await target('two'),item=await source()
      await Promise.all([withTx(db,tx=>admitChannelEvent(tx,item.eventId)),withTx(db,tx=>admitChannelEvent(tx,item.eventId))])
      const rows=(await db.query(`SELECT delivery.* FROM notification_deliveries delivery JOIN notification_intents intent ON intent.id=delivery.intent_id WHERE intent.source_event_id=$1`,[item.eventId])).rows
      expect(rows).toHaveLength(2)
      expect(new Set(rows.map(row=>row.channel_target_id))).toEqual(new Set([one.id,two.id]))
      expect(new Set(rows.map(row=>row.recipient_actor_id))).toEqual(new Set([fixture.humanId]))
      await target('later')
      await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(1)
      expect((await db.query('SELECT 1 FROM notification_source_checkpoints WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(1)
      await expect(db.query(`INSERT INTO notification_deliveries(workspace_id,intent_id,channel_target_id,recipient_actor_id,target_revision,channel,effect_key)
        SELECT workspace_id,intent_id,channel_target_id,recipient_actor_id,target_revision,channel,effect_key FROM notification_deliveries WHERE id=$1`,[rows[0].id])).rejects.toThrow()
      await db.query(`UPDATE domain_events SET payload=payload||'{"conflict":true}'::jsonb WHERE id=$1`,[item.eventId])
      await expect(withTx(db,tx=>admitChannelEvent(tx,item.eventId))).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REUSED'})
    })
    it('does not notify unassigned sources or all readable Team members',async()=>{
      await target()
      const previous=(await db.query<{project_id:string|null}>('SELECT project_id FROM work_items WHERE id=$1',[fixture.workItemId])).rows[0]!
      const project=(await db.query<{id:string}>(`INSERT INTO projects(workspace_id,team_id,name,lead_actor_id) VALUES($1,$2,'C1 project lead',$3) RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.humanId])).rows[0]!
      await db.query('UPDATE work_items SET responsible_human_actor_id=NULL,project_id=$2 WHERE id=$1',[fixture.workItemId,project.id])
      try {
        const event=await withTx(db,async tx=>{
          const decision=(await tx.query<{id:string}>(`INSERT INTO decisions(workspace_id,work_item_id,proposed_by_actor_id,title,rationale) VALUES($1,$2,$3,'No responsible Human','Read visibility is not delivery authority') RETURNING id`,[fixture.workspaceId,fixture.workItemId,fixture.humanId])).rows[0]!
          return appendEvent(tx,{...meta('unassigned'),type:'decision.recorded',aggregateType:'decision',aggregateId:decision.id})
        })
        await withTx(db,tx=>admitChannelEvent(tx,event))
        expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1',[event])).rowCount).toBe(0)
        expect((await db.query('SELECT result FROM notification_source_checkpoints WHERE source_event_id=$1',[event])).rows[0]).toEqual({result:'suppressed'})
      } finally {await db.query('UPDATE work_items SET responsible_human_actor_id=$2,project_id=$3 WHERE id=$1',[fixture.workItemId,fixture.humanId,previous.project_id])}
      const projectEvent=await withTx(db,async tx=>{
        const decision=(await tx.query<{id:string}>(`INSERT INTO decisions(workspace_id,project_id,proposed_by_actor_id,title,rationale) VALUES($1,$2,$3,'Project-only decision','Only the explicit lead receives this') RETURNING id`,[fixture.workspaceId,project.id,fixture.humanId])).rows[0]!
        return appendEvent(tx,{...meta('project-only'),type:'decision.recorded',aggregateType:'decision',aggregateId:decision.id})
      })
      await withTx(db,tx=>admitChannelEvent(tx,projectEvent))
      expect((await db.query('SELECT recipient_actor_id FROM notification_intents WHERE source_event_id=$1',[projectEvent])).rows).toEqual([{recipient_actor_id:fixture.humanId}])
    })
    it('processes a lower cursor that commits after a higher cursor checkpoint',async()=>{
      await target();const delayed=await db.connect()
      try {
        await delayed.query('BEGIN')
        const item=(await delayed.query<{id:string}>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,kind,source_type,source_id) VALUES($1,$2,$3,'ask','activity',$4) RETURNING id`,[fixture.workspaceId,fixture.humanId,fixture.teamId,randomUUID()])).rows[0]!
        const lower=await appendEvent(delayed,{...meta('late-commit'),type:'inbox.item.created',aggregateType:'inbox_item',aggregateId:item.id})
        const higher=await source();await withTx(db,tx=>admitChannelEvent(tx,higher.eventId))
        await expect(withTx(db,tx=>admitChannelEvent(tx,lower))).rejects.toMatchObject({code:'NOT_FOUND'})
        await delayed.query('COMMIT');await withTx(db,tx=>admitChannelEvent(tx,lower))
        const checkpoints=(await db.query<{source_event_id:string;source_cursor:string}>('SELECT source_event_id,source_cursor::text FROM notification_source_checkpoints WHERE source_event_id=ANY($1::uuid[]) ORDER BY source_cursor',[[lower,higher.eventId]])).rows
        expect(checkpoints.map(row=>row.source_event_id)).toEqual([lower,higher.eventId])
        expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=ANY($1::uuid[])',[[lower,higher.eventId]])).rowCount).toBe(2)
      } finally {await delayed.query('ROLLBACK');delayed.release()}
    })
    it('recovers source commit, admission rollback and checkpoint commit without partial fan-out', async () => {
      await target();const item=await source()
      await expect(withTx(db,async tx=>{await admitChannelEvent(tx,item.eventId);throw new Error('CRASH_BEFORE_CHECKPOINT_COMMIT')})).rejects.toThrow('CRASH_BEFORE')
      expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(0)
      expect((await db.query('SELECT 1 FROM notification_source_checkpoints WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(0)
      await withTx(db,tx=>admitChannelEvent(tx,item.eventId)); await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(1)
    })
    it('maps committed activity events to their exact Inbox recipient without Team fan-out', async () => {
      await target()
      const created=await withTx(db,async tx=>{
        const session=(await tx.query<{id:string}>('SELECT id FROM agent_sessions WHERE workspace_id=$1 LIMIT 1',[fixture.workspaceId])).rows[0]!
        const activity=(await tx.query<{id:string}>(`INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary) SELECT $1,$2,coalesce(max(sequence),0)+1,'question','Private question' FROM agent_activities WHERE session_id=$1 RETURNING id`,[session.id,fixture.agentActorId])).rows[0]!
        const item=(await tx.query<{id:string}>(`INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,team_id,session_id,kind,source_type,source_id) VALUES($1,$2,$3,$4,'waiting_input','activity',$5) RETURNING id`,[fixture.workspaceId,fixture.humanId,fixture.teamId,session.id,activity.id])).rows[0]!
        const eventId=await appendEvent(tx,{...meta('activity-source'),type:'agent.activity.appended',aggregateType:'agent_activity',aggregateId:activity.id})
        return {item,eventId}
      })
      await withTx(db,tx=>admitChannelEvent(tx,created.eventId))
      const intents=(await db.query('SELECT source_type,source_id,recipient_actor_id FROM notification_intents WHERE source_event_id=$1',[created.eventId])).rows
      expect(intents).toEqual([{source_type:'inbox_item',source_id:created.item.id,recipient_actor_id:fixture.humanId}])
    })
    it('allows one current holder, rejects stale prepare/ack and preserves one logical attempt', async () => {
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      const competed=await Promise.all([claim('c1-a',1),claim('c1-b',1)]);expect(competed.flat()).toHaveLength(1)
      const old=competed.flat()[0]!, oldWorker=competed[0]!.length?'c1-a':'c1-b'
      await expire(old.id);const fresh=(await claim('c1-new',1))[0]!
      expect(fresh.id).toBe(old.id);expect(fresh.effectKey).toBe(old.effectKey);expect(fresh.claimFence).toBeGreaterThan(old.claimFence)
      await expect(withTx(db,tx=>prepareChannelSend(tx,old,oldWorker))).rejects.toMatchObject({code:'NOTIFICATION_CLAIM_LOST'})
      await expect(withTx(db,tx=>settleChannelSend(tx,old,oldWorker,'delivered'))).rejects.toMatchObject({code:'NOTIFICATION_CLAIM_LOST'})
      await expect(withTx(db,tx=>prepareChannelSend(tx,{...fresh,effectKey:'different-job'},'c1-new'))).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REUSED'})
      await withTx(db,tx=>prepareChannelSend(tx,fresh,'c1-new'))
      await withTx(db,tx=>settleChannelSend(tx,fresh,'c1-new','delivered','receipt'))
      await withTx(db,tx=>settleChannelSend(tx,fresh,'c1-new','delivered','receipt'))
      await expect(withTx(db,tx=>settleChannelSend(tx,fresh,'c1-new','delivered','different'))).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REUSED'})
    })
    it('isolates target failure and retries only the failed target with its original effectKey', async () => {
      await target('success');await target('failure');const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      const claims=await claim('c1-isolation');expect(claims).toHaveLength(2)
      for(const entry of claims)await withTx(db,tx=>prepareChannelSend(tx,entry,'c1-isolation'))
      await withTx(db,tx=>settleChannelSend(tx,claims[0]!,'c1-isolation','delivered'))
      await withTx(db,tx=>settleChannelSend(tx,claims[1]!,'c1-isolation','failed'))
      await withTx(db,tx=>settleChannelSend(tx,claims[1]!,'c1-isolation','failed'))
      await db.query(`UPDATE notification_deliveries SET available_at=now() WHERE id=$1`,[claims[1]!.id])
      const next=await claim('c1-retry');expect(next).toHaveLength(1);expect(next[0]!.id).toBe(claims[1]!.id)
      expect(next[0]!.effectKey).toBe(claims[1]!.effectKey);expect((await state(claims[0]!.id)).status).toBe('delivered')
    })
    it('persists a timed-out external call as uncertain without automatically retrying it',async()=>{
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      let sends=0,aborted=false
      const worker=createBaseAutomationWorker({db,features,workerId:'c1-timeout',channelAdapters:{wecom:{send:async({signal})=>{
        sends++;signal.addEventListener('abort',()=>{aborted=true},{once:true})
        return new Promise<never>(()=>{})
      }}}})
      const delivery=(await worker.claimNotifications()).find(row=>row.channelClaim)!
      await worker.deliverNotification(delivery)
      expect(sends).toBe(1);expect(aborted).toBe(true)
      expect(await state(delivery.id)).toMatchObject({status:'failed',outcome:'uncertain'})
      expect(await claim('c1-after-timeout')).toHaveLength(0)
    })
    it('rolls back a send checkpoint before commit and reclaims without any external send', async () => {
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId));const old=(await claim('c1-checkpoint'))[0]!
      await expect(withTx(db,async tx=>{await prepareChannelSend(tx,old,'c1-checkpoint');throw new Error('CRASH_CHECKPOINT')})).rejects.toThrow('CRASH_CHECKPOINT')
      expect((await state(old.id)).outcome).toBe('not_sent')
      await expire(old.id);const next=(await claim('c1-restart'))[0]!
      expect(await withTx(db,tx=>prepareChannelSend(tx,next,'c1-restart'))).not.toBeNull()
    })
    it.each(['checkpoint','send','ack'] as const)('recovers a crash after %s as uncertain and requires explicit reconciliation', async boundary => {
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      let sends=0
      const worker=createBaseAutomationWorker({db,features,workerId:'c1-crash',channelAdapters:{wecom:{send:async()=>{sends++;return {result:'delivered'}}}},afterExternalDelivery:async()=>{throw new Error('PROCESS_CRASH')}})
      const delivery=(await worker.claimNotifications()).find(row=>row.channelClaim)!
      if(boundary==='checkpoint') await withTx(db,tx=>prepareChannelSend(tx,delivery.channelClaim!,'c1-crash'))
      else if(boundary==='send')await expect(worker.deliverNotification(delivery)).rejects.toThrow('PROCESS_CRASH')
      else {
        await withTx(db,tx=>prepareChannelSend(tx,delivery.channelClaim!,'c1-crash'));sends++
        await expect(withTx(db,async tx=>{await settleChannelSend(tx,delivery.channelClaim!,'c1-crash','delivered');throw new Error('ACK_COMMIT_CRASH')})).rejects.toThrow('ACK_COMMIT_CRASH')
      }
      await expire(delivery.id);expect(await claim('c1-after-crash')).toHaveLength(0)
      const uncertain=await state(delivery.id);expect(uncertain.outcome).toBe('uncertain');expect(sends).toBe(boundary==='checkpoint'?0:1)
      await expect(withTx(db,tx=>settleChannelSend(tx,delivery.channelClaim!,'c1-crash','delivered'))).rejects.toMatchObject({code:'NOTIFICATION_CLAIM_LOST'})
      await withTx(db,tx=>reconcileChannelSend(tx,meta('reconcile'),delivery.id,uncertain.revision,'retry'))
      const retry=(await claim('c1-reconciled'))[0]!;expect(retry.effectKey).toBe(delivery.effectKey);expect(retry.id).toBe(delivery.id)
      expect(retry.attemptCount).toBe(2)
    })
    it.each(['disabled','changed','inactive','membership'] as const)('suppresses %s after enqueue with zero external calls', async change => {
      const entry=await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      let sends=0;const worker=createBaseAutomationWorker({db,features,workerId:'c1-suppression',channelAdapters:{wecom:{send:async()=>{sends++;return {result:'delivered'}}}}})
      const delivery=(await worker.claimNotifications()).find(row=>row.channelClaim)!
      if(change==='disabled'||change==='changed')await withTx(db,tx=>updateChannelTarget(tx,meta('disable'),entry.id,entry.revision,change==='disabled'?{enabled:false}:{secretMaterial:'https://changed.example.test/hook'}))
      if(change==='inactive')await db.query('UPDATE actors SET is_active=false WHERE id=$1',[fixture.humanId])
      if(change==='membership'){
        await db.query(`UPDATE actors SET workspace_role='member' WHERE id=$1`,[fixture.humanId])
        await db.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2',[fixture.teamId,fixture.humanId])
      }
      try {await worker.deliverNotification(delivery);expect(sends).toBe(0);expect((await state(delivery.id)).status).toBe('suppressed')}
      finally {
        await db.query(`UPDATE actors SET is_active=true,workspace_role='admin' WHERE id=$1`,[fixture.humanId])
        if(change==='membership')await db.query(`INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'admin') ON CONFLICT DO NOTHING`,[fixture.workspaceId,fixture.teamId,fixture.humanId])
      }
    })

    it.each(['ack_timeout','heartbeat_timeout'] as const)('captures the committed stale Inbox before the %s event and admits its exact Human',async(reason)=>{
      await target()
      const work=(await db.query<{id:string}>(`INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) SELECT workspace_id,team_id,(SELECT coalesce(max(number),0)+1 FROM work_items WHERE team_id=$2),'C1 lifecycle',status_id,$3 FROM work_items WHERE id=$1 RETURNING id`,[fixture.workItemId,fixture.teamId,fixture.humanId])).rows[0]!
      const delegation=(await db.query<{id:string}>(`INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,ARRAY['work:read','work:write'],$7) RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,fixture.humanId,work.id,{teamIds:[fixture.teamId],workItemIds:[work.id]}])).rows[0]!
      const session=(await db.query<{id:string}>(`INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state,created_at,acknowledged_at,last_heartbeat_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()-interval '1 hour',now()-interval '1 hour',now()-interval '1 hour') RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,delegation.id,work.id,reason==='ack_timeout'?'queued':'executing'])).rows[0]!
      const lifecycle=createSessionLifecycleWorker({db,workerId:'c1-source-order',ackTimeoutSeconds:30,heartbeatStaleAfterSeconds:60})
      if(reason==='ack_timeout')await lifecycle.expireAckDeadlines();else await lifecycle.reconcileHeartbeatLiveness()
      const inbox=(await db.query<{id:string}>(`SELECT id FROM inbox_items WHERE source_id=$1 AND kind='session_stale'`,[session.id])).rows[0]!
      expect(inbox).toBeDefined()
      const event=(await db.query<{id:string;payload:unknown;notification_sources:unknown}>(`SELECT id,payload,notification_sources FROM domain_events WHERE aggregate_id=$1 AND event_type='agent.session.stale'`,[session.id])).rows[0]!
      expect(event.notification_sources).toEqual([{source_type:'inbox_item',source_id:inbox.id,source_revision:1}])
      expect(event.payload).not.toHaveProperty('notificationSources')
      await withTx(db,tx=>admitChannelEvent(tx,event.id))
      const row=(await claim('c1-real-stale'))[0]!
      expect(row.recipientActorId).toBe(fixture.humanId)
      expect(await withTx(db,tx=>prepareChannelSend(tx,row,'c1-real-stale'))).not.toBeNull()
    })
    it('rechecks Approval Team grants immediately before sending and suppresses revoked authority',async()=>{
      await target()
      const event=await withTx(db,async tx=>{
        const item=(await tx.query<{id:string}>(`INSERT INTO work_items(workspace_id,team_id,number,title,status_id,responsible_human_actor_id) SELECT workspace_id,team_id,(SELECT coalesce(max(number),0)+1 FROM work_items WHERE team_id=$2),'C1 approval',status_id,$3 FROM work_items WHERE id=$1 RETURNING id`,[fixture.workItemId,fixture.teamId,fixture.humanId])).rows[0]!
        const delegation=(await tx.query<{id:string}>(`INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,ARRAY['work:read','work:write'],$7) RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,fixture.humanId,item.id,{teamIds:[fixture.teamId],workItemIds:[item.id]}])).rows[0]!
        const session=(await tx.query<{id:string}>(`INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,state) VALUES($1,$2,$3,$4,$5,$6,'awaiting_approval') RETURNING id`,[fixture.workspaceId,fixture.teamId,fixture.agentId,fixture.agentActorId,delegation.id,item.id])).rows[0]!
        const approval=(await tx.query<{id:string}>(`INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,expires_at) VALUES($1,$2,$3,'protected_action','test_c1','{}',$4,'high','Private rationale',now()+interval '1 hour') RETURNING id`,[fixture.workspaceId,session.id,fixture.agentActorId,'sha256:'+'a'.repeat(64)])).rows[0]!
        return appendEvent(tx,{...meta('approval-source'),type:'approval.requested',aggregateType:'approval',aggregateId:approval.id,revision:1})
      })
      await withTx(db,tx=>admitChannelEvent(tx,event));const row=(await claim('c1-approval'))[0]!
      expect(row).toBeDefined()
      await db.query('UPDATE agent_team_access SET revoked_at=now() WHERE agent_id=$1 AND team_id=$2',[fixture.agentId,fixture.teamId])
      try {expect(await withTx(db,tx=>prepareChannelSend(tx,row,'c1-approval'))).toBeNull();expect((await state(row.id)).status).toBe('suppressed')}
      finally {await db.query('UPDATE agent_team_access SET revoked_at=NULL WHERE agent_id=$1 AND team_id=$2',[fixture.agentId,fixture.teamId])}
    })
    it('keeps stale revisions as generic deep links and never writes decision content', async () => {
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      await db.query('UPDATE inbox_items SET revision=revision+1 WHERE id=$1',[item.id])
      const claimed=(await claim('c1-stale'))[0]!,prepared=await withTx(db,tx=>prepareChannelSend(tx,claimed,'c1-stale'))
      expect(prepared!.content.sourceRevision).toBe(1);expect(prepared!.content.body).not.toContain('Private source')
      expect(prepared!.content.url).toContain(encodeURIComponent('v1:inbox_item:'+item.id))
      expect(Object.keys(prepared!.content)).toEqual(['effectKey','title','body','url','sourceRevision'])
    })
    it('recovers the final claim to dead and explicitly rejects noRedis while missing adapters consume no attempts', async () => {
      await target();const item=await source();await withTx(db,tx=>admitChannelEvent(tx,item.eventId))
      const missing=createBaseAutomationWorker({db,features});expect((await missing.claimNotifications()).filter(row=>row.channelClaim)).toHaveLength(0)
      expect(()=>createBaseAutomationWorker({db,features,channelRuntimeProfile:'noRedis'})).toThrow('CHANNEL_NO_REDIS_UNSUPPORTED')
      const row=(await claim('c1-final'))[0]!
      await db.query(`UPDATE notification_deliveries SET attempt_count=8,claimed_at=now()-interval '61 seconds' WHERE id=$1`,[row.id])
      expect(await claim('c1-last-recovery')).toHaveLength(0);expect((await state(row.id)).status).toBe('dead')
    })
    it('replays outbox after intent commit without duplicate attempts or notification event recursion', async () => {
      await target();const item=await source()
      let fail=true;const outbox=createOutboxWorker({db,features,workerId:'c1-outbox',sink:{deliver:async event=>{if(event.eventId===item.eventId&&fail){fail=false;throw new Error('CRASH_AFTER_INTENT_COMMIT')}}}})
      await outbox.tick()
      await db.query(`UPDATE outbox_events SET available_at=now() WHERE domain_event_id=$1`,[item.eventId]);await outbox.tick()
      expect((await db.query('SELECT 1 FROM notification_intents WHERE source_event_id=$1',[item.eventId])).rowCount).toBe(1)
      expect((await db.query(`SELECT 1 FROM notification_source_checkpoints checkpoint JOIN domain_events event ON event.id=checkpoint.source_event_id WHERE event.event_type LIKE 'notification.%'`)).rowCount).toBe(0)
      await outbox.close()
    })
  })
})
