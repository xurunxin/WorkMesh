import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, lstat, realpath, statfs, readdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import https from 'node:https'
import { verifyBundle, hash, fail, assertCompatibleLedger, assertCompatibleProgram, canonicalJson } from './manifest.mjs'
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
export function loadedImage(image, arch) {
  for (const id of new Set([image.id, image.archiveId])) {
    let inspected
    try { inspected = JSON.parse(docker(['image', 'inspect', id]))[0] } catch { continue }
    if (![image.id, image.archiveId].includes(inspected.Id) || inspected.Architecture !== arch
      || (image.revision && inspected.Config.Labels?.['org.opencontainers.image.revision'] !== image.revision)) fail('INSTALL_IMAGE_IDENTITY_MISMATCH')
    return inspected.Id
  }
  fail('INSTALL_IMAGE_MISSING')
}
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
    const dependencyRole = name === 'minio-init' ? 'minio' : name
    if (['postgres', 'redis', 'minio'].includes(dependencyRole)) service.image = manifest.images[dependencyRole].id
    service.labels = { ...service.labels, 'io.workmesh.installation': config.installationId,
      'io.workmesh.installation-root': hash(Buffer.from(prefix)) }
    service.pull_policy = 'never'
    if (name === 'minio-init') service.tmpfs = ['/data:rw,nosuid,nodev,size=16m']
    if (runtimeServices.includes(name)) {
      for (const key of profileNames) if (env[key] !== undefined) service.environment[key] = env[key]
      if (env.NODE_EXTRA_CA_CERTS) service.volumes = [...(service.volumes ?? []), {
        type: 'bind', source: env.NODE_EXTRA_CA_CERTS, target: '/run/workmesh/private-ca.pem', read_only: true,
      }]
      if (env.NODE_EXTRA_CA_CERTS) service.environment.NODE_EXTRA_CA_CERTS = '/run/workmesh/private-ca.pem'
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
  return Object.fromEntries(Object.entries(manifest.images).map(([role, image]) => [role, loadedImage(image, manifest.arch)]))
}
function assertNoExistingDeployment(project, document) {
  for (const args of [['ps', '-aq'], ['volume', 'ls', '-q'], ['network', 'ls', '-q']]) {
    if (docker([...args, '--filter', `label=com.docker.compose.project=${project}`])) fail('INSTALL_PROJECT_ALREADY_EXISTS')
  }
  for (const volume of Object.values(document.volumes ?? {})) {
    if (docker(['volume', 'ls', '-q', '--filter', `name=^${volume.name}$`])) fail('INSTALL_VOLUME_ALREADY_EXISTS')
  }
  for (const network of Object.values(document.networks ?? {})) {
    if (docker(['network', 'ls', '-q', '--filter', `name=^${network.name}$`])) fail('INSTALL_NETWORK_ALREADY_EXISTS')
  }
}
function assertOwnedDeployment(release) {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${release.project}`]).split('\n').filter(Boolean)
  if (!ids.length) fail('INSTALL_DEPLOYMENT_MISSING')
  for (const id of ids) {
    const info = JSON.parse(docker(['inspect', id]))[0]
    if (info.Config.Labels?.['io.workmesh.installation'] !== release.installationId
      || info.Config.Labels?.['io.workmesh.installation-root'] !== release.rootHash) fail('INSTALL_DEPLOYMENT_OWNERSHIP_MISMATCH')
  }
}
async function withProjectLock(identity, image, action) {
  let id
  try {
    id = docker(['create', '--name', `workmesh-install-lock-${identity.project}`, '--network', 'none', '--read-only',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--label', `io.workmesh.installation=${identity.id}`,
      '--label', `io.workmesh.installation-root=${hash(Buffer.from(identity.root))}`, '--entrypoint', 'true', image])
  } catch { fail('INSTALL_PROJECT_LOCKED') }
  try { return await action() }
  finally {
    const info = JSON.parse(docker(['inspect', id]))[0]
    if (info.State.Running || info.Config.Labels?.['io.workmesh.installation'] !== identity.id
      || info.Config.Labels?.['io.workmesh.installation-root'] !== hash(Buffer.from(identity.root))) fail('INSTALL_LOCK_OWNERSHIP_MISMATCH')
    docker(['rm', id])
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
    ...(api.volumes ?? []).filter(mount => mount.type === 'bind' && mount.target === '/run/workmesh/private-ca.pem')
      .flatMap(mount => ['--mount', `type=bind,src=${mount.source},dst=${mount.target},readonly`]),
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
async function verifyBusinessRead(release, env, proofFile) {
  const info = await lstat(proofFile)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077)) fail('INSTALL_VALIDATION_PERMISSIONS_INVALID')
  let proof
  try { proof = JSON.parse(await readFile(proofFile, 'utf8')) } catch { fail('INSTALL_VALIDATION_INVALID') }
  if (!proof || Object.keys(proof).sort().join(',') !== 'credential,workItemId'
    || typeof proof.credential !== 'string' || proof.credential.length < 32 || proof.credential.length > 1024
    || /\s/.test(proof.credential) || !/^[a-f0-9-]{36}$/.test(proof.workItemId)) fail('INSTALL_VALIDATION_INVALID')
  const ca = env.NODE_EXTRA_CA_CERTS ? await readFile(env.NODE_EXTRA_CA_CERTS) : undefined
  const post = (id, method, params) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    const request = https.request(new URL('/mcp', env.PUBLIC_MCP_ORIGIN), {
      method: 'POST', ca, timeout: 30_000, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'content-length': Buffer.byteLength(body), ...(env.WORKMESH_BETA_COORDINATION_MCP === 'true'
          ? { 'X-WorkMesh-Installation-Token': proof.credential } : { authorization: `Bearer ${proof.credential}` }) },
    }, response => {
      let result = '', bytes = 0
      response.on('data', block => { bytes += block.length; if (bytes > 1024 * 1024) request.destroy(); else result += block })
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) fail('INSTALL_BUSINESS_VALIDATION_FAILED')
          const data = result.startsWith('data:') || result.startsWith('event:')
            ? result.split('\n').find(line => line.startsWith('data:'))?.slice(5) : result
          const reply = JSON.parse(data)
          if (reply.error || reply.result?.isError || reply.id !== id) fail('INSTALL_BUSINESS_VALIDATION_FAILED')
          resolve(reply.result)
        } catch { reject(new Error('INSTALL_BUSINESS_VALIDATION_FAILED')) }
      })
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('INSTALL_BUSINESS_VALIDATION_TIMEOUT')))
    request.on('error', () => reject(new Error('INSTALL_BUSINESS_VALIDATION_FAILED')))
    request.end(body)
  })
  await post(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'workmesh-installer', version: '1.0.0' } })
  const result = await post(2, 'tools/call', { name: 'get_work_item', arguments: { workItemId: proof.workItemId } })
  const resource = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text)
  if (resource.id !== proof.workItemId) fail('INSTALL_BUSINESS_VALIDATION_FAILED')
  assertCompatibleLedger(ledger(release), release.manifest.migrationLedger)
  return { authenticatedMcpRead: true, workItemId: proof.workItemId, candidate: release.candidate }
}

export async function install(options, authority = undefined) {
  const { prefix, bundle, digest, configFile, action } = options
  await privateDirectory(prefix)
  const manifest = await verifyBundle(bundle, digest)
  const config = await readPrivateConfig(configFile)
  const identityFile = path.join(prefix, 'installation.json')
  const storedIdentity = await readState(identityFile)
  const identity = storedIdentity ?? { format: 'workmesh-installation', id: randomUUID(), root: prefix, project: config.project }
  if (identity.format !== 'workmesh-installation' || identity.root !== prefix || identity.project !== config.project
    || !/^[a-f0-9-]{36}$/.test(identity.id)) fail('INSTALL_IDENTITY_INVALID')
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
  const helperId = loadedImage(manifest.images.installer, manifest.arch)
  const rendered = await render({ ...config, installationId: identity.id }, manifest, bundle, prefix, authority ?? await appConfig(), keys)
  const configHash = hash(Buffer.from(canonicalJson(config)))
  const fs = await statfs(prefix)
  const required = [...manifest.chunks, ...manifest.bootstrapChunks].reduce((sum, entry) => sum + entry.bytes, 0)
  if (Number(fs.bavail) * Number(fs.bsize) < Math.max(1024 ** 3, required * 2)) fail('INSTALL_INSUFFICIENT_SPACE')
  if (action === 'check') return { status: 'checked', profile: config.profile, release: manifest.release, candidate: digest }
  if (!['install', 'upgrade', 'rollback', 'recover-old', 'restore-empty', 'commit'].includes(action)) fail('INSTALL_ACTION_INVALID')
  if (['upgrade', 'rollback'].includes(action) && !options.maintenanceConfirmed) fail('INSTALL_MAINTENANCE_CONFIRMATION_REQUIRED')
  return withInstallLock(prefix, async () => {
    if (!storedIdentity) await atomicJson(identityFile, identity)
    return withProjectLock(identity, helperId, async () => {
    const currentFile = path.join(prefix, 'current.json'), journalFile = path.join(prefix, 'journal.json')
    const previous = await readState(currentFile), existing = await readState(journalFile)
    if (previous && (previous.installationId !== identity.id || previous.rootHash !== hash(Buffer.from(prefix)))) fail('INSTALL_IDENTITY_INVALID')
    if (previous && !keysExisted) fail('INSTALL_OPERATOR_KEYS_MISSING')
    if (previous && (previous.project !== config.project || previous.configHash !== configHash)) fail('INSTALL_DEPLOYMENT_CONFIG_CHANGED')
    if (existing) validateJournal(existing)
    const pendingFile = path.join(prefix, 'pending.json')
    const pending = await readState(pendingFile)
    if (action === 'commit') {
      if (previous?.candidate === digest && existing?.stage === 'committed') return { status: 'already-installed', candidate: digest }
      if (previous?.candidate === digest && existing?.stage === 'healthy' && existing.validation?.candidate === digest) {
        assertOwnedDeployment(previous); assertCompatibleLedger(ledger(previous), previous.manifest.migrationLedger)
        existing.stage = 'committed'; await atomicJson(journalFile, existing)
        return { status: 'already-installed', candidate: digest }
      }
      if (!pending || pending.candidate !== digest || pending.configHash !== configHash || pending.installationId !== identity.id
        || existing?.stage !== 'healthy' || existing.candidate !== digest || !options.validationFile) fail('INSTALL_VALIDATION_REQUIRED')
      assertOwnedDeployment(pending)
      const readIntent = { name: 'validate-business-read', status: 'intent', startedAt: new Date().toISOString() }
      existing.actions.push(readIntent); await atomicJson(journalFile, existing)
      try { existing.validation = await verifyBusinessRead(pending, rendered.env, options.validationFile); readIntent.status = 'completed' }
      catch (error) { readIntent.status = 'failed'; await atomicJson(journalFile, existing); throw error }
      const switchIntent = { name: 'switch-current', status: 'intent', startedAt: new Date().toISOString() }
      existing.actions.push(switchIntent)
      await atomicJson(journalFile, existing)
      await atomicJson(currentFile, pending)
      switchIntent.status = 'completed'
      existing.stage = 'committed'; await atomicJson(journalFile, existing)
      return { status: 'installed', candidate: digest, profile: pending.profile, journalId: existing.id, preservedVolumes: true }
    }
    if (action === 'recover-old') {
      if (!existing || existing.stage === 'committed' || existing.recovery?.status === 'previous-restored') fail('INSTALL_NO_INTERRUPTED_UPGRADE')
      if (pending && existing.stage === 'healthy') assertCompatibleProgram(previous.manifest, pending.manifest)
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
    if (existing?.stage === 'healthy' && pending?.candidate === digest && pending.configHash === configHash)
      return { status: 'awaiting-validation', candidate: digest, journalId: existing.id }
    if (existing && existing.stage !== 'committed' && existing.recovery?.status !== 'previous-restored') fail('INSTALL_INTERRUPTED_JOURNAL_RECOVERY_REQUIRED')
    if (previous?.candidate === digest) return { status: 'already-installed', candidate: digest }
    if (action === 'install' && previous) fail('INSTALL_ALREADY_INITIALIZED')
    if (action !== 'install' && !previous) fail('INSTALL_NO_PREVIOUS_RELEASE')
    if (!previous) assertNoExistingDeployment(config.project, rendered.document)
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
        installationId: identity.id, rootHash: hash(Buffer.from(prefix)),
        composeFile: path.join(releaseDir, 'compose.json'), backupKey: rendered.env.WORKMESH_BACKUP_ENCRYPTION_KEY }
      await atomicJson(release.composeFile, rendered.document)
      await atomicJson(path.join(releaseDir, 'release.json'), release)
    }
    const journal = { format: 'workmesh-install-journal', id: randomUUID(), stage: 'verified', candidate: digest,
      installationId: identity.id, root: prefix,
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
          try {
            if (name === 'verify-health-and-ledger') assertCompatibleProgram(previous.manifest, manifest)
            await recoverOld(previous, journal, journalFile)
          }
          catch { journal.recovery = { status: 'stopped-restore-required' }; await atomicJson(journalFile, journal) }
        }
        throw error
      }
    }
    const stage = async value => { journal.stage = value; await atomicJson(journalFile, journal) }
    const installedImages = await effect('import-images', () => importImages(bundle, manifest))
    const targetIds = new Map(Object.entries(manifest.images).map(([role, image]) => [image.id, installedImages[role]]))
    for (const service of Object.values(rendered.document.services)) {
      if (!targetIds.has(service.image)) fail('INSTALL_COMPOSE_IMAGE_NOT_IN_CLOSURE')
      service.image = targetIds.get(service.image)
    }
    release.installedImages = installedImages
    await atomicJson(release.composeFile, rendered.document)
    await atomicJson(path.join(releaseDir, 'release.json'), release)
    await stage('staged')
    if (previous) {
      if (action === 'rollback') { assertCompatibleProgram(previous.manifest, manifest); assertCompatibleLedger(ledger(previous), manifest.migrationLedger) }
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
    await atomicJson(pendingFile, release)
    return { status: 'awaiting-validation', candidate: digest, profile: release.profile, journalId: journal.id, preservedVolumes: true }
    })
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = name => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1] }
  try {
    const result = await install({ prefix: option('prefix'), bundle: option('bundle'), digest: option('digest'),
      configFile: option('config'), action: option('action'), restoreBundle: option('restore-bundle'), targetFile: option('target'),
      validationFile: option('validation'), maintenanceConfirmed: process.argv.includes('--maintenance-confirmed') })
    console.log(JSON.stringify(result))
  } catch (error) {
    const code = /^INSTALL_[A-Z_]+|^DEPLOYMENT_PROFILE_INVALID(?::[A-Z_,]+)?/.exec(error.message)?.[0] ?? 'INSTALL_PREFLIGHT_OR_OPERATION_FAILED'
    console.error(code); process.exitCode = 1
  }
}
