import { describe, expect, it } from 'vitest'
import { readinessContext, readinessHref } from './configuration-readiness-navigation'

const teamId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const workItemId = '33333333-3333-4333-8333-333333333333'
describe('工作台配置导航', () => {
  it('只接受 URL 明确且唯一的工作类型，不推断缺失或非法值', () => {
    for (const search of ['', 'workKind=other', 'workKind=repository&workKind=non_repository', 'workKind=repository&teamId=x']) expect(readinessContext(search, teamId)).toBeNull()
    expect(readinessContext('workKind=non_repository', teamId)).toEqual({ teamId, workKind: 'non_repository' })
  })
  it('真实对话上下文与显式 URL 不匹配时拒绝查询', () => {
    const conversation = { team_id: teamId, project_id: projectId, work_item_id: workItemId }
    expect(readinessContext(`workKind=repository&projectId=${workItemId}`, teamId, conversation)).toBeNull()
    expect(readinessContext('workKind=repository', teamId, conversation)).toEqual({ teamId, projectId, workItemId, workKind: 'repository' })
  })
  it('仓库深链保持 canonical Projects 和工作项目标，无项目不伪造', () => {
    expect(readinessHref('repository', { teamId, workKind: 'repository', workItemId })).toBe(`/?teamId=${teamId}&repositoryWorkItem=${workItemId}&view=projects#project-repository-configuration`)
    expect(readinessHref('model', { teamId, workKind: 'repository' })).toBe('/settings/agent-workbench')
    expect(readinessHref('agent', { teamId, workKind: 'repository' })).toBe('/agents')
  })
})
