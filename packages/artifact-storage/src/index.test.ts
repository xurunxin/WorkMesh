import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3ArtifactStorage } from "./index.js";

describe("S3 artifact verification", () => {
  it("streams the object and verifies size, MIME, metadata, and SHA-256", async () => {
    const content = Buffer.from("verified artifact");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const client = {
      send: async (command: { constructor: { name: string } }) =>
        command.constructor.name === "HeadObjectCommand"
          ? { ContentLength: content.length, ContentType: "text/plain", Metadata: { workmeshchecksum: checksum } }
          : { Body: Readable.from([content]) },
    };
    const storage = new S3ArtifactStorage({
      bucket: "artifacts",
      config: { region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } },
      client: client as never,
    });
    await expect(storage.verify({ key: "a", checksum, sizeBytes: content.length, mimeType: "text/plain" }))
      .resolves.toEqual({ checksum, sizeBytes: content.length, mimeType: "text/plain" });
  });

  it("rejects bytes that do not match the declared digest", async () => {
    const content = Buffer.from("tampered");
    const expected = `sha256:${"0".repeat(64)}`;
    const client = {
      send: async (command: { constructor: { name: string } }) =>
        command.constructor.name === "HeadObjectCommand"
          ? { ContentLength: content.length, ContentType: "text/plain", Metadata: { workmeshchecksum: expected } }
          : { Body: Readable.from([content]) },
    };
    const storage = new S3ArtifactStorage({
      bucket: "artifacts",
      config: { region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } },
      client: client as never,
    });
    await expect(storage.verify({ key: "a", checksum: expected, sizeBytes: content.length, mimeType: "text/plain" }))
      .rejects.toThrow("ARTIFACT_CHECKSUM_MISMATCH");
  });

  it("fails closed unless retention objects use COMPLIANCE lock through the requested horizon", async () => {
    const content = Buffer.from("locked archive");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const retainUntil = new Date(Date.now() + 365 * 86_400_000);
    let putInput: Record<string, unknown> | undefined;
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        switch (command.constructor.name) {
          case "GetObjectLockConfigurationCommand":
            return { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } };
          case "PutObjectCommand":
            putInput = command.input;
            return {};
          case "HeadObjectCommand":
            return {
              ContentLength: content.length,
              ContentType: "application/gzip",
              Metadata: { workmeshchecksum: checksum },
              ObjectLockMode: "COMPLIANCE",
              ObjectLockRetainUntilDate: retainUntil,
            };
          default:
            return { Body: Readable.from([content]) };
        }
      },
    };
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: { region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } },
      client: client as never,
    });
    await expect(storage.probeRetentionProtection()).resolves.toBeUndefined();
    await expect(storage.putVerifiedObject({
      key: "retention/a.ndjson.gz",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      retainUntil,
    }, content)).resolves.toMatchObject({ checksum });
    expect(putInput).toMatchObject({
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: retainUntil,
    });

    const unlocked = new S3ArtifactStorage({
      bucket: "archives",
      config: { region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } },
      client: {
        send: async () => ({ ObjectLockConfiguration: { ObjectLockEnabled: "Disabled" } }),
      } as never,
    });
    await expect(unlocked.probeRetentionProtection())
      .rejects.toThrow("RETENTION_OBJECT_LOCK_REQUIRED");
  });
});
