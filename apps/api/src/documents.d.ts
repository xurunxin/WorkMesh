import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { type DocumentPin } from '@workmesh/contracts';
import type { RequestMeta } from './agent/types.js';
type Queryable = Pick<Pool | PoolClient, 'query'>;
type Helpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
    readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>;
};
export declare function resolveDocumentPins(db: Queryable, input: {
    workspaceId: string;
    teamId: string;
    projectId?: string | null;
    workItemId?: string | null;
}): Promise<DocumentPin[]>;
export declare function documentPinsFromSnapshot(db: Queryable, workspaceId: string, snapshotId: string | null): Promise<DocumentPin[]>;
export declare function registerDocumentRoutes(app: FastifyInstance, h: Helpers): void;
export {};
