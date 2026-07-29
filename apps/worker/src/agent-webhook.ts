import { createCipheriv, createDecipheriv, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { withTx, type Db } from '@workmesh/db'

const WEBHOOK_MAX_ATTEMPTS = 6
const WEBHOOK_LOCK_TIMEOUT_SECONDS = 60

export type AgentWebhookDelivery = {
  id: string
  agentId: string
  endpointId: string
  secretVersion: number
  deliveryId: string
  eventId: string | null
  eventType: string
  sessionId: string | null
  payload: unknown
  endpointUrl: string
  secretCiphertext: Buffer | string
  secretIv: Buffer | string
  secretAuthTag: Buffer | string
  keyVersion: string
  attemptCount: number
}

type DeliveryRow = AgentWebhookDelivery

export type WebhookResponse = { status: number }
export type ResolvedWebhookAddress = { address: string; family: 4 | 6 }
export type WebhookDnsLookup = (hostname: string) => Promise<ResolvedWebhookAddress[]>
export type WebhookFetch = (url: string, init: {
  method: 'POST'
  headers: Record<string, string>
  body: string
  redirect: 'error'
  signal: AbortSignal
  resolvedAddresses: readonly ResolvedWebhookAddress[]
}) => Promise<WebhookResponse>

export type AgentWebhookWorker = {
  claimDeliveries: (limit?: number, lockTimeoutSeconds?: number) => Promise<AgentWebhookDelivery[]>
  deliver: (delivery: AgentWebhookDelivery) => Promise<void>
  fail: (delivery: AgentWebhookDelivery, error: unknown) => Promise<void>
  tick: () => Promise<void>
}

const asBuffer = (value: Buffer | string): Buffer => {
  if (Buffer.isBuffer(value)) return value
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex')
  return Buffer.from(value, 'base64')
}

export const masterKeyFromEnvironment = (value = process.env.WORKMESH_MASTER_KEY): Buffer => {
  if (!value) throw new Error('WORKMESH_MASTER_KEY is required for agent webhook delivery')
  const key = asBuffer(value)
  if (key.length !== 32) throw new Error('WORKMESH_MASTER_KEY must decode to exactly 32 bytes')
  return key
}

export const decryptWebhookSecret = (input: { ciphertext: Buffer | string; iv: Buffer | string; authTag: Buffer | string }, masterKey: Buffer): Buffer => {
  const decipher = createDecipheriv('aes-256-gcm', masterKey, asBuffer(input.iv))
  decipher.setAuthTag(asBuffer(input.authTag))
  return Buffer.concat([decipher.update(asBuffer(input.ciphertext)), decipher.final()])
}

export const signWebhook = (secret: Buffer, timestampSeconds: number, rawBody: string): string => `v1=${createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')}`

export const signaturesMatch = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

/** Recommended retry schedule (seconds) with a bounded symmetric jitter. */
export const retryDelaySeconds = (attemptCount: number, random: () => number = Math.random): number => {
  const schedule = [0, 30, 120, 600, 1_800, 7_200]
  const base = schedule[Math.min(Math.max(attemptCount, 1) - 1, schedule.length - 1)] ?? 7_200
  if (base === 0) return 0
  return Math.max(1, Math.round(base * (1 + ((random() * 2 - 1) * 0.1))))
}

const errorCode = (error: unknown): string => {
  if (error instanceof WebhookDeliveryError) return error.code
  return 'NETWORK_ERROR'
}

export class WebhookDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable = true) { super(code) }
}

