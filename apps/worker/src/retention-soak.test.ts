import { describe, expect, it } from "vitest";
import {
  retentionSoakPreflight,
  retentionSoakReport,
} from "./retention-soak.js";

const safe = {
  WORKMESH_RETENTION_SOAK: "1",
  RUN_INTEGRATION: "1",
  DATABASE_URL:
    "postgres://user:password@localhost:5432/workmesh_test_retention",
  REDIS_URL: "redis://localhost:6379",
  WORKMESH_EVENT_PRUNE_ENABLED: "false",
  WORKMESH_RETENTION_ARCHIVE_ENABLED: "true",
};

describe("retention soak harness", () => {
  it("requires an isolated test database and prune-disabled archive mode", () => {
    expect(retentionSoakPreflight(safe)).toMatchObject({
      durationMs: 86_400_000,
      sampleIntervalMs: 60_000,
    });
    expect(() =>
      retentionSoakPreflight({
        ...safe,
        DATABASE_URL: "postgres://user:password@localhost:5432/workmesh",
      }),
    ).toThrow("RETENTION_SOAK_REQUIRES_ISOLATED_TEST_DATABASE");
    expect(() =>
      retentionSoakPreflight({ ...safe, WORKMESH_EVENT_PRUNE_ENABLED: "true" }),
    ).toThrow("RETENTION_SOAK_REQUIRES_PRUNE_DISABLED");
  });

  it("fails the report on floor movement, failed archive, or Redis overflow", () => {
    const start = new Date("2026-07-28T00:00:00Z");
    const end = new Date("2026-07-29T00:00:00Z");
    expect(
      retentionSoakReport(
        start,
        end,
        [
          { floor: "0", failedSegments: 0, redisLength: 10 },
          { floor: "0", failedSegments: 0, redisLength: 100 },
        ],
        100,
      ),
    ).toMatchObject({ status: "passed", retentionFloorAdvanced: false });
    expect(
      retentionSoakReport(
        start,
        end,
        [
          { floor: "0", failedSegments: 0, redisLength: 10 },
          { floor: "1", failedSegments: 1, redisLength: 101 },
        ],
        100,
      ),
    ).toMatchObject({ status: "failed", retentionFloorAdvanced: true });
  });
});
