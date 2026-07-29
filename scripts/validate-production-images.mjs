import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
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
assert(
  webDockerfile.includes('io.workmesh.web.api-url=$NEXT_PUBLIC_API_URL'),
  'web image must expose its compiled API URL through the stable WorkMesh label',
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
const apiEnvironment = {
  ...process.env,
  NODE_ENV: 'production',
  WORKMESH_SERVICE: 'api',
  WORKMESH_BUILD_SHA: 'a'.repeat(40),
  DATABASE_URL: `postgres://workmesh:${'postgres-strong-'.concat('p'.repeat(32))}@postgres:5432/workmesh`,
  REDIS_URL: 'redis://redis:6379',
  SESSION_SECRET: 'session-' + 'd'.repeat(40),
  WORKMESH_MASTER_KEY: 'e'.repeat(64),
  WORKMESH_BOOTSTRAP_TOKEN: 'bootstrap-' + 'f'.repeat(40),
  PAGINATION_CURSOR_KEYS: `validation-key:${paginationKey}`,
  PAGINATION_CURSOR_ACTIVE_KID: 'validation-key',
  AUTH_RATE_LIMIT_HMAC_KEY: 'rate-limit-' + 'h'.repeat(40),
  S3_BUCKET: 'workmesh-artifacts',
  S3_ACCESS_KEY_ID: 'workmesh',
  S3_SECRET_ACCESS_KEY: 'object-store-' + 'i'.repeat(40),
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
  MINIO_ROOT_PASSWORD: 'minio-' + 'l'.repeat(40),
  SESSION_SECRET: apiEnvironment.SESSION_SECRET,
  WORKMESH_MASTER_KEY: apiEnvironment.WORKMESH_MASTER_KEY,
  WORKMESH_BOOTSTRAP_TOKEN: apiEnvironment.WORKMESH_BOOTSTRAP_TOKEN,
  PAGINATION_CURSOR_KEYS: apiEnvironment.PAGINATION_CURSOR_KEYS,
  PAGINATION_CURSOR_ACTIVE_KID: apiEnvironment.PAGINATION_CURSOR_ACTIVE_KID,
  AUTH_RATE_LIMIT_HMAC_KEY: apiEnvironment.AUTH_RATE_LIMIT_HMAC_KEY,
  WEB_ORIGIN: apiEnvironment.WEB_ORIGIN,
  S3_PUBLIC_ENDPOINT: 'https://objects.example',
  S3_ACCESS_KEY_ID: apiEnvironment.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: apiEnvironment.S3_SECRET_ACCESS_KEY,
  NEXT_PUBLIC_API_URL: 'https://workmesh.example/api',
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
  const encodedDollarService = {
    image: 'busybox:1.36.1',
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
      name: 'workmesh-dollar-roundtrip',
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
        'workmesh-dollar-roundtrip',
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
  const disposableContainer = `workmesh-dollar-roundtrip-${process.pid}`
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
  try {
    const runResult = spawnSync(
      'docker',
      [
        'compose',
        '--project-name',
        'workmesh-dollar-roundtrip',
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
    const inspection = spawnSync(
      'docker',
      ['inspect', disposableContainer],
      { cwd: root, encoding: 'utf8' },
    )
    assert(
      inspection.status === 0,
      'Docker must inspect the disposable dollar-literal container',
    )
    const container = JSON.parse(inspection.stdout)[0]
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
    spawnSync('docker', ['rm', '-f', disposableContainer], {
      cwd: root,
      encoding: 'utf8',
    })
  }
} finally {
  await rm(dollarRoundTripDirectory, { recursive: true, force: true })
}

console.log('Production image and Compose contract validation passed')
