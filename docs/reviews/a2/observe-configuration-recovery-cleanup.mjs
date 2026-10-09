import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const runs = ['a2-5e2b151d', 'a2-7e910b69', 'a2-e9a97c5f', 'a2-99deca8f', 'a2-lite-179f2a01']
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
const inspect = args => {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true })
  return { args, code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}
const records = runs.map(runId => {
  const directory = resolve(import.meta.dirname, 'runs', runId), receipt = json(resolve(directory, 'receipts.json'))
  const containers = inspect(['ps', '-aq', '--filter', `label=workmesh.task=${runId}`])
  const record = { runId, originalReceipt: `runs/${runId}/receipts.json`, containers, taskContainersAbsent: containers.code === 0 && containers.stdout === '' }
  if (receipt.installationContainerIds) {
    const project = inspect(['ps', '-aq', '--filter', `label=com.docker.compose.project=${runId}`])
    const volumes = inspect(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${runId}`])
    const networks = inspect(['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${runId}`])
    const ca = inspect(['volume', 'inspect', '--format', '{{.Name}}', `${runId}-ca`])
    const image = inspect(['image', 'inspect', '--format', '{{.Id}}', `workmesh-a2-lite:${runId}`])
    const paths = json(resolve(directory, 'cleanup-path-receipts.json')).map(entry => ({ path: entry.path, operationCode: entry.code, existsNow: existsSync(entry.path) }))
    Object.assign(record, { project, volumes, networks, ca, image, paths,
      composeResourcesAbsent: [project, volumes, networks].every(item => item.code === 0 && item.stdout === ''),
      caAndImageAbsent: [ca, image].every(item => item.code === 1 && /no such (volume|object|image)/i.test(item.stderr)), pathsAbsent: paths.every(item => !item.existsNow) })
  }
  return record
})
writeFileSync(resolve(import.meta.dirname, 'configuration-recovery/cleanup-readback.json'), JSON.stringify({ observedAt: new Date().toISOString(), scope: '本轮五个实际 run 精确 label 的只读核验，无删除；原逐 ID/path 操作回执不被汇总替代', records }, null, 2) + '\n')
if (records.some(item => !item.taskContainersAbsent || item.composeResourcesAbsent === false || item.caAndImageAbsent === false || item.pathsAbsent === false)) throw Error('对象不存在读回未确认，保留实际结果')
console.log(JSON.stringify({ runs: records.length, allOwnedIdleResourcesAbsent: true, deletionPerformed: false }))
