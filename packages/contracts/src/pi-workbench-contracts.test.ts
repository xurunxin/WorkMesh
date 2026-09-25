import { describe, expect, it } from 'vitest'
import {
  apiErrorCodeSchema,
  conversationContextPinResponseSchema,
  conversationCreateInputSchema,
  conversationMessageResponseSchema,
  conversationResponseSchema,
  conversationTurnCreateInputSchema,
  conversationTurnStopInputSchema,
  llmApiTypeSchema,
  llmConnectionCreateInputSchema,
  llmConnectionDetailResponseSchema,
  llmConnectionResponseSchema,
  llmConnectionUpdateInputSchema,
  llmModelResponseSchema,
  llmModelUpsertInputSchema,
  runnerAttemptResponseSchema,
  runnerAttemptSettleInputSchema,
  workbenchRunnerSettleInputSchema,
  completeAgentSessionInputSchema,
  turnResponseSchema,
  workbenchEventTypeSchema,
  workbenchLlmConnectionCreatedEventPayloadSchema,
  workbenchRelationModel,
  workbenchRunnerAttemptSettledEventPayloadSchema,
  workbenchToolInvocationResponseSchema,
  workbenchTurnSettledEventPayloadSchema,
  workbenchUsageSchema,
} from './index.js'

const id = 'a7e7dcbd-2ea9-4f9d-8d79-c86ee3df2438'
const otherId = 'b8f8dcbd-2ea9-4f9d-8d79-c86ee3df2439'
const thirdId = 'c9f9dcbd-2ea9-4f9d-8d79-c86ee3df243a'
const timestamp = '2026-09-24T00:00:00.000Z'

const conversation = {
  id,
  workspace_id: id,
  team_id: null,
  project_id: id,
  work_item_id: otherId,
  responsible_human_actor_id: otherId,
  title: 'Fix flaky stage4 integration test',
  status: 'active' as const,
  agent_session_id: thirdId,
  default_llm_connection_id: null,
  default_llm_model_id: null,
  context_pins: [],
  revision: 1,
  created_by_actor_id: otherId,
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: null,
}

const capabilities = {
  inputModalities: ['text'] as const,
  toolCalling: true,
  reasoning: false,
  contextWindowTokens: 128_000,
  maxOutputTokens: 4_096,
}

const llmConnection = {
  id,
  workspace_id: id,
  scope: 'personal' as const,
  scope_id: otherId,
  name: 'User OpenAI-compatible endpoint',
  api_type: 'openai-completions' as const,
  base_url: 'https://llm.example.internal/v1',
  status: 'active' as const,
  secret_status: 'configured' as const,
  can_manage: true,
  created_by_actor_id: otherId,
  revision: 1,
  created_at: timestamp,
  updated_at: timestamp,
  revoked_at: null,
}

const turn = (status: string, overrides: Record<string, unknown> = {}) => ({
  id,
  conversation_id: id,
  sequence: 1,
  status,
  initiated_by_actor_id: otherId,
  agent_session_id: thirdId,
  current_runner_attempt_id: null,
  stop_reason: null,
  error_code: null,
  queued_at: timestamp,
  dispatch_requested_at: null,
  started_at: null,
  settled_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
})

const runnerAttempt = (status: string, overrides: Record<string, unknown> = {}) => ({
  id,
  turn_id: id,
  conversation_id: id,
  agent_session_id: thirdId,
  attempt_no: 1,
  fence_token: 'fence-0123456789abcdef',
  status,
  runtime: 'pi_runner' as const,
  llm_connection_id: null,
  llm_model_id: null,
  supersedes_attempt_id: null,
  external_effects_reconciled: false,
  usage: null,
  stop_reason: null,
  error_code: null,
  started_at: timestamp,
  settled_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  ...overrides,
})

