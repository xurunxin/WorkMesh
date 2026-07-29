import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseComposeRows } from "./retention-compose-json.mjs";

const root = resolve(import.meta.dirname, "..");
const execute = process.argv.includes("--execute");
if (process.env.RUN_INTEGRATION !== "1")
  throw new Error("RETENTION_ACCEPTANCE_REQUIRES_INTEGRATION_MODE");

const composeFile = resolve(
  root,
  process.env.RETENTION_ACCEPTANCE_COMPOSE_FILE
    ?? "docker-compose.production.yml",
);
const timestamp = new Date().toISOString().replaceAll(":", "-");
const reportDirectory = resolve(
  root,
  process.env.RETENTION_ACCEPTANCE_REPORT_DIRECTORY
    ?? `.tmp/retention-acceptance/${timestamp}`,
);
await mkdir(reportDirectory, { recursive: true });
const reportPath = resolve(reportDirectory, "report.json");
const runSuffix = randomUUID().replaceAll("-", "").slice(0, 12);
const projectName = `workmesh-retention-${runSuffix}`;
const databaseName = `workmesh_retention_${runSuffix}_test`;
const restoreDatabaseName = `workmesh_retention_restore_${runSuffix}_test`;
const plannedSteps = [
  "create and validate an exact isolated Compose project, volumes, and test databases",
  "create durable checkpoint, outbox, cursor, protected-row, and Redis state through the isolated API",
  "restart isolated Redis, API, and Worker containers",
  "recover the committed outbox claim and Redis hint in the same stack",
  "reclaim the stale retention fence and verify a pinned Object Lock segment",
  "replay and expire a cursor through the same API and database",
  "restore the pinned version after a same-key second-version write",
  "remove only the exact Compose project and verify its containers, volumes, and network are gone",
];

