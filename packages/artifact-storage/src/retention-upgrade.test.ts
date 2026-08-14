import { describe, expect, it } from "vitest";
import { S3RetentionUpgradeReader } from "./retention-upgrade.js";

const readerFor = (
  send: (command: {
    constructor: { name: string };
    input: Record<string, unknown>;
  }) => Promise<unknown>,
) =>
  new S3RetentionUpgradeReader({
    bucket: "archives",
    config: {
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    },
    client: { send } as never,
  });

describe("retention upgrade S3 reader", () => {
  it("fully paginates versions and keeps delete markers visible", async () => {
    const inputs: Record<string, unknown>[] = [];
    let page = 0;
    const reader = readerFor(async (command) => {
      expect(command.constructor.name).toBe("ListObjectVersionsCommand");
      inputs.push(command.input);
      page += 1;
      return page === 1
        ? {
            IsTruncated: true,
            NextKeyMarker: "retention/a",
            NextVersionIdMarker: "version-a",
            Versions: [{ Key: "retention/a", VersionId: "version-a" }],
            DeleteMarkers: [
              { Key: "retention/deleted", VersionId: "marker-1" },
            ],
          }
        : {
            IsTruncated: false,
            Versions: [{ Key: "retention/b", VersionId: "version-b" }],
          };
    });

    await expect(reader.listObjectVersions("retention/")).resolves.toEqual({
      versions: [
        { key: "retention/a", versionId: "version-a" },
        { key: "retention/b", versionId: "version-b" },
      ],
      deleteMarkers: [{ key: "retention/deleted", versionId: "marker-1" }],
    });
    expect(inputs).toEqual([
      { Bucket: "archives", Prefix: "retention/" },
      {
        Bucket: "archives",
        Prefix: "retention/",
        KeyMarker: "retention/a",
        VersionIdMarker: "version-a",
      },
    ]);
  });

  it("uses a version-pinned HEAD and returns all barrier fields", async () => {
    const retainUntil = new Date("2027-07-01T00:00:00.000Z");
    let input: Record<string, unknown> | undefined;
    const reader = readerFor(async (command) => {
      expect(command.constructor.name).toBe("HeadObjectCommand");
      input = command.input;
      return {
        VersionId: "version-1",
        ContentLength: 7,
        ContentType: "application/gzip",
        ChecksumSHA256: "checksum-header",
        Metadata: { workmeshchecksum: "sha256:checksum" },
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
      };
    });

    await expect(
      reader.inspectObjectVersion({
        key: "retention/a",
        versionId: "version-1",
      }),
    ).resolves.toEqual({
      versionId: "version-1",
      sizeBytes: 7,
      mimeType: "application/gzip",
      checksum: "sha256:checksum",
      checksumHeader: "checksum-header",
      retainUntil,
      objectLockMode: "COMPLIANCE",
    });
    expect(input).toEqual({
      Bucket: "archives",
      Key: "retention/a",
      VersionId: "version-1",
      ChecksumMode: "ENABLED",
    });
  });

  it("fails closed on a malformed or repeated pagination marker", async () => {
    const reader = readerFor(async () => ({
      IsTruncated: true,
      NextKeyMarker: "same-key",
    }));
    await expect(reader.listObjectVersions("retention/")).rejects.toThrow(
      "ARTIFACT_VERSION_LIST_PAGINATION_INVALID",
    );
  });
});
