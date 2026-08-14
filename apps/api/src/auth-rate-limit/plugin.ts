import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Config } from "@workmesh/config";
import { AuthRateLimitMetrics } from "@workmesh/observability";
import {
  authRateLimitRoute,
  assertAuthRateLimitInventory,
} from "./inventory.js";
import { requestNetworkIdentity } from "./client-ip.js";
import {
  AuthRateLimiter,
  type AuthRateLimitAdmission,
  AuthRateLimitedError,
} from "./limiter.js";
import {
  RedisAuthRateLimitStore,
  type AuthRateLimitStore,
} from "./redis-store.js";

declare module "fastify" {
  interface FastifyRequest {
    authRateLimitAdmission?: AuthRateLimitAdmission;
  }
}

function subjectFor(
  request: FastifyRequest,
  kind: "none" | "email" | "session" | "handoff" | "pairing",
): string | undefined {
  if (kind === "none") return undefined;
  if (kind === "email") {
    const email = (request.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" ? email.trim().toLowerCase() : undefined;
  }
  if (kind === "pairing") {
    const pairingCode = (request.body as { pairingCode?: unknown } | undefined)?.pairingCode;
    return typeof pairingCode === "string" ? pairingCode : undefined;
  }
  const id = (request.params as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id.toLowerCase() : undefined;
}

export function installAuthRateLimit(
  app: FastifyInstance,
  config: Config,
  suppliedStore?: AuthRateLimitStore,
): {
  limiter: AuthRateLimiter;
  metrics: AuthRateLimitMetrics;
  store: AuthRateLimitStore;
} {
  assertAuthRateLimitInventory();
  const store =
    suppliedStore ??
    new RedisAuthRateLimitStore(
      config.REDIS_URL,
      config.AUTH_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS,
      config.AUTH_RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS,
    );
  const metrics = new AuthRateLimitMetrics();
  const limiter = new AuthRateLimiter(store, config, metrics);
  const cleanupFailureLogUntil = new Map<string, number>();
  metrics.startSummarySink(
    app.log,
    config.AUTH_RATE_LIMIT_SUMMARY_INTERVAL_MS,
  );

  app.addHook("preValidation", async (request) => {
    const route = authRateLimitRoute(
      request.method,
      request.routeOptions.url ?? "",
    );
    if (!route) return;
    const network = requestNetworkIdentity(request);
    const admission: AuthRateLimitAdmission = {
      endpointClass: route.endpointClass,
      operationId: route.operationId,
      ...network,
      subject: subjectFor(request, route.subject),
    };
    request.authRateLimitAdmission = admission;
    try {
      await limiter.admit(admission);
    } catch (error) {
      if (
        error instanceof AuthRateLimitedError &&
        (await limiter.sampledThrottleLog(admission))
      ) {
        request.log.warn(
          {
            event: "auth.rate_limited",
            endpointClass: route.endpointClass,
            operationId: route.operationId,
          },
          "Authentication request rate limited",
        );
      }
      throw error;
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.authRateLimitAdmission &&
      reply.statusCode >= 200 &&
      reply.statusCode < 300
    ) {
      try {
        await limiter.credentialSuccess(request.authRateLimitAdmission);
      } catch {
        const operationId = request.authRateLimitAdmission.operationId;
        const now = Date.now();
        if ((cleanupFailureLogUntil.get(operationId) ?? 0) <= now) {
          cleanupFailureLogUntil.set(operationId, now + 60_000);
          app.log.error(
            {
              event: "auth.rate_limit.cleanup_failed",
              endpointClass: request.authRateLimitAdmission.endpointClass,
              operationId,
            },
            "Authentication rate-limit success cleanup failed",
          );
        }
      }
    }
    return payload;
  });

  app.addHook("onClose", async () => {
    metrics.stopSummarySink();
    cleanupFailureLogUntil.clear();
    await store.close();
  });

  return { limiter, metrics, store };
}
