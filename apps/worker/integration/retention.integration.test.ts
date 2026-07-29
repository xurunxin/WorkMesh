import { randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { appendEvent, applyMigrations, createDb, withTx } from "@workmesh/db";
import type { RetentionConfig } from "@workmesh/config";
import type { ArtifactObjectExpectation } from "@workmesh/artifact-storage";
import {
  createRetentionWorker,
  type ArchiveObjectStore,
  type ExactRedisClient,
} from "../src/retention.js";
import {
  retentionSoakSampleQuery,
  type RetentionSoakSampleDatabaseState,
} from "../src/retention-soak-query.js";
import { retentionSoakWorkerFreshnessProof } from "../src/retention-soak-provenance.js";
import type { WorkerRuntimeIdentity } from "../src/worker-runtime-identity.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Retention integration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Retention integration requires a dedicated *test* database.",
  );

const db = createDb(databaseUrl);
const objects = new Map<string, Uint8Array>();
const verifiedVersions: string[] = [];
let corruptReadback = true;
let writes = 0;
const versionedObjectKey = (
  expectation: ArtifactObjectExpectation,
): string => `${expectation.key}@${expectation.versionId ?? "unversioned"}`;
const storage: ArchiveObjectStore = {
  async probeRetentionProtection() {},
  async putObject(expectation, body) {
    writes += 1;
    const versionId = `retention-version-${writes}`;
    objects.set(
      versionedObjectKey({ ...expectation, versionId }),
      Uint8Array.from(body),
    );
    return { versionId };
  },
  async verify(expectation) {
    if (!expectation.versionId)
      throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    verifiedVersions.push(expectation.versionId);
    const body = objects.get(versionedObjectKey(expectation));
    if (!body) throw new Error("ARCHIVE_OBJECT_MISSING");
    if (corruptReadback) throw new Error("ARTIFACT_CHECKSUM_MISMATCH");
    return {
      checksum: expectation.checksum,
      sizeBytes: expectation.sizeBytes,
      mimeType: expectation.mimeType,
    };
  },
};
const redis: ExactRedisClient = {
  isOpen: true,
  async connect() {},
  async xTrim() {
    return 0;
  },
  async xLen() {
    return 0;
  },
  async quit() {},
};
const config: RetentionConfig = {
  genericReplayHours: 24,
  genericConflictDays: 30,
  eventOnlineDays: 90,
  archiveRetainDays: 365,
  cleanupRetainDays: 30,
  batchSize: 100,
  leaseSeconds: 120,
  intervalSeconds: 3600,
  ioTimeoutSeconds: 300,
  progressStaleSeconds: 7200,
  cleanupEnabled: false,
  archiveEnabled: true,
  eventPruneEnabled: false,
  archivePrefix: "retention/events",
};

let workspaceId = "";
let actorId = "";
let eventId = "";
let eventCursor = "";

beforeAll(async () => {
  await applyMigrations(db);
  await db.query("TRUNCATE workspaces CASCADE");
});

beforeEach(async () => {
  objects.clear();
  verifiedVersions.length = 0;
  corruptReadback = true;
  writes = 0;
  workspaceId = (
    await db.query<{ id: string }>(
      "INSERT INTO workspaces(name,slug) VALUES('Retention worker',$1) RETURNING id",
      [`retention-worker-${randomUUID()}`],
    )
  ).rows[0]!.id;
  actorId = (
    await db.query<{ id: string }>(
      "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Retention worker') RETURNING id",
      [workspaceId],
    )
  ).rows[0]!.id;
  eventId = await withTx(db, (tx) =>
    appendEvent(tx, {
      workspaceId,
      actorId,
      correlationId: randomUUID(),
      type: "workspace.updated",
      aggregateType: "workspace",
      aggregateId: workspaceId,
      payload: { reason: "retention integration" },
    }),
  );
  const event = (
    await db.query<{ cursor: string }>(
      "UPDATE domain_events SET occurred_at=now()-interval '91 days' WHERE id=$1 RETURNING cursor::text",
      [eventId],
    )
  ).rows[0]!;
  eventCursor = event.cursor;
  await db.query(
    "UPDATE outbox_events SET status='delivered',delivered_at=now()-interval '31 days' WHERE domain_event_id=$1",
    [eventId],
  );
});

