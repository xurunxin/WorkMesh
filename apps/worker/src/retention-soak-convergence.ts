import type { RetentionSoakSample } from "./retention-soak.js";

export const retentionSoakDrainConverged = (
  baseline: RetentionSoakSample,
  sample: RetentionSoakSample,
): boolean =>
  sample.archive.currentRunGenerated > 0 &&
  sample.archive.currentRunArchived === sample.archive.currentRunGenerated &&
  sample.archive.verifiedRows - baseline.archive.verifiedRows >=
    sample.archive.currentRunGenerated &&
  sample.archive.backlog <= baseline.archive.backlog &&
  sample.outbox.pending <= baseline.outbox.pending;
