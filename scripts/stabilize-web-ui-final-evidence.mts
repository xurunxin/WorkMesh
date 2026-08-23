import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const STABLE_WEB_UI_EVIDENCE_SCHEMA_VERSION = 1 as const;

type CliArguments = Readonly<{
  help: boolean;
  sourceOutput: string | null;
  destination: string | null;
  manifest: string | null;
}>;

type GeometryEvidence = Readonly<{
  schemaVersion: number;
  name: string;
  route: {
    hash: string;
    pathname: string;
    search: string;
  };
  locale: {
    cookie: string | null;
    requested: string;
  };
  viewport: {
    height: number;
    width: number;
  };
  requests: {
    count: number;
  };
  geometry: Readonly<Record<string, unknown>>;
}>;

type EvidencePair = Readonly<{
  geometryPath: string;
  screenshotPath: string;
  sourceTestDirectory: string;
  stem: string;
}>;

export type StableEvidenceFile = Readonly<{
  source: {
    path: string;
    byteCount: number;
    sha256: string;
  };
  copy: {
    path: string;
    byteCount: number;
    sha256: string;
  };
  hashesMatch: true;
}>;

export type StableEvidenceEntry = Readonly<{
  name: string;
  title: string;
  sourceTestDirectory: string;
  route: {
    hash: string;
    href: string;
    pathname: string;
    search: string;
  };
  locale: GeometryEvidence["locale"];
  viewport: GeometryEvidence["viewport"];
  requestCount: number;
  geometrySchema: {
    schemaVersion: number;
  };
  files: {
    geometry: StableEvidenceFile;
    screenshot: StableEvidenceFile;
  };
}>;

export type StableWebUiEvidenceManifest = Readonly<{
  schemaVersion: typeof STABLE_WEB_UI_EVIDENCE_SCHEMA_VERSION;
  kind: "workmesh.web-ui-final-stable-evidence";
  generatedAt: string;
  status: "pass";
  sourceOutput: string;
  destination: string;
  manifestPath: string;
  pairCount: number;
  entries: StableEvidenceEntry[];
}>;

const HELP = `Usage: pnpm exec tsx scripts/stabilize-web-ui-final-evidence.mts \\
  --source-output <mocked-dev/output> --destination <stable-directory> --manifest <file>

Copies only successful final-tour geometry/screenshot attachment pairs into a stable directory.
The source is rejected when any error-context.md exists. Every source and copied file is read as
raw bytes and must have the same byte count and SHA-256 before the manifest is written.
`;

const requireValue = (
  values: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = values[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`${flag} requires a value`);
  return value;
};

