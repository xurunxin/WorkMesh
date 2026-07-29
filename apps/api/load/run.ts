import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Pool } from "pg";
import {
  buildPhaseSnapshot,
  compareDecimalCursors,
  DurableCursorTracker,
  openPausedRawSse,
  openSse,
  proveRawSocketOpen,
  SseHttpError,
  waitForRawCloseAfterThreshold,
  waitForRawSaturation,
  withDeadline,
  type SseConnection,
} from "./sse.js";
import { waitForHostApiReadiness } from "./readiness.js";
import {
  buildFailedPhaseCEvidence,
  cleanupAfterPhaseCFailure,
  evaluateHarnessOutcome,
  isFormalAcceptanceEligible,
  parsePhaseCEvidenceWaiver,
  PHASE_C_EVIDENCE_WAIVER_FLAG,
  type EvidenceContinuationCleanup,
} from "./evidence-continuation.js";

const execFileAsync = promisify(execFile);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const composeFile = path.join(root, "infra/load/docker-compose.realtime.yml");

type Assertion = {
  name: string;
  passed: boolean;
  expected: string;
  actual: unknown;
};

type PhaseReport = {
  durationMs: number;
  metrics: Record<string, unknown>;
  assertions: Assertion[];
  error?: string;
};

type HarnessReport = {
  version: 1;
  mode: "formal" | "diagnostic";
  formal: boolean;
  startedAt: string;
  finishedAt?: string;
  gitSha: string;
  seed: number;
  platform: Record<string, unknown>;
  images?: unknown;
  parameters: Parameters;
  phases: Record<string, PhaseReport>;
  postgres: Record<string, unknown>;
  dockerStats: Record<string, unknown>;
  nonCapacity5xx: number;
  evidenceContinuation: {
    flag: string;
    requested: boolean;
    used: boolean;
    acceptanceEligible: boolean;
    status:
      | "not_requested"
      | "armed_evidence_only"
      | "continued_after_phase_c_failure";
    phase?: "C-backpressure";
    originalError?: string;
    cleanup?: EvidenceContinuationCleanup;
  };
  passed: boolean;
  failure?: string;
};

type Parameters = {
  clients: number;
  rampPerSecond: number;
  holdSeconds: number;
  reconnectRounds: number;
  reconnectAbortCount: number;
  reconnectEventsPerRound: number;
  jitterMaxMs: number;
  backpressureMiB: number;
  backpressureTimeoutMs: number;
  slowClientCloseMs: number;
  redisOutageSeconds: number;
  redisOutageEvents: number;
  requestTimeoutMs: number;
  sseOpenTimeoutMs: number;
  rawHeaderTimeoutMs: number;
  rawSaturationTimeoutMs: number;
  composeTimeoutMs: number;
  composeBuildTimeoutMs: number;
  redisRecoveryTimeoutMs: number;
};

type Session = {
  cookie: string;
  csrf: string;
  workspaceId: string;
  teamId: string;
  stateId: string;
};

type EventBody = {
  cursor?: unknown;
  occurred_at?: unknown;
  occurredAt?: unknown;
};

type CreatedItem = {
  id: string;
};

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const quantiles = (values: number[]): Record<string, number | null> => {
  if (!values.length) return { p50: null, p95: null, p99: null };
  const sorted = [...values].sort((left, right) => left - right);
  const at = (percentile: number): number =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * percentile) - 1),
      )
    ]!;
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
};

const errorText = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const flagValue = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};

const positiveInteger = (name: string, fallback: number): number => {
  const raw = flagValue(name);
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw)) throw new Error(`INVALID_FLAG:${name}`);
  return Number(raw);
};

const diagnostic = process.argv.includes("--diagnostic");
const phaseCEvidenceWaiverRequested = parsePhaseCEvidenceWaiver(
  process.argv.slice(2),
  diagnostic,
);
const parameters: Parameters = diagnostic
  ? {
      clients: positiveInteger("clients", 20),
      rampPerSecond: positiveInteger("ramp-per-second", 20),
      holdSeconds: positiveInteger("hold-seconds", 2),
      reconnectRounds: positiveInteger("reconnect-rounds", 2),
      reconnectAbortCount: positiveInteger("reconnect-aborts", 4),
      reconnectEventsPerRound: positiveInteger("events-per-round", 2),
      jitterMaxMs: positiveInteger("jitter-max-ms", 100),
      backpressureMiB: positiveInteger("backpressure-mib", 1),
      backpressureTimeoutMs: 5_000,
      slowClientCloseMs: 7_000,
      redisOutageSeconds: positiveInteger("redis-outage-seconds", 6),
      redisOutageEvents: positiveInteger("redis-outage-events", 10),
      requestTimeoutMs: positiveInteger("request-timeout-ms", 15_000),
      sseOpenTimeoutMs: positiveInteger("sse-open-timeout-ms", 10_000),
      rawHeaderTimeoutMs: positiveInteger("raw-header-timeout-ms", 10_000),
      rawSaturationTimeoutMs: positiveInteger(
        "raw-saturation-timeout-ms",
        120_000,
      ),
      composeTimeoutMs: positiveInteger("compose-timeout-seconds", 120) * 1_000,
      composeBuildTimeoutMs:
        positiveInteger("compose-build-timeout-seconds", 1_200) * 1_000,
      redisRecoveryTimeoutMs: positiveInteger(
        "redis-recovery-timeout-ms",
        15_000,
      ),
    }
  : {
      clients: 1_000,
      rampPerSecond: 50,
      holdSeconds: 60,
      reconnectRounds: 10,
      reconnectAbortCount: 200,
      reconnectEventsPerRound: 10,
      jitterMaxMs: 250,
      backpressureMiB: 32,
      backpressureTimeoutMs: 5_000,
      slowClientCloseMs: 7_000,
      redisOutageSeconds: 60,
      redisOutageEvents: 100,
      requestTimeoutMs: positiveInteger("request-timeout-ms", 30_000),
      sseOpenTimeoutMs: positiveInteger("sse-open-timeout-ms", 10_000),
      rawHeaderTimeoutMs: positiveInteger("raw-header-timeout-ms", 10_000),
      rawSaturationTimeoutMs: positiveInteger(
        "raw-saturation-timeout-ms",
        180_000,
      ),
      composeTimeoutMs: positiveInteger("compose-timeout-seconds", 120) * 1_000,
      composeBuildTimeoutMs:
        positiveInteger("compose-build-timeout-seconds", 1_200) * 1_000,
      redisRecoveryTimeoutMs: positiveInteger(
        "redis-recovery-timeout-ms",
        15_000,
      ),
    };

if (parameters.clients % 2 !== 0) throw new Error("CLIENT_COUNT_MUST_BE_EVEN");
if (parameters.reconnectAbortCount > parameters.clients)
  throw new Error("RECONNECT_ABORT_COUNT_EXCEEDS_CLIENTS");

