import { describe, expect, it } from 'vitest'
import { workbenchExecutionWaitOptInSchema, workbenchSessionWaitSchema,
  workbenchRunnerSettleInputSchema, workbenchTurnQueuedEventPayloadSchema,
  workbenchTurnSettledEventPayloadSchema, workbenchRunnerAttemptSettledEventPayloadSchema } from './pi-workbench-contracts.js'

const approvalId = '00000000-0000-4000-8000-000000000001'
const actionPayloadHash = `sha256:${'a'.repeat(64)}`
describe('execution wait wire admission', () => {
  it('keeps legacy events and accepts only complete safe continuation lineage', () => {
    const queued = { conversationId: approvalId, turnId: approvalId, initiatedByActorId: approvalId }
    expect(workbenchTurnQueuedEventPayloadSchema.parse(queued)).toEqual(queued)
    const continuation = { ...queued, executionWaitId: approvalId, sourceTurnId: approvalId, triggerKind: 'approval' }
    expect(workbenchTurnQueuedEventPayloadSchema.parse(continuation)).toEqual(continuation)
    expect(workbenchTurnQueuedEventPayloadSchema.safeParse({ ...queued, executionWaitId: approvalId }).success).toBe(false)
    expect(workbenchTurnQueuedEventPayloadSchema.safeParse({ ...continuation, credentialHash: 'secret' }).success).toBe(false)
    const settled = { conversationId: approvalId, turnId: approvalId, runnerAttemptId: approvalId,
      outcome: 'settled', stopReason: null, errorCode: null, executionWaitId: approvalId }
    expect(workbenchTurnSettledEventPayloadSchema.parse(settled)).toEqual(settled)
    const attempt = { conversationId: approvalId, turnId: approvalId, runnerAttemptId: approvalId,
      attemptNo: 1, outcome: 'settled', usage: null, executionWaitId: approvalId }
    expect(workbenchRunnerAttemptSettledEventPayloadSchema.parse(attempt)).toEqual(attempt)
  })
  it('keeps old claim consumers opted out and rejects unknown switches', () => {
    expect(workbenchExecutionWaitOptInSchema.parse({})).toEqual({ executionWaits: false })
    expect(workbenchExecutionWaitOptInSchema.safeParse({ executionWaits: 'true' }).success).toBe(false)
    expect(workbenchExecutionWaitOptInSchema.safeParse({ executionWaits: true, force: true }).success).toBe(false)
  })
  it('requires exact approval hash and excludes approval data from input waits', () => {
    const value = { ifMatch: 1, state: 'awaiting_approval', reason: 'Waiting for Human decision',
      approval: { id: approvalId, actionPayloadHash } }
    expect(workbenchSessionWaitSchema.parse(value).approval?.actionPayloadHash).toBe(actionPayloadHash)
    for (const invalidHash of ['a'.repeat(64), `SHA256:${'a'.repeat(64)}`, `sha256:${'A'.repeat(64)}`])
      expect(workbenchSessionWaitSchema.safeParse({ ...value, approval: { id: approvalId, actionPayloadHash: invalidHash } }).success).toBe(false)
    expect(workbenchSessionWaitSchema.safeParse({ ...value, approval: undefined }).success).toBe(false)
    expect(workbenchSessionWaitSchema.safeParse({ ...value, state: 'awaiting_input' }).success).toBe(false)
  })
  it('permits only reconciled public settlement to register waiting', () => {
    const value = { fenceToken: 'valid-fence-token', assistantMessageMarkdown: 'Waiting for input.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Waiting', noArtifactReason: 'Awaiting Human input', externalEffectsReconciled: true },
      sessionWait: { ifMatch: 3, state: 'awaiting_input', reason: 'Please provide the target.' } }
    expect(workbenchRunnerSettleInputSchema.safeParse(value).success).toBe(true)
    expect(workbenchRunnerSettleInputSchema.safeParse({ ...value, settlement: { ...value.settlement, externalEffectsReconciled: false } }).success).toBe(false)
    expect(workbenchRunnerSettleInputSchema.safeParse({ ...value, assistantMessageMarkdown: undefined }).success).toBe(false)
    expect(workbenchRunnerSettleInputSchema.safeParse({ ...value, settlement: { ...value.settlement, outcome: 'aborted' } }).success).toBe(false)
    expect(workbenchRunnerSettleInputSchema.safeParse({ ...value, sessionCompletion: {
      ifMatch: 3, operationKey: `pi-${'b'.repeat(64)}`, body: { summary: 'Complete', noArtifactReason: 'Text only' },
    } }).success).toBe(false)
  })
})
