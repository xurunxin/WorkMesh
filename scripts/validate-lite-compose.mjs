import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'

// Structural validation for the Lite deployment class.
//
// This is deliberately a file-level check with no Docker calls, so it can run in
// `pnpm ci:validate` on a machine that has no images and no containers. It
// asserts the invariants that a small device actually depends on, which are the
// ones a reviewer cannot see by reading the file casually:
//
//   - every service is capped, because an uncapped service is how a small device
//     gets OOM-killed by its neighbour;
//   - each Node heap sits below its cgroup limit, because V8 collects under heap
//     pressure while the cgroup limit is a kernel OOM kill, and a heap that
//     reaches the limit means no clean shutdown;
//   - every log is bounded, because an uncapped json-file log is the ordinary way
//     a small disk fills up;
//   - the data services keep the durability and failure properties the
//     architecture depends on;
//   - the application image comes from a required variable, never a literal;
//   - every variable the compose reads is documented, and vice versa, because a
//     device has no checkout and the example file is the only documentation.
//
// `--self-test` proves each assertion actually rejects a violating compose. An
// assertion nobody has seen fail is an assertion nobody should trust.
//
// scripts/validate-production-images.mjs remains the release-class validator and
// is not modified by anything here.

const root = path.resolve(import.meta.dirname, '..')
const selfPath = path.join(root, 'scripts', 'validate-lite-compose.mjs')
const arguments_ = process.argv.slice(2)
const option = (name) => arguments_.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)

const composePath = option('compose') ?? path.join(root, 'docker-compose.lite.yml')
const examplePath = option('example') ?? path.join(root, '.env.lite.example')
const source = await readFile(composePath, 'utf8')
const exampleSource = await readFile(examplePath, 'utf8')
const compose = parse(source, { merge: true })

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const services = compose.services ?? {}
const serviceNames = Object.keys(services)
const appServices = ['migrate', 'api', 'worker', 'web']
const nodeServices = ['api', 'worker', 'web']
const dataServices = ['postgres', 'redis', 'minio', 'minio-init']

for (const name of [...appServices, ...dataServices]) {
  assert(services[name], `Lite compose must define the ${name} service`)
}

for (const name of serviceNames) {
  const service = services[name]
  assert(service.mem_limit, `${name} must declare an explicit mem_limit`)
  const logging = service.logging
  assert(logging?.driver === 'json-file', `${name} must use the json-file log driver`)
  assert(logging?.options?.['max-size'], `${name} must bound its log file size`)
  assert(logging?.options?.['max-file'], `${name} must bound its log file count`)
  assert(!service.build, `${name} must not carry a build section: the device cannot build`)
}

// The heap must stay below the container limit. Asserting the relationship
// rather than the literal is what keeps a future retune honest.
const heapMegabytes = (service) => {
  const match = /--max-old-space-size=(\d+)/u.exec(String(service.environment?.NODE_OPTIONS ?? ''))
  return match ? Number(match[1]) : undefined
}
const limitMegabytes = (value) => {
  const match = /^(\d+)([a-z])$/u.exec(String(value ?? ''))
  if (!match) return undefined
  const scale = match[2] === 'g' ? 1024 : 1
  return Number(match[1]) * scale
}
for (const name of nodeServices) {
  const service = services[name]
  const heap = heapMegabytes(service)
  const limit = limitMegabytes(service.mem_limit)
  assert(heap, `${name} must set --max-old-space-size in NODE_OPTIONS`)
  assert(limit, `${name} mem_limit must be a whole number of megabytes or gigabytes`)
  assert(
    heap < limit,
    `${name} heap (${heap}m) must stay below mem_limit (${limit}m); a heap that reaches the cgroup limit is killed without a clean shutdown`,
  )
}

