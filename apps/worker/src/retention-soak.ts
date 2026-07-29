import { appendActivityInputSchema } from "@workmesh/contracts";

export const retentionSoakActivityPayload = appendActivityInputSchema.parse({
  kind: "status",
  summary: "Retention soak workload pulse",
  artifactIds: [],
  references: [],
  visibility: "team",
  ephemeral: false,
});

export type RetentionSoakThresholds = Readonly<{
  maximumArchiveBacklog: number;
  maximumArchiveLatencyMs: number;
  maximumOutboxPending: number;
  maximumOutboxLagMs: number;
  maximumCpuPercent: number;
  maximumMemoryBytes: number;
  maximumDatabaseConnections: number;
  maximumRedisConnections: number;
  maximumHeartbeatLatencyMs: number;
  maximumActivityLatencyMs: number;
  maximumDatabaseRowsSlopePerHour: number;
  maximumDatabaseBytesSlopePerHour: number;
  maximumTableBytesSlopePerHour: number;
  maximumDeadTuplesSlopePerHour: number;
  maximumRedisLengthSlopePerHour: number;
  maximumContainerMemorySlopeBytesPerHour: number;
}>;

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
  thresholds: RetentionSoakThresholds;
  dryRun: boolean;
}>;

const required = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
};

const nonNegativeNumber = (
  value: string | undefined,
  fallback: number,
  code: string,
): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(code);
  return parsed;
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
  const thresholds: RetentionSoakThresholds = {
    maximumArchiveBacklog: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_BACKLOG,
      5,
      "RETENTION_SOAK_ARCHIVE_BACKLOG_THRESHOLD_INVALID",
    ),
    maximumArchiveLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_LATENCY_MS,
      300_000,
      "RETENTION_SOAK_ARCHIVE_LATENCY_THRESHOLD_INVALID",
    ),
    maximumOutboxPending: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_OUTBOX_PENDING,
      5,
      "RETENTION_SOAK_OUTBOX_PENDING_THRESHOLD_INVALID",
    ),
    maximumOutboxLagMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_OUTBOX_LAG_MS,
      60_000,
      "RETENTION_SOAK_OUTBOX_LAG_THRESHOLD_INVALID",
    ),
    maximumCpuPercent: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_CPU_PERCENT,
      85,
      "RETENTION_SOAK_CPU_THRESHOLD_INVALID",
    ),
    maximumMemoryBytes: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_MEMORY_BYTES,
      1_073_741_824,
      "RETENTION_SOAK_MEMORY_THRESHOLD_INVALID",
    ),
    maximumDatabaseConnections: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_CONNECTIONS,
      50,
      "RETENTION_SOAK_DATABASE_CONNECTION_THRESHOLD_INVALID",
    ),
    maximumRedisConnections: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_REDIS_CONNECTIONS,
      50,
      "RETENTION_SOAK_REDIS_CONNECTION_THRESHOLD_INVALID",
    ),
    maximumHeartbeatLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_HEARTBEAT_LATENCY_MS,
      1_000,
      "RETENTION_SOAK_HEARTBEAT_LATENCY_THRESHOLD_INVALID",
    ),
    maximumActivityLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ACTIVITY_LATENCY_MS,
      2_000,
      "RETENTION_SOAK_ACTIVITY_LATENCY_THRESHOLD_INVALID",
    ),
    maximumDatabaseRowsSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_ROWS_SLOPE_PER_HOUR,
      24,
      "RETENTION_SOAK_DATABASE_ROWS_SLOPE_THRESHOLD_INVALID",
    ),
    maximumDatabaseBytesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_BYTES_SLOPE_PER_HOUR,
      16_777_216,
      "RETENTION_SOAK_DATABASE_BYTES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumTableBytesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_TABLE_BYTES_SLOPE_PER_HOUR,
      8_388_608,
      "RETENTION_SOAK_TABLE_BYTES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumDeadTuplesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DEAD_TUPLES_SLOPE_PER_HOUR,
      100,
      "RETENTION_SOAK_DEAD_TUPLES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumRedisLengthSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_REDIS_LENGTH_SLOPE_PER_HOUR,
      24,
      "RETENTION_SOAK_REDIS_LENGTH_SLOPE_THRESHOLD_INVALID",
    ),
    maximumContainerMemorySlopeBytesPerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_CONTAINER_MEMORY_SLOPE_BYTES_PER_HOUR,
      16_777_216,
      "RETENTION_SOAK_CONTAINER_MEMORY_SLOPE_THRESHOLD_INVALID",
    ),
  };

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
    thresholds,
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
    verifiedRows: number;
    failed: number;
    pruned: number;
    backlog: number;
    maximumLatencyMs: number;
    currentRunGenerated: number;
    currentRunArchived: number;
  }>;
  outbox: Readonly<{ pending: number; maximumLagMs: number }>;
  redis: Readonly<{ length: number; connections: number }>;
  database: Readonly<{
    rows: number;
    sizeBytes: number;
    tableSizeBytes: number;
    deadTuples: number;
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

const maximumGrowthSlopePerHour = (
  samples: readonly RetentionSoakSample[],
  value: (sample: RetentionSoakSample) => number,
): number => {
  const baseline = samples[0];
  if (!baseline) return 0;
  const baselineAt = new Date(baseline.sampledAt).getTime();
  return Math.max(
    0,
    ...samples.slice(1).map((sample) => {
      const elapsedHours =
        (new Date(sample.sampledAt).getTime() - baselineAt) / 3_600_000;
      if (elapsedHours <= 0)
        return value(sample) > value(baseline) ? Number.POSITIVE_INFINITY : 0;
      return (value(sample) - value(baseline)) / elapsedHours;
    }),
  );
};

export const retentionSoakReport = (
  startedAt: Date,
  endedAt: Date,
  baseline: RetentionSoakSample,
  samples: readonly RetentionSoakSample[],
  redisLimit: number,
  thresholds: RetentionSoakThresholds,
  expectedSamples = 1,
  generatedCursors: readonly string[] = [],
) => {
  const series = [baseline, ...samples];
  const last = samples.at(-1);
  const maximum = (value: (sample: RetentionSoakSample) => number): number =>
    Math.max(0, ...series.map(value));
  const endToEndSlopesPerHour = {
    databaseRows: slopePerHour(
      series,
      (sample) => sample.database.rows,
    ),
    databaseBytes: slopePerHour(
      series,
      (sample) => sample.database.sizeBytes,
    ),
    tableBytes: slopePerHour(
      series,
      (sample) => sample.database.tableSizeBytes,
    ),
    deadTuples: slopePerHour(
      series,
      (sample) => sample.database.deadTuples,
    ),
    redisLength: slopePerHour(
      series,
      (sample) => sample.redis.length,
    ),
    archiveBacklog: slopePerHour(
      series,
      (sample) => sample.archive.backlog,
    ),
    outboxPending: slopePerHour(
      series,
      (sample) => sample.outbox.pending,
    ),
    containerMemoryBytes: Object.fromEntries(
      Object.keys(baseline.containers).map((name) => [
        name,
        slopePerHour(
          series,
          (sample) => sample.containers[name]?.memoryBytes ?? 0,
        ),
      ]),
    ),
  };
  const maximumGrowthSlopesPerHour = {
    databaseRows: maximumGrowthSlopePerHour(
      series,
      (sample) => sample.database.rows,
    ),
    databaseBytes: maximumGrowthSlopePerHour(
      series,
      (sample) => sample.database.sizeBytes,
    ),
    tableBytes: maximumGrowthSlopePerHour(
      series,
      (sample) => sample.database.tableSizeBytes,
    ),
    deadTuples: maximumGrowthSlopePerHour(
      series,
      (sample) => sample.database.deadTuples,
    ),
    redisLength: maximumGrowthSlopePerHour(
      series,
      (sample) => sample.redis.length,
    ),
    containerMemoryBytes: Object.fromEntries(
      Object.keys(baseline.containers).map((name) => [
        name,
        maximumGrowthSlopePerHour(
          series,
          (sample) => sample.containers[name]?.memoryBytes ?? 0,
        ),
      ]),
    ),
  };
  const maximumCpuPercent = Object.fromEntries(
    Object.keys(baseline.containers).map((name) => [
      name,
      maximum((sample) => sample.containers[name]?.cpuPercent ?? 0),
    ]),
  );
  const maximumMemoryBytes = Object.fromEntries(
    Object.keys(baseline.containers).map((name) => [
      name,
      maximum((sample) => sample.containers[name]?.memoryBytes ?? 0),
    ]),
  );
  const deltas = {
    verifiedSegments:
      (last?.archive.verified ?? 0) - baseline.archive.verified,
    verifiedRows:
      (last?.archive.verifiedRows ?? 0) - baseline.archive.verifiedRows,
    databaseRows:
      (last?.database.rows ?? 0) - baseline.database.rows,
    currentRunGenerated: last?.archive.currentRunGenerated ?? 0,
    currentRunArchived: last?.archive.currentRunArchived ?? 0,
  };
  const normalizedCursors = generatedCursors.map((cursor) => cursor.trim());
  const cursorEvidenceValid =
    normalizedCursors.every((cursor) => /^\d+$/.test(cursor))
    && new Set(normalizedCursors).size === normalizedCursors.length
    && normalizedCursors.length === deltas.currentRunGenerated;
  if (cursorEvidenceValid)
    normalizedCursors.sort((left, right) =>
      BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
  const maxima = {
    failedArchiveSegments: maximum((sample) => sample.archive.failed),
    archiveBacklog: maximum((sample) => sample.archive.backlog),
    archiveLatencyMs: maximum(
      (sample) => sample.archive.maximumLatencyMs,
    ),
    outboxPending: maximum((sample) => sample.outbox.pending),
    outboxLagMs: maximum((sample) => sample.outbox.maximumLagMs),
    redisLength: maximum((sample) => sample.redis.length),
    databaseConnections: maximum(
      (sample) => sample.database.connections,
    ),
    redisConnections: maximum((sample) => sample.redis.connections),
    heartbeatLatencyMs: maximum(
      (sample) => sample.workload.heartbeatLatencyMs,
    ),
    activityLatencyMs: maximum(
      (sample) => sample.workload.activityLatencyMs ?? 0,
    ),
    cpuPercent: maximumCpuPercent,
    memoryBytes: maximumMemoryBytes,
  };
  const checks = {
    samplesComplete: samples.length >= expectedSamples,
    formalDurationComplete:
      endedAt.getTime() - startedAt.getTime() >= 86_400_000,
    workerStayedFresh: series.every(
      (sample) => sample.workerFresh && sample.workerMode === "archive_only",
    ),
    archivesVerifiedThisRun: deltas.verifiedSegments > 0,
    generatedEventsArchived:
      deltas.currentRunGenerated > 0
      && deltas.currentRunArchived === deltas.currentRunGenerated,
    generatedCursorEvidenceComplete: cursorEvidenceValid,
    verifiedRowAccounting:
      deltas.verifiedRows >= deltas.currentRunGenerated,
    generatedRowAccounting:
      deltas.databaseRows >= deltas.currentRunGenerated,
    noArchiveFailures: series.every((sample) => sample.archive.failed === 0),
    noPruning: series.every((sample) => sample.archive.pruned === 0),
    floorStable: series.every((sample) => sample.floor === baseline.floor),
    archiveBacklogBounded:
      maxima.archiveBacklog <= thresholds.maximumArchiveBacklog,
    archiveBacklogConverged:
      last !== undefined
      && last.archive.backlog <= baseline.archive.backlog,
    outboxBounded:
      maxima.outboxPending <= thresholds.maximumOutboxPending
      && maxima.outboxLagMs <= thresholds.maximumOutboxLagMs,
    outboxConverged:
      last !== undefined
      && last.outbox.pending <= baseline.outbox.pending,
    redisBounded: series.every(
      (sample) => sample.redis.length <= redisLimit,
    ),
    activeWorkload:
      maximum((sample) => sample.workload.heartbeats) > 0
      && maximum((sample) => sample.workload.activities) > 0,
    latencyBounded:
      maxima.archiveLatencyMs <= thresholds.maximumArchiveLatencyMs
      && maxima.heartbeatLatencyMs <= thresholds.maximumHeartbeatLatencyMs
      && maxima.activityLatencyMs <= thresholds.maximumActivityLatencyMs,
    connectionsBounded:
      maxima.databaseConnections <= thresholds.maximumDatabaseConnections
      && maxima.redisConnections <= thresholds.maximumRedisConnections,
    cpuBounded: Object.values(maximumCpuPercent).every(
      (value) => value <= thresholds.maximumCpuPercent,
    ),
    memoryBounded: Object.values(maximumMemoryBytes).every(
      (value) => value <= thresholds.maximumMemoryBytes,
    ),
    databaseRowsGrowthBounded:
      maximumGrowthSlopesPerHour.databaseRows
        <= thresholds.maximumDatabaseRowsSlopePerHour,
    databaseBytesGrowthBounded:
      maximumGrowthSlopesPerHour.databaseBytes
        <= thresholds.maximumDatabaseBytesSlopePerHour,
    tableBytesGrowthBounded:
      maximumGrowthSlopesPerHour.tableBytes
        <= thresholds.maximumTableBytesSlopePerHour,
    deadTuplesGrowthBounded:
      maximumGrowthSlopesPerHour.deadTuples
        <= thresholds.maximumDeadTuplesSlopePerHour,
    redisGrowthBounded:
      maximumGrowthSlopesPerHour.redisLength
        <= thresholds.maximumRedisLengthSlopePerHour,
    containerMemoryGrowthBounded:
      Object.values(maximumGrowthSlopesPerHour.containerMemoryBytes).every(
        (value) =>
          value <= thresholds.maximumContainerMemorySlopeBytesPerHour,
      ),
  };
  return {
    schemaVersion: 2,
    status: Object.values(checks).every(Boolean) ? "passed" : "failed",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    baselineSampledAt: baseline.sampledAt,
    sampleCount: samples.length,
    expectedSamples,
    checks,
    thresholds: {
      ...thresholds,
      redisLengthLimit: redisLimit,
    },
    actual: {
      baseline: {
        verifiedSegments: baseline.archive.verified,
        verifiedRows: baseline.archive.verifiedRows,
        archiveBacklog: baseline.archive.backlog,
        outboxPending: baseline.outbox.pending,
        databaseRows: baseline.database.rows,
        databaseBytes: baseline.database.sizeBytes,
        tableBytes: baseline.database.tableSizeBytes,
        deadTuples: baseline.database.deadTuples,
        redisLength: baseline.redis.length,
      },
      deltas,
      generatedCursors: normalizedCursors,
      maxima,
      endToEndSlopesPerHour,
      maximumGrowthSlopesPerHour,
      endState: last
        ? {
            archiveBacklog: last.archive.backlog,
            outboxPending: last.outbox.pending,
            redisLength: last.redis.length,
          }
        : null,
    },
    retentionFloorAdvanced: !checks.floorStable,
    redisLimit,
  };
};
