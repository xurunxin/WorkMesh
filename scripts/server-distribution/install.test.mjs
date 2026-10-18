import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile, writeFile, mkdir, chmod, symlink, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hash, fileHash, validateManifest, verifyBundle, assertCompatibleLedger, assertCompatibleProgram, assertRecoveryCompatible, assertSupportedArchitecture } from './manifest.mjs'
import { privateDirectory, atomicJson, withInstallLock, readState, validateJournal } from './journal.mjs'
import { ArchiveIdentities } from './archive.mjs'
import { commandFailure, containerStatus } from './diagnostics.mjs'
import { assertStableDataBindings } from './configuration.mjs'
import { readMcpReply, mcpReplyStatus } from './mcp-response.mjs'
import { recoverFailedDeployment } from './failure-recovery.mjs'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const temporary = async () => realpath(await mkdtemp(path.join(tmpdir(), 'workmesh-server-unit-')))

test('recovered candidate cannot commit or resume across persisted commands; fresh upgrade revalidates', async () => {
  const fixture = fileURLToPath(new URL('./install-recovery-fixture.mjs', import.meta.url))
  const result = await promisify(execFile)(process.execPath, ['--experimental-vm-modules', fixture], { timeout: 30_000 })
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'passed')
  assert.equal(report.outcomes.length, 5)
  assert.equal(report.realDockerOrHttp, false)
})
test('file digest includes a partial final block and changes when its final byte changes', async () => {
  const root = await temporary(), file = path.join(root, 'owned-hash-boundary.bin')
  const bytes = Buffer.alloc(1024 * 1024 + 37, 7)
  try {
    await writeFile(file, bytes, { flag: 'wx' })
    assert.equal(await fileHash(file), hash(bytes))
    const original = await fileHash(file)
    bytes[bytes.length - 1] = 8
    await writeFile(file, bytes)
    assert.equal(await fileHash(file), hash(bytes))
    assert.notEqual(await fileHash(file), original)
  } finally {
    await unlink(file)
    await rmdir(root)
  }
})
test('failed health stops runtime before recovery; stop rejection never restarts or retries', async () => {
  for (const stopFails of [false, true]) {
    const journal = { actions: [] }, events = []
    let running = true
    await recoverFailedDeployment({ journal, failedAction: 'verify-health-and-ledger',
      persist: async () => { events.push('persist:' + journal.actions.at(-1).status) },
      stopRuntime: async () => {
        events.push('stop')
        if (stopFails) throw new Error('fixed fixture rejection')
        running = false
      },
      recoverPrevious: async () => {
        events.push('recover')
        assert.equal(running, false)
        throw new Error('incompatible fixture')
      } })
    assert.equal(journal.recovery.status, stopFails ? 'runtime-stop-failed' : 'stopped-restore-required')
    assert.equal(events.filter(value => value === 'stop').length, 1)
    assert.equal(events.includes('recover'), !stopFails)
    assert.equal(events[0], 'persist:intent')
    if (stopFails) {
      assert.equal(journal.actions.at(-1).failureCode, 'unknown')
      assert.equal(JSON.stringify(journal).includes('fixed fixture rejection'), false)
    }
  }
  const journal = { actions: [] }
  await recoverFailedDeployment({ journal, failedAction: 'complete-backup', stopRuntime: async () => assert.fail(),
    recoverPrevious: async () => { throw new Error('unverified original runtime') }, persist: async () => {} })
  assert.equal(journal.recovery.status, 'restore-required')
})
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
  const trace = commandFailure({ status: 1, stderr: `TypeError: ${secret} private-message
    at file:///private/root/node_modules/@workmesh/recovery/dist/src/postgres.js:71:13
    at file:///private/root/node_modules/@workmesh/recovery/dist/src/unknown.js:9:9`,
    stdout: `RECOVERY_S3_CONFIGURATION_REQUIRED ${secret}` })
  assert.deepEqual(trace.errorTypes, ['TypeError'])
  assert.deepEqual(trace.recoveryFrames, [{ file: 'src/postgres.js', line: 71, column: 13 }])
  assert.equal(trace.stdoutSha256, hash(Buffer.from(`RECOVERY_S3_CONFIGURATION_REQUIRED ${secret}`)))
  assert.ok(trace.stderrBytes > 0)
  for (const value of [secret, 'private-message', '/private/root', 'unknown.js']) assert.equal(JSON.stringify(trace).includes(value), false)
  const database = commandFailure({ stderr: `error: Connection terminated unexpectedly ${secret}
    at /private/root/node_modules/pg/lib/client.js:12:9
    code: '57P05'` })
  assert.deepEqual(database.errorTypes, ['error'])
  assert.deepEqual(database.postgresCodes, ['57P05'])
  assert.deepEqual(database.databaseFrames, [{ file: 'pg/lib/client.js', line: 12, column: 9 }])
  assert.equal(JSON.stringify(database).includes(secret), false)
  assert.equal(JSON.stringify(database).includes('/private/root'), false)
  assert.deepEqual(commandFailure({ stderr: "code: '11111'" }).postgresCodes, [])
  const mcp = commandFailure({ stderr: `Error [ERR_INVALID_STATE]: ${secret}
    at file:///app/dist/http.js:88:7
    at file:///app/node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js:41:2` })
  assert.deepEqual(mcp.mcpFrames, [{ file: 'mcp/http.js', line: 88, column: 7 }])
  assert.deepEqual(mcp.transportFrames, [{ file: 'sdk/server/webStandardStreamableHttp.js', line: 41, column: 2 }])
  assert.ok(mcp.recoveryCodes.includes('ERR_INVALID_STATE'))
  assert.equal(JSON.stringify(mcp).includes(secret), false)
  assert.equal(JSON.stringify(mcp).includes('/app/'), false)
  const info = { Id: 'sha256:' + 'a'.repeat(64), Config: { Env: [secret], Labels: { 'com.docker.compose.service': secret } },
    State: { Status: 'exited', ExitCode: 1, OOMKilled: true, Health: { Status: 'unhealthy', Log: [{ ExitCode: 1, Output: secret }] } }, RestartCount: 2 }
  const status = containerStatus(info)
  assert.equal(status.service, 'unknown')
  assert.equal(status.oom, true)
  assert.equal(status.probes[0].outputSha256, hash(Buffer.from(secret)))
  assert.equal(JSON.stringify(status).includes(secret), false)
  const probe = containerStatus({ ...info, State: { ...info.State, Health: { ...info.State.Health,
    Log: [{ ExitCode: -1, Output: `OCI runtime exec failed: unable to start container process: Resource temporarily unavailable ${secret}` }] } } })
  assert.ok(probe.probes[0].failure.categories.includes('execRuntimeRejected'))
  assert.ok(probe.probes[0].failure.categories.includes('resourceUnavailable'))
  assert.equal(JSON.stringify(probe).includes(secret), false)
})
test('wrongArchitectureRejectedBeforeMutation and strict closed manifest schema', () => {
  for (const mutate of [m => { m.arch = 'x64' }, m => { m.images.mcp.revision = 'b'.repeat(40) },
    m => { m.extra = true }, m => { m.files[0].path = '../configuration' }, m => { m.installerImage = m.images.redis.id },
    m => { m.images.runner = m.images.api }, m => { m.migrationLedger.push({ ...ledger[0] }) }]) {
    const invalid = manifest(); mutate(invalid); assert.throws(() => validateManifest(invalid), /INSTALL_/)
  }
})

