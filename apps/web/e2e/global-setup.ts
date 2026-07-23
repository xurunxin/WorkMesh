import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function resetAcceptanceDatabase(): Promise<void> {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("pnpm did not expose npm_execpath to Playwright global setup");
  }
  await execFileAsync(
    process.execPath,
    [pnpmCli, "--filter", "@workmesh/db", "exec", "tsx", "scripts/reset-test.ts"],
    {
      env: process.env,
      windowsHide: true,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );
}
