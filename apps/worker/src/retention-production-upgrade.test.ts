import { describe, expect, it } from "vitest";
import {
  runProductionRetentionUpgrade,
  type RetentionUpgradeComposeSnapshotStore,
  type RetentionUpgradeCommandRunner,
} from "../../../scripts/retention-production-upgrade.mjs";

const buildSha = "a".repeat(40);
const digest = "b".repeat(64);
const mcpSessionToken = `session-${"c".repeat(40)}`;
const mcpAccessToken = `access-${"d".repeat(40)}`;
const sessionSecret = `api-session-${"e".repeat(40)}`;
const objectStoreSecret = `object-store-${"f".repeat(40)}`;
const postgresPassword = `postgres-${"g".repeat(40)}`;
const bootstrapToken = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString(
  "base64url",
);
const paginationKey = Buffer.from(Array.from({ length: 32 }, (_, index) => 255 - index)).toString(
  "base64url",
);
const image = (role: string) => `ghcr.io/workmesh/workmesh-${role}@sha256:${digest}`;
const environment = {
  WORKMESH_BUILD_SHA: buildSha,
  WORKMESH_API_IMAGE: image("api"),
  WORKMESH_WORKER_IMAGE: image("worker"),
  WORKMESH_MCP_IMAGE: image("mcp"),
  WORKMESH_WEB_IMAGE: image("web"),
  WORKMESH_SESSION_TOKEN: mcpSessionToken,
  WORKMESH_MCP_ACCESS_TOKEN: mcpAccessToken,
  SESSION_SECRET: sessionSecret,
  S3_SECRET_ACCESS_KEY: objectStoreSecret,
  POSTGRES_PASSWORD: postgresPassword,
  POSTGRES_USER: "workmesh",
  POSTGRES_DB: "workmesh",
};

type Command = Readonly<{ command: string; arguments_: readonly string[] }>;

const renderedCompose = ({
  includeMcp,
  mcpEnvironmentOverride = {},
  apiEnvironmentOverride = {},
  postgresEnvironmentOverride = {},
}: {
  includeMcp: boolean;
  mcpEnvironmentOverride?: Record<string, string>;
  apiEnvironmentOverride?: Record<string, string>;
  postgresEnvironmentOverride?: Record<string, string>;
}) => ({
  name: "workmesh-production",
  services: {
    postgres: {
      image: "postgres:17.5-alpine3.22",
      environment: {
        POSTGRES_USER: "workmesh",
        POSTGRES_PASSWORD: postgresPassword,
        POSTGRES_DB: "workmesh",
        ...postgresEnvironmentOverride,
      },
    },
    migrate: {
      image: image("api"),
      environment: {
        NODE_ENV: "production",
        WORKMESH_SERVICE: "migrate",
        WORKMESH_BUILD_SHA: buildSha,
        DATABASE_URL: `postgres://workmesh:${postgresPassword}@postgres:5432/workmesh`,
      },
    },
    api: {
      image: image("api"),
      environment: {
        NODE_ENV: "production",
        WORKMESH_SERVICE: "api",
        WORKMESH_BUILD_SHA: buildSha,
        DATABASE_URL: `postgres://workmesh:${postgresPassword}@postgres:5432/workmesh`,
        REDIS_URL: "redis://redis:6379",
        SESSION_SECRET: sessionSecret,
        WORKMESH_MASTER_KEY: "1".repeat(64),
        WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
        PAGINATION_CURSOR_KEYS: `cursor:${paginationKey}`,
        PAGINATION_CURSOR_ACTIVE_KID: "cursor",
        AUTH_RATE_LIMIT_HMAC_KEY: `rate-${"4".repeat(40)}`,
        S3_BUCKET: "workmesh-artifacts",
        S3_ACCESS_KEY_ID: "workmesh",
        S3_SECRET_ACCESS_KEY: objectStoreSecret,
        WEB_ORIGIN: "https://workmesh.test",
        ...apiEnvironmentOverride,
      },
    },
    worker: {
      image: image("worker"),
      environment: {
        NODE_ENV: "production",
        WORKMESH_SERVICE: "worker",
        WORKMESH_BUILD_SHA: buildSha,
        DATABASE_URL: `postgres://workmesh:${postgresPassword}@postgres:5432/workmesh`,
        REDIS_URL: "redis://redis:6379",
        SESSION_SECRET: sessionSecret,
        WORKMESH_MASTER_KEY: "1".repeat(64),
        S3_ENDPOINT: "http://minio:9000",
        S3_BUCKET: "workmesh-artifacts",
        S3_ACCESS_KEY_ID: "workmesh",
        S3_SECRET_ACCESS_KEY: objectStoreSecret,
      },
    },
    web: {
      image: image("web"),
      environment: {
        NODE_ENV: "production",
        WORKMESH_SERVICE: "web",
        WORKMESH_BUILD_SHA: buildSha,
        NEXT_PUBLIC_API_URL: "https://workmesh.test/api",
      },
    },
    ...(includeMcp
      ? {
          mcp: {
            image: image("mcp"),
            environment: {
              NODE_ENV: "production",
              WORKMESH_SERVICE: "mcp",
              WORKMESH_BUILD_SHA: buildSha,
              WORKMESH_API_URL: "http://api:3001",
              WORKMESH_SESSION_TOKEN: mcpSessionToken,
              WORKMESH_MCP_ACCESS_TOKEN: mcpAccessToken,
              ...mcpEnvironmentOverride,
            },
          },
        }
      : {}),
  },
});

