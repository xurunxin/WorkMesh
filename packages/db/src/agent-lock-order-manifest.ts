export const agentLockRanks = [
  'agent_definitions',
  'agent_team_access',
  'delegations',
  'agent_sessions',
  'agent_session_tokens',
  'agent_installation_tokens',
  'work_items',
  'projects',
] as const

export type AgentLockStatementClass =
  | 'ranked-lock'
  | 'ranked-write'
  | 'terminal-skip-locked'

export type AgentLockManifestEntry = Readonly<{
  file: string
  symbols: readonly string[]
  classes: readonly AgentLockStatementClass[]
  ranks: readonly (typeof agentLockRanks)[number][]
  order: 'authority-first' | 'single-rank' | 'terminal-claim'
  exemption?: string
}>

/**
 * Static ownership inventory for production SQL that can acquire a ranked
 * Agent authority/resource lock. Entries are symbol based and intentionally
 * contain no line numbers, so refactors do not churn the manifest.
 */
export const agentLockManifest: readonly AgentLockManifestEntry[] = [
  {
    file: 'packages/db/src/agent-locks.ts',
    symbols: ['lockAgentAuthorityPlan'],
    classes: ['ranked-lock'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/agent/guard.ts',
    symbols: ['loadAgentSessionForMutation'],
    classes: ['ranked-lock'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/agent/commands.ts',
    symbols: [
      'provisionNewSessionDelivery',
      'updateAgent',
      'revokeAgentTeamAccess',
      'revokeDelegation',
      'createDelegation',
      'createAgentSession',
      'delegateAndStartAgentSession',
      'exchangeAgentToken',
      'refreshAgentToken',
      'retrySession',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/collaboration/routes.ts',
    symbols: [
      'lockCollaborationSessionTargets',
      'assertSessionWrite',
      'createChild',
      'createReview',
      'acceptHandoff',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/delivery/routes.ts',
    symbols: ['artifact-upload-intents/:id/finalize'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['agent_sessions','work_items','projects'],
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/operations/routes.ts',
    symbols: [
      'projects/:id/health',
      'usage-records',
      'a2a-bindings/:id/tasks',
    ],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'packages/db/src/stage4.ts',
    symbols: ['admitLoopRun','executeAutomationAction'],
    classes: ['ranked-lock','ranked-write'],
    ranks: agentLockRanks,
    order: 'authority-first',
  },
  {
    file: 'apps/api/src/commands.ts',
    symbols: ['updateWorkItem','deleteProject'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['work_items','projects'],
    order: 'single-rank',
  },
  {
    file: 'apps/api/src/inbox/routes.ts',
    symbols: ['loadAgentItemForUpdate','lockReplyParticipantsBeforeReservation'],
    classes: ['ranked-lock','ranked-write'],
    ranks: ['agent_sessions'],
    order: 'single-rank',
  },
  {
    file: 'apps/worker/src/artifact-uploads.ts',
    symbols: ['createArtifactUploadWorker','claim','verify','fail'],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['work_items'],
    order: 'terminal-claim',
    exemption: 'Upload workers claim terminal upload-intent rows and only touch their bound Work Item.',
  },
  {
    file: 'apps/worker/src/automation.ts',
    symbols: ['createAutomationWorker','claimEffects','executeEffect'],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['agent_sessions','work_items'],
    order: 'terminal-claim',
    exemption: 'Automation workers claim terminal queue rows before applying one already-admitted action.',
  },
  {
    file: 'apps/worker/src/session-lifecycle.ts',
    symbols: ['expireAckDeadlines','reconcileHeartbeatLiveness','expireStopGrace'],
    classes: ['ranked-lock','ranked-write','terminal-skip-locked'],
    ranks: ['agent_sessions'],
    order: 'terminal-claim',
    exemption: 'Terminal worker claims one rank with SKIP LOCKED and never acquires an earlier rank.',
  },
  {
    file: 'apps/worker/src/retention.ts',
    symbols: ['createRetentionWorker', 'const claim = async'],
    classes: ['ranked-write','terminal-skip-locked'],
    ranks: ['agent_sessions','work_items','projects'],
    order: 'terminal-claim',
    exemption: 'Retention claims are terminal, bounded, and do not enter Agent authority mutation paths.',
  },
]
