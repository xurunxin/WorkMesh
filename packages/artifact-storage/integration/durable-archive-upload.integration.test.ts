import { createHash, randomUUID } from "node:crypto";
import {
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import {
  S3ArtifactStorage,
  type ArtifactObjectExpectation,
} from "../src/index.js";

if (process.env.RUN_INTEGRATION !== "1")
  throw new Error("MinIO archive integration requires RUN_INTEGRATION=1.");

const bucket = process.env.S3_BUCKET;
const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
if (!bucket || !endpoint || !accessKeyId || !secretAccessKey)
  throw new Error(
    "MinIO archive integration requires S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
  );
if (!bucket.includes("test"))
  throw new Error("MinIO archive integration requires a dedicated test bucket.");

const config: S3ClientConfig = {
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
};
const client = new S3Client(config);
const prefix = `durable-intent-${randomUUID()}`;

const expectationFor = (
  name: string,
  body: Uint8Array,
): ArtifactObjectExpectation => ({
  key: `${prefix}/${name}.ndjson.gz`,
  checksum: `sha256:${createHash("sha256").update(body).digest("hex")}`,
  sizeBytes: body.byteLength,
  mimeType: "application/gzip",
  retainUntil: new Date(Date.now() + 366 * 86_400_000),
  archiveIdentity: {
    segmentId: randomUUID(),
    snapshotDigest: `sha256:${"a".repeat(64)}`,
    fixedCutoffAt: "2026-07-29T00:00:00.000Z",
  },
});

const versionsFor = async (key: string) => {
  const result = await client.send(
    new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }),
  );
  return {
    versions: (result.Versions ?? []).filter((version) => version.Key === key),
    deleteMarkers: (result.DeleteMarkers ?? []).filter(
      (marker) => marker.Key === key,
    ),
  };
};

describe("durable archive uploads against real versioned Object Lock storage", () => {
  it("keeps repeated conditional writes on one immutable data version", async () => {
    const storage = new S3ArtifactStorage({ bucket, config, client });
    const body = Buffer.from("real conditional archive");
    const expectation = expectationFor("conditional", body);
    const first = await storage.putObjectIfAbsent(expectation, body);
    const second = await storage.putObjectIfAbsent(expectation, body);
    expect(second.versionId).toBe(first.versionId);
    await expect(
      storage.readVerifiedObject(
        { ...expectation, versionId: first.versionId },
      ),
    ).resolves.toEqual(body);
    const listed = await versionsFor(expectation.key);
    expect(listed.deleteMarkers).toEqual([]);
    expect(listed.versions).toHaveLength(1);
    expect(listed.versions[0]).toMatchObject({
      Key: expectation.key,
      VersionId: first.versionId,
      IsLatest: true,
    });
  });

  it("reconciles a lost successful PUT response without creating a replacement version", async () => {
    let loseResponse = true;
    const responseLossClient = {
      send: async (command: {
        constructor: { name: string };
      }) => {
        if (
          loseResponse &&
          command.constructor.name === PutObjectCommand.name
        ) {
          loseResponse = false;
          await client.send(command as never);
          throw new Error("INJECTED_RESPONSE_LOSS_AFTER_PUT");
        }
        return await client.send(command as never);
      },
    };
    const storage = new S3ArtifactStorage({
      bucket,
      config,
      client: responseLossClient as never,
    });
    const body = Buffer.from("real response-loss archive");
    const expectation = expectationFor("response-loss", body);
    const reconciled = await storage.putObjectIfAbsent(expectation, body);
    const current = await storage.reconcileCurrentObject(expectation);
    expect(current.versionId).toBe(reconciled.versionId);
    await expect(
      storage.readVerifiedObject({
        ...expectation,
        versionId: reconciled.versionId,
      }),
    ).resolves.toEqual(body);
    const listed = await versionsFor(expectation.key);
    expect(listed.deleteMarkers).toEqual([]);
    expect(listed.versions).toHaveLength(1);
    expect(listed.versions[0]).toMatchObject({
      Key: expectation.key,
      VersionId: reconciled.versionId,
      IsLatest: true,
    });
  });
});
