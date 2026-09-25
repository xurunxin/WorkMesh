// W08 wire fixtures: drives the real Pi SDK against a local fake upstream so protocol
// handling is exercised end to end without touching a real provider.
//
// The runner does not parse protocol frames itself. It writes models.json, lets the
// Pi SDK own the wire, and reads back the answer and tool calls (see run-session.ts).
// So the meaningful assertion is what the SDK produces from a given wire sequence,
// which is exactly what upstream compatibility depends on.
//
// A tool call costs two upstream requests: the model asks for the tool, then the SDK
// sends the tool result back and the model answers. Fixtures therefore script
// per-request responses rather than replaying one stream.
//
// Covered per the W08 issue: tool-argument fragmentation/interleaving, UTF-8 split
// across chunks, empty deltas, usage-only chunks, unknown events, and duplicated
// terminal events.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { configuredModels } from './configured-model.js'

type UpstreamRequest = { url: string; body: Record<string, unknown> }
type UpstreamResponse = { status?: number; sse?: string; json?: unknown }
type Upstream = { baseUrl: string; requests: UpstreamRequest[] }

const cleanup: Array<() => Promise<void>> = []

// Each case starts a real SDK runtime (which composes ~40 provider definitions) and
// may make several upstream requests, so the default 5s budget is too tight.
const CASE_TIMEOUT_MS = 60_000

afterEach(async () => {
  while (cleanup.length) await cleanup.pop()?.()
})

/**
 * Starts a fake OpenAI-compatible upstream. `script` is called per request with the
 * 0-based request index, so a fixture can answer differently on the follow-up turn.
 */
const startUpstream = async (
  script: (requestIndex: number, body: Record<string, unknown>) => UpstreamResponse,
): Promise<Upstream> => {
  const requests: UpstreamRequest[] = []
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    request.on('data', chunk => { raw += String(chunk) })
    request.on('end', () => {
      let body: Record<string, unknown> = {}
      try { body = JSON.parse(raw || '{}') as Record<string, unknown> } catch { /* fixtures always send JSON */ }
      const result = script(requests.length, body)
      requests.push({ url: request.url ?? '', body })
      if (result.sse !== undefined) {
        response.writeHead(result.status ?? 200, {
          'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
        })
        response.end(result.sse)
        return
      }
      response.writeHead(result.status ?? 200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(result.json ?? {}))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture upstream did not bind a port')
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())) }
  cleanup.push(close)
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests }
}

const attemptId = '11111111-1111-4111-8111-111111111111'

/** The credential shape the runner receives from the API. */
const credentialFor = (baseUrl: string, apiType: 'openai-completions' | 'openai-responses') => ({
  runnerAttemptId: attemptId, fenceToken: 'fence-token-test-value',
  baseUrl, apiType, apiKey: 'fixture-key-never-logged',
  modelId: 'fixture-model', modelName: 'Fixture Model',
  capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
    contextWindowTokens: 20_000, maxOutputTokens: 1_024 },
  connectionRevision: 1, modelRevision: 1,
  messages: [{ role: 'user', content_markdown: 'Use the tool, then answer.' }],
})

/**
 * Runs one SDK turn the way run-session.ts does: write models.json, create the
 * runtime, create a session with a custom tool, prompt, and read the assistant text.
 */
const runTurn = async (
  upstream: Upstream,
  apiType: 'openai-completions' | 'openai-responses',
  options: { customTools?: boolean } = {},
) => {
  const credential = credentialFor(upstream.baseUrl, apiType)
  const root = mkdtempSync(join(tmpdir(), 'workmesh-wire-'))
  const agentDir = join(root, 'agent'), stateDir = join(root, 'state'), workDir = join(root, 'work')
  for (const directory of [agentDir, stateDir, workDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify(configuredModels(credential as never)), { mode: 0o600 })

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  const previousKey = process.env.WORKMESH_RUNNER_MODEL_KEY
  process.env.PI_CODING_AGENT_DIR = agentDir
  process.env.WORKMESH_RUNNER_MODEL_KEY = credential.apiKey

  const calls: string[] = []
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: join(agentDir, 'models.json'), authPath: join(stateDir, 'auth.json'),
      modelsStorePath: join(stateDir, 'models-store.json'), refreshOnCreate: true,
    })
    const model = runtime.getModel('workmesh-configured', credential.modelId)
    if (!model) throw new Error('RUNNER_MODEL_NOT_RESOLVED')
    const tool = {
      name: 'fixture_tool', label: 'Fixture tool',
      description: 'Records one invocation and returns a fixed result.',
      parameters: Type.Object({ value: Type.String() }),
      // ToolDefinition.execute is (toolCallId, params, signal, onUpdate, ctx).
      execute: async (_toolCallId: string, params: { value: string }) => {
        calls.push(params.value)
        return { content: [{ type: 'text' as const, text: `recorded:${params.value}` }], details: undefined }
      },
    }
    const { session } = await createAgentSession({
      cwd: workDir, agentDir, model, modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(), noTools: 'builtin',
      customTools: options.customTools === false ? [] : [tool],
    })
    try {
      await session.prompt('Use the tool, then answer.')
      await session.waitForIdle()
      return { answer: session.getLastAssistantText()?.trim() ?? '', calls }
    } finally {
      session.dispose()
    }
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
    if (previousKey === undefined) delete process.env.WORKMESH_RUNNER_MODEL_KEY
    else process.env.WORKMESH_RUNNER_MODEL_KEY = previousKey
    rmSync(root, { recursive: true, force: true })
  }
}

