import { spawn } from "node:child_process";
import { once } from "node:events";
import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  retentionSoakSessionLockPath,
  retentionSoakSessionScopeSha256,
  verifyRetentionSoakLock,
} from "./retention-soak-lock.js";

describe("retention soak formal lock", () => {
  const sessionId = "00000000-0000-4000-8000-000000000001";
  const statePath = "/private/retention/session.json";
  const lockPath = retentionSoakSessionLockPath(statePath, sessionId);
  const sessionScopeSha256 = retentionSoakSessionScopeSha256(sessionId);
  const lockFd = "9";

  it("requires the expected Session-scoped flock to already be held", async () => {
    const execStatus = vi.fn().mockResolvedValue(0);
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        lockFd,
        sessionScopeSha256,
        platform: "linux",
        execStatus,
        inheritedFdTarget: vi.fn().mockResolvedValue(lockPath),
      }),
    ).resolves.toEqual({
      verified: true,
      mechanism: "flock",
      inheritedFd: 9,
      sessionScopeSha256,
    });
    expect(execStatus).toHaveBeenCalledWith("flock", [
      "--nonblock",
      "--exclusive",
      lockFd,
    ], 9);
  });

  it("rejects direct invocation, a wrong scope, and native Windows", async () => {
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        lockFd,
        sessionScopeSha256,
        platform: "linux",
        execStatus: vi.fn().mockResolvedValue(1),
        inheritedFdTarget: vi.fn().mockResolvedValue(lockPath),
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        lockFd,
        sessionScopeSha256: `sha256:${"0".repeat(64)}`,
        platform: "linux",
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_CONTEXT_INVALID");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        lockFd,
        sessionScopeSha256,
        platform: "win32",
      }),
    ).rejects.toThrow("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        lockFd,
        sessionScopeSha256,
        platform: "linux",
        inheritedFdTarget: vi.fn().mockResolvedValue("/private/other.lock"),
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");
  });

  it.runIf(process.platform !== "win32")(
    "verifies the inherited open-file-description and rejects an unrelated FD for the same path",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-lock-"));
      const realStatePath = join(directory, "session.json");
      const realLockPath = retentionSoakSessionLockPath(
        realStatePath,
        sessionId,
      );
      const legitimate = await open(realLockPath, "a", 0o600);
      const unrelated = await open(realLockPath, "a", 0o600);
      const holder = spawn(
        "/bin/sh",
        ["-c", "flock --nonblock --exclusive 3 || exit 74; printf ready; sleep 30"],
        {
          stdio: ["ignore", "pipe", "inherit", legitimate.fd],
        },
      );
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
      } finally {
        holder.kill();
        await Promise.race([
          once(holder, "exit"),
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
        await legitimate.close();
        await unrelated.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
