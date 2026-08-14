import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb, type Db } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Worker identity migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Worker identity migration integration requires a dedicated *test* database.",
  );

const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `workmesh_test_identity_upgrade_${suffix}`;
const cleanDatabase = `workmesh_test_identity_clean_${suffix}`;
const admin = createDb(databaseUrl);
let upgrade: Db;
let clean: Db;
let previousStageIdentityColumns = -1;
let previousStageConflictColumns = -1;

const databaseUrlFor = (database: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete("options");
  return url.toString();
};

describe("0027/0028 Worker runtime identity migrations", () => {
  beforeAll(async () => {
    await admin.query(`CREATE DATABASE "${upgradeDatabase}"`);
    await admin.query(`CREATE DATABASE "${cleanDatabase}"`);
    upgrade = createDb(databaseUrlFor(upgradeDatabase));
    clean = createDb(databaseUrlFor(cleanDatabase));

    await applyMigrations(upgrade, { through: 26 });
    previousStageIdentityColumns = Number(
      (
        await upgrade.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM information_schema.columns
            WHERE table_schema=current_schema()
              AND table_name='retention_job_state'
              AND column_name IN ('worker_instance_id','worker_build_sha')`,
        )
      ).rows[0]!.count,
    );
    await applyMigrations(upgrade, { through: 27 });
    previousStageConflictColumns = Number(
      (
        await upgrade.query<{ count: string }>(
          `SELECT count(*)::text AS count
             FROM information_schema.columns
            WHERE table_schema=current_schema()
              AND table_name='retention_job_state'
              AND column_name='worker_identity_conflict_count'`,
        )
      ).rows[0]!.count,
    );
    await applyMigrations(upgrade, { through: 28 });
    await applyMigrations(clean, { through: 28 });
  }, 120_000);

  afterAll(async () => {
    await upgrade?.end();
    await clean?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${upgradeDatabase}"`);
    await admin.query(`DROP DATABASE IF EXISTS "${cleanDatabase}"`);
    await admin.end();
  });

  it("upgrades 0026 through 0027/0028 and applies cleanly from zero", async () => {
    expect(previousStageIdentityColumns).toBe(0);
    expect(previousStageConflictColumns).toBe(0);
    for (const db of [upgrade, clean]) {
      expect(
        (
          await db.query(
            "SELECT 1 FROM schema_migrations WHERE version='0027_worker_runtime_identity'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT 1 FROM schema_migrations WHERE version='0028_worker_identity_conflict_count'",
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await db.query<{ column_name: string }>(
            `SELECT column_name
               FROM information_schema.columns
              WHERE table_schema=$1
                AND table_name='retention_job_state'
                AND column_name IN (
                  'worker_instance_id',
                  'worker_build_sha',
                  'worker_identity_conflict_count'
                )
              ORDER BY column_name`,
            ["public"],
          )
        ).rows,
      ).toEqual([
        { column_name: "worker_build_sha" },
        { column_name: "worker_identity_conflict_count" },
        { column_name: "worker_instance_id" },
      ]);
    }
  });

  it("preserves old rows with a nonnegative zero conflict baseline", async () => {
    const workspaceId = (
      await upgrade.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Worker identity migration','worker-identity-migration')
         RETURNING id`,
      )
    ).rows[0]!.id;
    await expect(
      upgrade.query(
        `INSERT INTO retention_job_state(job_name,workspace_id)
         VALUES('worker_runtime',$1)`,
        [workspaceId],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    expect(
      (
        await upgrade.query<{ count: string }>(
          `SELECT worker_identity_conflict_count::text AS count
             FROM retention_job_state
            WHERE job_name='worker_runtime' AND workspace_id=$1`,
          [workspaceId],
        )
      ).rows[0]!.count,
    ).toBe("0");
    await expect(
      upgrade.query(
        `UPDATE retention_job_state
            SET worker_instance_id=$2
          WHERE job_name='worker_runtime' AND workspace_id=$1`,
        [workspaceId, "00000000-0000-4000-8000-000000000001"],
      ),
    ).rejects.toThrow();
    await expect(
      upgrade.query(
        `UPDATE retention_job_state
            SET worker_instance_id=$2,worker_build_sha=$3
          WHERE job_name='worker_runtime' AND workspace_id=$1`,
        [
          workspaceId,
          "00000000-0000-4000-8000-000000000001",
          "a".repeat(40),
        ],
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      upgrade.query(
        `UPDATE retention_job_state
            SET worker_identity_conflict_count=-1
          WHERE job_name='worker_runtime' AND workspace_id=$1`,
        [workspaceId],
      ),
    ).rejects.toThrow();
  });
});