const seed = positiveInteger(
  "seed",
  Number.parseInt(process.env.REALTIME_LOAD_SEED ?? "17017", 10),
);

class Random {
  #state: number;

  constructor(value: number) {
    this.#state = value >>> 0;
  }

  next(): number {
    let value = this.#state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.#state = value >>> 0;
    return this.#state / 0x1_0000_0000;
  }

  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  sample(count: number, population: number): number[] {
    const values = Array.from({ length: population }, (_, index) => index);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const other = this.integer(index + 1);
      [values[index], values[other]] = [values[other]!, values[index]!];
    }
    return values.slice(0, count);
  }
}

const random = new Random(seed);

const freePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("FREE_PORT_UNAVAILABLE"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });

const apiAPort = await freePort();
const apiBPort = await freePort();
const postgresPort = await freePort();
const apiA = new URL(`http://127.0.0.1:${apiAPort}`);
const apiB = new URL(`http://127.0.0.1:${apiBPort}`);
const project = `workmesh-rt-${process.pid}-${Date.now().toString(36)}`;
const sessionSecret = randomBytes(48).toString("base64url");
const paginationKey = randomBytes(32).toString("base64url");
const bootstrapToken = randomBytes(32).toString("base64url");
const masterKey = randomBytes(32).toString("hex");

const commandEnvironment = {
  ...process.env,
  REALTIME_LOAD_API_A_PORT: String(apiAPort),
  REALTIME_LOAD_API_B_PORT: String(apiBPort),
  REALTIME_LOAD_POSTGRES_PORT: String(postgresPort),
  REALTIME_LOAD_MAX_CLIENTS: String(parameters.clients),
  REALTIME_LOAD_SESSION_SECRET: sessionSecret,
  REALTIME_LOAD_PAGINATION_KEY: paginationKey,
  REALTIME_LOAD_BOOTSTRAP_TOKEN: bootstrapToken,
  REALTIME_LOAD_MASTER_KEY: masterKey,
};

const composeCommand = async (
  timeoutMs: number,
  ...arguments_: string[]
): Promise<string> => {
  const commandContext = `compose:${project}:${arguments_.join(" ")}`;
  const result = await execFileAsync(
    "docker",
    ["compose", "-p", project, "-f", composeFile, ...arguments_],
    {
      cwd: root,
      env: commandEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
    },
  ).catch((error: unknown) => {
    throw new Error(
      `LOAD_COMMAND_FAILED:${commandContext}:${timeoutMs}ms:${errorText(error)}`,
      { cause: error },
    );
  });
  return `${result.stdout}${result.stderr}`.trim();
};

const compose = async (...arguments_: string[]): Promise<string> =>
  await composeCommand(parameters.composeTimeoutMs, ...arguments_);

const gitSha = (
  await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    windowsHide: true,
    timeout: 30_000,
  })
).stdout.trim();
commandEnvironment.REALTIME_LOAD_BUILD_SHA = gitSha;

const nofileLimit = async (): Promise<number | null> => {
  if (process.platform !== "linux") return null;
  const limits = await readFile("/proc/self/limits", "utf8");
  const match = /^Max open files\s+([0-9]+)/m.exec(limits);
  return match ? Number(match[1]) : null;
};

const nofile = await nofileLimit();
const totalMemoryGiB = os.totalmem() / 1024 ** 3;
const formalPlatform =
  process.platform === "linux" &&
  os.cpus().length >= 4 &&
  totalMemoryGiB >= 8 &&
  (nofile ?? 0) >= 8_192;
const reportMode = diagnostic ? "diagnostic" : "formal";
const reportFormal = !diagnostic && formalPlatform;

const report: HarnessReport = {
  version: 1,
  mode: reportMode,
  formal: reportFormal,
  startedAt: new Date().toISOString(),
  gitSha,
  seed,
  platform: {
    platform: process.platform,
    release: os.release(),
    architecture: os.arch(),
    cpus: os.cpus().length,
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    nofile,
    formalRequirements: {
      linux: process.platform === "linux",
      minimumCpu: os.cpus().length >= 4,
      minimumMemory: totalMemoryGiB >= 8,
      minimumNofile: (nofile ?? 0) >= 8_192,
    },
  },
  parameters,
  phases: {},
  postgres: {},
  dockerStats: {},
  nonCapacity5xx: 0,
  evidenceContinuation: {
    flag: PHASE_C_EVIDENCE_WAIVER_FLAG,
    requested: phaseCEvidenceWaiverRequested,
    used: false,
    acceptanceEligible: isFormalAcceptanceEligible({
      mode: reportMode,
      formal: reportFormal,
      evidenceWaiverRequested: phaseCEvidenceWaiverRequested,
    }),
    status: phaseCEvidenceWaiverRequested
      ? "armed_evidence_only"
      : "not_requested",
  },
  passed: false,
};

let nonCapacity5xx = 0;
let activePhase = "preflight";

const requestJson = async <T>(
  endpoint: URL,
  route: string,
  init: RequestInit,
): Promise<{ body: T; response: Response }> => {
  const url = new URL(route, endpoint);
  const context = `${activePhase}:http:${init.method ?? "GET"}:${url.toString()}`;
  const controller = new AbortController();
  const response = await withDeadline(
    fetch(url, { ...init, signal: controller.signal }),
    parameters.requestTimeoutMs,
    `${context}:headers`,
    () => controller.abort(),
  );
  const text = await withDeadline(
    response.text(),
    parameters.requestTimeoutMs,
    `${context}:body`,
    () => controller.abort(),
  );
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (response.status >= 500) nonCapacity5xx += 1;
  if (!response.ok)
    throw new Error(
      `HTTP_${response.status}:${route}:${JSON.stringify(body).slice(0, 500)}`,
    );
  return { body: body as T, response };
};

const authenticated = (
  session: Pick<Session, "cookie" | "csrf">,
  mutation = false,
): HeadersInit => ({
  cookie: session.cookie,
  ...(mutation
    ? {
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
        "x-csrf-token": session.csrf,
      }
    : {}),
});

