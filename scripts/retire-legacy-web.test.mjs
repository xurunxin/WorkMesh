import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retireLegacyWeb } from './retire-legacy-web.mjs'

const id = 'a'.repeat(64)
const options = { project: 'private-upgrade', containerIds: [id], configFile: '/install/compose.yml', workingDirectory: '/install' }
function fixture(mutate = () => {}) {
  const state = { exists: true, stopped: false, commands: [], inspectCount: 0 }
  const container = () => ({ Id: id, Config: { Labels: {
    'com.docker.compose.project': options.project, 'com.docker.compose.service': 'web',
    'com.docker.compose.project.config_files': options.configFile,
    'com.docker.compose.project.working_dir': options.workingDirectory,
  } }, State: { Running: !state.stopped, Restarting: false, ExitCode: 0 }, Mounts: [{ Type: 'volume', Name: 'business-data' }] })
  const docker = args => {
    state.commands.push(args)
    let output = ''
    if (args[0] === 'ps') output = state.exists ? id : ''
    if (args[0] === 'inspect') {
      if (!state.exists) return { status: 1, stdout: '' }
      const value = container(); state.inspectCount++; mutate(value, state); output = JSON.stringify([value])
    }
    if (args[0] === 'volume') output = JSON.stringify([{ Name: 'business-data', Labels: { owner: 'business' } }])
    if (args[0] === 'stop') state.stopped = true
    if (args[0] === 'rm') state.exists = false
    return { status: 0, stdout: output }
  }
  return { state, docker }
}
test('only the full inspected legacy Web IDs are removed, without volumes', () => {
  const { state, docker } = fixture()
  const receipt = retireLegacyWeb(options, docker)
  assert.equal(receipt.webAbsent, true)
  assert.deepEqual(receipt.removedVolumes, [])
  assert.deepEqual(state.commands.filter(args => ['stop', 'rm'].includes(args[0])), [['stop', '--time', '35', id], ['rm', id]])
  assert.equal(receipt.retainedVolumes[0].Name, 'business-data')
})
for (const [name, mutate] of [
  ['another project', value => { value.Config.Labels['com.docker.compose.project'] = 'other' }],
  ['another service', value => { value.Config.Labels['com.docker.compose.service'] = 'worker' }],
  ['another configuration', value => { value.Config.Labels['com.docker.compose.project.config_files'] = '/other.yml' }],
  ['another working directory', value => { value.Config.Labels['com.docker.compose.project.working_dir'] = '/other' }],
  ['identity changed just before stop', (value, state) => { if (state.inspectCount === 2) value.Config.Labels['com.docker.compose.service'] = 'api' }],
]) test(`reject ${name} before any mutation`, () => {
  const { state, docker } = fixture(mutate)
  assert.throws(() => retireLegacyWeb(options, docker), /IDENTITY_MISMATCH/)
  assert.equal(state.commands.some(args => ['stop', 'rm'].includes(args[0])), false)
})
test('unlisted orphan refuses the entire operation', () => {
  const { state, docker } = fixture()
  assert.throws(() => retireLegacyWeb(options, args => args[0] === 'ps'
    ? { status: 0, stdout: `${id}\n${'b'.repeat(64)}` } : docker(args)), /INVENTORY_CHANGED/)
  assert.equal(state.commands.some(args => ['stop', 'rm'].includes(args[0])), false)
})
test('receipts exclude container credentials, commands, custom labels and volume driver options', () => {
  const secret = 'fixture-secret-not-a-real-credential'
  const { docker } = fixture(value => {
    value.Config.Env = [`SESSION_SECRET=${secret}`]
    value.Config.Cmd = [secret]
    value.Config.Labels['private-label'] = secret
  })
  const receipt = retireLegacyWeb(options, args => args[0] === 'volume'
    ? { status: 0, stdout: JSON.stringify([{ Name: 'business-data', Options: { password: secret }, Labels: { private: secret } }]) }
    : docker(args))
  assert.equal(JSON.stringify(receipt).includes(secret), false)
  assert.equal(receipt.before[0].Config.Labels['com.docker.compose.project'], options.project)
  assert.equal(receipt.retainedVolumes[0].Name, 'business-data')
})
test('failed graceful stop preserves the container', () => {
  const { state, docker } = fixture((value, current) => { if (current.stopped) value.State.ExitCode = 137 })
  assert.throws(() => retireLegacyWeb(options, docker), /STOP_UNCONFIRMED/)
  assert.equal(state.exists, true)
  assert.equal(state.commands.some(args => args[0] === 'rm'), false)
})
