import { describe, expect, it } from 'vitest'
import { projectWorkspaceHref, readProjectWorkspaceRoute, revisionConflictNotice } from './project-work'

describe('Project workspace routes', () => {
  it('round-trips the canonical Project and Work views', () => {
    const href = projectWorkspaceHref({ projectId: 'project-1', tab: 'board', workItemId: 'work-7' })
    expect(href).toBe('/?view=projects&project=project-1&tab=board&workItem=work-7')
    expect(readProjectWorkspaceRoute(href.slice(1))).toEqual({ projectId: 'project-1', tab: 'board', workItemId: 'work-7' })
  })

  it('converges unsupported views to Overview', () => {
    expect(readProjectWorkspaceRoute('?view=projects&project=project-1&tab=graph')).toEqual({ projectId: 'project-1', tab: 'overview', workItemId: undefined })
  })

  it('keeps canonical Work filters while changing the Project layout', () => {
    expect(projectWorkspaceHref({
      filterSearch: '?label=focus&projectId=legacy-project-alias',
      projectId: 'project-1',
      tab: 'board',
    })).toBe('/?label=focus&view=projects&project=project-1&tab=board')
  })

  it('keeps revision conflicts recoverable', () => {
    expect(revisionConflictNotice({ status: 409, code: 'REVISION_CONFLICT' })).not.toBeNull()
    expect(revisionConflictNotice({ status: 500, code: 'INTERNAL' })).toBeNull()
  })
})
