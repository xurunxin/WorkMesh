import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exactArchiveRecoveryProofSql } from "../../../scripts/retention-restart-archive-proof.mjs";

describe("retention restart archive proof", () => {
  it("keeps the executable restart gate bound to the exact-member query", () => {
    const source = readFileSync(
      new URL(
        "../../../scripts/retention-restart-acceptance.mts",
        import.meta.url,
      ),
      "utf8",
    );
    const recoveryGate = source.slice(
      source.indexOf("RETENTION_ACCEPTANCE_ARCHIVE_RECOVERY_TIMEOUT"),
      source.indexOf("RETENTION_ACCEPTANCE_FENCE_RECOVERY_FAILED"),
    );

    expect(recoveryGate).toContain("exactArchiveRecoveryProofSql");
    expect(recoveryGate).toContain("eventId: checkpointEventId");
    expect(recoveryGate).toContain("eventCursor: recoveredCursor");
    expect(recoveryGate).not.toMatch(/\bBETWEEN\b/i);
    expect(recoveryGate).not.toMatch(/\b(?:start|end)_cursor\b/i);
  });

  it("requires the recovered event's authoritative exact member", () => {
    const query = exactArchiveRecoveryProofSql({
      workspaceId: "10000000-0000-4000-8000-000000000001",
      eventId: "20000000-0000-4000-8000-000000000020",
      eventCursor: "20",
    });

    expect(query).toContain("event_archive_segment_events member");
    expect(query).toContain("member.event_id=");
    expect(query).toContain("member.event_cursor=20::bigint");
    expect(query).toContain("segment.membership_state='exact'");
    expect(query).toContain("segment.state IN ('verified','pruned')");
    expect(query).not.toMatch(/\bBETWEEN\b/i);
    expect(query).not.toMatch(/\b(?:start|end)_cursor\b/i);
  });

  it("cannot turn a sparse 10/30 segment envelope into cursor-20 proof", () => {
    const query = exactArchiveRecoveryProofSql({
      workspaceId: "10000000-0000-4000-8000-000000000001",
      eventId: "20000000-0000-4000-8000-000000000020",
      eventCursor: "20",
    });

    expect(query).toContain("member.event_cursor=20::bigint");
    expect(query).not.toContain("10::bigint");
    expect(query).not.toContain("30::bigint");
    expect(query).not.toMatch(/start_cursor|end_cursor/i);
  });
});
