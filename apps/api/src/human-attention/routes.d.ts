import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { ApiActor } from '../agent/types.js';
import type { Paginator } from '../pagination.js';
type Helpers = Readonly<{
    db: Pool;
    paginator: Paginator;
}>;
export declare function humanAttentionAuthorizationPredicate(current: ApiActor, values: unknown[]): string;
export declare function registerHumanAttentionRoutes(app: FastifyInstance, h: Helpers): void;
export {};
