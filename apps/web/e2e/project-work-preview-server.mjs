import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { matchesPreviewWorkItem } from './project-work-preview-query.mjs'

const argument = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const port = Number(argument('--port') ?? process.env.PORT ?? 3101)
const webOrigin = argument('--origin') ?? process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3100'
const cors = {
  'access-control-allow-origin': webOrigin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type,if-match,idempotency-key,x-csrf-token',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'content-type': 'application/json',
}
const team = { id: '7d13dccc-2210-44db-b030-76d56db1b998', name: 'WorkMesh Product', key: 'WM', revision: 3 }
const human = { id: '1ea95f79-9388-4418-bdd3-56a72871d70e', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }
const project = { id: '3f12de4f-b117-4a78-9e10-da102c892ae1', team_id: team.id, name: 'Kaneo UI Adoption', summary: 'Bring a calm, dense planning workflow to WorkMesh.', description: 'Adopt Kaneo’s strongest project-planning patterns while preserving WorkMesh Human authority, Agent execution state, and durable operational facts.', status: 'in_progress', lead_actor_id: human.id, target_date: '2026-09-15', revision: 4 }
const states = [
  { id: 'f0000000-0000-4000-8000-000000000001', name: 'Backlog', category: 'backlog', color: '#a8a29e', revision: 1 },
  { id: 'f0000000-0000-4000-8000-000000000002', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 },
  { id: 'f0000000-0000-4000-8000-000000000003', name: 'In Progress', category: 'started', color: '#2563eb', revision: 1 },
  { id: 'f0000000-0000-4000-8000-000000000004', name: 'Review', category: 'started', color: '#7c3aed', revision: 1 },
  { id: 'f0000000-0000-4000-8000-000000000005', name: 'Done', category: 'completed', color: '#16a34a', revision: 1 },
]
let milestones = [
  { id: 'd0000000-0000-4000-8000-000000000001', workspace_id: 'workspace-preview', project_id: project.id, name: 'Foundation', description: 'Shell, navigation, and accessible shared UI.', target_date: '2026-08-18', revision: 2, deleted_at: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-09T00:00:00Z' },
  { id: 'd0000000-0000-4000-8000-000000000002', workspace_id: 'workspace-preview', project_id: project.id, name: 'Planning surfaces', description: 'Project roadmap, hierarchy, blockers, board, and full Work Item view.', target_date: '2026-08-28', revision: 1, deleted_at: null, created_at: '2026-08-02T00:00:00Z', updated_at: '2026-08-09T00:00:00Z' },
  { id: 'd0000000-0000-4000-8000-000000000003', workspace_id: 'workspace-preview', project_id: project.id, name: 'Dogfood closure', description: 'Run the imported Kaneo plan from WorkMesh.', target_date: '2026-09-15', revision: 1, deleted_at: null, created_at: '2026-08-03T00:00:00Z', updated_at: '2026-08-09T00:00:00Z' },
]
const executor = { agent_id: 'agent-codex', agent_actor_id: 'actor-codex', agent_slug: 'codex', agent_display_name: 'Codex', session_id: 'session-codex', lease_id: 'lease-codex', lease_kind: 'exclusive', resource_type: 'work_item', resource_id: '', execution_state: 'executing', heartbeat_health: 'healthy', last_heartbeat_at: '2026-08-10T07:00:00Z', lease_heartbeat_at: '2026-08-10T07:00:00Z', lease_expires_at: '2026-08-10T09:00:00Z' }
const agent = { id: 'agent-preview', workspace_id: 'workspace-preview', actor_id: 'actor-agent-preview', name: 'Codex Preview', slug: 'codex-preview', description: 'Frontend preview agent.', provider: 'openai', version: '1.0.0', supported_protocols: ['native_http'], skills: ['frontend'], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, heartbeat_interval_seconds: 30, is_active: true, revision: 1, team_access: [] }
const session = { id: 'session-preview', agent_id: agent.id, agent_actor_id: agent.actor_id, principal_human_actor_id: human.id, delegation_id: 'delegation-preview', work_item_id: null, state: 'executing', state_reason: null, revision: 1, current_plan_version_id: null, budget: {}, last_heartbeat_at: '2026-08-16T00:00:00Z', retry_of_session_id: null, stop_requested_at: null, error_code: null, error_summary: null, created_at: '2026-08-16T00:00:00Z', updated_at: '2026-08-16T00:00:00Z' }
const titles = [
  'Define Project information hierarchy', 'Build responsive planning shell', 'Add Milestone roadmap', 'Model parent and child Work Items',
  'Show blocking relationships', 'Separate Human and Agent state', 'Build dense keyboard-ready board', 'Add List and Backlog views',
  'Create quick Work Item view', 'Create full Work Item route', 'Recover revision conflicts', 'Reconnect durable event stream',
  'Capture desktop and narrow evidence', 'Run Human management journey',
]
const items = titles.map((title, index) => {
  const status = states[index < 2 ? 4 : index < 5 ? 3 : index < 9 ? 2 : index < 12 ? 1 : 0]
  const id = `c0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  return {
    id, title, description: `${title} for the Kaneo UI Adoption plan.`, number: index + 41, revision: 2,
    status_id: status.id, status_name: status.name, status_category: status.category,
    team_id: team.id, team_key: team.key, priority: index % 5 === 0 ? 'high' : index % 3 === 0 ? 'medium' : 'none', due_date: null,
    responsible_human_actor_id: index === 12 ? null : human.id,
    responsible_human: index === 12 ? null : { actor_id: human.id, display_name: human.display_name },
    active_executor: index >= 5 && index <= 8 ? { ...executor, resource_id: id } : null,
    shared_reviewers: [], labels: index % 3 === 0 ? ['security'] : index % 2 ? ['frontend'] : ['planning'], project_id: project.id, project_name: project.name,
    milestone_id: milestones[Math.min(2, Math.floor(index / 5))].id,
    parent_id: [3, 4, 6, 7, 8, 10, 11].includes(index) ? `c0000000-0000-4000-8000-${String(index).padStart(12, '0')}` : null,
    surface_summary: { blocked_by_count: index === 6 ? 1 : 0, blocking_count: index === 4 ? 1 : 0, sub_issue_count: [2, 5, 9].includes(index) ? 3 : 0, completed_sub_issue_count: [2, 5, 9].includes(index) ? index % 3 : 0 },
  }
})
let relations = [{ id: 'b0000000-0000-4000-8000-000000000001', workspace_id: 'workspace-preview', team_id: team.id, source_work_item_id: items[4].id, target_work_item_id: items[6].id, kind: 'blocks', created_by_actor_id: human.id, revision: 1, deleted_at: null, created_at: '2026-08-09T00:00:00Z', updated_at: '2026-08-09T00:00:00Z' }]
let guidanceRevisions = [
  { id: 'a0000000-0000-4000-8000-000000000002', revisionNumber: 2, contentHash: `sha256:${'b'.repeat(64)}`, changeSummary: '明确 Issues 工作台协作规范', authorActorId: human.id, authorDisplayName: human.display_name, publishedAt: '2026-08-14T08:30:00Z' },
  { id: 'a0000000-0000-4000-8000-000000000001', revisionNumber: 1, contentHash: `sha256:${'a'.repeat(64)}`, changeSummary: '初始化工作区指南', authorActorId: human.id, authorDisplayName: human.display_name, publishedAt: '2026-08-10T06:00:00Z' },
]
let guidanceCurrent = { scope: 'workspace', scopeId: 'workspace-preview', documentId: 'a0000000-0000-4000-8000-000000000010', status: 'active', revision: 2, currentRevision: guidanceRevisions[0], markdown: '# WorkMesh 工作指南\n\n- 人类负责人对结果负责。\n- 智能体执行状态与 Issue 工作流状态保持分离。\n- 所有变更都要提供可验证证据。', updatedAt: guidanceRevisions[0].publishedAt }
const guidanceAudit = [{ id: 'a0000000-0000-4000-8000-000000000020', action: 'published', fromRevisionId: guidanceRevisions[1].id, toRevisionId: guidanceRevisions[0].id, actorId: human.id, actorDisplayName: human.display_name, reason: guidanceRevisions[0].changeSummary, createdAt: guidanceRevisions[0].publishedAt }]

const scenarioNames = new Set([
  'default',
  'agents-interactions',
  'settings-workspace',
  'settings-delete-failure',
  'settings-delete-retry',
  'command-center',
  'large-list',
  'final-tour',
  'approval-journey',
])
const fixedNow = '2026-08-22T09:30:00.000Z'
const scenarioTeams = [
  { id: 'team-foundation', name: 'Foundation', key: 'FND', revision: 2 },
  { id: 'team-runtime', name: 'Runtime', key: 'RUN', revision: 7 },
]
const scenarioStates = [
  { id: 'state-runtime-ready', name: 'Runtime Ready', category: 'planned', color: '#64748b', revision: 1 },
  { id: 'state-runtime-active', name: 'Runtime Active', category: 'started', color: '#2563eb', revision: 1 },
]
const scenarioAgents = [
  {
    id: 'agent/route', workspace_id: 'workspace-preview', actor_id: 'actor-agent-route', name: 'Orbit Agent', slug: 'orbit-agent',
    description: 'Stable route and interaction fixture.', provider: 'openai', version: '7.1.0', supported_protocols: ['native_http'],
    skills: ['planning'], requested_capabilities: ['work:read', 'work:write'], approved_capabilities: ['work:read', 'work:write'],
    max_concurrency: 2, heartbeat_interval_seconds: 30, is_active: true, revision: 4,
    team_access: [{
      agent_id: 'agent/route', team_id: 'team-runtime', approved_capabilities: ['work:read'], status: 'active',
      approved_by_actor_id: human.id, revision: 2, created_at: '2026-08-20T08:00:00.000Z', updated_at: fixedNow, revoked_at: null,
    }],
  },
  {
    id: 'agent-inactive', workspace_id: 'workspace-preview', actor_id: 'actor-agent-inactive', name: 'Archive Agent', slug: 'archive-agent',
    description: 'Inactive deterministic fixture.', provider: 'openai', version: '7.1.0', supported_protocols: ['native_http'],
    skills: ['archive'], requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1,
    heartbeat_interval_seconds: 60, is_active: false, revision: 1, team_access: [],
  },
]
const approvalFixture = (id, status, action, sessionId) => ({
  id, session_id: sessionId, approval_type: 'tool', action_name: action, risk_level: status === 'pending' ? 'medium' : 'low',
  rationale_summary: `Deterministic ${status} approval fixture.`, status, revision: 3,
  // Keep pending fixtures actionable during local and production-tour runs;
  // historical rows still exercise their terminal presentation separately.
  expires_at: status === 'pending' ? '2099-08-24T09:30:00.000Z' : '2026-08-24T09:30:00.000Z', created_at: '2026-08-22T08:00:00.000Z',
  viewer_actionability: status === 'pending'
    ? { status: 'actionable', allowed_decisions: ['approved', 'rejected'] }
    : { status: 'blocked', reason: 'already_decided' },
})
const initialScenarioApprovals = [
  approvalFixture('approval-retry', 'pending', 'Retry deployment', 'session-retry'),
  approvalFixture('approval-direct', 'pending', 'Direct replay proof', 'session-direct'),
  approvalFixture('approval-mixed-approved', 'approved', 'Already approved', 'session-approved'),
  approvalFixture('approval-rejected', 'rejected', 'Rejected historical action', 'session-rejected'),
]
const finalTourTeamsPageOne = [
  { id: 'team-1', name: 'Final Tour', key: 'FT', revision: 3 },
  { id: 'team-2', name: 'Agent Operations', key: 'AOP', revision: 2 },
]
const finalTourTeamPageTwo = { id: 'team-page-2', name: 'Platform', key: 'PLT', revision: 4 }
const finalTourStates = [
  { id: 'final-state-backlog', name: 'Final tour backlog', category: 'backlog', color: '#a8a29e', revision: 1 },
  { id: 'final-state-ready', name: 'Final tour ready', category: 'planned', color: '#64748b', revision: 1 },
  { id: 'final-state-active', name: 'Final tour active', category: 'started', color: '#2563eb', revision: 1 },
  { id: 'final-state-review', name: 'Final tour review', category: 'started', color: '#7c3aed', revision: 1 },
  { id: 'final-state-done', name: 'Final tour done', category: 'completed', color: '#16a34a', revision: 1 },
]
const finalTourProject = {
  id: 'project-1',
  team_id: 'team-1',
  name: 'Runtime Reliability',
  summary: 'A deterministic non-empty project for the final product tour.',
  description: 'Validate the accepted WorkMesh frontend flows with stable records and routes.',
  status: 'in_progress',
  lead_actor_id: human.id,
  target_date: '2026-09-30',
  revision: 5,
}
const finalTourMilestone = {
  id: 'milestone-final-tour',
  workspace_id: 'workspace-preview',
  project_id: finalTourProject.id,
  name: 'Final product tour',
  description: 'Final responsive and interaction evidence.',
  target_date: '2026-08-31',
  revision: 2,
  deleted_at: null,
  created_at: '2026-08-20T08:00:00.000Z',
  updated_at: fixedNow,
}
const finalTourExecutor = {
  agent_id: 'agent/1',
  agent_actor_id: 'actor-agent-final-tour-1',
  agent_slug: 'codex',
  agent_display_name: 'Codex',
  session_id: 'session-1',
  lease_id: 'lease-final-tour',
  lease_kind: 'exclusive',
  resource_type: 'work_item',
  resource_id: 'work-101',
  execution_state: 'executing',
  heartbeat_health: 'healthy',
  last_heartbeat_at: fixedNow,
  lease_heartbeat_at: fixedNow,
  lease_expires_at: '2026-08-22T10:00:00.000Z',
}
const finalTourAssignment = {
  delegation_id: 'delegation-final-tour',
  agent_id: 'agent/1',
  agent_actor_id: 'actor-agent-final-tour-1',
  agent_slug: 'codex',
  agent_display_name: 'Codex',
  session_id: 'session-1',
  session_state: 'executing',
  assigned_at: '2026-08-22T08:45:00.000Z',
}
const finalTourWorkItems = [
  {
    id: 'work-101',
    title: 'Final visual tour Issue',
    description: 'Exercise the accepted responsive WorkMesh interaction model.',
    number: 101,
    revision: 4,
    status_id: 'final-state-active',
    status_name: 'Final tour active',
    status_category: 'started',
    team_id: 'team-1',
    team_key: 'FT',
    priority: 'high',
    due_date: '2026-08-31',
    responsible_human_actor_id: human.id,
    responsible_human: { actor_id: human.id, display_name: human.display_name },
    active_assignment: finalTourAssignment,
    active_executor: finalTourExecutor,
    shared_reviewers: [],
    labels: ['frontend', 'final-tour'],
    project_id: finalTourProject.id,
    project_name: finalTourProject.name,
    milestone_id: finalTourMilestone.id,
    parent_id: null,
    surface_summary: { blocked_by_count: 0, blocking_count: 1, sub_issue_count: 1, completed_sub_issue_count: 0 },
  },
  {
    id: 'work-102',
    title: 'Final visual tour follow-up',
    description: 'Keep list and board collections visibly non-empty.',
    number: 102,
    revision: 2,
    status_id: 'final-state-review',
    status_name: 'Final tour review',
    status_category: 'started',
    team_id: 'team-1',
    team_key: 'FT',
    priority: 'medium',
    due_date: null,
    responsible_human_actor_id: human.id,
    responsible_human: { actor_id: human.id, display_name: human.display_name },
    active_assignment: null,
    active_executor: null,
    shared_reviewers: [],
    labels: ['frontend'],
    project_id: finalTourProject.id,
    project_name: finalTourProject.name,
    milestone_id: finalTourMilestone.id,
    parent_id: 'work-101',
    surface_summary: { blocked_by_count: 1, blocking_count: 0, sub_issue_count: 0, completed_sub_issue_count: 0 },
  },
]
const finalTourTeamAccess = agentId => ({
  agent_id: agentId,
  team_id: 'team-2',
  approved_capabilities: ['work:read'],
  status: 'active',
  approved_by_actor_id: human.id,
  revision: 2,
  created_at: '2026-08-20T08:00:00.000Z',
  updated_at: fixedNow,
  revoked_at: null,
})
const finalTourAgents = [
  {
    id: 'agent/1',
    workspace_id: 'workspace-preview',
    actor_id: 'actor-agent-final-tour-1',
    name: 'Codex',
    slug: 'codex',
    description: 'Primary deterministic implementation Agent.',
    provider: 'openai',
    version: '7.3.0',
    supported_protocols: ['native_http', 'mcp'],
    skills: ['frontend'],
    requested_capabilities: ['work:read', 'work:write'],
    approved_capabilities: ['work:read', 'work:write'],
    max_concurrency: 2,
    heartbeat_interval_seconds: 30,
    is_active: true,
    revision: 3,
    team_access: [
      finalTourTeamAccess('agent/1'),
      {
        ...finalTourTeamAccess('agent/1'),
        team_id: 'team-1',
        approved_capabilities: ['work:read', 'work:write'],
      },
    ],
  },
  {
    id: 'agent/2',
    workspace_id: 'workspace-preview',
    actor_id: 'actor-agent-final-tour-2',
    name: 'Codex Review',
    slug: 'codex-review',
    description: 'Deterministic review Agent for keyboard traversal.',
    provider: 'openai',
    version: '7.3.0',
    supported_protocols: ['native_http', 'mcp'],
    skills: ['review'],
    requested_capabilities: ['work:read'],
    approved_capabilities: ['work:read'],
    max_concurrency: 1,
    heartbeat_interval_seconds: 30,
    is_active: true,
    revision: 2,
    team_access: [finalTourTeamAccess('agent/2')],
  },
]
const finalTourSession = {
  id: 'session-1',
  agent_id: 'agent/1',
  agent_actor_id: 'actor-agent-final-tour-1',
  principal_human_actor_id: human.id,
  delegation_id: 'delegation-final-tour',
  work_item_id: 'work-101',
  state: 'executing',
  state_reason: 'Collecting deterministic final-tour evidence.',
  revision: 3,
  current_plan_version_id: null,
  budget: { maxRuntimeSeconds: 3600 },
  last_heartbeat_at: fixedNow,
  retry_of_session_id: null,
  stop_requested_at: null,
  error_code: null,
  error_summary: null,
  created_at: '2026-08-22T08:45:00.000Z',
  updated_at: fixedNow,
}
const runExplanationFixture = ({ selectedSession, selectedAgent, selectedWorkItem = null, selectedProject = null }) => ({
  projectionVersion: 1,
  session: {
    id: selectedSession.id,
    state: selectedSession.state,
    revision: selectedSession.revision,
    stateReason: selectedSession.state_reason,
    budget: selectedSession.budget,
    updatedAt: selectedSession.updated_at,
  },
  project: selectedProject ? { id: selectedProject.id, name: selectedProject.name, revision: selectedProject.revision } : null,
  workItem: selectedWorkItem ? { id: selectedWorkItem.id, title: selectedWorkItem.title, revision: selectedWorkItem.revision } : null,
  responsibleHuman: { id: human.id, kind: 'human', displayName: human.display_name },
  activeAgent: { id: selectedAgent.actor_id, kind: 'agent', displayName: selectedAgent.name },
  plan: null,
  currentStep: null,
  planVersions: [],
  causalGroups: [],
  nextCursor: null,
  pendingAttention: [],
  changes: [{ type: 'agent_session', id: selectedSession.id, revision: selectedSession.revision }],
  evidence: [],
  evidenceDetails: [],
  verification: { state: 'pending', summary: 'Execution has not yet published successful validation evidence.' },
  health: { heartbeat: 'healthy', lastHeartbeatAt: selectedSession.last_heartbeat_at, leaseCount: 0, pendingApprovalCount: 0 },
  freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: selectedSession.updated_at },
  allowedControls: [
    { action: 'pause', allowed: true, reasonCode: 'ALLOWED', targetState: 'paused' },
    { action: 'resume', allowed: false, reasonCode: 'SESSION_NOT_PAUSED', targetState: null },
    { action: 'stop', allowed: true, reasonCode: 'ALLOWED', targetState: 'stopping' },
    { action: 'retry', allowed: false, reasonCode: 'SESSION_NOT_TERMINAL', targetState: null },
    { action: 'handoff', allowed: true, reasonCode: 'ALLOWED', targetState: 'awaiting_input' },
    { action: 'replan', allowed: true, reasonCode: 'ALLOWED', targetState: 'planning' },
    { action: 'steer', allowed: true, reasonCode: 'ALLOWED', targetState: 'executing' },
  ],
})
const finalTourApprovals = [
  {
    ...approvalFixture('approval-pending', 'pending', 'Final tour approval', finalTourSession.id),
    rationale_summary: 'Confirm the deterministic final product tour.',
  },
  {
    ...approvalFixture('approval-rejected', 'rejected', 'Rejected final tour approval', finalTourSession.id),
    rationale_summary: 'Historical rejected decision for the final tour.',
  },
]

// A small stateful fake Agent fixture used by the M6.6 human/Agent journey.
// It starts with no approvals: the test asks the fake Agent to request one,
// then the Human decision mutates the same authoritative approval record. The
// resulting activity and artifact are intentionally exposed through the same
// read routes as a real Agent Session so the E2E verifies the hand-off rather
// than only inspecting the POST response.
const approvalJourneyIds = {
  workspace: '00000000-0000-4000-8000-000000000001',
  team: '00000000-0000-4000-8000-000000000002',
  project: '00000000-0000-4000-8000-000000000003',
  workItem: '00000000-0000-4000-8000-000000000004',
  session: '00000000-0000-4000-8000-000000000005',
  agentActor: '00000000-0000-4000-8000-000000000006',
  delegation: '00000000-0000-4000-8000-000000000007',
}
const approvalJourneyAgent = {
  id: 'agent-approval-journey', workspace_id: approvalJourneyIds.workspace, actor_id: approvalJourneyIds.agentActor,
  name: 'Approval Journey Agent', slug: 'approval-journey-agent', description: 'A deterministic fake Agent for the Human decision hand-off.',
  provider: 'fixture', version: 'm6.6', supported_protocols: ['native_http'], skills: ['approval-journey'],
  requested_capabilities: ['work:read', 'work:write'], approved_capabilities: ['work:read', 'work:write'], max_concurrency: 1,
  heartbeat_interval_seconds: 30, is_active: true, revision: 1,
  team_access: [{
    agent_id: 'agent-approval-journey', team_id: approvalJourneyIds.team, approved_capabilities: ['work:read', 'work:write'], status: 'active',
    approved_by_actor_id: human.id, revision: 1, created_at: '2026-08-28T00:00:00.000Z', updated_at: fixedNow, revoked_at: null,
  }],
}
let approvalJourneySession = {
  id: approvalJourneyIds.session, agent_id: approvalJourneyAgent.id, agent_actor_id: approvalJourneyAgent.actor_id,
  principal_human_actor_id: human.id, delegation_id: approvalJourneyIds.delegation, work_item_id: approvalJourneyIds.workItem,
  state: 'awaiting_approval', state_reason: 'Waiting for the Human decision on the requested action.', revision: 1,
  current_plan_version_id: null, budget: { maxRuntimeSeconds: 600 }, last_heartbeat_at: fixedNow, retry_of_session_id: null,
  stop_requested_at: null, error_code: null, error_summary: null, created_at: fixedNow, updated_at: fixedNow,
}
const approvalJourneyWorkItem = {
  id: approvalJourneyIds.workItem, title: 'Human approval hand-off', description: 'Verify that an Agent receives an immutable Human decision and answers with evidence.',
  number: 660, revision: 1, status_id: '00000000-0000-4000-8000-000000000008', status_name: 'In Progress', status_category: 'started',
  team_id: approvalJourneyIds.team, team_key: 'M6', priority: 'high', due_date: null, responsible_human_actor_id: human.id,
  responsible_human: { actor_id: human.id, display_name: human.display_name }, active_assignment: null, active_executor: null,
  shared_reviewers: [], labels: ['approval', 'e2e'], project_id: approvalJourneyIds.project, project_name: 'M6.6 Human Attention',
  milestone_id: null, parent_id: null, surface_summary: { blocked_by_count: 0, blocking_count: 0, sub_issue_count: 0, completed_sub_issue_count: 0 },
}
const approvalJourneyProject = {
  id: approvalJourneyIds.project, team_id: approvalJourneyIds.team, name: 'M6.6 Human Attention',
  summary: 'Deterministic fake Agent approval hand-off for the M6.6 dogfood journey.',
  description: 'The fake Agent requests approval, receives a Human decision with an immutable reason, and publishes evidence for the result.',
  status: 'in_progress', lead_actor_id: human.id, target_date: null, revision: 1,
}
const approvalJourneyStates = [
  { id: '00000000-0000-4000-8000-000000000008', name: 'In Progress', category: 'started', color: '#2563eb', revision: 1 },
  { id: '00000000-0000-4000-8000-000000000009', name: 'Done', category: 'completed', color: '#16a34a', revision: 1 },
]
const approvalJourneyDefinitions = {
  approve: { id: '00000000-0000-4000-8000-000000000101', action: 'Publish the verified result', rationale: 'The Agent has produced the requested result and asks Human authority to publish it.', payloadHash: '1' },
  reject: { id: '00000000-0000-4000-8000-000000000102', action: 'Delete the unverified draft', rationale: 'The Agent asks whether the unverified draft may be removed from the workspace.', payloadHash: '2' },
  requirements: { id: '00000000-0000-4000-8000-000000000103', action: 'Apply the readability improvements', rationale: 'The Agent asks to apply the agreed Markdown and approval UX improvements.', payloadHash: '3' },
}
const approvalJourneyApproval = (kind, requestedAt = fixedNow) => {
  const definition = approvalJourneyDefinitions[kind]
  return {
    id: definition.id, workspace_id: approvalJourneyIds.workspace, session_id: approvalJourneySession.id, requested_by_actor_id: approvalJourneyAgent.actor_id,
    approval_type: 'tool', action_name: definition.action, action_payload_sanitized: { fixture: 'approval-journey', kind }, action_payload_hash: `sha256:${definition.payloadHash.repeat(64)}`,
    risk_level: 'low', rationale_summary: definition.rationale, required_approvals: 1, status: 'pending', expires_at: '2099-08-31T23:59:59.000Z',
    consumed_at: null, revision: 1, created_at: requestedAt, updated_at: requestedAt, decisions: [], quorum: { required: 1, approved: 0, rejected: 0, reached: false },
    viewer_actionability: { status: 'actionable', allowed_decisions: ['approved', 'rejected'] },
  }
}
const initialApprovalJourneyState = { approvals: [], activities: [], artifacts: [], received: [], requestCount: 0 }
let approvalJourneyApprovals = structuredClone(initialApprovalJourneyState.approvals)
let approvalJourneyActivities = structuredClone(initialApprovalJourneyState.activities)
let approvalJourneyArtifacts = structuredClone(initialApprovalJourneyState.artifacts)
let approvalJourneyReceived = structuredClone(initialApprovalJourneyState.received)
let approvalJourneyRequestCount = initialApprovalJourneyState.requestCount
const finalTourFeatures = [
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', enabled: true },
  { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta', enabled: true },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta', enabled: true },
  { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', enabled: true },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental', enabled: true },
  { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental', enabled: true },
]
const finalTourCycles = [{
  id: 'cycle-final-tour', name: 'Final tour cycle', state: 'current',
  starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-08-31T23:59:59.000Z', total_items: 2, completed_items: 0,
}]
const finalTourInitiatives = [{
  id: 'initiative-final-tour', name: 'Frontend quality', status: 'active', priority: 'high', health: 'on_track',
}]
const finalTourAutomationRules = [{
  id: 'rule-final-tour', name: 'Collect final evidence', state: 'active', revision: 2, version: 1,
  trigger: { type: 'manual' },
}]
const finalTourLoops = [{
  id: 'loop-final-tour', name: 'Visual review loop', state: 'active', revision: 2,
  next_run_at: '2026-08-23T10:00:00.000Z', no_overlap: true,
}]
const finalTourRuns = [{
  id: 'run-failed', rule_id: 'rule-final-tour', loop_id: null, session_id: finalTourSession.id,
  dry_run: false, status: 'failed', attempt_count: 2, max_attempts: 3,
  created_at: '2026-08-22T09:15:00.000Z', last_error: 'Failed deterministic final-tour run',
}]
const finalTourTemplates = [{
  id: 'template-final-tour', kind: 'work_item', name: 'Final tour Issue', status: 'active', version: 1,
}]
const finalTourUsage = {
  input_tokens: '125000',
  output_tokens: '48000',
  runtime_ms: '3675000',
  tool_calls: '73',
  unknown_cost_records: 1,
  currency_buckets: [
    { currency: 'USD', known_cost_minor: '12345', unknown_cost_records: 0 },
    { currency: 'JPY', known_cost_minor: '2345', unknown_cost_records: 0 },
    { currency: 'KWD', known_cost_minor: '34567', unknown_cost_records: 1 },
  ],
}
const largeListWorkItems = Array.from({ length: 300 }, (_, index) => {
  const ordinal = index + 1
  const padded = String(ordinal).padStart(3, '0')
  const status = states[index % states.length]
  return {
    id: `large-work-${padded}`,
    title: `Large Issue ${padded}`,
    description: `Deterministic large-list Issue ${padded}.`,
    number: 1000 + ordinal,
    revision: 1,
    status_id: status.id,
    status_name: status.name,
    status_category: status.category,
    team_id: team.id,
    team_key: team.key,
    priority: ordinal % 5 === 0 ? 'high' : 'none',
    due_date: null,
    responsible_human_actor_id: human.id,
    responsible_human: { actor_id: human.id, display_name: human.display_name },
    active_executor: null,
    shared_reviewers: [],
    labels: ordinal % 2 === 0 ? ['planning'] : ['frontend'],
    project_id: project.id,
    project_name: project.name,
    milestone_id: milestones[index % milestones.length].id,
    parent_id: null,
    surface_summary: { blocked_by_count: 0, blocking_count: 0, sub_issue_count: 0, completed_sub_issue_count: 0 },
  }
})
const largeListAgents = Array.from({ length: 300 }, (_, index) => {
  const ordinal = index + 1
  const padded = String(ordinal).padStart(3, '0')
  return {
    id: `large-agent-${padded}`,
    workspace_id: 'workspace-preview',
    actor_id: `large-agent-actor-${padded}`,
    name: `Large Agent ${padded}`,
    slug: `large-agent-${padded}`,
    description: `Deterministic large-list Agent ${padded}.`,
    provider: 'openai',
    version: '7.2.0',
    supported_protocols: ['native_http'],
    skills: ['large-list'],
    requested_capabilities: ['work:read'],
    approved_capabilities: ['work:read'],
    max_concurrency: 1,
    heartbeat_interval_seconds: 30,
    is_active: true,
    revision: 1,
    team_access: [],
  }
})
const commandAgent = {
  ...scenarioAgents[0],
  id: 'agent/command-route',
  actor_id: 'actor-agent-command-route',
  name: 'Command Orbit',
  slug: 'command-orbit',
  team_access: [],
}
const initialPreviewMutableState = structuredClone({
  guidanceCurrent,
  guidanceRevisions,
  items,
  milestones,
  relations,
})

let activeScenario = 'default'
let requestEvidence = []
let evidenceSequence = 0
let idempotencyGroups = new Map()
let nextEquivalenceGroup = 1
let idempotencyRecords = new Map()
let failedOnce = new Set()
let scenarioApprovals = structuredClone(initialScenarioApprovals)
let currentScenarioAgents = structuredClone(scenarioAgents)
let currentScenarioTeams = structuredClone(scenarioTeams)
let currentScenarioStates = structuredClone(scenarioStates)
let failNextTeamsRefresh = false

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stableValue(nested)]))
  return value
}
const requestIdentity = (request, path, body) => JSON.stringify({ method: request.method, path, body: stableValue(body) })
const idempotencyKey = request => {
  const value = request.headers['idempotency-key']
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}
const groupForRequest = request => {
  const key = idempotencyKey(request)
  if (!key) return null
  const known = idempotencyGroups.get(key)
  if (known) return known
  const created = nextEquivalenceGroup
  nextEquivalenceGroup += 1
  idempotencyGroups.set(key, created)
  return created
}
const resetScenario = scenario => {
  activeScenario = scenario
  requestEvidence = []
  evidenceSequence = 0
  idempotencyGroups = new Map()
  nextEquivalenceGroup = 1
  idempotencyRecords = new Map()
  failedOnce = new Set()
  scenarioApprovals = structuredClone(initialScenarioApprovals)
  approvalJourneyApprovals = structuredClone(initialApprovalJourneyState.approvals)
  approvalJourneyActivities = structuredClone(initialApprovalJourneyState.activities)
  approvalJourneyArtifacts = structuredClone(initialApprovalJourneyState.artifacts)
  approvalJourneyReceived = structuredClone(initialApprovalJourneyState.received)
  approvalJourneyRequestCount = initialApprovalJourneyState.requestCount
  currentScenarioAgents = structuredClone(scenarioAgents)
  currentScenarioTeams = structuredClone(scenarioTeams)
  currentScenarioStates = structuredClone(scenarioStates)
  failNextTeamsRefresh = false
  milestones = structuredClone(initialPreviewMutableState.milestones)
  relations = structuredClone(initialPreviewMutableState.relations)
  guidanceRevisions = structuredClone(initialPreviewMutableState.guidanceRevisions)
  guidanceCurrent = structuredClone(initialPreviewMutableState.guidanceCurrent)
  items.forEach((item, index) => {
    for (const key of Object.keys(item)) Reflect.deleteProperty(item, key)
    Object.assign(item, structuredClone(initialPreviewMutableState.items[index]))
  })
}
const beginRequestEvidence = (request, url, response) => {
  if (request.method === 'OPTIONS') return
  const entry = {
    sequence: evidenceSequence,
    method: request.method ?? 'GET',
    path: url.pathname,
    status: 0,
    outcome: 'pending',
    cursor: url.searchParams.get('cursor'),
    limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : null,
    hasIdempotencyKey: idempotencyKey(request) !== null,
    equivalenceGroup: groupForRequest(request),
  }
  evidenceSequence += 1
  requestEvidence.push(entry)
  response.once('finish', () => {
    entry.status = response.statusCode
    entry.outcome = 'completed'
  })
  response.once('close', () => {
    if (entry.outcome === 'pending') entry.outcome = 'client_aborted'
  })
}
const requestLedger = () => {
  const groupCounts = new Map()
  for (const entry of requestEvidence) {
    if (entry.equivalenceGroup === null) continue
    groupCounts.set(entry.equivalenceGroup, (groupCounts.get(entry.equivalenceGroup) ?? 0) + 1)
  }
  const committed = new Map()
  for (const record of idempotencyRecords.values()) committed.set(record.group, record.commitCount)
  return {
    scenario: activeScenario,
    count: requestEvidence.length,
    requests: [...requestEvidence]
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ sequence: _sequence, ...entry }) => entry),
    equivalenceGroups: [...groupCounts.entries()]
      .map(([group, requestCount]) => ({ group, requestCount, commitCount: committed.get(group) ?? 0 }))
      .sort((left, right) => left.group - right.group),
  }
}

const readBody = request => new Promise(resolve => {
  let raw = ''
  request.setEncoding('utf8')
  request.on('data', chunk => { raw += chunk })
  request.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
})
const send = (response, payload, status = 200) => {
  response.writeHead(status, cors)
  response.end(status === 204 ? undefined : JSON.stringify(payload))
}
const page = items => ({ items, nextCursor: null })

const sendIdempotent = async ({ request, response, path, commit, shouldFailOnce = false, shouldAlwaysFail = false }) => {
  const body = await readBody(request)
  const key = idempotencyKey(request)
  const group = groupForRequest(request)
  if (!key || group === null) return send(response, {
    error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'An Idempotency-Key is required.' },
  }, 400)
  const identity = requestIdentity(request, path, body)
  const existing = idempotencyRecords.get(key)
  if (existing) {
    if (existing.identity !== identity) return send(response, {
      error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'The idempotency key was reused for a different request.' },
    }, 409)
    return send(response, existing.payload, existing.status)
  }
  const failureIdentity = `${group}:${path}`
  if (shouldAlwaysFail) return send(response, {
    error: { code: 'FIXTURE_FAILURE', message: 'The deterministic fixture keeps this mutation uncommitted.' },
  }, 503)
  if (shouldFailOnce && !failedOnce.has(failureIdentity)) {
    failedOnce.add(failureIdentity)
    return send(response, {
      error: { code: 'FIXTURE_RETRY', message: 'The deterministic first attempt was interrupted. Retry the same action.' },
    }, 503)
  }
  const result = await commit(body)
  const record = { group, identity, payload: result.payload, status: result.status ?? 200, commitCount: 1 }
  idempotencyRecords.set(key, record)
  return send(response, record.payload, record.status)
}

const parseIfMatchRevision = request => {
  const header = request.headers['if-match']
  const value = Array.isArray(header) ? header[0] : header
  const match = /^"revision-(\d+)"$/.exec(value ?? '')
  return match ? Number(match[1]) : null
}

const approvalDecisionValidation = (body, request, selected) => {
  if (!body || typeof body !== 'object' || (body.decision !== 'approved' && body.decision !== 'rejected')) {
    return { status: 422, payload: { error: { code: 'INVALID_APPROVAL_DECISION', message: 'Decision must be approved or rejected.' } } }
  }
  if (typeof body.reason !== 'string' || !body.reason.trim()) {
    return { status: 422, payload: { error: { code: 'APPROVAL_REASON_REQUIRED', message: 'A non-empty approval decision reason is required.' } } }
  }
  const revision = parseIfMatchRevision(request)
  if (revision === null) {
    return { status: 428, payload: { error: { code: 'IF_MATCH_REQUIRED', message: 'If-Match must contain the current approval revision.' } } }
  }
  if (selected && revision !== selected.revision) {
    return { status: 412, payload: { error: { code: 'STALE_REVISION', message: 'The approval revision is stale. Refresh before deciding.' } } }
  }
  return null
}

const finalTourCollectionRoutes = new Map([
  ['/api/v1/cycles', finalTourCycles],
  ['/api/v1/initiatives', finalTourInitiatives],
  ['/api/v1/automation-rules', finalTourAutomationRules],
  ['/api/v1/loops', finalTourLoops],
  ['/api/v1/automation-runs', finalTourRuns],
  ['/api/v1/templates', finalTourTemplates],
  ['/api/v1/views', []],
  ['/api/v1/agent-connections', []],
  ['/api/v1/artifacts', []],
  ['/api/v1/handoffs', []],
  ['/api/v1/leases', []],
  ['/api/v1/inbox', []],
  ['/api/v1/delegations', []],
  ['/api/v1/messages', []],
  ['/api/v1/agent-messages', []],
])

const approvalJourneyUuid = ordinal => `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`
const approvalJourneyAttentionItem = approval => ({
  projectionVersion: 1,
  id: `v1:approval:${approval.id}`,
  kind: 'approval',
  status: 'open',
  workspaceId: approvalJourneyIds.workspace,
  teamId: approvalJourneyIds.team,
  projectId: approvalJourneyIds.project,
  workItemId: approvalJourneyIds.workItem,
  sessionId: approvalJourneySession.id,
  planVersionId: null,
  planStepId: null,
  title: approval.action_name,
  summary: approval.rationale_summary,
  summaryDerived: true,
  reasonCodes: ['approval.response_required'],
  severity: approval.risk_level,
  urgency: 'immediate',
  requestedBy: { id: approval.requested_by_actor_id, kind: 'agent', displayName: approvalJourneyAgent.name },
  responsibleHuman: { id: human.id, kind: 'human', displayName: human.display_name },
  options: [
    { id: 'approve', label: 'Approve', command: 'decideApproval', method: 'POST', path: `/api/v1/approvals/${approval.id}/decide`, targetRevision: approval.revision, requiredCapabilities: ['work:write'], requiredActorKinds: ['human'], requiresApproval: false },
    { id: 'reject', label: 'Reject', command: 'decideApproval', method: 'POST', path: `/api/v1/approvals/${approval.id}/decide`, targetRevision: approval.revision, requiredCapabilities: ['work:write'], requiredActorKinds: ['human'], requiresApproval: false },
  ],
  recommendedOptionId: 'approve',
  audience: { relationship: 'assigned_to_me', canRespond: true },
  response: { workflow: 'approval', requiresReason: false, requiresMessage: false, choices: [], expectedStatus: 'decided' },
  bulk: { eligible: true, compatibilityKey: `approval-journey:${approval.action_payload_hash}`, prohibitedReason: null, revalidateIndividually: true },
  impactSummary: 'The fake Agent remains paused until this Human decision is recorded.',
  affectedResources: [{ type: 'work_item', id: approvalJourneyIds.workItem, label: 'M6.6 Human approval hand-off' }],
  evidence: [],
  expiresAt: approval.expires_at,
  sourceRevision: approval.revision,
  source: { type: 'approval', id: approval.id, status: approval.status },
  freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: approval.updated_at },
  correlationId: `approval-journey:${approval.id}`,
  createdAt: approval.created_at,
  updatedAt: approval.updated_at,
})

const recordApprovalJourneyDecision = (approval, decision, reason) => {
  const ordinal = approvalJourneyReceived.length + 1
  const decidedAt = fixedNow
  const decisionRecord = {
    actor_id: human.id, decision, reason, source: 'human', policy_workspace_id: null, policy_revision: null, decided_at: decidedAt,
  }
  const artifact = {
    id: approvalJourneyUuid(500 + ordinal), session_id: approvalJourneySession.id, work_item_id: approvalJourneyIds.workItem,
    type: 'test_report', title: `Evidence for ${approval.action_name}`, uri: `https://example.test/workmesh/evidence/${approval.id}`,
    source_tool: 'fake-agent', created_at: decidedAt,
  }
  const resultSummary = decision === 'approved'
    ? `The Agent applied the Human approval for “${approval.action_name}” and published the verified result.`
    : `The Agent recorded the Human rejection for “${approval.action_name}” and retained the draft for review.`
  const activityStart = 600 + ordinal * 2
  const receivedActivity = {
    id: approvalJourneyUuid(activityStart), session_id: approvalJourneySession.id, actor_id: approvalJourneyAgent.actor_id,
    sequence: approvalJourneyActivities.length + 1, kind: 'message',
    summary: `Agent received Human ${decision} decision for ${approval.action_name}.`,
    details_markdown: `## Decision received\n\n**Decision:** ${decision}\n\n**Immutable reason:** ${reason}\n\nThe Agent received this Human decision from WorkMesh and will not mutate the recorded reason.`,
    artifact_ids: [], ephemeral: false, created_at: decidedAt,
  }
  const resultActivity = {
    id: approvalJourneyUuid(activityStart + 1), session_id: approvalJourneySession.id, actor_id: approvalJourneyAgent.actor_id,
    sequence: approvalJourneyActivities.length + 2, kind: 'completion', summary: resultSummary,
    details_markdown: `## Result summary\n\n${resultSummary}\n\n**Decision reason:** ${reason}\n\n**Evidence:** ${artifact.title}`,
    artifact_ids: [artifact.id], ephemeral: false, created_at: decidedAt,
  }
  approvalJourneyArtifacts = [...approvalJourneyArtifacts, artifact]
  approvalJourneyActivities = [...approvalJourneyActivities, receivedActivity, resultActivity]
  approvalJourneyReceived = [...approvalJourneyReceived, {
    approvalId: approval.id, decision, reason, immutable: true, resultSummary, artifactId: artifact.id, receivedAt: decidedAt,
  }]
  approvalJourneySession = {
    ...approvalJourneySession,
    state: 'executing',
    state_reason: `Agent incorporated the Human ${decision} decision and published result evidence.`,
    revision: approvalJourneySession.revision + 1,
    updated_at: decidedAt,
  }
  return { decisionRecord, artifact, resultSummary }
}

// Project the fake Agent hand-off into the same human-visible run explanation
// used by the real Session page. The activity/artifact endpoints remain the
// append-only source fixtures, while this projection lets the dogfood journey
// verify that an immutable reason and its evidence are visible in the causal
// timeline rather than only in a test-only state endpoint.
const approvalJourneyRunExplanation = () => {
  const base = runExplanationFixture({
    selectedSession: approvalJourneySession,
    selectedAgent: approvalJourneyAgent,
    selectedWorkItem: approvalJourneyWorkItem,
    selectedProject: approvalJourneyProject,
  })
  const groups = approvalJourneyReceived.map((received, index) => {
    const approval = approvalJourneyApprovals.find(candidate => candidate.id === received.approvalId)
    const receivedActivity = approvalJourneyActivities.find(activity => activity.id === approvalJourneyUuid(602 + index * 2))
    const resultActivity = approvalJourneyActivities.find(activity => activity.id === approvalJourneyUuid(603 + index * 2))
    const artifact = approvalJourneyArtifacts.find(candidate => candidate.id === received.artifactId)
    const groupId = `approval-journey-group:${received.approvalId}`
    const startedAt = receivedActivity?.created_at ?? received.receivedAt
    const endedAt = resultActivity?.created_at ?? received.receivedAt
    const sourceActivityId = receivedActivity?.id ?? resultActivity?.id ?? approvalJourneyUuid(602 + index * 2)
    const evidence = artifact ? [{ type: artifact.type, id: artifact.id, title: artifact.title, uri: artifact.uri }] : []
    return {
      id: groupId,
      kind: 'agent_decision_response',
      phase: 'completion',
      actionType: 'approval',
      summary: `Result summary: ${received.resultSummary} Decision reason: ${received.reason}`,
      trigger: { kind: 'approval_decision', summary: `Human ${received.decision} decision received for ${approval?.action_name ?? received.approvalId}.`, sourceActivityId },
      actor: { id: approvalJourneyAgent.actor_id, kind: 'agent', displayName: approvalJourneyAgent.name },
      planVersionId: null,
      planStepId: null,
      risk: approval?.risk_level ?? 'low',
      count: 1,
      firstSequence: receivedActivity?.sequence ?? index + 1,
      lastSequence: resultActivity?.sequence ?? receivedActivity?.sequence ?? index + 1,
      sourceActivityIds: [receivedActivity?.id, resultActivity?.id].filter(Boolean),
      affectedResources: [
        { type: 'approval', id: received.approvalId, label: approval?.action_name ?? received.approvalId },
        { type: 'work_item', id: approvalJourneyIds.workItem, label: approvalJourneyWorkItem.title },
      ],
      evidence,
      validation: { state: 'verified', summary: 'The Agent responded with the immutable decision reason and evidence.' },
      startedAt,
      endedAt,
      durationMs: 0,
      collapsed: false,
      material: true,
      failure: false,
      attention: false,
      technicalRecords: [],
    }
  })
  const evidenceDetails = approvalJourneyArtifacts.map((artifact, index) => {
    const receipt = approvalJourneyReceived.find(candidate => candidate.artifactId === artifact.id)
    return {
      type: artifact.type,
      id: artifact.id,
      title: artifact.title,
      uri: artifact.uri,
      checksum: `sha256:${String(index + 1).repeat(64)}`,
      sourceTool: artifact.source_tool,
      createdAt: artifact.created_at,
      planStepId: null,
      causalGroupIds: receipt ? [`approval-journey-group:${receipt.approvalId}`] : [],
      validationState: 'verified',
      repository: null,
    }
  })
  return {
    ...base,
    session: { ...base.session, stateReason: approvalJourneySession.state_reason, revision: approvalJourneySession.revision, updatedAt: approvalJourneySession.updated_at },
    project: { id: approvalJourneyProject.id, name: approvalJourneyProject.name, revision: approvalJourneyProject.revision },
    workItem: { id: approvalJourneyWorkItem.id, title: approvalJourneyWorkItem.title, revision: approvalJourneyWorkItem.revision },
    causalGroups: groups,
    pendingAttention: approvalJourneyApprovals.filter(approval => approval.status === 'pending').map(approvalJourneyAttentionItem),
    changes: [
      { type: 'agent_session', id: approvalJourneySession.id, revision: approvalJourneySession.revision },
      ...approvalJourneyArtifacts.map(artifact => ({ type: 'artifact', id: artifact.id, label: artifact.title })),
    ],
    evidence: evidenceDetails.map(({ checksum: _checksum, sourceTool: _sourceTool, createdAt: _createdAt, planStepId: _planStepId, causalGroupIds: _causalGroupIds, validationState: _validationState, repository: _repository, ...reference }) => reference),
    evidenceDetails,
    verification: approvalJourneyArtifacts.length > 0
      ? { state: 'verified', summary: 'The Agent responded to each Human decision with result evidence.' }
      : { state: 'pending', summary: 'The Agent is waiting for a Human decision.' },
    health: { ...base.health, pendingApprovalCount: approvalJourneyApprovals.filter(approval => approval.status === 'pending').length },
    freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: approvalJourneySession.updated_at },
  }
}

