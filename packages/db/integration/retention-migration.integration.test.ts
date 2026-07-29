import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Retention migration integration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Retention migration integration requires a dedicated *test* database.",
  );
const db = createDb(databaseUrl);

describe("0026 retention, archive, and heartbeat health migration", () => {
  beforeAll(async () => {
    await applyMigrations(db);
  });
  afterAll(async () => {
    await db.end();
  });

  it("installs fail-closed horizons, policy inventory, archive state, and cleanup indexes", async () => {
    expect(
      (
        await db.query(
          "SELECT 1 FROM schema_migrations WHERE version='0026_retention_archive_and_heartbeat_health'",
        )
      ).rowCount,
    ).toBe(1);
    const archiveVersionColumn = await db.query<{
      is_nullable: string;
    }>(
      `SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='event_archive_segments'
          AND column_name='object_version_id'`,
    );
    expect(archiveVersionColumn.rows).toEqual([{ is_nullable: "YES" }]);
    const workspaceId = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Retention membership','retention-membership') RETURNING id",
      )
    ).rows[0]!.id;
    const fixedCutoffAt = "2026-07-01T00:00:00.000Z";
    const metadata = { fixedCutoffAt };
    await expect(
      db.query(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_size_bytes,object_sha256,snapshot_digest,metadata,
           state,retain_until,membership_state,planned_fence
         ) VALUES(
           $1,1001,1001,$2,1,'planned-without-version',0,$3,$4,$5,
           'planned',now()+interval '366 days','pending_exact',0
         )`,
        [
          workspaceId,
          fixedCutoffAt,
          `sha256:${"a".repeat(64)}`,
          `sha256:${"b".repeat(64)}`,
          metadata,
        ],
      ),
    ).resolves.toBeDefined();
    await expect(
      db.query(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,metadata,state,retain_until,uploaded_at,
           membership_state
         ) VALUES(
           $1,1002,1002,$2,1,'uploaded-cannot-be-exact','version-uploaded',0,
           $3,$4,$5,'uploaded',now()+interval '366 days',now(),'exact'
         )`,
        [
          workspaceId,
          fixedCutoffAt,
          `sha256:${"c".repeat(64)}`,
          `sha256:${"d".repeat(64)}`,
          metadata,
        ],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,metadata,state,retain_until,uploaded_at,verified_at,
           membership_state
         ) VALUES(
           $1,1003,1003,$2,1,'verified-exact','version-verified',0,$3,$4,$5,
           'verified',now()+interval '366 days',now(),now(),'exact'
         )`,
        [
          workspaceId,
          fixedCutoffAt,
          `sha256:${"e".repeat(64)}`,
          `sha256:${"f".repeat(64)}`,
          metadata,
        ],
      ),
    ).resolves.toBeDefined();
    const policy = await db.query<{
      record_class: string;
      online_days: number;
      archive_days: number | null;
      delete_allowed: boolean;
    }>(
      "SELECT record_class,online_days,archive_days,delete_allowed FROM retention_policy_inventory",
    );
    expect(policy.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_class: "domain_event.ordinary",
          online_days: 90,
          archive_days: 365,
          delete_allowed: true,
        }),
        expect.objectContaining({
          record_class: "domain_event.unknown",
          delete_allowed: false,
        }),
        expect.objectContaining({
          record_class: "domain_event.a2a_referenced",
          delete_allowed: false,
        }),
        expect.objectContaining({
          record_class: "webhook.agent_delivery_reference",
          delete_allowed: false,
        }),
        expect.objectContaining({
          record_class: "webhook.provider_processed",
          online_days: 30,
          delete_allowed: true,
        }),
      ]),
    );
    expect(
      (
        await db.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='heartbeat_idempotency_keys'",
        )
      ).rowCount,
    ).toBe(1);
    const indexes = await db.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
       WHERE schemaname=current_schema()
         AND indexname IN (
           'api_idempotency_replay_cleanup',
           'api_idempotency_conflict_cleanup',
           'outbox_delivered_retention',
           'provider_webhook_processed_retention'
         )
    `);
    expect(indexes.rowCount).toBe(4);
  });

  it("defaults generic replay to 24h/30d and enforces a 365d archive floor", async () => {
    const workspace = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Retention migration','retention-migration') ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      )
    ).rows[0]!;
    const actor = (
      await db.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Retention test') RETURNING id",
        [workspace.id],
      )
    ).rows[0]!;
    const record = (
      await db.query<{
        replayHours: number;
        conflictDays: number;
      }>(
        `
      INSERT INTO api_idempotency_keys(
        workspace_id,actor_id,idempotency_key,operation,request_hash
      ) VALUES($1,$2,'retention-defaults','test','sha256:test')
      RETURNING extract(epoch FROM replay_expires_at-created_at)/3600 AS "replayHours",
                extract(epoch FROM conflict_expires_at-created_at)/86400 AS "conflictDays"
    `,
        [workspace.id, actor.id],
      )
    ).rows[0]!;
    expect(Number(record.replayHours)).toBeCloseTo(24, 4);
    expect(Number(record.conflictDays)).toBeCloseTo(30, 4);
    await expect(
      db.query(
        `
      INSERT INTO event_archive_segments(
        workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
        object_key,object_version_id,object_size_bytes,object_sha256,
        snapshot_digest,retain_until
      ) VALUES(
        $1,1,1,now(),1,'too-short','version-1',1,
        'sha256:${"b".repeat(64)}','sha256:${"a".repeat(64)}',
        now()+interval '364 days'
      )
    `,
        [workspace.id],
      ),
    ).rejects.toThrow();
  });

  it("blocks an exclusive floor lock while the same Workspace append holds its shared fence", async () => {
    const workspace = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Fence migration','fence-migration') ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      )
    ).rows[0]!;
    const actor = (
      await db.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Fence test') RETURNING id",
        [workspace.id],
      )
    ).rows[0]!;
    const append = await db.connect();
    const prune = await db.connect();
    try {
      await append.query("BEGIN");
      await append.query(
        `
        INSERT INTO domain_events(
          workspace_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id
        ) VALUES($1,'work_item.updated','work_item',$1,$2,'append-fence')
      `,
        [workspace.id, actor.id],
      );
      await prune.query("BEGIN");
      await prune.query("SET LOCAL statement_timeout='250ms'");
      await expect(
        prune.query(
          `
        SELECT pruned_through_cursor FROM event_retention_state
         WHERE workspace_id=$1 FOR UPDATE
      `,
          [workspace.id],
        ),
      ).rejects.toThrow(/statement timeout|canceling statement/i);
      await prune.query("ROLLBACK");
      await append.query("COMMIT");
      await expect(
        db.query(
          `
        SELECT pruned_through_cursor FROM event_retention_state
         WHERE workspace_id=$1 FOR UPDATE
      `,
          [workspace.id],
        ),
      ).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await append.query("ROLLBACK").catch(() => undefined);
      await prune.query("ROLLBACK").catch(() => undefined);
      append.release();
      prune.release();
    }
  });

  it("does not allocate a raw-insert cursor before acquiring the Workspace floor fence", async () => {
    const workspaceId = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Cursor fence migration','cursor-fence-migration') ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
      )
    ).rows[0]!.id;
    const actorId = (
      await db.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Cursor fence migration') RETURNING id",
        [workspaceId],
      )
    ).rows[0]!.id;
    const lock = await db.connect();
    const append = await db.connect();
    try {
      const before = (
        await db.query<{ lastValue: string; isCalled: boolean }>(
          'SELECT last_value::text AS "lastValue",is_called AS "isCalled" FROM domain_events_cursor_seq',
        )
      ).rows[0]!;
      await lock.query("BEGIN");
      await lock.query(
        "SELECT pruned_through_cursor FROM event_retention_state WHERE workspace_id=$1 FOR UPDATE",
        [workspaceId],
      );
      await append.query("BEGIN");
      await append.query("SET LOCAL statement_timeout='250ms'");
      await expect(
        append.query(
          `
        INSERT INTO domain_events(
          workspace_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id
        ) VALUES($1,'workspace.updated','workspace',$1,$2,'cursor-fence')
      `,
          [workspaceId, actorId],
        ),
      ).rejects.toMatchObject({ code: "57014" });
      await append.query("ROLLBACK");
      const after = (
        await db.query<{ lastValue: string; isCalled: boolean }>(
          'SELECT last_value::text AS "lastValue",is_called AS "isCalled" FROM domain_events_cursor_seq',
        )
      ).rows[0]!;
      expect(after).toEqual(before);
      await lock.query("COMMIT");
    } finally {
      await lock.query("ROLLBACK").catch(() => undefined);
      await append.query("ROLLBACK").catch(() => undefined);
      lock.release();
      append.release();
    }
  });
});
