export const mcpClientTypes = ['codex', 'opencode', 'pi', 'generic_mcp'] as const
export type McpClientType = (typeof mcpClientTypes)[number]

export type McpDiscovery = {
  protocolVersion: 'v1'
  mcpUrl: string
  wellKnownUrl: string
  apiVersion: string
  supportedClients: McpClientType[]
  skill: { name: 'workmesh'; version: string; sha256: string; signature: string }
}

export type McpReleaseInfo = {
  preferredClientProfileVersion: string
  supportedClientProfileVersions: string[]
  mcpVersion: string
}

export type McpOnboardingState =
  | 'ready'
  | 'unsupported_client'
  | 'coordination_feature_disabled'
  | 'network_unavailable'
  | 'discovery_unavailable'
  | 'mcp_unavailable'

export type McpClientGuide = {
  clientType: McpClientType
  label: string
  state: McpOnboardingState
  transport: 'streamable_http'
  mcpUrl: string
  discoveryUrl: string
  profileVersion: string
  skill: McpDiscovery['skill']
  configFile: string
  config: string
  localStdioFallback: string | null
  environmentChecks: string[]
  bootstrapChecks: string[]
}

const labels: Record<McpClientType, string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
  generic_mcp: 'Generic MCP',
}

const tokenEnvironmentName = 'WORKMESH_INSTALLATION_TOKEN'
const tokenHeader = 'X-WorkMesh-Installation-Token'

type StructuredRequestFailure = {
  code?: unknown
  status?: unknown
}

export function classifyMcpOnboardingFailure(reason: unknown): McpOnboardingState {
  const failure = reason && typeof reason === 'object' ? reason as StructuredRequestFailure : null
  if (failure?.code === 'FEATURE_DISABLED') return 'coordination_feature_disabled'
  return typeof failure?.status === 'number' ? 'discovery_unavailable' : 'network_unavailable'
}

export function mcpReadinessStatusHealthy(status: number): boolean {
  // An unauthenticated probe must reach the live MCP process but never carry a credential.
  return status === 401
}

export async function probeMcpReadiness(mcpUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(mcpUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'omit',
      signal,
    })
    return mcpReadinessStatusHealthy(response.status)
  } catch {
    return false
  }
}

function configFor(clientType: McpClientType, mcpUrl: string): { configFile: string; config: string } {
  if (clientType === 'codex') return {
    configFile: 'Codex config.toml',
    config: `[mcp_servers.workmesh]\nurl = ${JSON.stringify(mcpUrl)}\nenv_http_headers = { ${JSON.stringify(tokenHeader)} = ${JSON.stringify(tokenEnvironmentName)} }`,
  }
  if (clientType === 'opencode') return {
    configFile: 'opencode.json',
    config: JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      mcp: { workmesh: { type: 'remote', url: mcpUrl, enabled: true, oauth: false, headers: { [tokenHeader]: `{env:${tokenEnvironmentName}}` } } },
    }, null, 2),
  }
  const shared = JSON.stringify({
    mcpServers: { workmesh: { transport: 'streamable_http', url: mcpUrl, headers: { [tokenHeader]: `\${${tokenEnvironmentName}}` } } },
  }, null, 2)
  return { configFile: clientType === 'pi' ? 'Pi MCP extension config' : 'MCP client config', config: shared }
}

export function buildMcpClientGuide(input: {
  clientType: McpClientType
  discovery: McpDiscovery
  release: McpReleaseInfo
  coordinationFeatureEnabled: boolean
  mcpHealthy?: boolean
}): McpClientGuide {
  const supported = input.discovery.supportedClients.includes(input.clientType)
  const state: McpOnboardingState = !supported
    ? 'unsupported_client'
    : input.mcpHealthy === false
      ? 'mcp_unavailable'
      : input.coordinationFeatureEnabled
        ? 'ready'
        : 'coordination_feature_disabled'
  const config = configFor(input.clientType, input.discovery.mcpUrl)
  return {
    clientType: input.clientType,
    label: labels[input.clientType],
    state,
    transport: 'streamable_http',
    mcpUrl: input.discovery.mcpUrl,
    discoveryUrl: input.discovery.wellKnownUrl,
    profileVersion: input.release.preferredClientProfileVersion,
    skill: input.discovery.skill,
    ...config,
    localStdioFallback: input.clientType === 'generic_mcp'
      ? 'Set WORKMESH_API_URL and WORKMESH_INSTALLATION_TOKEN in the local secret environment, then run pnpm --filter @workmesh/mcp start:stdio.'
      : null,
    environmentChecks: [
      `Store the redeemed installation credential as ${tokenEnvironmentName}; never paste it into the config file.`,
      `Send it only as ${tokenHeader} to the exact server URL shown above.`,
      `Require Client Profile ${input.release.preferredClientProfileVersion} and Skill ${input.discovery.skill.version} (${input.discovery.skill.sha256}).`,
    ],
    bootstrapChecks: [
      'Fetch the public discovery document and reject an unknown protocol, client, profile, or Skill selector.',
      'Redeem the one-time pairing fragment before expiry and keep the returned credential only in the client secret store.',
      'Call verify_connection and require one live Team plus matching profile, Skill, capability scope, and principal Human.',
      'Call get_workmesh_context before selecting work; tool presence never grants mutation authority.',
      'Stop on revoked, expired, mis-scoped, disabled, or inconsistent live facts.',
    ],
  }
}

export function onboardingStateMessage(state: McpOnboardingState): { label: string; summary: string; nextAction: string; tone: 'positive' | 'warning' | 'critical' } {
  if (state === 'unsupported_client') return { label: 'Unsupported client', tone: 'critical', summary: 'This server did not advertise the selected MCP client.', nextAction: 'Choose an advertised client or upgrade the WorkMesh deployment before pairing.' }
  if (state === 'coordination_feature_disabled') return { label: 'Coordination feature disabled', tone: 'warning', summary: 'Base discovery is available, but this deployment reports the Coordination MCP beta feature as disabled.', nextAction: 'Keep the configuration for review only; an operator must enable and verify the feature before pairing.' }
  if (state === 'network_unavailable') return { label: 'Network unavailable', tone: 'critical', summary: 'Live onboarding facts could not be refreshed from this WorkMesh deployment.', nextAction: 'Restore network access, then retry. Do not reuse cached credentials or endpoints.' }
  if (state === 'discovery_unavailable') return { label: 'Discovery unavailable', tone: 'critical', summary: 'WorkMesh could not provide server-derived MCP and Skill selectors.', nextAction: 'Retry discovery. Do not infer endpoints or reuse an older pairing instruction.' }
  if (state === 'mcp_unavailable') return { label: 'MCP unavailable', tone: 'critical', summary: 'Discovery succeeded, but the advertised MCP service did not pass its bounded readiness check.', nextAction: 'Keep existing credentials untouched and retry only after the service is healthy.' }
  return { label: 'Configuration ready', tone: 'positive', summary: 'The selected client, server, profile, and pinned Skill selectors are consistent.', nextAction: 'Pair once, store the credential in the client secret store, then run verify_connection.' }
}

export function containsCredentialLikeValue(value: string): boolean {
  return /(?:wm_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~-]{16,}|#[A-Za-z0-9_-]{16,})/.test(value)
}
