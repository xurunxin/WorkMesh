import { retentionSoakProvisionOptionsFromEnvironment } from "./retention-soak-provision-environment.js";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

const result = await provisionRetentionSoak(
  retentionSoakProvisionOptionsFromEnvironment(process.env),
);

process.stdout.write(
  `${JSON.stringify({
    status: "provisioned",
    schemaVersion: result.state.schemaVersion,
    statePath: result.statePath,
  })}\n`,
);
