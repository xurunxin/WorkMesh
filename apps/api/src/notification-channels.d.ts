import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { type CommandContext } from './commands.js';
import type { Paginator } from './pagination.js';
export declare function registerNotificationChannelRoutes(app: FastifyInstance, h: {
    db: Pool;
    configuredProviders?: 'wecom'[];
    paginator: Paginator;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext;
    header: (request: FastifyRequest, name: string) => string | undefined;
}): void;
