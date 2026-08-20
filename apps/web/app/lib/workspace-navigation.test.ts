import { describe, expect, it } from 'vitest'
import { workspaceNavigation, workspaceUtilityNavigation } from './workspace-navigation'

const labels = {
  agents: '智能体',
  guidance: '指南',
  inbox: '收件箱',
  issues: 'Issues',
  projects: '项目',
  settings: '设置',
} as const

describe('shared workspace navigation', () => {
  const t = (key: keyof typeof labels) => labels[key]

  it('keeps the same localized order and marks Agents active', () => {
    const navigation = workspaceNavigation({ active: 'agents', t })
    expect(navigation.map(item => item.label)).toEqual(['收件箱', 'Issues', '项目', '指南', '智能体'])
    expect(navigation.filter(item => item.active).map(item => item.href)).toEqual(['/agents'])
  })

  it('keeps only Settings in utility navigation (Operations is now a Settings tab)', () => {
    expect(workspaceUtilityNavigation({ t }).map(item => item.label)).toEqual(['设置'])
  })
})
