import { afterAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { loadConfig } from "@workmesh/config";
import {
  AuthRateLimitedError,
} from "../src/auth-rate-limit/limiter.js";
import { installAuthRateLimit } from "../src/auth-rate-limit/plugin.js";
import { RedisAuthRateLimitStore } from "../src/auth-rate-limit/redis-store.js";

if (process.env.RUN_INTEGRATION !== "1" || !process.env.REDIS_URL) {
  throw new Error(
    "Authentication rate-limit integration requires RUN_INTEGRATION=1 and REDIS_URL.",
  );
}

const unique = `${process.pid}-${Date.now()}`;
const config = loadConfig({
  DATABASE_URL: process.env.DATABASE_URL!,
  REDIS_URL: process.env.REDIS_URL,
  SESSION_SECRET: `auth-rate-limit-integration-${unique}-secret-padding`,
  AUTH_RATE_LIMIT_HMAC_KEY: `auth-rate-limit-integration-${unique}-hmac-padding`,
  AUTH_RATE_LIMIT_REDIS_PREFIX: `authrl:test:auth-rate-limit:${unique}`,
  AUTH_RATE_LIMIT_ENDPOINT_BURST: "5",
  AUTH_RATE_LIMIT_SOCKET_BURST: "5",
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: "5",
  AUTH_RATE_LIMIT_SUBJECT_BURST: "5",
  AUTH_RATE_LIMIT_REFILL_MS: "60000",
  AUTH_RATE_LIMIT_BACKOFF_BASE_MS: "250",
  AUTH_RATE_LIMIT_BACKOFF_MAX_MS: "800",
});
const firstStore = new RedisAuthRateLimitStore(config.REDIS_URL, 1_000, 1_000);
const secondStore = new RedisAuthRateLimitStore(config.REDIS_URL, 1_000, 1_000);
const firstApp = Fastify({ logger: false });
const secondApp = Fastify({ logger: false });
const first = installAuthRateLimit(firstApp, config, firstStore).limiter;
const second = installAuthRateLimit(secondApp, config, secondStore).limiter;
for (const app of [firstApp, secondApp]) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthRateLimitedError) {
      const retryAfter = Math.max(1, Math.ceil(error.retryAfterMs / 1_000));
      return reply
        .header("Retry-After", String(retryAfter))
        .code(429)
        .send({ error: { code: "AUTH_RATE_LIMITED" } });
    }
    throw error;
  });
  app.post("/api/v1/auth/login", async () => ({ authenticated: true }));
}
const base = {
  endpointClass: "login" as const,
  operationId: `login-${unique}`,
  socketPeer: `192.0.2.${(process.pid % 200) + 1}`,
  clientIp: `198.51.100.${(process.pid % 200) + 1}`,
  subject: `user-${unique}@example.test`,
};

afterAll(async () => {
  await Promise.all([firstApp.close(), secondApp.close()]);
});

describe("shared Redis authentication rate limiter", () => {
  it("atomically admits one shared budget across two Fastify API instances under 20-way concurrency", async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? firstApp : secondApp).inject({
          method: "POST",
          url: "/api/v1/auth/login",
          remoteAddress: base.clientIp,
          payload: {
            email: base.subject,
            password: "not-evaluated-by-test-handler",
          },
        }),
      ),
    );
    expect(responses.filter((response) => response.statusCode === 200))
      .toHaveLength(5);
    const denied = responses.filter((response) => response.statusCode === 429);
    expect(denied).toHaveLength(15);
    expect(denied.every((response) =>
      response.json<{ error: { code: string } }>().error.code ===
        "AUTH_RATE_LIMITED")).toBe(true);
    expect(new Set(denied.map((response) => response.headers["retry-after"])))
      .toHaveLength(1);
  });

  it("applies progressive failure backoff and clears only the exact success state", async () => {
    const other = {
      ...base,
      operationId: `${base.operationId}-backoff`,
      socketPeer: "192.0.2.240",
      clientIp: "198.51.100.240",
      subject: `other-${base.subject}`,
    };
    const firstDelay = await first.credentialFailure(other);
    const secondDelay = await second.credentialFailure(other);
    expect(firstDelay).toBe(250);
    expect(secondDelay).toBe(500);
    await expect(first.admit(other)).rejects.toMatchObject({
      retryAfterMs: expect.any(Number),
    });
    await first.credentialSuccess(other);
    await expect(first.admit(other)).resolves.toBeUndefined();
  });

  it("admits naturally after the configured Redis failure backoff expires", async () => {
    const expiring = {
      ...base,
      operationId: `${base.operationId}-natural-expiry`,
      socketPeer: "192.0.2.241",
      clientIp: "198.51.100.241",
      subject: `natural-expiry-${base.subject}`,
    };
    const backoffMs = await first.credentialFailure(expiring);
    expect(backoffMs).toBe(250);

    const immediate = await first.admit(expiring).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(immediate).toBeInstanceOf(AuthRateLimitedError);
    expect((immediate as AuthRateLimitedError).retryAfterMs)
      .toBeGreaterThan(0);
    expect((immediate as AuthRateLimitedError).retryAfterMs)
      .toBeLessThanOrEqual(backoffMs);

    await new Promise((resolve) => setTimeout(resolve, backoffMs + 75));
    await expect(first.admit(expiring)).resolves.toBeUndefined();
  });
});
