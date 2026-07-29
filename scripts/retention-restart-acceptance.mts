import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const execute = process.argv.includes("--execute");
const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Retention restart acceptance requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Retention restart acceptance requires an isolated *test* database.",
  );
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
const plannedSteps = [
  "verified Object Lock readback and isolated restore",
  "exact-version early-delete rejection",
  "Redis restart and healthy recovery",
  "API and Worker restart and healthy recovery",
  "outbox committed-claim and Redis-hint recovery",
  "dual retention Worker fencing and stale-owner rejection",
  "protected unknown, A2A, webhook, audit, and undelivered-outbox rows",
  "pre-header and live CURSOR_EXPIRED resynchronization",
];

if (!execute) {
  await writeFile(
    reportPath,
    `${JSON.stringify({
      schemaVersion: 1,
      status: "dry_run",
      composeFile: composeFile.split(/[\\/]/).at(-1),
      buildsImages: false,
      pushesImages: false,
      steps: plannedSteps,
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  process.stdout.write(
    `[DRY RUN] retention restart/contention plan: ${reportPath}\n`,
  );
  process.exit(0);
}

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
): void => {
  const started = performance.now();
  const result = spawnSync(executable, args, {
    cwd: root,
    env: process.env,
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
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const compose = (...args: string[]): void =>
  command(
    `compose ${args.join(" ")}`,
    docker,
    ["compose", "-f", composeFile, ...args],
  );

const waitHealthy = async (services: readonly string[]): Promise<void> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = spawnSync(
      docker,
      ["compose", "-f", composeFile, "ps", "--format", "json", ...services],
      {
        cwd: root,
        env: process.env,
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (result.status === 0) {
      const rows = result.stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as {
          Service?: string;
          State?: string;
          Health?: string;
        });
      if (
        services.every((service) =>
          rows.some(
            (row) =>
              row.Service === service
              && row.State === "running"
              && row.Health === "healthy",
          ),
        )
      )
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`RETENTION_ACCEPTANCE_HEALTH_TIMEOUT:${services.join(",")}`);
};

command(
  "isolated restore and Object Lock delete rejection",
  pnpm,
  ["test:restore:retention"],
);
compose("restart", "redis");
await waitHealthy(["redis"]);
compose("restart", "api", "worker");
await waitHealthy(["api", "worker"]);
command(
  "outbox and Redis recovery integration",
  pnpm,
  [
    "-C",
    "apps/worker",
    "exec",
    "vitest",
    "run",
    "--config",
    "../../vitest.integration.config.ts",
    "integration/outbox-recovery.integration.test.ts",
  ],
);
command(
  "retention restart contention and protection integration",
  pnpm,
  [
    "-C",
    "apps/worker",
    "exec",
    "vitest",
    "run",
    "--config",
    "../../vitest.integration.config.ts",
    "integration/retention.integration.test.ts",
  ],
);
command(
  "CURSOR_EXPIRED resynchronization integration",
  pnpm,
  [
    "-C",
    "apps/api",
    "exec",
    "vitest",
    "run",
    "--config",
    "../../vitest.integration.config.ts",
    "integration/auth-idempotency.integration.test.ts",
    "-t",
    "returns pre-header and live CURSOR_EXPIRED",
  ],
);

await writeFile(
  reportPath,
  `${JSON.stringify({
    schemaVersion: 1,
    status: "passed",
    completedAt: new Date().toISOString(),
    buildsImages: false,
    pushesImages: false,
    steps: results,
  }, null, 2)}\n`,
  { encoding: "utf8", flag: "wx" },
);
process.stdout.write(
  `[PASS] retention restart/contention acceptance: ${reportPath}\n`,
);
