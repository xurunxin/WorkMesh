import type { PoolClient, QueryResultRow } from 'pg'
import { resolveEventResources } from './event-resources.js'

export const eventResourceTypes = [
  'workspace',
  'team',
  'project',
  'work_item',
  'session',
  'room',
  'artifact',
  'delivery',
] as const

export type EventResourceType = (typeof eventResourceTypes)[number]
export type EventResource = Readonly<{
  type: EventResourceType
  id: string
}>
export type EventResourceMetadata = Readonly<{
  scopes?: readonly EventResource[]
  invalidates?: readonly EventResource[]
}>

export type AppendEventInput = Readonly<{
  workspaceId: string
  teamId?: string
  audienceActorId?: string
  actorId: string
  correlationId: string
  idempotencyKey?: string
  type: string
  aggregateType: string
  aggregateId: string
  revision?: number
  payload?: Record<string, unknown>
  sessionId?: string
  sessionSequence?: number | string
  causationId?: string
  resources?: EventResourceMetadata
}>

type QueryableTransaction = Pick<PoolClient, 'query'>
type InsertedEvent = QueryResultRow & { id: string }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const eventTypePattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/

const validateResource = (resource: EventResource): void => {
  if (!eventResourceTypes.includes(resource.type))
    throw new Error('DOMAIN_EVENT_RESOURCE_TYPE_INVALID')
  if (!uuidPattern.test(resource.id))
    throw new Error('DOMAIN_EVENT_RESOURCE_ID_INVALID')
}

const validateInput = (input: AppendEventInput): void => {
  for (const id of [
    input.workspaceId,
    input.teamId,
    input.audienceActorId,
    input.actorId,
    input.aggregateId,
    input.sessionId,
    input.causationId,
  ])
    if (id !== undefined && !uuidPattern.test(id))
      throw new Error('DOMAIN_EVENT_METADATA_ID_INVALID')
  for (const resource of [
    ...(input.resources?.scopes ?? []),
    ...(input.resources?.invalidates ?? []),
  ])
    validateResource(resource)
  if (!eventTypePattern.test(input.type))
    throw new Error('DOMAIN_EVENT_TYPE_INVALID')
  if (!/^[a-z][a-z0-9_]*$/.test(input.aggregateType))
    throw new Error('DOMAIN_EVENT_AGGREGATE_TYPE_INVALID')
  if (!input.correlationId || input.correlationId.length > 200)
    throw new Error('DOMAIN_EVENT_CORRELATION_ID_INVALID')
  if (
    input.sessionSequence !== undefined &&
    (!/^[0-9]+$/.test(String(input.sessionSequence)) ||
      BigInt(input.sessionSequence) < 0n)
  )
    throw new Error('DOMAIN_EVENT_SESSION_SEQUENCE_INVALID')
}

/**
 * The only production persistence boundary for durable domain events.
 * Metadata validation, the v2 envelope, normalized resource keys, outbox
 * intent, and retention watermark creation all commit with the caller's
 * projection mutation.
 */
export async function appendEvent(
  tx: QueryableTransaction,
  input: AppendEventInput,
): Promise<string> {
  validateInput(input)
  const resolved = await resolveEventResources(tx, input)
  const resources = resolved.resources
  const event = await tx.query<InsertedEvent>(
    `INSERT INTO domain_events(
       workspace_id,team_id,audience_actor_id,event_type,event_version,
       aggregate_type,aggregate_id,aggregate_revision,actor_id,correlation_id,
       idempotency_key,payload,session_id,session_sequence,causation_id
     ) VALUES($1,$2,$3,$4,2,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      input.workspaceId,
      resolved.teamId ?? null,
      resolved.audienceActorId ?? null,
      input.type,
      input.aggregateType,
      input.aggregateId,
      input.revision ?? null,
      input.actorId,
      input.correlationId,
      input.idempotencyKey ?? null,
      input.payload ?? {},
      input.sessionId ?? null,
      input.sessionSequence ?? null,
      input.causationId ?? null,
    ],
  )
  const eventId = event.rows[0]!.id
  for (const [relation, entries] of [
    ['scope', resources.scopes],
    ['invalidate', resources.invalidates],
  ] as const)
    for (const resource of entries)
      await tx.query(
        `INSERT INTO domain_event_resources(
           domain_event_id,workspace_id,relation,resource_type,resource_id
         ) VALUES($1,$2,$3,$4,$5)`,
        [
          eventId,
          input.workspaceId,
          relation,
          resource.type,
          resource.id,
        ],
      )
  await tx.query(
    `INSERT INTO event_retention_state(workspace_id)
     VALUES($1)
     ON CONFLICT (workspace_id) DO NOTHING`,
    [input.workspaceId],
  )
  await tx.query(
    `INSERT INTO outbox_events(domain_event_id,topic,partition_key)
     VALUES($1,$2,$3)`,
    [eventId, input.type, input.aggregateId],
  )
  return eventId
}
