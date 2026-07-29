export type RetentionSoakOptions = Readonly<{
  databaseUrl: string;
  redisUrl: string;
  apiUrl: string;
  sessionId: string;
  sessionToken: string;
  durationMs: number;
  sampleIntervalMs: number;
  redisLimit: number;
  activityEverySamples: number;
  containers: readonly string[];
  dryRun: boolean;
}>;

const required = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
};

export const retentionSoakPreflight = (
  env: NodeJS.ProcessEnv,
): RetentionSoakOptions => {
  if (env.WORKMESH_RETENTION_SOAK !== "1")
    throw new Error("RETENTION_SOAK_NOT_ENABLED");
  if (env.RUN_INTEGRATION !== "1")
    throw new Error("RETENTION_SOAK_REQUIRES_INTEGRATION_MODE");
  const databaseUrl = required(
    env.DATABASE_URL,
    "RETENTION_SOAK_REQUIRES_DATABASE_AND_REDIS",
  );
  const redisUrl = required(
    env.REDIS_URL,
    "RETENTION_SOAK_REQUIRES_DATABASE_AND_REDIS",
  );
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!/(^|[_-])test(?:[_-]|$)/i.test(databaseName))
    throw new Error("RETENTION_SOAK_REQUIRES_ISOLATED_TEST_DATABASE");
  if (env.WORKMESH_EVENT_PRUNE_ENABLED !== "false")
    throw new Error("RETENTION_SOAK_REQUIRES_PRUNE_DISABLED");
  if (env.WORKMESH_RETENTION_CLEANUP_ENABLED !== "false")
    throw new Error("RETENTION_SOAK_REQUIRES_CLEANUP_DISABLED");
  if (env.WORKMESH_RETENTION_ARCHIVE_ENABLED !== "true")
    throw new Error("RETENTION_SOAK_REQUIRES_ARCHIVE_ENABLED");

  const dryRun = env.WORKMESH_RETENTION_SOAK_DRY_RUN === "1";
  const hours = Number(env.WORKMESH_RETENTION_SOAK_HOURS ?? "24");
  if (hours !== 24)
    throw new Error("RETENTION_SOAK_FORMAL_DURATION_MUST_BE_24_HOURS");
  const sampleSeconds = Number(
    env.WORKMESH_RETENTION_SOAK_SAMPLE_SECONDS ?? "60",
  );
  const redisLimit = Number(env.WORKMESH_REALTIME_REDIS_MAXLEN ?? "100000");
  const activityEverySamples = Number(
    env.WORKMESH_RETENTION_SOAK_ACTIVITY_EVERY_SAMPLES ?? "5",
  );
  if (
    !Number.isInteger(sampleSeconds)
    || sampleSeconds < 1
    || sampleSeconds > 3600
  )
    throw new Error("RETENTION_SOAK_SAMPLE_INTERVAL_INVALID");
  if (!Number.isInteger(redisLimit) || redisLimit < 100)
    throw new Error("RETENTION_SOAK_REDIS_LIMIT_INVALID");
  if (!Number.isInteger(activityEverySamples) || activityEverySamples < 1)
    throw new Error("RETENTION_SOAK_ACTIVITY_INTERVAL_INVALID");
  const containers = required(
    env.WORKMESH_RETENTION_SOAK_CONTAINERS,
    "RETENTION_SOAK_REQUIRES_CONTAINER_STATS_TARGETS",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (containers.length < 2)
    throw new Error("RETENTION_SOAK_REQUIRES_CONTAINER_STATS_TARGETS");

  return {
    databaseUrl,
    redisUrl,
    apiUrl: new URL(
      required(
        env.WORKMESH_RETENTION_SOAK_API_URL,
        "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
      ),
    ).toString().replace(/\/$/, ""),
    sessionId: required(
      env.WORKMESH_RETENTION_SOAK_SESSION_ID,
      "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
    ),
    sessionToken: required(
      env.WORKMESH_RETENTION_SOAK_SESSION_TOKEN,
      "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
    ),
    durationMs: hours * 3_600_000,
    sampleIntervalMs: sampleSeconds * 1_000,
    redisLimit,
    activityEverySamples,
    containers,
    dryRun,
  };
};