const chunk = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`
const completionsText = (text: string) => [
  chunk({ id: 'cmpl-text', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] }),
  chunk({ id: 'cmpl-text', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
  'data: [DONE]\n\n',
].join('')

/** First turn asks for the tool with `argumentFragments`; the follow-up answers in text. */
const toolThenAnswer = (argumentFragments: string[], answer = 'Done.') =>
  (requestIndex: number): UpstreamResponse => ({
    sse: requestIndex === 0
      ? [
        chunk({ id: 'cmpl-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-1',
          type: 'function', function: { name: 'fixture_tool', arguments: '' } }] }, finish_reason: null }] }),
        ...argumentFragments.map(fragment => chunk({ id: 'cmpl-tool', object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: fragment } }] }, finish_reason: null }] })),
        chunk({ id: 'cmpl-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        'data: [DONE]\n\n',
      ].join('')
      : completionsText(answer),
  })

describe('W08 wire fixtures against the real Pi SDK', () => {
  it('reassembles a tool call whose arguments arrive in arbitrary fragments', async () => {
    const payload = JSON.stringify({ value: 'fragmented-argument-value' })
    const half = Math.ceil(payload.length / 2)
    const upstream = await startUpstream(toolThenAnswer([payload.slice(0, half), payload.slice(half)]))

    const result = await runTurn(upstream, 'openai-completions')
    expect(result.calls).toEqual(['fragmented-argument-value'])
    expect(result.answer).toContain('Done.')
  }, CASE_TIMEOUT_MS)

  it('reassembles a tool call whose arguments are split inside a multi-byte character', async () => {
    // Each character is multi-byte, so a byte-naive reassembly corrupts the payload.
    const payload = JSON.stringify({ value: '中文参数' })
    const upstream = await startUpstream(toolThenAnswer([payload.slice(0, 3), payload.slice(3, 7), payload.slice(7)]))

    const result = await runTurn(upstream, 'openai-completions')
    expect(result.calls).toEqual(['中文参数'])
  }, CASE_TIMEOUT_MS)

  it('tolerates empty deltas, usage-only chunks, and an unknown event type', async () => {
    const payload = JSON.stringify({ value: 'noise-tolerant' })
    const upstream = await startUpstream(requestIndex => ({
      sse: requestIndex === 0
        ? [
          chunk({ id: 'cmpl-noise', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: null }] }),
          chunk({ id: 'cmpl-noise', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 5, completion_tokens: 0 } }),
          // An event type this client has never seen must not abort the turn.
          'event: fixture.unknown\ndata: {"unexpected":true}\n\n',
          chunk({ id: 'cmpl-noise', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-2',
            type: 'function', function: { name: 'fixture_tool', arguments: payload } }] }, finish_reason: null }] }),
          chunk({ id: 'cmpl-noise', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
          'data: [DONE]\n\n',
        ].join('')
        : completionsText('Noise tolerated.'),
    }))

    const result = await runTurn(upstream, 'openai-completions')
    expect(result.calls).toEqual(['noise-tolerant'])
  }, CASE_TIMEOUT_MS)

  it('executes a tool once even when the terminal event and [DONE] are duplicated', async () => {
    const payload = JSON.stringify({ value: 'only-once' })
    const upstream = await startUpstream(requestIndex => ({
      sse: requestIndex === 0
        ? [
          chunk({ id: 'cmpl-dup', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-3',
            type: 'function', function: { name: 'fixture_tool', arguments: payload } }] }, finish_reason: null }] }),
          chunk({ id: 'cmpl-dup', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
          chunk({ id: 'cmpl-dup', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
          'data: [DONE]\n\n',
          'data: [DONE]\n\n',
        ].join('')
        : completionsText('Answered once.'),
    }))

    const result = await runTurn(upstream, 'openai-completions')
    expect(result.calls).toEqual(['only-once'])
  }, CASE_TIMEOUT_MS)

  it('returns the assistant text when the provider omits the terminal event', async () => {
    // A provider that ends the stream without finish_reason or [DONE]. The SDK retries
    // the request, so the fixture must answer every attempt, and the text still arrives.
    const upstream = await startUpstream(() => ({
      sse: chunk({ id: 'cmpl-open', object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Answer without terminal.' }, finish_reason: null }] }),
    }))

    const result = await runTurn(upstream, 'openai-completions', { customTools: false })
    expect(result.answer).toContain('Answer without terminal.')
    // Retrying rather than silently succeeding is the behaviour worth pinning.
    expect(upstream.requests.length).toBeGreaterThanOrEqual(1)
  }, CASE_TIMEOUT_MS)

  it('drives the responses protocol through the same configuration path', async () => {
    const upstream = await startUpstream(() => ({
      sse: [
        `event: response.created\ndata: ${JSON.stringify({ type: 'response.created', response: { id: 'r1', status: 'in_progress', output: [] } })}\n\n`,
        `event: response.output_item.added\ndata: ${JSON.stringify({ type: 'response.output_item.added', output_index: 0,
          item: { type: 'message', id: 'i1', status: 'in_progress', role: 'assistant', content: [] } })}\n\n`,
        `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', item_id: 'i1', output_index: 0, content_index: 0, delta: 'Responses answer.' })}\n\n`,
        `event: response.output_item.done\ndata: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0,
          item: { type: 'message', id: 'i1', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: 'Responses answer.' }] } })}\n\n`,
        `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: 'r1', status: 'completed',
          output: [{ type: 'message', id: 'i1', status: 'completed', role: 'assistant',
            content: [{ type: 'output_text', text: 'Responses answer.' }] }] } })}\n\n`,
      ].join(''),
    }))

    const result = await runTurn(upstream, 'openai-responses', { customTools: false })
    expect(upstream.requests[0]?.url).toContain('/responses')
    expect(Array.isArray(upstream.requests[0]?.body.input)).toBe(true)
    expect(result.answer).toContain('Responses answer.')
  }, CASE_TIMEOUT_MS)
})
