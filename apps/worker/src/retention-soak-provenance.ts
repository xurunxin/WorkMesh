import { execFile } from "node:child_process";
import { releaseInfoResponseSchema } from "@workmesh/contracts";
import { WORKER_RUNTIME_IDENTITY_CONTAINER_PATH } from "./worker-runtime-identity.js";

export const retentionSoakContainerRoles = [
  "api",
  "worker",
  "postgres",
  "redis",
  "minio",
] as const;

export type RetentionSoakContainerRole =
  (typeof retentionSoakContainerRoles)[number];

export type RetentionSoakContainerRoles = Readonly<
  Record<RetentionSoakContainerRole, string>
>;

export type RetentionSoakProvenance = Readonly<{
  verified: true;
  expectedBuildSha: string;
  sourceHeadSha: string;
  apiBuildSha: string;
  composeProject: string;
  workerRuntimeIdentity: RetentionSoakWorkerRuntimeIdentity;
  endpoints: Readonly<{
    api: RetentionSoakEndpointProof;
    postgres: RetentionSoakEndpointProof;
    redis: RetentionSoakEndpointProof;
  }>;
  roles: Readonly<
    Record<
      RetentionSoakContainerRole,
      Readonly<{
        containerName: string;
        containerId: string;
        imageId: string;
        imageDigest: string;
        revision: string;
        composeProject: string;
        composeService: RetentionSoakContainerRole;
      }>
    >
  >;
}>;

export type RetentionSoakWorkerRuntimeIdentity = Readonly<{
  schemaVersion: 1;
  instanceId: string;
  buildSha: string;
  startedAt: string;
  containerId: string;
}>;

export type RetentionSoakEndpointProof = Readonly<{
  role: "api" | "postgres" | "redis";
  scheme: string;
  hostname: string;
  hostPort: number;
  containerPort: number;
  containerId: string;
}>;

export type RetentionSoakWorkerFreshnessProof = Readonly<{
  verified: true;
  workerContainerId: string;
  workerInstanceId: string;
  workerBuildSha: string;
  workerIdentityConflictCount: string;
  workerMode: "archive_only";
  workerSeenAt: string;
  observedAt: string;
  ageMs: number;
}>;

export type RetentionSoakWorkerRuntimeEvidence = Readonly<{
  workerMode: string | null;
  workerSeenAt: Date | null;
  workerInstanceId: string | null;
  workerBuildSha: string | null;
  workerIdentityConflictCount: string | null;
}>;

export type RetentionSoakContainerUsage = Readonly<
  Record<string, Readonly<{ cpuPercent: number; memoryBytes: number }>>
>;

export type RetentionSoakExecFile = (
  executable: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<string>;

export const retentionSoakExecFile: RetentionSoakExecFile = async (
  executable,
  args,
  timeoutMs,
) =>
  await new Promise<string>((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 4 * 1_024 * 1_024,
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });

type ContainerInspection = Readonly<{
  Id?: unknown;
  Name?: unknown;
  Image?: unknown;
  State?: Readonly<{ Running?: unknown }>;
  Config?: Readonly<{ Labels?: unknown }>;
  NetworkSettings?: Readonly<{ Ports?: unknown }>;
}>;

type ImageInspection = Readonly<{
  Id?: unknown;
  RepoDigests?: unknown;
  Config?: Readonly<{ Labels?: unknown }>;
}>;

const parseArray = <T>(text: string, code: string): T[] => {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error(code);
    return parsed as T[];
  } catch {
    throw new Error(code);
  }
};

const requiredString = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
};

const parseWorkerRuntimeIdentity = (
  text: string,
  containerId: string,
  expectedBuildSha: string,
): RetentionSoakWorkerRuntimeIdentity => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_INVALID");
  const record = value as Record<string, unknown>;
  const instanceId = requiredString(
    record.instanceId,
    "RETENTION_SOAK_WORKER_IDENTITY_INVALID",
  );
  const buildSha = requiredString(
    record.buildSha,
    "RETENTION_SOAK_WORKER_IDENTITY_INVALID",
  );
  const startedAt = requiredString(
    record.startedAt,
    "RETENTION_SOAK_WORKER_IDENTITY_INVALID",
  );
  if (
    record.schemaVersion !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      instanceId,
    ) ||
    !Number.isFinite(Date.parse(startedAt)) ||
    buildSha !== expectedBuildSha
  )
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
  return {
    schemaVersion: 1,
    instanceId,
    buildSha,
    startedAt: new Date(Date.parse(startedAt)).toISOString(),
    containerId,
  };
};

