import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { type GuidancePin, type GuidanceResponse, type GuidanceScope } from '@workmesh/contracts';
import type { RequestMeta } from './agent/types.js';
type Queryable = Pick<Pool | PoolClient, 'query'>;
type GuidanceHelpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
};
export declare const guidancePrecedence: readonly ["workspace", "team", "project", "repository", "work_item", "session_human_prompt"];
export declare function readGuidance(db: Queryable, workspaceId: string, scope: GuidanceScope, id: string): Promise<GuidanceResponse>;
export declare function resolveGuidancePins(db: Queryable, input: {
    workspaceId: string;
    teamId: string;
    projectId?: string | null;
}): Promise<GuidancePin[]>;
export declare function materializeSessionContextSnapshot(tx: PoolClient, input: {
    workspaceId: string;
    teamId: string;
    projectId?: string | null;
    workItemId?: string | null;
    workItem: Record<string, unknown> | null;
    actorId: string;
}): Promise<{
    id: string;
    guidancePins: GuidancePin[];
}>;
export declare function guidancePinsFromSnapshot(db: Queryable, workspaceId: string, snapshotId: string | null): Promise<GuidancePin[]>;
export declare function registerGuidanceRoutes(app: FastifyInstance, h: GuidanceHelpers): void;
export {};
