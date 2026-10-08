import { spawn, execFileSync } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const mode = process.argv[2] ?? 'focused'
const attempt = process.argv[3] ?? `${mode}-${Date.now()}`
if (!/^[a-z0-9-]+$/.test(attempt)) throw new Error('验证目录标识无效')
const evidence = resolve(root, 'docs/reviews/b1-b2/evidence', attempt)
mkdirSync(evidence, { recursive: true })
const logRoot = join(evidence, 'logs'); mkdirSync(logRoot, { recursive: true })
const env = { ...process.env }
const secrets = []
const random = (n = 32) => { const value = randomBytes(n).toString('hex'); secrets.push(value); return value }
const results = [], resources = [], processes = []
let activeChild
const stop = () => {
  if (activeChild?.pid) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(activeChild.pid), '/T', '/F'], { stdio: 'pipe', windowsHide: true }) } catch {}
    } else activeChild.kill('SIGTERM')
  }
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', env, windowsHide: true, stdio: 'pipe' }).trim()
const pnpm = env.npm_execpath ?? (process.platform === 'win32' ? join(dirname(process.execPath), 'node_modules/pnpm/pnpm.exe') : join(dirname(process.execPath), 'node_modules/pnpm/bin/pnpm.cjs'))
const safe = text => secrets.reduce((s, value) => s.replaceAll(value, '[已隐藏]'), text).replace(/\bwm[a-z]_[A-Za-z0-9_-]{43,}/g, '[已隐藏]')
const save = (name, value) => writeFileSync(join(evidence, name), JSON.stringify(value, null, 2) + '\n')
function source() {
  const paths = ['apps/connector', 'apps/api/integration/stage5-connector.integration.test.ts', 'apps/api/package.json',
    'packages/contracts/src', 'apps/api/src/agent-connections.ts', 'apps/api/src/auth-idempotency.ts', 'apps/mcp/src',
    'pnpm-lock.yaml', 'turbo.json', '.github/workflows/ci.yml', 'scripts/ci-policy.mjs', 'scripts/ci-policy.test.mjs', 'scripts/ci-test-inputs.mjs', 'scripts/validate-ci.mjs',
    'scripts/test-connector-linux.sh', 'scripts/test-connector-windows.ps1', 'AGENT_PROTOCOL.md', 'OPENAPI.yaml']
  paths.push('apps/web/app/attention-center.tsx', 'apps/web/app/attention-center-approval.test.tsx', 'scripts/connector-secret-probe.mts')
  paths.push('apps/api/src/server.ts', 'apps/api/src/authz/authorize.ts', 'apps/api/src/configuration-readiness.ts',
    'apps/api/integration/configuration-readiness.integration.test.ts', 'docs/route-policy-matrix.md')
  const files = []
  function visit(path) {
    if (!existsSync(resolve(root, path))) return
    const entries = readdirSync(resolve(root, path), { withFileTypes: true })
    for (const entry of entries) {
      if (['node_modules', 'dist', '.turbo'].includes(entry.name)) continue
      if (entry.isDirectory()) visit(`${path}/${entry.name}`)
      else files.push(`${path}/${entry.name}`)
    }
  }
  for (const path of paths) { if (existsSync(resolve(root, path)) && !path.includes('.') || ['apps/connector', 'packages/contracts/src', 'apps/mcp/src'].includes(path)) visit(path); else if (existsSync(resolve(root, path))) files.push(path) }
  return { nodeVersion: process.version, pnpmVersion: execFileSync(pnpm, ['--version'], { encoding: 'utf8', env, windowsHide: true }).trim(), head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(),
    byteKind: '运行时工作树原字节', files: files.sort().map(path => { const bytes = readFileSync(resolve(root, path)); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }) }
}
async function check(name, args) {
  save(`${name}-source-before.json`, source())
  const startedAt = new Date().toISOString(); let output = ''
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn(pnpm.endsWith('.exe') ? pnpm : process.execPath, pnpm.endsWith('.exe') ? args : [pnpm, ...args], { cwd: root, env, windowsHide: true })
    activeChild = child
    const processRecord = { name, pid: child.pid, startedAt, exited: false }
    processes.push(processRecord); save('processes.json', processes)
    const pulse = setInterval(() => {
      writeFileSync(join(logRoot, `${name}.log`), safe(output.slice(0, Math.max(0, output.length - 200))))
      console.log(`${name}: 仍在运行，已收集 ${output.length} 字符日志`)
    }, 30_000)
    child.stdout.on('data', bytes => { output += bytes.toString() }); child.stderr.on('data', bytes => { output += bytes.toString() })
    child.on('error', error => { clearInterval(pulse); activeChild = undefined; reject(error) })
    child.on('close', code => { clearInterval(pulse); activeChild = undefined; processRecord.exited = true; save('processes.json', processes); resolveCode(code) })
  })
  const log = safe(output); writeFileSync(join(logRoot, `${name}.log`), log)
  save(`${name}-source-after.json`, source())
  results.push({ name, command: ['pnpm', ...args], startedAt, endedAt: new Date().toISOString(), exitCode: code, log: `logs/${name}.log`, secretRedaction: true })
  save('checks.json', results); console.log(`${name}: exit=${code}`)
  if (code !== 0) { console.log(log.slice(-4500)); throw new Error(`检查失败：${name}`) }
}
async function services() {
  env.POSTGRES_PASSWORD = random(16); env.POSTGRES_USER = 'workmesh'; env.POSTGRES_DB = 'workmesh_connector_test'
  env.RUSTFS_ACCESS_KEY = 'connector-test'; env.RUSTFS_SECRET_KEY = random(16)
  const suffix = randomBytes(4).toString('hex')
  for (const [kind, image, port, extra] of [
    ['pg', 'postgres:16-alpine', '5432', ['-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_DB']],
    ['redis', 'redis:7-alpine', '6379', []],
    ['s3', 'rustfs/rustfs:1.0.0', '9000', ['-e', 'RUSTFS_ACCESS_KEY', '-e', 'RUSTFS_SECRET_KEY']],
  ]) {
    const name = `b1b2-01a11ac2-${kind}-${suffix}`
    const id = docker('create', '--name', name, '--label', 'workmesh.task=01a11ac2-b1-b2', '-p', `127.0.0.1::${port}`, ...extra, image)
    const resource = { kind, image, name, id, address: null, cleaned: false }
    resources.push(resource); save('resources.json', resources)
    docker('start', id)
    resource.address = docker('port', name, port).split('\n')[0]; save('resources.json', resources)
  }
  const pg = resources.find(r => r.kind === 'pg'), redis = resources.find(r => r.kind === 'redis'), s3 = resources.find(r => r.kind === 's3')
  for (let i = 0; i < 40; i++) {
    try { docker('exec', pg.name, 'pg_isready', '-U', 'workmesh'); break } catch { await new Promise(r => setTimeout(r, 500)); if (i === 39) throw new Error('PostgreSQL 未就绪') }
  }
  env.RUN_INTEGRATION = '1'; env.DATABASE_URL = `postgres://workmesh:${env.POSTGRES_PASSWORD}@${pg.address}/workmesh_connector_test`
  env.REDIS_URL = `redis://${redis.address}`; env.SESSION_SECRET = random(); env.WORKMESH_MASTER_KEY = random()
  env.WORKMESH_BOOTSTRAP_TOKEN = randomBytes(32).toString('base64url'); secrets.push(env.WORKMESH_BOOTSTRAP_TOKEN)
  env.AUTH_RATE_LIMIT_HMAC_KEY = random(); env.AUTH_RATE_LIMIT_REDIS_PREFIX = 'connector-' + suffix
  env.WORKMESH_RUNNER_SERVICE_TOKEN = random()
  for (const name of ['ENDPOINT', 'SOCKET', 'CLIENT_IP']) env[`AUTH_RATE_LIMIT_${name}_BURST`] = '10000'
  env.AUTH_RATE_LIMIT_SUBJECT_BURST = '1000'; env.AUTH_RATE_LIMIT_INSTALL_BURST = '100'
  env.S3_ENDPOINT = `http://${s3.address}`; env.S3_BUCKET = 'connector-test'; env.S3_ACCESS_KEY_ID = env.RUSTFS_ACCESS_KEY
  env.S3_SECRET_ACCESS_KEY = env.RUSTFS_SECRET_KEY; env.S3_REGION = 'us-east-1'; env.S3_FORCE_PATH_STYLE = 'true'
  env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:3101'; env.NEXT_DEV_API_UPSTREAM = env.NEXT_PUBLIC_API_URL
  for (let i = 0; i < 60; i++) { try { if ((await fetch(env.S3_ENDPOINT + '/health/ready')).ok) break } catch {} await new Promise(r => setTimeout(r, 500)); if (i === 59) throw new Error('S3 未就绪') }
  const result = docker('exec', '-e', 'RUSTFS_ACCESS_KEY', '-e', 'RUSTFS_SECRET_KEY', s3.name, 'sh', '-c',
    'curl --silent --show-error --output /dev/null --write-out "%{http_code}" --aws-sigv4 "aws:amz:us-east-1:s3" --user "$RUSTFS_ACCESS_KEY:$RUSTFS_SECRET_KEY" --header "x-amz-bucket-object-lock-enabled: true" --request PUT "http://127.0.0.1:9000/connector-test"')
  if (!['200', '409'].includes(result)) throw new Error('S3 桶初始化失败')
  save('environment.json', { database: { name: env.POSTGRES_DB, host: pg.address }, redis: redis.address, s3: s3.address, credentials: '本次随机夹具，仅子进程环境；未归档' })
}
save('source-before.json', source())
try {
  if (mode === 'static') {
    await check('connector-build', ['--filter', '@workmesh/connector', 'build'])
    await check('lint', ['lint']); await check('typecheck', ['typecheck']); await check('unit', ['test'])
    await check('ci-validate', ['ci:validate']); await check('route-policy', ['check:route-policy']); await check('skill-pin', ['check:workmesh-skill'])
  } else if (mode === 'connector-build') {
    await check('connector-build', ['--filter', '@workmesh/connector', 'build'])
    await check('connector-lint', ['--filter', '@workmesh/connector', 'lint'])
  } else if (mode === 'connector') {
    await check('connector-typecheck', ['--filter', '@workmesh/connector', 'typecheck'])
    await check('connector-unit', ['--filter', '@workmesh/connector', 'test'])
  } else if (mode === 'affected-final') {
    await check('connector-lint', ['--filter', '@workmesh/connector', 'lint'])
    await check('contracts-lint', ['--filter', '@workmesh/contracts', 'lint'])
    await check('api-lint', ['--filter', '@workmesh/api', 'lint'])
    await check('api-unit', ['--filter', '@workmesh/api', 'test'])
  } else if (mode === 'final-types') {
    await check('connector-build', ['--filter', '@workmesh/connector', 'build'])
    await check('connector-typecheck', ['--filter', '@workmesh/connector', 'typecheck'])
    await check('api-typecheck', ['--filter', '@workmesh/api', 'typecheck'])
  } else if (mode === 'main-impact') {
    await check('connector-typecheck', ['--filter', '@workmesh/connector', 'typecheck'])
    await check('contracts-typecheck', ['--filter', '@workmesh/contracts', 'typecheck'])
    await check('api-typecheck', ['--filter', '@workmesh/api', 'typecheck'])
    await check('contracts-unit', ['--filter', '@workmesh/contracts', 'test'])
    await check('route-policy', ['check:route-policy'])
    await check('ci-validate', ['ci:validate'])
  } else if (mode === 'unit') await check('unit', ['test'])
  else if (mode === 'windows-platform') await check('windows-platform', ['--filter', '@workmesh/connector', 'test:platform'])
  else if (mode === 'documentation') await check('expectation-example', ['--filter', '@workmesh/connector', 'exec', 'tsx', '--eval',
    'import fs from "node:fs"; import assert from "node:assert/strict"; import {expectationSchema} from "./src/config.ts"; import {workmeshSkillManifest} from "@workmesh/contracts"; const e=expectationSchema.parse(JSON.parse(fs.readFileSync("examples/expectation.json","utf8"))); assert.deepEqual(e.skill, workmeshSkillManifest); console.log("清单样例 schema 与真实 Skill pin 一致");'])
  else if (mode === 'policy') {
    await check('ci-validate', ['ci:validate']); await check('ci-policy', ['ci:test'])
    await check('route-policy', ['check:route-policy']); await check('skill-pin', ['check:workmesh-skill'])
  } else {
    await services()
    if (mode === 'focused') {
      await check('focused-api', ['--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/stage5-agent-connections.integration.test.ts', 'integration/stage5-connector.integration.test.ts'])
    } else if (mode === 'integration') await check('integration', ['test:integration'])
    else if (mode === 'e2e') {
      await check('web-build', ['--filter', '@workmesh/web', 'build'])
      env.WORKMESH_PLAYWRIGHT_RUN_DIR = join(evidence, 'playwright-runtime')
      resources.push({ kind: 'temporaryPath', path: env.WORKMESH_PLAYWRIGHT_RUN_DIR, cleaned: false })
      await check('e2e', ['test:e2e'])
    } else throw new Error('未知验证模式')
  }
} catch (error) { console.log(safe(String(error))); process.exitCode = 1 }
finally {
  process.off('SIGINT', stop); process.off('SIGTERM', stop)
  for (const resource of resources) {
    if (resource.id) {
      try { writeFileSync(join(logRoot, `${resource.kind}-service.log`), safe(docker('logs', resource.id))); docker('rm', '-f', '-v', resource.id); resource.cleaned = true }
      catch { resource.cleanupError = '定向清理失败，需复查该 ID' }
    } else if (resource.path) {
      // Playwright 原始证据可能含会话/请求秘密，成功时仅保存检查日志和源绑定。
      // 失败保留在敏感本地目录，后续逐项脱敏并归档后再清理。
      if (!process.exitCode) { rmSync(resource.path, { recursive: true, force: true }); resource.cleaned = true }
      else resource.retainedReason = '失败诊断尚待脱敏，未纳入 Git 交付'
    }
  }
  save('resources.json', resources); save('checks.json', results); save('source-after.json', source())
}
