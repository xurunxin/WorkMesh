import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
});
