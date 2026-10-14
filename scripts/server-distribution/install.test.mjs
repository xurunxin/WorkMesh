import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile, writeFile, mkdir, chmod, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hash, validateManifest, verifyBundle, assertCompatibleLedger, assertCompatibleProgram, assertRecoveryCompatible } from './manifest.mjs'
import { privateDirectory, atomicJson, withInstallLock, readState, validateJournal } from './journal.mjs'
import { ArchiveIdentities } from './archive.mjs'
import { commandFailure, containerStatus } from './diagnostics.mjs'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const temporary = async () => realpath(await mkdtemp(path.join(tmpdir(), 'workmesh-server-unit-')))
const ledger = [{ version: 'v1_0001', checksumSha256: 'a'.repeat(64) }]
const manifest = () => {
  const commit = 'a'.repeat(40), roles = ['api', 'worker', 'mcp', 'lite', 'installer', 'postgres', 'redis', 'minio']
  const images = Object.fromEntries(roles.map((role, i) => [role, { id: 'sha256:' + String(i + 1).repeat(64),
    archiveId: 'sha256:' + String(i + 1).repeat(64),
    reference: `workmesh/${role}:candidate`, revision: ['postgres', 'redis', 'minio'].includes(role) ? '' : commit }]))
  return { format: 'workmesh-server-distribution', release: 'candidate', arch: 'amd64', source: { commit, tree: 'b'.repeat(40) },
    runtimeFingerprint: 'c'.repeat(64),
    tools: { producerNode: 'v22.19.0', producerDocker: 'Docker fixture', installerNode: 'v22.19.0', installerDocker: 'Docker fixture',
      installerCompose: 'Compose fixture', pgDump: 'pg_dump 16', pgRestore: 'pg_restore 16' },
    images, installerImage: images.installer.id, installerArchiveImage: images.installer.archiveId, migrationLedger: structuredClone(ledger),
    files: ['docker-compose.lite.yml', 'docker-compose.production.yml', 'install.sh', 'config.example.json'].map(file => ({ path: file, sha256: hash(Buffer.from(file)), bytes: file.length })),
    chunks: [{ path: 'chunks/main.tarpart', sha256: hash(Buffer.from('main')), bytes: 4 }],
    bootstrapChunks: [{ path: 'chunks/helper.tarpart', sha256: hash(Buffer.from('helper')), bytes: 6 }] }
}

