import { routeOperationBindings } from './route-policy-bindings.js'

export type RoutePolicyMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type RoutePolicyActorKind = 'human' | 'agent' | 'service'
export type RoutePolicyAuthentication =
  | 'public'
  | 'human_session'
  | 'agent_session'
  | 'human_or_agent_session'
  | 'installation_target'
  | 'provider_signature'
export type RoutePolicyFeatureTier = 'stable' | 'beta' | 'experimental'
export type ResourceResolverId =
  | 'none'
  | 'workspace'
  | 'team'
  | 'project'
  | 'work_item'
  | 'comment'
  | 'agent_definition'
  | 'delegation'
  | 'agent_session'
  | 'artifact'
  | 'approval'
  | 'work_room'
  | 'lease'
  | 'handoff'
  | 'decision'
  | 'repository'
  | 'provider_connection'
  | 'provider_action'
  | 'pull_request'
  | 'automation'
  | 'template'
  | 'a2a_binding'
  | 'event_audience'

export type RoutePolicyManifestEntry = Readonly<{
  method: RoutePolicyMethod
  path: string
  operationId: string
  policyId: string
  authentication: RoutePolicyAuthentication
  actorKinds: readonly RoutePolicyActorKind[]
  human: Readonly<{
    workspaceRoles: readonly ('admin' | 'member')[]
    teamRoles: readonly ('admin' | 'maintainer' | 'member')[]
    membership: 'none' | 'workspace' | 'resolved_team'
    ownerMayManage: boolean
  }>
  agent: Readonly<{
    capabilities: readonly string[]
    sessionBinding: 'none' | 'current_session' | 'installation_target'
    requireActiveSession: boolean
    requireActiveDelegation: boolean
    requireLiveGrantIntersection: boolean
    resourceScope: 'none' | 'resolved_resource'
  }>
  resourceResolverId: ResourceResolverId
  approval: Readonly<{
    required: boolean
    bindsActionFingerprint: boolean
  }>
  lease: Readonly<{
    required: boolean
    grantsAuthorization: false
  }>
  revision: 'none' | 'if_match'
  idempotency: 'none' | 'required'
  feature: Readonly<{
    key: string | null
    tier: RoutePolicyFeatureTier
    disabledBehavior: 'available' | 'feature_disabled'
  }>
  audit: Readonly<{
    denial: 'required'
    heartbeatAmplification: 'suppress_repeated'
  }>
  bindings: Readonly<{
    rest: Readonly<{ method: RoutePolicyMethod; path: string }>
    sse: boolean
    sdkOperationId: string
    mcpOperationId: string
  }>
}>

export type RoutePolicyFeatureResolver = (
  path: string,
) => Readonly<{ key: string; tier: RoutePolicyFeatureTier }> | undefined

const publicOperations = new Set([
  'health',
  'getServerInfo',
  'getInstallStatus',
  'installWorkspace',
  'login',
])

const installationTargetOperations = new Set([
  'exchangeAgentSessionToken',
  'refreshAgentSessionToken',
  'inspectExactTargetHandoff',
  'rejectHandoff',
])

const workspaceAdminOperations = new Set([
  'updateWorkspace',
  'createTeam',
  'updateTeam',
  'deleteTeam',
  'registerAgent',
  'updateAgent',
  'createAgentWebhookEndpoint',
  'rotateAgentWebhookSecret',
  'approveAgentTeamAccess',
  'revokeAgentTeamAccess',
  'createProviderConnection',
  'setBudgetPolicy',
  'exportTemplates',
  'importTemplatesAsDrafts',
])

