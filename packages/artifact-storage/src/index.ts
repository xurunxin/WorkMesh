import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ArtifactObjectExpectation = {
  key: string;
  versionId?: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  retainUntil?: Date;
  archiveIdentity?: Readonly<{
    segmentId: string;
    snapshotDigest: string;
    fixedCutoffAt: string;
  }>;
};

export type CurrentArtifactObject =
  | Readonly<{ status: "present"; versionId: string }>
  | Readonly<{ status: "missing" }>;

type ObjectClient = Pick<S3Client, "send">;

const checksumBase64 = (checksum: string): string =>
  Buffer.from(checksum.replace(/^sha256:/, ""), "hex").toString("base64");

const objectMetadata = (
  expectation: ArtifactObjectExpectation,
): Record<string, string> => ({
  workmeshchecksum: expectation.checksum,
  ...(expectation.archiveIdentity
    ? {
        workmeshsegmentid: expectation.archiveIdentity.segmentId,
        workmeshsnapshotdigest: expectation.archiveIdentity.snapshotDigest,
        workmeshfixedcutoffat: expectation.archiveIdentity.fixedCutoffAt,
      }
    : {}),
});

const httpStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return metadata?.httpStatusCode;
};

const isNotFound = (error: unknown): boolean =>
  httpStatus(error) === 404 ||
  (error instanceof Error && error.name === "NotFound");

const identityMismatchCodes = new Set([
  "RETENTION_OBJECT_VERSION_MISMATCH",
  "ARTIFACT_SIZE_MISMATCH",
  "ARTIFACT_MIME_MISMATCH",
  "ARTIFACT_METADATA_CHECKSUM_MISMATCH",
  "ARTIFACT_CHECKSUM_HEADER_MISMATCH",
  "RETENTION_OBJECT_SEGMENT_MISMATCH",
  "RETENTION_OBJECT_SNAPSHOT_MISMATCH",
  "RETENTION_OBJECT_CUTOFF_MISMATCH",
  "RETENTION_OBJECT_LOCK_MODE_MISMATCH",
  "RETENTION_OBJECT_LOCK_TOO_SHORT",
  "RETENTION_OBJECT_VERSION_REQUIRED",
]);

export class S3ArtifactStorage {
  readonly #client: ObjectClient;
  readonly #signingClient: S3Client;
  readonly #bucket: string;

  constructor(input: { bucket: string; config: S3ClientConfig; client?: ObjectClient }) {
    this.#bucket = input.bucket;
    this.#signingClient = new S3Client({
      ...input.config,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    this.#client = input.client ?? this.#signingClient;
  }

