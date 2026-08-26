import { describe, expect, it } from 'vitest'
import { projectControlHref, projectControlNavigation, readProjectControlRoute } from './human-control-plane-navigation'

const copy = {
  overview: 'Overview', work: 'Work', attention: 'Attention', runs: 'Runs', graph: 'Graph', activity: 'Activity', settings: 'Project Settings', beta: 'Beta',
} as const

describe('Human Control Plane URL state', () => {
  it('keeps legacy Project work tabs canonical while mapping them to Work', () => {
    expect(readProjectControlRoute('?view=projects&project=p1&tab=board')).toEqual({ projectId: 'p1', surface: 'work', workView: 'board' })
    expect(projectControlHref({ projectId: 'p1', surface: 'work', workView: 'backlog' })).toBe('/?view=projects&project=p1&surface=work&tab=backlog')
  })

  it('converges unknown surfaces to Overview without retaining stale drawer state', () => {
    expect(readProjectControlRoute('?view=projects&project=p1&surface=internal-events').surface).toBe('overview')
    expect(projectControlHref({ currentSearch: '?filter=mine&drawer=old', projectId: 'p1', surface: 'runs' })).toBe('/?filter=mine&view=projects&project=p1&surface=runs')
  })

  it('owns selection and drawer identity in the URL and preserves unrelated filters', () => {
    const href = projectControlHref({ currentSearch: '?filter=urgent', drawerId: 'evidence', projectId: 'p1', selectedId: 'run-7', surface: 'runs' })
    expect(href).toBe('/?filter=urgent&view=projects&project=p1&surface=runs&selected=run-7&drawer=evidence')
    expect(readProjectControlRoute(href.slice(2))).toMatchObject({ drawerId: 'evidence', selectedId: 'run-7', surface: 'runs' })
  })

  it('publishes the complete task-oriented Project navigation order', () => {
    const items = projectControlNavigation({ active: 'attention', copy, projectId: 'p1' })
    expect(items.map(item => item.label)).toEqual(['Overview', 'Work', 'Attention', 'Runs', 'Graph', 'Activity', 'Project Settings'])
    expect(items.find(item => item.id === 'graph')?.badge).toBe('Beta')
    expect(items.find(item => item.id === 'attention')?.active).toBe(true)
  })
})