const humanOnlyOperations = new Set([
  ...workspaceAdminOperations,
  'logout',
  'listHumanActors',
  'listAgents',
  'getAgent',
  'createWorkflowState',
  'createDelegation',
  'delegateAndStartAgentSession',
  'getDelegation',
  'revokeDelegation',
  'createAgentSession',
  'promptAgentSession',
  'signalAgentSession',
  'retryAgentSession',
  'decideApproval',
  'getWorkRoomTimeline',
  'resolveWorkRoomMessage',
  'listInbox',
  'forceReleaseLease',
  'acceptHandoff',
  'finalizeDecision',
  'supersedeDecision',
  'reverseDecision',
  'connectRepository',
  'pinRepositoryContext',
  'createProjectMilestone',
  'publishProjectUpdate',
  'createProjectDependency',
  'decideCompletionSuggestion',
  'createCycle',
  'generateCycles',
  'carryOverCycleWork',
  'setWorkItemCycle',
  'createInitiative',
  'createAdvancedView',
  'createAutomationRule',
  'createAutomationRuleVersion',
  'dryRunAutomationRule',
  'triggerAutomationRule',
  'setAutomationRuleState',
  'createLoop',
  'setLoopState',
  'createNotification',
  'updateNotificationPreferences',
  'createTemplate',
  'createTemplateVersion',
  'setTemplateState',
  'configureA2ABinding',
  'acceptA2ATask',
])

const revisionedOperations = new Set([
  'updateWorkspace',
  'updateTeam',
  'deleteTeam',
  'updateProject',
  'deleteProject',
  'updateWorkItem',
  'deleteWorkItem',
  'updateComment',
  'updateAgent',
  'rotateAgentWebhookSecret',
  'revokeDelegation',
  'transitionAgentSessionState',
  'promptAgentSession',
  'publishAgentPlan',
  'signalAgentSession',
  'acknowledgeAgentSessionStop',
  'completeAgentSession',
  'failAgentSession',
  'retryAgentSession',
  'decideApproval',
  'consumeApproval',
  'resolveWorkRoomMessage',
  'renewLease',
  'releaseLease',
  'forceReleaseLease',
  'acceptHandoff',
  'rejectHandoff',
  'cancelHandoff',
  'completeHandoff',
  'finalizeDecision',
  'supersedeDecision',
  'reverseDecision',
  'publishProjectUpdate',
  'decideCompletionSuggestion',
  'setWorkItemCycle',
  'createProjectHealthUpdate',
  'createAutomationRuleVersion',
  'setAutomationRuleState',
  'setLoopState',
  'createTemplateVersion',
  'setTemplateState',
])

const approvalOperations = new Set([
  'requestPullRequestMerge',
  'forceReleaseLease',
  'consumeApproval',
])

const leaseOperations = new Set([
  'heartbeatLease',
  'renewLease',
  'releaseLease',
  'requestProviderAction',
])

function authenticationFor(operationId: string): RoutePolicyAuthentication {
  if (publicOperations.has(operationId)) return 'public'
  if (operationId === 'receiveGitHubWebhook') return 'provider_signature'
  if (installationTargetOperations.has(operationId)) return 'installation_target'
  if (humanOnlyOperations.has(operationId)) return 'human_session'
  return 'human_or_agent_session'
}

function resolverFor(path: string, operationId: string): ResourceResolverId {
  if (operationId === 'listEvents' || operationId === 'streamEvents') return 'event_audience'
  if (path.includes('/templates')) return 'template'
  if (path.includes('/a2a-bindings')) return 'a2a_binding'
  if (path.includes('/automation') || path.includes('/loops')) return 'automation'
  if (path.includes('/pull-requests')) return 'pull_request'
  if (path.includes('/provider-connections') || path.includes('/provider-webhooks')) return 'provider_connection'
  if (path.includes('/provider-actions')) return 'provider_action'
  if (path.includes('/repositories')) return 'repository'
  if (path.includes('/decisions')) return 'decision'
  if (path.includes('/handoffs')) return 'handoff'
  if (path.includes('/leases')) return 'lease'
  if (path.includes('/rooms') || path.includes('/messages')) return 'work_room'
  if (path.includes('/approvals')) return 'approval'
  if (path.includes('/artifacts') || path.includes('/artifact-upload')) return 'artifact'
  if (path.includes('/agent-sessions')) return 'agent_session'
  if (path.includes('/delegations')) return 'delegation'
  if (path.includes('/agents')) return 'agent_definition'
  if (path.includes('/comments')) return 'comment'
  if (path.includes('/work-items')) return 'work_item'
  if (path.includes('/projects')) return 'project'
  if (path.includes('/teams')) return 'team'
  if (path === '/api/v1/workspace' || path.includes('/workspaces/')) return 'workspace'
  return 'none'
}