  async createUploadUrl(expectation: ArtifactObjectExpectation, expiresIn = 900): Promise<string> {
    return getSignedUrl(this.#signingClient, new PutObjectCommand({
      Bucket: this.#bucket,
      Key: expectation.key,
      ContentType: expectation.mimeType,
      ContentLength: expectation.sizeBytes,
      ChecksumSHA256: checksumBase64(expectation.checksum),
      Metadata: objectMetadata(expectation),
      ...(expectation.retainUntil
        ? {
            ObjectLockMode: "COMPLIANCE" as const,
            ObjectLockRetainUntilDate: expectation.retainUntil,
          }
        : {}),
    }), { expiresIn, signableHeaders: new Set(["content-type", "content-length", "x-amz-checksum-sha256"]) });
  }

  async createDownloadUrl(key: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(
      this.#signingClient,
      new GetObjectCommand({ Bucket: this.#bucket, Key: key, ChecksumMode: "ENABLED" }),
      { expiresIn },
    );
  }

  /** Worker-only object write used by retention archival. This does not create
   * an HTTP download surface; the caller must still read back and verify. */
  async putVerifiedObject(
    expectation: ArtifactObjectExpectation,
    body: Uint8Array,
  ): Promise<{ versionId: string; checksum: string; sizeBytes: number; mimeType: string }> {
    const uploaded = await this.putObject(expectation, body);
    const verified = await this.verify({
      ...expectation,
      versionId: uploaded.versionId,
    });
    return { versionId: uploaded.versionId, ...verified };
  }

  async putObject(
    expectation: ArtifactObjectExpectation,
    body: Uint8Array,
  ): Promise<{ versionId: string }> {
    if (body.byteLength !== expectation.sizeBytes)
      throw new Error("ARTIFACT_SIZE_MISMATCH");
    const uploaded = await this.#client.send(new PutObjectCommand({
      Bucket: this.#bucket,
      Key: expectation.key,
      Body: body,
      ContentType: expectation.mimeType,
      ContentLength: expectation.sizeBytes,
      ChecksumSHA256: checksumBase64(expectation.checksum),
      Metadata: objectMetadata(expectation),
      ...(expectation.retainUntil
        ? {
            ObjectLockMode: "COMPLIANCE" as const,
            ObjectLockRetainUntilDate: expectation.retainUntil,
          }
        : {}),
    }));
    if (!uploaded.VersionId) throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    return { versionId: uploaded.VersionId };
  }

  /** Retention-only stable-key write. A retry never creates a replacement
   * version: it either wins If-None-Match or reconciles the current immutable
   * object identity after a 412, timeout, 5xx, or response loss. */
  async putObjectIfAbsent(
    expectation: ArtifactObjectExpectation,
    body: Uint8Array,
  ): Promise<{ versionId: string }> {
    if (!expectation.archiveIdentity)
      throw new Error("RETENTION_OBJECT_IDENTITY_REQUIRED");
    if (expectation.versionId)
      throw new Error("RETENTION_OBJECT_VERSION_UNEXPECTED");
    if (body.byteLength !== expectation.sizeBytes)
      throw new Error("ARTIFACT_SIZE_MISMATCH");
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.#client.send(
          new PutObjectCommand({
            Bucket: this.#bucket,
            Key: expectation.key,
            Body: body,
            ContentType: expectation.mimeType,
            ContentLength: expectation.sizeBytes,
            ChecksumSHA256: checksumBase64(expectation.checksum),
            Metadata: objectMetadata(expectation),
            IfNoneMatch: "*",
            ...(expectation.retainUntil
              ? {
                  ObjectLockMode: "COMPLIANCE" as const,
                  ObjectLockRetainUntilDate: expectation.retainUntil,
                }
              : {}),
          }),
        );
      } catch (error) {
        lastError = error;
      }
      const current =
        await this.reconcileCurrentObjectIfPresent(expectation);
      if (current.status === "present")
        return { versionId: current.versionId };
      lastError ??= new Error("RETENTION_OBJECT_NOT_FOUND");
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("RETENTION_OBJECT_UPLOAD_UNCERTAIN");
  }

  /** Reconcile the current key after an uncertain conditional PUT. The
   * returned VersionId is then persisted and all later reads are pinned. */
  async reconcileCurrentObject(
    expectation: ArtifactObjectExpectation,
  ): Promise<{ versionId: string }> {
    const current = await this.reconcileCurrentObjectIfPresent(expectation);
    if (current.status === "missing")
      throw new Error("RETENTION_OBJECT_NOT_FOUND");
    return { versionId: current.versionId };
  }

  /** HEAD the stable archive key before deciding whether its planned lock
   * horizon may be refreshed. Only an explicit S3 NotFound/404 is absence;
   * transport uncertainty and identity mismatches fail closed. */
  async reconcileCurrentObjectIfPresent(
    expectation: ArtifactObjectExpectation,
  ): Promise<CurrentArtifactObject> {
    if (!expectation.archiveIdentity)
      throw new Error("RETENTION_OBJECT_IDENTITY_REQUIRED");
    try {
      const head = await this.#verifiedHead(
        { ...expectation, versionId: undefined },
        false,
      );
      if (!head.VersionId)
        throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
      return { status: "present", versionId: head.VersionId };
    } catch (error) {
      if (isNotFound(error)) return { status: "missing" };
      if (
        error instanceof Error &&
        identityMismatchCodes.has(error.message)
      )
        throw new Error("RETENTION_OBJECT_IDENTITY_MISMATCH");
      throw error;
    }
  }

  async probe(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  async probeRetentionProtection(): Promise<void> {
    const configuration = await this.#client.send(
      new GetObjectLockConfigurationCommand({ Bucket: this.#bucket }),
    );
    if (configuration.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled")
      throw new Error("RETENTION_OBJECT_LOCK_REQUIRED");
  }

  async #verifiedHead(
    expectation: ArtifactObjectExpectation,
    requirePinned = true,
  ) {
    if (requirePinned && expectation.retainUntil && !expectation.versionId)
      throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    const head = await this.#client.send(new HeadObjectCommand({
      Bucket: this.#bucket,
      Key: expectation.key,
      ...(expectation.versionId ? { VersionId: expectation.versionId } : {}),
      ChecksumMode: "ENABLED",
    }));
    if (expectation.versionId && head.VersionId !== expectation.versionId)
      throw new Error("RETENTION_OBJECT_VERSION_MISMATCH");
    if (head.ContentLength !== expectation.sizeBytes) throw new Error("ARTIFACT_SIZE_MISMATCH");
    if (head.ContentType !== expectation.mimeType) throw new Error("ARTIFACT_MIME_MISMATCH");
    if (head.Metadata?.workmeshchecksum !== expectation.checksum) throw new Error("ARTIFACT_METADATA_CHECKSUM_MISMATCH");
    if (
      expectation.archiveIdentity &&
      head.ChecksumSHA256 !== checksumBase64(expectation.checksum)
    )
      throw new Error("ARTIFACT_CHECKSUM_HEADER_MISMATCH");
    if (
      expectation.archiveIdentity &&
      head.Metadata?.workmeshsegmentid !== expectation.archiveIdentity.segmentId
    )
      throw new Error("RETENTION_OBJECT_SEGMENT_MISMATCH");
    if (
      expectation.archiveIdentity &&
      head.Metadata?.workmeshsnapshotdigest !==
        expectation.archiveIdentity.snapshotDigest
    )
      throw new Error("RETENTION_OBJECT_SNAPSHOT_MISMATCH");
    if (
      expectation.archiveIdentity &&
      head.Metadata?.workmeshfixedcutoffat !==
        expectation.archiveIdentity.fixedCutoffAt
    )
      throw new Error("RETENTION_OBJECT_CUTOFF_MISMATCH");
    if (expectation.retainUntil) {
      if (head.ObjectLockMode !== "COMPLIANCE")
        throw new Error("RETENTION_OBJECT_LOCK_MODE_MISMATCH");
      const actualRetainUntil = head.ObjectLockRetainUntilDate;
      if (!actualRetainUntil || actualRetainUntil < expectation.retainUntil)
        throw new Error("RETENTION_OBJECT_LOCK_TOO_SHORT");
    }
    return head;
  }

  async readVerifiedObject(
    expectation: ArtifactObjectExpectation,
  ): Promise<Uint8Array> {
    await this.#verifiedHead(expectation);
    const object = await this.#client.send(new GetObjectCommand({
      Bucket: this.#bucket,
      Key: expectation.key,
      VersionId: expectation.versionId,
      ChecksumMode: "ENABLED",
    }));
    if (!object.Body) throw new Error("ARTIFACT_OBJECT_BODY_MISSING");
    const digest = createHash("sha256");
    let sizeBytes = 0;
    const chunks: Uint8Array[] = [];
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      digest.update(chunk);
      sizeBytes += chunk.byteLength;
      chunks.push(chunk);
    }
    const checksum = `sha256:${digest.digest("hex")}`;
    if (sizeBytes !== expectation.sizeBytes) throw new Error("ARTIFACT_SIZE_MISMATCH");
    if (checksum !== expectation.checksum) throw new Error("ARTIFACT_CHECKSUM_MISMATCH");
    return Buffer.concat(chunks);
  }

  async assertEarlyDeleteRejected(
    expectation: ArtifactObjectExpectation,
  ): Promise<void> {
    await this.#verifiedHead(expectation);
    if (!expectation.versionId)
      throw new Error("RETENTION_OBJECT_VERSION_REQUIRED");
    let rejected = false;
    try {
      await this.#client.send(new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: expectation.key,
        VersionId: expectation.versionId,
      }));
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("RETENTION_OBJECT_LOCK_DELETE_ALLOWED");
    await this.readVerifiedObject(expectation);
  }

  async verify(expectation: ArtifactObjectExpectation): Promise<{ checksum: string; sizeBytes: number; mimeType: string }> {
    await this.readVerifiedObject(expectation);
    const checksum = expectation.checksum;
    const sizeBytes = expectation.sizeBytes;
    return { checksum, sizeBytes, mimeType: expectation.mimeType };
  }
}

export function artifactStorageFromEnvironment(): S3ArtifactStorage {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey)
    throw new Error("S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required");
  return new S3ArtifactStorage({
    bucket,
    config: {
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: { accessKeyId, secretAccessKey },
    },
  });
}
