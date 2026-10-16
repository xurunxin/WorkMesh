import { z } from 'zod'

export const releaseMetadata = Object.freeze({
  serverVersion: '1.0.0',
  restApiVersion: '1.0',
  agentProtocolVersion: '1.0',
  mcpVersion: '1.0.0',
  a2aUpstreamVersion: '0.3',
  preferredClientProfileVersion: '1.0',
  supportedClientProfileVersions: ['1.0'] as const,
  conformanceSuiteVersion: '1.0',
  schemaBaseline: 1,
})

export const featureKeySchema = z.enum([
  'WORKMESH_BETA_MODEL_PRESETS',
  'WORKMESH_BETA_PLANNING',
  'WORKMESH_BETA_TEMPLATES',
  'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_GITEA',
  'WORKMESH_BETA_OPERATIONS_UI',
  'WORKMESH_BETA_COORDINATION_MCP',
  'WORKMESH_EXPERIMENTAL_AUTOMATION',
  'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_EXPERIMENTAL_A2A',
  'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS',
  'WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS',
  'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME',
])
export const supportTierSchema = z.enum(['beta', 'experimental'])
export type FeatureKey = z.infer<typeof featureKeySchema>
export type SupportTier = z.infer<typeof supportTierSchema>
export type FeatureRuntime = 'api' | 'web' | 'worker' | 'sdk-mcp' | 'reserved'

export const featureDefinitions = Object.freeze([
  { key: 'WORKMESH_BETA_MODEL_PRESETS', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api'] },
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api'] },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api'] },
  { key: 'WORKMESH_BETA_GITEA', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'worker', 'sdk-mcp'] },
  { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', defaultEnabled: false, runtimeDependencies: [] },
  { key: 'WORKMESH_BETA_COORDINATION_MCP', tier: 'beta', defaultEnabled: false, runtimeDependencies: ['api', 'worker', 'sdk-mcp'] },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api'] },
  { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['api', 'worker'] },
  { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental', defaultEnabled: false, runtimeDependencies: ['reserved'] },
] as const satisfies readonly {
  key: FeatureKey
  tier: SupportTier
  defaultEnabled: false
  runtimeDependencies: readonly FeatureRuntime[]
}[])
