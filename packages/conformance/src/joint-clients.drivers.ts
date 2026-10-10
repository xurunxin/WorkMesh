import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve, join } from 'node:path'
import { promisify } from 'node:util'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'

const exec = promisify(execFile)
const metadata = (path: string) => {
  try { const value = statSync(path); return { path, bytes: value.size, mtimeMs: value.mtimeMs } }
  catch { return { path, exists: false } }
}
export async function createOpenCodeRuntime(options: { executable: string; evidenceRoot: string;
  modelUrl?: string; mcpUrl?: string; mcpHeaders?: Record<string, string>; allowedTools?: string[] }) {
  const root = resolve(options.evidenceRoot, `opencode-${randomUUID()}`)
  const paths = { config: join(root, 'config'), data: join(root, 'data'), state: join(root, 'state'), cache: join(root, 'cache'), work: mkdtempSync(join(tmpdir(), 'workmesh-m5-opencode-')), tmp: join(root, 'tmp') }
  for (const path of Object.values(paths)) mkdirSync(path, { recursive: true })
  const global = join(paths.config, 'opencode'); mkdirSync(global)
  const mcpHeaders = Object.fromEntries(Object.keys(options.mcpHeaders ?? {}).map((key, index) => [key, `{env:M5_MCP_HEADER_${index}}`]))
  const config = { update: 'disable', snapshots: false, model: 'm5-local/controlled',
    providers: { 'm5-local': { package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: options.modelUrl ?? 'http://127.0.0.1:1/v1', apiKey: 'm5-local-no-account' },
      models: { controlled: { name: 'M5 controlled local model', capabilities: { tools: true, input: ['text'], output: ['text'] }, limit: { context: 131072, output: 8192 } } } } },
    permissions: [{ action: '*', resource: '*', effect: 'deny' }, ...(options.allowedTools ?? []).map(name => ({ action: `workmesh_${name}`, resource: '*', effect: 'allow' }))],
    ...(options.mcpUrl ? { mcp: { servers: { workmesh: { type: 'remote', url: options.mcpUrl, headers: mcpHeaders, oauth: false, codemode: false } } } } : {}),
  }
  writeFileSync(join(global, 'opencode.json'), JSON.stringify(config), { mode: 0o600 })
  const blockedRequests: Array<{ method?: string; target: string }> = []
  const proxy = createServer((request, response) => { blockedRequests.push({ method: request.method, target: request.url ?? '' }); response.writeHead(403); response.end('M5_EXTERNAL_NETWORK_DENIED') })
  const sockets = new Set<Socket>()
  proxy.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  proxy.on('connect', (request, socket) => { blockedRequests.push({ method: 'CONNECT', target: request.url ?? '' }); socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy() })
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
  const proxyUrl = `http://127.0.0.1:${(proxy.address() as { port: number }).port}`
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOME'])
    if (process.env[key]) env[key] = process.env[key]
  Object.assign(env, { XDG_CONFIG_HOME: paths.config, XDG_DATA_HOME: paths.data, XDG_STATE_HOME: paths.state, XDG_CACHE_HOME: paths.cache,
    APPDATA: paths.config, LOCALAPPDATA: paths.data, TEMP: paths.tmp, TMP: paths.tmp, HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, ALL_PROXY: proxyUrl,
    NO_PROXY: '127.0.0.1,localhost,::1', NODE_EXTRA_CA_CERTS: resolve(import.meta.dirname, 'fixtures/model-test-ca.pem') })
  Object.values(options.mcpHeaders ?? {}).forEach((value, index) => { env[`M5_MCP_HEADER_${index}`] = value })
  const protectedPath = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.config/opencode/service.json')
  const protectedBefore = metadata(protectedPath)
  const binary = readFileSync(options.executable)
  const resource = { root, executable: options.executable, binaryBytes: binary.length, binarySha256: createHash('sha256').update(binary).digest('hex'),
    paths, proxyUrl, homeUnchanged: env.HOME === process.env.HOME, userprofileUnchanged: env.USERPROFILE === process.env.USERPROFILE, protectedBefore }
  const output = async (args: string[]) => {
    const startedAt = new Date().toISOString(), start = performance.now()
    const value = await exec(options.executable, args, { cwd: paths.work, env, timeout: 90_000, maxBuffer: 8_000_000 })
    return { argv: [options.executable, ...args], startedAt, endedAt: new Date().toISOString(), runtimeMs: performance.now() - start, nativeExit: 0, ...value }
  }
  const close = async () => {
    for (const socket of sockets) socket.destroy()
    proxy.closeAllConnections(); if (proxy.listening) await new Promise<void>(done => proxy.close(() => done()))
    const protectedAfter = metadata(protectedPath)
    const result = { ...resource, blockedRequests, proxyClosed: !proxy.listening, protectedAfter,
      protectedUnchanged: JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter), recoveryDirectoryPreserved: true }
    writeFileSync(join(root, 'resources.json'), JSON.stringify(result, null, 2))
    return result
  }
  try {
    const observed = await output(['debug', 'paths'])
    writeFileSync(join(root, 'paths-observation.json'), JSON.stringify(observed, null, 2))
    const effective = Object.fromEntries(observed.stdout.trim().split(/\r?\n/).map(line => {
      const match = /^(\w+)\s+(.+)$/.exec(line)
      if (!match) throw new Error('M5_OPENCODE_PATH_OUTPUT_INVALID')
      return [match[1]!, match[2]!]
    }))
    for (const kind of ['config', 'data', 'state', 'cache', 'tmp']) {
      const path = effective[kind]
      if (typeof path !== 'string' || !resolve(path).startsWith(root + '\\') && !resolve(path).startsWith(root + '/'))
        throw new Error(`M5_OPENCODE_ISOLATION_GAP:${kind}`)
    }
    const sources = await output(['debug', 'config'])
    // debug config can start an owned private daemon. Stop it before standalone execution.
    const privateServiceStop = await output(['service', 'stop'])
    writeFileSync(join(root, 'private-debug-service-stop.json'), JSON.stringify(privateServiceStop, null, 2))
    writeFileSync(join(root, 'config-observation.json'), JSON.stringify(sources, null, 2))
    const sourceRecords = JSON.parse(sources.stdout) as Array<{ path: string; type: string; info?: { update?: string } }>
    if (!Array.isArray(sourceRecords) || !sourceRecords.length || sourceRecords.some(row => !resolve(row.path).startsWith(root + '\\') && !resolve(row.path).startsWith(root + '/'))
      || !sourceRecords.some(row => row.info?.update === 'disable')) throw new Error('M5_OPENCODE_USER_CONFIG_DISCOVERED')
    const logRoot = join(paths.data, 'opencode', 'log')
    const protectedSkills = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.agents', 'skills')
    const discovery = readdirSync(logRoot).filter(name => name.endsWith('.log')).flatMap(name => {
      const file = join(logRoot, name), bytes = readFileSync(file)
      return bytes.toString('utf8').split(/\r?\n/).filter(line => line.replace(/\\\\/g, '\\').includes(protectedSkills)).map(line => ({ file, sha256: createHash('sha256').update(bytes).digest('hex'), observedLine: line }))
    })
    if (discovery.length) {
      writeFileSync(join(root, 'isolation-blocker.json'), JSON.stringify({ code: 'M5_OPENCODE_USER_SKILL_DISCOVERY', discovery, modelRun: false, privateServiceStopped: true }, null, 2))
      throw new Error('M5_OPENCODE_USER_SKILL_DISCOVERY: installed runtime discovers user skills outside private roots; external subflow stopped')
    }
    return { root, resource, effective, sources, blockedRequests, output, close,
      run: () => output(['run', '--standalone', '--print-logs', '--format', 'json', '--model', 'm5-local/controlled', 'Call only the supplied WorkMesh tools, then report the verified public result.']) }
  } catch (error) { await close(); throw error }
}