const unsafeAddresses = new BlockList()
unsafeAddresses.addSubnet('0.0.0.0', 8, 'ipv4')
unsafeAddresses.addSubnet('10.0.0.0', 8, 'ipv4')
unsafeAddresses.addSubnet('100.64.0.0', 10, 'ipv4')
unsafeAddresses.addSubnet('127.0.0.0', 8, 'ipv4')
unsafeAddresses.addSubnet('169.254.0.0', 16, 'ipv4')
unsafeAddresses.addSubnet('172.16.0.0', 12, 'ipv4')
unsafeAddresses.addSubnet('192.0.0.0', 24, 'ipv4')
unsafeAddresses.addSubnet('192.168.0.0', 16, 'ipv4')
unsafeAddresses.addSubnet('198.18.0.0', 15, 'ipv4')
unsafeAddresses.addSubnet('224.0.0.0', 4, 'ipv4')
unsafeAddresses.addSubnet('240.0.0.0', 4, 'ipv4')
unsafeAddresses.addAddress('::', 'ipv6')
unsafeAddresses.addAddress('::1', 'ipv6')
unsafeAddresses.addSubnet('fc00::', 7, 'ipv6')
unsafeAddresses.addSubnet('fe80::', 10, 'ipv6')
unsafeAddresses.addSubnet('ff00::', 8, 'ipv6')

const ipv4FromMappedIpv6 = (address: string): string | undefined => {
  const segments = address.toLowerCase().split('::')
  if (segments.length > 2) return undefined
  const left = segments[0] ? segments[0].split(':') : []
  const right = segments.length === 2 && segments[1] ? segments[1].split(':') : []
  const words = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
  if (words.length !== 8 || words.slice(0, 5).some(word => Number.parseInt(word || '0', 16) !== 0) || (words[5] !== 'ffff' && words[5] !== '0')) return undefined
  const high = Number.parseInt(words[6]!, 16)
  const low = Number.parseInt(words[7]!, 16)
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) return undefined
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}

export const isUnsafeWebhookAddress = (address: string): boolean => {
  const family = isIP(address)
  if (family === 4) return unsafeAddresses.check(address, 'ipv4')
  if (family === 6) {
    const mapped = ipv4FromMappedIpv6(address)
    return mapped ? unsafeAddresses.check(mapped, 'ipv4') : unsafeAddresses.check(address, 'ipv6')
  }
  return true
}

export const systemWebhookDnsLookup: WebhookDnsLookup = async hostname => {
  const results = await lookup(hostname, { all: true, verbatim: true })
  return results.flatMap(result => result.family === 4 || result.family === 6
    ? [{ address: result.address, family: result.family }]
    : [])
}

export const resolveWebhookTarget = async (rawUrl: string, {
  dnsLookup = systemWebhookDnsLookup,
  allowPrivateAgentWebhooks = process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS === 'true',
}: {
  dnsLookup?: WebhookDnsLookup
  allowPrivateAgentWebhooks?: boolean
} = {}): Promise<{ url: URL; addresses: ResolvedWebhookAddress[] }> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new WebhookDeliveryError('UNSAFE_WEBHOOK_TARGET', false)
  }
  const authority = /^[a-z][a-z\d+.-]*:\/\/([^/?#]*)/i.exec(rawUrl.trim())?.[1]
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || authority?.includes('@') || url.username || url.password || !url.hostname) {
    throw new WebhookDeliveryError('UNSAFE_WEBHOOK_TARGET', false)
  }
  const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']') ? url.hostname.slice(1, -1) : url.hostname
  let addresses: ResolvedWebhookAddress[]
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
  } else {
    const normalizedHostname = hostname.toLowerCase().replace(/\.$/, '')
    if (!allowPrivateAgentWebhooks && (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost'))) {
      throw new WebhookDeliveryError('UNSAFE_WEBHOOK_TARGET', false)
    }
    addresses = await dnsLookup(hostname)
  }
  if (addresses.length === 0 || addresses.some(result => !isIP(result.address))) {
    throw new WebhookDeliveryError('WEBHOOK_DNS_RESOLUTION_FAILED')
  }
  const normalizedAddresses = addresses.map(result => ({
    address: result.address,
    family: isIP(result.address) as 4 | 6,
  }))
  if (!allowPrivateAgentWebhooks && normalizedAddresses.some(result => isUnsafeWebhookAddress(result.address))) {
    throw new WebhookDeliveryError('UNSAFE_WEBHOOK_TARGET', false)
  }
  return { url, addresses: normalizedAddresses }
}

/**
 * The connection uses an address from the just-validated DNS answer rather
 * than resolving the hostname again, closing the validation/request race.
 */
