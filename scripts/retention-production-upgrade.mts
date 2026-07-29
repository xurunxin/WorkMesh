import process from "node:process";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

type CommandResult = Pick<
  SpawnSyncReturns<string>,
  "status" | "signal" | "stdout" | "stderr" | "error"
>;

export type RetentionUpgradeCommandRunner = (
  command: string,
  arguments_: readonly string[],
) => CommandResult;

export class RetentionProductionUpgradeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "RetentionProductionUpgradeError";
    this.code = code;
  }
}

const applicationImages = {
  api: "WORKMESH_API_IMAGE",
  worker: "WORKMESH_WORKER_IMAGE",
  mcp: "WORKMESH_MCP_IMAGE",
  web: "WORKMESH_WEB_IMAGE",
} as const;

type Role = keyof typeof applicationImages;
const coreApplicationRoles = ["api", "worker", "web"] as const;
type CoreApplicationRole = (typeof coreApplicationRoles)[number];
type ImageInspection = Readonly<{
  id: string;
  revision: string;
  reference: string;
}>;
type FrozenTopology = Readonly<{
  mcpEnabled: boolean;
  applicationServices: readonly Role[];
}>;

const productionUpgradePlan = [
  "freeze the current optional-service topology and validate its target image digests, OCI revisions, and configuration",
  "disable the old Worker restart policy and require a clean 35-second stop",
  "prove no Worker container is running or restarting",
  "run the read-only target-Worker retention barrier against schema 29",
  "run migration 0030 from the target API image and verify one ledger row",
  "force-recreate only the target Worker and verify its runtime build heartbeat",
  "force-recreate only the remaining same-SHA services in the frozen topology",
] as const;

const checked = (
  runner: RetentionUpgradeCommandRunner,
  arguments_: readonly string[],
  code: string,
): string => {
  const result = runner("docker", arguments_);
  if (
    result.error ||
    result.signal ||
    result.status === null ||
    result.status !== 0
  )
    throw new RetentionProductionUpgradeError(code);
  return result.stdout.trim();
};

const parseJson = <Value,>(value: string, code: string): Value => {
  try {
    return JSON.parse(value) as Value;
  } catch {
    throw new RetentionProductionUpgradeError(code);
  }
};

const exactDigest = (value: string | undefined, role: Role): string => {
  const reference = value?.trim();
  if (
    !reference ||
    !new RegExp(
      `^ghcr\\.io/[a-z0-9][a-z0-9._/-]*/workmesh-${role}@sha256:[0-9a-f]{64}$`,
    ).test(reference)
  )
    throw new RetentionProductionUpgradeError(
      `RETENTION_UPGRADE_${role.toUpperCase()}_DIGEST_REQUIRED`,
    );
  return reference;
};

const inspectImage = (
  runner: RetentionUpgradeCommandRunner,
  role: Role,
  reference: string,
  buildSha: string,
): ImageInspection => {
  const rows = parseJson<
    Array<{
      Id?: string;
      RepoDigests?: string[];
      Config?: { Labels?: Record<string, string> };
    }>
  >(
    checked(
      runner,
      ["image", "inspect", reference],
      `RETENTION_UPGRADE_${role.toUpperCase()}_IMAGE_INSPECT_FAILED`,
    ),
    `RETENTION_UPGRADE_${role.toUpperCase()}_IMAGE_INSPECTION_INVALID`,
  );
  const image = rows[0];
  const digest = reference.slice(reference.indexOf("@sha256:"));
  if (
    !image?.Id ||
    !image.RepoDigests?.some((candidate) => candidate.endsWith(digest)) ||
    image.Config?.Labels?.["org.opencontainers.image.revision"] !== buildSha
  )
    throw new RetentionProductionUpgradeError(
      `RETENTION_UPGRADE_${role.toUpperCase()}_IMAGE_PROVENANCE_MISMATCH`,
    );
  return {
    id: image.Id,
    revision: buildSha,
    reference,
  };
};

const inspectContainer = (
  runner: RetentionUpgradeCommandRunner,
  id: string,
  code: string,
) => {
  const rows = parseJson<
    Array<{
      Image?: string;
      Config?: {
        Image?: string;
        Labels?: Record<string, string>;
      };
      State?: {
        Running?: boolean;
        Restarting?: boolean;
        ExitCode?: number;
      };
    }>
  >(checked(runner, ["inspect", id], code), `${code}_INVALID`);
  if (!rows[0]) throw new RetentionProductionUpgradeError(`${code}_INVALID`);
  return rows[0];
};

