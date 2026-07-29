import { resolve } from "node:path";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

const required = (value: string | undefined, code: string): string => {
  if (!value?.trim()) throw new Error(code);
  return value.trim();
};

const result = await provisionRetentionSoak({
  apiUrl: required(
    process.env.WORKMESH_RETENTION_SOAK_API_URL,
    "RETENTION_SOAK_PROVISION_REQUIRES_API_URL",
  ),
  bootstrapToken: required(
    process.env.WORKMESH_BOOTSTRAP_TOKEN,
    "RETENTION_SOAK_PROVISION_REQUIRES_BOOTSTRAP_TOKEN",
  ),
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