const successfulRunner = ({
  stoppedExitCode = 0,
  failStop = false,
  failBarrier = false,
  mcpEnabled = true,
  ambiguousMcpTopology = false,
  inconsistentMcpTopology = false,
  mcpEnvironmentOverride,
  apiEnvironmentOverride,
  postgresEnvironmentOverride,
  failRuntimePreflightService,
  failSnapshotConfig = false,
}: {
  stoppedExitCode?: number;
  failStop?: boolean;
  failBarrier?: boolean;
  mcpEnabled?: boolean;
  ambiguousMcpTopology?: boolean;
  inconsistentMcpTopology?: boolean;
  mcpEnvironmentOverride?: Record<string, string>;
  apiEnvironmentOverride?: Record<string, string>;
  postgresEnvironmentOverride?: Record<string, string>;
  failRuntimePreflightService?: string;
  failSnapshotConfig?: boolean;
} = {}): {
  runner: RetentionUpgradeCommandRunner;
  commands: Command[];
} => {
  const commands: Command[] = [];
  let oldWorkerInspections = 0;
  let workerLookups = 0;
  const result = (stdout = "", status = 0) => ({
    status,
    signal: null,
    stdout,
    stderr: "",
    error: undefined,
  });
  const runner: RetentionUpgradeCommandRunner = (command, arguments_) => {
    commands.push({ command, arguments_: [...arguments_] });
    const joined = arguments_.join(" ");
    if (joined.includes("config --format json"))
      return result(
        JSON.stringify(
          renderedCompose({
            includeMcp: joined.includes("--profile agent"),
            mcpEnvironmentOverride,
            apiEnvironmentOverride,
            postgresEnvironmentOverride,
          }),
        ),
      );
    if (
      failSnapshotConfig &&
      joined.includes("compose.snapshot.json") &&
      joined.includes("config --quiet")
    )
      return result("", 1);
    if (joined.includes("/app/runtime-guard.mjs")) {
      const service = arguments_[arguments_.length - 2];
      return result("", service === failRuntimePreflightService ? 1 : 0);
    }
    if (arguments_[0] === "image" && arguments_[1] === "inspect") {
      const reference = arguments_[2]!;
      const role = reference.match(/workmesh-(api|worker|mcp|web)@/)?.[1]!;
      return result(
        JSON.stringify([
          {
            Id: `sha256:${role.padEnd(64, role[0])}`,
            RepoDigests: [reference],
            Config: {
              Labels: { "org.opencontainers.image.revision": buildSha },
            },
          },
        ]),
      );
    }
    if (arguments_[0] === "inspect") {
      const id = arguments_[1]!;
      if (id === "111111111111") {
        oldWorkerInspections += 1;
        return result(
          JSON.stringify([
            {
              Image: "sha256:old",
              Config: {
                Image: "ghcr.io/workmesh/workmesh-worker@sha256:old",
                Labels: {
                  "com.docker.compose.project": "workmesh-production",
                  "com.docker.compose.service": "worker",
                  "com.docker.compose.project.config_files":
                    "G:\\repo\\docker-compose.production.yml",
                  "com.docker.compose.project.working_dir": "G:\\repo",
                },
              },
              State:
                oldWorkerInspections === 1
                  ? { Running: true, Restarting: false, ExitCode: 0 }
                  : {
                      Running: false,
                      Restarting: false,
                      ExitCode: stoppedExitCode,
                    },
            },
          ]),
        );
      }
      if (id === "666666666666") {
        return result(
          JSON.stringify([
            {
              Image: "sha256:old-mcp",
              Config: {
                Image: "ghcr.io/workmesh/workmesh-mcp@sha256:old",
                Labels: {
                  "com.docker.compose.project": inconsistentMcpTopology
                    ? "other-project"
                    : "workmesh-production",
                  "com.docker.compose.service": "mcp",
                  "com.docker.compose.project.config_files":
                    "G:\\repo\\docker-compose.production.yml",
                  "com.docker.compose.project.working_dir": "G:\\repo",
                },
              },
              State: { Running: true, Restarting: false, ExitCode: 0 },
            },
          ]),
        );
      }
      const role =
        id === "222222222222"
          ? "worker"
          : id === "333333333333"
            ? "api"
            : id === "444444444444"
              ? "mcp"
              : "web";
      return result(
        JSON.stringify([
          {
            Image: `sha256:${role.padEnd(64, role[0])}`,
            Config: {
              Image: image(role),
              Labels: {
                "com.docker.compose.project": "workmesh-production",
                "com.docker.compose.service": role,
              },
            },
            State: { Running: true, Restarting: false, ExitCode: 0 },
          },
        ]),
      );
    }
    if (
      arguments_[0] === "ps" &&
      arguments_.includes("-a") &&
      joined.includes("com.docker.compose.service=mcp")
    )
      return result(
        ambiguousMcpTopology ? "666666666666\n777777777777" : mcpEnabled ? "666666666666" : "",
      );
    if (joined.includes("compose") && joined.includes("ps -q worker")) {
      workerLookups += 1;
      return result(workerLookups === 1 ? "111111111111" : "222222222222");
    }
    if (joined.includes("compose") && joined.includes("ps -q api")) return result("333333333333");
    if (joined.includes("compose") && joined.includes("ps -q mcp")) return result("444444444444");
    if (joined.includes("compose") && joined.includes("ps -q web")) return result("555555555555");
    if (joined.includes("stop -t 35 worker") && failStop) return result("", 1);
    if (joined.includes("dist/run-retention-upgrade-barrier.js") && failBarrier)
      return result("", 1);
    if (joined.includes("schema_migrations WHERE version=")) return result("1");
    if (joined.includes("worker_build_sha=")) return result("1");
    return result("");
  };
  return { runner, commands };
};

