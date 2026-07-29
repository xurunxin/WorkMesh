import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  S3ArtifactStorage,
  S3RetentionUpgradeReader,
} from "@workmesh/artifact-storage";
import { applyMigrations, createDb, type Db } from "@workmesh/db";
import { runRetentionUpgradeBarrier } from "../src/retention-upgrade-barrier.js";

const databaseUrl = process.env.DATABASE_URL;
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const retentionUpgradeIntegrationEnabled =
  process.env.RUN_RETENTION_UPGRADE_INTEGRATION === "1";
if (
  retentionUpgradeIntegrationEnabled &&
  (process.env.RUN_INTEGRATION !== "1" ||
    !databaseUrl ||
    !endpoint ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey)
)
  throw new Error(
    "Retention upgrade barrier integration requires RUN_INTEGRATION=1, " +
      "RUN_RETENTION_UPGRADE_INTEGRATION=1, DATABASE_URL, and S3 settings.",
  );
if (
  retentionUpgradeIntegrationEnabled &&
  !/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl!).pathname.slice(1))
)
  throw new Error(
    "Retention upgrade barrier integration requires a dedicated *test* database.",
  );

const configuredDatabaseUrl =
  databaseUrl ??
  "postgres://disabled:disabled@127.0.0.1:1/workmesh_retention_upgrade_test_disabled";
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `workmesh_test_retention_upgrade_${suffix}`;
const archivePrefix = `retention-upgrade/${suffix}`;
const objectKey = `${archivePrefix}/segment.ndjson.gz`;
const admin = createDb(configuredDatabaseUrl);
let barrierDb: Db;
const databaseUrlFor = (database: string): string => {
  const url = new URL(configuredDatabaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
};
const config = {
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: endpoint ?? "http://127.0.0.1:1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: accessKeyId ?? "disabled",
    secretAccessKey: secretAccessKey ?? "disabled",
  },
};
const storage = new S3ArtifactStorage({ bucket: bucket ?? "disabled", config });
const reader = new S3RetentionUpgradeReader({
  bucket: bucket ?? "disabled",
  config,
});

beforeAll(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  barrierDb = createDb(databaseUrlFor(databaseName));
  await applyMigrations(barrierDb, { through: 29 });
}, 120_000);

afterAll(async () => {
  await barrierDb?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

const testSuite = retentionUpgradeIntegrationEnabled ? describe : describe.skip;

testSuite("retention upgrade barrier with real PostgreSQL and MinIO", () => {
  it("proves one exact version with versioned HEAD and zero delete markers", async () => {
    await expect(storage.probeRetentionProtection()).resolves.toBeUndefined();
    const body = Buffer.from("real retention upgrade barrier object");
    const checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const segmentId = randomUUID();
    const snapshotDigest = `sha256:${"a".repeat(64)}`;
    const fixedCutoffAt = new Date(Date.now() - 90 * 86_400_000);
    const retainUntil = new Date(Date.now() + 366 * 86_400_000);
    const archiveIdentity = {
      segmentId,
      snapshotDigest,
      fixedCutoffAt: fixedCutoffAt.toISOString(),
    };
    const uploaded = await storage.putObject(
      {
        key: objectKey,
        checksum,
        sizeBytes: body.length,
        mimeType: "application/gzip",
        retainUntil,
        archiveIdentity,
      },
      body,
    );
    const current = await storage.reconcilePinnedObject({
      key: objectKey,
      versionId: uploaded.versionId,
      checksum,
      sizeBytes: body.length,
      mimeType: "application/gzip",
      retainUntil,
      archiveIdentity,
    });
    expect(current.lastModified).toBeInstanceOf(Date);
    const targetRetainUntil = new Date(
      current.lastModified.getTime() + (367 * 86_400 + 3_600) * 1_000,
    );
    const extended = await storage.extendRetention(
      {
        key: objectKey,
        versionId: uploaded.versionId,
        checksum,
        sizeBytes: body.length,
        mimeType: "application/gzip",
        retainUntil: targetRetainUntil,
        archiveIdentity,
      },
      targetRetainUntil,
    );
    expect(extended).toMatchObject({
      versionId: uploaded.versionId,
      lastModified: current.lastModified,
    });
    expect(extended.retainUntil.getTime()).toBeGreaterThanOrEqual(
      targetRetainUntil.getTime(),
    );
    expect(extended.retainUntil.getTime()).toBeGreaterThan(
      retainUntil.getTime(),
    );
    const workspaceId = (
      await barrierDb.query<{ id: string }>(
        `INSERT INTO workspaces(name,slug)
         VALUES('Upgrade barrier integration',$1)
         RETURNING id`,
        [`upgrade-barrier-${suffix}`],
      )
    ).rows[0]!.id;
    await barrierDb.query(
      `INSERT INTO event_archive_segments(
         id,workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
         object_key,object_version_id,object_size_bytes,object_sha256,
         snapshot_digest,metadata,state,retain_until,uploaded_at,
         membership_state
       ) VALUES(
         $1,$2,1,1,$3,1,$4,$5,$6,$7,$8,'{}',
         'uploaded',$9,now(),'pending_exact'
       )`,
      [
        segmentId,
        workspaceId,
        fixedCutoffAt,
        objectKey,
        uploaded.versionId,
        body.length,
        checksum,
        snapshotDigest,
        extended.retainUntil,
      ],
    );

    const barrier = await runRetentionUpgradeBarrier({
      db: barrierDb,
      storage: reader,
      archivePrefix,
      expectThrough: 29,
      stabilityDelayMs: 10,
    });
    expect(barrier).toMatchObject({
      expectedThrough: 29,
      objectCount: 1,
      snapshots: 2,
      snapshotDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });

    const inventory = await reader.listObjectVersions(`${archivePrefix}/`);
    expect(inventory.versions).toEqual([
      { key: objectKey, versionId: uploaded.versionId },
    ]);
    expect(inventory.deleteMarkers).toEqual([]);
    await expect(
      reader.inspectObjectVersion({
        key: objectKey,
        versionId: uploaded.versionId,
      }),
    ).resolves.toMatchObject({
      versionId: uploaded.versionId,
      sizeBytes: body.length,
      mimeType: "application/gzip",
      checksum,
      objectLockMode: "COMPLIANCE",
      retainUntil: extended.retainUntil,
    });
    console.info(
      "RETENTION_EXTENSION_REAL_PROOF",
      JSON.stringify({
        versionId: uploaded.versionId,
        lastModified: current.lastModified.toISOString(),
        initialRetainUntil: retainUntil.toISOString(),
        finalRetainUntil: extended.retainUntil.toISOString(),
        versionCount: inventory.versions.length,
        deleteMarkerCount: inventory.deleteMarkers.length,
        barrier,
      }),
    );
  }, 120_000);
});
