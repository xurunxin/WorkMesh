import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFile,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "redis";
import { createDb } from "@workmesh/db";
import {
  retentionSoakPreflight,
  retentionSoakReport,
  type RetentionSoakSample,
} from "./retention-soak.js";

if (process.argv.includes("--dry-run"))
  process.env.WORKMESH_RETENTION_SOAK_DRY_RUN = "1";
if (process.env.WORKMESH_RETENTION_SOAK !== "1") {
  process.stdout.write(
    "[SKIP] retention soak is opt-in; set WORKMESH_RETENTION_SOAK=1\n",
  );
  process.exit(0);
}

const options = retentionSoakPreflight(process.env);
const timestamp = new Date().toISOString().replaceAll(":", "-");
const reportDirectory = resolve(
  process.env.WORKMESH_RETENTION_SOAK_REPORT_DIRECTORY
    ?? `.tmp/retention-soak/${timestamp}`,
);
const samplePath = resolve(reportDirectory, "samples.jsonl");
const reportPath = resolve(reportDirectory, "report.json");
await mkdir(reportDirectory, { recursive: true });

if (options.dryRun) {
  const plan = {
    schemaVersion: 1,
    status: "dry_run",
    formalDurationHours: 24,
    sampleIntervalSeconds: options.sampleIntervalMs / 1_000,
    activeWorkload: true,
    archiveOnly: true,
    cleanupEnabled: false,
    pruneEnabled: false,
    isolatedDatabase: true,
    containerStatsTargets: options.containers.length,
    artifacts: ["samples.jsonl", "report.json"],
  };
  await writeFile(reportPath, `${JSON.stringify(plan, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  process.stdout.write(
    `[DRY RUN] formal 24-hour retention soak plan: ${reportPath}\n`,
  );
  process.exit(0);
}

const parseBytes = (value: string): number => {
  const match = /^([\d.]+)\s*([kmgt]?i?b)$/i.exec(value.trim());
  if (!match) throw new Error("RETENTION_SOAK_DOCKER_MEMORY_PARSE_FAILED");
  const scale: Record<string, number> = {
    b: 1,
    kb: 1_000,
    kib: 1_024,
    mb: 1_000_000,
    mib: 1_048_576,
    gb: 1_000_000_000,
    gib: 1_073_741_824,
    tb: 1_000_000_000_000,
    tib: 1_099_511_627_776,
  };
  return Number(match[1]) * scale[match[2]!.toLowerCase()]!;
};

const containerStats = (): RetentionSoakSample["containers"] => {
  const executable = process.platform === "win32" ? "docker.exe" : "docker";
  const output = execFileSync(
    executable,
    [
      "stats",
      "--no-stream",
      "--format",
      "{{json .}}",
      ...options.containers,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  const result: Record<string, { cpuPercent: number; memoryBytes: number }> = {};
  for (const line of output.trim().split(/\r?\n/)) {
    if (!line) continue;
    const row = JSON.parse(line) as {
      Name: string;
      CPUPerc: string;
      MemUsage: string;
    };
    result[row.Name] = {
      cpuPercent: Number(row.CPUPerc.replace("%", "")),
      memoryBytes: parseBytes(row.MemUsage.split("/")[0]!),
    };
  }
  if (Object.keys(result).length !== options.containers.length)
    throw new Error("RETENTION_SOAK_CONTAINER_STATS_INCOMPLETE");
  return result;
};

const callAgent = async (
  path: string,
  payload: object,
): Promise<number> => {
  const started = performance.now();
  const response = await fetch(`${options.apiUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.sessionToken}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify(payload),
  });
  await response.arrayBuffer();
  if (!response.ok)
    throw new Error(`RETENTION_SOAK_ACTIVE_WORKLOAD_HTTP_${response.status}`);
  return performance.now() - started;
};

const db = createDb(options.databaseUrl);
const redis = createClient({ url: options.redisUrl });
const startedAt = new Date();
const samples: RetentionSoakSample[] = [];
let heartbeatCount = 0;
let activityCount = 0;

