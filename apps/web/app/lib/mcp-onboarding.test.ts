import { describe, expect, it } from 'vitest'
import { buildMcpClientGuide, classifyMcpOnboardingFailure, containsCredentialLikeValue, mcpClientTypes, mcpReadinessStatusHealthy, onboardingStateMessage, type McpDiscovery } from './mcp-onboarding'

const discovery: McpDiscovery = {
  protocolVersion: 'v1',
  mcpUrl: 'https://workmesh.example/mcp',
  wellKnownUrl: 'https://workmesh.example/.well-known/workmesh-agent',
  apiVersion: 'v1',
  supportedClients: [...mcpClientTypes],
  skill: { name: 'workmesh', version: '1.1.0', sha256: `sha256:${'a'.repeat(64)}`, signature: 'ed25519:safe-public-signature' },
}
const release = { preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.0.0' }

describe('MCP onboarding contract', () => {
  it('builds secret-store-backed templates for every advertised client', () => {
    for (const clientType of mcpClientTypes) {
      const guide = buildMcpClientGuide({ clientType, discovery, release, coordinationFeatureEnabled: true })
      expect(guide.state).toBe('ready')
      expect(guide.config).toContain('WORKMESH_INSTALLATION_TOKEN')
      expect(guide.discoveryUrl).toBe(discovery.wellKnownUrl)
      expect(guide.config).toContain('X-WorkMesh-Installation-Token')
      expect(guide.config).not.toContain('wm_live_secret_canary')
      expect(containsCredentialLikeValue(guide.config)).toBe(false)
      expect(guide.profileVersion).toBe('1.0')
      expect(guide.skill.sha256).toBe(discovery.skill.sha256)
    }
  })

  it('offers a bounded local stdio fallback only for the generic profile', () => {
    expect(buildMcpClientGuide({ clientType: 'generic_mcp', discovery, release, coordinationFeatureEnabled: true }).localStdioFallback).toContain('start:stdio')
    expect(buildMcpClientGuide({ clientType: 'codex', discovery, release, coordinationFeatureEnabled: true }).localStdioFallback).toBeNull()
  })

  it('fails closed for unsupported, disabled, and unavailable states', () => {
    expect(buildMcpClientGuide({ clientType: 'pi', discovery: { ...discovery, supportedClients: ['codex'] }, release, coordinationFeatureEnabled: true }).state).toBe('unsupported_client')
    expect(buildMcpClientGuide({ clientType: 'codex', discovery, release, coordinationFeatureEnabled: false }).state).toBe('coordination_feature_disabled')
    expect(buildMcpClientGuide({ clientType: 'codex', discovery, release, coordinationFeatureEnabled: true, mcpHealthy: false }).state).toBe('mcp_unavailable')
    expect(onboardingStateMessage('discovery_unavailable').nextAction).toContain('Do not infer')
  })

  it('preserves structured feature failures and treats only the credential challenge as MCP readiness', () => {
    expect(classifyMcpOnboardingFailure({ status: 403, code: 'FEATURE_DISABLED' })).toBe('coordination_feature_disabled')
    expect(classifyMcpOnboardingFailure({ status: 503, code: 'SERVICE_UNAVAILABLE' })).toBe('discovery_unavailable')
    expect(classifyMcpOnboardingFailure(new TypeError('network offline'))).toBe('network_unavailable')
    expect(mcpReadinessStatusHealthy(401)).toBe(true)
    expect(mcpReadinessStatusHealthy(404)).toBe(false)
    expect(mcpReadinessStatusHealthy(503)).toBe(false)
  })

  it('detects bearer, pairing-fragment, and WorkMesh credential canaries', () => {
    expect(containsCredentialLikeValue('Bearer abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(containsCredentialLikeValue('https://example.test/connect#abcdefghijklmnop')).toBe(true)
    expect(containsCredentialLikeValue('wm_abcdefghijklmnop')).toBe(true)
    expect(containsCredentialLikeValue('Stored server-side · fingerprint wm_abcd1234')).toBe(false)
  })
})
