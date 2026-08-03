import { describe, expect, it, vi } from "vitest";
import { releaseMetadata } from "@workmesh/contracts";
import {
  collectRetentionSoakEndingEvidence,
  collectRetentionSoakProvenance,
  parseRetentionSoakContainerStats,
  retentionSoakProvenanceMatches,
  retentionSoakWorkerFreshnessProof,
  waitForRetentionSoakInitialWorkerFreshness,
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
    serviceRole?: keyof typeof roles;
    serviceName?: string;
    projectRole?: keyof typeof roles;
    projectName?: string;
    containerIdSuffix?: string;
    workerInstanceId?: string;
    workerBuildSha?: string;
  }> = {},
) => {
  const containers = roleNames.map((role, index) => ({
    Id: `container-${index}${overrides.containerIdSuffix ?? ""}`,
    Name: `/${roles[role]}`,
    Image: `sha256:${String(index + 1).repeat(64)}`,
    State: { Running: true },
    Config: {
      Labels: {
        "com.docker.compose.project":
          overrides.projectRole === role
            ? overrides.projectName
            : "workmesh-proof",
        "com.docker.compose.service":
          overrides.serviceRole === role ? overrides.serviceName : role,
      },
    },
    NetworkSettings: {
      Ports: {
        ...(role === "api"
          ? { "3001/tcp": [{ HostIp: "127.0.0.1", HostPort: "3001" }] }
          : {}),
        ...(role === "postgres"
          ? { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "5432" }] }
          : {}),
        ...(role === "redis"
          ? { "6379/tcp": [{ HostIp: "127.0.0.1", HostPort: "6379" }] }
          : {}),
      },
    },
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
  const workerIdentity = {
    schemaVersion: 1,
    instanceId:
      overrides.workerInstanceId ??
      "00000000-0000-4000-8000-000000000001",
    buildSha: overrides.workerBuildSha ?? expectedBuildSha,
    startedAt: "2026-07-29T00:00:00.000Z",
  };
  return { containers, images, workerIdentity };
};

const releaseInfo = (buildSha = expectedBuildSha): Response =>
  new Response(
    JSON.stringify({
      ...releaseMetadata,
      buildSha,
    }),
    { headers: { "content-type": "application/json" } },
  );

const collect = (
  data: ReturnType<typeof inspections>,
  options: Readonly<{
    response?: Response;
    apiUrl?: string;
    databaseUrl?: string;
    redisUrl?: string;
  }> = {},
) =>
  collectRetentionSoakProvenance({
    containerRoles: roles,
    expectedBuildSha,
    apiUrl: options.apiUrl ?? "http://127.0.0.1:3001",
    databaseUrl:
      options.databaseUrl ??
      "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
    redisUrl: options.redisUrl ?? "redis://127.0.0.1:6379",
    platform: "linux",
    execFile: async (executable, args) => {
      if (executable === "git")
        return args[0] === "rev-parse" ? `${expectedBuildSha}\n` : "";
      if (args[0] === "inspect") return JSON.stringify(data.containers);
      if (args[0] === "image") return JSON.stringify(data.images);
      if (args[0] === "exec") return JSON.stringify(data.workerIdentity);
      throw new Error("unexpected command");
    },
    fetch: vi
      .fn<typeof fetch>()
      .mockResolvedValue(options.response ?? releaseInfo()),
  });

describe("retention soak formal provenance", () => {
  it("maps exactly five roles and verifies immutable images plus API/Worker SHA", async () => {
    const data = inspections();
    const execFile = vi.fn(async (executable: string, args: readonly string[]) => {
      if (executable === "git")
        return args[0] === "rev-parse" ? `${expectedBuildSha}\n` : "";
      if (args[0] === "inspect") return JSON.stringify(data.containers);
      if (args[0] === "image") return JSON.stringify(data.images);
      if (args[0] === "exec") return JSON.stringify(data.workerIdentity);
      throw new Error("unexpected command");
    });

    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        databaseUrl:
          "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
        redisUrl: "redis://127.0.0.1:6379",
        platform: "linux",
        execFile,
        fetch: vi.fn<typeof fetch>().mockResolvedValue(releaseInfo()),
      }),
    ).resolves.toMatchObject({
      verified: true,
      expectedBuildSha,
      sourceHeadSha: expectedBuildSha,
      apiBuildSha: expectedBuildSha,
      composeProject: "workmesh-proof",
      workerRuntimeIdentity: {
        schemaVersion: 1,
        instanceId: "00000000-0000-4000-8000-000000000001",
        buildSha: expectedBuildSha,
        containerId: "container-1",
      },
      endpoints: {
        api: { role: "api", hostPort: 3001, containerPort: 3001 },
        postgres: {
          role: "postgres",
          hostPort: 5432,
          containerPort: 5432,
        },
        redis: { role: "redis", hostPort: 6379, containerPort: 6379 },
      },
      roles: {
        api: {
          containerName: "workmesh-api",
          revision: expectedBuildSha,
          composeService: "api",
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
    expect(execFile).toHaveBeenCalledTimes(5);
    expect(execFile).toHaveBeenCalledWith(
      "docker",
      [
        "exec",
        "container-1",
        "cat",
        "/tmp/workmesh-worker-runtime-identity.json",
      ],
      10_000,
    );
  });

  it("rejects missing digests, wrong image revisions, and wrong API build SHA", async () => {
    await expect(
      collect(inspections({ missingDigestRole: "minio" })),
    ).rejects.toThrow("RETENTION_SOAK_IMMUTABLE_IMAGE_DIGEST_REQUIRED");
    await expect(
      collect(inspections({ missingRevisionRole: "postgres" })),
    ).rejects.toThrow("RETENTION_SOAK_IMAGE_REVISION_REQUIRED");
    await expect(
      collect(inspections({ workerRevision: "b".repeat(40) })),
    ).rejects.toThrow("RETENTION_SOAK_IMAGE_REVISION_MISMATCH");
    await expect(
      collect(inspections(), { response: releaseInfo("b".repeat(40)) }),
    ).rejects.toThrow("RETENTION_SOAK_API_BUILD_SHA_MISMATCH");
    await expect(
      collect(inspections({ workerBuildSha: "b".repeat(40) })),
    ).rejects.toThrow("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
  });

  it("rejects native Windows and an invalid expected SHA before inspection", async () => {
    const execFile = vi.fn();
    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha,
        apiUrl: "http://127.0.0.1:3001",
        databaseUrl:
          "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
        redisUrl: "redis://127.0.0.1:6379",
        platform: "win32",
        execFile,
      }),
    ).rejects.toThrow("RETENTION_SOAK_FORMAL_NATIVE_WINDOWS_UNSUPPORTED");
    await expect(
      collectRetentionSoakProvenance({
        containerRoles: roles,
        expectedBuildSha: "dirty",
        apiUrl: "http://127.0.0.1:3001",
        databaseUrl:
          "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
        redisUrl: "redis://127.0.0.1:6379",
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
          databaseUrl:
            "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
          redisUrl: "redis://127.0.0.1:6379",
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
        databaseUrl:
          "postgres://workmesh:secret@127.0.0.1:5432/workmesh",
        redisUrl: "redis://127.0.0.1:6379",
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

  it("rejects swapped Compose roles, unrelated projects, and endpoint mismatches", async () => {
    await expect(
      collect(inspections({ serviceRole: "api", serviceName: "worker" })),
    ).rejects.toThrow("RETENTION_SOAK_COMPOSE_SERVICE_MISMATCH");
    await expect(
      collect(
        inspections({
          projectRole: "redis",
          projectName: "unrelated-project",
        }),
      ),
    ).rejects.toThrow("RETENTION_SOAK_COMPOSE_PROJECT_MISMATCH");
    await expect(
      collect(inspections(), {
        databaseUrl:
          "postgres://workmesh:secret@127.0.0.1:55432/workmesh",
      }),
    ).rejects.toThrow("RETENTION_SOAK_ENDPOINT_BINDING_MISMATCH");
  });

  it("detects container ID drift in every stats sample and at end of run", async () => {
    const initial = await collect(inspections());
    const stats = roleNames
      .map((role) =>
        JSON.stringify({
          ID: initial.roles[role].containerId,
          Name: initial.roles[role].containerName,
          CPUPerc: "1.5%",
          MemUsage: "16MiB / 1GiB",
        }),
      )
      .join("\n");
    expect(parseRetentionSoakContainerStats(stats, initial)).toHaveProperty(
      "workmesh-worker.memoryBytes",
      16 * 1_048_576,
    );
    const driftedStats = stats.replace(
      initial.roles.worker.containerId,
      "recreated-worker",
    );
    expect(() =>
      parseRetentionSoakContainerStats(driftedStats, initial),
    ).toThrow("RETENTION_SOAK_CONTAINER_ID_DRIFT");

    const ending = await collect(
      inspections({
        containerIdSuffix: "-recreated",
        workerInstanceId: "00000000-0000-4000-8000-000000000002",
      }),
    );
    expect(retentionSoakProvenanceMatches(initial, await collect(inspections()))).toBe(
      true,
    );
    expect(retentionSoakProvenanceMatches(initial, ending)).toBe(false);
  });

  it("binds durable Worker freshness evidence to the inspected Worker container", async () => {
    const provenance = await collect(inspections());
    const observedAt = new Date("2026-07-29T00:01:00.000Z");
    expect(
      retentionSoakWorkerFreshnessProof(
        provenance.workerRuntimeIdentity,
        {
          workerMode: "archive_only",
          workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
          workerInstanceId:
            provenance.workerRuntimeIdentity.instanceId,
          workerBuildSha: provenance.workerRuntimeIdentity.buildSha,
          workerIdentityConflictCount: "7",
        },
        observedAt,
      ),
    ).toMatchObject({
      verified: true,
      workerContainerId: provenance.roles.worker.containerId,
      workerInstanceId: provenance.workerRuntimeIdentity.instanceId,
      workerBuildSha: expectedBuildSha,
      workerIdentityConflictCount: "7",
      workerMode: "archive_only",
      ageMs: 60_000,
    });
    expect(() =>
      retentionSoakWorkerFreshnessProof(
        provenance.workerRuntimeIdentity,
        {
          workerMode: "archive_only",
          workerSeenAt: new Date("2026-07-28T23:58:59.999Z"),
          workerInstanceId:
            provenance.workerRuntimeIdentity.instanceId,
          workerBuildSha: provenance.workerRuntimeIdentity.buildSha,
          workerIdentityConflictCount: "7",
        },
        observedAt,
      ),
    ).toThrow("RETENTION_SOAK_REQUIRES_FRESH_ARCHIVE_ONLY_WORKER");
    expect(() =>
      retentionSoakWorkerFreshnessProof(
        provenance.workerRuntimeIdentity,
        {
          workerMode: "archive_only",
          workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
          workerInstanceId: "00000000-0000-4000-8000-000000000099",
          workerBuildSha: expectedBuildSha,
          workerIdentityConflictCount: "7",
        },
        observedAt,
      ),
    ).toThrow("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
    expect(() =>
      retentionSoakWorkerFreshnessProof(
        provenance.workerRuntimeIdentity,
        {
          workerMode: "archive_only",
          workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
          workerInstanceId:
            provenance.workerRuntimeIdentity.instanceId,
          workerBuildSha: expectedBuildSha,
          workerIdentityConflictCount: "8",
        },
        observedAt,
        120_000,
        "7",
      ),
    ).toThrow("RETENTION_SOAK_WORKER_IDENTITY_CONFLICT_DETECTED");
  });

  it("keeps heartbeats active while a new Workspace awaits its first Worker runtime row", async () => {
    const provenance = await collect(inspections());
    const assertHeartbeatHealthy = vi.fn();
    const wait = vi.fn(async () => {});
    const ready = {
      workerMode: "archive_only" as const,
      workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
      workerInstanceId: provenance.workerRuntimeIdentity.instanceId,
      workerBuildSha: provenance.workerRuntimeIdentity.buildSha,
      workerIdentityConflictCount: "0",
    };
    const readRuntime = vi
      .fn()
      .mockResolvedValueOnce({
        workerMode: null,
        workerSeenAt: null,
        workerInstanceId: null,
        workerBuildSha: null,
        workerIdentityConflictCount: "0",
      })
      .mockResolvedValueOnce(ready);

    await expect(
      waitForRetentionSoakInitialWorkerFreshness({
        workerRuntimeIdentity: provenance.workerRuntimeIdentity,
        readRuntime,
        assertHeartbeatHealthy,
        wait,
        now: () => new Date("2026-07-29T00:00:01.000Z"),
      }),
    ).resolves.toMatchObject({
      verified: true,
      workerInstanceId: provenance.workerRuntimeIdentity.instanceId,
      workerMode: "archive_only",
    });
    expect(readRuntime).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(assertHeartbeatHealthy).toHaveBeenCalledTimes(3);
  });

  it("times out an absent initial Worker row and fails conflicting provenance immediately", async () => {
    const provenance = await collect(inspections());
    let elapsedMs = 0;
    const missing = {
      workerMode: null,
      workerSeenAt: null,
      workerInstanceId: null,
      workerBuildSha: null,
      workerIdentityConflictCount: "0",
    };
    await expect(
      waitForRetentionSoakInitialWorkerFreshness({
        workerRuntimeIdentity: provenance.workerRuntimeIdentity,
        readRuntime: async () => missing,
        assertHeartbeatHealthy: () => {},
        timeoutMs: 1_000,
        intervalMs: 250,
        now: () => new Date(elapsedMs),
        wait: async (milliseconds) => {
          elapsedMs += milliseconds;
        },
      }),
    ).rejects.toThrow("RETENTION_SOAK_WORKER_READINESS_TIMEOUT");

    const wait = vi.fn(async () => {});
    await expect(
      waitForRetentionSoakInitialWorkerFreshness({
        workerRuntimeIdentity: provenance.workerRuntimeIdentity,
        readRuntime: async () => ({
          workerMode: "archive_only",
          workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
          workerInstanceId: "00000000-0000-4000-8000-000000000099",
          workerBuildSha: provenance.workerRuntimeIdentity.buildSha,
          workerIdentityConflictCount: "1",
        }),
        assertHeartbeatHealthy: () => {},
        wait,
        now: () => new Date("2026-07-29T00:00:01.000Z"),
      }),
    ).rejects.toThrow("RETENTION_SOAK_WORKER_IDENTITY_MISMATCH");
    expect(wait).not.toHaveBeenCalled();
  });

  it("observes ending Worker freshness after database and provenance reads", async () => {
    const provenance = await collect(inspections());
    const trace: string[] = [];
    const runtime = {
      workerMode: "archive_only",
      workerSeenAt: new Date("2026-07-29T00:00:00.000Z"),
      workerInstanceId: provenance.workerRuntimeIdentity.instanceId,
      workerBuildSha: provenance.workerRuntimeIdentity.buildSha,
      workerIdentityConflictCount: "0",
    };
    await expect(
      collectRetentionSoakEndingEvidence({
        readRuntime: async () => {
          trace.push("database");
          return runtime;
        },
        collectProvenance: async () => {
          trace.push("provenance");
          return provenance;
        },
        now: () => {
          trace.push("observation");
          return new Date("2026-07-29T00:02:00.001Z");
        },
        maximumAgeMs: 120_000,
        expectedConflictCount: "0",
      }),
    ).rejects.toThrow("RETENTION_SOAK_REQUIRES_FRESH_ARCHIVE_ONLY_WORKER");
    expect(trace).toEqual(["database", "provenance", "observation"]);
  });
});
