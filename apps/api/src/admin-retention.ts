import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createClient } from "redis";
import { loadRealtimeRedisHintConfig } from "@workmesh/config";
import { DomainError } from "@workmesh/domain";
import { retentionStatusResponseSchema } from "@workmesh/contracts";
import type { ApiActor } from "./agent/types.js";

const STREAM_KEY = "workmesh:domain-events";
const actor = (request: FastifyRequest): ApiActor =>
  request.actor as unknown as ApiActor;

export function registerAdminRetentionRoutes(
  app: FastifyInstance,
  db: Pool,
): void {
  app.get("/api/v1/admin/retention/status", async (request) => {
    const current = actor(request);
    if (current.kind !== "human" || current.workspaceRole !== "admin")
      throw new DomainError(
        "FORBIDDEN",
        "Workspace administrator role is required",
      );
    const [
      policyResult,
      floorResult,
      archiveResult,
      jobsResult,
      blockerResult,
      workerResult,
    ] = await Promise.all([
      db.query<{
        recordClass: string;
        onlineDays: number;
        conflictDays: number | null;
        archiveDays: number | null;
        deleteAllowed: boolean;
        protectedReason: string | null;
      }>(`
          SELECT record_class AS "recordClass",online_days AS "onlineDays",
                 conflict_days AS "conflictDays",archive_days AS "archiveDays",
                 delete_allowed AS "deleteAllowed",
                 protected_reason AS "protectedReason"
            FROM retention_policy_inventory ORDER BY record_class
        `),
      db.query<{ prunedThroughCursor: string; updatedAt: Date }>(
        `
          SELECT pruned_through_cursor::text AS "prunedThroughCursor",
                 updated_at AS "updatedAt"
            FROM event_retention_state WHERE workspace_id=$1
        `,
        [current.workspaceId],
      ),
      db.query<{
        planned: string;
        uploaded: string;
        verified: string;
        pruned: string;
        failed: string;
        lastVerifiedEndCursor: string | null;
        retainUntil: Date | null;
      }>(
        `
          SELECT count(*) FILTER(WHERE state='planned')::text AS planned,
                 count(*) FILTER(WHERE state='uploaded')::text AS uploaded,
                 count(*) FILTER(WHERE state='verified')::text AS verified,
                 count(*) FILTER(WHERE state='pruned')::text AS pruned,
                 count(*) FILTER(WHERE state='failed')::text AS failed,
                 max(end_cursor) FILTER(WHERE state IN ('verified','pruned'))::text
                   AS "lastVerifiedEndCursor",
                 min(retain_until) FILTER(WHERE state IN ('verified','pruned'))
                   AS "retainUntil"
            FROM event_archive_segments WHERE workspace_id=$1
        `,
        [current.workspaceId],
      ),
      db.query<{
        name: string;
        leased: boolean;
        fence: string;
        fixedCutoffAt: Date | null;
        watermarkCursor: string;
        lastErrorCode: string | null;
        counters: Record<string, number>;
        lastCompletedAt: Date | null;
      }>(
        `
          SELECT job_name AS name,COALESCE(lease_expires_at>now(),false) AS leased,
                 fence::text,fixed_cutoff_at AS "fixedCutoffAt",
                 watermark_cursor::text AS "watermarkCursor",
                 last_error_code AS "lastErrorCode",counters,
                 last_completed_at AS "lastCompletedAt"
            FROM retention_job_state
           WHERE workspace_id=$1 ORDER BY job_name
        `,
        [current.workspaceId],
      ),
      db.query<{
        undeliveredOutbox: string;
        protectedA2AEvents: string;
        unverifiedSegments: string;
      }>(
        `
          SELECT
            (SELECT count(*) FROM outbox_events outbox
              JOIN domain_events event ON event.id=outbox.domain_event_id
             WHERE event.workspace_id=$1 AND outbox.status<>'delivered')::text
              AS "undeliveredOutbox",
            (SELECT count(*) FROM a2a_deliveries delivery
              JOIN domain_events event ON event.id=delivery.domain_event_id
             WHERE event.workspace_id=$1)::text AS "protectedA2AEvents",
            (SELECT count(*) FROM event_archive_segments
             WHERE workspace_id=$1 AND state NOT IN ('verified','pruned'))::text
              AS "unverifiedSegments"
        `,
        [current.workspaceId],
      ),
      db.query<{ mode: string | null; workerSeenAt: Date | null }>(
        `
          SELECT worker_mode AS mode,worker_seen_at AS "workerSeenAt"
            FROM retention_job_state
           WHERE workspace_id=$1 AND worker_mode IS NOT NULL
           ORDER BY worker_seen_at DESC NULLS LAST LIMIT 1
        `,
        [current.workspaceId],
      ),
    ]);
    const redisConfig = loadRealtimeRedisHintConfig();
    const redis = createClient({
      url: redisConfig.redisUrl,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: false,
      },
    });
    let redisStatus: "ok" | "unavailable" = "unavailable";
    let streamLength: number | null = null;
    try {
      await redis.connect();
      streamLength = await redis.xLen(STREAM_KEY);
      redisStatus = "ok";
    } catch {
      // Status is intentionally vocabulary-only; connection details and
      // tenant identifiers never enter the response or logs.
    } finally {
      if (redis.isOpen) await redis.quit();
    }
    const floor = floorResult.rows[0] ?? {
      prunedThroughCursor: "0",
      updatedAt: new Date(0),
    };
    const archive = archiveResult.rows[0]!;
    const blockers = blockerResult.rows[0]!;
    const worker = workerResult.rows[0];
    return retentionStatusResponseSchema.parse({
      mode: worker?.mode ?? "unknown",
      workerSeenAt: worker?.workerSeenAt?.toISOString() ?? null,
      policies: policyResult.rows,
      floor: {
        prunedThroughCursor: floor.prunedThroughCursor,
        updatedAt: floor.updatedAt.toISOString(),
      },
      archive: {
        planned: Number(archive.planned),
        uploaded: Number(archive.uploaded),
        verified: Number(archive.verified),
        pruned: Number(archive.pruned),
        failed: Number(archive.failed),
        lastVerifiedEndCursor: archive.lastVerifiedEndCursor,
        retainUntil: archive.retainUntil?.toISOString() ?? null,
      },
      jobs: jobsResult.rows.map((job) => ({
        ...job,
        fixedCutoffAt: job.fixedCutoffAt?.toISOString() ?? null,
        lastCompletedAt: job.lastCompletedAt?.toISOString() ?? null,
      })),
      blockers: {
        undeliveredOutbox: Number(blockers.undeliveredOutbox),
        protectedA2AEvents: Number(blockers.protectedA2AEvents),
        unverifiedSegments: Number(blockers.unverifiedSegments),
      },
      redis: {
        status: redisStatus,
        streamLength,
        exactLimit: redisConfig.maxLen,
      },
    });
  });
}
