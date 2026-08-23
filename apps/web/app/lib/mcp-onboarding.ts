export const mcpClientTypes = ['codex', 'opencode', 'pi', 'generic_mcp'] as const
export type McpClientType = (typeof mcpClientTypes)[number]

const tokenEnvironmentName = 'WORKMESH_INSTALLATION_TOKEN'
const tokenHeader = 'X-WorkMesh-Installation-Token'
const knownMcpClientTypes: ReadonlySet<string> = new Set(mcpClientTypes)

export function supportedMcpClientTypes(values: readonly unknown[]): McpClientType[] {
  const normalized: McpClientType[] = []
  const seen = new Set<McpClientType>()
  for (const value of values) {
    if (typeof value !== 'string' || !knownMcpClientTypes.has(value)) continue
    const clientType = value as McpClientType
    if (seen.has(clientType)) continue
    seen.add(clientType)
    normalized.push(clientType)
  }
  return normalized
}

export type McpClientFacts = Readonly<{
  label: string
  configLabel: string
  transport: 'streamable_http'
  buildConfig: (mcpUrl: string) => string
  localStdioCommand: string | null
}>

const clientFacts: Record<McpClientType, McpClientFacts> = {
  codex: {
    label: 'Codex',
    configLabel: 'Codex MCP server configuration',
    transport: 'streamable_http',
    buildConfig: mcpUrl => `[mcp_servers.workmesh]\nurl = ${JSON.stringify(mcpUrl)}\nenv_http_headers = { ${JSON.stringify(tokenHeader)} = ${JSON.stringify(tokenEnvironmentName)} }`,
    localStdioCommand: null,
  },
  opencode: {
    label: 'OpenCode',
    configLabel: 'OpenCode remote MCP configuration',
    transport: 'streamable_http',
    buildConfig: mcpUrl => JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      mcp: { workmesh: { type: 'remote', url: mcpUrl, enabled: true, oauth: false, headers: { [tokenHeader]: `{env:${tokenEnvironmentName}}` } } },
    }, null, 2),
    localStdioCommand: null,
  },
  pi: {
    label: 'Pi',
    configLabel: 'Pi MCP extension configuration',
    transport: 'streamable_http',
    buildConfig: mcpUrl => JSON.stringify({
      mcpServers: { workmesh: { transport: 'streamable_http', url: mcpUrl, headers: { [tokenHeader]: `\${${tokenEnvironmentName}}` } } },
    }, null, 2),
    localStdioCommand: null,
  },
  generic_mcp: {
    label: 'Generic MCP',
    configLabel: 'Generic Streamable HTTP MCP configuration',
    transport: 'streamable_http',
    buildConfig: mcpUrl => JSON.stringify({
      mcpServers: { workmesh: { transport: 'streamable_http', url: mcpUrl, headers: { [tokenHeader]: `\${${tokenEnvironmentName}}` } } },
    }, null, 2),
    localStdioCommand: 'pnpm --filter @workmesh/mcp start:stdio',
  },
}

export function mcpClientFacts(type: McpClientType): McpClientFacts {
  return clientFacts[type]
}

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
  configLabel: string
  config: string
  localStdioFallback: string | null
  environmentChecks: string[]
  bootstrapChecks: string[]
}

export type McpGuideCopyFacts = Readonly<{
  clientLabel: string
  tokenEnvironmentName: string
  tokenHeader: string
  profileVersion: string
  skillVersion: string
  skillSha256: string
}>

export type McpClientGuideCopy = Readonly<{
  environmentCheckItems: (facts: McpGuideCopyFacts) => readonly string[]
  bootstrapCheckItems: (facts: McpGuideCopyFacts) => readonly string[]
  localStdioFallback: (command: string) => string
}>

export type AgentConnectionInstructionInput = {
  connectUrl: string
  agentSlug: string
  clientType: McpClientType
}

export function buildAgentConnectionInstruction(input: AgentConnectionInstructionInput): string {
  const connect = new URL(input.connectUrl)
  const redeemUrl = new URL('/api/v1/agent-connections/redeem', connect.origin).toString()
  const discoveryUrl = new URL('/.well-known/workmesh-agent', connect.origin).toString()
  return [
    `Connect the ${mcpClientFacts(input.clientType).label} Agent ${JSON.stringify(input.agentSlug)} to this WorkMesh deployment.`,
    '',
    `One-time pairing URL (expires in 10 minutes): ${input.connectUrl}`,
    '',
    'Follow these steps exactly:',
    `1. Read the URL fragment after # as the one-time wmp_ pairing code. It is not an Installation Token and must never be used as an MCP header.`,
    `2. Fetch ${discoveryUrl} and verify that it advertises client type ${input.clientType}, the expected WorkMesh Skill, and a Streamable HTTP MCP URL.`,
    `3. POST ${redeemUrl} with a fresh Idempotency-Key and JSON body {"pairingCode":"<fragment>","agentSlug":${JSON.stringify(input.agentSlug)},"client":{"type":${JSON.stringify(input.clientType)},"version":"<client-version>"}}. Reuse that key only to retry this exact request.`,
    `4. From the successful response, store only installation_token (the wmi_ value) in the client secret store as ${tokenEnvironmentName}. Confirm SHA-256(installation_token).slice(0,12) equals connection.credential_fingerprint_prefix before saving it.`,
    `5. Configure the exact mcp.url returned by redemption with transport streamable_http and send ${tokenHeader} from ${tokenEnvironmentName}. Never paste the pairing code or plaintext Installation Token into a repository or committed MCP config.`,
    '6. Install and verify the exact pinned Skill name, version, SHA-256, and signature returned by redemption.',
    '7. Reload the MCP client, call verify_connection, require the expected Team, principal Human, profile, Skill, and capabilities, then call get_workmesh_context before selecting work.',
    '',
    'Stop and report the exact error code if discovery, redemption, fingerprint verification, Skill verification, or verify_connection fails. Do not substitute an older token or generate a second credential silently.',
  ].join('\n')
}

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