export const parseStableEvidenceArguments = (
  values: readonly string[],
): CliArguments => {
  let help = false;
  let sourceOutput: string | null = null;
  let destination: string | null = null;
  let manifest: string | null = null;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") {
      help = true;
      continue;
    }
    if (value === "--source-output") {
      sourceOutput = requireValue(values, index, value);
      index += 1;
      continue;
    }
    if (value === "--destination") {
      destination = requireValue(values, index, value);
      index += 1;
      continue;
    }
    if (value === "--manifest") {
      manifest = requireValue(values, index, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value ?? "(missing)"}`);
  }

  if (!help) {
    if (!sourceOutput) throw new Error("--source-output is required");
    if (!destination) throw new Error("--destination is required");
    if (!manifest) throw new Error("--manifest is required");
  }
  return { help, sourceOutput, destination, manifest };
};

const sha256 = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
};

const normalizedForComparison = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLocaleLowerCase() : resolved;
};

const pathContains = (parent: string, candidate: string): boolean => {
  const normalizedParent = normalizedForComparison(parent);
  const normalizedCandidate = normalizedForComparison(candidate);
  const relative = path.relative(normalizedParent, normalizedCandidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const listFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
        continue;
      }
      if (entry.isFile()) files.push(target);
    }
  };
  await visit(directory);
  return files;
};

const geometryPattern = /^(?<stem>.+)-geometry-[0-9a-f]{40}\.json$/i;
const screenshotPattern = /^(?<stem>.+)-screenshot-[0-9a-f]{40}\.png$/i;

export const discoverEvidencePairs = async (
  sourceOutput: string,
): Promise<EvidencePair[]> => {
  const files = await listFiles(sourceOutput);
  const errorContext = files.find(
    (file) => path.basename(file).toLocaleLowerCase() === "error-context.md",
  );
  if (errorContext) {
    throw new Error(`Source output contains error-context.md: ${errorContext}`);
  }

  const groups = new Map<
    string,
    {
      geometry: string[];
      screenshot: string[];
      sourceTestDirectory: string;
      stem: string;
    }
  >();
  for (const file of files) {
    const attachmentsDirectory = path.dirname(file);
    if (path.basename(attachmentsDirectory) !== "attachments") continue;
    const geometryMatch = path.basename(file).match(geometryPattern);
    const screenshotMatch = path.basename(file).match(screenshotPattern);
    const match = geometryMatch ?? screenshotMatch;
    const stem = match?.groups?.stem;
    if (!stem) continue;
    const key = `${normalizedForComparison(attachmentsDirectory)}\0${stem}`;
    const group = groups.get(key) ?? {
      geometry: [],
      screenshot: [],
      sourceTestDirectory: path.dirname(attachmentsDirectory),
      stem,
    };
    if (geometryMatch) group.geometry.push(file);
    if (screenshotMatch) group.screenshot.push(file);
    groups.set(key, group);
  }

  if (groups.size === 0) {
    throw new Error(
      `No final-tour geometry/screenshot attachment pairs found in ${sourceOutput}`,
    );
  }

  const pairs: EvidencePair[] = [];
  for (const group of groups.values()) {
    if (group.geometry.length === 0)
      throw new Error(`Missing geometry pair for ${group.stem}`);
    if (group.screenshot.length === 0)
      throw new Error(`Missing screenshot pair for ${group.stem}`);
    if (group.geometry.length !== 1)
      throw new Error(`Duplicate geometry attachments for ${group.stem}`);
    if (group.screenshot.length !== 1)
      throw new Error(`Duplicate screenshot attachments for ${group.stem}`);
    pairs.push({
      geometryPath: group.geometry[0] as string,
      screenshotPath: group.screenshot[0] as string,
      sourceTestDirectory: group.sourceTestDirectory,
      stem: group.stem,
    });
  }
  return pairs.sort(
    (left, right) =>
      left.stem.localeCompare(right.stem) ||
      left.sourceTestDirectory.localeCompare(right.sourceTestDirectory),
  );
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredObject = (
  value: Record<string, unknown>,
  key: string,
  source: string,
): Record<string, unknown> => {
  const child = value[key];
  if (!isObject(child)) throw new Error(`Invalid geometry ${key} in ${source}`);
  return child;
};

const requiredString = (
  value: Record<string, unknown>,
  key: string,
  source: string,
): string => {
  const child = value[key];
  if (typeof child !== "string")
    throw new Error(`Invalid geometry ${key} in ${source}`);
  return child;
};

const requiredInteger = (
  value: Record<string, unknown>,
  key: string,
  source: string,
  minimum: number,
): number => {
  const child = value[key];
  if (!Number.isInteger(child) || (child as number) < minimum) {
    throw new Error(`Invalid geometry ${key} in ${source}`);
  }
  return child as number;
};

export const parseGeometryEvidence = (
  bytes: Buffer,
  source: string,
): GeometryEvidence => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    throw new Error(`Invalid geometry JSON in ${source}`);
  }
  if (!isObject(parsed))
    throw new Error(`Invalid geometry document in ${source}`);

  const route = requiredObject(parsed, "route", source);
  const locale = requiredObject(parsed, "locale", source);
  const viewport = requiredObject(parsed, "viewport", source);
  const requests = requiredObject(parsed, "requests", source);
  const geometry = requiredObject(parsed, "geometry", source);
  const cookie = locale.cookie;
  if (cookie !== null && typeof cookie !== "string") {
    throw new Error(`Invalid geometry locale.cookie in ${source}`);
  }

  return {
    schemaVersion: requiredInteger(parsed, "schemaVersion", source, 1),
    name: requiredString(parsed, "name", source),
    route: {
      hash: requiredString(route, "hash", source),
      pathname: requiredString(route, "pathname", source),
      search: requiredString(route, "search", source),
    },
    locale: {
      cookie,
      requested: requiredString(locale, "requested", source),
    },
    viewport: {
      height: requiredInteger(viewport, "height", source, 1),
      width: requiredInteger(viewport, "width", source, 1),
    },
    requests: {
      count: requiredInteger(requests, "count", source, 0),
    },
    geometry,
  };
};

const titleFromGeometry = (
  geometry: GeometryEvidence,
  source: string,
): string => {
  const suffix = `-${geometry.viewport.width}x${geometry.viewport.height}-${geometry.locale.requested}`;
  if (
    !geometry.name.startsWith("final-tour-") ||
    !geometry.name.endsWith(suffix)
  ) {
    throw new Error(
      `Geometry name does not match final-tour viewport/locale in ${source}`,
    );
  }
  const slug = geometry.name.slice("final-tour-".length, -suffix.length);
  if (!slug)
    throw new Error(`Geometry name has no final-tour slug in ${source}`);
  return `${slug} at ${geometry.viewport.width}x${geometry.viewport.height} ${geometry.locale.requested}`;
};

const ensureSafeStableName = (name: string, source: string): void => {
  if (
    name === "." ||
    name === ".." ||
    path.basename(name) !== name ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error(`Geometry name is not a safe stable filename in ${source}`);
  }
};

const readExisting = async (target: string): Promise<Buffer | null> => {
  try {
    return await readFile(target);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
};

const writeNewAtomically = async (
  target: string,
  bytes: Buffer,
): Promise<void> => {
  const temporary = path.join(
    path.dirname(target),
    `.workmesh-stabilize-${path.basename(target)}-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
};

