import {
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createWorkerRuntimeIdentity,
  materializeWorkerRuntimeIdentity,
} from "./worker-runtime-identity.js";

describe("worker runtime identity", () => {
  it("generates one process identity bound to the configured build", () => {
    expect(
      createWorkerRuntimeIdentity(
        { WORKMESH_BUILD_SHA: "a".repeat(40) },
        {
          instanceId: () => "00000000-0000-4000-8000-000000000001",
          now: () => new Date("2026-07-29T00:00:00.000Z"),
        },
      ),
    ).toEqual({
      schemaVersion: 1,
      instanceId: "00000000-0000-4000-8000-000000000001",
      buildSha: "a".repeat(40),
      startedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(() =>
      createWorkerRuntimeIdentity({ WORKMESH_BUILD_SHA: "unsafe value" }),
    ).toThrow("WORKER_RUNTIME_BUILD_SHA_INVALID");
  });

  it("atomically materializes an owner-only container-readable identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-worker-identity-"));
    const path = join(directory, "identity.json");
    const identity = createWorkerRuntimeIdentity(
      { WORKMESH_BUILD_SHA: "b".repeat(40) },
      {
        instanceId: () => "00000000-0000-4000-8000-000000000002",
        now: () => new Date("2026-07-29T00:00:01.000Z"),
      },
    );
    try {
      await expect(
        materializeWorkerRuntimeIdentity({ path, identity }),
      ).resolves.toEqual(identity);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual(identity);
      if (process.platform !== "win32")
        expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(["open", "write", "sync", "close", "rename"] as const)(
    "preserves the %s failure and removes its temporary file",
    async (stage) => {
      const directory = await mkdtemp(
        join(tmpdir(), "workmesh-worker-identity-failure-"),
      );
      const path = join(directory, "identity.json");
      let closeCalls = 0;
      try {
        await expect(
          materializeWorkerRuntimeIdentity({
            path,
            env: { WORKMESH_BUILD_SHA: "c".repeat(40) },
            fileSystem: {
              open: async (temporaryPath, flags, mode) => {
                if (stage === "open") throw new Error("open failed");
                const file = await open(temporaryPath, flags, mode);
                return {
                  writeFile: async (...args) => {
                    if (stage === "write") throw new Error("write failed");
                    await file.writeFile(...args);
                  },
                  sync: async () => {
                    if (stage === "sync") throw new Error("sync failed");
                    await file.sync();
                  },
                  close: async () => {
                    closeCalls += 1;
                    await file.close();
                    if (stage === "close" && closeCalls === 1)
                      throw new Error("close failed");
                  },
                };
              },
              rename: async (temporaryPath, targetPath) => {
                if (stage === "rename") throw new Error("rename failed");
                await rename(temporaryPath, targetPath);
              },
            },
          }),
        ).rejects.toThrow(`${stage} failed`);
        if (stage === "open") expect(closeCalls).toBe(0);
        else expect(closeCalls).toBeGreaterThanOrEqual(1);
        expect(await readdir(directory)).toEqual([]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it("does not let a cleanup failure mask the original lifecycle failure", async () => {
    await expect(
      materializeWorkerRuntimeIdentity({
        path: join(tmpdir(), `workmesh-worker-identity-${Date.now()}.json`),
        env: { WORKMESH_BUILD_SHA: "d".repeat(40) },
        fileSystem: {
          open: async () => ({
            writeFile: async () => {
              throw new Error("write failed");
            },
            sync: async () => undefined,
            close: async () => {
              throw new Error("close cleanup failed");
            },
          }),
          rm: async () => {
            throw new Error("remove cleanup failed");
          },
        },
      }),
    ).rejects.toThrow("write failed");
  });
});
