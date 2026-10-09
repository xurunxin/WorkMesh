import { z } from 'zod'

const id = z.string().uuid()
const revision = z.number().int().positive()
export const executionStateSchema = z.enum([
  'queued', 'acknowledged', 'planning', 'executing', 'awaiting_input',
  'awaiting_approval', 'blocked', 'paused', 'stopping', 'completed', 'failed', 'canceled', 'stale',
])
export const agentSessionExecutionResultQuerySchema = z.object({
  action: z.enum(['complete', 'stop_ack']),
  operationKey: z.string().min(1).max(200),
}).strict()
export const agentSessionExecutionResultResponseSchema = z.object({
  session: z.object({ id, state: executionStateSchema, revision }).strict(),
  action: z.object({
    kind: z.enum(['complete', 'stop_ack']), operationKey: z.string().min(1).max(200),
    confirmation: z.enum(['confirmed', 'unavailable']),
    unavailableReason: z.enum(['receipt_missing', 'receipt_expired', 'result_unavailable']).nullable(),
  }).strict(),
  originalResult: z.object({
    operationId: z.enum(['completeAgentSession', 'acknowledgeAgentSessionStop']),
    sessionId: id, revision, state: z.enum(['completed', 'canceled']),
    resultReference: z.object({ type: z.literal('agent_session'), id, revision }).strict(),
    eventReference: z.object({ id, cursor: z.string().regex(/^\d+$/) }).strict().nullable(),
  }).strict().nullable(),
  cleanup: z.object({ cleanupSummary: z.string().min(1).max(10_000), residualRisks: z.array(z.string().min(1).max(1_000)).max(50) }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const confirmed = value.action.confirmation === 'confirmed'
  if (confirmed !== (value.originalResult !== null) || confirmed !== (value.action.unavailableReason === null)
    || (!confirmed && value.cleanup !== null) || (value.action.kind === 'complete' && value.cleanup !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid execution confirmation projection' })
  }
  if (value.originalResult && (value.originalResult.sessionId !== value.session.id
    || value.originalResult.resultReference.id !== value.session.id
    || value.originalResult.resultReference.revision !== value.originalResult.revision
    || value.originalResult.operationId !== (value.action.kind === 'complete' ? 'completeAgentSession' : 'acknowledgeAgentSessionStop')
    || value.originalResult.state !== (value.action.kind === 'complete' ? 'completed' : 'canceled'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Execution result must bind the exact action and Session' })
  }
})
export type AgentSessionExecutionResult = z.infer<typeof agentSessionExecutionResultResponseSchema>
const timestamp = z.union([z.string().datetime({ offset: true }), z.date().transform(value => value.toISOString())])
export const leaseResponseSchema = z.object({
  id, workspace_id: id, session_id: id, holder_actor_id: id,
  resource_type: z.enum(['work_item', 'plan_step']), resource_id: id,
  kind: z.enum(['exclusive', 'review_shared']), status: z.enum(['active', 'expired', 'released', 'revoked']),
  reason: z.string(), expires_at: timestamp, heartbeat_at: timestamp,
  renew_count: z.number().int().nonnegative(), version: revision, revision,
  released_at: timestamp.nullable(), released_by_actor_id: id.nullable(), audit_reason: z.string().nullable(),
  revoked_at: timestamp.nullable(), revoked_by_actor_id: id.nullable(), created_at: timestamp, updated_at: timestamp,
}).passthrough().refine(value => value.revision === value.version, { message: 'Lease revision must equal version' })
