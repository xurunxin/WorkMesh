import type { Pool } from 'pg';
import { type EventEnvelope } from '@workmesh/contracts';
import type { ApiActor } from '../agent/types.js';
type EventRow = Record<string, unknown> & {
    cursor: string;
    workspace_id: string;
    team_id: string | null;
    audience_actor_id: string | null;
    occurred_at: Date | string;
    scopes: EventEnvelope['scopes'];
    invalidates: EventEnvelope['invalidates'];
};
export type CursorExpiredDetails = Readonly<{
    minimumCursor: string;
    resyncCursor: string;
    resyncRequired: true;
}>;
export declare const eventAudienceVisibility: (row: Pick<EventRow, "audience_actor_id" | "team_id" | "scopes">) => EventEnvelope["audience"]["visibility"];
export type EventReader = Readonly<{
    retentionFloor: (workspaceId: string) => Promise<string>;
    assertAvailable: (workspaceId: string, cursor: string) => Promise<string>;
    list: (actor: ApiActor, cursor: string, limit?: number) => Promise<EventEnvelope[]>;
}>;
export declare function createEventReader(db: Pool): EventReader;
export {};