export type RetentionSoakSample = Readonly<{
  sampledAt: string;
  floor: string;
  workerMode: string;
  workerFresh: boolean;
  archive: Readonly<{
    planned: number;
    uploaded: number;
    verified: number;
    failed: number;
    pruned: number;
    backlog: number;
    maximumLatencyMs: number;
  }>;
  redis: Readonly<{ length: number; connections: number }>;
  database: Readonly<{
    rows: number;
    sizeBytes: number;
    connections: number;
  }>;
  workload: Readonly<{
    heartbeats: number;
    activities: number;
    heartbeatLatencyMs: number;
    activityLatencyMs: number | null;
  }>;
  containers: Readonly<Record<string, Readonly<{
    cpuPercent: number;
    memoryBytes: number;
  }>>>;
}>;

const slopePerHour = (
  samples: readonly RetentionSoakSample[],
  value: (sample: RetentionSoakSample) => number,
): number => {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || first === last) return 0;
  const hours =
    (new Date(last.sampledAt).getTime() - new Date(first.sampledAt).getTime())
    / 3_600_000;
  return hours > 0 ? (value(last) - value(first)) / hours : 0;
};

export const retentionSoakReport = (
  startedAt: Date,
  endedAt: Date,
  samples: readonly RetentionSoakSample[],
  redisLimit: number,
  expectedSamples = 1,
) => {
  const first = samples[0];
  const maximum = (value: (sample: RetentionSoakSample) => number): number =>
    Math.max(0, ...samples.map(value));
  const checks = {
    samplesComplete: samples.length >= expectedSamples,
    workerStayedFresh: samples.every(
      (sample) => sample.workerFresh && sample.workerMode === "archive_only",
    ),
    archivesVerified: maximum((sample) => sample.archive.verified) > 0,
    noArchiveFailures: samples.every((sample) => sample.archive.failed === 0),
    noPruning: samples.every((sample) => sample.archive.pruned === 0),
    floorStable: samples.every((sample) => sample.floor === first?.floor),
    redisBounded: samples.every(
      (sample) => sample.redis.length <= redisLimit,
    ),
    activeWorkload:
      maximum((sample) => sample.workload.heartbeats) > 0
      && maximum((sample) => sample.workload.activities) > 0,
  };
  return {
    schemaVersion: 1,
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    sampleCount: samples.length,
    expectedSamples,
    checks,
    maxima: {
      failedArchiveSegments: maximum((sample) => sample.archive.failed),
      archiveLatencyMs: maximum(
        (sample) => sample.archive.maximumLatencyMs,
      ),
      redisLength: maximum((sample) => sample.redis.length),
      databaseConnections: maximum(
        (sample) => sample.database.connections,
      ),
      redisConnections: maximum((sample) => sample.redis.connections),
      heartbeatLatencyMs: maximum(
        (sample) => sample.workload.heartbeatLatencyMs,
      ),
    },
    slopesPerHour: {
      databaseRows: slopePerHour(samples, (sample) => sample.database.rows),
      databaseBytes: slopePerHour(
        samples,
        (sample) => sample.database.sizeBytes,
      ),
      redisLength: slopePerHour(samples, (sample) => sample.redis.length),
      containerMemoryBytes: Object.fromEntries(
        Object.keys(first?.containers ?? {}).map((name) => [
          name,
          slopePerHour(
            samples,
            (sample) => sample.containers[name]?.memoryBytes ?? 0,
          ),
        ]),
      ),
    },
    retentionFloorAdvanced: !checks.floorStable,
    redisLimit,
  };
};