const revisionFrom = (image: ImageInspection): string | null => {
  const labels = image.Config?.Labels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels)) return null;
  const revision = (labels as Record<string, unknown>)[
    "org.opencontainers.image.revision"
  ];
  return typeof revision === "string" && revision.trim()
    ? revision.trim()
    : null;
};

const labelsFrom = (
  container: ContainerInspection,
): Record<string, unknown> => {
  const labels = container.Config?.Labels;
  if (!labels || typeof labels !== "object" || Array.isArray(labels))
    throw new Error("RETENTION_SOAK_COMPOSE_IDENTITY_INVALID");
  return labels as Record<string, unknown>;
};

const composeIdentityFrom = (
  container: ContainerInspection,
  expectedService: RetentionSoakContainerRole,
): Readonly<{
  project: string;
  service: RetentionSoakContainerRole;
}> => {
  const labels = labelsFrom(container);
  const project = requiredString(
    labels["com.docker.compose.project"],
    "RETENTION_SOAK_COMPOSE_IDENTITY_INVALID",
  );
  const service = requiredString(
    labels["com.docker.compose.service"],
    "RETENTION_SOAK_COMPOSE_IDENTITY_INVALID",
  );
  if (service !== expectedService)
    throw new Error("RETENTION_SOAK_COMPOSE_SERVICE_MISMATCH");
  return { project, service: expectedService };
};

type PortBinding = Readonly<{ HostIp?: unknown; HostPort?: unknown }>;

const endpointHostMatches = (hostname: string, hostIp: string): boolean => {
  const endpoint = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const binding = hostIp.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
  if (binding === "0.0.0.0" || binding === "::")
    return loopback.has(endpoint);
  if (loopback.has(endpoint) && loopback.has(binding)) return true;
  return endpoint === binding;
};

const endpointProof = (
  urlText: string,
  role: "api" | "postgres" | "redis",
  container: ContainerInspection,
  containerId: string,
  containerPort: number,
  allowedSchemes: readonly string[],
): RetentionSoakEndpointProof => {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new Error("RETENTION_SOAK_ENDPOINT_BINDING_INVALID");
  }
  const scheme = url.protocol.replace(/:$/, "");
  const defaultPort =
    role === "api" ? (scheme === "https" ? 443 : 80) : containerPort;
  const hostPort = Number(url.port || defaultPort);
  const ports = container.NetworkSettings?.Ports;
  const rawBindings =
    ports && typeof ports === "object" && !Array.isArray(ports)
      ? (ports as Record<string, unknown>)[`${containerPort}/tcp`]
      : undefined;
  const bindings = Array.isArray(rawBindings)
    ? (rawBindings as PortBinding[])
    : [];
  if (
    !allowedSchemes.includes(scheme) ||
    !url.hostname ||
    !Number.isSafeInteger(hostPort) ||
    hostPort <= 0 ||
    !bindings.some(
      (binding) =>
        Number(binding.HostPort) === hostPort &&
        typeof binding.HostIp === "string" &&
        endpointHostMatches(url.hostname, binding.HostIp),
    )
  )
    throw new Error("RETENTION_SOAK_ENDPOINT_BINDING_MISMATCH");
  return {
    role,
    scheme,
    hostname: url.hostname,
    hostPort,
    containerPort,
    containerId,
  };
};

const parseBytes = (value: string): number => {
  const match = /^([\d.]+)\s*([kmgt]?i?b)$/i.exec(value.trim());
  if (!match) throw new Error("RETENTION_SOAK_DOCKER_MEMORY_PARSE_FAILED");
  const scale: Record<string, number> = {
    b: 1,
    kb: 1_000,
    kib: 1_024,
    mb: 1_000_000,
    mib: 1_048_576,
    gb: 1_000_000_000,
    gib: 1_073_741_824,
    tb: 1_000_000_000_000,
    tib: 1_099_511_627_776,
  };
  return Number(match[1]) * scale[match[2]!.toLowerCase()]!;
};

