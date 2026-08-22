// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../lib/i18n'
import { TeamAccessDrawer } from './team-access-drawer'
import type { Agent, AgentTeamAccess } from '../lib/agents'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated. (Same pattern as use-board-column-widths.test.tsx.)
afterEach(() => { cleanup() })

const baseAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1',
  workspace_id: 'ws-1',
  actor_id: 'actor-1',
  name: 'Coder Bot',
  display_name: 'Coder Bot',
  slug: 'coder',
  description: null,
  provider: 'openai',
  version: '1.0.0',
  supported_protocols: ['a2a'],
  skills: [],
  requested_capabilities: ['work:read', 'work:write'],
  approved_capabilities: ['work:read'],
  max_concurrency: 4,
  heartbeat_interval_seconds: 30,
  is_active: true,
  revision: 1,
  team_access: [],
  ...overrides,
})

const baseTeam = (overrides: Partial<{ id: string; name: string; key: string }> = {}) => ({
  id: 'team-a',
  name: 'Platform',
  key: 'PLAT',
  ...overrides,
})

const baseAccess = (overrides: Partial<AgentTeamAccess> = {}): AgentTeamAccess => ({
  agent_id: 'agent-1',
  team_id: 'team-a',
  approved_capabilities: ['work:read'],
  status: 'active',
  approved_by_actor_id: 'actor-1',
  revision: 1,
  created_at: '2026-08-22T00:00:00Z',
  updated_at: '2026-08-22T00:00:00Z',
  revoked_at: null,
  ...overrides,
})

