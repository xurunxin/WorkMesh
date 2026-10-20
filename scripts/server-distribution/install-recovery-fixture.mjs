// Execute the real installer/state files; only Docker, HTTPS and config adapters
// are substitutes. This is a control-flow regression, not installed-product proof.
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { hash, canonicalJson } from './manifest.mjs'
import { atomicJson, readState } from './journal.mjs'

const sourceUrl = new URL('./install.mjs', import.meta.url)
const source = await fs.readFile(process.argv[2] ?? sourceUrl, 'utf8')
const workspace = await fs.realpath('.')
await fs.mkdir(path.join(workspace, '.tmp'), { recursive: true })
const parent = await fs.realpath(path.join(workspace, '.tmp'))
assert.equal(parent, path.join(workspace, '.tmp'))
const root = await fs.realpath(await fs.mkdtemp(path.join(parent, 'server-recovery-unit-')))
assert.equal(path.dirname(root), parent)
assert.ok(path.basename(root).startsWith('server-recovery-unit-'))
const owner = '11111111-1111-4111-8111-111111111111', project = 'unit-recovery'
const itemId = '22222222-2222-4222-8222-222222222222'
const row = { version: 'v1_0001', checksumSha256: 'a'.repeat(64) }
const images = Object.fromEntries(['api', 'worker', 'mcp', 'lite', 'installer', 'postgres', 'redis', 'minio'].map((role, i) =>
  [role, { id: 'sha256:' + String(i + 1).repeat(64), archiveId: 'sha256:' + String(i + 1).repeat(64),
    reference: `unit/${role}:candidate`, revision: ['postgres', 'redis', 'minio'].includes(role) ? '' : 'a'.repeat(40) }]))
const keys = { MINIO_ROOT_PASSWORD: 's3-fixture', S3_SECRET_ACCESS_KEY: 's3-fixture',
  WORKMESH_MASTER_KEY: 'd'.repeat(64), WORKMESH_BACKUP_ENCRYPTION_KEY: 'e'.repeat(64) }
let prefix, active, rejectRestoredHealth, interruptedJournal, requestCount = 0
const commands = []
const document = () => ({ services: {
  ...Object.fromEntries(['api', 'worker', 'mcp', 'migrate'].map(role => [role, { image: images[role === 'migrate' ? 'api' : role].id,
    environment: { DATABASE_URL: 'postgresql://fixture', WORKMESH_MASTER_KEY: keys.WORKMESH_MASTER_KEY,
      S3_BUCKET: 'workmesh-artifacts', S3_ACCESS_KEY_ID: 'workmesh', S3_SECRET_ACCESS_KEY: keys.S3_SECRET_ACCESS_KEY,
      AUTH_RATE_LIMIT_HMAC_KEY: 'fixture-rate-key' } }])),
  ...Object.fromEntries(['postgres', 'redis', 'minio'].map(role => [role, { image: images[role].id,
    volumes: [{ type: 'volume', source: role, target: { postgres: '/var/lib/postgresql/data', redis: '/data', minio: '/data' }[role] }] }])),
  'minio-init': { image: images.minio.id },
}, volumes: Object.fromEntries(['postgres', 'redis', 'minio'].map(role => [role, { name: project + '-' + role }])) })
const info = () => ({ Id: 'f'.repeat(64), Config: { Labels: { 'io.workmesh.installation': owner,
  'io.workmesh.installation-root': hash(Buffer.from(prefix)) } }, State: { Running: false } })
