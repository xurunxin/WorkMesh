import { describe, expect, it } from "vitest";
import { safeRetentionErrorCode } from "./retention-error.js";

describe("safe retention error codes", () => {
  it.each([
    "ARCHIVE_BELOW_FLOOR_RECHECK_FAILED",
    "EVENT_BELOW_FLOOR_REPAIR_COUNT_MISMATCH",
    "ARCHIVE_BELOW_FLOOR_MEMBER_COUNT_MISMATCH",
  ])("preserves the stable below-floor code %s", (code) => {
    expect(safeRetentionErrorCode(new Error(code))).toBe(code);
  });

  it("folds unknown and sensitive failures without exposing their content", () => {
    const sensitive =
      "database password=top-secret failed at C:\\sensitive\\archive.ndjson";
    const results = [
      safeRetentionErrorCode(new Error(sensitive)),
      safeRetentionErrorCode(sensitive),
      safeRetentionErrorCode({ message: sensitive }),
    ];

    expect(results).toEqual([
      "RETENTION_JOB_FAILED",
      "RETENTION_JOB_FAILED",
      "RETENTION_JOB_FAILED",
    ]);
    expect(JSON.stringify(results)).not.toContain("top-secret");
    expect(JSON.stringify(results)).not.toContain("sensitive");
  });
});