const run = (
  runner: RetentionUpgradeCommandRunner,
  execute: boolean,
  environmentOverride: NodeJS.ProcessEnv = environment,
  snapshotStore: RetentionUpgradeComposeSnapshotStore = {
    create: async () => ({
      path: "G:\\secure\\compose.snapshot.json",
      cleanup: async () => {},
    }),
  },
) =>
  runProductionRetentionUpgrade({
    execute,
    environment: environmentOverride,
    root: "G:\\repo",
    envFile: "G:\\repo\\.env.production",
    snapshotStore,
    runner,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    delay: async () => {},
  });

const commandText = (commands: readonly Command[]): string[] =>
  commands.map(({ command, arguments_ }) => `${command} ${arguments_.join(" ")}`);

describe("production retention upgrade executor", () => {
  it("is dry-run by default and performs no mutating command", async () => {
    const { runner, commands } = successfulRunner();
    await expect(run(runner, false)).resolves.toMatchObject({
      execute: false,
      buildSha,
      oldWorkerId: "111111111111",
      project: "workmesh-production",
      topology: {
        mcpEnabled: true,
        applicationServices: ["api", "worker", "mcp", "web"],
      },
    });
    const text = commandText(commands);
    expect(text).toHaveLength(11);
    expect(text.some((command) => command.includes(" update "))).toBe(false);
    expect(text.some((command) => command.includes(" stop "))).toBe(false);
    expect(text.some((command) => command.includes(" run "))).toBe(false);
    expect(text.some((command) => command.includes(" up "))).toBe(false);
  });

  it("executes stop, barrier, migration, Worker proof, then remaining services", async () => {
    const { runner, commands } = successfulRunner();
    await expect(run(runner, true)).resolves.toMatchObject({
      execute: true,
      buildSha,
      migrated: "0030_durable_archive_upload_intents",
      workerContainerId: "222222222222",
      topology: {
        mcpEnabled: true,
        applicationServices: ["api", "worker", "mcp", "web"],
      },
    });
    const text = commandText(commands);
    const topologyFrozen = text.findIndex(
      (command) =>
        command.includes("docker ps -a -q") && command.includes("com.docker.compose.service=mcp"),
    );
    const includedConfigValidated = text.findIndex((command) =>
      command.includes("--profile agent config --format json"),
    );
    const runtimePreflightIndexes = ["migrate", "api", "worker", "web", "mcp"].map((service) =>
      text.findIndex((command) =>
        command.includes(
          `run --rm --no-deps -T --entrypoint node ${service} /app/runtime-guard.mjs`,
        ),
      ),
    );
    const restartOff = text.findIndex((command) =>
      command.includes("update --restart=no 111111111111"),
    );
    const stop = text.findIndex((command) => command.includes("stop -t 35 worker"));
    const barrier = text.findIndex((command) =>
      command.includes("dist/run-retention-upgrade-barrier.js"),
    );
    const migrate = text.findIndex((command) => command.includes("run --rm --no-deps migrate"));
    const worker = text.findIndex((command) =>
      command.includes("--force-recreate --wait --wait-timeout 120 worker"),
    );
    const remaining = text.findIndex((command) =>
      command.includes("--force-recreate --wait --wait-timeout 240 api mcp web"),
    );
    expect(topologyFrozen).toBeGreaterThan(-1);
    expect(includedConfigValidated).toBeGreaterThan(topologyFrozen);
    expect(runtimePreflightIndexes.every((index) => index > -1)).toBe(true);
    expect(runtimePreflightIndexes).toEqual(
      [...runtimePreflightIndexes].sort((left, right) => left - right),
    );
    expect(runtimePreflightIndexes.every((index) => index < restartOff)).toBe(true);
    expect(restartOff).toBeGreaterThan(includedConfigValidated);
    expect(restartOff).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(restartOff);
    expect(barrier).toBeGreaterThan(stop);
    expect(migrate).toBeGreaterThan(barrier);
    expect(worker).toBeGreaterThan(migrate);
    expect(remaining).toBeGreaterThan(worker);
  });

  it("preserves an MCP-disabled topology without activating the agent profile", async () => {
    const { runner, commands } = successfulRunner({ mcpEnabled: false });
    const disabledEnvironment = {
      WORKMESH_BUILD_SHA: buildSha,
      WORKMESH_API_IMAGE: image("api"),
      WORKMESH_WORKER_IMAGE: image("worker"),
      WORKMESH_MCP_IMAGE: image("mcp"),
      WORKMESH_WEB_IMAGE: image("web"),
      POSTGRES_USER: "workmesh",
      POSTGRES_DB: "workmesh",
    };
    await expect(run(runner, true, disabledEnvironment)).resolves.toMatchObject({
      execute: true,
      topology: {
        mcpEnabled: false,
        applicationServices: ["api", "worker", "web"],
      },
    });
    const text = commandText(commands);
    const topologyFrozen = text.findIndex(
      (command) =>
        command.includes("docker ps -a -q") && command.includes("com.docker.compose.service=mcp"),
    );
    const migrate = text.findIndex((command) => command.includes("run --rm --no-deps migrate"));
    const remaining = text.findIndex((command) =>
      command.includes("--force-recreate --wait --wait-timeout 240 api web"),
    );
    const runtimePreflightIndexes = ["migrate", "api", "worker", "web"].map((service) =>
      text.findIndex((command) =>
        command.includes(
          `run --rm --no-deps -T --entrypoint node ${service} /app/runtime-guard.mjs`,
        ),
      ),
    );
    const restartOff = text.findIndex((command) => command.includes("update --restart=no"));
    expect(topologyFrozen).toBeGreaterThan(-1);
    expect(runtimePreflightIndexes.every((index) => index > -1)).toBe(true);
    expect(runtimePreflightIndexes.every((index) => index < restartOff)).toBe(true);
    expect(migrate).toBeGreaterThan(topologyFrozen);
    expect(remaining).toBeGreaterThan(migrate);
    expect(text.some((command) => command.includes("--profile agent"))).toBe(false);
    expect(
      text.some(
        (command) =>
          command.includes("workmesh-mcp@") ||
          command.includes("ps -q mcp") ||
          command.includes("api mcp web") ||
          command.includes("node mcp /app/runtime-guard.mjs"),
      ),
    ).toBe(false);
  });

  it("binds every post-freeze Compose command to an owner-only digest snapshot", async () => {
    const { runner, commands } = successfulRunner();
    const mutableEnvironment: NodeJS.ProcessEnv = { ...environment };
    let snapshotContent = "";
    let cleanupCalls = 0;
    const snapshotStore: RetentionUpgradeComposeSnapshotStore = {
      create: async (content, protection) => {
        snapshotContent = content;
        expect(protection).toEqual({
          directoryMode: 0o700,
          fileMode: 0o600,
        });
        mutableEnvironment.WORKMESH_API_IMAGE = "ghcr.io/workmesh/workmesh-api:latest";
        mutableEnvironment.WORKMESH_SESSION_TOKEN = "tampered-after-freeze";
        return {
          path: "G:\\secure\\compose.snapshot.json",
          cleanup: async () => {
            cleanupCalls += 1;
          },
        };
      },
    };
    const result = await run(runner, true, mutableEnvironment, snapshotStore);
    const frozen = JSON.parse(snapshotContent) as {
      services: Record<string, { image?: string }>;
    };
    expect(frozen.services.api?.image).toBe(image("api"));
    expect(frozen.services.worker?.image).toBe(image("worker"));
    expect(frozen.services.web?.image).toBe(image("web"));
    expect(frozen.services.mcp?.image).toBe(image("mcp"));
    expect(snapshotContent).not.toContain("${");
    const text = commandText(commands);
    const finalRender = text.findIndex((command) =>
      command.includes("--profile agent config --format json"),
    );
    expect(text[finalRender]).toContain("compose --project-name workmesh-production --env-file");
    const postFreezeCompose = text
      .slice(finalRender + 1)
      .filter((command) => command.startsWith("docker compose "));
    expect(postFreezeCompose.length).toBeGreaterThan(0);
    expect(
      postFreezeCompose.every(
        (command) =>
          command.includes("--project-name workmesh-production") &&
          command.includes("-f G:\\secure\\compose.snapshot.json") &&
          !command.includes("--env-file") &&
          !command.includes("docker-compose.production.yml"),
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("compose.snapshot.json");
    expect(JSON.stringify(result)).not.toContain(mcpSessionToken);
    expect(cleanupCalls).toBe(1);
  });

  it("cleans the frozen snapshot when a target runtime guard fails", async () => {
    const { runner } = successfulRunner({
      failRuntimePreflightService: "api",
    });
    let cleanupCalls = 0;
    const snapshotStore: RetentionUpgradeComposeSnapshotStore = {
      create: async () => ({
        path: "G:\\secure\\compose.snapshot.json",
        cleanup: async () => {
          cleanupCalls += 1;
        },
      }),
    };
    await expect(run(runner, true, environment, snapshotStore)).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_API_RUNTIME_PREFLIGHT_FAILED",
    });
    expect(cleanupCalls).toBe(1);
  });

  it("fails before mutation and cleans up when snapshot Compose validation fails", async () => {
    const { runner, commands } = successfulRunner({
      failSnapshotConfig: true,
    });
    let cleanupCalls = 0;
    const snapshotStore: RetentionUpgradeComposeSnapshotStore = {
      create: async () => ({
        path: "G:\\secure\\compose.snapshot.json",
        cleanup: async () => {
          cleanupCalls += 1;
        },
      }),
    };
    await expect(run(runner, true, environment, snapshotStore)).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_SNAPSHOT_COMPOSE_INVALID",
    });
    const text = commandText(commands);
    expect(
      text.some(
        (command) =>
          command.includes("update --restart=no") ||
          command.includes("stop -t 35 worker") ||
          command.includes("run --rm --no-deps migrate"),
      ),
    ).toBe(false);
    expect(cleanupCalls).toBe(1);
  });

  it("redacts snapshot creation failures and fails before mutation", async () => {
    const { runner, commands } = successfulRunner();
    const leakedPath = "G:\\secure\\compose.snapshot.json";
    const snapshotStore: RetentionUpgradeComposeSnapshotStore = {
      create: async () => {
        throw new Error(`${leakedPath}:${mcpSessionToken}`);
      },
    };
    let failure: unknown;
    try {
      await run(runner, true, environment, snapshotStore);
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "RETENTION_UPGRADE_SNAPSHOT_CREATE_FAILED",
    });
    expect(String(failure)).not.toContain(leakedPath);
    expect(String(failure)).not.toContain(mcpSessionToken);
    const text = commandText(commands);
    expect(
      text.some(
        (command) =>
          command.includes("update --restart=no") ||
          command.includes("stop -t 35 worker") ||
          command.includes("run --rm --no-deps migrate"),
      ),
    ).toBe(false);
  });

  it.each([
    {
      name: "ambiguous MCP membership",
      options: { ambiguousMcpTopology: true },
      code: "RETENTION_UPGRADE_MCP_TOPOLOGY_AMBIGUOUS",
    },
    {
      name: "inconsistent MCP deployment labels",
      options: { inconsistentMcpTopology: true },
      code: "RETENTION_UPGRADE_MCP_TOPOLOGY_INCONSISTENT",
    },
  ])("fails closed before migration for $name", async ({ options, code }) => {
    const { runner, commands } = successfulRunner(options);
    await expect(run(runner, true)).rejects.toMatchObject({ code });
    const text = commandText(commands);
    expect(text.some((command) => command.includes("run --rm --no-deps migrate"))).toBe(false);
    expect(text.some((command) => command.includes("update --restart=no"))).toBe(false);
  });

  it.each([
    {
      name: "short access token",
      override: { WORKMESH_MCP_ACCESS_TOKEN: "too-short" },
    },
    {
      name: "placeholder access token",
      override: {
        WORKMESH_MCP_ACCESS_TOKEN: `CHANGE_ME_${"g".repeat(40)}`,
      },
    },
    {
      name: "equal MCP tokens",
      override: { WORKMESH_MCP_ACCESS_TOKEN: mcpSessionToken },
    },
    {
      name: "access token reused from SESSION_SECRET",
      override: { WORKMESH_MCP_ACCESS_TOKEN: sessionSecret },
    },
    {
      name: "session token reused from another runtime secret",
      override: { WORKMESH_SESSION_TOKEN: objectStoreSecret },
    },
  ])("fails closed before migration for $name", async ({ override }) => {
    const { runner, commands } = successfulRunner({
      mcpEnvironmentOverride: Object.fromEntries(Object.entries(override)),
    });
    await expect(
      run(runner, true, {
        ...environment,
        ...override,
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_MCP_RUNTIME_CONFIG_INVALID",
    });
    const text = commandText(commands);
    expect(text.some((command) => command.includes("run --rm --no-deps migrate"))).toBe(false);
    expect(text.some((command) => command.includes("update --restart=no"))).toBe(false);
  });

  it.each(["migrate", "api", "worker", "web", "mcp"])(
    "does not mutate the deployment when the %s target runtime guard fails",
    async (service) => {
      const { runner, commands } = successfulRunner({
        failRuntimePreflightService: service,
      });
      await expect(run(runner, true)).rejects.toMatchObject({
        code: `RETENTION_UPGRADE_${service.toUpperCase()}_RUNTIME_PREFLIGHT_FAILED`,
      });
      const text = commandText(commands);
      expect(text.some((command) => command.includes("update --restart=no"))).toBe(false);
      expect(
        text.some(
          (command) =>
            command.includes("stop -t 35 worker") || command.includes("run --rm --no-deps migrate"),
        ),
      ).toBe(false);
    },
  );

  it.each([
    {
      name: "invalid PostgreSQL user",
      override: { POSTGRES_USER: "invalid user" },
      code: "RETENTION_UPGRADE_POSTGRES_USER_INVALID",
    },
    {
      name: "invalid PostgreSQL database",
      override: { POSTGRES_DB: "invalid/database" },
      code: "RETENTION_UPGRADE_POSTGRES_DATABASE_INVALID",
    },
  ])("rejects $name before any Docker mutation", async ({ override, code }) => {
    const { runner, commands } = successfulRunner();
    await expect(run(runner, true, { ...environment, ...override })).rejects.toMatchObject({
      code,
    });
    const text = commandText(commands);
    expect(text).toHaveLength(0);
    expect(text.some((command) => command.includes("run --rm --no-deps migrate"))).toBe(false);
    expect(
      text.some(
        (command) =>
          command.includes("update --restart=no") || command.includes("stop -t 35 worker"),
      ),
    ).toBe(false);
  });

  it.each([
    {
      name: "short PostgreSQL password",
      apiEnvironmentOverride: {},
      postgresEnvironmentOverride: { POSTGRES_PASSWORD: "too-short" },
    },
    {
      name: "placeholder PostgreSQL password",
      apiEnvironmentOverride: {},
      postgresEnvironmentOverride: {
        POSTGRES_PASSWORD: `CHANGE_ME_${"h".repeat(40)}`,
      },
    },
    {
      name: "malformed pagination key set",
      apiEnvironmentOverride: { PAGINATION_CURSOR_KEYS: "not-an-entry" },
      postgresEnvironmentOverride: {},
    },
    {
      name: "low-diversity pagination material",
      apiEnvironmentOverride: {
        PAGINATION_CURSOR_KEYS: `cursor:${Buffer.alloc(32, 0x41).toString("base64url")}`,
      },
      postgresEnvironmentOverride: {},
    },
    {
      name: "missing pagination active kid",
      apiEnvironmentOverride: { PAGINATION_CURSOR_ACTIVE_KID: "" },
      postgresEnvironmentOverride: {},
    },
    {
      name: "duplicate pagination kid",
      apiEnvironmentOverride: {
        PAGINATION_CURSOR_KEYS: `cursor:${paginationKey},cursor:${bootstrapToken}`,
      },
      postgresEnvironmentOverride: {},
    },
    {
      name: "duplicate pagination material",
      apiEnvironmentOverride: {
        PAGINATION_CURSOR_KEYS: `cursor:${paginationKey},next:${paginationKey}`,
      },
      postgresEnvironmentOverride: {},
    },
    {
      name: "pagination material reused as PostgreSQL password",
      apiEnvironmentOverride: {},
      postgresEnvironmentOverride: { POSTGRES_PASSWORD: paginationKey },
    },
  ])(
    "rejects $name before update, stop, or migration",
    async ({ apiEnvironmentOverride, postgresEnvironmentOverride }) => {
      const { runner, commands } = successfulRunner({
        apiEnvironmentOverride: Object.fromEntries(Object.entries(apiEnvironmentOverride)),
        postgresEnvironmentOverride: Object.fromEntries(
          Object.entries(postgresEnvironmentOverride),
        ),
      });
      await expect(run(runner, true)).rejects.toMatchObject({
        code: "RETENTION_UPGRADE_API_RUNTIME_CONFIG_INVALID",
      });
      const text = commandText(commands);
      expect(
        text.some(
          (command) =>
            command.includes("update --restart=no") ||
            command.includes("stop -t 35 worker") ||
            command.includes("run --rm --no-deps migrate"),
        ),
      ).toBe(false);
    },
  );

  it.each([
    {
      name: "daemon interruption during stop",
      options: { failStop: true },
      code: "RETENTION_UPGRADE_WORKER_STOP_INTERRUPTED",
    },
    {
      name: "exit 137",
      options: { stoppedExitCode: 137 },
      code: "RETENTION_UPGRADE_WORKER_STOP_EXIT_137",
    },
    {
      name: "unclean nonzero exit",
      options: { stoppedExitCode: 1 },
      code: "RETENTION_UPGRADE_WORKER_STOP_UNCLEAN",
    },
    {
      name: "barrier rejection",
      options: { failBarrier: true },
      code: "RETENTION_UPGRADE_BARRIER_REJECTED",
    },
  ])("does not migrate after $name", async ({ options, code }) => {
    const { runner, commands } = successfulRunner(options);
    await expect(run(runner, true)).rejects.toMatchObject({ code });
    const text = commandText(commands);
    expect(text.some((command) => command.includes("run --rm --no-deps migrate"))).toBe(false);
  });
});
