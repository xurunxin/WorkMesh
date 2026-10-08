import { createHash, createHmac } from 'node:crypto'
import type { PoolClient } from 'pg'
import {
  DomainError,
  assertRevision,
  automationRetry,
  canonicalActionApprovalPayload,
  notificationRecipient,
  shouldDeliverNotification,
} from '@workmesh/domain'
import { appendEvent } from './events.js'
import {
  notificationSourceAggregateTypes,
  humanAttentionProjectionSql,
} from './human-attention-sources.js'

type NotificationPriority = Parameters<
  typeof shouldDeliverNotification
>[0]['priority']

export type ChannelCommandMeta = {
  workspaceId: string
  actorId: string
  correlationId: string
  idempotencyKey?: string
}
export type ChannelTarget = {
  id: string
  workspace_id: string
  owner_actor_id: string
  provider: 'wecom'
  name: string
  enabled: boolean
  status: 'active' | 'revoked'
  revision: number
  endpoint_fingerprint: string
  created_at: Date
  updated_at: Date
}
export type ChannelClaim = {
  id: string
  workspaceId: string
  recipientActorId: string
  channelTargetId: string
  intentId: string
  claimFence: number
  effectKey: string
  attemptCount: number
  leaseExpiresAt: Date
}
export type ChannelContent = {
  effectKey: string
  title: string
  body: string
  url: string
  sourceRevision: number
}
type Source = {
  source_type: string
  source_id: string
  source_revision: number
  status: string
  kind: string
  team_id: string | null
  session_id: string | null
  recipient_actor_id: string | null
  responsible_human_actor_id: string | null
}
const digest = (input: unknown) =>
  createHash('sha256')
    .update(canonicalActionApprovalPayload(input))
    .digest('hex')
const storageKey = () => {
  const key = process.env.WORKMESH_MASTER_KEY
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new DomainError(
      'INTERNAL_ERROR',
      'Channel secret storage is unavailable',
    )
  return key
}
export const channelSecretFingerprint = (secret: string) =>
  `hmac:${createHmac('sha256', storageKey()).update('notification-channel-secret\0').update(secret).digest('hex')}`

export function validateChannelSecret(raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new DomainError('INVALID_INPUT', 'Invalid channel configuration')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new DomainError(
      'INVALID_INPUT',
      'Channel configuration requires HTTPS without credentials or fragment',
    )
  // Provider-specific endpoint/DNS validation belongs to the sending adapter, never a save probe.
}

export async function authorizeChannelOwner(
  tx: PoolClient,
  meta: ChannelCommandMeta,
  targetId?: string,
): Promise<void> {
  const active = await tx.query(
    `SELECT 1 FROM actors WHERE workspace_id=$1 AND id=$2 AND kind='human' AND is_active`,
    [meta.workspaceId, meta.actorId],
  )
  if (!active.rowCount)
    throw new DomainError('FORBIDDEN', 'Active Human account required')
  if (
    targetId &&
    !(
      await tx.query(
        `SELECT 1 FROM notification_channel_targets WHERE workspace_id=$1 AND id=$2 AND owner_actor_id=$3`,
        [meta.workspaceId, targetId, meta.actorId],
      )
    ).rowCount
  )
    throw new DomainError('NOT_FOUND', 'Channel target was not found')
}

export async function appendChannelEvent(
  tx: PoolClient,
  meta: ChannelCommandMeta,
  targetId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  await appendEvent(tx, {
    ...meta,
    type,
    aggregateType: 'notification_channel_target',
    aggregateId: targetId,
    audienceActorId: meta.actorId,
    payload,
  })
}

