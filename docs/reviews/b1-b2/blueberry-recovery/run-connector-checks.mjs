import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { createHash } from 'node:crypto'

const root = process.cwd()
const base = resolve(root, 'docs/reviews/b1-b2/blueberry-recovery')
const attempt = process.argv[2]
if (!attempt || !/^[a-z0-9-]+$/.test(attempt)) throw new Error('需要独有运行标识，不能覆盖历史结果')
const output = join(base, attempt)
const owner = JSON.parse(readFileSync(resolve(root, '.tmp/workmesh-environment-owner.json'), 'utf8').replace(/^\uFEFF/, ''))
const entries = execFileSync('git', ['ls-files', '--stage', '-z', 'apps', 'packages', 'scripts', 'infra', '.github', 'skills', 'AGENT_PROTOCOL.md', 'CONTEXT.md', 'OPENAPI.yaml', 'SCHEMA.sql', 'pnpm-lock.yaml', 'package.json', 'turbo.json', 'vitest.config.ts'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const source = { runtimeHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  files: entries.map(entry => {
    const [metadata, path] = entry.split('\t'), bytes = readFileSync(resolve(root, path))
    return { path, bytes: bytes.length, indexBlob: metadata.split(' ')[1], rawSha256: createHash('sha256').update(bytes).digest('hex') }
  }) }
const env = { ...process.env, PATH: `${dirname(owner.node)};${process.env.PATH}`, APPDATA: process.env.WM_B1B2_TEST_ROOT ?? process.env.APPDATA }
const results = []
mkdirSync(join(output, 'logs'), { recursive: true })
writeFileSync(join(output, 'run-source.json'), JSON.stringify(source, null, 2) + '\n')
function changed() {
  return source.files.filter(file => createHash('sha256').update(readFileSync(resolve(root, file.path))).digest('hex') !== file.rawSha256).map(file => file.path)
}
for (const name of ['lint', 'typecheck', 'test', 'build', 'test:platform']) {
  const args = [owner.manager, '--filter', '@workmesh/connector', name]
  const before = changed()
  const startedAt = new Date().toISOString()
  const run = spawnSync(owner.node, args, { cwd: root, env, windowsHide: true, maxBuffer: 30_000_000 })
  // 原始 stdout/stderr 分别保留；只去除实际凭据形态，不输出测试秘密。
  const redact = buffer => (buffer ?? Buffer.alloc(0)).toString('utf8').replace(/\bwm[a-z]_[A-Za-z0-9_-]{43,}/g, '[已隐藏]')
  writeFileSync(join(output, `logs/${name.replace(':', '-')}.stdout.log`), redact(run.stdout))
  writeFileSync(join(output, `logs/${name.replace(':', '-')}.stderr.log`), redact(run.stderr))
  results.push({ name, command: [owner.node, ...args], node: process.version, startedAt, endedAt: new Date().toISOString(), exitCode: run.status, signal: run.signal, error: run.error?.code ?? null, changedBefore: before, changedAfter: changed() })
  writeFileSync(join(output, 'local-checks.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(`${name}: exit=${run.status}；源码变化=${results.at(-1).changedAfter.length}`)
}
const events = []
for (const name of ['test', 'test-platform']) {
  for (const line of readFileSync(join(output, `logs/${name}.stdout.log`), 'utf8').split('\n')) {
    if (!line.startsWith('{"resource":')) continue
    try { events.push(JSON.parse(line)) } catch { /* 非完整资源行不能当作回执。 */ }
  }
}
writeFileSync(join(output, 'local-resource-events.json'), JSON.stringify(events, null, 2) + '\n')
console.log('已保留全部退出码、原始分流日志及资源事件；失败不冒通过。')
