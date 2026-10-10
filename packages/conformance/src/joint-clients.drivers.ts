import { execFile, spawn } from 'node:child_process'
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
    // V2 compatibility discovery scans HOME independently of the private XDG roots.
    plugins: ['-opencode.config.compatibility'],
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
  Object.assign(env, { OPENCODE_CONFIG_PROJECT_DISABLE: '1', OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_LOG_LEVEL: 'DEBUG' })
  // Both supported native entrypoints use the same ephemeral loopback password.
  const nativePassword = randomUUID()
  Object.assign(env, { OPENCODE_SERVER_PASSWORD: nativePassword, OPENCODE_PASSWORD: nativePassword })
  Object.values(options.mcpHeaders ?? {}).forEach((value, index) => { env[`M5_MCP_HEADER_${index}`] = value })
  const protectedPath = join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.config/opencode/service.json')
  const protectedBefore = metadata(protectedPath)
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? ''
  const protectedUserFiles = ['.config/opencode/opencode.json', '.config/opencode/opencode.jsonc', '.config/opencode/service.json',
    '.local/share/opencode/auth.json', '.local/state/opencode/service.json'].map(path => join(userHome, path))
  const protectedUserFilesBefore = protectedUserFiles.map(metadata)
  const binary = readFileSync(options.executable)
  const resource = { root, executable: options.executable, binaryBytes: binary.length, binarySha256: createHash('sha256').update(binary).digest('hex'),
    paths, proxyUrl, homeUnchanged: env.HOME === process.env.HOME, userprofileUnchanged: env.USERPROFILE === process.env.USERPROFILE, protectedBefore, protectedUserFilesBefore }
  type ProcessRecord = { pid: number; parentPid: number; executable: string; argv?: string[]; commandLine?: string; registeredAt: string; exitObservedAt?: string }
  const processes: ProcessRecord[] = []
  let nativeServer: { child: ReturnType<typeof spawn>; url: string; exited: Promise<void> } | undefined
  const sanitizeOutput = (raw: string) => {
    const redact = (key: string, value: unknown) => /^(reasoning|reasoning_content|thinking|signature|authorization|password|apiKey)$/i.test(key) ? '[redacted]' : value
    let safe: string
    try { safe = JSON.stringify(JSON.parse(raw) as unknown, redact) }
    catch { safe = raw.split(/\r?\n/).filter(line => !/"type"\s*:\s*"(?:reasoning|thinking)"/i.test(line)).map(line => {
      try { return JSON.stringify(JSON.parse(line) as unknown, redact) } catch { return line }
    }).join('\n') }
    for (const value of Object.values(options.mcpHeaders ?? {})) safe = safe.replaceAll(value, '[credential]')
    safe = safe.replaceAll(nativePassword, '[credential]')
    return safe.replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')
  }
  const isAlive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
  const observeProcesses = async () => {
    if (process.platform !== 'win32') return
    const result = await exec('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process -Filter "Name = \'opencode.exe\'" | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'], { timeout: 10_000, maxBuffer: 1_000_000 })
    const parsed: unknown = result.stdout.trim() ? JSON.parse(result.stdout) : []
    const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
    for (let pass = 0; pass < rows.length; pass++) for (const row of rows) {
      if (!row || typeof row !== 'object' || !('ProcessId' in row) || !('ParentProcessId' in row) || !('ExecutablePath' in row)) continue
      if (typeof row.ProcessId !== 'number' || typeof row.ParentProcessId !== 'number' || typeof row.ExecutablePath !== 'string') continue
      if (resolve(row.ExecutablePath).toLowerCase() !== resolve(options.executable).toLowerCase() || processes.some(item => item.pid === row.ProcessId)
        || !processes.some(item => item.pid === row.ParentProcessId && !item.exitObservedAt)) continue
      processes.push({ pid: row.ProcessId, parentPid: row.ParentProcessId, executable: row.ExecutablePath,
        commandLine: 'CommandLine' in row && typeof row.CommandLine === 'string' ? row.CommandLine : undefined, registeredAt: new Date().toISOString() })
    }
    for (const item of processes) if (!item.exitObservedAt && !isAlive(item.pid)) item.exitObservedAt = new Date().toISOString()
    writeFileSync(join(root, 'processes.json'), JSON.stringify(processes, null, 2))
  }
  const output = async (args: string[], probe?: { stopOnReadiness: boolean }) => {
    const startedAt = new Date().toISOString(), start = performance.now()
    let finished = false
    let readiness: { at: string; url: string } | undefined
    const completed = new Promise<{ stdout: string; stderr: string; nativeExit: number | string | null; signal: string | null }>((done, reject) => {
      const child = execFile(options.executable, args, { cwd: paths.work, env, timeout: 90_000, maxBuffer: 8_000_000 }, (error, stdout, stderr) => {
        finished = true
        const rawOutput = { stdout: { bytes: Buffer.byteLength(stdout), sha256: createHash('sha256').update(stdout).digest('hex') },
          stderr: { bytes: Buffer.byteLength(stderr), sha256: createHash('sha256').update(stderr).digest('hex') } }
        stdout = sanitizeOutput(stdout); stderr = sanitizeOutput(stderr)
        const receipt = { argv: [options.executable, ...args], startedAt, endedAt: new Date().toISOString(), runtimeMs: performance.now() - start,
          pid: child.pid, nativeExit: error?.code ?? 0, signal: error?.signal ?? null, stdout, stderr, rawOutput, rawBytesPreserved: false, readiness }
        const safeReceipt = JSON.stringify(receipt, (key, value: unknown) => /^(reasoning|reasoning_content|thinking|signature|authorization|password|apiKey)$/i.test(key) ? '[redacted]' : value, 2)
          .replace(/wm[ips]_[A-Za-z0-9_-]+/g, '[credential]')
        writeFileSync(join(root, `command-${randomUUID()}.json`), safeReceipt)
        if (error) { error.message = sanitizeOutput(error.message); Object.assign(error, { stdout, stderr }); reject(error) }
        else done({ stdout, stderr, nativeExit: 0, signal: null })
      })
      if (child.pid) processes.push({ pid: child.pid, parentPid: process.pid, executable: options.executable, argv: [options.executable, ...args], registeredAt: startedAt })
      // The noninteractive native run command drains stdin before sending its message.
      if (args[0] === 'run') child.stdin?.end()
      if (probe?.stopOnReadiness) {
        let pending = ''
        child.stdout?.on('data', (chunk: Buffer) => {
          pending += chunk.toString('utf8')
          for (const line of pending.split(/\r?\n/).slice(0, -1)) {
            try {
              const value: unknown = JSON.parse(line)
              if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') continue
              const url = new URL(value.url)
              if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') continue
              readiness = { at: new Date().toISOString(), url: url.origin }; child.stdin?.end()
            } catch { /* Readiness is a complete JSON line, not arbitrary stdout. */ }
          }
          pending = pending.split(/\r?\n/).at(-1) ?? ''
        })
      }
    })
    // Keep rejection observed while polling the owned native process tree.
    void completed.catch(() => undefined)
    while (!finished) { await observeProcesses(); if (!finished) await new Promise(done => setTimeout(done, 500)) }
    await observeProcesses()
    return { argv: [options.executable, ...args], startedAt, endedAt: new Date().toISOString(), runtimeMs: performance.now() - start, readiness, ...await completed }
  }
  const close = async () => {
    // serve --stdio owns its lifetime through stdin; EOF closes only this runtime.
    if (nativeServer) {
      nativeServer.child.stdin?.end()
      await Promise.race([nativeServer.exited, new Promise(done => setTimeout(done, 5_000))])
    }
    for (const socket of sockets) socket.destroy()
    proxy.closeAllConnections(); if (proxy.listening) await new Promise<void>(done => proxy.close(() => done()))
    await output(['service', 'stop'])
    await observeProcesses()
    // Standalone children are not registered services; close only the observed owned tree.
    for (const item of processes) if (!item.exitObservedAt && isAlive(item.pid)) process.kill(item.pid, 'SIGTERM')
    const deadline = Date.now() + 30_000
    while (processes.some(item => !item.exitObservedAt && isAlive(item.pid)) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 250)); await observeProcesses()
    }
    await observeProcesses()
    const protectedAfter = metadata(protectedPath)
    const protectedUserFilesAfter = protectedUserFiles.map(metadata)
    let nativeServerListenerClosed = true
    if (nativeServer) {
      try { await fetch(nativeServer.url, { signal: AbortSignal.timeout(1_000), redirect: 'error' }); nativeServerListenerClosed = false }
      catch { /* An exited owned server must no longer answer on its loopback URL. */ }
    }
    const result = { ...resource, blockedRequests, processes, allOwnedProcessesExited: processes.every(item => !!item.exitObservedAt), proxyClosed: !proxy.listening,
      nativeServerUrl: nativeServer?.url, nativeServerListenerClosed, protectedAfter,
      protectedUserFilesAfter, protectedUnchanged: JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter)
        && JSON.stringify(protectedUserFilesBefore) === JSON.stringify(protectedUserFilesAfter), recoveryDirectoryPreserved: true }
    writeFileSync(join(root, 'resources.json'), JSON.stringify(result, null, 2))
    if (!result.allOwnedProcessesExited) throw new Error('M5_OPENCODE_OWNED_PROCESS_EXIT_NOT_OBSERVED')
    if (!result.nativeServerListenerClosed) throw new Error('M5_OPENCODE_OWNED_LISTENER_CLOSE_NOT_OBSERVED')
    return result
  }
  const observeInventory = async (endpoint: URL, password: string, pid: number, evidenceName: string) => {
    const inventory: Record<string, Array<Record<string, unknown>>> = {}
    for (const kind of ['skill', 'plugin']) {
      const url = new URL(`/api/${kind}`, endpoint); url.searchParams.set('location[directory]', paths.work)
      const response = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
        redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`M5_OPENCODE_PRIVATE_INVENTORY_HTTP:${kind}:${response.status}`)
      const envelope: unknown = await response.json()
      const rows: unknown = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope
      if (!Array.isArray(rows)) throw new Error(`M5_OPENCODE_PRIVATE_INVENTORY_INVALID:${kind}`)
      inventory[kind] = rows.map((row: unknown) => {
        if (!row || typeof row !== 'object') throw new Error(`M5_OPENCODE_PRIVATE_INVENTORY_INVALID:${kind}`)
        return Object.fromEntries(['id', 'path', 'source', 'state'].flatMap(key => key in row ? [[key, row[key as keyof typeof row]]] : []))
      })
    }
    writeFileSync(join(root, evidenceName), JSON.stringify({ at: new Date().toISOString(), pid, endpoint: endpoint.origin, inventory }, null, 2))
    if (!inventory.plugin!.length || !inventory.skill!.length) throw new Error('M5_OPENCODE_PRIVATE_INVENTORY_EMPTY')
    if (inventory.plugin!.some(row => row.id === 'opencode.config.compatibility')) throw new Error('M5_OPENCODE_USER_SKILL_DISCOVERY: compatibility plugin remains active')
    if (inventory.skill!.some(row => typeof row.path !== 'string' || !row.path.startsWith('/builtin/') && !resolve(row.path).startsWith(root + '\\') && !resolve(row.path).startsWith(root + '/')))
      throw new Error('M5_OPENCODE_USER_SKILL_DISCOVERY: registered skill is outside private roots')
    if (inventory.plugin!.some(row => !row.source || typeof row.source !== 'object' || !('type' in row.source) || row.source.type !== 'builtin'))
      throw new Error('M5_OPENCODE_USER_PLUGIN_DISCOVERY: non-builtin plugin found in empty private runtime')
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
    const registration: unknown = JSON.parse(readFileSync(join(paths.state, 'opencode', 'service.json'), 'utf8'))
    if (!registration || typeof registration !== 'object' || !('url' in registration) || typeof registration.url !== 'string'
      || !('password' in registration) || typeof registration.password !== 'string' || !('pid' in registration) || typeof registration.pid !== 'number')
      throw new Error('M5_OPENCODE_PRIVATE_SERVICE_REGISTRATION_INVALID')
    const endpoint = new URL(registration.url)
    if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password)
      throw new Error('M5_OPENCODE_PRIVATE_SERVICE_ENDPOINT_INVALID')
    if (!processes.some(item => item.pid === registration.pid && !item.exitObservedAt))
      throw new Error('M5_OPENCODE_PRIVATE_SERVICE_OWNER_NOT_OBSERVED')
    await observeInventory(endpoint, registration.password, registration.pid, 'private-discovery-inventory.json')
    // debug config can start an owned private daemon. Stop it before standalone execution.
    const privateServiceStop = await output(['service', 'stop'])
    writeFileSync(join(root, 'private-debug-service-stop.json'), JSON.stringify(privateServiceStop, null, 2))
    writeFileSync(join(root, 'config-observation.json'), JSON.stringify(sources, null, 2))
    const sourceRecords = JSON.parse(sources.stdout) as Array<{ path: string; type: string; info?: { update?: string } }>
    if (!Array.isArray(sourceRecords) || !sourceRecords.length || sourceRecords.some(row => !resolve(row.path).startsWith(root + '\\') && !resolve(row.path).startsWith(root + '/'))
      || !sourceRecords.some(row => row.info?.update === 'disable')) throw new Error('M5_OPENCODE_USER_CONFIG_DISCOVERED')
    const logRoot = join(paths.data, 'opencode', 'log')
    const protectedSkills = ['.agents', '.claude'].map(name => join(process.env.USERPROFILE ?? process.env.HOME ?? '', name, 'skills'))
    const discovery = readdirSync(logRoot).filter(name => name.endsWith('.log')).flatMap(name => {
      const file = join(logRoot, name), bytes = readFileSync(file)
      return bytes.toString('utf8').split(/\r?\n/).filter(line => protectedSkills.some(path => line.replace(/\\\\/g, '\\').toLowerCase().includes(path.toLowerCase()))).map(line => ({ file, sha256: createHash('sha256').update(bytes).digest('hex'), observedLine: line }))
    })
    if (discovery.length) {
      writeFileSync(join(root, 'isolation-blocker.json'), JSON.stringify({ code: 'M5_OPENCODE_USER_SKILL_DISCOVERY', discovery, modelRun: false, privateServiceStopped: true }, null, 2))
      throw new Error('M5_OPENCODE_USER_SKILL_DISCOVERY: installed runtime discovers user skills outside private roots; external subflow stopped')
    }
    const startNativeServer = async () => {
      if (nativeServer) return nativeServer.url
      const args = ['serve', '--stdio', '--hostname', '127.0.0.1', '--port', '0', '--print-logs']
      const startedAt = new Date().toISOString(), started = performance.now()
      const child = spawn(options.executable, args, { cwd: paths.work, env, stdio: ['pipe', 'pipe', 'pipe'] })
      if (child.pid) processes.push({ pid: child.pid, parentPid: process.pid, executable: options.executable, argv: [options.executable, ...args], registeredAt: startedAt })
      let stdout = '', stderr = '', pending = '', readiness: { at: string; url: string } | undefined
      let resolveReady: (url: string) => void, rejectReady: (error: Error) => void
      const ready = new Promise<string>((done, reject) => { resolveReady = done; rejectReady = reject })
      void ready.catch(() => undefined)
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8'); pending += chunk.toString('utf8')
        const lines = pending.split(/\r?\n/); pending = lines.pop() ?? ''
        for (const line of lines) {
          try {
            const value: unknown = JSON.parse(line)
            if (!value || typeof value !== 'object' || !('url' in value) || typeof value.url !== 'string') continue
            const url = new URL(value.url)
            if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || !url.port) continue
            readiness = { at: new Date().toISOString(), url: url.origin }; resolveReady(url.origin)
          } catch { /* Readiness is a complete JSON line emitted by this owned server. */ }
        }
      })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); writeFileSync(join(root, 'native-server-live.log'), sanitizeOutput(stderr)) })
      child.once('error', error => { rejectReady(error) })
      const exited = new Promise<void>(done => child.once('close', (nativeExit, signal) => {
        writeFileSync(join(root, 'native-server-command.json'), JSON.stringify({ argv: [options.executable, ...args], pid: child.pid,
          startedAt, endedAt: new Date().toISOString(), runtimeMs: performance.now() - started, nativeExit, signal, readiness,
          stdout: sanitizeOutput(stdout), stderr: sanitizeOutput(stderr),
          rawOutput: { stdout: { bytes: Buffer.byteLength(stdout), sha256: createHash('sha256').update(stdout).digest('hex') },
            stderr: { bytes: Buffer.byteLength(stderr), sha256: createHash('sha256').update(stderr).digest('hex') } }, rawBytesPreserved: false }, null, 2))
        if (!readiness) rejectReady(new Error('M5_OPENCODE_NATIVE_SERVER_EXITED_BEFORE_READY'))
        done()
      }))
      // Keep the child registered even when bootstrap fails, so close can retire it.
      nativeServer = { child, url: '', exited }
      const deadline = Date.now() + 15_000
      while (!readiness && Date.now() < deadline) {
        await observeProcesses()
        await Promise.race([ready, new Promise(done => setTimeout(done, 250))])
      }
      if (!readiness) throw new Error('M5_OPENCODE_NATIVE_SERVER_READY_TIMEOUT')
      nativeServer.url = readiness.url
      writeFileSync(join(root, 'native-server-readiness.json'), JSON.stringify({ argv: [options.executable, ...args], pid: child.pid,
        startedAt, readiness, privateEnvironment: true, privateDirectory: paths.work, lifetime: 'owned stdin' }, null, 2))
      const configUrl = new URL('/api/config', readiness.url); configUrl.searchParams.set('location[directory]', paths.work)
      const nativeConfig = await fetch(configUrl, { headers: { Authorization: `Basic ${Buffer.from(`opencode:${nativePassword}`).toString('base64')}` },
        redirect: 'error', signal: AbortSignal.timeout(10_000) })
      if (!nativeConfig.ok) throw new Error(`M5_OPENCODE_NATIVE_CONFIG_HTTP:${nativeConfig.status}`)
      writeFileSync(join(root, 'native-server-config.json'), sanitizeOutput(await nativeConfig.text()))
      await observeInventory(new URL(readiness.url), nativePassword, child.pid!, 'native-server-discovery-inventory.json')
      return readiness.url
    }
    return { root, resource, effective, sources, blockedRequests, output, close,
      run: async () => output(['run', '--server', await startNativeServer(), '--print-logs', '--format', 'json', '--model', 'm5-local/controlled', 'Call only the supplied WorkMesh tools, then report the verified public result.']) }
  } catch (error) { await close(); throw error }
}
