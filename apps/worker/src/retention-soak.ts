import { appendActivityInputSchema } from "@workmesh/contracts";
import type { RetentionSoakCredentialMetrics } from "./retention-soak-credential.js";
import type { RetentionSoakHeartbeatMetrics } from "./retention-soak-heartbeat.js";
import type { RetentionSoakLockProof } from "./retention-soak-lock.js";
import type {
  RetentionSoakContainerRole,
  RetentionSoakContainerRoles,
  RetentionSoakProvenance,
  RetentionSoakWorkerFreshnessProof,
} from "./retention-soak-provenance.js";

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

export const RETENTION_SOAK_HARD_STALE_MS = 120_000;
export const RETENTION_SOAK_MAX_SAMPLE_INTERVAL_MS = 30_000;
export const RETENTION_SOAK_REFRESH_BUDGET_MS = 45_000;
export const RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS = 10_000;
export const RETENTION_SOAK_HEARTBEAT_INTERVAL_MS = 15_000;
export const RETENTION_SOAK_MAX_INITIAL_HEARTBEAT_AGE_MS = 45_000;
export const RETENTION_SOAK_DEFAULT_REDIS_LIMIT = 100_000;

export type RetentionSoakLivenessBudget = Readonly<{
  hardStaleMs: number;
  sampleIntervalMs: number;
  heartbeatIntervalMs: number;
  refreshOperationBudgetMs: number;
  workloadRequestBudgetMs: number;
  maximumInitialHeartbeatGapMs: number;
  maximumSteadyHeartbeatGapMs: number;
  maximumExpectedHeartbeatGapMs: number;
  safetyMarginMs: number;
  maximumInitialHeartbeatAgeMs: number;
}>;

export const retentionSoakLivenessBudget = (
  sampleIntervalMs: number,
): RetentionSoakLivenessBudget => {
  const maximumInitialHeartbeatGapMs =
    RETENTION_SOAK_MAX_INITIAL_HEARTBEAT_AGE_MS +
    RETENTION_SOAK_REFRESH_BUDGET_MS +
    RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS;
  const maximumSteadyHeartbeatGapMs =
    RETENTION_SOAK_HEARTBEAT_INTERVAL_MS +
    RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS +
    RETENTION_SOAK_REFRESH_BUDGET_MS +
    RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS;
  const maximumExpectedHeartbeatGapMs = Math.max(
    maximumInitialHeartbeatGapMs,
    maximumSteadyHeartbeatGapMs,
  );
  const safetyMarginMs =
    RETENTION_SOAK_HARD_STALE_MS - maximumExpectedHeartbeatGapMs;
  if (safetyMarginMs <= 0)
    throw new Error("RETENTION_SOAK_HEARTBEAT_LIVENESS_BUDGET_INVALID");
  return {
    hardStaleMs: RETENTION_SOAK_HARD_STALE_MS,
    sampleIntervalMs,
    heartbeatIntervalMs: RETENTION_SOAK_HEARTBEAT_INTERVAL_MS,
    refreshOperationBudgetMs: RETENTION_SOAK_REFRESH_BUDGET_MS,
    workloadRequestBudgetMs: RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS,
    maximumInitialHeartbeatGapMs,
    maximumSteadyHeartbeatGapMs,
    maximumExpectedHeartbeatGapMs,
    safetyMarginMs,
    maximumInitialHeartbeatAgeMs:
      RETENTION_SOAK_MAX_INITIAL_HEARTBEAT_AGE_MS,
  };
};

export const retentionSoakDefaultThresholds: RetentionSoakThresholds = {
  maximumArchiveBacklog: 5,
  maximumArchiveLatencyMs: 300_000,
  maximumOutboxPending: 5,
  maximumOutboxLagMs: 60_000,
  maximumCpuPercent: 85,
  maximumMemoryBytes: 1_073_741_824,
  maximumDatabaseConnections: 50,
  maximumRedisConnections: 50,
  maximumHeartbeatLatencyMs: 1_000,
  maximumActivityLatencyMs: 2_000,
  maximumDatabaseRowsSlopePerHour: 24,
  maximumDatabaseBytesSlopePerHour: 16_777_216,
  maximumTableBytesSlopePerHour: 8_388_608,
  maximumDeadTuplesSlopePerHour: 100,
  maximumRedisLengthSlopePerHour: 24,
  maximumContainerMemorySlopeBytesPerHour: 16_777_216,
};