describe('TeamAccessDrawer', () => {
  it('renders nothing when there is no selected agent', () => {
    const { container } = render(
      <LocaleProvider>
        <TeamAccessDrawer
          agent={null}
          busyAccess=""
          canManage={true}
          copy={drawerCopy()}
          onClose={() => undefined}
          onGrant={() => undefined}
          onRevoke={() => undefined}
          open={true}
          teams={[baseTeam()]}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('hides the Sheet entirely when open is false even if an agent is selected', () => {
    const { container } = render(
      <LocaleProvider>
        <TeamAccessDrawer
          agent={baseAgent()}
          busyAccess=""
          canManage={true}
          copy={drawerCopy()}
          onClose={() => undefined}
          onGrant={() => undefined}
          onRevoke={() => undefined}
          open={false}
          teams={[baseTeam()]}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders the Sheet with the team access list when an agent is selected and open is true', () => {
    render(
      <LocaleProvider>
        <TeamAccessDrawer
          agent={baseAgent({ team_access: [baseAccess()] })}
          busyAccess=""
          canManage={true}
          copy={drawerCopy()}
          onClose={() => undefined}
          onGrant={() => undefined}
          onRevoke={() => undefined}
          open={true}
          teams={[baseTeam()]}
        />
      </LocaleProvider>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // The sheet title is the agent display name.
    expect(screen.getByRole('heading', { name: 'Coder Bot' })).toBeInTheDocument()
    // The team name + key appear in the team-access card. The key is wrapped
    // in parentheses inside a <small> so match it with a regex.
    expect(screen.getByText('Platform')).toBeInTheDocument()
    expect(screen.getByText(/\(PLAT\)/)).toBeInTheDocument()
    // The drawer must carry the Sheet's right-side class for visual parity
    // with the other overlays.
    expect(dialog.className).toContain('wm-sheet-right')
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <LocaleProvider>
        <TeamAccessDrawer
          agent={baseAgent()}
          busyAccess=""
          canManage={true}
          copy={drawerCopy()}
          onClose={onClose}
          onGrant={() => undefined}
          onRevoke={() => undefined}
          open={true}
          teams={[baseTeam()]}
        />
      </LocaleProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close Coder Bot' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed inside the Sheet', () => {
    const onClose = vi.fn()
    render(
      <LocaleProvider>
        <TeamAccessDrawer
          agent={baseAgent()}
          busyAccess=""
          canManage={true}
          copy={drawerCopy()}
          onClose={onClose}
          onGrant={() => undefined}
          onRevoke={() => undefined}
          open={true}
          teams={[baseTeam()]}
        />
      </LocaleProvider>,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

/**
 * Self-contained copy used by the drawer tests so the suite does not
 * have to thread the full `agentsCopy` object through every render. The
 * strings are the same English values used in production today so the
 * assertions (e.g. `name: 'Close Coder Bot'`) match the rendered output.
 */
function drawerCopy() {
  return {
    agents: 'Agents',
    loadingDescription: 'Loading Agents.',
    loadingTitle: 'Loading Agent workspace',
    context: 'Human control plane',
    loadError: 'Unable to load agents.',
    selectCapability: 'Select at least one capability to grant.',
    updateAccessError: 'Unable to update team access.',
    revokeAccessError: 'Unable to revoke team access.',
    refresh: 'Refresh',
    eyebrow: 'Human control plane',
    title: 'Agents',
    intro: 'Monitor delegated work.',
    retry: 'Retry',
    attentionTitle: 'Agent workspace needs attention',
    attentionDescription: 'Unable to load the Agent workspace.',
    activeAgents: 'Active agents',
    registered: (count: number) => `${count} registered`,
    liveSessions: 'Live sessions',
    visible: (count: number) => `${count} visible`,
    pendingApprovals: 'Pending approvals',
    responseRequired: 'Human response required',
    queueClear: 'Queue clear',
    needsAttention: 'Needs attention',
    blockedOrWaiting: 'Blocked, stale, or waiting',
    registry: 'Registry',
    registryIntro: 'Scan definitions first.',
    all: 'All',
    active: 'Active',
    inactive: 'Inactive',
    noAgents: 'No registered agents match this filter.',
    humanQueue: 'Human queue',
    approvals: 'Approvals',
    openInbox: 'Open inbox',
    noApprovals: 'No pending approvals.',
    execution: 'Execution',
    sessions: 'Sessions',
    noSessions: 'No agent session is visible to you.',
    tabsAriaLabel: 'Agent workspace sections',
    tabAgents: 'Agents',
    tabSessions: 'Sessions',
    tabApprovals: 'Approvals',
    filterAriaLabel: 'Agent filters',
    filterName: 'Name',
    filterNamePlaceholder: 'Search by name or slug',
    filterTeam: 'Team',
    allTeams: 'All teams',
    filterCapability: 'Capability',
    allCapabilities: 'All capabilities',
    filterStatus: 'Status',
    openTeamAccess: 'Open team access',
    durableState: 'Durable state',
    diagnostics: 'Diagnostics',
    diagnosticsIntro: 'Health comes from server-reported facts.',
    allClear: 'All clear',
    allClearDetail: 'No visible session is stale.',
    registryStatusActive: 'active',
    registryStatusInactive: 'inactive',
    noRegistryDescription: 'No registry description.',
    approvedLabel: 'Approved',
    capabilitiesLabel: (count: number) => `${count} capabilities`,
    concurrency: 'Concurrency',
    heartbeat: 'Heartbeat',
    teamAccessAndCapabilities: 'Team access and capabilities',
    requestedLabel: 'Requested:',
    definitionApprovedLabel: 'Definition approved:',
    none: 'None',
    noTeamsAvailable: 'No teams are available.',
    accessStatusActive: 'active',
    accessStatusRevoked: 'revoked',
    accessStatusNotGranted: 'not granted',
    accessApprovedLabel: 'Approved:',
    revokedAt: (date: string) => `Revoked ${date}`,
    approvedCapabilitySubset: 'Approved capability subset',
    updateGrant: 'Update grant',
    grantAccess: 'Grant access',
    revoke: 'Revoke',
    teamAccessViewRequested: 'Requested',
    teamAccessViewApproved: 'Approved',
    teamAccessViewLabel: 'Capability view',
    teamAccessEmptyRequested: 'This agent has not declared any capabilities yet.',
    teamAccessNoSelection: 'No capabilities selected. Tap a chip to toggle.',
    teamAccessSelectedCount: (count: number) => `${count} selected`,
    teamAccessToggleHint: 'Tap a chip to toggle; press Save to commit the grant.',
    teamAccessApprovedChipLabel: (capability: string) => `Approved: ${capability}`,
    teamAccessRequestedChipLabel: (capability: string) => `Requested ${capability}`,
    saveAccess: 'Save grant',
    riskLabel: (risk: string) => `${risk} risk`,
    reviewSession: 'Review session and evidence',
    sessionLabel: (id: string) => `Session ${id}`,
    workItemLabel: (id: string) => `Work item ${id}`,
    noWorkItem: 'No work item',
    heartbeatLabel: (date: string) => `Heartbeat ${date}`,
    loadMoreAgents: 'Load more agents',
    loadMoreTeams: 'Load more teams',
    loadMoreApprovals: 'Load more approvals',
    loadMoreSessions: 'Load more sessions',
    connectionsEyebrow: 'Agent access',
    connectionsTitle: 'Connections',
    connectionsIntro: 'Scoped MCP identities.',
    refreshConnections: 'Refresh connections',
    newConnection: 'New connection',
    adminRequiredHint: 'Workspace Admin access is required.',
    unableToLoadConnections: 'Unable to load Connections.',
    retryLoadHint: 'Existing Connections may still be active.',
    loadingConnections: 'Loading Connections…',
    noConnectionsTitle: 'No Connections yet',
    noConnectionsHint: 'Create a Connection.',
    existingConnections: 'Existing Connections',
    unavailableTeam: 'Unavailable Team',
    teamScope: 'Team scope',
    principalHuman: 'Principal Human',
    credential: 'Credential',
    lastUsed: 'Last used',
    capabilities: 'Capabilities',
    noCapabilities: 'None granted',
    skill: 'Skill',
    credentialSafety: 'Credential safety',
    rotateCredential: 'Rotate credential',
    confirmRotation: 'Confirm verified rotation',
    revokeConnection: 'Revoke connection',
    mcpOnboardingEyebrow: 'MCP onboarding',
    mcpOnboardingTitle: 'Configuration and live checks',
    mcpOnboardingIntro: (client: string) => `Server-derived setup facts for ${client}.`,
    mcpLoading: 'Loading',
    mcpEndpoint: 'MCP endpoint',
    mcpDiscovery: 'Discovery',
    mcpTransport: 'Transport',
    mcpProfile: 'Client Profile',
    mcpAuthReadiness: 'Auth readiness',
    mcpAuthActive: 'Installation credential active',
    mcpAuthPending: 'Awaiting pairing',
    mcpCapabilitySummary: 'Capability summary',
    mcpSkillSelector: 'Skill selector',
    secretSafeConfig: (file: string) => `Secret-safe ${file}`,
    localStdioFallback: 'Local stdio fallback:',
    copyConfig: 'Copy config',
    configCopied: 'Copied',
    bootstrapChecklist: 'Agent bootstrap checklist',
    handoffEyebrow: 'One-time setup',
    handoffTitle: 'Agent handoff instructions',
    handoffIntro: 'Copy the complete procedure to the selected Agent.',
    copyFullInstructions: 'Copy full instructions',
    handoffExpiryNote: 'The pairing URL expires in ten minutes.',
    newConnectionTitle: 'New Agent Connection',
    fieldClient: 'Client',
    fieldAgentName: 'Agent name',
    fieldAgentSlug: 'Agent slug',
    fieldTeam: 'Team',
    fieldPrincipal: 'Principal Human',
    fieldAgentDelegate: 'Allow this coordinator to start approved Agents',
    fieldNotes: 'Notes',
    cancel: 'Cancel',
    generateConnection: 'Generate connection sentence',
    intentLabel: (kind: string) => kind.replaceAll('_', ' '),
    unavailable: 'Unavailable',
    notReported: 'not reported',
    connectionStatusActive: 'active',
    connectionStatusPending: 'pending',
    connectionStatusRotating: 'rotating',
    connectionStatusRevoked: 'revoked',
    credentialPending: 'Pending',
  }
}
