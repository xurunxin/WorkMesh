import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'

// 每次命令使用独立 Node 22 副本；不改全局 Node/daemon。只清本次登记路径。
const root = process.cwd(), attempt = process.argv[3]
if (!/^[a-z0-9-]+$/.test(attempt ?? '')) throw new Error('无效证据目录')
const evidence = resolve(root, 'docs/reviews/b1-b2/evidence', attempt)
mkdirSync(evidence, { recursive: true })
const temporary = mkdtempSync(join(tmpdir(), 'workmesh-b1-b2-revision-node-'))
const record = { path: temporary, source: 'https://registry.npmjs.org/node-win-x64/22.19.0', removed: false }
const save = () => writeFileSync(join(evidence, 'node-runtime.json'), JSON.stringify(record, null, 2) + '\n')
save()
try {
  const metadata = await (await fetch(record.source)).json()
  const bytes = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer())
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('Node 包完整性不匹配')
  record.integrityVerified = true; save()
  writeFileSync(join(temporary, 'node.tgz'), bytes)
  execFileSync('tar', ['-xf', join(temporary, 'node.tgz'), '-C', temporary], { windowsHide: true })
  const runtime = join(temporary, 'package/bin/node.exe')
  const env = { ...process.env, PATH: join(temporary, 'package/bin') + ';' + process.env.PATH,
    npm_execpath: 'C:/nvm4w/nodejs/node_modules/pnpm/pnpm.exe' }
  try { execFileSync(runtime, ['docs/reviews/b1-b2/run-local.mjs', process.argv[2], attempt], { cwd: root, env, stdio: 'inherit', windowsHide: true }) }
  catch (error) { process.exitCode = typeof error.status === 'number' ? error.status : 1 }
} finally {
  const target = resolve(temporary), boundary = resolve(tmpdir()) + sep
  if (!target.startsWith(boundary) || !target.includes('workmesh-b1-b2-revision-node-')) throw new Error('清理边界错误')
  rmSync(target, { recursive: true, force: true }); record.removed = true; save()
}
