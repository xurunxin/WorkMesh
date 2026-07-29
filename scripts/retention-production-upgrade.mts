import process from "node:process";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { chmod, lstat, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  loadConfig,
  loadFeatureConfig,
  loadRealtimeRedisHintConfig,
  loadRetentionConfig,
} from "../packages/config/src/index.js";
import { validateRuntimeEnvironment } from "../packages/config/src/runtime-secrets.mjs";

type CommandResult = Pick<
  SpawnSyncReturns<string>,
  "status" | "signal" | "stdout" | "stderr" | "error"
>;

export type RetentionUpgradeCommandRunner = (
  command: string,
  arguments_: readonly string[],
) => CommandResult;

export type RetentionUpgradeComposeSnapshot = Readonly<{
  path: string;
  cleanup: () => Promise<void>;
}>;

export type RetentionUpgradeComposeSnapshotStore = Readonly<{
  create: (
    content: string,
    protection: Readonly<{ directoryMode: 0o700; fileMode: 0o600 }>,
  ) => Promise<RetentionUpgradeComposeSnapshot>;
}>;

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
type RuntimePreflightService = "migrate" | Role;
type FrozenRuntimePreflight = Readonly<{
  environment: Readonly<NodeJS.ProcessEnv>;
  image: ImageInspection;
  service: RuntimePreflightService;
}>;
type FrozenTopology = Readonly<{
  mcpEnabled: boolean;
  applicationServices: readonly Role[];
}>;

const productionUpgradePlan = [
  "freeze the current optional-service topology and validate every included target image, rendered service environment, and image runtime guard",
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
  if (result.error || result.signal || result.status === null || result.status !== 0)
    throw new RetentionProductionUpgradeError(code);
  return result.stdout.trim();
};

const snapshotPrefix = "workmesh-retention-upgrade-";

const ownerOnlyMode = (mode: number, expected: 0o600 | 0o700): boolean =>
  (mode & 0o777) === expected;

const processIsRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const defaultSnapshotStore: RetentionUpgradeComposeSnapshotStore = {
  async create(content, protection) {
    const getUid = process.getuid;
    if (!getUid)
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_SNAPSHOT_OWNER_UNVERIFIABLE");
    const uid = getUid();
    const temporaryRoot = path.resolve(tmpdir());
    for (const entry of await readdir(temporaryRoot, { withFileTypes: true })) {
      const match = new RegExp(`^${snapshotPrefix}(\\d+)-`).exec(entry.name);
      if (!match || !entry.isDirectory()) continue;
      const pid = Number(match[1]);
      if (!Number.isSafeInteger(pid) || pid === process.pid || processIsRunning(pid)) continue;
      const candidate = path.resolve(temporaryRoot, entry.name);
      if (path.dirname(candidate) !== temporaryRoot) continue;
      const metadata = await lstat(candidate).catch(() => undefined);
      if (
        !metadata?.isDirectory() ||
        metadata.isSymbolicLink() ||
        metadata.uid !== uid ||
        !ownerOnlyMode(metadata.mode, 0o700)
      )
        continue;
      await rm(candidate, { recursive: true, force: true });
    }

    const directory = await mkdtemp(path.join(temporaryRoot, `${snapshotPrefix}${process.pid}-`));
    let complete = false;
    try {
      await chmod(directory, protection.directoryMode);
      const directoryMetadata = await lstat(directory);
      if (
        !directoryMetadata.isDirectory() ||
        directoryMetadata.isSymbolicLink() ||
        directoryMetadata.uid !== uid ||
        !ownerOnlyMode(directoryMetadata.mode, protection.directoryMode)
      )
        throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_SNAPSHOT_DIRECTORY_UNSAFE");
      const snapshotPath = path.join(directory, "compose.snapshot.json");
      await writeFile(snapshotPath, content, {
        encoding: "utf8",
        flag: "wx",
        mode: protection.fileMode,
      });
      await chmod(snapshotPath, protection.fileMode);
      const snapshotMetadata = await lstat(snapshotPath);
      if (
        !snapshotMetadata.isFile() ||
        snapshotMetadata.isSymbolicLink() ||
        snapshotMetadata.uid !== uid ||
        !ownerOnlyMode(snapshotMetadata.mode, protection.fileMode)
      )
        throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_SNAPSHOT_FILE_UNSAFE");
      complete = true;
      return Object.freeze({
        path: snapshotPath,
        cleanup: () => rm(directory, { recursive: true, force: true }),
      });
    } finally {
      if (!complete) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  },
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
    !new RegExp(`^ghcr\\.io/[a-z0-9][a-z0-9._/-]*/workmesh-${role}@sha256:[0-9a-f]{64}$`).test(
      reference,
    )
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

const inspectContainer = (runner: RetentionUpgradeCommandRunner, id: string, code: string) => {
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
  topology.mcpEnabled ? [...composeBase, "--profile", "agent"] : composeBase;

const requiredDeploymentLabel = (
  labels: Record<string, string> | undefined,
  label: string,
): string => {
  const value = labels?.[label]?.trim();
  if (!value)
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_TOPOLOGY_IDENTITY_UNREADABLE");
  return value;
};

const freezeRuntimePreflight = ({
  comparisonEnvironment,
  expectedImage,
  renderedCompose,
  service,
}: {
  comparisonEnvironment?: NodeJS.ProcessEnv;
  expectedImage: ImageInspection;
  renderedCompose: unknown;
  service: RuntimePreflightService;
}): FrozenRuntimePreflight => {
  const compose = renderedCompose as {
    services?: Record<
      string,
      {
        environment?: Record<string, unknown>;
        image?: unknown;
      }
    >;
  };
  const renderedService = compose.services?.[service];
  if (renderedService?.image !== expectedImage.reference || !renderedService.environment)
    throw new RetentionProductionUpgradeError(
      `RETENTION_UPGRADE_${service.toUpperCase()}_RENDERED_CONFIG_INVALID`,
    );
  const environmentEntries = Object.entries(renderedService.environment);
  if (environmentEntries.some(([, value]) => typeof value !== "string"))
    throw new RetentionProductionUpgradeError(
      `RETENTION_UPGRADE_${service.toUpperCase()}_RENDERED_CONFIG_INVALID`,
    );
  const renderedEnvironment = Object.freeze(
    Object.fromEntries(environmentEntries) as NodeJS.ProcessEnv,
  );
  const validationEnvironment = comparisonEnvironment
    ? { ...comparisonEnvironment, ...renderedEnvironment }
    : renderedEnvironment;
  try {
    validateRuntimeEnvironment(renderedEnvironment, comparisonEnvironment);
    if (service === "api") {
      validateRuntimeEnvironment(validationEnvironment);
      loadConfig(validationEnvironment);
      loadFeatureConfig(validationEnvironment);
    } else if (service === "worker") {
      loadFeatureConfig(validationEnvironment);
      loadRealtimeRedisHintConfig(validationEnvironment);
      loadRetentionConfig(validationEnvironment);
    }
  } catch {
    throw new RetentionProductionUpgradeError(
      `RETENTION_UPGRADE_${service.toUpperCase()}_RUNTIME_CONFIG_INVALID`,
    );
  }
  return Object.freeze({
    environment: renderedEnvironment,
    image: expectedImage,
    service,
  });
};

const freezeRenderedDeploymentEnvironment = (
  renderedCompose: unknown,
): Readonly<NodeJS.ProcessEnv> => {
  const services = (
    renderedCompose as {
      services?: Record<string, { environment?: Record<string, unknown> }>;
    }
  ).services;
  if (!services)
    throw new RetentionProductionUpgradeError(
      "RETENTION_UPGRADE_FROZEN_COMPOSE_ENVIRONMENT_INVALID",
    );
  const environment: NodeJS.ProcessEnv = {};
  for (const service of Object.values(services)) {
    for (const [name, value] of Object.entries(service.environment ?? {})) {
      if (typeof value !== "string")
        throw new RetentionProductionUpgradeError(
          "RETENTION_UPGRADE_FROZEN_COMPOSE_ENVIRONMENT_INVALID",
        );
      environment[name] = value;
    }
  }
  return Object.freeze(environment);
};

const encodeComposeDollarLiterals = (value: unknown): unknown => {
  if (typeof value === "string") return value.split("$").join("$$");
  if (Array.isArray(value)) return value.map(encodeComposeDollarLiterals);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, nested]) => [
        name,
        encodeComposeDollarLiterals(nested),
      ]),
    );
  return value;
};

const decodeComposeDollarLiterals = (value: unknown): unknown => {
  if (typeof value === "string") {
    let decoded = "";
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index]!;
      if (character !== "$") {
        decoded += character;
        continue;
      }
      if (value[index + 1] !== "$")
        throw new RetentionProductionUpgradeError(
          "RETENTION_UPGRADE_SNAPSHOT_COMPOSE_MISMATCH",
        );
      decoded += "$";
      index += 1;
    }
    return decoded;
  }
  if (Array.isArray(value)) return value.map(decodeComposeDollarLiterals);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, nested]) => [
        name,
        decodeComposeDollarLiterals(nested),
      ]),
    );
  return value;
};