function docker(command, args) {
  assert.equal(command, 'docker'); commands.push(args)
  if (args[0] === 'info') return 'linux/x86_64'
  if (args[0] === 'image') return JSON.stringify([{ Id: args[2], Architecture: 'amd64',
    Config: { Labels: { 'org.opencontainers.image.revision': 'a'.repeat(40) } } }])
  if (args[0] === 'create') return 'f'.repeat(64)
  if (args[0] === 'inspect') return JSON.stringify([info()])
  if (args[0] === 'rm') return ''
  if (args[0] === 'ps') return 'f'.repeat(64)
  if (args[0] === 'run') return JSON.stringify({ manifestSha256: '9'.repeat(64) })
  assert.equal(args[0], 'compose')
  if (args.includes('config')) return JSON.stringify(document())
  const operation = args[5]
  if (operation === 'exec') return row.version + '\t' + row.checksumSha256
  if (operation === 'ps') return JSON.stringify(['api', 'worker', 'mcp'].map(Service => ({ Service, Health: 'healthy' })))
  if (operation === 'stop' || operation === 'run') return ''
  assert.equal(operation, 'up')
  const restoring = args[4].endsWith(path.join('release-a', 'compose.json'))
  if (restoring) {
    // Observe the durable state at the exact first old-runtime side effect.
    interruptedJournal = JSON.parse(readFileSync(path.join(prefix, 'journal.json'), 'utf8'))
    if (rejectRestoredHealth) throw new Error('simulated interruption before old runtime receipt')
  }
  active = restoring ? 'a' : 'b'
  return ''
}
const https = { request(_url, _options, callback) {
  requestCount++
  const request = new EventEmitter()
  request.destroy = () => {}
  request.end = body => queueMicrotask(() => {
    const call = JSON.parse(body), response = new EventEmitter()
    response.statusCode = 200; response.headers = { 'content-type': 'application/json' }
    callback(response); request.emit('finish')
    response.emit('data', JSON.stringify({ jsonrpc: '2.0', id: call.id,
      result: call.method === 'initialize' ? {} : { structuredContent: { data: { id: itemId } } } }))
    response.emit('end')
  })
  return request
} }
async function loadInstaller() {
const context = createContext({ Buffer, URL, console, process, performance })
const modules = new Map()
async function synthetic(key, exports) {
  if (!modules.has(key)) {
    const mod = new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context, identifier: key })
    modules.set(key, mod); await mod.link(() => assert.fail('unexpected fixture import')); await mod.evaluate()
  }
  return modules.get(key)
}
const installer = new SourceTextModule(source, { context, identifier: sourceUrl.href,
  initializeImportMeta: meta => { meta.url = sourceUrl.href },
  importModuleDynamically: async specifier => {
    assert.equal(specifier, '/app/runtime-secrets.mjs')
    return synthetic(specifier, { validateRuntimeEnvironment: () => {} })
  } })
await installer.link(async specifier => {
  if (specifier === 'node:child_process') return synthetic(specifier, { execFileSync: docker,
    spawn: () => assert.fail('unexpected image import'), spawnSync: () => ({ status: 0, stdout: '', stderr: '' }) })
  if (specifier === 'node:https') return synthetic(specifier, { default: https })
  const exports = await import(specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : specifier)
  // Model Linux private-config modes on Windows; other filesystem calls are real.
  if (specifier === 'node:fs/promises') return synthetic(specifier, { ...exports, lstat: async file => {
    const value = await fs.lstat(file); value.mode &= ~0o077; return value
  } })
  return synthetic(specifier, exports)
})
await installer.evaluate()
return installer
}
let installer = await loadInstaller()
const authority = Object.fromEntries(['loadDeploymentProfile', 'loadConfig', 'loadFeatureConfig',
  'loadRealtimeRedisHintConfig', 'loadRetentionConfig'].map(name => [name, () => {}]))
