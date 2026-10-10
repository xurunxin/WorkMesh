import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { type CommandContext } from './commands.js';
import type { Paginator } from './pagination.js';
export declare function normalizeLlmBaseUrl(raw: string, allowPrivate: boolean): string;
type Helpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext;
    header: (request: FastifyRequest, name: string) => string | undefined;
    paginator: Paginator;
};
export declare function registerWorkbenchLlmConnectionRoutes(app: FastifyInstance, h: Helpers): void;
export {};
