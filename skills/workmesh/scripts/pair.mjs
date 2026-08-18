#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const pairs = []
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index]?.startsWith('--')) pairs.push([process.argv[index].slice(2), process.argv[index + 1]])
}
const args = Object.fromEntries(pairs)
const connect = new URL(args.url ?? '')
const pairingCode = connect.hash.slice(1)
const client = args.client
if (!pairingCode || connect.search || connect.pathname !== '/connect') throw new Error('Use an exact /connect#<pairing-code> URL; query and path codes are forbidden')
if (!['codex', 'opencode', 'pi', 'generic_mcp'].includes(client)) throw new Error('--client must be codex, opencode, pi, or generic_mcp')
if (!args['agent-slug']) throw new Error('--agent-slug is required')
connect.hash = ''
connect.pathname = '/api/v1/agent-connections/redeem'
const response = await fetch(connect, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({ pairingCode, agentSlug: args['agent-slug'], client: { type: client, version: args['client-version'] ?? 'unknown' } }),
})
const payload = await response.json()
if (!response.ok) throw new Error(`Pairing failed: ${payload?.error?.code ?? response.status}`)
if (typeof payload.installation_token !== 'string' || !payload.installation_token.startsWith('wmi_')) throw new Error('Pairing failed: response did not contain a wmi_ Installation Token')
const fingerprintPrefix = createHash('sha256').update(payload.installation_token).digest('hex').slice(0, 12)
if (payload.connection?.credential_fingerprint_prefix !== fingerprintPrefix) throw new Error('Pairing failed: Installation Token fingerprint does not match the Connection response')
const output = resolve(args.output ?? '.workmesh')
await mkdir(output, { recursive: true })
await writeFile(resolve(output, '.env'), `WORKMESH_API_URL=${new URL(payload.mcp.url).origin}\nWORKMESH_INSTALLATION_TOKEN=${payload.installation_token}\nWORKMESH_MCP_MODE=read-write\n`, { mode: 0o600 })
await writeFile(resolve(output, `${client}.json`), `${JSON.stringify({ name: 'workmesh', transport: 'streamable_http', url: payload.mcp.url, headers: { 'X-WorkMesh-Installation-Token': '${WORKMESH_INSTALLATION_TOKEN}' }, skill: { name: payload.skill.name, version: payload.skill.version, sha256: payload.skill.sha256, download_url: payload.skill.download_url } }, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify({ paired: true, connection_id: payload.connection.id, team_id: payload.team_id, principal_human_actor_id: payload.principal_human_actor_id, client, output, next: 'Load the redacted adapter using the client secret store, install the pinned Skill, then call verify_connection.' })}\n`)