async function fixture(name) {
  prefix = path.join(root, name); await fs.mkdir(prefix, { mode: 0o700 })
  const bundle = path.join(prefix, 'bundle'); await fs.mkdir(bundle); await fs.mkdir(path.join(bundle, 'chunks'))
  const payloads = { 'docker-compose.lite.yml': '${PUBLIC_MCP_ORIGIN}', 'docker-compose.production.yml': '${PUBLIC_MCP_ORIGIN}',
    'install.sh': 'fixture', 'config.example.json': '{}', 'chunks/main.tarpart': 'main', 'chunks/helper.tarpart': 'helper' }
  for (const [name, value] of Object.entries(payloads)) await fs.writeFile(path.join(bundle, name), value)
  const manifest = release => ({ format: 'workmesh-server-distribution', release, arch: 'amd64',
    source: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, runtimeFingerprint: 'c'.repeat(64), images,
    installerImage: images.installer.id, installerArchiveImage: images.installer.id, migrationLedger: [row],
    tools: { producerNode: 'v22.19.0', producerDocker: 'fixture', installerNode: 'v22.19.0', installerDocker: 'fixture',
      installerCompose: 'fixture', pgDump: 'fixture', pgRestore: 'fixture' },
    files: Object.entries(payloads).filter(([name]) => !name.startsWith('chunks/')).map(([name, value]) => ({ path: name, sha256: hash(Buffer.from(value)), bytes: value.length })),
    chunks: [{ path: 'chunks/main.tarpart', sha256: hash(Buffer.from('main')), bytes: 4 }],
    bootstrapChunks: [{ path: 'chunks/helper.tarpart', sha256: hash(Buffer.from('helper')), bytes: 6 }] })
  const next = manifest('release-b'), manifestJson = JSON.stringify(next), digest = hash(Buffer.from(manifestJson))
  await fs.writeFile(path.join(bundle, 'manifest.json'), manifestJson)
  const config = { project, profile: 'team', environment: { PUBLIC_MCP_ORIGIN: 'https://unit.invalid' } }, configFile = path.join(prefix, 'config.json')
  await atomicJson(configFile, config); await atomicJson(path.join(prefix, 'operator-keys.json'), keys)
  await atomicJson(path.join(prefix, 'installation.json'), { format: 'workmesh-installation', id: owner, root: prefix, project })
  const dir = path.join(prefix, 'release-a'); await fs.mkdir(dir)
  await atomicJson(path.join(dir, 'compose.json'), document())
  const previous = { candidate: '0'.repeat(64), profile: 'team', project, configHash: hash(Buffer.from(canonicalJson(config))),
    installationId: owner, rootHash: hash(Buffer.from(prefix)), composeFile: path.join(dir, 'compose.json'),
    manifest: manifest('release-a'), backupKey: keys.WORKMESH_BACKUP_ENCRYPTION_KEY }
  await atomicJson(path.join(prefix, 'current.json'), previous)
  const pending = { ...previous, candidate: digest, manifest: next }
  const journal = { format: 'workmesh-install-journal', id: 'old-attempt', stage: 'healthy', candidate: digest,
    candidateManifestJson: manifestJson, configHash: previous.configHash, project, actions: [], validation: { candidate: digest } }
  await atomicJson(path.join(prefix, 'pending.json'), pending); await atomicJson(path.join(prefix, 'journal.json'), journal)
  const validationFile = path.join(prefix, 'validation.json')
  await atomicJson(validationFile, { credential: 'isolated-unit-proof-only-' + 'x'.repeat(32), workItemId: itemId })
  active = 'b'; rejectRestoredHealth = false; interruptedJournal = undefined; commands.length = 0; requestCount = 0
  return { prefix, bundle, digest, configFile, validationFile, maintenanceConfirmed: true }
}
const invoke = (options, action) => installer.namespace.install({ ...options, action }, authority)
const outcomes = []
try {
  if (process.env.WORKMESH_RECOVERY_RESTART_OPTIONS) {
    const options = JSON.parse(process.env.WORKMESH_RECOVERY_RESTART_OPTIONS)
    prefix = await fs.realpath(options.prefix)
    assert.ok(path.relative(parent, prefix).startsWith('server-recovery-unit-'))
    active = 'a'
    await assert.rejects(invoke(options, 'commit'), /INSTALL_CANDIDATE_WITHDRAWN/)
    assert.equal(requestCount, 0)
    assert.equal((await readState(path.join(prefix, 'current.json'))).candidate, '0'.repeat(64))
    console.log(JSON.stringify({ status: 'restart-refused', requestCount }))
  } else {
  const options = await fixture('complete-recovery')
  assert.equal((await invoke(options, 'recover-old')).status, 'previous-restored'); assert.equal(active, 'a')
  if (process.argv[3] === '--expect-old-bug') {
    assert.equal((await invoke(options, 'commit')).status, 'installed')
    assert.equal(active, 'a')
    assert.equal((await readState(path.join(prefix, 'current.json'))).candidate, options.digest)
    console.log(JSON.stringify({ status: 'old-bug-reproduced', runningProgram: 'a', registeredCandidate: 'b', realDockerOrHttp: false }))
  } else {
  const withdrawn = await readState(path.join(prefix, 'journal.json'))
  assert.ok(withdrawn.withdrawnAt); assert.equal(withdrawn.validation, undefined)
  assert.ok(interruptedJournal.withdrawnAt); assert.equal(interruptedJournal.validation, undefined)
  await assert.rejects(invoke(options, 'commit'), /INSTALL_CANDIDATE_WITHDRAWN/)
  assert.equal(requestCount, 0); assert.equal((await readState(path.join(prefix, 'current.json'))).candidate, '0'.repeat(64))
  outcomes.push('recovery-before-effects-and-direct-commit-refused')
  // Reload from disk, then also check a genuinely fresh Node process.
  installer = await loadInstaller()
  await assert.rejects(invoke(options, 'commit'), /INSTALL_CANDIDATE_WITHDRAWN/)
  const restarted = JSON.parse(execFileSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url)], {
    encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WORKMESH_RECOVERY_RESTART_OPTIONS: JSON.stringify(options) },
  }))
  assert.equal(restarted.status, 'restart-refused')
  outcomes.push('persisted-withdrawal-refuses-restarted-command')
  const upgraded = await invoke(options, 'upgrade'); assert.equal(upgraded.status, 'awaiting-validation')
  const fresh = await readState(path.join(prefix, 'journal.json'))
  assert.notEqual(fresh.id, 'old-attempt'); assert.equal(fresh.withdrawnAt, undefined); assert.equal(fresh.validation, undefined)
  assert.ok(fresh.actions.some(row => row.name === 'complete-backup' && row.status === 'completed'))
  assert.ok(fresh.actions.some(row => row.name === 'apply-migration-ledger' && row.status === 'completed'))
  assert.ok(fresh.actions.some(row => row.name === 'verify-health-and-ledger' && row.status === 'completed'))
  assert.equal(active, 'b'); assert.equal((await invoke(options, 'commit')).status, 'installed'); assert.equal(requestCount, 2)
  outcomes.push('explicit-reupgrade-uses-new-journal-and-new-proof')
  const interrupted = await fixture('interrupted-recovery'); rejectRestoredHealth = true
  await assert.rejects(invoke(interrupted, 'recover-old'), /INSTALL_DOCKER_COMMAND_FAILED/)
  assert.ok((await readState(path.join(prefix, 'journal.json'))).withdrawnAt)
  await assert.rejects(invoke(interrupted, 'commit'), /INSTALL_CANDIDATE_WITHDRAWN/)
  await assert.rejects(invoke(interrupted, 'upgrade'), /INSTALL_INTERRUPTED_JOURNAL_RECOVERY_REQUIRED/)
  outcomes.push('interrupted-recovery-cannot-commit-or-resume-pending')
  const legacy = await fixture('legacy-recovery')
  const state = await readState(path.join(prefix, 'journal.json')); state.recovery = { status: 'previous-restored' }
  await atomicJson(path.join(prefix, 'journal.json'), state)
  await assert.rejects(invoke(legacy, 'commit'), /INSTALL_CANDIDATE_WITHDRAWN/)
  assert.equal((await invoke(legacy, 'upgrade')).status, 'awaiting-validation')
  outcomes.push('legacy-restored-journal-also-rejected')
  console.log(JSON.stringify({ status: 'passed', outcomes, realDockerOrHttp: false, actualFilesystem: true }))
  }
  }
} finally {
  assert.equal(path.dirname(await fs.realpath(root)), parent)
  await fs.rm(root, { recursive: true })
}