test('native readiness probe rejects errors, redirects and incomplete responses within its deadline', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/stall') return
    if (request.url === '/incomplete') { response.writeHead(200); response.flushHeaders(); return }
    if (request.url === '/redirect') { response.writeHead(302, { Location: '/healthy' }).end(); return }
    if (request.url === '/unhealthy') { response.writeHead(503).end(); return }
    response.writeHead(200).end('ready')
  })
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve))
  const windows = process.platform === 'win32'
  const url = `http://${windows ? 'host.docker.internal' : '127.0.0.1'}:${server.address().port}`
  const script = fileURLToPath(new URL('../../infra/docker/healthcheck.sh', import.meta.url))
  const bytes = (await readFile(script, 'utf8')).replace(/\r\n/g, '\n')
  const run = endpoint => windows ? new Promise((resolve, reject) => {
    // Use an already-owned image by exact ID; /data tmpfs prevents its declared
    // VOLUME from allocating an anonymous volume. No fixture daemon remains.
    assert.match(process.env.WORKMESH_HEALTH_PROBE_IMAGE ?? '', /^sha256:[0-9a-f]{64}$/)
    const child = execFile('docker', ['run', '--rm', '-i', '--tmpfs', '/data',
      '--label', 'io.workmesh.test.owner=ta01-health-probe', '--entrypoint', 'sh',
      process.env.WORKMESH_HEALTH_PROBE_IMAGE, '-s', '--', endpoint], { timeout: 10_000 },
    (error, stdout) => error ? reject(error) : resolve(stdout))
    child.stdin.end(bytes)
  }) : promisify(execFile)('sh', [script, endpoint], { timeout: 3_000 })
  try {
    await run(url + '/healthy')
    for (const endpoint of ['/unhealthy', '/redirect', '/stall', '/incomplete']) {
      await assert.rejects(run(url + endpoint), { code: 1 })
    }
    await assert.rejects(run('file:///untrusted'), { code: 1 })
    await assert.rejects(run(url.replace('http://', 'http://user:password@')), { code: 1 })
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('Docker diagnostics preserve failure categories without argv, secrets or raw output', () => {
  const secret = 'wmi_' + 'x'.repeat(43)
  const stderr = `dependency failed to start: container api is unhealthy ${secret}`
  const summary = commandFailure({ status: 1, stderr, message: secret, spawnargs: [secret] })
  assert.equal(summary.stderrSha256, hash(Buffer.from(stderr)))
  assert.deepEqual(summary.categories, ['unhealthy'])
  assert.equal(summary.exitCode, 1)
  assert.equal(JSON.stringify(summary).includes(secret), false)
  assert.equal(commandFailure({ code: 'ETIMEDOUT' }).timedOut, true)
  const recovery = commandFailure({ stderr: `RECOVERY_DATABASE_CLIENTS_ACTIVE:23:private-client:idle ${secret} AccessDenied` })
  assert.deepEqual(recovery.recoveryCodes, ['RECOVERY_DATABASE_CLIENTS_ACTIVE'])
  assert.deepEqual(recovery.providerCodes, ['AccessDenied'])
  assert.equal(JSON.stringify(recovery).includes('private-client'), false)
  assert.equal(JSON.stringify(recovery).includes(secret), false)
  const info = { Id: 'sha256:' + 'a'.repeat(64), Config: { Env: [secret], Labels: { 'com.docker.compose.service': secret } },
    State: { Status: 'exited', ExitCode: 1, OOMKilled: true, Health: { Status: 'unhealthy', Log: [{ ExitCode: 1, Output: secret }] } }, RestartCount: 2 }
  const status = containerStatus(info)
  assert.equal(status.service, 'unknown')
  assert.equal(status.oom, true)
  assert.equal(status.probes[0].outputSha256, hash(Buffer.from(secret)))
  assert.equal(JSON.stringify(status).includes(secret), false)
})
test('wrongArchitectureRejectedBeforeMutation and strict closed manifest schema', () => {
  for (const mutate of [m => { m.arch = 'x64' }, m => { m.images.mcp.revision = 'b'.repeat(40) },
    m => { m.extra = true }, m => { m.files[0].path = '../configuration' }, m => { m.installerImage = m.images.redis.id },
    m => { m.images.runner = m.images.api }, m => { m.migrationLedger.push({ ...ledger[0] }) }]) {
    const invalid = manifest(); mutate(invalid); assert.throws(() => validateManifest(invalid), /INSTALL_/)
  }
})
test('OCI archive identity is bound to the exact manifest and survives split tar headers', () => {
  const configId = 'sha256:' + 'a'.repeat(64)
  const body = Buffer.from(JSON.stringify({ schemaVersion: 2, config: { digest: configId }, layers: [] }))
  const member = (name, bytes) => {
    const header = Buffer.alloc(512)
    header.write(name); header.write(bytes.length.toString(8).padStart(11, '0'), 124)
    return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)])
  }
  const manifestMember = member('blobs/sha256/' + hash(body), body)
  const indexMember = member('index.json', Buffer.from(JSON.stringify({ schemaVersion: 2, manifests: [{ digest: 'sha256:' + hash(body) }] })))
  const tar = Buffer.concat([manifestMember, indexMember, Buffer.alloc(1024)])
  const archive = new ArchiveIdentities()
  for (let i = 0; i < tar.length; i += 17) archive.write(tar.subarray(i, i + 17))
  assert.equal(archive.id(configId), 'sha256:' + hash(body))
  const truncated = new ArchiveIdentities(); truncated.write(tar.subarray(0, 515))
  assert.throws(() => truncated.id(configId), /BUILD_ARCHIVE_TRUNCATED/)
  const dropped = new ArchiveIdentities(); dropped.write(Buffer.concat([manifestMember, Buffer.alloc(1024)]))
  assert.throws(() => dropped.id(configId), /BUILD_ARCHIVE_INDEX_MISSING_IMAGE/)
  assert.equal(new ArchiveIdentities().id(configId), configId)
})
test('offlineDependencyClosure verifies actual bytes before an image is imported', async () => {
  const directory = await temporary(), m = manifest()
  await mkdir(path.join(directory, 'chunks'))
  for (const entry of [...m.files, ...m.chunks, ...m.bootstrapChunks])
    await writeFile(path.join(directory, entry.path), entry.path.endsWith('main.tarpart') ? 'main' : entry.path.endsWith('helper.tarpart') ? 'helper' : entry.path)
  const bytes = Buffer.from(JSON.stringify(m)), digest = hash(bytes)
  await writeFile(path.join(directory, 'manifest.json'), bytes)
  assert.deepEqual(await verifyBundle(directory, digest), m)
  await writeFile(path.join(directory, m.chunks[0].path), 'evil')
  await assert.rejects(verifyBundle(directory, digest), /INSTALL_FILE_DIGEST_MISMATCH/)
  await assert.rejects(verifyBundle(directory, 'f'.repeat(64)), /INSTALL_MANIFEST_DIGEST_MISMATCH/)
})
test('compatibleProgramRollback rejects prefix, unknown rows and changed checksums', () => {
  assert.doesNotThrow(() => assertCompatibleLedger([{ ...ledger[0], appliedAt: 'ignored' }], ledger))
  for (const rows of [[], [{ ...ledger[0], checksumSha256: 'b'.repeat(64) }],
    [...ledger, { version: 'unrecognized', checksumSha256: 'c'.repeat(64) }]])
    assert.throws(() => assertCompatibleLedger(rows, ledger), /INSTALL_INCOMPATIBLE_LEDGER_RESTORE_REQUIRED/)
})
test('same schema does not authorize rollback into changed program semantics', () => {
  const original = manifest(), changed = manifest()
  assert.doesNotThrow(() => assertCompatibleProgram(original, changed))
  changed.runtimeFingerprint = 'd'.repeat(64)
  assert.throws(() => assertCompatibleProgram(original, changed), /INSTALL_INCOMPATIBLE_PROGRAM_RESTORE_REQUIRED/)
  changed.runtimeFingerprint = original.runtimeFingerprint; changed.images.redis.id = 'sha256:' + 'a'.repeat(64)
  assert.throws(() => assertCompatibleProgram(original, changed), /INSTALL_INCOMPATIBLE_PROGRAM_RESTORE_REQUIRED/)
})

