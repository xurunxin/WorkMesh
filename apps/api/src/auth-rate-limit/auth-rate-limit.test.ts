import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "@workmesh/config";
import { normalizeIp } from "./client-ip.js";
import {
  assertAuthRateLimitInventory,
  authRateLimitInventory,
} from "./inventory.js";
import {
  AuthRateLimiter,
  AuthRateLimitedError,
  AuthRateLimitUnavailableError,
  type AuthRateLimitAdmission,
} from "./limiter.js";
import type { AuthRateLimitStore } from "./redis-store.js";

const bootstrapToken = randomBytes(32).toString("base64url");
const config = loadConfig({
  DATABASE_URL: "postgres://workmesh:workmesh@localhost/workmesh",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
});

class FakeStore implements AuthRateLimitStore {
  calls: Array<{ keys: string[]; arguments: string[] }> = [];
  result: unknown = [1, 0];
  failure?: Error;
  async eval(
    _script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown> {
    this.calls.push(options);
    if (this.failure) throw this.failure;
    return this.result;
  }
  async set(): Promise<string | null> {
    return "OK";
  }
  async close(): Promise<void> {}
}

const admission: AuthRateLimitAdmission = {
  endpointClass: "login",
  operationId: "login",
  socketPeer: "127.0.0.1",
  clientIp: "203.0.113.7",
  subject: "alice@example.test",
};

describe("authentication rate-limit inventory and privacy", () => {
  it("keeps exact parity with credential-verification routes", () => {
    expect(() => assertAuthRateLimitInventory()).not.toThrow();
    expect(authRateLimitInventory.map((route) => route.operationId)).toEqual([
      "installWorkspace",
      "login",
      "exchangeAgentSessionToken",
      "refreshAgentSessionToken",
      "inspectExactTargetHandoff",
      "rejectHandoff",
      "redeemAgentConnection",
    ]);
  });

  it("normalizes IPv4, mapped IPv4, and equivalent IPv6 spellings", () => {
    expect(normalizeIp("::ffff:192.0.2.9")).toBe("192.0.2.9");
    expect(normalizeIp("2001:0DB8:0:0:0:0:0:1")).toBe("2001:db8::1");
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeIp("malformed")).toBe("unknown");
  });

  it("uses only full keyed fingerprints in same-slot Redis keys", async () => {
    const store = new FakeStore();
    await new AuthRateLimiter(store, config).admit(admission);
    const keys = store.calls[0]!.keys;
    expect(keys.every((key) => key.startsWith("{authrl}:"))).toBe(true);
    expect(keys.join(" ")).not.toContain(admission.subject);
    expect(keys.join(" ")).not.toContain(admission.clientIp);
    expect(keys.every((key) => /[a-f0-9]{64}$/.test(key))).toBe(true);

    const isolatedStore = new FakeStore();
    const isolatedConfig = loadConfig({
      DATABASE_URL: "postgres://workmesh:workmesh@localhost/workmesh",
      REDIS_URL: "redis://localhost:6379",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
      AUTH_RATE_LIMIT_REDIS_PREFIX: "authrl:test:auth-idempotency",
    });
    await new AuthRateLimiter(isolatedStore, isolatedConfig).admit(admission);
    expect(isolatedStore.calls[0]!.keys.every((key) =>
      key.startsWith("{authrl:test:auth-idempotency}:")
    )).toBe(true);
  });

  it("returns deterministic typed limited and unavailable results", async () => {
    const limitedStore = new FakeStore();
    limitedStore.result = [0, 1_234];
    await expect(
      new AuthRateLimiter(limitedStore, config).admit(admission),
    ).rejects.toMatchObject({ retryAfterMs: 1_234, endpointClass: "login" });
    expect(
      await new AuthRateLimiter(limitedStore, config)
        .admit(admission)
        .catch((error) => error),
    ).toBeInstanceOf(AuthRateLimitedError);

    const unavailableStore = new FakeStore();
    unavailableStore.failure = new Error("offline");
    await expect(
      new AuthRateLimiter(unavailableStore, config).admit(admission),
    ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
  });
});
