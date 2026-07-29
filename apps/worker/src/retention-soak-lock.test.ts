import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, open, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  retentionSoakSessionLockPath,
  retentionSoakSessionScopeSha256,
  verifyRetentionSoakLock,
} from "./retention-soak-lock.js";

const lockedFdInfo =
  "pos:\t0\nflags:\t0102001\nlock:\t1: FLOCK  ADVISORY  WRITE 123 00:01:42 0 EOF\n";

const regularStat = (
  overrides: Partial<{
    dev: number;
    ino: number;
    uid: number;
    mode: number;
    file: boolean;
    symlink: boolean;
  }> = {},
) => ({
  dev: overrides.dev ?? 1,
  ino: overrides.ino ?? 42,
  uid: overrides.uid ?? 1000,
  mode: overrides.mode ?? 0o100600,
  isFile: () => overrides.file ?? true,
  isSymbolicLink: () => overrides.symlink ?? false,
});

describe("retention soak formal lock", () => {
  const sessionId = "00000000-0000-4000-8000-000000000001";
  const statePath = "/private/retention/session.json";
  const lockPath = retentionSoakSessionLockPath(statePath, sessionId);
  const sessionScopeSha256 = retentionSoakSessionScopeSha256(sessionId);
  const lockFd = "9";
  const validProofInput = {
    statePath,
    sessionId,
    lockPath,
    lockFd,
    sessionScopeSha256,
    platform: "linux" as const,
    inheritedFdTarget: vi.fn().mockResolvedValue(lockPath),
    pathStat: vi.fn().mockResolvedValue(regularStat()),
    fdStat: vi.fn().mockResolvedValue(regularStat()),
    fdInfo: vi.fn().mockResolvedValue(lockedFdInfo),
    currentUid: () => 1000,
  };

  it("proves the inherited FD lock without ever flocking that FD", async () => {
    const execStatus = vi.fn().mockResolvedValue(73);
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        execStatus,
      }),
    ).resolves.toEqual({
      verified: true,
      mechanism: "flock",
      inheritedFd: 9,
      sessionScopeSha256,
      fdinfoLockMatched: true,
      independentContentionObserved: true,
    });
    expect(execStatus).toHaveBeenCalledWith("flock", [
      "-n",
      "-x",
      "-E",
      "73",
      lockPath,
      "-c",
      ":",
    ]);
    expect(execStatus.mock.calls.flat()).not.toContain(lockFd);
  });

  it("rejects an expected but unlocked FD before the independent probe", async () => {
    const execStatus = vi.fn().mockResolvedValue(73);
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        fdInfo: vi.fn().mockResolvedValue("pos:\t0\n"),
        execStatus,
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
    expect(execStatus).not.toHaveBeenCalled();
  });

  it("requires independent contention on the expected path", async () => {
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        execStatus: vi.fn().mockResolvedValue(0),
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        execStatus: vi.fn().mockResolvedValue(74),
      }),
    ).rejects.toThrow("RETENTION_SOAK_FLOCK_PROBE_FAILED");
  });

  it.each([
    [
      "wrong inode",
      { fdStat: vi.fn().mockResolvedValue(regularStat({ ino: 43 })) },
      "RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED",
    ],
    [
      "symlink",
      { pathStat: vi.fn().mockResolvedValue(regularStat({ symlink: true })) },
      "RETENTION_SOAK_SESSION_LOCK_PATH_INVALID",
    ],
    [
      "non-regular path",
      { pathStat: vi.fn().mockResolvedValue(regularStat({ file: false })) },
      "RETENTION_SOAK_SESSION_LOCK_PATH_INVALID",
    ],
    [
      "wrong mode",
      { pathStat: vi.fn().mockResolvedValue(regularStat({ mode: 0o100640 })) },
      "RETENTION_SOAK_SESSION_LOCK_MODE_INVALID",
    ],
    [
      "wrong owner",
      { pathStat: vi.fn().mockResolvedValue(regularStat({ uid: 1001 })) },
      "RETENTION_SOAK_SESSION_LOCK_OWNER_INVALID",
    ],
  ])("rejects %s", async (_name, overrides, code) => {
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        ...overrides,
        execStatus: vi.fn().mockResolvedValue(73),
      }),
    ).rejects.toThrow(code);
  });

  it("rejects unavailable fdinfo, bad context, and native Windows", async () => {
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        fdInfo: vi.fn().mockRejectedValue(new Error("procfs unavailable")),
      }),
    ).rejects.toThrow("RETENTION_SOAK_FDINFO_UNAVAILABLE");
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        sessionScopeSha256: `sha256:${"0".repeat(64)}`,
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_CONTEXT_INVALID");
    await expect(
      verifyRetentionSoakLock({
        ...validProofInput,
        platform: "win32",
      }),
    ).rejects.toThrow("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
  });

  it.runIf(process.platform === "linux")(
    "passes a wrapper prelock across exec and rejects unlocked, unrelated, symlink, mode, and inode cases",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-lock-"));
      const realStatePath = join(directory, "session.json");
      const realLockPath = retentionSoakSessionLockPath(
        realStatePath,
        sessionId,
      );
      const legitimate = await open(realLockPath, "a", 0o600);
      await chmod(realLockPath, 0o600);
      const unrelated = await open(realLockPath, "a", 0o600);
      const holder = spawn(
        "/bin/sh",
        [
          "-c",
          "flock --nonblock --exclusive 3 || exit 74; printf ready; exec sleep 30",
        ],
        {
          stdio: ["ignore", "pipe", "inherit", legitimate.fd],
        },
      );
      const handles = [legitimate, unrelated];
      try {
        const [ready] = (await once(holder.stdout!, "data")) as [Buffer];
        expect(ready.toString()).toBe("ready");
        await expect(
          verifyRetentionSoakLock({
            statePath: realStatePath,
            sessionId,
            lockPath: realLockPath,
            lockFd: String(legitimate.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).resolves.toMatchObject({
          verified: true,
          inheritedFd: legitimate.fd,
          fdinfoLockMatched: true,
          independentContentionObserved: true,
        });
        await expect(
          verifyRetentionSoakLock({
            statePath: realStatePath,
            sessionId,
            lockPath: realLockPath,
            lockFd: String(unrelated.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");

        const unlockedState = join(directory, "unlocked.json");
        const unlockedPath = retentionSoakSessionLockPath(
          unlockedState,
          sessionId,
        );
        const unlocked = await open(unlockedPath, "a", 0o600);
        handles.push(unlocked);
        await expect(
          verifyRetentionSoakLock({
            statePath: unlockedState,
            sessionId,
            lockPath: unlockedPath,
            lockFd: String(unlocked.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");

        const wrongInodePath = join(directory, "wrong-inode.lock");
        const wrongInode = await open(wrongInodePath, "a", 0o600);
        handles.push(wrongInode);
        await expect(
          verifyRetentionSoakLock({
            statePath: realStatePath,
            sessionId,
            lockPath: realLockPath,
            lockFd: String(wrongInode.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");

        const modeState = join(directory, "mode.json");
        const modePath = retentionSoakSessionLockPath(modeState, sessionId);
        const modeHandle = await open(modePath, "a", 0o600);
        handles.push(modeHandle);
        await chmod(modePath, 0o640);
        await expect(
          verifyRetentionSoakLock({
            statePath: modeState,
            sessionId,
            lockPath: modePath,
            lockFd: String(modeHandle.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_MODE_INVALID");

        const symlinkState = join(directory, "symlink.json");
        const symlinkPath = retentionSoakSessionLockPath(
          symlinkState,
          sessionId,
        );
        const symlinkTarget = join(directory, "symlink-target.lock");
        await writeFile(symlinkTarget, "");
        await chmod(symlinkTarget, 0o600);
        await symlink(symlinkTarget, symlinkPath);
        const symlinkHandle = await open(symlinkPath, "r");
        handles.push(symlinkHandle);
        await expect(
          verifyRetentionSoakLock({
            statePath: symlinkState,
            sessionId,
            lockPath: symlinkPath,
            lockFd: String(symlinkHandle.fd),
            sessionScopeSha256,
            platform: "linux",
          }),
        ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_PATH_INVALID");
      } finally {
        holder.kill();
        await Promise.race([
          once(holder, "exit"),
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
        for (const handle of handles) await handle.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
