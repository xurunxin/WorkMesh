import { describe, expect, it } from "vitest";
import {
  collectWorkerEventEvidence,
  evaluateWorkerContinuity,
  parseWorkerEventLine,
  sanitizeWorkerLogs,
  type WorkerContainerState,
} from "./worker-evidence.js";

const state = (
  overrides: Partial<WorkerContainerState> = {},
): WorkerContainerState => ({
  capturedAt: "2026-07-29T00:00:00.000Z",
  id: "worker-container",
  name: "/worker-1",
  status: "running",
  running: true,
  restartCount: 0,
  oomKilled: false,
  exitCode: 0,
  startedAt: "2026-07-29T00:00:00.000Z",
  finishedAt: "0001-01-01T00:00:00Z",
  ...overrides,
});

describe("Worker acceptance evidence", () => {
  it("requires one continuously running non-restarted non-OOM container", () => {
    expect(
      evaluateWorkerContinuity({
        baseline: state(),
        samples: [state({ capturedAt: "2026-07-29T00:00:01.000Z" })],
        events: [],
        samplingErrors: 0,
      }),
    ).toMatchObject({
      sameContainer: true,
      runningThroughout: true,
      restartCountZero: true,
      noOom: true,
      noForbiddenEvents: true,
    });

    expect(
      evaluateWorkerContinuity({
        baseline: state(),
        samples: [state({ running: false, status: "exited", exitCode: 1 })],
        events: [
          {
            action: "die",
            time: 1,
            timeNano: 1,
            containerId: "worker-container",
          },
        ],
        samplingErrors: 0,
      }),
    ).toMatchObject({
      runningThroughout: false,
      noForbiddenEvents: false,
    });
  });

  it("retains only allowlisted lifecycle event fields", () => {
    expect(
      parseWorkerEventLine(
        JSON.stringify({
          Action: "die",
          time: 10,
          timeNano: 11,
          Actor: {
            ID: "worker-container",
            Attributes: {
              env: "SECRET=value",
              name: "worker-1",
              exitCode: "1",
            },
          },
        }),
      ),
    ).toEqual({
      kind: "accepted",
      event: {
        action: "die",
        time: 10,
        timeNano: 11,
        containerId: "worker-container",
      },
    });
  });

  it("marks malformed JSON and incomplete lifecycle events invalid", () => {
    expect(parseWorkerEventLine("{not-json")).toEqual({ kind: "invalid" });
    expect(
      parseWorkerEventLine(
        JSON.stringify({
          Action: "die",
          time: 10,
          Actor: { ID: "worker-container" },
        }),
      ),
    ).toEqual({ kind: "invalid" });
  });

  it("ignores valid unrelated Docker events without treating them as invalid", () => {
    const unrelated = JSON.stringify({
      Action: "exec_create",
      time: 10,
      timeNano: 11,
      Actor: { ID: "worker-container" },
    });
    expect(parseWorkerEventLine(unrelated)).toEqual({ kind: "ignored" });
    expect(
      collectWorkerEventEvidence(
        [
          unrelated,
          "{not-json",
          JSON.stringify({
            Action: "die",
            time: 10,
            Actor: { ID: "worker-container" },
          }),
        ].join("\n"),
      ),
    ).toEqual({
      events: [],
      invalidEventCount: 2,
      ignoredEventCount: 1,
    });
  });

  it("categorizes bounded logs without retaining raw text or secrets", () => {
    const summary = sanitizeWorkerLogs(
      [
        "2026-07-29T00:00:00Z redis realtime hint unavailable redis://secret",
        "2026-07-29T00:00:01Z outbox worker tick failed token=secret",
      ].join("\n"),
    );
    expect(summary.counts).toMatchObject({
      redis_hint_connection_error: 1,
      outbox_tick_failed: 1,
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
    expect(JSON.stringify(summary)).not.toContain("redis://");
  });
});
