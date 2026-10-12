import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, chmodSync, realpathSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative } from 'node:path'
import net from 'node:net'

// Exercise the real --env-file entrypoint without publishing to GHCR. A test-only
// Docker shim maps one unique GHCR namespace to this loopback registry. Docker
// pull, digest inspection, save/load and the API/worker/MCP deployment are real.
if (process.platform !== 'linux') throw Error('Cold registry deployment rehearsal requires the Linux Docker CI host')
const root = resolve(import.meta.dirname, '..')
const runId = `workmesh-cold-${randomUUID().slice(0, 8)}`
const evidence = resolve(root, process.env.WORKMESH_VALIDATION_OUTPUT ?? 'docs/reviews/backend-retirement/runs', runId)
const images = JSON.parse(process.env.WORKMESH_COLD_SOURCE_IMAGES ?? 'null')
if (!images || ['api', 'worker', 'mcp'].some(name => !images[name])) throw Error('Exact private production source images required')
const { mkdirSync } = await import('node:fs'); mkdirSync(evidence, { recursive: true })
const directory = mkdtempSync(join(tmpdir(), `${runId}-`))
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const realDocker = spawnSync('which', ['docker'], { encoding: 'utf8' }).stdout.trim()
const server = net.createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done))
const port = server.address().port; await new Promise(done => server.close(done))
const registry = `127.0.0.1:${port}`
const ghcrPrefix = `ghcr.io/${runId}/`
const receipt = { runId, sha, transport: 'private loopback registry; test-only GHCR namespace mapping; no external publish',
  directory, registry, ghcrPrefix, results: [], images: [], cleanup: [], outcome: '未运行' }