export const parseRetentionSoakContainerStats = (
  output: string,
  provenance: RetentionSoakProvenance,
): RetentionSoakContainerUsage => {
  const rows = output
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as {
          ID?: unknown;
          Name?: unknown;
          CPUPerc?: unknown;
          MemUsage?: unknown;
        };
      } catch {
        throw new Error("RETENTION_SOAK_CONTAINER_STATS_INVALID");
      }
    });
  if (rows.length !== retentionSoakContainerRoles.length)
    throw new Error("RETENTION_SOAK_CONTAINER_STATS_INCOMPLETE");
  const byName = new Map(
    rows.map((row) => [
      requiredString(row.Name, "RETENTION_SOAK_CONTAINER_STATS_INVALID"),
      row,
    ]),
  );
  const result: Record<
    string,
    Readonly<{ cpuPercent: number; memoryBytes: number }>
  > = {};
  for (const role of retentionSoakContainerRoles) {
    const expected = provenance.roles[role];
    const row = byName.get(expected.containerName);
    if (
      !row ||
      requiredString(row.ID, "RETENTION_SOAK_CONTAINER_STATS_INVALID") !==
        expected.containerId
    )
      throw new Error("RETENTION_SOAK_CONTAINER_ID_DRIFT");
    const cpuPercent = Number(
      requiredString(
        row.CPUPerc,
        "RETENTION_SOAK_CONTAINER_STATS_INVALID",
      ).replace("%", ""),
    );
    const memoryBytes = parseBytes(
      requiredString(
        row.MemUsage,
        "RETENTION_SOAK_CONTAINER_STATS_INVALID",
      ).split("/")[0]!,
    );
    if (!Number.isFinite(cpuPercent) || !Number.isFinite(memoryBytes))
      throw new Error("RETENTION_SOAK_CONTAINER_STATS_INVALID");
    result[expected.containerName] = { cpuPercent, memoryBytes };
  }
  if (byName.size !== retentionSoakContainerRoles.length)
    throw new Error("RETENTION_SOAK_CONTAINER_STATS_INCOMPLETE");
  return result;
};

export const retentionSoakWorkerFreshnessProof = (
  workerRuntimeIdentity: RetentionSoakWorkerRuntimeIdentity,
  evidence: RetentionSoakWorkerRuntimeEvidence,
  observedAt: Date,
  maximumAgeMs = 120_000,
  expectedConflictCount?: string,
): RetentionSoakWorkerFreshnessProof => {
  const ageMs = evidence.workerSeenAt
    ? observedAt.getTime() - evidence.workerSeenAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (
    evidence.workerInstanceId !== workerRuntimeIdentity.instanceId ||
    evidence.workerBuildSha !== workerRuntimeIdentity.buildSha
  )
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
  if (
    !evidence.workerIdentityConflictCount ||
    !/^(0|[1-9][0-9]*)$/.test(evidence.workerIdentityConflictCount)
  )
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_CONFLICT_COUNT_INVALID");
  if (
    expectedConflictCount !== undefined &&
    evidence.workerIdentityConflictCount !== expectedConflictCount
  )
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_CONFLICT_DETECTED");
  if (
    evidence.workerMode !== "archive_only" ||
    !evidence.workerSeenAt ||
    ageMs < 0 ||
    ageMs > maximumAgeMs
  )
    throw new Error("RETENTION_SOAK_REQUIRES_FRESH_ARCHIVE_ONLY_WORKER");
  return {
    verified: true,
    workerContainerId: workerRuntimeIdentity.containerId,
    workerInstanceId: workerRuntimeIdentity.instanceId,
    workerBuildSha: workerRuntimeIdentity.buildSha,
    workerIdentityConflictCount: evidence.workerIdentityConflictCount,
    workerMode: "archive_only",
    workerSeenAt: evidence.workerSeenAt.toISOString(),
    observedAt: observedAt.toISOString(),
    ageMs,
  };
};

