import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
export declare function registerAdminRetentionRoutes(app: FastifyInstance, db: Pool): void;
