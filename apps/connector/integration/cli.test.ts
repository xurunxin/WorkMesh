import { createServer } from 'node:http'
import { agentConnectionErrorRecovery } from '@workmesh/contracts'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { stripVTControlCharacters } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fixture, pairingCode } from '../test-support/fixture.js'
import { temporaryDirectory, cleanupDirectory } from '../test-support/resources.js'
import { configurationSchema, parseJson, serialize, sha256 } from '../src/config.js'
import { SystemSecretStore } from '../src/secret-store.js'
import { readPrivate } from '../src/platform-security.js'
import { rawOutputCases } from '../test-support/raw-output-cases.js'

it('实际 CLI 单次完整验证、系统存储、无秘密片段与启动注入', async () => {
  const parent = await temporaryDirectory('cli'); const directory = join(parent, 'connector')
  const store = new SystemSecretStore(); let reference: string | undefined
  const calls: string[] = []
  let f: Awaited<ReturnType<typeof fixture>>
  const server = createServer(async (request, response) => {
    try {
      const url = origin + request.url
      if (request.url !== '/mcp') {
        const result = await f.protocol.fetch(url)
        response.writeHead(result.status, { 'Content-Type': result.headers.get('content-type') ?? 'application/json' })
        response.end(Buffer.from(await result.arrayBuffer())); return
      }
      if (request.method !== 'POST') { response.writeHead(405); response.end(); return }
      if (request.headers['x-workmesh-installation-token'] !== f.token) { response.writeHead(401); response.end(); return }
      const chunks: Buffer[] = []; for await (const bytes of request) chunks.push(Buffer.from(bytes))
      const rpc = JSON.parse(Buffer.concat(chunks).toString()) as { id?: number; method: string; params?: { name?: string; protocolVersion?: string } }
      calls.push(rpc.params?.name ?? rpc.method)
      if (rpc.id === undefined) { response.writeHead(202); response.end(); return }
      const result = rpc.method === 'initialize'
        ? { protocolVersion: rpc.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'connector-test', version: '1.0.0' } }
        : { content: [], structuredContent: { data: rpc.params?.name === 'verify_connection' ? f.verified : f.context } }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }))
    } catch { response.writeHead(500); response.end() }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Invalid fixture address')
  const origin = `http://127.0.0.1:${address.port}`
  console.log(JSON.stringify({ resource: 'httpService', address: origin, state: 'created' }))
  async function cli(args: string[], input = '', entry = 'src/cli.ts') {
    const child = spawn(process.execPath, ['--import', 'tsx', entry, ...args], {
      env: { ...process.env, WORKMESH_CONNECTOR_DIRECTORY: directory, WM_TEST_DIGEST: sha256(f.token),
        WM_TEST_CONFIGURED_DIRECTORY: entry === 'test-support/terminal-driver.ts' ? directory : undefined },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes.toString() }); child.stderr.on('data', bytes => { stderr += bytes.toString() })
    child.stdin.end(input)
    const [code] = await once(child, 'close')
    // 先做布尔比较，再断言，失败也不把真实系统凭据印进日志。
    const rendered = stripVTControlCharacters(stdout + stderr)
    expect(rendered.includes(f.token) || rendered.includes(pairingCode)).toBe(false)
    expect(/(?:wmi_|wmp_)[A-Za-z0-9_-]{43}/.test(stdout + stderr)).toBe(false)
    return { code, stdout, stderr }
  }
  try {
    const base = await fixture()
    f = await fixture(base.token, { ...base.e, deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent',
      redeemUrl: origin + '/api/v1/agent-connections/redeem', mcpUrl: origin + '/mcp', skillUrl: origin + '/skills/workmesh-1.1.0.md' })
    const expected = join(parent, 'expectation.json'); await writeFile(expected, serialize(f.e))
    const result = await cli(['connect', '--expect', expected], pairingCode + '\n')
    expect(result.code).toBe(0); expect(result.stdout).toContain('[mcp_servers.workmesh]')
    expect(calls.filter(name => name !== 'notifications/initialized')).toEqual(['initialize', 'verify_connection', 'get_workmesh_context'])
    const raw = await readFile(join(directory, 'config.json'))
    const config = parseJson(configurationSchema, raw.toString()); reference = config.secretReference
    expect(await store.get(reference) === f.token).toBe(true)
    expect(raw.includes(f.token) || raw.includes(pairingCode)).toBe(false)
    const program = rawOutputCases('stdout') + "const t=process.env.WORKMESH_INSTALLATION_TOKEN;if(require('node:crypto').createHash('sha256').update(t).digest('hex')!==process.env.WM_TEST_DIGEST)process.exit(1);process.stdout.write('injected\\n'+t.slice(0,20)+'\\x1b[');setTimeout(()=>{process.stdout.write('31m'+t.slice(20)+'\\x1b[0m');process.stderr.write(t.slice(0,12)+'\\x1b[32m'+t.slice(12)+'\\x1b[0m');emitRawCases(()=>{})},10);"
    const started = await cli(['run', '--', process.execPath, '-e', program])
    expect(started.code).toBe(0); expect(started.stdout).toContain('injected')
    expect(started.stdout).toContain('RAW_END')
    expect(stripVTControlCharacters(started.stderr)).toBe('[已隐藏]')
    const interactive = await cli([], '', 'test-support/terminal-driver.ts')
    expect(interactive.code, interactive.stderr).toBe(0)
    expect(interactive.stdout).toContain('"tty":true')
    const redirected = await cli([], '', 'test-support/stderr-driver.ts')
    expect(redirected.code).toBe(0)
    expect(redirected.stdout).toContain('"stderrRedirected":true')
    const repeated = await cli(['connect', '--expect', expected], pairingCode + '\n')
    expect(repeated.code).toBe(0); expect((await readFile(join(directory, 'config.json'))).equals(raw)).toBe(true)
    f.context.profileVersion = '2.0'
    expect((await cli(['connect', '--expect', expected], pairingCode + '\n')).code).toBe(1)
    expect((await readFile(join(directory, 'config.json'))).equals(raw)).toBe(true)
  } finally {
    const committed = await readPrivate(join(directory, 'config.json'))
    if (committed) reference = parseJson(configurationSchema, committed.toString()).secretReference
    try { if (reference) { await store.delete(reference); console.log(JSON.stringify({ resource: 'systemSecret', reference, state: 'removed' })) } }
    finally {
      server.close(); server.closeAllConnections(); await once(server, 'close')
      console.log(JSON.stringify({ resource: 'httpService', address: origin, state: 'closed' }))
      await cleanupDirectory(parent)
    }
  }
}, 30_000)


