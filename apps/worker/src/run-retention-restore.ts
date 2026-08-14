import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  artifactStorageFromEnvironment,
  type ArtifactObjectExpectation,
} from "@workmesh/artifact-storage";
import { createDb, withTx } from "@workmesh/db";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`RETENTION_RESTORE_REQUIRES_${name}`);
  return value;
};
const databaseIdentity = (value: string): string => {
  const url = new URL(value);
  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
};
const assertTestDatabase = (value: string, code: string): void => {
  if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(value).pathname.slice(1)))
    throw new Error(code);
};
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
};
const canonicalLine = (value: unknown): string =>
  `${JSON.stringify(canonical(value))}\n`;
const digest = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

if (process.env.RUN_INTEGRATION !== "1")
  throw new Error("RETENTION_RESTORE_REQUIRES_INTEGRATION_MODE");
const sourceUrl = required("DATABASE_URL");
const restoreUrl = required("RESTORE_DATABASE_URL");
assertTestDatabase(
  sourceUrl,
  "RETENTION_RESTORE_REQUIRES_ISOLATED_TEST_SOURCE_DATABASE",
);
assertTestDatabase(
  restoreUrl,
  "RETENTION_RESTORE_REQUIRES_ISOLATED_TEST_TARGET_DATABASE",
);
if (databaseIdentity(sourceUrl) === databaseIdentity(restoreUrl))
  throw new Error("RETENTION_RESTORE_SOURCE_AND_TARGET_MUST_DIFFER");

const source = createDb(sourceUrl);
const target = createDb(restoreUrl);
const storage = artifactStorageFromEnvironment();
const schema = `retention_restore_${randomUUID().replaceAll("-", "")}`;
const startedAt = new Date();
const allowLegacy =
  process.env.WORKMESH_RETENTION_RESTORE_ALLOW_LEGACY === "1";