export type RetentionSoakOptions = Readonly<{
  databaseUrl: string;
  redisUrl: string;
  apiUrl: string;
  sessionId: string;
  installationToken: string;
  statePath: string;
  expectedBuildSha: string;
  durationMs: number;
  sampleIntervalMs: number;
  redisLimit: number;
  activityEverySamples: number;
  containers: readonly string[];
  containerRoles: RetentionSoakContainerRoles;
  thresholds: RetentionSoakThresholds;
  liveness: RetentionSoakLivenessBudget;
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
    env.WORKMESH_RETENTION_SOAK_SAMPLE_SECONDS ?? "30",
  );
  const redisLimit = Number(
    env.WORKMESH_REALTIME_REDIS_MAXLEN ??
      String(RETENTION_SOAK_DEFAULT_REDIS_LIMIT),
  );
  const activityEverySamples = Number(
    env.WORKMESH_RETENTION_SOAK_ACTIVITY_EVERY_SAMPLES ?? "5",
  );
  if (
    !Number.isInteger(sampleSeconds) ||
    sampleSeconds < 1 ||
    sampleSeconds * 1_000 > RETENTION_SOAK_MAX_SAMPLE_INTERVAL_MS
  )
    throw new Error("RETENTION_SOAK_SAMPLE_INTERVAL_INVALID");
  if (!Number.isInteger(redisLimit) || redisLimit < 100)
    throw new Error("RETENTION_SOAK_REDIS_LIMIT_INVALID");
  if (redisLimit > RETENTION_SOAK_DEFAULT_REDIS_LIMIT)
    throw new Error("RETENTION_SOAK_THRESHOLDS_MUST_NOT_BE_LOOSENED");
  if (!Number.isInteger(activityEverySamples) || activityEverySamples < 1)
    throw new Error("RETENTION_SOAK_ACTIVITY_INTERVAL_INVALID");
  const roleVariables: Readonly<
    Record<RetentionSoakContainerRole, string>
  > = {
    api: "WORKMESH_RETENTION_SOAK_API_CONTAINER",
    worker: "WORKMESH_RETENTION_SOAK_WORKER_CONTAINER",
    postgres: "WORKMESH_RETENTION_SOAK_POSTGRES_CONTAINER",
    redis: "WORKMESH_RETENTION_SOAK_REDIS_CONTAINER",
    minio: "WORKMESH_RETENTION_SOAK_MINIO_CONTAINER",
  };
  const containerRoles = Object.fromEntries(
    Object.entries(roleVariables).map(([role, variable]) => [
      role,
      required(
        env[variable],
        "RETENTION_SOAK_CONTAINER_ROLE_MAPPING_INVALID",
      ),
    ]),
  ) as RetentionSoakContainerRoles;
  const containers = Object.values(containerRoles);
  if (new Set(containers).size !== 5)
    throw new Error("RETENTION_SOAK_CONTAINER_ROLE_MAPPING_INVALID");
  const expectedBuildSha = required(
    env.WORKMESH_RETENTION_SOAK_EXPECTED_SHA,
    "RETENTION_SOAK_EXPECTED_SHA_INVALID",
  );
  if (!/^[0-9a-f]{40}$/.test(expectedBuildSha))
    throw new Error("RETENTION_SOAK_EXPECTED_SHA_INVALID");
  const thresholds: RetentionSoakThresholds = {
    maximumArchiveBacklog: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_BACKLOG,
      retentionSoakDefaultThresholds.maximumArchiveBacklog,
      "RETENTION_SOAK_ARCHIVE_BACKLOG_THRESHOLD_INVALID",
    ),
    maximumArchiveLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ARCHIVE_LATENCY_MS,
      retentionSoakDefaultThresholds.maximumArchiveLatencyMs,
      "RETENTION_SOAK_ARCHIVE_LATENCY_THRESHOLD_INVALID",
    ),
    maximumOutboxPending: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_OUTBOX_PENDING,
      retentionSoakDefaultThresholds.maximumOutboxPending,
      "RETENTION_SOAK_OUTBOX_PENDING_THRESHOLD_INVALID",
    ),
    maximumOutboxLagMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_OUTBOX_LAG_MS,
      retentionSoakDefaultThresholds.maximumOutboxLagMs,
      "RETENTION_SOAK_OUTBOX_LAG_THRESHOLD_INVALID",
    ),
    maximumCpuPercent: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_CPU_PERCENT,
      retentionSoakDefaultThresholds.maximumCpuPercent,
      "RETENTION_SOAK_CPU_THRESHOLD_INVALID",
    ),
    maximumMemoryBytes: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_MEMORY_BYTES,
      retentionSoakDefaultThresholds.maximumMemoryBytes,
      "RETENTION_SOAK_MEMORY_THRESHOLD_INVALID",
    ),
    maximumDatabaseConnections: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_CONNECTIONS,
      retentionSoakDefaultThresholds.maximumDatabaseConnections,
      "RETENTION_SOAK_DATABASE_CONNECTION_THRESHOLD_INVALID",
    ),
    maximumRedisConnections: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_REDIS_CONNECTIONS,
      retentionSoakDefaultThresholds.maximumRedisConnections,
      "RETENTION_SOAK_REDIS_CONNECTION_THRESHOLD_INVALID",
    ),
    maximumHeartbeatLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_HEARTBEAT_LATENCY_MS,
      retentionSoakDefaultThresholds.maximumHeartbeatLatencyMs,
      "RETENTION_SOAK_HEARTBEAT_LATENCY_THRESHOLD_INVALID",
    ),
    maximumActivityLatencyMs: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_ACTIVITY_LATENCY_MS,
      retentionSoakDefaultThresholds.maximumActivityLatencyMs,
      "RETENTION_SOAK_ACTIVITY_LATENCY_THRESHOLD_INVALID",
    ),
    maximumDatabaseRowsSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_ROWS_SLOPE_PER_HOUR,
      retentionSoakDefaultThresholds.maximumDatabaseRowsSlopePerHour,
      "RETENTION_SOAK_DATABASE_ROWS_SLOPE_THRESHOLD_INVALID",
    ),
    maximumDatabaseBytesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DATABASE_BYTES_SLOPE_PER_HOUR,
      retentionSoakDefaultThresholds.maximumDatabaseBytesSlopePerHour,
      "RETENTION_SOAK_DATABASE_BYTES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumTableBytesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_TABLE_BYTES_SLOPE_PER_HOUR,
      retentionSoakDefaultThresholds.maximumTableBytesSlopePerHour,
      "RETENTION_SOAK_TABLE_BYTES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumDeadTuplesSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_DEAD_TUPLES_SLOPE_PER_HOUR,
      retentionSoakDefaultThresholds.maximumDeadTuplesSlopePerHour,
      "RETENTION_SOAK_DEAD_TUPLES_SLOPE_THRESHOLD_INVALID",
    ),
    maximumRedisLengthSlopePerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_REDIS_LENGTH_SLOPE_PER_HOUR,
      retentionSoakDefaultThresholds.maximumRedisLengthSlopePerHour,
      "RETENTION_SOAK_REDIS_LENGTH_SLOPE_THRESHOLD_INVALID",
    ),
    maximumContainerMemorySlopeBytesPerHour: nonNegativeNumber(
      env.WORKMESH_RETENTION_SOAK_MAX_CONTAINER_MEMORY_SLOPE_BYTES_PER_HOUR,
      retentionSoakDefaultThresholds.maximumContainerMemorySlopeBytesPerHour,
      "RETENTION_SOAK_CONTAINER_MEMORY_SLOPE_THRESHOLD_INVALID",
    ),
  };
  if (
    Object.entries(thresholds).some(
      ([name, value]) =>
        value >
        retentionSoakDefaultThresholds[
          name as keyof RetentionSoakThresholds
        ],
    )
  )
    throw new Error("RETENTION_SOAK_THRESHOLDS_MUST_NOT_BE_LOOSENED");
  const sampleIntervalMs = sampleSeconds * 1_000;

  return {
    databaseUrl,
    redisUrl,
    apiUrl: new URL(
      required(
        env.WORKMESH_RETENTION_SOAK_API_URL,
        "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
      ),
    )
      .toString()
      .replace(/\/$/, ""),
    sessionId: required(
      env.WORKMESH_RETENTION_SOAK_SESSION_ID,
      "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
    ),
    installationToken: required(
      env.WORKMESH_RETENTION_SOAK_INSTALLATION_TOKEN,
      "RETENTION_SOAK_REQUIRES_ACTIVE_API_WORKLOAD",
    ),
    statePath: required(
      env.WORKMESH_RETENTION_SOAK_STATE_PATH,
      "RETENTION_SOAK_REQUIRES_STATE_PATH",
    ),
    expectedBuildSha,
    durationMs: hours * 3_600_000,
    sampleIntervalMs,
    redisLimit,
    activityEverySamples,
    containers,
    containerRoles,
    thresholds,
    liveness: retentionSoakLivenessBudget(sampleIntervalMs),
    dryRun,
  };
};

