import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import net from 'node:net'
import { StringDecoder } from 'node:string_decoder'

const root = resolve(import.meta.dirname, '../../..')
const runId = `a2-${randomUUID().slice(0, 8)}`
const evidence = resolve(import.meta.dirname, 'runs', runId)
mkdirSync(evidence, { recursive: true })
const env = { ...process.env }
const secrets = [randomBytes(32).toString('hex'), randomBytes(32).toString('hex'), randomBytes(32).toString('base64url'), randomBytes(32).toString('hex')]
secrets.push(randomBytes(32).toString('hex'))
const redact = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), String(value))
const resources = []
const results = []
const writeEvidence = (path, bytes) => {
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(path, bytes); return } catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error.code) || attempt >= 40) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
}
const save = () => writeEvidence(resolve(evidence, 'receipts.json'), JSON.stringify({ runId, resources, results }, null, 2))
const captureSource = phase => {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
  const files = spawnSync('git', ['ls-files', '-m', '-o', '--exclude-standard'], { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/)
    .filter(file => /^(apps\/|packages\/|scripts\/|OPENAPI\.yaml|playwright\.config\.ts)/.test(file) && existsSync(resolve(root, file)))
  const entries = files.map(file => {
    const bytes = readFileSync(resolve(root, file)); const target = resolve(evidence, 'source', phase, file)
    mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(root, file), target)
    return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  writeFileSync(resolve(evidence, `source-${phase}.json`), JSON.stringify({ head, observedAt: new Date().toISOString(), byteKind: '工作树原字节；Git blob 另核', files: entries }, null, 2))
}
const command = (name, args, childEnv = env) => new Promise(resolveResult => {
  const start = new Date().toISOString()
  const child = spawn(name, args, { cwd: root, env: childEnv, shell: name.endsWith('.cmd'), windowsHide: true })
  let output = ''
  const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8')
  const logIndex = results.length
  const progress = setInterval(() => {
    try { writeEvidence(resolve(evidence, `${logIndex}.log`), redact(output).slice(0, -128)) }
    catch (error) { if (!['EBUSY', 'EPERM'].includes(error.code)) console.error(redact(error)) }
  }, 1000)
  child.stdout?.on('data', value => { output += stdout.write(value) }); child.stderr?.on('data', value => { output += stderr.write(value) })
  child.on('error', error => { output += String(error) })
  child.on('close', code => {
    clearInterval(progress); output += stdout.end() + stderr.end()
    const index = results.length
    writeEvidence(resolve(evidence, `${index}.log`), redact(output))
    results.push({ name, args: args.map(redact), pid: child.pid, start, end: new Date().toISOString(), code, log: `${index}.log` }); save()
    console.log(JSON.stringify({ step: index, command: name, args: args.map(redact), code, log: `${index}.log` }))
    resolveResult({ code, output })
  })
})
const must = async (name, args, childEnv) => { const result = await command(name, args, childEnv); if (result.code !== 0) throw Error(`${name} failed: ${result.code}`); return result.output.trim() }
const port = () => new Promise(resolvePort => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)) }) })
const locatedPnpm = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['pnpm'], { encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/)[0]
const standalonePnpm = locatedPnpm && resolve(dirname(locatedPnpm), 'node_modules/pnpm/pnpm.exe')
const pnpm = standalonePnpm && existsSync(standalonePnpm) ? standalonePnpm : locatedPnpm || 'pnpm'
env.npm_execpath = process.env.npm_execpath ?? pnpm
try {
  captureSource('before')
  const [pgPort, redisPort, s3Port] = await Promise.all([port(), port(), port()])
  Object.assign(env, {
    RUN_INTEGRATION: '1', DATABASE_URL: `postgres://workmesh:${secrets[0]}@127.0.0.1:${pgPort}/workmesh_a2_test`, REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    SESSION_SECRET: secrets[1], WORKMESH_BOOTSTRAP_TOKEN: secrets[2], WORKMESH_MASTER_KEY: secrets[3],
    WORKMESH_RUNNER_SERVICE_TOKEN: secrets[4],
    AUTH_RATE_LIMIT_ENDPOINT_BURST: '10000', AUTH_RATE_LIMIT_SOCKET_BURST: '10000', AUTH_RATE_LIMIT_CLIENT_IP_BURST: '10000', AUTH_RATE_LIMIT_SUBJECT_BURST: '1000', AUTH_RATE_LIMIT_INSTALL_BURST: '100',
    AUTH_RATE_LIMIT_REDIS_PREFIX: runId, S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, S3_BUCKET: runId, S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'workmesh', S3_SECRET_ACCESS_KEY: secrets[0], S3_FORCE_PATH_STYLE: 'true',
    WORKMESH_PLAYWRIGHT_RUN_DIR: resolve(evidence, 'playwright'),
    POSTGRES_PASSWORD: secrets[0], RUSTFS_ACCESS_KEY: 'workmesh', RUSTFS_SECRET_KEY: secrets[0],
  })
  for (const [role, image, args] of [
    ['postgres', 'postgres:16-alpine', ['-p', `127.0.0.1:${pgPort}:5432`, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=workmesh', '-e', 'POSTGRES_DB=workmesh_a2_test', '--tmpfs', '/var/lib/postgresql/data']],
    ['redis', 'redis:7-alpine', ['-p', `127.0.0.1:${redisPort}:6379`]],
    ['s3', 'rustfs/rustfs:1.0.0', ['-p', `127.0.0.1:${s3Port}:9000`, '-e', 'RUSTFS_ACCESS_KEY', '-e', 'RUSTFS_SECRET_KEY', '--tmpfs', '/data:rw,mode=1777']],
  ]) {
    const name = `${runId}-${role}`
    resources.push({ type: 'container', name, owner: runId, image, plannedAt: new Date().toISOString(), id: null, cleanup: null }); save()
    const id = await must('docker', ['run', '-d', '--name', name, '--label', `workmesh.task=${runId}`, ...args, image])
    resources.at(-1).id = id; save()
  }
  const require = createRequire(resolve(root, 'packages/artifact-storage/package.json'))
  const { S3Client, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3')
  const s3 = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } })
  let ready = false
  for (let attempt = 0; attempt < 45; attempt++) {
    const pg = spawnSync('docker', ['exec', `${runId}-postgres`, 'pg_isready', '-U', 'workmesh'], { encoding: 'utf8', windowsHide: true })
    try { if (pg.status === 0) { await s3.send(new CreateBucketCommand({ Bucket: runId, ObjectLockEnabledForBucket: true })); await s3.send(new HeadBucketCommand({ Bucket: runId })); ready = true; break } } catch { /* bounded readiness retry */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 1000))
  }
  s3.destroy(); if (!ready) throw Error('专用测试服务未就绪')
  const phase = process.argv[2] ?? 'backend'
  if (phase === 'backend') await must(pnpm, ['--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/stage3-delivery.integration.test.ts', 'integration/stage4-operations.integration.test.ts'])
  else if (phase === 'e2e') {
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts']
    await must(pnpm, [...args, '--list']); await must(pnpm, args)
  } else if (phase === 'current-ui') {
    await must(pnpm, ['check:route-policy'])
    await command(pnpm, ['--filter', '@workmesh/web', 'check:i18n'])
    await must(pnpm, ['lint']); await must(pnpm, ['typecheck'])
    await must(pnpm, ['--filter', '@workmesh/web', 'test'])
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts', 'human-reflow.spec.ts', 'workbench-llm-settings.spec.ts']
    await must(pnpm, [...args, '--list']); await must(pnpm, args)
    await must(pnpm, ['ci:validate']); await must(pnpm, ['--filter', '@workmesh/web', 'build'])
  } else if (phase === 'required') {
    await must(pnpm, ['check:route-policy'])
    const i18n = await command(pnpm, ['--filter', '@workmesh/web', 'check:i18n'])
    for (const name of ['lint', 'typecheck', 'test', 'test:integration', 'test:e2e', 'ci:validate']) await must(pnpm, [name])
    await must(pnpm, ['--filter', '@workmesh/web', 'build'])
    if (i18n.code !== 0) throw Error('全站 i18n 检查失败；必需检查已继续执行，诊断原件保留')
  } else if (phase === 'required-remaining') {
    await must(pnpm, ['--filter', '@workmesh/api', 'exec', 'vitest', 'run', 'src/auth-rate-limit/server-rate-limit.test.ts'])
    await must(pnpm, ['exec', 'turbo', 'run', 'test', '--concurrency=1'])
    for (const name of ['test:integration', 'test:e2e', 'ci:validate']) await must(pnpm, [name])
    await must(pnpm, ['--filter', '@workmesh/web', 'build'])
  } else if (phase === 'visual') {
    await must(pnpm, ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', 'playwright.d0.config.ts'])
  } else if (phase === 'visual-detail') {
    await must(pnpm, ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', 'playwright.d0.config.ts', '--project', 'desktop-1440x1000', '--grep', '工作项详情'])
  } else if (phase === 'final') {
    await must(pnpm, ['check:route-policy'])
    await command(pnpm, ['--filter', '@workmesh/web', 'check:i18n'])
    await must(pnpm, ['lint']); await must(pnpm, ['typecheck'])
    await must(pnpm, ['exec', 'turbo', 'run', 'test', '--concurrency=1'])
    await must(pnpm, ['test:integration'])
    await must(pnpm, ['test:e2e'])
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts']
    await must(pnpm, [...args, '--list']); await must(pnpm, args)
    await must(pnpm, ['ci:validate']); await must(pnpm, ['--filter', '@workmesh/web', 'build'])
  } else if (phase === 'remaining') {
    await must(pnpm, ['--filter', '@workmesh/web', 'exec', 'vitest', 'run', 'app/landing-screen.test.tsx'])
    const unit = await command(pnpm, ['test'])
    await must(pnpm, ['test:integration'])
    await must(pnpm, ['test:e2e'])
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts']
    await must(pnpm, [...args, '--list']); await must(pnpm, args)
    await must(pnpm, ['ci:validate']); await must(pnpm, ['--filter', '@workmesh/web', 'build'])
    if (unit.code !== 0) throw Error('本次根单元检查失败；已继续独立集成、浏览器与构建，首败和各自结果保留')
  } else if (phase === 'delivery') {
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts']
    await must(pnpm, [...args, '--list'])
    const browser = await command(pnpm, args)
    await must(pnpm, ['ci:validate']); await must(pnpm, ['--filter', '@workmesh/web', 'build'])
    if (browser.code !== 0) throw Error('关闭 Gitea 的独立浏览器失败；独立 CI 校验和构建已继续，首败保留')
  } else if (phase === 'browser') {
    await must(pnpm, ['typecheck'])
    await must(pnpm, ['test:e2e'])
    env.WORKMESH_A2_DISABLE_GITEA = '1'
    env.WORKMESH_PLAYWRIGHT_RUN_DIR = resolve(evidence, 'playwright-gitea-disabled')
    const args = ['--filter', '@workmesh/web', 'exec', 'playwright', 'test', '--config', '../../playwright.config.ts', 'configuration-readiness.spec.ts']
    await must(pnpm, [...args, '--list']); await must(pnpm, args)
    await must(pnpm, ['ci:validate']); await must(pnpm, ['--filter', '@workmesh/web', 'build'])
  } else throw Error('Unknown phase')
} catch (error) {
  console.log(redact(error)); process.exitCode = 1
} finally {
  captureSource('after')
  for (const resource of resources.toReversed()) {
    if (!resource.id) { resource.cleanup = '未成功创建'; continue }
    // Verify the exact container's ownership before deleting; preserve shared images.
    const check = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "workmesh.task" }}', resource.id], { encoding: 'utf8', windowsHide: true })
    const mounts = spawnSync('docker', ['inspect', '--format', '{{json .Mounts}}', resource.id], { encoding: 'utf8', windowsHide: true })
    resource.preDelete = { id: resource.id, owner: check.stdout?.trim(), exitCode: check.status, mounts: mounts.status === 0 ? JSON.parse(mounts.stdout) : null, activity: '验收子进程已结束，保全日志与源码后收尾', at: new Date().toISOString() }; save()
    if (check.status !== 0 || check.stdout.trim() !== runId) { resource.cleanup = '归属未确认，保留'; continue }
    const removed = await command('docker', ['rm', '-f', '-v', resource.id])
    resource.cleanup = { code: removed.code, output: redact(removed.output), at: new Date().toISOString() }; save()
  }
  save()
  if (process.platform === 'win32') await command('powershell.exe', ['-NoProfile', '-File', resolve(import.meta.dirname, 'sanitize-evidence.ps1'), '-RunDirectory', evidence])
  console.log(`证据: ${evidence}`)
}
