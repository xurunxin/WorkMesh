import {
  HeadObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

type ObjectClient = Pick<S3Client, "send">;

export type ArtifactObjectVersionInventory = Readonly<{
  versions: readonly Readonly<{ key: string; versionId: string }>[];
  deleteMarkers: readonly Readonly<{ key: string; versionId: string }>[];
}>;

export type ArtifactObjectVersionHead = Readonly<{
  versionId: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
  checksum: string | null;
  checksumHeader: string | null;
  retainUntil: Date | null;
  objectLockMode: string | null;
}>;

export type ArtifactObjectVersionExpectation = Readonly<{
  key: string;
  versionId: string;
}>;

export class S3RetentionUpgradeReader {
  readonly #client: ObjectClient;
  readonly #bucket: string;

  constructor(input: {
    bucket: string;
    config: S3ClientConfig;
    client?: ObjectClient;
  }) {
    this.#bucket = input.bucket;
    this.#client =
      input.client ??
      new S3Client({
        ...input.config,
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
  }

  /** Read-only, fully paginated archive inventory used by the production
   * upgrade barrier. It never deletes or adopts an object version. */
  async listObjectVersions(
    prefix: string,
  ): Promise<ArtifactObjectVersionInventory> {
    const versions: Array<{ key: string; versionId: string }> = [];
    const deleteMarkers: Array<{ key: string; versionId: string }> = [];
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    const seenMarkers = new Set<string>();
    do {
      const marker = `${keyMarker ?? ""}\u0000${versionIdMarker ?? ""}`;
      if (seenMarkers.has(marker))
        throw new Error("ARTIFACT_VERSION_LIST_PAGINATION_INVALID");
      seenMarkers.add(marker);
      const page = await this.#client.send(
        new ListObjectVersionsCommand({
          Bucket: this.#bucket,
          Prefix: prefix,
          ...(keyMarker ? { KeyMarker: keyMarker } : {}),
          ...(versionIdMarker ? { VersionIdMarker: versionIdMarker } : {}),
        }),
      );
      for (const version of page.Versions ?? []) {
        if (!version.Key || !version.VersionId)
          throw new Error("ARTIFACT_VERSION_LIST_ENTRY_INVALID");
        versions.push({ key: version.Key, versionId: version.VersionId });
      }
      for (const deleteMarker of page.DeleteMarkers ?? []) {
        if (!deleteMarker.Key || !deleteMarker.VersionId)
          throw new Error("ARTIFACT_VERSION_LIST_ENTRY_INVALID");
        deleteMarkers.push({
          key: deleteMarker.Key,
          versionId: deleteMarker.VersionId,
        });
      }
      if (!page.IsTruncated) break;
      if (!page.NextKeyMarker)
        throw new Error("ARTIFACT_VERSION_LIST_PAGINATION_INVALID");
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    } while (true);
    return { versions, deleteMarkers };
  }

  async inspectObjectVersion(
    expectation: ArtifactObjectVersionExpectation,
  ): Promise<ArtifactObjectVersionHead> {
    const head = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: expectation.key,
        VersionId: expectation.versionId,
        ChecksumMode: "ENABLED",
      }),
    );
    return {
      versionId: head.VersionId ?? null,
      sizeBytes: head.ContentLength ?? null,
      mimeType: head.ContentType ?? null,
      checksum: head.Metadata?.workmeshchecksum ?? null,
      checksumHeader: head.ChecksumSHA256 ?? null,
      retainUntil: head.ObjectLockRetainUntilDate ?? null,
      objectLockMode: head.ObjectLockMode ?? null,
    };
  }
}

export function retentionUpgradeReaderFromEnvironment(): S3RetentionUpgradeReader {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new Error(
      "S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required",
    );
  return new S3RetentionUpgradeReader({
    bucket,
    config: {
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey },
    },
  });
}
