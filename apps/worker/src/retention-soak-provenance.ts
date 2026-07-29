import { execFile } from "node:child_process";
import { releaseInfoResponseSchema } from "@workmesh/contracts";

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
  roles: Readonly<
    Record<
      RetentionSoakContainerRole,
      Readonly<{
        containerName: string;
        containerId: string;
        imageId: string;
        imageDigest: string;
        revision: string;
      }>
    >
  >;
}>;

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

export const collectRetentionSoakProvenance = async (
  options: Readonly<{
    containerRoles: RetentionSoakContainerRoles;
    expectedBuildSha: string;
    apiUrl: string;
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
      return [
        role,
        {
          containerName,
          containerId,
          imageId,
          imageDigest: [...digests].sort()[0]!,
          revision,
        },
      ];
    }),
  ) as RetentionSoakProvenance["roles"];

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
    roles,
  };
};