const backdateNewActivityEvent = async (cursorBefore: string): Promise<void> => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const event = (
      await db.query<{ id: string }>(
        `SELECT event.id
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
      return;
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
    }>(
      `SELECT session.workspace_id AS "workspaceId",
              runtime.worker_mode AS "workerMode",
              runtime.worker_seen_at AS "workerSeenAt"
         FROM agent_sessions session
         LEFT JOIN retention_job_state runtime
           ON runtime.workspace_id=session.workspace_id
          AND runtime.job_name='worker_runtime'
        WHERE session.id=$1`,
      [options.sessionId],
    )
  ).rows[0];
  if (!identity) throw new Error("RETENTION_SOAK_SESSION_NOT_FOUND");
  if (
    identity.workerMode !== "archive_only"
    || !identity.workerSeenAt
    || Date.now() - identity.workerSeenAt.getTime() > 120_000
  )
    throw new Error("RETENTION_SOAK_REQUIRES_FRESH_ARCHIVE_ONLY_WORKER");

  const deadline = startedAt.getTime() + options.durationMs;
  for (let index = 0; Date.now() < deadline; index += 1) {
    const heartbeatLatencyMs = await callAgent(
      `/api/v1/agent-sessions/${options.sessionId}/heartbeat`,
      { usage: { runtimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1_000) } },
    );
    heartbeatCount += 1;
    let activityLatencyMs: number | null = null;
    if (index % options.activityEverySamples === 0) {
      const cursorBefore = (
        await db.query<{ cursor: string }>(
          "SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events WHERE session_id=$1",
          [options.sessionId],
        )
      ).rows[0]!.cursor;
      activityLatencyMs = await callAgent(
        `/api/v1/agent-sessions/${options.sessionId}/activities`,
        {
          kind: "progress",
          summary: "Retention soak workload pulse",
          artifactIds: [],
          references: [],
          visibility: "team",
          ephemeral: false,
        },
      );
      activityCount += 1;
      await backdateNewActivityEvent(cursorBefore);
    }

    const state = (
      await db.query<{
        floor: string;
        workerMode: string;
        workerSeenAt: Date;
        planned: string;
        uploaded: string;
        verified: string;
        failed: string;
        pruned: string;
        backlog: string;
        maximumLatencyMs: string;
        rows: string;
        sizeBytes: string;
        connections: string;
      }>(
        `SELECT floor.pruned_through_cursor::text AS floor,
                runtime.worker_mode AS "workerMode",
                runtime.worker_seen_at AS "workerSeenAt",
                count(segment.id) FILTER (WHERE segment.state='planned')::text AS planned,
                count(segment.id) FILTER (WHERE segment.state='uploaded')::text AS uploaded,
                count(segment.id) FILTER (WHERE segment.state='verified')::text AS verified,
                count(segment.id) FILTER (WHERE segment.state='failed')::text AS failed,
                count(segment.id) FILTER (WHERE segment.state='pruned')::text AS pruned,
                (SELECT count(*) FROM domain_events event
                  WHERE event.workspace_id=$1
                    AND event.occurred_at<=now()-interval '90 days')::text AS backlog,
                COALESCE(max(EXTRACT(EPOCH FROM
                  (segment.verified_at-segment.created_at))*1000),0)::text
                  AS "maximumLatencyMs",
                (SELECT count(*) FROM domain_events
                  WHERE workspace_id=$1)::text AS rows,
                pg_database_size(current_database())::text AS "sizeBytes",
                (SELECT count(*) FROM pg_stat_activity
                  WHERE datname=current_database())::text AS connections
           FROM event_retention_state floor
           JOIN retention_job_state runtime
             ON runtime.workspace_id=floor.workspace_id
            AND runtime.job_name='worker_runtime'
           LEFT JOIN event_archive_segments segment
             ON segment.workspace_id=floor.workspace_id
          WHERE floor.workspace_id=$1
          GROUP BY floor.pruned_through_cursor,runtime.worker_mode,
                   runtime.worker_seen_at`,
        [identity.workspaceId],
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
        failed: Number(state.failed),
        pruned: Number(state.pruned),
        backlog: Number(state.backlog),
        maximumLatencyMs: Number(state.maximumLatencyMs),
      },
      redis: {
        length: await redis.xLen("workmesh:domain-events"),
        connections: redisConnections,
      },
      database: {
        rows: Number(state.rows),
        sizeBytes: Number(state.sizeBytes),
        connections: Number(state.connections),
      },
      workload: {
        heartbeats: heartbeatCount,
        activities: activityCount,
        heartbeatLatencyMs,
        activityLatencyMs,
      },
      containers: containerStats(),
    };
    samples.push(sample);
    await appendFile(samplePath, `${JSON.stringify(sample)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
    const nextSampleAt =
      startedAt.getTime() + (index + 1) * options.sampleIntervalMs;
    const remaining = Math.min(deadline, nextSampleAt) - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, remaining),
      );
  }
} finally {
  if (redis.isOpen) await redis.quit();
  await db.end();
}

const expectedSamples = Math.floor(options.durationMs / options.sampleIntervalMs);
const report = retentionSoakReport(
  startedAt,
  new Date(),
  samples,
  options.redisLimit,
  expectedSamples,
);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`[REPORT] ${reportPath}\n`);
if (report.status !== "passed") process.exitCode = 1;
