import { createHash, randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { createClient } from "redis";
import {
  loadRetentionConfig,
  loadRealtimeRedisHintConfig,
  type RetentionConfig,
} from "@workmesh/config";
import {
  artifactStorageFromEnvironment,
  type ArtifactObjectExpectation,
  type S3ArtifactStorage,
} from "@workmesh/artifact-storage";
import { withTx, type Db } from "@workmesh/db";
import { safeRetentionErrorCode } from "./retention-error.js";
import {
  createWorkerRuntimeIdentity,
  type WorkerRuntimeIdentity,
} from "./worker-runtime-identity.js";

const STREAM_KEY = "workmesh:domain-events";
const sha256 = (value: Uint8Array | string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
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
export type RetentionClaim = Readonly<{
  jobName: string;
  workspaceId: string;
  owner: string;
  fence: string;
  fixedCutoffAt: Date;
  watermarkCursor: string;
}>;

type ArchivedEvent = Readonly<{
  cursor: string;
  id: string;
  workspace_id: string;
  team_id: string | null;
  audience_actor_id: string | null;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_revision: number | null;
  actor_id: string;
  correlation_id: string;
  idempotency_key: string | null;
  session_id: string | null;
  session_sequence: string | null;
  causation_id: string | null;
  payload: unknown;
  occurred_at: Date;
}>;

type ArchivedEventResource = Readonly<{
  relation: "scope" | "invalidate";
  resource_type: string;
  resource_id: string;
  created_at: string;
}>;

type ArchivedOutboxProof = Readonly<{
  id: string;
  topic: string;
  partition_key: string;
  status: "delivered";
  attempt_count: number;
  available_at: string;
  delivered_at: string;
  created_at: string;
}>;

type ArchivedRecord = Readonly<{
  event: ArchivedEvent;
  resources: readonly ArchivedEventResource[];
  outbox: ArchivedOutboxProof;
}>;

type ArchivedRecordRow = ArchivedEvent &
  Readonly<{
    resources: readonly ArchivedEventResource[];
    outbox: ArchivedOutboxProof | null;
  }>;

type QueryExecutor = Pick<Db, "query">;

export type ArchiveObjectStore = Pick<
  S3ArtifactStorage,
  | "putObjectIfAbsent"
  | "reconcileCurrentObject"
  | "readVerifiedObject"
  | "verify"
  | "probeRetentionProtection"
>;

type ArchiveSegmentObject = Readonly<{
  id: string;
  workspaceId: string;
  startCursor: string;
  endCursor: string;
  rowCount: number;
  snapshotDigest: string;
  objectKey: string;
  objectVersionId: string | null;
  objectSizeBytes: string;
  objectSha256: string;
  fixedCutoffAt: Date;
  retainUntil: Date;
  prunedAt: Date | null;
  state: "planned" | "uploaded" | "verified" | "pruned" | "failed";
  membershipState: "pending_exact" | "exact" | "legacy_unindexed";
  plannedFence: string | null;
  lastErrorCode: string | null;
}>;

type ArchiveMember = Readonly<{
  ordinal: number;
  eventId: string;
  eventCursor: string;
  recordSha256: string;
  record: unknown;
}>;

export type ArchiveFaultPoint =
  | "after_plan_commit"
  | "after_put"
  | "before_upload_commit"
  | "after_upload_commit"
  | "before_finalize_commit"
  | "mid_finalize"
  | "after_finalize_commit";

const archiveExpectation = (
  segment: ArchiveSegmentObject,
): ArtifactObjectExpectation => ({
  key: segment.objectKey,
  ...(segment.objectVersionId
    ? { versionId: segment.objectVersionId }
    : {}),
  checksum: segment.objectSha256,
  sizeBytes: Number(segment.objectSizeBytes),
  mimeType: "application/gzip",
  retainUntil: segment.retainUntil,
  ...(segment.plannedFence !== null
    ? {
        archiveIdentity: {
          segmentId: segment.id,
          snapshotDigest: segment.snapshotDigest,
          fixedCutoffAt: segment.fixedCutoffAt.toISOString(),
        },
      }
    : {}),
});

const parseArchiveMembers = (
  body: Uint8Array,
  segment: ArchiveSegmentObject,
): readonly ArchiveMember[] => {
  let lines: string[];
  try {
    lines = gunzipSync(body).toString("utf8").trimEnd().split("\n");
  } catch {
    throw new Error("ARCHIVE_OBJECT_DECODE_FAILED");
  }
  let metadata: unknown;
  let records: unknown[];
  try {
    metadata = JSON.parse(lines.shift() ?? "{}") as unknown;
    records = lines.map((line) => JSON.parse(line) as unknown);
  } catch {
    throw new Error("ARCHIVE_OBJECT_JSON_INVALID");
  }
  const envelope =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)._meta
      : undefined;
  const meta =
    envelope && typeof envelope === "object"
      ? (envelope as Record<string, unknown>)
      : undefined;
  if (
    meta?.format !== "workmesh-domain-event-records-ndjson-v1" ||
    meta.workspaceId !== segment.workspaceId ||
    meta.startCursor !== segment.startCursor ||
    meta.endCursor !== segment.endCursor ||
    meta.fixedCutoffAt !== segment.fixedCutoffAt.toISOString() ||
    meta.rowCount !== segment.rowCount ||
    meta.snapshotDigest !== segment.snapshotDigest ||
    records.length !== segment.rowCount ||
    sha256(records.map(canonicalLine).join("")) !== segment.snapshotDigest
  )
    throw new Error("ARCHIVE_OBJECT_MANIFEST_MISMATCH");

  const members = records.map((record, ordinal): ArchiveMember => {
    const event =
      record && typeof record === "object"
        ? (record as Record<string, unknown>).event
        : undefined;
    const eventValue =
      event && typeof event === "object"
        ? (event as Record<string, unknown>)
        : undefined;
    if (
      !eventValue ||
      typeof eventValue.id !== "string" ||
      typeof eventValue.cursor !== "string" ||
      !/^[1-9][0-9]*$/.test(eventValue.cursor) ||
      eventValue.workspace_id !== segment.workspaceId
    )
      throw new Error("ARCHIVE_OBJECT_RECORD_INVALID");
    return {
      ordinal,
      eventId: eventValue.id,
      eventCursor: eventValue.cursor,
      recordSha256: sha256(canonicalLine(record)),
      record,
    };
  });
  if (
    members[0]?.eventCursor !== segment.startCursor ||
    members.at(-1)?.eventCursor !== segment.endCursor ||
    members.some(
      (member, index) =>
        index > 0 &&
        BigInt(member.eventCursor) <= BigInt(members[index - 1]!.eventCursor),
    ) ||
    new Set(members.map((member) => member.eventId)).size !== members.length
  )
    throw new Error("ARCHIVE_OBJECT_MEMBERSHIP_INVALID");
  return members;
};
export type ExactRedisClient = Readonly<{
  isOpen: boolean;
  connect: () => Promise<unknown>;
  xTrim: (
    key: string,
    strategy: "MAXLEN",
    threshold: number,
  ) => Promise<number>;
  xLen: (key: string) => Promise<number>;
  quit: () => Promise<unknown>;
}>;

export const ordinaryPrunableEventTypes = new Set([
  "workspace.updated",
  "team.created",
  "team.updated",
  "project.created",
  "project.updated",
  "work_item.created",
  "work_item.updated",
  "work_item.state_changed",
  "comment.created",
  "comment.updated",
  "agent.session.health_changed",
  "agent.activity.appended",
  "notification.created",
  "notification.read",
  "notification.preferences_updated",
]);

export type RetentionWorker = Readonly<{
  claim: (jobName: string, cutoff: Date) => Promise<RetentionClaim | undefined>;
  guardedProgress: (
    claim: RetentionClaim,
    input: {
      watermarkCursor?: string;
      counters?: Record<string, number>;
      complete?: boolean;
      errorCode?: string;
    },
  ) => Promise<void>;
  cleanup: () => Promise<number>;
  archiveEvents: () => Promise<number>;
  pruneEvents: () => Promise<number>;
  trimRedisExactly: () => Promise<number>;
  tick: () => Promise<void>;
  close: () => Promise<void>;
}>;

export function createRetentionWorker({
  db,
  workerId = `retention-${randomUUID()}`,
  runtimeIdentity = createWorkerRuntimeIdentity(),
  config = loadRetentionConfig(),
  storage,
  redisClient,
  redisMaxLen,
  workspaceScopeId,
  beforePruneCommit,
  afterCleanupClaim,
  afterArchiveClaim,
  afterPruneClaim,
  archiveFault,
}: {
  db: Db;
  workerId?: string;
  runtimeIdentity?: WorkerRuntimeIdentity;
  config?: RetentionConfig;
  storage?: ArchiveObjectStore;
  redisClient?: ExactRedisClient;
  redisMaxLen?: number;
  workspaceScopeId?: string;
  beforePruneCommit?: (input: {
    workspaceId: string;
    segmentId: string;
    eventIds: readonly string[];
  }) => Promise<void> | void;
  afterCleanupClaim?: (claim: RetentionClaim) => Promise<void> | void;
  afterArchiveClaim?: (claim: RetentionClaim) => Promise<void> | void;
  afterPruneClaim?: (claim: RetentionClaim) => Promise<void> | void;
  archiveFault?: (
    point: ArchiveFaultPoint,
    input: Readonly<{ claim: RetentionClaim; segmentId: string }>,
  ) => Promise<void> | void;
}): RetentionWorker {
  const objectStore = storage ?? artifactStorageFromEnvironment();
  const realtime =
    !redisClient || redisMaxLen === undefined
      ? loadRealtimeRedisHintConfig()
      : undefined;
  const exactRedisMaxLen = redisMaxLen ?? realtime!.maxLen;
  const redis =
    redisClient ??
    (createClient({ url: realtime!.redisUrl }) as unknown as ExactRedisClient);
  const workerMode = !config.archiveEnabled
    ? "disabled"
    : config.eventPruneEnabled
      ? "archive_and_prune"
      : "archive_only";

  const publishWorkerMode = async (): Promise<void> => {
    await db.query(
      `
      INSERT INTO retention_job_state(
        job_name,workspace_id,worker_mode,worker_seen_at,
        worker_instance_id,worker_build_sha
      )
      SELECT 'worker_runtime',id,$1,now(),$3::uuid,$4
        FROM workspaces
       WHERE $2::uuid IS NULL OR id=$2
      ON CONFLICT(job_name,workspace_id) DO UPDATE
        SET worker_mode=EXCLUDED.worker_mode,
            worker_seen_at=EXCLUDED.worker_seen_at,
            worker_identity_conflict_count=
              retention_job_state.worker_identity_conflict_count
              + CASE
                  WHEN retention_job_state.worker_instance_id IS NOT NULL
                   AND retention_job_state.worker_build_sha IS NOT NULL
                   AND EXCLUDED.worker_instance_id IS NOT NULL
                   AND EXCLUDED.worker_build_sha IS NOT NULL
                   AND (
                     retention_job_state.worker_instance_id,
                     retention_job_state.worker_build_sha
                   ) IS DISTINCT FROM (
                     EXCLUDED.worker_instance_id,
                     EXCLUDED.worker_build_sha
                   )
                  THEN 1
                  ELSE 0
                END,
            worker_instance_id=EXCLUDED.worker_instance_id,
            worker_build_sha=EXCLUDED.worker_build_sha,
            updated_at=now()
    `,
      [
        workerMode,
        workspaceScopeId ?? null,
        runtimeIdentity.instanceId,
        runtimeIdentity.buildSha,
      ],
    );
  };

  const claim = async (
    jobName: string,
    cutoff: Date,
  ): Promise<RetentionClaim | undefined> =>
    withTx(db, async (tx) => {
      await tx.query(
        `
        INSERT INTO retention_job_state(job_name,workspace_id)
        SELECT $1,id FROM workspaces
         WHERE $2::uuid IS NULL OR id=$2
        ON CONFLICT(job_name,workspace_id) DO NOTHING
      `,
        [jobName, workspaceScopeId ?? null],
      );
      const result = await tx.query<{
        jobName: string;
        workspaceId: string;
        owner: string;
        fence: string;
        fixedCutoffAt: Date;
        watermarkCursor: string;
      }>(
        `
        WITH candidate AS (
          SELECT job_name,workspace_id
           FROM retention_job_state
           WHERE job_name=$1
             AND ($5::uuid IS NULL OR workspace_id=$5)
             AND (lease_expires_at IS NULL OR lease_expires_at<=now())
           ORDER BY last_completed_at NULLS FIRST,workspace_id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
        )
        UPDATE retention_job_state state
           SET lease_owner=$2,
               lease_expires_at=now()+($4::text||' seconds')::interval,
               fence=state.fence+1,
               fixed_cutoff_at=COALESCE(state.fixed_cutoff_at,$3),
               last_started_at=now(),last_error_code=NULL,updated_at=now()
          FROM candidate
         WHERE state.job_name=candidate.job_name
           AND state.workspace_id=candidate.workspace_id
        RETURNING state.job_name AS "jobName",state.workspace_id AS "workspaceId",
                  state.lease_owner AS owner,state.fence::text AS fence,
                  state.fixed_cutoff_at AS "fixedCutoffAt",
                  state.watermark_cursor::text AS "watermarkCursor"
      `,
        [
          jobName,
          workerId,
          cutoff,
          config.leaseSeconds,
          workspaceScopeId ?? null,
        ],
      );
      return result.rows[0];
    });

  const writeGuardedProgress = async (
    executor: QueryExecutor,
    claimValue: RetentionClaim,
    input: {
      watermarkCursor?: string;
      counters?: Record<string, number>;
      complete?: boolean;
      errorCode?: string;
    },
  ): Promise<void> => {
    const result = await executor.query(
      `
       UPDATE retention_job_state
          SET watermark_cursor=GREATEST(
                watermark_cursor,
                COALESCE($4,watermark_cursor)
              ),
             counters=CASE WHEN $5::jsonb IS NULL THEN counters ELSE counters||$5::jsonb END,
             last_error_code=$6,
             last_completed_at=CASE WHEN $7 THEN now() ELSE last_completed_at END,
             fixed_cutoff_at=CASE WHEN $7 THEN NULL ELSE fixed_cutoff_at END,
             lease_owner=CASE WHEN $7 THEN NULL ELSE lease_owner END,
             lease_expires_at=CASE WHEN $7 THEN NULL ELSE now()+($8::text||' seconds')::interval END,
             updated_at=now()
       WHERE job_name=$1 AND workspace_id=$2
         AND lease_owner=$3 AND fence=$9::bigint AND lease_expires_at>now()
    `,
      [
        claimValue.jobName,
        claimValue.workspaceId,
        claimValue.owner,
        input.watermarkCursor ?? null,
        input.counters ?? null,
        input.errorCode ?? null,
        input.complete ?? false,
        config.leaseSeconds,
        claimValue.fence,
      ],
    );
    if (result.rowCount !== 1) throw new Error("RETENTION_CLAIM_LOST");
  };
  const guardedProgress = async (
    claimValue: RetentionClaim,
    input: {
      watermarkCursor?: string;
      counters?: Record<string, number>;
      complete?: boolean;
      errorCode?: string;
    },
  ): Promise<void> => writeGuardedProgress(db, claimValue, input);

  const assertClaim = async (
    executor: QueryExecutor,
    claimValue: RetentionClaim,
  ): Promise<void> => {
    const result = await executor.query(
      `
      SELECT 1
        FROM retention_job_state
       WHERE job_name=$1 AND workspace_id=$2
         AND lease_owner=$3 AND fence=$4::bigint
         AND lease_expires_at>now()
       FOR UPDATE
    `,
      [
        claimValue.jobName,
        claimValue.workspaceId,
        claimValue.owner,
        claimValue.fence,
      ],
    );
    if (result.rowCount !== 1) throw new Error("RETENTION_CLAIM_LOST");
  };

  const loadArchiveRecords = async (
    executor: QueryExecutor,
    input: {
      workspaceId: string;
      afterCursor: string;
      cutoff: Date;
      endCursor?: string;
      eventIds?: readonly string[];
      excludeTrustedMembership: boolean;
      limit: number;
    },
  ): Promise<readonly ArchivedRecord[]> => {
    const rows = (
      await executor.query<ArchivedRecordRow>(
        `
        SELECT event.cursor::text,event.id,event.workspace_id,event.team_id,
               event.audience_actor_id,event.event_type,event.event_version,
               event.aggregate_type,event.aggregate_id,event.aggregate_revision,
               event.actor_id,event.correlation_id,event.idempotency_key,
               event.session_id,event.session_sequence::text,event.causation_id,
               event.payload,event.occurred_at,
               COALESCE((
                 SELECT jsonb_agg(
                   jsonb_build_object(
                     'relation',resource.relation,
                     'resource_type',resource.resource_type,
                     'resource_id',resource.resource_id,
                     'created_at',resource.created_at
                   )
                   ORDER BY resource.relation,resource.resource_type,
                            resource.resource_id
                 )
                   FROM domain_event_resources resource
                  WHERE resource.domain_event_id=event.id
               ),'[]'::jsonb) AS resources,
               (
                 SELECT jsonb_build_object(
                   'id',outbox.id,
                   'topic',outbox.topic,
                   'partition_key',outbox.partition_key,
                   'status',outbox.status,
                   'attempt_count',outbox.attempt_count,
                   'available_at',outbox.available_at,
                   'delivered_at',outbox.delivered_at,
                   'created_at',outbox.created_at
                 )
                   FROM outbox_events outbox
                  WHERE outbox.domain_event_id=event.id
                    AND outbox.status='delivered'
               ) AS outbox
          FROM domain_events event
         WHERE event.workspace_id=$1
            AND event.cursor>$2::bigint
            AND event.occurred_at<=$3
            AND ($4::bigint IS NULL OR event.cursor<=$4::bigint)
            AND ($5::uuid[] IS NULL OR event.id=ANY($5::uuid[]))
            AND EXISTS(
              SELECT 1 FROM outbox_events delivered
               WHERE delivered.domain_event_id=event.id
                 AND delivered.status='delivered'
            )
            AND (
              NOT $6::boolean
              OR NOT EXISTS(
                SELECT 1
                  FROM event_archive_segment_events member
                  JOIN event_archive_segments segment
                    ON segment.id=member.segment_id
                   AND segment.workspace_id=member.workspace_id
                 WHERE member.workspace_id=event.workspace_id
                   AND member.event_id=event.id
                   AND segment.membership_state='exact'
                   AND segment.state IN ('verified','pruned')
              )
            )
          ORDER BY event.cursor
          LIMIT $7
      `,
        [
          input.workspaceId,
          input.afterCursor,
          input.cutoff,
          input.endCursor ?? null,
          input.eventIds ?? null,
          input.excludeTrustedMembership,
          input.limit,
        ],
      )
    ).rows;
    return rows.map((row) => {
      const { resources, outbox, ...event } = row;
      if (!outbox) throw new Error("ARCHIVE_OUTBOX_PROOF_MISSING");
      return { event, resources, outbox };
    });
  };

  const loadPendingSegment = async (
    workspaceId: string,
  ): Promise<ArchiveSegmentObject | undefined> =>
    (
      await db.query<ArchiveSegmentObject>(
        `
        SELECT id,workspace_id AS "workspaceId",
               start_cursor::text AS "startCursor",
               end_cursor::text AS "endCursor",row_count AS "rowCount",
               snapshot_digest AS "snapshotDigest",object_key AS "objectKey",
               object_version_id AS "objectVersionId",
               object_size_bytes::text AS "objectSizeBytes",
               object_sha256 AS "objectSha256",
               fixed_cutoff_at AS "fixedCutoffAt",
               retain_until AS "retainUntil",
               pruned_at AS "prunedAt",state,
               membership_state AS "membershipState",
               planned_fence::text AS "plannedFence",
               last_error_code AS "lastErrorCode"
          FROM event_archive_segments
         WHERE workspace_id=$1
           AND membership_state='pending_exact'
           AND state IN ('planned','uploaded','failed')
         ORDER BY created_at,id
         LIMIT 1
      `,
        [workspaceId],
      )
    ).rows[0];

  const loadLegacySegment = async (
    workspaceId: string,
  ): Promise<ArchiveSegmentObject | undefined> =>
    (
      await db.query<ArchiveSegmentObject>(
        `
        SELECT id,workspace_id AS "workspaceId",
               start_cursor::text AS "startCursor",
               end_cursor::text AS "endCursor",row_count AS "rowCount",
               snapshot_digest AS "snapshotDigest",object_key AS "objectKey",
               object_version_id AS "objectVersionId",
               object_size_bytes::text AS "objectSizeBytes",
               object_sha256 AS "objectSha256",
               fixed_cutoff_at AS "fixedCutoffAt",
               retain_until AS "retainUntil",
               pruned_at AS "prunedAt",state,
               membership_state AS "membershipState",
               planned_fence::text AS "plannedFence",
               last_error_code AS "lastErrorCode"
          FROM event_archive_segments
         WHERE workspace_id=$1
           AND membership_state='legacy_unindexed'
           AND state IN ('uploaded','verified','pruned','failed')
         ORDER BY created_at,id
         LIMIT 1
      `,
        [workspaceId],
      )
    ).rows[0];

  const buildArchivePayload = (
    records: readonly ArchivedRecord[],
    metadata: Readonly<{
      format: "workmesh-domain-event-records-ndjson-v1";
      workspaceId: string;
      startCursor: string;
      endCursor: string;
      fixedCutoffAt: string;
      rowCount: number;
      snapshotDigest: string;
    }>,
  ): Readonly<{
    body: Uint8Array;
    objectChecksum: string;
    members: readonly ArchiveMember[];
  }> => {
    const eventLines = records.map(canonicalLine).join("");
    if (sha256(eventLines) !== metadata.snapshotDigest)
      throw new Error("ARCHIVE_SNAPSHOT_RECHECK_FAILED");
    const body = gzipSync(
      Buffer.from(canonicalLine({ _meta: metadata }) + eventLines),
      { level: 9 },
    );
    return {
      body,
      objectChecksum: sha256(body),
      members: records.map((record, ordinal) => ({
        ordinal,
        eventId: record.event.id,
        eventCursor: record.event.cursor,
        recordSha256: sha256(canonicalLine(record)),
        record,
      })),
    };
  };

  const loadProvisionalMembers = async (
    executor: QueryExecutor,
    segmentId: string,
  ): Promise<
    readonly Omit<ArchiveMember, "record">[]
  > =>
    (
      await executor.query<Omit<ArchiveMember, "record">>(
        `
        SELECT ordinal,event_id AS "eventId",
               event_cursor::text AS "eventCursor",
               record_sha256 AS "recordSha256"
          FROM event_archive_segment_events
         WHERE segment_id=$1
         ORDER BY ordinal
      `,
        [segmentId],
      )
    ).rows;

  const assertProvisionalMembers = (
    expected: readonly Omit<ArchiveMember, "record">[],
    actual: readonly ArchiveMember[],
  ): void => {
    if (
      expected.length !== actual.length ||
      expected.some(
        (member, index) =>
          member.ordinal !== actual[index]?.ordinal ||
          member.eventId !== actual[index]?.eventId ||
          member.eventCursor !== actual[index]?.eventCursor ||
          member.recordSha256 !== actual[index]?.recordSha256,
      )
    )
      throw new Error("ARCHIVE_MEMBERSHIP_CONFLICT");
  };

  const rebuildPlannedPayload = async (
    segment: ArchiveSegmentObject,
  ): Promise<Uint8Array> => {
    const reservations = await loadProvisionalMembers(db, segment.id);
    if (reservations.length !== segment.rowCount)
      throw new Error("ARCHIVE_MEMBERSHIP_CONFLICT");
    const records = await loadArchiveRecords(db, {
      workspaceId: segment.workspaceId,
      afterCursor: "0",
      cutoff: segment.fixedCutoffAt,
      endCursor: segment.endCursor,
      eventIds: reservations.map((member) => member.eventId),
      excludeTrustedMembership: false,
      limit: segment.rowCount,
    });
    const metadata = {
      format: "workmesh-domain-event-records-ndjson-v1" as const,
      workspaceId: segment.workspaceId,
      startCursor: segment.startCursor,
      endCursor: segment.endCursor,
      fixedCutoffAt: segment.fixedCutoffAt.toISOString(),
      rowCount: segment.rowCount,
      snapshotDigest: segment.snapshotDigest,
    };
    const payload = buildArchivePayload(records, metadata);
    assertProvisionalMembers(reservations, payload.members);
    if (
      payload.body.byteLength !== Number(segment.objectSizeBytes) ||
      payload.objectChecksum !== segment.objectSha256
    )
      throw new Error("ARCHIVE_SNAPSHOT_RECHECK_FAILED");
    return payload.body;
  };

  const createArchivePlan = async (
    active: RetentionClaim,
  ): Promise<
    | Readonly<{ segment: ArchiveSegmentObject; body: Uint8Array }>
    | undefined
  > =>
    withTx(db, async (tx) => {
      await assertClaim(tx, active);
      const existing = await tx.query(
        `SELECT 1 FROM event_archive_segments
          WHERE workspace_id=$1 AND membership_state='pending_exact'
          FOR UPDATE`,
        [active.workspaceId],
      );
      if (existing.rowCount !== 0)
        throw new Error("ARCHIVE_PLAN_CONFLICT");
      const records = await loadArchiveRecords(tx, {
        workspaceId: active.workspaceId,
        afterCursor: "0",
        cutoff: active.fixedCutoffAt,
        excludeTrustedMembership: true,
        limit: config.batchSize,
      });
      if (!records.length) {
        await writeGuardedProgress(tx, active, { complete: true });
        return undefined;
      }
      const first = records[0]!.event;
      const last = records.at(-1)!.event;
      const snapshotDigest = sha256(records.map(canonicalLine).join(""));
      const metadata = {
        format: "workmesh-domain-event-records-ndjson-v1" as const,
        workspaceId: active.workspaceId,
        startCursor: first.cursor,
        endCursor: last.cursor,
        fixedCutoffAt: active.fixedCutoffAt.toISOString(),
        rowCount: records.length,
        snapshotDigest,
      };
      const payload = buildArchivePayload(records, metadata);
      const segmentId = randomUUID();
      const objectKey = `${config.archivePrefix}/${active.workspaceId}/${segmentId}-${first.cursor}-${last.cursor}.ndjson.gz`;
      const retainUntil = new Date(
        Date.now() + (config.archiveRetainDays * 86_400 + 300) * 1_000,
      );
      await tx.query(
        `
        INSERT INTO event_archive_segments(
          id,workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
          object_key,object_version_id,object_size_bytes,object_sha256,
          snapshot_digest,metadata,retain_until,state,membership_state,
          planned_fence
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,$12,
          'planned','pending_exact',$13
        )
      `,
        [
          segmentId,
          active.workspaceId,
          first.cursor,
          last.cursor,
          active.fixedCutoffAt,
          records.length,
          objectKey,
          payload.body.byteLength,
          payload.objectChecksum,
          snapshotDigest,
          metadata,
          retainUntil,
          active.fence,
        ],
      );
      for (const member of payload.members) {
        await tx.query(
          `
          INSERT INTO event_archive_segment_events(
            segment_id,workspace_id,ordinal,event_id,event_cursor,record_sha256
          ) VALUES($1,$2,$3,$4,$5,$6)
        `,
          [
            segmentId,
            active.workspaceId,
            member.ordinal,
            member.eventId,
            member.eventCursor,
            member.recordSha256,
          ],
        );
      }
      return {
        segment: {
          id: segmentId,
          workspaceId: active.workspaceId,
          startCursor: first.cursor,
          endCursor: last.cursor,
          rowCount: records.length,
          snapshotDigest,
          objectKey,
          objectVersionId: null,
          objectSizeBytes: String(payload.body.byteLength),
          objectSha256: payload.objectChecksum,
          fixedCutoffAt: active.fixedCutoffAt,
          retainUntil,
          prunedAt: null,
          state: "planned",
          membershipState: "pending_exact",
          plannedFence: active.fence,
          lastErrorCode: null,
        },
        body: payload.body,
      };
    });

  const materializeSegmentMembership = async (
    active: RetentionClaim,
    segment: ArchiveSegmentObject,
  ): Promise<number> => {
    if (!segment.objectVersionId)
      throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    const body = await objectStore.readVerifiedObject(
      archiveExpectation(segment),
    );
    const members = parseArchiveMembers(body, segment);
    return withTx(db, async (tx) => {
      await assertClaim(tx, active);
      const current = (
        await tx.query<{
          membershipState: ArchiveSegmentObject["membershipState"];
          state: ArchiveSegmentObject["state"];
        }>(
          `
          SELECT membership_state AS "membershipState",state
            FROM event_archive_segments
           WHERE id=$1 AND workspace_id=$2
           FOR UPDATE
        `,
          [segment.id, active.workspaceId],
        )
      ).rows[0];
      if (!current) throw new Error("ARCHIVE_SEGMENT_MISSING");
      if (current.membershipState === "exact") return 0;
      const existing = await tx.query(
        `SELECT 1 FROM event_archive_segment_events WHERE segment_id=$1 LIMIT 1`,
        [segment.id],
      );
      if (existing.rowCount !== 0)
        throw new Error("ARCHIVE_MEMBERSHIP_PARTIAL");
      for (const member of members) {
        await tx.query(
          `
          INSERT INTO event_archive_segment_events(
            segment_id,workspace_id,ordinal,event_id,event_cursor,
            record_sha256,floored_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7)
        `,
          [
            segment.id,
            active.workspaceId,
            member.ordinal,
            member.eventId,
            member.eventCursor,
            member.recordSha256,
            segment.state === "pruned"
              ? (segment.prunedAt ?? new Date())
              : null,
          ],
        );
      }
      const updated = await tx.query(
        `
        UPDATE event_archive_segments
           SET membership_state='exact',
               state=CASE WHEN state='pruned' THEN state ELSE 'verified' END,
               uploaded_at=COALESCE(uploaded_at,now()),
               verified_at=COALESCE(verified_at,now()),
               last_error_code=NULL,updated_at=now()
         WHERE id=$1 AND workspace_id=$2
           AND membership_state='legacy_unindexed'
      `,
        [segment.id, active.workspaceId],
      );
      if (updated.rowCount !== 1)
        throw new Error("ARCHIVE_MEMBERSHIP_FINALIZE_FAILED");
      await writeGuardedProgress(tx, active, {
        watermarkCursor: segment.endCursor,
        counters: { archived: members.length },
      });
      return members.length;
    });
  };

  const assertPendingCutoff = (
    active: RetentionClaim,
    segment: Pick<ArchiveSegmentObject, "fixedCutoffAt">,
  ): void => {
    if (
      segment.fixedCutoffAt.toISOString() !==
      active.fixedCutoffAt.toISOString()
    )
      throw new Error("ARCHIVE_FIXED_CUTOFF_MISMATCH");
  };

  const recordUploadAttempt = async (
    active: RetentionClaim,
    segment: ArchiveSegmentObject,
  ): Promise<void> => {
    await withTx(db, async (tx) => {
      await assertClaim(tx, active);
      const current = (
        await tx.query<{
          state: ArchiveSegmentObject["state"];
          membershipState: ArchiveSegmentObject["membershipState"];
          fixedCutoffAt: Date;
        }>(
          `
          SELECT state,membership_state AS "membershipState",
                 fixed_cutoff_at AS "fixedCutoffAt"
            FROM event_archive_segments
           WHERE id=$1 AND workspace_id=$2
           FOR UPDATE
        `,
          [segment.id, active.workspaceId],
        )
      ).rows[0];
      if (
        !current ||
        current.membershipState !== "pending_exact" ||
        current.state !== "planned"
      )
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
      assertPendingCutoff(active, current);
      const members = await loadProvisionalMembers(tx, segment.id);
      if (members.length !== segment.rowCount)
        throw new Error("ARCHIVE_MEMBERSHIP_CONFLICT");
      const updated = await tx.query(
        `
        UPDATE event_archive_segments
           SET upload_attempt_count=upload_attempt_count+1,
               last_upload_attempt_at=now(),last_upload_fence=$3,
               last_error_code=NULL,updated_at=now()
         WHERE id=$1 AND workspace_id=$2
           AND membership_state='pending_exact' AND state='planned'
      `,
        [segment.id, active.workspaceId, active.fence],
      );
      if (updated.rowCount !== 1)
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
    });
  };

  const persistUploadedVersion = async (
    active: RetentionClaim,
    segment: ArchiveSegmentObject,
    versionId: string,
  ): Promise<ArchiveSegmentObject> =>
    withTx(db, async (tx) => {
      await assertClaim(tx, active);
      const current = (
        await tx.query<ArchiveSegmentObject>(
          `
          SELECT id,workspace_id AS "workspaceId",
                 start_cursor::text AS "startCursor",
                 end_cursor::text AS "endCursor",row_count AS "rowCount",
                 snapshot_digest AS "snapshotDigest",
                 object_key AS "objectKey",
                 object_version_id AS "objectVersionId",
                 object_size_bytes::text AS "objectSizeBytes",
                 object_sha256 AS "objectSha256",
                 fixed_cutoff_at AS "fixedCutoffAt",
                 retain_until AS "retainUntil",pruned_at AS "prunedAt",
                 state,membership_state AS "membershipState",
                 planned_fence::text AS "plannedFence",
                 last_error_code AS "lastErrorCode"
            FROM event_archive_segments
           WHERE id=$1 AND workspace_id=$2
           FOR UPDATE
        `,
          [segment.id, active.workspaceId],
        )
      ).rows[0];
      if (
        !current ||
        current.membershipState !== "pending_exact" ||
        current.state !== "planned"
      )
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
      assertPendingCutoff(active, current);
      const members = await loadProvisionalMembers(tx, current.id);
      if (members.length !== current.rowCount)
        throw new Error("ARCHIVE_MEMBERSHIP_CONFLICT");
      const updated = await tx.query(
        `
        UPDATE event_archive_segments
           SET object_version_id=$3,state='uploaded',uploaded_at=now(),
               last_error_code=NULL,updated_at=now()
         WHERE id=$1 AND workspace_id=$2
           AND membership_state='pending_exact' AND state='planned'
      `,
        [current.id, active.workspaceId, versionId],
      );
      if (updated.rowCount !== 1)
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
      return {
        ...current,
        objectVersionId: versionId,
        state: "uploaded",
      };
    });

  const finalizePendingSegment = async (
    active: RetentionClaim,
    segment: ArchiveSegmentObject,
  ): Promise<number> => {
    if (!segment.objectVersionId)
      throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    assertPendingCutoff(active, segment);
    const body = await objectStore.readVerifiedObject(
      archiveExpectation(segment),
    );
    const members = parseArchiveMembers(body, segment);
    await archiveFault?.("before_finalize_commit", {
      claim: active,
      segmentId: segment.id,
    });
    const finalized = await withTx(db, async (tx) => {
      await assertClaim(tx, active);
      const current = (
        await tx.query<{
          state: ArchiveSegmentObject["state"];
          membershipState: ArchiveSegmentObject["membershipState"];
          fixedCutoffAt: Date;
          objectVersionId: string | null;
        }>(
          `
          SELECT state,membership_state AS "membershipState",
                 fixed_cutoff_at AS "fixedCutoffAt",
                 object_version_id AS "objectVersionId"
            FROM event_archive_segments
           WHERE id=$1 AND workspace_id=$2
           FOR UPDATE
        `,
          [segment.id, active.workspaceId],
        )
      ).rows[0];
      if (!current) throw new Error("ARCHIVE_SEGMENT_MISSING");
      if (
        current.membershipState !== "pending_exact" ||
        current.state !== "uploaded" ||
        current.objectVersionId !== segment.objectVersionId
      )
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
      assertPendingCutoff(active, current);
      const reservations = await loadProvisionalMembers(tx, segment.id);
      assertProvisionalMembers(reservations, members);
      const updated = await tx.query(
        `
        UPDATE event_archive_segments
           SET membership_state='exact',state='verified',verified_at=now(),
               last_error_code=NULL,updated_at=now()
         WHERE id=$1 AND workspace_id=$2
           AND membership_state='pending_exact' AND state='uploaded'
      `,
        [segment.id, active.workspaceId],
      );
      if (updated.rowCount !== 1)
        throw new Error("ARCHIVE_MEMBERSHIP_FINALIZE_FAILED");
      await archiveFault?.("mid_finalize", {
        claim: active,
        segmentId: segment.id,
      });
      await writeGuardedProgress(tx, active, {
        watermarkCursor: segment.endCursor,
        counters: { archived: members.length },
      });
      return members.length;
    });
    await archiveFault?.("after_finalize_commit", {
      claim: active,
      segmentId: segment.id,
    });
    return finalized;
  };

  const failClaim = async (
    claimValue: RetentionClaim,
    error: unknown,
  ): Promise<void> => {
    const result = await db.query(
      `
      UPDATE retention_job_state
         SET last_error_code=$4,lease_owner=NULL,lease_expires_at=NULL,updated_at=now()
       WHERE job_name=$1 AND workspace_id=$2 AND lease_owner=$3 AND fence=$5::bigint
    `,
      [
        claimValue.jobName,
        claimValue.workspaceId,
        claimValue.owner,
        safeRetentionErrorCode(error),
        claimValue.fence,
      ],
    );
    if (result.rowCount !== 1) throw new Error("RETENTION_CLAIM_LOST");
  };

  const cleanup = async (): Promise<number> => {
    if (!config.cleanupEnabled) return 0;
    // The claim freezes "now"; individual classes apply their own horizons
    // relative to that fixed point so a restart cannot move a batch cutoff.
    const cutoff = new Date();
    const active = await claim("cleanup", cutoff);
    if (!active) return 0;
    await afterCleanupClaim?.(active);
    try {
      const count = await withTx(db, async (tx) => {
        // This row lock is the destructive-path gate: a reclaim cannot race
        // any replay wipe or DELETE in the transaction, and a stale owner
        // fails before touching retained data.
        await assertClaim(tx, active);
        const authReplayWiped = await tx.query(
          `
          WITH candidate AS (
            SELECT id
              FROM auth_idempotency_records
             WHERE state='completed' AND replay_wiped_at IS NULL
               AND replay_expires_at<=$1
             ORDER BY replay_expires_at,id
             FOR UPDATE SKIP LOCKED LIMIT $2
          )
          UPDATE auth_idempotency_records record
             SET response_status=NULL,replay_key_id=NULL,replay_key_fingerprint=NULL,
                 replay_iv=NULL,replay_tag=NULL,replay_ciphertext=NULL,
                 replay_wiped_at=now()
            FROM candidate
           WHERE record.id=candidate.id
          RETURNING record.id
        `,
          [active.fixedCutoffAt, config.batchSize],
        );
        const authDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT id
              FROM auth_idempotency_records
             WHERE conflict_expires_at<=$1
             ORDER BY conflict_expires_at,id
             FOR UPDATE SKIP LOCKED LIMIT $2
          )
          DELETE FROM auth_idempotency_records record USING candidate
           WHERE record.id=candidate.id
          RETURNING record.id
        `,
          [active.fixedCutoffAt, config.batchSize],
        );
        const replayWiped = await tx.query(
          `
          WITH candidate AS (
            SELECT workspace_id,actor_id,idempotency_key
              FROM api_idempotency_keys
             WHERE workspace_id=$1 AND replay_expires_at<=$2 AND response_body IS NOT NULL
             ORDER BY replay_expires_at
             FOR UPDATE SKIP LOCKED LIMIT $3
          )
          UPDATE api_idempotency_keys record
             SET response_status=NULL,response_body=NULL
            FROM candidate
           WHERE record.workspace_id=candidate.workspace_id
             AND record.actor_id=candidate.actor_id
             AND record.idempotency_key=candidate.idempotency_key
          RETURNING record.idempotency_key
        `,
          [active.workspaceId, active.fixedCutoffAt, config.batchSize],
        );
        const genericDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT workspace_id,actor_id,idempotency_key
              FROM api_idempotency_keys
             WHERE workspace_id=$1 AND conflict_expires_at<=$2 AND response_body IS NULL
             ORDER BY conflict_expires_at
             FOR UPDATE SKIP LOCKED LIMIT $3
          )
          DELETE FROM api_idempotency_keys record USING candidate
           WHERE record.workspace_id=candidate.workspace_id
             AND record.actor_id=candidate.actor_id
             AND record.idempotency_key=candidate.idempotency_key
          RETURNING record.idempotency_key
        `,
          [active.workspaceId, active.fixedCutoffAt, config.batchSize],
        );
        const heartbeatKeysDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT key.resource_kind,key.resource_id,key.idempotency_key
              FROM heartbeat_idempotency_keys key
             WHERE key.expires_at<=$2
               AND (
                 (key.resource_kind='session' AND EXISTS(
                   SELECT 1 FROM agent_sessions session
                    WHERE session.id=key.resource_id AND session.workspace_id=$1
                 ))
                 OR
                 (key.resource_kind='lease' AND EXISTS(
                   SELECT 1 FROM leases lease
                    WHERE lease.id=key.resource_id AND lease.workspace_id=$1
                 ))
               )
             ORDER BY key.expires_at,key.resource_kind,key.resource_id
             FOR UPDATE SKIP LOCKED LIMIT $3
          )
          DELETE FROM heartbeat_idempotency_keys key USING candidate
           WHERE key.resource_kind=candidate.resource_kind
             AND key.resource_id=candidate.resource_id
             AND key.idempotency_key=candidate.idempotency_key
          RETURNING key.idempotency_key
        `,
          [active.workspaceId, active.fixedCutoffAt, config.batchSize],
        );
        const outboxDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT outbox.id
              FROM outbox_events outbox
              JOIN domain_events event ON event.id=outbox.domain_event_id
              JOIN event_archive_segment_events member
                ON member.workspace_id=event.workspace_id
               AND member.event_id=event.id
               AND member.event_cursor=event.cursor
              JOIN event_archive_segments segment
                ON segment.id=member.segment_id
               AND segment.workspace_id=member.workspace_id
              JOIN event_retention_state floor
                ON floor.workspace_id=event.workspace_id
             WHERE event.workspace_id=$1 AND outbox.status='delivered'
                AND outbox.delivered_at<=$2
                AND member.floored_at IS NOT NULL
                AND member.event_cursor<=floor.pruned_through_cursor
                AND segment.membership_state='exact'
                AND segment.state IN ('verified','pruned')
             ORDER BY outbox.delivered_at,outbox.id
             FOR UPDATE OF outbox SKIP LOCKED LIMIT $3
          )
          DELETE FROM outbox_events outbox USING candidate
           WHERE outbox.id=candidate.id RETURNING outbox.id
        `,
          [
            active.workspaceId,
            new Date(
              active.fixedCutoffAt.getTime() -
                config.cleanupRetainDays * 86_400_000,
            ),
            config.batchSize,
          ],
        );
        const sessionsDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT session.id
              FROM sessions session
              JOIN actors actor ON actor.id=session.actor_id
             WHERE actor.workspace_id=$1
               AND COALESCE(session.revoked_at,session.expires_at)<=$2
               AND (session.revoked_at IS NOT NULL OR session.expires_at<=now())
             ORDER BY COALESCE(session.revoked_at,session.expires_at),session.id
             FOR UPDATE OF session SKIP LOCKED LIMIT $3
          )
          DELETE FROM sessions session USING candidate
           WHERE session.id=candidate.id RETURNING session.id
        `,
          [
            active.workspaceId,
            new Date(
              active.fixedCutoffAt.getTime() -
                config.cleanupRetainDays * 86_400_000,
            ),
            config.batchSize,
          ],
        );
        const agentTokensDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT token.id
              FROM agent_session_tokens token
              JOIN agent_sessions session ON session.id=token.session_id
             WHERE session.workspace_id=$1
               AND COALESCE(token.revoked_at,token.expires_at)<=$2
               AND (token.revoked_at IS NOT NULL OR token.expires_at<=now())
             ORDER BY COALESCE(token.revoked_at,token.expires_at),token.id
             FOR UPDATE OF token SKIP LOCKED LIMIT $3
          )
          DELETE FROM agent_session_tokens token USING candidate
           WHERE token.id=candidate.id RETURNING token.id
        `,
          [
            active.workspaceId,
            new Date(
              active.fixedCutoffAt.getTime() -
                config.cleanupRetainDays * 86_400_000,
            ),
            config.batchSize,
          ],
        );
        const installationTokensDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT token.id
              FROM agent_installation_tokens token
              JOIN agent_definitions agent ON agent.id=token.agent_id
             WHERE agent.workspace_id=$1
               AND COALESCE(token.revoked_at,token.expires_at)<=$2
               AND (token.revoked_at IS NOT NULL OR token.expires_at<=now())
               AND NOT EXISTS(
                 SELECT 1 FROM agent_session_tokens session_token
                  WHERE session_token.installation_token_id=token.id
               )
             ORDER BY COALESCE(token.revoked_at,token.expires_at),token.id
             FOR UPDATE OF token SKIP LOCKED LIMIT $3
          )
          DELETE FROM agent_installation_tokens token USING candidate
           WHERE token.id=candidate.id RETURNING token.id
        `,
          [
            active.workspaceId,
            new Date(
              active.fixedCutoffAt.getTime() -
                config.cleanupRetainDays * 86_400_000,
            ),
            config.batchSize,
          ],
        );
        const providerDeliveriesDeleted = await tx.query(
          `
          WITH candidate AS (
            SELECT delivery.id
              FROM provider_webhook_deliveries delivery
              JOIN provider_connections connection ON connection.id=delivery.connection_id
             WHERE connection.workspace_id=$1 AND delivery.status='processed'
               AND delivery.processed_at<=$2
               AND NOT EXISTS(
                 SELECT 1 FROM pull_request_projections projection
                  WHERE projection.source_delivery_id=delivery.id
               )
               AND NOT EXISTS(
                 SELECT 1 FROM commit_projections projection
                  WHERE projection.source_delivery_id=delivery.id
               )
               AND NOT EXISTS(
                 SELECT 1 FROM ci_check_projections projection
                  WHERE projection.source_delivery_id=delivery.id
               )
               AND NOT EXISTS(
                 SELECT 1 FROM provider_review_projections projection
                  WHERE projection.source_delivery_id=delivery.id
               )
             ORDER BY delivery.processed_at,delivery.id
             FOR UPDATE OF delivery SKIP LOCKED LIMIT $3
          )
          DELETE FROM provider_webhook_deliveries delivery USING candidate
           WHERE delivery.id=candidate.id RETURNING delivery.id
        `,
          [
            active.workspaceId,
            new Date(
              active.fixedCutoffAt.getTime() -
                config.cleanupRetainDays * 86_400_000,
            ),
            config.batchSize,
          ],
        );
        return [
          authReplayWiped,
          authDeleted,
          replayWiped,
          genericDeleted,
          heartbeatKeysDeleted,
          outboxDeleted,
          sessionsDeleted,
          agentTokensDeleted,
          installationTokensDeleted,
          providerDeliveriesDeleted,
        ].reduce((sum, result) => sum + (result.rowCount ?? 0), 0);
      });
      await guardedProgress(active, {
        counters: { cleaned: count },
        complete: true,
      });
      return count;
    } catch (error) {
      await failClaim(active, error);
      throw error;
    }
  };

  const archiveEvents = async (): Promise<number> => {
    if (!config.archiveEnabled) return 0;
    const cutoff = new Date(Date.now() - config.eventOnlineDays * 86_400_000);
    const active = await claim("event_archive", cutoff);
    if (!active) return 0;
    await afterArchiveClaim?.(active);
    let segmentId: string | undefined;
    try {
      let segment = await loadPendingSegment(active.workspaceId);
      segmentId = segment?.id;
      if (segment?.state === "failed")
        throw new Error(segment.lastErrorCode ?? "ARCHIVE_PLAN_CONFLICT");
      if (!segment) {
        const legacy = await loadLegacySegment(active.workspaceId);
        if (legacy) {
          segmentId = legacy.id;
          return await materializeSegmentMembership(active, legacy);
        }
      }
      let body: Uint8Array | undefined;
      if (!segment) {
        const plan = await createArchivePlan(active);
        if (!plan) return 0;
        segment = plan.segment;
        body = plan.body;
        segmentId = segment.id;
        await archiveFault?.("after_plan_commit", {
          claim: active,
          segmentId,
        });
      }
      segmentId = segment.id;
      assertPendingCutoff(active, segment);
      if (segment.state === "planned") {
        body ??= await rebuildPlannedPayload(segment);
        await recordUploadAttempt(active, segment);
        const uploadedObject = await objectStore.putObjectIfAbsent(
          archiveExpectation(segment),
          body,
        );
        await archiveFault?.("after_put", {
          claim: active,
          segmentId,
        });
        await archiveFault?.("before_upload_commit", {
          claim: active,
          segmentId,
        });
        segment = await persistUploadedVersion(
          active,
          segment,
          uploadedObject.versionId,
        );
        await archiveFault?.("after_upload_commit", {
          claim: active,
          segmentId,
        });
      }
      if (segment.state !== "uploaded")
        throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
      return await finalizePendingSegment(active, segment);
    } catch (error) {
      if (segmentId) {
        await withTx(db, async (tx) => {
          await assertClaim(tx, active);
          const errorCode = safeRetentionErrorCode(error);
          if (
            new Set([
              "RETENTION_OBJECT_IDENTITY_MISMATCH",
              "ARCHIVE_FIXED_CUTOFF_MISMATCH",
              "ARCHIVE_PLAN_CONFLICT",
              "ARCHIVE_MEMBERSHIP_CONFLICT",
              "ARCHIVE_OBJECT_MANIFEST_MISMATCH",
              "ARCHIVE_SNAPSHOT_RECHECK_FAILED",
            ]).has(errorCode)
          )
            await tx.query(
              `
              UPDATE event_archive_segments
                 SET state='failed',last_error_code=$2,updated_at=now()
               WHERE id=$1 AND membership_state='pending_exact'
                 AND state IN ('planned','uploaded')
            `,
              [segmentId, errorCode],
            );
          await tx.query(
            `
            UPDATE event_archive_segments
               SET last_error_code=$2,updated_at=now()
             WHERE id=$1 AND membership_state='legacy_unindexed'
          `,
            [segmentId, safeRetentionErrorCode(error)],
          );
        });
      }
      await failClaim(active, error);
      throw error;
    }
  };

  const pruneEvents = async (): Promise<number> => {
    if (!config.eventPruneEnabled) return 0;
    const cutoff = new Date(Date.now() - config.eventOnlineDays * 86_400_000);
    const active = await claim("event_prune", cutoff);
    if (!active) return 0;
    await afterPruneClaim?.(active);
    try {
      const deleted = await withTx(db, async (tx) => {
        await assertClaim(tx, active);
        const floor = (
          await tx.query<{ cursor: string }>(
            `
          SELECT pruned_through_cursor::text AS cursor
            FROM event_retention_state
           WHERE workspace_id=$1 FOR UPDATE
        `,
            [active.workspaceId],
          )
        ).rows[0];
        if (!floor) throw new Error("RETENTION_FLOOR_MISSING");
        type PrefixCandidate = ArchiveSegmentObject &
          Readonly<{
            eventId: string;
            eventCursor: string;
            eventType: string;
            occurredAt: Date;
            recordSha256: string | null;
            flooredAt: Date | null;
          }>;
        const belowFloor = (
          await tx.query<PrefixCandidate>(
            `
          SELECT event.id AS "eventId",event.cursor::text AS "eventCursor",
                 event.event_type AS "eventType",
                 event.occurred_at AS "occurredAt",
                 member.record_sha256 AS "recordSha256",
                 member.floored_at AS "flooredAt",
                 segment.id,segment.workspace_id AS "workspaceId",
                 segment.start_cursor::text AS "startCursor",
                 segment.end_cursor::text AS "endCursor",
                 segment.row_count AS "rowCount",
                 segment.snapshot_digest AS "snapshotDigest",
                 segment.object_key AS "objectKey",
                 segment.object_version_id AS "objectVersionId",
                 segment.object_size_bytes::text AS "objectSizeBytes",
                 segment.object_sha256 AS "objectSha256",
                 segment.fixed_cutoff_at AS "fixedCutoffAt",
                 segment.retain_until AS "retainUntil",
                 segment.pruned_at AS "prunedAt",segment.state,
                 segment.membership_state AS "membershipState",
                 segment.planned_fence::text AS "plannedFence",
                 segment.last_error_code AS "lastErrorCode"
            FROM event_archive_segment_events member
            JOIN event_archive_segments segment
              ON segment.id=member.segment_id
             AND segment.workspace_id=member.workspace_id
             AND segment.membership_state='exact'
             AND segment.state IN ('verified','pruned')
             AND segment.retain_until>=segment.created_at+interval '365 days'
             AND segment.retain_until>now()
            JOIN domain_events event
              ON event.workspace_id=member.workspace_id
             AND event.id=member.event_id
             AND event.cursor=member.event_cursor
            JOIN outbox_events outbox
              ON outbox.domain_event_id=event.id
             AND outbox.status='delivered'
           WHERE member.workspace_id=$1
             AND member.event_cursor<=$2::bigint
             AND member.floored_at IS NULL
             AND event.occurred_at<=$3
           ORDER BY member.event_cursor
           FOR UPDATE OF event,member,segment,outbox SKIP LOCKED
           LIMIT $4
        `,
            [
              active.workspaceId,
              floor.cursor,
              active.fixedCutoffAt,
              config.batchSize,
            ],
          )
        ).rows;
        let repairedDeleted = 0;
        let repairedProtected = 0;
        let repairedPrunableIds: string[] = [];
        if (belowFloor.length) {
          const repairRecords = await loadArchiveRecords(tx, {
            workspaceId: active.workspaceId,
            afterCursor: "0",
            cutoff: active.fixedCutoffAt,
            endCursor: floor.cursor,
            eventIds: belowFloor.map((candidate) => candidate.eventId),
            excludeTrustedMembership: false,
            limit: belowFloor.length,
          });
          if (repairRecords.length !== belowFloor.length)
            throw new Error("ARCHIVE_BELOW_FLOOR_RECHECK_FAILED");
          const parsedBySegment = new Map<string, readonly ArchiveMember[]>();
          for (const segment of new Map(
            belowFloor.map((candidate) => [candidate.id, candidate]),
          ).values()) {
            const body = await objectStore.readVerifiedObject(
              archiveExpectation(segment),
            );
            parsedBySegment.set(segment.id, parseArchiveMembers(body, segment));
          }
          const onlineById = new Map(
            repairRecords.map((record) => [record.event.id, record]),
          );
          for (const candidate of belowFloor) {
            const archived = parsedBySegment
              .get(candidate.id)
              ?.find((member) => member.eventId === candidate.eventId);
            const online = onlineById.get(candidate.eventId);
            if (
              !archived ||
              !online ||
              archived.eventCursor !== candidate.eventCursor ||
              archived.recordSha256 !== candidate.recordSha256 ||
              sha256(canonicalLine(online)) !== candidate.recordSha256
            )
              throw new Error("ARCHIVE_RECORD_RECHECK_FAILED");
          }
          const repairIds = repairRecords.map((record) => record.event.id);
          const repairBlocker = await tx.query<{ id: string }>(
            `
            SELECT event.id
              FROM domain_events event
             WHERE event.id=ANY($1::uuid[])
                AND (
                  NOT EXISTS(SELECT 1 FROM outbox_events outbox
                              WHERE outbox.domain_event_id=event.id
                                AND outbox.status='delivered')
                  OR EXISTS(SELECT 1 FROM a2a_deliveries a2a
                             WHERE a2a.domain_event_id=event.id)
                  OR EXISTS(SELECT 1 FROM agent_webhook_deliveries delivery
                             WHERE delivery.event_id=event.id)
                )
          `,
            [repairIds],
          );
          const repairProtectedIds = new Set(
            repairBlocker.rows.map((row) => row.id),
          );
          repairedPrunableIds = repairRecords
            .filter(
              (record) =>
                ordinaryPrunableEventTypes.has(record.event.event_type) &&
                !repairProtectedIds.has(record.event.id),
            )
            .map((record) => record.event.id);
          const repaired = await tx.query(
            `
            DELETE FROM domain_events
             WHERE workspace_id=$1 AND id=ANY($2::uuid[])
               AND cursor<=$3::bigint AND occurred_at<=$4
             RETURNING id
          `,
            [
              active.workspaceId,
              repairedPrunableIds,
              floor.cursor,
              active.fixedCutoffAt,
            ],
          );
          if (repaired.rowCount !== repairedPrunableIds.length)
            throw new Error("EVENT_BELOW_FLOOR_REPAIR_COUNT_MISMATCH");
          const repairedMembers = await tx.query(
            `
            UPDATE event_archive_segment_events member
               SET floored_at=COALESCE(member.floored_at,now())
              FROM event_archive_segments segment
             WHERE member.segment_id=segment.id
               AND member.workspace_id=segment.workspace_id
               AND member.workspace_id=$1
               AND member.event_id=ANY($2::uuid[])
               AND member.event_cursor<=$3::bigint
               AND member.floored_at IS NULL
               AND segment.membership_state='exact'
               AND segment.state IN ('verified','pruned')
          `,
            [active.workspaceId, repairIds, floor.cursor],
          );
          if (repairedMembers.rowCount !== belowFloor.length)
            throw new Error("ARCHIVE_BELOW_FLOOR_MEMBER_COUNT_MISMATCH");
          await tx.query(
            `
            UPDATE event_archive_segments segment
               SET state='pruned',pruned_at=COALESCE(pruned_at,now()),
                   updated_at=now()
             WHERE id=ANY($1::uuid[]) AND state='verified'
               AND membership_state='exact'
               AND NOT EXISTS(
                 SELECT 1 FROM event_archive_segment_events member
                  WHERE member.segment_id=segment.id
                    AND member.floored_at IS NULL
               )
               AND EXISTS(
                 SELECT 1 FROM retention_job_state state
                  WHERE state.job_name=$2
                    AND state.workspace_id=segment.workspace_id
                    AND state.lease_owner=$3
                    AND state.fence=$4::bigint
                    AND state.lease_expires_at>now()
               )
          `,
            [
              [...new Set(belowFloor.map((candidate) => candidate.id))],
              active.jobName,
              active.owner,
              active.fence,
            ],
          );
          repairedDeleted = repaired.rowCount ?? 0;
          repairedProtected = repairRecords.length - repairedDeleted;
        }
        const candidates = (
          await tx.query<PrefixCandidate>(
            `
          SELECT event.id AS "eventId",event.cursor::text AS "eventCursor",
                 event.event_type AS "eventType",
                 event.occurred_at AS "occurredAt",
                 member.record_sha256 AS "recordSha256",
                 member.floored_at AS "flooredAt",
                 segment.id,segment.workspace_id AS "workspaceId",
                 segment.start_cursor::text AS "startCursor",
                 segment.end_cursor::text AS "endCursor",
                 segment.row_count AS "rowCount",
                 segment.snapshot_digest AS "snapshotDigest",
                 segment.object_key AS "objectKey",
                 segment.object_version_id AS "objectVersionId",
                 segment.object_size_bytes::text AS "objectSizeBytes",
                 segment.object_sha256 AS "objectSha256",
                 segment.fixed_cutoff_at AS "fixedCutoffAt",
                 segment.retain_until AS "retainUntil",
                 segment.pruned_at AS "prunedAt",segment.state,
                 segment.membership_state AS "membershipState",
                 segment.planned_fence::text AS "plannedFence",
                 segment.last_error_code AS "lastErrorCode"
            FROM domain_events event
            LEFT JOIN event_archive_segment_events member
              ON member.workspace_id=event.workspace_id
             AND member.event_id=event.id
             AND member.event_cursor=event.cursor
            LEFT JOIN event_archive_segments segment
              ON segment.id=member.segment_id
             AND segment.workspace_id=member.workspace_id
             AND segment.membership_state='exact'
             AND segment.state IN ('verified','pruned')
             AND segment.retain_until>=segment.created_at+interval '365 days'
             AND segment.retain_until>now()
           WHERE event.workspace_id=$1 AND event.cursor>$2::bigint
           ORDER BY event.cursor
           FOR UPDATE OF event
           LIMIT $3
        `,
            [
              active.workspaceId,
              floor.cursor,
              Math.max(0, config.batchSize - belowFloor.length),
            ],
          )
        ).rows;
        if (!candidates.length) {
          if (belowFloor.length) {
            await beforePruneCommit?.({
              workspaceId: active.workspaceId,
              segmentId: belowFloor[0]!.id,
              eventIds: repairedPrunableIds,
            });
            await writeGuardedProgress(tx, active, {
              counters: {
                pruned: repairedDeleted,
                protected: repairedProtected,
                repairedBelowFloor: belowFloor.length,
              },
              complete: belowFloor.length < config.batchSize,
            });
            return repairedDeleted;
          }
          await writeGuardedProgress(tx, active, { complete: true });
          return 0;
        }
        const prefix: PrefixCandidate[] = [];
        for (const candidate of candidates) {
          if (
            candidate.occurredAt > active.fixedCutoffAt ||
            !candidate.id ||
            !candidate.recordSha256
          )
            break;
          if (candidate.flooredAt)
            throw new Error("ARCHIVE_MEMBER_ALREADY_FLOORED_ABOVE_FLOOR");
          prefix.push(candidate);
        }
        if (!prefix.length) {
          if (belowFloor.length) {
            await beforePruneCommit?.({
              workspaceId: active.workspaceId,
              segmentId: belowFloor[0]!.id,
              eventIds: repairedPrunableIds,
            });
            await writeGuardedProgress(tx, active, {
              counters: {
                pruned: repairedDeleted,
                protected: repairedProtected,
                repairedBelowFloor: belowFloor.length,
              },
              complete: true,
            });
            return repairedDeleted;
          }
          await writeGuardedProgress(tx, active, { complete: true });
          return 0;
        }
        const lastPrefix = prefix.at(-1)!;
        const records = await loadArchiveRecords(tx, {
          workspaceId: active.workspaceId,
          afterCursor: floor.cursor,
          cutoff: active.fixedCutoffAt,
          endCursor: lastPrefix.eventCursor,
          eventIds: prefix.map((candidate) => candidate.eventId),
          excludeTrustedMembership: false,
          limit: prefix.length,
        });
        if (records.length !== prefix.length)
          throw new Error("ARCHIVE_PREFIX_RECHECK_FAILED");
        const parsedBySegment = new Map<string, readonly ArchiveMember[]>();
        for (const segment of new Map(
          prefix.map((candidate) => [candidate.id, candidate]),
        ).values()) {
          const body = await objectStore.readVerifiedObject(
            archiveExpectation(segment),
          );
          parsedBySegment.set(segment.id, parseArchiveMembers(body, segment));
        }
        const onlineById = new Map(
          records.map((record) => [record.event.id, record]),
        );
        for (const candidate of prefix) {
          const archived = parsedBySegment
            .get(candidate.id)
            ?.find((member) => member.eventId === candidate.eventId);
          const online = onlineById.get(candidate.eventId);
          if (
            !archived ||
            !online ||
            archived.eventCursor !== candidate.eventCursor ||
            archived.recordSha256 !== candidate.recordSha256 ||
            sha256(canonicalLine(online)) !== candidate.recordSha256
          )
            throw new Error("ARCHIVE_RECORD_RECHECK_FAILED");
        }
        const ids = records.map((record) => record.event.id);
        const blocker = await tx.query<{ id: string }>(
          `
          SELECT event.id
            FROM domain_events event
           WHERE event.id=ANY($1::uuid[])
              AND (
                NOT EXISTS(SELECT 1 FROM outbox_events outbox
                            WHERE outbox.domain_event_id=event.id
                              AND outbox.status='delivered')
                OR EXISTS(SELECT 1 FROM a2a_deliveries a2a
                           WHERE a2a.domain_event_id=event.id)
                OR EXISTS(SELECT 1 FROM agent_webhook_deliveries delivery
                           WHERE delivery.event_id=event.id)
              )
        `,
          [ids],
        );
        const protectedIds = new Set(blocker.rows.map((row) => row.id));
        const prunableIds = records
          .filter(
            (record) =>
              ordinaryPrunableEventTypes.has(record.event.event_type) &&
              !protectedIds.has(record.event.id),
          )
          .map((record) => record.event.id);
        const removed = await tx.query(
          `
          DELETE FROM domain_events
           WHERE workspace_id=$1 AND id=ANY($2::uuid[])
              AND occurred_at<=$3
           RETURNING id
        `,
          [active.workspaceId, prunableIds, active.fixedCutoffAt],
        );
        if (removed.rowCount !== prunableIds.length)
          throw new Error("EVENT_PRUNE_COUNT_MISMATCH");
        const membersFloored = await tx.query(
          `
          UPDATE event_archive_segment_events member
             SET floored_at=COALESCE(member.floored_at,now())
            FROM event_archive_segments segment
           WHERE member.segment_id=segment.id
             AND member.workspace_id=segment.workspace_id
             AND member.workspace_id=$1
             AND member.event_id=ANY($2::uuid[])
             AND member.floored_at IS NULL
             AND segment.membership_state='exact'
             AND segment.state IN ('verified','pruned')
        `,
          [active.workspaceId, ids],
        );
        if (membersFloored.rowCount !== prefix.length)
          throw new Error("ARCHIVE_MEMBER_FLOOR_COUNT_MISMATCH");
        const floorUpdated = await tx.query(
          `
          UPDATE event_retention_state
             SET pruned_through_cursor=$2,updated_at=now()
           WHERE workspace_id=$1 AND pruned_through_cursor=$3
             AND EXISTS(
               SELECT 1 FROM retention_job_state state
                WHERE state.job_name=$4
                  AND state.workspace_id=event_retention_state.workspace_id
                  AND state.lease_owner=$5
                  AND state.fence=$6::bigint
                  AND state.lease_expires_at>now()
             )
        `,
          [
            active.workspaceId,
            lastPrefix.eventCursor,
            floor.cursor,
            active.jobName,
            active.owner,
            active.fence,
          ],
        );
        if (floorUpdated.rowCount !== 1)
          throw new Error("RETENTION_FLOOR_FENCE_LOST");
        await tx.query(
          `
          UPDATE event_archive_segments segment
             SET state='pruned',pruned_at=COALESCE(pruned_at,now()),
                 updated_at=now()
           WHERE id=ANY($1::uuid[]) AND state='verified'
             AND membership_state='exact'
             AND NOT EXISTS(
               SELECT 1 FROM event_archive_segment_events member
                WHERE member.segment_id=segment.id
                  AND member.floored_at IS NULL
             )
              AND EXISTS(
                SELECT 1 FROM retention_job_state state
                 WHERE state.job_name=$2
                   AND state.workspace_id=segment.workspace_id
                   AND state.lease_owner=$3
                   AND state.fence=$4::bigint
                   AND state.lease_expires_at>now()
              )
        `,
          [
            [...new Set(prefix.map((candidate) => candidate.id))],
            active.jobName,
            active.owner,
            active.fence,
          ],
        );
        await beforePruneCommit?.({
          workspaceId: active.workspaceId,
          segmentId: belowFloor[0]?.id ?? prefix[0]!.id,
          eventIds: [...repairedPrunableIds, ...prunableIds],
        });
        await writeGuardedProgress(tx, active, {
          watermarkCursor: lastPrefix.eventCursor,
          counters: {
            pruned: repairedDeleted + (removed.rowCount ?? 0),
            protected:
              repairedProtected + records.length - prunableIds.length,
            repairedBelowFloor: belowFloor.length,
          },
        });
        return repairedDeleted + (removed.rowCount ?? 0);
      });
      return deleted;
    } catch (error) {
      await failClaim(active, error);
      throw error;
    }
  };

  const trimRedisExactly = async (): Promise<number> => {
    if (!redis.isOpen) await redis.connect();
    await redis.xTrim(STREAM_KEY, "MAXLEN", exactRedisMaxLen);
    const length = await redis.xLen(STREAM_KEY);
    if (length > exactRedisMaxLen)
      throw new Error("REDIS_STREAM_EXACT_TRIM_FAILED");
    return length;
  };

  const tick = async (): Promise<void> => {
    if (config.archiveEnabled)
      await objectStore.probeRetentionProtection();
    await publishWorkerMode();
    await cleanup();
    await archiveEvents();
    await pruneEvents();
    await trimRedisExactly();
  };
  const close = async (): Promise<void> => {
    if (redis.isOpen) await redis.quit();
  };

  return {
    claim,
    guardedProgress,
    cleanup,
    archiveEvents,
    pruneEvents,
    trimRedisExactly,
    tick,
    close,
  };
}
