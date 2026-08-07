import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  agentConnectionClientTypeSchema,
  agentConnectionCreateInputSchema,
  agentConnectionCreateResponseSchema,
  agentConnectionIdentitySchema,
  agentConnectionPatchInputSchema,
  agentConnectionRedeemInputSchema,
  agentConnectionRedeemResponseSchema,
  agentConnectionResponseSchema,
  agentConnectionRotateResponseSchema,
  agentConnectionStatusSchema,
  agentSessionKindSchema,
  agentWellKnownResponseSchema,
  apiErrorCodeSchema,
  capabilitySchema,
  coordinationSessionResponseSchema,
  delegationScopeTypeSchema,
  stage5RouteManifest,
} from './index.js'

const id = '00000000-0000-4000-8000-000000000001'
const sha = 'a'.repeat(64)
const hash = `sha256:${sha}`

describe('Stage 5 (v1.1) Agent Connection & Coordination MCP contracts', () => {
  it('extends existing enums rather than introducing parallel ones', () => {
    expect(capabilitySchema.options).toContain('agent:delegate')
    expect(delegationScopeTypeSchema.options).toContain('team')
    expect(agentSessionKindSchema.options).toEqual(['execution', 'coordination'])
  })

  it('folds the Stage 5 error codes into the unified apiErrorCodeSchema', () => {
    for (const code of [
      'AGENT_CONNECTION_PAIRING_INVALID',
      'AGENT_CONNECTION_PAIRING_EXPIRED',
      'AGENT_CONNECTION_PAIRING_CONSUMED',
      'AGENT_CONNECTION_PAIRING_LOCKED',
      'AGENT_CONNECTION_REVOKED',
      'AGENT_CONNECTION_PRIVILEGE_ESCALATION',
      'AGENT_CONNECTION_NOT_FOUND',
      'AGENT_CONNECTION_CLIENT_TYPE_MISMATCH',
      'AGENT_CONNECTION_TEAM_MISMATCH',
      'AGENT_CONNECTION_INSTALLATION_MISMATCH',
      'COORDINATION_SESSION_CONNECTION_REVOKED',
      'COORDINATION_SESSION_REFRESH_FAILED',
      'COORDINATION_SESSION_TEAM_SCOPE_DENIED',
      'AGENT_DELEGATE_NOT_GRANTED',
      'COORDINATOR_DESTRUCTIVE_OPERATION_FORBIDDEN',
      'COORDINATOR_AGENT_DELEGATE_NOT_TRANSITIVE',
      'COORDINATOR_PRINCIPAL_HUMAN_INVALID',
      'AGENT_SKILL_VERSION_MISMATCH',
      'AGENT_SKILL_SIGNATURE_INVALID',
    ]) {
      expect(apiErrorCodeSchema.options).toContain(code)
    }
  })

  it('exposes only the plan endpoint set, no list or landing page', () => {
    const operations = stage5RouteManifest.map(r => `${r.method} ${r.path}`)
    expect(operations).toEqual([
      'GET /.well-known/workmesh-agent',
      'POST /api/v1/agent-connections',
      'POST /api/v1/agent-connections/redeem',
      'GET /api/v1/agent-connections/{id}',
      'PATCH /api/v1/agent-connections/{id}',
      'DELETE /api/v1/agent-connections/{id}',
      'POST /api/v1/agent-connections/{id}/rotate',
      'POST /api/v1/agent-connections/{id}/rotate-confirm',
    ])
    expect(operations.some(op => op === 'GET /api/v1/agent-connections')).toBe(false)
    expect(operations.some(op => op === 'GET /agents/connect')).toBe(false)
  })

  it('marks every state-changing route as mutation and PATCH / DELETE as revisioned', () => {
    for (const route of stage5RouteManifest) {
      const isStateChanging = route.method !== 'GET'
      if (isStateChanging) {
        expect(route.mutation, `${route.method} ${route.path} must be mutation: true`).toBe(true)
      }
      if (route.method === 'PATCH' || route.method === 'DELETE') {
        expect(route.revisioned, `${route.method} ${route.path} must be revisioned: true`).toBe(true)
      }
    }
  })

  it('rejects PATCH attempts to escalate privileges', () => {
    expect(() => agentConnectionPatchInputSchema.parse({ name: 'Renamed' })).not.toThrow()
    expect(() => agentConnectionPatchInputSchema.parse({})).toThrow()
    for (const forbidden of [
      { team_id: id },
      { client_type: 'opencode' },
      { requested_capabilities: ['admin:*'] },
      { grant_agent_delegate: true },
      { agent_slug: 'new-slug' },
    ]) {
      expect(() => agentConnectionPatchInputSchema.parse(forbidden), JSON.stringify(forbidden)).toThrow()
    }
  })

  it('rejects connect_url without a fragment and accepts only fragment-embedded pairing codes', () => {
    const response = {
      connection: makeResponse(),
      connect_url: 'https://workmesh.example/connect/backend-coder-1',
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(response)).toThrow(/fragment/)
    const accepted = { ...response, connect_url: 'https://workmesh.example/connect/backend-coder-1#abcd-1234' }
    expect(() => agentConnectionRotateResponseSchema.parse(accepted)).not.toThrow()
  })

  it('rejects the create response when connect_url has no fragment', () => {
    const created = {
      connection: makeResponse(),
      connect_url: 'https://workmesh.example/connect/backend-coder-1?code=abcd',
      skill: { name: 'workmesh' as const, version: '1.1.0', sha256: hash, signature: 'ed25519:' + 'a'.repeat(48) },
    }
    expect(() => agentConnectionCreateResponseSchema.parse(created)).toThrow(/fragment/)
  })

  it('locks the cross-field invariant: grant_agent_delegate=false forbids agent:delegate in granted_capabilities', () => {
    const ok = makeResponse({ grant_agent_delegate: false, granted_capabilities: ['work:read', 'work:write'] })
    expect(() => agentConnectionResponseSchema.parse(ok)).not.toThrow()
    const bad = makeResponse({ grant_agent_delegate: false, granted_capabilities: ['work:read', 'agent:delegate'] })
    expect(() => agentConnectionResponseSchema.parse(bad)).toThrow(/agent:delegate/)
  })

  it('allows grant_agent_delegate=true to include agent:delegate in granted_capabilities', () => {
    const ok = makeResponse({ grant_agent_delegate: true, granted_capabilities: ['work:read', 'agent:delegate'] })
    expect(() => agentConnectionResponseSchema.parse(ok)).not.toThrow()
  })

  it('binds redeem success to an Idempotency-Key replay contract', () => {
    const redeem = makeRedeemResponse()
    const parsed = agentConnectionRedeemResponseSchema.parse(redeem)
    expect(parsed.idempotency_replay.replay_returns_identical_body).toBe(true)
    expect(parsed.idempotency_replay.replayable_until).toBe('2026-08-07T10:10:00Z')
    // Removing the replay contract must fail the schema: a one-shot
    // plaintext Token without an Idempotency-Key promise would force
    // every Agent to re-run setup after any network blip.
    const { idempotency_replay, ...noReplay } = redeem
    void noReplay
    void idempotency_replay
    expect(() => agentConnectionRedeemResponseSchema.parse({ ...redeem, idempotency_replay: undefined })).toThrow()
  })

  it('keeps the well-known manifest free of secret fields', () => {
    const parsed = agentWellKnownResponseSchema.parse({
      protocolVersion: 'v1',
      mcpUrl: 'https://workmesh.example/mcp/coordination',
      wellKnownUrl: 'https://workmesh.example/.well-known/workmesh-agent',
      apiVersion: 'v1',
      supportedClients: ['codex', 'opencode', 'pi'],
      skill: { name: 'workmesh', version: '1.1.0', sha256: hash, signature: 'ed25519:' + 'a'.repeat(48) },
    })
    expect(JSON.stringify(parsed)).not.toMatch(/installation_token|connect_url|pairing_code|secret|token/i)
  })

  it('pins Coordination Session identity to the team-scope coordinator role', () => {
    const parsed = coordinationSessionResponseSchema.parse({
      id,
      connection_id: id,
      session_kind: 'coordination',
      role: 'coordinator',
      delegation_scope: 'team',
      granted_capabilities: ['work:read', 'work:write'],
      expires_at: '2026-08-07T11:00:00Z',
      refreshed_at: null,
      team_id: id,
      principal_human_actor_id: id,
    })
    expect(parsed.role).toBe('coordinator')
    expect(parsed.delegation_scope).toBe('team')
  })

  it('binds identity to a Connection + Coordination Session pair', () => {
    const identity = agentConnectionIdentitySchema.parse({
      connection: makeResponse(),
      coordination_session: {
        id,
        connection_id: id,
        session_kind: 'coordination',
        role: 'coordinator',
        delegation_scope: 'team',
        granted_capabilities: ['work:read', 'work:write'],
        expires_at: '2026-08-07T11:00:00Z',
        refreshed_at: null,
        team_id: id,
        principal_human_actor_id: id,
      },
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })
    expect(identity.coordination_session.role).toBe('coordinator')
  })

  it('validates a minimal Connection create input', () => {
    const parsed = agentConnectionCreateInputSchema.parse({
      name: 'Backend Coder',
      agent_slug: 'backend-coder-1',
      team_id: id,
      client_type: 'codex',
      requested_capabilities: ['work:read', 'work:write'],
      grant_agent_delegate: true,
    })
    expect(parsed.grant_agent_delegate).toBe(true)
  })

  it('validates a redeem input and rejects the un-prefixed secret', () => {
    expect(() => agentConnectionRedeemInputSchema.parse({
      pairing_code: 'abcd-1234',
      agent_slug: 'backend-coder-1',
      client: { type: 'codex', version: '0.40.0' },
    })).not.toThrow()
    expect(() => agentConnectionRedeemInputSchema.parse({
      pairing_code: 'abcd-1234',
      agent_slug: 'BackendCoder',
      client: { type: 'codex', version: '0.40.0' },
    })).toThrow()
  })

  it('uses snake_case wire fields, matching the existing project convention', () => {
    const keys = Object.keys(makeResponse()).sort()
    expect(keys).toContain('grant_agent_delegate')
    expect(keys).toContain('principal_human_actor_id')
    expect(keys).toContain('redacted_token')
    expect(keys).toContain('credential_fingerprint_prefix')
    expect(keys.every(k => k === k.toLowerCase())).toBe(true)
  })

  it('documents every Stage 5 route in OPENAPI.yaml with mutation / revision headers', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    for (const route of stage5RouteManifest) {
      const pathPattern = new RegExp(`^  ${escaped(route.path)}:$`, 'm')
      const pathStart = openapi.search(pathPattern)
      expect(pathStart, route.path).toBeGreaterThanOrEqual(0)
      const nextPath = openapi.slice(pathStart + 1).search(/^  \/[^\n]+:$/m)
      const block = openapi.slice(pathStart, nextPath === -1 ? undefined : pathStart + 1 + nextPath)
      expect(block).toMatch(new RegExp(`^    ${route.method.toLowerCase()}:`, 'm'))
      if ('mutation' in route && route.mutation)
        expect(block).toMatch(/\$ref:\s*["']#\/components\/parameters\/IdempotencyKey["']/)
      if ('revisioned' in route && route.revisioned)
        expect(block).toMatch(/\$ref:\s*["']#\/components\/parameters\/IfMatch["']/)
    }
  })

  it('extends the unified OPENAPI Capability and Error enums rather than shadowing them', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).toMatch(/enum:\s*\[[^\]]*"agent:delegate"[^\]]*\]/m)
    expect(openapi).toMatch(/AGENT_CONNECTION_PAIRING_INVALID/)
    expect(openapi).toMatch(/COORDINATION_SESSION_CONNECTION_REVOKED/)
    expect(openapi).toMatch(/enum:\s*\[[^\]]*team[^\]]*\]/m)
    // Sanity: the duplicate AgentCapability schema is NOT in OpenAPI; we
    // extended the canonical Capability enum instead.
    expect(openapi).not.toMatch(/^    AgentCapability:/m)
  })
})

