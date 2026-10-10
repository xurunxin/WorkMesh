import type { Pool } from "pg";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RequestMeta } from "./types.js";
import type { Paginator } from "../pagination.js";
type Helpers = {
    db: Pool;
    meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta;
    header: (request: FastifyRequest, name: string) => string | undefined;
    readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>;
    paginator: Paginator;
};
export declare const assertWebhookUrl: (raw: string) => Promise<void>;
export declare function registerAgentRoutes(app: FastifyInstance, h: Helpers): void;
export {};
