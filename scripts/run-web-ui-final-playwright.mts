import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION = 2 as const;
export const FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE = 3221226505;
export const FINAL_PLAYWRIGHT_RUN_ROOT_SEGMENTS = [
  "artifacts",
  "web-ui-final",
  "playwright-runs",
] as const;
export const FINAL_PLAYWRIGHT_API_URL = "http://127.0.0.1:3201" as const;

export type FinalPlaywrightMode = "dry-run" | "list" | "execute";
export type FinalPlaywrightTopologyId =
  "root-mixed" | "mocked-dev" | "production-web-plus-mocked-api";
type FinalPlaywrightStepKind = "list" | "build" | "test";
type FinalPlaywrightStepStatus = "planned" | "pass" | "failed" | "skipped";
type FinalPlaywrightRunStatus = "planned" | "pass" | "failed";

type CliArguments = Readonly<{
  help: boolean;
  mode: FinalPlaywrightMode;
  runDirectory: string | null;
  output: string | null;
}>;

export type FinalPlaywrightCommand = Readonly<{
  display: string[];
  executable: string;
  args: string[];
}>;

export type FinalPlaywrightPnpmInvocation = Readonly<{
  executable: string;
  prefix: string[];
  npmExecPath: string | null;
}>;

export type FinalPlaywrightStepPlan = Readonly<{
  id: string;
  topology: FinalPlaywrightTopologyId;
  kind: FinalPlaywrightStepKind;
  cwd: string;
  config: string | null;
  command: FinalPlaywrightCommand;
  environment: Readonly<{
    WORKMESH_PLAYWRIGHT_RUN_DIR: string;
    NEXT_PUBLIC_API_URL?: typeof FINAL_PLAYWRIGHT_API_URL;
  }>;
}>;

export type FinalPlaywrightStepAttempt = Readonly<{
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnErrorCode: string | null;
}>;

type FinalPlaywrightStepResult = FinalPlaywrightStepPlan &
  Readonly<{
    status: FinalPlaywrightStepStatus;
    startedAt: string | null;
    finishedAt: string | null;
    durationMs: number | null;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    spawnErrorCode: string | null;
    skippedReason: string | null;
    attempts: FinalPlaywrightStepAttempt[];
  }>;

type CleanupEntry = Readonly<{
  kind: "auth-directory" | "output-directory-scan" | "trace" | "video";
  path: string;
  existed: boolean;
  removed: boolean;
  errorCode: string | null;
}>;

export type FinalPlaywrightCleanupResult = Readonly<{
  status: "planned" | "pending" | "pass" | "failed";
  startedAfterAllChildren: boolean;
  declaredAuthDirectories: string[];
  declaredOutputDirectories: string[];
  entries: CleanupEntry[];
}>;

export type FinalPlaywrightRunResult = Readonly<{
  schemaVersion: typeof FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION;
  kind: "workmesh.web-ui-final-playwright-run";
  generatedAt: string;
  repositoryRoot: string;
  approvedRunRoot: string;
  runDirectory: string;
  mode: FinalPlaywrightMode;
  status: FinalPlaywrightRunStatus;
  steps: FinalPlaywrightStepResult[];
  cleanup: FinalPlaywrightCleanupResult;
}>;

type ChildExit = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  spawnErrorCode: string | null;
}>;

type RunDependencies = Readonly<{
  runChild?: (
    step: FinalPlaywrightStepPlan,
    env: NodeJS.ProcessEnv,
  ) => Promise<ChildExit>;
  now?: () => Date;
  platform?: NodeJS.Platform;
}>;

const TOPOLOGY_IDS: readonly FinalPlaywrightTopologyId[] = [
  "root-mixed",
  "mocked-dev",
  "production-web-plus-mocked-api",
];

