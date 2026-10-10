import { collaborationQueueCountsSchema } from '@workmesh/contracts';
import { humanAttentionAuthorizationPredicate } from '../human-attention/routes.js';
import { humanAttentionProjectionSql } from '../human-attention/projection.js';
import { liveHumanTeamReadPredicate } from '../live-read-authorization.js';
const actor = (request) => request.actor;
/**
 * Counts for the collaboration queue tabs.
 *
 * Every count reuses the authorization predicate of the list it summarises. A
 * count is a disclosure surface: if it were computed more permissively than the
 * list, the tab row would report items the reader cannot open - a number is
 * enough to learn that something exists. So each query below is the list's own
 * predicate with `count(*)` substituted for the projection, and the
 * integration test asserts the two agree.
 *
 * The counts describe the default view of each queue: open attention, open
 * inbox items, and unread notifications. A queue with no count is omitted
 * rather than reported as zero - the reader cannot tell "none" from "not
 * counted" unless the server says which.
 */
export function registerCollaborationQueueCountRoutes(app, h) {
    app.get('/api/v1/collaboration/queue-counts', async (request) => {
        const current = actor(request);
        if (current.kind !== 'human')
            throw new Error('Human account required');
        // needs-you: the active view of the attention projection. The projection is
        // a union over decisions, inbox items, Sessions and completion suggestions
        // rather than a table of its own, so the count runs over the same SQL the
        // list does rather than re-deriving what an attention item is.
        const attentionValues = [current.workspaceId];
        const attention = await h.db.query(`WITH counted AS (
         ${humanAttentionProjectionSql}
         AND ${humanAttentionAuthorizationPredicate(current, attentionValues)}
         AND (attention.status IN ('open','seen','applying','failed')
              OR (attention.source_type='approval' AND attention.status='expired'))
       ) SELECT count(*)::int AS count FROM counted`, attentionValues);
        // messages: open inbox items addressed to this Human.
        const messageValues = [current.workspaceId, current.id, 'open'];
        const messages = await h.db.query(`SELECT count(*)::int AS count
         FROM inbox_items i
        WHERE i.workspace_id=$1
          AND i.recipient_human_actor_id=$2
          AND i.status=$3
          AND ${liveHumanTeamReadPredicate(current, 'i.workspace_id', 'i.team_id', messageValues)}`, messageValues);
        // agent-delivery: open inbox items no Human is addressed to, so a Human can
        // observe that an Agent owes them a delivery without being its recipient.
        const deliveryValues = [current.workspaceId, 'open'];
        const agentDelivery = await h.db.query(`SELECT count(*)::int AS count
         FROM inbox_items i
        WHERE i.workspace_id=$1
          AND i.recipient_human_actor_id IS NULL
          AND i.status=$2
          AND ${liveHumanTeamReadPredicate(current, 'i.workspace_id', 'i.team_id', deliveryValues)}`, deliveryValues);
        // updates: the recipient's unread notifications. Notifications are addressed
        // to an actor rather than a team, so the list's own scope is the recipient.
        const updates = await h.db.query(`SELECT count(*)::int AS count
         FROM notifications notification
        WHERE notification.workspace_id=$1
          AND notification.recipient_actor_id=$2
          AND notification.read_at IS NULL`, [current.workspaceId, current.id]);
        const count = (result) => result.rows[0]?.count ?? 0;
        return collaborationQueueCountsSchema.parse({
            queues: {
                'agent-delivery': count(agentDelivery),
                messages: count(messages),
                'needs-you': count(attention),
                updates: count(updates),
            },
        });
    });
}
