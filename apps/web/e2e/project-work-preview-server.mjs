import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { matchesPreviewWorkItem } from './project-work-preview-query.mjs'

const port = Number(process.env.PORT ?? 3101)
const cors = {
  'access-control-allow-origin': 'http://127.0.0.1:3100',
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

const readBody = request => new Promise(resolve => {
  let raw = ''
  request.setEncoding('utf8')
  request.on('data', chunk => { raw += chunk })
  request.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
})
const send = (response, payload, status = 200) => {
  response.writeHead(status, cors)
  response.end(JSON.stringify(payload))
}
const page = items => ({ items, nextCursor: null })

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, cors); response.end(); return }
  const url = new URL(request.url, `http://127.0.0.1:${port}`)
  const path = url.pathname
  if (path === '/api/v1/install-status') return send(response, { installed: true })
  if (path === '/api/v1/auth/me') return send(response, { actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'preview-csrf' })
  if (path === '/api/v1/features') return send(response, { features: [] })
  if (path === '/api/v1/info') return send(response, { serverVersion: '1.0.0', buildSha: 'project-work-preview', schemaBaseline: 24 })
  if (path === '/api/v1/teams') return send(response, page([team]))
  if (path === `/api/v1/teams/${team.id}/states`) return send(response, page(states))
  if (path === '/api/v1/actors/humans') return send(response, page([human]))
  if (path === '/api/v1/projects') return send(response, page([project]))
  if (path === `/api/v1/projects/${project.id}`) return send(response, project)
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