let restoredRows = 0;
let snapshotDigest = "";
let earlyDeleteRejected = false;
let exactMembershipVerified = false;
let legacyCompatibilityMode = false;
try {
  const segment = (
    await source.query<{
      id: string;
      workspaceId: string;
      startCursor: string;
      endCursor: string;
      rowCount: number;
      objectKey: string;
      objectVersionId: string;
      objectSizeBytes: string;
      objectSha256: string;
      snapshotDigest: string;
      retainUntil: Date;
      membershipState: "exact" | "legacy_unindexed";
    }>(
      `SELECT id,workspace_id AS "workspaceId",
              start_cursor::text AS "startCursor",
              end_cursor::text AS "endCursor",
              row_count AS "rowCount",
              object_key AS "objectKey",
              object_version_id AS "objectVersionId",
              object_size_bytes::text AS "objectSizeBytes",
              object_sha256 AS "objectSha256",
              snapshot_digest AS "snapshotDigest",
              retain_until AS "retainUntil",
              membership_state AS "membershipState"
         FROM event_archive_segments
        WHERE state IN ('verified','pruned') AND retain_until>now()
          AND (
            (
              membership_state='exact'
              AND (
                SELECT count(*)
                  FROM event_archive_segment_events member
                 WHERE member.segment_id=event_archive_segments.id
              )=row_count
            )
            OR ($1::boolean AND membership_state='legacy_unindexed')
          )
        ORDER BY (membership_state='exact') DESC,verified_at DESC
        LIMIT 1`,
      [allowLegacy],
    )
  ).rows[0];
  if (!segment)
    throw new Error("RETENTION_RESTORE_REQUIRES_VERIFIED_LOCKED_SEGMENT");
  legacyCompatibilityMode = segment.membershipState !== "exact";
  const expectation: ArtifactObjectExpectation = {
    key: segment.objectKey,
    versionId: segment.objectVersionId,
    checksum: segment.objectSha256,
    sizeBytes: Number(segment.objectSizeBytes),
    mimeType: "application/gzip",
    retainUntil: segment.retainUntil,
  };
  await storage.probeRetentionProtection();
  const originalReadback = await storage.readVerifiedObject(expectation);
  const superseding = await storage.putObject(
    {
      ...expectation,
      versionId: undefined,
      retainUntil: new Date(Date.now() + (365 * 86_400 + 300) * 1_000),
    },
    originalReadback,
  );
  if (superseding.versionId === expectation.versionId)
    throw new Error("RETENTION_RESTORE_SAME_KEY_VERSION_NOT_DISTINCT");
  // A latest-version write must never redirect restore away from the durable
  // version pinned in event_archive_segments.
  const compressed = await storage.readVerifiedObject(expectation);
  const lines = gunzipSync(compressed).toString("utf8").trim().split("\n");
  const metadata = JSON.parse(lines.shift() ?? "{}") as {
    _meta?: {
      format?: string;
      rowCount?: number;
      startCursor?: string;
      endCursor?: string;
      snapshotDigest?: string;
    };
  };
  const records = lines.map((line) => JSON.parse(line) as unknown);
  snapshotDigest = digest(records.map(canonicalLine).join(""));
  if (
    metadata._meta?.format !== "workmesh-domain-event-records-ndjson-v1"
    || metadata._meta.rowCount !== segment.rowCount
    || metadata._meta.startCursor !== segment.startCursor
    || metadata._meta.endCursor !== segment.endCursor
    || metadata._meta.snapshotDigest !== segment.snapshotDigest
    || records.length !== segment.rowCount
    || snapshotDigest !== segment.snapshotDigest
  )
    throw new Error("RETENTION_RESTORE_ARCHIVE_MANIFEST_MISMATCH");
  if (segment.membershipState === "exact") {
    const members = (
      await source.query<{
        ordinal: number;
        eventId: string;
        eventCursor: string;
        recordSha256: string;
      }>(
        `SELECT ordinal,event_id AS "eventId",
                event_cursor::text AS "eventCursor",
                record_sha256 AS "recordSha256"
           FROM event_archive_segment_events
          WHERE segment_id=$1 AND workspace_id=$2
          ORDER BY ordinal`,
        [segment.id, segment.workspaceId],
      )
    ).rows;
    const expectedMembers = records.map((record, ordinal) => {
      const event =
        record && typeof record === "object"
          ? (record as Record<string, unknown>).event
          : undefined;
      const value =
        event && typeof event === "object"
          ? (event as Record<string, unknown>)
          : undefined;
      if (
        !value ||
        typeof value.id !== "string" ||
        typeof value.cursor !== "string"
      )
        throw new Error("RETENTION_RESTORE_ARCHIVE_RECORD_INVALID");
      return {
        ordinal,
        eventId: value.id,
        eventCursor: value.cursor,
        recordSha256: digest(canonicalLine(record)),
      };
    });
    if (JSON.stringify(members) !== JSON.stringify(expectedMembers))
      throw new Error("RETENTION_RESTORE_EXACT_MEMBERSHIP_MISMATCH");
    exactMembershipVerified = true;
  } else if (!allowLegacy) {
    throw new Error("RETENTION_RESTORE_EXACT_MEMBERSHIP_REQUIRED");
  }

  await withTx(target, async (tx) => {
    await tx.query(`CREATE SCHEMA "${schema}"`);
    await tx.query(
      `CREATE TABLE "${schema}".domain_event_records(
         ordinal integer PRIMARY KEY,
         record jsonb NOT NULL
       )`,
    );
    for (const [ordinal, record] of records.entries())
      await tx.query(
        `INSERT INTO "${schema}".domain_event_records(ordinal,record)
         VALUES($1,$2::jsonb)`,
        [ordinal, JSON.stringify(record)],
      );
  });
  const restored = (
    await target.query<{ ordinal: number; record: unknown }>(
      `SELECT ordinal,record
         FROM "${schema}".domain_event_records ORDER BY ordinal`,
    )
  ).rows;
  restoredRows = restored.length;
  if (
    restoredRows !== segment.rowCount
    || digest(restored.map(({ record }) => canonicalLine(record)).join(""))
      !== segment.snapshotDigest
  )
    throw new Error("RETENTION_RESTORE_TARGET_VERIFICATION_FAILED");

  await storage.assertEarlyDeleteRejected(expectation);
  earlyDeleteRejected = true;
} finally {
  await target.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await Promise.allSettled([source.end(), target.end()]);
}

const timestamp = new Date().toISOString().replaceAll(":", "-");
const reportDirectory = resolve(
  process.env.RETENTION_RESTORE_REPORT_DIRECTORY
    ?? `.tmp/retention-restore/${timestamp}`,
);
await mkdir(reportDirectory, { recursive: true });
const reportPath = resolve(reportDirectory, "report.json");
const report = {
  schemaVersion: 1,
  status: "passed",
  startedAt: startedAt.toISOString(),
  endedAt: new Date().toISOString(),
  sourceAndTargetSeparated: true,
  objectLockMode: "COMPLIANCE",
  readbackChecksumVerified: true,
  manifestVerified: true,
  exactMembershipVerified,
  legacyCompatibilityMode,
  restoredRows,
  snapshotDigest,
  targetDigestVerified: true,
  earlyDeleteRejected,
  pinnedVersionVerifiedAfterSameKeyWrite: true,
  supersedingVersionDifferent: true,
  temporarySchemaRemoved: true,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
process.stdout.write(`[PASS] isolated retention restore rehearsal: ${reportPath}\n`);
