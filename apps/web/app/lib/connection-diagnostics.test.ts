import { describe, expect, it } from 'vitest'
import { diagnoseConnection, safeConnectionFacts } from './connection-diagnostics'

const connection = {
  id: 'connection-1',
  status: 'active' as const,
  client_type: 'codex' as const,
  team_id: 'team-1',
  principal_human_actor_id: 'human-1',
  credential_fingerprint_prefix: 'wm_abcd1234',
  pairing_code_expires_at: null,
  last_used_at: '2026-08-10T00:00:00.000Z',
  rotated_at: null,
  revoked_at: null,
}

describe('Human-safe Agent Connection diagnostics', () => {
  it('distinguishes healthy, expired, rotating, revoked, and mis-scoped states', () => {
    const context = { teamIds: ['team-1'], humanIds: ['human-1'], now: new Date('2026-08-10T01:00:00.000Z') }
    expect(diagnoseConnection(connection, context).code).toBe('healthy')
    expect(diagnoseConnection({ ...connection, status: 'pending', pairing_code_expires_at: '2026-08-09T23:00:00.000Z' }, context).code).toBe('pairing_expired')
    expect(diagnoseConnection({ ...connection, status: 'rotating' }, context).code).toBe('rotating')
    expect(diagnoseConnection({ ...connection, status: 'revoked', revoked_at: '2026-08-10T00:30:00.000Z' }, context).code).toBe('revoked')
    expect(diagnoseConnection(connection, { ...context, teamIds: [] }).code).toBe('team_scope_unavailable')
    expect(diagnoseConnection(connection, { ...context, humanIds: [] }).code).toBe('principal_unavailable')
  })

  it('fails closed for network, discovery, client, feature, and MCP readiness faults', () => {
    const base = {
      teamIds: ['team-1'], humanIds: ['human-1'],
      onboarding: {
        networkAvailable: true,
        discoveryAvailable: true,
        supportedClients: ['codex'],
        coordinationFeatureEnabled: true,
        mcpAvailable: true,
      },
    }
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, networkAvailable: false } }).code).toBe('network_unavailable')
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, discoveryAvailable: false } }).code).toBe('discovery_unavailable')
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, supportedClients: ['opencode'] } }).code).toBe('unsupported_client')
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, coordinationFeatureEnabled: false } }).code).toBe('coordination_feature_disabled')
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, discoveryAvailable: false, coordinationFeatureEnabled: false } }).code).toBe('coordination_feature_disabled')
    expect(diagnoseConnection(connection, { ...base, onboarding: { ...base.onboarding, mcpAvailable: false } }).code).toBe('mcp_unavailable')
  })

  it('projects only safe facts and never exposes bearer, installation, session, or pairing secrets', () => {
    const compromisedPayload = {
      ...connection,
      session_token: 'session-secret',
      installation_token: 'installation-secret',
      pairing_code: 'pairing-secret',
      connect_url: 'https://example.test/connect#secret',
    }
    const facts = safeConnectionFacts(compromisedPayload)
    const serialized = JSON.stringify(facts)
    expect(serialized).toContain('wm_abcd1234')
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('installation-secret')
    expect(serialized).not.toContain('pairing-secret')
    expect(serialized).not.toContain('#secret')
    expect(facts.credential).toBe('Stored server-side · fingerprint wm_abcd1234')
  })
})