for (const name of appServices) {
  const service = services[name]
  assert(
    service.image === '${WORKMESH_LITE_IMAGE:?WORKMESH_LITE_IMAGE is required}',
    `${name} must use the required WORKMESH_LITE_IMAGE reference`,
  )
  assert(service.command === undefined, `${name} must let WORKMESH_SERVICE select its role`)
  assert(
    service.environment?.WORKMESH_SERVICE === name,
    `${name} must set WORKMESH_SERVICE to its own role`,
  )
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

// One image, four roles: the Lite image cannot carry MCP or the Agent Runner, and
// a compose that tried to start them from it would fail at the dispatch table.
for (const name of ['mcp', 'agent-runner']) {
  assert(!services[name], `the Lite compose must not define ${name}; it runs on the operator's machine`)
}

const postgresCommand = services.postgres.command?.join(' ') ?? ''
for (const setting of [
  'shared_buffers=32MB',
  'max_connections=20',
  'track_activities=off',
  'max_parallel_workers=0',
]) {
  assert(postgresCommand.includes(setting), `Lite PostgreSQL must apply ${setting}`)
}
for (const setting of ['synchronous_commit=off', 'fsync=off', 'full_page_writes=off']) {
  assert(
    !postgresCommand.includes(setting),
    `Lite PostgreSQL must not weaken ${setting}; that is a durability setting, not tuning`,
  )
}

const redisCommand = services.redis.command?.join(' ') ?? ''
assert(
  redisCommand.includes('--appendonly no'),
  'Lite Redis must drop AOF persistence; both of its roles are lossy by design',
)
assert(
  // A bare prefix check would also match `--maxmemory-policy`, which is required.
  !/--maxmemory\s+\S/u.test(redisCommand),
  'Lite Redis must not cap maxmemory; the auth rate limiter fails closed, so a full Redis refuses logins',
)
assert(
  redisCommand.includes('--maxmemory-policy noeviction'),
  'Lite Redis must keep the noeviction policy',
)

assert(
  services.postgres.healthcheck?.test?.some((value) => value.includes('pg_isready -h 127.0.0.1')),
  'Lite PostgreSQL readiness must use TCP so the temporary init server cannot satisfy it',
)
assert(
  source.includes('x-amz-bucket-object-lock-enabled: true'),
  'Lite bucket creation must enable Object Lock at creation time',
)

// Only the two Browser-reachable surfaces publish a port. This is checked before
// the bind-address rule so that publishing PostgreSQL is reported as the mistake
// it is, rather than as a bind-address formatting problem.
for (const name of ['postgres', 'redis']) {
  assert(!services[name].ports, `${name} must not publish a port on a Lite device`)
}
const published = serviceNames.filter((name) => services[name].ports?.length)
for (const name of published) {
  for (const port of services[name].ports) {
    assert(
      String(port).startsWith('${WORKMESH_BIND_ADDRESS:-0.0.0.0}:'),
      `${name} must publish through WORKMESH_BIND_ADDRESS`,
    )
  }
}

for (const secret of [
  'POSTGRES_PASSWORD',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'SESSION_SECRET',
  'WORKMESH_MASTER_KEY',
  'WORKMESH_BOOTSTRAP_TOKEN',
  'PAGINATION_CURSOR_KEYS',
  'AUTH_RATE_LIMIT_HMAC_KEY',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'WEB_ORIGIN',
]) {
  assert(!source.includes(`\${${secret}:-`), `${secret} must not have a Lite default`)
}

assert(
  services.api.environment.SESSION_COOKIE_SECURE === '${SESSION_COOKIE_SECURE:-false}',
  'the Lite default is a LAN deployment with no TLS; a TLS deployment must opt in explicitly',
)
// Checked on the parsed value, not on a string pattern. The compose sets this as
// a literal, so a pattern aimed at a variable default would never see a literal
// flipped to "true" — which is exactly the change that must be caught.
assert(
  services.api.environment.WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK === 'false',
  'the loopback bootstrap escape hatch must stay disabled in the Lite compose',
)

// A device has no checkout, so `.env.lite.example` is the only documentation an
// operator has. Checked in both directions: a variable the compose needs but the
// example omits cannot be discovered, and an example entry the compose never
// reads is a trap for the next person editing the file.
const documentedVariables = new Set(
  exampleSource
    .split(/\r?\n/u)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/u.exec(line)?.[1])
    .filter((name) => name !== undefined),
)
const composedVariables = new Set(
  [...source.matchAll(/\$\{([A-Z][A-Z0-9_]*)[:?]/gu)].map((match) => match[1]),
)
for (const name of composedVariables) {
  assert(
    documentedVariables.has(name),
    `${name} is read by the Lite compose but absent from .env.lite.example`,
  )
}
for (const name of documentedVariables) {
  assert(
    composedVariables.has(name),
    `${name} is documented in .env.lite.example but never read by the Lite compose`,
  )
}

if (arguments_.includes('--self-test')) {
  // Every mutation below is a literal string match, and a checkout on Windows
  // with core.autocrlf turns the tracked files into CRLF. A mutation that fails
  // to match is a no-op, and a no-op mutation makes the validator accept a
  // violating compose — the self-test would report a broken validator while
  // proving nothing. Normalising to LF first makes the cases reproducible on
  // any platform, and the YAML parser is line-ending agnostic regardless.
  const canonical = (value) => value.replace(/\r\n/g, '\n')
  const composeText = canonical(source)
  const exampleText = canonical(exampleSource)

  // Every mutation below is a realistic mistake. Each one must be rejected, and
  // with the specific message, so a passing validation means something.
  const cases = [
    ['uncapped service', composeText.replace('    mem_limit: 640m\n', ''), null, /api must declare an explicit mem_limit/u],
    [
      'heap above the container limit',
      composeText.replace('--max-old-space-size=320', '--max-old-space-size=1024'),
      null,
      /api heap \(1024m\) must stay below mem_limit \(640m\)/u,
    ],
    [
      'unbounded log',
      composeText.replace('  driver: json-file\n  options:\n    max-size: "10m"\n    max-file: "3"\n', '  driver: json-file\n'),
      null,
      /must bound its log file size/u,
    ],
    [
      'literal application image',
      composeText.replace(
        '    image: *lite-image\n    environment:\n      <<: *feature-flags\n      NODE_ENV: production\n      WORKMESH_SERVICE: api',
        '    image: workmesh-lite:latest\n    environment:\n      <<: *feature-flags\n      NODE_ENV: production\n      WORKMESH_SERVICE: api',
      ),
      null,
      /api must use the required WORKMESH_LITE_IMAGE reference/u,
    ],
    [
      'role selected by compose command',
      composeText.replace(
        '    image: *lite-image\n    environment:\n      <<: *feature-flags\n      NODE_ENV: production\n      WORKMESH_SERVICE: worker\n',
        '    image: *lite-image\n    command: ["node", "dist/index.js"]\n    environment:\n      <<: *feature-flags\n      NODE_ENV: production\n      WORKMESH_SERVICE: worker\n',
      ),
      null,
      /worker must let WORKMESH_SERVICE select its role/u,
    ],
    [
      'root user instead of the fixed identity',
      composeText.replace('  user: "10001:10001"\n', '  user: "0:0"\n'),
      null,
      /must run as the fixed non-root identity/u,
    ],
    [
      'writable root filesystem',
      composeText.replace('  read_only: true\n', '  read_only: false\n'),
      null,
      /must use a read-only root filesystem/u,
    ],
    [
      'Agent Runner added to the Lite device',
      composeText.replace(
        '\nvolumes:\n',
        '\n  agent-runner:\n    image: *lite-image\n    mem_limit: 256m\n    logging: *logging\n\nvolumes:\n',
      ),
      null,
      /must not define agent-runner/u,
    ],
    [
      'PostgreSQL durability disabled',
      composeText.replace('      - -c\n      - shared_buffers=32MB', '      - -c\n      - synchronous_commit=off\n      - -c\n      - shared_buffers=32MB'),
      null,
      /must not weaken synchronous_commit=off/u,
    ],
    [
      'Redis memory capped',
      composeText.replace('"--save", "900 1"', '"--save", "900 1", "--maxmemory", "48mb"'),
      null,
      /must not cap maxmemory/u,
    ],
    [
      'Redis AOF re-enabled',
      composeText.replace('"--appendonly", "no"', '"--appendonly", "yes"'),
      null,
      /must drop AOF persistence/u,
    ],
    [
      'PostgreSQL published to the LAN',
      composeText.replace('    mem_limit: 384m', '    ports:\n      - "0.0.0.0:5432:5432"\n    mem_limit: 384m'),
      null,
      /postgres must not publish a port/u,
    ],
    [
      'required secret given a default',
      composeText.replace(
        '${SESSION_SECRET:?SESSION_SECRET is required}',
        '${SESSION_SECRET:-development-only-session-secret-value}',
      ),
      null,
      /SESSION_SECRET must not have a Lite default/u,
    ],
    [
      'bootstrap loopback escape hatch',
      composeText.replace('      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: "false"', '      WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK: "true"'),
      null,
      /loopback bootstrap escape hatch must stay disabled/u,
    ],
    [
      'compose variable missing from the example',
      composeText,
      exampleText.replace('WORKMESH_REALTIME_REDIS_MAXLEN=10000\n', ''),
      /WORKMESH_REALTIME_REDIS_MAXLEN is read by the Lite compose but absent/u,
    ],
    [
      'example variable the compose never reads',
      composeText,
      `${exampleText}WORKMESH_UNUSED_LEFTOVER=false\n`,
      /WORKMESH_UNUSED_LEFTOVER is documented in .env.lite.example but never read/u,
    ],
  ]

  const directory = await mkdtemp(path.join(tmpdir(), 'workmesh-lite-selftest-'))
  try {
    for (const [name, mutatedCompose, mutatedExample, expected] of cases) {
      const composeFile = path.join(directory, 'compose.yml')
      const exampleFile = path.join(directory, 'example.env')
      await writeFile(composeFile, mutatedCompose ?? composeText)
      await writeFile(exampleFile, mutatedExample ?? exampleText)
      const result = spawnSync(process.execPath, [
        selfPath,
        `--compose=${composeFile}`,
        `--example=${exampleFile}`,
      ], { encoding: 'utf8' })
      const output = `${result.stdout}${result.stderr}`
      assert(
        result.status !== 0,
        `self-test failed: the validator accepted a compose with ${name}`,
      )
      assert(
        expected.test(output),
        `self-test failed: ${name} was rejected, but not for the expected reason (${expected})\n${output}`,
      )
      console.log(`  self-test rejected: ${name}`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
  console.log(`Lite compose self-test passed (${cases.length} violating variants rejected)`)
  process.exit(0)
}

console.log(
  `Lite compose validation passed (${serviceNames.length} services; ` +
    `${appServices.length} roles from one image; ${composedVariables.size} documented variables; ` +
    `published: ${published.join(', ') || 'none'})`,
)
