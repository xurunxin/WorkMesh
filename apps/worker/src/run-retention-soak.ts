import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "redis";
import { createDb } from "@workmesh/db";
import {
  callRetentionSoakAgent,
  callRetentionSoakHeartbeat,
  RetentionSoakCredentialManager,
} from "./retention-soak-credential.js";
import {
  RetentionSoakHeartbeatPump,
  type RetentionSoakHeartbeatMetrics,
} from "./retention-soak-heartbeat.js";
import { verifyRetentionSoakLock } from "./retention-soak-lock.js";
import {
  collectRetentionSoakProvenance,
  parseRetentionSoakContainerStats,
  retentionSoakExecFile,
  retentionSoakProvenanceMatches,
  retentionSoakWorkerFreshnessProof,
  type RetentionSoakProvenance,
  type RetentionSoakWorkerFreshnessProof,
} from "./retention-soak-provenance.js";
import {
  assertRetentionSoakSessionLiveness,
  retentionSoakActivityPayload,
  retentionSoakDryRunPlan,
  retentionSoakPreflight,
  retentionSoakReport,
  type RetentionSoakSample,
} from "./retention-soak.js";
import {
  retentionSoakSampleQuery,
  type RetentionSoakSampleDatabaseState,
} from "./retention-soak-query.js";

if (process.argv.includes("--dry-run"))
  process.env.WORKMESH_RETENTION_SOAK_DRY_RUN = "1";
if (process.env.WORKMESH_RETENTION_SOAK !== "1") {
  process.stdout.write(
    "[SKIP] retention soak is opt-in; set WORKMESH_RETENTION_SOAK=1\n",
  );
  process.exit(0);
}

const options = retentionSoakPreflight(process.env);
const lockProof = await verifyRetentionSoakLock({
  statePath: options.statePath,
  sessionId: options.sessionId,
  lockPath: process.env.WORKMESH_RETENTION_SOAK_LOCK_PATH,
  lockFd: process.env.WORKMESH_RETENTION_SOAK_LOCK_FD,
  sessionScopeSha256:
    process.env.WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256,
});
const provenance = await collectRetentionSoakProvenance({
  containerRoles: options.containerRoles,
  expectedBuildSha: options.expectedBuildSha,
  apiUrl: options.apiUrl,
  databaseUrl: options.databaseUrl,
  redisUrl: options.redisUrl,
});
const timestamp = new Date().toISOString().replaceAll(":", "-");
const reportDirectory = resolve(
  process.env.WORKMESH_RETENTION_SOAK_REPORT_DIRECTORY ??
    `.tmp/retention-soak/${timestamp}`,
);
const samplePath = resolve(reportDirectory, "samples.jsonl");
const reportPath = resolve(reportDirectory, "report.json");
await mkdir(reportDirectory, { recursive: true });

if (options.dryRun) {
  const plan = retentionSoakDryRunPlan(options, lockProof, provenance);
  await writeFile(reportPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `[DRY RUN] formal 24-hour retention soak plan: ${reportPath}\n`,
  );
  process.exit(0);
}
await writeFile(samplePath, "", { encoding: "utf8", flag: "wx" });

const containerStats = async (): Promise<
  RetentionSoakSample["containers"]
> => {
  let output: string;
  try {
    output = await retentionSoakExecFile(
      "docker",
      [
        "stats",
        "--no-stream",
        "--no-trunc",
        "--format",
        "{{json .}}",
        ...options.containers,
      ],
      5_000,
    );
  } catch {
    throw new Error("RETENTION_SOAK_DOCKER_STATS_FAILED");
  }
  return parseRetentionSoakContainerStats(output, provenance);
};

const db = createDb(options.databaseUrl);
const redis = createClient({ url: options.redisUrl });
const credentials = new RetentionSoakCredentialManager({
  apiUrl: options.apiUrl,
  sessionId: options.sessionId,
  installationToken: options.installationToken,
});
let reportStartedAt: Date | undefined;
const samples: RetentionSoakSample[] = [];
let baseline: RetentionSoakSample | undefined;
let activityCount = 0;
let heartbeatPump: RetentionSoakHeartbeatPump | undefined;
let heartbeatMetrics: RetentionSoakHeartbeatMetrics | undefined;
let endingProvenance: RetentionSoakProvenance | undefined;
let initialWorkerFreshness: RetentionSoakWorkerFreshnessProof | undefined;
let endingWorkerFreshness: RetentionSoakWorkerFreshnessProof | undefined;
let reportEndedAt: Date | undefined;
const generatedEventCursors: string[] = [];

