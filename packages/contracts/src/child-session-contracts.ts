import { z } from 'zod'

export const childBudgetInputSchema = z.record(z.number().finite().nonnegative())
export const childSessionInputSchema = z.object({
  agentId: z.string().uuid(), planStepId: z.string().uuid(), planVersionId: z.string().uuid(),
  role: z.enum(['executor', 'reviewer', 'researcher']).default('executor'),
  initialPrompt: z.string().min(1).max(50_000), required: z.boolean().default(true),
  budget: childBudgetInputSchema.optional(),
})
export const reviewDelegationInputSchema = z.object({
  reviewerAgentId: z.string().uuid(), planStepId: z.string().uuid(), planVersionId: z.string().uuid(),
  initialPrompt: z.string().min(1).max(50_000),
  ttlSeconds: z.number().int().min(10).max(3_600).default(300), budget: childBudgetInputSchema.optional(),
  repositoryIds: z.array(z.string().uuid()).min(1).max(100)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate repository ID').optional(),
})
export const childSessionStatusQuerySchema = z.object({
  childSessionId: z.string().uuid().optional(), cursor: z.string().min(1).max(8192).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict()
export const childSessionStatusSchema = z.object({
  id: z.string().uuid(), parentSessionId: z.string().uuid(), requiredForParent: z.boolean(),
  state: z.enum(['queued', 'acknowledged', 'planning', 'executing', 'awaiting_input',
    'awaiting_approval', 'blocked', 'paused', 'stopping', 'stale', 'completed', 'failed', 'canceled']),
  revision: z.number().int().positive(), planStepId: z.string().uuid(), planVersionId: z.string().uuid(),
  resultArtifactIds: z.array(z.string().uuid()).max(100)
    .refine(ids => new Set(ids).size === ids.length, 'Duplicate artifact ID'),
}).strict()
export const childSessionStatusPageSchema = z.object({
  items: z.array(childSessionStatusSchema).max(200), nextCursor: z.string().max(8192).nullable(),
}).strict()
export type ChildSessionStatus = z.infer<typeof childSessionStatusSchema>
export type ChildSessionStatusPage = z.infer<typeof childSessionStatusPageSchema>