if (!execute) {
  await writeFile(
    reportPath,
    `${JSON.stringify({
      schemaVersion: 2,
      status: "dry_run",
      composeFile: composeFile.split(/[\\/]/).at(-1),
      isolatedProjectRef: projectName,
      isolatedDatabaseIdentity: `${projectName}/postgres/${databaseName}`,
      createsOwnComposeProject: true,
      createsOwnVolumes: true,
      ignoresExternalDatabaseUrl: true,
      exactProjectCleanup: true,
      buildsImages: false,
      pushesImages: false,
      steps: plannedSteps,
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  process.stdout.write(
    `[DRY RUN] isolated retention restart/contention plan: ${reportPath}\n`,
  );
  process.exit(0);
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`RETENTION_ACCEPTANCE_REQUIRES_${name}`);
  return value;
};
const immutableImage = (name: string): string => {
  const value = required(name);
  if (
    !/^sha256:[0-9a-f]{64}$/i.test(value)
    && !/@sha256:[0-9a-f]{64}$/i.test(value)
  )
    throw new Error(`RETENTION_ACCEPTANCE_REQUIRES_IMMUTABLE_${name}`);
  return value;
};
const apiImage = immutableImage("WORKMESH_API_IMAGE");
const workerImage = immutableImage("WORKMESH_WORKER_IMAGE");
const buildSha = required("WORKMESH_BUILD_SHA");
if (!/^[0-9a-f]{40}$/i.test(buildSha))
  throw new Error("RETENTION_ACCEPTANCE_BUILD_SHA_INVALID");
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const randomSecret = (): string => randomBytes(32).toString("base64url");
const fingerprint = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
const reservePort = async (): Promise<number> =>
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("RETENTION_ACCEPTANCE_PORT_RESERVATION_FAILED"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });

const [apiPort, postgresPort, minioPort] = await Promise.all([
  reservePort(),
  reservePort(),
  reservePort(),
]);
const postgresUser = `wm_${runSuffix}`;
const postgresPassword = randomSecret();
const minioUser = `wm${runSuffix}`;
const minioPassword = randomSecret();
const bootstrapToken = randomSecret();
const paginationKey = randomSecret();
const apiUrl = `http://127.0.0.1:${apiPort}`;
const sourceDatabaseUrl =
  `postgres://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${databaseName}`;
const restoreDatabaseUrl =
  `postgres://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${restoreDatabaseName}`;
const acceptanceEnv: NodeJS.ProcessEnv = {
  ...process.env,
  COMPOSE_PROJECT_NAME: projectName,
  POSTGRES_DB: databaseName,
  POSTGRES_USER: postgresUser,
  POSTGRES_PASSWORD: postgresPassword,
  MINIO_ROOT_USER: minioUser,
  MINIO_ROOT_PASSWORD: minioPassword,
  S3_ACCESS_KEY_ID: minioUser,
  S3_SECRET_ACCESS_KEY: minioPassword,
  S3_BUCKET: `retention-${runSuffix}`,
  S3_HOST_PORT: String(minioPort),
  // The API runs inside the Compose network. Host-only MinIO coordinates are
  // supplied separately to the host-side restore rehearsal below.
  S3_PUBLIC_ENDPOINT: "http://minio:9000",
  API_HOST_PORT: String(apiPort),
  WORKMESH_API_IMAGE: apiImage,
  WORKMESH_WORKER_IMAGE: workerImage,
  // Compose interpolates optional services even though this gate never starts
  // them. Reusing supplied immutable images does not build or pull new ones.
  WORKMESH_WEB_IMAGE: process.env.WORKMESH_WEB_IMAGE ?? apiImage,
  WORKMESH_MCP_IMAGE: process.env.WORKMESH_MCP_IMAGE ?? apiImage,
  WORKMESH_BUILD_SHA: buildSha,
  SESSION_SECRET: randomSecret(),
  WORKMESH_MASTER_KEY: randomSecret(),
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
  PAGINATION_CURSOR_KEYS: `retention-acceptance:${paginationKey}`,
  PAGINATION_CURSOR_ACTIVE_KID: "retention-acceptance",
  AUTH_RATE_LIMIT_HMAC_KEY: randomSecret(),
  WEB_ORIGIN: apiUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
  WORKMESH_RETENTION_INTERVAL_SECONDS: "60",
  WORKMESH_RETENTION_IO_TIMEOUT_SECONDS: "30",
  WORKMESH_RETENTION_PROGRESS_STALE_SECONDS: "180",
  WORKMESH_RETENTION_ARCHIVE_ENABLED: "true",
  WORKMESH_RETENTION_CLEANUP_ENABLED: "false",
  WORKMESH_EVENT_PRUNE_ENABLED: "false",
};
const overridePath = resolve(reportDirectory, "compose.isolation.yml");
await writeFile(
  overridePath,
  `services:\n  postgres:\n    ports:\n      - "127.0.0.1:${postgresPort}:5432"\n`,
  { encoding: "utf8", flag: "wx" },
);

type StepResult = Readonly<{
  name: string;
  durationMs: number;
  status: "passed";
}>;
const results: StepResult[] = [];
const command = (
  name: string,
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = acceptanceEnv,
): void => {
  const started = performance.now();
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`RETENTION_ACCEPTANCE_STEP_FAILED:${name}`);
  results.push({
    name,
    durationMs: performance.now() - started,
    status: "passed",
  });
};
const capture = (
  name: string,
  executable: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = acceptanceEnv,
): string => {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`RETENTION_ACCEPTANCE_STEP_FAILED:${name}`);
  return result.stdout.trim();
};
const composeBase = [
  "compose",
  "-p",
  projectName,
  "-f",
  composeFile,
  "-f",
  overridePath,
];
const compose = (name: string, ...args: string[]): void =>
  command(name, docker, [...composeBase, ...args]);
const captureCompose = (name: string, ...args: string[]): string =>
  capture(name, docker, [...composeBase, ...args]);
const psql = (sql: string, database = databaseName): string =>
  captureCompose(
    "isolated PostgreSQL query",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    postgresUser,
    "-d",
    database,
    "-Atc",
    sql,
  );
