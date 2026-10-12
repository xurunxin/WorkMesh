import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const owner = `workmesh-docs-${randomUUID()}`
const output = resolve(process.env.WORKMESH_DOCS_EVIDENCE_DIR ?? resolve(root, '.tmp', owner))
mkdirSync(output, { recursive: true })
const pnpm = process.env.npm_execpath
assert.ok(pnpm && pnpm.endsWith('pnpm.cjs'), '从 pnpm verify:integration-examples 启动')
assert.equal(process.version, 'v22.19.0', '使用仓库锁定的 Node')
const pnpmVersion = execFileSync(process.execPath, [pnpm, '--version'], { encoding: 'utf8' }).trim()
assert.equal(pnpmVersion, '9.15.4', '使用仓库锁定的 pnpm')
const required = process.argv.includes('--required-checks')
const integration = process.argv.includes('--integration-checks')
const recovery = process.argv.includes('--recovery-checks')
const env = { ...process.env }
// 测试只消费本次生成的秘密与配置，不继承真实部署能力或凭据。
for (const key of Object.keys(env)) if (/^(WORKMESH_|AUTH_RATE_LIMIT_|S3_|SESSION_|PAGINATION_|RECOVERY_|RUN_RECOVERY_|M5_|DATABASE_URL$|REDIS_URL$|SEED_)/.test(key)) delete env[key]
const secret = () => randomBytes(32).toString('hex')
const pgPassword = secret(), s3Password = secret()
Object.assign(env, { RUN_INTEGRATION: '1', SESSION_SECRET: secret(), WORKMESH_MASTER_KEY: secret(),
  WORKMESH_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
  WORKMESH_RUNNER_SERVICE_TOKEN: secret(), WORKMESH_BETA_COORDINATION_MCP: 'false',
  WEB_ORIGIN: 'http://localhost:3001', SESSION_COOKIE_SECURE: 'false', NODE_ENV: 'test',
  RUN_WORKBENCH_LIVE: '0',
  NODE_EXTRA_CA_CERTS: resolve(root, 'packages/conformance/src/fixtures/model-test-ca.pem'),
  AUTH_RATE_LIMIT_ENDPOINT_BURST: '10000', AUTH_RATE_LIMIT_SOCKET_BURST: '10000',
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: '10000', AUTH_RATE_LIMIT_SUBJECT_BURST: '1000', AUTH_RATE_LIMIT_INSTALL_BURST: '100',
  WORKMESH_M4_EVIDENCE_ROOT: resolve(output, 'mcp'), WORKMESH_M1_EVIDENCE_ROOT: resolve(output, 'execution'),
  WORKMESH_M2_EVIDENCE_ROOT: resolve(output, 'planning'), WORKMESH_M3_EVIDENCE_ROOT: resolve(output, 'delivery'),
  WORKMESH_M5_EVIDENCE_ROOT: resolve(output, 'joint'),
  M5_EVIDENCE_ROOT: resolve(output, 'joint'),
  M5_RUNTIME_RECOVERY_ROOT: resolve(output, 'native-recovery'),
  WORKMESH_DELIVERY_EVIDENCE_ROOT: resolve(output, 'delivery'),
  WORKMESH_OPTIONAL_EVIDENCE_ROOT: resolve(output, 'optional'),
})
const secrets = [pgPassword, s3Password, env.SESSION_SECRET, env.WORKMESH_MASTER_KEY, env.WORKMESH_BOOTSTRAP_TOKEN, env.WORKMESH_RUNNER_SERVICE_TOKEN]
const sanitize = value => secrets.reduce((text, item) => text.split(item).join('[test-secret]'), value)
  .replace(/\bwm[ips]_[A-Za-z0-9_-]{43}\b/g, '[credential]')
