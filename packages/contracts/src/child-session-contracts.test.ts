import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { childBudgetInputSchema, childSessionStatusSchema, reviewDelegationInputSchema, childAgentSessionResponseSchema } from './index.js'

describe('M2 子Session合同边界', () => {
  it('可选review预算保留任意原维度，只接受有限非负数字', () => {
    const input = { reviewerAgentId: randomUUID(), planStepId: randomUUID(), planVersionId: randomUUID(), initialPrompt: 'Review' }
    expect(reviewDelegationInputSchema.parse(input).budget).toBeUndefined()
    expect(reviewDelegationInputSchema.parse({ ...input, budget: { maxInputTokens: 40, customLimit: 3 } }).budget).toEqual({ maxInputTokens: 40, customLimit: 3 })
    for (const value of [-1, NaN, Infinity, '40', null]) expect(childBudgetInputSchema.safeParse({ limit: value }).success).toBe(false)
  })
  it('创建响应必须包含五个真实绑定字段，额外字段和预算维度保持透传', () => {
    // Validate the added shape independently of the large existing Session fixture.
    const added = childAgentSessionResponseSchema.pick({ parent_session_id: true, plan_step_version_id: true,
      required_for_parent: true, inherited_budget: true, max_child_sessions: true, budget: true }).passthrough()
    const response = { parent_session_id: randomUUID(), plan_step_version_id: randomUUID(), required_for_parent: true,
      inherited_budget: { custom: 4 }, max_child_sessions: 8, budget: { custom: 4 }, originalExtra: { retained: true } }
    expect(added.parse(response)).toEqual(response)
    for (const field of ['parent_session_id','plan_step_version_id','required_for_parent','inherited_budget','max_child_sessions']) {
      const incomplete = { ...response }; delete incomplete[field as keyof typeof incomplete]
      expect(added.safeParse(incomplete).success).toBe(false)
    }
  })
  it('投影允许子终态且严格拒绝秘密及正文扩展', () => {
    const dto = { id: randomUUID(), parentSessionId: randomUUID(), requiredForParent: true, state: 'completed', revision: 2,
      planStepId: randomUUID(), planVersionId: randomUUID(), resultArtifactIds: [] }
    expect(childSessionStatusSchema.parse(dto)).toEqual(dto)
    for (const field of ['token','prompt','body','budget']) expect(childSessionStatusSchema.safeParse({ ...dto, [field]: 'secret' }).success).toBe(false)
  })
})
