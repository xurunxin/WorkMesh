import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const runId = `a2-proxy-${randomUUID().slice(0, 8)}`
const directory = resolve(import.meta.dirname, 'runs', runId)
mkdirSync(directory)
const files = ['infra/docker/lite.Dockerfile', 'docker-compose.lite.yml', 'apps/web/next.config.ts', 'scripts/verify-a2-lite.mjs', 'packages/config/src/runtime-secrets.mjs', 'infra/docker/runtime-guard.mjs', 'apps/web/playwright.a2-lite.config.ts', 'apps/web/e2e/fixtures/configuration-readiness.ts', 'apps/web/e2e/configuration-readiness.spec.ts', 'pnpm-lock.yaml']
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
const capture = phase => writeFileSync(resolve(directory, `source-${phase}.json`), JSON.stringify({ head, observedAt: new Date().toISOString(), files: files.map(path => {
  const bytes = readFileSync(resolve(root, path))
  const target = resolve(directory, 'source', phase, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes)
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}) }, null, 2) + '\n')
const located = spawnSync('where.exe', ['pnpm'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0]
const executable = resolve(dirname(located), 'node_modules/pnpm/pnpm.exe')
if (!existsSync(executable)) throw Error('pnpm 独立入口缺失')
const receipt = { runId, resources: [], results: [] }
capture('before')
for (const [name, args] of [
  [process.execPath, ['--check', 'scripts/verify-a2-lite.mjs']],
  [process.execPath, ['scripts/validate-lite-compose.mjs']],
  [process.execPath, ['scripts/validate-lite-compose.mjs', '--self-test']],
  [executable, ['--filter', '@workmesh/config', 'test']],
  [executable, ['ci:validate']],
]) {
  const startedAt = new Date().toISOString()
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 20_000_000 })
  const log = `${receipt.results.length}.log`; writeFileSync(resolve(directory, log), result.stdout + result.stderr)
  receipt.results.push({ name, args, startedAt, endedAt: new Date().toISOString(), code: result.status, log })
  writeFileSync(resolve(directory, 'receipts.json'), JSON.stringify(receipt, null, 2) + '\n')
  console.log(JSON.stringify({ args, code: result.status }))
  if (result.status !== 0) process.exitCode = 1
}
capture('after')
console.log(directory)