const HELP = `Usage: pnpm exec tsx scripts/run-web-ui-final-playwright.mts --run-dir <absolute-path> [options]

Runs the final Playwright topologies serially with one per-run directory:
  root-mixed -> mocked-dev -> production-web-plus-mocked-api

The run directory must be a new direct child of:
  <repository>/artifacts/web-ui-final/playwright-runs

Options:
  --run-dir <path>  Absolute per-run directory. Defaults to WORKMESH_PLAYWRIGHT_RUN_DIR.
  --output <file>   Result JSON path. Defaults to <run-dir>/run-result.json.
  --list            List all three suites serially without starting their web servers.
  --dry-run         Print the execute command and cleanup plan without creating files or children.
  --help, -h        Show this help.

Execute mode lists and runs root-mixed, lists and runs mocked-dev, then lists,
builds with NEXT_PUBLIC_API_URL=${FINAL_PLAYWRIGHT_API_URL}, and runs the production Web plus mocked API suite.
Every child exit code/signal is recorded. A failed production build skips only the production test step.
On Windows, a test child that exits with 3221226505 (0xC0000409) without a signal or spawn error
is retried at most once; every attempt is retained in run-result.json and no other failure is retried.
After all started children finish and an interim ledger is written, cleanup removes only each topology's
declared .auth directory and trace.zip/video.webm files found below its declared output directory.
Screenshots, JSON, HTML reports, and artifacts/web-ui-final/evidence are retained.
`;

