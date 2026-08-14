import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  ArtifactObjectVersionExpectation,
  ArtifactObjectVersionHead,
  ArtifactObjectVersionInventory,
} from "@workmesh/artifact-storage";
import type { Db } from "@workmesh/db";
import {
  RETENTION_UPGRADE_EXPECTED_MIGRATIONS,
  runRetentionUpgradeBarrier,
} from "./retention-upgrade-barrier.js";

const body = Buffer.from("retention upgrade barrier");
const checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
const checksumHeader = Buffer.from(checksum.slice(7), "hex").toString("base64");
const retainUntil = new Date("2027-08-01T00:00:00.000Z");
const archiveRow = {
  key: "retention/events/workspace/segment.ndjson.gz",
  versionId: "version-1",
  checksum,
  sizeBytes: String(body.length),
  retainUntil,
};

const dbFor = ({
  activeClaims = 0,
  migrations = [...RETENTION_UPGRADE_EXPECTED_MIGRATIONS],
  snapshots = [[archiveRow], [archiveRow]],
}: {
  activeClaims?: number;
  migrations?: readonly string[];
  snapshots?: readonly (readonly (typeof archiveRow)[])[];
} = {}): Pick<Db, "query"> => {
  let archiveRead = 0;
  return {
    query: (async (sql: string) => {
      if (sql.includes("FROM schema_migrations"))
        return { rows: migrations.map((version) => ({ version })) };
      if (sql.includes("FROM retention_job_state"))
        return { rows: [{ count: String(activeClaims) }] };
      if (sql.includes("FROM event_archive_segments")) {
        const rows =
          snapshots[Math.min(archiveRead, snapshots.length - 1)] ?? [];
        archiveRead += 1;
        return { rows };
      }
      throw new Error("UNEXPECTED_BARRIER_QUERY");
    }) as never,
  };
};

const headFor = (
  expectation: ArtifactObjectVersionExpectation,
  row = archiveRow,
): ArtifactObjectVersionHead => ({
  versionId: expectation.versionId,
  sizeBytes: Number(row.sizeBytes),
  mimeType: "application/gzip",
  checksum: row.checksum,
  checksumHeader: Buffer.from(row.checksum.slice(7), "hex").toString("base64"),
  retainUntil: row.retainUntil,
  objectLockMode: "COMPLIANCE",
});

const inventory = (
  versions: ArtifactObjectVersionInventory["versions"] = [
    { key: archiveRow.key, versionId: archiveRow.versionId },
  ],
  deleteMarkers: ArtifactObjectVersionInventory["deleteMarkers"] = [],
): ArtifactObjectVersionInventory => ({ versions, deleteMarkers });

const storageFor = ({
  inventories = [inventory(), inventory()],
  inspect = async (expectation: ArtifactObjectVersionExpectation) =>
    headFor(expectation),
}: {
  inventories?: readonly ArtifactObjectVersionInventory[];
  inspect?: (
    expectation: ArtifactObjectVersionExpectation,
  ) => Promise<ArtifactObjectVersionHead>;
} = {}) => {
  let listCall = 0;
  return {
    async listObjectVersions() {
      const result = inventories[Math.min(listCall, inventories.length - 1)]!;
      listCall += 1;
      return result;
    },
    inspectObjectVersion: inspect,
  };
};

const run = (
  overrides: Partial<Parameters<typeof runRetentionUpgradeBarrier>[0]> = {},
) =>
  runRetentionUpgradeBarrier({
    db: dbFor(),
    storage: storageFor(),
    archivePrefix: "retention/events",
    expectThrough: 29,
    stabilityDelayMs: 17,
    delay: async () => {},
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    ...overrides,
  });

describe("retention production upgrade barrier", () => {
  it("accepts two stable, exact, version-pinned snapshots", async () => {
    const delay = vi.fn(async () => {});
    await expect(run({ delay })).resolves.toEqual({
      expectedThrough: 29,
      snapshotDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      objectCount: 1,
      snapshots: 2,
      checkedAt: "2026-07-30T00:00:00.000Z",
    });
    expect(delay).toHaveBeenCalledExactlyOnceWith(17);
  });

  it.each([
    {
      name: "orphan version",
      inventory: inventory([
        { key: archiveRow.key, versionId: archiveRow.versionId },
        { key: "retention/events/orphan", versionId: "orphan-version" },
      ]),
      code: "RETENTION_UPGRADE_OBJECT_ORPHAN",
    },
    {
      name: "missing version",
      inventory: inventory([]),
      code: "RETENTION_UPGRADE_OBJECT_MISSING",
    },
    {
      name: "multiple versions",
      inventory: inventory([
        { key: archiveRow.key, versionId: archiveRow.versionId },
        { key: archiveRow.key, versionId: "version-2" },
      ]),
      code: "RETENTION_UPGRADE_MULTIVERSION",
    },
    {
      name: "delete marker",
      inventory: inventory(
        [{ key: archiveRow.key, versionId: archiveRow.versionId }],
        [{ key: archiveRow.key, versionId: "delete-marker-1" }],
      ),
      code: "RETENTION_UPGRADE_DELETE_MARKER",
    },
  ])("aborts on $name", async ({ inventory: found, code }) => {
    await expect(
      run({ storage: storageFor({ inventories: [found] }) }),
    ).rejects.toMatchObject({ code });
  });

  it("maps ListObjectVersions IAM denial to a stable error code", async () => {
    await expect(
      run({
        storage: {
          async listObjectVersions() {
            throw Object.assign(new Error("sensitive provider text"), {
              name: "AccessDenied",
              $metadata: { httpStatusCode: 403 },
            });
          },
          async inspectObjectVersion(expectation) {
            return headFor(expectation);
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_S3_LIST_DENIED",
      message: "RETENTION_UPGRADE_S3_LIST_DENIED",
    });
  });

  it("rejects object metadata, lock, or checksum mismatch", async () => {
    await expect(
      run({
        storage: storageFor({
          inspect: async (expectation) => ({
            ...headFor(expectation),
            checksumHeader: checksumHeader.replace(/.$/, "A"),
          }),
        }),
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_OBJECT_MISMATCH",
    });
  });

  it("rejects a self-consistent inventory that changes between snapshots", async () => {
    const secondChecksum = `sha256:${"b".repeat(64)}`;
    const secondRow = { ...archiveRow, checksum: secondChecksum };
    let inspection = 0;
    await expect(
      run({
        db: dbFor({ snapshots: [[archiveRow], [secondRow]] }),
        storage: storageFor({
          inspect: async (expectation) => {
            const row = inspection === 0 ? archiveRow : secondRow;
            inspection += 1;
            return headFor(expectation, row);
          },
        }),
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_SNAPSHOT_UNSTABLE",
    });
  });

  it("rejects an active claim and any schema state other than exactly through 29", async () => {
    await expect(run({ db: dbFor({ activeClaims: 1 }) })).rejects.toMatchObject(
      {
        code: "RETENTION_UPGRADE_RETENTION_CLAIM_ACTIVE",
      },
    );
    await expect(
      run({
        db: dbFor({
          migrations: [
            ...RETENTION_UPGRADE_EXPECTED_MIGRATIONS,
            "0030_durable_archive_upload_intents",
          ],
        }),
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_SCHEMA_0030_PRESENT",
    });
    await expect(
      run({
        db: dbFor({
          migrations: RETENTION_UPGRADE_EXPECTED_MIGRATIONS.slice(0, -1),
        }),
      }),
    ).rejects.toMatchObject({
      code: "RETENTION_UPGRADE_SCHEMA_LEDGER_MISMATCH",
    });
  });
});
