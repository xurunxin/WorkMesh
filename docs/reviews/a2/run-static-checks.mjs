import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const runId = `a2-static-${Date.now()}`
const directory = resolve(import.meta.dirname, 'runs', runId)
mkdirSync(directory)
const receipt = { runId, resources: [], results: [], outcome: '未运行' }
const save = () => writeFileSync(resolve(directory, 'receipts.json'), JSON.stringify(receipt, null, 2))
const capture = phase => {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: root }).stdout.trim()
  const paths = spawnSync('git', ['ls-files', '-m', '-o', '--exclude-standard'], { encoding: 'utf8', cwd: root }).stdout.trim().split(/\r?\n/).filter(path => /^(apps\/|packages\/|scripts\/|OPENAPI\.yaml|playwright\.config\.ts)/.test(path) && existsSync(resolve(root, path)))
  const files = paths.map(path => { const bytes = readFileSync(resolve(root, path)); const target = resolve(directory, 'source', phase, path); mkdirSync(dirname(target), { recursive: true }); copyFileSync(resolve(root, path), target); return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } })
  writeFileSync(resolve(directory, `source-${phase}.json`), JSON.stringify({ head, observedAt: new Date().toISOString(), byteKind: '工作树原字节；Git blob 另核', files }, null, 2))
}
const located = spawnSync('where.exe', ['pnpm'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0]
const pnpm = resolve(dirname(located), 'node_modules/pnpm/pnpm.exe')
const run = args => new Promise(resolveResult => {
  const start = new Date().toISOString()
  const child = spawn(pnpm, args, { cwd: root, windowsHide: true })
  const parts = []
  child.stdout.on('data', bytes => parts.push(bytes)); child.stderr.on('data', bytes => parts.push(bytes))
  child.on('close', code => { const log = `${receipt.results.length}.log`; writeFileSync(resolve(directory, log), Buffer.concat(parts)); receipt.results.push({ name: pnpm, args, pid: child.pid, start, end: new Date().toISOString(), code, log }); save(); console.log(JSON.stringify({ args, code, log })); resolveResult(code) })
})
capture('before'); save()
try {
  const codes = []
  for (const args of [['check:route-policy'], ['lint'], ['typecheck'], ['--filter', '@workmesh/web', 'check:i18n']]) codes.push(await run(args))
  receipt.outcome = codes.every(code => code === 0) ? '静态检查全部通过' : '含未通过检查；逐条保留实际结果，不忽略全站 i18n 诊断'
  if (codes.some(code => code !== 0)) process.exitCode = 1
} finally { capture('after'); save(); console.log(`证据：${directory}`) }
