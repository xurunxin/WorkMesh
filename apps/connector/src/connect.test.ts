import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { connect, clientSnippet } from './connect.js'
import { atomicWrite, readPrivate, withDirectoryLock, verifyPrivate } from './platform-security.js'
import { serialize, sha256, type Expectation } from './config.js'
import { recoverCommit, type CommitCheckpoint } from './commit.js'
import { redactChildOutput } from './cli.js'
import { fixture, pairingCode, MemoryStore } from '../test-support/fixture.js'
import { temporaryDirectory, cleanupDirectory } from '../test-support/resources.js'

const paths: string[] = []
async function directory() {
  const parent = await temporaryDirectory('test'); paths.push(parent)
  return join(parent, 'connector')
}
afterEach(async () => { for (const path of paths.splice(0)) await cleanupDirectory(path) })
describe('连接器完整验证与原子提交', () => {
  it('全部校验完成后才提交，成功重跑只校验当前身份，秘密不进入配置', async () => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const config = await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })
    const raw = (await readFile(join(dir, 'config.json'))).toString()
    expect(raw.includes(f.token) || raw.includes(pairingCode)).toBe(false)
    expect(store.values.size).toBe(1)
    expect((await readdir(dir)).includes('pending.json')).toBe(false)
    expect(clientSnippet(config).includes(f.token)).toBe(false)
    await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })
    expect(f.requests.filter(r => r.url === f.e.redeemUrl).length).toBe(1)
    expect(store.values.size).toBe(1)
    f.identity.authenticated_credential.status = 'overlap'
    await expect(connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })).rejects.toThrow()
    expect((await readFile(join(dir, 'config.json'))).toString() === raw).toBe(true)
  })
  it('断网和丢响应后保存并精确重放 key/body/context，pending ACL 实际受保护', async () => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore(); let failures = 2
    const protocol = { ...f.protocol, fetch: (async (input, init) => {
      const response = await f.protocol.fetch(input, init)
      if (String(input) === f.e.redeemUrl && failures-- > 0) throw new Error('lost response')
      return response
    }) as typeof fetch }
    for (let i = 0; i < 2; i++) await expect(connect({ directory: dir, expectation: f.e, pairingCode, store, protocol })).rejects.toThrow()
    await verifyPrivate(join(dir, 'pending.json'))
    const raw = (await readFile(join(dir, 'pending.json'))).toString()
    expect(raw.includes(pairingCode) && !raw.includes(f.token)).toBe(true)
    await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol })
    const requests = f.requests.filter(r => r.url === f.e.redeemUrl)
    expect(requests.length).toBe(3)
    expect(requests.every(r => JSON.stringify(r.init) === JSON.stringify(requests[0]!.init))).toBe(true)
  })
  it('pending 已存在时拒绝异体或异清单，不更换请求身份；损坏记录不重建', async () => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const checkpoint = async () => { throw new Error('before send') }
    await expect(connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol, checkpoint })).rejects.toThrow()
    const raw = await readFile(join(dir, 'pending.json'))
    await expect(connect({ directory: dir, expectation: f.e, pairingCode: 'wmp_' + 'c'.repeat(43), store, protocol: f.protocol })).rejects.toThrow('CONNECTOR_PENDING_CONFLICT')
    await expect(connect({ directory: dir, expectation: { ...f.e, profileVersion: '2.0' }, pairingCode, store, protocol: f.protocol })).rejects.toThrow('CONNECTOR_PENDING_CONFLICT')
    expect((await readFile(join(dir, 'pending.json'))).equals(raw)).toBe(true)
    await atomicWrite(join(dir, 'pending.json'), '{')
    await expect(connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })).rejects.toThrow('CONNECTOR_INVALID_RECORD')
    expect(f.requests.length).toBe(0)
  })
  const faults: Array<[string, (f: Awaited<ReturnType<typeof fixture>>) => void]> = [
    ['fingerprint', f => { f.redeemed.connection.credential_fingerprint_prefix = '000000000000' }],
    ['Team', f => { f.identity.team_id = randomUUID() }],
    ['principal', f => { f.identity.principal_human_actor_id = randomUUID() }],
    ['actor', f => { f.identity.agent_actor_id = randomUUID() }],
    ['connection', f => { f.identity.connection.id = randomUUID() }],
    ['profile', f => { f.verified.bootstrap.profileVersion = '2.0' }],
    ['context profile', f => { f.context.profileVersion = '2.0' }],
    ['manifest capability', f => { f.verified.manifest.agent.effectiveCapabilities = ['work:read'] }],
    ['context capability', f => { f.context.identity.effectiveCapabilities = ['work:read'] }],
    ['credential fingerprint', f => { f.identity.authenticated_credential.fingerprint_prefix = '000000000000' }],
    ['overlap', f => { f.identity.authenticated_credential.status = 'overlap' }],
    ['revoked', f => { f.identity.connection.status = 'revoked' }],
    ['expired', f => { f.identity.coordination_session.expires_at = '2000-01-01T00:00:00.000Z' }],
    ['Skill bytes', f => { f.tamperSkill() }],
    ['Skill signature', f => { f.e.skill.signature = 'ed25519:' + 'A'.repeat(86) + '=='; f.redeemed.skill.signature = f.e.skill.signature }],
    ['download endpoint', f => { f.redeemed.skill.download_url = 'https://other.example/skill' }],
    ['context Team', f => { f.context.team.id = randomUUID() }],
  ]
  it.each(faults)('%s 失败零正式写入并保留旧配置', async (_name, mutate) => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const old = await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })
    const raw = await readFile(join(dir, 'config.json'))
    mutate(f)
    await expect(connect({ directory: dir, expectation: f.e, pairingCode: 'wmp_' + 'd'.repeat(43), store, protocol: f.protocol })).rejects.toThrow()
    expect((await readFile(join(dir, 'config.json'))).equals(raw)).toBe(true)
    expect(store.values.size === 1 && await store.get(old.secretReference) === f.token).toBe(true)
  })
  it.each(['put', 'readback', 'rename', 'delete'] as const)('%s 失败补偿且旧引用不变', async kind => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const old = await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })
    const raw = await readFile(join(dir, 'config.json'))
    let failDelete = kind === 'delete'
    const faulty = {
      put: async (ref: string, token: string) => { await store.put(ref, token); if (kind === 'put' || kind === 'delete') throw new Error('store error') },
      get: async (ref: string) => kind === 'readback' && store.values.has(ref) && ref !== old.secretReference ? null : store.get(ref),
      delete: async (ref: string) => { if (failDelete) throw new Error('delete error'); await store.delete(ref) },
    }
    await expect(connect({ directory: dir, expectation: f.e, pairingCode: 'wmp_' + 'd'.repeat(43), store: faulty, protocol: f.protocol,
      write: async (path, bytes) => { if (kind === 'rename' && path.endsWith('config.json')) throw new Error('rename error'); await atomicWrite(path, bytes) },
    })).rejects.toThrow()
    expect((await readFile(join(dir, 'config.json'))).equals(raw)).toBe(true)
    expect(await store.get(old.secretReference) === f.token).toBe(true)
    if (kind === 'delete') { expect(await readPrivate(join(dir, 'commit.json')) !== null).toBe(true); failDelete = false; await withDirectoryLock(dir, () => recoverCommit(dir, faulty)) }
    expect(store.values.size).toBe(1)
  })
  it('子进程输出跨 chunk 隐藏秘密；信任根与仓库公钥一致', async () => {
    let output = ''; const sink = redactChildOutput(text => { output += text })
    const f = await fixture()
    sink.push('prefix' + f.token.slice(0, 20)); sink.push(f.token.slice(20)); sink.finish()
    expect(output.includes(f.token)).toBe(false)
    expect((await readFile(new URL('../assets/workmesh-public-key.pem', import.meta.url))).equals(await readFile(new URL('../../../skills/workmesh/public-key.pem', import.meta.url)))).toBe(true)
  })
  it('秘密引用冲突不能让补偿删除既有秘密', async () => {
    const f = await fixture(); const dir = await directory(); let deletes = 0
    const store = { get: async () => f.token, put: async () => { throw new Error('must not write') }, delete: async () => { deletes++ } }
    await expect(connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: f.protocol })).rejects.toThrow('CONNECTOR_SECRET_REFERENCE_CONFLICT')
    expect(deletes).toBe(0)
    expect(await readPrivate(join(dir, 'commit.json'))).toBeNull()
    expect(await readPrivate(join(dir, 'config.json'))).toBeNull()
  })
  it('清单可明确批准不同 origin 的 MCP 和 Skill，令牌只交给批准的 MCP', async () => {
    const base = await fixture()
    const f = await fixture(base.token, { ...base.e, mcpUrl: 'https://mcp.example/coordination', skillUrl: 'https://cdn.example/skill.md' })
    const store = new MemoryStore(); const dir = await directory(); let bootstrapped = false
    await connect({ directory: dir, expectation: f.e, pairingCode, store, protocol: {
      ...f.protocol, bootstrap: async (e, token) => {
        bootstrapped = e.mcpUrl === f.e.mcpUrl && token === f.token
        return { verify: f.verified, context: f.context }
      },
    } })
    expect(bootstrapped).toBe(true)
    expect(f.requests.every(request => !JSON.stringify(request.init?.headers ?? {}).includes(f.token))).toBe(true)
  })
})