export const collectRetentionSoakEndingEvidence = async (input: Readonly<{
  readRuntime: () => Promise<RetentionSoakWorkerRuntimeEvidence>;
  collectProvenance: () => Promise<RetentionSoakProvenance>;
  now?: () => Date;
  maximumAgeMs?: number;
  expectedConflictCount: string;
}>): Promise<Readonly<{
  provenance: RetentionSoakProvenance;
  observedAt: Date;
  workerFreshness: RetentionSoakWorkerFreshnessProof;
}>> => {
  const runtime = await input.readRuntime();
  const provenance = await input.collectProvenance();
  // This timestamp must be captured after both ending observations. Using the
  // earlier heartbeat end can falsely accept a Worker that went stale while
  // these reads were in flight.
  const observedAt = input.now?.() ?? new Date();
  return {
    provenance,
    observedAt,
    workerFreshness: retentionSoakWorkerFreshnessProof(
      provenance.workerRuntimeIdentity,
      runtime,
      observedAt,
      input.maximumAgeMs,
      input.expectedConflictCount,
    ),
  };
};

export const retentionSoakProvenanceMatches = (
  initial: RetentionSoakProvenance,
  ending: RetentionSoakProvenance,
): boolean => JSON.stringify(initial) === JSON.stringify(ending);

