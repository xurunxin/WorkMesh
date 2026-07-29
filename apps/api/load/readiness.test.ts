import { describe, expect, it, vi } from "vitest";
import { transportErrorText, waitForHostApiReadiness } from "./readiness.js";

const refused = (): TypeError => {
  const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1"), {
    code: "ECONNREFUSED",
    address: "127.0.0.1",
    port: 30_001,
  });
  return new TypeError("fetch failed", { cause });
};

describe("host-facing API readiness", () => {
  it("retries connection transport failures until a successful HTTP response", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );
    const delays: number[] = [];

    const result = await waitForHostApiReadiness({
      endpoint: new URL("http://127.0.0.1:30001"),
      context: "preflight:api-a-host",
      timeoutMs: 1_000,
      retryDelayMs: 25,
      fetchImpl,
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    expect(result).toMatchObject({
      endpoint: "http://127.0.0.1:30001/health",
      status: 200,
      attempts: 2,
    });
    expect(delays).toEqual([25]);
  });

  it("fails immediately when the host endpoint returns an HTTP error", async () => {
    const fetchImpl = vi
      .fn<Fetch>()
      .mockResolvedValue(
        new Response(null, { status: 503, statusText: "Service Unavailable" }),
      );
    const delay = vi.fn(async () => undefined);

    await expect(
      waitForHostApiReadiness({
        endpoint: new URL("http://127.0.0.1:30002"),
        context: "preflight:api-b-host",
        timeoutMs: 1_000,
        fetchImpl,
        delay,
      }),
    ).rejects.toThrow(
      "LOAD_API_READINESS_HTTP_RESPONSE:preflight:api-b-host:" +
        "http://127.0.0.1:30002/health:status=503:Service Unavailable",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("reports the final nested transport cause when readiness expires", async () => {
    let clock = 0;
    const fetchImpl = vi.fn<Fetch>().mockRejectedValue(refused());

    await expect(
      waitForHostApiReadiness({
        endpoint: new URL("http://127.0.0.1:30003"),
        context: "preflight:api-a-host",
        timeoutMs: 5,
        attemptTimeoutMs: 1,
        retryDelayMs: 2,
        fetchImpl,
        now: () => clock,
        delay: async (ms) => {
          clock += ms;
        },
      }),
    ).rejects.toThrow(
      /LOAD_API_READINESS_TRANSPORT_TIMEOUT:.*attempts=3:.*ECONNREFUSED/,
    );
    expect(transportErrorText(refused())).toContain("code=ECONNREFUSED");
  });
});
