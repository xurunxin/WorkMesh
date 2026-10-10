import type { FastifyInstance } from "fastify";
import type { Config } from "@workmesh/config";
import { AuthRateLimitMetrics } from "@workmesh/observability";
import { AuthRateLimiter, type AuthRateLimitAdmission } from "./limiter.js";
import { type AuthRateLimitStore } from "./redis-store.js";
declare module "fastify" {
    interface FastifyRequest {
        authRateLimitAdmission?: AuthRateLimitAdmission;
    }
}
export declare function installAuthRateLimit(app: FastifyInstance, config: Config, suppliedStore?: AuthRateLimitStore): {
    limiter: AuthRateLimiter;
    metrics: AuthRateLimitMetrics;
    store: AuthRateLimitStore;
};
