import { describe, expect, it } from "vitest";
import {
  runProductionRetentionUpgrade,
  type RetentionUpgradeCommandRunner,
} from "../../../scripts/retention-production-upgrade.mjs";

const buildSha = "a".repeat(40);
const digest = "b".repeat(64);
const image = (role: string) =>
  `ghcr.io/workmesh/workmesh-${role}@sha256:${digest}`;
const environment = {
  WORKMESH_BUILD_SHA: buildSha,
  WORKMESH_API_IMAGE: image("api"),
  WORKMESH_WORKER_IMAGE: image("worker"),
  WORKMESH_MCP_IMAGE: image("mcp"),
  WORKMESH_WEB_IMAGE: image("web"),
  POSTGRES_USER: "workmesh",
  POSTGRES_DB: "workmesh",
};

type Command = Readonly<{ command: string; arguments_: readonly string[] }>;

const successfulRunner = ({
  stoppedExitCode = 0,
  failStop = false,
  failBarrier = false,
}: {
  stoppedExitCode?: number;
  failStop?: boolean;
  failBarrier?: boolean;
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
    if (joined.includes("compose") && joined.includes("ps -q worker")) {
      workerLookups += 1;
      return result(workerLookups === 1 ? "111111111111" : "222222222222");
    }
    if (joined.includes("compose") && joined.includes("ps -q api"))
      return result("333333333333");
    if (joined.includes("compose") && joined.includes("ps -q mcp"))
      return result("444444444444");
    if (joined.includes("compose") && joined.includes("ps -q web"))
      return result("555555555555");
    if (joined.includes("stop -t 35 worker") && failStop) return result("", 1);
    if (joined.includes("dist/run-retention-upgrade-barrier.js") && failBarrier)
      return result("", 1);
    if (joined.includes("schema_migrations WHERE version=")) return result("1");
    if (joined.includes("worker_build_sha=")) return result("1");
    return result("");
  };
  return { runner, commands };
};

const run = (runner: RetentionUpgradeCommandRunner, execute: boolean) =>
  runProductionRetentionUpgrade({
    execute,
    environment,
    root: "G:\\repo",
    envFile: "G:\\repo\\.env.production",
    runner,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    delay: async () => {},
  });

const commandText = (commands: readonly Command[]): string[] =>
  commands.map(
    ({ command, arguments_ }) => `${command} ${arguments_.join(" ")}`,
  );

describe("production retention upgrade executor", () => {
  it("is dry-run by default and performs no mutating command", async () => {
    const { runner, commands } = successfulRunner();
    await expect(run(runner, false)).resolves.toMatchObject({
      execute: false,
      buildSha,
      oldWorkerId: "111111111111",
      project: "workmesh-production",
    });
    const text = commandText(commands);
    expect(text).toHaveLength(7);
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
    });
    const text = commandText(commands);
    const restartOff = text.findIndex((command) =>
      command.includes("update --restart=no 111111111111"),
    );
    const stop = text.findIndex((command) =>
      command.includes("stop -t 35 worker"),
    );
    const barrier = text.findIndex((command) =>
      command.includes("dist/run-retention-upgrade-barrier.js"),
    );
    const migrate = text.findIndex((command) =>
      command.includes("run --rm --no-deps migrate"),
    );
    const worker = text.findIndex((command) =>
      command.includes("--force-recreate --wait --wait-timeout 120 worker"),
    );
    const remaining = text.findIndex((command) =>
      command.includes(
        "--force-recreate --wait --wait-timeout 240 api mcp web",
      ),
    );
    expect(restartOff).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(restartOff);
    expect(barrier).toBeGreaterThan(stop);
    expect(migrate).toBeGreaterThan(barrier);
    expect(worker).toBeGreaterThan(migrate);
    expect(remaining).toBeGreaterThan(worker);
  });

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
    expect(
      text.some((command) => command.includes("run --rm --no-deps migrate")),
    ).toBe(false);
  });
});
