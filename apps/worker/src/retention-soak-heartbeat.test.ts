import { describe, expect, it, vi } from "vitest";
import {
  defaultRetentionSoakHeartbeatSleep,
  RetentionSoakHeartbeatPump,
} from "./retention-soak-heartbeat.js";

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
  it("removes the abort listener after every normally resolved sleep", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const added = vi.spyOn(controller.signal, "addEventListener");
      const removed = vi.spyOn(controller.signal, "removeEventListener");
      for (let index = 0; index < 100; index += 1) {
        const sleeping = defaultRetentionSoakHeartbeatSleep(
          1,
          controller.signal,
        );
        await vi.advanceTimersByTimeAsync(1);
        await sleeping;
      }
      expect(added).toHaveBeenCalledTimes(100);
      expect(removed).toHaveBeenCalledTimes(100);
      controller.abort();
      expect(removed).toHaveBeenCalledTimes(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("settles an aborted sleep once and removes its listener", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const removed = vi.spyOn(controller.signal, "removeEventListener");
      const sleeping = defaultRetentionSoakHeartbeatSleep(
        60_000,
        controller.signal,
      );
      controller.abort();
      await expect(sleeping).rejects.toThrow(
        "RETENTION_SOAK_HEARTBEAT_PUMP_STOPPED",
      );
      await vi.runAllTimersAsync();
      expect(removed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

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
    now = initial + 100_000;
    await pump.stop();
    expect(pump.metrics()).toMatchObject({
      observedThroughAt: new Date(now).toISOString(),
      trailingGapMs: 0,
    });
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
    now = initial + 65_000;
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

  it("retains a failing in-flight beat when stop begins", async () => {
    const initial = Date.parse("2026-07-29T00:00:00.000Z");
    let now = initial + 10_000;
    const sleeper = controlledSleep();
    let rejectBeat = (_error: Error): void => undefined;
    let beatStarted = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      beatStarted = resolve;
    });
    const pump = new RetentionSoakHeartbeatPump({
      initialServerAcceptedAt: new Date(initial).toISOString(),
      intervalMs: 15_000,
      maximumGapMs: 100_000,
      sendHeartbeat: vi
        .fn()
        .mockResolvedValueOnce({
          acceptedAt: new Date(initial + 10_000).toISOString(),
          latencyMs: 10,
        })
        .mockImplementationOnce(
          async () =>
            await new Promise((_resolve, reject) => {
              rejectBeat = reject;
              beatStarted();
            }),
        ),
      sleep: sleeper.sleep,
      now: () => now,
    });

    await pump.start();
    sleeper.releases.shift()!();
    await started;
    now = initial + 20_000;
    const stopping = pump.stop();
    rejectBeat(new Error("request failed"));
    await stopping;

    expect(pump.metrics()).toMatchObject({
      healthy: false,
      successfulHeartbeats: 1,
      observedThroughAt: new Date(now).toISOString(),
      trailingGapMs: 10_000,
      failureCode: "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED",
    });
    expect(() => pump.assertHealthy()).toThrow(
      "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED",
    );
  });

  it("fails the final gate when endedAt exceeds the last accepted heartbeat", async () => {
    const initial = Date.parse("2026-07-29T00:00:00.000Z");
    let now = initial + 10_000;
    const pump = new RetentionSoakHeartbeatPump({
      initialServerAcceptedAt: new Date(initial).toISOString(),
      intervalMs: 15_000,
      maximumGapMs: 100_000,
      sendHeartbeat: async () => ({
        acceptedAt: new Date(initial + 10_000).toISOString(),
        latencyMs: 10,
      }),
      now: () => now,
    });

    await pump.start();
    now = initial + 110_001;
    await pump.stop();
    expect(pump.metrics()).toMatchObject({
      healthy: false,
      trailingGapMs: 100_001,
      failureCode: "RETENTION_SOAK_HEARTBEAT_PUMP_FAILED",
    });
  });
});
