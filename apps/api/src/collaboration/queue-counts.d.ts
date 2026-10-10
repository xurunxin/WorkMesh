import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
type Helpers = Readonly<{
    db: Pool;
}>;
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
export declare function registerCollaborationQueueCountRoutes(app: FastifyInstance, h: Helpers): void;
export {};
