import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../app/lib/api'
import { detailError } from './commands'
import { readFileSync } from 'node:fs'
import { detailDraft, sameDetailDraft, toWorkItemDetailModel } from './view-model'
import type { WorkItemDetailDto } from './contracts'

const item: WorkItemDetailDto = { id: 'w1', title: 'Detail', description: null, number: 8, revision: 2, status_id: 's1', status_name: 'In Progress', status_category: 'started', team_id: 't1', team_key: 'GEN', priority: 'high', due_date: null, responsible_human_actor_id: 'h1', responsible_human: { actor_id: 'h1', display_name: 'Human' }, active_executor: { agent_id: 'a1', agent_actor_id: 'aa1', agent_slug: 'codex', agent_display_name: 'Codex', session_id: 'se1', lease_id: 'l1', lease_kind: 'exclusive', resource_type: 'work_item', resource_id: 'w1', execution_state: 'executing', heartbeat_health: 'healthy', last_heartbeat_at: null, lease_heartbeat_at: '2026-08-12T00:00:00Z', lease_expires_at: '2026-08-12T01:00:00Z' }, shared_reviewers: [], labels: ['coord:active'], project_id: 'p1', milestone_id: null, parent_id: null }

describe('Work Item detail model', () => {
  it('keeps Human responsibility, workflow state and Agent execution separate', () => {
    const model = toWorkItemDetailModel(item)
    expect(model.responsibleHuman).toEqual({ actorId: 'h1', displayName: 'Human' })
    expect(model.workflowState).toMatchObject({ name: 'In Progress', category: 'started' })
    expect(model.agentExecutions[0]).toMatchObject({ executionState: 'executing', sessionId: 'se1' })
    expect(model).not.toHaveProperty('assignee')
  })
  it('builds a stable editable draft and detects unsaved changes', () => {
    const draft = detailDraft(toWorkItemDetailModel(item))
    expect(sameDetailDraft(draft, draft)).toBe(true)
    expect(sameDetailDraft(draft, { ...draft, title: 'Changed' })).toBe(false)
  })
  it('preserves the structured transport envelope for conflict recovery', () => {
    const error = new ApiError(409, 'Revision changed', 'REVISION_CONFLICT', undefined, { currentRevision: 3 }, 'corr-1', 'Load the latest revision.')
    expect(detailError(error)).toEqual({
      httpStatus: 409,
      code: 'REVISION_CONFLICT',
      message: 'Revision changed',
      details: { currentRevision: 3 },
      correlationId: 'corr-1',
      safeNextAction: 'Load the latest revision.',
    })
  })
  it('keeps Sheet and Full Page on one feature model and authority-safe command seam', () => {
    const component = readFileSync(new URL('./work-item-detail.tsx', import.meta.url), 'utf8')
    const command = readFileSync(new URL('./commands.ts', import.meta.url), 'utf8')
    expect(component).toContain("mode: 'sheet' | 'full_page'")
    expect(component).toContain("mode === 'sheet' ? <Sheet")
    expect(component).toContain('[model.id, model.revision]')
    expect(component).not.toContain('detailDraft(model), [model]')
    expect(component).toContain('props.resetKey')
    expect(component).toContain('Work Item lifecycle, independent from Agent execution.')
    expect(component).toContain('Accountable for the outcome; never an Agent assignment.')
    expect(command).toContain(`'If-Match': \`"revision-\${input.revision}"\``)
    expect(command).toContain("apiMutation(`work-item-detail:${input.workItemId}`")
    expect(command).not.toContain("status: input.draft")
  })
})