function capabilityFor(
  method: RoutePolicyMethod,
  path: string,
  operationId: string,
): readonly string[] {
  if (method === 'GET') {
    if (path.includes('/repositories')) return ['repo:read']
    return ['work:read']
  }
  if (operationId === 'publishStructuredReview') return ['artifact:write']
  if (operationId === 'retryPullRequestCheck') return ['ci:run']
  if (operationId === 'requestPullRequestMerge') return ['repo:merge']
  if (path.includes('/comments')) return ['comment:write']
  if (path.includes('/plan')) return ['plan:write']
  if (path.includes('/rooms') || path.includes('/messages')) return ['message:write']
  if (path.includes('/artifacts') || path.includes('/artifact-upload')) return ['artifact:write']
  if (path.includes('/provider-actions') || path.includes('/repositories')) return ['repo:write_branch']
  if (path.includes('/automation') || path.includes('/loops')) return ['automation:manage']
  return ['work:write']
}

export function createRoutePolicyManifest(
  featureForRoute: RoutePolicyFeatureResolver = () => undefined,
): readonly RoutePolicyManifestEntry[] {
  return Object.freeze(routeOperationBindings.map(binding => {
    const authentication = authenticationFor(binding.operationId)
    const humanOnly = authentication === 'human_session'
    const agentAuthentication = authentication === 'agent_session'
      || authentication === 'human_or_agent_session'
      || authentication === 'installation_target'
    const feature = featureForRoute(binding.path)
    const workspaceAdmin = workspaceAdminOperations.has(binding.operationId)
    const mutation = binding.method !== 'GET'
    const resolver = resolverFor(binding.path, binding.operationId)
    const policyId = `route.${binding.operationId}`

    return Object.freeze({
      method: binding.method,
      path: binding.path,
      operationId: binding.operationId,
      policyId,
      authentication,
      actorKinds: authentication === 'public'
        ? []
        : authentication === 'provider_signature'
          ? ['service']
          : authentication === 'installation_target'
            ? ['agent']
            : humanOnly
              ? ['human']
              : ['human', 'agent'],
      human: {
        workspaceRoles: workspaceAdmin ? ['admin'] : ['admin', 'member'],
        teamRoles: workspaceAdmin ? ['admin'] : mutation ? ['admin', 'maintainer'] : ['admin', 'maintainer', 'member'],
        membership: resolver === 'none' || resolver === 'workspace' ? 'workspace' : 'resolved_team',
        ownerMayManage: resolver === 'template',
      },
      agent: {
        capabilities: agentAuthentication
          ? capabilityFor(binding.method, binding.path, binding.operationId)
          : [],
        sessionBinding: authentication === 'installation_target' ? 'installation_target' : agentAuthentication ? 'current_session' : 'none',
        requireActiveSession: authentication !== 'installation_target' && agentAuthentication,
        requireActiveDelegation: authentication !== 'installation_target' && agentAuthentication,
        requireLiveGrantIntersection: authentication !== 'installation_target' && agentAuthentication,
        resourceScope: resolver === 'none' ? 'none' : 'resolved_resource',
      },
      resourceResolverId: resolver,
      approval: {
        required: approvalOperations.has(binding.operationId),
        bindsActionFingerprint: approvalOperations.has(binding.operationId),
      },
      lease: {
        required: leaseOperations.has(binding.operationId),
        grantsAuthorization: false,
      },
      revision: revisionedOperations.has(binding.operationId) ? 'if_match' : 'none',
      idempotency: mutation && authentication !== 'provider_signature' ? 'required' : 'none',
      feature: {
        key: feature?.key ?? null,
        tier: feature?.tier ?? 'stable',
        disabledBehavior: feature ? 'feature_disabled' : 'available',
      },
      audit: {
        denial: 'required',
        heartbeatAmplification: 'suppress_repeated',
      },
      bindings: {
        rest: { method: binding.method, path: binding.path },
        sse: binding.operationId === 'streamEvents',
        sdkOperationId: binding.operationId,
        mcpOperationId: binding.operationId,
      },
    } satisfies RoutePolicyManifestEntry)
  }))
}

