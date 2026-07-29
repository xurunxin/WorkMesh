import { describe, expect, it, vi } from "vitest";
import {
  callRetentionSoakAgent,
  RetentionSoakCredentialManager,
} from "./retention-soak-credential.js";

const jsonResponse = (
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

describe("retention soak credential manager", () => {
  it("single-flights the initial refresh and proactively rotates near expiry", async () => {
    let now = Date.parse("2026-07-29T00:00:00.000Z");
    let monotonic = 0;
    let keyNumber = 0;
    const refreshKeys: string[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) => {
        refreshKeys.push(
          new Headers(init?.headers).get("idempotency-key") ?? "",
        );
        const tokenNumber = request.mock.calls.length;
        return jsonResponse({
          sessionToken: `session-${tokenNumber}`,
          expiresAt: new Date(now + 900_000).toISOString(),
        });
      });
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: request,
      now: () => now,
      monotonicNow: () => (monotonic += 10),
      idempotencyKey: () => `refresh-key-${(keyNumber += 1)}`,
    });

    await expect(
      Promise.all([manager.token(), manager.token()]),
    ).resolves.toEqual(["session-1", "session-1"]);
    expect(request).toHaveBeenCalledTimes(1);
    await expect(manager.token()).resolves.toBe("session-1");
    expect(request).toHaveBeenCalledTimes(1);

    now += 720_001;
    await expect(manager.token()).resolves.toBe("session-2");
    expect(request).toHaveBeenCalledTimes(2);
    expect(refreshKeys).toEqual(["refresh-key-1", "refresh-key-2"]);
    expect(manager.metrics()).toEqual({
      refreshCount: 2,
      maximumRefreshLatencyMs: 10,
      expiredBeforeRefreshCount: 0,
    });
  });

  it("refreshes before expiry at the maximum formal four-minute cadence", async () => {
    const start = Date.parse("2026-07-29T00:00:00.000Z");
    let now = start;
    let tokenNumber = 0;
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: vi.fn<typeof fetch>().mockImplementation(async () =>
        jsonResponse({
          sessionToken: `session-${(tokenNumber += 1)}`,
          expiresAt: new Date(now + 900_000).toISOString(),
        }),
      ),
      now: () => now,
    });

    await manager.token();
    for (let elapsed = 240_000; elapsed <= 86_400_000; elapsed += 240_000) {
      now = start + elapsed;
      await manager.token();
    }
    expect(manager.metrics().refreshCount).toBeGreaterThan(2);
    expect(manager.metrics().expiredBeforeRefreshCount).toBe(0);
  });

  it("records an event-loop stall that crosses token expiry", async () => {
    let now = Date.parse("2026-07-29T00:00:00.000Z");
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: vi.fn<typeof fetch>().mockImplementation(async () =>
        jsonResponse({
          sessionToken: `session-${now}`,
          expiresAt: new Date(now + 900_000).toISOString(),
        }),
      ),
      now: () => now,
    });
    await manager.token();
    now += 900_001;
    await manager.token();
    expect(manager.metrics().expiredBeforeRefreshCount).toBe(1);
  });

  it("records a proactive refresh that completes after the old token expires", async () => {
    const start = Date.parse("2026-07-29T00:00:00.000Z");
    let now = start;
    let requestCount = 0;
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: vi.fn<typeof fetch>().mockImplementation(async () => {
        requestCount += 1;
        if (requestCount === 2) now = start + 900_001;
        return jsonResponse({
          sessionToken: `session-${requestCount}`,
          expiresAt: new Date(now + 900_000).toISOString(),
        });
      }),
      now: () => now,
    });
    await manager.token();
    now = start + 720_000;
    await manager.token();
    expect(manager.metrics()).toMatchObject({
      refreshCount: 2,
      expiredBeforeRefreshCount: 1,
    });
  });

  it("reuses one idempotency key across bounded network and 429 retries", async () => {
    const now = Date.parse("2026-07-29T00:00:00.000Z");
    const sleeps: number[] = [];
    const keys: string[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(
        jsonResponse({ error: {} }, 429, {
          "retry-after": new Date(now + 999_000).toUTCString(),
        }),
      )
      .mockImplementationOnce(async (_input, init) => {
        keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        return jsonResponse({
          sessionToken: "rotated-session",
          expiresAt: new Date(now + 900_000).toISOString(),
        });
      });
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: async (input, init) => {
        keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        return await request(input, init);
      },
      now: () => now,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      idempotencyKey: () => "one-logical-refresh",
    });

    await expect(manager.token()).resolves.toBe("rotated-session");
    expect(request).toHaveBeenCalledTimes(3);
    expect(new Set(keys)).toEqual(new Set(["one-logical-refresh"]));
    expect(sleeps).toEqual([1_000, 60_000]);
  });

  it("stops after three 5xx attempts and 120 seconds of capped delay", async () => {
    const sleeps: number[] = [];
    const keys: string[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_input, init) => {
        keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
        return jsonResponse({ error: {} }, 503, { "retry-after": "999" });
      });
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: request,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      },
      idempotencyKey: () => "bounded-refresh",
    });

    await expect(manager.token()).rejects.toThrow(
      "RETENTION_SOAK_TOKEN_REFRESH_RETRIES_EXHAUSTED",
    );
    expect(request).toHaveBeenCalledTimes(3);
    expect(keys).toEqual([
      "bounded-refresh",
      "bounded-refresh",
      "bounded-refresh",
    ]);
    expect(sleeps).toEqual([60_000, 60_000]);
  });

  it("rejects terminal 4xx, malformed responses, and unsafe expiry", async () => {
    const now = Date.parse("2026-07-29T00:00:00.000Z");
    const create = (response: Response) =>
      new RetentionSoakCredentialManager({
        apiUrl: "http://127.0.0.1:3001",
        sessionId: "session-id",
        installationToken: "installation-secret",
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
        now: () => now,
      });

    await expect(
      create(jsonResponse({ error: {} }, 403)).token(),
    ).rejects.toThrow("RETENTION_SOAK_TOKEN_REFRESH_HTTP_403");
    await expect(
      create(jsonResponse({ sessionToken: "" })).token(),
    ).rejects.toThrow("RETENTION_SOAK_TOKEN_REFRESH_RESPONSE_INVALID");
    await expect(
      create(
        jsonResponse({
          sessionToken: "short-lived",
          expiresAt: new Date(now + 180_000).toISOString(),
        }),
      ).token(),
    ).rejects.toThrow("RETENTION_SOAK_TOKEN_REFRESH_EXPIRY_INVALID");
  });

  it("bounds a refresh request that does not respond", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    );
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken: "installation-secret",
      fetch: request,
      requestTimeoutMs: 1,
      sleep: async () => undefined,
    });

    await expect(manager.token()).rejects.toThrow(
      "RETENTION_SOAK_TOKEN_REFRESH_NETWORK_FAILED",
    );
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("treats workload 401 as terminal without reactive refresh or disclosure", async () => {
    const now = Date.parse("2026-07-29T00:00:00.000Z");
    const installationToken = "installation-super-secret";
    const sessionToken = "session-super-secret";
    let refreshCalls = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith("/token/refresh")) {
        refreshCalls += 1;
        return jsonResponse({
          sessionToken,
          expiresAt: new Date(now + 900_000).toISOString(),
        });
      }
      return jsonResponse({ error: { code: "UNAUTHENTICATED" } }, 401);
    });
    const manager = new RetentionSoakCredentialManager({
      apiUrl: "http://127.0.0.1:3001",
      sessionId: "session-id",
      installationToken,
      fetch: request,
      now: () => now,
    });

    let message = "";
    try {
      await callRetentionSoakAgent(
        manager,
        "http://127.0.0.1:3001",
        "/api/v1/agent-sessions/session-id/heartbeat",
        { usage: { runtimeSeconds: 0 } },
        { fetch: request },
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe("RETENTION_SOAK_ACTIVE_WORKLOAD_HTTP_401");
    expect(refreshCalls).toBe(1);
    expect(manager.metrics().refreshCount).toBe(1);
    expect(`${message}${JSON.stringify(manager.metrics())}`).not.toContain(
      installationToken,
    );
    expect(`${message}${JSON.stringify(manager.metrics())}`).not.toContain(
      sessionToken,
    );
  });
});
