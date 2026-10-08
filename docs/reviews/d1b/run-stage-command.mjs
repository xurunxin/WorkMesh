import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprintFiles, executionInputPaths } from './verify-preflight.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const [id, phase, ...args] = process.argv.slice(2)
if (!id || !/^[a-z0-9-]+$/.test(id) || !['before', 'after', 'check'].includes(phase) || !args.length) throw new Error('用法：run-stage-command.mjs <id> <before|after|check> <pnpm arguments...>')
const surface = process.env.WORKMESH_D1B_SURFACE ?? 'workbench'
if (!['workbench', 'board'].includes(surface)) throw new Error('未知迁移阶段')
const directory = resolve(root, `docs/reviews/d1b/evidence/${surface}/runs`, id)
if (existsSync(directory)) throw new Error('不得覆盖已有运行原件；请使用新的 run id')
mkdirSync(directory, { recursive: true })
const pnpm = resolve(dirname(process.execPath), 'node_modules/pnpm/pnpm.exe')
if (!existsSync(pnpm)) throw new Error('当前 Node 目录下无法定位 pnpm CLI')
const stageScripts = execFileSync('git', ['ls-files', 'docs/reviews/d1b'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => path.endsWith('.mjs'))
const trackedInputs = [...new Set([...executionInputPaths(), ...stageScripts, 'docs/reviews/d1b/workbench-ledger.json', ...(surface === 'board' ? ['docs/reviews/d1b/board-authorization.json', ...(existsSync(resolve(root, 'docs/reviews/d1b/board-ledger.json')) ? ['docs/reviews/d1b/board-ledger.json'] : [])] : [])])]
const before = fingerprintFiles(trackedInputs)
const startedAt = new Date().toISOString()
const clock = performance.now()
const stdout = [], stderr = []
const runDir = resolve(tmpdir(), `workmesh-d1b-${id}`)
const invocation = { executable: pnpm, args, cwd: root }
const child = spawn(invocation.executable, invocation.args, { cwd: root, env: { ...process.env, WORKMESH_D1B_PHASE: phase, WORKMESH_PLAYWRIGHT_RUN_DIR: runDir }, stdio: ['ignore', 'pipe', 'pipe'] })
child.stdout.on('data', bytes => { stdout.push(bytes); process.stdout.write(bytes) })
child.stderr.on('data', bytes => { stderr.push(bytes); process.stderr.write(bytes) })
let error = null
child.on('error', reason => { error = reason.message })
const completion = await new Promise(resolve => child.on('close', (exitCode, signal) => resolve({ exitCode, signal })))
const after = fingerprintFiles(trackedInputs)
const raw = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) }
for (const [name, bytes] of Object.entries(raw)) writeFileSync(resolve(directory, `${name}.log`), bytes)
const record = {
  id, phase, surface, command: ['pnpm', ...args].join(' '), invocation,
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  startedAt, finishedAt: new Date().toISOString(), elapsedMs: performance.now() - clock,
  ...completion, error, sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  environment: { WORKMESH_D1B_PHASE: phase, WORKMESH_PLAYWRIGHT_RUN_DIR: runDir },
  raw: Object.fromEntries(Object.entries(raw).map(([name, bytes]) => [name, { path: `${name}.log`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), policy: '子进程原始字节，不 trim；提交时无损 ZIP 包装' }])),
  skip: [], services: { policy: 'Playwright webServer 本轮独有 mocked API/Next，reuseExistingServer=false；正常测试结束由 Playwright 清理；实际状态另核对' },
  before, after,
}
writeFileSync(resolve(directory, 'execution.json'), JSON.stringify(record, null, 2) + '\n')
process.exitCode = completion.exitCode === 0 && record.sourceUnchanged ? 0 : 1
