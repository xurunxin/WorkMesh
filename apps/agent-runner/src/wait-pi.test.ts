import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { createAgentCapabilityManifest, qualifyAgentCapabilityManifest, featureKeySchema, workbenchRunnerCredentialSchema } from '@workmesh/contracts'
import { RunnerApi, runPi } from './run-session.js'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('真实Pi等待工具停止模型和后续工具，不用RUNNER_ABORTED丢弃公开等待', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as Record<typeof featureKeySchema.options[number], boolean>
  const original = createAgentCapabilityManifest({ actorId: id, sessionId: id, sessionState: 'executing', sessionRevision: 2,
    effectiveCapabilities: ['work:read', 'work:write'], capabilityScope: { workspaceId: id, teamIds: [id], projectIds: [id], workItemIds: [], repositoryIds: [], capabilities: ['work:read', 'work:write'] },
    supportedProtocols: ['native_http'], pushConfigured: false, features })
  const manifest = qualifyAgentCapabilityManifest(original, { identity: { actorId: id, sessionId: id,
    credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'project' }, features, workItemId: null, projectId: id })
  let requests = 0
  let advertised: string[] = []
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', chunk => { raw += String(chunk) })
    request.on('end', () => {
      const body = JSON.parse(raw) as { tools?: Array<{ function: { name: string } }> }
      advertised = body.tools?.map(tool => tool.function.name) ?? []
      requests += 1
      const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(frame({ id: 'wait-call', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [
        { index: 0, id: 'call-wait', type: 'function', function: { name: 'workmesh_wait', arguments: JSON.stringify({ state: 'awaiting_input', reason: '请提供准确输入' }) } },
        { index: 1, id: 'call-late', type: 'function', function: { name: 'workmesh_append_activity', arguments: JSON.stringify({ kind: 'status', summary: '不得在等待后执行' }) } },
      ] }, finish_reason: null }] }) + frame({ id: 'wait-call', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('FIXTURE_PORT_MISSING')
    console.log(JSON.stringify({ runnerTestResource: { kind: 'fake_model_http', host: '127.0.0.1', port: address.port, status: 'created' } }))
    vi.stubEnv('WORKMESH_API_URL', 'http://127.0.0.1:3001')
    vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN', 'fixture-installation')
    vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN', 'fixture-runner-service-token-00000001')
    const api = new RunnerApi(id)
    const paths: string[] = []
    vi.spyOn(api, 'request').mockImplementation(async (_method, path) => {
      paths.push(path)
      if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest
      if (path === `/api/v1/workbench/runner-attempts/${id}/status`) return {
        sessionState: 'executing', delegationStatus: 'active', attemptStatus: 'running', turnStatus: 'running',
      }
      throw new Error('UNEXPECTED_TOOL_REQUEST')
    })
    const credential = workbenchRunnerCredentialSchema.parse({ runnerAttemptId: id, fenceToken: 'fixture-fence-token',
      baseUrl: `http://127.0.0.1:${address.port}`, apiType: 'openai-completions', apiKey: 'fixture-key',
      modelId: 'fixture-model', modelName: 'Fixture Model', capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false,
        contextWindowTokens: 20_000, maxOutputTokens: 1024 }, connectionRevision: 1, modelRevision: 1, executionWaitsEnabled: true,
      messages: [{ role: 'user', content_markdown: '请等待输入' }] })
    const result = await runPi(api, credential, id, new AbortController().signal)
    expect(result.waitIntent).toEqual({ state: 'awaiting_input', reason: '请提供准确输入' })
    expect(result.answer).toBe('请提供准确输入')
    expect(advertised).toContain('workmesh_wait')
    expect(paths[0]).toBe('/api/v1/agent-capabilities?discovery=qualified')
    expect(paths.slice(1).every(path => path === `/api/v1/workbench/runner-attempts/${id}/status`)).toBe(true)
    expect(requests).toBe(1)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    console.log(JSON.stringify({ runnerTestResource: { kind: 'fake_model_http', status: 'closed' } }))
  }
}, 60_000)
