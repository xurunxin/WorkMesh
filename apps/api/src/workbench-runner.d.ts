import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { CommandContext } from './commands.js';
type Helpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => CommandContext;
    header: (request: FastifyRequest, name: string) => string | undefined;
};
export declare function registerWorkbenchRunnerRoutes(app: FastifyInstance, h: Helpers): void;
export {};
