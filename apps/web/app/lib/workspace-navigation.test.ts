import { describe, expect, it } from 'vitest'
import { workspaceNavigation, workspaceUtilityNavigation } from './workspace-navigation'

const labels = {
  agents: '智能体',
  guidance: '指南',
  inbox: '收件箱',
  issues: 'Issues',
  operations: '运营',
  projects: '项目',
  recovery: '恢复中心',
  settings: '设置',
} as const

describe('shared workspace navigation', () => {
  const t = (key: keyof typeof labels) => labels[key]

  it('publishes task-oriented destinations first and keeps Stable workflows reachable', () => {
    const navigation = workspaceNavigation({ active: 'agents', t })
    expect(navigation.map(item => item.label)).toEqual(['收件箱', '恢复中心', '项目', '智能体', '运营', 'Issues', '指南'])
    expect(navigation.filter(item => item.active).map(item => item.href)).toEqual(['/agents'])
    expect(navigation.map(item => item.href)).toEqual(expect.arrayContaining(['/?view=my-work', '/?view=guidance', '/operations']))
  })

  it('keeps only Settings in utility navigation (Operations is now a Settings tab)', () => {
    expect(workspaceUtilityNavigation({ t }).map(item => item.label)).toEqual(['设置'])
  })
})
