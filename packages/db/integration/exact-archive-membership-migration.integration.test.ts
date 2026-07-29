import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb, type Db } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Exact archive membership migration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Exact archive membership migration requires a dedicated *test* database.",
  );

const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `workmesh_test_archive_membership_upgrade_${suffix}`;
const cleanDatabase = `workmesh_test_archive_membership_clean_${suffix}`;
const admin = createDb(databaseUrl);
let upgrade: Db;
let clean: Db;
let legacySegmentId = "";

const databaseUrlFor = (database: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete("options");
  return url.toString();
};

describe("0029 exact archive membership migration", () => {
  beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${upgradeDatabase}"`);
    await admin.query(`CREATE DATABASE "${cleanDatabase}"`);
    upgrade = createDb(databaseUrlFor(upgradeDatabase));
    clean = createDb(databaseUrlFor(cleanDatabase));
    await applyMigrations(upgrade, { through: 28 });
    const workspaceId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Archive membership upgrade','archive-membership-upgrade')
         RETURNING id`,
      )
    ).rows[0]!.id;
    legacySegmentId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,retain_until,state,uploaded_at,verified_at
         ) VALUES(
           $1,1,3,now()-interval '91 days',2,
           'legacy-pinned-object','legacy-version',1,$2,$3,
           now()+interval '366 days','verified',now(),now()
         ) RETURNING id`,
        [
          workspaceId,
          `sha256:${"b".repeat(64)}`,
          `sha256:${"a".repeat(64)}`,
        ],
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

  it("marks prior segments legacy-unindexed and installs the exact member table", async () => {
    expect(
      (
        await upgrade.query<{ membershipState: string }>(
          `SELECT membership_state AS "membershipState"
             FROM event_archive_segments WHERE id=$1`,
          [legacySegmentId],
        )
      ).rows,
    ).toEqual([{ membershipState: "legacy_unindexed" }]);
    expect(
      (
        await upgrade.query(
          `SELECT 1 FROM event_archive_segment_events WHERE segment_id=$1`,
          [legacySegmentId],
        )
      ).rowCount,
    ).toBe(0);
    for (const database of [upgrade, clean]) {
      expect(
        (
          await database.query(
            "SELECT 1 FROM schema_migrations WHERE version='0029_exact_archive_membership'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await database.query(
            `SELECT 1 FROM information_schema.tables
              WHERE table_schema=current_schema()
                AND table_name='event_archive_segment_events'`,
          )
        ).rowCount,
      ).toBe(1);
    }
  });

  it("uses pending-exact for new segments and rejects duplicate exact coverage", async () => {
    const workspaceId = (
      await clean.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Archive membership clean','archive-membership-clean')
         RETURNING id`,
      )
    ).rows[0]!.id;
    const segmentId = (
      await clean.query<{ id: string; membershipState: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,retain_until
         ) VALUES($1,1,1,now(),1,'new-exact-plan','version-1',1,$2,$3,
                  now()+interval '366 days')
         RETURNING id,membership_state AS "membershipState"`,
        [
          workspaceId,
          `sha256:${"b".repeat(64)}`,
          `sha256:${"a".repeat(64)}`,
        ],
      )
    ).rows[0]!;
    expect(segmentId.membershipState).toBe("pending_exact");
    await clean.query(
      `INSERT INTO event_archive_segment_events(
         segment_id,workspace_id,ordinal,event_id,event_cursor,record_sha256
       ) VALUES($1,$2,0,$3,1,$4)`,
      [
        segmentId.id,
        workspaceId,
        randomUUID(),
        `sha256:${"c".repeat(64)}`,
      ],
    );
    await expect(
      clean.query(
        `INSERT INTO event_archive_segment_events(
           segment_id,workspace_id,ordinal,event_id,event_cursor,record_sha256
         ) VALUES($1,$2,1,$3,1,$4)`,
        [
          segmentId.id,
          workspaceId,
          randomUUID(),
          `sha256:${"d".repeat(64)}`,
        ],
      ),
    ).rejects.toThrow();
  });
});
