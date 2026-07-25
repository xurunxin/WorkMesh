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
});