describe('Workbench conversation contracts', () => {
  it('keeps the responsible human and the bound agent session explicit', () => {
    const parsed = conversationResponseSchema.parse(conversation)
    expect(parsed.responsible_human_actor_id).toBe(otherId)
    expect(parsed.agent_session_id).toBe(thirdId)
  })

  it('rejects unknown conversation fields (strict DTOs)', () => {
    expect(() => conversationResponseSchema.parse({ ...conversation, sessionId: thirdId })).toThrow()
  })

  it('requires teamId only for team-scoped connections and never exposes secret material', () => {
    expect(() => llmConnectionCreateInputSchema.parse({
      scope: 'team', name: 'x', apiType: 'openai-completions', baseUrl: 'https://llm.example.internal/v1', secretMaterial: 'sk-test',
    })).toThrow()
    expect(() => llmConnectionCreateInputSchema.parse({
      scope: 'personal', teamId: otherId, name: 'x', apiType: 'openai-completions', baseUrl: 'https://llm.example.internal/v1', secretMaterial: 'sk-test',
    })).toThrow()
    expect(llmConnectionCreateInputSchema.parse({
      scope: 'team', teamId: otherId, name: 'x', apiType: 'openai-completions', baseUrl: 'https://llm.example.internal/v1', secretMaterial: 'sk-test',
    }).teamId).toBe(otherId)
  })

  it('exposes only secret_status on connection responses', () => {
    const parsed = llmConnectionResponseSchema.parse(llmConnection)
    expect(parsed.secret_status).toBe('configured')
    expect(() => llmConnectionResponseSchema.parse({ ...llmConnection, secret_ref: 'vault://x' })).toThrow()
    expect(() => llmConnectionResponseSchema.parse({ ...llmConnection, secret_material: 'sk-test' })).toThrow()
  })

  it('freezes the two supported upstream protocols', () => {
    expect(llmApiTypeSchema.options).toEqual(['openai-completions', 'openai-responses'])
  })

  it('carries model capabilities and connection detail with models', () => {
    const model = {
      id: otherId,
      connection_id: id,
      external_model_id: 'spike-model',
      display_name: 'Spike Chat Model',
      enabled: true,
      capabilities,
      revision: 1,
      created_at: timestamp,
      updated_at: timestamp,
    }
    const detail = llmConnectionDetailResponseSchema.parse({ ...llmConnection, models: [model] })
    expect(detail.models[0]?.capabilities.contextWindowTokens).toBe(128_000)
    expect(llmModelUpsertInputSchema.parse({ externalModelId: 'm', displayName: 'M', capabilities }).enabled).toBe(true)
    expect(llmModelResponseSchema.parse(model).external_model_id).toBe('spike-model')
  })

  it('allows partial connection updates with secret rotation', () => {
    expect(llmConnectionUpdateInputSchema.parse({ secretMaterial: 'sk-rotated' }).secretMaterial).toBe('sk-rotated')
    expect(() => llmConnectionUpdateInputSchema.parse({ scope: 'workspace' })).toThrow()
  })
})

describe('Workbench turn contracts', () => {
  it('accepts a queued turn without dispatch timestamps', () => {
    expect(turnResponseSchema.parse(turn('queued')).status).toBe('queued')
  })

  it('requires dispatch_requested_at once the turn leaves the queue', () => {
    expect(() => turnResponseSchema.parse(turn('running'))).toThrow()
    expect(turnResponseSchema.parse(turn('running', { dispatch_requested_at: timestamp, started_at: timestamp })).status).toBe('running')
  })

  it('requires settled_at exactly on terminal turns', () => {
    expect(() => turnResponseSchema.parse(turn('settled'))).toThrow()
    expect(() => turnResponseSchema.parse(turn('running', { dispatch_requested_at: timestamp, settled_at: timestamp }))).toThrow()
    expect(turnResponseSchema.parse(turn('stopped', {
      dispatch_requested_at: timestamp, started_at: timestamp, settled_at: timestamp, stop_reason: 'user_stop',
    })).stop_reason).toBe('user_stop')
  })

  it('binds authority_revoked stop reason to stopped turns', () => {
    expect(() => turnResponseSchema.parse(turn('failed', { dispatch_requested_at: timestamp, settled_at: timestamp, stop_reason: 'authority_revoked' }))).toThrow()
  })

  it('keeps turn creation idempotency in the transport header, not the body', () => {
    const input = conversationTurnCreateInputSchema.parse({ messageMarkdown: 'please look at #42' })
    expect(input.messageMarkdown).toBe('please look at #42')
    expect(() => conversationTurnCreateInputSchema.parse({ messageMarkdown: 'x', idempotencyKey: 'k' })).toThrow()
  })

  it('defaults stop mode to graceful', () => {
    expect(conversationTurnStopInputSchema.parse({ reason: 'user asked' }).stopMode).toBe('graceful')
  })

  it('rejects unknown fields in conversation creation', () => {
    expect(() => conversationCreateInputSchema.parse({ title: 't', responsibleHumanActorId: otherId })).toThrow()
    expect(conversationCreateInputSchema.parse({ title: 't' }).contextPins).toEqual([])
  })
})

