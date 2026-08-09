import process from "node:process";
import { retentionUpgradeReaderFromEnvironment } from "@workmesh/artifact-storage";
import { loadRetentionConfig } from "@workmesh/config";
import { createDb } from "@workmesh/db";
import {
  RetentionUpgradeBarrierError,
  runRetentionUpgradeBarrier,
} from "./retention-upgrade-barrier.js";

const argument = process.argv.slice(2);
if (argument.length !== 1 || !argument[0]!.startsWith("--expect-through="))
  throw new Error(
    "Usage: node dist/run-retention-upgrade-barrier.js --expect-through=29",
  );
const expectThrough = Number(argument[0]!.slice("--expect-through=".length));
const db = createDb();
try {
  const result = await runRetentionUpgradeBarrier({
    db,
    storage: retentionUpgradeReaderFromEnvironment(),
    archivePrefix: loadRetentionConfig().archivePrefix,
    expectThrough,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure =
    error instanceof RetentionUpgradeBarrierError
      ? { code: error.code, ...error.details }
      : { code: "RETENTION_UPGRADE_BARRIER_FAILED" };
  process.stderr.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
} finally {
  await db.end();
}
