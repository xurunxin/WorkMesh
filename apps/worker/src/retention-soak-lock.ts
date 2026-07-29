import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readlink } from "node:fs/promises";
import { resolve } from "node:path";

export type RetentionSoakLockProof = Readonly<{
  verified: true;
  mechanism: "flock";
  sessionScopeSha256: string;
}>;

export type RetentionSoakExecStatus = (
  executable: string,
  args: readonly string[],
) => Promise<number>;

type InheritedLockVerifier = (expectedPath: string) => Promise<boolean>;

const execStatus: RetentionSoakExecStatus = async (executable, args) =>
  await new Promise<number>((resolveStatus, reject) => {
    const child = spawn(executable, [...args], {
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal || code === null)
        reject(new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED"));
      else resolveStatus(code);
    });
  });

const hasInheritedLock: InheritedLockVerifier = async (expectedPath) => {
  const descriptors = await readdir("/proc/self/fd");
  for (const descriptor of descriptors) {
    try {
      const target = await readlink(`/proc/self/fd/${descriptor}`);
      if (resolve(target.replace(/ \(deleted\)$/, "")) === expectedPath)
        return true;
    } catch {
      // Descriptors can close between enumeration and inspection.
    }
  }
  return false;
};

export const retentionSoakSessionLockPath = (
  statePath: string,
  sessionId: string,
): string => resolve(`${statePath}.${sessionId}.lock`);

export const retentionSoakSessionScopeSha256 = (sessionId: string): string =>
  `sha256:${createHash("sha256")
    .update(`retention-soak-session:${sessionId}`)
    .digest("hex")}`;

export const verifyRetentionSoakLock = async (
  options: Readonly<{
    statePath: string;
    sessionId: string;
    lockPath: string | undefined;
    sessionScopeSha256: string | undefined;
    platform?: NodeJS.Platform;
    execStatus?: RetentionSoakExecStatus;
    inheritedLockVerifier?: InheritedLockVerifier;
  }>,
): Promise<RetentionSoakLockProof> => {
  if ((options.platform ?? process.platform) === "win32")
    throw new Error("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
  const expectedPath = retentionSoakSessionLockPath(
    options.statePath,
    options.sessionId,
  );
  const expectedScope = retentionSoakSessionScopeSha256(options.sessionId);
  if (
    !options.lockPath ||
    resolve(options.lockPath) !== expectedPath ||
    options.sessionScopeSha256 !== expectedScope
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_CONTEXT_INVALID");
  let inherited = false;
  try {
    inherited = await (
      options.inheritedLockVerifier ?? hasInheritedLock
    )(expectedPath);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (!inherited) throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");
  let status: number;
  try {
    status = await (options.execStatus ?? execStatus)("flock", [
      "--nonblock",
      "--exclusive",
      expectedPath,
      "true",
    ]);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (status !== 1) throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
  return {
    verified: true,
    mechanism: "flock",
    sessionScopeSha256: expectedScope,
  };
};