export const collectRetentionSoakProvenance = async (
  options: Readonly<{
    containerRoles: RetentionSoakContainerRoles;
    expectedBuildSha: string;
    apiUrl: string;
    databaseUrl: string;
    redisUrl: string;
    platform?: NodeJS.Platform;
    execFile?: RetentionSoakExecFile;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }>,
): Promise<RetentionSoakProvenance> => {
  if ((options.platform ?? process.platform) === "win32")
    throw new Error("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
  if (!/^[0-9a-f]{40}$/.test(options.expectedBuildSha))
    throw new Error("RETENTION_SOAK_EXPECTED_SHA_INVALID");
  const suppliedRoles = Object.keys(options.containerRoles).sort();
  if (
    suppliedRoles.length !== retentionSoakContainerRoles.length ||
    suppliedRoles.some(
      (role, index) =>
        role !== [...retentionSoakContainerRoles].sort()[index],
    )
  )
    throw new Error("RETENTION_SOAK_CONTAINER_ROLE_MAPPING_INVALID");
  const names = retentionSoakContainerRoles.map(
    (role) => options.containerRoles[role],
  );
  if (
    names.some((name) => !name.trim()) ||
    new Set(names).size !== retentionSoakContainerRoles.length
  )
    throw new Error("RETENTION_SOAK_CONTAINER_ROLE_MAPPING_INVALID");

  const run = options.execFile ?? retentionSoakExecFile;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let sourceHeadSha: string;
  try {
    sourceHeadSha = (
      await run("git", ["rev-parse", "HEAD"], timeoutMs)
    ).trim();
    const status = await run("git", ["status", "--porcelain"], timeoutMs);
    if (sourceHeadSha !== options.expectedBuildSha || status.trim())
      throw new Error("RETENTION_SOAK_SOURCE_PROVENANCE_MISMATCH");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RETENTION_SOAK_"))
      throw error;
    throw new Error("RETENTION_SOAK_SOURCE_PROVENANCE_MISMATCH");
  }
  let containers: ContainerInspection[];
  let images: ImageInspection[];
  try {
    containers = parseArray<ContainerInspection>(
      await run("docker", ["inspect", ...names], timeoutMs),
      "RETENTION_SOAK_CONTAINER_INSPECTION_INVALID",
    );
    const imageIds = containers.map((container) =>
      requiredString(
        container.Image,
        "RETENTION_SOAK_CONTAINER_INSPECTION_INVALID",
      ),
    );
    images = parseArray<ImageInspection>(
      await run("docker", ["image", "inspect", ...imageIds], timeoutMs),
      "RETENTION_SOAK_IMAGE_INSPECTION_INVALID",
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RETENTION_SOAK_"))
      throw error;
    throw new Error("RETENTION_SOAK_PROVENANCE_INSPECTION_FAILED");
  }

  const imagesById = new Map(
    images.map((image) => [
      requiredString(image.Id, "RETENTION_SOAK_IMAGE_INSPECTION_INVALID"),
      image,
    ]),
  );
  const containersByName = new Map(
    containers.map((container) => [
      requiredString(
        container.Name,
        "RETENTION_SOAK_CONTAINER_INSPECTION_INVALID",
      ).replace(/^\//, ""),
      container,
    ]),
  );
  const roles = Object.fromEntries(
    retentionSoakContainerRoles.map((role) => {
      const containerName = options.containerRoles[role];
      const container = containersByName.get(containerName);
      if (!container || container.State?.Running !== true)
        throw new Error("RETENTION_SOAK_CONTAINER_INSPECTION_INVALID");
      const containerId = requiredString(
        container.Id,
        "RETENTION_SOAK_CONTAINER_INSPECTION_INVALID",
      );
      const imageId = requiredString(
        container.Image,
        "RETENTION_SOAK_CONTAINER_INSPECTION_INVALID",
      );
      const image = imagesById.get(imageId);
      if (!image) throw new Error("RETENTION_SOAK_IMAGE_INSPECTION_INVALID");
      const digests = Array.isArray(image.RepoDigests)
        ? image.RepoDigests.filter(
            (value): value is string =>
              typeof value === "string" &&
              /@sha256:[0-9a-f]{64}$/i.test(value),
          )
        : [];
      if (digests.length === 0)
        throw new Error("RETENTION_SOAK_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
      const revision = revisionFrom(image);
      if (!revision) throw new Error("RETENTION_SOAK_IMAGE_REVISION_REQUIRED");
      if (
        (role === "api" || role === "worker") &&
        revision !== options.expectedBuildSha
      )
        throw new Error("RETENTION_SOAK_IMAGE_REVISION_MISMATCH");
      const compose = composeIdentityFrom(container, role);
      return [
        role,
        {
          containerName,
          containerId,
          imageId,
          imageDigest: [...digests].sort()[0]!,
          revision,
          composeProject: compose.project,
          composeService: compose.service,
        },
      ];
    }),
  ) as RetentionSoakProvenance["roles"];
  const composeProjects = new Set(
    retentionSoakContainerRoles.map((role) => roles[role].composeProject),
  );
  if (composeProjects.size !== 1)
    throw new Error("RETENTION_SOAK_COMPOSE_PROJECT_MISMATCH");
  const composeProject = roles.api.composeProject;
  const endpoints = {
    api: endpointProof(
      options.apiUrl,
      "api",
      containersByName.get(options.containerRoles.api)!,
      roles.api.containerId,
      3001,
      ["http", "https"],
    ),
    postgres: endpointProof(
      options.databaseUrl,
      "postgres",
      containersByName.get(options.containerRoles.postgres)!,
      roles.postgres.containerId,
      5432,
      ["postgres", "postgresql"],
    ),
    redis: endpointProof(
      options.redisUrl,
      "redis",
      containersByName.get(options.containerRoles.redis)!,
      roles.redis.containerId,
      6379,
      ["redis", "rediss"],
    ),
  };
  let workerRuntimeIdentity: RetentionSoakWorkerRuntimeIdentity;
  try {
    workerRuntimeIdentity = parseWorkerRuntimeIdentity(
      await run(
        "docker",
        [
          "exec",
          roles.worker.containerId,
          "cat",
          WORKER_RUNTIME_IDENTITY_CONTAINER_PATH,
        ],
        timeoutMs,
      ),
      roles.worker.containerId,
      options.expectedBuildSha,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("RETENTION_SOAK_"))
      throw error;
    throw new Error("RETENTION_SOAK_WORKER_IDENTITY_READ_FAILED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let info: unknown;
  try {
    const response = await (options.fetch ?? fetch)(
      `${options.apiUrl}/api/v1/info`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error("RETENTION_SOAK_API_BUILD_INFO_INVALID");
    info = await response.json();
  } catch {
    throw new Error("RETENTION_SOAK_API_BUILD_INFO_INVALID");
  } finally {
    clearTimeout(timeout);
  }
  const parsed = releaseInfoResponseSchema.safeParse(info);
  if (
    !parsed.success ||
    parsed.data.buildSha !== options.expectedBuildSha ||
    roles.api.revision !== parsed.data.buildSha
  )
    throw new Error("RETENTION_SOAK_API_BUILD_SHA_MISMATCH");

  return {
    verified: true,
    expectedBuildSha: options.expectedBuildSha,
    sourceHeadSha,
    apiBuildSha: parsed.data.buildSha,
    composeProject,
    workerRuntimeIdentity,
    endpoints,
    roles,
  };
};
