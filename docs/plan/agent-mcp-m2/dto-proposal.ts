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
