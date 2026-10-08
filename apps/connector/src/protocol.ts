import { readFile } from 'node:fs/promises'
import { verify } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { z } from 'zod'
import { agentConnectionCurrentIdentitySchema, agentConnectionRedeemResponseSchema, agentWellKnownResponseSchema, agentCapabilityManifestResponseSchema, type AgentConnectionResponse } from '@workmesh/contracts'
import { type Expectation, type Pending, parse, sha256 } from './config.js'
import { ConnectorError, requireThat } from './errors.js'

export type Bootstrap = { verify: unknown; context: unknown }
export type ProtocolDependencies = {
  fetch: typeof fetch
  bootstrap: (expected: Expectation, token: string, fetcher: typeof fetch) => Promise<Bootstrap>
}
export const trustedKeyPath = new URL('../assets/workmesh-public-key.pem', import.meta.url)
const sameSet = (a: readonly string[], b: readonly string[]): boolean => new Set(a).size === a.length && a.length === b.length && a.every(v => b.includes(v))
function checkSkill(actual: Expectation['skill'], expected: Expectation['skill']): void {
  requireThat(actual.name === expected.name && actual.version === expected.version && actual.sha256 === expected.sha256 && actual.signature === expected.signature, 'CONNECTOR_SKILL_PIN_MISMATCH')
}
export function checkConnection(c: AgentConnectionResponse, e: Expectation, fingerprint: string): void {
  requireThat(c.id === e.connectionId && c.workspace_id === e.workspaceId && c.agent_actor_id === e.agentActorId
    && c.team_id === e.teamId && c.principal_human_actor_id === e.principalHumanActorId
    && c.agent_slug === e.agentSlug && c.client_type === e.client.type
    && ['active', 'rotating'].includes(c.status) && c.revoked_at === null
    && c.grant_agent_delegate === e.grantAgentDelegate
    && sameSet(c.requested_capabilities, e.requestedCapabilities) && sameSet(c.granted_capabilities, e.capabilities)
    && c.skill_version === e.skill.version && c.skill_sha256 === e.skill.sha256
    && c.credential_fingerprint_prefix === fingerprint, 'CONNECTOR_CONNECTION_MISMATCH')
}
function checkIdentity(raw: unknown, e: Expectation, fingerprint: string) {
  const identity = parse(agentConnectionCurrentIdentitySchema, raw)
  checkConnection(identity.connection, e, fingerprint)
  requireThat(identity.authenticated_credential.status === 'active'
    && identity.authenticated_credential.fingerprint_prefix === fingerprint
    && identity.authenticated_credential.overlap_until === null, 'CONNECTOR_CREDENTIAL_NOT_CURRENT')
  requireThat(sameSet(identity.granted_capabilities, e.capabilities)
    && Date.parse(identity.coordination_session.expires_at) > Date.now(), 'CONNECTOR_SESSION_INVALID')
  return identity
}
const toolWrapper = z.object({ connectionIdentity: z.unknown() }).passthrough()
export function validateBootstrap(result: Bootstrap, e: Expectation, fingerprint: string): void {
  const v = parse(toolWrapper.extend({
    manifest: agentCapabilityManifestResponseSchema,
    skill: agentWellKnownResponseSchema.shape.skill,
    liveProbe: z.object({ teamId: z.string(), teamDiscovery: z.literal('ok') }).passthrough(),
    bootstrap: z.object({ verified: z.literal(true), profileVersion: z.string(), transport: z.literal('streamable_http'), authorityEvaluatedPerRequest: z.literal(true) }).passthrough(),
  }), result.verify)
  const c = parse(toolWrapper.extend({
    identity: agentCapabilityManifestResponseSchema.shape.agent, profileVersion: z.string(),
    team: z.object({ id: z.string() }).passthrough(),
  }), result.context)
  const vi = checkIdentity(v.connectionIdentity, e, fingerprint)
  const ci = checkIdentity(c.connectionIdentity, e, fingerprint)
  requireThat(vi.coordination_session.id === ci.coordination_session.id, 'CONNECTOR_SESSION_MISMATCH')
  for (const agent of [v.manifest.agent, c.identity]) {
    requireThat(agent.actorId === e.agentActorId && agent.sessionId === vi.coordination_session.id
      && ['acknowledged', 'planning', 'executing', 'awaiting_input', 'awaiting_approval', 'blocked', 'paused'].includes(agent.sessionState)
      && sameSet(agent.effectiveCapabilities, e.capabilities) && agent.capabilityScope.workspaceId === e.workspaceId
      && sameSet(agent.capabilityScope.teamIds ?? [], [e.teamId]) && sameSet(agent.capabilityScope.capabilities, e.capabilities)
      && !(agent.capabilityScope.projectIds?.length || agent.capabilityScope.workItemIds?.length || agent.capabilityScope.repositoryIds?.length), 'CONNECTOR_MANIFEST_MISMATCH')
  }
  requireThat(v.manifest.profileVersion === e.profileVersion && v.bootstrap.profileVersion === e.profileVersion
    && c.profileVersion === e.profileVersion && v.liveProbe.teamId === e.teamId && c.team.id === e.teamId, 'CONNECTOR_PROFILE_OR_TEAM_MISMATCH')
  checkSkill(v.skill, e.skill)
}
export async function bootstrapMcp(e: Expectation, token: string, fetcher: typeof fetch): Promise<Bootstrap> {
  const guarded: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requireThat(url === e.mcpUrl, 'CONNECTOR_UNAPPROVED_ENDPOINT')
    return fetcher(input, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(init?.signal ? [init.signal] : [])]) })
  }
  const client = new Client({ name: 'workmesh-connector', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(e.mcpUrl), {
    fetch: guarded,
    requestInit: { headers: { 'X-WorkMesh-Installation-Token': token, 'WorkMesh-Client-Profile': e.profileVersion } },
  })
  try {
    await client.connect(transport)
    const data = async (name: string): Promise<unknown> => {
      const result = await client.callTool({ name, arguments: {} })
      requireThat(!result.isError, 'CONNECTOR_MCP_VERIFICATION_FAILED')
      const wrapper = parse(z.object({ data: z.unknown() }).passthrough(), result.structuredContent)
      return wrapper.data
    }
    const verified = await data('verify_connection')
    const context = await data('get_workmesh_context')
    return { verify: verified, context }
  } catch { throw new ConnectorError('CONNECTOR_MCP_VERIFICATION_FAILED') }
  finally { await client.close().catch(() => {}); await transport.close().catch(() => {}) }
}
async function bytes(response: Response, allowError = false): Promise<Buffer> {
  requireThat(allowError || response.ok, 'CONNECTOR_HTTP_REJECTED')
  const reader = response.body?.getReader()
  requireThat(reader, 'CONNECTOR_EMPTY_RESPONSE')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break
      size += next.value.length
      requireThat(size <= 2_000_000, 'CONNECTOR_RESPONSE_TOO_LARGE')
      chunks.push(next.value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks)
}
async function json(response: Response, allowError = false): Promise<unknown> {
  const body = await bytes(response, allowError)
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
  catch { throw new ConnectorError('CONNECTOR_RESPONSE_INVALID') }
}
export async function discover(e: Expectation, fetcher: typeof fetch): Promise<void> {
  const d = parse(agentWellKnownResponseSchema, await json(await fetcher(e.discoveryUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) })))
  requireThat(d.wellKnownUrl === e.discoveryUrl && d.mcpUrl === e.mcpUrl && d.apiVersion === 'v1'
    && d.supportedClients.includes(e.client.type), 'CONNECTOR_DISCOVERY_MISMATCH')
  checkSkill(d.skill, e.skill)
}
export async function validateCurrent(e: Expectation, token: string, fingerprint: string, deps: ProtocolDependencies): Promise<void> {
  requireThat(/^wmi_[A-Za-z0-9_-]{43}$/.test(token) && sha256(token).slice(0, 12) === fingerprint, 'CONNECTOR_FINGERPRINT_MISMATCH')
  validateBootstrap(await deps.bootstrap(e, token, deps.fetch), e, fingerprint)
}
export async function verifyPairing(e: Expectation, pending: Pending, deps: ProtocolDependencies) {
  await discover(e, deps.fetch)
  const response = await deps.fetch(pending.target, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key, Origin: pending.origin, 'User-Agent': pending.userAgent }, body: pending.body })
  if (!response.ok) {
    const known = z.object({ error: z.object({ code: z.enum(['IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_REPLAY_UNAVAILABLE', 'AGENT_CONNECTION_PAIRING_CONSUMED', 'AGENT_CONNECTION_PAIRING_EXPIRED', 'IDEMPOTENCY_REPLAY_EXPIRED', 'AGENT_CONNECTION_PAIRING_LOCKED']) }).passthrough() }).passthrough().safeParse(await json(response, true))
    throw new ConnectorError(known.success ? known.data.error.code : 'CONNECTOR_REDEEM_REJECTED')
  }
  const redeemed = parse(agentConnectionRedeemResponseSchema, await json(response))
  const fingerprint = sha256(redeemed.installation_token).slice(0, 12)
  requireThat(redeemed.connection.credential_fingerprint_prefix === fingerprint, 'CONNECTOR_FINGERPRINT_MISMATCH')
  checkConnection(redeemed.connection, e, fingerprint)
  requireThat(redeemed.team_id === e.teamId && redeemed.principal_human_actor_id === e.principalHumanActorId
    && redeemed.mcp.url === e.mcpUrl && redeemed.skill.download_url === e.skillUrl, 'CONNECTOR_REDEEM_MISMATCH')
  checkSkill(redeemed.skill, e.skill)
  const skill = await bytes(await deps.fetch(e.skillUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) }))
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(skill) } catch { throw new ConnectorError('CONNECTOR_SKILL_BYTES_INVALID') }
  requireThat(!text.includes('\r') && !text.startsWith('\uFEFF') && Buffer.from(text).equals(skill)
    && text.startsWith('---\nname: workmesh\n') && text.endsWith('\n')
    && `sha256:${sha256(skill)}` === e.skill.sha256, 'CONNECTOR_SKILL_BYTES_INVALID')
  const key = await readFile(trustedKeyPath)
  requireThat(/^ed25519:[A-Za-z0-9+/]+={0,2}$/.test(e.skill.signature)
    && verify(null, skill, key, Buffer.from(e.skill.signature.slice(8), 'base64')), 'CONNECTOR_SKILL_SIGNATURE_INVALID')
  await validateCurrent(e, redeemed.installation_token, fingerprint, deps)
  return { token: redeemed.installation_token, fingerprint, skill, replayableUntil: redeemed.idempotency_replay.replayable_until }
}
export const defaultProtocol: ProtocolDependencies = { fetch: globalThis.fetch, bootstrap: bootstrapMcp }
