import { describe, expect, it } from 'vitest'
// @ts-expect-error The preview API runs as native ESM outside the TypeScript build.
import { matchesPreviewWorkItem } from './project-work-preview-query.mjs'

const item = {
  title: 'Implement priority filtering',
  number: 47,
  team_key: 'WM',
  status_id: 'in-progress',
  status_category: 'started',
  priority: 'high',
  responsible_human_actor_id: 'human-1',
  project_id: 'project-1',
  milestone_id: 'milestone-1',
  labels: ['frontend'],
}

const query = (value: string) => new URL(`http://preview.local/?${value}`).searchParams

describe('project work preview filtering', () => {
  it('filters by exact workflow status', () => {
    expect(matchesPreviewWorkItem(item, query('statusId=in-progress'))).toBe(true)
    expect(matchesPreviewWorkItem(item, query('statusId=backlog'))).toBe(false)
  })

  it('filters by priority', () => {
    expect(matchesPreviewWorkItem(item, query('priority=high'))).toBe(true)
    expect(matchesPreviewWorkItem(item, query('priority=low'))).toBe(false)
  })
})