export function buildMcpClientGuide(input: {
  clientType: McpClientType
  discovery: McpDiscovery
  release: McpReleaseInfo
  coordinationFeatureEnabled: boolean
  mcpHealthy?: boolean
}, copy: McpClientGuideCopy): McpClientGuide {
  const facts = mcpClientFacts(input.clientType)
  const supported = supportedMcpClientTypes(input.discovery.supportedClients).includes(input.clientType)
  const state: McpOnboardingState = !supported
    ? 'unsupported_client'
    : input.mcpHealthy === false
      ? 'mcp_unavailable'
      : input.coordinationFeatureEnabled
        ? 'ready'
        : 'coordination_feature_disabled'
  const copyFacts: McpGuideCopyFacts = {
    clientLabel: facts.label,
    tokenEnvironmentName,
    tokenHeader,
    profileVersion: input.release.preferredClientProfileVersion,
    skillVersion: input.discovery.skill.version,
    skillSha256: input.discovery.skill.sha256,
  }
  return {
    clientType: input.clientType,
    label: facts.label,
    state,
    transport: facts.transport,
    mcpUrl: input.discovery.mcpUrl,
    discoveryUrl: input.discovery.wellKnownUrl,
    profileVersion: input.release.preferredClientProfileVersion,
    skill: input.discovery.skill,
    configLabel: facts.configLabel,
    config: facts.buildConfig(input.discovery.mcpUrl),
    localStdioFallback: facts.localStdioCommand ? copy.localStdioFallback(facts.localStdioCommand) : null,
    environmentChecks: [...copy.environmentCheckItems(copyFacts)],
    bootstrapChecks: [...copy.bootstrapCheckItems(copyFacts)],
  }
}

export function onboardingStateMessage(state: McpOnboardingState, copy: { stateReadyLabel: string; stateReadySummary: string; stateReadyNextAction: string; stateUnsupportedClientLabel: string; stateUnsupportedClientSummary: string; stateUnsupportedClientNextAction: string; stateCoordinationFeatureDisabledLabel: string; stateCoordinationFeatureDisabledSummary: string; stateCoordinationFeatureDisabledNextAction: string; stateNetworkUnavailableLabel: string; stateNetworkUnavailableSummary: string; stateNetworkUnavailableNextAction: string; stateDiscoveryUnavailableLabel: string; stateDiscoveryUnavailableSummary: string; stateDiscoveryUnavailableNextAction: string; stateMcpUnavailableLabel: string; stateMcpUnavailableSummary: string; stateMcpUnavailableNextAction: string }): { label: string; summary: string; nextAction: string; tone: 'positive' | 'warning' | 'critical' } {
  if (state === 'unsupported_client') return { label: copy.stateUnsupportedClientLabel, tone: 'critical', summary: copy.stateUnsupportedClientSummary, nextAction: copy.stateUnsupportedClientNextAction }
  if (state === 'coordination_feature_disabled') return { label: copy.stateCoordinationFeatureDisabledLabel, tone: 'warning', summary: copy.stateCoordinationFeatureDisabledSummary, nextAction: copy.stateCoordinationFeatureDisabledNextAction }
  if (state === 'network_unavailable') return { label: copy.stateNetworkUnavailableLabel, tone: 'critical', summary: copy.stateNetworkUnavailableSummary, nextAction: copy.stateNetworkUnavailableNextAction }
  if (state === 'discovery_unavailable') return { label: copy.stateDiscoveryUnavailableLabel, tone: 'critical', summary: copy.stateDiscoveryUnavailableSummary, nextAction: copy.stateDiscoveryUnavailableNextAction }
  if (state === 'mcp_unavailable') return { label: copy.stateMcpUnavailableLabel, tone: 'critical', summary: copy.stateMcpUnavailableSummary, nextAction: copy.stateMcpUnavailableNextAction }
  return { label: copy.stateReadyLabel, tone: 'positive', summary: copy.stateReadySummary, nextAction: copy.stateReadyNextAction }
}

export function containsCredentialLikeValue(value: string): boolean {
  return /(?:wm[a-z]*_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~-]{16,}|#[A-Za-z0-9_-]{16,})/.test(value)
}
