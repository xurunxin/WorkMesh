import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@workmesh/config";
import { installAuthRateLimit } from "./plugin.js";
import type { AuthRateLimitStore } from "./redis-store.js";

const bootstrapToken = randomBytes(32).toString("base64url");

class OfflineStore implements AuthRateLimitStore {
  calls = 0;
  offline = true;
  result: unknown = [1, 0];
  async eval(): Promise<unknown> {
    this.calls += 1;
    if (this.offline) throw new Error("redis offline");
    return this.result;
  }
  async set(): Promise<string | null> {
    throw new Error("redis offline");
  }
  async close(): Promise<void> {}
}

class CleanupFailureStore implements AuthRateLimitStore {
  cleanupCalls = 0;
  async eval(script: string): Promise<unknown> {
    if (script.includes("redis.call('DEL'")) {
      this.cleanupCalls += 1;
      throw new Error("cleanup unavailable");
    }
    return [1, 0];
  }
  async set(): Promise<string | null> {
    return "OK";
  }
  async close(): Promise<void> {}
}

describe("credential-route selective fail-closed behavior", () => {
  const store = new OfflineStore();
  let app: FastifyInstance;

  beforeAll(async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://workmesh:workmesh@127.0.0.1:5432/workmesh",
    );
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("SESSION_SECRET", "rate-limit-server-test-secret-000001");
    vi.stubEnv("WORKMESH_BOOTSTRAP_TOKEN", bootstrapToken);
    const { buildApp } = await import("../server.js");
    app = buildApp({ logger: false, authRateLimitStore: store });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it("keeps non-credential public routes available while login fails closed", async () => {
    const info = await app.inject({ method: "GET", url: "/api/v1/info" });
    expect(info.statusCode).toBe(200);
    expect(store.calls).toBe(0);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "idempotency-key": "same-logical-attempt" },
      payload: {
        email: "unknown@example.test",
        password: "not-a-valid-password",
      },
    });
    expect(login.statusCode).toBe(503);
    expect(login.headers["retry-after"]).toBe("1");
    expect(login.json()).toMatchObject({
      error: { code: "AUTH_RATE_LIMIT_UNAVAILABLE" },
    });
    expect(store.calls).toBe(1);
  });

  it("rejects bootstrap installation before authentication or database work when Redis is unavailable", async () => {
    store.offline = true;
    const install = await app.inject({
      method: "POST",
      url: "/api/v1/auth/install",
      headers: {
        "idempotency-key": "redis-outage-install",
        "x-workmesh-bootstrap-token": bootstrapToken,
      },
      payload: {
        name: "Must not install",
        slug: "redis-outage-install",
        adminName: "Must Not Install",
        email: "redis-outage@example.test",
        password: "redis-outage-password",
      },
    });
    expect(install.statusCode).toBe(503);
    expect(install.json()).toMatchObject({
      error: { code: "AUTH_RATE_LIMIT_UNAVAILABLE" },
    });
  });

  it("returns uniform 429 metadata before any database credential lookup", async () => {
    store.offline = false;
    store.result = [0, 1_234];
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { "idempotency-key": "rate-limited-attempt" },
      payload: {
        email: "unknown@example.test",
        password: "not-a-valid-password",
      },
    });
    expect(login.statusCode).toBe(429);
    expect(login.headers).toMatchObject({
      "retry-after": "2",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "2",
    });
    expect(login.json()).toMatchObject({
      error: {
        code: "AUTH_RATE_LIMITED",
        details: { endpointClass: "login", retryAfterSeconds: 2 },
      },
    });
  });

  it("keeps a committed successful response intact when Redis cleanup fails", async () => {
    const logs: string[] = [];
    const cleanupStore = new CleanupFailureStore();
    const hookApp = Fastify({
      logger: {
        level: "info",
        stream: { write: (message: string) => logs.push(message) },
      },
    });
    const pluginConfig = loadConfig({
      DATABASE_URL: "postgres://workmesh:workmesh@localhost/workmesh",
      REDIS_URL: "redis://localhost:6379",
      SESSION_SECRET: "cleanup-hook-test-session-secret-0001",
      WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
    });
    const { metrics } = installAuthRateLimit(
      hookApp,
      pluginConfig,
      cleanupStore,
    );
    hookApp.post("/api/v1/auth/login", async (_request, reply) => {
      reply.header(
        "Set-Cookie",
        "workmesh_session=committed-session; Path=/; HttpOnly",
      );
      return { csrfToken: "committed-csrf" };
    });

    try {
      const first = await hookApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "cleanup@example.test",
          password: "irrelevant-to-hook",
        },
      });
      const second = await hookApp.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "cleanup@example.test",
          password: "irrelevant-to-hook",
        },
      });

      for (const response of [first, second]) {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ csrfToken: "committed-csrf" });
        expect(response.headers["set-cookie"]).toContain(
          "workmesh_session=committed-session",
        );
      }
      expect(cleanupStore.cleanupCalls).toBe(2);
      expect(metrics.snapshot()).toEqual(
        expect.arrayContaining([
          { endpointClass: "login", outcome: "allowed", count: 2 },
          { endpointClass: "login", outcome: "unavailable", count: 2 },
        ]),
      );
      const cleanupLogs = logs
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter(
          (entry) => entry.event === "auth.rate_limit.cleanup_failed",
        );
      expect(cleanupLogs).toHaveLength(1);
      expect(cleanupLogs[0]).toMatchObject({
        endpointClass: "login",
        operationId: "login",
      });
      expect(JSON.stringify(cleanupLogs)).not.toContain("cleanup@example.test");
    } finally {
      await hookApp.close();
    }
  });
});
