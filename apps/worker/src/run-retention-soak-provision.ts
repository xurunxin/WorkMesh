import { resolve } from "node:path";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

const required = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
};

const mode = required(
  process.env.WORKMESH_RETENTION_SOAK_PROVISION_MODE,
  "RETENTION_SOAK_PROVISION_REQUIRES_MODE",
);
if (mode !== "clean_stack" && mode !== "existing_installation")
  throw new Error("RETENTION_SOAK_PROVISION_MODE_INVALID");

const result = await provisionRetentionSoak({
  apiUrl: required(
    process.env.WORKMESH_RETENTION_SOAK_API_URL,
    "RETENTION_SOAK_PROVISION_REQUIRES_API_URL",
  ),
  mode,
  bootstrapToken: process.env.WORKMESH_BOOTSTRAP_TOKEN,
  adminEmail: process.env.WORKMESH_RETENTION_SOAK_ADMIN_EMAIL,
  adminPassword: process.env.WORKMESH_RETENTION_SOAK_ADMIN_PASSWORD,
  statePath: resolve(
    required(
      process.env.WORKMESH_RETENTION_SOAK_STATE_PATH,
      "RETENTION_SOAK_PROVISION_REQUIRES_STATE_PATH",
    ),
  ),
});

process.stdout.write(
  `${JSON.stringify({
    status: "provisioned",
    schemaVersion: result.state.schemaVersion,
    statePath: result.statePath,
  })}\n`,
);
