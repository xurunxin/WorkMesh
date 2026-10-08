import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
  configurationReadinessQuerySchema,
  configurationReadinessResponseSchema,
  routePolicyManifest,
} from './index.js'

const teamId = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const ready = { applicability: 'applicable', state: 'ready', reasonCode: 'configured' }
const unknown = { applicability: 'applicable', state: 'unknown', reasonCode: 'not_observable' }
const notApplicable = { applicability: 'not_applicable', state: null, reasonCode: 'non_repository_work' }
const response = { checks: { model: ready, agent: ready, repository: ready, runner: unknown } }

describe('配置就绪契约', () => {
  it('工作意图必须显式传入，资源 ID 与未知参数严格校验', () => {
    for (const workKind of ['repository', 'non_repository'])
      expect(configurationReadinessQuerySchema.parse({ teamId, workKind, projectId: teamId, workItemId: teamId }).workKind).toBe(workKind)
    for (const invalid of [{}, { teamId }, { workKind: 'repository' }, { teamId: 'bad', workKind: 'repository' },
      { teamId, workKind: 'unknown' }, { teamId, workKind: 'repository', projectId: 'bad' },
      { teamId, workKind: 'repository', workItemId: 'bad' }, { teamId, workKind: 'repository', workspaceId: teamId },
      { teamId: [teamId, teamId], workKind: 'repository' }])
      expect(configurationReadinessQuerySchema.safeParse(invalid).success).toBe(false)
  })

  it('三态与原因相关，仓库适用性独立且没有第四种就绪状态', () => {
    for (const check of [ready, { applicability: 'applicable', state: 'blocked', reasonCode: 'unmet' }, unknown, notApplicable])
      expect(configurationReadinessResponseSchema.parse({ checks: { ...response.checks, repository: check } }).checks.repository).toEqual(check)
    for (const repository of [{ ...notApplicable, state: 'blocked' }, { ...ready, state: null },
      { ...ready, state: 'not_applicable' }, { ...ready, reasonCode: 'exists_but_forbidden' }])
      expect(configurationReadinessResponseSchema.safeParse({ checks: { ...response.checks, repository } }).success).toBe(false)
  })

  it('Runner 只能 unknown，响应不能披露配置标识、计数或总体运行许可', () => {
    expect(configurationReadinessResponseSchema.parse(response)).toEqual(response)
    for (const runner of [ready, { ...unknown, state: 'blocked' }, notApplicable])
      expect(configurationReadinessResponseSchema.safeParse({ checks: { ...response.checks, runner } }).success).toBe(false)
    for (const invalid of [{ ...response, canRun: true }, { checks: { ...response.checks, model: { ...ready, id: teamId } } },
      { checks: { ...response.checks, agent: { ...ready, count: 1 } } }, { checks: { ...response.checks, extra: ready } },
      { checks: { model: ready, repository: ready, runner: unknown } }])
      expect(configurationReadinessResponseSchema.safeParse(invalid).success).toBe(false)
  })

  it('OpenAPI、清单与 Human-only 只读策略一致，拒绝审计保留', async () => {
    const policy = routePolicyManifest.find(p => p.operationId === 'getConfigurationReadiness')!
    expect(policy).toMatchObject({ method: 'GET', actorKinds: ['human'], authentication: 'human_session',
      idempotency: 'none', revision: 'none', audit: { denial: 'required' }, feature: { key: null, tier: 'stable' } })
    const api = parse(await readFile(new URL('../../../OPENAPI.yaml', import.meta.url), 'utf8')) as {
      paths: Record<string, { get: { operationId: string; parameters: Array<{ name: string; required?: boolean }> } }>
      components: { schemas: Record<string, { properties: { checks: { properties: Record<string, unknown> } } }> }
    }
    const path = api.paths[policy.path]!
    expect(Object.keys(path)).toEqual(['get'])
    expect(path.get.operationId).toBe(policy.operationId)
    expect(path.get.parameters.filter(p => p.required).map(p => p.name)).toEqual(['teamId', 'workKind'])
    expect(Object.keys(api.components.schemas.ConfigurationReadiness!.properties.checks.properties)).toEqual(['model', 'agent', 'repository', 'runner'])
  })
})
