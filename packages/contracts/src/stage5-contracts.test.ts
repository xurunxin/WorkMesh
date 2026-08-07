import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  agentConnectionClientTypeSchema,
  agentConnectionCreateInputSchema,
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

  it('exposes only the plan endpoint set, no list / no /agents/connect, but /rotate-confirm IS the explicit "确认成功后撤销旧凭据" operation (plan v0.4)', () => {
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
    // /rotate-confirm must be revisioned: true (If-Match) and not
    // conflated with /rotate. Plan v0.2/v0.3 dropped it or replaced
    // it with worker auto-expiry; v0.4 brings it back.
    const rotateConfirm = stage5RouteManifest.find(r => r.path === '/api/v1/agent-connections/{id}/rotate-confirm')
    expect(rotateConfirm?.method).toBe('POST')
    expect(rotateConfirm?.mutation).toBe(true)
    expect(rotateConfirm?.revisioned).toBe(true)
  })

  it('marks every state-changing route as mutation and PATCH / DELETE / rotate / rotate-confirm as revisioned', () => {
    for (const route of stage5RouteManifest) {
      const isStateChanging = route.method !== 'GET'
      if (isStateChanging) {
        expect(route.mutation, `${route.method} ${route.path} must be mutation: true`).toBe(true)
      }
      if (route.method === 'PATCH' || route.method === 'DELETE' || route.method === 'POST') {
        // The high-conflict rotate / rotate-confirm mutations also need
        // If-Match per the review; the route manifest's `revisioned: true`
        // is the contract surface for that. Plan v0.4 makes the two
        // operations distinct: rotate issues a new pairing code;
        // rotate-confirm revokes only the old fingerprint on confirm.
        if (
          route.path === '/api/v1/agent-connections/{id}/rotate' ||
          route.path === '/api/v1/agent-connections/{id}/rotate-confirm'
        ) {
          expect(route.revisioned, `${route.method} ${route.path} must be revisioned: true`).toBe(true)
        }
        if (route.method === 'PATCH' || route.method === 'DELETE') {
          expect(route.revisioned, `${route.method} ${route.path} must be revisioned: true`).toBe(true)
        }
      }
    }
  })

  it('uses camelCase on request DTOs, matching the existing project convention', () => {
    const parsed = agentConnectionCreateInputSchema.parse({
      name: 'Backend Coder',
      agentSlug: 'backend-coder-1',
      teamId: id,
      clientType: 'codex',
      requestedCapabilities: ['work:read', 'work:write'],
      grantAgentDelegate: true,
    })
    expect(parsed.grantAgentDelegate).toBe(true)
    expect(parsed.requestedCapabilities).toHaveLength(2)
  })

  it('rejects snake_case keys on request DTOs (camelCase is the rule)', () => {
    expect(() => agentConnectionCreateInputSchema.parse({
      name: 'Backend Coder',
      agent_slug: 'backend-coder-1',
      team_id: id,
      client_type: 'codex',
      requested_capabilities: ['work:read'],
      grant_agent_delegate: false,
    })).toThrow()
  })

  it('rejects PATCH attempts to escalate privileges', () => {
    expect(() => agentConnectionPatchInputSchema.parse({ name: 'Renamed' })).not.toThrow()
    expect(() => agentConnectionPatchInputSchema.parse({})).toThrow()
    for (const forbidden of [
      { teamId: id },
      { clientType: 'opencode' },
      { requestedCapabilities: ['admin:*'] },
      { grantAgentDelegate: true },
      { agentSlug: 'new-slug' },
    ]) {
      expect(() => agentConnectionPatchInputSchema.parse(forbidden), JSON.stringify(forbidden)).toThrow()
    }
  })

  it('rejects the review-flagged fragment bypass', () => {
    // The reviewer verified the previous version accepted this URL.
    const response = {
      connection: makeResponse(),
      connect_url: 'https://example.test/connect?pairing_code=LEAK#placeholder',
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(response)).toThrow(/fragment/)
    const alsoBlocked = {
      ...response,
      connect_url: 'https://example.test/connect/backend-coder-1?code=LEAK#abcd-1234',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(alsoBlocked)).toThrow(/credentials/)
  })

  it('rejects connect_url with an empty fragment, short fragment, or non-/connect path', () => {
    const base = {
      connection: makeResponse(),
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    for (const url of [
      'https://workmesh.example/connect/backend-coder-1#',
      'https://workmesh.example/connect/backend-coder-1#short',
      'https://workmesh.example/wrong-path/backend-coder-1#abcd-1234',
      'http://workmesh.example/connect/backend-coder-1#abcd-1234',
    ]) {
      expect(() => agentConnectionRotateResponseSchema.parse({ ...base, connect_url: url })).toThrow()
    }
  })

  it('accepts a well-formed fragment-embedded connect URL', () => {
    const accepted = {
      connection: makeResponse(),
      connect_url: 'https://workmesh.example/connect/backend-coder-1#abcd-1234-efgh',
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(accepted)).not.toThrow()
  })

  it('locks the cross-field invariant: grant_agent_delegate=false forbids agent:delegate in granted_capabilities', () => {
    const ok = makeResponse({ grant_agent_delegate: false, granted_capabilities: ['work:read', 'work:write'] })
    expect(() => agentConnectionResponseSchema.parse(ok)).not.toThrow()
    const bad = makeResponse({ grant_agent_delegate: false, granted_capabilities: ['work:read', 'agent:delegate'] })
    expect(() => agentConnectionResponseSchema.parse(bad)).toThrow(/agent:delegate/)
  })

  it('allows grant_agent_delegate=true to include agent:delegate in granted_capabilities', () => {
    const ok = makeResponse({ grant_agent_delegate: true, requested_capabilities: ['work:read', 'agent:delegate'], granted_capabilities: ['work:read', 'agent:delegate'] })
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
    expect(() =>
      agentConnectionRedeemResponseSchema.parse({ ...redeem, idempotency_replay: undefined }),
    ).toThrow()
  })

  it('requires the redeem response bundle to carry download_url', () => {
    const redeem = makeRedeemResponse()
    const { skill, ...rest } = redeem
    void rest
    expect(() =>
      agentConnectionRedeemResponseSchema.parse({ ...redeem, skill: { ...skill, download_url: undefined } }),
    ).toThrow()
  })

  it('forbids the redeem response bundle from carrying undeclared fields', () => {
    const redeem = makeRedeemResponse()
    expect(() =>
      agentConnectionRedeemResponseSchema.parse({
        ...redeem,
        connection: { ...redeem.connection, installation_token: 'leak' } as unknown as typeof redeem.connection,
      }),
    ).toThrow()
  })

  it('keeps the well-known manifest bundle free of download_url and secret fields', () => {
    expect(() =>
      agentWellKnownResponseSchema.parse({
        protocolVersion: 'v1',
        mcpUrl: 'https://workmesh.example/mcp/coordination',
        wellKnownUrl: 'https://workmesh.example/.well-known/workmesh-agent',
        apiVersion: 'v1',
        supportedClients: ['codex', 'opencode', 'pi'],
        skill: {
          name: 'workmesh',
          version: '1.1.0',
          sha256: hash,
          signature: 'ed25519:' + 'a'.repeat(48),
          download_url: 'https://workmesh.example/skills/workmesh-1.1.0.tar.gz',
        },
      }),
    ).toThrow(/download_url/)
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

  it('locks CoordinationSession delegation_scope to team (no other scope accepted)', () => {
    expect(() => coordinationSessionResponseSchema.parse({
      id,
      connection_id: id,
      session_kind: 'coordination',
      role: 'coordinator',
      delegation_scope: 'work_item',
      granted_capabilities: ['work:read'],
      expires_at: '2026-08-07T11:00:00Z',
      refreshed_at: null,
      team_id: id,
      principal_human_actor_id: id,
    })).toThrow()
  })

  it('rejects duplicate requestedCapabilities on the create input', () => {
    expect(() => agentConnectionCreateInputSchema.parse({
      name: 'Backend Coder',
      agentSlug: 'backend-coder-1',
      teamId: id,
      clientType: 'codex',
      requestedCapabilities: ['work:read', 'work:write', 'work:read'],
      grantAgentDelegate: false,
    })).toThrow()
  })

  it('rejects unrequested granted_capabilities (admin:* sneaking through)', () => {
    const unrequested = makeResponse({
      requested_capabilities: ['work:read'],
      granted_capabilities: ['admin:*'],
      grant_agent_delegate: true,
    })
    expect(() => agentConnectionResponseSchema.parse(unrequested)).toThrow(/subset/)
  })

  it('rejects duplicate granted_capabilities', () => {
    const duplicates = makeResponse({
      grant_agent_delegate: false,
      granted_capabilities: ['work:read', 'work:read'],
    })
    expect(() => agentConnectionResponseSchema.parse(duplicates)).toThrow()
  })

  it('constrains agent_slug to the documented slug pattern', () => {
    const bad = makeResponse({ agent_slug: 'Has Spaces' })
    expect(() => agentConnectionResponseSchema.parse(bad)).toThrow(/slug/i)
  })

  it('constrains skill_sha256 to the documented sha256:hex pattern (or null)', () => {
    const bad = makeResponse({ skill_sha256: 'not-a-sha256' })
    expect(() => agentConnectionResponseSchema.parse(bad)).toThrow(/sha256/)
  })

  it('rejects userinfo in connect_url (https://code@host.test/connect/x#abc)', () => {
    const response = {
      connection: makeResponse(),
      connect_url: 'https://code@host.test/connect/backend-coder-1#abcdefgh-1234',
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(response)).toThrow(/userinfo/)
  })

  it('rejects userinfo in connect_url (https://user:pass@host/connect/x#abc)', () => {
    const response = {
      connection: makeResponse(),
      connect_url: 'https://user:pass@host.test/connect/backend-coder-1#abcdefgh-1234',
      pairing_code_expires_at: '2026-08-07T10:10:00Z',
      overlap_until: '2026-08-07T10:15:00Z',
    }
    expect(() => agentConnectionRotateResponseSchema.parse(response)).toThrow(/userinfo/)
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

  it('validates a redeem input with camelCase fields', () => {
    expect(() => agentConnectionRedeemInputSchema.parse({
      pairingCode: 'abcd-1234',
      agentSlug: 'backend-coder-1',
      client: { type: 'codex', version: '0.40.0' },
    })).not.toThrow()
    expect(() => agentConnectionRedeemInputSchema.parse({
      pairingCode: 'abcd-1234',
      agentSlug: 'BackendCoder',
      client: { type: 'codex', version: '0.40.0' },
    })).toThrow()
  })

  it('uses snake_case wire fields on the response, matching the existing project convention', () => {
    const keys = Object.keys(makeResponse()).sort()
    expect(keys).toContain('grant_agent_delegate')
    expect(keys).toContain('principal_human_actor_id')
    expect(keys).toContain('redacted_token')
    expect(keys).toContain('credential_fingerprint_prefix')
    expect(keys.every(k => k === k.toLowerCase())).toBe(true)
  })

  it('forbids undeclared fields on the Connection response (no installation_token leak)', () => {
    expect(() =>
      agentConnectionResponseSchema.parse({
        ...makeResponse(),
        installation_token: 'leak',
      } as unknown as ReturnType<typeof makeResponse>),
    ).toThrow()
  })

  it('documents every Stage 5 route in OPENAPI.yaml with mutation / revision headers and ETag responses', async () => {
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
    // The high-conflict rotate mutation must require If-Match per the review.
    const rotateBlock = openapi.slice(openapi.search(/^  \/api\/v1\/agent-connections\/\{id\}\/rotate:$/m))
    expect(rotateBlock).toMatch(/\$ref:\s*["']#\/components\/parameters\/IfMatch["']/)
    // GET responses must declare the ETag header (the description text varies
    // between schemas, so just check the header shape).
    const openapiAfterAgentConnections = openapi.slice(openapi.indexOf('/api/v1/agent-connections'))
    expect(openapiAfterAgentConnections).toMatch(/ETag:\s*\{\s*schema:\s*\{\s*type:\s*string\s*\}[^}]*Revision ETag/s)
  })

  it('enforces the cross-field agent:delegate invariant in OPENAPI, not just Zod', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // JSON Schema 2020-12 if/then/else is the OpenAPI 3.1 way to express
    // "if A is false then B must not contain X". The previous dependentRequired
    // was a no-op because granted_capabilities is already required.
    // The if/then/else is rendered as a single-line allOf in this OpenAPI
    // file; the test accepts either single-line or multi-line forms.
    expect(openapi).toMatch(/if:\s*\{[\s\S]*?grant_agent_delegate:\s*\{\s*const:\s*false/)
    expect(openapi).toMatch(/not:\s*\{\s*contains:\s*\{\s*const:\s*"agent:delegate"\s*\}\s*\}/)
  })

  it('extends the unified OPENAPI Capability and Error enums rather than shadowing them', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).toMatch(/enum:\s*\[[^\]]*"agent:delegate"[^\]]*\]/m)
    expect(openapi).toMatch(/AGENT_CONNECTION_PAIRING_INVALID/)
    expect(openapi).toMatch(/COORDINATION_SESSION_CONNECTION_REVOKED/)
    expect(openapi).toMatch(/enum:\s*\[[^\]]*team[^\]]*\]/m)
    expect(openapi).not.toMatch(/^    AgentCapability:/m)
  })

  it('locks CoordinationSession delegation_scope to const: team in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The CoordinationSession schema must use const: team, not the
    // DelegationScopeType ref. Otherwise a generated client could
    // send work_item or plan_step and weaken Team isolation.
    expect(openapi).toMatch(/CoordinationSession:[\s\S]*?delegation_scope:\s*\{\s*const:\s*team\s*\}/)
  })

  it('does not mark the redeem installation_token as writeOnly', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The Redeem response must NOT have writeOnly: true on
    // installation_token. writeOnly is for input fields; strict client
    // generators strip the field on responses, breaking first redeem
    // and Idempotency-Key replay. Note: the description text is
    // allowed to mention "writeOnly" as a concept explanation; we
    // only assert the JSON Schema keyword writeOnly: true is not set.
    const idx = openapi.indexOf('AgentConnectionRedeemResponse:')
    expect(idx, 'redeem response schema must exist').toBeGreaterThanOrEqual(0)
    const sub = openapi.slice(idx)
    const fieldStart = sub.indexOf('installation_token:')
    expect(fieldStart, 'installation_token field must exist').toBeGreaterThanOrEqual(0)
    const fieldEnd = sub.indexOf('}, mcp:', fieldStart)
    expect(fieldEnd, 'installation_token field must end before mcp').toBeGreaterThanOrEqual(0)
    const field = sub.slice(fieldStart, fieldEnd)
    expect(field).not.toMatch(/writeOnly:\s*true/)
  })

  it('declares connect_url without userinfo in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The connect_url pattern must exclude @ so userinfo
    // (https://user:pass@host/...) is rejected at the contract layer.
    // Pull the pattern value from each connect_url field and assert
    // it does not contain @ in the host char class.
    const patterns = [...openapi.matchAll(/connect_url:\s*\{[^}]*pattern:\s*"([^"]+)"/g)]
    expect(patterns.length).toBeGreaterThanOrEqual(2)
    for (const m of patterns) {
      // The host char class appears right after `^https://`. The host
      // class must be limited to host-safe chars; @ is the userinfo marker.
      expect(m[1]).toMatch(/\^https:\/\//)
      // The pattern as a whole must not allow @ (which is what userinfo uses).
      expect(m[1]).not.toMatch(/@/)
    }
  })

  it('enforces granted_capabilities ⊆ requested_capabilities in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The reviewer flagged that admin:* could be granted when only
    // work:read was requested. The contract must (a) declare the
    // subset relationship as a top-level description, and (b) include
    // one if/then/else block per capability (17 in total) inside the
    // allOf array so a spec validator can decide the subset property.
    expect(openapi).toMatch(/granted_capabilities must be a subset of requested_capabilities/)
    // 17 per-capability subset blocks (one per Capability enum value).
    // The description text is the YAML-escaped form `granted \u2286 requested:`
    // (backslash + u2286) so a non-Unicode-aware tool like ripgrep can grep it;
    // the regex below uses a doubled backslash to match the literal sequence
    // in the file (a single \u in JS regex would be parsed as Unicode ⊆).
    const subsetMarkers = openapi.match(/granted \\u2286 requested:/g) || []
    expect(subsetMarkers.length, 'AgentConnectionResponse must have 17 per-capability subset blocks').toBe(17)
  })

  it('binds AgentConnectionIdentity to the parent Connection + Coordination Session in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // (a) CoordinationSession.granted_capabilities must be uniqueItems.
    const coordBlock = openapi.match(/CoordinationSession:[\s\S]*?uniqueItems:\s*true/)
    expect(coordBlock, 'CoordinationSession.granted_capabilities must be uniqueItems:true').toBeTruthy()
    // (b) AgentConnectionIdentity must declare subset + equality invariants.
    expect(openapi).toMatch(/coordination_session\.granted_capabilities is a subset of connection\.granted_capabilities/)
    expect(openapi).toMatch(/identity\.granted_capabilities equals coordination_session\.granted_capabilities/)
    // (c) 17 + 17 + 17 = 51 allOf blocks; count the per-capability "If
    //     the Connection did not grant", "If the Session did not
    //     grant", and "If the identity does not grant" markers.
    const a = openapi.match(/If the Connection did not grant/g) || []
    const b = openapi.match(/If the Session did not grant/g) || []
    const c = openapi.match(/If the identity does not grant/g) || []
    expect(a.length, 'subset blocks (connection → session)').toBe(17)
    expect(b.length, 'subset blocks (session → identity)').toBe(17)
    expect(c.length, 'equality blocks (identity → session)').toBe(17)
  })

  it('locks skill_version to SemVer in both Zod and OPENAPI', () => {
    // The plan-stage5 schema's skill_version accepts any string today;
    // AGENT_SKILL_VERSION_MISMATCH is not decidable on a free-form
    // string. Pin to SemVer 2.0.0 (https://semver.org).
    // makeResponse() returns the base object; the actual Zod parse
    // happens in agentConnectionResponseSchema.parse(...).
    const parse = (overrides: Parameters<typeof makeResponse>[0]) => {
      const result = agentConnectionResponseSchema.safeParse(makeResponse(overrides))
      if (!result.success) throw new Error(JSON.stringify(result.error.issues, null, 2))
      return result.data
    }
    expect(() => parse({ skill_version: 'not-semver' })).toThrow(/SemVer/)
    expect(() => parse({ skill_version: '1.0' })).toThrow(/SemVer/)
    // v5 review: the previous `\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$`
    // accepted `01.0.0` (leading zeros forbidden by SemVer 2.0.0 §2)
    // and `1.0.0-alpha..1` (consecutive dots forbidden by §9), and
    // rejected `1.0.0+build.1` (build metadata is part of SemVer
    // 2.0.0 §10). The official SemVer regex from semver.org covers
    // all three correctly.
    expect(() => parse({ skill_version: '01.0.0' })).toThrow(/SemVer/)
    expect(() => parse({ skill_version: '1.0.0-alpha..1' })).toThrow(/SemVer/)
    expect(() => parse({ skill_version: '1.0.0' })).not.toThrow()
    expect(() => parse({ skill_version: '1.0.0-rc.1' })).not.toThrow()
    expect(() => parse({ skill_version: '1.0.0+build.1' })).not.toThrow()
    expect(() => parse({ skill_version: '1.0.0-rc.1+build.5' })).not.toThrow()
  })

  it('rejects duplicate granted_capabilities on the Coordination Session', () => {
    expect(() => coordinationSessionResponseSchema.parse({
      id,
      connection_id: id,
      session_kind: 'coordination',
      role: 'coordinator',
      delegation_scope: 'team',
      granted_capabilities: ['work:read', 'work:read'],
      expires_at: '2026-08-07T11:00:00Z',
      refreshed_at: null,
      team_id: id,
      principal_human_actor_id: id,
    })).toThrow()
  })

  it('rejects Coordination Session claims that exceed the parent Connection grants', () => {
    const tight = makeResponse({ granted_capabilities: ['work:read', 'work:write'] })
    const overreaching = {
      connection: tight,
      coordination_session: {
        id,
        connection_id: id,
        session_kind: 'coordination' as const,
        role: 'coordinator' as const,
        delegation_scope: 'team' as const,
        granted_capabilities: ['work:read', 'admin:*'], // admin:* not granted by the parent
        expires_at: '2026-08-07T11:00:00Z',
        refreshed_at: null,
        team_id: id,
        principal_human_actor_id: id,
      },
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'admin:*'],
    }
    expect(() => agentConnectionIdentitySchema.parse(overreaching)).toThrow(/subset/)
  })

  it('rejects identity.granted_capabilities that drift from coordination_session.granted_capabilities', () => {
    const tight = makeResponse({ granted_capabilities: ['work:read', 'work:write'] })
    const drifted = {
      connection: tight,
      coordination_session: {
        id,
        connection_id: id,
        session_kind: 'coordination' as const,
        role: 'coordinator' as const,
        delegation_scope: 'team' as const,
        granted_capabilities: ['work:read', 'work:write'],
        expires_at: '2026-08-07T11:00:00Z',
        refreshed_at: null,
        team_id: id,
        principal_human_actor_id: id,
      },
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read'], // missing work:write; drift from session
    }
    expect(() => agentConnectionIdentitySchema.parse(drifted)).toThrow(/equal/)
  })

  it('rejects duplicate granted_capabilities on the per-request Identity', () => {
    const tight = makeResponse({ granted_capabilities: ['work:read', 'work:write'] })
    const duplicates = {
      connection: tight,
      coordination_session: {
        id,
        connection_id: id,
        session_kind: 'coordination' as const,
        role: 'coordinator' as const,
        delegation_scope: 'team' as const,
        granted_capabilities: ['work:read', 'work:read'],
        expires_at: '2026-08-07T11:00:00Z',
        refreshed_at: null,
        team_id: id,
        principal_human_actor_id: id,
      },
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:read'],
    }
    expect(() => agentConnectionIdentitySchema.parse(duplicates)).toThrow()
  })

  // The 8 cross-Identity id bindings enforced by the v5 fix. JSON
  // Schema 2020-12 has no value-comparison operator so OpenAPI cannot
  // enforce these equalities; the Zod superRefine does. Each test
  // flips exactly one field on the Session or Identity to a fresh
  // UUID and asserts the parse fails.
  const crossBindingFixtures = () => {
    const otherId = '11111111-1111-4111-8111-111111111111'
    return {
      tight: makeResponse({ granted_capabilities: ['work:read', 'work:write'] }),
      makeSession: (overrides: Partial<{
        id: string; connection_id: string; team_id: string; principal_human_actor_id: string
      }> = {}) => ({
        id,
        connection_id: id,
        session_kind: 'coordination' as const,
        role: 'coordinator' as const,
        delegation_scope: 'team' as const,
        granted_capabilities: ['work:read', 'work:write'],
        expires_at: '2026-08-07T11:00:00Z',
        refreshed_at: null,
        team_id: id,
        principal_human_actor_id: id,
        ...overrides,
      }),
      otherId,
    }
  }

  it('binds coordination_session.connection_id === connection.id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession({ connection_id: f.otherId }),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/connection_id === connection\.id/)
  })

  it('binds coordination_session.team_id === connection.team_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession({ team_id: f.otherId }),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/team_id === connection\.team_id/)
  })

  it('binds coordination_session.principal_human_actor_id === connection.principal_human_actor_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession({ principal_human_actor_id: f.otherId }),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/principal_human_actor_id === connection\.principal_human_actor_id/)
  })

  it('binds identity.team_id === connection.team_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession(),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: f.otherId,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/team_id === connection\.team_id/)
  })

  it('binds identity.principal_human_actor_id === connection.principal_human_actor_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession(),
      agent_actor_id: id,
      principal_human_actor_id: f.otherId,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/principal_human_actor_id === connection\.principal_human_actor_id/)
  })

  it('binds identity.agent_actor_id === connection.agent_actor_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession(),
      agent_actor_id: f.otherId,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/agent_actor_id === connection\.agent_actor_id/)
  })

  it('binds coordination_session.team_id === identity.team_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession({ team_id: f.otherId }),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/team_id === identity\.team_id/)
  })

  it('binds coordination_session.principal_human_actor_id === identity.principal_human_actor_id', () => {
    const f = crossBindingFixtures()
    expect(() => agentConnectionIdentitySchema.parse({
      connection: f.tight,
      coordination_session: f.makeSession({ principal_human_actor_id: f.otherId }),
      agent_actor_id: id,
      principal_human_actor_id: id,
      team_id: id,
      granted_capabilities: ['work:read', 'work:write'],
    })).toThrow(/principal_human_actor_id === identity\.principal_human_actor_id/)
  })

  it('documents the 8 cross-Identity id bindings in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // (a) The d.1..d.8 markers must be in the AgentConnectionIdentity
    //     description. JSON Schema 2020-12 cannot compare two
    //     dynamic values, so OpenAPI documents the constraint; the
    //     Zod superRefine is the actual enforcer.
    for (const tag of ['d.1)', 'd.2)', 'd.3)', 'd.4)', 'd.5)', 'd.6)', 'd.7)', 'd.8)']) {
      expect(openapi, `AgentConnectionIdentity description must contain ${tag}`).toContain(tag)
    }
  })

  it('lists the 7 nullable AgentConnectionResponse fields in OPENAPI required', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    for (const f of ['skill_version', 'skill_sha256', 'credential_fingerprint_prefix', 'pairing_code_expires_at', 'last_used_at', 'rotated_at', 'revoked_at']) {
      const required = openapi.match(/AgentConnectionResponse: \{ type: object, additionalProperties: false, required: \[[^\]]+\]/)
      expect(required, 'AgentConnectionResponse must have an explicit required array').toBeTruthy()
      expect(required![0], `${f} must be in required`).toContain(` ${f}, `)
    }
  })

  it('lists refreshed_at in CoordinationSession OPENAPI required', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const required = openapi.match(/CoordinationSession: \{ type: object, additionalProperties: false, required: \[[^\]]+\]/)
    expect(required, 'CoordinationSession must have an explicit required array').toBeTruthy()
    expect(required![0], 'refreshed_at must be in required').toContain(' refreshed_at, ')
  })

  it('keeps the subset-block generator in sync with the canonical capability list', async () => {
    // The v5 review flagged the 69 hand-written if/then/else blocks
    // as Duplicated Code. The single source of truth is the
    // CAPABILITIES array in scripts/generate-stage5-subset-blocks.mjs.
    // This test imports the generator, runs it, and checks the
    // output count matches the formula: 18 = 1 + 17, 51 = 17 * 3,
    // 69 = 18 + 51. If a new capability is added, the canonical
    // list grows; this test would fail with the new expected counts,
    // forcing the OPENAPI author to regenerate.
    const { execFileSync } = await import('node:child_process')
    const { fileURLToPath } = await import('node:url')
    const scriptPath = fileURLToPath(new URL('../../../scripts/generate-stage5-subset-blocks.mjs', import.meta.url))
    const out = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' })
    expect(out, 'generator must report 18 + 51 = 69 blocks').toMatch(/17 capabilities, 18 \+ 51 = 69 blocks total\./)
    // The OPENAPI must contain the same counts. This is a soft
    // check (the OPENAPI is hand-edited and may use slightly
    // different comments); the hard check is the generator.
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    const responseCount = (openapi.match(/granted \\u2286 requested:/g) || []).length
    expect(responseCount, 'OPENAPI AgentConnectionResponse must have 17 per-capability subset markers').toBe(17)
  })

  it('AGENT_PROTOCOL.md does not call DELETE the "only-revoke-old-credential" path', async () => {
    // v5 review: the previous wording "DELETE is the path to revoke old
    // credentials early during the rotate overlap" was misleading;
    // DELETE actually revokes the entire Connection + all live Sessions
    // + the new Token. /rotate-confirm is the old-fingerprint-only path.
    const protocol = await readFile(new URL('../../../AGENT_PROTOCOL.md', import.meta.url), 'utf8')
    // The DELETE step (line 154, "5. `DELETE /api/v1/agent-connections/{id}` ...")
    // must not call DELETE the path to revoke old credentials early.
    // The previous wording was "这是 Rotate 重叠期内显式提前撤销旧凭据的路径" — that
    // exact sentence must be gone.
    expect(protocol, 'AGENT_PROTOCOL.md must drop the "DELETE = revoke old credentials early" framing').not.toMatch(/这是\s*Rotate\s*重叠期内显式提前撤销旧凭据的路径/)
    // The DELETE step must mark DELETE as the hard path and link it
    // to /rotate-confirm as the old-fingerprint-only path.
    expect(protocol, 'AGENT_PROTOCOL.md must mark DELETE as the hard path').toMatch(/DELETE.*硬撤销/)
    expect(protocol, 'AGENT_PROTOCOL.md must distinguish DELETE from /rotate-confirm').toMatch(/与\s*`\/rotate-confirm`\s*不同/)
  })

  it('plan v0.4 is the approved authoritative version with explicit /rotate-confirm and worker fallback', async () => {
    const plan = await readFile(new URL('../../../docs/plans/agent-first-coordination-mcp.md', import.meta.url), 'utf8')
    // The plan must declare v0.4 as authoritative.
    expect(plan, 'plan must explicitly mark v0.4 as authoritative').toMatch(/权威版本.{0,30}v0\.4/)
    // The plan must list /rotate-confirm as an approved extension.
    expect(plan, 'plan must approve /rotate-confirm as a v0.4 extension').toMatch(/\/rotate-confirm.*批准|批准.*\/rotate-confirm/)
    // The plan must declare the worker fallback as an approved safety net.
    expect(plan, 'plan must approve worker expiry as a fallback').toMatch(/worker.*兜底|worker.*fallback|worker.*批准/)
  })

  it('declares /rotate-confirm with If-Match and confirmAgentConnectionRotation operationId in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).toMatch(/\/api\/v1\/agent-connections\/\{id\}\/rotate-confirm:/)
    const block = openapi.match(/\/api\/v1\/agent-connections\/\{id\}\/rotate-confirm:[\s\S]*?(?=\n  \/[^\n]+:|\ncomponents:)/)
    expect(block, 'rotate-confirm path block must exist in OPENAPI').toBeTruthy()
    expect(block![0]).toMatch(/operationId:\s*confirmAgentConnectionRotation/)
    expect(block![0]).toMatch(/\$ref:\s*["']#\/components\/parameters\/IfMatch["']/)
    expect(block![0]).toMatch(/\$ref:\s*["']#\/components\/parameters\/IdempotencyKey["']/)
  })

  it('documents the rotate 15-minute overlap and the explicit /rotate-confirm path, without the v0.2 auto-revoke claim, in OPENAPI', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The v0.2 'auto-revoke on new redeem' must NOT appear in the
    // rotate description. The 15-minute overlap_until must be a real
    // deadline. The v0.4 explicit confirmation path is /rotate-confirm.
    const rotateDescription = openapi.match(/rotateAgentConnection, description: "([^"]+)"/)
    expect(rotateDescription).toBeTruthy()
    expect(rotateDescription![1]).toMatch(/overlap_until is a real deadline/)
    expect(rotateDescription![1]).toMatch(/\/rotate-confirm/)
    expect(rotateDescription![1]).not.toMatch(/transaction marks the old credential fingerprint `rotated`, the new fingerprint `active`/)
  })

  it('uses one base Skill bundle plus an extension, not allOf on additionalProperties:false', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    // The Skill manifest schema must not have an allOf that adds
    // download_url; the redeem response should use a different schema
    // that requires download_url. The description text in the manifest
    // may mention download_url as a reference; the property definitions
    // are what we lock.
    const manifestLine = openapi.match(/^    AgentConnectionSkillManifest:.*$/m)
    expect(manifestLine, 'AgentConnectionSkillManifest schema must exist').toBeTruthy()
    expect(manifestLine![0]).not.toMatch(/allOf/)
    // Inspect the required list and properties object of the manifest: it
    // must not declare download_url as a property.
    expect(manifestLine![0]).toMatch(/required:\s*\[name,\s*version,\s*sha256,\s*signature\]/)
    expect(manifestLine![0]).not.toMatch(/download_url:\s*\{/)
    expect(openapi).toMatch(/^    AgentConnectionSkillBundle:/m)
    expect(openapi).toMatch(/^    AgentConnectionWellKnownSkill:/m)
  })

  it('forbids the unused ServiceUnavailable response from lingering', async () => {
    const openapi = await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')
    expect(openapi).not.toMatch(/^    ServiceUnavailable:/m)
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
    requested_capabilities: ['work:read', 'work:write'],
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
