import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

// 只从精确 Git 提交构建；安装目录没有源码、node_modules 或源码挂载。
const root = resolve(import.meta.dirname, '..')
const deploymentClass = process.env.WORKMESH_VALIDATION_CLASS === 'production' ? 'production' : 'lite'
const composeFile = `docker-compose.${deploymentClass}.yml`
const runId = `backend-${deploymentClass}-${randomUUID().slice(0, 8)}`
const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('缺少精确 Git 提交')
const evidence = resolve(root, 'docs/reviews/backend-retirement/runs', runId)
const installDir = resolve(tmpdir(), runId)
mkdirSync(evidence, { recursive: true })
const receipts = { runId, sha, deploymentClass, environment: '工作站 Linux Docker；非真实低功耗设备', installDir, resources: [], results: [], outcome: '未运行' }
const writeEvidence = (path, bytes) => {
  for (let attempt = 0; ; attempt++) {
    try { writeFileSync(path, bytes); return } catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error.code) || attempt >= 40) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
}
const save = () => writeEvidence(resolve(evidence, 'receipts.json'), JSON.stringify(receipts, null, 2))
const secretValues = Array.from({ length: 7 }, () => randomBytes(32).toString('hex'))
const bootstrap = randomBytes(32).toString('base64url'); secretValues.push(bootstrap)
const redact = value => secretValues.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), String(value))
const env = { ...process.env, WORKMESH_LITE_IMAGE: `workmesh-a2-lite:${runId}`, WORKMESH_BUILD_SHA: sha,
  POSTGRES_PASSWORD: secretValues[0], SESSION_SECRET: secretValues[1], WORKMESH_MASTER_KEY: secretValues[2], WORKMESH_BOOTSTRAP_TOKEN: bootstrap,
  PAGINATION_CURSOR_KEYS: `a2:${secretValues[3]}`, PAGINATION_CURSOR_ACTIVE_KID: 'a2', AUTH_RATE_LIMIT_HMAC_KEY: secretValues[4],
  MINIO_ROOT_USER: 'a2-lite', MINIO_ROOT_PASSWORD: secretValues[5], S3_ACCESS_KEY_ID: 'a2-lite', S3_SECRET_ACCESS_KEY: secretValues[5],
  S3_BUCKET: runId, S3_REGION: 'us-east-1', WORKMESH_BETA_GITEA: 'true', WORKMESH_BIND_ADDRESS: '127.0.0.1', POSTGRES_DB: 'workmesh_a2_lite_test' }
// 仅开启本轮 Gitea 固定夹具和已存在的配对/MCP合同；其他领域保持关闭。
const disabledFeatures = ['WORKMESH_BETA_PLANNING', 'WORKMESH_BETA_TEMPLATES', 'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_OPERATIONS_UI', 'WORKMESH_BETA_COORDINATION_MCP', 'WORKMESH_BETA_MODEL_PRESETS',
  'WORKMESH_EXPERIMENTAL_AUTOMATION', 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', 'WORKMESH_EXPERIMENTAL_A2A',
  'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', 'WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS']