afterAll(async () => {
  await db.end();
});

describe("retention soak sampling", () => {
  it("executes the formal sampling query against PostgreSQL", async () => {
    await db.query(
      `INSERT INTO retention_job_state(
         job_name,workspace_id,worker_mode,worker_seen_at
       ) VALUES('worker_runtime',$1,'archive_only',now())
       ON CONFLICT(job_name,workspace_id) DO UPDATE
         SET worker_mode=EXCLUDED.worker_mode,
             worker_seen_at=EXCLUDED.worker_seen_at`,
      [workspaceId],
    );
    const state = (
      await db.query<RetentionSoakSampleDatabaseState>(
        retentionSoakSampleQuery,
        [workspaceId, [], new Date()],
      )
    ).rows[0]!;
    expect(state).toMatchObject({
      floor: "0",
      workerMode: "archive_only",
      backlog: "1",
      currentRunArchived: "0",
      outboxPending: "0",
      rows: "1",
    });

    await db.query(
      `INSERT INTO event_archive_segments(
         workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
         object_key,object_version_id,object_size_bytes,object_sha256,
         snapshot_digest,retain_until,state,uploaded_at,verified_at
       ) VALUES(
         $1,$2,$2,now()-interval '90 days',1,
         'retention-soak-query-test','version-1',1,$3,$4,
         now()+interval '366 days','verified',now(),now()
       )`,
      [
        workspaceId,
        eventCursor,
        `sha256:${"b".repeat(64)}`,
        `sha256:${"a".repeat(64)}`,
      ],
    );
    const archivedState = (
      await db.query<RetentionSoakSampleDatabaseState>(
        retentionSoakSampleQuery,
        [workspaceId, [eventCursor], new Date()],
      )
    ).rows[0]!;
    expect(archivedState).toMatchObject({
      backlog: "0",
      currentRunArchived: "1",
      verified: "1",
      verifiedRows: "1",
      rows: "1",
    });
  });
});

