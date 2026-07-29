import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
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
  WORKMESH_RETENTION_SOAK_INSTALLATION_TOKEN:
    result.state.installationToken,
  WORKMESH_RETENTION_SOAK_LOCK_PATH: lockPath,
  WORKMESH_RETENTION_SOAK_LOCK_FD: "3",
  WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256:
    retentionSoakSessionScopeSha256(result.state.sessionId),
};
const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const harness = fileURLToPath(
  new URL("../../../scripts/retention-soak.mts", import.meta.url),
);
let exitCode: number;
try {
  exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(
      "/bin/sh",
      [
        "-c",
        'flock --nonblock --exclusive "$WORKMESH_RETENTION_SOAK_LOCK_FD" || exit 75; exec "$@"',
        "retention-soak-lock",
        tsx,
        harness,
        ...process.argv.slice(2),
      ],
      {
        env: childEnv,
        stdio: ["inherit", "inherit", "inherit", lockFile.fd],
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
} finally {
  await lockFile.close();
}
if (exitCode !== 0) process.exitCode = exitCode;