const handleApprovalJourneyRoute = async (request, response, url) => {
  const path = url.pathname
  const method = request.method ?? 'GET'

  if (method === 'GET' && path === '/api/v1/install-status') { send(response, { installed: true }); return true }
  if (method === 'GET' && path === '/api/v1/auth/me') {
    send(response, {
      actor: { ...human, kind: 'human', workspace_id: approvalJourneyIds.workspace, workspace_role: 'admin' }, csrfToken: 'approval-journey-csrf',
    })
    return true
  }
  if (method === 'GET' && path === '/api/v1/features') { send(response, { features: [] }); return true }
  if (method === 'GET' && path === '/api/v1/info') { send(response, { serverVersion: '1.29.0-approval-journey', buildSha: 'approval-journey-fixture', schemaBaseline: 24 }); return true }
  if (method === 'GET' && path === '/api/v1/events/stream') { send(response, undefined, 204); return true }
  if (method === 'GET' && path === '/mcp') { send(response, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Installation Token required.' } }, 401); return true }

  if (method === 'POST' && path === '/__test/agent/request-approval') {
    const body = await readBody(request)
    const kind = typeof body.kind === 'string' ? body.kind : ''
    if (!Object.prototype.hasOwnProperty.call(approvalJourneyDefinitions, kind)) {
      send(response, { error: { code: 'INVALID_APPROVAL_KIND', message: 'Use approve, reject, or requirements.' } }, 422)
      return true
    }
    const approval = approvalJourneyApproval(kind, fixedNow)
    approvalJourneyApprovals = [...approvalJourneyApprovals, approval]
    approvalJourneyRequestCount += 1
    approvalJourneySession = { ...approvalJourneySession, state: 'awaiting_approval', state_reason: `Agent requested Human approval for ${approval.action_name}.`, updated_at: fixedNow }
    approvalJourneyActivities = [...approvalJourneyActivities, {
      id: approvalJourneyUuid(300 + approvalJourneyRequestCount), session_id: approvalJourneySession.id, actor_id: approvalJourneyAgent.actor_id,
      sequence: approvalJourneyActivities.length + 1, kind: 'decision_request', summary: `Agent requested approval: ${approval.action_name}.`,
      details_markdown: `## Approval requested\n\nThe Agent requests Human authorization for **${approval.action_name}**.`, artifact_ids: [], ephemeral: false, created_at: fixedNow,
    }]
    send(response, { approval: structuredClone(approval), session: structuredClone(approvalJourneySession) })
    return true
  }
  if (method === 'GET' && path === '/__test/agent/state') {
    send(response, { session: approvalJourneySession, approvals: approvalJourneyApprovals, received: approvalJourneyReceived, activities: approvalJourneyActivities, artifacts: approvalJourneyArtifacts })
    return true
  }

  if (method === 'GET' && path === '/api/v1/teams') { send(response, page([{ id: approvalJourneyIds.team, name: 'M6.6 Human Attention', key: 'M6', revision: 1 }])); return true }
  if (method === 'GET' && path === `/api/v1/teams/${approvalJourneyIds.team}/states`) { send(response, page(approvalJourneyStates)); return true }
  if (method === 'GET' && path === '/api/v1/actors/humans') { send(response, page([human])); return true }
  if (method === 'GET' && path === '/api/v1/agents') { send(response, page([approvalJourneyAgent])); return true }
  if (method === 'GET' && path === `/api/v1/agents/${approvalJourneyAgent.id}`) { send(response, approvalJourneyAgent); return true }
  if (method === 'GET' && path === '/api/v1/agent-sessions') { send(response, page([approvalJourneySession])); return true }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${approvalJourneySession.id}`) { send(response, approvalJourneySession); return true }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${approvalJourneySession.id}/explanation`) { send(response, approvalJourneyRunExplanation()); return true }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${approvalJourneySession.id}/plans`) { send(response, page([])); return true }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${approvalJourneySession.id}/activities`) { send(response, page(approvalJourneyActivities)); return true }
  if (method === 'GET' && path === '/api/v1/artifacts') { send(response, page(approvalJourneyArtifacts.filter(artifact => !url.searchParams.get('sessionId') || artifact.session_id === url.searchParams.get('sessionId')))); return true }
  if (method === 'GET' && path === '/api/v1/projects') { send(response, page([approvalJourneyProject])); return true }
  if (method === 'GET' && path === `/api/v1/projects/${approvalJourneyIds.project}`) { send(response, approvalJourneyProject); return true }
  if (method === 'GET' && path === `/api/v1/projects/${approvalJourneyIds.project}/control-center`) {
    const empty = page([])
    send(response, {
      projectionVersion: 1,
      scope: { workspaceId: approvalJourneyIds.workspace, projectId: approvalJourneyProject.id },
      project: { id: approvalJourneyProject.id, name: approvalJourneyProject.name, status: approvalJourneyProject.status, targetDate: null, responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' }, revision: approvalJourneyProject.revision },
      revision: approvalJourneyProject.revision,
      freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: fixedNow },
      collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
    })
    return true
  }
  if (method === 'GET' && path === `/api/v1/projects/${approvalJourneyIds.project}/milestones`) { send(response, page([])); return true }
  if (method === 'GET' && path === `/api/v1/projects/${approvalJourneyIds.project}/delivery`) {
    send(response, {
    milestones: [], updates: [], artifacts: approvalJourneyArtifacts, dependencies: [], completionSuggestions: [],
    providerPullRequests: [], providerReviews: [], workMeshStructuredReviews: [], mergeApprovals: [],
    })
    return true
  }
  if (method === 'GET' && path === '/api/v1/views') { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/inbox') { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/agent-connections') { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/approval-autonomy-policy') {
    send(response, {
    workspace_id: approvalJourneyIds.workspace, mode: 'human_required', excluded_project_ids: [], revision: 1,
    updated_by_actor_id: human.id, created_at: fixedNow, updated_at: fixedNow, reconciliation: null,
    })
    return true
  }
  if (method === 'GET' && path === '/api/v1/browser-push/config') { send(response, { configured: false, public_key: null }); return true }
  if (method === 'GET' && path === '/api/v1/browser-push/subscriptions') { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/notifications') { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/notification-preferences') { send(response, { email_enabled: false, browser_push_enabled: false }); return true }

  if (method === 'GET' && path === '/api/v1/approvals') {
    const sessionId = url.searchParams.get('sessionId')
    const status = url.searchParams.get('status')
    const history = url.searchParams.get('view') === 'history'
    const visible = approvalJourneyApprovals.filter(approval => (
      (!sessionId || approval.session_id === sessionId)
      && (history ? approval.status !== 'pending' && (!status || approval.status === status) : (!status || approval.status === status))
    ))
    send(response, page(visible.map(approval => structuredClone(approval))))
    return true
  }
  const approvalGetMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)$/)
  if (method === 'GET' && approvalGetMatch) {
    const selected = approvalJourneyApprovals.find(approval => approval.id === decodeURIComponent(approvalGetMatch[1]))
    send(response, selected ? structuredClone(selected) : { error: { code: 'NOT_FOUND', message: 'Approval not found.' } }, selected ? 200 : 404)
    return true
  }
  const approvalDecisionMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)\/decide$/)
  if (method === 'POST' && approvalDecisionMatch) {
    const approvalId = decodeURIComponent(approvalDecisionMatch[1])
    await sendIdempotent({
      request, response, path,
      commit: async body => {
        await new Promise(resolve => setTimeout(resolve, 350))
        const selected = approvalJourneyApprovals.find(approval => approval.id === approvalId)
        if (!selected) return { status: 404, payload: { error: { code: 'NOT_FOUND', message: 'Approval not found.' } } }
        const validation = approvalDecisionValidation(body, request, selected)
        if (validation) return validation
        if (selected.status !== 'pending') return { status: 409, payload: { error: { code: 'APPROVAL_ALREADY_DECIDED', message: 'This approval has already been decided.' } } }
        const decision = body.decision
        const reason = body.reason.trim()
        const recorded = recordApprovalJourneyDecision(selected, decision, reason)
        Object.assign(selected, {
          status: decision, revision: selected.revision + 1, updated_at: fixedNow, decisions: [recorded.decisionRecord],
          quorum: { required: 1, approved: decision === 'approved' ? 1 : 0, rejected: decision === 'rejected' ? 1 : 0, reached: true },
          viewer_actionability: { status: 'blocked', reason: 'already_decided' },
        })
        return {
          payload: { approval: structuredClone(selected), decision: recorded.decisionRecord, quorum: selected.quorum, status: decision, resultSummary: recorded.resultSummary },
        }
      },
    })
    return true
  }

  if (method === 'GET' && path === '/api/v1/human-attention') {
    const status = url.searchParams.get('status')
    const workItemId = url.searchParams.get('workItemId')
    const visible = approvalJourneyApprovals.filter(approval => approval.status === 'pending' && (!workItemId || workItemId === approvalJourneyIds.workItem))
    send(response, page(status === 'history' || url.searchParams.get('view') === 'history' ? [] : visible.map(approvalJourneyAttentionItem)))
    return true
  }
  const attentionMatch = path.match(/^\/api\/v1\/human-attention\/([^/]+)$/)
  if (method === 'GET' && attentionMatch) {
    const selected = approvalJourneyApprovals.find(approval => `v1:approval:${approval.id}` === decodeURIComponent(attentionMatch[1]))
    send(response, selected && selected.status === 'pending' ? approvalJourneyAttentionItem(selected) : { error: { code: 'NOT_FOUND', message: 'Attention item not found.' } }, selected && selected.status === 'pending' ? 200 : 404)
    return true
  }
  if (method === 'GET' && path === '/api/v1/work-items') { send(response, page([approvalJourneyWorkItem])); return true }
  if (method === 'GET' && path === `/api/v1/work-items/${approvalJourneyIds.workItem}`) { send(response, approvalJourneyWorkItem); return true }
  if (method === 'GET' && new RegExp(`^/api/v1/work-items/${approvalJourneyIds.workItem}/(?:comments|relations)$`).test(path)) { send(response, page([])); return true }
  if (method === 'GET' && path === '/api/v1/rooms') { send(response, page([])); return true }
  if (method === 'GET' && /^\/api\/v1\/rooms\/[^/]+\/timeline$/.test(path)) { send(response, page([])); return true }
  if (method === 'GET' && path === `/api/v1/work-items/${approvalJourneyIds.workItem}/execution-summary`) {
    send(response, {
    projectionVersion: 1, workItem: { id: approvalJourneyWorkItem.id, title: approvalJourneyWorkItem.title, revision: approvalJourneyWorkItem.revision, status: approvalJourneyWorkItem.status_name },
    activeRuns: [{ id: approvalJourneySession.id, kind: 'run', title: approvalJourneyAgent.name, summary: approvalJourneySession.state_reason, projectId: approvalJourneyIds.project, workItemId: approvalJourneyWorkItem.id, sessionId: approvalJourneySession.id, state: approvalJourneySession.state, revision: approvalJourneySession.revision, source: { type: 'agent_session', id: approvalJourneySession.id, revision: approvalJourneySession.revision }, responsibleHuman: { id: human.id, kind: 'human', displayName: human.display_name }, activeAgent: { id: approvalJourneyAgent.actor_id, kind: 'agent', displayName: approvalJourneyAgent.name }, workItem: { id: approvalJourneyWorkItem.id, title: approvalJourneyWorkItem.title }, currentStep: null, health: { heartbeat: 'healthy', lastHeartbeatAt: approvalJourneySession.last_heartbeat_at }, lastActivity: approvalJourneyActivities.at(-1) ?? null, pendingHumanActionCount: approvalJourneyApprovals.filter(approval => approval.status === 'pending').length, evidenceCount: approvalJourneyArtifacts.length, verified: approvalJourneyArtifacts.length > 0, updatedAt: approvalJourneySession.updated_at }],
    recentRuns: [], evidence: approvalJourneyArtifacts, freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: approvalJourneySession.updated_at },
    })
    return true
  }
  send(response, { error: { code: 'UNEXPECTED_APPROVAL_JOURNEY_REQUEST', message: `Approval-journey route not found: ${method} ${path}` } }, 500)
  return true
}

