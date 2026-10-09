import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const root = realpathSync(resolve(import.meta.dirname, '../../..'))
const inventory = JSON.parse(readFileSync(resolve(import.meta.dirname, 'preservation.json'), 'utf8'))
const output = resolve(import.meta.dirname, 'separation-receipts.json')
if (existsSync(output)) throw Error('分离回执已存在，不覆盖')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const entries = inventory.entries.filter(entry => entry.disposition.startsWith('本轮延后'))
const receipts = entries.map(entry => {
  const target = resolve(root, entry.path)
  if (relative(root, target).startsWith('..') || lstatSync(target).isSymbolicLink()) throw Error('路径边界未确认')
  for (let parent = dirname(target); parent !== root; parent = dirname(parent)) if (lstatSync(parent).isSymbolicLink()) throw Error('祖先链接边界未确认')
  const archived = gunzipSync(readFileSync(resolve(import.meta.dirname, entry.worktree.archive)))
  const current = readFileSync(target)
  if (hash(archived) !== entry.worktree.sha256 || !current.equals(archived)) throw Error(`原件/当前字节不一致：${entry.path}`)
  const main = spawnSync('git', ['show', `${inventory.main}:${entry.path}`], { cwd: root, windowsHide: true })
  if (main.status !== 0 && !/does not exist|exists on disk, but not in/.test(main.stderr.toString())) throw Error('无法核 main 文件存在状态')
  return { path: entry.path, target, originalSha256: hash(current), archive: entry.worktree.archive,
    operation: main.status === 0 ? '恢复精确 main Git blob' : '仅移除已保全的本任务新增 UI 文件',
    mainSha256: main.status === 0 ? hash(main.stdout) : null,
    activity: '本轮尚未启动测试/服务；旧健康运行已结束并保全，当前恢复目录保留',
    plannedAt: new Date().toISOString(), result: null }
})
const save = () => writeFileSync(output, JSON.stringify({ original: inventory.originalHead, main: inventory.main, entries: receipts }, null, 2) + '\n')
save()
for (const entry of receipts) {
  if (entry.mainSha256) {
    const main = spawnSync('git', ['show', `${inventory.main}:${entry.path}`], { cwd: root, windowsHide: true })
    if (main.status !== 0 || hash(main.stdout) !== entry.mainSha256) throw Error('main 原件变化')
    writeFileSync(entry.target, main.stdout)
    entry.result = { exists: true, sha256: hash(readFileSync(entry.target)), at: new Date().toISOString() }
  } else {
    unlinkSync(entry.target)
    entry.result = { exists: existsSync(entry.target), at: new Date().toISOString() }
  }
  save()
}
console.log(JSON.stringify({ restoredOrRemoved: receipts.length, receipts: output }))
