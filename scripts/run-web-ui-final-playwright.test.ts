import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FINAL_PLAYWRIGHT_API_URL,
  FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
  FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION,
  approvedFinalPlaywrightRunRoot,
  cleanupFinalPlaywrightArtifacts,
  createFinalPlaywrightChildEnvironment,
  createFinalPlaywrightStepPlan,
  parseFinalPlaywrightArguments,
  resolveFinalPlaywrightPnpmInvocation,
  resolveFinalPlaywrightRunDirectory,
  runFinalPlaywright,
} from "./run-web-ui-final-playwright.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

const temporaryRepository = async (prefix: string): Promise<string> => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(repositoryRoot);
  return repositoryRoot;
};

describe("final Playwright runner arguments and plan", () => {
  it("supports help, list, dry-run, and the execute default without ambiguity", () => {
    expect(parseFinalPlaywrightArguments(["--help"])).toMatchObject({
      help: true,
    });
    expect(
      parseFinalPlaywrightArguments(["--run-dir", "C:\\runs\\one"]),
    ).toEqual({
      help: false,
      mode: "execute",
      runDirectory: "C:\\runs\\one",
      output: null,
    });
    expect(
      parseFinalPlaywrightArguments(["--list", "--run-dir", "C:\\runs\\one"]),
    ).toMatchObject({
      mode: "list",
    });
    expect(
      parseFinalPlaywrightArguments(["--dry-run", "--output", "result.json"]),
    ).toMatchObject({
      mode: "dry-run",
      output: "result.json",
    });
    expect(() =>
      parseFinalPlaywrightArguments(["--list", "--dry-run"]),
    ).toThrow("mutually exclusive");
    expect(() => parseFinalPlaywrightArguments(["--unknown"])).toThrow(
      "Unknown argument",
    );
  });

  it("accepts only an absolute direct child of the approved run root", () => {
    const repositoryRoot = path.resolve("C:\\repo");
    const approvedRoot = approvedFinalPlaywrightRunRoot(repositoryRoot);
    const runDirectory = path.join(approvedRoot, "run-2026-08-23-001");
    expect(
      resolveFinalPlaywrightRunDirectory(repositoryRoot, runDirectory),
    ).toBe(runDirectory);
    expect(() =>
      resolveFinalPlaywrightRunDirectory(repositoryRoot, "relative-run"),
    ).toThrow("absolute path");
    expect(() =>
      resolveFinalPlaywrightRunDirectory(repositoryRoot, approvedRoot),
    ).toThrow("direct child");
    expect(() =>
      resolveFinalPlaywrightRunDirectory(
        repositoryRoot,
        path.join(approvedRoot, "nested", "run"),
      ),
    ).toThrow("direct child");
  });

  it("keeps all commands serial and freezes the production build API URL", () => {
    const repositoryRoot = path.resolve("C:\\repo");
    const runDirectory = path.join(
      approvedFinalPlaywrightRunRoot(repositoryRoot),
      "run-1",
    );
    const execute = createFinalPlaywrightStepPlan(
      repositoryRoot,
      runDirectory,
      "execute",
    );
    expect(execute.map((step) => step.id)).toEqual([
      "root-mixed:list",
      "root-mixed:test",
      "mocked-dev:list",
      "mocked-dev:test",
      "production-web-plus-mocked-api:list",
      "production-web-plus-mocked-api:build",
      "production-web-plus-mocked-api:test",
    ]);
    expect(
      execute.every(
        (step) => step.environment.WORKMESH_PLAYWRIGHT_RUN_DIR === runDirectory,
      ),
    ).toBe(true);
    expect(
      execute
        .slice(-3)
        .every(
          (step) =>
            step.environment.NEXT_PUBLIC_API_URL === FINAL_PLAYWRIGHT_API_URL,
        ),
    ).toBe(true);

    const list = createFinalPlaywrightStepPlan(
      repositoryRoot,
      runDirectory,
      "list",
    );
    expect(list.map((step) => step.id)).toEqual([
      "root-mixed:list",
      "mocked-dev:list",
      "production-web-plus-mocked-api:list",
    ]);
  });

  it("recovers the Corepack pnpm CLI and explicitly passes npm_execpath to every child", () => {
    const corepackRoot = path.win32.join(
      "C:\\Program Files",
      "nodejs",
      "node_modules",
      "corepack",
    );
    const nodeExecutable = path.win32.join(
      "C:\\Program Files",
      "nodejs",
      "node.exe",
    );
    const invocation = resolveFinalPlaywrightPnpmInvocation({
      environment: { COREPACK_ROOT: corepackRoot },
      nodeExecutable,
      platform: "win32",
    });
    const expectedPnpmCli = path.win32.join(corepackRoot, "dist", "pnpm.js");

    expect(invocation).toEqual({
      executable: nodeExecutable,
      prefix: [expectedPnpmCli],
      npmExecPath: expectedPnpmCli,
    });

    const step = createFinalPlaywrightStepPlan(
      path.resolve("C:\\repo"),
      path.resolve(
        "C:\\repo",
        ...["artifacts", "web-ui-final", "playwright-runs", "run-1"],
      ),
      "list",
      invocation,
    )[0];
    expect(step).toBeDefined();
    if (!step) return;
    expect(step.command.executable).toBe(nodeExecutable);
    expect(step.command.args.slice(0, 3)).toEqual([
      expectedPnpmCli,
      "exec",
      "playwright",
    ]);

    const childEnvironment = createFinalPlaywrightChildEnvironment(
      { RUN_INTEGRATION: "1", npm_execpath: undefined },
      step,
      invocation,
    );
    expect(childEnvironment).toEqual({
      RUN_INTEGRATION: "1",
      npm_execpath: expectedPnpmCli,
      WORKMESH_PLAYWRIGHT_RUN_DIR: step.environment.WORKMESH_PLAYWRIGHT_RUN_DIR,
    });
  });

  it("prefers an existing npm_execpath over the Corepack fallback", () => {
    const npmExecPath = path.posix.join("/opt", "pnpm", "pnpm.cjs");
    expect(
      resolveFinalPlaywrightPnpmInvocation({
        environment: {
          COREPACK_ROOT: path.posix.join("/opt", "corepack"),
          npm_execpath: npmExecPath,
        },
        nodeExecutable: "/usr/bin/node",
        platform: "linux",
      }),
    ).toEqual({
      executable: "/usr/bin/node",
      prefix: [npmExecPath],
      npmExecPath,
    });
  });
});