export async function createChannelTarget(
  tx: PoolClient,
  meta: ChannelCommandMeta,
  input: {
    name: string
    provider: 'wecom'
    secretMaterial: string
    enabled: boolean
  },
): Promise<ChannelTarget> {
  await authorizeChannelOwner(tx, meta)
  validateChannelSecret(input.secretMaterial)
  const row = (
    await tx.query<ChannelTarget>(
      `INSERT INTO notification_channel_targets(workspace_id,owner_actor_id,provider,name,enabled,secret_ciphertext,endpoint_fingerprint)
    VALUES($1,$2,$3,$4,$5,pgp_sym_encrypt($6,$7),$8) RETURNING *`,
      [
        meta.workspaceId,
        meta.actorId,
        input.provider,
        input.name,
        input.enabled,
        input.secretMaterial,
        storageKey(),
        channelSecretFingerprint(input.secretMaterial),
      ],
    )
  ).rows[0]!
  await appendChannelEvent(
    tx,
    meta,
    row.id,
    'notification.channel_target.created',
    { targetId: row.id, revision: row.revision },
  )
  return row
}

export async function updateChannelTarget(
  tx: PoolClient,
  meta: ChannelCommandMeta,
  targetId: string,
  revision: number,
  input: { name?: string; secretMaterial?: string; enabled?: boolean },
  revoke = false,
): Promise<ChannelTarget> {
  await authorizeChannelOwner(tx, meta, targetId)
  const current = (
    await tx.query<ChannelTarget>(
      `SELECT * FROM notification_channel_targets WHERE workspace_id=$1 AND id=$2 AND owner_actor_id=$3 FOR UPDATE`,
      [meta.workspaceId, targetId, meta.actorId],
    )
  ).rows[0]!
  assertRevision(revision, current.revision)
  if (current.status === 'revoked')
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      'Revoked targets cannot be changed',
    )
  if (input.secretMaterial !== undefined)
    validateChannelSecret(input.secretMaterial)
  const row = (
    await tx.query<ChannelTarget>(
      `UPDATE notification_channel_targets SET name=coalesce($4,name),
    enabled=coalesce($5,enabled),status=$6,revision=revision+1,updated_at=now(),
    secret_ciphertext=CASE WHEN $7::text IS NULL THEN secret_ciphertext ELSE pgp_sym_encrypt($7,$8) END,
    endpoint_fingerprint=coalesce($9,endpoint_fingerprint)
    WHERE workspace_id=$1 AND id=$2 AND owner_actor_id=$3 RETURNING *`,
      [
        meta.workspaceId,
        targetId,
        meta.actorId,
        input.name ?? null,
        revoke ? false : (input.enabled ?? null),
        revoke ? 'revoked' : 'active',
        revoke ? '' : (input.secretMaterial ?? null),
        storageKey(),
        input.secretMaterial !== undefined
          ? channelSecretFingerprint(input.secretMaterial)
          : null,
      ],
    )
  ).rows[0]!
  await appendChannelEvent(
    tx,
    meta,
    targetId,
    revoke
      ? 'notification.channel_target.revoked'
      : 'notification.channel_target.updated',
    { targetId, revision: row.revision },
  )
  return row
}

async function sourceFor(
  tx: PoolClient,
  workspaceId: string,
  sourceType: string,
  sourceId: string,
): Promise<Source | undefined> {
  return (
    await tx.query<Source>(
      `SELECT selected.*, CASE WHEN selected.source_type='inbox_item' THEN selected.responsible_human_actor_id
        WHEN selected.work_item_id IS NOT NULL THEN item.responsible_human_actor_id
        ELSE project.lead_actor_id END AS responsible_human_actor_id
       FROM (${humanAttentionProjectionSql} AND attention.source_type=$2 AND attention.source_id=$3) selected
       LEFT JOIN work_items item ON item.workspace_id=selected.workspace_id AND item.id=selected.work_item_id AND item.deleted_at IS NULL
       LEFT JOIN projects project ON project.workspace_id=selected.workspace_id AND project.id=selected.project_id AND project.deleted_at IS NULL`,
      [workspaceId, sourceType, sourceId],
    )
  ).rows[0]
}

