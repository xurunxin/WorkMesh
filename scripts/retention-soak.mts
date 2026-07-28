import { createClient } from "redis";
import { createDb } from "@workmesh/db";
import {
  retentionSoakPreflight,
  retentionSoakReport,
  type RetentionSoakSample,
} from "../apps/worker/src/retention-soak.js";

if (process.env.WORKMESH_RETENTION_SOAK !== "1") {
  process.stdout.write(
    "[SKIP] retention soak is opt-in; set WORKMESH_RETENTION_SOAK=1\n",
  );
  process.exit(0);
}

const options = retentionSoakPreflight(process.env);
const db = createDb(options.databaseUrl);
const redis = createClient({ url: options.redisUrl });
const startedAt = new Date();
const samples: RetentionSoakSample[] = [];
try {
  await redis.connect();
  const deadline = Date.now() + options.durationMs;
  while (Date.now() < deadline) {
    const state = (
      await db.query<{
        floor: string;
        failedSegments: string;
      }>(`
      SELECT COALESCE(max(pruned_through_cursor),0)::text AS floor,
             (SELECT count(*) FROM event_archive_segments WHERE state='failed')::text
               AS "failedSegments"
        FROM event_retention_state
    `)
    ).rows[0]!;
    samples.push({
      floor: state.floor,
      failedSegments: Number(state.failedSegments),
      redisLength: await redis.xLen("workmesh:domain-events"),
    });
    const remaining = deadline - Date.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(options.sampleIntervalMs, remaining)),
      );
  }
} finally {
  if (redis.isOpen) await redis.quit();
  await db.end();
}
const report = retentionSoakReport(
  startedAt,
  new Date(),
  samples,
  options.redisLimit,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "passed") process.exitCode = 1;
