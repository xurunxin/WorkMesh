import assert from 'node:assert/strict'
import { createHash, randomUUID, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export async function verifyBackendSkill({ origin, api, teamId, principalId }) {
  const discoveryResponse = await fetch(`${origin}/.well-known/workmesh-agent`, { redirect: 'error' })
  assert.equal(discoveryResponse.status, 200)
  const discovery = await discoveryResponse.json()
  assert.equal('download_url' in discovery.skill, false)
  assert.equal(discovery.wellKnownUrl, `${origin}/.well-known/workmesh-agent`)
  const agentSlug = `retirement-${randomUUID().slice(0, 8)}`
  const created = await api('/api/v1/agent-connections', {
    name: 'Backend retirement verification', agentSlug, clientType: 'codex',
    teamId, principalHumanActorId: principalId,
    requestedCapabilities: ['work:read'], grantAgentDelegate: false,
  }, randomUUID(), 201)
  const locator = new URL(created.connect_url)
  assert.equal(locator.pathname, '/api/v1/agent-connections/redeem')
  const redemption = await fetch(`${origin}/api/v1/agent-connections/redeem`, {
    method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({ pairingCode: locator.hash.slice(1), agentSlug, client: { type: 'codex', version: '1.1.0' } }),
  })
  assert.equal(redemption.status, 200)
  const redeemed = await redemption.json()
  const download = new URL(redeemed.skill.download_url)
  assert.equal(download.origin, origin)
  assert.equal(download.pathname, '/skills/workmesh-1.1.0.md')
  const response = await fetch(download, { redirect: 'error' })
  assert.equal(response.status, 200)
  const bytes = Buffer.from(await response.arrayBuffer())
  const asset = await readFile(new URL('../apps/api/assets/skills/workmesh-1.1.0.md', import.meta.url))
  const key = await readFile(new URL('../skills/workmesh/public-key.pem', import.meta.url))
  assert.deepEqual(bytes, asset)
  assert.equal(bytes.includes(13), false)
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  assert.equal(digest, discovery.skill.sha256)
  assert.equal(digest, redeemed.skill.sha256)
  assert.equal(redeemed.skill.signature, discovery.skill.signature)
  assert.equal(verify(null, bytes, key, Buffer.from(redeemed.skill.signature.slice('ed25519:'.length), 'base64')), true)
  for (const path of ['/skills/unlisted.md', '/skills/%2e%2e%2fprivate-key.pem']) {
    assert.ok([401, 403, 404].includes((await fetch(`${origin}${path}`, { redirect: 'error' })).status))
  }
  let mcpVerified = false
  if (process.env.WORKMESH_VERIFY_MCP === 'true') {
    for (const [id, method, params] of [
      [1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'backend-verifier', version: '1.0.0' } }],
      [2, 'tools/call', { name: 'verify_connection', arguments: {} }],
      [3, 'tools/call', { name: 'get_workmesh_context', arguments: {} }],
    ]) {
      const reply = await fetch(redeemed.mcp.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream',
          'X-WorkMesh-Installation-Token': redeemed.installation_token },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
      assert.equal(reply.status, 200)
      const text = await reply.text()
      const json = JSON.parse(text.startsWith('data:') || text.startsWith('event:') ? text.split('\n').find(line => line.startsWith('data:')).slice(5) : text)
      assert.equal(json.error, undefined)
      assert.notEqual(json.result.isError, true)
      if (method === 'initialize') assert.ok(json.result.serverInfo)
    }
    mcpVerified = true
  }
  return { skillSha256: digest, signedBytes: bytes.length, downloadSource: 'redeemed.skill.download_url', mcpVerified }
}
