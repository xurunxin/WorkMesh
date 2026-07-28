import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Heartbeat load test requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error("Heartbeat load test requires a dedicated *test* database.");

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  executable,
  [
    "-C",
    "apps/api",
    "exec",
    "vitest",
    "run",
    "--config",
    "../../vitest.integration.config.ts",
    "integration/stage1.integration.test.ts",
    "-t",
    "keeps steady heartbeats bounded",
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, RUN_HEARTBEAT_LOAD: "1" },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
