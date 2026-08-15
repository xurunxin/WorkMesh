import { describe, expect, it } from 'vitest'
import {
  agentCapabilityManifestResponseSchema,
  agentConnectionClientTypeSchema,
  agentWellKnownResponseSchema,
  clientProfileErrorReactions,
  createAgentCapabilityManifest,
  featureDefinitions,
  mcpPolicyBindings,
  releaseMetadata,
  routePolicyManifest,
} from './index.js'

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`
const disabledFeatures = Object.fromEntries(featureDefinitions.map(feature => [feature.key, false])) as Record<(typeof featureDefinitions)[number]['key'], boolean>

describe('Agent Collaboration Client Profile contract', () => {
  it('derives support from the route, feature, and MCP binding registries', () => {
    const manifest = createAgentCapabilityManifest({
      actorId: id('1'),
      sessionId: id('2'),
      sessionState: 'executing',
      sessionRevision: 4,
      effectiveCapabilities: ['work:read', 'work:write', 'artifact:write'],
      capabilityScope: { workspaceId: id('3'), teamIds: [id('4')], workItemIds: [id('5')], projectIds: [], repositoryIds: [], capabilities: ['work:read', 'work:write', 'artifact:write'] },
      supportedProtocols: ['native_http', 'mcp'],
      pushConfigured: true,
      features: disabledFeatures,
    })
    expect(agentCapabilityManifestResponseSchema.parse(manifest)).toEqual(manifest)
    expect(manifest.profileVersion).toBe(releaseMetadata.preferredClientProfileVersion)
    expect(manifest.authorizationEvaluatedPerRequest).toBe(true)
    expect(manifest.operations).toHaveLength(routePolicyManifest.filter(policy => policy.actorKinds.includes('agent')).length)
    const capabilities = manifest.operations.find(operation => operation.operationId === 'getAgentCapabilityManifest')
    expect(capabilities).toMatchObject({
      supported: true,
      eligibleByCapability: true,
      requirements: {
        capabilities: [],
        activeSession: true,
        activeDelegation: true,
        liveGrantIntersection: true,
      },
      transports: { mcpBindings: ['resource:agent-capabilities', 'tool:get_current_identity', 'tool:get_workmesh_context', 'tool:verify_connection'] },
    })
    expect(mcpPolicyBindings['resource:agent-capabilities'].operationId).toBe('getAgentCapabilityManifest')
    expect(manifest.operations.filter(operation => operation.feature.key).every(operation => !operation.supported)).toBe(true)
    expect(manifest.extensions).toContainEqual({ id: 'workmesh.engineering-graph', tier: 'experimental', enabled: false, negotiationRequired: true })
  })

  it('defines a closed reaction for every hostile conformance class', () => {
    expect(clientProfileErrorReactions.map(item => item.errorCode)).toEqual([
      'DELEGATION_NOT_ACTIVE',
      'UNAUTHENTICATED',
      'SESSION_STOPPED',
      'RESOURCE_SCOPE_DENIED',
      'REVISION_CONFLICT',
      'LEASE_EXPIRED',
      'APPROVAL_REQUIRED',
      'FEATURE_DISABLED',
      'CURSOR_EXPIRED',
    ])
  })

  it('publishes a closed MCP client set and server-derived discovery selectors', () => {
    expect(['codex', 'opencode', 'pi', 'generic_mcp'].map(value => agentConnectionClientTypeSchema.parse(value))).toEqual([
      'codex', 'opencode', 'pi', 'generic_mcp',
    ])
    expect(() => agentConnectionClientTypeSchema.parse('unknown-client')).toThrow()
    const discovery = {
      protocolVersion: 'v1' as const,
      mcpUrl: 'https://workmesh.example/mcp',
      wellKnownUrl: 'https://workmesh.example/.well-known/workmesh-agent',
      apiVersion: releaseMetadata.restApiVersion,
      supportedClients: ['codex', 'opencode', 'pi', 'generic_mcp'] as const,
      skill: { name: 'workmesh' as const, version: '1.1.0', sha256: `sha256:${'a'.repeat(64)}`, signature: 'ed25519:test-signature' },
    }
    expect(agentWellKnownResponseSchema.parse(discovery)).toEqual(discovery)
  })
})
