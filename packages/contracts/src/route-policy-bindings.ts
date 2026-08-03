// Checked-in REST bindings consumed by the serializable route policy manifest.
export const routeOperationBindings = [
  {
    "method": "GET",
    "path": "/livez",
    "operationId": "live"
  },
  {
    "method": "GET",
    "path": "/readyz",
    "operationId": "ready"
  },
  {
    "method": "GET",
    "path": "/health",
    "operationId": "health"
  },
  {
    "method": "GET",
    "path": "/api/v1/info",
    "operationId": "getServerInfo"
  },
  {
    "method": "GET",
    "path": "/api/v1/features",
    "operationId": "getDeploymentFeatures"
  },
  {
    "method": "GET",
    "path": "/api/v1/install-status",
    "operationId": "getInstallStatus"
  },
  {
    "method": "POST",
    "path": "/api/v1/auth/install",
    "operationId": "installWorkspace"
  },
  {
    "method": "POST",
    "path": "/api/v1/auth/login",
    "operationId": "login"
  },
  {
    "method": "POST",
    "path": "/api/v1/auth/logout",
    "operationId": "logout"
  },
  {
    "method": "GET",
    "path": "/api/v1/auth/me",
    "operationId": "getCurrentActor"
  },
  {
    "method": "GET",
    "path": "/api/v1/workspace",
    "operationId": "getWorkspace"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/workspace",
    "operationId": "updateWorkspace"
  },
  {
    "method": "GET",
    "path": "/api/v1/teams",
    "operationId": "listTeams"
  },
  {
    "method": "POST",
    "path": "/api/v1/teams",
    "operationId": "createTeam"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/teams/{id}",
    "operationId": "updateTeam"
  },
  {
    "method": "DELETE",
    "path": "/api/v1/teams/{id}",
    "operationId": "deleteTeam"
  },
  {
    "method": "GET",
    "path": "/api/v1/teams/{id}/states",
    "operationId": "listWorkflowStates"
  },
  {
    "method": "POST",
    "path": "/api/v1/teams/{id}/states",
    "operationId": "createWorkflowState"
  },
  {
    "method": "GET",
    "path": "/api/v1/projects",
    "operationId": "listProjects"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects",
    "operationId": "createProject"
  },
  {
    "method": "GET",
    "path": "/api/v1/projects/{id}",
    "operationId": "getProject"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/projects/{id}",
    "operationId": "updateProject"
  },
  {
    "method": "DELETE",
    "path": "/api/v1/projects/{id}",
    "operationId": "deleteProject"
  },
  {
    "method": "GET",
    "path": "/api/v1/actors/humans",
    "operationId": "listHumanActors"
  },
  {
    "method": "GET",
    "path": "/api/v1/work-items",
    "operationId": "listWorkItems"
  },
  {
    "method": "POST",
    "path": "/api/v1/work-items",
    "operationId": "createWorkItem"
  },
  {
    "method": "GET",
    "path": "/api/v1/work-items/{id}",
    "operationId": "getWorkItem"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/work-items/{id}",
    "operationId": "updateWorkItem"
  },
  {
    "method": "DELETE",
    "path": "/api/v1/work-items/{id}",
    "operationId": "deleteWorkItem"
  },
  {
    "method": "GET",
    "path": "/api/v1/work-items/{id}/comments",
    "operationId": "listWorkItemComments"
  },
  {
    "method": "POST",
    "path": "/api/v1/work-items/{id}/comments",
    "operationId": "createComment"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/comments/{id}",
    "operationId": "updateComment"
  },
  {
    "method": "GET",
    "path": "/api/v1/views",
    "operationId": "listSavedViews"
  },
  {
    "method": "POST",
    "path": "/api/v1/views",
    "operationId": "createSavedView"
  },
  {
    "method": "GET",
    "path": "/api/v1/events",
    "operationId": "listEvents"
  },
  {
    "method": "GET",
    "path": "/api/v1/events/stream",
    "operationId": "streamEvents"
  },
  {
    "method": "GET",
    "path": "/api/v1/agents",
    "operationId": "listAgents"
  },
  {
    "method": "POST",
    "path": "/api/v1/agents/register",
    "operationId": "registerAgent"
  },
  {
    "method": "GET",
    "path": "/api/v1/agents/{id}",
    "operationId": "getAgent"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/agents/{id}",
    "operationId": "updateAgent"
  },
  {
    "method": "POST",
    "path": "/api/v1/agents/{id}/webhook-endpoints",
    "operationId": "createAgentWebhookEndpoint"
  },
  {
    "method": "POST",
    "path": "/api/v1/agents/{id}/webhook-endpoints/{endpointId}/rotate-secret",
    "operationId": "rotateAgentWebhookSecret"
  },
  {
    "method": "PUT",
    "path": "/api/v1/agents/{id}/team-access/{teamId}",
    "operationId": "approveAgentTeamAccess"
  },
  {
    "method": "DELETE",
    "path": "/api/v1/agents/{id}/team-access/{teamId}",
    "operationId": "revokeAgentTeamAccess"
  },
  {
    "method": "POST",
    "path": "/api/v1/work-items/{id}/delegations",
    "operationId": "createDelegation"
  },
  {
    "method": "POST",
    "path": "/api/v1/work-items/{id}/agent-session",
    "operationId": "delegateAndStartAgentSession"
  },
  {
    "method": "GET",
    "path": "/api/v1/delegations/{id}",
    "operationId": "getDelegation"
  },
  {
    "method": "POST",
    "path": "/api/v1/delegations/{id}/revoke",
    "operationId": "revokeDelegation"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions",
    "operationId": "listAgentSessions"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions",
    "operationId": "createAgentSession"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions/{id}",
    "operationId": "getAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/token/exchange",
    "operationId": "exchangeAgentSessionToken"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/token/refresh",
    "operationId": "refreshAgentSessionToken"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/ack",
    "operationId": "acknowledgeAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/heartbeat",
    "operationId": "heartbeatAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/state",
    "operationId": "transitionAgentSessionState"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/prompt",
    "operationId": "promptAgentSession"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions/{id}/activities",
    "operationId": "listAgentActivities"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/activities",
    "operationId": "appendAgentActivity"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions/{id}/plan",
    "operationId": "getAgentPlan"
  },
  {
    "method": "PUT",
    "path": "/api/v1/agent-sessions/{id}/plan",
    "operationId": "publishAgentPlan"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions/{id}/plans",
    "operationId": "listAgentPlanVersions"
  },
  {
    "method": "GET",
    "path": "/api/v1/agent-sessions/{id}/context",
    "operationId": "getAgentSessionContext"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/signals",
    "operationId": "signalAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/stop-ack",
    "operationId": "acknowledgeAgentSessionStop"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/complete",
    "operationId": "completeAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/fail",
    "operationId": "failAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/retry",
    "operationId": "retryAgentSession"
  },
  {
    "method": "GET",
    "path": "/api/v1/artifacts",
    "operationId": "listArtifacts"
  },
  {
    "method": "POST",
    "path": "/api/v1/artifacts",
    "operationId": "publishArtifact"
  },
  {
    "method": "GET",
    "path": "/api/v1/approvals",
    "operationId": "listApprovals"
  },
  {
    "method": "POST",
    "path": "/api/v1/approvals",
    "operationId": "requestApproval"
  },
  {
    "method": "GET",
    "path": "/api/v1/approvals/{id}",
    "operationId": "getApproval"
  },
  {
    "method": "POST",
    "path": "/api/v1/approvals/{id}/decide",
    "operationId": "decideApproval"
  },
  {
    "method": "POST",
    "path": "/api/v1/approvals/{id}/consume",
    "operationId": "consumeApproval"
  },
  {
    "method": "GET",
    "path": "/api/v1/rooms",
    "operationId": "getWorkRoom"
  },
  {
    "method": "GET",
    "path": "/api/v1/rooms/{id}/timeline",
    "operationId": "getWorkRoomTimeline"
  },
  {
    "method": "POST",
    "path": "/api/v1/rooms/{id}/messages",
    "operationId": "postWorkRoomMessage"
  },
  {
    "method": "POST",
    "path": "/api/v1/messages/{id}/resolve",
    "operationId": "resolveWorkRoomMessage"
  },
  {
    "method": "GET",
    "path": "/api/v1/inbox",
    "operationId": "listInbox"
  },
  {
    "method": "GET",
    "path": "/api/v1/leases",
    "operationId": "listLeases"
  },
  {
    "method": "POST",
    "path": "/api/v1/leases",
    "operationId": "acquireLease"
  },
  {
    "method": "POST",
    "path": "/api/v1/leases/{id}/heartbeat",
    "operationId": "heartbeatLease"
  },
  {
    "method": "POST",
    "path": "/api/v1/leases/{id}/renew",
    "operationId": "renewLease"
  },
  {
    "method": "POST",
    "path": "/api/v1/leases/{id}/release",
    "operationId": "releaseLease"
  },
  {
    "method": "POST",
    "path": "/api/v1/leases/{id}/force-release",
    "operationId": "forceReleaseLease"
  },
  {
    "method": "GET",
    "path": "/api/v1/handoffs",
    "operationId": "listHandoffs"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs",
    "operationId": "offerHandoff"
  },
  {
    "method": "GET",
    "path": "/api/v1/handoffs/{id}/inspect",
    "operationId": "inspectExactTargetHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs/{id}/request",
    "operationId": "requestHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs/{id}/accept",
    "operationId": "acceptHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs/{id}/reject",
    "operationId": "rejectHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs/{id}/cancel",
    "operationId": "cancelHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/handoffs/{id}/complete",
    "operationId": "completeHandoff"
  },
  {
    "method": "POST",
    "path": "/api/v1/work-items/{id}/decisions",
    "operationId": "createWorkItemDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/decisions",
    "operationId": "createProjectDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/decisions",
    "operationId": "createSessionDecision"
  },
  {
    "method": "GET",
    "path": "/api/v1/decisions/{id}",
    "operationId": "getDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/decisions/{id}/finalize",
    "operationId": "finalizeDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/decisions/{id}/supersede",
    "operationId": "supersedeDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/decisions/{id}/reverse",
    "operationId": "reverseDecision"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/plan/comments",
    "operationId": "commentOnPlanStep"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/assignment-proposals",
    "operationId": "proposePlanAssignment"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/children",
    "operationId": "createChildAgentSession"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/context-deltas",
    "operationId": "appendContextDelta"
  },
  {
    "method": "POST",
    "path": "/api/v1/agent-sessions/{id}/review-delegations",
    "operationId": "createReviewDelegation"
  },
  {
    "method": "GET",
    "path": "/api/v1/workspaces/{id}/guidance",
    "operationId": "getWorkspaceGuidance"
  },
  {
    "method": "GET",
    "path": "/api/v1/teams/{id}/guidance",
    "operationId": "getTeamGuidance"
  },
  {
    "method": "GET",
    "path": "/api/v1/projects/{id}/guidance",
    "operationId": "getProjectGuidance"
  },
  {
    "method": "POST",
    "path": "/api/v1/provider-connections",
    "operationId": "createProviderConnection"
  },
  {
    "method": "POST",
    "path": "/api/v1/provider-webhooks/{connectionId}/github",
    "operationId": "receiveGitHubWebhook"
  },
  {
    "method": "GET",
    "path": "/api/v1/repositories",
    "operationId": "listRepositories"
  },
  {
    "method": "POST",
    "path": "/api/v1/repositories",
    "operationId": "connectRepository"
  },
  {
    "method": "GET",
    "path": "/api/v1/repositories/{id}/context",
    "operationId": "getRepositoryContext"
  },
  {
    "method": "POST",
    "path": "/api/v1/repositories/{id}/context",
    "operationId": "pinRepositoryContext"
  },
  {
    "method": "POST",
    "path": "/api/v1/provider-actions",
    "operationId": "requestProviderAction"
  },
  {
    "method": "POST",
    "path": "/api/v1/delivery-artifacts",
    "operationId": "publishDeliveryArtifact"
  },
  {
    "method": "POST",
    "path": "/api/v1/artifact-upload-intents",
    "operationId": "requestArtifactUpload"
  },
  {
    "method": "POST",
    "path": "/api/v1/artifact-upload-intents/{id}/finalize",
    "operationId": "finalizeArtifactUpload"
  },
  {
    "method": "GET",
    "path": "/api/v1/artifact-upload-intents/{id}/download",
    "operationId": "downloadVerifiedArtifact"
  },
  {
    "method": "POST",
    "path": "/api/v1/pull-requests/{id}/reviews",
    "operationId": "publishStructuredReview"
  },
  {
    "method": "POST",
    "path": "/api/v1/pull-requests/{id}/merge",
    "operationId": "requestPullRequestMerge"
  },
  {
    "method": "POST",
    "path": "/api/v1/pull-requests/{id}/checks/{checkId}/retry",
    "operationId": "retryPullRequestCheck"
  },
  {
    "method": "GET",
    "path": "/api/v1/projects/{id}/delivery",
    "operationId": "getProjectDelivery"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/milestones",
    "operationId": "createProjectMilestone"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/updates",
    "operationId": "createProjectUpdateDraft"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/updates/{updateId}/publish",
    "operationId": "publishProjectUpdate"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/dependencies",
    "operationId": "createProjectDependency"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/completion-suggestions",
    "operationId": "suggestWorkItemCompletion"
  },
  {
    "method": "POST",
    "path": "/api/v1/completion-suggestions/{id}/decision",
    "operationId": "decideCompletionSuggestion"
  },
  {
    "method": "GET",
    "path": "/api/v1/cycles",
    "operationId": "listCycles"
  },
  {
    "method": "POST",
    "path": "/api/v1/cycles",
    "operationId": "createCycle"
  },
  {
    "method": "POST",
    "path": "/api/v1/cycles/generate",
    "operationId": "generateCycles"
  },
  {
    "method": "POST",
    "path": "/api/v1/cycles/{id}/carry-over",
    "operationId": "carryOverCycleWork"
  },
  {
    "method": "PATCH",
    "path": "/api/v1/work-items/{id}/cycle",
    "operationId": "setWorkItemCycle"
  },
  {
    "method": "GET",
    "path": "/api/v1/initiatives",
    "operationId": "listInitiatives"
  },
  {
    "method": "POST",
    "path": "/api/v1/initiatives",
    "operationId": "createInitiative"
  },
  {
    "method": "GET",
    "path": "/api/v1/initiatives/{id}/rollup",
    "operationId": "getInitiativeRollup"
  },
  {
    "method": "GET",
    "path": "/api/v1/advanced-views",
    "operationId": "listAdvancedViews"
  },
  {
    "method": "POST",
    "path": "/api/v1/advanced-views",
    "operationId": "createAdvancedView"
  },
  {
    "method": "GET",
    "path": "/api/v1/advanced-views/{id}/results",
    "operationId": "evaluateAdvancedView"
  },
  {
    "method": "GET",
    "path": "/api/v1/projects/{id}/health",
    "operationId": "getProjectHealthHistory"
  },
  {
    "method": "POST",
    "path": "/api/v1/projects/{id}/health",
    "operationId": "createProjectHealthUpdate"
  },
  {
    "method": "GET",
    "path": "/api/v1/automation-rules",
    "operationId": "listAutomationRules"
  },
  {
    "method": "POST",
    "path": "/api/v1/automation-rules",
    "operationId": "createAutomationRule"
  },
  {
    "method": "POST",
    "path": "/api/v1/automation-rules/{id}/versions",
    "operationId": "createAutomationRuleVersion"
  },
  {
    "method": "POST",
    "path": "/api/v1/automation-rules/{id}/dry-run",
    "operationId": "dryRunAutomationRule"
  },
  {
    "method": "POST",
    "path": "/api/v1/automation-rules/{id}/trigger",
    "operationId": "triggerAutomationRule"
  },
  {
    "method": "POST",
    "path": "/api/v1/automation-rules/{id}/state",
    "operationId": "setAutomationRuleState"
  },
  {
    "method": "GET",
    "path": "/api/v1/automation-runs",
    "operationId": "listAutomationRuns"
  },
  {
    "method": "GET",
    "path": "/api/v1/automation-runs/{runId}",
    "operationId": "getAutomationRun"
  },
  {
    "method": "GET",
    "path": "/api/v1/loops",
    "operationId": "listLoops"
  },
  {
    "method": "POST",
    "path": "/api/v1/loops",
    "operationId": "createLoop"
  },
  {
    "method": "POST",
    "path": "/api/v1/loops/{id}/run",
    "operationId": "runLoopNow"
  },
  {
    "method": "POST",
    "path": "/api/v1/loops/{id}/state",
    "operationId": "setLoopState"
  },
  {
    "method": "POST",
    "path": "/api/v1/usage-records",
    "operationId": "recordUsage"
  },
  {
    "method": "GET",
    "path": "/api/v1/usage-summary",
    "operationId": "getUsageSummary"
  },
  {
    "method": "POST",
    "path": "/api/v1/budget-policies",
    "operationId": "setBudgetPolicy"
  },
  {
    "method": "POST",
    "path": "/api/v1/notifications",
    "operationId": "createNotification"
  },
  {
    "method": "PUT",
    "path": "/api/v1/notification-preferences",
    "operationId": "updateNotificationPreferences"
  },
  {
    "method": "GET",
    "path": "/api/v1/templates",
    "operationId": "listTemplates"
  },
  {
    "method": "POST",
    "path": "/api/v1/templates",
    "operationId": "createTemplate"
  },
  {
    "method": "POST",
    "path": "/api/v1/templates/{id}/versions",
    "operationId": "createTemplateVersion"
  },
  {
    "method": "POST",
    "path": "/api/v1/templates/{id}/state",
    "operationId": "setTemplateState"
  },
  {
    "method": "GET",
    "path": "/api/v1/templates/export",
    "operationId": "exportTemplates"
  },
  {
    "method": "POST",
    "path": "/api/v1/templates/import",
    "operationId": "importTemplatesAsDrafts"
  },
  {
    "method": "POST",
    "path": "/api/v1/a2a-bindings",
    "operationId": "configureA2ABinding"
  },
  {
    "method": "POST",
    "path": "/api/v1/a2a-bindings/{id}/tasks",
    "operationId": "acceptA2ATask"
  },
  {
    "method": "GET",
    "path": "/api/v1/a2a-bindings/{id}/tasks/{taskId}/events",
    "operationId": "streamA2ATaskEvents"
  },
  {
    "method": "GET",
    "path": "/api/v1/admin/retention/status",
    "operationId": "getRetentionStatus"
  }
] as const
