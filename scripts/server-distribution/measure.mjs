import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

export function sampleDeployment(project, installationId) {
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(project)) throw Error('MEASUREMENT_PROJECT_INVALID')
  if (!/^[a-f0-9-]{36}$/.test(installationId)) throw Error('MEASUREMENT_INSTALLATION_INVALID')
  const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const ids = docker(['ps', '-aq', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean)
  if (!ids.length) throw Error('MEASUREMENT_DEPLOYMENT_MISSING')
  const inspect = JSON.parse(docker(['inspect', ...ids]))
  if (inspect.some(info => info.Config.Labels?.['io.workmesh.installation'] !== installationId)) throw Error('MEASUREMENT_OWNERSHIP_MISMATCH')
  return { capturedAt: new Date().toISOString(), project,
    statistics: docker(['stats', '--no-stream', '--format', '{{json .}}', ...ids]).split('\n').filter(Boolean).map(line => JSON.parse(line)),
    state: inspect.map(info => ({ id: info.Id, service: info.Config.Labels['com.docker.compose.service'],
      imageId: info.Image, oomKilled: info.State.OOMKilled, restartCount: info.RestartCount, status: info.State.Status,
      memoryLimit: info.HostConfig.Memory, cpuQuota: info.HostConfig.CpuQuota, cpuPeriod: info.HostConfig.CpuPeriod,
      volumes: info.Mounts.filter(mount => mount.Type === 'volume').map(mount => mount.Name) })) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const project = process.argv[2], installationId = process.argv[3], output = process.argv[4]
  if (!output) throw Error('MEASUREMENT_OUTPUT_REQUIRED')
  await writeFile(output, JSON.stringify(sampleDeployment(project, installationId), null, 2) + '\n', { mode: 0o600, flag: 'wx' })
}
