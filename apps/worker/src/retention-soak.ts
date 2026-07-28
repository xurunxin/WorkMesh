export type RetentionSoakOptions = Readonly<{
  databaseUrl: string;
  redisUrl: string;
  durationMs: number;
  sampleIntervalMs: number;
  redisLimit: number;
}>;

export const retentionSoakPreflight = (
  env: NodeJS.ProcessEnv,
): RetentionSoakOptions => {
  if (env.WORKMESH_RETENTION_SOAK !== "1")
    throw new Error("RETENTION_SOAK_NOT_ENABLED");
  if (env.RUN_INTEGRATION !== "1")
    throw new Error("RETENTION_SOAK_REQUIRES_INTEGRATION_MODE");
  if (!env.DATABASE_URL || !env.REDIS_URL)
    throw new Error("RETENTION_SOAK_REQUIRES_DATABASE_AND_REDIS");
  const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
  if (!/(^|[_-])test(?:[_-]|$)/i.test(databaseName))
    throw new Error("RETENTION_SOAK_REQUIRES_ISOLATED_TEST_DATABASE");
  if (env.WORKMESH_EVENT_PRUNE_ENABLED === "true")
    throw new Error("RETENTION_SOAK_REQUIRES_PRUNE_DISABLED");
  if (env.WORKMESH_RETENTION_ARCHIVE_ENABLED === "false")
    throw new Error("RETENTION_SOAK_REQUIRES_ARCHIVE_ENABLED");
  const hours = Number(env.WORKMESH_RETENTION_SOAK_HOURS ?? "24");
  const sampleSeconds = Number(
    env.WORKMESH_RETENTION_SOAK_SAMPLE_SECONDS ?? "60",
  );
  const redisLimit = Number(env.WORKMESH_REALTIME_REDIS_MAXLEN ?? "100000");
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
    throw new Error("RETENTION_SOAK_DURATION_INVALID");
  if (
    !Number.isInteger(sampleSeconds) ||
    sampleSeconds < 1 ||
    sampleSeconds > 3600
  )
    throw new Error("RETENTION_SOAK_SAMPLE_INTERVAL_INVALID");
  if (!Number.isInteger(redisLimit) || redisLimit < 100)
    throw new Error("RETENTION_SOAK_REDIS_LIMIT_INVALID");
  return {
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    durationMs: hours * 3_600_000,
    sampleIntervalMs: sampleSeconds * 1_000,
    redisLimit,
  };
};

export type RetentionSoakSample = Readonly<{
  floor: string;
  failedSegments: number;
  redisLength: number;
}>;

export const retentionSoakReport = (
  startedAt: Date,
  endedAt: Date,
  samples: readonly RetentionSoakSample[],
  redisLimit: number,
) => ({
  status:
    samples.length > 0 &&
    samples.every((sample) => sample.failedSegments === 0) &&
    samples.every((sample) => sample.redisLength <= redisLimit) &&
    samples.every((sample) => sample.floor === samples[0]!.floor)
      ? "passed"
      : "failed",
  startedAt: startedAt.toISOString(),
  endedAt: endedAt.toISOString(),
  sampleCount: samples.length,
  failedArchiveSegments: Math.max(
    0,
    ...samples.map((sample) => sample.failedSegments),
  ),
  maximumRedisLength: Math.max(
    0,
    ...samples.map((sample) => sample.redisLength),
  ),
  redisLimit,
  retentionFloorAdvanced: samples.some(
    (sample) => sample.floor !== samples[0]?.floor,
  ),
});
