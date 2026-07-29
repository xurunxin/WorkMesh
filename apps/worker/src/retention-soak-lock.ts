import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readlink } from "node:fs/promises";
import { resolve } from "node:path";

export type RetentionSoakLockProof = Readonly<{
  verified: true;
  mechanism: "flock";
  inheritedFd: number;
  sessionScopeSha256: string;
}>;

export type RetentionSoakExecStatus = (
  executable: string,
  args: readonly string[],
  inheritedFd?: number,
) => Promise<number>;

type InheritedFdTargetReader = (fd: number) => Promise<string>;

const execStatus: RetentionSoakExecStatus = async (
  executable,
  args,
  inheritedFd,
) =>
  await new Promise<number>((resolveStatus, reject) => {
    const stdio =
      inheritedFd === undefined
        ? "ignore"
        : Array.from({ length: inheritedFd + 1 }, (_value, index) =>
            index === inheritedFd ? inheritedFd : "ignore",
          );
    const child = spawn(executable, [...args], {
      stdio,
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal || code === null)
        reject(new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED"));
      else resolveStatus(code);
    });
  });

const inheritedFdTarget: InheritedFdTargetReader = async (fd) =>
  await readlink(`/proc/self/fd/${fd}`);

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
    lockFd: string | undefined;
    sessionScopeSha256: string | undefined;
    platform?: NodeJS.Platform;
    execStatus?: RetentionSoakExecStatus;
    inheritedFdTarget?: InheritedFdTargetReader;
  }>,
): Promise<RetentionSoakLockProof> => {
  if ((options.platform ?? process.platform) === "win32")
    throw new Error("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
  const expectedPath = retentionSoakSessionLockPath(
    options.statePath,
    options.sessionId,
  );
  const expectedScope = retentionSoakSessionScopeSha256(options.sessionId);
  const inheritedFd = Number(options.lockFd);
  if (
    !options.lockPath ||
    resolve(options.lockPath) !== expectedPath ||
    options.sessionScopeSha256 !== expectedScope ||
    !Number.isSafeInteger(inheritedFd) ||
    inheritedFd < 3
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_CONTEXT_INVALID");
  let inheritedTarget: string;
  try {
    inheritedTarget = await (
      options.inheritedFdTarget ?? inheritedFdTarget
    )(inheritedFd);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (
    resolve(inheritedTarget.replace(/ \(deleted\)$/, "")) !== expectedPath
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");
  let status: number;
  try {
    status = await (options.execStatus ?? execStatus)("flock", [
      "--nonblock",
      "--exclusive",
      String(inheritedFd),
    ], inheritedFd);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (status === 1) throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
  if (status !== 0) throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  return {
    verified: true,
    mechanism: "flock",
    inheritedFd,
    sessionScopeSha256: expectedScope,
  };
};
