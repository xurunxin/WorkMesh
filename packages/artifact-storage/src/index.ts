import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type ArtifactObjectExpectation = {
  key: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
};

type ObjectClient = Pick<S3Client, "send">;

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
      ChecksumSHA256: Buffer.from(expectation.checksum.replace(/^sha256:/, ""), "hex").toString("base64"),
      Metadata: { workmeshchecksum: expectation.checksum },
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
  ): Promise<{ checksum: string; sizeBytes: number; mimeType: string }> {
    await this.putObject(expectation, body);
    return this.verify(expectation);
  }

  async putObject(
    expectation: ArtifactObjectExpectation,
    body: Uint8Array,
  ): Promise<void> {
    if (body.byteLength !== expectation.sizeBytes)
      throw new Error("ARTIFACT_SIZE_MISMATCH");
    await this.#client.send(new PutObjectCommand({
      Bucket: this.#bucket,
      Key: expectation.key,
      Body: body,
      ContentType: expectation.mimeType,
      ContentLength: expectation.sizeBytes,
      ChecksumSHA256: Buffer.from(expectation.checksum.replace(/^sha256:/, ""), "hex").toString("base64"),
      Metadata: { workmeshchecksum: expectation.checksum },
    }));
  }

  async probe(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  async verify(expectation: ArtifactObjectExpectation): Promise<{ checksum: string; sizeBytes: number; mimeType: string }> {
    const head = await this.#client.send(new HeadObjectCommand({
      Bucket: this.#bucket, Key: expectation.key, ChecksumMode: "ENABLED",
    }));
    if (head.ContentLength !== expectation.sizeBytes) throw new Error("ARTIFACT_SIZE_MISMATCH");
    if (head.ContentType !== expectation.mimeType) throw new Error("ARTIFACT_MIME_MISMATCH");
    if (head.Metadata?.workmeshchecksum !== expectation.checksum) throw new Error("ARTIFACT_METADATA_CHECKSUM_MISMATCH");
    const object = await this.#client.send(new GetObjectCommand({
      Bucket: this.#bucket, Key: expectation.key, ChecksumMode: "ENABLED",
    }));
    if (!object.Body) throw new Error("ARTIFACT_OBJECT_BODY_MISSING");
    const digest = createHash("sha256");
    let sizeBytes = 0;
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      digest.update(chunk);
      sizeBytes += chunk.byteLength;
    }
    const checksum = `sha256:${digest.digest("hex")}`;
    if (sizeBytes !== expectation.sizeBytes) throw new Error("ARTIFACT_SIZE_MISMATCH");
    if (checksum !== expectation.checksum) throw new Error("ARTIFACT_CHECKSUM_MISMATCH");
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
