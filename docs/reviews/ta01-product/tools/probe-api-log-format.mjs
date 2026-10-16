// 只验证已安装Fastify的实际日志格式；inject不监听端口，不运行真实API或数据库。
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

assert.equal(process.version, 'v22.19.0')
const require = createRequire(path.resolve('apps/api/package.json'))
const Fastify = require('fastify')
const output = path.resolve(process.argv[2])
const logs = []
const privateValue = 'wmi_' + 'x'.repeat(43)
const item = randomUUID()
const app = Fastify({ logger: { stream: { write: value => logs.push(String(value)) } }, genReqId: randomUUID })
const since = Date.now() / 1000
app.get('/api/v1/agent-capabilities', async () => ({ fixture: true }))
app.get('/api/v1/work-items/:id', async () => ({ fixture: true }))
try {
  app.log.info({ body: privateValue }, 'private fixture message')
  for (const url of ['/api/v1/agent-capabilities?discovery=qualified', '/api/v1/work-items/' + item]) {
    assert.equal((await app.inject({ method: 'GET', url, headers: { authorization: privateValue } })).statusCode, 200)
  }
} finally {
  await app.close()
}
const raw = Buffer.from(logs.join(''))
assert.ok(raw.includes(privateValue))
writeFileSync(output, raw, { flag: 'wx' })
writeFileSync(output + '.json', JSON.stringify({ since, until: Date.now() / 1000, rawSha256: createHash('sha256').update(raw).digest('hex'),
  fastifyVersion: require('fastify/package.json').version, packageSha256: createHash('sha256').update(readFileSync(require.resolve('fastify/package.json'))).digest('hex'),
  scope: '真实库的inject日志格式；合成响应，无真实API/PG/Redis/S3或监听端口' }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ injectedRequests: 2, listenerStarted: false, rawBytes: raw.length }))