const composeArguments = (root: string, envFile: string): readonly string[] => [
  "compose",
  "--env-file",
  envFile,
  "-f",
  path.join(root, "docker-compose.production.yml"),
];

const composeArgumentsForTopology = (
  composeBase: readonly string[],
  topology: FrozenTopology,
): readonly string[] =>
  topology.mcpEnabled
    ? [...composeBase, "--profile", "agent"]
    : composeBase;

const requiredDeploymentLabel = (
  labels: Record<string, string> | undefined,
  label: string,
): string => {
  const value = labels?.[label]?.trim();
  if (!value)
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_TOPOLOGY_IDENTITY_UNREADABLE",
    );
  return value;
};

const validateMcpCredentials = (environment: NodeJS.ProcessEnv): void => {
  const sessionToken = environment.WORKMESH_SESSION_TOKEN?.trim();
  const accessToken = environment.WORKMESH_MCP_ACCESS_TOKEN?.trim();
  const placeholder = /change[_-]?me|replace[_-]?me|placeholder|example/iu;
  if (
    !sessionToken ||
    !accessToken ||
    sessionToken.length < 32 ||
    accessToken.length < 32 ||
    placeholder.test(sessionToken) ||
    placeholder.test(accessToken) ||
    sessionToken === accessToken
  )
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_MCP_CREDENTIALS_INVALID",
    );
};

const safeSqlValue = (value: string, code: string): string => {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value))
    throw new RetentionProductionUpgradeError(code);
  return value;
};

