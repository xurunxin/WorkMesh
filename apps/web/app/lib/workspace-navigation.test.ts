import { describe, expect, it } from 'vitest'
import { workspaceNavigation, workspaceUtilityNavigation } from './workspace-navigation'

const labels = {
  agents: '智能体',
  guidance: '指南',
  inbox: '收件箱',
  issues: 'Issues',
  navGroupGovernance: '治理',
  navGroupOperations: '运营',
  navGroupWorkbench: '工作台',
  operations: '运营',
  projects: '项目',
  recovery: '恢复中心',
  settings: '设置',
  workbench: '工作台',
} as const

const flatten = (sections: ReturnType<typeof workspaceNavigation>) => sections.flatMap(section => section.items)

describe('shared workspace navigation', () => {
  const t = (key: keyof typeof labels) => labels[key]

  it('groups the sidebar the way the prototype groups its navigation', () => {
    const sections = workspaceNavigation({ active: 'agents', t })
    expect(sections.map(section => section.label)).toEqual(['工作台', '治理', '运营'])
    expect(sections.map(section => section.items.map(item => item.label))).toEqual([
      ['工作台', 'Issues', '指南'],
      ['收件箱', '恢复中心', '项目', '智能体'],
      ['运营'],
    ])
  })

  it('publishes task-oriented destinations first and keeps Stable workflows reachable', () => {
    const navigation = flatten(workspaceNavigation({ active: 'agents', t }))
    expect(navigation.map(item => item.label)).toEqual(['工作台', 'Issues', '指南', '收件箱', '恢复中心', '项目', '智能体', '运营'])
    expect(navigation.filter(item => item.active).map(item => item.href)).toEqual(['/agents'])
    expect(navigation.map(item => item.href)).toEqual(expect.arrayContaining(['/?view=my-work', '/?view=guidance', '/operations']))
  })

  it('keeps the agent workbench a first-class destination with a canonical URL', () => {
    const navigation = flatten(workspaceNavigation({ active: 'workbench', t }))
    expect(navigation[0]).toMatchObject({ active: true, href: '/workbench', label: '工作台', testId: 'view-workbench' })
    expect(navigation.filter(item => item.active)).toHaveLength(1)
  })

  it('keeps only Settings in utility navigation (Operations is now a Settings tab)', () => {
    expect(workspaceUtilityNavigation({ t }).map(item => item.label)).toEqual(['设置'])
  })
})