describe("final Playwright deterministic cleanup", () => {
  it("keeps dry-run side-effect free while returning the complete execute plan", async () => {
    const repositoryRoot = await temporaryRepository(
      "workmesh-final-runner-dry-",
    );
    const runDirectory = path.join(
      approvedFinalPlaywrightRunRoot(repositoryRoot),
      "run-dry",
    );
    let children = 0;
    const result = await runFinalPlaywright(
      {
        repositoryRoot,
        runDirectory,
        output: path.join(runDirectory, "run-result.json"),
        mode: "dry-run",
      },
      {
        runChild: async () => {
          children += 1;
          return { exitCode: 0, signal: null, spawnErrorCode: null };
        },
      },
    );

    expect(result.status).toBe("planned");
    expect(result.steps).toHaveLength(7);
    expect(result.cleanup.status).toBe("planned");
    expect(children).toBe(0);
    await expect(access(runDirectory)).rejects.toThrow();
  });

  it("removes only declared auth and trace/video files while retaining evidence and diagnostics", async () => {
    const repositoryRoot = await temporaryRepository("workmesh-final-runner-");
    const approvedRoot = approvedFinalPlaywrightRunRoot(repositoryRoot);
    const runDirectory = path.join(approvedRoot, "run-cleanup");
    const rootOutput = path.join(
      runDirectory,
      "root-mixed",
      "output",
      "case-1",
    );
    const mockedOutput = path.join(
      runDirectory,
      "mocked-dev",
      "output",
      "case-2",
    );
    const outsideEvidence = path.join(
      repositoryRoot,
      "artifacts",
      "web-ui-final",
      "evidence",
    );
    await mkdir(path.join(runDirectory, "root-mixed", ".auth"), {
      recursive: true,
    });
    await mkdir(rootOutput, { recursive: true });
    await mkdir(mockedOutput, { recursive: true });
    await mkdir(outsideEvidence, { recursive: true });
    await writeFile(
      path.join(runDirectory, "root-mixed", ".auth", "admin.json"),
      "{}",
    );
    await writeFile(path.join(rootOutput, "trace.zip"), "trace");
    await writeFile(path.join(rootOutput, "video.webm"), "video");
    await writeFile(path.join(rootOutput, "screenshot.png"), "screenshot");
    await writeFile(path.join(mockedOutput, "geometry.json"), "{}");
    await writeFile(path.join(outsideEvidence, "trace.zip"), "stable evidence");

    const result = await cleanupFinalPlaywrightArtifacts(runDirectory);
    expect(result.status).toBe("pass");
    expect(result.startedAfterAllChildren).toBe(true);
    await expect(
      readFile(path.join(runDirectory, "root-mixed", ".auth", "admin.json")),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootOutput, "trace.zip")),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootOutput, "video.webm")),
    ).rejects.toThrow();
    await expect(
      readFile(path.join(rootOutput, "screenshot.png"), "utf8"),
    ).resolves.toBe("screenshot");
    await expect(
      readFile(path.join(mockedOutput, "geometry.json"), "utf8"),
    ).resolves.toBe("{}");
    await expect(
      readFile(path.join(outsideEvidence, "trace.zip"), "utf8"),
    ).resolves.toBe("stable evidence");
  });

  it("records every child exit, keeps later topologies running, and skips the test after a failed production build", async () => {
    const repositoryRoot = await temporaryRepository(
      "workmesh-final-runner-ledger-",
    );
    const runDirectory = path.join(
      approvedFinalPlaywrightRunRoot(repositoryRoot),
      "run-ledger",
    );
    const output = path.join(runDirectory, "run-result.json");
    const called: string[] = [];
    let clock = 0;
    const result = await runFinalPlaywright(
      {
        repositoryRoot,
        runDirectory,
        output,
        mode: "execute",
      },
      {
        now: () => new Date(Date.UTC(2026, 7, 23, 0, 0, clock++)),
        runChild: async (step) => {
          called.push(step.id);
          return step.kind === "build"
            ? { exitCode: 2, signal: null, spawnErrorCode: null }
            : { exitCode: 0, signal: null, spawnErrorCode: null };
        },
      },
    );

    expect(called).toEqual([
      "root-mixed:list",
      "root-mixed:test",
      "mocked-dev:list",
      "mocked-dev:test",
      "production-web-plus-mocked-api:list",
      "production-web-plus-mocked-api:build",
    ]);
    expect(result.status).toBe("failed");
    expect(result.steps.at(-2)).toMatchObject({
      status: "failed",
      exitCode: 2,
    });
    expect(result.steps.at(-1)).toMatchObject({
      status: "skipped",
      skippedReason: "PRODUCTION_BUILD_FAILED",
    });
    expect(result.cleanup).toMatchObject({
      status: "pass",
      startedAfterAllChildren: true,
    });
    const ledger = JSON.parse(await readFile(output, "utf8")) as {
      cleanup?: { status?: unknown };
    };
    expect(ledger.cleanup?.status).toBe("pass");
    await expect(
      runFinalPlaywright(
        {
          repositoryRoot,
          runDirectory,
          output,
          mode: "list",
        },
        {
          runChild: async () => ({
            exitCode: 0,
            signal: null,
            spawnErrorCode: null,
          }),
        },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("retries the bounded Windows native startup exit once and retains both attempts", async () => {
    const repositoryRoot = await temporaryRepository(
      "workmesh-final-runner-retry-",
    );
    const runDirectory = path.join(
      approvedFinalPlaywrightRunRoot(repositoryRoot),
      "run-retry",
    );
    const output = path.join(runDirectory, "run-result.json");
    let rootTestAttempts = 0;
    const result = await runFinalPlaywright(
      {
        repositoryRoot,
        runDirectory,
        output,
        mode: "execute",
      },
      {
        platform: "win32",
        runChild: async (step) => {
          if (step.id === "root-mixed:test" && rootTestAttempts++ === 0) {
            return {
              exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
              signal: null,
              spawnErrorCode: null,
            };
          }
          return { exitCode: 0, signal: null, spawnErrorCode: null };
        },
      },
    );

    const rootTest = result.steps.find((step) => step.id === "root-mixed:test");
    expect(rootTest).toMatchObject({
      status: "pass",
      attempts: [
        {
          attempt: 1,
          exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
          signal: null,
          spawnErrorCode: null,
        },
        { attempt: 2, exitCode: 0, signal: null, spawnErrorCode: null },
      ],
    });
    expect(rootTest?.attempts).toHaveLength(2);
    expect(rootTest?.startedAt).toBe(rootTest?.attempts[1]?.startedAt);
    expect(rootTest?.finishedAt).toBe(rootTest?.attempts[1]?.finishedAt);
    expect(rootTest?.durationMs).toBe(rootTest?.attempts[1]?.durationMs);
    expect(rootTest?.exitCode).toBe(0);
    expect(result.schemaVersion).toBe(FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION);

    const ledger = JSON.parse(await readFile(output, "utf8")) as {
      schemaVersion?: unknown;
      steps?: Array<{
        id?: string;
        attempts?: Array<{
          attempt?: number;
          startedAt?: string;
          finishedAt?: string;
          durationMs?: number;
          exitCode?: number | null;
          signal?: string | null;
          spawnErrorCode?: string | null;
        }>;
      }>;
    };
    const ledgerRootTest = ledger.steps?.find(
      (step) => step.id === "root-mixed:test",
    );
    expect(ledger.schemaVersion).toBe(FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION);
    expect(ledgerRootTest?.attempts).toHaveLength(2);
    expect(
      ledgerRootTest?.attempts?.every((attempt) =>
        Boolean(
          attempt.startedAt &&
          attempt.finishedAt &&
          typeof attempt.durationMs === "number" &&
          typeof attempt.exitCode === "number" &&
          attempt.signal === null &&
          attempt.spawnErrorCode === null,
        ),
      ),
    ).toBe(true);
  });

  it("does not retry other platforms, step kinds, exit results, signals, or spawn errors", async () => {
    const scenarios = [
      {
        name: "other-platform",
        platform: "linux" as const,
        stepId: "root-mixed:test",
        exit: {
          exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
          signal: null,
          spawnErrorCode: null,
        },
      },
      {
        name: "build-step",
        platform: "win32" as const,
        stepId: "production-web-plus-mocked-api:build",
        exit: {
          exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
          signal: null,
          spawnErrorCode: null,
        },
      },
      {
        name: "signal",
        platform: "win32" as const,
        stepId: "root-mixed:test",
        exit: {
          exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
          signal: "SIGTERM" as NodeJS.Signals,
          spawnErrorCode: null,
        },
      },
      {
        name: "spawn-error",
        platform: "win32" as const,
        stepId: "root-mixed:test",
        exit: {
          exitCode: FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE,
          signal: null,
          spawnErrorCode: "EACCES",
        },
      },
      {
        name: "other-exit",
        platform: "win32" as const,
        stepId: "root-mixed:test",
        exit: { exitCode: 1, signal: null, spawnErrorCode: null },
      },
    ] as const;

    for (const scenario of scenarios) {
      const repositoryRoot = await temporaryRepository(
        `workmesh-final-runner-no-retry-${scenario.name}-`,
      );
      const runDirectory = path.join(
        approvedFinalPlaywrightRunRoot(repositoryRoot),
        "run-no-retry",
      );
      const calls: string[] = [];
      const result = await runFinalPlaywright(
        {
          repositoryRoot,
          runDirectory,
          output: path.join(runDirectory, "run-result.json"),
          mode: "execute",
        },
        {
          platform: scenario.platform,
          runChild: async (step) => {
            calls.push(step.id);
            return step.id === scenario.stepId
              ? scenario.exit
              : { exitCode: 0, signal: null, spawnErrorCode: null };
          },
        },
      );

      expect(calls.filter((id) => id === scenario.stepId)).toHaveLength(1);
      const step = result.steps.find((item) => item.id === scenario.stepId);
      expect(step?.attempts).toHaveLength(1);
      expect(step?.exitCode).toBe(scenario.exit.exitCode);
    }
  });
});
