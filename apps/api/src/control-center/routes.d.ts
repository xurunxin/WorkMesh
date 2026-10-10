import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Paginator } from '../pagination.js';
type Helpers = Readonly<{
    db: Pool;
    paginator: Paginator;
}>;
export declare function registerControlCenterRoutes(app: FastifyInstance, h: Helpers): void;
export {};
