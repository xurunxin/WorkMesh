import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const WORKER_RUNTIME_IDENTITY_CONTAINER_PATH =
  "/tmp/workmesh-worker-runtime-identity.json";

export type WorkerRuntimeIdentity = Readonly<{
  schemaVersion: 1;
  instanceId: string;
  buildSha: string;
  startedAt: string;
}>;

type WorkerRuntimeIdentityFile = Pick<
  FileHandle,
  "writeFile" | "sync" | "close"
>;

type WorkerRuntimeIdentityFileSystem = Readonly<{
  mkdir: (
    path: string,
    options: Readonly<{ recursive: true; mode: number }>,
  ) => Promise<unknown>;
  open: (
    path: string,
    flags: "wx",
    mode: number,
  ) => Promise<WorkerRuntimeIdentityFile>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (
    path: string,
    options: Readonly<{ force: true }>,
  ) => Promise<void>;
}>;

const defaultFileSystem: WorkerRuntimeIdentityFileSystem = {
  mkdir,
  open,
  rename,
  rm,
};

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
    fileSystem?: Partial<WorkerRuntimeIdentityFileSystem>;
  }> = {},
): Promise<WorkerRuntimeIdentity> => {
  const identity =
    options.identity ?? createWorkerRuntimeIdentity(options.env ?? process.env);
  const path = resolve(options.path ?? workerRuntimeIdentityPath());
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const fileSystem = { ...defaultFileSystem, ...options.fileSystem };
  let file: WorkerRuntimeIdentityFile | undefined;
  try {
    await fileSystem.mkdir(dirname(path), { recursive: true, mode: 0o700 });
    file = await fileSystem.open(temporaryPath, "wx", 0o600);
    await file.writeFile(`${JSON.stringify(identity)}\n`, {
      encoding: "utf8",
    });
    await file.sync();
    await file.close();
    file = undefined;
    await fileSystem.rename(temporaryPath, path);
  } catch (error) {
    if (file)
      try {
        await file.close();
      } catch {
        // Cleanup is best effort and must not replace the lifecycle failure.
      }
    try {
      await fileSystem.rm(temporaryPath, { force: true });
    } catch {
      // Cleanup is best effort and must not replace the lifecycle failure.
    }
    throw error;
  }
  return identity;
};
