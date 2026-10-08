import { createHash, randomBytes } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 本任务专用夹具；复用旧轮已登记的同一任务容器，不触碰其他任务服务。
const root = process.cwd()
const directory = resolve('docs/reviews/a1/current-run')
mkdirSync(directory, { recursive: true })
const hash = data => createHash('sha256').update(data).digest('hex')
const git = args => execFileSync('git', args, { windowsHide: true })
const source = () => {
  const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString().split('\0')
    .filter(path => path && !path.startsWith('docs/') && !path.startsWith('.evidence/')
      && /\.(?:ts|tsx|js|mjs|mts|json|yaml|yml|sql|css)$/.test(path)).sort()
  const files = paths.map(path => ({ path, sha256: hash(readFileSync(path)) }))
  return { head: git(['rev-parse', 'HEAD']).toString().trim(), files, digest: hash(Buffer.from(JSON.stringify(files))) }
}
const commands = {
  lint: ['lint'], typecheck: ['typecheck'], route: ['check:route-policy'],
  targeted: ['--filter', '@workmesh/api', 'exec', 'vitest', 'run', '--config', '../../vitest.integration.config.ts', 'integration/configuration-readiness.integration.test.ts'],
  integration: ['test:integration'], e2e: ['test:e2e'],
}
const env = { ...process.env, RUN_INTEGRATION: '1',
  DATABASE_URL: 'postgres://workmesh:workmesh-ci-postgres@127.0.0.1:35432/workmesh_a1_test',
  REDIS_URL: 'redis://127.0.0.1:36379', SESSION_SECRET: 'workmesh-ci-session-secret-api-00000001',
  WORKMESH_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  WORKMESH_BOOTSTRAP_TOKEN: randomBytes(32).toString('base64url'),
  WORKMESH_RUNNER_SERVICE_TOKEN: 'workmesh-ci-runner-service-token-00000001',
  AUTH_RATE_LIMIT_ENDPOINT_BURST: '10000', AUTH_RATE_LIMIT_SOCKET_BURST: '10000',
  AUTH_RATE_LIMIT_CLIENT_IP_BURST: '10000', AUTH_RATE_LIMIT_SUBJECT_BURST: '1000', AUTH_RATE_LIMIT_INSTALL_BURST: '100',
  S3_ENDPOINT: 'http://127.0.0.1:39000', S3_BUCKET: 'workmesh-artifacts', S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'workmesh', S3_SECRET_ACCESS_KEY: 'workmesh-ci-minio-password', S3_FORCE_PATH_STYLE: 'true',
  WORKMESH_BETA_GITEA: 'false', WORKMESH_PLAYWRIGHT_RUN_DIR: resolve(process.env.TEMP, 'workmesh-a1-01a11ac2-playwright'),
}
for (const name of process.argv.slice(2)) {
  const args = commands[name]
  if (!args) throw new Error(`未知检查：${name}`)
  const resultPath = resolve(directory, `${name}.result.json`)
  if (existsSync(resultPath)) throw new Error(`已有检查结果，禁止覆盖：${name}`)
  const before = source()
  writeFileSync(resolve(directory, `${name}.before.json`), JSON.stringify(before, null, 2) + '\n')
  const startedAt = new Date().toISOString()
  const logPath = resolve(directory, `${name}.log`)
  const fd = openSync(logPath, 'wx')
  console.log(`开始 ${name} ${startedAt}`)
  const child = spawn('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], { cwd: root, env,
    windowsHide: true, stdio: ['ignore', fd, fd] })
  const exitCode = await new Promise((accept, reject) => {
    child.once('error', reject); child.once('exit', code => accept(code))
  }).finally(() => closeSync(fd))
  const after = source()
  const log = readFileSync(logPath)
  if (log.includes(Buffer.from(env.WORKMESH_BOOTSTRAP_TOKEN))) throw new Error('日志出现临时 bootstrap，须脱敏后归档')
  writeFileSync(resolve(directory, `${name}.after.json`), JSON.stringify(after, null, 2) + '\n')
  writeFileSync(resultPath, JSON.stringify({ command: `pnpm ${args.join(' ')}`, startedAt, endedAt: new Date().toISOString(),
    exitCode, beforeDigest: before.digest, afterDigest: after.digest, sourceUnchanged: before.digest === after.digest,
    logSha256: hash(log), logBytes: log.length, branch: git(['branch', '--show-current']).toString().trim(),
    note: '本轮实际运行；配置来自公开测试夹具，bootstrap 随机且不落盘；运行产物在资源清单登记。' }, null, 2) + '\n')
  console.log(`结束 ${name} exit=${exitCode} sourceUnchanged=${before.digest === after.digest}`)
  console.log(log.toString('utf8').slice(-1800))
  if (exitCode !== 0 || before.digest !== after.digest) { process.exitCode = 1; break }
}
