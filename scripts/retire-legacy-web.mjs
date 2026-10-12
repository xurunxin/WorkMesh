import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Only the explicitly inspected legacy Web containers belong to this operation.
// Never remove a volume, a network, another service, or an unlisted orphan.
export function retireLegacyWeb({ project, containerIds, configFile, workingDirectory }, docker) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(project ?? '') || !configFile || !workingDirectory
    || !containerIds?.length || containerIds.some(id => !/^[a-f0-9]{64}$/.test(id))
    || new Set(containerIds).size !== containerIds.length) throw Error('LEGACY_WEB_IDENTITY_REQUIRED')
  const call = args => {
    const result = docker(args)
    if (result.status !== 0) throw Error(`LEGACY_WEB_DOCKER_FAILED: ${args[0]}`)
    return result.stdout.trim()
  }
  const discover = () => call(['ps', '-aq', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`,
    '--filter', 'label=com.docker.compose.service=web']).split(/\r?\n/).filter(Boolean).sort()
  const inspect = id => JSON.parse(call(['inspect', id]))[0]
  const authorize = container => {
    const labels = container?.Config?.Labels ?? {}
    if (!containerIds.includes(container?.Id) || labels['com.docker.compose.project'] !== project
      || labels['com.docker.compose.service'] !== 'web'
      || labels['com.docker.compose.project.config_files'] !== configFile
      || labels['com.docker.compose.project.working_dir'] !== workingDirectory)
      throw Error('LEGACY_WEB_IDENTITY_MISMATCH')
  }
  if (JSON.stringify(discover()) !== JSON.stringify([...containerIds].sort())) throw Error('LEGACY_WEB_INVENTORY_CHANGED')
  const before = containerIds.map(inspect)
  before.forEach(authorize)
  const volumeNames = [...new Set(before.flatMap(container => container.Mounts
    .filter(mount => mount.Type === 'volume').map(mount => mount.Name)))].sort()
  const volumes = () => volumeNames.map(name => JSON.parse(call(['volume', 'inspect', name]))[0])
  const retainedVolumes = volumes()
  // Re-read all identity fields immediately before the first mutation.
  containerIds.map(inspect).forEach(authorize)
  call(['stop', '--time', '35', ...containerIds])
  const stopped = containerIds.map(inspect)
  for (const container of stopped) {
    authorize(container)
    if (container.State.Running || container.State.Restarting || container.State.ExitCode !== 0)
      throw Error('LEGACY_WEB_STOP_UNCONFIRMED')
  }
  call(['rm', ...containerIds]) // No -v, no force, no Compose down.
  if (discover().length) throw Error('LEGACY_WEB_STILL_PRESENT')
  for (const id of containerIds) if (docker(['inspect', id]).status === 0) throw Error('LEGACY_WEB_STILL_PRESENT')
  if (JSON.stringify(volumes()) !== JSON.stringify(retainedVolumes)) throw Error('LEGACY_WEB_VOLUME_CHANGED')
  // An operational receipt must not copy Config.Env, command arguments, custom
  // labels or volume driver options: old deployments can contain credentials.
  const identityLabels = labels => Object.fromEntries([
    'com.docker.compose.project', 'com.docker.compose.service',
    'com.docker.compose.project.config_files', 'com.docker.compose.project.working_dir',
  ].filter(key => labels?.[key] !== undefined).map(key => [key, labels[key]]))
  const snapshot = container => ({ Id: container.Id, Image: container.Image,
    Config: { Labels: identityLabels(container.Config.Labels) },
    State: { Running: container.State.Running, Restarting: container.State.Restarting, ExitCode: container.State.ExitCode },
    Mounts: container.Mounts.map(({ Type, Name, Destination, RW }) => ({ Type, Name, Destination, RW })),
    Ports: container.NetworkSettings?.Ports })
  return { project, containerIds, configFile, workingDirectory, before: before.map(snapshot), stopped: stopped.map(snapshot),
    retainedVolumes: retainedVolumes.map(({ Name, Driver, Scope, CreatedAt }) => ({ Name, Driver, Scope, CreatedAt })),
    webAbsent: true, removedVolumes: [] }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { containerIds: [] }
  for (const argument of process.argv.slice(2)) {
    const match = /^--(project|container|config-file|working-directory)=(.+)$/.exec(argument)
    if (!match) throw Error('Usage: node retire-legacy-web.mjs --project=<project> --container=<full-id> --config-file=<old-compose-label> --working-directory=<old-directory-label>')
    const keys = { project: 'project', 'config-file': 'configFile', 'working-directory': 'workingDirectory' }
    if (match[1] === 'container') options.containerIds.push(match[2])
    else { if (options[keys[match[1]]]) throw Error('Duplicate identity argument'); options[keys[match[1]]] = match[2] }
  }
  console.log(JSON.stringify(retireLegacyWeb(options, args => spawnSync('docker', args,
    { encoding: 'utf8', windowsHide: true })), null, 2))
}
