import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executionInputPaths, fingerprintFiles } from './verify-preflight.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const outputDirectory = resolve(root, 'docs/reviews/d1b/evidence')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const files = {
  stdout: 'docs/reviews/d1b/evidence/preflight-inventory.json',
  stderr: 'docs/reviews/d1b/evidence/preflight-stderr.txt',
  record: 'docs/reviews/d1b/evidence/preflight-execution.json',
}

if (process.argv.includes('--check-record')) {
  const execution = JSON.parse(readFileSync(resolve(root, files.record), 'utf8'))
  const stdout = readFileSync(resolve(root, files.stdout))
  const stderr = readFileSync(resolve(root, files.stderr))
  assert.equal(execution.exitCode, 0)
  assert.equal(execution.executionExitCode, 0)
  assert.equal(execution.command, 'node docs/reviews/d1b/verify-preflight.mjs')
  assert.equal(execution.stdout.sha256, sha(stdout))
  assert.equal(execution.stdout.bytes, stdout.length)
  assert.equal(execution.stderr.sha256, sha(stderr))
  assert.equal(execution.stderr.bytes, stderr.length)
  assert.deepEqual(execution.before, execution.after)
  assert.deepEqual(fingerprintFiles(execution.after.map(input => input.path)), execution.after)
  const report = JSON.parse(stdout.toString('utf8'))
  assert.deepEqual(report.inputBinding, execution.before)
  assert.equal(execution.sourceUnchanged, true)
  assert.equal(execution.skip.length, 0)
  console.log(JSON.stringify({ status: '执行记录及当前输入复核通过', inputs: execution.before.length, exitCode: execution.exitCode, sourceUnchanged: true, cleanupAllowed: report.cleanupAllowed }))
} else {
  // 只记录子进程真实输出；不 trim、不把推算结果当命令退出状态。
  const before = fingerprintFiles(executionInputPaths())
  const startedAt = new Date().toISOString()
  const clock = performance.now()
  const args = ['docs/reviews/d1b/verify-preflight.mjs']
  const child = spawnSync(process.execPath, args, { cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 120_000 })
  const finishedAt = new Date().toISOString()
  const elapsedMs = performance.now() - clock
  const after = fingerprintFiles(executionInputPaths())
  const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after)
  const stdout = child.stdout ?? Buffer.alloc(0)
  const stderr = child.stderr ?? Buffer.alloc(0)
  let validationError = null
  if (child.status === 0) {
    try { assert.deepEqual(JSON.parse(stdout.toString('utf8')).inputBinding, before) }
    catch (error) { validationError = error.message }
  }
  const exitCode = child.status === 0 && sourceUnchanged && !validationError ? 0 : 1
  const execution = {
    kind: 'workmesh.d1b.preflight-execution',
    command: 'node docs/reviews/d1b/verify-preflight.mjs',
    wrapperCommand: 'node docs/reviews/d1b/run-preflight.mjs',
    invocation: { executable: process.execPath, args, cwd: root },
    runtime: { node: process.version, platform: process.platform, arch: process.arch, versions: process.versions },
    startedAt, finishedAt, elapsedMs,
    exitCode: child.status, signal: child.signal, error: child.error?.message ?? null,
    executionExitCode: exitCode, validationError, sourceUnchanged,
    skip: [],
    services: { started: [], restored: [], cleaned: [], reason: '本次只读静态前置核验不需要服务；不代表产品回归执行' },
    stdout: { path: files.stdout, bytes: stdout.length, sha256: sha(stdout), policy: '子进程原始字节，无损保留' },
    stderr: { path: files.stderr, bytes: stderr.length, sha256: sha(stderr), policy: '子进程原始字节，无损保留' },
    before, after,
  }
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(resolve(root, files.stdout), stdout)
  writeFileSync(resolve(root, files.stderr), stderr)
  writeFileSync(resolve(root, files.record), JSON.stringify(execution, null, 2) + '\n')
  console.log(JSON.stringify({ command: execution.command, exitCode: child.status, executionExitCode: exitCode, sourceUnchanged, inputs: before.length, elapsedMs, record: files.record }))
  process.exitCode = exitCode
}
