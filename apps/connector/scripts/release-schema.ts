import { z } from 'zod'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const file = z.object({ path: z.string().regex(/^[A-Za-z0-9@_.+/-]+$/), mode: z.union([z.literal(0o600), z.literal(0o700)]),
  size: z.number().int().nonnegative().max(512 * 1024 * 1024), sha256: hash }).strict()
export const releaseSchema = z.object({
  schema: z.literal('workmesh-connector-release'),
  connectorVersion: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-z0-9.-]+)?$/),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/), sourceTree: z.string().regex(/^[a-f0-9]{40}$/),
  lockSha256: hash, nodeVersion: z.string().regex(/^\d+\.\d+\.\d+$/), platform: z.literal('linux'),
  arch: z.enum(['amd64', 'arm64']), publicKeySha256: hash,
  archive: z.object({ name: z.string().regex(/^workmesh-connector-[a-z0-9.-]+\.tar\.gz$/), size: file.shape.size, sha256: hash }).strict(),
  files: z.array(file).min(1).max(10000), installerFiles: z.array(file).min(1).max(1000),
  installScriptSha256: hash,
  nativeDependencies: z.array(z.object({ name: z.string(), version: z.string(), integrity: z.string(),
    binaries: z.array(z.object({ path: z.string(), elfMachine: z.number().int(), needed: z.array(z.string()),
      symbolVersions: z.array(z.string()) }).strict()) }).strict()).min(3),
  build: z.object({ headersSha256: hash, headersUrl: z.string().url(), runtimeSha256: hash,
    tools: z.record(z.string()), nodeAbi: z.string() }).strict(),
  licenses: z.array(z.string()).min(1),
}).strict()
export type ReleaseManifest = z.infer<typeof releaseSchema>
