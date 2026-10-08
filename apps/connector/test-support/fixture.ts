import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { workmeshSkillManifest, createAgentCapabilityManifest, featureKeySchema, type FeatureKey } from '@workmesh/contracts'
import { sha256, type Expectation } from '../src/config.js'
import type { SecretStore } from '../src/secret-store.js'
import type { ProtocolDependencies } from '../src/protocol.js'

export const pairingCode = 'wmp_' + 'a'.repeat(43)
export class MemoryStore implements SecretStore {
  values = new Map<string, string>()
  async put(ref: string, token: string) { this.values.set(ref, token) }
  async get(ref: string) { return this.values.get(ref) ?? null }
  async delete(ref: string) { this.values.delete(ref) }
}
export async function fixture(token = 'wmi_' + 'b'.repeat(43), provided?: Expectation) {
  const e: Expectation = provided ?? {
    deploymentUrl: 'https://workmesh.example', discoveryUrl: 'https://workmesh.example/.well-known/workmesh-agent',
    redeemUrl: 'https://workmesh.example/api/v1/agent-connections/redeem', mcpUrl: 'https://workmesh.example/mcp/coordination',
    skillUrl: 'https://workmesh.example/skills/workmesh-1.1.0.md', workspaceId: randomUUID(), connectionId: randomUUID(),
    agentActorId: randomUUID(), teamId: randomUUID(), principalHumanActorId: randomUUID(), agentSlug: 'connector-test',
    client: { type: 'codex', version: '1.1.0' }, profileVersion: '1.0',
    requestedCapabilities: ['work:read', 'work:write'], capabilities: ['work:read', 'work:write'], grantAgentDelegate: false,
    skill: { ...workmeshSkillManifest },
  }
  const now = new Date().toISOString()
  const connection = {
    id: e.connectionId, workspace_id: e.workspaceId, team_id: e.teamId, agent_actor_id: e.agentActorId,
    principal_human_actor_id: e.principalHumanActorId, name: '测试连接器', agent_slug: e.agentSlug, client_type: e.client.type,
    status: 'active', source: 'manual', enrollment_policy_id: null, requested_capabilities: [...e.requestedCapabilities],
    granted_capabilities: [...e.capabilities], grant_agent_delegate: false,
    skill_version: e.skill.version, skill_sha256: e.skill.sha256, credential_fingerprint_prefix: sha256(token).slice(0, 12),
    pairing_code_expires_at: null, last_used_at: null, rotated_at: null, revoked_at: null, revision: 1,
    redacted_token: true, created_at: now, updated_at: now,
  }
  const sessionId = randomUUID()
  const identity = {
    connection, coordination_session: {
      id: sessionId, connection_id: e.connectionId, session_kind: 'coordination', role: 'coordinator', delegation_scope: 'team',
      granted_capabilities: [...e.capabilities], expires_at: new Date(Date.now() + 3600_000).toISOString(), refreshed_at: null,
      team_id: e.teamId, principal_human_actor_id: e.principalHumanActorId,
    },
    agent_actor_id: e.agentActorId, principal_human_actor_id: e.principalHumanActorId, team_id: e.teamId,
    granted_capabilities: [...e.capabilities],
    authenticated_credential: { fingerprint_prefix: sha256(token).slice(0, 12), status: 'active', overlap_until: null },
  }
  const manifest = createAgentCapabilityManifest({ actorId: e.agentActorId, sessionId, sessionState: 'executing', sessionRevision: 1,
    effectiveCapabilities: e.capabilities, capabilityScope: { workspaceId: e.workspaceId, teamIds: [e.teamId], projectIds: [], workItemIds: [], repositoryIds: [], capabilities: e.capabilities }, supportedProtocols: ['mcp'], pushConfigured: false,
    features: Object.fromEntries(featureKeySchema.options.map(key => [key, false])) as Record<FeatureKey, boolean> })
  const verified = { connectionIdentity: identity, manifest, liveProbe: { teamId: e.teamId, teamDiscovery: 'ok' }, skill: e.skill,
    bootstrap: { verified: true, transport: 'streamable_http', profileVersion: e.profileVersion, authorityEvaluatedPerRequest: true } }
  const context = { connectionIdentity: identity, identity: manifest.agent, profileVersion: e.profileVersion, team: { id: e.teamId } }
  const redeemed = { connection, installation_token: token, mcp: { transport: 'streamable_http', url: e.mcpUrl, auth: { type: 'installation_token', header: 'X-WorkMesh-Installation-Token' } },
    skill: { ...e.skill, download_url: e.skillUrl }, principal_human_actor_id: e.principalHumanActorId, team_id: e.teamId,
    idempotency_replay: { replayable_until: new Date(Date.now() + 900_000).toISOString(), replay_returns_identical_body: true } }
  let skill = await readFile(new URL('../../web/public/skills/workmesh-1.1.0.md', import.meta.url))
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const protocol: ProtocolDependencies = {
    fetch: async (input, init) => {
      const url = String(input); requests.push({ url, init })
      if (url === e.discoveryUrl) return Response.json({ protocolVersion: 'v1', apiVersion: 'v1', mcpUrl: e.mcpUrl, wellKnownUrl: e.discoveryUrl, supportedClients: ['codex'], skill: e.skill })
      if (url === e.redeemUrl) return Response.json(redeemed)
      if (url === e.skillUrl) return new Response(new Uint8Array(skill))
      throw new Error('unexpected endpoint')
    },
    bootstrap: async () => ({ verify: verified, context }),
  }
  return { e, token, identity, verified, context, redeemed, requests, protocol, tamperSkill: () => { skill = Buffer.concat([skill, Buffer.from('篡改')]) } }
}
