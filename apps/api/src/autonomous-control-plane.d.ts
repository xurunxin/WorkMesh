import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { RequestMeta } from './agent/types.js';
export declare function registerAutonomousControlPlaneRoutes(app: FastifyInstance, input: {
    db: Pool;
    webPushPublicKey?: string;
    webPushConfigured: boolean;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
}): void;
