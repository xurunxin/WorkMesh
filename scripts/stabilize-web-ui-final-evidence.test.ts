import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseStableEvidenceArguments,
  stabilizeFinalEvidence,
} from "./stabilize-web-ui-final-evidence.mjs";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

const temporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "workmesh-stable-evidence-"),
  );
  temporaryRoots.push(root);
  return root;
};

const sha256 = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const writePair = async (
  input: Readonly<{
    sourceOutput: string;
    testDirectory: string;
    slug: string;
    width?: number;
    height?: number;
    locale?: string;
    screenshot?: Buffer;
    geometryOnly?: boolean;
  }>,
): Promise<Readonly<{ geometry: string; screenshot: string }>> => {
  const width = input.width ?? 800;
  const height = input.height ?? 600;
  const locale = input.locale ?? "en";
  const name = `final-tour-${input.slug}-${width}x${height}-${locale}`;
  const attachments = path.join(
    input.sourceOutput,
    input.testDirectory,
    "attachments",
  );
  await mkdir(attachments, { recursive: true });
  const geometry = path.join(
    attachments,
    `${name}-geometry-${"a".repeat(40)}.json`,
  );
  const screenshot = path.join(
    attachments,
    `${name}-screenshot-${"b".repeat(40)}.png`,
  );
  await writeFile(
    geometry,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name,
        route: {
          hash: "#active",
          pathname: `/${input.slug}`,
          search: "?view=all",
        },
        locale: { cookie: locale, requested: locale },
        viewport: { height, width },
        geometry: { document: { clientWidth: width, scrollWidth: width } },
        requests: { count: 7, entries: [] },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (!input.geometryOnly) {
    await writeFile(
      screenshot,
      input.screenshot ?? Buffer.from(`png:${name}`, "utf8"),
    );
  }
  return { geometry, screenshot };
};

describe("stable final Web UI evidence arguments", () => {
  it("requires the three explicit paths while keeping help side-effect free", () => {
    expect(parseStableEvidenceArguments(["--help"])).toEqual({
      help: true,
      sourceOutput: null,
      destination: null,
      manifest: null,
    });
    expect(
      parseStableEvidenceArguments([
        "--source-output",
        "run/output",
        "--destination",
        "stable",
        "--manifest",
        "stable/manifest.json",
      ]),
    ).toEqual({
      help: false,
      sourceOutput: "run/output",
      destination: "stable",
      manifest: "stable/manifest.json",
    });
    expect(() => parseStableEvidenceArguments([])).toThrow(
      "--source-output is required",
    );
    expect(() => parseStableEvidenceArguments(["--unknown"])).toThrow(
      "Unknown argument",
    );
  });
});

describe("stable final Web UI evidence copy", () => {
  it("discovers, validates, and manifests two complete pairs in deterministic name order", async () => {
    const root = await temporaryRoot();
    const sourceOutput = path.join(root, "run", "mocked-dev", "output");
    const destination = path.join(root, "stable");
    const manifestPath = path.join(destination, "manifest.json");
    await writePair({
      sourceOutput,
      testDirectory: "case-z",
      slug: "zeta",
      locale: "zh-CN",
    });
    await writePair({
      sourceOutput,
      testDirectory: "case-a",
      slug: "alpha",
      width: 1920,
      height: 1080,
    });

    const result = await stabilizeFinalEvidence({
      sourceOutput,
      destination,
      manifest: manifestPath,
      now: () => new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      status: "pass",
      pairCount: 2,
      generatedAt: "2026-08-23T00:00:00.000Z",
    });
    expect(result.entries.map((entry) => entry.name)).toEqual([
      "final-tour-alpha-1920x1080-en",
      "final-tour-zeta-800x600-zh-CN",
    ]);
    expect(result.entries[0]).toMatchObject({
      title: "alpha at 1920x1080 en",
      route: {
        pathname: "/alpha",
        search: "?view=all",
        hash: "#active",
        href: "/alpha?view=all#active",
      },
      locale: { cookie: "en", requested: "en" },
      viewport: { height: 1080, width: 1920 },
      requestCount: 7,
      geometrySchema: { schemaVersion: 1 },
    });
    const written = JSON.parse(await readFile(manifestPath, "utf8")) as {
      pairCount?: unknown;
    };
    expect(written.pairCount).toBe(2);
  });

  it("verifies copied raw bytes and records equal source/copy byte counts and SHA-256", async () => {
    const root = await temporaryRoot();
    const sourceOutput = path.join(root, "source-output");
    const destination = path.join(root, "stable");
    const screenshotBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x0a,
    ]);
    const source = await writePair({
      sourceOutput,
      testDirectory: "case-one",
      slug: "raw-byte-proof",
      screenshot: screenshotBytes,
    });
    const result = await stabilizeFinalEvidence({
      sourceOutput,
      destination,
      manifest: path.join(destination, "manifest.json"),
    });

    const entry = result.entries[0];
    expect(entry?.files.geometry.hashesMatch).toBe(true);
    expect(entry?.files.screenshot).toMatchObject({
      source: {
        byteCount: screenshotBytes.length,
        sha256: sha256(screenshotBytes),
      },
      copy: {
        byteCount: screenshotBytes.length,
        sha256: sha256(screenshotBytes),
      },
      hashesMatch: true,
    });
    await expect(
      readFile(entry?.files.geometry.copy.path ?? ""),
    ).resolves.toEqual(await readFile(source.geometry));
    await expect(
      readFile(entry?.files.screenshot.copy.path ?? ""),
    ).resolves.toEqual(screenshotBytes);
  });

  it("rejects a geometry attachment without its screenshot pair", async () => {
    const root = await temporaryRoot();
    const sourceOutput = path.join(root, "source-output");
    await writePair({
      sourceOutput,
      testDirectory: "missing-screenshot",
      slug: "missing-screenshot",
      geometryOnly: true,
    });

    await expect(
      stabilizeFinalEvidence({
        sourceOutput,
        destination: path.join(root, "stable"),
        manifest: path.join(root, "manifest.json"),
      }),
    ).rejects.toThrow(
      "Missing screenshot pair for final-tour-missing-screenshot-800x600-en",
    );
  });

  it("rejects the entire source before copying when any error-context.md is present", async () => {
    const root = await temporaryRoot();
    const sourceOutput = path.join(root, "source-output");
    const destination = path.join(root, "stable");
    await writePair({
      sourceOutput,
      testDirectory: "failed-case",
      slug: "failed",
    });
    await writeFile(
      path.join(sourceOutput, "failed-case", "error-context.md"),
      "# failure\n",
    );

    await expect(
      stabilizeFinalEvidence({
        sourceOutput,
        destination,
        manifest: path.join(root, "manifest.json"),
      }),
    ).rejects.toThrow("Source output contains error-context.md");
    await expect(access(destination)).rejects.toThrow();
  });
});
