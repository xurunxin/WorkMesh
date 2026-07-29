import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRetentionSoakFormalLaunchSpec } from "./retention-soak-formal-launch.js";
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
const lockFile = await open(
  lockPath,
  constants.O_CREAT |
    constants.O_RDWR |
    constants.O_APPEND |
    constants.O_NOFOLLOW,
  0o600,
);
await lockFile.chmod(0o600);
const [lockPathStat, lockFdStat] = await Promise.all([
  lstat(lockPath),
  lockFile.stat(),
]);
const currentUid = process.getuid?.();
if (
  currentUid === undefined ||
  !lockPathStat.isFile() ||
  lockPathStat.isSymbolicLink() ||
  String(lockPathStat.dev) !== String(lockFdStat.dev) ||
  String(lockPathStat.ino) !== String(lockFdStat.ino) ||
  (lockPathStat.mode & 0o777) !== 0o600 ||
  lockPathStat.uid !== currentUid
)
  throw new Error("RETENTION_SOAK_SESSION_LOCK_PERMISSIONS_UNSAFE");

const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  WORKMESH_RETENTION_SOAK_SESSION_ID: result.state.sessionId,
  WORKMESH_RETENTION_SOAK_INSTALLATION_TOKEN: result.state.installationToken,
  WORKMESH_RETENTION_SOAK_LOCK_PATH: lockPath,
  WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256: retentionSoakSessionScopeSha256(
    result.state.sessionId,
  ),
};
const harness = fileURLToPath(
  new URL("../../../scripts/retention-soak.mts", import.meta.url),
);
const launch = createRetentionSoakFormalLaunchSpec({
  childEnv,
  harness,
  harnessArguments: process.argv.slice(2),
  lockFileFd: lockFile.fd,
  tsxRegistration: import.meta.resolve("tsx"),
});
let exitCode: number;
try {
  exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(launch.executable, [...launch.args], launch.options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal || code === null)
        reject(new Error("RETENTION_SOAK_FORMAL_RUNNER_FAILED"));
      else resolveExit(code);
    });
  });
} finally {
  await lockFile.close();
}
if (exitCode !== 0) process.exitCode = exitCode;
