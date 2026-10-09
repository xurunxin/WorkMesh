import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = resolve(import.meta.dirname, 'runs/a2-24d1b785')
const json = file => JSON.parse(readFileSync(resolve(directory, file), 'utf8').replace(/^\uFEFF/, ''))
const receipt = json('receipts.json')
const observation = json('post-harness-failure-observation.json')
if (receipt.runId !== 'a2-24d1b785' || observation.ports.length || observation.recordedProcesses.length) throw Error('仍有活动引用或范围未确认，保留资源')
const save = () => writeFileSync(resolve(directory, 'receipts.json'), JSON.stringify(receipt, null, 2) + '\n')
const command = (name, args) => {
  const start = new Date().toISOString()
  const result = spawnSync(name, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 5_000_000 })
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  const log = `recovery-${receipt.results.length}.log`
  writeFileSync(resolve(directory, log), output)
  receipt.results.push({ name, args, start, end: new Date().toISOString(), code: result.status, log, purpose: '记录器崩溃后的登记收尾；不补写浏览器退出码' }); save()
  return { code: result.status, output }
}
receipt.outcome = '记录器 EBUSY 崩溃；浏览器最终退出码缺失，不计通过；单独归属收尾'
save()
for (const resource of receipt.resources.toReversed()) {
  if (resource.type !== 'container' || !resource.id || resource.owner !== receipt.runId) throw Error('资源范围异常，保留')
  if (resource.cleanup?.code === 0) {
    const checked = command('docker', ['inspect', resource.id])
    resource.postDeleteHistory = [...(resource.postDeleteHistory ?? []), resource.postDelete]
    resource.postDelete = { code: checked.code, absent: checked.code !== 0 && /no such (object|container)/i.test(checked.output), at: new Date().toISOString() }; save()
    if (!resource.postDelete.absent) throw Error('此前已清资源的不存在状态未确认')
    continue
  }
  const owner = command('docker', ['inspect', '--format', '{{ index .Config.Labels "workmesh.task" }}', resource.id])
  const mounts = command('docker', ['inspect', '--format', '{{json .Mounts}}', resource.id])
  resource.preDelete = { id: resource.id, owner: owner.output.trim(), exitCode: owner.code, mounts: mounts.code === 0 ? JSON.parse(mounts.output) : null,
    activity: '测试记录器已退出；只读端口/PID 观察无本轮服务，源码原件及异常已保全', observation: 'post-harness-failure-observation.json', at: new Date().toISOString() }; save()
  if (owner.code !== 0 || owner.output.trim() !== receipt.runId || mounts.code !== 0 || resource.preDelete.mounts.some(item => item.Type === 'bind')) throw Error('归属或挂载边界未确认，保留')
  resource.cleanup = command('docker', ['rm', '-f', '-v', resource.id]); save()
  const checked = command('docker', ['inspect', resource.id])
  resource.postDelete = { code: checked.code, absent: checked.code !== 0 && /no such (object|container)/i.test(checked.output), at: new Date().toISOString() }; save()
  if (resource.cleanup.code !== 0 || !resource.postDelete.absent) throw Error('收尾未确认')
}
const sanitized = command('powershell.exe', ['-NoProfile', '-File', resolve(import.meta.dirname, 'sanitize-evidence.ps1'), '-RunDirectory', directory])
if (sanitized.code !== 0) throw Error('脱敏未确认')
console.log(JSON.stringify({ runId: receipt.runId, containers: receipt.resources.map(item => ({ id: item.id, code: item.cleanup.code, absent: item.postDelete.absent })), sanitization: sanitized.code }))