describe('Workbench runner attempt contracts', () => {
  it('enforces single-writer fencing metadata', () => {
    expect(runnerAttemptResponseSchema.parse(runnerAttempt('running')).fence_token).toBe('fence-0123456789abcdef')
    expect(() => runnerAttemptResponseSchema.parse(runnerAttempt('running', { attempt_no: 2 }))).toThrow()
    expect(runnerAttemptResponseSchema.parse(runnerAttempt('running', { attempt_no: 2, supersedes_attempt_id: otherId })).attempt_no).toBe(2)
  })

  it('requires settled_at exactly on terminal attempts', () => {
    expect(() => runnerAttemptResponseSchema.parse(runnerAttempt('settled'))).toThrow()
    expect(() => runnerAttemptResponseSchema.parse(runnerAttempt('running', { settled_at: timestamp }))).toThrow()
    expect(runnerAttemptResponseSchema.parse(runnerAttempt('failed', {
      settled_at: timestamp, error_code: 'LLM_CONNECTION_EGRESS_BLOCKED',
    })).error_code).toBe('LLM_CONNECTION_EGRESS_BLOCKED')
  })

  it('requires completion evidence or an explicit no-artifact explanation', () => {
    expect(() => runnerAttemptSettleInputSchema.parse({ outcome: 'settled', summaryMarkdown: 'done' })).toThrow()
    expect(runnerAttemptSettleInputSchema.parse({ outcome: 'settled', summaryMarkdown: 'done', noArtifactReason: 'pure analysis' }).noArtifactReason).toBe('pure analysis')
    expect(runnerAttemptSettleInputSchema.parse({ outcome: 'failed', summaryMarkdown: 'upstream unreachable', errorCode: 'LLM_CONNECTION_EGRESS_BLOCKED' }).outcome).toBe('failed')
  })

  it('accepts an atomic Session completion only with a settled public Turn and matching completion contract', () => {
    const sessionCompletion = { ifMatch: 2, operationKey: `pi-${'a'.repeat(64)}`,
      body: { summary: 'Done', checks: [{ name: 'Document', status: 'passed', summary: 'Stored' }] } }
    const input = { fenceToken: 'f'.repeat(32), assistantMessageMarkdown: 'The document is ready.',
      settlement: { outcome: 'settled', summaryMarkdown: 'Answered', noArtifactReason: 'Workbench document' },
      sessionCompletion }
    const parsed = workbenchRunnerSettleInputSchema.parse(input)
    expect(completeAgentSessionInputSchema.parse(parsed.sessionCompletion?.body))
      .toMatchObject({ summary: 'Done', checks: [{ name: 'Document', status: 'passed' }] })
    expect(() => workbenchRunnerSettleInputSchema.parse({ ...input,
      assistantMessageMarkdown: undefined })).toThrow()
    expect(() => workbenchRunnerSettleInputSchema.parse({ ...input,
      settlement: { outcome: 'failed', summaryMarkdown: 'Failed' } })).toThrow()
    expect(() => workbenchRunnerSettleInputSchema.parse({ ...input,
      sessionCompletion: { ...sessionCompletion, body: { summary: 'Done' } } })).toThrow()
  })

  it('records usage with non-negative token counts', () => {
    expect(workbenchUsageSchema.parse({ inputTokens: 11, outputTokens: 7, totalTokens: 18 }).cacheReadTokens).toBe(0)
    expect(() => workbenchUsageSchema.parse({ inputTokens: -1, outputTokens: 0, totalTokens: 0 })).toThrow()
  })

  it('records the recovery invariant in the relation model', () => {
    const attempts = workbenchRelationModel.find(t => t.name === 'runner_attempts')
    expect(attempts?.invariants.some(i => i.includes('single writer'))).toBe(true)
    expect(attempts?.invariants.some(i => i.includes('external_effects_reconciled'))).toBe(true)
  })
})

describe('Workbench tool invocation ledger contracts', () => {
  it('records sanitized inputs, digests, and status', () => {
    const parsed = workbenchToolInvocationResponseSchema.parse({
      id,
      runner_attempt_id: id,
      turn_id: id,
      conversation_id: id,
      sequence: 1,
      tool_name: 'get_issue',
      status: 'succeeded',
      input_sanitized: { issueId: '42' },
      result_summary: 'Issue #42 title',
      usage: null,
      input_digest: `sha256:${'a'.repeat(64)}`,
      started_at: timestamp,
      finished_at: timestamp,
    })
    expect(parsed.status).toBe('succeeded')
    expect(parsed.input_digest).toBe(`sha256:${'a'.repeat(64)}`)
    expect(() => workbenchToolInvocationResponseSchema.parse({
      id, runner_attempt_id: id, turn_id: id, conversation_id: id, sequence: 1, tool_name: 'get_issue', status: 'succeeded', started_at: timestamp, input_digest: 'sha256:xyz',
    })).toThrow()
  })
})