describe("retention worker destructive-path fences", () => {
  it("marks corrupt uploads failed and deterministically verifies the same segment after restart", async () => {
    const first = createRetentionWorker({
      db,
      workerId: "archive-first",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(first.archiveEvents()).rejects.toThrow(
      "ARTIFACT_CHECKSUM_MISMATCH",
    );
    const failed = (
      await db.query<{
        id: string;
        state: string;
        objectKey: string;
        snapshotDigest: string;
      }>(
        `
      SELECT id,state,object_key AS "objectKey",snapshot_digest AS "snapshotDigest"
        FROM event_archive_segments WHERE workspace_id=$1
    `,
        [workspaceId],
      )
    ).rows[0]!;
    expect(failed.state).toBe("failed");

    corruptReadback = false;
    const restarted = createRetentionWorker({
      db,
      workerId: "archive-restart",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(restarted.archiveEvents()).resolves.toBe(1);
    const verified = (
      await db.query<{
        id: string;
        state: string;
        objectKey: string;
        snapshotDigest: string;
      }>(
        `
      SELECT id,state,object_key AS "objectKey",snapshot_digest AS "snapshotDigest"
        FROM event_archive_segments WHERE workspace_id=$1
    `,
        [workspaceId],
      )
    ).rows[0]!;
    expect(verified).toMatchObject({
      id: failed.id,
      state: "verified",
      objectKey: failed.objectKey,
      snapshotDigest: failed.snapshotDigest,
    });
    expect(verifiedVersions).toContain("retention-version-2");
    expect(writes).toBe(2);
    const archiveLines = gunzipSync([...objects.values()][0]!)
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(archiveLines[0]).toMatchObject({
      _meta: {
        format: "workmesh-domain-event-records-ndjson-v1",
        rowCount: 1,
      },
    });
    expect(archiveLines[1]).toMatchObject({
      event: { id: eventId },
      outbox: { status: "delivered", topic: "workspace.updated" },
    });
    expect(archiveLines[1]!.resources).toEqual(expect.any(Array));
  });

  it("prevents an expired archive owner from regressing a reclaimed verified segment", async () => {
    corruptReadback = false;
    const stale = createRetentionWorker({
      db,
      workerId: "stale-archive-owner",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
      afterArchiveClaim: async (claim) => {
        await db.query(
          `UPDATE retention_job_state
              SET lease_expires_at=now()-interval '1 second'
            WHERE job_name=$1 AND workspace_id=$2
              AND lease_owner=$3 AND fence=$4::bigint`,
          [claim.jobName, claim.workspaceId, claim.owner, claim.fence],
        );
        const winner = createRetentionWorker({
          db,
          workerId: "new-archive-owner",
          config,
          storage,
          redisClient: redis,
          redisMaxLen: 100,
          workspaceScopeId: workspaceId,
        });
        await expect(winner.archiveEvents()).resolves.toBe(1);
      },
    });

    await expect(stale.archiveEvents()).rejects.toThrow("RETENTION_CLAIM_LOST");
    expect(
      (
        await db.query<{
          state: string;
          watermarkCursor: string;
          leaseOwner: string;
        }>(
          `SELECT segment.state,
                  job.watermark_cursor::text AS "watermarkCursor",
                  job.lease_owner AS "leaseOwner"
             FROM event_archive_segments segment
             JOIN retention_job_state job
               ON job.job_name='event_archive'
              AND job.workspace_id=segment.workspace_id
            WHERE segment.workspace_id=$1`,
          [workspaceId],
        )
      ).rows,
    ).toEqual([
      {
        state: "verified",
        watermarkCursor: eventCursor,
        leaseOwner: "new-archive-owner",
      },
    ]);
  });

  it("persists only fixed retention failure codes for unknown exceptions", async () => {
    const unsafeMessage =
      "archive bucket customer-42 failed with credential=top-secret";
    const unsafeStorage: ArchiveObjectStore = {
      probeRetentionProtection: storage.probeRetentionProtection,
      putObject: storage.putObject,
      async verify() {
        throw new Error(unsafeMessage);
      },
    };
    const worker = createRetentionWorker({
      db,
      workerId: "archive-unknown-error",
      config,
      storage: unsafeStorage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });

    await expect(worker.archiveEvents()).rejects.toThrow(unsafeMessage);
    const persisted = await db.query<{ lastErrorCode: string }>(
      `SELECT last_error_code AS "lastErrorCode"
         FROM event_archive_segments
        WHERE workspace_id=$1
       UNION ALL
       SELECT last_error_code AS "lastErrorCode"
         FROM retention_job_state
        WHERE workspace_id=$1 AND job_name='event_archive'`,
      [workspaceId],
    );
    expect(persisted.rows).toHaveLength(2);
    expect(
      persisted.rows.every(
        ({ lastErrorCode }) => lastErrorCode === "RETENTION_JOB_FAILED",
      ),
    ).toBe(true);
  });

  it("rejects progress from an expired owner after a fenced reclaim", async () => {
    const oldWorker = createRetentionWorker({
      db,
      workerId: "old-owner",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    const oldClaim = await oldWorker.claim("retention_fence_test", new Date());
    expect(oldClaim).toBeDefined();
    await db.query(
      `
      UPDATE retention_job_state SET lease_expires_at=now()-interval '1 second'
       WHERE job_name='retention_fence_test' AND workspace_id=$1
    `,
      [workspaceId],
    );
    const newWorker = createRetentionWorker({
      db,
      workerId: "new-owner",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    const newClaim = await newWorker.claim("retention_fence_test", new Date());
    expect(BigInt(newClaim!.fence)).toBeGreaterThan(BigInt(oldClaim!.fence));
    await expect(
      oldWorker.guardedProgress(oldClaim!, {
        watermarkCursor: eventCursor,
      }),
    ).rejects.toThrow("RETENTION_CLAIM_LOST");
    await expect(
      newWorker.guardedProgress(newClaim!, {
        complete: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a stale cleanup owner before any replay wipe or delete", async () => {
    await db.query(
      `INSERT INTO api_idempotency_keys(
         workspace_id,actor_id,idempotency_key,operation,request_hash,
         response_status,response_body,created_at,replay_expires_at,
         conflict_expires_at
       ) VALUES(
         $1,$2,'stale-cleanup-owner','test','sha256:stale-cleanup',
         200,'{"retained":true}',now()-interval '40 days',
         now()-interval '31 days',now()-interval '1 day'
       )`,
      [workspaceId, actorId],
    );
    const cleanupConfig = { ...config, cleanupEnabled: true };
    const stale = createRetentionWorker({
      db,
      workerId: "stale-cleanup-owner",
      config: cleanupConfig,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
      afterCleanupClaim: async (claim) => {
        await db.query(
          `UPDATE retention_job_state
              SET lease_expires_at=now()-interval '1 second'
            WHERE job_name=$1 AND workspace_id=$2
              AND lease_owner=$3 AND fence=$4::bigint`,
          [claim.jobName, claim.workspaceId, claim.owner, claim.fence],
        );
        const winner = createRetentionWorker({
          db,
          workerId: "new-cleanup-owner",
          config: cleanupConfig,
          storage,
          redisClient: redis,
          redisMaxLen: 100,
          workspaceScopeId: workspaceId,
        });
        const reclaimed = await winner.claim("cleanup", claim.fixedCutoffAt);
        expect(reclaimed?.owner).toBe("new-cleanup-owner");
        expect(BigInt(reclaimed!.fence)).toBeGreaterThan(BigInt(claim.fence));
      },
    });

    await expect(stale.cleanup()).rejects.toThrow("RETENTION_CLAIM_LOST");
    expect(
      (
        await db.query<{
          responseStatus: number | null;
          responseBody: unknown | null;
        }>(
          `SELECT response_status AS "responseStatus",
                  response_body AS "responseBody"
             FROM api_idempotency_keys
            WHERE workspace_id=$1 AND actor_id=$2
              AND idempotency_key='stale-cleanup-owner'`,
          [workspaceId, actorId],
        )
      ).rows,
    ).toEqual([{ responseStatus: 200, responseBody: { retained: true } }]);
  });

  it("rolls back event deletion, floor advance, and segment state on an injected failure", async () => {
    const pruningConfig = { ...config, eventPruneEnabled: true };
    corruptReadback = false;
    const archiver = createRetentionWorker({
      db,
      workerId: "prune-archive",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(archiver.archiveEvents()).resolves.toBe(1);
    const failing = createRetentionWorker({
      db,
      workerId: "prune-failure",
      config: pruningConfig,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
      beforePruneCommit: () => {
        throw new Error("INJECTED_PRUNE_FAILURE");
      },
    });
    await expect(failing.pruneEvents()).rejects.toThrow(
      "INJECTED_PRUNE_FAILURE",
    );
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await db.query<{ cursor: string }>(
          "SELECT pruned_through_cursor::text AS cursor FROM event_retention_state WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.cursor,
    ).toBe("0");
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM event_archive_segments WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.state,
    ).toBe("verified");

    const retry = createRetentionWorker({
      db,
      workerId: "prune-retry",
      config: pruningConfig,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(retry.pruneEvents()).resolves.toBe(1);
    expect(verifiedVersions.at(-1)).toBe("retention-version-1");
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await db.query<{ cursor: string }>(
          "SELECT pruned_through_cursor::text AS cursor FROM event_retention_state WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.cursor,
    ).toBe(eventCursor);
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM event_archive_segments WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.state,
    ).toBe("pruned");
  });

  it("rejects a stale prune owner inside the destructive transaction after a fenced reclaim", async () => {
    corruptReadback = false;
    const pruningConfig = { ...config, eventPruneEnabled: true };
    const archiver = createRetentionWorker({
      db,
      workerId: "stale-prune-archive",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(archiver.archiveEvents()).resolves.toBe(1);
    const stale = createRetentionWorker({
      db,
      workerId: "stale-prune-owner",
      config: pruningConfig,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
      afterPruneClaim: async (claim) => {
        await db.query(
          `UPDATE retention_job_state
              SET lease_expires_at=now()-interval '1 second'
            WHERE job_name=$1 AND workspace_id=$2
              AND lease_owner=$3 AND fence=$4::bigint`,
          [claim.jobName, claim.workspaceId, claim.owner, claim.fence],
        );
        const winner = createRetentionWorker({
          db,
          workerId: "new-prune-owner",
          config: pruningConfig,
          storage,
          redisClient: redis,
          redisMaxLen: 100,
          workspaceScopeId: workspaceId,
        });
        const reclaimed = await winner.claim(
          "event_prune",
          claim.fixedCutoffAt,
        );
        expect(reclaimed?.owner).toBe("new-prune-owner");
        expect(BigInt(reclaimed!.fence)).toBeGreaterThan(BigInt(claim.fence));
      },
    });
    await expect(stale.pruneEvents()).rejects.toThrow("RETENTION_CLAIM_LOST");
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await db.query<{ cursor: string }>(
          "SELECT pruned_through_cursor::text AS cursor FROM event_retention_state WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.cursor,
    ).toBe("0");
  });

  it("keeps undelivered and A2A-referenced events online after verified archival", async () => {
    corruptReadback = false;
    const worker = createRetentionWorker({
      db,
      workerId: "protected-reference",
      config: { ...config, eventPruneEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await db.query(
      "UPDATE outbox_events SET status='pending',delivered_at=NULL WHERE domain_event_id=$1",
      [eventId],
    );
    await expect(worker.archiveEvents()).resolves.toBe(0);
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);

    await db.query(
      "UPDATE outbox_events SET status='delivered',delivered_at=now()-interval '31 days' WHERE domain_event_id=$1",
      [eventId],
    );
    await expect(worker.archiveEvents()).resolves.toBe(1);
    const agentActorId = (
      await db.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','A2A retention') RETURNING id",
        [workspaceId],
      )
    ).rows[0]!.id;
    const agentId = (
      await db.query<{ id: string }>(
        "INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name) VALUES($1,$2,$3,'A2A retention') RETURNING id",
        [workspaceId, agentActorId, `a2a-retention-${randomUUID()}`],
      )
    ).rows[0]!.id;
    const bindingId = (
      await db.query<{ id: string }>(
        `INSERT INTO a2a_agent_bindings(
           workspace_id,agent_id,protocol_version,external_agent_url,card_hash
         ) VALUES($1,$2,'0.3','https://agent.invalid','sha256:test') RETURNING id`,
        [workspaceId, agentId],
      )
    ).rows[0]!.id;
    await db.query(
      `INSERT INTO a2a_deliveries(
         binding_id,delivery_id,payload,domain_event_id,direction
       ) VALUES($1,$2,'{}'::jsonb,$3,'outbound')`,
      [bindingId, `retention-${randomUUID()}`, eventId],
    );
    await expect(worker.pruneEvents()).resolves.toBe(0);
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await db.query<{ cursor: string }>(
          "SELECT pruned_through_cursor::text AS cursor FROM event_retention_state WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.cursor,
    ).toBe(eventCursor);
  });

  it("retains a protected event while advancing the floor past later ordinary events", async () => {
    await db.query(
      "UPDATE domain_events SET event_type='approval.approved' WHERE id=$1",
      [eventId],
    );
    const ordinaryId = await withTx(db, (tx) =>
      appendEvent(tx, {
        workspaceId,
        actorId,
        correlationId: randomUUID(),
        type: "workspace.updated",
        aggregateType: "workspace",
        aggregateId: workspaceId,
        payload: { reason: "ordinary event after protected fact" },
      }),
    );
    const ordinaryCursor = (
      await db.query<{ cursor: string }>(
        "UPDATE domain_events SET occurred_at=now()-interval '91 days' WHERE id=$1 RETURNING cursor::text",
        [ordinaryId],
      )
    ).rows[0]!.cursor;
    await db.query(
      "UPDATE outbox_events SET status='delivered',delivered_at=now()-interval '31 days' WHERE domain_event_id=$1",
      [ordinaryId],
    );
    corruptReadback = false;
    const worker = createRetentionWorker({
      db,
      workerId: "protected-class",
      config: { ...config, eventPruneEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(worker.archiveEvents()).resolves.toBe(2);
    await expect(worker.pruneEvents()).resolves.toBe(1);
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [ordinaryId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await db.query<{ cursor: string }>(
          "SELECT pruned_through_cursor::text AS cursor FROM event_retention_state WHERE workspace_id=$1",
          [workspaceId],
        )
      ).rows[0]!.cursor,
    ).toBe(ordinaryCursor);
    const cleanupWorker = createRetentionWorker({
      db,
      workerId: "protected-outbox-cleanup",
      config: { ...config, cleanupEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await cleanupWorker.cleanup();
    expect(
      (
        await db.query("SELECT 1 FROM outbox_events WHERE domain_event_id=$1", [
          eventId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("keeps delivered outbox proof until its verified segment is floored", async () => {
    const cleanupWorker = createRetentionWorker({
      db,
      workerId: "outbox-order-cleanup",
      config: { ...config, cleanupEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await cleanupWorker.cleanup();
    expect(
      (
        await db.query("SELECT 1 FROM outbox_events WHERE domain_event_id=$1", [
          eventId,
        ])
      ).rowCount,
    ).toBe(1);

    const archiver = createRetentionWorker({
      db,
      workerId: "outbox-order-archive",
      config,
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(archiver.archiveEvents()).rejects.toThrow(
      "ARTIFACT_CHECKSUM_MISMATCH",
    );
    await cleanupWorker.cleanup();
    expect(
      (
        await db.query("SELECT 1 FROM outbox_events WHERE domain_event_id=$1", [
          eventId,
        ])
      ).rowCount,
    ).toBe(1);

    corruptReadback = false;
    await expect(archiver.archiveEvents()).resolves.toBe(1);
    await cleanupWorker.cleanup();
    expect(
      (
        await db.query("SELECT 1 FROM outbox_events WHERE domain_event_id=$1", [
          eventId,
        ])
      ).rowCount,
    ).toBe(1);

    await db.query(
      "UPDATE domain_events SET event_type='approval.approved' WHERE id=$1",
      [eventId],
    );
    const pruner = createRetentionWorker({
      db,
      workerId: "outbox-order-prune",
      config: { ...config, eventPruneEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(pruner.pruneEvents()).rejects.toThrow(
      "ARCHIVE_SNAPSHOT_RECHECK_FAILED",
    );
    await db.query(
      "UPDATE domain_events SET event_type='workspace.updated' WHERE id=$1",
      [eventId],
    );
    await expect(pruner.pruneEvents()).resolves.toBe(1);
    expect(
      (
        await db.query("SELECT 1 FROM outbox_events WHERE domain_event_id=$1", [
          eventId,
        ])
      ).rowCount,
    ).toBe(0);
  });

  it("keeps Agent webhook delivery references through cleanup and pruning", async () => {
    const agentActorId = (
      await db.query<{ id: string }>(
        "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'agent','Retention test agent') RETURNING id",
        [workspaceId],
      )
    ).rows[0]!.id;
    const agentId = (
      await db.query<{ id: string }>(
        `INSERT INTO agent_definitions(
           workspace_id,actor_id,slug,display_name
         ) VALUES($1,$2,$3,'Retention test agent') RETURNING id`,
        [workspaceId, agentActorId, `retention-${randomUUID()}`],
      )
    ).rows[0]!.id;
    const endpointId = (
      await db.query<{ id: string }>(
        `INSERT INTO agent_webhook_endpoints(agent_id,url)
         VALUES($1,'https://agent.example.test/webhook') RETURNING id`,
        [agentId],
      )
    ).rows[0]!.id;
    await db.query(
      `INSERT INTO agent_webhook_secrets(
         endpoint_id,version,secret_ciphertext,iv,auth_tag,key_version
       ) VALUES($1,1,$2,$3,$4,'v1')`,
      [endpointId, Buffer.from("ciphertext"), Buffer.alloc(12), Buffer.alloc(16)],
    );
    const deliveryId = (
      await db.query<{ id: string }>(
        `INSERT INTO agent_webhook_deliveries(
           agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,
           status,delivered_at,created_at,updated_at
         ) VALUES(
           $1,$2,1,$3,$4,'workspace.updated','delivered',
           now()-interval '31 days',now()-interval '31 days',now()-interval '31 days'
         ) RETURNING id`,
        [agentId, endpointId, eventId, `retention-${randomUUID()}`],
      )
    ).rows[0]!.id;

    corruptReadback = false;
    const worker = createRetentionWorker({
      db,
      workerId: "webhook-reference-retention",
      config: {
        ...config,
        cleanupEnabled: true,
        eventPruneEnabled: true,
      },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(worker.archiveEvents()).resolves.toBe(1);
    await expect(worker.cleanup()).resolves.toBe(0);
    await expect(worker.pruneEvents()).resolves.toBe(0);
    expect(
      (
        await db.query(
          "SELECT 1 FROM agent_webhook_deliveries WHERE id=$1 AND event_id=$2",
          [deliveryId, eventId],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await db.query("SELECT 1 FROM domain_events WHERE id=$1", [eventId]))
        .rowCount,
    ).toBe(1);
  });

  it("wipes generic replay material before deleting the conflict tombstone", async () => {
    await db.query(
      `INSERT INTO api_idempotency_keys(
         workspace_id,actor_id,idempotency_key,operation,request_hash,
         response_status,response_body,created_at,replay_expires_at,
         conflict_expires_at
       ) VALUES
         ($1,$2,'replay-expired','test','sha256:replay',200,'{"ok":true}',
          now()-interval '40 days',now()-interval '31 days',now()+interval '1 day'),
         ($1,$2,'conflict-expired','test','sha256:conflict',NULL,NULL,
          now()-interval '40 days',now()-interval '31 days',now()-interval '1 day'),
         ($1,$2,'replay-current','test','sha256:current',200,'{"ok":true}',
          now(),now()+interval '1 day',now()+interval '30 days')`,
      [workspaceId, actorId],
    );
    const worker = createRetentionWorker({
      db,
      workerId: "generic-idempotency-cleanup",
      config: { ...config, cleanupEnabled: true },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(worker.cleanup()).resolves.toBeGreaterThanOrEqual(2);
    const rows = (
      await db.query<{
        idempotencyKey: string;
        responseBody: unknown | null;
        responseStatus: number | null;
      }>(
        `SELECT idempotency_key AS "idempotencyKey",
                response_body AS "responseBody",
                response_status AS "responseStatus"
           FROM api_idempotency_keys
          WHERE workspace_id=$1 ORDER BY idempotency_key`,
        [workspaceId],
      )
    ).rows;
    expect(rows).toEqual([
      {
        idempotencyKey: "replay-current",
        responseBody: { ok: true },
        responseStatus: 200,
      },
      {
        idempotencyKey: "replay-expired",
        responseBody: null,
        responseStatus: null,
      },
    ]);
  });

  it("uses exact Redis trimming and rejects a stream still above the hard limit", async () => {
    const calls: Array<readonly [string, string, number]> = [];
    let length = 100;
    const exactRedis: ExactRedisClient = {
      isOpen: true,
      async connect() {},
      async xTrim(key, strategy, threshold) {
        calls.push([key, strategy, threshold]);
        return 1;
      },
      async xLen() {
        return length;
      },
      async quit() {},
    };
    const worker = createRetentionWorker({
      db,
      workerId: "redis-exact",
      config,
      storage,
      redisClient: exactRedis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
    });
    await expect(worker.trimRedisExactly()).resolves.toBe(100);
    expect(calls).toEqual([["workmesh:domain-events", "MAXLEN", 100]]);
    length = 101;
    await expect(worker.trimRedisExactly()).rejects.toThrow(
      "REDIS_STREAM_EXACT_TRIM_FAILED",
    );
  });

  it("publishes the effective Worker mode into durable status state", async () => {
    const runtimeIdentity: WorkerRuntimeIdentity = {
      schemaVersion: 1,
      instanceId: "00000000-0000-4000-8000-000000000010",
      buildSha: "a".repeat(40),
      startedAt: "2026-07-29T00:00:00.000Z",
    };
    const worker = createRetentionWorker({
      db,
      workerId: "worker-mode",
      config: { ...config, archiveEnabled: false },
      storage,
      redisClient: redis,
      redisMaxLen: 100,
      workspaceScopeId: workspaceId,
      runtimeIdentity,
    });
    await worker.tick();
    expect(
      (
        await db.query<{
          workerMode: string;
          workerSeenAt: Date;
          workerInstanceId: string;
          workerBuildSha: string;
        }>(
          `SELECT worker_mode AS "workerMode",
                  worker_seen_at AS "workerSeenAt",
                  worker_instance_id::text AS "workerInstanceId",
                  worker_build_sha AS "workerBuildSha"
             FROM retention_job_state
            WHERE job_name='worker_runtime' AND workspace_id=$1`,
          [workspaceId],
        )
      ).rows[0],
    ).toMatchObject({
      workerMode: "disabled",
      workerSeenAt: expect.any(Date),
      workerInstanceId: runtimeIdentity.instanceId,
      workerBuildSha: runtimeIdentity.buildSha,
    });
  });

  it("rejects an external Worker that refreshes the same authoritative row", async () => {
    const candidate: WorkerRuntimeIdentity = {
      schemaVersion: 1,
      instanceId: "00000000-0000-4000-8000-000000000011",
      buildSha: "b".repeat(40),
      startedAt: "2026-07-29T00:00:00.000Z",
    };
    const external: WorkerRuntimeIdentity = {
      ...candidate,
      instanceId: "00000000-0000-4000-8000-000000000012",
    };
    const create = (runtimeIdentity: WorkerRuntimeIdentity) =>
      createRetentionWorker({
        db,
        workerId: `identity-${runtimeIdentity.instanceId}`,
        config: {
          ...config,
          archiveEnabled: true,
          eventPruneEnabled: false,
          eventOnlineDays: 365,
        },
        storage,
        redisClient: redis,
        redisMaxLen: 100,
        workspaceScopeId: workspaceId,
        runtimeIdentity,
      });
    const readRuntime = async () =>
      (
        await db.query<{
          workerMode: string | null;
          workerSeenAt: Date | null;
          workerInstanceId: string | null;
          workerBuildSha: string | null;
        }>(
          `SELECT worker_mode AS "workerMode",
                  worker_seen_at AS "workerSeenAt",
                  worker_instance_id::text AS "workerInstanceId",
                  worker_build_sha AS "workerBuildSha"
             FROM retention_job_state
            WHERE job_name='worker_runtime' AND workspace_id=$1`,
          [workspaceId],
        )
      ).rows[0]!;
    const candidateContainerIdentity = {
      ...candidate,
      containerId: "candidate-container-id",
    };

    await create(candidate).tick();
    const candidateRuntime = await readRuntime();
    expect(() =>
      retentionSoakWorkerFreshnessProof(
        candidateContainerIdentity,
        candidateRuntime,
        new Date(),
      ),
    ).not.toThrow();

    await create(external).tick();
    const externalRuntime = await readRuntime();
    expect(() =>
      retentionSoakWorkerFreshnessProof(
        candidateContainerIdentity,
        externalRuntime,
        new Date(),
      ),
    ).toThrow("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
  });
});
