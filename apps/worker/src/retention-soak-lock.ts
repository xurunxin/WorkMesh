import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fstat } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

export type RetentionSoakLockProof = Readonly<{
  verified: true;
  mechanism: "flock";
  inheritedFd: number;
  sessionScopeSha256: string;
  fdinfoLockMatched: true;
  independentContentionObserved: true;
}>;

export type RetentionSoakExecStatus = (
  executable: string,
  args: readonly string[],
) => Promise<number>;

type InheritedFdTargetReader = (fd: number) => Promise<string>;
type LockFileStat = Readonly<{
  dev: number | bigint;
  ino: number | bigint;
  uid: number;
  mode: number;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
}>;
type LockPathStatReader = (path: string) => Promise<LockFileStat>;
type LockFdStatReader = (fd: number) => Promise<LockFileStat>;
type FdInfoReader = (fd: number) => Promise<string>;

const execStatus: RetentionSoakExecStatus = async (
  executable,
  args,
) =>
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

const inheritedFdTarget: InheritedFdTargetReader = async (fd) =>
  await readlink(`/proc/self/fd/${fd}`);
const pathStat: LockPathStatReader = async (path) => await lstat(path);
const fdStat = promisify(fstat) as LockFdStatReader;
const fdInfo: FdInfoReader = async (fd) =>
  await readFile(`/proc/self/fdinfo/${fd}`, "utf8");

const sameFile = (left: LockFileStat, right: LockFileStat): boolean =>
  String(left.dev) === String(right.dev) &&
  String(left.ino) === String(right.ino);

const hasWholeFileExclusiveFlock = (value: string): boolean =>
  /^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s+\d+\s+\S+\s+0\s+EOF\s*$/m.test(
    value,
  );

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
    pathStat?: LockPathStatReader;
    fdStat?: LockFdStatReader;
    fdInfo?: FdInfoReader;
    currentUid?: () => number | undefined;
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
  const readPathStat = options.pathStat ?? pathStat;
  const readFdStat = options.fdStat ?? fdStat;
  let before: LockFileStat;
  let inherited: LockFileStat;
  let after: LockFileStat;
  try {
    before = await readPathStat(expectedPath);
    inherited = await readFdStat(inheritedFd);
    after = await readPathStat(expectedPath);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    !after.isFile() ||
    after.isSymbolicLink()
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_PATH_INVALID");
  const currentUid = (options.currentUid ?? process.getuid)?.();
  if (
    currentUid === undefined ||
    before.uid !== currentUid ||
    after.uid !== currentUid ||
    inherited.uid !== currentUid
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_OWNER_INVALID");
  if (
    (before.mode & 0o777) !== 0o600 ||
    (after.mode & 0o777) !== 0o600 ||
    (inherited.mode & 0o777) !== 0o600
  )
    throw new Error("RETENTION_SOAK_SESSION_LOCK_MODE_INVALID");
  if (!sameFile(before, inherited) || !sameFile(before, after))
    throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");
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
  let inheritedFdInfo: string;
  try {
    inheritedFdInfo = await (options.fdInfo ?? fdInfo)(inheritedFd);
  } catch {
    throw new Error("RETENTION_SOAK_FDINFO_UNAVAILABLE");
  }
  if (!hasWholeFileExclusiveFlock(inheritedFdInfo))
    throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
  let status: number;
  try {
    status = await (options.execStatus ?? execStatus)("flock", [
      "-n",
      "-x",
      "-E",
      "73",
      expectedPath,
      "-c",
      ":",
    ]);
  } catch {
    throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  }
  if (status === 0) throw new Error("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
  if (status !== 73) throw new Error("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  return {
    verified: true,
    mechanism: "flock",
    inheritedFd,
    sessionScopeSha256: expectedScope,
    fdinfoLockMatched: true,
    independentContentionObserved: true,
  };
};