const docker = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim()
const containers = [], volumes = [], checks = [], cleanup = []
const save = () => writeFileSync(resolve(output, 'results.json'), JSON.stringify({ owner, sourceHead: head,
  sourceBinding: '运行时使用当前工作树，文件哈希另由交付记录绑定',
  node: process.version, pnpm: pnpmVersion, platform: process.platform, containers, volumes, checks, cleanup }, null, 2) + '\n')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const create = (name, image, port, args, target) => {
  docker(['image', 'inspect', image, '--format', '{{.Id}}'])
  const mount = `${owner}-${name}-data`
  docker(['volume', 'create', '--label', `workmesh.docs.owner=${owner}`, mount]); volumes.push(mount); save()
  const id = docker(['create', '--name', `${owner}-${name}`, '--label', `workmesh.docs.owner=${owner}`,
    '-p', `127.0.0.1::${port}`, '--mount', `type=volume,src=${mount},dst=${target}`, ...args, image])
  containers.push({ name, id, image }); save()
  docker(['start', id])
  const hostPort = docker(['inspect', '--format', `{{(index (index .NetworkSettings.Ports "${port}/tcp") 0).HostPort}}`, id])
  return { id, hostPort }
}
const wait = async check => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if (await check()) return } catch { /* 启动中，尚未准入。 */ }
    await new Promise(done => setTimeout(done, 1000))
  }
  throw new Error('独有测试服务未 ready')
}
const run = async (label, args) => {
  const begin = new Date().toISOString()
  const child = spawn(process.execPath, [pnpm, ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
  child.stdout.on('data', bytes => { log += bytes.toString() })
  child.stderr.on('data', bytes => { log += bytes.toString() })
  const exitCode = await new Promise((done, reject) => { child.on('error', reject); child.on('close', done) })
  const safe = sanitize(log)
  writeFileSync(resolve(output, `${label}.log`), safe.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, ''))
  checks.push({ label, command: `pnpm ${args.join(' ')}`, startedAt: begin, endedAt: new Date().toISOString(), exitCode }); save()
  console.log(`${label}: exit=${exitCode}`)
  if (exitCode !== 0) { console.error(safe.slice(-8000)); throw new Error(`${label} failed`) }
}
try {
  const pg = create('pg', 'postgres:16.9-alpine', 5432, ['-e', 'POSTGRES_USER=workmesh', '-e', `POSTGRES_PASSWORD=${pgPassword}`, '-e', `POSTGRES_DB=workmesh_docs_${owner.slice(-12).replaceAll('-', '')}_test`], '/var/lib/postgresql/data')
  const redis = create('redis', 'redis:7.4.5-alpine', 6379, [], '/data')
  env.DATABASE_URL = `postgres://workmesh:${pgPassword}@127.0.0.1:${pg.hostPort}/workmesh_docs_${owner.slice(-12).replaceAll('-', '')}_test`
  env.REDIS_URL = `redis://127.0.0.1:${redis.hostPort}`
  await wait(() => docker(['exec', pg.id, 'pg_isready', '-U', 'workmesh']).includes('accepting connections'))
  await wait(() => docker(['exec', redis.id, 'redis-cli', 'ping']) === 'PONG')
  await run('examples', ['-C', 'packages/conformance', 'exec', 'tsx', 'examples/verify-integration.ts'])
  if (required || integration || recovery) {
    const s3 = create('s3', 'rustfs/rustfs:1.0.0', 9000, ['-e', 'RUSTFS_ACCESS_KEY=workmesh', '-e', `RUSTFS_SECRET_KEY=${s3Password}`], '/data')
    env.S3_ENDPOINT = `http://127.0.0.1:${s3.hostPort}`
    env.S3_BUCKET = 'workmesh-artifacts'; env.S3_REGION = 'us-east-1'; env.S3_ACCESS_KEY_ID = 'workmesh'
    env.S3_SECRET_ACCESS_KEY = s3Password; env.S3_FORCE_PATH_STYLE = 'true'
    await wait(async () => (await fetch(env.S3_ENDPOINT + '/health/ready')).ok)
    await run('artifact-bucket', ['-C', 'packages/artifact-storage', 'exec', 'node', '--input-type=module', '-e',
      'import {S3Client,CreateBucketCommand,HeadBucketCommand} from "@aws-sdk/client-s3"; const c=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY}}); await c.send(new CreateBucketCommand({Bucket:process.env.S3_BUCKET})); await c.send(new HeadBucketCommand({Bucket:process.env.S3_BUCKET})); c.destroy(); console.log("owned artifact bucket ready");'])
    if (recovery) {
      const suffix = owner.slice(-12)
      const source = `workmesh_docs_source_${suffix}_test`, target = `workmesh_docs_target_${suffix}_test`
      docker(['exec', pg.id, 'createdb', '-U', 'workmesh', source]); docker(['exec', pg.id, 'createdb', '-U', 'workmesh', target])
      Object.assign(env, { RUN_RECOVERY_INTEGRATION: '1', RECOVERY_TEST_SUFFIX: suffix,
        RECOVERY_SOURCE_DATABASE_URL: `postgres://workmesh:${pgPassword}@127.0.0.1:${pg.hostPort}/${source}`,
        RECOVERY_TARGET_DATABASE_URL: `postgres://workmesh:${pgPassword}@127.0.0.1:${pg.hostPort}/${target}`,
        RECOVERY_TEST_S3_ENDPOINT: env.S3_ENDPOINT, RECOVERY_TEST_S3_ACCESS_KEY_ID: 'workmesh',
        RECOVERY_TEST_S3_SECRET_ACCESS_KEY: s3Password, WORKMESH_POSTGRES_TOOL_CONTAINER: pg.id,
      })
    }
    const commands = recovery ? ['test:integration:recovery'] : required ? ['lint', 'typecheck', 'test', 'test:integration', 'test:conformance'] : ['test:integration', 'test:conformance']
    for (const command of commands) await run(command.replaceAll(':', '-'), [command])
  }
} finally {
  // 首个身份不符或删除失败即停止，不改用强制删除。
  for (const container of [...containers].reverse()) {
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "workmesh.docs.owner"}}', container.id]), owner)
    docker(['stop', '--time', '35', container.id]); docker(['rm', container.id])
    const exists = docker(['ps', '-a', '-q', '--no-trunc', '--filter', `id=${container.id}`])
    assert.equal(exists, '')
    cleanup.push({ kind: 'container', id: container.id, absent: true }); save()
  }
  for (const volume of volumes) {
    assert.equal(docker(['volume', 'inspect', '--format', '{{index .Labels "workmesh.docs.owner"}}', volume]), owner)
    assert.equal(docker(['ps', '-a', '-q', '--filter', `volume=${volume}`]), '')
    docker(['volume', 'rm', volume])
    assert.equal(docker(['volume', 'ls', '-q', '--filter', `name=^${volume}$`]), '')
    cleanup.push({ kind: 'volume', name: volume, absent: true }); save()
  }
  console.log(`本轮脱敏记录：${output}`)
}
