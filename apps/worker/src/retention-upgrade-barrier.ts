import { createHash } from "node:crypto";
import type {
  ArtifactObjectVersionHead,
  ArtifactObjectVersionInventory,
  S3RetentionUpgradeReader,
} from "@workmesh/artifact-storage";
import type { Db } from "@workmesh/db";

export const RETENTION_UPGRADE_EXPECTED_MIGRATIONS = [
  "0001_stage0",
  "0002_stage0_integrity_delivery",
  "0003_stage1_agent_identity_delegation",
  "0004_stage1_session_execution",
  "0005_stage1_tokens_webhooks_events",
  "0006_stage1_review_fixes",
  "0007_stage2_work_rooms_leases_handoffs",
  "0008_stage3_delivery_control_plane",
  "0009_stage3_production_adapters",
  "0010_stage3_provider_projection_provenance",
  "0011_stage3_provider_review_projection",
  "0012_stage3_regate_fencing_and_decisions",
  "0013_stage3_audit_closure",
  "0014_provider_action_kinds",
  "0015_stage4_planning_views_templates",
  "0016_stage4_usage_notifications",
  "0017_stage4_automation_control_plane",
  "0018_stage4_loops_health_a2a",
  "0019_stage4_gitea",
  "0020_stage4_review_hardening",
  "0021_stage4_a2a_direction_and_prompt_identity",
  "0022_route_policy_authorization_denials",
  "0023_auth_idempotency_records",
  "0024_cursor_pagination_indexes",
  "0025_realtime_event_envelope",
  "0026_retention_archive_and_heartbeat_health",
  "0027_worker_runtime_identity",
  "0028_worker_identity_conflict_count",
  "0029_exact_archive_membership",
] as const;

export type RetentionUpgradeBarrierErrorCode =
  | "RETENTION_UPGRADE_EXPECT_THROUGH_UNSUPPORTED"
  | "RETENTION_UPGRADE_SCHEMA_0030_PRESENT"
  | "RETENTION_UPGRADE_SCHEMA_LEDGER_MISMATCH"
  | "RETENTION_UPGRADE_RETENTION_CLAIM_ACTIVE"
  | "RETENTION_UPGRADE_S3_LIST_DENIED"
  | "RETENTION_UPGRADE_S3_LIST_FAILED"
  | "RETENTION_UPGRADE_DELETE_MARKER"
  | "RETENTION_UPGRADE_MULTIVERSION"
  | "RETENTION_UPGRADE_OBJECT_ORPHAN"
  | "RETENTION_UPGRADE_OBJECT_MISSING"
  | "RETENTION_UPGRADE_OBJECT_DUPLICATE"
  | "RETENTION_UPGRADE_OBJECT_HEAD_DENIED"
  | "RETENTION_UPGRADE_OBJECT_MISMATCH"
  | "RETENTION_UPGRADE_SNAPSHOT_UNSTABLE";

type SafeBarrierDetails = Readonly<{
  key?: string;
  versionId?: string;
  digest?: string;
  count?: number;
}>;

export class RetentionUpgradeBarrierError extends Error {
  readonly code: RetentionUpgradeBarrierErrorCode;
  readonly details: SafeBarrierDetails;

  constructor(
    code: RetentionUpgradeBarrierErrorCode,
    details: SafeBarrierDetails = {},
  ) {
    super(code);
    this.name = "RetentionUpgradeBarrierError";
    this.code = code;
    this.details = details;
  }
}

type BarrierStorage = Pick<
  S3RetentionUpgradeReader,
  "listObjectVersions" | "inspectObjectVersion"
>;

type ArchiveRow = Readonly<{
  key: string;
  versionId: string;
  checksum: string;
  sizeBytes: string;
  retainUntil: Date;
}>;

type SnapshotObject = Readonly<{
  key: string;
  versionId: string;
  checksum: string;
  checksumHeader: string;
  sizeBytes: number;
  mimeType: string;
  retainUntil: string;
  objectLockMode: string;
}>;

type BarrierSnapshot = Readonly<{
  digest: string;
  objectCount: number;
  objects: readonly SnapshotObject[];
}>;

