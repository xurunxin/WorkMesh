import { retentionSoakProvisionOptionsFromEnvironment } from "./retention-soak-provision-environment.js";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

const result = await provisionRetentionSoak(
  retentionSoakProvisionOptionsFromEnvironment(process.env),
);

// Keep the provisioning-to-workload handoff in one process. The harness
// independently rejects an old schema-v2 Session before attempting a refresh.
process.env.WORKMESH_RETENTION_SOAK_SESSION_ID = result.state.sessionId;
process.env.WORKMESH_RETENTION_SOAK_INSTALLATION_TOKEN =
  result.state.installationToken;
await import("./run-retention-soak.js");