const requireValue = (
  values: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = values[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
};

export const parseFinalPlaywrightArguments = (
  values: readonly string[],
): CliArguments => {
  let help = false;
  let list = false;
  let dryRun = false;
  let runDirectory: string | null = null;
  let output: string | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      help = true;
      continue;
    }
    if (value === "--list") {
      list = true;
      continue;
    }
    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (value === "--run-dir") {
      runDirectory = requireValue(values, index, "--run-dir");
      index += 1;
      continue;
    }
    if (value === "--output") {
      output = requireValue(values, index, "--output");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value ?? "(missing)"}`);
  }

  if (list && dryRun)
    throw new Error("--list and --dry-run are mutually exclusive");
  return {
    help,
    mode: dryRun ? "dry-run" : list ? "list" : "execute",
    runDirectory,
    output,
  };
};

const normalizedForComparison = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

export const approvedFinalPlaywrightRunRoot = (
  repositoryRoot: string,
): string =>
  path.resolve(repositoryRoot, ...FINAL_PLAYWRIGHT_RUN_ROOT_SEGMENTS);

export const resolveFinalPlaywrightRunDirectory = (
  repositoryRoot: string,
  requested: string,
): string => {
  if (!path.isAbsolute(requested)) {
    throw new Error("WORKMESH_PLAYWRIGHT_RUN_DIR must be an absolute path");
  }

  const approvedRoot = approvedFinalPlaywrightRunRoot(repositoryRoot);
  const resolved = path.resolve(requested);
  if (
    normalizedForComparison(path.dirname(resolved)) !==
    normalizedForComparison(approvedRoot)
  ) {
    throw new Error(
      `WORKMESH_PLAYWRIGHT_RUN_DIR must be a direct child of ${approvedRoot}`,
    );
  }
  return resolved;
};

export const resolveFinalPlaywrightPnpmInvocation = (
  input: Readonly<{
    environment?: NodeJS.ProcessEnv;
    nodeExecutable?: string;
    platform?: NodeJS.Platform;
  }> = {},
): FinalPlaywrightPnpmInvocation => {
  const environment = input.environment ?? process.env;
  const nodeExecutable = input.nodeExecutable ?? process.execPath;
  const platform = input.platform ?? process.platform;
  const inheritedExecPath = environment.npm_execpath?.trim();
  const corepackRoot = environment.COREPACK_ROOT?.trim();
  const platformPath = platform === "win32" ? path.win32 : path.posix;
  const npmExecPath =
    inheritedExecPath ||
    (corepackRoot ? platformPath.join(corepackRoot, "dist", "pnpm.js") : null);

  if (npmExecPath) {
    return {
      executable: nodeExecutable,
      prefix: [npmExecPath],
      npmExecPath,
    };
  }
  return {
    executable: platform === "win32" ? "pnpm.cmd" : "pnpm",
    prefix: [],
    npmExecPath: null,
  };
};

const command = (
  args: readonly string[],
  pnpm: FinalPlaywrightPnpmInvocation,
): FinalPlaywrightCommand => {
  return {
    display: ["pnpm", ...args],
    executable: pnpm.executable,
    args: [...pnpm.prefix, ...args],
  };
};

export const createFinalPlaywrightStepPlan = (
  repositoryRoot: string,
  runDirectory: string,
  mode: FinalPlaywrightMode,
  pnpm: FinalPlaywrightPnpmInvocation = resolveFinalPlaywrightPnpmInvocation(),
): FinalPlaywrightStepPlan[] => {
  const root = path.resolve(repositoryRoot);
  const webRoot = path.join(root, "apps", "web");
  const steps: FinalPlaywrightStepPlan[] = [];
  const addPlaywrightSteps = (
    definition: Readonly<{
      topology: FinalPlaywrightTopologyId;
      cwd: string;
      config: string;
      production: boolean;
    }>,
  ): void => {
    const environment = definition.production
      ? ({
          WORKMESH_PLAYWRIGHT_RUN_DIR: runDirectory,
          NEXT_PUBLIC_API_URL: FINAL_PLAYWRIGHT_API_URL,
        } as const)
      : { WORKMESH_PLAYWRIGHT_RUN_DIR: runDirectory };
    steps.push({
      id: `${definition.topology}:list`,
      topology: definition.topology,
      kind: "list",
      cwd: definition.cwd,
      config: definition.config,
      command: command(
        ["exec", "playwright", "test", "--config", definition.config, "--list"],
        pnpm,
      ),
      environment,
    });
    if (mode === "list") return;

    if (definition.production) {
      steps.push({
        id: `${definition.topology}:build`,
        topology: definition.topology,
        kind: "build",
        cwd: root,
        config: null,
        command: command(["--filter", "@workmesh/web", "build"], pnpm),
        environment,
      });
    }
    steps.push({
      id: `${definition.topology}:test`,
      topology: definition.topology,
      kind: "test",
      cwd: definition.cwd,
      config: definition.config,
      command: command(
        ["exec", "playwright", "test", "--config", definition.config],
        pnpm,
      ),
      environment,
    });
  };

  addPlaywrightSteps({
    topology: "root-mixed",
    cwd: root,
    config: "playwright.config.ts",
    production: false,
  });
  addPlaywrightSteps({
    topology: "mocked-dev",
    cwd: webRoot,
    config: "playwright.mocked.config.ts",
    production: false,
  });
  addPlaywrightSteps({
    topology: "production-web-plus-mocked-api",
    cwd: webRoot,
    config: "playwright.production.config.ts",
    production: true,
  });
  return steps;
};

export const createFinalPlaywrightChildEnvironment = (
  baseEnvironment: NodeJS.ProcessEnv,
  step: FinalPlaywrightStepPlan,
  pnpm: FinalPlaywrightPnpmInvocation = resolveFinalPlaywrightPnpmInvocation(),
): NodeJS.ProcessEnv => ({
  ...baseEnvironment,
  ...step.environment,
  ...(pnpm.npmExecPath ? { npm_execpath: pnpm.npmExecPath } : {}),
});

const plannedStep = (
  step: FinalPlaywrightStepPlan,
): FinalPlaywrightStepResult => ({
  ...step,
  status: "planned",
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  exitCode: null,
  signal: null,
  spawnErrorCode: null,
  skippedReason: null,
  attempts: [],
});

const shouldRetryStep = (
  step: FinalPlaywrightStepPlan,
  childExit: ChildExit,
  platform: NodeJS.Platform,
): boolean =>
  platform === "win32" &&
  step.kind === "test" &&
  childExit.exitCode === FINAL_PLAYWRIGHT_NATIVE_STARTUP_RETRY_EXIT_CODE &&
  childExit.signal === null &&
  childExit.spawnErrorCode === null;

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
};

const runChildProcess = async (
  step: FinalPlaywrightStepPlan,
  env: NodeJS.ProcessEnv,
): Promise<ChildExit> =>
  new Promise((resolve) => {
    const child = spawn(step.command.executable, step.command.args, {
      cwd: step.cwd,
      env,
      shell:
        process.platform === "win32" &&
        step.command.executable.endsWith(".cmd"),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let spawnErrorCode: string | null = null;
    child.stdout?.pipe(process.stdout, { end: false });
    child.stderr?.pipe(process.stderr, { end: false });
    child.once("error", (error) => {
      spawnErrorCode = errorCode(error) ?? "CHILD_PROCESS_ERROR";
    });
    child.once("close", (exitCode, signal) => {
      resolve({ exitCode, signal, spawnErrorCode });
    });
  });

const cleanupPlan = (
  runDirectory: string,
  status: FinalPlaywrightCleanupResult["status"],
): FinalPlaywrightCleanupResult => ({
  status,
  startedAfterAllChildren: false,
  declaredAuthDirectories: TOPOLOGY_IDS.map((topology) =>
    path.join(runDirectory, topology, ".auth"),
  ),
  declaredOutputDirectories: TOPOLOGY_IDS.map((topology) =>
    path.join(runDirectory, topology, "output"),
  ),
  entries: [],
});

const collectTraceAndVideoFiles = async (
  directory: string,
): Promise<
  Readonly<{
    files: Array<{ kind: "trace" | "video"; path: string }>;
    errorCode: string | null;
  }>
> => {
  let directoryEntry;
  try {
    directoryEntry = await lstat(directory);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { files: [], errorCode: null };
    return { files: [], errorCode: errorCode(error) ?? "OUTPUT_SCAN_ERROR" };
  }
  if (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()) {
    return { files: [], errorCode: null };
  }
  const collected: Array<{ kind: "trace" | "video"; path: string }> = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await visit(target);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "trace.zip")
        collected.push({ kind: "trace", path: target });
      if (entry.name === "video.webm")
        collected.push({ kind: "video", path: target });
    }
  };
  try {
    await visit(directory);
    return { files: collected, errorCode: null };
  } catch (error) {
    return {
      files: collected,
      errorCode: errorCode(error) ?? "OUTPUT_SCAN_ERROR",
    };
  }
};

const removeCleanupTarget = async (
  kind: CleanupEntry["kind"],
  target: string,
  recursive: boolean,
): Promise<CleanupEntry> => {
  let existed;
  try {
    existed = await pathExists(target);
  } catch (error) {
    return {
      kind,
      path: target,
      existed: false,
      removed: false,
      errorCode: errorCode(error) ?? "CLEANUP_STAT_ERROR",
    };
  }
  if (!existed)
    return {
      kind,
      path: target,
      existed: false,
      removed: false,
      errorCode: null,
    };
  try {
    await rm(target, { recursive, force: true });
    return {
      kind,
      path: target,
      existed: true,
      removed: true,
      errorCode: null,
    };
  } catch (error) {
    return {
      kind,
      path: target,
      existed: true,
      removed: false,
      errorCode: errorCode(error) ?? "CLEANUP_ERROR",
    };
  }
};

export const cleanupFinalPlaywrightArtifacts = async (
  runDirectory: string,
): Promise<FinalPlaywrightCleanupResult> => {
  const declared = cleanupPlan(runDirectory, "pending");
  const entries: CleanupEntry[] = [];
  for (const authDirectory of declared.declaredAuthDirectories) {
    entries.push(
      await removeCleanupTarget("auth-directory", authDirectory, true),
    );
  }
  for (const outputDirectory of declared.declaredOutputDirectories) {
    const scan = await collectTraceAndVideoFiles(outputDirectory);
    if (scan.errorCode) {
      entries.push({
        kind: "output-directory-scan",
        path: outputDirectory,
        existed: true,
        removed: false,
        errorCode: scan.errorCode,
      });
    }
    for (const file of scan.files) {
      entries.push(await removeCleanupTarget(file.kind, file.path, false));
    }
  }
  return {
    ...declared,
    status: entries.every((entry) => entry.errorCode === null)
      ? "pass"
      : "failed",
    startedAfterAllChildren: true,
    entries,
  };
};

const writeResult = async (
  output: string,
  result: FinalPlaywrightRunResult,
): Promise<void> => {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
};

export const runFinalPlaywright = async (
  input: Readonly<{
    repositoryRoot: string;
    runDirectory: string;
    output: string;
    mode: FinalPlaywrightMode;
  }>,
  dependencies: RunDependencies = {},
): Promise<FinalPlaywrightRunResult> => {
  const now = dependencies.now ?? (() => new Date());
  const runChild = dependencies.runChild ?? runChildProcess;
  const platform = dependencies.platform ?? process.platform;
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const runDirectory = resolveFinalPlaywrightRunDirectory(
    repositoryRoot,
    input.runDirectory,
  );
  const approvedRunRoot = approvedFinalPlaywrightRunRoot(repositoryRoot);
  const pnpm = resolveFinalPlaywrightPnpmInvocation();
  const plans = createFinalPlaywrightStepPlan(
    repositoryRoot,
    runDirectory,
    input.mode,
    pnpm,
  );
  let steps = plans.map(plannedStep);
  let cleanup = cleanupPlan(
    runDirectory,
    input.mode === "dry-run" ? "planned" : "pending",
  );

  if (input.mode === "dry-run") {
    return {
      schemaVersion: FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION,
      kind: "workmesh.web-ui-final-playwright-run",
      generatedAt: now().toISOString(),
      repositoryRoot,
      approvedRunRoot,
      runDirectory,
      mode: input.mode,
      status: "planned",
      steps,
      cleanup,
    };
  }

  await mkdir(approvedRunRoot, { recursive: true });
  await mkdir(runDirectory);
  for (let index = 0; index < plans.length; index += 1) {
    const step = plans[index];
    if (!step) continue;
    const productionBuildFailed = steps.some(
      (result) =>
        result.topology === "production-web-plus-mocked-api" &&
        result.kind === "build" &&
        result.status === "failed",
    );
    if (
      productionBuildFailed &&
      step.topology === "production-web-plus-mocked-api" &&
      step.kind === "test"
    ) {
      steps[index] = {
        ...plannedStep(step),
        status: "skipped",
        skippedReason: "PRODUCTION_BUILD_FAILED",
      };
      continue;
    }

    const attempts: FinalPlaywrightStepAttempt[] = [];
    let childExit: ChildExit;
    for (let attempt = 1; ; attempt += 1) {
      const startedAt = now();
      process.stdout.write(
        `\n[${step.id}] ${step.command.display.join(" ")}` +
          (attempt > 1 ? ` (attempt ${attempt})` : "") +
          "\n",
      );
      childExit = await runChild(
        step,
        createFinalPlaywrightChildEnvironment(process.env, step, pnpm),
      );
      const finishedAt = now();
      attempts.push({
        attempt,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
        exitCode: childExit.exitCode,
        signal: childExit.signal,
        spawnErrorCode: childExit.spawnErrorCode,
      });
      if (attempt >= 2 || !shouldRetryStep(step, childExit, platform)) {
        break;
      }
    }
    const finalAttempt = attempts.at(-1);
    if (!finalAttempt) throw new Error(`No attempt recorded for ${step.id}`);
    steps[index] = {
      ...step,
      status:
        finalAttempt.exitCode === 0 &&
        finalAttempt.signal === null &&
        finalAttempt.spawnErrorCode === null
          ? "pass"
          : "failed",
      startedAt: finalAttempt.startedAt,
      finishedAt: finalAttempt.finishedAt,
      durationMs: finalAttempt.durationMs,
      exitCode: finalAttempt.exitCode,
      signal: finalAttempt.signal,
      spawnErrorCode: finalAttempt.spawnErrorCode,
      skippedReason: null,
      attempts,
    };
  }

  const resultBeforeCleanup: FinalPlaywrightRunResult = {
    schemaVersion: FINAL_PLAYWRIGHT_RUN_SCHEMA_VERSION,
    kind: "workmesh.web-ui-final-playwright-run",
    generatedAt: now().toISOString(),
    repositoryRoot,
    approvedRunRoot,
    runDirectory,
    mode: input.mode,
    status: steps.every((step) => step.status === "pass") ? "pass" : "failed",
    steps,
    cleanup,
  };
  await writeResult(input.output, resultBeforeCleanup);

  cleanup = await cleanupFinalPlaywrightArtifacts(runDirectory);
  const finalResult: FinalPlaywrightRunResult = {
    ...resultBeforeCleanup,
    generatedAt: now().toISOString(),
    status:
      resultBeforeCleanup.status === "pass" && cleanup.status === "pass"
        ? "pass"
        : "failed",
    cleanup,
  };
  await writeResult(input.output, finalResult);
  return finalResult;
};

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectExecution) {
  try {
    const args = parseFinalPlaywrightArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(HELP);
    } else {
      const repositoryRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
      );
      const requestedRunDirectory =
        args.runDirectory ?? process.env.WORKMESH_PLAYWRIGHT_RUN_DIR;
      if (!requestedRunDirectory) {
        throw new Error("--run-dir or WORKMESH_PLAYWRIGHT_RUN_DIR is required");
      }
      const runDirectory = resolveFinalPlaywrightRunDirectory(
        repositoryRoot,
        requestedRunDirectory,
      );
      const output = path.resolve(
        args.output ?? path.join(runDirectory, "run-result.json"),
      );
      const result = await runFinalPlaywright({
        repositoryRoot,
        runDirectory,
        output,
        mode: args.mode,
      });
      if (args.mode === "dry-run") {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(
          `\nFinal Playwright ${result.status}; result written to ${output}\n`,
        );
        if (result.status !== "pass") process.exitCode = 1;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Final Playwright runner failed: ${message}\n`);
    process.exitCode = 1;
  }
}
