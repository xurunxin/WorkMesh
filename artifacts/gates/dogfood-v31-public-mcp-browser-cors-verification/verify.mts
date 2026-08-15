import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createWorkMeshMcpHttpServer } from '../../../apps/mcp/src/http.ts'

const exactOrigin = 'http://127.0.0.1:3300'
const wrongOrigin = 'http://127.0.0.1:3301'
const server = await createWorkMeshMcpHttpServer({
  baseUrl: 'http://127.0.0.1:3001',
  sessionToken: 'verifier-session',
  accessToken: 'verifier-access',
  browserOrigin: exactOrigin,
  mode: 'read-only',
})

server.listen(0, '127.0.0.1')
await once(server, 'listening')
const address = server.address()
assert(address && typeof address !== 'string')
const endpoint = `http://127.0.0.1:${address.port}/mcp`

try {
  const exact = await fetch(endpoint, { headers: { origin: exactOrigin } })
  assert.equal(exact.status, 401)
  assert.equal(exact.headers.get('access-control-allow-origin'), exactOrigin)
  assert.match(exact.headers.get('vary') ?? '', /(?:^|,\s*)Origin(?:,|$)/i)
  assert.equal(exact.headers.get('access-control-allow-credentials'), null)

  const preflight = await fetch(endpoint, {
    method: 'OPTIONS',
    headers: {
      origin: exactOrigin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'accept',
    },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), exactOrigin)
  assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /GET/)
  assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /x-workmesh-installation-token/)

  const wrong = await fetch(endpoint, { headers: { origin: wrongOrigin } })
  assert.equal(wrong.status, 401)
  assert.equal(wrong.headers.get('access-control-allow-origin'), null)

  const wrongPreflight = await fetch(endpoint, { method: 'OPTIONS', headers: { origin: wrongOrigin } })
  assert.equal(wrongPreflight.status, 403)

  const originless = await fetch(endpoint)
  assert.equal(originless.status, 401)
  assert.equal(originless.headers.get('access-control-allow-origin'), null)

  for (const invalid of [
    'ftp://127.0.0.1:3300',
    'http://user:secret@127.0.0.1:3300',
    'http://127.0.0.1:3300/path',
    'http://127.0.0.1:3300?query=1',
    'http://127.0.0.1:3300#fragment',
  ]) {
    await assert.rejects(createWorkMeshMcpHttpServer({
      baseUrl: 'http://127.0.0.1:3001',
      sessionToken: 'verifier-session',
      accessToken: 'verifier-access',
      browserOrigin: invalid,
      mode: 'read-only',
    }), /WORKMESH_BROWSER_ORIGIN/)
  }

  const hashes = Object.fromEntries(await Promise.all([
    'apps/mcp/src/http.ts',
    'apps/mcp/src/http.test.ts',
    'package.json',
    'pnpm-lock.yaml',
    'apps/mcp/package.json',
  ].map(async (path) => [path, createHash('sha256').update(await readFile(path)).digest('hex')])))

  console.log(JSON.stringify({
    result: 'PASS',
    claims: {
      exactOriginUnauthenticated401: true,
      exactOriginPreflight204: true,
      credentialsNotGranted: true,
      wrongOriginOrdinaryNotGranted: true,
      wrongOriginPreflightRejected: true,
      originlessNotGranted: true,
      invalidOriginsRejected: 5,
    },
    hashes,
  }, null, 2))
} finally {
  server.close()
  await once(server, 'close')
}