const install = async (): Promise<Session> => {
  const { body, response } = await requestJson<{
    csrfToken: string;
    csrf_token: string;
  }>(apiA, "/api/v1/auth/install", {
    method: "POST",
    headers: {
      "x-workmesh-bootstrap-token": bootstrapToken,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: JSON.stringify({
      name: "Realtime Load",
      slug: `realtime-load-${process.pid}`,
      adminName: "Realtime Load",
      email: `realtime-${process.pid}@example.test`,
      password: "Realtime-load-password-17!",
    }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("INSTALL_COOKIE_MISSING");
  const cookie = setCookie.split(";", 1)[0]!;
  const teams = await requestJson<{
    items: Array<{ id: string }>;
  }>(apiA, "/api/v1/teams?limit=10", {
    headers: authenticated({ cookie, csrf: body.csrfToken }),
  });
  const teamId = teams.body.items[0]?.id;
  if (!teamId) throw new Error("INSTALL_TEAM_MISSING");
  const states = await requestJson<{
    items: Array<{ id: string; category: string }>;
  }>(apiA, `/api/v1/teams/${teamId}/states?limit=10`, {
    headers: authenticated({ cookie, csrf: body.csrfToken }),
  });
  const stateId =
    states.body.items.find((item) => item.category === "backlog")?.id ??
    states.body.items[0]?.id;
  if (!stateId) throw new Error("INSTALL_STATE_MISSING");
  const workspace = await pool.query<{ workspace_id: string }>(
    "SELECT workspace_id FROM platform_installation WHERE singleton=true",
  );
  const workspaceId = workspace.rows[0]?.workspace_id;
  if (!workspaceId) throw new Error("INSTALL_WORKSPACE_MISSING");
  return { cookie, csrf: body.csrfToken, workspaceId, teamId, stateId };
};

const createItems = async (
  endpoint: URL,
  session: Session,
  count: number,
  label: string,
  descriptionLength = 0,
  durationMs?: number,
): Promise<CreatedItem[]> => {
  const results: CreatedItem[] = [];
  const started = Date.now();
  const workers = Math.min(16, count);
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= count) return;
        if (durationMs && count > 1) {
          const target =
            started + Math.floor((durationMs * index) / (count - 1));
          if (target > Date.now()) await sleep(target - Date.now());
        }
        const { body } = await requestJson<CreatedItem>(
          endpoint,
          "/api/v1/work-items",
          {
            method: "POST",
            headers: authenticated(session, true),
            body: JSON.stringify({
              teamId: session.teamId,
              title: `${label}-${index}-${randomUUID()}`,
              description: descriptionLength
                ? `${label}:${index}:` +
                  "x".repeat(Math.max(0, descriptionLength - label.length - 20))
                : undefined,
              statusId: session.stateId,
              priority: "none",
              labels: ["realtime-load"],
            }),
          },
        );
        results.push(body);
      }
    }),
  );
  return results;
};

const cursorForItems = async (
  itemIds: string[],
): Promise<{
  eventIds: string[];
  cursors: string[];
  target: string;
  bytes: number;
}> => {
  if (!itemIds.length) {
    const target = await highWater();
    return { eventIds: [], cursors: [], target, bytes: 0 };
  }
  const result = await pool.query<{
    event_id: string;
    cursor: string;
    bytes: string;
  }>(
    `SELECT id::text AS event_id,
            cursor::text,
            octet_length(payload::text)::text AS bytes
     FROM domain_events
     WHERE aggregate_id=ANY($1::uuid[])
       AND event_type='work_item.created'
     ORDER BY cursor`,
    [itemIds],
  );
  if (result.rows.length !== itemIds.length)
    throw new Error(
      `EVENT_CURSOR_COUNT:${result.rows.length}/${itemIds.length}`,
    );
  return {
    eventIds: result.rows.map((row) => row.event_id),
    cursors: result.rows.map((row) => row.cursor),
    target: result.rows.at(-1)!.cursor,
    bytes: result.rows.reduce((sum, row) => sum + Number(row.bytes), 0),
  };
};

const waitForOutboxDelivery = async (
  eventIds: string[],
  timeoutMs: number,
): Promise<{ delivered: number; total: number; statuses: unknown[] }> => {
  const operation = (async () => {
    for (;;) {
      const result = await pool.query<{
        status: string;
        count: string;
      }>(
        `SELECT status::text,count(*)::text AS count
         FROM outbox_events
         WHERE domain_event_id=ANY($1::uuid[])
         GROUP BY status`,
        [eventIds],
      );
      const delivered = result.rows
        .filter((row) => row.status === "delivered")
        .reduce((total, row) => total + Number(row.count), 0);
      if (delivered === eventIds.length)
        return {
          delivered,
          total: eventIds.length,
          statuses: result.rows,
        };
      await sleep(25);
    }
  })();
  return await withDeadline(
    operation,
    timeoutMs,
    `${activePhase}:outbox-delivery:${eventIds.length}`,
  );
};

const highWater = async (): Promise<string> => {
  const result = await pool.query<{ cursor: string }>(
    "SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events",
  );
  return result.rows[0]!.cursor;
};

const resetPgStats = async (): Promise<void> => {
  await pool.query("SELECT pg_stat_statements_reset()");
};

const coordinatorQueries = async (): Promise<Record<string, unknown>> => {
  const result = await pool.query<{
    calls: string;
    total_exec_time: number;
    rows: string;
    query: string;
  }>(
    `SELECT calls::text,total_exec_time,rows::text,query
     FROM pg_stat_statements
     WHERE query ILIKE '%unnest(%requested%'
       AND query ILIKE '%workspace_id%'
     ORDER BY calls DESC`,
  );
  return {
    totalCalls: result.rows.reduce((sum, row) => sum + Number(row.calls), 0),
    statements: result.rows,
  };
};

const databaseStats = async (): Promise<Record<string, unknown>> => {
  const stats = await pool.query<Record<string, unknown>>(
    `SELECT numbackends,xact_commit,xact_rollback,blks_read,blks_hit,
            tup_returned,tup_fetched,tup_inserted,tup_updated,tup_deleted
     FROM pg_stat_database WHERE datname=current_database()`,
  );
  return stats.rows[0] ?? {};
};

const dockerStats = async (): Promise<unknown> => {
  const ids = (await compose("ps", "-q", "api_a", "api_b"))
    .split(/\r?\n/)
    .filter(Boolean);
  if (!ids.length) return [];
  const result = await execFileAsync(
    "docker",
    ["stats", "--no-stream", "--format", "{{json .}}", ...ids],
    {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      timeout: parameters.composeTimeoutMs,
    },
  );
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        return { raw: line };
      }
    });
};

const composeImages = async (): Promise<unknown> => {
  const output = await compose("images", "--format", "json");
  const rows = output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [{ raw: line }];
      }
    });
  const imageIds = [
    ...new Set(
      rows.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const id =
          (row as Record<string, unknown>).ID ??
          (row as Record<string, unknown>).ImageID;
        return typeof id === "string" && id.length ? [id] : [];
      }),
    ),
  ];
  let inspections: unknown = [];
  if (imageIds.length) {
    const inspected = await execFileAsync(
      "docker",
      ["image", "inspect", ...imageIds],
      {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        timeout: parameters.composeTimeoutMs,
      },
    );
    inspections = JSON.parse(inspected.stdout) as unknown;
  }
  return { compose: rows, inspections };
};

