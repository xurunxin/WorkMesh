import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function resetAcceptanceDatabase(): Promise<void> {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("pnpm did not expose npm_execpath to Playwright global setup");
  }
  const pnpmScript = /\.(?:cjs|mjs|js)$/i.test(pnpmCli);
  await execFileAsync(
    pnpmScript ? process.execPath : pnpmCli,
    [...(pnpmScript ? [pnpmCli] : []), "--filter", "@workmesh/db", "exec", "tsx", "scripts/reset-test.ts"],
    {
      env: process.env,
      windowsHide: true,
      timeout: 360_000,
      maxBuffer: 1024 * 1024,
    },
  );
}
