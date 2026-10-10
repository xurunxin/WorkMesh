import Fastify, { type FastifyRequest, type FastifyServerOptions } from "fastify";
import { loadReleaseInfo, type FeatureConfig } from "@workmesh/config";
import { type Db } from "@workmesh/db";
import { type Actor } from "./commands.js";
import type { AuthRateLimitStore } from "./auth-rate-limit/redis-store.js";
import { type RealtimeWakeSource } from "./realtime/wake-source.js";
import type { AgentConnectionCurrentIdentity } from "@workmesh/contracts";
declare module "fastify" {
    interface FastifyRequest {
        actor?: Actor;
        correlationId: string;
        idempotencyKey?: string;
        rawBody?: Buffer;
        coordinationIdentity?: AgentConnectionCurrentIdentity;
    }
    interface FastifyInstance {
        workmeshRuntime: {
            accepting: boolean;
        };
    }
}
/**
 * A self-hosted Browser reaches the same deployment through either loopback
 * spelling, and `http://127.0.0.1:3000` and `http://localhost:3000` are the
 * same origin in practice. Accepting only one of them makes every API call fail
 * CORS in the other, so a Human sees "Failed to fetch" on every screen with no
 * hint about the cause. The alias is derived from the configured origin (same
 * scheme and port) rather than wildcarded, so a genuinely foreign origin is
 * still refused and credentialed CORS stays pinned to this deployment.
 */
export declare function browserCorsOrigins(webOrigin: string): string[];
export declare const buildApp: (options?: {
    features?: FeatureConfig;
    releaseInfo?: ReturnType<typeof loadReleaseInfo>;
    logger?: FastifyServerOptions["logger"];
    authRateLimitStore?: AuthRateLimitStore;
    readinessProbe?: () => Promise<void>;
    beforePagedQuery?: (route: string) => Promise<void> | void;
    afterAuthorizeRequest?: (request: FastifyRequest) => Promise<void> | void;
    realtimeWakeSource?: RealtimeWakeSource;
    realtimeDb?: Db;
    realtimeHealthyReconcileMs?: number;
    realtimeFallbackReconcileMs?: number;
    realtimeBatchLimit?: number;
    realtimeHeartbeatMs?: number;
    realtimeBackpressureTimeoutMs?: number;
    realtimeMaxClients?: number;
}) => Fastify.FastifyInstance<Fastify.RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault> & PromiseLike<Fastify.FastifyInstance<Fastify.RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>> & {
    __linterBrands: "SafePromiseLike";
};
