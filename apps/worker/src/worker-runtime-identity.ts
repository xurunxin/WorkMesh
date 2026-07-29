import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const WORKER_RUNTIME_IDENTITY_CONTAINER_PATH =
  "/tmp/workmesh-worker-runtime-identity.json";

export type WorkerRuntimeIdentity = Readonly<{
  schemaVersion: 1;
  instanceId: string;
  buildSha: string;
  startedAt: string;
}>;

const safeBuildSha = (value: string | undefined): string => {
  const buildSha = value?.trim() || "unknown";
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(buildSha))
    throw new Error("WORKER_RUNTIME_BUILD_SHA_INVALID");
  return buildSha;
};

export const createWorkerRuntimeIdentity = (
  env: NodeJS.ProcessEnv = process.env,
  options: Readonly<{
    instanceId?: () => string;
    now?: () => Date;
  }> = {},
): WorkerRuntimeIdentity => {
  const instanceId = (options.instanceId ?? randomUUID)();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      instanceId,
    )
  )
    throw new Error("WORKER_RUNTIME_INSTANCE_ID_INVALID");
  return {
    schemaVersion: 1,
    instanceId,
    buildSha: safeBuildSha(env.WORKMESH_BUILD_SHA),
    startedAt: (options.now ?? (() => new Date()))().toISOString(),
  };
};

export const workerRuntimeIdentityPath = (
  platform: NodeJS.Platform = process.platform,
): string =>
  platform === "win32"
    ? resolve(".tmp/worker-runtime-identity.json")
    : WORKER_RUNTIME_IDENTITY_CONTAINER_PATH;

export const materializeWorkerRuntimeIdentity = async (
  options: Readonly<{
    env?: NodeJS.ProcessEnv;
    path?: string;
    identity?: WorkerRuntimeIdentity;
  }> = {},
): Promise<WorkerRuntimeIdentity> => {
  const identity =
    options.identity ?? createWorkerRuntimeIdentity(options.env ?? process.env);
  const path = resolve(options.path ?? workerRuntimeIdentityPath());
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const file = await open(temporaryPath, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(identity)}\n`, {
      encoding: "utf8",
    });
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  return identity;
};
