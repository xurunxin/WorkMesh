import { z } from 'zod'

const id = z.string().uuid()
const count = z.string().regex(/^\d+$/)
const row = z.object({ id }).passthrough()
export const optionalDomainCursorSchema = z.string().regex(/^\d+$/).max(19).refine(value => BigInt(value) <= 9_223_372_036_854_775_807n)
export const usageSummaryQuerySchema = z.object({
  agentId: id.optional(), sessionId: id.optional(), projectId: id.optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
})
export type UsageSummaryQuery = z.input<typeof usageSummaryQuerySchema>
export const usageSummaryResponseSchema = z.object({
  input_tokens: count, output_tokens: count, runtime_ms: count, tool_calls: count,
  unknown_cost_records: z.number().int().nonnegative(),
  // Empty buckets mean no cost observations; unknown records never mean free.
  currency_buckets: z.array(z.object({ currency: z.string().length(3), known_cost_minor: count,
    unknown_cost_records: z.number().int().nonnegative() }).passthrough()),
}).passthrough()
export const initiativeRollupResponseSchema = z.object({
  projectCount: z.number().int().nonnegative(), completedProjectCount: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(), totalItems: z.number().int().nonnegative(),
  progressPercent: z.number().min(0).max(100), health: z.enum(['on_track','at_risk','off_track','unknown']),
  currencyBuckets: z.array(z.object({ currency: z.string().length(3), knownCostMinor: count, hasUnknownCost: z.boolean() })),
  hasUnknownCost: z.boolean(),
}).passthrough()
export const automationEffectResponseSchema = row.extend({ action_ordinal: z.number().int().nonnegative(), status: z.string() })
export const automationRunResponseSchema = row.extend({ session_id: id.nullable(), status: z.string() })
export const automationRunDetailResponseSchema = automationRunResponseSchema.extend({ effects: z.array(automationEffectResponseSchema) })
export const cycleResponseSchema = row.extend({ name: z.string() })
export const initiativeResponseSchema = row.extend({ name: z.string(), status: z.string() })
export const advancedViewResponseSchema = row.extend({ name: z.string(), entity_type: z.string(), scope: z.string() })
export const advancedViewResultResponseSchema = row
export const automationRuleResponseSchema = row.extend({ name: z.string() })
export const loopResponseSchema = row.extend({ name: z.string(), state: z.enum(['active','paused','disabled']) })
export const templatePinResponseSchema = row.extend({ name: z.string(), version: z.number().int().positive(), body: z.record(z.unknown()) })
export const runLoopNowInputSchema = z.object({ occurrenceKey: z.string().min(1).max(500), scheduledFor: z.coerce.date().optional() })
export type RunLoopNowInput = z.input<typeof runLoopNowInputSchema>
export const loopAdmissionResponseSchema = z.object({ runId: id, sessionId: id.nullable(), duplicate: z.boolean(), deferred: z.boolean().optional(), retryAt: z.string().optional() }).passthrough()
export const usageRecordResponseSchema = row.extend({ duplicate: z.boolean() })
export const a2aTaskEventQuerySchema = z.object({ after: optionalDomainCursorSchema.default('0') })
const part = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }).passthrough(),
  z.object({ kind: z.literal('data'), data: z.record(z.unknown()) }).passthrough(),
  z.object({ kind: z.literal('file'), uri: z.string() }).passthrough(),
])
export const a2aStreamEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status-update'), taskId: z.string(), final: z.boolean(),
    status: z.object({ state: z.string(), timestamp: z.string().optional() }).passthrough() }).passthrough(),
  z.object({ kind: z.literal('message'), taskId: z.string(),
    message: z.object({ id: z.string(), role: z.literal('agent'), parts: z.array(part) }).passthrough() }).passthrough(),
  z.object({ kind: z.literal('artifact-update'), taskId: z.string(),
    artifact: z.object({ id: z.string(), name: z.string(), parts: z.array(part) }).passthrough() }).passthrough(),
])
export const a2aTaskEventPageSchema = z.object({
  events: z.array(z.object({ cursor: optionalDomainCursorSchema, event: a2aStreamEventSchema })).max(200),
  cursor: optionalDomainCursorSchema,
}).passthrough()
export type InitiativeRollupResponse = z.infer<typeof initiativeRollupResponseSchema>
export type AutomationRunResponse = z.infer<typeof automationRunResponseSchema>
export type AutomationRunDetailResponse = z.infer<typeof automationRunDetailResponseSchema>
export type UsageSummaryResponse = z.infer<typeof usageSummaryResponseSchema>
export type A2ATaskEventPage = z.infer<typeof a2aTaskEventPageSchema>
export type CycleResponse = z.infer<typeof cycleResponseSchema>
export type InitiativeResponse = z.infer<typeof initiativeResponseSchema>
export type AdvancedViewResponse = z.infer<typeof advancedViewResponseSchema>
export type AutomationRuleResponse = z.infer<typeof automationRuleResponseSchema>
export type LoopResponse = z.infer<typeof loopResponseSchema>
export type TemplatePinResponse = z.infer<typeof templatePinResponseSchema>
export type LoopAdmissionResponse = z.infer<typeof loopAdmissionResponseSchema>
export type UsageRecordResponse = z.infer<typeof usageRecordResponseSchema>
