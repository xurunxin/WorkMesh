import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  admitAutomationOccurrence,
  admitLoopRun,
  admitNotification,
  appendEvent,
  applyMigrations,
  createDb,
  installWorkspace,
  withTx,
} from '@workmesh/db'
import { loadFeatureConfig } from '@workmesh/config'
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

  it('gates notifications on Beta Planning and skips a disabled webhook at the queue head', async () => {
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
    await expect(disabledPlanning.claimNotifications()).resolves.toEqual([])
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
    )).rows.map(row => row.channel)).toEqual(['in_app', 'in_app', 'browser', 'browser'])
    expect((await db.query(
      `SELECT 1 FROM notification_deliveries delivery
       JOIN notifications notification ON notification.id=delivery.notification_id
       WHERE notification.source_id=$1 AND delivery.channel='webhook'`,
      [internalOnly.runId],
    )).rowCount).toBe(0)
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
})