function worker(dir: string, e: Expectation, store: MemoryStore, stopAt?: string) {
  const child = fork(fileURLToPath(new URL('../test-support/process-worker.ts', import.meta.url)), [], { execArgv: ['--import', 'tsx'],
    env: { ...process.env, WM_TEST_DIRECTORY: dir, WM_TEST_EXPECTATION: serialize(e), WM_TEST_STOP_AT: stopAt ?? '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  const requests: unknown[] = []; let output = ''; const stages = new Map<string, () => void>()
  child.stdout?.on('data', (b: Buffer) => { output += b.toString() }); child.stderr?.on('data', (b: Buffer) => { output += b.toString() })
  child.on('message', async (m: { id: number; operation?: string; ref: string; token: string; request?: unknown; stage?: string }) => {
    if (m.request) requests.push(m.request)
    if (m.stage) stages.get(m.stage)?.()
    if (m.operation) {
      if (m.operation === 'put') await store.put(m.ref, m.token)
      if (m.operation === 'delete') await store.delete(m.ref)
      child.send({ id: m.id, value: m.operation === 'get' ? await store.get(m.ref) : null })
    }
  })
  return { child, requests, exit: once(child, 'exit'), output: () => output,
    stage: (name: string) => new Promise<void>(resolve => stages.set(name, resolve)) }
}
describe('真实客户端进程竞争与强制终止', () => {
  it('两个进程竞争收敛同一请求和配置', async () => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const a = worker(dir, f.e, store); const b = worker(dir, f.e, store)
    try {
      const codes = await Promise.all([a.exit, b.exit]); expect(codes.every(c => c[0] === 0)).toBe(true)
      expect(a.requests.length + b.requests.length).toBe(1)
      expect(store.values.size).toBe(1)
      expect((a.output() + b.output()).includes(f.token)).toBe(false)
    } finally { a.child.kill(); b.child.kill() }
  }, 30_000)
  it.each(['pending', 'verified', 'journal', 'secret', 'secret_verified', 'skill', 'config', 'pending_removed'] as const)('%s 后被杀，重启恢复原子边界和身份', async stage => {
    const f = await fixture(); const dir = await directory(); const store = new MemoryStore()
    const a = worker(dir, f.e, store, stage)
    try {
      await a.stage(stage); a.child.kill('SIGKILL'); await a.exit
      const pending = await readPrivate(join(dir, 'pending.json'))
      const b = worker(dir, f.e, store)
      try {
        const [code] = await b.exit; expect(code).toBe(0)
        expect(store.values.size).toBe(1)
        const requests = [...a.requests, ...b.requests]
        if (requests.length > 1) expect(requests.every(r => JSON.stringify(r) === JSON.stringify(requests[0]))).toBe(true)
        if (pending && stage !== 'config') expect(b.requests.length).toBe(1)
        expect(await readPrivate(join(dir, 'commit.json'))).toBeNull()
        expect(await readPrivate(join(dir, 'pending.json'))).toBeNull()
        expect((a.output() + b.output()).includes(f.token)).toBe(false)
      } finally { b.child.kill() }
    } finally { a.child.kill() }
  }, 30_000)
})
