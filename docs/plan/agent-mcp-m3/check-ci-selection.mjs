// 只核本轮规划候选的实际CI分类，不执行产品测试或改变CI门禁。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { classifyChanges, readWorkspaces } from '../../../scripts/ci-policy.mjs'

const paths = [...new Set([
  ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split('\n'),
  ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'),
].filter(Boolean))].sort()
assert(paths.length > 0)
assert(paths.every(path => path.startsWith('docs/plan/agent-mcp-m3/') || path === 'docs/adr/0083-exact-provider-action-query-and-review-repository-scope.md'))
const selection = classifyChanges(paths, readWorkspaces())
assert.equal(selection.mode, 'full')
assert(Object.values(selection.checks).every(Boolean))
console.log(JSON.stringify({ paths, selection, productTestsExecuted: false, exitCode: 0 }))