export async function runProductionRetentionUpgrade({
  execute,
  environment,
  root,
  envFile,
  runner = (command, arguments_) =>
    spawnSync(command, [...arguments_], {
      cwd: root,
      env: environment,
      encoding: "utf8",
    }),
  now = () => new Date(),
  delay = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}: {
  execute: boolean;
  environment: NodeJS.ProcessEnv;
  root: string;
  envFile: string;
  runner?: RetentionUpgradeCommandRunner;
  now?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
}) {
  const buildSha = environment.WORKMESH_BUILD_SHA?.trim();
  if (!buildSha || !/^[0-9a-f]{40}$/.test(buildSha))
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_BUILD_SHA_INVALID",
    );
  const images = Object.fromEntries(
    coreApplicationRoles.map((role) => {
      const reference = exactDigest(environment[applicationImages[role]], role);
      return [role, inspectImage(runner, role, reference, buildSha)];
    }),
  ) as Record<CoreApplicationRole, ImageInspection>;
  const unprofiledComposeBase = composeArguments(root, envFile);
  checked(
    runner,
    [...unprofiledComposeBase, "config", "--quiet"],
    "RETENTION_UPGRADE_COMPOSE_CONFIG_INVALID",
  );
  const oldWorkerId = checked(
    runner,
    [...unprofiledComposeBase, "ps", "-q", "worker"],
    "RETENTION_UPGRADE_OLD_WORKER_LOOKUP_FAILED",
  );
  if (!/^[a-f0-9]{12,64}$/.test(oldWorkerId))
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_OLD_WORKER_REQUIRED",
    );
  const oldWorker = inspectContainer(
    runner,
    oldWorkerId,
    "RETENTION_UPGRADE_OLD_WORKER_INSPECT_FAILED",
  );
  const oldWorkerLabels = oldWorker.Config?.Labels;
  const project = oldWorkerLabels?.["com.docker.compose.project"]?.trim();
  if (
    !project ||
    oldWorkerLabels?.["com.docker.compose.service"] !== "worker"
  )
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_OLD_WORKER_LABEL_MISMATCH",
    );
  const deploymentConfigFiles = requiredDeploymentLabel(
    oldWorkerLabels,
    "com.docker.compose.project.config_files",
  );
  const deploymentWorkingDirectory = requiredDeploymentLabel(
    oldWorkerLabels,
    "com.docker.compose.project.working_dir",
  );
  const mcpTopologyOutput = checked(
    runner,
    [
      "ps",
      "-a",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      "label=com.docker.compose.service=mcp",
    ],
    "RETENTION_UPGRADE_MCP_TOPOLOGY_LOOKUP_FAILED",
  );
  const mcpContainerIds = mcpTopologyOutput
    .split(/\s+/u)
    .filter((candidate) => candidate.length > 0);
  if (
    mcpContainerIds.length > 1 ||
    mcpContainerIds.some((candidate) => !/^[a-f0-9]{12,64}$/.test(candidate))
  )
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_MCP_TOPOLOGY_AMBIGUOUS",
    );

  let mcpImage: ImageInspection | undefined;
  const mcpEnabled = mcpContainerIds.length === 1;
  if (mcpEnabled) {
    const mcpContainer = inspectContainer(
      runner,
      mcpContainerIds[0]!,
      "RETENTION_UPGRADE_MCP_TOPOLOGY_INSPECT_FAILED",
    );
    const mcpLabels = mcpContainer.Config?.Labels;
    if (
      mcpLabels?.["com.docker.compose.project"] !== project ||
      mcpLabels?.["com.docker.compose.service"] !== "mcp" ||
      mcpLabels?.["com.docker.compose.project.config_files"]?.trim() !==
        deploymentConfigFiles ||
      mcpLabels?.["com.docker.compose.project.working_dir"]?.trim() !==
        deploymentWorkingDirectory ||
      !mcpContainer.State?.Running ||
      mcpContainer.State?.Restarting
    )
      throw new RetentionProductionUpgradeError(
        "RETENTION_UPGRADE_MCP_TOPOLOGY_INCONSISTENT",
      );
    validateMcpCredentials(environment);
    const mcpReference = exactDigest(
      environment[applicationImages.mcp],
      "mcp",
    );
    mcpImage = inspectImage(runner, "mcp", mcpReference, buildSha);
  }
  const topology = Object.freeze<FrozenTopology>({
    mcpEnabled,
    applicationServices: Object.freeze<readonly Role[]>(
      mcpEnabled ? ["api", "worker", "mcp", "web"] : ["api", "worker", "web"],
    ),
  });
  const composeBase = composeArgumentsForTopology(
    unprofiledComposeBase,
    topology,
  );
  if (topology.mcpEnabled)
    checked(
      runner,
      [...composeBase, "config", "--quiet"],
      "RETENTION_UPGRADE_MCP_COMPOSE_CONFIG_INVALID",
    );

  if (!execute)
    return {
      execute: false,
      buildSha,
      targetDigests: {
        ...Object.fromEntries(
          Object.entries(images).map(([role, image]) => [
            role,
            image.reference,
          ]),
        ),
        ...(mcpImage ? { mcp: mcpImage.reference } : {}),
      },
      oldWorkerId,
      project,
      topology,
      steps: productionUpgradePlan,
    };

  checked(
    runner,
    ["update", "--restart=no", oldWorkerId],
    "RETENTION_UPGRADE_RESTART_DISABLE_FAILED",
  );
  checked(
    runner,
    [...composeBase, "stop", "-t", "35", "worker"],
    "RETENTION_UPGRADE_WORKER_STOP_INTERRUPTED",
  );
  const stoppedWorker = inspectContainer(
    runner,
    oldWorkerId,
    "RETENTION_UPGRADE_STOPPED_WORKER_INSPECT_FAILED",
  );
  if (
    stoppedWorker.State?.Running ||
    stoppedWorker.State?.Restarting ||
    stoppedWorker.State?.ExitCode !== 0
  )
    throw new RetentionProductionUpgradeError(
      stoppedWorker.State?.ExitCode === 137
        ? "RETENTION_UPGRADE_WORKER_STOP_EXIT_137"
        : "RETENTION_UPGRADE_WORKER_STOP_UNCLEAN",
    );
  const runningWorkers = checked(
    runner,
    [
      "ps",
      "-q",
      "--filter",
      `label=com.docker.compose.project=${project}`,
      "--filter",
      "label=com.docker.compose.service=worker",
    ],
    "RETENTION_UPGRADE_WORKER_QUIESCENCE_CHECK_FAILED",
  );
  if (runningWorkers)
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_WORKER_STILL_RUNNING",
    );

  const remainingRoles = topology.mcpEnabled
    ? (["api", "mcp", "web"] as const)
    : (["api", "web"] as const);
  checked(
    runner,
    [
      ...composeBase,
      "run",
      "--rm",
      "--no-deps",
      "--entrypoint",
      "node",
      "worker",
      "dist/run-retention-upgrade-barrier.js",
      "--expect-through=29",
    ],
    "RETENTION_UPGRADE_BARRIER_REJECTED",
  );
  checked(
    runner,
    [...composeBase, "run", "--rm", "--no-deps", "migrate"],
    "RETENTION_UPGRADE_MIGRATION_FAILED",
  );

  const postgresUser = safeSqlValue(
    environment.POSTGRES_USER ?? "workmesh",
    "RETENTION_UPGRADE_POSTGRES_USER_INVALID",
  );
  const postgresDatabase = safeSqlValue(
    environment.POSTGRES_DB ?? "workmesh",
    "RETENTION_UPGRADE_POSTGRES_DATABASE_INVALID",
  );
  const ledgerCount = checked(
    runner,
    [
      ...composeBase,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-XAt",
      "-U",
      postgresUser,
      "-d",
      postgresDatabase,
      "-c",
      "SELECT count(*) FROM schema_migrations WHERE version='0030_durable_archive_upload_intents'",
    ],
    "RETENTION_UPGRADE_LEDGER_CHECK_FAILED",
  );
  if (ledgerCount !== "1")
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_LEDGER_0030_COUNT_INVALID",
    );

  const workerStartedAfter = now();
  checked(
    runner,
    [
      ...composeBase,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "120",
      "worker",
    ],
    "RETENTION_UPGRADE_TARGET_WORKER_START_FAILED",
  );
  const targetWorkerId = checked(
    runner,
    [...composeBase, "ps", "-q", "worker"],
    "RETENTION_UPGRADE_TARGET_WORKER_LOOKUP_FAILED",
  );
  const targetWorker = inspectContainer(
    runner,
    targetWorkerId,
    "RETENTION_UPGRADE_TARGET_WORKER_INSPECT_FAILED",
  );
  if (
    targetWorker.Image !== images.worker.id ||
    targetWorker.Config?.Image !== images.worker.reference
  )
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_TARGET_WORKER_DIGEST_MISMATCH",
    );

  const freshnessSql =
    "SELECT CASE WHEN count(*)>0" +
    ` AND bool_and(worker_build_sha='${buildSha}')` +
    ` AND min(worker_seen_at)>=timestamptz '${workerStartedAfter.toISOString()}'` +
    " THEN 1 ELSE 0 END" +
    " FROM retention_job_state WHERE job_name='worker_runtime'";
  let workerFresh = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const freshness = checked(
      runner,
      [
        ...composeBase,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-XAt",
        "-U",
        postgresUser,
        "-d",
        postgresDatabase,
        "-c",
        freshnessSql,
      ],
      "RETENTION_UPGRADE_WORKER_RUNTIME_CHECK_FAILED",
    );
    if (freshness === "1") {
      workerFresh = true;
      break;
    }
    await delay(5_000);
  }
  if (!workerFresh)
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_WORKER_RUNTIME_NOT_FRESH",
    );

  checked(
    runner,
    [
      ...composeBase,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "240",
      ...remainingRoles,
    ],
    "RETENTION_UPGRADE_REMAINING_SERVICES_START_FAILED",
  );
  for (const role of remainingRoles) {
    const id = checked(
      runner,
      [...composeBase, "ps", "-q", role],
      `RETENTION_UPGRADE_${role.toUpperCase()}_LOOKUP_FAILED`,
    );
    const container = inspectContainer(
      runner,
      id,
      `RETENTION_UPGRADE_${role.toUpperCase()}_INSPECT_FAILED`,
    );
    const expectedImage = role === "mcp" ? mcpImage : images[role];
    if (!expectedImage)
      throw new RetentionProductionUpgradeError(
        "RETENTION_UPGRADE_FROZEN_TOPOLOGY_IMAGE_MISSING",
      );
    if (
      container.Image !== expectedImage.id ||
      container.Config?.Image !== expectedImage.reference
    )
      throw new RetentionProductionUpgradeError(
        `RETENTION_UPGRADE_${role.toUpperCase()}_DIGEST_MISMATCH`,
      );
  }

  return {
    execute: true,
    buildSha,
    project,
    topology,
    migrated: "0030_durable_archive_upload_intents",
    workerContainerId: targetWorkerId,
    completedAt: now().toISOString(),
  };
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const arguments_ = process.argv.slice(2);
  const execute = arguments_.includes("--execute");
  const unknown = arguments_.filter(
    (argument) =>
      argument !== "--execute" && !argument.startsWith("--env-file="),
  );
  if (unknown.length > 0) {
    process.stderr.write(
      `${JSON.stringify({ code: "RETENTION_UPGRADE_ARGUMENT_INVALID" })}\n`,
    );
    process.exitCode = 1;
  } else {
    const envArgument = arguments_.find((argument) =>
      argument.startsWith("--env-file="),
    );
    const root = path.resolve(import.meta.dirname, "..");
    const envFile = path.resolve(
      process.cwd(),
      envArgument?.slice("--env-file=".length) || ".env.production",
    );
    try {
      process.loadEnvFile(envFile);
      const result = await runProductionRetentionUpgrade({
        execute,
        environment: process.env,
        root,
        envFile,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      const code =
        error instanceof RetentionProductionUpgradeError
          ? error.code
          : "RETENTION_UPGRADE_EXECUTOR_FAILED";
      process.stderr.write(`${JSON.stringify({ code })}\n`);
      process.exitCode = 1;
    }
  }
}
