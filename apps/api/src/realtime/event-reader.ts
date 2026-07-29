import type { Pool } from 'pg'
import { DomainError } from '@workmesh/domain'
import {
  eventEnvelopeSchema,
  type EventEnvelope,
} from '@workmesh/contracts'
import type { ApiActor } from '../agent/types.js'
import {
  assertEventAudienceActive,
  eventAudienceQuery,
} from '../authz/event-audience.js'
import { compareDurableCursors, parseDurableCursor } from './cursor.js'

type EventRow = Record<string, unknown> & {
  cursor: string
  workspace_id: string
  team_id: string | null
  audience_actor_id: string | null
  occurred_at: Date | string
  scopes: EventEnvelope['scopes']
  invalidates: EventEnvelope['invalidates']
}

export type CursorExpiredDetails = Readonly<{
  minimumCursor: string
  resyncCursor: string
  resyncRequired: true
}>

const cursorExpired = (floor: string): DomainError =>
  new DomainError(
    'CURSOR_EXPIRED',
    'The requested event cursor is older than the retained event history',
    {
      minimumCursor: floor,
      resyncCursor: floor,
      resyncRequired: true,
    } satisfies CursorExpiredDetails,
  )

export const eventAudienceVisibility = (
  row: Pick<EventRow, 'audience_actor_id' | 'team_id' | 'scopes'>,
): EventEnvelope['audience']['visibility'] =>
  row.audience_actor_id
    ? 'actor'
    : row.team_id
      ? 'team'
      : row.scopes.some(resource => resource.type !== 'workspace')
        ? 'resource'
        : 'workspace'

const eventResponse = (row: EventRow): EventEnvelope =>
  eventEnvelopeSchema.parse({
    ...row,
    cursor: parseDurableCursor(row.cursor),
    audience: {
      visibility: eventAudienceVisibility(row),
      workspaceId: row.workspace_id,
      teamId: row.team_id,
      actorId: row.audience_actor_id,
    },
    scopes: row.scopes,
    invalidates: row.invalidates,
    sequence:
      row.sequence === null || row.sequence === undefined
        ? row.sequence
        : Number(row.sequence),
    sessionSequence:
      row.sessionSequence === null || row.sessionSequence === undefined
        ? row.sessionSequence
        : Number(row.sessionSequence),
    occurred_at:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
  })

export type EventReader = Readonly<{
  retentionFloor: (workspaceId: string) => Promise<string>
  assertAvailable: (workspaceId: string, cursor: string) => Promise<string>
  list: (
    actor: ApiActor,
    cursor: string,
    limit?: number,
  ) => Promise<EventEnvelope[]>
}>

export function createEventReader(db: Pool): EventReader {
  const retentionFloor = async (workspaceId: string): Promise<string> => {
    const current = await db.query<{ pruned_through_cursor: string }>(
      `SELECT pruned_through_cursor::text
       FROM event_retention_state
       WHERE workspace_id=$1`,
      [workspaceId],
    )
    if (current.rows[0])
      return parseDurableCursor(current.rows[0].pruned_through_cursor)

    await db.query(
      `INSERT INTO event_retention_state(workspace_id)
       VALUES($1)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [workspaceId],
    )
    const inserted = await db.query<{ pruned_through_cursor: string }>(
      `SELECT pruned_through_cursor::text
       FROM event_retention_state
       WHERE workspace_id=$1`,
      [workspaceId],
    )
    if (!inserted.rows[0])
      throw new Error('EVENT_RETENTION_STATE_NOT_FOUND')
    return parseDurableCursor(inserted.rows[0].pruned_through_cursor)
  }

  const assertAvailable = async (
    workspaceId: string,
    cursor: string,
  ): Promise<string> => {
    const floor = await retentionFloor(workspaceId)
    if (compareDurableCursors(cursor, floor) < 0) throw cursorExpired(floor)
    return floor
  }

  const list = async (
    actor: ApiActor,
    cursor: string,
    limit = 100,
  ): Promise<EventEnvelope[]> => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new DomainError(
        'VALIDATION_ERROR',
        'Event batch limit must be between 1 and 500',
      )
    await assertEventAudienceActive(db, actor)
    await assertAvailable(actor.workspaceId, cursor)
    const query = eventAudienceQuery(actor, cursor)
    const rows = await db.query<EventRow>(
      `${query.sql} ORDER BY e.cursor LIMIT $${query.values.length + 1}`,
      [...query.values, limit],
    )
    return rows.rows.map(eventResponse)
  }

  return { retentionFloor, assertAvailable, list }
}
