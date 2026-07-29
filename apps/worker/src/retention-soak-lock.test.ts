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

  it("requires the expected Session-scoped flock to already be held", async () => {
    const execStatus = vi.fn().mockResolvedValue(1);
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        sessionScopeSha256,
        platform: "linux",
        execStatus,
        inheritedLockVerifier: vi.fn().mockResolvedValue(true),
      }),
    ).resolves.toEqual({
      verified: true,
      mechanism: "flock",
      sessionScopeSha256,
    });
    expect(execStatus).toHaveBeenCalledWith("flock", [
      "--nonblock",
      "--exclusive",
      lockPath,
      "true",
    ]);
  });

  it("rejects direct invocation, a wrong scope, and native Windows", async () => {
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        sessionScopeSha256,
        platform: "linux",
        execStatus: vi.fn().mockResolvedValue(0),
        inheritedLockVerifier: vi.fn().mockResolvedValue(true),
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_HELD");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        sessionScopeSha256: `sha256:${"0".repeat(64)}`,
        platform: "linux",
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_CONTEXT_INVALID");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        sessionScopeSha256,
        platform: "win32",
      }),
    ).rejects.toThrow("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
    await expect(
      verifyRetentionSoakLock({
        statePath,
        sessionId,
        lockPath,
        sessionScopeSha256,
        platform: "linux",
        inheritedLockVerifier: vi.fn().mockResolvedValue(false),
      }),
    ).rejects.toThrow("RETENTION_SOAK_SESSION_LOCK_NOT_INHERITED");
  });
});