const parseJsonLines = (output: string): unknown[] =>
  output
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown;
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [{ raw: line }];
      }
    });

const waitForRedisHealthy = async (): Promise<Record<string, unknown>> => {
  const probeTimeoutMs = Math.min(5_000, parameters.redisRecoveryTimeoutMs);
  const operation = (async () => {
    for (;;) {
      const service = parseJsonLines(
        await composeCommand(probeTimeoutMs, "ps", "--format", "json", "redis"),
      );
      const healthy = service.some((row) => {
        if (!row || typeof row !== "object") return false;
        const value = row as Record<string, unknown>;
        return (
          String(value.State ?? value.state).toLowerCase() === "running" &&
          String(value.Health ?? value.health).toLowerCase() === "healthy"
        );
      });
      if (healthy) {
        const ping = await composeCommand(
          probeTimeoutMs,
          "exec",
          "-T",
          "redis",
          "redis-cli",
          "--raw",
          "PING",
        );
        if (ping.trim() === "PONG")
          return {
            composeProject: project,
            service,
            ping: ping.trim(),
            healthyAt: performance.now(),
          };
      }
      await sleep(100);
    }
  })();
  return await withDeadline(
    operation,
    parameters.redisRecoveryTimeoutMs,
    `${activePhase}:redis-health:${project}`,
  );
};

const redisClientFields = (line: string): Record<string, string> =>
  Object.fromEntries(
    line
      .trim()
      .split(/\s+/)
      .flatMap((field) => {
        const separator = field.indexOf("=");
        return separator > 0
          ? [[field.slice(0, separator), field.slice(separator + 1)]]
          : [];
      }),
  );

const waitForRedisWakeClients = async (): Promise<{
  observedAt: number;
  xreadClientCount: number;
  clients: Record<string, string>[];
}> => {
  const probeTimeoutMs = Math.min(5_000, parameters.redisRecoveryTimeoutMs);
  const operation = (async () => {
    for (;;) {
      const output = await composeCommand(
        probeTimeoutMs,
        "exec",
        "-T",
        "redis",
        "redis-cli",
        "--raw",
        "CLIENT",
        "LIST",
        "TYPE",
        "normal",
      );
      const clients = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map(redisClientFields);
      const xreadClients = clients.filter(
        (client) => client.cmd?.toLowerCase() === "xread",
      );
      if (xreadClients.length >= 2)
        return {
          observedAt: performance.now(),
          xreadClientCount: xreadClients.length,
          clients: xreadClients.map((client) => ({
            id: client.id ?? "",
            addr: client.addr ?? "",
            name: client.name ?? "",
            flags: client.flags ?? "",
            age: client.age ?? "",
            idle: client.idle ?? "",
            cmd: client.cmd ?? "",
          })),
        };
      await sleep(25);
    }
  })();
  return await withDeadline(
    operation,
    parameters.redisRecoveryTimeoutMs,
    `${activePhase}:redis-xread-clients:${project}`,
  );
};

const containerRssBytes = async (
  service: "api_a" | "api_b",
): Promise<number> => {
  const id = (await compose("ps", "-q", service)).trim();
  if (!id) return 0;
  const result = await execFileAsync(
    "docker",
    ["stats", "--no-stream", "--format", "{{.MemUsage}}", id],
    { cwd: root, windowsHide: true, timeout: parameters.composeTimeoutMs },
  );
  const raw = result.stdout.split("/")[0]!.trim();
  const match = /^([0-9.]+)([KMG]iB|B)$/.exec(raw);
  if (!match) return 0;
  const factors: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
  };
  return Number(match[1]) * factors[match[2]!]!;
};

class Client {
  readonly tracker: DurableCursorTracker;
  readonly seen = new Set<string>();
  readonly eventLatencies: number[] = [];
  connection?: SseConnection;
  endpoint: URL;
  plannedClose = false;
  unexpectedCloses = 0;

  constructor(
    readonly id: number,
    endpoint: URL,
    cursor: string,
    readonly cookie: string,
  ) {
    this.endpoint = endpoint;
    this.tracker = new DurableCursorTracker(cursor);
  }

  async connect(): Promise<void> {
    this.plannedClose = false;
    const connection = await openSse({
      endpoint: new URL("/api/v1/events/stream", this.endpoint),
      cookie: this.cookie,
      lastEventId: this.tracker.last,
      timeoutMs: parameters.sseOpenTimeoutMs,
      context: `${activePhase}:client-${this.id}`,
      onEvent: (event) => {
        if (!event.id) return;
        this.tracker.observe(event.id);
        this.seen.add(event.id);
        try {
          const body = JSON.parse(event.data) as EventBody;
          const occurredAt = body.occurred_at ?? body.occurredAt;
          if (typeof occurredAt === "string") {
            const latency = Date.now() - Date.parse(occurredAt);
            if (Number.isFinite(latency) && latency >= 0)
              this.eventLatencies.push(latency);
          }
        } catch {
          // Control events and malformed payloads are surfaced by cursor checks.
        }
      },
    });
    this.connection = connection;
    void connection.closed.then((result) => {
      if (!this.plannedClose || result.error) this.unexpectedCloses += 1;
    });
  }

  async close(): Promise<void> {
    const connection = this.connection;
    if (!connection) return;
    this.plannedClose = true;
    connection.close();
    await withDeadline(
      connection.closed,
      parameters.sseOpenTimeoutMs,
      `${activePhase}:client-${this.id}:close:${this.endpoint.toString()}`,
      () => connection.close(),
    );
    this.connection = undefined;
  }

  async reconnect(endpoint = this.endpoint): Promise<number> {
    await this.close();
    this.endpoint = endpoint;
    const started = performance.now();
    await this.connect();
    return performance.now() - started;
  }
}

const openClients = async (
  clients: Client[],
  ratePerSecond: number,
): Promise<number[]> => {
  const latencies: number[] = [];
  const batchSize = Math.max(1, Math.floor(ratePerSecond / 5));
  const started = performance.now();
  for (let offset = 0; offset < clients.length; offset += batchSize) {
    const target = started + (offset * 1_000) / ratePerSecond;
    if (target > performance.now()) await sleep(target - performance.now());
    const batch = clients.slice(offset, offset + batchSize);
    const values = await Promise.all(
      batch.map(async (client) => {
        const opened = performance.now();
        await client.connect();
        return performance.now() - opened;
      }),
    );
    latencies.push(...values);
  }
  return latencies;
};