export const fetchResolvedWebhook: WebhookFetch = async (url, init) => new Promise((resolve, reject) => {
  const target = new URL(url)
  const selected = init.resolvedAddresses[0]
  if (!selected) {
    reject(new WebhookDeliveryError('WEBHOOK_DNS_RESOLUTION_FAILED'))
    return
  }
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) {
      callback(null, init.resolvedAddresses.map(result => ({ address: result.address, family: result.family })))
      return
    }
    callback(null, selected.address, selected.family)
  }
  const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)(target, {
    method: init.method,
    headers: init.headers,
    signal: init.signal,
    lookup: pinnedLookup,
    ...(target.protocol === 'https:' ? { servername: target.hostname } : {}),
  }, response => {
    let bytes = 0
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 64 * 1024) request.destroy(new WebhookDeliveryError('WEBHOOK_RESPONSE_TOO_LARGE', false))
    })
    response.once('end', () => resolve({ status: response.statusCode ?? 0 }))
  })
  request.once('error', reject)
  request.end(init.body)
})

export function createAgentWebhookWorker({
  db,
  workerId = `agent-webhook-${randomUUID()}`,
  masterKey = masterKeyFromEnvironment(),
  fetcher = fetchResolvedWebhook,
  maxAttempts = WEBHOOK_MAX_ATTEMPTS,
  random = Math.random,
  dnsLookup = systemWebhookDnsLookup,
  allowPrivateAgentWebhooks = process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS === 'true',
}: {
  db: Db
  workerId?: string
  masterKey?: Buffer
  fetcher?: WebhookFetch
  maxAttempts?: number
  random?: () => number
  dnsLookup?: WebhookDnsLookup
  allowPrivateAgentWebhooks?: boolean
}): AgentWebhookWorker {
  const assertRoomMessageTargetAuthorized = async (
    delivery: AgentWebhookDelivery,
  ): Promise<void> => {
    if (delivery.eventType !== 'room.message.posted') return
    const authorized = await db.query(
      `SELECT 1
         FROM agent_webhook_deliveries delivery
         JOIN domain_events event
           ON event.id=delivery.event_id
          AND event.event_type=delivery.event_type
         JOIN agent_definitions definition
           ON definition.id=delivery.agent_id
          AND definition.is_active
         JOIN actors recipient_actor
           ON recipient_actor.id=definition.actor_id
          AND recipient_actor.workspace_id=definition.workspace_id
          AND recipient_actor.kind='agent'
          AND recipient_actor.is_active
         JOIN agent_webhook_endpoints endpoint
           ON endpoint.id=delivery.endpoint_id
          AND endpoint.agent_id=delivery.agent_id
          AND endpoint.is_active
         JOIN agent_webhook_secrets secret
           ON secret.endpoint_id=delivery.endpoint_id
          AND secret.version=delivery.secret_version
          AND secret.status IN('active','retiring')
          AND (secret.valid_until IS NULL OR secret.valid_until>now())
         JOIN room_messages message
           ON event.aggregate_type='room_message'
          AND message.id=event.aggregate_id
          AND message.workspace_id=event.workspace_id
         JOIN work_room_channels room
           ON room.id=message.channel_id
          AND room.workspace_id=message.workspace_id
         JOIN agent_team_access team_access
           ON team_access.workspace_id=definition.workspace_id
          AND team_access.agent_id=definition.id
          AND team_access.team_id=room.team_id
          AND team_access.revoked_at IS NULL
         JOIN agent_sessions target_session
           ON target_session.workspace_id=definition.workspace_id
          AND target_session.agent_id=definition.id
          AND target_session.agent_actor_id=definition.actor_id
          AND target_session.team_id=room.team_id
          AND (delivery.session_id IS NULL OR target_session.id=delivery.session_id)
         JOIN delegations delegation
           ON delegation.id=target_session.delegation_id
          AND delegation.workspace_id=target_session.workspace_id
          AND delegation.agent_id=target_session.agent_id
          AND delegation.agent_actor_id=target_session.agent_actor_id
          AND delegation.status='active'
         LEFT JOIN work_items scoped_item
           ON scoped_item.id=target_session.work_item_id
          AND scoped_item.workspace_id=target_session.workspace_id
        WHERE delivery.id=$1
          AND delivery.agent_id=$2
          AND delivery.event_id=$3
          AND delivery.endpoint_id=$4
          AND delivery.secret_version=$5
          AND delivery.status='delivering'
          AND delivery.locked_by=$6
          AND event.audience_actor_id=recipient_actor.id
          AND event.session_id IS NOT DISTINCT FROM delivery.session_id
          AND event.team_id=room.team_id
          AND target_session.state IN(
            'acknowledged','planning','executing',
            'awaiting_input','awaiting_approval','blocked'
          )
          AND 'work:read'=ANY(definition.approved_capabilities)
          AND 'work:read'=ANY(team_access.approved_capabilities)
          AND 'work:read'=ANY(delegation.permissions_snapshot)
          AND COALESCE(delegation.capability_scope->'teamIds','[]'::jsonb)
              ? target_session.team_id::text
          AND (
            target_session.work_item_id IS NULL
            OR COALESCE(delegation.capability_scope->'workItemIds','[]'::jsonb)
                ? target_session.work_item_id::text
          )
          AND (
            target_session.work_item_id IS NOT NULL
            OR target_session.project_id IS NULL
            OR COALESCE(delegation.capability_scope->'projectIds','[]'::jsonb)
                ? target_session.project_id::text
          )
          AND (
            (room.subject_kind='work_item'
              AND target_session.work_item_id=room.subject_id)
            OR (
              room.subject_kind='project'
              AND (
                (
                  target_session.work_item_id IS NOT NULL
                  AND scoped_item.project_id=room.subject_id
                )
                OR (
                  target_session.work_item_id IS NULL
                  AND target_session.project_id=room.subject_id
                  AND COALESCE(
                    delegation.capability_scope->'projectIds',
                    '[]'::jsonb
                  ) ? room.subject_id::text
                )
              )
            )
            OR (
              room.subject_kind='session'
              AND EXISTS(
                WITH RECURSIVE lineage(id) AS (
                  SELECT room.subject_id
                  UNION ALL
                  SELECT child.id
                    FROM agent_sessions child
                    JOIN lineage parent ON child.parent_session_id=parent.id
                   WHERE child.workspace_id=room.workspace_id
                )
                SELECT 1 FROM lineage WHERE id=target_session.id
              )
            )
          )
        LIMIT 1`,
      [
        delivery.id,
        delivery.agentId,
        delivery.eventId,
        delivery.endpointId,
        delivery.secretVersion,
        workerId,
      ],
    )
    if (!authorized.rowCount) {
      throw new WebhookDeliveryError('WEBHOOK_TARGET_REVOKED', false)
    }
  }

  const claimDeliveries = async (limit = 25, lockTimeoutSeconds = WEBHOOK_LOCK_TIMEOUT_SECONDS): Promise<AgentWebhookDelivery[]> => withTx(db, async tx => {
    const result = await tx.query<DeliveryRow>(`
      WITH candidates AS (
        SELECT d.id
        FROM agent_webhook_deliveries d
        WHERE d.attempt_count < $3
          AND ((d.status = 'pending' AND d.available_at <= now())
            OR (d.status = 'delivering' AND d.locked_at < now() - ($2::text || ' seconds')::interval))
          AND EXISTS (
            SELECT 1 FROM agent_webhook_endpoints e
            WHERE e.id=d.endpoint_id AND e.agent_id=d.agent_id AND e.is_active=true
          )
          AND EXISTS (
            SELECT 1 FROM agent_webhook_secrets s
            WHERE s.endpoint_id=d.endpoint_id AND s.version=d.secret_version
              AND s.status IN ('active','retiring')
          )
        ORDER BY d.available_at, d.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      )
      UPDATE agent_webhook_deliveries d
      SET status='delivering', locked_at=now(), locked_by=$4, attempt_count=d.attempt_count + 1, updated_at=now()
      FROM candidates, agent_webhook_endpoints e, agent_webhook_secrets s
      WHERE d.id=candidates.id
        AND e.id=d.endpoint_id AND e.agent_id=d.agent_id AND e.is_active=true
        AND s.endpoint_id=d.endpoint_id AND s.version=d.secret_version
        AND s.status IN ('active','retiring')
      RETURNING d.id, d.agent_id AS "agentId", d.endpoint_id AS "endpointId", d.secret_version AS "secretVersion", d.delivery_id AS "deliveryId",
        d.event_id AS "eventId", d.event_type AS "eventType", d.session_id AS "sessionId", d.payload,
        e.url AS "endpointUrl", s.secret_ciphertext AS "secretCiphertext", s.iv AS "secretIv",
        s.auth_tag AS "secretAuthTag", s.key_version AS "keyVersion", d.attempt_count AS "attemptCount"
    `, [limit, lockTimeoutSeconds, maxAttempts, workerId])
    return result.rows
  })

  const deliver = async (delivery: AgentWebhookDelivery): Promise<void> => {
    if (!delivery.eventId) throw new WebhookDeliveryError('MISSING_EVENT_ID', false)
    await assertRoomMessageTargetAuthorized(delivery)
    const resolvedTarget = await resolveWebhookTarget(delivery.endpointUrl, { dnsLookup, allowPrivateAgentWebhooks })
    const rawBody = JSON.stringify({ events: [{ id: delivery.eventId, type: delivery.eventType, version: 1, payload: delivery.payload }] })
    const timestamp = Math.floor(Date.now() / 1_000)
    const secret = decryptWebhookSecret({ ciphertext: delivery.secretCiphertext, iv: delivery.secretIv, authTag: delivery.secretAuthTag }, masterKey)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5_000)
      let response: WebhookResponse
      try {
        response = await fetcher(delivery.endpointUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'workmesh-delivery-id': delivery.deliveryId,
            'workmesh-event-id': delivery.eventId,
            'workmesh-timestamp': String(timestamp),
            'workmesh-signature': signWebhook(secret, timestamp, rawBody),
          },
          body: rawBody,
          redirect: 'error',
          signal: controller.signal,
          resolvedAddresses: resolvedTarget.addresses,
        })
      } finally {
        clearTimeout(timeout)
      }
      if (!((response.status >= 200 && response.status < 300) || response.status === 409)) {
        throw new WebhookDeliveryError(`HTTP_${response.status}`)
      }
    } finally {
      secret.fill(0)
    }
    const result = await db.query(
      "UPDATE agent_webhook_deliveries SET status='delivered', delivered_at=now(), locked_at=NULL, locked_by=NULL, updated_at=now() WHERE id=$1 AND locked_by=$2 AND status='delivering'",
      [delivery.id, workerId],
    )
    if (result.rowCount !== 1) throw new Error('AGENT_WEBHOOK_CLAIM_LOST')
  }

  const fail = async (delivery: AgentWebhookDelivery, error: unknown): Promise<void> => {
    const terminal = (error instanceof WebhookDeliveryError && !error.retryable) || delivery.attemptCount >= maxAttempts
    await db.query(`
      UPDATE agent_webhook_deliveries
      SET status=$2::webhook_delivery_status, available_at=now() + ($3::text || ' seconds')::interval,
          locked_at=NULL, locked_by=NULL, last_error=$4,
          dead_lettered_at=CASE WHEN $2::text='dead' THEN now() ELSE NULL END, updated_at=now()
      WHERE id=$1 AND locked_by=$5 AND status='delivering'
    `, [delivery.id, terminal ? 'dead' : 'pending', retryDelaySeconds(delivery.attemptCount, random), errorCode(error), workerId])
  }

  const tick = async (): Promise<void> => {
    for (const delivery of await claimDeliveries()) {
      try {
        await deliver(delivery)
      } catch (error) {
        await fail(delivery, error)
      }
    }
  }

  return { claimDeliveries, deliver, fail, tick }
}

// Exported only for deterministic crypto fixture tests; production encryption
// remains owned by the registration flow and does not retain plaintext secrets.
export const encryptWebhookSecretForTest = (secret: Buffer, masterKey: Buffer): { ciphertext: string; iv: string; authTag: string } => {
  const iv = Buffer.alloc(12, 7)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
}