export type RetentionUpgradeBarrierResult = Readonly<{
  expectedThrough: 29;
  snapshotDigest: string;
  objectCount: number;
  snapshots: 2;
  checkedAt: string;
}>;

const httpStatus = (error: unknown): number | undefined =>
  error && typeof error === "object"
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode
    : undefined;

const errorName = (error: unknown): string | undefined =>
  error instanceof Error ? error.name : undefined;

const isDenied = (error: unknown): boolean =>
  httpStatus(error) === 401 ||
  httpStatus(error) === 403 ||
  errorName(error) === "AccessDenied";

const isMissing = (error: unknown): boolean =>
  httpStatus(error) === 404 || errorName(error) === "NotFound";

const checksumBase64 = (checksum: string): string =>
  Buffer.from(checksum.replace(/^sha256:/, ""), "hex").toString("base64");

const objectId = (key: string, versionId: string): string =>
  `${key}\u0000${versionId}`;

const stableDigest = (value: unknown): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const exactMigrations = async (db: Pick<Db, "query">): Promise<void> => {
  const versions = (
    await db.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    )
  ).rows.map((row) => row.version);
  if (versions.includes("0030_durable_archive_upload_intents"))
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_SCHEMA_0030_PRESENT",
    );
  if (
    versions.length !== RETENTION_UPGRADE_EXPECTED_MIGRATIONS.length ||
    versions.some(
      (version, index) =>
        version !== RETENTION_UPGRADE_EXPECTED_MIGRATIONS[index],
    )
  )
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_SCHEMA_LEDGER_MISMATCH",
      { count: versions.length },
    );
};

const assertNoActiveClaim = async (db: Pick<Db, "query">): Promise<void> => {
  const active = (
    await db.query<{ count: string }>(
      `
      SELECT count(*)::text AS count
        FROM retention_job_state
       WHERE job_name<>'worker_runtime'
         AND lease_owner IS NOT NULL
         AND lease_expires_at>now()
    `,
    )
  ).rows[0]?.count;
  if (active !== "0")
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_RETENTION_CLAIM_ACTIVE",
      { count: Number(active ?? "0") },
    );
};

const archiveRows = async (
  db: Pick<Db, "query">,
): Promise<readonly ArchiveRow[]> =>
  (
    await db.query<ArchiveRow>(
      `
      SELECT object_key AS key,object_version_id AS "versionId",
             object_sha256 AS checksum,
             object_size_bytes::text AS "sizeBytes",
             retain_until AS "retainUntil"
        FROM event_archive_segments
       WHERE object_version_id IS NOT NULL
       ORDER BY object_key,object_version_id
    `,
    )
  ).rows;

const listInventory = async (
  storage: BarrierStorage,
  prefix: string,
): Promise<ArtifactObjectVersionInventory> => {
  try {
    return await storage.listObjectVersions(prefix);
  } catch (error) {
    throw new RetentionUpgradeBarrierError(
      isDenied(error)
        ? "RETENTION_UPGRADE_S3_LIST_DENIED"
        : "RETENTION_UPGRADE_S3_LIST_FAILED",
    );
  }
};

const assertInventoryBijection = (
  rows: readonly ArchiveRow[],
  inventory: ArtifactObjectVersionInventory,
): ReadonlyMap<string, ArchiveRow> => {
  if (inventory.deleteMarkers.length) {
    const marker = inventory.deleteMarkers[0]!;
    throw new RetentionUpgradeBarrierError("RETENTION_UPGRADE_DELETE_MARKER", {
      key: marker.key,
      versionId: marker.versionId,
      count: inventory.deleteMarkers.length,
    });
  }
  const versionsByKey = new Map<string, number>();
  for (const version of inventory.versions)
    versionsByKey.set(version.key, (versionsByKey.get(version.key) ?? 0) + 1);
  const multi = [...versionsByKey].find(([, count]) => count !== 1);
  if (multi)
    throw new RetentionUpgradeBarrierError("RETENTION_UPGRADE_MULTIVERSION", {
      key: multi[0],
      count: multi[1],
    });

  const database = new Map<string, ArchiveRow>();
  for (const row of rows) {
    const id = objectId(row.key, row.versionId);
    if (database.has(id))
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_DUPLICATE",
        { key: row.key, versionId: row.versionId },
      );
    database.set(id, row);
  }
  const listed = new Set(
    inventory.versions.map((version) =>
      objectId(version.key, version.versionId),
    ),
  );
  for (const version of inventory.versions)
    if (!database.has(objectId(version.key, version.versionId)))
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_ORPHAN",
        { key: version.key, versionId: version.versionId },
      );
  for (const row of rows)
    if (!listed.has(objectId(row.key, row.versionId)))
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_MISSING",
        { key: row.key, versionId: row.versionId },
      );
  return database;
};