const save = () => writeFileSync(join(evidence, 'receipts.json'), JSON.stringify(receipt, null, 2))
const command = (args, env = process.env, executable = realDocker) => {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
  const log = `${receipt.results.length}.log`; writeFileSync(join(evidence, log), `${result.stdout ?? ''}${result.stderr ?? ''}`)
  receipt.results.push({ executable, args, code: result.status, log }); save()
  return result
}
const must = (args, env, executable) => { const result = command(args, env, executable); if (result.status !== 0) throw Error(`Cold registry command failed: ${args[0]}`); return result.stdout.trim() }
const absent = (result, kind) => result.status !== 0 && new RegExp(`no such (?:object|${kind})|not found`, 'i').test(`${result.stdout}${result.stderr}`)
let containerId, volumeCreated = false
const volume = `${runId}-registry`
const mappedReferences = []
try {
  // Task-specific names are checked before creating anything; shared base images
  // are borrowed and are never removed by this test.
  if (must(['ps', '-aq', '--filter', `name=^/${runId}$`])) throw Error('Registry name already used')
  if (!absent(command(['volume', 'inspect', volume]), 'volume')) throw Error('Registry volume absence unconfirmed')
  must(['pull', 'registry:2.8.3'])
  must(['volume', 'create', '--label', `workmesh.task=${runId}`, volume]); volumeCreated = true
  containerId = must(['run', '-d', '--name', runId, '--label', `workmesh.task=${runId}`,
    '-p', `127.0.0.1:${port}:5000`, '--mount', `type=volume,source=${volume},target=/var/lib/registry`, 'registry:2.8.3'])
  receipt.containerId = containerId; receipt.volume = volume; save()
  let ready = false
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`http://${registry}/v2/`)).status === 200) { ready = true; break } } catch { /* bounded startup polling */ }
    await new Promise(done => setTimeout(done, 100))
  }
  if (!ready) throw Error('Private registry not ready')
  const environment = []
  for (const name of ['api', 'worker', 'mcp']) {
    const tag = `${registry}/workmesh-${name}:${sha}`
    if (command(['image', 'inspect', tag]).status === 0) throw Error('Private registry tag already cached')
    must(['tag', images[name], tag]); mappedReferences.push(tag)
    must(['push', tag])
    const manifest = await fetch(`http://${registry}/v2/workmesh-${name}/manifests/${sha}`, {
      headers: { accept: 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json' } })
    const digest = manifest.headers.get('docker-content-digest')
    if (!manifest.ok || !/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) throw Error('Registry manifest digest missing')
    const local = `${registry}/workmesh-${name}@${digest}`
    const sourceId = must(['image', 'inspect', '--format', '{{.Id}}', images[name]])
    must(['image', 'rm', tag]); mappedReferences.splice(mappedReferences.indexOf(tag), 1)
    if (command(['image', 'inspect', local]).status === 0) throw Error('Exact registry reference must be absent before cold-cache validation')
    const supplied = `${ghcrPrefix}workmesh-${name}@${digest}`
    environment.push(`WORKMESH_${name.toUpperCase()}_IMAGE=${supplied}`)
    receipt.images.push({ name, supplied, local, sourceId, digest, coldReferenceAbsent: true }); save()
    mappedReferences.push(local)
  }
  const shimDirectory = join(directory, 'bin'); mkdirSync(shimDirectory)
  const audit = join(evidence, 'docker-mapping.jsonl')
  const shim = `#!${process.execPath}\nimport {spawnSync} from 'node:child_process';import {appendFileSync} from 'node:fs';\nconst from=${JSON.stringify(ghcrPrefix)},to=${JSON.stringify(`${registry}/`)};const original=process.argv.slice(2);const map=x=>x.startsWith(from)?to+x.slice(from.length):x;const args=original.map(map);const env={...process.env};for(const name of ['API','WORKER','MCP']){const key='WORKMESH_'+name+'_IMAGE';if(env[key])env[key]=map(env[key])}appendFileSync(${JSON.stringify(audit)},JSON.stringify({verb:original[0],references:original.filter(x=>x.startsWith(from)),mapped:args.filter(x=>x.startsWith(to))})+'\\n');const result=spawnSync(${JSON.stringify(realDocker)},args,{env,stdio:'inherit'});process.exit(result.status??1);\n`
  writeFileSync(join(shimDirectory, 'docker'), shim); chmodSync(join(shimDirectory, 'docker'), 0o700)
  const envFile = join(directory, 'production.env'); writeFileSync(envFile, `${environment.join('\n')}\n`, { mode: 0o600 })
  const childEnvironment = { ...process.env, PATH: `${shimDirectory}:${process.env.PATH}` }
  for (const name of ['API', 'WORKER', 'MCP']) delete childEnvironment[`WORKMESH_${name}_IMAGE`]
  must([resolve(root, 'scripts/validate-production-images.mjs'), `--env-file=${envFile}`], childEnvironment, process.execPath)
  const calls = readFileSync(audit, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  for (const image of receipt.images) {
    if (!calls.some(call => call.verb === 'pull' && call.references.includes(image.supplied))) throw Error('Exact reference did not pass through Docker pull')
    if (must(['image', 'inspect', '--format', '{{.Id}}', image.local]) !== image.sourceId) throw Error('Pulled image identity changed')
    image.pulledIdMatches = true
  }
  receipt.outcome = '冷引用缓存 --env-file、准确摘要拉取、真实 API/worker/MCP 部署通过'; save()
} catch (error) { receipt.outcome = `失败：${error.message}`; save(); process.exitCode = 1 }
finally {
  // Remove only aliases in this run's loopback namespace, never source images.
  for (const reference of mappedReferences) {
    const inspection = command(['image', 'inspect', '--format', '{{.Id}}', reference])
    if (absent(inspection, 'image')) { receipt.cleanup.push({ type: 'image-alias', reference, absent: true, removed: false, reason: '引用尚未拉取或已不存在' }); continue }
    const expected = receipt.images.find(image => image.local === reference)
    if (inspection.status !== 0 || (expected && inspection.stdout.trim() !== expected.sourceId)) throw Error('Private image alias identity unconfirmed')
    const result = command(['image', 'rm', reference]); receipt.cleanup.push({ type: 'image-alias', reference, code: result.status })
    if (result.status !== 0) process.exitCode = 1
  }
  if (containerId) {
    if (must(['inspect', '--format', '{{ index .Config.Labels "workmesh.task" }}', containerId]) !== runId) throw Error('Registry owner changed')
    must(['logs', containerId]); const result = command(['rm', '-f', containerId])
    const gone = absent(command(['inspect', containerId]), 'container')
    receipt.cleanup.push({ type: 'container', id: containerId, code: result.status, absent: gone })
    if (!gone) process.exitCode = 1
    if (result.status !== 0) process.exitCode = 1
  }
  if (volumeCreated) {
    if (must(['volume', 'inspect', '--format', '{{ index .Labels "workmesh.task" }}', volume]) !== runId
      || must(['ps', '-aq', '--filter', `volume=${volume}`])) throw Error('Registry volume still referenced or owner changed')
    const result = command(['volume', 'rm', volume]); const gone = absent(command(['volume', 'inspect', volume]), 'volume')
    receipt.cleanup.push({ type: 'volume', name: volume, code: result.status, absent: gone })
    if (!gone) process.exitCode = 1
    if (result.status !== 0) process.exitCode = 1
  }
  if (!relative(realpathSync(tmpdir()), realpathSync(directory)).startsWith(`${runId}-`)) throw Error('Private directory boundary mismatch')
  rmSync(directory, { recursive: true }); receipt.cleanup.push({ type: 'directory', path: directory, removed: true }); save()
  console.log(JSON.stringify({ evidence, outcome: receipt.outcome }))
}