export const retentionSoakDryRunPlan = (
  options: RetentionSoakOptions,
  lock: RetentionSoakLockProof,
  provenance: RetentionSoakProvenance,
) => ({
  schemaVersion: 3,
  status: "dry_run" as const,
  formalDurationHours: 24,
  sampleIntervalSeconds: options.sampleIntervalMs / 1_000,
  maximumFormalSampleIntervalSeconds:
    RETENTION_SOAK_MAX_SAMPLE_INTERVAL_MS / 1_000,
  liveness: options.liveness,
  activeWorkload: true,
  proactiveTokenRotation: true,
  minimumTokenRefreshes: 2,
  maximumExpiredBeforeRefresh: 0,
  checks: {
    heartbeatLivenessBudget:
      options.liveness.maximumExpectedHeartbeatGapMs <
        options.liveness.hardStaleMs && options.liveness.safetyMarginMs > 0,
    formalLockVerified:
      lock.verified &&
      lock.fdinfoLockMatched &&
      lock.independentContentionObserved,
    provenanceVerified: provenance.verified,
  },
  archiveOnly: true,
  cleanupEnabled: false,
  pruneEnabled: false,
  isolatedDatabase: true,
  containerStatsTargets: options.containers.length,
  lock,
  provenance,
  thresholds: {
    ...options.thresholds,
    redisLengthLimit: options.redisLimit,
  },
  artifacts: ["samples.jsonl", "report.json"],
});

