import type { SpawnOptions } from "node:child_process";

export const RETENTION_SOAK_FORMAL_LOCK_FD = 3;
export const RETENTION_SOAK_FORMAL_LOCK_COMMAND =
  'flock --nonblock --exclusive "$WORKMESH_RETENTION_SOAK_LOCK_FD" || exit 75; exec "$@"';

export type RetentionSoakFormalLaunchSpec = Readonly<{
  executable: "/bin/sh";
  args: readonly string[];
  options: SpawnOptions;
}>;

export const createRetentionSoakFormalLaunchSpec = ({
  childEnv,
  harness,
  harnessArguments,
  lockFileFd,
  nodeExecutable = process.execPath,
  tsxRegistration,
}: Readonly<{
  childEnv: NodeJS.ProcessEnv;
  harness: string;
  harnessArguments: readonly string[];
  lockFileFd: number;
  nodeExecutable?: string;
  tsxRegistration: string;
}>): RetentionSoakFormalLaunchSpec => ({
  executable: "/bin/sh",
  args: [
    "-c",
    RETENTION_SOAK_FORMAL_LOCK_COMMAND,
    "retention-soak-lock",
    nodeExecutable,
    "--import",
    tsxRegistration,
    harness,
    ...harnessArguments,
  ],
  options: {
    env: {
      ...childEnv,
      WORKMESH_RETENTION_SOAK_LOCK_FD: String(RETENTION_SOAK_FORMAL_LOCK_FD),
    },
    stdio: ["inherit", "inherit", "inherit", lockFileFd],
    windowsHide: true,
  },
});