async function authorizedRecipient(
  tx: PoolClient,
  workspaceId: string,
  recipient: string,
  source: Source,
): Promise<boolean> {
  if (
    notificationRecipient({
      sourceType: source.source_type,
      recipientActorId: source.recipient_actor_id,
      responsibleHumanActorId: source.responsible_human_actor_id,
    }) !== recipient
  )
    return false
  // Background delivery is independent of cookie lifetime, but never of durable authority.
  const human = await tx.query(
    `SELECT 1 FROM actors human WHERE human.workspace_id=$1 AND human.id=$2 AND human.kind='human' AND human.is_active
    AND (human.workspace_role='admin' OR EXISTS(SELECT 1 FROM memberships member JOIN teams team ON team.id=member.team_id AND team.workspace_id=member.workspace_id AND team.deleted_at IS NULL
      WHERE member.workspace_id=$1 AND member.actor_id=human.id AND member.team_id=$3))`,
    [workspaceId, recipient, source.team_id],
  )
  if (!human.rowCount) return false
  if (source.source_type === 'approval' && source.session_id) {
    const live = await tx.query(
      `SELECT 1 FROM agent_sessions session JOIN delegations delegation ON delegation.id=session.delegation_id
      JOIN agent_definitions agent ON agent.id=session.agent_id AND agent.workspace_id=session.workspace_id
      JOIN agent_team_access access ON access.workspace_id=session.workspace_id AND access.agent_id=session.agent_id AND access.team_id=session.team_id
      LEFT JOIN work_items item ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id AND item.deleted_at IS NULL
      LEFT JOIN projects project ON project.id=coalesce(item.project_id,session.project_id) AND project.workspace_id=session.workspace_id AND project.deleted_at IS NULL
      WHERE session.workspace_id=$1 AND session.id=$2 AND session.state IN ('acknowledged','planning','executing','awaiting_input','awaiting_approval','blocked')
        AND delegation.workspace_id=session.workspace_id AND delegation.agent_id=session.agent_id
        AND delegation.status='active' AND agent.is_active
        AND access.revoked_at IS NULL AND 'work:write'=ANY(access.approved_capabilities)
        AND 'work:write'=ANY(agent.approved_capabilities) AND 'work:write'=ANY(delegation.permissions_snapshot)
        AND coalesce(delegation.capability_scope->'teamIds','[]'::jsonb) ? session.team_id::text
        AND (session.work_item_id IS NULL OR (item.id IS NOT NULL AND coalesce(delegation.capability_scope->'workItemIds','[]'::jsonb) ? session.work_item_id::text))
        AND (coalesce(item.project_id,session.project_id) IS NULL OR project.id IS NOT NULL)
        AND (session.work_item_id IS NOT NULL OR coalesce(item.project_id,session.project_id) IS NULL OR coalesce(delegation.capability_scope->'projectIds','[]'::jsonb) ? coalesce(item.project_id,session.project_id)::text)`,
      [workspaceId, source.session_id],
    )
    if (!live.rowCount) return false
  }
  return true
}

const sourcePriority = (kind: string): NotificationPriority =>
  kind === 'approval'
    ? 'approval'
    : kind === 'clarification'
      ? 'input'
      : kind === 'recovery' || kind === 'conflict'
        ? 'agent_failure'
        : 'update'

