// 只读调用既有分类器，保留JSON/Python触发full的实际结论。
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { classifyChanges, readWorkspaces } from '../../../scripts/ci-policy.mjs'

const directory = dirname(fileURLToPath(import.meta.url))
const root = resolve(directory, '../../..')
const start = performance.now()
const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim()
const paths = [...new Set((tracked + '\n' + untracked).split('\n').filter(Boolean))].sort()
const plan = classifyChanges(paths, readWorkspaces(root))
if (plan.mode !== 'full') throw new Error('本卡结构化规划工件应保留full分类，不降门禁')
const data = { command: 'node docs/plan/agent-mcp-m4/classify-planning.mjs',
  exitCode: 0, runtimeSeconds: (performance.now() - start) / 1000, paths, plan,
  limits: '仅分类，不是ci:test、Required CI或产品测试成功；动态输出随后进入同一受控目录。' }
writeFileSync(resolve(directory, 'input/discovery-review/ci-classification.json'), JSON.stringify(data, null, 2) + '\n')
process.stdout.write(JSON.stringify({ mode: plan.mode, affectedPackages: plan.packages.length,
  requiredCheckCount: Object.values(plan.checks).filter(Boolean).length }) + '\n')