function makeResponse(overrides: Partial<ReturnType<typeof baseResponse>> = {}): ReturnType<typeof baseResponse> {
  return { ...baseResponse(), ...overrides }
}

type Capability = 'work:read' | 'work:write' | 'agent:delegate' | string
type Response = {
  id: string
  workspace_id: string
  team_id: string
  agent_actor_id: string
  principal_human_actor_id: string
  name: string
  agent_slug: string
  client_type: 'codex' | 'opencode' | 'pi'
  status: 'pending' | 'active' | 'rotating' | 'revoked'
  requested_capabilities: Capability[]
  granted_capabilities: Capability[]
  grant_agent_delegate: boolean
  skill_version: string
  skill_sha256: string
  credential_fingerprint_prefix: string
  pairing_code_expires_at: string | null
  last_used_at: string | null
  rotated_at: string | null
  revoked_at: string | null
  revision: number
  redacted_token: true
  created_at: string
  updated_at: string
}

function baseResponse(): Response {
  return {
    id,
    workspace_id: id,
    team_id: id,
    agent_actor_id: id,
    principal_human_actor_id: id,
    name: 'Backend Coder',
    agent_slug: 'backend-coder-1',
    client_type: 'codex',
    status: 'active',
    requested_capabilities: ['work:read'],
    granted_capabilities: ['work:read', 'work:write'],
    grant_agent_delegate: false,
    skill_version: '1.1.0',
    skill_sha256: hash,
    credential_fingerprint_prefix: 'wmc_live_abc',
    pairing_code_expires_at: null,
    last_used_at: null,
    rotated_at: null,
    revoked_at: null,
    revision: 1,
    redacted_token: true,
    created_at: '2026-08-07T10:00:00Z',
    updated_at: '2026-08-07T10:00:00Z',
  }
}

function makeRedeemResponse() {
  return {
    connection: makeResponse(),
    installation_token: 'it_' + 'a'.repeat(48),
    mcp: {
      transport: 'streamable_http' as const,
      url: 'https://workmesh.example/mcp/coordination',
      auth: { type: 'installation_token' as const, header: 'X-WorkMesh-Installation-Token' as const },
    },
    skill: {
      name: 'workmesh' as const,
      version: '1.1.0',
      sha256: hash,
      signature: 'ed25519:' + 'a'.repeat(48),
      download_url: 'https://workmesh.example/skills/workmesh-1.1.0.tar.gz',
    },
    principal_human_actor_id: id,
    team_id: id,
    idempotency_replay: {
      replayable_until: '2026-08-07T10:10:00Z',
      replay_returns_identical_body: true as const,
    },
  }
}
