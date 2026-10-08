import { describe, expect, it } from 'vitest'
import { repositoryListQuerySchema, providerConnectionConfigurationSchema } from './repository-configuration-contracts.js'

describe('仓库配置 DTO', () => {
  it('仓库Human筛选参数与操作提示响应边界', () => {
    expect(repositoryListQuerySchema.parse({ availableOnly: 'false' })).toEqual({ availableOnly: 'false' })
    for (const input of [{ availableOnly: 'yes' }, { availableOnly: true }, { availableOnly: ['true', 'false'] }, { teamId: 'bad' }, { teamId: ['a', 'b'] }]) expect(repositoryListQuerySchema.safeParse(input).success).toBe(false)
    const id = '11111111-1111-4111-8111-111111111111'
    const response = { id, workspace_id: id, provider: 'github', external_account_id: 'account', display_name: 'GitHub', installation_id: '42', service_actor_id: id, active: true, revision: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    expect(providerConnectionConfigurationSchema.safeParse(response).success).toBe(true)
    expect(providerConnectionConfigurationSchema.safeParse({ ...response, privateKey: 'secret' }).success).toBe(false)
  })
})
