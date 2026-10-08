import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import net from 'node:net'
import { gzipSync } from 'node:zlib'

const directory = import.meta.dirname
const root = resolve(directory, '../../../..')
const runId = `visual-${randomUUID().slice(0, 8)}`
const output = resolve(directory, 'runs', runId)
mkdirSync(output, { recursive: true })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const git = args => spawnSync('git', args, { cwd: root, windowsHide: true }).stdout
const files = [
  'apps/web/features/projects/project-repository-configuration.tsx',
  'apps/web/features/projects/project-repository-configuration.module.css',
  'apps/web/app/page.tsx', 'apps/web/app/lib/api.ts', 'apps/web/app/lib/i18n.tsx',
  'apps/web/app/lib/actor.ts', 'apps/web/app/lib/realtime.tsx',
  'apps/web/app/lib/use-authority-lifetime.ts',
  'apps/web/app/globals.css', 'apps/web/playwright.mocked.config.ts',
  'apps/web/e2e/project-work-preview-server.mjs',
  'packages/contracts/src/index.ts', 'packages/contracts/src/repository-configuration-contracts.ts',
  'docs/reviews/a2/visual-delivery/capture.mjs',
  'docs/reviews/a2/visual-delivery/capture.spec.ts',
  'docs/reviews/a2/visual-delivery/playwright.config.ts',
  'docs/reviews/a2/visual-delivery/package.json',
].filter(file => existsSync(resolve(root, file)))
const source = phase => {
  const entries = files.map(path => {
    const raw = readFileSync(resolve(root, path))
    const result = spawnSync('git', ['show', `HEAD:${path}`], { cwd: root, windowsHide: true })
    return { path, worktree: { bytes: raw.length, sha256: digest(raw) },
      gitBlob: result.status === 0 ? { bytes: result.stdout.length, sha256: digest(result.stdout) } : null }
  })
  const value = { head: git(['rev-parse', 'HEAD']).toString().trim(), observedAt: new Date().toISOString(), entries }
  writeFileSync(resolve(output, `source-${phase}.json`), JSON.stringify(value, null, 2) + '\n')
  return value
}
const listening = port => new Promise(resolveResult => {
  const socket = net.connect(port, '127.0.0.1')
  socket.once('connect', () => { socket.destroy(); resolveResult(true) })
  socket.once('error', () => resolveResult(false))
})
const receipt = { runId, scope: '仅局部视觉采集，不计产品检查或安装验收', start: new Date().toISOString(), resources: [
  { type: 'directory', path: output, owner: runId, retention: '本轮原始证据，提交保留' },
  { type: 'preview-service', port: 3201, owner: runId, beforeListening: null, afterListening: null },
  { type: 'next-dev', port: 3200, owner: runId, beforeListening: null, afterListening: null },
], commands: [] }
const save = () => writeFileSync(resolve(output, 'receipts.json'), JSON.stringify(receipt, null, 2) + '\n')
save()
const before = source('before')
let log = ''
try {
  for (const resource of receipt.resources.filter(item => item.port)) {
    resource.beforeListening = await listening(resource.port)
    save()
    if (resource.beforeListening) throw Error(`端口 ${resource.port} 已有服务；不接管、不停止`)
  }
  const require = createRequire(resolve(root, 'apps/web/package.json'))
  const cli = resolve(dirname(require.resolve('@playwright/test/package.json')), 'cli.js')
  const args = [cli, 'test', '--config', resolve(directory, 'playwright.config.ts')]
  const command = { executable: process.execPath, args, cwd: resolve(root, 'apps/web'), startedAt: new Date().toISOString(), pid: null, code: null }
  receipt.commands.push(command)
  const child = spawn(process.execPath, args, { cwd: command.cwd, windowsHide: true, env: {
    ...process.env, WORKMESH_PLAYWRIGHT_RUN_DIR: resolve(output, 'playwright'),
  } })
  command.pid = child.pid; save()
  child.stdout.on('data', bytes => { log += bytes.toString(); process.stdout.write(bytes) })
  child.stderr.on('data', bytes => { log += bytes.toString(); process.stderr.write(bytes) })
  await new Promise((resolveDone, reject) => {
    child.once('error', reject)
    child.once('close', code => { command.code = code; command.endedAt = new Date().toISOString(); resolveDone() })
  })
  save()
  process.exitCode = command.code ?? 1
} catch (error) {
  receipt.error = String(error); process.exitCode = 1
} finally {
  const raw = Buffer.from(log)
  writeFileSync(resolve(output, 'stdout.log.gz'), gzipSync(raw))
  writeFileSync(resolve(output, 'stdout.log'), log.split(/\r?\n/).map(line => line.trimEnd()).join('\n').trimEnd() + '\n')
  receipt.rawLog = { path: 'stdout.log.gz', uncompressedBytes: raw.length, uncompressedSha256: digest(raw), compressedSha256: digest(readFileSync(resolve(output, 'stdout.log.gz'))) }
  const after = source('after')
  receipt.sourceUnchanged = JSON.stringify(before.entries) === JSON.stringify(after.entries)
  for (const resource of receipt.resources.filter(item => item.port)) {
    resource.afterListening = await listening(resource.port)
    resource.cleanup = resource.beforeListening ? '既有服务未接管' : resource.afterListening ? '服务仍监听，保留待定向核对' : 'Playwright 正常退出后端口无监听；未手动终止其他进程'
  }
  receipt.end = new Date().toISOString(); save()
  console.log(JSON.stringify({ runId, output, code: process.exitCode ?? 0, sourceUnchanged: receipt.sourceUnchanged }))
}