export type RetentionSoakSessionLiveness = Readonly<{
  state: string;
  heartbeatHealth: string;
  lastHeartbeatAt: Date | null;
}>;

export type RetentionSoakFormalEvidence = Readonly<{
  heartbeat: RetentionSoakHeartbeatMetrics;
  lock: RetentionSoakLockProof;
  provenance: RetentionSoakProvenance;
  endingProvenance: RetentionSoakProvenance;
  provenanceUnchanged: boolean;
  workerFreshness: Readonly<{
    initial: RetentionSoakWorkerFreshnessProof;
    ending: RetentionSoakWorkerFreshnessProof;
  }>;
}>;

export const assertRetentionSoakSessionLiveness = (
  session: RetentionSoakSessionLiveness,
  now: Date,
  budget: RetentionSoakLivenessBudget,
): void => {
  const heartbeatAgeMs = session.lastHeartbeatAt
    ? now.getTime() - session.lastHeartbeatAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (
    session.state !== "executing" ||
    session.heartbeatHealth !== "healthy" ||
    !Number.isFinite(heartbeatAgeMs) ||
    heartbeatAgeMs < 0 ||
    heartbeatAgeMs > budget.maximumInitialHeartbeatAgeMs
  )
    throw new Error("RETENTION_SOAK_SESSION_STALE_REPROVISION_REQUIRED");
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
  containers: Readonly<
    Record<
      string,
      Readonly<{
        cpuPercent: number;
        memoryBytes: number;
      }>
    >
  >;
}>;