const redisCli = (...args: string[]): string =>
  captureCompose(
    "isolated Redis query",
    "exec",
    "-T",
    "redis",
    "redis-cli",
    "--raw",
    ...args,
  );
const waitUntil = async (
  code: string,
  probe: () => boolean,
  timeoutMs = 180_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (probe()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  }
  throw new Error(code);
};
const waitHealthy = async (services: readonly string[]): Promise<void> => {
  await waitUntil(
    `RETENTION_ACCEPTANCE_HEALTH_TIMEOUT:${services.join(",")}`,
    () => {
      const output = captureCompose(
        "isolated Compose health query",
        "ps",
        "--format",
        "json",
        ...services,
      );
      if (!output) return false;
      const rows = parseComposeRows(output);
      return services.every((service) =>
        rows.some((row) =>
          row.Service === service
          && row.State === "running"
          && row.Health === "healthy"));
    },
  );
};
const uuid = (value: unknown, code: string): string => {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new Error(code);
  return value;
};
const httpJson = async (
  path: string,
  init: RequestInit,
  expectedStatus = 200,
): Promise<{ response: Response; body: Record<string, unknown> }> => {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = await response.json() as Record<string, unknown>;
  if (response.status !== expectedStatus)
    throw new Error(`RETENTION_ACCEPTANCE_HTTP_${response.status}`);
  return { response, body };
};
const nextSseId = async (cookie: string, cursor: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${apiUrl}/api/v1/events/stream?cursor=${cursor}`,
      { headers: { cookie }, signal: controller.signal },
    );
    if (response.status !== 200 || !response.body)
      throw new Error("RETENTION_ACCEPTANCE_SSE_REPLAY_FAILED");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      const match = /^id:\s*(\d+)$/m.exec(text);
      if (match) {
        await reader.cancel();
        return match[1]!;
      }
    }
    throw new Error("RETENTION_ACCEPTANCE_SSE_REPLAY_FAILED");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
};

let containers: Array<{ service: string; idRef: string }> = [];
let volumes: string[] = [];
let networks: string[] = [];
let cleanupVerified = false;
let databaseIdentity = "";
let checkpointCursor = "";
let recoveredCursor = "";
let protectedEventRef = "";
let staleFence = "";
let recoveredFence = "";
let archiveVersionPinned = false;
let outboxRecovered = false;
let redisRecovered = false;
let cursorReplayed = false;
let cursorExpired = false;
try {
  compose(
    "create isolated acceptance stack",
    "up",
    "-d",
    "postgres",
    "redis",
    "minio",
    "minio-init",
    "migrate",
    "api",
    "worker",
  );
  await waitHealthy(["postgres", "redis", "minio", "api", "worker"]);

  const composeRows = parseComposeRows(
    captureCompose("inspect isolated containers", "ps", "-a", "--format", "json"),
  );
  const expectedServices = new Set([
    "postgres",
    "redis",
    "minio",
    "minio-init",
    "migrate",
    "api",
    "worker",
  ]);
  if (
    composeRows.some((row) => row.Project !== projectName)
    || [...expectedServices].some((service) =>
      !composeRows.some((row) => row.Service === service && row.ID))
  )
    throw new Error("RETENTION_ACCEPTANCE_COMPOSE_ISOLATION_FAILED");
  containers = composeRows
    .filter((row): row is { ID: string; Service: string; Project?: string } =>
      Boolean(row.ID && row.Service))
    .map((row) => ({ service: row.Service, idRef: fingerprint(row.ID) }));

  const volumeOutput = capture(
    "inspect isolated volumes",
    docker,
    [
      "volume",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${projectName}`,
      "--format",
      "{{.Name}}",
    ],
  );
  volumes = volumeOutput.split(/\r?\n/).filter(Boolean);
  if (
    volumes.length !== 3
    || volumes.some((name) => !name.startsWith(`${projectName}_`))
  )
    throw new Error("RETENTION_ACCEPTANCE_VOLUME_ISOLATION_FAILED");
  const networkOutput = capture(
    "inspect isolated networks",
    docker,
    [
      "network",
      "ls",
      "--filter",
      `label=com.docker.compose.project=${projectName}`,
      "--format",
      "{{.Name}}",
    ],
  );
  networks = networkOutput.split(/\r?\n/).filter(Boolean);
  if (
    networks.length !== 1
    || networks.some((name) => !name.startsWith(`${projectName}_`))
  )
    throw new Error("RETENTION_ACCEPTANCE_NETWORK_ISOLATION_FAILED");
  databaseIdentity = psql("SELECT current_database()");
  if (databaseIdentity !== databaseName)
    throw new Error("RETENTION_ACCEPTANCE_DATABASE_ISOLATION_FAILED");

  const install = await httpJson(
    "/api/v1/auth/install",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `install-${runSuffix}`,
        "x-workmesh-bootstrap-token": bootstrapToken,
      },
      body: JSON.stringify({
        name: "Retention restart acceptance",
        slug: `retention-${runSuffix}`,
        adminName: "Acceptance administrator",
        email: `${runSuffix}@retention.test`,
        password: randomSecret(),
      }),
    },
  );
  const cookie = (install.response.headers.get("set-cookie") ?? "").split(";")[0]!;
  const csrfToken = String(install.body.csrfToken ?? "");
  if (!cookie.startsWith("workmesh_session=") || csrfToken.length < 32)
    throw new Error("RETENTION_ACCEPTANCE_INSTALL_SESSION_FAILED");
  const me = await httpJson("/api/v1/auth/me", { headers: { cookie } });
  const actor = me.body.actor as Record<string, unknown> | undefined;
  const actorId = uuid(actor?.id, "RETENTION_ACCEPTANCE_ACTOR_ID_INVALID");
  const teams = await httpJson("/api/v1/teams", { headers: { cookie } });
  const teamItems = teams.body.items as Array<Record<string, unknown>> | undefined;
  const teamId = uuid(
    teamItems?.[0]?.id,
    "RETENTION_ACCEPTANCE_TEAM_ID_INVALID",
  );
  const workspaceId = uuid(
    psql(`SELECT workspace_id FROM actors WHERE id='${actorId}'`),
    "RETENTION_ACCEPTANCE_WORKSPACE_ID_INVALID",
  );
  await waitUntil(
    "RETENTION_ACCEPTANCE_INITIAL_OUTBOX_TIMEOUT",
    () => psql("SELECT count(*) FROM outbox_events WHERE status<>'delivered'") === "0",
  );
  await waitUntil(
    "RETENTION_ACCEPTANCE_INITIAL_REDIS_HINT_TIMEOUT",
    () => Number(redisCli("XLEN", "workmesh:domain-events")) > 0,
  );
  checkpointCursor = psql(
    `SELECT max(cursor)::text FROM domain_events WHERE workspace_id='${workspaceId}'`,
  );
  const protectedEventId = uuid(
    psql(
      `SELECT id FROM domain_events
        WHERE workspace_id='${workspaceId}'
          AND event_type NOT IN(
            'workspace.updated','team.created','team.updated','project.created',
            'project.updated','work_item.created','work_item.updated',
            'work_item.state_changed','comment.created','comment.updated',
            'agent.session.health_changed','agent.activity.appended',
            'notification.created','notification.read',
            'notification.preferences_updated'
          )
        ORDER BY cursor LIMIT 1`,
    ),
    "RETENTION_ACCEPTANCE_PROTECTED_EVENT_MISSING",
  );
  protectedEventRef = fingerprint(protectedEventId);
  const redisLengthBefore = Number(
    redisCli("XLEN", "workmesh:domain-events"),
  );

  compose("stop isolated Worker before checkpoint", "stop", "worker");
  const project = await httpJson(
    "/api/v1/projects",
    {
      method: "POST",
      headers: {
        cookie,
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
        "idempotency-key": `checkpoint-${runSuffix}`,
      },
      body: JSON.stringify({
        teamId,
        name: "Retention restart checkpoint",
        description: "created through isolated acceptance API",
        leadActorId: actorId,
      }),
    },
  );
  const projectId = uuid(
    project.body.id,
    "RETENTION_ACCEPTANCE_PROJECT_ID_INVALID",
  );
  const checkpointEvent = psql(
    `SELECT id||'|'||cursor::text
       FROM domain_events
      WHERE workspace_id='${workspaceId}' AND aggregate_id='${projectId}'
      ORDER BY cursor DESC LIMIT 1`,
  ).split("|");
  const checkpointEventId = uuid(
    checkpointEvent[0],
    "RETENTION_ACCEPTANCE_CHECKPOINT_EVENT_MISSING",
  );
  recoveredCursor = checkpointEvent[1] ?? "";
  if (BigInt(recoveredCursor) <= BigInt(checkpointCursor))
    throw new Error("RETENTION_ACCEPTANCE_CURSOR_CHECKPOINT_INVALID");
  psql(
    `UPDATE domain_events
        SET occurred_at=now()-interval '91 days'
      WHERE id='${checkpointEventId}';
     UPDATE outbox_events
        SET status='delivering',locked_at=now()-interval '10 minutes',
            locked_by='retention-acceptance-stale',delivered_at=NULL
      WHERE domain_event_id='${checkpointEventId}';
     INSERT INTO retention_job_state(
       job_name,workspace_id,lease_owner,lease_expires_at,fence,fixed_cutoff_at
     ) VALUES(
       'event_archive','${workspaceId}','retention-acceptance-stale',
       now()-interval '1 second',1,now()-interval '90 days'
     )
     ON CONFLICT(job_name,workspace_id) DO UPDATE
       SET lease_owner='retention-acceptance-stale',
           lease_expires_at=now()-interval '1 second',
           fence=retention_job_state.fence+1,
           fixed_cutoff_at=now()-interval '90 days',
           updated_at=now()`,
  );
  staleFence = psql(
    `SELECT fence::text FROM retention_job_state
      WHERE job_name='event_archive' AND workspace_id='${workspaceId}'`,
  );

  compose("restart isolated Redis", "restart", "redis");
  await waitHealthy(["redis"]);
  compose("restart isolated API and Worker", "restart", "api", "worker");
  await waitHealthy(["api", "worker"]);
  await httpJson("/api/v1/auth/me", { headers: { cookie } });
  await waitUntil(
    "RETENTION_ACCEPTANCE_OUTBOX_RECOVERY_TIMEOUT",
    () => psql(
      `SELECT status FROM outbox_events WHERE domain_event_id='${checkpointEventId}'`,
    ) === "delivered",
  );
  outboxRecovered = true;
  await waitUntil(
    "RETENTION_ACCEPTANCE_ARCHIVE_RECOVERY_TIMEOUT",
    () => psql(
      `SELECT count(*) FROM event_archive_segments
        WHERE workspace_id='${workspaceId}' AND state='verified'
          AND start_cursor<=${recoveredCursor}::bigint
          AND end_cursor>=${recoveredCursor}::bigint
          AND object_version_id<>''`,
    ) === "1",
  );
  const fenceRow = psql(
    `SELECT fence::text||'|'||coalesce(lease_owner,'')
       FROM retention_job_state
      WHERE job_name='event_archive' AND workspace_id='${workspaceId}'`,
  ).split("|");
  recoveredFence = fenceRow[0] ?? "";
  if (
    BigInt(recoveredFence) <= BigInt(staleFence)
    || fenceRow[1] === "retention-acceptance-stale"
  )
    throw new Error("RETENTION_ACCEPTANCE_FENCE_RECOVERY_FAILED");
  archiveVersionPinned = true;
  if (
    psql(`SELECT count(*) FROM domain_events WHERE id='${protectedEventId}'`)
    !== "1"
  )
    throw new Error("RETENTION_ACCEPTANCE_PROTECTED_EVENT_LOST");

  await waitUntil(
    "RETENTION_ACCEPTANCE_REDIS_RECOVERY_TIMEOUT",
    () => Number(redisCli("XLEN", "workmesh:domain-events")) >= redisLengthBefore,
  );
  redisRecovered = true;
  const replayedId = await nextSseId(cookie, checkpointCursor);
  if (BigInt(replayedId) < BigInt(recoveredCursor))
    throw new Error("RETENTION_ACCEPTANCE_CURSOR_REPLAY_FAILED");
  cursorReplayed = true;
  psql(
    `UPDATE event_retention_state
        SET pruned_through_cursor=${recoveredCursor}::bigint,updated_at=now()
      WHERE workspace_id='${workspaceId}'`,
  );
  const expired = await httpJson(
    `/api/v1/events/stream?cursor=${checkpointCursor}`,
    { headers: { cookie } },
    409,
  );
  const expiredError = expired.body.error as Record<string, unknown> | undefined;
  if (expiredError?.code !== "CURSOR_EXPIRED")
    throw new Error("RETENTION_ACCEPTANCE_CURSOR_EXPIRY_FAILED");
  cursorExpired = true;

  psql(`CREATE DATABASE ${restoreDatabaseName}`, "postgres");
  command(
    "same-stack pinned-version restore rehearsal",
    pnpm,
    ["test:restore:retention"],
    {
      ...acceptanceEnv,
      RUN_INTEGRATION: "1",
      DATABASE_URL: sourceDatabaseUrl,
      RESTORE_DATABASE_URL: restoreDatabaseUrl,
      S3_ENDPOINT: `http://127.0.0.1:${minioPort}`,
      RETENTION_RESTORE_REPORT_DIRECTORY: resolve(
        reportDirectory,
        "restore",
      ),
    },
  );
} finally {
  try {
    compose(
      "remove exact isolated acceptance project",
      "down",
      "-v",
      "--remove-orphans",
    );
  } finally {
    const remainingContainers = capture(
      "verify isolated containers removed",
      docker,
      [
        "ps",
        "-a",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
        "--format",
        "{{.ID}}",
      ],
    );
    const remainingVolumes = capture(
      "verify isolated volumes removed",
      docker,
      [
        "volume",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
        "--format",
        "{{.Name}}",
      ],
    );
    const remainingNetworks = capture(
      "verify isolated networks removed",
      docker,
      [
        "network",
        "ls",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
        "--format",
        "{{.Name}}",
      ],
    );
    cleanupVerified =
      !remainingContainers && !remainingVolumes && !remainingNetworks;
  }
}

