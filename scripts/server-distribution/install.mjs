import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, lstat, realpath, statfs, readdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { verifyBundle, hash, fail, assertCompatibleLedger } from './manifest.mjs'
import { atomicJson, privateDirectory, readState, validateJournal, withInstallLock } from './journal.mjs'

const appConfig = () => import('/app/node_modules/@workmesh/config/dist/index.js')
const profileNames = ['WORKMESH_DEPLOYMENT_PROFILE', 'WORKMESH_QUEUE_BACKEND', 'WORKMESH_ARTIFACT_BACKEND',
  'WORKMESH_RUNNER_PLACEMENT', 'WORKMESH_API_REPLICAS', 'WORKMESH_WORKER_REPLICAS', 'WORKMESH_MCP_REPLICAS',
  'WORKMESH_BIND_ADDRESS', 'S3_PUBLIC_ENDPOINT', 'SESSION_COOKIE_SECURE', 'NODE_EXTRA_CA_CERTS']
const requiredDefaults = { WORKMESH_QUEUE_BACKEND: 'redis', WORKMESH_ARTIFACT_BACKEND: 's3',
  WORKMESH_RUNNER_PLACEMENT: 'external', WORKMESH_API_REPLICAS: '1', WORKMESH_WORKER_REPLICAS: '1',
  WORKMESH_MCP_REPLICAS: '1', WORKMESH_BIND_ADDRESS: '127.0.0.1', SESSION_COOKIE_SECURE: 'true' }
