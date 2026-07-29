import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb, type Db } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Durable archive intent migration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Durable archive intent migration requires a dedicated *test* database.",
  );

const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `workmesh_test_archive_intent_upgrade_${suffix}`;
const cleanDatabase = `workmesh_test_archive_intent_clean_${suffix}`;
const admin = createDb(databaseUrl);
let upgrade: Db;
let clean: Db;
let legacySegmentId = "";
let failedLegacySegmentId = "";

const databaseUrlFor = (database: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete("options");
  return url.toString();
};

const digest = (character: string): string =>
  `sha256:${character.repeat(64)}`;

describe("0030 durable archive upload intents migration", () => {
  beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${upgradeDatabase}"`);
    await admin.query(`CREATE DATABASE "${cleanDatabase}"`);
    upgrade = createDb(databaseUrlFor(upgradeDatabase));
    clean = createDb(databaseUrlFor(cleanDatabase));
    await applyMigrations(upgrade, { through: 29 });
    const workspaceId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Archive intent upgrade','archive-intent-upgrade')
         RETURNING id`,
      )
    ).rows[0]!.id;
    legacySegmentId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,metadata,retain_until,state,uploaded_at,
           membership_state
         ) VALUES(
           $1,1,1,TIMESTAMPTZ '2026-04-01 02:03:04.567891+00',1,
           'pre-intent-upload','pre-intent-version',1,$2,$3,'{}',
           now()+interval '366 days','uploaded',now(),'pending_exact'
         ) RETURNING id`,
        [workspaceId, digest("b"), digest("a")],
      )
    ).rows[0]!.id;
    failedLegacySegmentId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,metadata,retain_until,state,last_error_code,
           membership_state
         ) VALUES(
           $1,2,2,now()-interval '91 days',1,
           'pre-intent-failed','pre-intent-failed-version',1,$2,$3,'{}',
           now()+interval '366 days','failed','ARTIFACT_CHECKSUM_MISMATCH',
           'pending_exact'
         ) RETURNING id`,
        [workspaceId, digest("d"), digest("c")],
      )
    ).rows[0]!.id;
    await applyMigrations(upgrade);
    await applyMigrations(clean);
  }, 120_000);

  afterAll(async () => {
    await upgrade?.end();
    await clean?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${upgradeDatabase}"`);
    await admin.query(`DROP DATABASE IF EXISTS "${cleanDatabase}"`);
    await admin.end();
  });

  it("upgrades through-29 rows without treating them as durable intents", async () => {
    expect(
      (
        await upgrade.query<{
          membershipState: string;
          plannedFence: string | null;
          metadataCutoff: string;
          canonicalCutoff: string;
          semanticEqual: boolean;
          millisecondAligned: boolean;
        }>(
          `SELECT membership_state AS "membershipState",
                  planned_fence::text AS "plannedFence",
                  metadata->>'fixedCutoffAt'
                    AS "metadataCutoff",
                  to_char(
                    fixed_cutoff_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                  ) AS "canonicalCutoff",
                  (metadata->>'fixedCutoffAt')::timestamptz=fixed_cutoff_at
                    AS "semanticEqual",
                  fixed_cutoff_at=date_trunc(
                    'milliseconds',
                    fixed_cutoff_at
                  ) AS "millisecondAligned"
             FROM event_archive_segments
            WHERE id=$1`,
          [legacySegmentId],
        )
      ).rows,
    ).toEqual([
      expect.objectContaining({
        membershipState: "legacy_unindexed",
        plannedFence: null,
        semanticEqual: true,
        millisecondAligned: true,
      }),
    ]);
    const upgraded = (
      await upgrade.query<{
        metadataCutoff: string;
        canonicalCutoff: string;
      }>(
        `SELECT metadata->>'fixedCutoffAt' AS "metadataCutoff",
                to_char(
                  fixed_cutoff_at AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                ) AS "canonicalCutoff"
           FROM event_archive_segments WHERE id=$1`,
        [legacySegmentId],
      )
    ).rows[0]!;
    expect(upgraded.metadataCutoff).toBe("2026-04-01T02:03:04.567Z");
    expect(upgraded.metadataCutoff).toBe(upgraded.canonicalCutoff);
    expect(upgraded.metadataCutoff).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(
      (
        await upgrade.query<{
          state: string;
          membershipState: string;
          objectVersionId: string;
          uploadedAtPresent: boolean;
        }>(
          `SELECT state,membership_state AS "membershipState",
                  object_version_id AS "objectVersionId",
                  uploaded_at IS NOT NULL AS "uploadedAtPresent"
             FROM event_archive_segments WHERE id=$1`,
          [failedLegacySegmentId],
        )
      ).rows,
    ).toEqual([
      {
        state: "failed",
        membershipState: "legacy_unindexed",
        objectVersionId: "pre-intent-failed-version",
        uploadedAtPresent: true,
      },
    ]);
    for (const database of [upgrade, clean]) {
      expect(
        (
          await database.query(
            "SELECT 1 FROM schema_migrations WHERE version='0030_durable_archive_upload_intents'",
          )
        ).rowCount,
      ).toBe(1);
    }
  });

  it("enforces planned/uploaded/exact version and cutoff invariants", async () => {
    const workspaceId = (
      await clean.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Archive intent clean','archive-intent-clean')
         RETURNING id`,
      )
    ).rows[0]!.id;
    const cutoff = new Date("2026-07-01T02:03:04.567Z");
    const metadata = { fixedCutoffAt: cutoff.toISOString() };
    const segmentId = (
      await clean.query<{ id: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_size_bytes,object_sha256,snapshot_digest,
           metadata,retain_until,planned_fence
         ) VALUES($1,1,1,$2,1,'durable-plan',1,$3,$4,$5,
                  now()+interval '366 days',7)
         RETURNING id`,
        [workspaceId, cutoff, digest("b"), digest("a"), metadata],
      )
    ).rows[0]!.id;

    expect(
      (
        await clean.query<{
          state: string;
          membershipState: string;
          objectVersionId: string | null;
          uploadAttemptCount: number;
        }>(
          `SELECT state,membership_state AS "membershipState",
                  object_version_id AS "objectVersionId",
                  upload_attempt_count AS "uploadAttemptCount"
             FROM event_archive_segments WHERE id=$1`,
          [segmentId],
        )
      ).rows,
    ).toEqual([
      {
        state: "planned",
        membershipState: "pending_exact",
        objectVersionId: null,
        uploadAttemptCount: 0,
      },
    ]);

    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET state='uploaded',uploaded_at=now()
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET object_version_id='version-before-upload'
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET uploaded_at=now()
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET metadata=jsonb_set(
              metadata,
              '{fixedCutoffAt}',
              to_jsonb('2026-07-01T02:03:04.567+00:00'::text)
            )
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET metadata=jsonb_set(
              metadata,
              '{fixedCutoffAt}',
              to_jsonb('2026-07-01T02:03:04.567Z'::text)
            )
          WHERE id=$1`,
        [segmentId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET state='failed',last_error_code='RETENTION_JOB_FAILED'
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();

    await clean.query(
      `UPDATE event_archive_segments
          SET state='uploaded',object_version_id='version-1',
              uploaded_at=now(),upload_attempt_count=1,
              last_upload_attempt_at=now(),last_upload_fence=8
        WHERE id=$1`,
      [segmentId],
    );
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET object_version_id=NULL
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET state='verified',membership_state='exact',
                object_version_id=NULL,verified_at=now()
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    await clean.query(
      `UPDATE event_archive_segments
          SET state='verified',membership_state='exact',verified_at=now()
        WHERE id=$1`,
      [segmentId],
    );
    await expect(
      clean.query(
        `UPDATE event_archive_segments
            SET state='pruned',object_version_id=NULL,pruned_at=now()
          WHERE id=$1`,
        [segmentId],
      ),
    ).rejects.toThrow();
    expect(
      (
        await clean.query<{ state: string; membershipState: string }>(
          `SELECT state,membership_state AS "membershipState"
             FROM event_archive_segments WHERE id=$1`,
          [segmentId],
        )
      ).rows,
    ).toEqual([{ state: "verified", membershipState: "exact" }]);
  });

  it("prevents a second durable intent for the same Workspace", async () => {
    const workspaceId = (
      await clean.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Single archive intent','single-archive-intent')
         RETURNING id`,
      )
    ).rows[0]!.id;
    const cutoff = new Date("2026-07-02T00:00:00.000Z");
    const values = [
      workspaceId,
      cutoff,
      digest("d"),
      digest("c"),
      { fixedCutoffAt: cutoff.toISOString() },
    ];
    await clean.query(
      `INSERT INTO event_archive_segments(
         workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
         object_key,object_size_bytes,object_sha256,snapshot_digest,metadata,
         retain_until,planned_fence
       ) VALUES($1,1,1,$2,1,'intent-one',1,$3,$4,$5,
                now()+interval '366 days',1)`,
      values,
    );
    await expect(
      clean.query(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_size_bytes,object_sha256,snapshot_digest,metadata,
           retain_until,planned_fence
         ) VALUES($1,2,2,$2,1,'intent-two',1,$3,$4,$5,
                  now()+interval '366 days',2)`,
        values,
      ),
    ).rejects.toThrow();
  });
});