const mcpOperationIds = {
  'resource:server-info': 'getServerInfo',
  'resource:server-features': 'getDeploymentFeatures',
  'resource:work-item': 'getWorkItem',
  'resource:session-context': 'getAgentSessionContext',
  'resource:session-plan': 'getAgentPlan',
  'resource:session-activity': 'listAgentActivities',
  'resource:workspace-guidance': 'getWorkspaceGuidance',
  'resource:team-guidance': 'getTeamGuidance',
  'resource:project-guidance': 'getProjectGuidance',
  'resource:repository-context': 'getRepositoryContext',
  'tool:list_work_items': 'listWorkItems',
  'tool:get_work_item': 'getWorkItem',
  'tool:get_work_room': 'getWorkRoom',
  'tool:create_repository_branch': 'requestProviderAction',
  'tool:create_repository_commit': 'requestProviderAction',
  'tool:open_pull_request': 'requestProviderAction',
  'tool:publish_delivery_artifact': 'publishDeliveryArtifact',
  'tool:request_artifact_upload': 'requestArtifactUpload',
  'tool:finalize_artifact_upload': 'finalizeArtifactUpload',
  'tool:publish_structured_review': 'publishStructuredReview',
  'tool:merge_pull_request': 'requestPullRequestMerge',
  'tool:retry_ci_check': 'retryPullRequestCheck',
  'tool:draft_project_update': 'createProjectUpdateDraft',
  'tool:publish_project_update': 'publishProjectUpdate',
  'tool:decide_completion_suggestion': 'decideCompletionSuggestion',
  'tool:post_work_room_message': 'postWorkRoomMessage',
  'tool:comment_plan_step': 'commentOnPlanStep',
  'tool:propose_plan_step_assignment': 'proposePlanAssignment',
  'tool:create_child_session': 'createChildAgentSession',
  'tool:append_context_delta': 'appendContextDelta',
  'tool:create_review_delegation': 'createReviewDelegation',
  'tool:acquire_lease': 'acquireLease',
  'tool:offer_handoff': 'offerHandoff',
  'tool:inspect_pending_handoff': 'inspectExactTargetHandoff',
  'tool:request_handoff': 'requestHandoff',
  'tool:reject_handoff': 'rejectHandoff',
  'tool:ack_agent_session': 'acknowledgeAgentSession',
  'tool:heartbeat': 'heartbeatAgentSession',
  'tool:append_activity': 'appendAgentActivity',
  'tool:publish_plan': 'publishAgentPlan',
  'tool:send_message': 'appendAgentActivity',
  'tool:ask': 'appendAgentActivity',
  'tool:request_approval': 'requestApproval',
  'tool:publish_artifact': 'publishArtifact',
  'tool:complete_session': 'completeAgentSession',
  'tool:fail_session': 'failAgentSession',
} as const

const declaredOperationIds = new Set(routeOperationBindings.map(binding => binding.operationId))
for (const [binding, operationId] of Object.entries(mcpOperationIds)) {
  if (!declaredOperationIds.has(operationId)) {
    throw new Error(`MCP binding ${binding} references unknown operationId ${operationId}`)
  }
}

export const mcpPolicyBindings = Object.freeze(Object.fromEntries(
  Object.entries(mcpOperationIds).map(([binding, operationId]) => [
    binding,
    Object.freeze({ operationId, policyId: `route.${operationId}` }),
  ]),
)) as Readonly<Record<keyof typeof mcpOperationIds, Readonly<{
  operationId: string
  policyId: string
}>>>
