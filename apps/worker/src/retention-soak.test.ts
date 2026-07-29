import { describe, expect, it } from "vitest";
import {
  retentionSoakPreflight,
  retentionSoakReport,
  type RetentionSoakSample,
} from "./retention-soak.js";

const safe = {
  WORKMESH_RETENTION_SOAK: "1",
  WORKMESH_RETENTION_SOAK_DRY_RUN: "1",
  RUN_INTEGRATION: "1",
  DATABASE_URL:
    "postgres://user:password@localhost:5432/workmesh_test_retention",
  REDIS_URL: "redis://localhost:6379",
  WORKMESH_EVENT_PRUNE_ENABLED: "false",
  WORKMESH_RETENTION_CLEANUP_ENABLED: "false",
  WORKMESH_RETENTION_ARCHIVE_ENABLED: "true",
  WORKMESH_RETENTION_SOAK_API_URL: "http://127.0.0.1:3001",
  WORKMESH_RETENTION_SOAK_SESSION_ID: "00000000-0000-4000-8000-000000000001",
  WORKMESH_RETENTION_SOAK_SESSION_TOKEN: "test-token",
  WORKMESH_RETENTION_SOAK_CONTAINERS: "workmesh-api,workmesh-worker",
};

const sample = (
  overrides: Partial<RetentionSoakSample> = {},
): RetentionSoakSample => ({
  sampledAt: "2026-07-28T00:00:00.000Z",
  floor: "0",
  workerMode: "archive_only",
  workerFresh: true,
  archive: {
    planned: 0,
    uploaded: 0,
    verified: 1,
    failed: 0,
    pruned: 0,
    backlog: 0,
    maximumLatencyMs: 100,
  },
  redis: { length: 10, connections: 2 },
  database: { rows: 100, sizeBytes: 1_000, connections: 3 },
  workload: {
    heartbeats: 1,
    activities: 1,
    heartbeatLatencyMs: 10,
    activityLatencyMs: 20,
  },
  containers: {
    "workmesh-api": { cpuPercent: 1, memoryBytes: 10_000 },
  },
  ...overrides,
});

describe("retention soak harness", () => {
  it("requires a formal 24-hour archive-only isolated workload", () => {
    expect(retentionSoakPreflight(safe)).toMatchObject({
      durationMs: 86_400_000,
      sampleIntervalMs: 60_000,
      dryRun: true,
    });
    expect(() =>
      retentionSoakPreflight({
        ...safe,
        DATABASE_URL: "postgres://user:password@localhost:5432/workmesh",
      }),
    ).toThrow("RETENTION_SOAK_REQUIRES_ISOLATED_TEST_DATABASE");
    expect(() =>
      retentionSoakPreflight({
        ...safe,
        WORKMESH_RETENTION_CLEANUP_ENABLED: "true",
      }),
    ).toThrow("RETENTION_SOAK_REQUIRES_CLEANUP_DISABLED");
    expect(() =>
      retentionSoakPreflight({
        ...safe,
        WORKMESH_RETENTION_SOAK_HOURS: "1",
      }),
    ).toThrow("RETENTION_SOAK_FORMAL_DURATION_MUST_BE_24_HOURS");
  });

  it("fails on missing samples, stale Worker, floor movement, or Redis overflow", () => {
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-07-29T00:00:00Z");
    expect(
      retentionSoakReport(
        start,
        end,
        [sample(), sample({ sampledAt: end.toISOString() })],
        100,
        2,
      ),
    ).toMatchObject({ status: "passed", retentionFloorAdvanced: false });
    expect(
      retentionSoakReport(
        start,
        end,
        [
          sample(),
          sample({
            sampledAt: end.toISOString(),
            floor: "1",
            workerFresh: false,
            redis: { length: 101, connections: 2 },
          }),
        ],
        100,
        3,
      ),
    ).toMatchObject({
      status: "failed",
      retentionFloorAdvanced: true,
      checks: {
        samplesComplete: false,
        workerStayedFresh: false,
        redisBounded: false,
      },
    });
  });
});
