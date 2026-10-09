import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import {
  notificationChannelTargetCreateSchema,
  notificationChannelTargetUpdateSchema,
  notificationChannelTargetSchema,
  channelNotificationReconcileSchema,
  channelNotificationDeliverySchema,
} from '@workmesh/contracts'
import {
  createChannelTarget,
  updateChannelTarget,
  authorizeChannelOwner,
  channelSecretFingerprint,
  reconcileChannelSend,
  type ChannelTarget,
  type ChannelCommandMeta,
} from '@workmesh/db'
import { DomainError, etag, parseRevision } from '@workmesh/domain'
import { mutate, type CommandContext } from './commands.js'
import type { Paginator } from './pagination.js'
import type { ApiActor } from './agent/types.js'

const root = '/api/v1/notification-channel-targets'
const deliveryRoot = '/api/v1/channel-notification-deliveries'
const targetResponse = (row: ChannelTarget) =>
  notificationChannelTargetSchema.parse({
    id: row.id,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled,
    status: row.status,
    revision: row.revision,
    secret_ref: row.id,
    secret_status: row.status === 'active' ? 'configured' : 'missing',
    endpoint_fingerprint: row.endpoint_fingerprint,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  })

export function registerNotificationChannelRoutes(
  app: FastifyInstance,
  h: {
    db: Pool
    configuredProviders?: 'wecom'[]
    paginator: Paginator
    meta: (
      request: FastifyRequest,
      body: unknown,
      params?: Record<string, unknown>,
    ) => CommandContext
    header: (request: FastifyRequest, name: string) => string | undefined
  },
): void {
  const human = (request: FastifyRequest) => {
    const actor = request.actor as ApiActor
    if (actor.kind !== 'human')
      throw new DomainError('FORBIDDEN', 'Human account required')
    return actor
  }
  const meta = (request: FastifyRequest): ChannelCommandMeta => {
    const actor = human(request)
    return {
      workspaceId: actor.workspaceId,
      actorId: actor.id,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
    }
  }
  const requireLiveHuman = async (tx: PoolClient, request: FastifyRequest) => {
    const actor = human(request)
    const live = await tx.query(
      `SELECT 1 FROM actors owner JOIN sessions credential ON credential.actor_id=owner.id
      WHERE owner.workspace_id=$1 AND owner.id=$2 AND owner.is_active AND owner.kind='human'
        AND credential.id=$3 AND credential.token_hash=$4 AND credential.expires_at>now() AND credential.revoked_at IS NULL
      FOR SHARE OF owner,credential`,
      [actor.workspaceId, actor.id, actor.humanSessionId, actor.credentialHash],
    )
    if (!live.rowCount)
      throw new DomainError('FORBIDDEN', 'Current Human credential required')
  }
  const liveRead = (
    actor: ApiActor,
    workspaceSql: string,
    values: unknown[],
  ) => {
    values.push(actor.humanSessionId, actor.credentialHash, actor.id)
    return `EXISTS(SELECT 1 FROM sessions credential JOIN actors live_owner ON live_owner.id=credential.actor_id
      WHERE credential.id=$${values.length - 2} AND credential.token_hash=$${values.length - 1} AND credential.actor_id=$${values.length}
        AND credential.revoked_at IS NULL AND credential.expires_at>now() AND live_owner.is_active AND live_owner.kind='human'
        AND live_owner.workspace_id=${workspaceSql})`
  }
  const id = (request: FastifyRequest) =>
    z
      .string()
      .uuid()
      .parse((request.params as { id: unknown }).id)
  app.get(root + '/config', async (request) => {
    human(request)
    return {
      redis_required: true,
      no_redis_supported: false,
      configured_providers: h.configuredProviders ?? [],
    }
  })
  app.get(root, async (request) => {
    const actor = human(request)
    const values: unknown[] = [actor.workspaceId, actor.id]
    const live = liveRead(actor, 'target.workspace_id', values)
    const page = await h.paginator.query<ChannelTarget>(
      h.db,
      request,
      request.query,
      {
        route: root,
        filters: {},
        sort: [
          { key: 'created_at', sql: 'target.created_at', direction: 'DESC' },
          { key: 'id', sql: 'target.id', direction: 'DESC' },
        ],
      },
      `SELECT target.* FROM notification_channel_targets target
      JOIN actors owner ON owner.id=target.owner_actor_id AND owner.workspace_id=target.workspace_id AND owner.is_active AND owner.kind='human'
      WHERE target.workspace_id=$1 AND target.owner_actor_id=$2 AND ${live}`,
      values,
    )
    return { ...page, items: page.items.map(targetResponse) }
  })
  app.post(root, async (request, reply) => {
    const body = notificationChannelTargetCreateSchema.parse(request.body)
    const m = meta(request)
    const context = h.meta(request, {
      ...body,
      secretMaterial: channelSecretFingerprint(body.secretMaterial),
    })
    const response = await mutate(
      h.db,
      context,
      async (tx) => targetResponse(await createChannelTarget(tx, m, body)),
      {
        beforeReserve: (tx) => requireLiveHuman(tx, request),
        authorizeReplay: (tx) => authorizeChannelOwner(tx, m),
      },
    )
    return reply
      .code(201)
      .header('ETag', etag(response.revision))
      .send(response)
  })
  app.patch(root + '/:id', async (request, reply) => {
    const targetId = id(request),
      body = notificationChannelTargetUpdateSchema.parse(request.body),
      m = meta(request)
    const revision = parseRevision(h.header(request, 'if-match'))
    const context = h.meta(
      request,
      {
        ...body,
        secretMaterial:
          body.secretMaterial === undefined
            ? undefined
            : channelSecretFingerprint(body.secretMaterial),
        revision,
      },
      { id: targetId },
    )
    const response = await mutate(
      h.db,
      context,
      async (tx) =>
        targetResponse(
          await updateChannelTarget(tx, m, targetId, revision, body),
        ),
      {
        beforeReserve: (tx) => requireLiveHuman(tx, request),
        authorizeReplay: (tx) => authorizeChannelOwner(tx, m, targetId),
      },
    )
    return reply.header('ETag', etag(response.revision)).send(response)
  })
  app.delete(root + '/:id', async (request, reply) => {
    const targetId = id(request),
      m = meta(request),
      revision = parseRevision(h.header(request, 'if-match'))
    const response = await mutate(
      h.db,
      h.meta(request, { revision }, { id: targetId }),
      async (tx) =>
        targetResponse(
          await updateChannelTarget(tx, m, targetId, revision, {}, true),
        ),
      {
        beforeReserve: (tx) => requireLiveHuman(tx, request),
        authorizeReplay: (tx) => authorizeChannelOwner(tx, m, targetId),
      },
    )
    return reply.header('ETag', etag(response.revision)).send(response)
  })
  app.get(deliveryRoot, async (request) => {
    const current = human(request)
    const values: unknown[] = [current.workspaceId, current.id]
    const live = liveRead(current, 'delivery.workspace_id', values)
    const page = await h.paginator.query<
      Record<string, unknown> & {
        available_at: Date
        delivered_at: Date | null
      }
    >(
      h.db,
      request,
      request.query,
      {
        route: deliveryRoot,
        filters: {},
        sort: [
          { key: 'created_at', sql: 'delivery.created_at', direction: 'DESC' },
          { key: 'id', sql: 'delivery.id', direction: 'DESC' },
        ],
      },
      `SELECT delivery.id,delivery.intent_id,delivery.channel_target_id,delivery.status,delivery.outcome,
      delivery.effect_key,delivery.attempt_count,delivery.revision,intent.source_type,intent.source_id,intent.source_revision,
      delivery.created_at,delivery.available_at,delivery.delivered_at,(delivery.last_error IS NOT NULL) AS last_error_present
      FROM notification_deliveries delivery JOIN notification_intents intent ON intent.id=delivery.intent_id
      WHERE delivery.workspace_id=$1 AND delivery.recipient_actor_id=$2 AND ${live}`,
      values,
    )
    return {
      ...page,
      items: page.items.map(({ created_at: _createdAt, ...row }) =>
        channelNotificationDeliverySchema.parse({
          ...row,
          available_at: row.available_at.toISOString(),
          delivered_at: row.delivered_at?.toISOString() ?? null,
        }),
      ),
    }
  })
  app.post(deliveryRoot + '/:id/reconcile', async (request) => {
    const deliveryId = id(request),
      m = meta(request),
      body = channelNotificationReconcileSchema.parse(request.body)
    const revision = parseRevision(h.header(request, 'if-match'))
    return mutate(
      h.db,
      h.meta(request, { ...body, revision }, { id: deliveryId }),
      async (tx) => {
        await reconcileChannelSend(tx, m, deliveryId, revision, body.outcome)
        return { id: deliveryId }
      },
      {
        beforeReserve: (tx) => requireLiveHuman(tx, request),
        authorizeReplay: async (tx) => {
          await authorizeChannelOwner(tx, m)
          if (
            !(
              await tx.query(
                `SELECT 1 FROM notification_deliveries WHERE workspace_id=$1 AND id=$2 AND recipient_actor_id=$3`,
                [m.workspaceId, deliveryId, m.actorId],
              )
            ).rowCount
          )
            throw new DomainError('NOT_FOUND', 'Delivery was not found')
        },
      },
    )
  })
}