const inspectVersion = async (
  storage: BarrierStorage,
  row: ArchiveRow,
): Promise<ArtifactObjectVersionHead> => {
  try {
    return await storage.inspectObjectVersion({
      key: row.key,
      versionId: row.versionId,
    });
  } catch (error) {
    if (isMissing(error))
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_MISSING",
        { key: row.key, versionId: row.versionId },
      );
    if (isDenied(error))
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_HEAD_DENIED",
        { key: row.key, versionId: row.versionId },
      );
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_OBJECT_MISMATCH",
      { key: row.key, versionId: row.versionId },
    );
  }
};

const captureSnapshot = async ({
  db,
  storage,
  prefix,
}: {
  db: Pick<Db, "query">;
  storage: BarrierStorage;
  prefix: string;
}): Promise<BarrierSnapshot> => {
  await exactMigrations(db);
  await assertNoActiveClaim(db);
  const rows = await archiveRows(db);
  const inventory = await listInventory(storage, prefix);
  const database = assertInventoryBijection(rows, inventory);
  const objects: SnapshotObject[] = [];
  for (const version of [...inventory.versions].sort((left, right) =>
    objectId(left.key, left.versionId).localeCompare(
      objectId(right.key, right.versionId),
    ),
  )) {
    const row = database.get(objectId(version.key, version.versionId))!;
    const head = await inspectVersion(storage, row);
    if (
      head.versionId !== row.versionId ||
      head.sizeBytes !== Number(row.sizeBytes) ||
      head.mimeType !== "application/gzip" ||
      head.checksum !== row.checksum ||
      head.checksumHeader !== checksumBase64(row.checksum) ||
      head.objectLockMode !== "COMPLIANCE" ||
      !head.retainUntil ||
      head.retainUntil.getTime() !== row.retainUntil.getTime()
    )
      throw new RetentionUpgradeBarrierError(
        "RETENTION_UPGRADE_OBJECT_MISMATCH",
        { key: row.key, versionId: row.versionId },
      );
    objects.push({
      key: row.key,
      versionId: row.versionId,
      checksum: head.checksum,
      checksumHeader: head.checksumHeader,
      sizeBytes: head.sizeBytes,
      mimeType: head.mimeType,
      retainUntil: head.retainUntil.toISOString(),
      objectLockMode: head.objectLockMode,
    });
  }
  return {
    digest: stableDigest(objects),
    objectCount: objects.length,
    objects,
  };
};

export async function runRetentionUpgradeBarrier({
  db,
  storage,
  archivePrefix,
  expectThrough,
  stabilityDelayMs = 5_000,
  delay = (milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date(),
}: {
  db: Pick<Db, "query">;
  storage: BarrierStorage;
  archivePrefix: string;
  expectThrough: number;
  stabilityDelayMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}): Promise<RetentionUpgradeBarrierResult> {
  if (expectThrough !== 29)
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_EXPECT_THROUGH_UNSUPPORTED",
      { count: expectThrough },
    );
  const prefix = `${archivePrefix.replace(/\/+$/, "")}/`;
  const first = await captureSnapshot({ db, storage, prefix });
  await delay(stabilityDelayMs);
  const second = await captureSnapshot({ db, storage, prefix });
  if (
    first.digest !== second.digest ||
    first.objectCount !== second.objectCount
  )
    throw new RetentionUpgradeBarrierError(
      "RETENTION_UPGRADE_SNAPSHOT_UNSTABLE",
      { digest: second.digest, count: second.objectCount },
    );
  return {
    expectedThrough: 29,
    snapshotDigest: second.digest,
    objectCount: second.objectCount,
    snapshots: 2,
    checkedAt: now().toISOString(),
  };
}