const handleFinalTourRoute = (request, response, url) => {
  const path = url.pathname
  const method = request.method ?? 'GET'
  const apiOrigin = `http://127.0.0.1:${port}`

  if (method === 'GET' && path === '/api/v1/install-status') {
    send(response, { installed: true })
    return true
  }
  if (method === 'GET' && path === '/api/v1/auth/me') {
    send(response, {
      actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' },
      csrfToken: 'preview-csrf',
    })
    return true
  }
  if (method === 'GET' && path === '/api/v1/features') {
    send(response, { features: finalTourFeatures })
    return true
  }
  if (method === 'GET' && path === '/api/v1/info') {
    send(response, {
      serverVersion: '1.29.0-final-tour',
      buildSha: 'final-tour-preview',
      schemaBaseline: 24,
      preferredClientProfileVersion: '1.0',
      supportedClientProfileVersions: ['1.0'],
      mcpVersion: '1.29.0',
    })
    return true
  }
  if (method === 'GET' && path === '/.well-known/workmesh-agent') {
    send(response, {
      protocolVersion: 'v1',
      mcpUrl: `${apiOrigin}/mcp`,
      wellKnownUrl: `${apiOrigin}/.well-known/workmesh-agent`,
      apiVersion: 'v1',
      supportedClients: ['opencode', 'generic_mcp'],
      skill: {
        name: 'workmesh',
        version: '1.1.0',
        sha256: `sha256:${'a'.repeat(64)}`,
        signature: 'ed25519:final-tour-fixture-signature',
      },
    })
    return true
  }
  if (method === 'GET' && path === '/mcp') {
    send(response, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'Installation Token required.' } }, 401)
    return true
  }
  if (method === 'GET' && path === '/api/v1/events/stream') {
    send(response, undefined, 204)
    return true
  }

  if (method === 'GET' && path === '/api/v1/teams') {
    const cursor = url.searchParams.get('cursor')
    if (cursor === null) {
      send(response, { items: finalTourTeamsPageOne, nextCursor: 'teams-p2' })
      return true
    }
    if (cursor === 'teams-p2') {
      send(response, page([finalTourTeamPageTwo]))
      return true
    }
    send(response, { error: { code: 'FINAL_TOUR_CURSOR_INVALID', message: 'Unknown final-tour Team cursor.' } }, 422)
    return true
  }
  const finalTourStatesMatch = path.match(/^\/api\/v1\/teams\/([^/]+)\/states$/)
  if (method === 'GET' && finalTourStatesMatch) {
    const selectedTeamId = decodeURIComponent(finalTourStatesMatch[1])
    const knownTeam = [...finalTourTeamsPageOne, finalTourTeamPageTwo].some(candidate => candidate.id === selectedTeamId)
    send(response, knownTeam ? page(finalTourStates) : page([]))
    return true
  }
  if (method === 'GET' && path === '/api/v1/actors/humans') {
    send(response, page([human]))
    return true
  }

  if (method === 'GET' && path === '/api/v1/projects') {
    send(response, page([finalTourProject]))
    return true
  }
  if (method === 'GET' && path === `/api/v1/projects/${finalTourProject.id}`) {
    send(response, finalTourProject)
    return true
  }
  if (method === 'GET' && path === `/api/v1/projects/${finalTourProject.id}/control-center`) {
    const empty = page([])
    send(response, {
      projectionVersion: 1,
      scope: { workspaceId: 'workspace-preview', projectId: finalTourProject.id },
      project: {
        id: finalTourProject.id,
        name: finalTourProject.name,
        status: finalTourProject.status,
        targetDate: finalTourProject.target_date,
        responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' },
        revision: finalTourProject.revision,
      },
      revision: finalTourProject.revision,
      freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: fixedNow },
      collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
    })
    return true
  }
  if (method === 'GET' && path === `/api/v1/projects/${finalTourProject.id}/milestones`) {
    send(response, page([finalTourMilestone]))
    return true
  }
  if (method === 'GET' && path === `/api/v1/projects/${finalTourProject.id}/delivery`) {
    send(response, {
      milestones: [{
        id: finalTourMilestone.id,
        name: finalTourMilestone.name,
        total: finalTourWorkItems.length,
        completed: 0,
        target_date: finalTourMilestone.target_date,
      }],
      updates: [{
        id: 'update-final-tour', health: 'on_track', body: 'Final frontend tour is ready for local verification.',
        status: 'published', created_at: fixedNow,
      }],
      artifacts: [],
      dependencies: [],
      completionSuggestions: [],
      providerPullRequests: [],
      providerReviews: [],
      workMeshStructuredReviews: [],
      mergeApprovals: [],
    })
    return true
  }

  if (method === 'GET' && path === '/api/v1/agents') {
    send(response, page(finalTourAgents))
    return true
  }
  const finalTourAgentMatch = path.match(/^\/api\/v1\/agents\/([^/]+)$/)
  if (method === 'GET' && finalTourAgentMatch) {
    const agentId = decodeURIComponent(finalTourAgentMatch[1])
    const selected = finalTourAgents.find(candidate => candidate.id === agentId)
    send(response, selected ?? { error: { code: 'NOT_FOUND', message: 'Agent not found.' } }, selected ? 200 : 404)
    return true
  }

  if (method === 'GET' && path === '/api/v1/agent-sessions') {
    const workItemId = url.searchParams.get('workItemId')
    send(response, page(workItemId === null || workItemId === finalTourSession.work_item_id ? [finalTourSession] : []))
    return true
  }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${finalTourSession.id}`) {
    send(response, finalTourSession)
    return true
  }
  if (method === 'GET' && path === `/api/v1/agent-sessions/${finalTourSession.id}/explanation`) {
    send(response, runExplanationFixture({
      selectedSession: finalTourSession,
      selectedAgent: finalTourAgents[0],
      selectedWorkItem: finalTourWorkItems[0],
      selectedProject: finalTourProject,
    }))
    return true
  }
  if (method === 'GET' && (
    path === `/api/v1/agent-sessions/${finalTourSession.id}/activities`
    || path === `/api/v1/agent-sessions/${finalTourSession.id}/plans`
  )) {
    send(response, page([]))
    return true
  }
  if (method === 'GET' && path === '/api/v1/approvals') {
    const sessionId = url.searchParams.get('sessionId')
    const status = url.searchParams.get('status')
    const visible = finalTourApprovals.filter(approval => (
      (!sessionId || approval.session_id === sessionId)
      && (!status || approval.status === status)
    ))
    send(response, page(visible))
    return true
  }

  if (method === 'GET' && path === '/api/v1/work-items') {
    send(response, page(finalTourWorkItems.filter(item => matchesPreviewWorkItem(item, url.searchParams))))
    return true
  }
  const finalTourExecutionSummaryMatch = path.match(/^\/api\/v1\/work-items\/([^/]+)\/execution-summary$/)
  if (method === 'GET' && finalTourExecutionSummaryMatch) {
    const workItemId = decodeURIComponent(finalTourExecutionSummaryMatch[1])
    const selected = finalTourWorkItems.find(candidate => candidate.id === workItemId)
    if (!selected) send(response, { error: { code: 'NOT_FOUND', message: 'Work Item not found.' } }, 404)
    else send(response, {
      projectionVersion: 1,
      workItem: { id: selected.id, title: selected.title, revision: selected.revision, status: selected.status_name },
      activeRuns: selected.id === finalTourSession.work_item_id ? [{
        id: finalTourSession.id,
        kind: 'run',
        title: finalTourAgents[0].name,
        summary: finalTourSession.state_reason,
        projectId: finalTourProject.id,
        workItemId: selected.id,
        sessionId: finalTourSession.id,
        state: finalTourSession.state,
        revision: finalTourSession.revision,
        source: { type: 'agent_session', id: finalTourSession.id, revision: finalTourSession.revision },
        responsibleHuman: { id: human.id, kind: 'human', displayName: human.display_name },
        activeAgent: { id: finalTourAgents[0].actor_id, kind: 'agent', displayName: finalTourAgents[0].name },
        workItem: { id: selected.id, title: selected.title },
        currentStep: null,
        health: { heartbeat: 'healthy', lastHeartbeatAt: finalTourSession.last_heartbeat_at },
        lastActivity: null,
        pendingHumanActionCount: 0,
        evidenceCount: 0,
        verified: false,
        updatedAt: finalTourSession.updated_at,
      }] : [],
      recentRuns: [],
      evidence: [],
      freshness: { state: 'current', observedAt: fixedNow, sourceUpdatedAt: fixedNow },
    })
    return true
  }
  const finalTourWorkItemMatch = path.match(/^\/api\/v1\/work-items\/([^/]+)$/)
  if (method === 'GET' && finalTourWorkItemMatch) {
    const workItemId = decodeURIComponent(finalTourWorkItemMatch[1])
    const selected = finalTourWorkItems.find(candidate => candidate.id === workItemId)
    send(response, selected ?? { error: { code: 'NOT_FOUND', message: 'Work Item not found.' } }, selected ? 200 : 404)
    return true
  }
  if (method === 'GET' && /^\/api\/v1\/work-items\/[^/]+\/(?:comments|relations)$/.test(path)) {
    send(response, page([]))
    return true
  }
  if (method === 'GET' && path === '/api/v1/human-attention') {
    send(response, page([]))
    return true
  }

  if (method === 'GET' && path === '/api/v1/rooms') {
    send(response, [])
    return true
  }
  if (method === 'GET' && /^\/api\/v1\/rooms\/[^/]+\/timeline$/.test(path)) {
    send(response, page([]))
    return true
  }
  const collection = finalTourCollectionRoutes.get(path)
  if (method === 'GET' && collection) {
    send(response, page(collection))
    return true
  }
  if (method === 'GET' && path === '/api/v1/usage-summary') {
    send(response, finalTourUsage)
    return true
  }

  send(response, {
    error: {
      code: 'UNEXPECTED_FINAL_TOUR_REQUEST',
      message: `Final-tour route not found: ${method} ${path}`,
    },
  }, 500)
  return true
}

const settingsScenarios = new Set(['settings-workspace', 'settings-delete-failure', 'settings-delete-retry'])
const handleScenarioRoute = async (request, response, url) => {
  const path = url.pathname
  const method = request.method ?? 'GET'

  if (activeScenario === 'approval-journey') return handleApprovalJourneyRoute(request, response, url)
  if (activeScenario === 'final-tour') return handleFinalTourRoute(request, response, url)

  if (activeScenario === 'large-list' && method === 'GET' && (path === '/api/v1/work-items' || path === '/api/v1/agents')) {
    if (url.searchParams.get('limit') !== '100') {
      send(response, {
        error: { code: 'LARGE_LIST_LIMIT_REQUIRED', message: 'The large-list fixture requires limit=100.' },
      }, 422)
      return true
    }
    const cursor = url.searchParams.get('cursor')
    const pageIndex = cursor === null ? 0 : cursor === 'p2' ? 1 : cursor === 'p3' ? 2 : -1
    if (pageIndex < 0) {
      send(response, {
        error: { code: 'LARGE_LIST_CURSOR_INVALID', message: 'The large-list cursor is not recognized.' },
      }, 422)
      return true
    }
    if (pageIndex === 0) await new Promise(resolve => setTimeout(resolve, 80))
    if (pageIndex === 1) await new Promise(resolve => setTimeout(resolve, 120))
    const collection = path === '/api/v1/work-items' ? largeListWorkItems : largeListAgents
    const start = pageIndex * 100
    send(response, {
      items: collection.slice(start, start + 100),
      nextCursor: pageIndex === 0 ? 'p2' : pageIndex === 1 ? 'p3' : null,
    })
    return true
  }

  if (activeScenario === 'command-center' && path === '/api/v1/features') {
    send(response, { features: [{ key: 'WORKMESH_BETA_OPERATIONS_UI', enabled: true }] })
    return true
  }
  if (settingsScenarios.has(activeScenario) && path === '/api/v1/features') {
    send(response, {
      features: [
        { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta', enabled: true },
        { key: 'WORKMESH_BETA_PLANNING', tier: 'beta', enabled: true },
      ],
    })
    return true
  }
  if (settingsScenarios.has(activeScenario) && path === '/api/v1/cycles') {
    send(response, page([{
      id: 'cycle-settings-boundary', name: 'Boundary Cycle', state: 'current',
      starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-08-31T00:00:00.000Z', total_items: 4, completed_items: 2,
    }]))
    return true
  }
  if (settingsScenarios.has(activeScenario) && path === '/api/v1/initiatives') {
    send(response, page([{
      id: 'initiative-settings-boundary', name: 'Boundary Initiative', status: 'active', priority: 'high', health: 'on_track',
    }]))
    return true
  }

  if ((activeScenario === 'agents-interactions' || activeScenario === 'command-center') && path === '/api/v1/agents') {
    const agents = activeScenario === 'command-center' ? [commandAgent] : currentScenarioAgents
    send(response, page(agents))
    return true
  }
  if ((activeScenario === 'agents-interactions' || activeScenario === 'command-center') && /^\/api\/v1\/agents\/[^/]+$/.test(path)) {
    const rawId = path.slice('/api/v1/agents/'.length)
    const decodedId = decodeURIComponent(rawId)
    const agents = activeScenario === 'command-center' ? [commandAgent] : currentScenarioAgents
    const selected = agents.find(candidate => candidate.id === decodedId)
    if (!selected) send(response, { error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
    else send(response, selected)
    return true
  }
  const teamAccessMatch = path.match(/^\/api\/v1\/agents\/([^/]+)\/team-access\/([^/]+)$/)
  if (activeScenario === 'agents-interactions' && teamAccessMatch) {
    const agentId = decodeURIComponent(teamAccessMatch[1])
    const teamId = decodeURIComponent(teamAccessMatch[2])
    const selected = currentScenarioAgents.find(candidate => candidate.id === agentId)
    if (!selected) {
      send(response, { error: { code: 'NOT_FOUND', message: 'Agent not found' } }, 404)
      return true
    }
    await sendIdempotent({
      request,
      response,
      path,
      commit: async body => {
        const capabilities = Array.isArray(body.approvedCapabilities) ? body.approvedCapabilities.map(String) : []
        const nextAccess = {
          agent_id: agentId, team_id: teamId, approved_capabilities: capabilities, status: method === 'DELETE' ? 'revoked' : 'active',
          approved_by_actor_id: human.id, revision: 3, created_at: '2026-08-20T08:00:00.000Z', updated_at: fixedNow,
          revoked_at: method === 'DELETE' ? fixedNow : null,
        }
        selected.team_access = [...(selected.team_access ?? []).filter(access => access.team_id !== teamId), nextAccess]
        return { payload: nextAccess }
      },
    })
    return true
  }

  if (activeScenario === 'agents-interactions' && path === '/api/v1/approvals' && method === 'GET') {
    const status = url.searchParams.get('status')
    const history = url.searchParams.get('view') === 'history'
    const visible = history
      ? scenarioApprovals.filter(approval => approval.status !== 'pending' && (!status || approval.status === status))
      : status === 'pending'
        ? scenarioApprovals.filter(approval => approval.status === 'pending' || approval.id === 'approval-mixed-approved')
        : scenarioApprovals.filter(approval => approval.status === status)
    send(response, page(visible))
    return true
  }
  const approvalDecisionMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)\/decide$/)
  if (activeScenario === 'agents-interactions' && method === 'POST' && approvalDecisionMatch) {
    const approvalId = decodeURIComponent(approvalDecisionMatch[1])
    await sendIdempotent({
      request,
      response,
      path,
      shouldFailOnce: approvalId === 'approval-retry',
      commit: async body => {
        const selected = scenarioApprovals.find(approval => approval.id === approvalId)
        if (!selected) return { status: 404, payload: { error: { code: 'NOT_FOUND', message: 'Approval not found' } } }
        const validation = approvalDecisionValidation(body, request, selected)
        if (validation) return validation
        if (selected.status !== 'pending') return { status: 409, payload: { error: { code: 'APPROVAL_ALREADY_DECIDED', message: 'This approval has already been decided.' } } }
        const decision = body.decision
        Object.assign(selected, { status: decision, revision: selected.revision + 1 })
        return { payload: selected }
      },
    })
    return true
  }

  if ((settingsScenarios.has(activeScenario) || activeScenario === 'agents-interactions' || activeScenario === 'command-center') && path === '/api/v1/teams' && method === 'GET') {
    if (failNextTeamsRefresh) {
      failNextTeamsRefresh = false
      send(response, { error: { code: 'TEAM_REFRESH_FAILED', message: 'The committed deletion is awaiting a later list refresh.' } }, 503)
      return true
    }
    if (settingsScenarios.has(activeScenario)) {
      const runtimeExists = currentScenarioTeams.some(candidate => candidate.id === 'team-runtime')
      if (url.searchParams.get('cursor') === 'teams-p2') send(response, page(currentScenarioTeams.filter(candidate => candidate.id === 'team-runtime')))
      else send(response, { items: currentScenarioTeams.filter(candidate => candidate.id === 'team-foundation'), nextCursor: runtimeExists ? 'teams-p2' : null })
      return true
    }
    send(response, page(activeScenario === 'command-center' ? [scenarioTeams[1]] : scenarioTeams))
    return true
  }
  const statesMatch = path.match(/^\/api\/v1\/teams\/([^/]+)\/states$/)
  if (settingsScenarios.has(activeScenario) && statesMatch) {
    const selectedTeamId = decodeURIComponent(statesMatch[1])
    if (method === 'GET') {
      send(response, page(selectedTeamId === 'team-runtime' ? currentScenarioStates : []))
      return true
    }
    if (method === 'POST') {
      await sendIdempotent({
        request,
        response,
        path,
        commit: async body => {
          const created = {
            id: 'state-created-custom', name: String(body.name ?? ''), category: String(body.category ?? ''),
            color: String(body.color ?? ''), revision: 1,
          }
          currentScenarioStates = [...currentScenarioStates, created]
          return { payload: created }
        },
      })
      return true
    }
  }
  const teamMatch = path.match(/^\/api\/v1\/teams\/([^/]+)$/)
  if (settingsScenarios.has(activeScenario) && teamMatch && method === 'DELETE') {
    const teamId = decodeURIComponent(teamMatch[1])
    await sendIdempotent({
      request,
      response,
      path,
      shouldAlwaysFail: activeScenario === 'settings-delete-failure',
      shouldFailOnce: activeScenario === 'settings-delete-retry',
      commit: async () => {
        currentScenarioTeams = currentScenarioTeams.filter(candidate => candidate.id !== teamId)
        if (activeScenario === 'settings-delete-retry') failNextTeamsRefresh = true
        return { payload: undefined, status: 204 }
      },
    })
    return true
  }

  if (activeScenario === 'command-center' && path === '/api/v1/inbox') {
    send(response, page([]))
    return true
  }
  return false
}

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, cors); response.end(); return }
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  const path = url.pathname
  if (path === '/__test/reset' && request.method === 'POST') {
    const input = await readBody(request)
    const scenario = typeof input.scenario === 'string' ? input.scenario : ''
    if (!scenarioNames.has(scenario)) return send(response, {
      error: { code: 'UNKNOWN_TEST_SCENARIO', message: `Unknown deterministic scenario: ${scenario || '(empty)'}` },
    }, 422)
    resetScenario(scenario)
    return send(response, { scenario, requestCount: 0 })
  }
  if (path === '/__test/requests' && request.method === 'GET') return send(response, requestLedger())
  beginRequestEvidence(request, url, response)
  if (await handleScenarioRoute(request, response, url)) return
  if (path === '/api/v1/install-status') return send(response, { installed: true })
  if (path === '/api/v1/auth/me') return send(response, { actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'preview-csrf' })
  if (path === '/api/v1/features') return send(response, { features: [] })
  if (path === '/api/v1/info') return send(response, { serverVersion: '1.0.0', buildSha: 'project-work-preview', schemaBaseline: 24 })
  if (path === '/api/v1/teams') return send(response, page([team]))
  if (path === `/api/v1/teams/${team.id}/states`) return send(response, page(states))
  if (path === '/api/v1/actors/humans') return send(response, page([human]))
  if (path === '/api/v1/projects') return send(response, page([project]))
  if (path === `/api/v1/projects/${project.id}`) return send(response, project)
  const controlCenterMatch = path.match(/^\/api\/v1\/projects\/([^/]+)\/control-center$/)
  if (controlCenterMatch) {
    const projectId = controlCenterMatch[1]
    const empty = page([])
    return send(response, {
      projectionVersion: 1,
      scope: { workspaceId: 'workspace-preview', projectId },
      project: {
        id: projectId,
        name: projectId === project.id ? project.name : 'Preview project',
        status: 'in_progress',
        targetDate: null,
        responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' },
        revision: 1,
      },
      revision: 1,
      freshness: { state: 'fresh', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
      collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
    })
  }
  if (path === '/api/v1/agents') return send(response, page([agent]))
  if (path === '/api/v1/agent-sessions') return send(response, page([session]))
  if (path === `/api/v1/agent-sessions/${session.id}`) return send(response, session)
  if (path === `/api/v1/agent-sessions/${session.id}/explanation`) return send(response, runExplanationFixture({ selectedSession: session, selectedAgent: agent }))
  if (path === `/api/v1/agent-sessions/${session.id}/activities`) return send(response, page([]))
  if (path === `/api/v1/agent-sessions/${session.id}/plans`) return send(response, page([]))
  if (path === '/api/v1/agent-connections') return send(response, page([]))
  if (path === '/api/v1/approvals') return send(response, page([]))
  if (path === '/api/v1/artifacts') return send(response, page([]))
  if (path === '/api/v1/views') return send(response, page([]))
  if (path === '/api/v1/workspaces/workspace-preview/guidance/history') return send(response, { scope: 'workspace', scopeId: 'workspace-preview', documentId: guidanceCurrent.documentId, revision: guidanceCurrent.revision, status: guidanceCurrent.status, currentRevisionId: guidanceCurrent.currentRevision?.id ?? null, revisions: guidanceRevisions, audit: guidanceAudit })
  if (path === '/api/v1/workspaces/workspace-preview/guidance/diff') return send(response, { from: guidanceRevisions.find(revision => revision.id === url.searchParams.get('fromRevisionId')) ?? guidanceRevisions[1], to: guidanceRevisions.find(revision => revision.id === url.searchParams.get('toRevisionId')) ?? guidanceRevisions[0], changes: [{ kind: 'removed', oldLine: 2, newLine: null, text: '智能体负责完成工作。' }, { kind: 'added', oldLine: null, newLine: 2, text: '人类负责人对结果负责，智能体通过授权执行。' }] })
  if (path === '/api/v1/workspaces/workspace-preview/guidance') {
    if (request.method === 'PUT') {
      const input = await readBody(request)
      const revision = { id: randomUUID(), revisionNumber: (guidanceRevisions[0]?.revisionNumber ?? 0) + 1, contentHash: `sha256:${'c'.repeat(64)}`, changeSummary: input.changeSummary, authorActorId: human.id, authorDisplayName: human.display_name, publishedAt: new Date().toISOString() }
      guidanceRevisions = [revision, ...guidanceRevisions]
      guidanceCurrent = { ...guidanceCurrent, status: 'active', revision: guidanceCurrent.revision + 1, currentRevision: revision, markdown: input.markdown, updatedAt: revision.publishedAt }
    }
    return send(response, guidanceCurrent)
  }
  if (path === '/api/v1/workspaces/workspace-preview/guidance/archive') {
    guidanceCurrent = { ...guidanceCurrent, status: 'archived', revision: guidanceCurrent.revision + 1, markdown: '' }
    return send(response, guidanceCurrent)
  }
  if (path === '/api/v1/workspaces/workspace-preview/guidance/rollback') {
    const input = await readBody(request)
    const revision = guidanceRevisions.find(candidate => candidate.id === input.revisionId) ?? guidanceCurrent.currentRevision
    guidanceCurrent = { ...guidanceCurrent, status: 'active', revision: guidanceCurrent.revision + 1, currentRevision: revision, markdown: revision?.revisionNumber === 1 ? '# WorkMesh 工作指南\n\n智能体负责完成工作。' : guidanceCurrent.markdown }
    return send(response, guidanceCurrent)
  }
  if (path === '/api/v1/work-items') return send(response, page(items.filter(item => matchesPreviewWorkItem(item, url.searchParams))))
  const executionSummaryMatch = path.match(/^\/api\/v1\/work-items\/([^/]+)\/execution-summary$/)
  if (executionSummaryMatch) {
    const item = items.find(candidate => candidate.id === executionSummaryMatch[1])
    return send(response, {
      projectionVersion: 1,
      workItem: { id: executionSummaryMatch[1], title: item?.title ?? 'Preview work item', revision: item?.revision ?? 1, status: item?.status_name ?? 'Backlog' },
      activeRuns: [],
      recentRuns: [],
      evidence: [],
      freshness: { state: 'current', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
    })
  }
  if (path === '/api/v1/human-attention') return send(response, page([]))
  const workMatch = path.match(/^\/api\/v1\/work-items\/([^/]+)$/)
  if (workMatch) {
    const item = items.find(candidate => candidate.id === workMatch[1])
    if (!item) return send(response, { error: { code: 'NOT_FOUND', message: 'Work Item not found' } }, 404)
    if (request.method === 'PATCH') {
      const input = await readBody(request)
      const status = input.statusId ? states.find(value => value.id === input.statusId) : undefined
      Object.assign(item, input, {
        status_id: status?.id ?? item.status_id,
        status_name: status?.name ?? item.status_name,
        status_category: status?.category ?? item.status_category,
        responsible_human_actor_id: input.responsibleHumanActorId === undefined ? item.responsible_human_actor_id : input.responsibleHumanActorId,
        responsible_human: input.responsibleHumanActorId === null ? null : item.responsible_human,
        project_id: input.projectId === undefined ? item.project_id : input.projectId,
        milestone_id: input.milestoneId === undefined ? item.milestone_id : input.milestoneId,
        parent_id: input.parentId === undefined ? item.parent_id : input.parentId,
        due_date: input.dueDate === undefined ? item.due_date : input.dueDate,
        revision: item.revision + 1,
      })
      return send(response, item)
    }
    return send(response, item)
  }
  if (path === `/api/v1/projects/${project.id}/milestones`) {
    if (request.method === 'POST') {
      const input = await readBody(request)
      const created = { id: randomUUID(), workspace_id: 'workspace-preview', project_id: project.id, name: input.name, description: input.description ?? null, target_date: input.targetDate ?? null, revision: 1, deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      milestones = [...milestones, created]; return send(response, created)
    }
    return send(response, page(milestones))
  }
  const milestoneMatch = path.match(/^\/api\/v1\/milestones\/([^/]+)$/)
  if (milestoneMatch) {
    const current = milestones.find(value => value.id === milestoneMatch[1])
    if (!current) return send(response, { error: { code: 'NOT_FOUND', message: 'Milestone not found' } }, 404)
    if (request.method === 'DELETE') { milestones = milestones.filter(value => value.id !== current.id); return send(response, { id: current.id, revision: current.revision + 1 }) }
    const input = await readBody(request); Object.assign(current, { name: input.name ?? current.name, description: input.description, target_date: input.targetDate, revision: current.revision + 1 }); return send(response, current)
  }
  const relationMatch = path.match(/^\/api\/v1\/work-items\/([^/]+)\/relations(?:\/([^/]+))?$/)
  if (relationMatch) {
    if (request.method === 'POST') {
      const input = await readBody(request); const created = { id: randomUUID(), source_work_item_id: relationMatch[1], target_work_item_id: input.targetWorkItemId, kind: input.kind, revision: 1 }
      relations = [...relations, created]; return send(response, created)
    }
    if (request.method === 'DELETE') { const current = relations.find(value => value.id === relationMatch[2]); relations = relations.filter(value => value.id !== relationMatch[2]); return send(response, { id: relationMatch[2], revision: (current?.revision ?? 0) + 1 }) }
    return send(response, page(relations.filter(value => value.source_work_item_id === relationMatch[1] || value.target_work_item_id === relationMatch[1])))
  }
  if (path === `/api/v1/projects/${project.id}/delivery`) return send(response, { milestones: milestones.map(milestone => ({ id: milestone.id, name: milestone.name, total: items.filter(item => item.milestone_id === milestone.id).length, completed: items.filter(item => item.milestone_id === milestone.id && item.status_category === 'completed').length, target_date: milestone.target_date })), updates: [{ id: 'update-1', health: 'on_track', body: 'Planning UI is progressing against the accepted foundation.', status: 'published', created_at: '2026-08-10T07:00:00Z' }], artifacts: [], dependencies: [], completionSuggestions: [], providerPullRequests: [], providerReviews: [], workMeshStructuredReviews: [], mergeApprovals: [] })
  if (path.endsWith('/comments')) return send(response, page([]))
  if (path === '/api/v1/events/stream') { response.writeHead(204, cors); response.end(); return }
  return send(response, { error: { code: 'NOT_FOUND', message: `Preview route not found: ${request.method} ${path}` } }, 404)
}).listen(port, '127.0.0.1', () => console.log(`project-work-preview-api:${port}`))
