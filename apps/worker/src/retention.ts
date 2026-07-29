import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
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
  "putObject" | "verify" | "probeRetentionProtection"
>;
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
         SET watermark_cursor=COALESCE($4,watermark_cursor),
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
      stopAtUndelivered: boolean;
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
           AND (
             NOT $5::boolean
             OR event.cursor<COALESCE((
               SELECT min(blocked.cursor)
                 FROM domain_events blocked
                WHERE blocked.workspace_id=$1
                  AND blocked.cursor>$2::bigint
                  AND blocked.occurred_at<=$3
                  AND NOT EXISTS(
                    SELECT 1 FROM outbox_events blocker_outbox
                     WHERE blocker_outbox.domain_event_id=blocked.id
                       AND blocker_outbox.status='delivered'
                  )
             ),'9223372036854775807'::bigint)
           )
         ORDER BY event.cursor
         LIMIT $6
      `,
        [
          input.workspaceId,
          input.afterCursor,
          input.cutoff,
          input.endCursor ?? null,
          input.stopAtUndelivered,
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
             WHERE event.workspace_id=$1 AND outbox.status='delivered'
               AND outbox.delivered_at<=$2
               AND EXISTS(
                 SELECT 1
                   FROM event_archive_segments segment
                  WHERE segment.workspace_id=event.workspace_id
                    AND segment.state='pruned'
                    AND event.cursor BETWEEN segment.start_cursor
                                         AND segment.end_cursor
               )
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
      const records = await loadArchiveRecords(db, {
        workspaceId: active.workspaceId,
        afterCursor: active.watermarkCursor,
        cutoff: active.fixedCutoffAt,
        stopAtUndelivered: true,
        limit: config.batchSize,
      });
      if (!records.length) {
        await guardedProgress(active, { complete: true });
        return 0;
      }
      const eventLines = records.map(canonicalLine).join("");
      const snapshotDigest = sha256(eventLines);
      const first = records[0]!.event;
      const last = records.at(-1)!.event;
      const metadata = {
        format: "workmesh-domain-event-records-ndjson-v1",
        workspaceId: active.workspaceId,
        startCursor: first.cursor,
        endCursor: last.cursor,
        fixedCutoffAt: active.fixedCutoffAt.toISOString(),
        rowCount: records.length,
        snapshotDigest,
      };
      const compressed = gzipSync(
        Buffer.from(canonicalLine({ _meta: metadata }) + eventLines),
        { level: 9 },
      );
      const objectChecksum = sha256(compressed);
      const objectKey = `${config.archivePrefix}/${active.workspaceId}/${first.cursor}-${last.cursor}-${snapshotDigest.slice(7)}.ndjson.gz`;
      const retainUntil = new Date(
        Date.now() + (config.archiveRetainDays * 86_400 + 300) * 1_000,
      );
      const expectation: ArtifactObjectExpectation = {
        key: objectKey,
        checksum: objectChecksum,
        sizeBytes: compressed.byteLength,
        mimeType: "application/gzip",
        retainUntil,
      };
      const uploadedObject = await objectStore.putObject(expectation, compressed);
      const segment = await withTx(db, async (tx) => {
        await assertClaim(tx, active);
        return (
          await tx.query<{
            id: string;
            state: string;
            objectKey: string;
            objectVersionId: string;
            objectSizeBytes: string;
            objectSha256: string;
            retainUntil: Date;
          }>(
            `
          INSERT INTO event_archive_segments(
            workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
            object_key,object_version_id,object_size_bytes,object_sha256,
            snapshot_digest,metadata,retain_until,state,uploaded_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'uploaded',now())
          ON CONFLICT(workspace_id,start_cursor,end_cursor) DO UPDATE
            SET object_key=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.object_key ELSE EXCLUDED.object_key END,
                object_version_id=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.object_version_id ELSE EXCLUDED.object_version_id END,
                object_size_bytes=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.object_size_bytes ELSE EXCLUDED.object_size_bytes END,
                object_sha256=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.object_sha256 ELSE EXCLUDED.object_sha256 END,
                snapshot_digest=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.snapshot_digest ELSE EXCLUDED.snapshot_digest END,
                metadata=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.metadata ELSE EXCLUDED.metadata END,
                state=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.state
                  ELSE 'uploaded'
                END,
                uploaded_at=COALESCE(event_archive_segments.uploaded_at,now()),
                verified_at=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.verified_at
                  ELSE NULL
                END,
                pruned_at=CASE WHEN event_archive_segments.state='pruned'
                               THEN event_archive_segments.pruned_at ELSE NULL END,
                retain_until=CASE
                  WHEN event_archive_segments.state IN ('verified','pruned')
                    THEN event_archive_segments.retain_until ELSE EXCLUDED.retain_until END,
                last_error_code=NULL,updated_at=now()
          RETURNING id,state,object_key AS "objectKey",
                    object_version_id AS "objectVersionId",
                    object_size_bytes::text AS "objectSizeBytes",
                    object_sha256 AS "objectSha256",
                    retain_until AS "retainUntil"
        `,
            [
              active.workspaceId,
              first.cursor,
              last.cursor,
              active.fixedCutoffAt,
              records.length,
              objectKey,
              uploadedObject.versionId,
              compressed.byteLength,
              objectChecksum,
              snapshotDigest,
              metadata,
              retainUntil,
            ],
          )
        ).rows[0]!;
      });
      segmentId = segment.id;
      const persistedExpectation: ArtifactObjectExpectation = {
        key: segment.objectKey,
        versionId: segment.objectVersionId,
        checksum: segment.objectSha256,
        sizeBytes: Number(segment.objectSizeBytes),
        mimeType: "application/gzip",
        retainUntil: segment.retainUntil,
      };
      await objectStore.verify(persistedExpectation);
      await withTx(db, async (tx) => {
        await assertClaim(tx, active);
        const verified = await tx.query(
          `
          UPDATE event_archive_segments
             SET state=CASE WHEN state='pruned' THEN state ELSE 'verified' END,
                 verified_at=COALESCE(verified_at,now()),updated_at=now()
           WHERE id=$1 AND state IN ('uploaded','verified','pruned')
        `,
          [segment.id],
        );
        if (verified.rowCount !== 1) throw new Error("RETENTION_CLAIM_LOST");
      });
      await guardedProgress(active, {
        watermarkCursor: last.cursor,
        counters: { archived: records.length },
      });
      return records.length;
    } catch (error) {
      if (segmentId) {
        await withTx(db, async (tx) => {
          await assertClaim(tx, active);
          await tx.query(
            `
            UPDATE event_archive_segments
               SET state='failed',uploaded_at=NULL,verified_at=NULL,pruned_at=NULL,
                   last_error_code=$2,updated_at=now()
             WHERE id=$1 AND state IN ('planned','failed','uploaded')
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
        const segment = (
          await tx.query<{
            id: string;
            startCursor: string;
            endCursor: string;
            rowCount: number;
            snapshotDigest: string;
            fixedCutoffAt: Date;
            objectKey: string;
            objectVersionId: string;
            objectSizeBytes: string;
            objectSha256: string;
            retainUntil: Date;
          }>(
            `
          SELECT id,start_cursor::text AS "startCursor",
                  end_cursor::text AS "endCursor",row_count AS "rowCount",
                  snapshot_digest AS "snapshotDigest",
                  fixed_cutoff_at AS "fixedCutoffAt",
                  object_key AS "objectKey",
                  object_version_id AS "objectVersionId",
                  object_size_bytes::text AS "objectSizeBytes",
                  object_sha256 AS "objectSha256",
                  retain_until AS "retainUntil"
           FROM event_archive_segments
           WHERE workspace_id=$1 AND state='verified'
             AND end_cursor>$2::bigint
             AND retain_until>=created_at+interval '365 days'
             AND retain_until>now()
           ORDER BY start_cursor FOR UPDATE SKIP LOCKED LIMIT 1
        `,
            [active.workspaceId, floor.cursor],
          )
        ).rows[0];
        if (!segment) {
          await writeGuardedProgress(tx, active, { complete: true });
          return 0;
        }
        await objectStore.verify({
          key: segment.objectKey,
          versionId: segment.objectVersionId,
          checksum: segment.objectSha256,
          sizeBytes: Number(segment.objectSizeBytes),
          mimeType: "application/gzip",
          retainUntil: segment.retainUntil,
        });
        const firstOnline = (
          await tx.query<{ cursor: string }>(
            `
          SELECT cursor::text AS cursor
            FROM domain_events
           WHERE workspace_id=$1 AND cursor>$2::bigint
           ORDER BY cursor LIMIT 1
        `,
            [active.workspaceId, floor.cursor],
          )
        ).rows[0];
        if (!firstOnline || firstOnline.cursor !== segment.startCursor)
          throw new Error("EVENT_RETENTION_GAP");
        await tx.query(
          `
          SELECT cursor
            FROM domain_events
           WHERE workspace_id=$1
             AND cursor BETWEEN $2::bigint AND $3::bigint
           ORDER BY cursor
           FOR UPDATE
        `,
          [active.workspaceId, segment.startCursor, segment.endCursor],
        );
        const records = await loadArchiveRecords(tx, {
          workspaceId: active.workspaceId,
          afterCursor: (BigInt(segment.startCursor) - 1n).toString(),
          cutoff: segment.fixedCutoffAt,
          endCursor: segment.endCursor,
          stopAtUndelivered: false,
          limit: segment.rowCount,
        });
        if (
          records.length !== segment.rowCount ||
          sha256(records.map(canonicalLine).join("")) !== segment.snapshotDigest
        )
          throw new Error("ARCHIVE_SNAPSHOT_RECHECK_FAILED");
        if (
          records.some(
            (record) => record.event.occurred_at > active.fixedCutoffAt,
          )
        )
          throw new Error("ARCHIVE_CUTOFF_RECHECK_FAILED");
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
            segment.endCursor,
            floor.cursor,
            active.jobName,
            active.owner,
            active.fence,
          ],
        );
        if (floorUpdated.rowCount !== 1)
          throw new Error("RETENTION_FLOOR_FENCE_LOST");
        const segmentUpdated = await tx.query(
          `
          UPDATE event_archive_segments
             SET state='pruned',pruned_at=now(),updated_at=now()
           WHERE id=$1 AND state='verified'
             AND EXISTS(
               SELECT 1 FROM retention_job_state state
                WHERE state.job_name=$2
                  AND state.workspace_id=event_archive_segments.workspace_id
                  AND state.lease_owner=$3
                  AND state.fence=$4::bigint
                  AND state.lease_expires_at>now()
             )
        `,
          [segment.id, active.jobName, active.owner, active.fence],
        );
        if (segmentUpdated.rowCount !== 1)
          throw new Error("ARCHIVE_SEGMENT_FENCE_LOST");
        await beforePruneCommit?.({
          workspaceId: active.workspaceId,
          segmentId: segment.id,
          eventIds: prunableIds,
        });
        await writeGuardedProgress(tx, active, {
          watermarkCursor: segment.endCursor,
          counters: {
            pruned: removed.rowCount ?? 0,
            protected: records.length - prunableIds.length,
          },
        });
        return removed.rowCount ?? 0;
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
