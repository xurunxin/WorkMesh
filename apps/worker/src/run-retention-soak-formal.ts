import { spawn } from "node:child_process";
import { chmod, open, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  retentionSoakSessionLockPath,
  retentionSoakSessionScopeSha256,
} from "./retention-soak-lock.js";
import { retentionSoakProvisionOptionsFromEnvironment } from "./retention-soak-provision-environment.js";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

if (process.platform === "win32")
  throw new Error("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");

const result = await provisionRetentionSoak(
  retentionSoakProvisionOptionsFromEnvironment(process.env),
);

const lockPath = retentionSoakSessionLockPath(
  result.statePath,
  result.state.sessionId,
);
const lockFile = await open(lockPath, "a", 0o600);
await lockFile.close();
await chmod(lockPath, 0o600);
const lockMode = (await stat(lockPath)).mode & 0o777;
if (lockMode !== 0o600)
  throw new Error("RETENTION_SOAK_SESSION_LOCK_PERMISSIONS_UNSAFE");

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  WORKMESH_RETENTION_SOAK_SESSION_ID: result.state.sessionId,
  WORKMESH_RETENTION_SOAK_INSTALLATION_TOKEN:
    result.state.installationToken,
  WORKMESH_RETENTION_SOAK_LOCK_PATH: lockPath,
  WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256:
    retentionSoakSessionScopeSha256(result.state.sessionId),
};
const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const harness = fileURLToPath(
  new URL("../../../scripts/retention-soak.mts", import.meta.url),
);
const exitCode = await new Promise<number>((resolveExit, reject) => {
  const child = spawn(
    "flock",
    [
      "--nonblock",
      "--exclusive",
      "--no-fork",
      lockPath,
      tsx,
      harness,
      ...process.argv.slice(2),
    ],
    {
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal || code === null)
      reject(new Error("RETENTION_SOAK_FORMAL_RUNNER_FAILED"));
    else resolveExit(code);
  });
});
if (exitCode !== 0) process.exitCode = exitCode;
