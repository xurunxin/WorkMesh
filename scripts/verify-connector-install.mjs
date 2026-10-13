import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
if (process.platform !== 'linux' || args.length !== 2 || args[0] !== '--artifacts') throw new Error('Use --artifacts <release-directory> on native Linux')
const directory = resolve(args[1]), m = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
const arch = process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : ''
if (!arch || m.arch !== arch) throw new Error('Native artifact architecture mismatch')
const result = spawnSync('python3', ['scripts/connector-install/run.py', '--arch', arch, '--artifacts', directory,
  '--source', m.sourceCommit, '--root', resolve('ci-logs/connector-install/guest')], { stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
