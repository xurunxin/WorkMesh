import { spawnSync } from 'node:child_process'
import { readWorkspaces, root } from './ci-policy.mjs'

const workspaces = readWorkspaces()
const selected = JSON.parse(process.env.CI_PACKAGES ?? JSON.stringify(workspaces.map(workspace => workspace.name)))
if (!Array.isArray(selected) || !selected.length || selected.some(name => !workspaces.some(workspace => workspace.name === name))) {
  throw new Error('CI_PACKAGES must contain known workspace names')
}
const requested = new Set(selected)
// Typecheck/build need the selected packages' dependencies, while tests only
// need affected packages (Turbo test already builds prerequisite dependencies).
let expanded = true
while (expanded) {
  expanded = false
  for (const workspace of workspaces.filter(workspace => requested.has(workspace.name))) {
    for (const dependency of workspace.dependencies) {
      if (!requested.has(dependency)) { requested.add(dependency); expanded = true }
    }
  }
}
const task = process.argv[2]
if (!['lint', 'typecheck', 'build', 'test'].includes(task)) throw new Error('Unknown CI source task')
let names = task === 'test' ? selected : [...requested]
if (task === 'lint') names = names.filter(name => {
  const { scripts } = workspaces.find(workspace => workspace.name === name)
  return scripts.lint && scripts.lint !== scripts.typecheck
})
if (!names.length) {
  console.log('Lint is identical to typecheck in selected packages; running it once in the typecheck step.')
} else {
  const args = ['exec', 'turbo', 'run', task, ...names.map(name => `--filter=${name}`)]
  if (task === 'lint' || task === 'typecheck') args.push('--only')
  if (task === 'test') args.push('--concurrency=2')
  console.log(`CI ${task}: ${names.join(', ')}`)
  if (process.argv.includes('--dry-run')) args.push('--dry-run=json')
  // pnpm supplies either a JS entrypoint or a standalone executable. Invoke
  // it directly, avoiding cmd.exe and shell interpolation on Windows.
  if (!process.env.npm_execpath) throw new Error('Run this script through pnpm ci:source')
  const executable = process.env.npm_execpath
  const script = /\.(?:cjs|mjs|js)$/i.test(executable)
  const result = spawnSync(script ? process.execPath : executable, script ? [executable, ...args] : args, { cwd: root, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
