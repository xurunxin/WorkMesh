import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { S3ArtifactStorage } from "./index.js";

describe("S3 artifact verification", () => {
  it("deletes only the exact requested object key", async () => {
    const commands: Array<{ name: string; input: Record<string, unknown> }> = [];
    const client = { send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => { commands.push({ name: command.constructor.name, input: command.input }); return {}; } };
    const storage = new S3ArtifactStorage({
      bucket: "artifacts",
      config: { region: "us-east-1", credentials: { accessKeyId: "test", secretAccessKey: "test" } },
      client: client as never,
    });
    await storage.delete("workspace/upload/file.txt");
    expect(commands).toEqual([{ name: "DeleteObjectCommand", input: { Bucket: "artifacts", Key: "workspace/upload/file.txt" } }]);
  });

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

  it("conditionally creates an immutable archive and reconciles its current VersionId", async () => {
    const content = Buffer.from("durable archive");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const checksumBase64 = Buffer.from(checksum.slice(7), "hex").toString(
      "base64",
    );
    const retainUntil = new Date(Date.now() + 365 * 86_400_000);
    const lastModified = new Date("2026-07-01T00:00:00.000Z");
    const commands: Array<{
      name: string;
      input: Record<string, unknown>;
    }> = [];
    const client = {
      send: async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        commands.push({ name: command.constructor.name, input: command.input });
        if (command.constructor.name === "PutObjectCommand")
          return { VersionId: "ignored-response-version" };
        return {
          VersionId: "current-version",
          ContentLength: content.length,
          ContentType: "application/gzip",
          ChecksumSHA256: checksumBase64,
          Metadata: {
            workmeshchecksum: checksum,
            workmeshsegmentid: "segment-1",
            workmeshsnapshotdigest: `sha256:${"a".repeat(64)}`,
            workmeshfixedcutoffat: "2026-07-01T00:00:00.000Z",
          },
          LastModified: lastModified,
          ObjectLockMode: "COMPLIANCE",
          ObjectLockRetainUntilDate: retainUntil,
        };
      },
    };
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: client as never,
    });
    await expect(
      storage.putObjectIfAbsent(
        {
          key: "retention/segment-1.ndjson.gz",
          checksum,
          sizeBytes: content.length,
          mimeType: "application/gzip",
          retainUntil,
          archiveIdentity: {
            segmentId: "segment-1",
            snapshotDigest: `sha256:${"a".repeat(64)}`,
            fixedCutoffAt: "2026-07-01T00:00:00.000Z",
          },
        },
        content,
      ),
    ).resolves.toEqual({
      status: "present",
      versionId: "current-version",
      lastModified,
      retainUntil,
    });
    expect(commands[0]).toMatchObject({
      name: "PutObjectCommand",
      input: {
        IfNoneMatch: "*",
        ChecksumSHA256: checksumBase64,
        ObjectLockMode: "COMPLIANCE",
        ObjectLockRetainUntilDate: retainUntil,
        Metadata: {
          workmeshchecksum: checksum,
          workmeshsegmentid: "segment-1",
          workmeshsnapshotdigest: `sha256:${"a".repeat(64)}`,
          workmeshfixedcutoffat: "2026-07-01T00:00:00.000Z",
        },
      },
    });
    expect(commands[1]).toMatchObject({
      name: "HeadObjectCommand",
      input: { ChecksumMode: "ENABLED" },
    });
    expect(commands[1]!.input).not.toHaveProperty("VersionId");
  });

  it("reports absence only for an explicit HeadObject NotFound or HTTP 404", async () => {
    const content = Buffer.from("head-first archive");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const expectation = {
      key: "retention/head-first.ndjson.gz",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      retainUntil: new Date("2027-07-01T00:00:00.000Z"),
      archiveIdentity: {
        segmentId: "head-first-segment",
        snapshotDigest: `sha256:${"e".repeat(64)}`,
        fixedCutoffAt: "2026-07-01T00:00:00.000Z",
      },
    };
    const storageFor = (error: Error) =>
      new S3ArtifactStorage({
        bucket: "archives",
        config: {
          region: "us-east-1",
          credentials: { accessKeyId: "test", secretAccessKey: "test" },
        },
        client: {
          send: async () => {
            throw error;
          },
        } as never,
      });

    await expect(
      storageFor(
        Object.assign(new Error("missing"), {
          $metadata: { httpStatusCode: 404 },
        }),
      ).reconcileCurrentObjectIfPresent(expectation),
    ).resolves.toEqual({ status: "missing" });
    await expect(
      storageFor(
        Object.assign(new Error("missing"), { name: "NotFound" }),
      ).reconcileCurrentObjectIfPresent(expectation),
    ).resolves.toEqual({ status: "missing" });
    await expect(
      storageFor(
        Object.assign(new Error("ambiguous"), {
          name: "NoSuchKey",
          $metadata: { httpStatusCode: 500 },
        }),
      ).reconcileCurrentObjectIfPresent(expectation),
    ).rejects.toThrow("ambiguous");
    await expect(
      storageFor(
        Object.assign(new Error("unavailable"), {
          $metadata: { httpStatusCode: 503 },
        }),
      ).reconcileCurrentObjectIfPresent(expectation),
    ).rejects.toThrow("unavailable");
  });

  it.each([
    ["precondition", Object.assign(new Error("PreconditionFailed"), {
      $metadata: { httpStatusCode: 412 },
    })],
    ["response loss", new Error("socket closed after response")],
    ["server uncertainty", Object.assign(new Error("InternalError"), {
      $metadata: { httpStatusCode: 500 },
    })],
  ])(
    "converges %s on the existing stable-key version",
    async (_scenario, putError) => {
      const content = Buffer.from("already written");
      const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      const checksumBase64 = Buffer.from(checksum.slice(7), "hex").toString(
        "base64",
      );
      const lastModified = new Date("2026-07-02T00:00:00.000Z");
      const actualRetainUntil = new Date("2027-08-01T00:00:00.000Z");
      let puts = 0;
      const storage = new S3ArtifactStorage({
        bucket: "archives",
        config: {
          region: "us-east-1",
          credentials: { accessKeyId: "test", secretAccessKey: "test" },
        },
        client: {
          send: async (command: { constructor: { name: string } }) => {
            if (command.constructor.name === "PutObjectCommand") {
              puts += 1;
              throw putError;
            }
            return {
              VersionId: "stable-version",
              ContentLength: content.length,
              ContentType: "application/gzip",
              ChecksumSHA256: checksumBase64,
              Metadata: {
                workmeshchecksum: checksum,
                workmeshsegmentid: "stable-segment",
                workmeshsnapshotdigest: `sha256:${"b".repeat(64)}`,
                workmeshfixedcutoffat: "2026-07-02T00:00:00.000Z",
              },
              LastModified: lastModified,
              ObjectLockMode: "COMPLIANCE",
              ObjectLockRetainUntilDate: actualRetainUntil,
            };
          },
        } as never,
      });
      await expect(
        storage.putObjectIfAbsent(
          {
            key: "retention/stable.ndjson.gz",
            checksum,
            sizeBytes: content.length,
            mimeType: "application/gzip",
            retainUntil: new Date("2027-07-01T00:00:00.000Z"),
            archiveIdentity: {
              segmentId: "stable-segment",
              snapshotDigest: `sha256:${"b".repeat(64)}`,
              fixedCutoffAt: "2026-07-02T00:00:00.000Z",
            },
          },
          content,
        ),
      ).resolves.toEqual({
        status: "present",
        versionId: "stable-version",
        lastModified,
        retainUntil: actualRetainUntil,
      });
      expect(puts).toBe(1);
    },
  );

  it("retries the same key after a 404 and rejects a mismatched current object", async () => {
    const content = Buffer.from("retry archive");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const checksumBase64 = Buffer.from(checksum.slice(7), "hex").toString(
      "base64",
    );
    const lastModified = new Date("2026-07-03T00:00:00.000Z");
    const actualRetainUntil = new Date("2027-08-01T00:00:00.000Z");
    let puts = 0;
    let heads = 0;
    const putKeys: unknown[] = [];
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async (command: {
          constructor: { name: string };
          input: Record<string, unknown>;
        }) => {
          if (command.constructor.name === "PutObjectCommand") {
            puts += 1;
            putKeys.push(command.input.Key);
            throw Object.assign(new Error("InternalError"), {
              $metadata: { httpStatusCode: 500 },
            });
          }
          heads += 1;
          if (heads === 1)
            throw Object.assign(new Error("NotFound"), {
              $metadata: { httpStatusCode: 404 },
            });
          return {
            VersionId: "retry-version",
            ContentLength: content.length,
            ContentType: "application/gzip",
            ChecksumSHA256: checksumBase64,
            Metadata: {
              workmeshchecksum: checksum,
              workmeshsegmentid: "retry-segment",
              workmeshsnapshotdigest: `sha256:${"c".repeat(64)}`,
              workmeshfixedcutoffat: "2026-07-03T00:00:00.000Z",
            },
            LastModified: lastModified,
            ObjectLockMode: "COMPLIANCE",
            ObjectLockRetainUntilDate: actualRetainUntil,
          };
        },
      } as never,
    });
    const expectation = {
      key: "retention/retry.ndjson.gz",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      retainUntil: new Date("2027-07-01T00:00:00.000Z"),
      archiveIdentity: {
        segmentId: "retry-segment",
        snapshotDigest: `sha256:${"c".repeat(64)}`,
        fixedCutoffAt: "2026-07-03T00:00:00.000Z",
      },
    };
    await expect(
      storage.putObjectIfAbsent(expectation, content),
    ).resolves.toEqual({
      status: "present",
      versionId: "retry-version",
      lastModified,
      retainUntil: actualRetainUntil,
    });
    expect(puts).toBe(2);
    expect(new Set(putKeys)).toEqual(new Set([expectation.key]));

    const mismatched = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async () => ({
          VersionId: "foreign-version",
          ContentLength: content.length,
          ContentType: "application/gzip",
          ChecksumSHA256: checksumBase64,
          Metadata: {
            workmeshchecksum: checksum,
            workmeshsegmentid: "different-segment",
            workmeshsnapshotdigest: `sha256:${"c".repeat(64)}`,
            workmeshfixedcutoffat: "2026-07-03T00:00:00.000Z",
          },
          ObjectLockMode: "COMPLIANCE",
          ObjectLockRetainUntilDate: new Date("2027-08-01T00:00:00.000Z"),
        }),
      } as never,
    });
    await expect(mismatched.reconcileCurrentObject(expectation)).rejects.toThrow(
      "RETENTION_OBJECT_IDENTITY_MISMATCH",
    );
  });

  it("keeps verified archive reads pinned to the persisted VersionId", async () => {
    const content = Buffer.from("pinned archive");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const checksumBase64 = Buffer.from(checksum.slice(7), "hex").toString(
      "base64",
    );
    const inputs: Record<string, unknown>[] = [];
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async (command: {
          constructor: { name: string };
          input: Record<string, unknown>;
        }) => {
          inputs.push(command.input);
          if (command.constructor.name === "GetObjectCommand")
            return { Body: Readable.from([content]) };
          return {
            VersionId: "pinned-version",
            ContentLength: content.length,
            ContentType: "application/gzip",
            ChecksumSHA256: checksumBase64,
            Metadata: {
              workmeshchecksum: checksum,
              workmeshsegmentid: "pinned-segment",
              workmeshsnapshotdigest: `sha256:${"d".repeat(64)}`,
              workmeshfixedcutoffat: "2026-07-04T00:00:00.000Z",
            },
          };
        },
      } as never,
    });
    await storage.readVerifiedObject({
      key: "retention/pinned.ndjson.gz",
      versionId: "pinned-version",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      archiveIdentity: {
        segmentId: "pinned-segment",
        snapshotDigest: `sha256:${"d".repeat(64)}`,
        fixedCutoffAt: "2026-07-04T00:00:00.000Z",
      },
    });
    expect(inputs).toHaveLength(2);
    expect(
      inputs.every((input) => input.VersionId === "pinned-version"),
    ).toBe(true);
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
    const versionedReads: Record<string, unknown>[] = [];
    const client = {
      send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        switch (command.constructor.name) {
          case "GetObjectLockConfigurationCommand":
            return { ObjectLockConfiguration: { ObjectLockEnabled: "Enabled" } };
          case "PutObjectCommand":
            putInput = command.input;
            return { VersionId: "locked-version" };
          case "HeadObjectCommand":
            versionedReads.push(command.input);
            return {
              ContentLength: content.length,
              ContentType: "application/gzip",
              Metadata: { workmeshchecksum: checksum },
              ObjectLockMode: "COMPLIANCE",
              ObjectLockRetainUntilDate: retainUntil,
              VersionId: "locked-version",
            };
          case "DeleteObjectCommand":
            versionedReads.push(command.input);
            throw new Error("AccessDenied");
          default:
            versionedReads.push(command.input);
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
    }, content)).resolves.toMatchObject({
      checksum,
      versionId: "locked-version",
    });
    expect(putInput).toMatchObject({
      ObjectLockMode: "COMPLIANCE",
      ObjectLockRetainUntilDate: retainUntil,
    });
    await expect(storage.assertEarlyDeleteRejected({
      key: "retention/a.ndjson.gz",
      versionId: "locked-version",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      retainUntil,
    })).resolves.toBeUndefined();
    expect(putInput).not.toHaveProperty("VersionId");
    expect(versionedReads).not.toHaveLength(0);
    expect(
      versionedReads.every((input) => input.VersionId === "locked-version"),
    ).toBe(true);

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

  it("extends only one exact COMPLIANCE version and reconciles response loss with a pinned HEAD", async () => {
    const content = Buffer.from("retention extension");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const checksumHeader = Buffer.from(checksum.slice(7), "hex").toString(
      "base64",
    );
    const lastModified = new Date("2026-07-10T00:00:00.000Z");
    const shortRetainUntil = new Date("2027-07-10T00:04:00.000Z");
    const targetRetainUntil = new Date("2027-07-10T00:05:00.000Z");
    let actualRetainUntil = shortRetainUntil;
    let retentionPuts = 0;
    const commands: Array<{
      name: string;
      input: Record<string, unknown>;
    }> = [];
    const expectation = {
      key: "retention/extend.ndjson.gz",
      versionId: "exact-version",
      checksum,
      sizeBytes: content.length,
      mimeType: "application/gzip",
      retainUntil: targetRetainUntil,
      archiveIdentity: {
        segmentId: "extend-segment",
        snapshotDigest: `sha256:${"d".repeat(64)}`,
        fixedCutoffAt: "2026-07-01T00:00:00.000Z",
      },
    };
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async (command: {
          constructor: { name: string };
          input: Record<string, unknown>;
        }) => {
          commands.push({ name: command.constructor.name, input: command.input });
          if (command.constructor.name === "PutObjectRetentionCommand") {
            retentionPuts += 1;
            actualRetainUntil = targetRetainUntil;
            throw new Error("response lost after retention was extended");
          }
          return {
            VersionId: "exact-version",
            LastModified: lastModified,
            ContentLength: content.length,
            ContentType: "application/gzip",
            ChecksumSHA256: checksumHeader,
            Metadata: {
              workmeshchecksum: checksum,
              workmeshsegmentid: "extend-segment",
              workmeshsnapshotdigest: `sha256:${"d".repeat(64)}`,
              workmeshfixedcutoffat: "2026-07-01T00:00:00.000Z",
            },
            ObjectLockMode: "COMPLIANCE",
            ObjectLockRetainUntilDate: actualRetainUntil,
          };
        },
      } as never,
    });

    await expect(
      storage.extendRetention(expectation, targetRetainUntil),
    ).resolves.toEqual({
      status: "present",
      versionId: "exact-version",
      lastModified,
      retainUntil: targetRetainUntil,
    });
    expect(commands).toHaveLength(3);
    expect(commands[1]).toEqual({
      name: "PutObjectRetentionCommand",
      input: {
        Bucket: "archives",
        Key: expectation.key,
        VersionId: "exact-version",
        Retention: {
          Mode: "COMPLIANCE",
          RetainUntilDate: targetRetainUntil,
        },
      },
    });
    expect(
      commands
        .filter(({ name }) => name === "HeadObjectCommand")
        .every(({ input }) => input.VersionId === "exact-version"),
    ).toBe(true);

    await expect(
      storage.extendRetention(expectation, targetRetainUntil),
    ).resolves.toMatchObject({ retainUntil: targetRetainUntil });
    expect(retentionPuts).toBe(1);
  });

  it("never shortens an already longer exact-version retention horizon", async () => {
    const content = Buffer.from("long retention");
    const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const longerRetainUntil = new Date("2028-07-10T00:00:00.000Z");
    let retentionPuts = 0;
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async (command: { constructor: { name: string } }) => {
          if (command.constructor.name === "PutObjectRetentionCommand")
            retentionPuts += 1;
          return {
            VersionId: "long-version",
            LastModified: new Date("2026-07-10T00:00:00.000Z"),
            ContentLength: content.length,
            ContentType: "application/gzip",
            ChecksumSHA256: Buffer.from(checksum.slice(7), "hex").toString(
              "base64",
            ),
            Metadata: {
              workmeshchecksum: checksum,
              workmeshsegmentid: "long-segment",
              workmeshsnapshotdigest: `sha256:${"e".repeat(64)}`,
              workmeshfixedcutoffat: "2026-07-01T00:00:00.000Z",
            },
            ObjectLockMode: "COMPLIANCE",
            ObjectLockRetainUntilDate: longerRetainUntil,
          };
        },
      } as never,
    });
    await expect(
      storage.extendRetention(
        {
          key: "retention/long.ndjson.gz",
          versionId: "long-version",
          checksum,
          sizeBytes: content.length,
          mimeType: "application/gzip",
          retainUntil: new Date("2027-07-10T00:00:00.000Z"),
          archiveIdentity: {
            segmentId: "long-segment",
            snapshotDigest: `sha256:${"e".repeat(64)}`,
            fixedCutoffAt: "2026-07-01T00:00:00.000Z",
          },
        },
        new Date("2027-07-10T00:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ retainUntil: longerRetainUntil });
    expect(retentionPuts).toBe(0);
  });

  it.each([
    [
      "403",
      Object.assign(new Error("AccessDenied"), {
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    [
      "404",
      Object.assign(new Error("NoSuchVersion"), {
        $metadata: { httpStatusCode: 404 },
      }),
    ],
    [
      "5xx",
      Object.assign(new Error("InternalError"), {
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    ["network", new Error("connection reset")],
  ])(
    "fails closed when exact-version retention extension returns %s",
    async (_scenario, putError) => {
      const content = Buffer.from("failed extension");
      const checksum = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      const targetRetainUntil = new Date("2027-07-10T00:05:00.000Z");
      const storage = new S3ArtifactStorage({
        bucket: "archives",
        config: {
          region: "us-east-1",
          credentials: { accessKeyId: "test", secretAccessKey: "test" },
        },
        client: {
          send: async (command: { constructor: { name: string } }) => {
            if (command.constructor.name === "PutObjectRetentionCommand")
              throw putError;
            return {
              VersionId: "failed-version",
              LastModified: new Date("2026-07-10T00:00:00.000Z"),
              ContentLength: content.length,
              ContentType: "application/gzip",
              ChecksumSHA256: Buffer.from(
                checksum.slice(7),
                "hex",
              ).toString("base64"),
              Metadata: {
                workmeshchecksum: checksum,
                workmeshsegmentid: "failed-segment",
                workmeshsnapshotdigest: `sha256:${"f".repeat(64)}`,
                workmeshfixedcutoffat: "2026-07-01T00:00:00.000Z",
              },
              ObjectLockMode: "COMPLIANCE",
              ObjectLockRetainUntilDate: new Date(
                "2027-07-10T00:04:00.000Z",
              ),
            };
          },
        } as never,
      });
      await expect(
        storage.extendRetention(
          {
            key: "retention/failed.ndjson.gz",
            versionId: "failed-version",
            checksum,
            sizeBytes: content.length,
            mimeType: "application/gzip",
            retainUntil: targetRetainUntil,
            archiveIdentity: {
              segmentId: "failed-segment",
              snapshotDigest: `sha256:${"f".repeat(64)}`,
              fixedCutoffAt: "2026-07-01T00:00:00.000Z",
            },
          },
          targetRetainUntil,
        ),
      ).rejects.toBe(putError);
    },
  );

  it("fails closed before retention mutation when the exact version is missing", async () => {
    let retentionPuts = 0;
    const missing = Object.assign(new Error("NoSuchVersion"), {
      $metadata: { httpStatusCode: 404 },
    });
    const storage = new S3ArtifactStorage({
      bucket: "archives",
      config: {
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
      },
      client: {
        send: async (command: { constructor: { name: string } }) => {
          if (command.constructor.name === "PutObjectRetentionCommand")
            retentionPuts += 1;
          throw missing;
        },
      } as never,
    });
    await expect(
      storage.extendRetention(
        {
          key: "retention/missing.ndjson.gz",
          versionId: "missing-version",
          checksum: `sha256:${"0".repeat(64)}`,
          sizeBytes: 1,
          mimeType: "application/gzip",
          retainUntil: new Date("2027-07-10T00:05:00.000Z"),
          archiveIdentity: {
            segmentId: "missing-segment",
            snapshotDigest: `sha256:${"1".repeat(64)}`,
            fixedCutoffAt: "2026-07-01T00:00:00.000Z",
          },
        },
        new Date("2027-07-10T00:05:00.000Z"),
      ),
    ).rejects.toBe(missing);
    expect(retentionPuts).toBe(0);
  });
});
