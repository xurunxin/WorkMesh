import { createHash, randomUUID } from 'node:crypto'
import { loadFeatureConfig, type FeatureConfig } from '@workmesh/config'
import type { AutomationAction, NotificationPriority } from '@workmesh/contracts'
import {
  admitAutomationOccurrence,
  admitLoopRun,
  admitNotification,
  appendEvent,
  executeAutomationAction,
  type Db,
  type Stage4CommandMeta,
  withTx,
} from '@workmesh/db'
import { automationRetry, shouldDeliverNotification } from '@workmesh/domain'
import {
  fetchResolvedWebhook,
  resolveWebhookTarget,
  systemWebhookDnsLookup,
  type WebhookDnsLookup,
} from './agent-webhook.js'

const TERMINAL_SESSION_STATES = new Set(['completed', 'failed', 'canceled'])
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

type ClaimedEffect = {
  id: string
  runId: string
  actionOrdinal: number
  effectKey: string
  action: AutomationAction
  attemptCount: number
  claimFence: number
  workspaceId: string
  teamId: string | null
  maxAttempts: number
}

type ClaimedNotification = {
  id: string
  notificationId: string
  channel: 'in_app' | 'browser' | 'webhook'
  effectKey: string
  attemptCount: number
  claimFence: number
  workspaceId: string
  recipientActorId: string
  priority: NotificationPriority
  kind: string
  title: string
  body: string
  sourceType: string
  sourceId: string
  minimumPriority: NotificationPriority
  mutedKinds: string[]
  webhookUrl: string | null
}

export type AutomationExternalSink = {
  callWebhook: (input: {
    url: string
    effectKey: string
    payload: Record<string, unknown>
  }) => Promise<{ status: number; receipt?: string }>
  deliverBrowser: (input: {
    recipientActorId: string
    effectKey: string
    title: string
    body: string
  }) => Promise<{ receipt?: string }>
}

export async function assertPublicWebhookTarget(
  raw: string,
  dnsLookup: WebhookDnsLookup = systemWebhookDnsLookup,
): Promise<void> {
  const target = await resolveWebhookTarget(raw, {
    dnsLookup,
    allowPrivateAgentWebhooks: process.env.ALLOW_PRIVATE_NOTIFICATION_WEBHOOKS === 'true',
  })
  if (target.url.protocol !== 'https:') throw new Error('WEBHOOK_TARGET_INVALID')
}

const createDefaultSink = (dnsLookup: WebhookDnsLookup): AutomationExternalSink => ({
  async callWebhook(input) {
    const target = await resolveWebhookTarget(input.url, {
      dnsLookup,
      allowPrivateAgentWebhooks: process.env.ALLOW_PRIVATE_NOTIFICATION_WEBHOOKS === 'true',
    })
    if (target.url.protocol !== 'https:') throw new Error('WEBHOOK_TARGET_INVALID')
    const rawBody = JSON.stringify(input.payload)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    let response
    try {
      response = await fetchResolvedWebhook(input.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(rawBody)),
          'idempotency-key': input.effectKey,
          'x-workmesh-delivery': input.effectKey,
        },
        body: rawBody,
        redirect: 'error',
        signal: controller.signal,
        resolvedAddresses: target.addresses,
      })
    } finally {
      clearTimeout(timeout)
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`NOTIFICATION_WEBHOOK_FAILED:${response.status}`)
    return { status: response.status }
  },
  async deliverBrowser() {
    // Browser notifications are pulled from the durable Inbox. Completing this
    // delivery makes the observable record available to a subscribed browser.
    return {}
  },
})

type FieldMatcher = (value: number) => boolean
const parseField = (raw: string, minimum: number, maximum: number): FieldMatcher => {
  const accepted = new Set<number>()
  for (const part of raw.split(',')) {
    if (part === '*') return () => true
    if (part.startsWith('*/')) {
      const step = Number(part.slice(2))
      if (!Number.isInteger(step) || step <= 0) throw new Error('CRON_UNSUPPORTED')
      for (let value = minimum; value <= maximum; value += step) accepted.add(value)
      continue
    }
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range) {
      const start = Number(range[1])
      const end = Number(range[2])
      if (start < minimum || end > maximum || start > end) throw new Error('CRON_UNSUPPORTED')
      for (let value = start; value <= end; value += 1) accepted.add(value)
      continue
    }
    const value = Number(part)
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error('CRON_UNSUPPORTED')
    accepted.add(value)
  }
  return value => accepted.has(value)
}