const waitForCursor = async (
  clients: Client[],
  target: string,
  timeoutMs: number,
): Promise<number> => {
  const started = performance.now();
  for (;;) {
    if (
      clients.every(
        (client) => compareDecimalCursors(client.tracker.last, target) >= 0,
      )
    )
      return performance.now() - started;
    if (performance.now() - started > timeoutMs)
      throw new Error(
        `CURSOR_WAIT_TIMEOUT:${target}:` +
          clients.filter(
            (client) => compareDecimalCursors(client.tracker.last, target) < 0,
          ).length,
      );
    await sleep(25);
  }
};

const missing = (clients: Client[], cursors: string[]): number =>
  clients.reduce(
    (total, client) =>
      total + cursors.filter((cursor) => !client.seen.has(cursor)).length,
    0,
  );

const sum = (clients: Client[], pick: (client: Client) => number): number =>
  clients.reduce((total, client) => total + pick(client), 0);

const phase = async (
  name: string,
  body: (
    assert: (
      name: string,
      passed: boolean,
      expected: string,
      actual: unknown,
    ) => void,
    metrics: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | void>,
): Promise<void> => {
  const assertions: Assertion[] = [];
  const metrics: Record<string, unknown> = {};
  let phaseError: string | undefined;
  const previousPhase = activePhase;
  activePhase = name;
  const assert = (
    assertionName: string,
    passed: boolean,
    expected: string,
    actual: unknown,
  ): void => {
    assertions.push({ name: assertionName, passed, expected, actual });
  };
  const started = performance.now();
  try {
    Object.assign(metrics, (await body(assert, metrics)) ?? {});
    const failure = assertions.find((assertion) => !assertion.passed);
    if (failure)
      throw new Error(
        `THRESHOLD_FAILED:${name}:${failure.name}:${JSON.stringify(failure.actual)}`,
      );
  } catch (error) {
    phaseError = errorText(error);
    throw error;
  } finally {
    activePhase = previousPhase;
    report.phases[name] = buildPhaseSnapshot({
      startedAt: started,
      finishedAt: performance.now(),
      metrics,
      assertions,
      error: phaseError,
    });
  }
};

const outputDirectory = path.resolve(
  root,
  flagValue("output") ??
    path.join(
      ".tmp/realtime-load",
      new Date().toISOString().replace(/[:.]/g, "-"),
    ),
);

const reportMarkdown = (value: HarnessReport): string => {
  const lines = [
    "# WorkMesh realtime load report",
    "",
    `- Result: **${value.passed ? "PASS" : "FAIL"}**`,
    `- Mode: **${value.mode}${value.formal ? " (formal)" : " (nonformal)"}**`,
    `- Evidence-only Phase C waiver: **${
      value.evidenceContinuation.requested ? "REQUESTED" : "not requested"
    }**`,
    `- Acceptance eligible: **${
      value.evidenceContinuation.acceptanceEligible ? "yes" : "NO"
    }**`,
    `- Git SHA: \`${value.gitSha}\``,
    `- Seed: \`${value.seed}\``,
    `- Started: ${value.startedAt}`,
    `- Finished: ${value.finishedAt ?? "incomplete"}`,
    "",
    "| Phase | Duration | Assertions | Result |",
    "| --- | ---: | ---: | --- |",
  ];
  for (const [name, result] of Object.entries(value.phases)) {
    const passed = result.assertions.filter(
      (assertion) => assertion.passed,
    ).length;
    const phasePassed = !result.error && passed === result.assertions.length;
    lines.push(
      `| ${name} | ${result.durationMs} ms | ` +
        `${passed}/${result.assertions.length} | ` +
        `${phasePassed ? "PASS" : "FAIL"} |`,
    );
  }
  lines.push("", "## Thresholds", "");
  for (const [name, result] of Object.entries(value.phases)) {
    lines.push(`### ${name}`, "");
    if (result.error) lines.push(`- ERROR: \`${result.error}\``);
    for (const assertion of result.assertions)
      lines.push(
        `- ${assertion.passed ? "PASS" : "FAIL"} ${assertion.name}: ` +
          `expected ${assertion.expected}; actual ` +
          `\`${JSON.stringify(assertion.actual)}\``,
      );
    lines.push("");
  }
  lines.push(
    "## Metrics",
    "",
    "```json",
    JSON.stringify(
      {
        parameters: value.parameters,
        evidenceContinuation: value.evidenceContinuation,
        platform: value.platform,
        phases: Object.fromEntries(
          Object.entries(value.phases).map(([name, result]) => [
            name,
            result.metrics,
          ]),
        ),
        postgres: value.postgres,
        dockerStats: value.dockerStats,
        nonCapacity5xx: value.nonCapacity5xx,
        failure: value.failure,
      },
      null,
      2,
    ),
    "```",
    "",
    "> Redis interruption in Phase D tests application fallback and recovery " +
      "against the same Redis endpoint. It is not Redis Sentinel or Cluster " +
      "failover validation.",
    "",
  );
  return lines.join("\n");
};

const persistReport = async (): Promise<void> => {
  report.finishedAt = new Date().toISOString();
  report.nonCapacity5xx = nonCapacity5xx;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await writeFile(
    path.join(outputDirectory, "report.md"),
    reportMarkdown(report),
  );
};

let pool: Pool;
let poolCreated = false;
let composeAttempted = false;
let clients: Client[] = [];
let rawSocket: net.Socket | undefined;

try {
  if (!diagnostic && !formalPlatform)
    throw new Error(
      "FORMAL_RUN_REQUIRES_LINUX_4VCPU_8GIB_NOFILE_8192; " +
        "use --diagnostic for a nonformal run",
    );
  composeAttempted = true;
  await composeCommand(
    parameters.composeBuildTimeoutMs,
    "up",
    "-d",
    "--build",
    "postgres",
    "redis",
    "migrate",
    "worker",
    "api_a",
    "api_b",
  );
  const readinessStarted = performance.now();
  const apiReadiness = [];
  for (const [name, endpoint] of [
    ["api-a", apiA],
    ["api-b", apiB],
  ] as const) {
    const remainingMs = Math.max(
      1,
      parameters.composeTimeoutMs - (performance.now() - readinessStarted),
    );
    apiReadiness.push(
      await waitForHostApiReadiness({
        endpoint,
        context: `${activePhase}:${name}-host`,
        timeoutMs: remainingMs,
        attemptTimeoutMs: Math.min(parameters.requestTimeoutMs, 2_000),
      }),
    );
  }
  report.platform.apiReadiness = apiReadiness;
  await compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "workmesh",
    "-d",
    "workmesh",
    "-c",
    "CREATE EXTENSION IF NOT EXISTS pg_stat_statements",
  );
  report.images = {
    composeProject: project,
    images: await composeImages(),
  };
  pool = new Pool({
    connectionString: `postgres://workmesh:workmesh-load-postgres@127.0.0.1:${postgresPort}/workmesh`,
    max: 8,
    query_timeout: parameters.requestTimeoutMs,
  });
  poolCreated = true;
  const session = await install();
  const phaseAStart = await highWater();
  clients = Array.from(
    { length: parameters.clients },
    (_, index) => new Client(index, apiA, phaseAStart, session.cookie),
  );

  await phase("A-capacity", async (assert) => {
    const opening = await openClients(clients, parameters.rampPerSecond);
    await resetPgStats();
    const unexpectedBefore = sum(clients, (client) => client.unexpectedCloses);
    await sleep(parameters.holdSeconds * 1_000);
    const unexpectedAfter = sum(clients, (client) => client.unexpectedCloses);
    let capacityStatus = 0;
    let retryAfter: string | undefined;
    let capacityCode: string | undefined;
    try {
      await openSse({
        endpoint: new URL("/api/v1/events/stream", apiA),
        cookie: session.cookie,
        lastEventId: phaseAStart,
        timeoutMs: parameters.sseOpenTimeoutMs,
        context: `${activePhase}:capacity-overflow`,
        onEvent: () => undefined,
      });
    } catch (error) {
      if (error instanceof SseHttpError) {
        capacityStatus = error.statusCode;
        retryAfter = error.headers["retry-after"] as string | undefined;
        try {
          capacityCode = (
            JSON.parse(error.body) as { error?: { code?: string } }
          ).error?.code;
        } catch {
          capacityCode = undefined;
        }
        if (error.statusCode >= 500 && error.statusCode !== 503)
          nonCapacity5xx += 1;
      } else throw error;
    }
    await clients[0]!.close();
    const replacement = new Client(
      parameters.clients,
      apiA,
      phaseAStart,
      session.cookie,
    );
    const reuseStarted = performance.now();
    await replacement.connect();
    const reuseMs = performance.now() - reuseStarted;
    await replacement.close();
    await clients[0]!.connect();
    const pg = await coordinatorQueries();
    const pgCalls = Number(pg.totalCalls ?? 0);
    const pgCallLimit = Math.ceil(parameters.holdSeconds / 15) + 3;
    const stats = await dockerStats();
    report.dockerStats.phaseA = stats;
    assert(
      "ramp count",
      clients.length === parameters.clients,
      String(parameters.clients),
      clients.length,
    );
    assert(
      "hold unexpected closes",
      unexpectedAfter - unexpectedBefore === 0,
      "0",
      unexpectedAfter - unexpectedBefore,
    );
    assert(
      "1001st structured 503",
      capacityStatus === 503 &&
        capacityCode === "REALTIME_CAPACITY_EXCEEDED" &&
        retryAfter === "1",
      "503, REALTIME_CAPACITY_EXCEEDED, Retry-After: 1",
      { capacityStatus, capacityCode, retryAfter },
    );
    assert("released slot admitted", reuseMs <= 2_000, "<= 2000 ms", reuseMs);
    assert(
      "workspace reconciliation is instance-bound",
      pgCalls <= pgCallLimit,
      `<= ${pgCallLimit} PostgreSQL coordinator calls`,
      { pgCalls, pgCallLimit, pg },
    );
    return {
      openingLatencyMs: quantiles(opening),
      holdSeconds: parameters.holdSeconds,
      coordinatorQueries: pg,
      dockerStats: stats,
      slotReuseMs: reuseMs,
    };
  });

  await phase("B-reconnect-replay", async (assert) => {
    const half = parameters.clients / 2;
    for (const client of clients.slice(half)) await client.reconnect(apiB);
    const reconnectLatency: number[] = [];
    const eventCursors: string[] = [];
    for (let round = 0; round < parameters.reconnectRounds; round += 1) {
      const selected = random.sample(
        parameters.reconnectAbortCount,
        parameters.clients,
      );
      await Promise.all(selected.map((index) => clients[index]!.close()));
      const itemsPromise = createItems(
        round % 2 ? apiB : apiA,
        session,
        parameters.reconnectEventsPerRound,
        `phase-b-${round}`,
      );
      await Promise.all(
        selected.map(async (index) => {
          await sleep(random.integer(parameters.jitterMaxMs + 1));
          const client = clients[index]!;
          const started = performance.now();
          await client.connect();
          reconnectLatency.push(performance.now() - started);
        }),
      );
      const cursors = await cursorForItems(
        (await itemsPromise).map((item) => item.id),
      );
      eventCursors.push(...cursors.cursors);
      await waitForCursor(clients, cursors.target, 15_000);
    }
    const current = await highWater();
    const missingCount = missing(clients, eventCursors);
    const lagging = clients.filter(
      (client) => compareDecimalCursors(client.tracker.last, current) < 0,
    ).length;
    const duplicates = sum(clients, (client) => client.tracker.duplicates);
    const outOfOrder = sum(clients, (client) => client.tracker.outOfOrder);
    const latency = clients.flatMap((client) => client.eventLatencies);
    assert("missing events", missingCount === 0, "0", missingCount);
    assert("cursor lagging clients", lagging === 0, "0", lagging);
    assert("out-of-order events", outOfOrder === 0, "0", outOfOrder);
    assert("noncapacity 5xx", nonCapacity5xx === 0, "0", nonCapacity5xx);
    return {
      reconnectLatencyMs: quantiles(reconnectLatency),
      eventLatencyMs: quantiles(latency),
      expectedDeliveries: clients.length * eventCursors.length,
      missing: missingCount,
      duplicates,
      outOfOrder,
      lagging,
    };
  });

  const phaseCResult = phase("C-backpressure", async (assert, metrics) => {
    await Promise.all(clients.slice(1).map((client) => client.close()));
    const cursor = await highWater();
    const rssBefore = await containerRssBytes("api_a");
    const raw = await openPausedRawSse({
      endpoint: new URL("/api/v1/events/stream", apiA),
      cookie: session.cookie,
      lastEventId: cursor,
      timeoutMs: parameters.rawHeaderTimeoutMs,
      context: activePhase,
    });
    rawSocket = raw.socket;
    metrics.rawStatus = raw.headers.statusCode;
    metrics.rawHeaders = raw.headers.headers;
    metrics.pauseAt = raw.pauseAt;
    assert(
      "raw SSE admitted",
      raw.headers.statusCode === 200,
      "200",
      raw.headers.statusCode,
    );
    if (raw.headers.statusCode !== 200)
      throw new Error(`RAW_SSE_NOT_ADMITTED:${raw.headers.statusCode}`);
    metrics.openBeforeLoad = await proveRawSocketOpen(raw, 100, activePhase);
    const saturationResult = waitForRawSaturation(
      raw,
      parameters.rawSaturationTimeoutMs,
      activePhase,
    ).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const targetBytes = parameters.backpressureMiB * 1024 ** 2;
    const itemCount = Math.ceil((targetBytes / 48_000) * 1.02);
    const generatedStarted = performance.now();
    const items = await createItems(
      apiA,
      session,
      itemCount,
      "phase-c-backpressure",
      49_000,
    );
    const generated = await cursorForItems(items.map((item) => item.id));
    const outbox = await waitForOutboxDelivery(
      generated.eventIds,
      parameters.rawSaturationTimeoutMs,
    );
    metrics.durableDelivery = {
      eventIds: generated.eventIds.length,
      targetCursor: generated.target,
      outbox,
    };
    const saturation = await saturationResult;
    if (!saturation.ok) {
      metrics.saturationError = errorText(saturation.error);
      metrics.finalRawEvidence = raw.evidence();
      throw saturation.error;
    }
    metrics.saturation = saturation.value;
    const close = await waitForRawCloseAfterThreshold(
      raw,
      saturation.value.thresholdReachedAt,
      parameters.slowClientCloseMs,
      activePhase,
    ).catch((error: unknown) => {
      metrics.closeError = errorText(error);
      metrics.finalRawEvidence = raw.evidence();
      throw error;
    });
    metrics.close = close;
    metrics.finalRawEvidence = raw.evidence();
    rawSocket = undefined;
    const rssPeak = await containerRssBytes("api_a");
    const slot = new Client(-1, apiA, generated.target, session.cookie);
    const reuseStarted = performance.now();
    await slot.connect();
    const reuseMs = performance.now() - reuseStarted;
    await slot.close();
    await sleep(diagnostic ? 1_000 : 10_000);
    const rssAfter = await containerRssBytes("api_a");
    const recoveryAllowance = Math.max(
      64 * 1024 ** 2,
      (rssPeak - rssBefore) * 0.2,
    );
    const diagnosticEvidence = {
      rawStatus: raw.headers.statusCode,
      rawHeaders: raw.headers.headers,
      pauseAt: raw.pauseAt,
      openBeforeLoad: metrics.openBeforeLoad,
      saturation: saturation.value,
      close,
      targetBytes,
      generatedPayloadBytes: generated.bytes,
      itemCount,
      generationMs: performance.now() - generatedStarted,
      durableDelivery: metrics.durableDelivery,
      rssBefore,
      rssPeak,
      rssAfter,
    };
    assert(
      "generated durable SSE payload",
      generated.bytes >= targetBytes,
      `>= ${targetBytes}`,
      generated.bytes,
    );
    assert(
      "formal payload remains within 64 MiB",
      diagnostic || generated.bytes <= 64 * 1024 ** 2,
      diagnostic ? "diagnostic override" : "<= 67108864",
      generated.bytes,
    );
    assert(
      "slow client closed after saturation",
      close.closeAfterThresholdMs <= parameters.slowClientCloseMs,
      `<= ${parameters.slowClientCloseMs} ms`,
      { close, diagnosticEvidence },
    );
    assert("slot reused after close", reuseMs <= 2_000, "<= 2000 ms", reuseMs);
    assert(
      "RSS recovered",
      rssAfter <= rssBefore + recoveryAllowance,
      `<= ${rssBefore + recoveryAllowance}`,
      { rssBefore, rssPeak, rssAfter },
    );
    return {
      ...diagnosticEvidence,
      slowClientCloseMs: close.closeAfterThresholdMs,
      slotReuseMs: reuseMs,
    };
  });
  try {
    await phaseCResult;
  } catch (error) {
    if (!phaseCEvidenceWaiverRequested) throw error;
    const originalError = errorText(error);
    const cleanup = await cleanupAfterPhaseCFailure({ rawSocket, clients });
    rawSocket = undefined;
    const phaseC = report.phases["C-backpressure"];
    if (!phaseC) throw new Error("PHASE_C_REPORT_MISSING_AFTER_FAILURE");
    phaseC.metrics.evidenceContinuation = buildFailedPhaseCEvidence({
      originalError,
      cleanup,
    });
    phaseC.assertions.push({
      name: "Phase C completed for acceptance",
      passed: false,
      expected: "Phase C must pass without an evidence-only waiver",
      actual: {
        status: "failed_incomplete_evidence_only",
        flag: PHASE_C_EVIDENCE_WAIVER_FLAG,
        originalError,
      },
    });
    report.evidenceContinuation = {
      flag: PHASE_C_EVIDENCE_WAIVER_FLAG,
      requested: true,
      used: true,
      acceptanceEligible: false,
      status: "continued_after_phase_c_failure",
      phase: "C-backpressure",
      originalError,
      cleanup,
    };
    if (cleanup.failures.length > 0)
      throw new Error(
        `PHASE_C_EVIDENCE_CONTINUATION_CLEANUP_FAILED:${JSON.stringify(
          cleanup.failures,
        )}`,
      );
  }

  await clients[0]!.close();
  const phaseDCursor = await highWater();
  clients = Array.from(
    { length: parameters.clients },
    (_, index) =>
      new Client(
        index,
        index < parameters.clients / 2 ? apiA : apiB,
        phaseDCursor,
        session.cookie,
      ),
  );
  await openClients(clients, parameters.rampPerSecond * 2);

  await phase("D-redis-and-instance-recovery", async (assert, metrics) => {
    await compose("stop", "redis");
    await resetPgStats();
    const outageItems = await createItems(
      apiB,
      session,
      parameters.redisOutageEvents,
      "phase-d-redis-down",
      0,
      parameters.redisOutageSeconds * 1_000,
    );
    const outageEvents = await cursorForItems(
      outageItems.map((item) => item.id),
    );
    await waitForCursor(
      clients,
      outageEvents.target,
      parameters.redisOutageSeconds * 1_000 + 15_000,
    );
    const outageMissing = missing(clients, outageEvents.cursors);
    const outageLagging = clients.filter(
      (client) =>
        compareDecimalCursors(client.tracker.last, outageEvents.target) < 0,
    ).length;
    const pg = await coordinatorQueries();
    const pgCalls = Number(pg.totalCalls ?? 0);
    const pgCallLimit = Math.ceil(parameters.redisOutageSeconds / 1) * 2 + 8;
    metrics.redisFallback = {
      outageMissing,
      outageLagging,
      coordinatorQueries: pg,
      pgCallLimit,
    };

    await compose("start", "redis");
    const redisHealth = await waitForRedisHealthy();
    metrics.redisHealth = redisHealth;
    assert(
      "Redis exact-project health and ping",
      redisHealth.ping === "PONG",
      "compose service healthy and redis-cli PONG",
      redisHealth,
    );
    const redisWakeClients = await waitForRedisWakeClients();
    metrics.redisWakeClients = redisWakeClients;
    assert(
      "Redis wake-source clients restored",
      redisWakeClients.xreadClientCount >= 2,
      ">= 2 API clients with cmd=xread",
      redisWakeClients,
    );
    await resetPgStats();
    const recoveryStarted = performance.now();
    const recoveryItems = await createItems(
      apiB,
      session,
      2,
      "phase-d-redis-recovered",
    );
    const recoveryEvents = await cursorForItems(
      recoveryItems.map((item) => item.id),
    );
    await waitForCursor(clients, recoveryEvents.target, 15_000);
    const recoveryLatencyMs = performance.now() - recoveryStarted;
    const recoveryCoordinatorQueries = await coordinatorQueries();
    metrics.redisRecovery = {
      latencyMs: recoveryLatencyMs,
      events: recoveryEvents.cursors.length,
      target: recoveryEvents.target,
      coordinatorQueries: recoveryCoordinatorQueries,
    };
    const duplicatesBeforeFailover = sum(
      clients,
      (client) => client.tracker.duplicates,
    );

    const aClients = clients.slice(0, parameters.clients / 2);
    await compose("stop", "api_a");
    await withDeadline(
      Promise.all(
        aClients.map(
          (client) => client.connection?.closed ?? Promise.resolve({}),
        ),
      ),
      parameters.sseOpenTimeoutMs,
      `${activePhase}:api-a-clients-close:${apiA.toString()}`,
    );
    const failoverLatency = await Promise.all(
      aClients.map(async (client) => {
        client.connection = undefined;
        client.endpoint = apiB;
        const started = performance.now();
        await client.connect();
        return performance.now() - started;
      }),
    );

    let overflowStatus = 0;
    let overflowCode: string | undefined;
    try {
      await openSse({
        endpoint: new URL("/api/v1/events/stream", apiB),
        cookie: session.cookie,
        lastEventId: recoveryEvents.target,
        timeoutMs: parameters.sseOpenTimeoutMs,
        context: `${activePhase}:capacity-overflow`,
        onEvent: () => undefined,
      });
    } catch (error) {
      if (error instanceof SseHttpError) {
        overflowStatus = error.statusCode;
        try {
          overflowCode = (
            JSON.parse(error.body) as { error?: { code?: string } }
          ).error?.code;
        } catch {
          overflowCode = undefined;
        }
      } else throw error;
    }
    const finalItems = await createItems(apiB, session, 2, "phase-d-final");
    const finalEvents = await cursorForItems(finalItems.map((item) => item.id));
    await waitForCursor(clients, finalEvents.target, 15_000);
    const finalMissing = missing(clients, [
      ...recoveryEvents.cursors,
      ...finalEvents.cursors,
    ]);
    const duplicatesAfterFailover = sum(
      clients,
      (client) => client.tracker.duplicates,
    );
    const excessDuplicates = duplicatesAfterFailover - duplicatesBeforeFailover;
    assert(
      "Redis fallback missing events",
      outageMissing === 0,
      "0",
      outageMissing,
    );
    assert(
      "Redis fallback cursor lag",
      outageLagging === 0,
      "0",
      outageLagging,
    );
    assert(
      "instance-bound reconciliation calls",
      pgCalls <= pgCallLimit,
      `<= ${pgCallLimit}`,
      { pgCalls, pgCallLimit, pg },
    );
    assert(
      "same-endpoint Redis recovery",
      finalMissing === 0,
      "0 missing recovery/final events",
      finalMissing,
    );
    assert(
      "B reaches 100% capacity",
      overflowStatus === 503 && overflowCode === "REALTIME_CAPACITY_EXCEEDED",
      "structured REALTIME_CAPACITY_EXCEEDED 503",
      { overflowStatus, overflowCode },
    );
    assert(
      "failover replay duplicate bound",
      excessDuplicates <= parameters.clients,
      `<= ${parameters.clients}`,
      excessDuplicates,
    );
    assert("noncapacity 5xx", nonCapacity5xx === 0, "0", nonCapacity5xx);
    return {
      redisOutageSeconds: parameters.redisOutageSeconds,
      outageEvents: parameters.redisOutageEvents,
      fallbackMissing: outageMissing,
      fallbackLagging: outageLagging,
      coordinatorQueries: pg,
      redisHealth,
      redisWakeClients,
      redisRecoveryLatencyMs: recoveryLatencyMs,
      redisRecoveryCoordinatorQueries: recoveryCoordinatorQueries,
      reconnectToBLatencyMs: quantiles(failoverLatency),
      finalMissing,
      excessDuplicates,
      capacity: { overflowStatus, overflowCode },
      scope:
        "same Redis endpoint interruption/recovery; not Sentinel/Cluster failover",
    };
  });

  report.postgres = await databaseStats();
  report.dockerStats.final = await dockerStats();
  const outcome = evaluateHarnessOutcome({
    allPhasesPassed: Object.values(report.phases).every(
      (result) =>
        !result.error &&
        result.assertions.every((assertion) => assertion.passed),
    ),
    nonCapacity5xx,
    evidenceWaiverRequested: phaseCEvidenceWaiverRequested,
    evidenceFailure: report.evidenceContinuation.originalError,
  });
  report.passed = outcome.passed;
  report.failure = outcome.failure;
  if (outcome.exitCode !== 0) process.exitCode = outcome.exitCode;
} catch (error) {
  report.failure = [report.failure, errorText(error)]
    .filter(Boolean)
    .join("; ");
  report.passed = false;
  process.exitCode = 1;
  if (composeAttempted) {
    try {
      report.dockerStats.failure = await dockerStats();
      report.postgres = poolCreated ? await databaseStats() : {};
      report.postgres.logs = await compose(
        "logs",
        "--no-color",
        "--tail",
        "200",
        "api_a",
        "api_b",
        "redis",
        "worker",
      );
    } catch (evidenceError) {
      report.postgres.evidenceError = errorText(evidenceError);
    }
  }
} finally {
  rawSocket?.destroy();
  await Promise.all(
    clients.map((client) => client.close().catch(() => undefined)),
  );
  if (poolCreated) await pool.end().catch(() => undefined);
  try {
    if (process.env.REALTIME_LOAD_KEEP === "1") {
      report.postgres.resourcesRetained = {
        composeProject: project,
        reason: "REALTIME_LOAD_KEEP=1",
      };
    } else if (composeAttempted) {
      await compose("down", "-v", "--remove-orphans");
    }
  } catch (cleanupError) {
    report.failure = [report.failure, `cleanup: ${errorText(cleanupError)}`]
      .filter(Boolean)
      .join("; ");
    report.passed = false;
    process.exitCode = 1;
  }
  await persistReport();
  process.stdout.write(
    `${report.passed ? "PASS" : "FAIL"} ${report.mode} ` +
      `${path.join(outputDirectory, "report.json")}\n`,
  );
}