test('interrupted health intent cannot bypass program compatibility without pending state', () => {
  const previous = manifest(), candidate = manifest()
  candidate.runtimeFingerprint = 'd'.repeat(64)
  const candidateManifestJson = JSON.stringify(candidate)
  const journal = { stage: 'migrated', actions: [{ name: 'verify-health-and-ledger', status: 'intent' }], candidateManifestJson, candidate: hash(Buffer.from(candidateManifestJson)) }
  assert.throws(() => assertRecoveryCompatible(previous, journal), /INSTALL_INCOMPATIBLE_PROGRAM_RESTORE_REQUIRED/)
  assert.throws(() => assertRecoveryCompatible(previous, { ...journal, candidateManifestJson: undefined }), /INSTALL_RECOVERY_CANDIDATE_REQUIRED/)
  const original = JSON.stringify(manifest())
  assert.throws(() => assertRecoveryCompatible(previous, { ...journal, candidateManifestJson: original }), /INSTALL_RECOVERY_CANDIDATE_INVALID/)
  assert.doesNotThrow(() => assertRecoveryCompatible(previous, { ...journal, candidateManifestJson: original, candidate: hash(Buffer.from(original)) }))
  // Before any new runtime can start, the original program may recover after
  // the separately required exact ledger check even if program inputs differ.
  assert.doesNotThrow(() => assertRecoveryCompatible(previous, { ...journal, actions: [{ name: 'apply-migration-ledger', status: 'failed' }] }))
})
test('concurrentInstallHasOneOwner and lock is released after failure', async () => {
  const directory = await temporary()
  let finish, began
  const entered = new Promise(resolve => { began = resolve }), held = new Promise(resolve => { finish = resolve })
  const first = withInstallLock(directory, async () => { began(); await held })
  await entered
  await assert.rejects(withInstallLock(directory, () => {}), /INSTALL_LOCKED/)
  finish(); await first
  await assert.rejects(withInstallLock(directory, async () => { throw Error('intent failed') }), /intent failed/)
  await withInstallLock(directory, () => {})
})
test('invalidInstallJournalRefused and atomic write exposes only a complete state', async () => {
  const directory = await temporary(), file = path.join(directory, 'journal.json')
  const value = { format: 'workmesh-install-journal', stage: 'staged', project: 'owned-project', candidate: 'a'.repeat(64), configHash: 'b'.repeat(64), actions: [{ status: 'intent' }] }
  await atomicJson(file, value)
  assert.deepEqual(validateJournal(await readState(file)), value)
  assert.throws(() => validateJournal({ ...value, stage: 'unknown' }), /INSTALL_INVALID_JOURNAL/)
  await writeFile(file, '{')
  await assert.rejects(readState(file), /INSTALL_INVALID_JOURNAL/)
})
test('rejects unsafe paths rather than changing directory permissions', async () => {
  const directory = await temporary()
  await privateDirectory(directory)
  if (process.platform !== 'win32') {
    await chmod(directory, 0o777)
    await assert.rejects(privateDirectory(directory), /INSTALL_UNSAFE_(?:PATH|ANCESTOR)/)
  }
  await assert.rejects(privateDirectory('relative-path'), /INSTALL_UNSAFE_PATH/)
})