test('deferredServerPlatformsRejectedBeforeBuildAndHistoricalManifestsRemainReadable', async () => {
  assert.doesNotThrow(() => assertSupportedArchitecture('amd64'))
  const historical = manifest(); historical.arch = 'arm64'
  assert.equal(validateManifest(historical).arch, 'arm64')
  for (const arch of ['arm64', '386', 'x64', 'win32', undefined])
    assert.throws(() => assertSupportedArchitecture(arch), /INSTALL_UNSUPPORTED_PLATFORM/)
  // No git or Docker is available: rejection must precede either subprocess and
  // any output directory creation, even in this dirty source checkout.
  await assert.rejects(promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('./build.mjs', import.meta.url)), '--arch', 'arm64', '--release', 'deferred', '--output', 'must-not-create-arm'],
    { env: { ...process.env, PATH: '' } }), error => /INSTALL_UNSUPPORTED_PLATFORM/.test(error.stderr))
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
  const live = []
  try {
    for (const entry of [...m.files, ...m.chunks, ...m.bootstrapChunks]) {
      await writeFile(path.join(directory, entry.path), entry.path.endsWith('main.tarpart') ? 'main' : entry.path.endsWith('helper.tarpart') ? 'helper' : entry.path)
      live.push(entry.path)
    }
    const bytes = Buffer.from(JSON.stringify(m)), digest = hash(bytes)
    await writeFile(path.join(directory, 'manifest.json'), bytes); live.push('manifest.json')
    assert.deepEqual(await verifyBundle(directory, digest), m)
    await writeFile(path.join(directory, m.chunks[0].path), 'evil')
    await assert.rejects(verifyBundle(directory, digest), /INSTALL_FILE_DIGEST_MISMATCH/)
    await assert.rejects(verifyBundle(directory, 'f'.repeat(64)), /INSTALL_MANIFEST_DIGEST_MISMATCH/)
  } finally {
    for (const file of live.reverse()) await unlink(path.join(directory, file))
    await rmdir(path.join(directory, 'chunks')); await rmdir(directory)
  }
})