const runtimeServices = ['api', 'worker', 'mcp']
const docker = (args, options = {}) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 1_800_000, ...options }).trim() }
  catch { fail('INSTALL_DOCKER_COMMAND_FAILED') }
}
const compose = (release, args) => docker(['compose', '-p', release.project, '-f', release.composeFile, ...args])
async function readPrivateConfig(file) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) fail('INSTALL_CONFIG_PERMISSIONS_INVALID')
  let config
  try { config = JSON.parse(await readFile(file, 'utf8')) } catch { fail('INSTALL_CONFIG_INVALID') }
  if (!config || Object.keys(config).sort().join(',') !== 'environment,profile,project'
    || !['personal', 'team', 'enterprise'].includes(config.profile)
    || !/^[a-z][a-z0-9-]{2,47}$/.test(config.project) || !config.environment || Array.isArray(config.environment)
    || Object.values(config.environment).some(value => typeof value !== 'string' || /[\r\n\0]/.test(value))) fail('INSTALL_CONFIG_INVALID')
  return config
}
async function render(config, manifest, bundle, prefix, authority, keys) {
  const templates = await Promise.all(['lite', 'production'].map(name => readFile(path.join(bundle, `docker-compose.${name}.yml`), 'utf8')))
  const allowed = new Set([...templates.join('\n').matchAll(/\$\{([A-Z0-9_]+)/g)].map(match => match[1]))
  for (const name of [...profileNames, 'WORKMESH_BACKUP_ENCRYPTION_KEY']) allowed.add(name)
  for (const key of Object.keys(config.environment)) {
    if (!allowed.has(key) || /(?:_IMAGE|BUILD_SHA)$/.test(key) || key === 'WORKMESH_DEPLOYMENT_PROFILE'
      || key.startsWith('WORKMESH_AGENT_') || (key.startsWith('WORKMESH_RUNNER_') && key !== 'WORKMESH_RUNNER_PLACEMENT')) fail('INSTALL_CONFIG_KEY_INVALID')
  }
  const env = { ...requiredDefaults, POSTGRES_USER: 'workmesh', POSTGRES_DB: 'workmesh',
    MINIO_ROOT_USER: 'workmesh', S3_ACCESS_KEY_ID: 'workmesh', S3_BUCKET: 'workmesh-artifacts',
    PAGINATION_CURSOR_ACTIVE_KID: 'primary', ...keys, ...config.environment, WORKMESH_DEPLOYMENT_PROFILE: config.profile,
    WORKMESH_BUILD_SHA: manifest.source.commit, WORKMESH_API_IMAGE: manifest.images.api.id,
    WORKMESH_WORKER_IMAGE: manifest.images.worker.id, WORKMESH_MCP_IMAGE: manifest.images.mcp.id,
    WORKMESH_LITE_IMAGE: manifest.images.lite.id }
  // The external Runner receives its own installation identity through the normal
  // protocol. This installer never provisions an execution or machine credential.
  if (env.WORKMESH_RUNNER_PLACEMENT !== 'external') fail('INSTALL_RUNNER_BOUNDARY_INVALID')
  authority.loadDeploymentProfile(env)
  if (env.S3_ACCESS_KEY_ID !== env.MINIO_ROOT_USER || env.S3_SECRET_ACCESS_KEY !== env.MINIO_ROOT_PASSWORD
    || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.S3_BUCKET ?? '')
    || /\.\.|\.\-|\-\./.test(env.S3_BUCKET) || env.S3_FORCE_PATH_STYLE === 'false') fail('INSTALL_S3_CONFIGURATION_INVALID')
  if (!env.WORKMESH_BACKUP_ENCRYPTION_KEY || !/^[a-fA-F0-9]{64}$/.test(env.WORKMESH_BACKUP_ENCRYPTION_KEY)
    || env.WORKMESH_BACKUP_ENCRYPTION_KEY.toLowerCase() === env.WORKMESH_MASTER_KEY?.toLowerCase()) fail('INSTALL_BACKUP_KEY_INVALID')
  if (env.NODE_EXTRA_CA_CERTS) {
    if (!env.NODE_EXTRA_CA_CERTS.startsWith(`${prefix}/certificates/`)) fail('INSTALL_CA_OUTSIDE_PREFIX')
    const caInfo = await lstat(env.NODE_EXTRA_CA_CERTS)
    if (!caInfo.isFile() || caInfo.isSymbolicLink() || await realpath(env.NODE_EXTRA_CA_CERTS) !== env.NODE_EXTRA_CA_CERTS
      || !String(await readFile(env.NODE_EXTRA_CA_CERTS)).includes('-----BEGIN CERTIFICATE-----')) fail('INSTALL_CA_INVALID')
  }
  // Docker Compose receives a closed environment, never the producer/parent's
  // feature flags or credentials. Its rendered output stays in private storage.
  const rendered = templates.map((_, index) => JSON.parse(docker(['compose', '--profile', 'agent', '-p', config.project,
    '-f', path.join(bundle, `docker-compose.${index === 0 ? 'lite' : 'production'}.yml`), 'config', '--format', 'json'],
  { env: { PATH: process.env.PATH, HOME: '/tmp', ...env } })))
  const document = config.profile === 'personal' ? rendered[0] : rendered[1]
  if (config.profile === 'personal') document.services.mcp = structuredClone(rendered[1].services.mcp)
  delete document.services['agent-runner']
  delete document.name
  for (const [name, service] of Object.entries(document.services)) {
    delete service.profiles
    service.labels = { ...service.labels, 'io.workmesh.installation': config.project }
    service.pull_policy = 'never'
    if (name === 'minio-init') service.tmpfs = ['/data:rw,nosuid,nodev,size=16m']
    if (runtimeServices.includes(name)) {
      for (const key of profileNames) if (env[key] !== undefined) service.environment[key] = env[key]
      if (env.NODE_EXTRA_CA_CERTS) service.volumes = [...(service.volumes ?? []), {
        type: 'bind', source: env.NODE_EXTRA_CA_CERTS, target: env.NODE_EXTRA_CA_CERTS, read_only: true,
      }]
      service.environment.SESSION_COOKIE_SECURE = 'true'
      if (name === 'mcp' && config.profile === 'personal') {
        service.mem_limit = '384m'; service.environment.NODE_OPTIONS = '--max-old-space-size=256'
        service.logging = document.services.api.logging
      }
      if (name === 'api') authority.loadConfig(service.environment)
      authority.loadFeatureConfig(service.environment)
      if (name === 'worker') { authority.loadRealtimeRedisHintConfig(service.environment); authority.loadRetentionConfig(service.environment) }
      const secrets = await import('/app/runtime-secrets.mjs')
      secrets.validateRuntimeEnvironment(service.environment, env)
    }
    // JSON Compose is accepted by the same parser as YAML. No target-side build.
    if (service.ports) for (const port of service.ports) port.host_ip = env.WORKMESH_BIND_ADDRESS
  }
  return { document, env }
}
async function importImages(bundle, manifest) {
  const child = spawn('docker', ['load'], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', block => { stderr = (stderr + block).slice(-256) })
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('INSTALL_IMAGE_IMPORT_FAILED')))
  })
  // Backpressure keeps archive memory bounded; all chunks were authenticated
  // before this first application-image side effect.
  try {
    for (const entry of manifest.chunks) {
      for await (const block of (await import('node:fs')).createReadStream(path.join(bundle, entry.path))) {
        if (!child.stdin.write(block)) await new Promise((resolve, reject) => {
          child.stdin.once('drain', resolve); child.stdin.once('error', reject)
        })
      }
    }
    child.stdin.end(); await completed
  } catch (error) { child.kill(); await completed.catch(() => {}); throw error }
  for (const image of Object.values(manifest.images)) {
    const inspected = JSON.parse(docker(['image', 'inspect', image.id]))[0]
    if (inspected.Id !== image.id || inspected.Architecture !== manifest.arch
      || (image.revision && inspected.Config.Labels?.['org.opencontainers.image.revision'] !== image.revision)) fail('INSTALL_IMAGE_IDENTITY_MISMATCH')
  }
}
function assertNoExistingDeployment(project) {
  for (const args of [['ps', '-aq'], ['volume', 'ls', '-q'], ['network', 'ls', '-q']]) {
    if (docker([...args, '--filter', `label=com.docker.compose.project=${project}`])) fail('INSTALL_PROJECT_ALREADY_EXISTS')
  }
}
function assertOwnedDeployment(release) {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${release.project}`]).split('\n').filter(Boolean)
  if (!ids.length) fail('INSTALL_DEPLOYMENT_MISSING')
  for (const id of ids) {
    const info = JSON.parse(docker(['inspect', id]))[0]
    if (info.Config.Labels?.['io.workmesh.installation'] !== release.project) fail('INSTALL_DEPLOYMENT_OWNERSHIP_MISMATCH')
  }
}
function ledger(release) {
  const rows = compose(release, ['exec', '-T', 'postgres', 'sh', '-c',
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT version || chr(9) || checksum_sha256 FROM schema_migrations ORDER BY version"'])
  return rows.split('\n').filter(Boolean).map(row => { const [version, checksumSha256] = row.split('\t'); return { version, checksumSha256 } })
}
async function healthy(release) {
  // --wait also checks worker and MCP, not only an HTTP liveness endpoint.
  compose(release, ['up', '-d', '--pull', 'never', '--wait', '--wait-timeout', '180', ...runtimeServices])
  const raw = compose(release, ['ps', '--format', 'json'])
  const services = raw.startsWith('[') ? JSON.parse(raw) : raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
  for (const name of runtimeServices) if (!services.some(service => service.Service === name && service.Health === 'healthy')) fail('INSTALL_HEALTH_VALIDATION_FAILED')
  assertCompatibleLedger(ledger(release), release.manifest.migrationLedger)
}
async function oneShotRecovery(release, mode, directory, target = undefined) {
  const document = JSON.parse(await readFile(release.composeFile, 'utf8'))
  const api = document.services.api
  const network = `${release.project}_default`
  const environment = { ...api.environment, WORKMESH_SERVICE: 'migrate', WORKMESH_MAINTENANCE_CONFIRMED: '1',
    WORKMESH_BACKUP_ENCRYPTION_KEY: release.backupKey, S3_ENDPOINT: 'http://minio:9000', ...(target ?? {}) }
  // Recovery uses the old release's compiled implementation. Keys are passed in
  // a private env file; they never occur in argv, the journal or test evidence.
  const envFile = path.join(path.dirname(release.composeFile), 'recovery.env')
  await writeFile(envFile, Object.entries(environment).map(([name, value]) => `${name}=${value}`).join('\n') + '\n', { mode: 0o600 })
  const containerRoot = release.profile === 'personal' ? '/opt/workmesh/api' : '/app'
  const args = ['run', '--rm', '--pull', 'never', '--network', network, '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m',
    '--user', '0:0', '--env-file', envFile, '--mount', `type=bind,src=${mode === 'backup' ? path.dirname(directory) : directory},dst=${mode === 'backup' ? path.dirname(directory) : directory}`,
    '--workdir', containerRoot, '--entrypoint', 'node', document.services.api.image,
    'node_modules/@workmesh/recovery/dist/scripts/' + (mode === 'backup' ? 'backup.js' : 'restore.js'), directory]
  const output = docker(args)
  return JSON.parse(output.split('\n').filter(Boolean).at(-1))
}
async function recoverOld(previous, journal, journalFile) {
  if (!previous) fail('INSTALL_NO_PREVIOUS_RELEASE')
  assertOwnedDeployment(previous)
  assertCompatibleLedger(ledger(previous), previous.manifest.migrationLedger)
  await healthy(previous)
  journal.recovery = { status: 'previous-restored', migrationLedger: ledger(previous) }
  await atomicJson(journalFile, journal)
}

export async function install(options, authority = undefined) {
  const { prefix, bundle, digest, configFile, action } = options
  await privateDirectory(prefix)
  const manifest = await verifyBundle(bundle, digest)
  const config = await readPrivateConfig(configFile)
  const keysFile = path.join(prefix, 'operator-keys.json')
  let keys = await readState(keysFile)
  const keysExisted = keys !== undefined
  if (!keys) {
    const secret = () => randomBytes(32).toString('hex'), s3 = secret()
    keys = { POSTGRES_PASSWORD: secret(), MINIO_ROOT_PASSWORD: s3, S3_SECRET_ACCESS_KEY: s3,
      SESSION_SECRET: secret(), WORKMESH_MASTER_KEY: secret(), AUTH_RATE_LIMIT_HMAC_KEY: secret(),
      WORKMESH_BACKUP_ENCRYPTION_KEY: secret(), WORKMESH_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
      PAGINATION_CURSOR_KEYS: 'primary:' + randomBytes(32).toString('base64url') }
  }
  const arch = docker(['info', '--format', '{{.Architecture}}'])
  if ((manifest.arch === 'amd64' ? 'x86_64' : 'aarch64') !== arch) fail('INSTALL_WRONG_ARCHITECTURE')
  const rendered = await render(config, manifest, bundle, prefix, authority ?? await appConfig(), keys)
  const configHash = hash(Buffer.from(JSON.stringify(config)))
  const fs = await statfs(prefix)
  const required = [...manifest.chunks, ...manifest.bootstrapChunks].reduce((sum, entry) => sum + entry.bytes, 0)
  if (Number(fs.bavail) * Number(fs.bsize) < Math.max(1024 ** 3, required * 2)) fail('INSTALL_INSUFFICIENT_SPACE')
  if (action === 'check') return { status: 'checked', profile: config.profile, release: manifest.release, candidate: digest }
  if (!['install', 'upgrade', 'rollback', 'recover-old', 'restore-empty'].includes(action)) fail('INSTALL_ACTION_INVALID')
  return withInstallLock(prefix, async () => {
    const currentFile = path.join(prefix, 'current.json'), journalFile = path.join(prefix, 'journal.json')
    const previous = await readState(currentFile), existing = await readState(journalFile)
    if (previous && !keysExisted) fail('INSTALL_OPERATOR_KEYS_MISSING')
    if (previous && (previous.project !== config.project || previous.configHash !== configHash)) fail('INSTALL_DEPLOYMENT_CONFIG_CHANGED')
    if (existing) validateJournal(existing)
    if (action === 'recover-old') {
      if (!existing || existing.stage === 'committed' || existing.recovery?.status === 'previous-restored') fail('INSTALL_NO_INTERRUPTED_UPGRADE')
      await recoverOld(previous, existing, journalFile)
      return { status: 'previous-restored', preservedVolumes: true }
    }
    if (action === 'restore-empty') {
      if (!previous || !options.restoreBundle || !options.targetFile) fail('INSTALL_RESTORE_ARGUMENTS_REQUIRED')
      const target = await readPrivateConfig(options.targetFile)
      const sourceEnvironment = JSON.parse(await readFile(previous.composeFile, 'utf8')).services.api.environment
      if (target.project === previous.project || target.environment.RECOVERY_TARGET_DATABASE_URL === sourceEnvironment.DATABASE_URL
        || target.environment.RECOVERY_TARGET_S3_BUCKET === sourceEnvironment.S3_BUCKET) fail('INSTALL_RESTORE_TARGET_NOT_INDEPENDENT')
      if (Object.keys(target.environment).some(key => !key.startsWith('RECOVERY_TARGET_'))) fail('INSTALL_RESTORE_TARGET_INVALID')
      await privateDirectory(options.restoreBundle)
      assertOwnedDeployment(previous)
      const report = await oneShotRecovery(previous, 'restore', options.restoreBundle, target.environment)
      return { status: 'restored-empty-target', report, preservedVolumes: true, switched: false }
    }
    if (existing && existing.stage !== 'committed' && existing.recovery?.status !== 'previous-restored') fail('INSTALL_INTERRUPTED_JOURNAL_RECOVERY_REQUIRED')
    if (previous?.candidate === digest) return { status: 'already-installed', candidate: digest }
    if (action === 'install' && previous) fail('INSTALL_ALREADY_INITIALIZED')
    if (action !== 'install' && !previous) fail('INSTALL_NO_PREVIOUS_RELEASE')
    if (!previous) assertNoExistingDeployment(config.project)
    else assertOwnedDeployment(previous)
    if (!keysExisted) await atomicJson(keysFile, keys)
    const releaseDir = path.join(prefix, 'releases', `${manifest.release}-${manifest.arch}`)
    await mkdir(path.join(prefix, 'releases'), { mode: 0o700, recursive: true })
    let release
    try { release = await readState(path.join(releaseDir, 'release.json')) } catch { fail('INSTALL_RELEASE_CONFLICT') }
    if (release && (release.candidate !== digest || release.configHash !== configHash)) fail('INSTALL_SAME_VERSION_DIFFERENT_CONTENT')
    if (!release) {
      await mkdir(releaseDir, { mode: 0o700 })
      release = { project: config.project, profile: config.profile, candidate: digest, configHash, manifest,
        composeFile: path.join(releaseDir, 'compose.json'), backupKey: rendered.env.WORKMESH_BACKUP_ENCRYPTION_KEY }
      await atomicJson(release.composeFile, rendered.document)
      await atomicJson(path.join(releaseDir, 'release.json'), release)
    }
    const journal = { format: 'workmesh-install-journal', id: randomUUID(), stage: 'verified', candidate: digest,
      configHash, project: config.project, previous: previous?.candidate ?? null, actions: [], migrationLedger: null }
    await atomicJson(journalFile, journal)
    const effect = async (name, callback) => {
      const entry = { name, status: 'intent', startedAt: new Date().toISOString() }
      journal.actions.push(entry); await atomicJson(journalFile, journal)
      try { const value = await callback(); entry.status = 'completed'; await atomicJson(journalFile, journal); return value }
      catch (error) {
        entry.status = 'failed'; await atomicJson(journalFile, journal)
        // Never resume old code against an unknown/partially migrated ledger.
        // Pre-migration failures and exactly compatible failures retain the old
        // release; an incompatible ledger remains stopped for empty-target restore.
        if (previous && name !== 'import-images') {
          try { await recoverOld(previous, journal, journalFile) }
          catch { journal.recovery = { status: 'stopped-restore-required' }; await atomicJson(journalFile, journal) }
        }
        throw error
      }
    }
    const stage = async value => { journal.stage = value; await atomicJson(journalFile, journal) }
    await effect('import-images', () => importImages(bundle, manifest)); await stage('staged')
    if (previous) {
      if (action === 'rollback') assertCompatibleLedger(ledger(previous), manifest.migrationLedger)
      await effect('drain-admission', () => compose(previous, ['stop', '-t', '35', ...runtimeServices]))
      const backupDirectory = path.join(prefix, 'backups', journal.id)
      await mkdir(path.dirname(backupDirectory), { mode: 0o700, recursive: true })
      // Recovery creates the final bundle directory itself and refuses reuse.
      const result = await effect('complete-backup', () => oneShotRecovery(previous, 'backup', backupDirectory))
      journal.backup = { directory: backupDirectory, manifestSha256: result.manifestSha256 }
    } else {
      await effect('start-data-services', () => compose(release, ['up', '-d', '--pull', 'never', '--wait', 'postgres', 'redis', 'minio']))
      await effect('initialize-locked-bucket', () => compose(release, ['run', '--rm', '--no-deps', 'minio-init']))
    }
    await stage('backed_up')
    await effect('apply-migration-ledger', () => compose(release, ['run', '--rm', '--no-deps', 'migrate']))
    journal.migrationLedger = ledger(release); assertCompatibleLedger(journal.migrationLedger, manifest.migrationLedger)
    await stage('migrated')
    await effect('verify-health-and-ledger', () => healthy(release)); await stage('healthy')
    await effect('switch-current', () => atomicJson(currentFile, release)); await stage('committed')
    return { status: 'installed', candidate: digest, profile: release.profile, journalId: journal.id, preservedVolumes: true }
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = name => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1] }
  try {
    const result = await install({ prefix: option('prefix'), bundle: option('bundle'), digest: option('digest'),
      configFile: option('config'), action: option('action'), restoreBundle: option('restore-bundle'), targetFile: option('target') })
    console.log(JSON.stringify(result))
  } catch (error) {
    const code = /^INSTALL_[A-Z_]+|^DEPLOYMENT_PROFILE_INVALID(?::[A-Z_,]+)?/.exec(error.message)?.[0] ?? 'INSTALL_PREFLIGHT_OR_OPERATION_FAILED'
    console.error(code); process.exitCode = 1
  }
}