if (!cleanupVerified)
  throw new Error("RETENTION_ACCEPTANCE_EXACT_PROJECT_CLEANUP_FAILED");
await writeFile(
  reportPath,
  `${JSON.stringify({
    schemaVersion: 2,
    status: "passed",
    completedAt: new Date().toISOString(),
    isolatedProjectRef: projectName,
    isolatedDatabaseIdentity: `${projectName}/postgres/${databaseIdentity}`,
    imageDigests: {
      api: apiImage,
      worker: workerImage,
    },
    buildSha,
    containerRefs: containers,
    volumeRefs: volumes.map(fingerprint),
    networkRefs: networks.map(fingerprint),
    checkpointCursor,
    recoveredCursor,
    protectedEventRef,
    staleFence,
    recoveredFence,
    checks: {
      composeIsolationVerified: true,
      volumeIsolationVerified: true,
      networkIsolationVerified: true,
      databaseIsolationVerified: true,
      outboxRecovered,
      redisRecovered,
      cursorReplayed,
      cursorExpired,
      protectedRowPreserved: true,
      retentionFenceReclaimed: true,
      archiveVersionPinned,
      pinnedVersionRestorePassed: true,
      exactProjectCleanupVerified: cleanupVerified,
    },
    buildsImages: false,
    pushesImages: false,
    steps: results,
  }, null, 2)}\n`,
  { encoding: "utf8", flag: "wx" },
);
process.stdout.write(
  `[PASS] isolated retention restart/contention acceptance: ${reportPath}\n`,
);