test('parallel closure checks every group and partial tail before continuing and rejects missing files', async () => {
  const directory = await temporary(), m = manifest(), live = []
  const payloads = new Map(m.files.map(entry => [entry.path, Buffer.from(entry.path)]))
  payloads.set('chunks/main.tarpart', Buffer.alloc(3 * 1024 * 1024 + 17, 7))
  payloads.set('chunks/second.tarpart', Buffer.alloc(2 * 1024 * 1024 + 29, 9))
  payloads.set('chunks/helper.tarpart', Buffer.from('synthetic helper'))
  const describe = file => ({ path: file, bytes: payloads.get(file).length, sha256: hash(payloads.get(file)) })
  m.chunks = ['chunks/main.tarpart', 'chunks/second.tarpart'].map(describe)
  m.bootstrapChunks = [describe('chunks/helper.tarpart')]
  await mkdir(path.join(directory, 'chunks'))
  try {
    for (const [file, bytes] of payloads) { await writeFile(path.join(directory, file), bytes, { flag: 'wx' }); live.push(file) }
    const bytes = Buffer.from(JSON.stringify(m)), digest = hash(bytes)
    await writeFile(path.join(directory, 'manifest.json'), bytes, { flag: 'wx' }); live.push('manifest.json')
    assert.deepEqual(await verifyBundle(directory, digest), m)
    const damaged = Buffer.from(payloads.get('chunks/second.tarpart')); damaged[damaged.length - 1] ^= 1
    await writeFile(path.join(directory, 'chunks/second.tarpart'), damaged)
    let continued = false
    await assert.rejects(async () => { await verifyBundle(directory, digest); continued = true }, /INSTALL_FILE_DIGEST_MISMATCH/)
    assert.equal(continued, false)
    await writeFile(path.join(directory, 'chunks/second.tarpart'), payloads.get('chunks/second.tarpart'))
    await unlink(path.join(directory, 'chunks/helper.tarpart')); live.splice(live.indexOf('chunks/helper.tarpart'), 1)
    await assert.rejects(async () => { await verifyBundle(directory, digest); continued = true }, /ENOENT/)
    assert.equal(continued, false)
  } finally {
    for (const file of live.reverse()) await unlink(path.join(directory, file))
    await rmdir(path.join(directory, 'chunks')); await rmdir(directory)
  }
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

test('version changes preserve existing volumes, data namespace and cryptographic identity', () => {
  const document = () => ({ services: {
    api: { environment: Object.fromEntries(['DATABASE_URL', 'WORKMESH_MASTER_KEY', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'AUTH_RATE_LIMIT_HMAC_KEY'].map(name => [name, name + '-original'])) },
    postgres: { volumes: [{ type: 'volume', source: 'pg', target: '/var/lib/postgresql/data' }] },
    redis: { volumes: [{ type: 'volume', source: 'redis', target: '/data' }] },
    minio: { volumes: [{ type: 'volume', source: 's3', target: '/data' }] },
  }, volumes: { pg: { name: 'original-pg' }, redis: { name: 'original-redis' }, s3: { name: 'original-s3' } } })
  const options = { previousProfile: 'personal', nextProfile: 'personal', previousBackupKey: 'original-key', nextBackupKey: 'original-key' }
  const previous = document(), next = document()
  next.services.api.environment.WEB_ORIGIN = 'https://new-proxy.example.test'
  assertStableDataBindings(previous, next, options)
  assert.throws(() => assertStableDataBindings(previous, next, { ...options, nextProfile: 'team' }), /INSTALL_PROFILE_CHANGE_REQUIRES_MIGRATION/)
  for (const name of Object.keys(previous.services.api.environment)) {
    const changed = document(); changed.services.api.environment[name] = 'new-value'
    assert.throws(() => assertStableDataBindings(previous, changed, options), /INSTALL_DATA_BINDINGS_CHANGED/)
  }
  const renamed = document(); renamed.volumes.pg.name = 'other-pg'
  assert.throws(() => assertStableDataBindings(previous, renamed, options), /INSTALL_DATA_BINDINGS_CHANGED/)
  const invalid = document(); invalid.services.minio.volumes[0].read_only = true
  assert.throws(() => assertStableDataBindings(previous, invalid, options), /INSTALL_DATA_BINDINGS_INVALID/)
  const prefix = document(); prefix.services.api.environment.AUTH_RATE_LIMIT_REDIS_PREFIX = 'new-budget'
  assert.throws(() => assertStableDataBindings(previous, prefix, options), /INSTALL_DATA_BINDINGS_CHANGED/)
  assert.throws(() => assertStableDataBindings(previous, next, { ...options, nextBackupKey: 'new-key' }), /INSTALL_DATA_BINDINGS_CHANGED/)
})

test('business MCP read selects its unique response and ignores preceding SSE notifications', () => {
  const secret = 'wmi_' + 'x'.repeat(43)
  const reply = { jsonrpc: '2.0', id: 2, result: { structuredContent: { data: { id: 'authorized-item' } } } }
  const notification = { jsonrpc: '2.0', method: 'notifications/tools/list_changed' }
  const sse = `: keep-alive\r\n\r\nevent: message\r\ndata: ${JSON.stringify(notification)}\r\n\r\nevent: message\r\ndata: ${JSON.stringify(reply)}\r\n\r\n`
  assert.deepEqual(readMcpReply(sse, 2, 'text/event-stream'), reply)
  assert.deepEqual(readMcpReply(JSON.stringify(reply), 2, 'application/json'), reply)
  assert.deepEqual(readMcpReply(`data: {"jsonrpc":"2.0",\ndata: "id":2,"result":{}}\n\n`, 2, 'text/event-stream'), { jsonrpc: '2.0', id: 2, result: {} })
  assert.throws(() => readMcpReply(sse, 3, 'text/event-stream'), /INSTALL_BUSINESS_VALIDATION_FAILED/)
  assert.throws(() => readMcpReply(sse + `data: ${JSON.stringify(reply)}\n\n`, 2, 'text/event-stream'), /INSTALL_BUSINESS_VALIDATION_FAILED/)
  assert.throws(() => readMcpReply('{malformed', 2, 'application/json'))
  const status = mcpReplyStatus({ error: { code: -32603, message: secret }, result: { isError: true, structuredContent: { error: { code: secret, message: secret } } } })
  assert.deepEqual(status, { rpcError: -32603, toolError: true, toolCode: 'unknown' })
  assert.equal(JSON.stringify(status).includes(secret), false)
})