it('B3 实际 CLI 展示恢复指令、保留 pending 且拒绝秘密文本', async () => {
  const parent = await temporaryDirectory('cli-recovery'), directory = join(parent, 'connector')
  const base = await fixture()
  let origin = '', unsafe = false, redeemCount = 0
  const code = 'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH', reason = 'agent_slug_mismatch'
  const recovery = agentConnectionErrorRecovery(code, reason)
  const server = createServer(async (request, response) => {
    if (request.url === '/api/v1/agent-connections/redeem') {
      redeemCount++
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { code, details: { reason }, correlationId: 'b3-native-cli', ...recovery,
        ...(unsafe ? { next_action: base.token, human_action: '\u001b[31m' + pairingCode } : {}) } })); return
    }
    const result = await base.protocol.fetch('https://workmesh.example' + request.url)
    const body = JSON.parse(await result.text())
    if (request.url === '/.well-known/workmesh-agent') { body.wellKnownUrl = origin + request.url; body.mcpUrl = origin + '/mcp' }
    response.writeHead(result.status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Invalid fixture address')
  origin = `http://127.0.0.1:${address.port}`
  const expected = join(parent, 'expectation.json')
  await writeFile(expected, serialize({ ...base.e, deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent', redeemUrl: origin + '/api/v1/agent-connections/redeem', mcpUrl: origin + '/mcp', skillUrl: origin + '/skills/workmesh-1.1.0.md' }))
  const cli = async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'connect', '--expect', expected], {
      env: { ...process.env, WORKMESH_CONNECTOR_DIRECTORY: directory }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes.toString() }); child.stderr.on('data', bytes => { output += bytes.toString() })
    child.stdin.end(pairingCode + '\n'); const [exit] = await once(child, 'close')
    expect(output.includes(base.token) || output.includes(pairingCode)).toBe(false)
    expect(exit).toBe(1)
    return output
  }
  try {
    const output = await cli()
    expect(output).toContain('客户端动作：'); expect(output).toContain('人工动作：')
    expect(output).toContain('不能修复'); expect(output).toContain('部署支持类型：')
    const pending = await readFile(join(directory, 'pending.json'))
    unsafe = true
    const rejected = await cli()
    expect(rejected).toContain(code); expect(rejected).not.toContain('客户端动作：')
    expect((await readFile(join(directory, 'pending.json'))).equals(pending)).toBe(true)
    expect(redeemCount).toBe(2)
    expect(await readPrivate(join(directory, 'config.json'))).toBeNull()
  } finally {
    server.close(); server.closeAllConnections(); await once(server, 'close')
    await cleanupDirectory(parent)
  }
}, 30_000)