for (const feature of disabledFeatures) env[feature] = 'false'
env.WORKMESH_BETA_COORDINATION_MCP = 'true'
env.WORKMESH_MODEL_PRESETS_FILE = ''
receipts.buildContext = { source: sha, paths: ['.dockerignore', '.node-version', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'README.md', 'AGENTS.md', 'CONTEXT.md', 'apps', 'packages', 'scripts', 'skills', 'infra'], reason: '历史证据保留在 Git，不复制进镜像构建上下文' }
receipts.features = { ...Object.fromEntries(disabledFeatures.map(feature => [feature, false])), WORKMESH_BETA_GITEA: true, WORKMESH_BETA_COORDINATION_MCP: true }
const command = (name, args, options = {}) => new Promise(resolveResult => {
  const startedAt = new Date().toISOString(); let output = ''
  const child = spawn(name, args, { cwd: root, env, windowsHide: true, ...options })
  const stdout = new StringDecoder('utf8'), stderr = new StringDecoder('utf8')
  const index = receipts.results.length
  const progress = setInterval(() => {
    try { writeEvidence(resolve(evidence, `${index}.log`), redact(output).slice(0, -128)) }
    catch (error) { if (!['EBUSY', 'EPERM'].includes(error.code)) console.error(redact(error)) }
  }, 1000)
  child.stdout?.on('data', value => { output += stdout.write(value) }); child.stderr?.on('data', value => { output += stderr.write(value) })
  child.stdin?.on('error', error => { output += String(error) })
  child.on('error', error => { output += String(error) })
  child.on('close', code => {
    clearInterval(progress); output += stdout.end() + stderr.end()
    const log = `${receipts.results.length}.log`; writeEvidence(resolve(evidence, log), redact(output))
    receipts.results.push({ name, args: args.map(redact), pid: child.pid, startedAt, endedAt: new Date().toISOString(), code, log }); save()
    console.log(JSON.stringify({ name, args: args.map(redact), code, log })); resolveResult({ code, output })
  })
  options.input?.pipe(child.stdin)
})
const must = async (name, args, options) => { const result = await command(name, args, options); if (result.code !== 0) throw Error(`${name} 退出 ${result.code}`); return result.output.trim() }
const pause = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))
const port = () => new Promise(resolvePort => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)) }) })
const register = (type, target) => { const value = { type, target, owner: runId, createdAt: new Date().toISOString(), cleanup: null }; receipts.resources.push(value); save(); return value }
let provider
const composeArgs = ['compose', '--project-name', runId, '-f', resolve(installDir, composeFile), '-f', resolve(installDir, 'provider.override.yml')]
let composeStarted = false
try {
  const directory = register('directory', installDir); mkdirSync(installDir); directory.realPath = realpathSync(installDir); directory.created = true; save()
  const builder = register('builder', runId)
  const previousBuilder = await command('docker', ['buildx', 'inspect', runId])
  if (previousBuilder.code === 0 || !/no builder|not found/i.test(previousBuilder.output)) throw Error('专用 builder 的不存在状态未确认')
  await must('docker', ['buildx', 'create', '--name', runId, '--driver', 'docker-container', '--driver-opt', 'memory=4g', '--driver-opt', 'memory-swap=4g'])
  builder.created = true
  builder.containerName = `buildx_buildkit_${runId}0`
  save()
  await must('docker', ['buildx', 'inspect', '--bootstrap', runId])
  builder.containerId = await must('docker', ['inspect', '--format', '{{.Id}}', builder.containerName])
  save()
  const services = deploymentClass === 'production' ? ['api', 'worker', 'mcp'] : ['lite']
  const images = new Map()
  for (const service of services) {
    const variable = service === 'lite' ? 'WORKMESH_LITE_IMAGE' : `WORKMESH_${service.toUpperCase()}_IMAGE`
    const supplied = deploymentClass === 'production' ? process.env[variable] : undefined
    const image = register('image', supplied || `workmesh-retirement-${service}:${runId}`)
    image.borrowed = Boolean(supplied)
    env[variable] = image.target
    if (!supplied) {
      const previous = await command('docker', ['image', 'inspect', image.target])
      if (previous.code === 0 || !/no such (image|object)/i.test(previous.output)) throw Error('专用镜像 tag 不存在状态未确认')
      const archiveArgs = ['-c', 'core.autocrlf=false', 'archive', '--format=tar', sha, '.dockerignore', '.node-version', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.base.json', 'OPENAPI.yaml', 'SCHEMA.sql', 'AGENT_PROTOCOL.md', 'README.md', 'AGENTS.md', 'CONTEXT.md', 'apps', 'packages', 'scripts', 'skills', 'infra']
      const archive = spawn('git', archiveArgs, { cwd: root, windowsHide: true })
      let archiveError = ''
      archive.stderr.on('data', value => { archiveError += value })
      const archived = new Promise(done => archive.on('close', code => done(code)))
      try {
        await must('docker', ['buildx', 'build', '--builder', runId, '--load', '--progress=plain', '--label', `workmesh.task=${runId}`, '--build-arg', `WORKMESH_BUILD_SHA=${sha}`,
          '-t', image.target, '-f', `infra/docker/${service === 'lite' ? 'lite' : service + '.production'}.Dockerfile`, '-'], { input: archive.stdout })
      } finally { archive.stdout.destroy(); await archived }
      if (await archived !== 0) throw Error(`Git archive 失败：${archiveError}`)
    }
    image.id = await must('docker', ['image', 'inspect', '--format', '{{.Id}}', image.target])
    const revision = await must('docker', ['image', 'inspect', '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}', image.id])
    if (revision !== sha) throw Error('镜像源提交与当前 HEAD 不一致')
    images.set(service, image); save()
    const tar = resolve(installDir, `workmesh-${service}.tar`); register('file', tar)
    await must('docker', ['save', '-o', tar, image.target]); await must('docker', ['load', '-i', tar])
    if (await must('docker', ['image', 'inspect', '--format', '{{.Id}}', image.target]) !== image.id) throw Error('save/load 镜像身份变化')
  }
  const image = images.get(deploymentClass === 'production' ? 'api' : 'lite')
  const roleEnv = { ...env, DATABASE_URL: `postgres://workmesh:${secretValues[0]}@127.0.0.1:1/workmesh_a2_lite_test`,
    REDIS_URL: 'redis://127.0.0.1:1', S3_ENDPOINT: 'http://127.0.0.1:1', WEB_ORIGIN: 'http://127.0.0.1:3001' }
  // Inherited team secrets do not belong in entrypoint probes.
  const roleKeys = ['WORKMESH_BUILD_SHA', 'SESSION_SECRET', 'WORKMESH_MASTER_KEY', 'WORKMESH_BOOTSTRAP_TOKEN', 'PAGINATION_CURSOR_KEYS', 'PAGINATION_CURSOR_ACTIVE_KID', 'AUTH_RATE_LIMIT_HMAC_KEY', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET', 'S3_REGION', 'WORKMESH_BETA_GITEA', 'DATABASE_URL', 'REDIS_URL', 'S3_ENDPOINT', 'WEB_ORIGIN']
  for (const role of ['migrate', 'api', 'worker']) {
    const container = register('container', `${runId}-probe-${role}`)
    container.id = await must('docker', ['run', '-d', '--name', container.target, '--label', `workmesh.task=${runId}`, '-e', `WORKMESH_SERVICE=${role}`, ...roleKeys.flatMap(key => ['-e', key]), (images.get(role === 'migrate' ? 'api' : role) ?? image).target], { env: roleEnv })
    await pause(12000)
    const log = await must('docker', ['logs', container.id])
    if (!log.includes(`role=${role} `) || /Cannot find (module|package)|MODULE_NOT_FOUND|ENOENT/.test(log)) throw Error(`${role} 未成功加载入口`)
    save()
  }
  copyFileSync(resolve(root, composeFile), resolve(installDir, composeFile))
  const tls = resolve(installDir, 'tls'); mkdirSync(tls)
  await must('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', resolve(tls, 'key.pem'), '-out', resolve(tls, 'ca.pem'), '-days', '1', '-subj', '/CN=host.docker.internal', '-addext', 'subjectAltName=DNS:host.docker.internal,DNS:localhost,IP:127.0.0.1'])
  // Copy only the public CA through Docker's API; do not change host file sharing.
  const caVolume = register('volume', `${runId}-ca`)
  const previousVolume = await command('docker', ['volume', 'inspect', caVolume.target])
  if (previousVolume.code === 0 || !/no such (volume|object)/i.test(previousVolume.output)) throw Error('测试 CA 卷的不存在状态未确认；保留既有卷')
  await must('docker', ['volume', 'create', '--label', `workmesh.task=${runId}`, caVolume.target]); caVolume.created = true; save()
  if (await must('docker', ['volume', 'inspect', '--format', '{{ index .Labels "workmesh.task" }}', caVolume.target]) !== runId) throw Error('测试 CA 卷归属不符')
  const caLoader = register('container', `${runId}-ca-loader`)
  caLoader.id = await must('docker', ['create', '--name', caLoader.target, '--label', `workmesh.task=${runId}`, '--mount', `type=volume,source=${caVolume.target},target=/a2-ca`, '--entrypoint', 'node', image.target, '-e', "require('node:fs').readFileSync('/a2-ca/ca.pem'); console.log('test CA readable')"]); save()
  await must('docker', ['cp', resolve(tls, 'ca.pem'), `${caLoader.id}:/a2-ca/ca.pem`])
  await must('docker', ['start', '-a', caLoader.id])
  const providerPort = await port()
  provider = createServer({ key: readFileSync(resolve(tls, 'key.pem')), cert: readFileSync(resolve(tls, 'ca.pem')) }, (request, response) => {
    if (request.headers.authorization !== 'token a2-provider-placeholder') { response.writeHead(401).end(); return }
    const url = new URL(request.url, 'https://localhost')
    if (request.method === 'GET' && url.pathname === '/api/v1/repos/a2/fixture/contents/AGENTS.md' && url.searchParams.get('ref') === 'a2-base-sha') {
      const content = '# 固定测试仓库指导原件\n'; response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ encoding: 'base64', sha: createHash('sha1').update(content).digest('hex'), content: Buffer.from(content).toString('base64') }))
    } else response.writeHead(404).end()
  })
  await new Promise(resolveListen => provider.listen(providerPort, '0.0.0.0', resolveListen))
  register('https-provider', `host.docker.internal:${providerPort}`)
  env.WORKMESH_A2_GITEA_URL = `https://host.docker.internal:${providerPort}`
  env.API_HOST_PORT = String(await port()); env.S3_HOST_PORT = String(await port()); env.MCP_HOST_PORT = String(await port())
  env.PUBLIC_MCP_ORIGIN = `http://127.0.0.1:${env.MCP_HOST_PORT}`
  env.WEB_ORIGIN = `http://127.0.0.1:${env.API_HOST_PORT}`; env.S3_PUBLIC_ENDPOINT = `http://host.docker.internal:${env.S3_HOST_PORT}`
  // 仅追加本测试 CA 和 feature；不修正原 Lite RustFS 凭证映射或其他安装合同。
  writeFileSync(resolve(installDir, 'provider.override.yml'), `services:\n  worker:\n    environment:\n      NODE_EXTRA_CA_CERTS: /a2-ca/ca.pem\n    volumes:\n      - a2-test-ca:/a2-ca:ro\nvolumes:\n  a2-test-ca:\n    external: true\n    name: ${caVolume.target}\n`)
  register('compose-project', runId); composeStarted = true
  await must('docker', [...composeArgs, 'up', '-d', '--wait', '--wait-timeout', '180', 'api', 'worker', ...(deploymentClass === 'production' ? ['mcp'] : [])], { cwd: installDir })
  const containers = await must('docker', [...composeArgs, 'ps', '-q']); receipts.installationContainerIds = containers.split(/\r?\n/); save()
  for (const containerId of receipts.installationContainerIds) {
    const mounts = JSON.parse(await must('docker', ['inspect', '--format', '{{json .Mounts}}', containerId]))
    if (mounts.some(mount => mount.Type === 'bind')) throw Error('无源码安装不得包含主机绑定挂载')
    if (mounts.some(mount => mount.Destination === '/a2-ca' && (mount.Name !== caVolume.target || mount.RW))) throw Error('测试 CA 卷的归属或只读属性不符')
  }
  // Exercise the exposed API before installing the private test workspace.
  const installStatus = await must(process.execPath, ['-e', "fetch(process.env.WEB_ORIGIN+'/api/v1/install-status').then(async r=>{const body=await r.json();if(r.status!==200||body.installed!==false)throw Error('Fresh Lite installation status failed');process.stdout.write(JSON.stringify({status:r.status,body}))}).catch(e=>{console.error(e);process.exit(1)})"])
  receipts.preInstallApi = { ...JSON.parse(installStatus), at: new Date().toISOString() }; save()
  const apiContainer = await must('docker', [...composeArgs, 'ps', '-q', 'api'])
  const assetPath = deploymentClass === 'production' ? '/app/assets/skills/workmesh-1.1.0.md' : '/opt/workmesh/api/assets/skills/workmesh-1.1.0.md'
  const inImage = await must('docker', ['exec', apiContainer, 'node', '-e', `process.stdout.write(require('node:fs').readFileSync('${assetPath}').toString('base64'))`])
  const tracked = spawnSync('git', ['cat-file', 'blob', `${sha}:apps/api/assets/skills/workmesh-1.1.0.md`], { cwd: root })
  if (tracked.status !== 0 || !Buffer.from(inImage, 'base64').equals(tracked.stdout)) throw Error('实际 API 镜像 Skill 字节与提交 blob 不符')
  receipts.skillBlob = { sha256: createHash('sha256').update(tracked.stdout).digest('hex'), imageId: image.id, assetPath }; save()
  env.WORKMESH_VERIFY_MCP = deploymentClass === 'production' ? 'true' : 'false'
  await must(process.execPath, [resolve(root, 'scripts/verify-a2-backend-lite-api.mjs')])
  receipts.outcome = '本机无源码纯后端安装、真实 worker、TLS 和签名 Skill 通过；真实低功耗设备与真实厂商未测'
} catch (error) { receipts.outcome = `失败或未验收：${redact(error)}`; console.error(receipts.outcome); process.exitCode = 1; save() }
finally {
  let servicesStopped = true
  if (composeStarted) {
    await command('docker', [...composeArgs, 'ps', '-a', '--format', 'json'], { cwd: installDir })
    await command('docker', [...composeArgs, 'logs', '--no-color'], { cwd: installDir })
    const project = receipts.resources.find(item => item.type === 'compose-project')
    const owned = []
    for (const [kind, list] of [['container', ['ps', '-aq']], ['volume', ['volume', 'ls', '-q']], ['network', ['network', 'ls', '-q']]]) {
      const listed = await command('docker', [...list, '--filter', `label=com.docker.compose.project=${runId}`])
      if (listed.code !== 0) { servicesStopped = false; continue }
      for (const id of listed.output.trim().split(/\r?\n/).filter(Boolean)) {
        const args = kind === 'container' ? ['inspect'] : [kind, 'inspect']
        const checked = await command('docker', [...args, '--format', kind === 'container' ? '{{ index .Config.Labels "com.docker.compose.project" }}' : '{{ index .Labels "com.docker.compose.project" }}', id])
        owned.push({ kind, id, owner: checked.output.trim(), code: checked.code, at: new Date().toISOString() })
        if (checked.code !== 0 || checked.output.trim() !== runId) servicesStopped = false
      }
    }
    project.preDelete = { projectName: runId, directory: installDir, resources: owned, activity: '验收已结束，已保全 ps/logs，逐资源核对 project label', at: new Date().toISOString() }; save()
    if (servicesStopped) {
      project.cleanup = await command('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans'], { cwd: installDir })
      servicesStopped = project.cleanup.code === 0
      project.postDelete = []
      for (const resource of owned) {
        const args = resource.kind === 'container' ? ['inspect'] : [resource.kind, 'inspect']
        const checked = await command('docker', [...args, resource.id])
        const absent = checked.code !== 0 && /no such (object|container|volume|network)|not found/i.test(checked.output)
        project.postDelete.push({ kind: resource.kind, id: resource.id, code: checked.code, absent, at: new Date().toISOString() })
        if (!absent) servicesStopped = false
      }
    } else project.cleanup = '资源归属未全部确认，保留 compose 与安装目录'
    save()
  }
  if (provider) { await new Promise(resolveClose => provider.close(resolveClose)); receipts.resources.find(item => item.type === 'https-provider').cleanup = '已关闭'; save() }
  for (const resource of receipts.resources.toReversed()) {
    if (resource.type === 'builder' && resource.created) {
      const identity = await command('docker', ['inspect', '--format', '{{.Id}}', resource.containerName])
      resource.preDelete = { expectedId: resource.containerId, actualId: identity.output.trim(), code: identity.code, activity: '专用构建已结束；核对本人 builder 容器身份', at: new Date().toISOString() }; save()
      resource.cleanup = identity.code === 0 && identity.output.trim() === resource.containerId ? await command('docker', ['buildx', 'rm', resource.target]) : 'builder 身份未知，保留'
      if (typeof resource.cleanup !== 'object' || resource.cleanup.code !== 0) servicesStopped = false
      resource.postDelete = []
      for (const [kind, target] of [['container', resource.containerId], ['volume', `${resource.containerName}_state`]]) {
        const result = await command('docker', [kind, 'inspect', target])
        const absent = result.code !== 0 && /no such (object|container|volume)/i.test(result.output)
        resource.postDelete.push({ kind, target, absent, code: result.code })
        if (!absent) servicesStopped = false
      }
      save()
    }
    if (resource.type === 'container' && resource.id) {
      const owner = await command('docker', ['inspect', '--format', '{{ index .Config.Labels "workmesh.task" }}', resource.id])
      resource.preDelete = { owner: owner.output.trim(), code: owner.code, id: resource.id, at: new Date().toISOString() }; save()
      resource.cleanup = owner.code === 0 && owner.output.trim() === runId ? await command('docker', ['rm', '-f', '-v', resource.id]) : '归属未知，保留'; save()
      if (typeof resource.cleanup !== 'object' || resource.cleanup.code !== 0) servicesStopped = false
    }
    if (resource.type === 'volume' && resource.created) {
      const owner = await command('docker', ['volume', 'inspect', '--format', '{{ index .Labels "workmesh.task" }}', resource.target])
      const references = await command('docker', ['ps', '-aq', '--filter', `volume=${resource.target}`])
      resource.preDelete = { owner: owner.output.trim(), referenceIds: references.output.trim().split(/\r?\n/).filter(Boolean), activity: 'compose 已结束，CA 装载容器已清理；核对外部测试卷引用', at: new Date().toISOString() }; save()
      resource.cleanup = servicesStopped && owner.code === 0 && owner.output.trim() === runId && references.code === 0 && !references.output.trim() ? await command('docker', ['volume', 'rm', resource.target]) : '归属或活动引用未确认，保留'; save()
      if (typeof resource.cleanup !== 'object' || resource.cleanup.code !== 0) servicesStopped = false
    }
    if (resource.type === 'image' && resource.id && !resource.borrowed) {
      const owner = await command('docker', ['image', 'inspect', '--format', '{{ index .Config.Labels "workmesh.task" }}', resource.id])
      const references = await command('docker', ['ps', '-aq', '--filter', `ancestor=${resource.id}`])
      resource.preDelete = { owner: owner.output.trim(), id: resource.id, referenceIds: references.output.trim().split(/\r?\n/).filter(Boolean), activity: '核对专用镜像实际容器引用', at: new Date().toISOString() }; save()
      resource.cleanup = servicesStopped && references.code === 0 && !references.output.trim() && owner.code === 0 && owner.output.trim() === runId ? await command('docker', ['image', 'rm', resource.target]) : '归属或活动引用未确认，保留'; save()
    }
  }
  // Windows 递归删除前验证绝对路径、临时目录边界和整棵树无链接，先落完整逐 path 清单。
  const directory = receipts.resources.find(item => item.type === 'directory')
  if (directory?.created && existsSync(installDir) && servicesStopped) {
    const paths = []; const walk = path => { const stat = lstatSync(path); if (stat.isSymbolicLink()) throw Error(`链接边界：${path}`); paths.push({ path, type: stat.isDirectory() ? 'directory' : 'file', reason: '本任务独有安装/归档/测试 TLS 原件，服务已停止' }); if (stat.isDirectory()) for (const entry of readdirSync(path)) walk(resolve(path, entry)) }
    try {
      if (!isAbsolute(installDir) || relative(realpathSync(tmpdir()), realpathSync(installDir)).startsWith('..') || dirname(installDir) !== resolve(tmpdir())) throw Error('临时目录边界未确认')
      walk(installDir); directory.preDelete = { paths, activity: 'compose/provider/probe 收尾完成', at: new Date().toISOString() }; save()
      const pathInventory = resolve(evidence, 'cleanup-paths.json')
      writeFileSync(pathInventory, JSON.stringify(paths.toReversed()))
      directory.cleanup = process.platform === 'win32' ? await command('powershell.exe', ['-NoProfile', '-Command', "$entries=Get-Content -LiteralPath $env:WORKMESH_A2_PATH_INVENTORY -Raw -Encoding UTF8 | ConvertFrom-Json; $receipts=@(); $failed=$false; foreach($entry in $entries) { try { Remove-Item -LiteralPath $entry.path -ErrorAction Stop; $receipts+=@{path=$entry.path;code=0;exists=(Test-Path -LiteralPath $entry.path)} } catch { $failed=$true; $receipts+=@{path=$entry.path;code=1;error=$_.Exception.Message}; break } }; ConvertTo-Json -InputObject $receipts -Depth 5 | Set-Content -LiteralPath $env:WORKMESH_A2_PATH_RECEIPTS -Encoding UTF8; if($failed) {exit 1}"], { env: { ...env, WORKMESH_A2_PATH_INVENTORY: pathInventory, WORKMESH_A2_PATH_RECEIPTS: resolve(evidence, 'cleanup-path-receipts.json') } })
        : await command(process.execPath, ['-e', "require('node:fs').rmSync(process.env.WORKMESH_A2_CLEANUP_PATH,{recursive:true})"], { env: { ...env, WORKMESH_A2_CLEANUP_PATH: installDir } })
    } catch (error) { directory.cleanup = `保留：${redact(error)}` }
  } else if (directory && existsSync(installDir)) directory.cleanup = '保留：仍有服务引用或收尾未确认'
  save(); console.log(`证据：${evidence}`)
}