export function nextCronOccurrence(cron: string, after: Date): Date {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('CRON_UNSUPPORTED')
  const minute = parseField(parts[0]!, 0, 59)
  const hour = parseField(parts[1]!, 0, 23)
  const day = parseField(parts[2]!, 1, 31)
  const month = parseField(parts[3]!, 1, 12)
  const weekday = parseField(parts[4]!, 0, 6)
  const candidate = new Date(after)
  candidate.setUTCSeconds(0, 0)
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  for (let iteration = 0; iteration < 527_040; iteration += 1) {
    if (
      minute(candidate.getUTCMinutes())
      && hour(candidate.getUTCHours())
      && day(candidate.getUTCDate())
      && month(candidate.getUTCMonth() + 1)
      && weekday(candidate.getUTCDay())
    ) return candidate
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)
  }
  throw new Error('CRON_NEXT_OCCURRENCE_NOT_FOUND')
}

export function createAutomationWorker({
  db,
  workerId = `automation-${randomUUID()}`,
  sink,
  dnsLookup = systemWebhookDnsLookup,
  afterExternalDelivery,
  now = () => new Date(),
  features = loadFeatureConfig(),
}: {
  db: Db
  workerId?: string
  sink?: AutomationExternalSink
  dnsLookup?: WebhookDnsLookup
  afterExternalDelivery?: (effectKey: string) => Promise<void>
  now?: () => Date
  features?: FeatureConfig
}) {
  const externalSink = sink ?? createDefaultSink(dnsLookup)
  const notificationChannels: ReadonlyArray<'in_app' | 'browser' | 'webhook'> =
    !features.WORKMESH_BETA_PLANNING
      ? []
      : features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS
        ? ['in_app', 'browser', 'webhook']
        : ['in_app', 'browser']
  // Existing mixed-action rule versions fail closed as one occurrence.
  const actionsEnabled = (actions: Array<{ type?: string }>): boolean =>
    !actions.some(action =>
      (action.type === 'call_webhook' && !features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS)
      || (action.type === 'notify' && !features.WORKMESH_BETA_PLANNING))
  const claimEffects = async (limit = 25, lockTimeoutSeconds = 60): Promise<ClaimedEffect[]> => {
    if (!features.WORKMESH_EXPERIMENTAL_AUTOMATION) return []
    return withTx(db, async tx => (await tx.query<ClaimedEffect>(
      `WITH candidates AS (
        SELECT effect.id FROM automation_effects effect
        JOIN automation_runs run ON run.id=effect.run_id
        WHERE run.status IN ('pending','claimed','running')
          AND NOT run.dry_run
          AND ($4::boolean OR effect.action->>'type'<>'call_webhook')
          AND ($5::boolean OR effect.action->>'type'<>'notify')
          AND effect.attempt_count<8 AND (
          (effect.status IN ('pending','failed') AND effect.available_at<=now())
          OR (effect.status='claimed' AND effect.claimed_at<now()-($2::text || ' seconds')::interval)
        )
          AND NOT EXISTS (
            SELECT 1 FROM automation_effects predecessor
             WHERE predecessor.run_id=effect.run_id
               AND predecessor.action_ordinal<effect.action_ordinal
               AND predecessor.status NOT IN ('completed','reconciled')
          )
        ORDER BY effect.available_at,effect.created_at,effect.action_ordinal
        FOR UPDATE OF effect SKIP LOCKED LIMIT $1
      )
      UPDATE automation_effects effect SET status='claimed',claimed_at=now(),claimed_by=$3,
        claim_fence=effect.claim_fence+1,attempt_count=effect.attempt_count+1
      FROM candidates,automation_runs run
      WHERE effect.id=candidates.id AND run.id=effect.run_id
      RETURNING effect.id,effect.run_id AS "runId",effect.action_ordinal AS "actionOrdinal",
        effect.effect_key AS "effectKey",effect.action,effect.attempt_count AS "attemptCount",
        effect.claim_fence AS "claimFence",run.workspace_id AS "workspaceId",
        run.team_id AS "teamId",run.max_attempts AS "maxAttempts"`,
      [
        limit,
        lockTimeoutSeconds,
        workerId,
        features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS,
        features.WORKMESH_BETA_PLANNING,
      ],
    )).rows)
  }

  const completeEffect = async (effect: ClaimedEffect, result: Record<string, unknown>): Promise<void> => {
    await withTx(db, async tx => {
      const updated = await tx.query(
        `UPDATE automation_effects SET status='completed',completed_at=now(),
          external_checkpoint=coalesce(external_checkpoint,$1),claimed_at=NULL,claimed_by=NULL,last_error=NULL
         WHERE id=$2 AND status='claimed' AND claimed_by=$3 AND claim_fence=$4`,
        [result, effect.id, workerId, effect.claimFence],
      )
      if (updated.rowCount !== 1) throw new Error('AUTOMATION_EFFECT_CLAIM_LOST')
      const remaining = Number((await tx.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM automation_effects
          WHERE run_id=$1 AND status<>'completed'`,
        [effect.runId],
      )).rows[0]?.count ?? 0)
      if (remaining === 0)
        await tx.query("UPDATE automation_runs SET status='succeeded',finished_at=now(),last_error=NULL WHERE id=$1", [effect.runId])
      await appendEvent(tx, {
        workspaceId: effect.workspaceId,
        teamId: effect.teamId ?? undefined,
        actorId: (await tx.query<{ actor_id: string }>(
          `SELECT coalesce(rule.created_by_actor_id,loop.owner_actor_id) AS actor_id
           FROM automation_runs run
           LEFT JOIN automation_rules rule ON rule.id=run.rule_id
           LEFT JOIN loops loop ON loop.id=run.loop_id WHERE run.id=$1`,
          [effect.runId],
        )).rows[0]!.actor_id,
        correlationId: `automation-effect:${effect.id}:${effect.claimFence}`,
        type: 'automation.effect.completed',
        aggregateType: 'automation_effect',
        aggregateId: effect.id,
        payload: { runId: effect.runId, actionOrdinal: effect.actionOrdinal, result },
      })
    })
  }

  const failEffect = async (effect: ClaimedEffect, error: unknown): Promise<void> => {
    await withTx(db, async tx => {
      const retry = automationRetry(effect.attemptCount, Math.min(8, effect.maxAttempts))
      const updated = await tx.query(
        `UPDATE automation_effects SET status=$1,
          available_at=now()+($2::text || ' seconds')::interval,
          claimed_at=NULL,claimed_by=NULL,last_error=$3
         WHERE id=$4 AND status='claimed' AND claimed_by=$5 AND claim_fence=$6`,
        [retry.status, retry.delaySeconds, errorText(error).slice(0, 1000), effect.id, workerId, effect.claimFence],
      )
      if (updated.rowCount !== 1) return
      if (retry.terminal)
        await tx.query("UPDATE automation_runs SET status='dead',finished_at=now(),last_error=$1 WHERE id=$2", [errorText(error).slice(0, 1000), effect.runId])
      const actorId = (await tx.query<{ actor_id: string }>(
        `SELECT coalesce(rule.created_by_actor_id,loop.owner_actor_id) AS actor_id
           FROM automation_runs run
           LEFT JOIN automation_rules rule ON rule.id=run.rule_id
           LEFT JOIN loops loop ON loop.id=run.loop_id WHERE run.id=$1`,
        [effect.runId],
      )).rows[0]!.actor_id
      await appendEvent(tx, {
        workspaceId: effect.workspaceId,
        teamId: effect.teamId ?? undefined,
        actorId,
        correlationId: `automation-effect:${effect.id}:${effect.claimFence}`,
        type: retry.terminal ? 'automation.effect.dead_lettered' : 'automation.effect.retry_scheduled',
        aggregateType: 'automation_effect',
        aggregateId: effect.id,
        payload: {
          runId: effect.runId,
          attemptCount: effect.attemptCount,
          maxAttempts: Math.min(8, effect.maxAttempts),
          error: errorText(error).slice(0, 1000),
        },
      })
    })
  }

  const prepareExternalEffect = async (
    effect: ClaimedEffect,
    payload: Record<string, unknown>,
  ): Promise<'send' | 'acknowledged' | 'uncertain'> => withTx(db, async tx => {
    // Re-run the same application-level authority checks used by internal
    // actions immediately before committing the durable external intent.
    await executeAutomationAction(tx, {
      meta: {
        workspaceId: effect.workspaceId,
        actorId: workerId,
        correlationId: `automation-effect:${effect.id}:${effect.claimFence}:prepare`,
      },
      runId: effect.runId,
      actionOrdinal: effect.actionOrdinal,
      action: effect.action,
      notificationChannels,
    })
    const requestHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
    const inserted = await tx.query(
      `INSERT INTO automation_external_effect_intents(effect_id,effect_key,request_hash)
       VALUES($1,$2,$3) ON CONFLICT(effect_id) DO NOTHING`,
      [effect.id, effect.effectKey, requestHash],
    )
    if (inserted.rowCount === 1) return 'send'
    const existing = (await tx.query<{ state: 'prepared' | 'acknowledged' | 'uncertain'; request_hash: string }>(
      `SELECT state,request_hash FROM automation_external_effect_intents
        WHERE effect_id=$1 FOR UPDATE`,
      [effect.id],
    )).rows[0]
    if (!existing || existing.request_hash !== requestHash) throw new Error('AUTOMATION_EXTERNAL_INTENT_MISMATCH')
    if (existing.state === 'acknowledged') return 'acknowledged'
    if (existing.state === 'prepared') {
      await tx.query(
        `UPDATE automation_external_effect_intents
          SET state='uncertain',reconciled_at=now() WHERE effect_id=$1`,
        [effect.id],
      )
    }
    return 'uncertain'
  })

  const acknowledgeExternalEffect = async (
    effect: ClaimedEffect,
    response: { status: number; receipt?: string },
  ): Promise<void> => {
    await withTx(db, async tx => {
      const updated = await tx.query(
        `UPDATE automation_external_effect_intents
          SET state='acknowledged',response_status=$1,response_receipt=$2,acknowledged_at=now()
          WHERE effect_id=$3 AND state='prepared'`,
        [response.status, response.receipt ?? null, effect.id],
      )
      if (updated.rowCount !== 1) throw new Error('AUTOMATION_EXTERNAL_INTENT_LOST')
    })
  }

  const executeEffect = async (effect: ClaimedEffect): Promise<void> => {
    if (!features.WORKMESH_EXPERIMENTAL_AUTOMATION) return
    if (effect.action.type === 'call_webhook' && !features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS) return
    if (effect.action.type === 'notify' && !features.WORKMESH_BETA_PLANNING) return
    try {
      let result: Record<string, unknown>
      if (effect.action.type === 'call_webhook') {
        const url = typeof effect.action.parameters.url === 'string' ? effect.action.parameters.url : ''
        if (!url) throw new Error('AUTOMATION_WEBHOOK_URL_REQUIRED')
        const payload = {
          runId: effect.runId,
          actionOrdinal: effect.actionOrdinal,
          payload: effect.action.parameters.payload ?? {},
        }
        const intent = await prepareExternalEffect(effect, payload)
        if (intent === 'uncertain') {
          result = { externalCompleted: false, reconciled: true, outcome: 'uncertain', repeated: false }
        } else if (intent === 'acknowledged') {
          result = { externalCompleted: true, reconciled: true, repeated: false }
        } else {
          const response = await externalSink.callWebhook({ url, effectKey: effect.effectKey, payload })
          await afterExternalDelivery?.(effect.effectKey)
          await acknowledgeExternalEffect(effect, response)
          result = { externalCompleted: true, ...response }
        }
      } else {
        result = await withTx(db, tx => executeAutomationAction(tx, {
          meta: {
            workspaceId: effect.workspaceId,
            actorId: workerId,
            correlationId: `automation-effect:${effect.id}:${effect.claimFence}`,
          },
          runId: effect.runId,
          actionOrdinal: effect.actionOrdinal,
          action: effect.action,
          notificationChannels,
        }))
      }
      await completeEffect(effect, result)
    } catch (error) {
      await failEffect(effect, error)
    }
  }

  const scheduleDueLoops = async (limit = 25): Promise<void> => {
    if (!features.WORKMESH_EXPERIMENTAL_AGENT_LOOPS) return
    const due = (await db.query<{
      id: string
      workspace_id: string
      owner_actor_id: string
      trigger: { type: string; cron?: string; timezone?: string }
      next_run_at: Date
    }>(
      `SELECT id,workspace_id,owner_actor_id,trigger,next_run_at FROM loops
       WHERE state='active' AND next_run_at<=now()
       ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT $1`,
      [limit],
    )).rows
    for (const loop of due) {
      try {
        await withTx(db, async tx => {
          const locked = (await tx.query<typeof loop>(
            `SELECT id,workspace_id,owner_actor_id,trigger,next_run_at FROM loops
              WHERE id=$1 AND state='active' AND next_run_at<=now() FOR UPDATE`,
            [loop.id],
          )).rows[0]
          if (!locked) return
          if (locked.trigger.type !== 'schedule' || typeof locked.trigger.cron !== 'string')
            throw new Error('LOOP_SCHEDULE_INVALID')
          if ((locked.trigger.timezone ?? 'UTC') !== 'UTC') throw new Error('LOOP_TIMEZONE_UNSUPPORTED')
          const scheduledFor = locked.next_run_at
          const next = nextCronOccurrence(locked.trigger.cron, scheduledFor)
          await admitLoopRun(tx, {
            meta: {
              workspaceId: locked.workspace_id,
              actorId: locked.owner_actor_id,
              correlationId: `loop-schedule:${locked.id}:${scheduledFor.toISOString()}`,
            },
            loopId: locked.id,
            occurrenceKey: `schedule:${scheduledFor.toISOString()}`,
            scheduledFor,
            authorization: { kind: 'trusted_worker' },
            notificationChannels,
          })
          await tx.query('UPDATE loops SET next_run_at=$1,updated_at=now() WHERE id=$2', [next, locked.id])
        })
      } catch (error) {
        if (!/CRON_|LOOP_SCHEDULE_INVALID|LOOP_TIMEZONE_UNSUPPORTED/.test(errorText(error))) throw error
        await db.query(
          `UPDATE loops SET state='paused',next_run_at=NULL,updated_at=now()
            WHERE id=$1 AND state='active'`,
          [loop.id],
        )
      }
    }
  }

  const scheduleDueRules = async (limit = 25): Promise<void> => {
    if (!features.WORKMESH_EXPERIMENTAL_AUTOMATION) return
    const rules = (await db.query<{
      id: string
      workspace_id: string
      created_by_actor_id: string
      trigger: { type: string; cron?: string; timezone?: string }
      actions: Array<{ type?: string }>
      last_scheduled: Date | null
    }>(
      `SELECT rule.id,rule.workspace_id,rule.created_by_actor_id,version.trigger,version.actions,
        max(occurrence.scheduled_for) AS last_scheduled
       FROM automation_rules rule
       JOIN automation_rule_versions version ON version.id=rule.current_version_id
       LEFT JOIN automation_occurrences occurrence ON occurrence.rule_id=rule.id
       WHERE rule.state='active' AND version.trigger->>'type'='schedule'
       GROUP BY rule.id,version.trigger,version.actions
       ORDER BY rule.created_at LIMIT $1`,
      [limit],
    )).rows
    const clock = now()
    for (const rule of rules) {
      try {
        if (!actionsEnabled(rule.actions)) continue
        if (rule.trigger.timezone && rule.trigger.timezone !== 'UTC') throw new Error('CRON_TIMEZONE_UNSUPPORTED')
        const baseline = rule.last_scheduled ?? new Date(clock.getTime() - 60_000)
        const scheduledFor = nextCronOccurrence(rule.trigger.cron ?? '', baseline)
        if (scheduledFor > clock) continue
        await withTx(db, tx => admitAutomationOccurrence(tx, {
          meta: {
            workspaceId: rule.workspace_id,
            actorId: rule.created_by_actor_id,
            correlationId: `rule-schedule:${rule.id}:${scheduledFor.toISOString()}`,
          },
          ruleId: rule.id,
          occurrenceKey: `schedule:${scheduledFor.toISOString()}`,
          scheduledFor,
          payload: { scheduledFor: scheduledFor.toISOString(), source: 'schedule' },
          dryRun: false,
          authorization: { kind: 'trusted_worker' },
        }))
      } catch (error) {
        if (!/CRON_/.test(errorText(error))) throw error
        await db.query(
          `UPDATE automation_rules SET state='paused',updated_at=now()
            WHERE id=$1 AND state='active'`,
          [rule.id],
        )
      }
    }
  }

  const admitEventRules = async (limit = 100): Promise<void> => {
    if (!features.WORKMESH_EXPERIMENTAL_AUTOMATION) return
    const matches = (await db.query<{
      rule_id: string
      workspace_id: string
      event_id: string
      event_type: string
      event_version: number
      event_cursor: string
      event_actor_id: string
      occurred_at: Date
      payload: Record<string, unknown>
      actions: Array<{ type?: string }>
    }>(
      `SELECT rule.id AS rule_id,rule.workspace_id,event.id AS event_id,
              event.event_type,event.event_version,event.cursor::text AS event_cursor,
               event.actor_id AS event_actor_id,event.occurred_at,event.payload,version.actions
         FROM automation_rules rule
         JOIN automation_rule_versions version ON version.id=rule.current_version_id
         JOIN domain_events event ON event.workspace_id=rule.workspace_id
           AND (version.trigger->'eventTypes') ? event.event_type
        WHERE rule.state='active' AND version.trigger->>'type'='event'
          AND NOT EXISTS (
            SELECT 1 FROM automation_occurrences occurrence
             WHERE occurrence.rule_id=rule.id
               AND occurrence.occurrence_key='event:' || event.id::text
          )
        ORDER BY event.cursor,rule.id
        LIMIT $1`,
      [limit],
    )).rows
    for (const match of matches) {
      if (!actionsEnabled(match.actions)) continue
      await withTx(db, tx => admitAutomationOccurrence(tx, {
        meta: {
          workspaceId: match.workspace_id,
          actorId: match.event_actor_id,
          correlationId: `rule-event:${match.rule_id}:${match.event_id}`,
        },
        ruleId: match.rule_id,
        occurrenceKey: `event:${match.event_id}`,
        eventId: match.event_id,
        payload: {
          event: {
            id: match.event_id,
            cursor: match.event_cursor,
            type: match.event_type,
            version: match.event_version,
            occurredAt: match.occurred_at.toISOString(),
          },
          ...match.payload,
        },
        dryRun: false,
        authorization: { kind: 'trusted_worker' },
      }))
    }
  }

  const reconcileLoopRuns = async (): Promise<void> => {
    if (!features.WORKMESH_EXPERIMENTAL_AGENT_LOOPS) return
    const candidates = (await db.query<{ run_id: string; session_id: string }>(
      `SELECT run.id AS run_id,run.session_id FROM automation_runs run
       JOIN agent_sessions session ON session.id=run.session_id
       WHERE run.loop_id IS NOT NULL AND run.status IN ('pending','claimed','running')
         AND session.state IN ('completed','failed','canceled')`,
    )).rows
    for (const candidate of candidates) {
      await withTx(db, async tx => {
        const row = (await tx.query<{
          workspace_id: string
          team_id: string | null
          loop_id: string
          state: string
          owner_actor_id: string
          failure_notification: string
        }>(
          `SELECT run.workspace_id,run.team_id,run.loop_id,session.state,
                  loop.owner_actor_id,loop.failure_notification
           FROM automation_runs run
           JOIN agent_sessions session ON session.id=run.session_id
           JOIN loops loop ON loop.id=run.loop_id
           WHERE run.id=$1 AND run.status IN ('pending','claimed','running')
             AND session.state IN ('completed','failed','canceled') FOR UPDATE OF run`,
          [candidate.run_id],
        )).rows[0]
        if (!row || !TERMINAL_SESSION_STATES.has(row.state)) return
        const status = row.state === 'completed' ? 'succeeded' : 'failed'
        await tx.query(
          `UPDATE automation_runs SET status=$1::automation_run_status,finished_at=now(),
            last_error=CASE WHEN $1::text='failed' THEN $2 ELSE NULL END WHERE id=$3`,
          [status, `SESSION_${row.state.toUpperCase()}`, candidate.run_id],
        )
        await tx.query(
          `UPDATE loop_budget_reservations SET status='consumed',released_at=now()
            WHERE automation_run_id=$1 AND status='reserved'`,
          [candidate.run_id],
        )
        await appendEvent(tx, {
          workspaceId: row.workspace_id,
          teamId: row.team_id ?? undefined,
          actorId: row.owner_actor_id,
          correlationId: `loop-reconcile:${candidate.run_id}`,
          type: status === 'succeeded' ? 'loop.run.succeeded' : 'loop.run.failed',
          aggregateType: 'automation_run',
          aggregateId: candidate.run_id,
          payload: { loopId: row.loop_id, sessionId: candidate.session_id, sessionState: row.state },
        })
        if (notificationChannels.length > 0 && status === 'failed' && row.failure_notification !== 'none') {
          const recipients = row.failure_notification === 'team' && row.team_id
            ? (await tx.query<{ actor_id: string }>(
              `SELECT member.actor_id FROM memberships member
                JOIN actors actor ON actor.id=member.actor_id AND actor.kind='human' AND actor.is_active
               WHERE member.workspace_id=$1 AND member.team_id=$2`,
              [row.workspace_id, row.team_id],
            )).rows.map(recipient => recipient.actor_id)
            : [row.owner_actor_id]
          for (const recipientActorId of new Set(recipients)) {
            await admitNotification(tx, {
              workspaceId: row.workspace_id,
              recipientActorId,
              priority: 'agent_failure',
              kind: 'loop.failed',
              title: 'Loop run failed',
              body: `Session ${candidate.session_id} ended ${row.state}.`,
              sourceType: 'automation_run',
              sourceId: candidate.run_id,
              dedupeKey: `loop-failed:${candidate.run_id}`,
              requestedChannels: [...notificationChannels],
            })
          }
        }
      })
    }
  }

  const claimNotifications = async (limit = 25, lockTimeoutSeconds = 60): Promise<ClaimedNotification[]> =>
    !features.WORKMESH_BETA_PLANNING ? [] : withTx(db, async tx => (await tx.query<ClaimedNotification>(
      `WITH candidates AS (
        SELECT delivery.id FROM notification_deliveries delivery
        WHERE delivery.attempt_count<8 AND (
          (delivery.status IN ('pending','failed') AND delivery.available_at<=now())
          OR (delivery.status='claimed' AND delivery.claimed_at<now()-($2::text || ' seconds')::interval)
        )
          AND ($4::boolean OR delivery.channel<>'webhook')
        ORDER BY delivery.available_at,delivery.created_at
        FOR UPDATE SKIP LOCKED LIMIT $1
      )
      UPDATE notification_deliveries delivery SET status='claimed',claimed_at=now(),claimed_by=$3,
        claim_fence=delivery.claim_fence+1,attempt_count=delivery.attempt_count+1
      FROM candidates,notifications notification
      LEFT JOIN notification_preferences preference
        ON preference.workspace_id=notification.workspace_id AND preference.actor_id=notification.recipient_actor_id
      WHERE delivery.id=candidates.id AND notification.id=delivery.notification_id
      RETURNING delivery.id,delivery.notification_id AS "notificationId",delivery.channel,
        delivery.effect_key AS "effectKey",delivery.attempt_count AS "attemptCount",
        delivery.claim_fence AS "claimFence",notification.workspace_id AS "workspaceId",
        notification.recipient_actor_id AS "recipientActorId",notification.priority,
        notification.kind,notification.title,notification.body,notification.source_type AS "sourceType",
        notification.source_id AS "sourceId",coalesce(preference.minimum_priority,'update') AS "minimumPriority",
        coalesce(preference.muted_kinds,'{}') AS "mutedKinds",preference.webhook_url AS "webhookUrl"`,
      [limit, lockTimeoutSeconds, workerId, features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS],
    )).rows)

  const deliverNotification = async (delivery: ClaimedNotification): Promise<void> => {
    if (!features.WORKMESH_BETA_PLANNING) return
    if (delivery.channel === 'webhook' && !features.WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS) return
    try {
      if (!shouldDeliverNotification(delivery)) {
        await db.query(
          `UPDATE notification_deliveries SET status='suppressed',claimed_at=NULL,claimed_by=NULL
            WHERE id=$1 AND claimed_by=$2 AND claim_fence=$3`,
          [delivery.id, workerId, delivery.claimFence],
        )
        return
      }
      let checkpoint: Record<string, unknown> = {}
      if (delivery.channel === 'webhook') {
        if (!delivery.webhookUrl) throw new Error('NOTIFICATION_WEBHOOK_NOT_CONFIGURED')
        checkpoint = await externalSink.callWebhook({
          url: delivery.webhookUrl,
          effectKey: delivery.effectKey,
          payload: {
            id: delivery.notificationId,
            priority: delivery.priority,
            kind: delivery.kind,
            title: delivery.title,
            body: delivery.body,
            source: { type: delivery.sourceType, id: delivery.sourceId },
          },
        })
      } else if (delivery.channel === 'browser') {
        checkpoint = await externalSink.deliverBrowser({
          recipientActorId: delivery.recipientActorId,
          effectKey: delivery.effectKey,
          title: delivery.title,
          body: delivery.body,
        })
      }
      await withTx(db, async tx => {
        const updated = await tx.query(
          `UPDATE notification_deliveries SET status='delivered',effect_completed_at=now(),
            delivered_at=now(),claimed_at=NULL,claimed_by=NULL,last_error=NULL
           WHERE id=$1 AND status='claimed' AND claimed_by=$2 AND claim_fence=$3`,
          [delivery.id, workerId, delivery.claimFence],
        )
        if (updated.rowCount !== 1) throw new Error('NOTIFICATION_CLAIM_LOST')
        await appendEvent(tx, {
          workspaceId: delivery.workspaceId,
          actorId: delivery.recipientActorId,
          correlationId: `notification:${delivery.id}:${delivery.claimFence}`,
          type: 'notification.delivered',
          aggregateType: 'notification',
          aggregateId: delivery.notificationId,
          audienceActorId: delivery.recipientActorId,
          payload: { channel: delivery.channel, checkpoint },
        })
      })
    } catch (error) {
      const retry = automationRetry(delivery.attemptCount, 8)
      await db.query(
        `UPDATE notification_deliveries SET status=$1,
          available_at=now()+($2::text || ' seconds')::interval,claimed_at=NULL,claimed_by=NULL,last_error=$3
         WHERE id=$4 AND status='claimed' AND claimed_by=$5 AND claim_fence=$6`,
        [retry.status, retry.delaySeconds, errorText(error).slice(0, 1000), delivery.id, workerId, delivery.claimFence],
      )
    }
  }

  const tick = async (): Promise<void> => {
    if (features.WORKMESH_EXPERIMENTAL_AUTOMATION) {
      await admitEventRules()
      await scheduleDueRules()
      for (const effect of await claimEffects()) await executeEffect(effect)
    }
    if (features.WORKMESH_BETA_PLANNING)
      for (const notification of await claimNotifications()) await deliverNotification(notification)
    if (features.WORKMESH_EXPERIMENTAL_AGENT_LOOPS) {
      await scheduleDueLoops()
      await reconcileLoopRuns()
    }
  }

  return {
    claimEffects,
    executeEffect,
    failEffect,
    scheduleDueLoops,
    scheduleDueRules,
    admitEventRules,
    reconcileLoopRuns,
    claimNotifications,
    deliverNotification,
    tick,
  }
}
