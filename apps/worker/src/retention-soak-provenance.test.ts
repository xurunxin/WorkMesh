import { describe, expect, it, vi } from "vitest";
import {
  collectRetentionSoakProvenance,
  type RetentionSoakContainerRoles,
} from "./retention-soak-provenance.js";

const expectedBuildSha = "a".repeat(40);
const roles: RetentionSoakContainerRoles = {
  api: "workmesh-api",
  worker: "workmesh-worker",
  postgres: "workmesh-postgres",
  redis: "workmesh-redis",
  minio: "workmesh-minio",
};
const roleNames = Object.keys(roles) as Array<keyof typeof roles>;

const inspections = (
  overrides: Readonly<{
    missingDigestRole?: keyof typeof roles;
    missingRevisionRole?: keyof typeof roles;
    workerRevision?: string;
  }> = {},
) => {
  const containers = roleNames.map((role, index) => ({
    Id: `container-${index}`,
    Name: `/${roles[role]}`,
    Image: `sha256:${String(index + 1).repeat(64)}`,
    State: { Running: true },
  }));
  const images = roleNames.map((role, index) => ({
    Id: containers[index]!.Image,
    RepoDigests:
      overrides.missingDigestRole === role
        ? []
        : [`example/${role}@sha256:${String(index + 5).repeat(64)}`],
    Config: {
      Labels: {
        "org.opencontainers.image.revision":
          overrides.missingRevisionRole === role
            ? ""
            : role === "api"
            ? expectedBuildSha
            : role === "worker"
              ? (overrides.workerRevision ?? expectedBuildSha)
              : `infra-${role}`,
      },
    },
  }));
  return { containers, images };
};

const releaseInfo = (buildSha = expectedBuildSha): Response =>
  new Response(
    JSON.stringify({
      serverVersion: "1.0.0",
      restApiVersion: "1.0",
      agentProtocolVersion: "1.0",
      mcpVersion: "1.0.0",
      a2aUpstreamVersion: "0.3",
      schemaBaseline: 1,
      buildSha,
    }),
    { headers: { "content-type": "application/json" } },
  );

describe("retention soak formal provenance", () => {
  it("maps exactly five roles and verifies immutable images plus API/Worker SHA", async () => {
    const data = inspections();
    const execFile = vi.fn(async (executable: string, args: readonly string[]) => {
      if (executable === "git")
        return args[0] === "rev-parse" ? `${expectedBuildSha}\n` : "";
      return JSON.stringify(
        args[0] === "inspect" ? data.containers : data.images,
      );
    });

    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        platform: "linux",
        execFile,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(releaseInfo()),
      }),
    ).resolves.toMatchObject({
      verified: true,
      expectedBuildSha,
      sourceHeadSha: expectedBuildSha,
      apiBuildSha: expectedBuildSha,
      roles: {
        api: {
          containerName: "workmesh-api",
          revision: expectedBuildSha,
        },
        worker: {
          containerName: "workmesh-worker",
          revision: expectedBuildSha,
        },
        postgres: { containerName: "workmesh-postgres" },
        redis: { containerName: "workmesh-redis" },
        minio: { containerName: "workmesh-minio" },
      },
    });
    expect(execFile).toHaveBeenCalledTimes(4);
  });

  it("rejects missing digests, wrong image revisions, and wrong API build SHA", async () => {
    const create = (
      data: ReturnType<typeof inspections>,
      response = releaseInfo(),
    ) =>
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        platform: "linux",
        execFile: async (executable, args) => {
          if (executable === "git")
            return args[0] === "rev-parse" ? `${expectedBuildSha}\n` : "";
          return JSON.stringify(
            args[0] === "inspect" ? data.containers : data.images,
          );
        },
        fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      });

    await expect(
      create(inspections({ missingDigestRole: "minio" })),
    ).rejects.toThrow("RETENTION_SOAK_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
    await expect(
      create(inspections({ missingRevisionRole: "postgres" })),
    ).rejects.toThrow("RETENTION_SOAK_IMAGE_REVISION_REQUIRED");
    await expect(
      create(inspections({ workerRevision: "b".repeat(40) })),
    ).rejects.toThrow("RETENTION_SOAK_IMAGE_REVISION_MISMATCH");
    await expect(
      create(inspections(), releaseInfo("b".repeat(40))),
    ).rejects.toThrow("RETENTION_SOAK_API_BUILD_SHA_MISMATCH");
  });

  it("rejects native Windows and an invalid expected SHA before inspection", async () => {
    const execFile = vi.fn();
    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        platform: "win32",
        execFile,
      }),
    ).rejects.toThrow("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha: "dirty",
        apiUrl: "http://127.0.0.1:3001",
        platform: "linux",
        execFile,
      }),
    ).rejects.toThrow("RETENTION_SOAK_EXPECTED_SHA_INVALID");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("rejects arbitrary or missing container roles before inspection", async () => {
    const execFile = vi.fn();
    for (const containerRoles of [
      { ...roles, database: "arbitrary" },
      Object.fromEntries(
        Object.entries(roles).filter(([role]) => role !== "minio"),
      ),
    ]) {
      await expect(
        collectRetentionSoakProvenance({
          containerRoles: containerRoles as RetentionSoakContainerRoles,
          expectedBuildSha,
          apiUrl: "http://127.0.0.1:3001",
          platform: "linux",
          execFile,
        }),
      ).rejects.toThrow("RETENTION_SOAK_CONTAINER_ROLE_MAPPING_INVALID");
    }
    expect(execFile).not.toHaveBeenCalled();
  });

  it("rejects a dirty checkout or a source HEAD different from the expected SHA", async () => {
    const create = (head: string, status: string) =>
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        platform: "linux",
        execFile: async (executable, args) => {
          if (executable !== "git") throw new Error("unexpected inspection");
          return args[0] === "rev-parse" ? head : status;
        },
      });
    await expect(create(expectedBuildSha, " M source.ts\n")).rejects.toThrow(
      "RETENTION_SOAK_SOURCE_PROVENANCE_MISMATCH",
    );
    await expect(create("b".repeat(40), "")).rejects.toThrow(
      "RETENTION_SOAK_SOURCE_PROVENANCE_MISMATCH",
    );
  });
});