export async function admitChannelEvent(
  tx: PoolClient,
  eventId: string,
): Promise<void> {
  const event = (
    await tx.query<{
      id: string
      workspace_id: string
      cursor: string
      event_type: string
      aggregate_type: string
      aggregate_id: string
      aggregate_revision: number | null
      payload: unknown
      notification_sources: Array<{
        source_type: string
        source_id: string
        source_revision: number
      }>
      actor_id: string
      occurred_at: Date
    }>(
      `SELECT id,workspace_id,cursor::text,event_type,aggregate_type,aggregate_id,aggregate_revision,payload,notification_sources,actor_id,occurred_at FROM domain_events WHERE id=$1`,
      [eventId],
    )
  ).rows[0]
  if (!event) throw new DomainError('NOT_FOUND', 'Source event was not found')
  const sourceType =
    event.aggregate_type === 'session' ? 'agent_session' : event.aggregate_type
  if (
    !notificationSourceAggregateTypes.some((type) => type === sourceType) ||
    event.event_type.startsWith('notification.')
  )
    return
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `channel-event:${event.workspace_id}:${event.id}`,
  ])
  const requestHash = digest({
    cursor: event.cursor,
    type: event.event_type,
    sourceType,
    sourceId: event.aggregate_id,
    revision: event.aggregate_revision,
    payload: event.payload,
    notificationSources: event.notification_sources,
  })
  const previous = (
    await tx.query<{ request_hash: string }>(
      `SELECT request_hash FROM notification_source_checkpoints WHERE workspace_id=$1 AND source_event_id=$2`,
      [event.workspace_id, event.id],
    )
  ).rows[0]
  if (previous) {
    if (previous.request_hash !== requestHash)
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'Source event has conflicting content',
      )
    return
  }
  let admitted = false
  // Pre-contract events have no source snapshot and must not backfill historical notifications.
  for (const snapshot of event.notification_sources) {
    const source = await sourceFor(
      tx,
      event.workspace_id,
      snapshot.source_type,
      snapshot.source_id,
    )
    const recipient =
      source &&
      notificationRecipient({
        sourceType: snapshot.source_type,
        recipientActorId: source.recipient_actor_id,
        responsibleHumanActorId: source.responsible_human_actor_id,
      })
    if (
      source?.status === 'open' &&
      recipient &&
      (await authorizedRecipient(tx, event.workspace_id, recipient, source))
    ) {
      const targets = (
        await tx.query<{ id: string; revision: number }>(
          `SELECT id,revision FROM notification_channel_targets WHERE workspace_id=$1 AND owner_actor_id=$2
      AND enabled AND status='active' AND created_at<=$3 ORDER BY id FOR SHARE`,
          [event.workspace_id, recipient, event.occurred_at],
        )
      ).rows
      const revision = snapshot.source_revision
      if (targets.length) {
        const intent = (
          await tx.query<{ id: string }>(
            `INSERT INTO notification_intents(workspace_id,source_event_id,source_cursor,source_type,source_id,source_revision,recipient_actor_id,intent_hash,target_snapshot)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [
              event.workspace_id,
              event.id,
              event.cursor,
              snapshot.source_type,
              snapshot.source_id,
              revision,
              recipient,
              digest({ requestHash, recipient, revision, targets }),
              JSON.stringify(targets),
            ],
          )
        ).rows[0]!
        for (const target of targets) {
          await tx.query(
            `INSERT INTO notification_deliveries(workspace_id,intent_id,channel_target_id,recipient_actor_id,target_revision,channel,effect_key,available_at)
          VALUES($1,$2,$3,$4,$5,'webhook',$6,now())`,
            [
              event.workspace_id,
              intent.id,
              target.id,
              recipient,
              target.revision,
              `notification:${intent.id}:target:${target.id}`,
            ],
          )
          await appendChannelEvent(
            tx,
            {
              workspaceId: event.workspace_id,
              actorId: recipient,
              correlationId: `channel-source:${event.id}`,
            },
            target.id,
            'notification.intent.admitted',
            {
              intentId: intent.id,
              sourceEventId: event.id,
              sourceRevision: revision,
            },
          )
        }
        admitted = true
      }
    }
  }
  await tx.query(
    `INSERT INTO notification_source_checkpoints(workspace_id,source_event_id,source_cursor,request_hash,result) VALUES($1,$2,$3,$4,$5)`,
    [
      event.workspace_id,
      event.id,
      event.cursor,
      requestHash,
      admitted ? 'admitted' : 'suppressed',
    ],
  )
}

export async function claimChannelNotifications(
  tx: PoolClient,
  workerId: string,
  providers: string[],
  limit: number,
  timeout: number,
): Promise<ChannelClaim[]> {
  const recovered = await tx.query<ChannelClaim>(
    `UPDATE notification_deliveries SET status=CASE WHEN outcome='sending' THEN 'failed'::notification_delivery_status ELSE 'dead'::notification_delivery_status END,
    outcome=CASE WHEN outcome='sending' THEN 'uncertain' ELSE outcome END,claimed_by=NULL,claimed_at=NULL,claim_fence=claim_fence+1,revision=revision+1
    WHERE intent_id IS NOT NULL AND status='claimed' AND claimed_at<now()-($1::text||' seconds')::interval AND (outcome='sending' OR attempt_count-retry_budget_start>=8)
    RETURNING id,workspace_id AS "workspaceId",recipient_actor_id AS "recipientActorId",channel_target_id AS "channelTargetId"`,
    [timeout],
  )
  for (const row of recovered.rows)
    await appendChannelEvent(
      tx,
      {
        workspaceId: row.workspaceId,
        actorId: row.recipientActorId,
        correlationId: `channel-recovery:${row.id}`,
      },
      row.channelTargetId,
      'notification.delivery.recovered',
      { deliveryId: row.id },
    )
  return (
    await tx.query<ChannelClaim>(
      `WITH candidates AS (
    SELECT delivery.id FROM notification_deliveries delivery JOIN notification_channel_targets target ON target.id=delivery.channel_target_id
    WHERE delivery.intent_id IS NOT NULL AND delivery.outcome NOT IN ('sending','uncertain') AND target.provider=ANY($4::text[]) AND delivery.attempt_count-delivery.retry_budget_start<8
      AND ((delivery.status IN ('pending','failed') AND delivery.available_at<=now()) OR (delivery.status='claimed' AND delivery.claimed_at<now()-($2::text||' seconds')::interval))
    ORDER BY delivery.available_at,delivery.id FOR UPDATE OF delivery SKIP LOCKED LIMIT $1
  ) UPDATE notification_deliveries delivery SET status='claimed',claimed_at=now(),claimed_by=$3,claim_fence=claim_fence+1,attempt_count=attempt_count+1,revision=revision+1
    FROM candidates WHERE delivery.id=candidates.id RETURNING delivery.id,delivery.workspace_id AS "workspaceId",delivery.recipient_actor_id AS "recipientActorId",
    delivery.channel_target_id AS "channelTargetId",delivery.intent_id AS "intentId",delivery.claim_fence AS "claimFence",delivery.effect_key AS "effectKey",delivery.attempt_count AS "attemptCount", delivery.claimed_at+($2::text||' seconds')::interval AS "leaseExpiresAt"`,
      [limit, timeout, workerId, providers],
    )
  ).rows
}

export async function prepareChannelSend(
  tx: PoolClient,
  claim: ChannelClaim,
  workerId: string,
): Promise<{
  provider: string
  secretMaterial: string
  content: ChannelContent
} | null> {
  const row = (
    await tx.query<{
      target_revision: number
      effect_key: string
      outcome: string
      request_hash: string | null
      source_type: string
      source_id: string
      source_revision: number
    }>(
      `SELECT delivery.target_revision,delivery.effect_key,delivery.outcome,delivery.request_hash,intent.source_type,intent.source_id,intent.source_revision
      FROM notification_deliveries delivery JOIN notification_intents intent ON intent.id=delivery.intent_id
      WHERE delivery.id=$1 AND delivery.status='claimed' AND delivery.claimed_by=$2 AND delivery.claim_fence=$3
        AND $4::timestamptz>now() AND delivery.workspace_id=$5 AND delivery.intent_id=$6 AND delivery.channel_target_id=$7 AND delivery.recipient_actor_id=$8 FOR UPDATE OF delivery`,
      [
        claim.id,
        workerId,
        claim.claimFence,
        claim.leaseExpiresAt,
        claim.workspaceId,
        claim.intentId,
        claim.channelTargetId,
        claim.recipientActorId,
      ],
    )
  ).rows[0]
  if (!row || row.outcome === 'sending' || row.outcome === 'uncertain')
    throw new DomainError(
      'NOTIFICATION_CLAIM_LOST',
      'Notification claim is no longer valid',
    )
  if (row.effect_key !== claim.effectKey)
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'Delivery job content changed',
    )
  const target = (
    await tx.query<ChannelTarget>(
      `SELECT * FROM notification_channel_targets WHERE workspace_id=$1 AND id=$2 AND owner_actor_id=$3 FOR SHARE`,
      [claim.workspaceId, claim.channelTargetId, claim.recipientActorId],
    )
  ).rows[0]
  const source = await sourceFor(
    tx,
    claim.workspaceId,
    row.source_type,
    row.source_id,
  )
  const preference = (
    await tx.query<{
      minimum_priority: NotificationPriority
      muted_kinds: string[]
    }>(
      `SELECT minimum_priority,muted_kinds FROM notification_preferences WHERE workspace_id=$1 AND actor_id=$2`,
      [claim.workspaceId, claim.recipientActorId],
    )
  ).rows[0]
  const allowed =
    source &&
    source.status === 'open' &&
    target?.enabled &&
    target.status === 'active' &&
    target.revision === row.target_revision &&
    (await authorizedRecipient(
      tx,
      claim.workspaceId,
      claim.recipientActorId,
      source,
    )) &&
    shouldDeliverNotification({
      priority: sourcePriority(source.kind),
      minimumPriority: preference?.minimum_priority ?? 'update',
      kind: source.kind,
      mutedKinds: preference?.muted_kinds ?? [],
    })
  if (!allowed) {
    await tx.query(
      `UPDATE notification_deliveries SET status='suppressed',claimed_at=NULL,claimed_by=NULL,revision=revision+1 WHERE id=$1 AND claimed_by=$2 AND claim_fence=$3`,
      [claim.id, workerId, claim.claimFence],
    )
    await appendChannelEvent(
      tx,
      {
        workspaceId: claim.workspaceId,
        actorId: claim.recipientActorId,
        correlationId: `channel-suppressed:${claim.id}`,
      },
      claim.channelTargetId,
      'notification.delivery.suppressed',
      { deliveryId: claim.id },
    )
    return null
  }
  const content: ChannelContent = {
    effectKey: claim.effectKey,
    title: 'WorkMesh 有待处理事项',
    body: '请登录 WorkMesh 查看并处理。',
    url: `/?view=inbox&attentionSelected=${encodeURIComponent(`v1:${row.source_type}:${row.source_id}`)}`,
    sourceRevision: row.source_revision,
  }
  const requestHash = digest(content)
  if (row.request_hash && row.request_hash !== requestHash)
    throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Delivery content changed')
  const secret = (
    await tx.query<{ secret: string }>(
      `SELECT pgp_sym_decrypt(secret_ciphertext,$2) AS secret FROM notification_channel_targets WHERE id=$1`,
      [claim.channelTargetId, storageKey()],
    )
  ).rows[0]!.secret
  await tx.query(
    `UPDATE notification_deliveries SET outcome='sending',send_started_at=now(),request_hash=$4,revision=revision+1 WHERE id=$1 AND claimed_by=$2 AND claim_fence=$3`,
    [claim.id, workerId, claim.claimFence, requestHash],
  )
  await appendChannelEvent(
    tx,
    {
      workspaceId: claim.workspaceId,
      actorId: claim.recipientActorId,
      correlationId: `channel-send:${claim.id}:${claim.claimFence}`,
    },
    claim.channelTargetId,
    'notification.delivery.started',
    { deliveryId: claim.id, effectKey: claim.effectKey },
  )
  return { provider: target!.provider, secretMaterial: secret, content }
}

export async function settleChannelSend(
  tx: PoolClient,
  claim: ChannelClaim,
  workerId: string,
  result: 'delivered' | 'failed' | 'unknown',
  receipt?: string,
): Promise<void> {
  const checkpoint = {
    result,
    ...(receipt ? { receiptHash: digest(receipt) } : {}),
  }
  const previous = (
    await tx.query<{
      status: string
      claim_fence: number
      checkpoint: unknown
      attempt_count: number
      retry_budget_start: number
    }>(
      `SELECT status,claim_fence,checkpoint,attempt_count,retry_budget_start FROM notification_deliveries WHERE id=$1 AND workspace_id=$2 AND intent_id=$3 AND channel_target_id=$4 FOR UPDATE`,
      [claim.id, claim.workspaceId, claim.intentId, claim.channelTargetId],
    )
  ).rows[0]
  if (
    previous &&
    previous.status !== 'claimed' &&
    previous.checkpoint &&
    previous.claim_fence === claim.claimFence
  ) {
    if (digest(previous.checkpoint) !== digest(checkpoint))
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'Acknowledgement content changed',
      )
    return
  }
  const updated = await tx.query(
    `UPDATE notification_deliveries SET status=CASE WHEN $4='delivered' THEN 'delivered'::notification_delivery_status
      WHEN $4='failed' AND attempt_count-retry_budget_start>=8 THEN 'dead'::notification_delivery_status ELSE 'failed'::notification_delivery_status END,
    outcome=CASE WHEN $4='unknown' THEN 'uncertain' ELSE $4 END,checkpoint=$5,
    available_at=now()+($11::text||' seconds')::interval,
    delivered_at=CASE WHEN $4='delivered' THEN now() ELSE NULL END,effect_completed_at=CASE WHEN $4='delivered' THEN now() ELSE NULL END,
    claimed_at=NULL,claimed_by=NULL,revision=revision+1,last_error=CASE WHEN $4='delivered' THEN NULL WHEN $4='unknown' THEN 'CHANNEL_RESULT_UNKNOWN' ELSE 'CHANNEL_SEND_FAILED' END
    WHERE id=$1 AND workspace_id=$6 AND intent_id=$7 AND channel_target_id=$8 AND recipient_actor_id=$9
      AND status='claimed' AND claimed_by=$2 AND claim_fence=$3 AND outcome='sending' AND $10::timestamptz>now()`,
    [
      claim.id,
      workerId,
      claim.claimFence,
      result,
      checkpoint,
      claim.workspaceId,
      claim.intentId,
      claim.channelTargetId,
      claim.recipientActorId,
      claim.leaseExpiresAt,
      automationRetry(
        (previous?.attempt_count ?? 0) - (previous?.retry_budget_start ?? 0),
        8,
      ).delaySeconds,
    ],
  )
  if (updated.rowCount !== 1)
    throw new DomainError(
      'NOTIFICATION_CLAIM_LOST',
      'Notification claim is no longer valid',
    )
  await appendChannelEvent(
    tx,
    {
      workspaceId: claim.workspaceId,
      actorId: claim.recipientActorId,
      correlationId: `channel-ack:${claim.id}:${claim.claimFence}`,
    },
    claim.channelTargetId,
    'notification.delivery.settled',
    { deliveryId: claim.id, result },
  )
}

export async function reconcileChannelSend(
  tx: PoolClient,
  meta: ChannelCommandMeta,
  deliveryId: string,
  revision: number,
  outcome: 'delivered' | 'retry' | 'dead',
) {
  await authorizeChannelOwner(tx, meta)
  const row = (
    await tx.query<{
      channel_target_id: string
      revision: number
      outcome: string
    }>(
      `SELECT channel_target_id,revision,outcome FROM notification_deliveries WHERE workspace_id=$1 AND id=$2 AND recipient_actor_id=$3 FOR UPDATE`,
      [meta.workspaceId, deliveryId, meta.actorId],
    )
  ).rows[0]
  if (!row) throw new DomainError('NOT_FOUND', 'Delivery was not found')
  assertRevision(revision, row.revision)
  if (row.outcome !== 'uncertain')
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      'Only uncertain deliveries can be reconciled',
    )
  await tx.query(
    `UPDATE notification_deliveries SET status=$4::notification_delivery_status,outcome=$5,available_at=now(),revision=revision+1,claim_fence=claim_fence+1,
    retry_budget_start=CASE WHEN $4='pending' THEN attempt_count ELSE retry_budget_start END,send_started_at=NULL,
    delivered_at=CASE WHEN $4='delivered' THEN now() ELSE NULL END,effect_completed_at=CASE WHEN $4='delivered' THEN now() ELSE NULL END
    WHERE workspace_id=$1 AND id=$2 AND recipient_actor_id=$3`,
    [
      meta.workspaceId,
      deliveryId,
      meta.actorId,
      outcome === 'retry' ? 'pending' : outcome,
      outcome === 'retry'
        ? 'not_sent'
        : outcome === 'dead'
          ? 'failed'
          : 'delivered',
    ],
  )
  await appendChannelEvent(
    tx,
    meta,
    row.channel_target_id,
    'notification.delivery.reconciled',
    { deliveryId, outcome },
  )
}
