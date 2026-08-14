export type ConnectionDiagnosticInput = {
  id: string
  status: 'pending' | 'active' | 'rotating' | 'revoked'
  team_id: string
  principal_human_actor_id: string
  client_type?: 'codex' | 'opencode' | 'pi' | 'generic_mcp'
  credential_fingerprint_prefix: string | null
  pairing_code_expires_at: string | null
  last_used_at: string | null
  rotated_at: string | null
  revoked_at: string | null
}

export type ConnectionDiagnostic = {
  code: 'healthy' | 'awaiting_pairing' | 'pairing_expired' | 'rotating' | 'revoked' | 'team_scope_unavailable' | 'principal_unavailable' | 'network_unavailable' | 'discovery_unavailable' | 'unsupported_client' | 'coordination_feature_disabled' | 'mcp_unavailable'
  label: string
  summary: string
  nextAction: string
  tone: 'positive' | 'neutral' | 'warning' | 'critical'
}

type DiagnosticContext = {
  teamIds: string[]
  humanIds: string[]
  now?: Date
  onboarding?: {
    networkAvailable: boolean
    discoveryAvailable: boolean
    supportedClients: string[]
    coordinationFeatureEnabled: boolean | null
    mcpAvailable: boolean
  }
}

export function diagnoseConnection(connection: ConnectionDiagnosticInput, context: DiagnosticContext): ConnectionDiagnostic {
  const now = context.now ?? new Date()
  if (connection.status === 'revoked') return {
    code: 'revoked', label: 'Revoked', tone: 'critical',
    summary: 'This credential can no longer authenticate or coordinate work.',
    nextAction: 'Create a replacement Connection only if this coordinator should return.',
  }
  if (!context.teamIds.includes(connection.team_id)) return {
    code: 'team_scope_unavailable', label: 'Team scope unavailable', tone: 'critical',
    summary: 'The bound Team is no longer visible to this Human operator.',
    nextAction: 'Restore the Human and Agent Team grants or revoke this Connection.',
  }
  if (!context.humanIds.includes(connection.principal_human_actor_id)) return {
    code: 'principal_unavailable', label: 'Principal unavailable', tone: 'critical',
    summary: 'The principal Human is inactive or no longer visible in this Workspace.',
    nextAction: 'Rebind the Connection to an active Human or revoke it.',
  }
  if (context.onboarding?.networkAvailable === false) return {
    code: 'network_unavailable', label: 'Network unavailable', tone: 'critical',
    summary: 'Live Agent onboarding facts could not be refreshed from this WorkMesh deployment.',
    nextAction: 'Restore network access, then retry discovery. Do not reuse cached credentials or endpoints.',
  }
  if (context.onboarding?.coordinationFeatureEnabled === false) return {
    code: 'coordination_feature_disabled', label: 'Coordination feature disabled', tone: 'warning',
    summary: 'This deployment reports the Coordination MCP feature as disabled. No onboarding endpoint or frontend control grants authority while it is disabled.',
    nextAction: 'Keep the credential unchanged and wait for an operator to enable and verify the feature.',
  }
  if (context.onboarding?.discoveryAvailable === false) return {
    code: 'discovery_unavailable', label: 'Discovery unavailable', tone: 'critical',
    summary: 'The server did not return its current MCP, client profile, and pinned Skill selectors.',
    nextAction: 'Retry public discovery after the deployment is healthy; never infer the endpoint.',
  }
  if (connection.client_type && context.onboarding && !context.onboarding.supportedClients.includes(connection.client_type)) return {
    code: 'unsupported_client', label: 'Unsupported client', tone: 'critical',
    summary: 'The server no longer advertises this Connection client type.',
    nextAction: 'Upgrade or reconfigure the client before attempting a new pairing.',
  }
  if (context.onboarding?.mcpAvailable === false) return {
    code: 'mcp_unavailable', label: 'MCP unavailable', tone: 'critical',
    summary: 'Discovery succeeded, but the advertised MCP endpoint is not ready.',
    nextAction: 'Keep the credential unchanged and retry only after the MCP service is healthy.',
  }
  if (connection.status === 'rotating') return {
    code: 'rotating', label: 'Rotation in progress', tone: 'warning',
    summary: 'The replacement credential has not been confirmed. The previous credential remains in the bounded overlap window.',
    nextAction: 'Redeem the replacement, verify it, then confirm rotation.',
  }
  if (connection.status === 'pending') {
    const expired = connection.pairing_code_expires_at !== null && new Date(connection.pairing_code_expires_at) <= now
    return expired ? {
      code: 'pairing_expired', label: 'Pairing expired', tone: 'warning',
      summary: 'The one-time pairing window closed before this Connection was redeemed.',
      nextAction: 'Generate a new Connection sentence; no credential was activated.',
    } : {
      code: 'awaiting_pairing', label: 'Awaiting pairing', tone: 'neutral',
      summary: 'The one-time pairing instruction has not been redeemed yet.',
      nextAction: 'Complete pairing before the displayed expiry time.',
    }
  }
  return {
    code: 'healthy', label: 'Healthy', tone: 'positive',
    summary: 'The Connection is active and its Human and Team scope are visible.',
    nextAction: 'No action required.',
  }
}

export function safeConnectionFacts(connection: ConnectionDiagnosticInput) {
  return {
    connectionId: connection.id,
    status: connection.status,
    teamId: connection.team_id,
    principalHumanActorId: connection.principal_human_actor_id,
    credential: connection.credential_fingerprint_prefix
      ? `Stored server-side · fingerprint ${connection.credential_fingerprint_prefix}`
      : 'Not activated',
    lastUsedAt: connection.last_used_at,
    rotatedAt: connection.rotated_at,
    revokedAt: connection.revoked_at,
  }
}
