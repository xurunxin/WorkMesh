import { describe, expect, it } from 'vitest'
import {
  buildWorkHierarchy,
  optionIdentityKey,
  projectMilestoneIssuesHref,
  projectWorkspaceHref,
  readProjectWorkspaceRoute,
  revisionConflictNotice,
  revisionScopedFormKey,
  summarizeProjectWork,
} from './project-work.js'

const items = [
  {
    id: 'parent',
    parent_id: null,
    status_category: 'started' as const,
    responsible_human: { actor_id: 'human-1', display_name: 'Alice' },
    active_executor: { agent_display_name: 'Codex', execution_state: 'running' },
  },
  {
    id: 'child',
    parent_id: 'parent',
    status_category: 'planned' as const,
    responsible_human: null,
    active_executor: null,
  },
  {
    id: 'done',
    parent_id: null,
    status_category: 'completed' as const,
    responsible_human: { actor_id: 'human-2', display_name: 'Bo' },
    active_executor: null,
  },
]

describe('project and work surface projections', () => {
  it('builds a stable hierarchy without losing orphaned children', () => {
    expect(buildWorkHierarchy([
      ...items,
      { ...items[1], id: 'orphan', parent_id: 'missing' },
    ])).toEqual([
      { item: items[0], depth: 0, childCount: 1 },
      { item: items[1], depth: 1, childCount: 0 },
      { item: items[2], depth: 0, childCount: 0 },
      { item: { ...items[1], id: 'orphan', parent_id: 'missing' }, depth: 0, childCount: 0 },
    ])
  })

  it('summarizes Human responsibility separately from Agent execution', () => {
    expect(summarizeProjectWork(items)).toEqual({
      total: 3,
      completed: 1,
      inProgress: 1,
      withoutResponsibleHuman: 1,
      activeAgents: 1,
      progressPercent: 33,
    })
  })

  it('round-trips stable project and full Work Item routes', () => {
    const href = projectWorkspaceHref({
      projectId: 'project-1',
      tab: 'board',
      workItemId: 'work-7',
    })
    expect(href).toBe('/?view=projects&project=project-1&tab=board&workItem=work-7')
    expect(readProjectWorkspaceRoute(href.slice(1))).toEqual({
      projectId: 'project-1',
      tab: 'board',
      workItemId: 'work-7',
    })
    expect(readProjectWorkspaceRoute('?view=projects&tab=unsafe')).toEqual({
      projectId: undefined,
      tab: 'overview',
      workItemId: undefined,
    })
  })

  it('opens a milestone in the global Issues list with only project filters', () => {
    expect(projectMilestoneIssuesHref('project-1', 'milestone-1'))
      .toBe('/?view=my-work&layout=list&projectId=project-1&milestoneId=milestone-1')
  })

  it('turns stale revision responses into a recoverable notice', () => {
    expect(revisionConflictNotice({ status: 409, code: 'REVISION_CONFLICT' }))
      .toEqual({
        title: 'This work changed while you were editing',
        action: 'Reload the latest version and review your changes before saving again.',
      })
    expect(revisionConflictNotice({ status: 500, code: 'INTERNAL' })).toBeNull()
  })

  it('remounts revision-backed forms after conflict recovery reloads latest data', () => {
    expect(revisionScopedFormKey({ id: 'milestone-1', revision: 4 })).toBe('milestone-1:4')
    expect(revisionScopedFormKey({ id: 'milestone-1', revision: 5 }))
      .not.toBe(revisionScopedFormKey({ id: 'milestone-1', revision: 4 }))
  })

  it('changes the form identity when late option catalogs arrive', () => {
    expect(optionIdentityKey([
      { id: 'state-backlog', revision: 1 },
      { id: 'state-ready', revision: 1 },
    ])).toBe('state-backlog:1|state-ready:1')
    expect(optionIdentityKey([]))
      .not.toBe(optionIdentityKey([{ id: 'human-1' }]))
    expect(optionIdentityKey([{ id: 'milestone-1', revision: 2 }]))
      .not.toBe(optionIdentityKey([{ id: 'milestone-1', revision: 3 }]))
  })
})
