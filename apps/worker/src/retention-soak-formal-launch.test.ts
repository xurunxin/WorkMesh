import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import {
  chmod,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createRetentionSoakFormalLaunchSpec,
  RETENTION_SOAK_FORMAL_LOCK_COMMAND,
  RETENTION_SOAK_FORMAL_LOCK_FD,
} from "./retention-soak-formal-launch.js";
import {
  retentionSoakSessionLockPath,
  retentionSoakSessionScopeSha256,
} from "./retention-soak-lock.js";

describe("retention soak formal launch", () => {
  it("executes the harness through the current Node process and maps the lock to FD 3", () => {
    const launch = createRetentionSoakFormalLaunchSpec({
      childEnv: { EXAMPLE: "value" },
      harness: "/private/retention-soak.mts",
      harnessArguments: ["--dry-run"],
      lockFileFd: 17,
      nodeExecutable: "/runtime/node",
      tsxRegistration: "file:///runtime/tsx-loader.mjs",
    });

    expect(launch.executable).toBe("/bin/sh");
    expect(launch.args).toEqual([
      "-c",
      RETENTION_SOAK_FORMAL_LOCK_COMMAND,
      "retention-soak-lock",
      "/runtime/node",
      "--import",
      "file:///runtime/tsx-loader.mjs",
      "/private/retention-soak.mts",
      "--dry-run",
    ]);
    expect(launch.args.join(" ")).not.toContain("node_modules/.bin/tsx");
    expect(launch.options.env).toMatchObject({
      EXAMPLE: "value",
      WORKMESH_RETENTION_SOAK_LOCK_FD: String(RETENTION_SOAK_FORMAL_LOCK_FD),
    });
    expect(launch.options.stdio).toEqual(["inherit", "inherit", "inherit", 17]);
  });

  it.runIf(process.platform === "linux")(
    "preserves the private prelocked FD through Node and the tsx registration loader",
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), "workmesh-soak-formal-launch-"),
      );
      await chmod(directory, 0o700);
      const statePath = join(directory, "session.json");
      const sessionId = "00000000-0000-4000-8000-000000000019";
      const lockPath = retentionSoakSessionLockPath(statePath, sessionId);
      const outputPath = join(directory, "proof.json");
      const harnessPath = join(directory, "lock-proof.mts");
      const lockFile = await open(lockPath, "wx", 0o600);
      await lockFile.chmod(0o600);
      const lockModuleUrl = new URL("./retention-soak-lock.ts", import.meta.url)
        .href;
      await writeFile(
        harnessPath,
        `
import { fstatSync } from "node:fs";
import { lstat, writeFile } from "node:fs/promises";
import { verifyRetentionSoakLock } from ${JSON.stringify(lockModuleUrl)};

const inheritedFd = Number(process.env.WORKMESH_RETENTION_SOAK_LOCK_FD);
const pathStat = await lstat(process.env.WORKMESH_RETENTION_SOAK_LOCK_PATH);
const fdStat = fstatSync(inheritedFd);
const proof = await verifyRetentionSoakLock({
  statePath: process.env.WORKMESH_TEST_STATE_PATH,
  sessionId: process.env.WORKMESH_TEST_SESSION_ID,
  lockPath: process.env.WORKMESH_RETENTION_SOAK_LOCK_PATH,
  lockFd: process.env.WORKMESH_RETENTION_SOAK_LOCK_FD,
  sessionScopeSha256: process.env.WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256,
});
await writeFile(process.env.WORKMESH_TEST_OUTPUT_PATH, JSON.stringify({
  proof,
  currentUid: process.getuid?.(),
  pathUid: pathStat.uid,
  fdUid: fdStat.uid,
  sameFile:
    String(pathStat.dev) === String(fdStat.dev) &&
    String(pathStat.ino) === String(fdStat.ino),
}));
`,
        { encoding: "utf8", mode: 0o600 },
      );
      const launch = createRetentionSoakFormalLaunchSpec({
        childEnv: {
          ...process.env,
          WORKMESH_RETENTION_SOAK_LOCK_PATH: lockPath,
          WORKMESH_RETENTION_SOAK_LOCK_SCOPE_SHA256:
            retentionSoakSessionScopeSha256(sessionId),
          WORKMESH_TEST_OUTPUT_PATH: outputPath,
          WORKMESH_TEST_SESSION_ID: sessionId,
          WORKMESH_TEST_STATE_PATH: statePath,
        },
        harness: harnessPath,
        harnessArguments: [],
        lockFileFd: lockFile.fd,
        tsxRegistration: pathToFileURL(
          createRequire(import.meta.url).resolve("tsx"),
        ).href,
      });

      try {
        const child = spawn(
          launch.executable,
          [...launch.args],
          launch.options,
        );
        const [code, signal] = (await once(child, "exit")) as [
          number | null,
          NodeJS.Signals | null,
        ];
        expect({ code, signal }).toEqual({ code: 0, signal: null });
        const observed = JSON.parse(await readFile(outputPath, "utf8")) as {
          proof: {
            verified: boolean;
            inheritedFd: number;
            fdinfoLockMatched: boolean;
            independentContentionObserved: boolean;
          };
          currentUid: number;
          pathUid: number;
          fdUid: number;
          sameFile: boolean;
        };
        expect(observed).toMatchObject({
          proof: {
            verified: true,
            inheritedFd: RETENTION_SOAK_FORMAL_LOCK_FD,
            fdinfoLockMatched: true,
            independentContentionObserved: true,
          },
          currentUid: process.getuid?.(),
          pathUid: process.getuid?.(),
          fdUid: process.getuid?.(),
          sameFile: true,
        });
      } finally {
        await lockFile.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
