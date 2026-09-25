// W08 error matrix: pins how the real Pi SDK normalizes upstream failures and how the
// runner's settle path reacts, using the same fake-upstream + real-SDK seam as the
// wire fixtures.
//
// Observed behaviour this pins (from probe-errors against SDK 0.87.1):
//   500 / 429 / abrupt stream close -> the SDK retries (4 requests over ~14s), the
//     turn then ends with NO assistant text instead of throwing. The runner's
//     answer guard turns that into a failed settlement rather than a silent success.
//   401 / invalid JSON / `finish_reason: 'length'` -> fail or resolve within one
//     request; again no assistant text.
// In every failure mode the runner must never publish an answer. That invariant --
// "an upstream failure cannot produce a settled public answer" -- is what these
// cases assert, alongside the retry counts that show no silent single-shot success.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { configuredModels } from './configured-model.js'

const cleanup: Array<() => Promise<void>> = []
const CASE_TIMEOUT_MS = 90_000

afterEach(async () => {
  while (cleanup.length) await cleanup.pop()?.()
})

type Scenario = 'status500' | 'status429' | 'status401' | 'invalidJson' | 'abruptClose' | 'incomplete'

const startUpstream = async (scenario: Scenario) => {
  const requests: number[] = []
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let raw = ''
    request.on('data', chunk => { raw += String(chunk) })
    request.on('end', () => {
      requests.push(requests.length + 1)
      if (scenario === 'status500' || scenario === 'status429' || scenario === 'status401') {
        const status = scenario === 'status500' ? 500 : scenario === 'status429' ? 429 : 401
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'fixture failure', type: 'fixture_error' } }))
        return
      }
      if (scenario === 'invalidJson') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end('data: {not json at all\n\n')
        return
      }
      if (scenario === 'abruptClose') {
        // Headers sent, then the socket dies mid-stream.
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.write('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')
        response.destroy()
        return
      }
      // incomplete: the model hit its output budget; a terminal but not a success.
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end([
        `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'Cut off' }, finish_reason: null }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'length' }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join(''))
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture upstream did not bind a port')
  const close = async () => { await new Promise<void>(resolve => server.close(() => resolve())) }
  cleanup.push(close)
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests, close: () => { /* closed in afterEach */ } }
}

const runFailingTurn = async (upstream: Awaited<ReturnType<typeof startUpstream>>) => {
  const credential = {
    runnerAttemptId: '11111111-1111-4111-8111-111111111111', fenceToken: 'fence-token-test-value',
    baseUrl: upstream.baseUrl, apiType: 'openai-completions' as const, apiKey: 'fixture-key-never-logged',
    modelId: 'fixture-model', modelName: 'Fixture Model',
    capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
      contextWindowTokens: 20_000, maxOutputTokens: 1_024 },
    connectionRevision: 1, modelRevision: 1,
    messages: [{ role: 'user', content_markdown: 'Hello.' }],
  }
  const root = mkdtempSync(join(tmpdir(), 'workmesh-error-'))
  const agentDir = join(root, 'agent'), stateDir = join(root, 'state'), workDir = join(root, 'work')
  for (const directory of [agentDir, stateDir, workDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify(configuredModels(credential as never)), { mode: 0o600 })

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  const previousKey = process.env.WORKMESH_RUNNER_MODEL_KEY
  process.env.PI_CODING_AGENT_DIR = agentDir
  process.env.WORKMESH_RUNNER_MODEL_KEY = credential.apiKey
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: join(agentDir, 'models.json'), authPath: join(stateDir, 'auth.json'),
      modelsStorePath: join(stateDir, 'models-store.json'), refreshOnCreate: true,
    })
    const model = runtime.getModel('workmesh-configured', credential.modelId)
    if (!model) throw new Error('RUNNER_MODEL_NOT_RESOLVED')
    const { session } = await createAgentSession({
      cwd: workDir, agentDir, model, modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(), noTools: 'builtin', customTools: [],
    })
    try {
      let rejection: Error | null = null
      try {
        await session.prompt('Hello.')
        await session.waitForIdle()
      } catch (error) {
        rejection = error instanceof Error ? error : new Error(String(error))
      }
      return {
        // Exactly what run-session.ts hands to its answer guard before settling.
        answer: session.getLastAssistantText()?.trim() ?? '',
        rejection,
        requestCount: upstream.requests.length,
      }
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

describe('W08 error matrix: upstream failures must not publish an answer', () => {
  const failureModes: Array<{ scenario: Scenario; expectRetries: boolean }> = [
    { scenario: 'status500', expectRetries: true },
    { scenario: 'status429', expectRetries: true },
    { scenario: 'status401', expectRetries: false },
    { scenario: 'invalidJson', expectRetries: false },
    { scenario: 'abruptClose', expectRetries: true },
    { scenario: 'incomplete', expectRetries: false },
  ]

  for (const { scenario, expectRetries } of failureModes) {
    it(`leaves no publishable answer when the upstream returns ${scenario}`, async () => {
      const upstream = await startUpstream(scenario)
      const result = await runFailingTurn(upstream)

      // The runner's answer guard (`RUNNER_ANSWER_INVALID` in run-session.ts) treats
      // an empty assistant text as a failed settlement, so an upstream outage can
      // never be published as a public answer.
      expect(result.answer).toBe('')
      if (expectRetries) expect(result.requestCount).toBeGreaterThan(1)
    }, CASE_TIMEOUT_MS)
  }
})
