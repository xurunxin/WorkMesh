import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash, randomUUID, verify } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'yaml'

const root = path.resolve(import.meta.dirname, '..')
const imageVariables = {
  api: 'WORKMESH_API_IMAGE',
  worker: 'WORKMESH_WORKER_IMAGE',
  mcp: 'WORKMESH_MCP_IMAGE',
  web: 'WORKMESH_WEB_IMAGE',
}
const imageEnvironmentVariables = Object.values(imageVariables)
const arguments_ = process.argv.slice(2)
let environmentFile

if (arguments_.length > 1)
  throw new Error('Usage: pnpm validate:production-images [--env-file=<path>]')
if (arguments_.length === 1) {
  const argument = arguments_[0]
  if (!argument.startsWith('--env-file=')) throw new Error('Expected --env-file=<path>')
  const value = argument.slice('--env-file='.length).trim()
  if (!value) throw new Error('--env-file requires a non-empty path after "="')
  environmentFile = path.resolve(process.cwd(), value)
  for (const name of imageEnvironmentVariables) delete process.env[name]
  try {
    process.loadEnvFile(environmentFile)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to load --env-file "${environmentFile}": ${reason}`)
  }
}

const composePath = path.join(root, 'docker-compose.production.yml')
const source = await readFile(composePath, 'utf8')
const compose = parse(source, { merge: true })
const retentionPolicy = JSON.parse(
  await readFile(path.join(root, 'infra', 's3', 'worker-retention-policy.template.json'), 'utf8'),
)
const applicationServices = ['api', 'worker', 'mcp', 'web']
const hardenedServices = ['migrate', ...applicationServices]

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const workmeshCredentialPattern = /(?:^|[^A-Za-z0-9_-])(?:wmp|wmi)_[A-Za-z0-9_-]{16,}(?:$|[^A-Za-z0-9_-])/u

const assertNoWorkMeshCredential = (value, location) => {
  assert(
    !workmeshCredentialPattern.test(String(value ?? '')),
    `${location} must not contain a WorkMesh pairing or Installation credential`,
  )
}

const sanitizeDiagnostic = (value) =>
  String(value ?? '')
    .replace(/\b(?:wmp|wmi)_[A-Za-z0-9_-]+\b/gu, '[REDACTED_WORKMESH_CREDENTIAL]')
    .slice(-4_000)

const describeCommandFailure = (action, result) => {
  const reason = result.error instanceof Error ? result.error.message : `exit ${String(result.status)}`
  const diagnostic = sanitizeDiagnostic(result.stderr || result.stdout)
  return `${action} failed (${reason})${diagnostic ? `: ${diagnostic}` : ''}`
}

const runDocker = (dockerArguments, options = {}) =>
  spawnSync('docker', dockerArguments, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  })

const assertDockerSuccess = (result, action) => {
  assert(result.status === 0, describeCommandFailure(action, result))
  return result
}

const inspectContainer = (containerId) => {
  const result = runDocker(['inspect', containerId])
  if (result.status !== 0) return undefined
  const inspections = JSON.parse(result.stdout)
  return inspections.length === 1 ? inspections[0] : undefined
}

const inspectImage = (imageReference) => {
  const result = runDocker(['image', 'inspect', imageReference])
  if (result.status !== 0) return undefined
  const inspections = JSON.parse(result.stdout)
  return inspections.length === 1 ? inspections[0] : undefined
}

const exactContainerMatches = (containerName) => {
  const result = assertDockerSuccess(
    runDocker([
      'ps',
      '-a',
      '--no-trunc',
      '--filter',
      `name=${containerName}`,
      '--format',
      '{{.ID}}|{{.Names}}',
    ]),
    'Docker exact-name preflight',
  )
  return result.stdout
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((value) => {
      const separator = value.indexOf('|')
      return { id: value.slice(0, separator), name: value.slice(separator + 1) }
    })
    .filter(({ name }) => name === containerName)
}

const loadPinnedSkill = async () => {
  const [artifact, manifestSource, publicKey] = await Promise.all([
    readFile(path.join(root, 'apps', 'web', 'public', 'skills', 'workmesh-1.1.0.md')),
    readFile(path.join(root, 'packages', 'contracts', 'src', 'workmesh-skill-manifest.ts'), 'utf8'),
    readFile(path.join(root, 'skills', 'workmesh', 'public-key.pem'), 'utf8'),
  ])
  const manifest = /sha256: '([^']+)',\s+signature: 'ed25519:([^']+)'/su.exec(manifestSource)
  assert(manifest, 'WorkMesh Skill manifest must contain a SHA-256 digest and Ed25519 signature')
  const digest = `sha256:${createHash('sha256').update(artifact).digest('hex')}`
  assert(manifest[1] === digest, 'tracked WorkMesh Skill bytes must match the pinned manifest digest')
  const signature = Buffer.from(manifest[2], 'base64')
  assert(verify(null, artifact, publicKey, signature), 'tracked WorkMesh Skill signature must be valid')
  return { artifact, digest, publicKey, signature }
}

const probeWebSkillImage = async (imageReference, runId) => {
  const containerName = `workmesh-web-skill-probe-${runId}`
  const ownershipLabel = `io.workmesh.validation.run=${runId}`
  assert(
    exactContainerMatches(containerName).length === 0,
    `Web Skill probe container name is already in use: ${containerName}`,
  )

  const createResult = assertDockerSuccess(
    runDocker([
      'create',
      '--name',
      containerName,
      '--label',
      ownershipLabel,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      imageReference,
    ]),
    'Docker Web Skill probe container creation',
  )
  const containerId = createResult.stdout.trim()
  assert(/^[a-f0-9]{64}$/u.test(containerId), 'Docker must return the full Web Skill probe container ID')

  let failure
  try {
    const inspection = inspectContainer(containerId)
    assert(inspection?.Id === containerId, 'Docker must inspect the exact Web Skill probe container')
    assert(
      /^sha256:[a-f0-9]{64}$/u.test(inspection.Image),
      'Docker must expose the immutable Web image content ID',
    )
    const imageId = inspection.Image
    const imageInspection = inspectImage(imageId)
    assert(imageInspection?.Id === imageId, 'Docker must inspect the exact immutable Web image')
    assertNoWorkMeshCredential(
      JSON.stringify({
        env: imageInspection.Config?.Env,
        labels: imageInspection.Config?.Labels,
        repoDigests: imageInspection.RepoDigests,
        repoTags: imageInspection.RepoTags,
      }),
      'production Web image metadata and environment',
    )
    const history = assertDockerSuccess(
      runDocker(['history', '--no-trunc', '--format', '{{json .}}', imageId]),
      'Docker Web image history inspection',
    )
    assertNoWorkMeshCredential(history.stdout, 'production Web image history')
    assert(
      inspection.Config.Labels['io.workmesh.validation.run'] === runId,
      'Web Skill probe container must carry the validator ownership label',
    )
    assert(
      inspection.HostConfig.NetworkMode === 'none',
      'Web Skill probe container must not have external network access',
    )
    assertNoWorkMeshCredential(
      JSON.stringify({ env: inspection.Config.Env, labels: inspection.Config.Labels }),
      'production Web probe container metadata and environment',
    )
    assertDockerSuccess(runDocker(['start', containerId]), 'Docker Web Skill probe container start')

    const probeSource = [
      "const response = await fetch('http://127.0.0.1:3000/skills/workmesh-1.1.0.md', { redirect: 'manual' })",
      'const body = Buffer.from(await response.arrayBuffer())',
      "process.stdout.write(JSON.stringify({ status: response.status, location: response.headers.get('location'), body: body.toString('base64') }))",
    ].join('; ')
    let probeResult
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      const current = runDocker(['exec', containerId, 'node', '--input-type=module', '-e', probeSource])
      if (current.status === 0) {
        probeResult = current
        break
      }
      const currentInspection = inspectContainer(containerId)
      if (!currentInspection?.State?.Running) {
        const logs = runDocker(['logs', containerId])
        throw new Error(
          `Web Skill probe container stopped before serving the artifact: ${sanitizeDiagnostic(logs.stderr || logs.stdout)}`,
        )
      }
      await delay(500)
    }
    assert(probeResult, 'Web Skill probe timed out waiting for the production Web runtime')

    const response = JSON.parse(probeResult.stdout)
    assert(response.status === 200, `versioned WorkMesh Skill URL must return 200, got ${String(response.status)}`)
    assert(response.location === null, 'versioned WorkMesh Skill URL must not redirect')
    const downloadedArtifact = Buffer.from(response.body, 'base64')
    const pinned = await loadPinnedSkill()
    assert(
      downloadedArtifact.equals(pinned.artifact),
      'production Web image must serve the exact tracked WorkMesh Skill bytes',
    )
    const downloadedDigest = `sha256:${createHash('sha256').update(downloadedArtifact).digest('hex')}`
    assert(downloadedDigest === pinned.digest, 'served WorkMesh Skill bytes must match the manifest digest')
    assert(
      verify(null, downloadedArtifact, pinned.publicKey, pinned.signature),
      'served WorkMesh Skill signature must validate over the exact response bytes',
    )
    assertNoWorkMeshCredential(downloadedArtifact.toString('utf8'), 'served WorkMesh Skill')
    const logs = assertDockerSuccess(
      runDocker(['logs', containerId]),
      'Docker Web Skill probe log inspection',
    )
    assertNoWorkMeshCredential(
      `${logs.stdout}\n${logs.stderr}`,
      'production Web runtime logs',
    )
    return { artifactDigest: downloadedDigest, imageId }
  } catch (error) {
    failure = error
    throw error
  } finally {
    const inspection = inspectContainer(containerId)
    if (inspection !== undefined) {
      const owned =
        inspection.Id === containerId &&
        inspection.Config.Labels['io.workmesh.validation.run'] === runId
      if (!owned) {
        if (failure === undefined)
          throw new Error('Refusing to remove a Web Skill probe container without the ownership label')
      } else {
        const cleanup = runDocker(['rm', '-f', containerId])
        if (cleanup.status !== 0 && failure === undefined)
          throw new Error(describeCommandFailure('Docker Web Skill probe cleanup', cleanup))
      }
    }
  }
}

const validateProductionWebSkill = async () => {
  const runId = randomUUID()
  let imageReference = environmentFile ? process.env.WORKMESH_WEB_IMAGE : undefined
  let locallyBuilt = false
  if (!imageReference) {
    imageReference = `workmesh-validation/workmesh-web-skill:${runId}`
    const build = runDocker([
      'build',
      '--build-arg',
      `WORKMESH_BUILD_SHA=${'f'.repeat(40)}`,
      '--build-arg',
      'NEXT_PUBLIC_API_URL=http://127.0.0.1:3001',
      '--label',
      `io.workmesh.validation.run=${runId}`,
      '--file',
      path.join(root, 'infra', 'docker', 'web.production.Dockerfile'),
      '--tag',
      imageReference,
      root,
    ])
    assertDockerSuccess(build, 'Docker production Web image build')
    locallyBuilt = true
  }

  let failure
  try {
    const { artifactDigest, imageId } = await probeWebSkillImage(imageReference, runId)
    console.log(
      `Production Web Skill runtime probe passed (artifact ${artifactDigest}; image ${imageId})`,
    )
  } catch (error) {
    failure = error
    throw error
  } finally {
    if (locallyBuilt) {
      const inspection = inspectImage(imageReference)
      if (inspection === undefined) {
        if (failure === undefined)
          throw new Error('Locally built validation Web image disappeared before ownership cleanup')
      } else {
        const owned = inspection.Config?.Labels?.['io.workmesh.validation.run'] === runId
          && inspection.RepoTags?.includes(imageReference)
          && /^sha256:[a-f0-9]{64}$/u.test(inspection.Id)
        if (!owned) {
          if (failure === undefined)
            throw new Error('Refusing to remove a validation Web image without exact ownership proof')
        } else {
          const cleanup = runDocker(['image', 'rm', inspection.Id])
          if (cleanup.status !== 0 && failure === undefined)
            throw new Error(describeCommandFailure('Docker validation Web image cleanup', cleanup))
        }
      }
    }
  }
}

for (const name of applicationServices) {
  const service = compose.services[name]
  const variable = imageVariables[name]
  assert(service && !service.build, `${name} must use a published image without a build section`)
  assert(
    service.image === `\${${variable}:?${variable} is required}`,
    `${name} must use its explicit required full-image reference`,
  )
  assert(
    service.healthcheck?.test?.includes('/app/healthcheck.mjs'),
    `${name} must define its own healthcheck`,
  )
}
assert(
  compose.services.migrate.image === '${WORKMESH_API_IMAGE:?WORKMESH_API_IMAGE is required}',
  'migrate must use the exact API image reference',
)

const imageReference = (name, suffix) => `ghcr.io/workmesh-validation/workmesh-${name}${suffix}`
const shaTag = `:${'a'.repeat(40)}`
const digest = `@sha256:${'b'.repeat(64)}`
const validImageReference = (name, value) =>
  new RegExp(
    `^ghcr\\.io\\/[a-z0-9][a-z0-9._/-]*\\/workmesh-${name}(?::[0-9a-f]{40}|@sha256:[0-9a-f]{64})$`,
  ).test(value)

for (const name of applicationServices) {
  assert(
    validImageReference(name, imageReference(name, shaTag)),
    `${name} exact-SHA tag must be accepted`,
  )
  assert(validImageReference(name, imageReference(name, digest)), `${name} digest must be accepted`)
  assert(
    !validImageReference(name, imageReference(name, ':latest')),
    `${name} floating tags must be rejected`,
  )
  const configured = process.env[imageVariables[name]]
  if (environmentFile)
    assert(configured, `${imageVariables[name]} is required in --env-file "${environmentFile}"`)
  if (configured && !/change[_-]?me/i.test(configured))
    assert(
      validImageReference(name, configured),
      `${imageVariables[name]} must be a GHCR exact-SHA tag or digest`,
    )
  else if (environmentFile)
    assert(false, `${imageVariables[name]} must be a GHCR exact-SHA tag or digest`)
}

assert(
  compose.services.postgres.healthcheck?.test?.some((value) =>
    value.includes('pg_isready -h 127.0.0.1'),
  ),
  'PostgreSQL readiness must use TCP so the temporary init server cannot satisfy it',
)
assert(
  source.includes('mc mb --with-lock --ignore-existing'),
  'production MinIO bucket creation must enable Object Lock at creation time',
)
const retentionPolicyActions = new Set(
  retentionPolicy.Statement.flatMap((statement) => statement.Action),
)
for (const action of [
  's3:GetBucketObjectLockConfiguration',
  's3:ListBucketVersions',
  's3:GetObjectVersion',
  's3:PutObject',
  's3:PutObjectRetention',
]) {
  assert(retentionPolicyActions.has(action), `production retention IAM policy must allow ${action}`)
}
assert(
  retentionPolicy.Statement.every((statement) => statement.Effect === 'Allow'),
  'production retention IAM policy must contain only explicit allow statements',
)
assert(
  !retentionPolicyActions.has('s3:DeleteObject') &&
    !retentionPolicyActions.has('s3:DeleteObjectVersion'),
  'production retention IAM policy must not grant archive deletion',
)
const retentionEnvironment = compose.services.worker.environment
assert(
  retentionEnvironment.WORKMESH_RETENTION_ARCHIVE_ENABLED === 'true',
  'production Worker must always enable retention archival',
)
assert(
  retentionEnvironment.WORKMESH_RETENTION_CLEANUP_ENABLED === 'false',
  'production Worker must keep cleanup disabled for the initial GA soak',
)
assert(
  retentionEnvironment.WORKMESH_EVENT_PRUNE_ENABLED === 'false',
  'production Worker must keep event pruning disabled for the initial GA soak',
)
for (const name of [
  'WORKMESH_EVENT_ARCHIVE_RETAIN_DAYS',
  'WORKMESH_RETENTION_IO_TIMEOUT_SECONDS',
  'WORKMESH_RETENTION_PROGRESS_STALE_SECONDS',
]) {
  assert(retentionEnvironment[name], `production Worker must configure ${name}`)
}

for (const name of hardenedServices) {
  const service = compose.services[name]
  assert(service.user === '10001:10001', `${name} must run as the fixed non-root identity`)
  assert(service.read_only === true, `${name} must use a read-only root filesystem`)
  assert(service.cap_drop?.includes('ALL'), `${name} must drop every Linux capability`)
  assert(
    service.security_opt?.includes('no-new-privileges:true'),
    `${name} must disable privilege escalation`,
  )
  assert(
    service.tmpfs?.some((value) => value.startsWith('/tmp:') && value.includes('noexec')),
    `${name} must mount an explicit noexec tmpfs`,
  )
}

for (const secret of [
  'POSTGRES_PASSWORD',
  'MINIO_ROOT_PASSWORD',
  'SESSION_SECRET',
  'WORKMESH_MASTER_KEY',
  'WORKMESH_BOOTSTRAP_TOKEN',
  'PAGINATION_CURSOR_KEYS',
  'AUTH_RATE_LIMIT_HMAC_KEY',
  'S3_SECRET_ACCESS_KEY',
]) {
  assert(!source.includes(`\${${secret}:-`), `${secret} must not have a production default`)
}
assert(
  source.includes('${WORKMESH_SESSION_TOKEN:-}'),
  'optional MCP Session Token must have only an empty default',
)
assert(
  source.includes('${WORKMESH_MCP_ACCESS_TOKEN:-}'),
  'optional MCP access token must have only an empty default',
)

for (const service of applicationServices) {
  const dockerfile = await readFile(
    path.join(root, 'infra', 'docker', `${service}.production.Dockerfile`),
    'utf8',
  )
  assert(
    (dockerfile.match(/^FROM /gm) ?? []).length >= 2,
    `${service} Dockerfile must be multi-stage`,
  )
  assert(dockerfile.includes('USER 10001:10001'), `${service} image must be non-root`)
  assert(
    dockerfile.includes('org.opencontainers.image.revision=$WORKMESH_BUILD_SHA'),
    `${service} image must carry the exact SHA label`,
  )
  assert(
    dockerfile.includes('apk upgrade --no-cache'),
    `${service} runtime image must apply current Alpine security upgrades`,
  )
  assert(
    dockerfile.includes('rm -rf /usr/local/lib/node_modules/npm') &&
      dockerfile.includes('/usr/local/lib/node_modules/corepack') &&
      dockerfile.includes('/opt/yarn-v1.22.22'),
    `${service} runtime image must remove unused bundled package managers`,
  )
  assert(
    dockerfile.includes('pnpm --filter @workmesh/config build') &&
      dockerfile.includes('packages/config/src/runtime-secrets.mjs ./runtime-secrets.mjs'),
    `${service} image must build and copy the canonical runtime secret validator`,
  )
  assert(
    !/^CMD .*tsx|^CMD .*dev|^CMD .*watch/m.test(dockerfile),
    `${service} runtime command must be compiled production code`,
  )
}
const webDockerfile = await readFile(
  path.join(root, 'infra', 'docker', 'web.production.Dockerfile'),
  'utf8',
)
const gitAttributes = await readFile(path.join(root, '.gitattributes'), 'utf8')
assert(
  gitAttributes
    .split(/\r?\n/u)
    .some((line) => line.trim() === 'apps/web/public/skills/*.md text eol=lf'),
  'published WorkMesh Skill artifacts must be pinned to LF in .gitattributes',
)
assert(
  webDockerfile.includes('io.workmesh.web.api-url=$NEXT_PUBLIC_API_URL'),
  'web image must expose its compiled API URL through the stable WorkMesh label',
)
assert(
  webDockerfile.includes('pnpm check:workmesh-skill'),
  'web image build must verify the pinned WorkMesh Skill before building Next.js',
)
assert(
  !webDockerfile.includes('COPY skills/workmesh ./skills/workmesh')
    && webDockerfile.includes(
      'COPY skills/workmesh/SKILL.md skills/workmesh/public-key.pem ./skills/workmesh/',
    )
    && webDockerfile.includes(
      'COPY skills/workmesh/references/protocol.md skills/workmesh/references/clients.md ./skills/workmesh/references/',
    ),
  'web image build must copy only public Skill sources and the verification key',
)
assert(
  webDockerfile.includes(
    'cp -R apps/web/public apps/web/.next/standalone/apps/web/public',
  ),
  'web image must copy public assets into the Next.js standalone runtime tree',
)

const deployPreparation = await readFile(
  path.join(root, 'infra', 'docker', 'prepare-production-deploy.mjs'),
  'utf8',
)
assert(
  deployPreparation.includes("path.join(packageRoot, 'migrations')") &&
    deployPreparation.includes("path.join(packageRoot, 'dist', 'migrations')"),
  'production deployment must copy database migrations beside the compiled migrator',
)
assert(
  deployPreparation.includes("manifest.name === '@workmesh/config'") &&
    deployPreparation.includes("path.join(packageRoot, 'dist', 'runtime-secrets.mjs')"),
  'production deployment must copy the canonical runtime validator beside compiled config',
)

const guard = path.join(root, 'infra', 'docker', 'runtime-guard.mjs')
const guardSource = await readFile(guard, 'utf8')
const configSource = await readFile(
  path.join(root, 'packages', 'config', 'src', 'index.ts'),
  'utf8',
)
assert(
  guardSource.includes('@workmesh/config') &&
    guardSource.includes("Cannot find package '@workmesh/config'") &&
    guardSource.includes('config.loadConfig(environment)') &&
    guardSource.includes('config.loadFeatureConfig(environment)') &&
    guardSource.includes('config.loadRealtimeRedisHintConfig(environment)') &&
    guardSource.includes('config.loadRetentionConfig(environment)'),
  'API and Worker runtime preflight must invoke the authoritative startup parsers',
)
assert(
  guardSource.includes('./runtime-secrets.mjs') &&
    configSource.includes('./runtime-secrets.mjs') &&
    !guardSource.includes('const requiredByService') &&
    !configSource.includes('const runtimeSecretEnvironmentNames'),
  'runtime secret validation rules must have one canonical implementation',
)
const runGuard = (environment) =>
  spawnSync(process.execPath, [guard], { cwd: root, env: environment })
const runAuthoritativeGuard = (environment) =>
  spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['-C', 'apps/api', 'exec', 'tsx', '../../infra/docker/runtime-guard.mjs'],
    {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )
const mcpEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  WORKMESH_SERVICE: 'mcp',
  WORKMESH_BUILD_SHA: 'a'.repeat(40),
  WORKMESH_API_URL: 'http://api:3001',
  WORKMESH_SESSION_TOKEN: 'session-' + 'b'.repeat(40),
  WORKMESH_MCP_ACCESS_TOKEN: 'access-' + 'c'.repeat(40),
}
assert(runGuard(mcpEnvironment).status === 0, 'strong MCP environment must pass preflight')
assert(
  runGuard({
    ...mcpEnvironment,
    WORKMESH_MCP_ACCESS_TOKEN: 'CHANGE_ME',
  }).status !== 0,
  'placeholder secrets must fail preflight',
)
assert(
  runGuard({
    ...mcpEnvironment,
    WORKMESH_MCP_ACCESS_TOKEN: mcpEnvironment.WORKMESH_SESSION_TOKEN,
  }).status !== 0,
  'secret reuse must fail preflight',
)

const paginationKey = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1)).toString(
  'base64url',
)
const bootstrapToken = Buffer.from(
  Array.from({ length: 32 }, (_, index) => index + 33),
).toString('base64url')
const objectStorePassword = 'minio-' + 'l'.repeat(40)
const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  WORKMESH_SERVICE: 'api',
  WORKMESH_BUILD_SHA: 'a'.repeat(40),
  DATABASE_URL: `postgres://workmesh:${'postgres-strong-'.concat('p'.repeat(32))}@postgres:5432/workmesh`,
  REDIS_URL: 'redis://redis:6379',
  SESSION_SECRET: 'session-' + 'd'.repeat(40),
  WORKMESH_MASTER_KEY: 'e'.repeat(64),
  WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
  PAGINATION_CURSOR_KEYS: `validation-key:${paginationKey}`,
  PAGINATION_CURSOR_ACTIVE_KID: 'validation-key',
  AUTH_RATE_LIMIT_HMAC_KEY: 'rate-limit-' + 'h'.repeat(40),
  S3_BUCKET: 'workmesh-artifacts',
  S3_ACCESS_KEY_ID: 'workmesh',
  S3_SECRET_ACCESS_KEY: objectStorePassword,
  WEB_ORIGIN: 'https://workmesh.test',
}
const composeEnvironment = {
  ...process.env,
  WORKMESH_API_IMAGE: imageReference('api', shaTag),
  WORKMESH_WORKER_IMAGE: imageReference('worker', shaTag),
  WORKMESH_MCP_IMAGE: imageReference('mcp', shaTag),
  WORKMESH_WEB_IMAGE: imageReference('web', shaTag),
  WORKMESH_BUILD_SHA: 'a'.repeat(40),
  POSTGRES_PASSWORD: 'postgres-' + 'k'.repeat(32),
  MINIO_ROOT_USER: 'workmesh',
  MINIO_ROOT_PASSWORD: objectStorePassword,
  SESSION_SECRET: apiEnvironment.SESSION_SECRET,
  WORKMESH_MASTER_KEY: apiEnvironment.WORKMESH_MASTER_KEY,
  WORKMESH_BOOTSTRAP_TOKEN: apiEnvironment.WORKMESH_BOOTSTRAP_TOKEN,
  PAGINATION_CURSOR_KEYS: apiEnvironment.PAGINATION_CURSOR_KEYS,
  PAGINATION_CURSOR_ACTIVE_KID: apiEnvironment.PAGINATION_CURSOR_ACTIVE_KID,
  AUTH_RATE_LIMIT_HMAC_KEY: apiEnvironment.AUTH_RATE_LIMIT_HMAC_KEY,
  WEB_ORIGIN: apiEnvironment.WEB_ORIGIN,
  S3_PUBLIC_ENDPOINT: 'https://objects.workmesh.test',
  S3_ACCESS_KEY_ID: apiEnvironment.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: apiEnvironment.S3_SECRET_ACCESS_KEY,
  NEXT_PUBLIC_API_URL: 'https://api.workmesh.test',
  WORKMESH_SESSION_TOKEN: '',
  WORKMESH_MCP_ACCESS_TOKEN: '',
}
const noProfile = spawnSync(
  'docker',
  ['compose', '-f', composePath, 'config', '--format', 'json'],
  {
    cwd: root,
    env: composeEnvironment,
    encoding: 'utf8',
  },
)
assert(noProfile.status === 0, 'production Compose must render without enabling the MCP profile')
const agentProfile = spawnSync(
  'docker',
  ['compose', '-f', composePath, '--profile', 'agent', 'config', '--format', 'json'],
  {
    cwd: root,
    env: composeEnvironment,
    encoding: 'utf8',
  },
)
assert(
  agentProfile.status === 0,
  'production Compose must render the agent profile with empty optional credentials',
)
const renderedAgent = JSON.parse(agentProfile.stdout)
const renderedRetention = renderedAgent.services.worker.environment
assert(
  renderedAgent.services.minio.environment.MINIO_ROOT_USER ===
    renderedAgent.services.api.environment.S3_ACCESS_KEY_ID &&
    renderedAgent.services.minio.environment.MINIO_ROOT_USER ===
      renderedAgent.services.worker.environment.S3_ACCESS_KEY_ID,
  'bundled MinIO access key must match the API and Worker S3 access key',
)
assert(
  renderedAgent.services.minio.environment.MINIO_ROOT_PASSWORD ===
    renderedAgent.services.api.environment.S3_SECRET_ACCESS_KEY &&
    renderedAgent.services.minio.environment.MINIO_ROOT_PASSWORD ===
      renderedAgent.services.worker.environment.S3_SECRET_ACCESS_KEY,
  'bundled MinIO secret must match the API and Worker S3 secret',
)
const apiGuard = runAuthoritativeGuard({
  ...process.env,
  ...renderedAgent.services.api.environment,
})
assert(
  apiGuard.status === 0,
  `rendered production API must pass the authoritative startup parser: ${apiGuard.stderr}`,
)
const workerGuard = runAuthoritativeGuard({
  ...process.env,
  ...renderedAgent.services.worker.environment,
})
assert(
  workerGuard.status === 0,
  `rendered production Worker must pass the authoritative startup parsers: ${workerGuard.stderr}`,
)
assert(
  renderedRetention.WORKMESH_RETENTION_ARCHIVE_ENABLED === 'true' &&
    renderedRetention.WORKMESH_RETENTION_CLEANUP_ENABLED === 'false' &&
    renderedRetention.WORKMESH_EVENT_PRUNE_ENABLED === 'false',
  'rendered production Worker must remain archive-only',
)
assert(
  renderedAgent.services.mcp.environment.WORKMESH_SESSION_TOKEN === '',
  'missing MCP Session Token must render as empty',
)
assert(
  renderedAgent.services.mcp.environment.WORKMESH_MCP_ACCESS_TOKEN === '',
  'missing MCP access token must render as empty',
)
assert(
  renderedAgent.services.mcp.environment.WORKMESH_BROWSER_ORIGIN === apiEnvironment.WEB_ORIGIN,
  'rendered MCP Browser CORS origin must match the externally visible Web origin',
)
assert(
  runGuard({
    ...process.env,
    ...renderedAgent.services.mcp.environment,
  }).status !== 0,
  'MCP runtime preflight must reject rendered empty profile credentials',
)

const dollarRoundTripDirectory = await mkdtemp(
  path.join(tmpdir(), 'workmesh-compose-dollar-roundtrip-'),
)
try {
  const dollarRoundTripPath = path.join(
    dollarRoundTripDirectory,
    'compose.snapshot.json',
  )
  const dollarRoundTripProject = `workmesh-dollar-roundtrip-${randomUUID()}`
  const encodedDollarService = {
    image: 'busybox:1.36.1',
    network_mode: 'none',
    command: [
      'sh',
      '-c',
      'printf "$$WM_COMMAND $${WM_COMMAND} $$$$ $$$$$$"',
    ],
    environment: {
      SESSION_SECRET: 'session-$$WM_SESSION-$${WM_SESSION}-$$$$-$$$$$$',
      S3_SECRET_ACCESS_KEY: 's3-$$WM_S3-$${WM_S3}-$$$$-$$$$$$',
      DATABASE_URL:
        'postgres://workmesh:db-$$WM_DB-$${WM_DB}-$$$$-$$$$$$@postgres/workmesh',
    },
    labels: {
      'io.workmesh.literal-dollar':
        '$$WM_LABEL:$${WM_LABEL}:$$$$:$$$$$$',
    },
    working_dir: '/tmp/$$WM_PATH/$${WM_PATH}/$$$$/$$$$$$',
    healthcheck: {
      test: [
        'CMD-SHELL',
        'printf "$$WM_HEALTH $${WM_HEALTH} $$$$ $$$$$$"',
      ],
    },
  }
  const expectedDollarStrings = {
    network_mode: 'none',
    command: ['sh', '-c', 'printf "$WM_COMMAND ${WM_COMMAND} $$ $$$"'],
    environment: {
      SESSION_SECRET: 'session-$WM_SESSION-${WM_SESSION}-$$-$$$',
      S3_SECRET_ACCESS_KEY: 's3-$WM_S3-${WM_S3}-$$-$$$',
      DATABASE_URL:
        'postgres://workmesh:db-$WM_DB-${WM_DB}-$$-$$$@postgres/workmesh',
    },
    labels: {
      'io.workmesh.literal-dollar': '$WM_LABEL:${WM_LABEL}:$$:$$$',
    },
    working_dir: '/tmp/$WM_PATH/${WM_PATH}/$$/$$$',
    healthcheck: {
      test: ['CMD-SHELL', 'printf "$WM_HEALTH ${WM_HEALTH} $$ $$$"'],
    },
  }
  const expectedEncodedDollarStrings = {
    network_mode: encodedDollarService.network_mode,
    command: encodedDollarService.command,
    environment: encodedDollarService.environment,
    labels: encodedDollarService.labels,
    working_dir: encodedDollarService.working_dir,
    healthcheck: encodedDollarService.healthcheck,
  }
  const decodeDollarPairs = (value) => {
    if (typeof value === 'string') {
      let decoded = ''
      for (let index = 0; index < value.length; index += 1) {
        if (value[index] !== '$') {
          decoded += value[index]
          continue
        }
        assert(
          value[index + 1] === '$',
          'Docker Compose must preserve encoded dollars as complete pairs',
        )
        decoded += '$'
        index += 1
      }
      return decoded
    }
    if (Array.isArray(value)) return value.map(decodeDollarPairs)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([name, nested]) => [
          name,
          decodeDollarPairs(nested),
        ]),
      )
    return value
  }
  await writeFile(
    dollarRoundTripPath,
    JSON.stringify({
      name: dollarRoundTripProject,
      services: { probe: encodedDollarService },
    }),
    'utf8',
  )
  for (const hostValue of [undefined, 'host-must-not-expand']) {
    const roundTripEnvironment = { ...process.env }
    for (const name of [
      'WM_COMMAND',
      'WM_SESSION',
      'WM_S3',
      'WM_DB',
      'WM_LABEL',
      'WM_PATH',
      'WM_HEALTH',
    ]) {
      if (hostValue === undefined) delete roundTripEnvironment[name]
      else roundTripEnvironment[name] = hostValue
    }
    const roundTrip = spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        dollarRoundTripProject,
        '-f',
        dollarRoundTripPath,
        'config',
        '--format',
        'json',
      ],
      {
        cwd: root,
        env: roundTripEnvironment,
        encoding: 'utf8',
      },
    )
    assert(
      roundTrip.status === 0,
      'Docker Compose must render the encoded dollar-literal fixture',
    )
    const renderedProbe = JSON.parse(roundTrip.stdout).services.probe
    const actualDollarStrings = {
      network_mode: renderedProbe.network_mode,
      command: renderedProbe.command,
      environment: renderedProbe.environment,
      labels: renderedProbe.labels,
      working_dir: renderedProbe.working_dir,
      healthcheck: renderedProbe.healthcheck,
    }
    assert(
      isDeepStrictEqual(actualDollarStrings, expectedEncodedDollarStrings),
      'Docker Compose config must preserve the encoded dollar pairs deterministically',
    )
    assert(
      isDeepStrictEqual(
        decodeDollarPairs(actualDollarStrings),
        expectedDollarStrings,
      ),
      'Docker Compose must restore every encoded dollar literal exactly',
    )
  }
  const projectResourceCommands = {
    containers: ['ps', '-a', '-q'],
    networks: ['network', 'ls', '-q'],
    volumes: ['volume', 'ls', '-q'],
  }
  const inspectProjectResources = (projectName) =>
    Object.fromEntries(
      Object.entries(projectResourceCommands).map(([kind, command]) => {
        const result = spawnSync(
          'docker',
          [
            ...command,
            '--filter',
            `label=com.docker.compose.project=${projectName}`,
          ],
          { cwd: root, encoding: 'utf8' },
        )
        assert(
          result.status === 0,
          `Docker must list dollar-literal project ${kind}`,
        )
        return [
          kind,
          result.stdout
            .trim()
            .split(/\r?\n/u)
            .filter((value) => value.length > 0),
        ]
      }),
    )
  const inspectContainersByExactName = (containerName) => {
    const result = spawnSync(
      'docker',
      [
        'ps',
        '-a',
        '--no-trunc',
        '--filter',
        `name=${containerName}`,
        '--format',
        '{{.ID}}|{{.Names}}',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert(
      result.status === 0,
      'Docker must check the exact dollar-literal container name',
    )
    return result.stdout
      .trim()
      .split(/\r?\n/u)
      .filter((value) => value.length > 0)
      .map((value) => {
        const separator = value.indexOf('|')
        return {
          id: value.slice(0, separator),
          name: value.slice(separator + 1),
        }
      })
      .filter(({ name }) => name === containerName)
  }
  const assertNoProjectResources = (resources, phase) => {
    for (const [kind, identifiers] of Object.entries(resources))
      assert(
        identifiers.length === 0,
        `dollar-literal project must have no ${kind} ${phase}`,
      )
  }
  const disposableContainer = dollarRoundTripProject
  const preflightDollarRoundTripProject = (projectName, containerName) => {
    assertNoProjectResources(
      inspectProjectResources(projectName),
      'before validation',
    )
    assert(
      inspectContainersByExactName(containerName).length === 0,
      'dollar-literal container name must be unused before validation',
    )
  }
  const collisionProject = `workmesh-dollar-collision-${randomUUID()}`
  preflightDollarRoundTripProject(collisionProject, collisionProject)
  let collisionContainerId
  try {
    const collisionCreate = spawnSync(
      'docker',
      [
        'create',
        '--name',
        collisionProject,
        '--network',
        'none',
        'busybox:1.36.1',
        'true',
      ],
      { cwd: root, encoding: 'utf8' },
    )
    assert(
      collisionCreate.status === 0,
      'Docker must create the unrelated name-collision container',
    )
    collisionContainerId = collisionCreate.stdout.trim()
    assert(
      /^[a-f0-9]{64}$/u.test(collisionContainerId),
      'Docker must return the full unrelated collision container ID',
    )
    const collisionInspection = spawnSync(
      'docker',
      ['inspect', collisionContainerId],
      { cwd: root, encoding: 'utf8' },
    )
    assert(
      collisionInspection.status === 0,
      'Docker must inspect the unrelated name-collision container',
    )
    const collisionContainer = JSON.parse(collisionInspection.stdout)[0]
    assert(
      collisionContainer.Config.Labels['com.docker.compose.project'] ===
        undefined,
      'name-collision fixture must remain unrelated to Docker Compose',
    )
    let collisionRejection
    try {
      preflightDollarRoundTripProject(collisionProject, collisionProject)
    } catch (error) {
      collisionRejection = error
    }
    assert(
      collisionRejection instanceof Error &&
        collisionRejection.message ===
          'dollar-literal container name must be unused before validation',
      'validator preflight must reject an unrelated exact-name collision',
    )
    const collisionAfterRejection =
      inspectContainersByExactName(collisionProject)
    assert(
      collisionAfterRejection.length === 1 &&
        collisionAfterRejection[0].id === collisionContainerId,
      'validator rejection must preserve the unrelated collision container',
    )
  } finally {
    if (collisionContainerId !== undefined) {
      const collisionCleanup = spawnSync(
        'docker',
        ['rm', '-f', collisionContainerId],
        { cwd: root, encoding: 'utf8' },
      )
      assert(
        collisionCleanup.status === 0,
        'Docker must remove only the verified collision fixture ID',
      )
    }
  }
  assert(
    inspectContainersByExactName(collisionProject).length === 0,
    'collision fixture must leave no container after its owned cleanup',
  )
  preflightDollarRoundTripProject(
    dollarRoundTripProject,
    disposableContainer,
  )
  const runtimeEnvironment = { ...process.env }
  for (const name of [
    'WM_COMMAND',
    'WM_SESSION',
    'WM_S3',
    'WM_DB',
    'WM_LABEL',
    'WM_PATH',
    'WM_HEALTH',
  ])
    runtimeEnvironment[name] = 'host-must-not-expand'
  let ownedContainerId
  try {
    const runResult = spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        dollarRoundTripProject,
        '-f',
        dollarRoundTripPath,
        'run',
        '-d',
        '--no-deps',
        '--name',
        disposableContainer,
        '--workdir',
        '/',
        'probe',
      ],
      {
        cwd: root,
        env: runtimeEnvironment,
        encoding: 'utf8',
      },
    )
    assert(
      runResult.status === 0,
      'Docker Compose must create the disposable dollar-literal container',
    )
    const exactNameMatches =
      inspectContainersByExactName(disposableContainer)
    assert(
      exactNameMatches.length === 1,
      'Docker Compose must create exactly one exact-name probe container',
    )
    const inspection = spawnSync('docker', ['inspect', exactNameMatches[0].id], {
      cwd: root,
      encoding: 'utf8',
    })
    assert(
      inspection.status === 0,
      'Docker must inspect the disposable dollar-literal container',
    )
    const container = JSON.parse(inspection.stdout)[0]
    assert(
      container.Config.Labels['com.docker.compose.project'] ===
        dollarRoundTripProject,
      'disposable container must belong to the unique validator project',
    )
    assert(
      container.Config.Labels['com.docker.compose.service'] === 'probe',
      'disposable container must belong to the probe service',
    )
    assert(
      container.Config.Labels['com.docker.compose.oneoff'] === 'True',
      'disposable container must be a Compose one-off container',
    )
    assert(
      container.Id === exactNameMatches[0].id,
      'Docker must inspect the exact full probe container ID',
    )
    ownedContainerId = container.Id
    assert(
      container.HostConfig.NetworkMode === 'none',
      'disposable container must not use a Docker network',
    )
    const resourcesDuringRun = inspectProjectResources(
      dollarRoundTripProject,
    )
    assert(
      resourcesDuringRun.containers.length === 1,
      'dollar-literal project must own exactly one disposable container',
    )
    assert(
      resourcesDuringRun.networks.length === 0,
      'dollar-literal project must not create a Docker network',
    )
    assert(
      resourcesDuringRun.volumes.length === 0,
      'dollar-literal project must not create Docker volumes',
    )
    const containerEnvironment = new Set(container.Config.Env)
    for (const [name, value] of Object.entries(
      expectedDollarStrings.environment,
    ))
      assert(
        containerEnvironment.has(`${name}=${value}`),
        `disposable container must preserve ${name} dollar literals`,
      )
    assert(
      isDeepStrictEqual(container.Config.Cmd, expectedDollarStrings.command),
      'disposable container must preserve command dollar literals',
    )
    assert(
      container.Config.Labels['io.workmesh.literal-dollar'] ===
        expectedDollarStrings.labels['io.workmesh.literal-dollar'],
      'disposable container must preserve label dollar literals',
    )
    assert(
      isDeepStrictEqual(
        container.Config.Healthcheck.Test,
        expectedDollarStrings.healthcheck.test,
      ),
      'disposable container must preserve healthcheck dollar literals',
    )
  } finally {
    if (ownedContainerId !== undefined)
      spawnSync('docker', ['rm', '-f', ownedContainerId], {
        cwd: root,
        encoding: 'utf8',
      })
    const cleanup = spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        dollarRoundTripProject,
        '-f',
        dollarRoundTripPath,
        'down',
        '--remove-orphans',
      ],
      {
        cwd: root,
        env: runtimeEnvironment,
        encoding: 'utf8',
      },
    )
    assert(
      cleanup.status === 0,
      'Docker Compose must clean the unique dollar-literal project',
    )
    assertNoProjectResources(
      inspectProjectResources(dollarRoundTripProject),
      'after cleanup',
    )
    assert(
      inspectContainersByExactName(disposableContainer).length === 0,
      'dollar-literal container name must be unused after cleanup',
    )
  }
} finally {
  await rm(dollarRoundTripDirectory, { recursive: true, force: true })
}

await validateProductionWebSkill()

console.log('Production image and Compose contract validation passed')