const backdateNewActivityEvent = async (
  cursorBefore: string,
): Promise<string> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const event = (
      await db.query<{ id: string; cursor: string }>(
        `SELECT event.id,event.cursor::text AS cursor
           FROM domain_events event
           JOIN outbox_events outbox ON outbox.domain_event_id=event.id
          WHERE event.session_id=$1 AND event.cursor>$2::bigint
            AND outbox.status='delivered'
          ORDER BY event.cursor DESC LIMIT 1`,
        [options.sessionId, cursorBefore],
      )
    ).rows[0];
    if (event) {
      await db.query(
        "UPDATE domain_events SET occurred_at=now()-interval '91 days' WHERE id=$1",
        [event.id],
      );
      return event.cursor;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("RETENTION_SOAK_OUTBOX_DELIVERY_TIMEOUT");
};

try {
  await redis.connect();
  const identity = (
    await db.query<{
      workspaceId: string;
      workerMode: string | null;
      workerSeenAt: Date | null;
      workerInstanceId: string | null;
      workerBuildSha: string | null;
      state: string;
      heartbeatHealth: string;
      lastHeartbeatAt: Date | null;
    }>(
      `SELECT session.workspace_id AS "workspaceId",
              session.state,
              session.heartbeat_health AS "heartbeatHealth",
              session.last_heartbeat_at AS "lastHeartbeatAt",
              runtime.worker_mode AS "workerMode",
              runtime.worker_seen_at AS "workerSeenAt",
              runtime.worker_instance_id::text AS "workerInstanceId",
              runtime.worker_build_sha AS "workerBuildSha"
         FROM agent_sessions session
         LEFT JOIN retention_job_state runtime
           ON runtime.workspace_id=session.workspace_id
          AND runtime.job_name='worker_runtime'
        WHERE session.id=$1`,
      [options.sessionId],
    )
  ).rows[0];
  if (!identity) throw new Error("RETENTION_SOAK_SESSION_NOT_FOUND");
  assertRetentionSoakSessionLiveness(identity, new Date(), options.liveness);
  initialWorkerFreshness = retentionSoakWorkerFreshnessProof(
    provenance.workerRuntimeIdentity,
    identity,
    new Date(),
  );

  const runtimeStartedAtMs = Date.now();
  heartbeatPump = new RetentionSoakHeartbeatPump({
    initialServerAcceptedAt: identity.lastHeartbeatAt!.toISOString(),
    intervalMs: options.liveness.heartbeatIntervalMs,
    maximumGapMs: options.liveness.maximumExpectedHeartbeatGapMs,
    sendHeartbeat: async () =>
      await callRetentionSoakHeartbeat(
        credentials,
        options.apiUrl,
        options.sessionId,
        Math.floor((Date.now() - runtimeStartedAtMs) / 1_000),
      ),
  });
  // The first authoritative heartbeat includes initial token refresh and must
  // complete before the baseline. Later beats run independently of sampling.
  await heartbeatPump.start();
  heartbeatPump.assertHealthy();
  const startedAt = new Date();
  reportStartedAt = startedAt;

  const collectSample = async (
    activityLatencyMs: number | null,
  ): Promise<RetentionSoakSample> => {
    heartbeatPump!.assertHealthy();
    const heartbeat = heartbeatPump!.metrics();
    const state = (
      await db.query<RetentionSoakSampleDatabaseState>(
        retentionSoakSampleQuery,
        [identity.workspaceId, generatedEventCursors, startedAt],
      )
    ).rows[0]!;
    const redisInfo = await redis.info("clients");
    const redisConnections = Number(
      /^connected_clients:(\d+)$/m.exec(redisInfo)?.[1] ?? "0",
    );
    const sampledAt = new Date();
    const sample: RetentionSoakSample = {
      sampledAt: sampledAt.toISOString(),
      floor: state.floor,
      workerMode: state.workerMode,
      workerFresh:
        sampledAt.getTime() - state.workerSeenAt.getTime() <= 120_000,
      archive: {
        planned: Number(state.planned),
        uploaded: Number(state.uploaded),
        verified: Number(state.verified),
        verifiedRows: Number(state.verifiedRows),
        failed: Number(state.failed),
        pruned: Number(state.pruned),
        backlog: Number(state.backlog),
        maximumLatencyMs: Number(state.maximumLatencyMs),
        currentRunGenerated: generatedEventCursors.length,
        currentRunArchived: Number(state.currentRunArchived),
      },
      outbox: {
        pending: Number(state.outboxPending),
        maximumLagMs: Number(state.outboxLagMs),
      },
      redis: {
        length: await redis.xLen("workmesh:domain-events"),
        connections: redisConnections,
      },
      database: {
        rows: Number(state.rows),
        sizeBytes: Number(state.sizeBytes),
        tableSizeBytes: Number(state.tableSizeBytes),
        deadTuples: Number(state.deadTuples),
        connections: Number(state.connections),
      },
      workload: {
        heartbeats: heartbeat.successfulHeartbeats,
        activities: activityCount,
        heartbeatLatencyMs: heartbeat.lastLatencyMs,
        activityLatencyMs,
      },
      containers: await containerStats(),
    };
    heartbeatPump!.assertHealthy();
    return sample;
  };

  baseline = await collectSample(null);
  await appendFile(
    samplePath,
    `${JSON.stringify({ kind: "baseline", ...baseline })}\n`,
    { encoding: "utf8", flag: "a" },
  );
  const deadline = startedAt.getTime() + options.durationMs;
  for (let index = 0; Date.now() < deadline; index += 1) {
    heartbeatPump.assertHealthy();
    let activityLatencyMs: number | null = null;
    if ((index + 1) % options.activityEverySamples === 0) {
      const cursorBefore = (
        await db.query<{ cursor: string }>(
          "SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events WHERE session_id=$1",
          [options.sessionId],
        )
      ).rows[0]!.cursor;
      activityLatencyMs = await callRetentionSoakAgent(
        credentials,
        options.apiUrl,
        `/api/v1/agent-sessions/${options.sessionId}/activities`,
        retentionSoakActivityPayload,
      );
      const generatedCursor = await backdateNewActivityEvent(cursorBefore);
      generatedEventCursors.push(generatedCursor);
      activityCount += 1;
    }

    const sample = await collectSample(activityLatencyMs);
    samples.push(sample);
    await appendFile(
      samplePath,
      `${JSON.stringify({ kind: "sample", ...sample })}\n`,
      {
        encoding: "utf8",
        flag: "a",
      },
    );
    const nextSampleAt =
      startedAt.getTime() + (index + 1) * options.sampleIntervalMs;
    const remaining = Math.min(deadline, nextSampleAt) - Date.now();
    if (remaining > 0)
      await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  heartbeatPump.assertHealthy();
  await heartbeatPump.stop();
  heartbeatMetrics = heartbeatPump.metrics();
  reportEndedAt = new Date(heartbeatMetrics.observedThroughAt!);
  const endingRuntime = (
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
        WHERE workspace_id=$1 AND job_name='worker_runtime'`,
      [identity.workspaceId],
    )
  ).rows[0];
  if (!endingRuntime)
    throw new Error("RETENTION_SOAK_REQUIRES_FRESH_ARCHIVE_ONLY_WORKER");
  endingProvenance = await collectRetentionSoakProvenance({
    containerRoles: options.containerRoles,
    expectedBuildSha: options.expectedBuildSha,
    apiUrl: options.apiUrl,
    databaseUrl: options.databaseUrl,
    redisUrl: options.redisUrl,
  });
  endingWorkerFreshness = retentionSoakWorkerFreshnessProof(
    endingProvenance.workerRuntimeIdentity,
    endingRuntime,
    reportEndedAt,
  );
} finally {
  if (heartbeatPump && !heartbeatMetrics) {
    await heartbeatPump.stop();
    heartbeatMetrics = heartbeatPump.metrics();
    reportEndedAt = new Date(heartbeatMetrics.observedThroughAt!);
  }
  if (redis.isOpen) await redis.quit();
  await db.end();
}

if (!baseline) throw new Error("RETENTION_SOAK_BASELINE_NOT_CAPTURED");
if (!reportStartedAt) throw new Error("RETENTION_SOAK_START_TIME_NOT_CAPTURED");
if (!heartbeatMetrics)
  throw new Error("RETENTION_SOAK_HEARTBEAT_EVIDENCE_MISSING");
if (
  !reportEndedAt ||
  !endingProvenance ||
  !initialWorkerFreshness ||
  !endingWorkerFreshness
)
  throw new Error("RETENTION_SOAK_FORMAL_END_EVIDENCE_MISSING");
const expectedSamples = Math.floor(
  options.durationMs / options.sampleIntervalMs,
);
const report = retentionSoakReport(
  reportStartedAt,
  reportEndedAt,
  baseline,
  samples,
  options.redisLimit,
  options.thresholds,
  expectedSamples,
  generatedEventCursors,
  credentials.metrics(),
  options.liveness,
  {
    heartbeat: heartbeatMetrics,
    lock: lockProof,
    provenance,
    endingProvenance,
    provenanceUnchanged: retentionSoakProvenanceMatches(
      provenance,
      endingProvenance,
    ),
    workerFreshness: {
      initial: initialWorkerFreshness,
      ending: endingWorkerFreshness,
    },
  },
);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`[REPORT] ${reportPath}\n`);
if (report.status !== "passed") process.exitCode = 1;
