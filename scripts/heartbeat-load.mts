import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Heartbeat load test requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error("Heartbeat load test requires a dedicated *test* database.");

const timestamp = new Date().toISOString().replaceAll(":", "-");
const reportDirectory = resolve(
  root,
  process.env.HEARTBEAT_LOAD_REPORT_DIRECTORY
    ?? `.tmp/heartbeat-load/${timestamp}`,
);
const reportPath = resolve(
  process.env.HEARTBEAT_LOAD_REPORT_PATH
    ?? `${reportDirectory}/report.json`,
);
mkdirSync(reportDirectory, { recursive: true });
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
    cwd: root,
    env: {
      ...process.env,
      RUN_HEARTBEAT_LOAD: "1",
      HEARTBEAT_LOAD_REPORT_PATH: reportPath,
    },
    stdio: "inherit",
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(reportPath))
  throw new Error(`Heartbeat load report was not written: ${reportPath}`);
const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
  status?: string;
  transport?: string;
  requestCount?: number;
};
if (
  report.status !== "passed"
  || report.transport !== "http"
  || report.requestCount !== 10_000
)
  throw new Error("Heartbeat load report did not satisfy the formal gate.");
process.stdout.write(`[PASS] heartbeat load report: ${reportPath}\n`);