describe('Workbench event contracts', () => {
  it('uses past-tense event names under the workbench aggregate', () => {
    for (const eventType of workbenchEventTypeSchema.options) {
      expect(eventType.startsWith('workbench.')).toBe(true)
      expect(eventType.split('.').at(-1)).toMatch(/(created|archived|appended|queued|dispatched|settled|started|superseded|updated|revoked)$/)
    }
  })

  it('never carries secrets or fence tokens in event payloads', () => {
    const settled = workbenchTurnSettledEventPayloadSchema.parse({
      conversationId: id, turnId: id, runnerAttemptId: null, outcome: 'stopped', stopReason: 'authority_revoked', errorCode: null,
    })
    expect(settled.outcome).toBe('stopped')
    const attemptSettled = workbenchRunnerAttemptSettledEventPayloadSchema.parse({
      conversationId: id, turnId: id, runnerAttemptId: id, attemptNo: 1, outcome: 'settled', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    })
    expect(attemptSettled.usage?.totalTokens).toBe(2)
    const connectionCreated = workbenchLlmConnectionCreatedEventPayloadSchema.parse({
      llmConnectionId: id, scope: 'personal', apiType: 'openai-responses',
    })
    expect(connectionCreated.apiType).toBe('openai-responses')
    expect(() => workbenchLlmConnectionCreatedEventPayloadSchema.parse({ llmConnectionId: id, scope: 'personal', apiType: 'openai-responses', secretMaterial: 'sk' })).toThrow()
    expect(() => workbenchRunnerAttemptSettledEventPayloadSchema.parse({
      conversationId: id, turnId: id, runnerAttemptId: id, attemptNo: 1, outcome: 'settled', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, fenceToken: 'fence',
    })).toThrow()
  })
})

describe('Workbench context pin contracts', () => {
  it('pins guidance and documents at explicit revisions', () => {
    const pin = conversationContextPinResponseSchema.parse({
      kind: 'guidance', refId: otherId, revision: null, resolvedRevision: 3, pinnedByActorId: otherId, pinnedAt: timestamp,
    })
    expect(pin.resolvedRevision).toBe(3)
    expect(() => conversationContextPinResponseSchema.parse({
      kind: 'artifact', refId: otherId, revision: null, resolvedRevision: null, pinnedByActorId: otherId, pinnedAt: timestamp,
    })).toThrow()
  })
})

describe('Workbench error codes', () => {
  it('registers the frozen workbench error codes in the unified contract', () => {
    for (const code of [
      'CONVERSATION_NOT_FOUND', 'CONVERSATION_ARCHIVED', 'CONVERSATION_TURN_QUEUE_LIMIT_EXCEEDED',
      'WORKBENCH_AUTHORITY_REVOKED', 'WORKBENCH_STOP_REQUIRED', 'RUNNER_FENCE_STALE', 'RUNNER_ATTEMPT_SUPERSEDED',
      'LLM_CONNECTION_NOT_FOUND', 'LLM_CONNECTION_FORBIDDEN', 'LLM_CONNECTION_PROTOCOL_UNSUPPORTED',
      'LLM_CONNECTION_EGRESS_BLOCKED', 'LLM_CONNECTION_SECRET_UNRESOLVED', 'LLM_MODEL_NOT_FOUND',
    ]) {
      expect(apiErrorCodeSchema.options).toContain(code)
    }
  })
})

describe('Workbench message contracts', () => {
  it('records public operational content with a nullable turn link', () => {
    const parsed = conversationMessageResponseSchema.parse({
      id,
      conversation_id: id,
      turn_id: null,
      sequence: 1,
      role: 'user',
      author_actor_id: otherId,
      content_markdown: 'Look up issue #42',
      runner_attempt_id: null,
      created_at: timestamp,
    })
    expect(parsed.role).toBe('user')
    expect(() => conversationMessageResponseSchema.parse({
      id, conversation_id: id, turn_id: null, sequence: 1, role: 'reasoning', author_actor_id: null, content_markdown: 'x', runner_attempt_id: null, created_at: timestamp,
    })).toThrow()
  })
})
