import { DomainError } from '@workmesh/domain';
import { eventEnvelopeSchema, } from '@workmesh/contracts';
import { assertEventAudienceActive, eventAudienceQuery, } from '../authz/event-audience.js';
import { compareDurableCursors, parseDurableCursor } from './cursor.js';
const cursorExpired = (floor) => new DomainError('CURSOR_EXPIRED', 'The requested event cursor is older than the retained event history', {
    minimumCursor: floor,
    resyncCursor: floor,
    resyncRequired: true,
});
export const eventAudienceVisibility = (row) => row.audience_actor_id
    ? 'actor'
    : row.team_id
        ? 'team'
        : row.scopes.some(resource => resource.type !== 'workspace')
            ? 'resource'
            : 'workspace';
const eventResponse = (row) => eventEnvelopeSchema.parse({
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
    sequence: row.sequence === null || row.sequence === undefined
        ? row.sequence
        : Number(row.sequence),
    sessionSequence: row.sessionSequence === null || row.sessionSequence === undefined
        ? row.sessionSequence
        : Number(row.sessionSequence),
    occurred_at: row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
});
export function createEventReader(db) {
    const retentionFloor = async (workspaceId) => {
        const current = await db.query(`SELECT pruned_through_cursor::text
       FROM event_retention_state
       WHERE workspace_id=$1`, [workspaceId]);
        if (current.rows[0])
            return parseDurableCursor(current.rows[0].pruned_through_cursor);
        await db.query(`INSERT INTO event_retention_state(workspace_id)
       VALUES($1)
       ON CONFLICT (workspace_id) DO NOTHING`, [workspaceId]);
        const inserted = await db.query(`SELECT pruned_through_cursor::text
       FROM event_retention_state
       WHERE workspace_id=$1`, [workspaceId]);
        if (!inserted.rows[0])
            throw new Error('EVENT_RETENTION_STATE_NOT_FOUND');
        return parseDurableCursor(inserted.rows[0].pruned_through_cursor);
    };
    const assertAvailable = async (workspaceId, cursor) => {
        const floor = await retentionFloor(workspaceId);
        if (compareDurableCursors(cursor, floor) < 0)
            throw cursorExpired(floor);
        return floor;
    };
    const list = async (actor, cursor, limit = 100) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500)
            throw new DomainError('VALIDATION_ERROR', 'Event batch limit must be between 1 and 500');
        await assertEventAudienceActive(db, actor);
        await assertAvailable(actor.workspaceId, cursor);
        const query = eventAudienceQuery(actor, cursor);
        const rows = await db.query(`${query.sql} ORDER BY e.cursor LIMIT $${query.values.length + 1}`, [...query.values, limit]);
        return rows.rows.map(eventResponse);
    };
    return { retentionFloor, assertAvailable, list };
}
