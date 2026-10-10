import type { Pool } from 'pg';
import type { ApiActor } from '../agent/types.js';
export type EventAudienceQuery = Readonly<{
    sql: string;
    values: readonly unknown[];
}>;
/**
 * One SQL audience policy is shared by REST pagination and SSE. In particular,
 * Agent visibility never falls back to Workspace or same-Team membership:
 * every returned row is an explicit recipient, is tied to the current/allowed
 * child Session, or proves aggregate intersection with the live Delegation.
 */
export declare function eventAudienceQuery(actor: ApiActor, cursor: string): EventAudienceQuery;
export declare function assertEventAudienceActive(db: Pool, actor: ApiActor): Promise<void>;