const copyAndVerify = async (
  source: string,
  target: string,
): Promise<StableEvidenceFile> => {
  const sourceBytes = await readFile(source);
  const sourceHash = sha256(sourceBytes);
  const existing = await readExisting(target);
  if (existing) {
    if (
      existing.length !== sourceBytes.length ||
      sha256(existing) !== sourceHash
    ) {
      throw new Error(
        `Stable copy already exists with different bytes: ${target}`,
      );
    }
  } else {
    await writeNewAtomically(target, sourceBytes);
  }

  const copiedBytes = await readFile(target);
  const copiedHash = sha256(copiedBytes);
  if (copiedBytes.length !== sourceBytes.length || copiedHash !== sourceHash) {
    throw new Error(`Stable copy hash mismatch: ${target}`);
  }
  return {
    source: { path: source, byteCount: sourceBytes.length, sha256: sourceHash },
    copy: { path: target, byteCount: copiedBytes.length, sha256: copiedHash },
    hashesMatch: true,
  };
};

const writeManifest = async (
  manifestPath: string,
  manifest: StableWebUiEvidenceManifest,
): Promise<void> => {
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const temporary = path.join(
    path.dirname(manifestPath),
    `.workmesh-stabilize-${path.basename(manifestPath)}-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, manifestPath);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const stabilizeFinalEvidence = async (
  input: Readonly<{
    sourceOutput: string;
    destination: string;
    manifest: string;
    now?: () => Date;
  }>,
): Promise<StableWebUiEvidenceManifest> => {
  const sourceOutput = path.resolve(input.sourceOutput);
  const destination = path.resolve(input.destination);
  const manifestPath = path.resolve(input.manifest);
  const sourceStat = await lstat(sourceOutput);
  if (!sourceStat.isDirectory())
    throw new Error(`Source output is not a directory: ${sourceOutput}`);
  if (
    pathContains(sourceOutput, destination) ||
    pathContains(destination, sourceOutput)
  ) {
    throw new Error("Source output and stable destination must not overlap");
  }
  if (pathContains(sourceOutput, manifestPath)) {
    throw new Error("Manifest must not modify the source output");
  }

  const pairs = await discoverEvidencePairs(sourceOutput);
  await mkdir(destination, { recursive: true });
  const entries: StableEvidenceEntry[] = [];
  const stableNames = new Set<string>();
  for (const pair of pairs) {
    const geometryBytes = await readFile(pair.geometryPath);
    const geometry = parseGeometryEvidence(geometryBytes, pair.geometryPath);
    if (geometry.name !== pair.stem) {
      throw new Error(
        `Geometry name does not match attachment stem in ${pair.geometryPath}`,
      );
    }
    ensureSafeStableName(geometry.name, pair.geometryPath);
    if (stableNames.has(geometry.name))
      throw new Error(`Duplicate stable evidence name: ${geometry.name}`);
    stableNames.add(geometry.name);

    const geometryTarget = path.join(destination, `${geometry.name}.json`);
    const screenshotTarget = path.join(destination, `${geometry.name}.png`);
    const geometryFile = await copyAndVerify(pair.geometryPath, geometryTarget);
    const screenshotFile = await copyAndVerify(
      pair.screenshotPath,
      screenshotTarget,
    );
    entries.push({
      name: geometry.name,
      title: titleFromGeometry(geometry, pair.geometryPath),
      sourceTestDirectory: pair.sourceTestDirectory,
      route: {
        ...geometry.route,
        href: `${geometry.route.pathname}${geometry.route.search}${geometry.route.hash}`,
      },
      locale: geometry.locale,
      viewport: geometry.viewport,
      requestCount: geometry.requests.count,
      geometrySchema: { schemaVersion: geometry.schemaVersion },
      files: {
        geometry: geometryFile,
        screenshot: screenshotFile,
      },
    });
  }

  const manifest: StableWebUiEvidenceManifest = {
    schemaVersion: STABLE_WEB_UI_EVIDENCE_SCHEMA_VERSION,
    kind: "workmesh.web-ui-final-stable-evidence",
    generatedAt: (input.now ?? (() => new Date()))().toISOString(),
    status: "pass",
    sourceOutput,
    destination,
    manifestPath,
    pairCount: entries.length,
    entries,
  };
  await writeManifest(manifestPath, manifest);
  return manifest;
};

const isDirectExecution = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;

if (isDirectExecution) {
  try {
    const args = parseStableEvidenceArguments(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(HELP);
    } else {
      const manifest = await stabilizeFinalEvidence({
        sourceOutput: args.sourceOutput as string,
        destination: args.destination as string,
        manifest: args.manifest as string,
      });
      process.stdout.write(
        `Stabilized ${manifest.pairCount} final Web UI evidence pairs; manifest written to ${manifest.manifestPath}\n`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Stable Web UI evidence failed: ${message}\n`);
    process.exitCode = 1;
  }
}
