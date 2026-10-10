import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { RequestMeta } from "../agent/types.js";
import type { Paginator } from "../pagination.js";
type Helpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
    paginator: Paginator;
};
export declare function registerInboxRoutes(app: FastifyInstance, h: Helpers): void;
export {};
