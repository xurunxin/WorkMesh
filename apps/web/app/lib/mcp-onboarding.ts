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

export type AgentConnectionInstructionInput = {
  connectUrl: string
  agentSlug: string
  clientType: McpClientType
}

const labels: Record<McpClientType, string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
  pi: 'Pi',
  generic_mcp: 'Generic MCP',
}

const tokenEnvironmentName = 'WORKMESH_INSTALLATION_TOKEN'
const tokenHeader = 'X-WorkMesh-Installation-Token'

export function buildAgentConnectionInstruction(input: AgentConnectionInstructionInput): string {
  const connect = new URL(input.connectUrl)
  const redeemUrl = new URL('/api/v1/agent-connections/redeem', connect.origin).toString()
  const discoveryUrl = new URL('/.well-known/workmesh-agent', connect.origin).toString()
  return [
    `Connect the ${labels[input.clientType]} Agent ${JSON.stringify(input.agentSlug)} to this WorkMesh deployment.`,
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
      ? '在本地密钥环境中设置 WORKMESH_API_URL 和 WORKMESH_INSTALLATION_TOKEN，然后运行 pnpm --filter @workmesh/mcp start:stdio。'
      : null,
    environmentChecks: [
      `把兑换得到的安装凭据保存为 ${tokenEnvironmentName}，不要粘贴到配置文件里。`,
      `只通过 ${tokenHeader} 头发送到上方展示的精确服务端 URL。`,
      `要求 Client Profile ${input.release.preferredClientProfileVersion} 与 Skill ${input.discovery.skill.version}（${input.discovery.skill.sha256}）。`,
    ],
    bootstrapChecks: [
      '拉取公共发现文档，拒绝协议、客户端、Profile 或技能选择器中的未知值。',
      '在一次性配对片段过期前完成兑换，并把得到的凭据仅保存在客户端密钥库中。',
      '调用 verify_connection，并要求存在一个活跃的 Team、匹配的 Profile / Skill / 能力范围以及负责人。',
      '在选择工作前先调用 get_workmesh_context；工具存在并不授予任何写权限。',
      '当发现已撤销、过期、范围不符、停用或实时事实不一致时立即停止。',
    ],
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
