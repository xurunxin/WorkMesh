import { describe, expect, it, vi } from "vitest";
import { RetentionSoakHeartbeatPump } from "./retention-soak-heartbeat.js";

const controlledSleep = () => {
  const releases: Array<() => void> = [];
  return {
    releases,
    sleep: async (_delayMs: number, signal: AbortSignal): Promise<void> =>
      await new Promise<void>((resolve, reject) => {
        releases.push(resolve);
        signal.addEventListener(
          "abort",
          () => reject(new Error("stopped")),
          { once: true },
        );
      }),
  };
};

describe("retention soak heartbeat pump", () => {
  it("accepts an immediate first beat within the 45s-age plus 55s operation bound", async () => {
    const initial = Date.parse("2026-07-29T00:00:00.000Z");
    let now = initial + 45_000;
    const pump = new RetentionSoakHeartbeatPump({
      initialServerAcceptedAt: new Date(initial).toISOString(),
      intervalMs: 15_000,
      maximumGapMs: 100_000,
      sendHeartbeat: async () => ({
        acceptedAt: new Date(initial + 100_000).toISOString(),
        latencyMs: 10_000,
      }),
      now: () => now,
    });

    await pump.start();
    expect(pump.metrics()).toMatchObject({
      healthy: true,
      successfulHeartbeats: 1,
      firstPumpAcceptedAt: new Date(initial + 100_000).toISOString(),
      maximumObservedGapMs: 100_000,
      maximumLatencyMs: 10_000,
      failureCode: null,
    });
    await pump.stop();
  });

  it("keeps pumping while activity, outbox polling, and sampling progress independently", async () => {
    const initial = Date.parse("2026-07-29T00:00:00.000Z");
    let now = initial;
    const acceptedOffsets = [10_000, 65_000];
    const sleeper = controlledSleep();
    const pump = new RetentionSoakHeartbeatPump({
      initialServerAcceptedAt: new Date(initial).toISOString(),
      intervalMs: 15_000,
      maximumGapMs: 100_000,
      sendHeartbeat: async () => ({
        acceptedAt: new Date(initial + acceptedOffsets.shift()!).toISOString(),
        latencyMs: 10_000,
      }),
      sleep: sleeper.sleep,
      now: () => now,
    });

    await pump.start();
    // The main sampling path can spend 10s in activity, 30s polling outbox,
    // and 5s collecting stats. Releasing the independent pump after that work
    // still yields an authoritative 55s observed gap.
    now = initial + 50_000;
    sleeper.releases.shift()!();
    await vi.waitFor(() =>
      expect(pump.metrics().successfulHeartbeats).toBe(2),
    );
    expect(pump.metrics()).toMatchObject({
      healthy: true,
      maximumObservedGapMs: 55_000,
      failureCode: null,
    });
    await pump.stop();
  });

  it("fails closed when an event-loop stall crosses the observed-gap bound", async () => {
    const initial = Date.parse("2026-07-29T00:00:00.000Z");
    let now = initial;
    const acceptedOffsets = [10_000, 110_001];
    const sleeper = controlledSleep();
    const pump = new RetentionSoakHeartbeatPump({
      initialServerAcceptedAt: new Date(initial).toISOString(),
      intervalMs: 15_000,
      maximumGapMs: 100_000,
      sendHeartbeat: async () => ({
        acceptedAt: new Date(initial + acceptedOffsets.shift()!).toISOString(),
        latencyMs: 10,
      }),
      sleep: sleeper.sleep,
      now: () => now,
    });

    await pump.start();
    now = initial + 110_001;
    sleeper.releases.shift()!();
    await vi.waitFor(() => expect(pump.metrics().healthy).toBe(false));
    expect(() => pump.assertHealthy()).toThrow(
      "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED",
    );
    expect(pump.metrics()).toMatchObject({
      successfulHeartbeats: 1,
      failureCode: "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED",
    });
    await pump.stop();
  });
});