const safeSqlValue = (value: string, code: string): string => {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(value)) throw new RetentionProductionUpgradeError(code);
  return value;
};

export async function runProductionRetentionUpgrade({
  execute,
  environment,
  root,
  envFile,
  snapshotStore = defaultSnapshotStore,
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
  snapshotStore?: RetentionUpgradeComposeSnapshotStore;
  runner?: RetentionUpgradeCommandRunner;
  now?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
}) {
  const buildSha = environment.WORKMESH_BUILD_SHA?.trim();
  if (!buildSha || !/^[0-9a-f]{40}$/.test(buildSha))
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_BUILD_SHA_INVALID");
  const postgres = Object.freeze({
    user: safeSqlValue(
      environment.POSTGRES_USER ?? "workmesh",
      "RETENTION_UPGRADE_POSTGRES_USER_INVALID",
    ),
    database: safeSqlValue(
      environment.POSTGRES_DB ?? "workmesh",
      "RETENTION_UPGRADE_POSTGRES_DATABASE_INVALID",
    ),
  });
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
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_OLD_WORKER_REQUIRED");
  const oldWorker = inspectContainer(
    runner,
    oldWorkerId,
    "RETENTION_UPGRADE_OLD_WORKER_INSPECT_FAILED",
  );
  const oldWorkerLabels = oldWorker.Config?.Labels;
  const project = oldWorkerLabels?.["com.docker.compose.project"]?.trim();
  if (!project || oldWorkerLabels?.["com.docker.compose.service"] !== "worker")
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_OLD_WORKER_LABEL_MISMATCH");
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
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_MCP_TOPOLOGY_AMBIGUOUS");

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
      mcpLabels?.["com.docker.compose.project.config_files"]?.trim() !== deploymentConfigFiles ||
      mcpLabels?.["com.docker.compose.project.working_dir"]?.trim() !==
        deploymentWorkingDirectory ||
      !mcpContainer.State?.Running ||
      mcpContainer.State?.Restarting
    )
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_MCP_TOPOLOGY_INCONSISTENT");
    const mcpReference = exactDigest(environment[applicationImages.mcp], "mcp");
    mcpImage = inspectImage(runner, "mcp", mcpReference, buildSha);
  }
  const topology = Object.freeze<FrozenTopology>({
    mcpEnabled,
    applicationServices: Object.freeze<readonly Role[]>(
      mcpEnabled ? ["api", "worker", "mcp", "web"] : ["api", "worker", "web"],
    ),
  });
  const sourceComposeBase = composeArgumentsForTopology(
    ["compose", "--project-name", project, ...unprofiledComposeBase.slice(1)],
    topology,
  );
  const renderedCompose = parseJson<unknown>(
    checked(
      runner,
      [...sourceComposeBase, "config", "--format", "json"],
      "RETENTION_UPGRADE_FROZEN_COMPOSE_RENDER_FAILED",
    ),
    "RETENTION_UPGRADE_FROZEN_COMPOSE_RENDER_INVALID",
  );
  if ((renderedCompose as { name?: unknown }).name !== project)
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_FROZEN_COMPOSE_PROJECT_MISMATCH");
  const renderedDeploymentEnvironment = freezeRenderedDeploymentEnvironment(renderedCompose);
  const coreDeploymentEnvironment = Object.freeze({
    ...renderedDeploymentEnvironment,
    WORKMESH_SESSION_TOKEN: undefined,
    WORKMESH_MCP_ACCESS_TOKEN: undefined,
  });
  const coreRuntimePreflights = Object.freeze([
    freezeRuntimePreflight({
      comparisonEnvironment: coreDeploymentEnvironment,
      expectedImage: images.api,
      renderedCompose,
      service: "migrate",
    }),
    freezeRuntimePreflight({
      comparisonEnvironment: coreDeploymentEnvironment,
      expectedImage: images.api,
      renderedCompose,
      service: "api",
    }),
    freezeRuntimePreflight({
      comparisonEnvironment: coreDeploymentEnvironment,
      expectedImage: images.worker,
      renderedCompose,
      service: "worker",
    }),
    freezeRuntimePreflight({
      comparisonEnvironment: coreDeploymentEnvironment,
      expectedImage: images.web,
      renderedCompose,
      service: "web",
    }),
  ]);
  const mcpRuntimePreflight = topology.mcpEnabled
    ? (() => {
        if (!mcpImage)
          throw new RetentionProductionUpgradeError(
            "RETENTION_UPGRADE_FROZEN_TOPOLOGY_IMAGE_MISSING",
          );
        return freezeRuntimePreflight({
          comparisonEnvironment: renderedDeploymentEnvironment,
          expectedImage: mcpImage,
          renderedCompose,
          service: "mcp",
        });
      })()
    : undefined;
  const runtimePreflights = Object.freeze([
    ...coreRuntimePreflights,
    ...(mcpRuntimePreflight ? [mcpRuntimePreflight] : []),
  ]);
  const remainingServiceRoles = topology.mcpEnabled
    ? (["api", "mcp", "web"] as const)
    : (["api", "web"] as const);
  const remainingServices = Object.freeze(
    remainingServiceRoles.map((role) => {
      const image = role === "mcp" ? mcpImage : images[role];
      if (!image)
        throw new RetentionProductionUpgradeError(
          "RETENTION_UPGRADE_FROZEN_TOPOLOGY_IMAGE_MISSING",
        );
      return Object.freeze({ image, role });
    }),
  );

  let snapshot: RetentionUpgradeComposeSnapshot;
  try {
    snapshot = await snapshotStore.create(
      JSON.stringify(encodeComposeDollarLiterals(renderedCompose)),
      {
        directoryMode: 0o700,
        fileMode: 0o600,
      },
    );
  } catch {
    throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_SNAPSHOT_CREATE_FAILED");
  }
  const composeBase = composeArgumentsForTopology(
    ["compose", "--project-name", project, "-f", snapshot.path],
    topology,
  );

  try {
    const roundTripCompose = parseJson<unknown>(
      checked(
        runner,
        [...composeBase, "config", "--format", "json"],
        "RETENTION_UPGRADE_SNAPSHOT_COMPOSE_INVALID",
      ),
      "RETENTION_UPGRADE_SNAPSHOT_COMPOSE_INVALID",
    );
    let normalizedRoundTripCompose = roundTripCompose;
    if (!isDeepStrictEqual(roundTripCompose, renderedCompose))
      normalizedRoundTripCompose =
        decodeComposeDollarLiterals(roundTripCompose);
    if (!isDeepStrictEqual(normalizedRoundTripCompose, renderedCompose))
      throw new RetentionProductionUpgradeError(
        "RETENTION_UPGRADE_SNAPSHOT_COMPOSE_MISMATCH",
      );
    if (!execute)
      return {
        execute: false,
        buildSha,
        targetDigests: {
          ...Object.fromEntries(
            Object.entries(images).map(([role, image]) => [role, image.reference]),
          ),
          ...(mcpImage ? { mcp: mcpImage.reference } : {}),
        },
        oldWorkerId,
        project,
        topology,
        steps: productionUpgradePlan,
      };

    for (const { service } of runtimePreflights)
      checked(
        runner,
        [
          ...composeBase,
          "run",
          "--rm",
          "--no-deps",
          "-T",
          "--entrypoint",
          "node",
          service,
          "/app/runtime-guard.mjs",
        ],
        `RETENTION_UPGRADE_${service.toUpperCase()}_RUNTIME_PREFLIGHT_FAILED`,
      );

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
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_WORKER_STILL_RUNNING");

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
        postgres.user,
        "-d",
        postgres.database,
        "-c",
        "SELECT count(*) FROM schema_migrations WHERE version='0030_durable_archive_upload_intents'",
      ],
      "RETENTION_UPGRADE_LEDGER_CHECK_FAILED",
    );
    if (ledgerCount !== "1")
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_LEDGER_0030_COUNT_INVALID");

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
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_TARGET_WORKER_DIGEST_MISMATCH");

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
          postgres.user,
          "-d",
          postgres.database,
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
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_WORKER_RUNTIME_NOT_FRESH");

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
        ...remainingServices.map(({ role }) => role),
      ],
      "RETENTION_UPGRADE_REMAINING_SERVICES_START_FAILED",
    );
    for (const { image: expectedImage, role } of remainingServices) {
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
  } finally {
    try {
      await snapshot.cleanup();
    } catch {
      throw new RetentionProductionUpgradeError("RETENTION_UPGRADE_SNAPSHOT_CLEANUP_FAILED");
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const arguments_ = process.argv.slice(2);
  const execute = arguments_.includes("--execute");
  const unknown = arguments_.filter(
    (argument) => argument !== "--execute" && !argument.startsWith("--env-file="),
  );
  if (unknown.length > 0) {
    process.stderr.write(`${JSON.stringify({ code: "RETENTION_UPGRADE_ARGUMENT_INVALID" })}\n`);
    process.exitCode = 1;
  } else {
    const envArgument = arguments_.find((argument) => argument.startsWith("--env-file="));
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