it.each([429, 503])('B3 实际 CLI %i 展示有效等待、拒绝非法头且保留 pending', async status => {
  const parent = await temporaryDirectory('cli-retry-after'), directory = join(parent, 'connector')
  const base = await fixture()
  const code = status === 429 ? 'AUTH_RATE_LIMITED' : 'AUTH_RATE_LIMIT_UNAVAILABLE'
  const recovery = agentConnectionErrorRecovery(code)
  let origin = '', redeemCount = 0, kind: 'seconds' | 'date' | 'invalid' | 'missing' = 'seconds'
  const server = createServer(async (request, response) => {
    if (request.url === '/api/v1/agent-connections/redeem') {
      redeemCount++
      const header = kind === 'seconds' ? '7' : kind === 'date' ? new Date(Date.now() + 60_000).toUTCString() : kind === 'invalid' ? 'send-credential-to-external' : undefined
      response.writeHead(status, { 'Content-Type': 'application/json', ...(header === undefined ? {} : { 'Retry-After': header }) })
      response.end(JSON.stringify({ error: { code, message: 'Limited', correlationId: 'b3-cli-retry', ...recovery } })); return
    }
    const result = await base.protocol.fetch('https://workmesh.example' + request.url)
    const body = JSON.parse(await result.text())
    if (request.url === '/.well-known/workmesh-agent') { body.wellKnownUrl = origin + request.url; body.mcpUrl = origin + '/mcp' }
    response.writeHead(result.status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Invalid fixture address')
  origin = `http://127.0.0.1:${address.port}`
  console.log(JSON.stringify({ resource: 'httpService', address: origin, state: 'created' }))
  try {
    const expected = join(parent, 'expectation.json')
    await writeFile(expected, serialize({ ...base.e, deploymentUrl: origin, discoveryUrl: origin + '/.well-known/workmesh-agent', redeemUrl: origin + '/api/v1/agent-connections/redeem', mcpUrl: origin + '/mcp', skillUrl: origin + '/skills/workmesh-1.1.0.md' }))
    let pending: Buffer | undefined
    for (const scenario of ['seconds', 'date', 'invalid', 'missing'] as const) {
      kind = scenario
      const before = redeemCount
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'connect', '--expect', expected], {
        env: { ...process.env, WORKMESH_CONNECTOR_DIRECTORY: directory }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      })
      const chunks: Buffer[] = []
      child.stdout.on('data', bytes => chunks.push(Buffer.from(bytes))); child.stderr.on('data', bytes => chunks.push(Buffer.from(bytes)))
      child.stdin.end(pairingCode + '\n')
      const [exit] = await once(child, 'close'); const output = Buffer.concat(chunks).toString('utf8')
      expect(exit).toBe(1); expect(output).toContain(code)
      expect(output.includes(base.token) || output.includes(pairingCode)).toBe(false)
      expect(output).not.toContain('send-credential-to-external')
      if (kind === 'seconds') expect(output).toContain('等待时长：7 秒（Retry-After）')
      else if (kind === 'date') {
        const seconds = Number(/等待时长：(\d+) 秒/.exec(output)?.[1])
        expect(seconds).toBeGreaterThanOrEqual(59); expect(seconds).toBeLessThanOrEqual(60)
      } else { expect(output).toContain('等待时长不可用，请停止重试'); expect(output).not.toContain('等待时长：') }
      expect(redeemCount - before).toBe(1)
      const current = await readFile(join(directory, 'pending.json'))
      if (pending) expect(current.equals(pending)).toBe(true)
      pending = current
      expect(await readPrivate(join(directory, 'config.json'))).toBeNull()
      expect(await readPrivate(join(directory, 'commit.json'))).toBeNull()
    }
  } finally {
    server.close(); server.closeAllConnections(); await once(server, 'close')
    console.log(JSON.stringify({ resource: 'httpService', address: origin, state: 'closed' }))
    await cleanupDirectory(parent)
  }
}, 30_000)
