// 仅审阅草案，不在产品编译或 discovery 输入中执行。
import { z } from 'zod'

export const childSessionStatusQuerySchema = z.object({
  childSessionId: z.string().uuid().optional(),
  cursor: z.string().min(1).max(8192).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict()
export const childSessionStatusSchema = z.object({
  id: z.string().uuid(),
  parentSessionId: z.string().uuid(),
  requiredForParent: z.boolean(),
  state: z.enum(['queued', 'acknowledged', 'planning', 'executing', 'awaiting_input',
    'awaiting_approval', 'blocked', 'paused', 'stopping', 'stale', 'completed', 'failed', 'canceled']),
  revision: z.number().int().positive(),
  planStepId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  resultArtifactIds: z.array(z.string().uuid()).max(100)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate artifact ID'),
}).strict()
export const childSessionStatusPageSchema = z.object({
  items: z.array(childSessionStatusSchema).max(200),
  nextCursor: z.string().max(8192).nullable(),
}).strict()
export type ChildSessionStatus = z.infer<typeof childSessionStatusSchema>
export type ChildSessionStatusPage = z.infer<typeof childSessionStatusPageSchema>

// SDK: listChildSessions(parentSessionId, filters = {}, options: PageRequestOptions = {})
// 返回 Promise<ChildSessionStatusPage>；validateResponse(schema, request('GET', pagedPath(...)))。
// 直接 E Token，不 refreshSessionId／不 C→E bridge；SDK 此入口明确拒 C 模式。
// MCP: list_child_sessions({ parentSessionId, childSessionId?, cursor?, limit? })。
// Runner: workmesh_list_child_sessions({ childSessionId?, cursor?, limit? })；固定 api.sessionId。
// GET 使用 makeTool 的无 activity 分支，不将允许读取与 command audit 混为一体。

// 创建输入/投影放 child-session-contracts.ts；创建响应在 index.ts 的 base定义后声明，
// 防止新模块反向import index.ts而形成ESM初始化循环；此处只把提案合在一份审阅。
// agentSessionResponseSchema 来自 packages/contracts/src/index.ts；
// leaseResponseSchema 来自 execution-contracts.ts，已 passthrough().refine(...)，直接复用。
import { agentSessionResponseSchema, leaseResponseSchema } from '@workmesh/contracts'
export const childBudgetInputSchema = z.record(z.number().finite().nonnegative())
export const childSessionInputSchema = z.object({
  agentId: z.string().uuid(),
  planStepId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  role: z.enum(['executor', 'reviewer', 'researcher']).default('executor'),
  initialPrompt: z.string().min(1).max(50_000),
  required: z.boolean().default(true),
  budget: childBudgetInputSchema.optional(),
})
export const reviewDelegationInputSchema = z.object({
  reviewerAgentId: z.string().uuid(),
  planStepId: z.string().uuid(),
  planVersionId: z.string().uuid(),
  initialPrompt: z.string().min(1).max(50_000),
  ttlSeconds: z.number().int().min(10).max(3_600).default(300),
  budget: childBudgetInputSchema.optional(),
})
export const childAgentSessionResponseSchema = agentSessionResponseSchema.extend({
  parent_session_id: z.string().uuid(),
  plan_step_version_id: z.string().uuid(),
  required_for_parent: z.boolean(),
  inherited_budget: childBudgetInputSchema,
  max_child_sessions: z.number().int().nonnegative(),
  budget: childBudgetInputSchema,
}).passthrough()
export const reviewDelegationResponseSchema = z.object({
  session: childAgentSessionResponseSchema,
  lease: leaseResponseSchema,
}).passthrough()
export type ChildAgentSession = z.infer<typeof childAgentSessionResponseSchema>
export type ReviewDelegationResponse = z.infer<typeof reviewDelegationResponseSchema>
// SDK保旧显式泛型调用兼容，缺省类型变为创建专用typed结果：
// createChildSession<T = ChildAgentSession>(parentSessionId, input, options)
// createReviewDelegation<T = ReviewDelegationResponse>(parentSessionId, input, options)
// 两者response边界用上述创建schema校验，再维持原T返回兼容；不能用普通getSession schema。
// MCP create_review_delegation input增加budget?:Record<string,number>，透传准确body。
// Runner workmesh_create_review_delegation同输入，父固定api.sessionId；普通child已有budget也透传。
// 请求object沿旧Zod strip语义，无额外maxChildSessions输入；响应原额外字段原样保留。
