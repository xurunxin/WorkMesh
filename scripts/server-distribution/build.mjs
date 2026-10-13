import { execFileSync, spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileHash, hash, validateManifest, fail } from './manifest.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', ...options }).trim()
const option = name => { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1] }
const output = option('output'), release = option('release'), arch = option('arch')
if (!output || !release || !['amd64', 'arm64'].includes(arch)) fail('BUILD_ARGUMENTS_REQUIRED')
if (run('git', ['status', '--porcelain'])) fail('BUILD_CLEAN_COMMITTED_SOURCE_REQUIRED')
const source = { commit: run('git', ['rev-parse', 'HEAD']), tree: run('git', ['rev-parse', 'HEAD^{tree}']) }
const runtimeFingerprint = hash(execFileSync('git', ['ls-tree', '-r', '-z', source.commit,
  'apps', 'packages', 'skills', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json',
  '.node-version', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md',
  'infra/docker/api.production.Dockerfile', 'infra/docker/worker.production.Dockerfile', 'infra/docker/mcp.production.Dockerfile',
  'infra/docker/lite.Dockerfile', 'infra/docker/runtime-guard.mjs', 'infra/docker/prepare-production-deploy.mjs', 'infra/docker/healthcheck.mjs',
  'infra/docker/entrypoint.sh', 'infra/docker/lite-entrypoint.sh', 'infra/docker/lite-dispatch.mjs'], { cwd: root }))
if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(release)) fail('BUILD_RELEASE_INVALID')
const hostArch = run('docker', ['info', '--format', '{{.Architecture}}'])
if ((arch === 'amd64' ? 'x86_64' : 'aarch64') !== hostArch) fail('BUILD_NATIVE_ARCH_REQUIRED')
const directory = path.resolve(output)
await mkdir(directory, { recursive: false, mode: 0o700 })
await mkdir(path.join(directory, 'chunks'), { mode: 0o700 })
const images = {}
async function buildImage(args) {
  const archived = spawn('git', ['-c', 'core.autocrlf=false', 'archive', '--format=tar', source.commit,
    '.dockerignore', '.node-version', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json',
    'tsconfig.base.json', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'README.md', 'AGENTS.md', 'CONTEXT.md',
    'apps', 'packages', 'scripts', 'skills', 'infra'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
  const build = spawn('docker', [...args, '-'], { cwd: root, stdio: ['pipe', 'inherit', 'inherit'] })
  const done = process => new Promise((resolve, reject) => {
    process.once('error', reject); process.once('exit', code => resolve(code))
  })
  const codes = Promise.all([done(archived), done(build)])
  archived.stdout.pipe(build.stdin)
  build.stdin.on('error', () => { archived.kill() })
  if ((await codes).some(code => code !== 0)) fail('BUILD_IMMUTABLE_CONTEXT_FAILED')
}
for (const role of ['api', 'worker', 'mcp', 'lite', 'installer']) {
  const reference = `workmesh-server/${role}:${release}-${arch}`
  const dockerfile = role === 'lite' ? 'infra/docker/lite.Dockerfile' : `infra/docker/${role === 'installer' ? 'server-installer' : role + '.production'}.Dockerfile`
  await buildImage(['build', '--platform', `linux/${arch}`, '--build-arg', `WORKMESH_BUILD_SHA=${source.commit}`,
    ...(role === 'installer' ? ['--build-arg', `WORKMESH_API_IMAGE=${images.api.reference}`] : []),
    '-f', dockerfile, '-t', reference])
  const info = JSON.parse(run('docker', ['image', 'inspect', reference]))[0]
  if (info.Architecture !== arch || info.Config.Labels?.['org.opencontainers.image.revision'] !== source.commit) fail('BUILD_IMAGE_SOURCE_MISMATCH')
  images[role] = { reference, id: info.Id, revision: source.commit }
}
for (const [role, reference] of Object.entries({ postgres: 'postgres:16.9-alpine', redis: 'redis:7.4.5-alpine', minio: 'rustfs/rustfs:1.0.0' })) {
  run('docker', ['pull', '--platform', `linux/${arch}`, reference], { stdio: 'inherit' })
  const info = JSON.parse(run('docker', ['image', 'inspect', reference]))[0]
  if (info.Architecture !== arch) fail('BUILD_DEPENDENCY_ARCH_MISMATCH')
  images[role] = { reference, id: info.Id, revision: info.Config.Labels?.['org.opencontainers.image.revision'] ?? '' }
}
const archive = async references => {
  const child = spawn('docker', ['save', ...references], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('BUILD_SAVE_FAILED')))
  })
  let pending = Buffer.alloc(0)
  const entries = []
  const emit = async bytes => {
    const sha256 = hash(bytes), relative = `chunks/${sha256}.tarpart`
    try { await writeFile(path.join(directory, relative), bytes, { flag: 'wx', mode: 0o600 }) }
    catch (error) { if (error.code !== 'EEXIST' || await fileHash(path.join(directory, relative)) !== sha256) throw error }
    entries.push({ path: relative, sha256, bytes: bytes.length })
  }
  for await (const bytes of child.stdout) {
    pending = Buffer.concat([pending, bytes])
    while (pending.length >= 48 * 1024 * 1024) {
      await emit(pending.subarray(0, 48 * 1024 * 1024)); pending = pending.subarray(48 * 1024 * 1024)
    }
  }
  if (pending.length) await emit(pending)
  await completed
  return entries
}
const bootstrapChunks = await archive([images.installer.id])
const chunks = await archive([...new Set(Object.values(images).filter(image => image.id !== images.installer.id).map(image => image.id))])
const files = []
for (const relative of ['docker-compose.lite.yml', 'docker-compose.production.yml', 'install.sh', 'config.example.json']) {
  const from = ['install.sh', 'config.example.json'].includes(relative) ? path.join(root, 'scripts/server-distribution', relative) : path.join(root, relative)
  // Normalize shell/Compose delivery rather than depending on the producer OS checkout EOL.
  const bytes = Buffer.from((await readFile(from, 'utf8')).replace(/\r\n/g, '\n'))
  await writeFile(path.join(directory, relative), bytes, { mode: 0o600 })
  files.push({ path: relative, sha256: hash(bytes), bytes: bytes.length })
}
const rawLedger = run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', images.api.id, '--input-type=module', '-e',
  "const m=await import('./node_modules/@workmesh/db/dist/src/migration-manifest.js').catch(()=>import('./node_modules/@workmesh/db/dist/migration-manifest.js'));console.log(JSON.stringify(m.v1MigrationManifest.map(({version,checksumSha256})=>({version,checksumSha256}))))"])
const versions = run('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'sh', images.installer.id,
  '-ec', 'node --version; docker --version; docker compose version; pg_dump --version; pg_restore --version']).split('\n')
if (versions.length !== 5) fail('BUILD_TOOL_INVENTORY_INVALID')
const [installerNode, installerDocker, installerCompose, pgDump, pgRestore] = versions
const tools = { producerNode: process.version, producerDocker: run('docker', ['--version']), installerNode, installerDocker, installerCompose, pgDump, pgRestore }
const manifest = validateManifest({ format: 'workmesh-server-distribution', release, arch, source, images,
  installerImage: images.installer.id, files, chunks, bootstrapChunks, migrationLedger: JSON.parse(rawLedger), tools, runtimeFingerprint })
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify({ status: 'built', source, manifestSha256: await fileHash(path.join(directory, 'manifest.json')), output: directory }))