const slopePerHour = (
  samples: readonly RetentionSoakSample[],
  value: (sample: RetentionSoakSample) => number,
): number => {
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || first === last) return 0;
  const hours =
    (new Date(last.sampledAt).getTime() - new Date(first.sampledAt).getTime()) /
    3_600_000;
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
  credentialMetrics: RetentionSoakCredentialMetrics = {
    refreshCount: 0,
    maximumRefreshLatencyMs: 0,
    expiredBeforeRefreshCount: 0,
  },
  liveness: RetentionSoakLivenessBudget = retentionSoakLivenessBudget(
    RETENTION_SOAK_MAX_SAMPLE_INTERVAL_MS,
  ),
  formalEvidence?: RetentionSoakFormalEvidence,
) => {
  const series = [baseline, ...samples];
  const last = samples.at(-1);
  const maximum = (value: (sample: RetentionSoakSample) => number): number =>
    Math.max(0, ...series.map(value));
  const endToEndSlopesPerHour = {
    databaseRows: slopePerHour(series, (sample) => sample.database.rows),
    databaseBytes: slopePerHour(series, (sample) => sample.database.sizeBytes),
    tableBytes: slopePerHour(
      series,
      (sample) => sample.database.tableSizeBytes,
    ),
    deadTuples: slopePerHour(series, (sample) => sample.database.deadTuples),
    redisLength: slopePerHour(series, (sample) => sample.redis.length),
    archiveBacklog: slopePerHour(series, (sample) => sample.archive.backlog),
    outboxPending: slopePerHour(series, (sample) => sample.outbox.pending),
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
    verifiedSegments: (last?.archive.verified ?? 0) - baseline.archive.verified,
    verifiedRows:
      (last?.archive.verifiedRows ?? 0) - baseline.archive.verifiedRows,
    databaseRows: (last?.database.rows ?? 0) - baseline.database.rows,
    currentRunGenerated: last?.archive.currentRunGenerated ?? 0,
    currentRunArchived: last?.archive.currentRunArchived ?? 0,
  };
  const normalizedCursors = generatedCursors.map((cursor) => cursor.trim());
  const cursorEvidenceValid =
    normalizedCursors.every((cursor) => /^\d+$/.test(cursor)) &&
    new Set(normalizedCursors).size === normalizedCursors.length &&
    normalizedCursors.length === deltas.currentRunGenerated;
  if (cursorEvidenceValid)
    normalizedCursors.sort((left, right) =>
      BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0,
    );
  const maxima = {
    failedArchiveSegments: maximum((sample) => sample.archive.failed),
    archiveBacklog: maximum((sample) => sample.archive.backlog),
    archiveLatencyMs: maximum((sample) => sample.archive.maximumLatencyMs),
    outboxPending: maximum((sample) => sample.outbox.pending),
    outboxLagMs: maximum((sample) => sample.outbox.maximumLagMs),
    redisLength: maximum((sample) => sample.redis.length),
    databaseConnections: maximum((sample) => sample.database.connections),
    redisConnections: maximum((sample) => sample.redis.connections),
    heartbeatLatencyMs: maximum((sample) => sample.workload.heartbeatLatencyMs),
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
      deltas.currentRunGenerated > 0 &&
      deltas.currentRunArchived === deltas.currentRunGenerated,
    generatedCursorEvidenceComplete: cursorEvidenceValid,
    verifiedRowAccounting: deltas.verifiedRows >= deltas.currentRunGenerated,
    generatedRowAccounting: deltas.databaseRows >= deltas.currentRunGenerated,
    noArchiveFailures: series.every((sample) => sample.archive.failed === 0),
    noPruning: series.every((sample) => sample.archive.pruned === 0),
    floorStable: series.every((sample) => sample.floor === baseline.floor),
    archiveBacklogBounded:
      maxima.archiveBacklog <= thresholds.maximumArchiveBacklog,
    archiveBacklogConverged:
      last !== undefined && last.archive.backlog <= baseline.archive.backlog,
    outboxBounded:
      maxima.outboxPending <= thresholds.maximumOutboxPending &&
      maxima.outboxLagMs <= thresholds.maximumOutboxLagMs,
    outboxConverged:
      last !== undefined && last.outbox.pending <= baseline.outbox.pending,
    redisBounded: series.every((sample) => sample.redis.length <= redisLimit),
    activeWorkload:
      maximum((sample) => sample.workload.heartbeats) > 0 &&
      maximum((sample) => sample.workload.activities) > 0,
    tokenRotationExercised: credentialMetrics.refreshCount >= 2,
    tokenNeverExpiredBeforeRefresh:
      credentialMetrics.expiredBeforeRefreshCount === 0,
    heartbeatLivenessBudget:
      liveness.maximumExpectedHeartbeatGapMs < liveness.hardStaleMs &&
      liveness.safetyMarginMs > 0,
    tokenRefreshLatencyWithinBudget:
      credentialMetrics.maximumRefreshLatencyMs <=
      liveness.refreshOperationBudgetMs,
    heartbeatPumpSucceeded:
      formalEvidence?.heartbeat.healthy === true &&
      formalEvidence.heartbeat.failureCode === null &&
      formalEvidence.heartbeat.successfulHeartbeats > 0 &&
      formalEvidence.heartbeat.observedThroughAt === endedAt.toISOString(),
    observedHeartbeatGapBounded:
      formalEvidence !== undefined &&
      formalEvidence.heartbeat.trailingGapMs !== null &&
      formalEvidence.heartbeat.trailingGapMs >= 0 &&
      formalEvidence.heartbeat.trailingGapMs <=
        liveness.maximumExpectedHeartbeatGapMs &&
      formalEvidence.heartbeat.maximumObservedGapMs <=
        liveness.maximumExpectedHeartbeatGapMs,
    formalLockVerified:
      formalEvidence?.lock.verified === true &&
      formalEvidence.lock.fdinfoLockMatched === true &&
      formalEvidence.lock.independentContentionObserved === true,
    provenanceVerified:
      formalEvidence?.provenance.verified === true &&
      formalEvidence.endingProvenance.verified === true &&
      formalEvidence.provenanceUnchanged &&
      formalEvidence.provenance.expectedBuildSha ===
        formalEvidence.provenance.apiBuildSha &&
      formalEvidence.provenance.sourceHeadSha ===
        formalEvidence.provenance.expectedBuildSha &&
      formalEvidence.workerFreshness.initial.verified &&
      formalEvidence.workerFreshness.ending.verified &&
      formalEvidence.workerFreshness.initial.workerContainerId ===
        formalEvidence.provenance.roles.worker.containerId &&
      formalEvidence.workerFreshness.initial.workerInstanceId ===
        formalEvidence.provenance.workerRuntimeIdentity.instanceId &&
      formalEvidence.workerFreshness.initial.workerBuildSha ===
        formalEvidence.provenance.workerRuntimeIdentity.buildSha &&
      formalEvidence.workerFreshness.ending.workerContainerId ===
        formalEvidence.endingProvenance.roles.worker.containerId &&
      formalEvidence.workerFreshness.ending.workerInstanceId ===
        formalEvidence.endingProvenance.workerRuntimeIdentity.instanceId &&
      formalEvidence.workerFreshness.ending.workerBuildSha ===
        formalEvidence.endingProvenance.workerRuntimeIdentity.buildSha &&
      formalEvidence.workerFreshness.ending.workerIdentityConflictCount ===
        formalEvidence.workerFreshness.initial.workerIdentityConflictCount,
    latencyBounded:
      maxima.archiveLatencyMs <= thresholds.maximumArchiveLatencyMs &&
      maxima.heartbeatLatencyMs <= thresholds.maximumHeartbeatLatencyMs &&
      maxima.activityLatencyMs <= thresholds.maximumActivityLatencyMs,
    connectionsBounded:
      maxima.databaseConnections <= thresholds.maximumDatabaseConnections &&
      maxima.redisConnections <= thresholds.maximumRedisConnections,
    cpuBounded: Object.values(maximumCpuPercent).every(
      (value) => value <= thresholds.maximumCpuPercent,
    ),
    memoryBounded: Object.values(maximumMemoryBytes).every(
      (value) => value <= thresholds.maximumMemoryBytes,
    ),
    databaseRowsGrowthBounded:
      maximumGrowthSlopesPerHour.databaseRows <=
      thresholds.maximumDatabaseRowsSlopePerHour,
    databaseBytesGrowthBounded:
      maximumGrowthSlopesPerHour.databaseBytes <=
      thresholds.maximumDatabaseBytesSlopePerHour,
    tableBytesGrowthBounded:
      maximumGrowthSlopesPerHour.tableBytes <=
      thresholds.maximumTableBytesSlopePerHour,
    deadTuplesGrowthBounded:
      maximumGrowthSlopesPerHour.deadTuples <=
      thresholds.maximumDeadTuplesSlopePerHour,
    redisGrowthBounded:
      maximumGrowthSlopesPerHour.redisLength <=
      thresholds.maximumRedisLengthSlopePerHour,
    containerMemoryGrowthBounded: Object.values(
      maximumGrowthSlopesPerHour.containerMemoryBytes,
    ).every(
      (value) => value <= thresholds.maximumContainerMemorySlopeBytesPerHour,
    ),
  };
  return {
    schemaVersion: 3,
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
    liveness,
    formalEvidence: formalEvidence ?? null,
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
      credentials: credentialMetrics,
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
