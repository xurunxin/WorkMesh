import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { featureDefinitions, releaseMetadata } from '../packages/contracts/src/index.js'

type ImageRecord = Readonly<{
  service: 'api' | 'worker' | 'mcp' | 'web'
  sourceSha: string
  candidateTag: string
  image: string
  digest: string
  webApiUrl: string | null
  provenanceUrl: string
  sbomAttestationUrl: string
}>

const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex')

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message)
}

const collectImageRecords = async (directory: string): Promise<ImageRecord[]> => {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  const records: ImageRecord[] = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name !== 'image.json') continue
    const parent = entry.parentPath ?? entry.path
    records.push(JSON.parse(await readFile(path.join(parent, entry.name), 'utf8')) as ImageRecord)
  }
  return records
}

export const createReleaseManifest = async (input: Readonly<{
  root: string
  tag: string
  sourceSha: string
  imagesDirectory: string
  runUrl: string
  generatedAt?: string
}>): Promise<Record<string, unknown>> => {
  assert(/^v1\.0\.0-rc\.[1-9][0-9]*$/.test(input.tag), `Invalid candidate tag: ${input.tag}`)
  assert(/^[0-9a-f]{40}$/.test(input.sourceSha), `Invalid source SHA: ${input.sourceSha}`)
  assert(/^https:\/\//.test(input.runUrl), `Invalid workflow run URL: ${input.runUrl}`)

  const records = await collectImageRecords(input.imagesDirectory)
  const expectedServices = ['api', 'mcp', 'web', 'worker'] as const
  assert(records.length === expectedServices.length, 'Exactly four image records are required')
  const sorted = [...records].sort((left, right) => left.service.localeCompare(right.service))
  assert(
    JSON.stringify(sorted.map(record => record.service)) === JSON.stringify(expectedServices),
    'Image records must contain api, mcp, web, and worker exactly once',
  )

  for (const record of sorted) {
    assert(record.sourceSha === input.sourceSha, `${record.service} source SHA mismatch`)
    assert(record.candidateTag === input.tag, `${record.service} candidate tag mismatch`)
    assert(
      record.image.endsWith(`/workmesh-${record.service}`),
      `${record.service} image name mismatch`,
    )
    assert(/^sha256:[0-9a-f]{64}$/.test(record.digest), `${record.service} digest is invalid`)
    assert(/^https:\/\//.test(record.provenanceUrl), `${record.service} provenance URL is invalid`)
    assert(/^https:\/\//.test(record.sbomAttestationUrl), `${record.service} SBOM URL is invalid`)
    if (record.service === 'web') assert(record.webApiUrl !== null, 'Web API URL is required')
    else assert(record.webApiUrl === null, `${record.service} must not declare a Web API URL`)
  }

  const lock = await readFile(path.join(input.root, 'pnpm-lock.yaml'))
  const migrationManifest = await readFile(
    path.join(input.root, 'packages/db/src/migration-manifest.ts'),
  )
  const featureRegistry = await readFile(path.join(input.root, 'packages/contracts/src/index.ts'))

  return {
    formatVersion: 1,
    release: {
      candidateTag: input.tag,
      sourceSha: input.sourceSha,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      workflowRunUrl: input.runUrl,
    },
    versions: releaseMetadata,
    inputs: {
      pnpmLockSha256: sha256(lock),
      migrationManifestSha256: sha256(migrationManifest),
      featureRegistrySha256: sha256(featureRegistry),
    },
    featureFlags: featureDefinitions.map(feature => ({
      key: feature.key,
      tier: feature.tier,
      defaultEnabled: feature.defaultEnabled,
    })),
    images: Object.fromEntries(sorted.map(record => [record.service, {
      name: record.image,
      digest: record.digest,
      sourceSha: record.sourceSha,
      candidateTag: record.candidateTag,
      webApiUrl: record.webApiUrl,
      provenanceUrl: record.provenanceUrl,
      sbomAttestationUrl: record.sbomAttestationUrl,
    }])),
    securityPolicy: {
      blockingSeverities: ['HIGH', 'CRITICAL'],
      automaticRetries: false,
      scanners: ['pnpm-audit', 'trivy-source', 'trivy-secret', 'trivy-image'],
    },
    promotion: {
      targetTag: 'v1.0.0',
      rebuildAllowed: false,
      requiredDigestEquality: true,
    },
  }
}

const argumentsMap = new Map<string, string>()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || value === undefined) throw new Error('Arguments must be --name value pairs')
  argumentsMap.set(name.slice(2), value)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const required = (name: string): string => {
    const value = argumentsMap.get(name)
    if (!value) throw new Error(`--${name} is required`)
    return value
  }
  const output = path.resolve(required('output'))
  const manifest = await createReleaseManifest({
    root: path.resolve('.'),
    tag: required('tag'),
    sourceSha: required('sha'),
    imagesDirectory: path.resolve(required('images')),
    runUrl: required('run-url'),
  })
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Release manifest written to ${output}`)
}
