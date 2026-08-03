import { resolve } from "node:path";
import type { RetentionSoakProvisionOptions } from "./retention-soak-provision.js";

const required = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
};

export const retentionSoakProvisionOptionsFromEnvironment = (
  env: NodeJS.ProcessEnv,
): RetentionSoakProvisionOptions => {
  const mode = required(
    env.WORKMESH_RETENTION_SOAK_PROVISION_MODE,
    "RETENTION_SOAK_PROVISION_REQUIRES_MODE",
  );
  if (mode !== "clean_stack" && mode !== "existing_installation")
    throw new Error("RETENTION_SOAK_PROVISION_MODE_INVALID");
  return {
    apiUrl: required(
      env.WORKMESH_RETENTION_SOAK_API_URL,
      "RETENTION_SOAK_PROVISION_REQUIRES_API_URL",
    ),
    mode,
    bootstrapToken: env.WORKMESH_BOOTSTRAP_TOKEN,
    adminEmail: env.WORKMESH_RETENTION_SOAK_ADMIN_EMAIL,
    adminPassword: env.WORKMESH_RETENTION_SOAK_ADMIN_PASSWORD,
    statePath: resolve(
      required(
        env.WORKMESH_RETENTION_SOAK_STATE_PATH,
        "RETENTION_SOAK_PROVISION_REQUIRES_STATE_PATH",
      ),
    ),
  };
};
