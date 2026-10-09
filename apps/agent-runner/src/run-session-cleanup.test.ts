import { expect, it, vi } from 'vitest'
import { createAgentCapabilityManifest, featureKeySchema, qualifyAgentCapabilityManifest } from '@workmesh/contracts'
import { executeTurn, removeScratch, RunnerApi } from './run-session.js'

const fixture = vi.hoisted(() => ({ scratch: '', failCleanup: true, finishModel: undefined as (() => void) | undefined,
  failIdle: false, dispose: vi.fn(), abort: vi.fn() }))
vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs')>()
  return { ...real, mkdtempSync: (...args: Parameters<typeof real.mkdtempSync>) => {
    const directory = real.mkdtempSync(...args)
    if (typeof directory === 'string' && directory.includes('workmesh-runner-')) fixture.scratch = directory
    return directory
  }, rmSync: (...args: Parameters<typeof real.rmSync>) => {
    if (fixture.failCleanup && String(args[0]).includes('workmesh-runner-')) {
      fixture.scratch = String(args[0])
      fixture.failCleanup = false
      throw new Error('FIXTURE_OWNED_SCRATCH_CLEANUP_FAILURE')
    }
    return real.rmSync(...args)
  } }
})
vi.mock('./workbench-skill.js', () => ({ createWorkbenchSkillLoader: async () => ({}) }))
vi.mock('@earendil-works/pi-coding-agent', () => ({
  ModelRuntime: { create: async () => ({ getModel: () => ({}) }) },
  SessionManager: { inMemory: () => ({}) },
  createAgentSession: async () => ({ session: {
    prompt: () => new Promise<void>(resolve => { fixture.finishModel = resolve }),
    waitForIdle: async () => undefined,
    abort: async () => {
      fixture.abort(); fixture.finishModel?.()
      if (fixture.failIdle && fixture.abort.mock.calls.length > 1) throw new Error('FIXTURE_IDLE_UNCONFIRMED')
    },
    dispose: fixture.dispose,
    getLastAssistantText: () => '不得在 Stop 后发布',
  } }),
}))

it.each(['scratch', 'idle'])('模型 Stop 后 %s 失败仍执行专用 finally，且不普通 settle/release/Activity', async failure => {
  fixture.scratch = ''
  fixture.failCleanup = failure === 'scratch'
  fixture.failIdle = failure === 'idle'
  fixture.abort.mockClear()
  fixture.dispose.mockClear()
  const id = '11111111-1111-4111-8111-111111111111'
  vi.stubEnv('WORKMESH_API_URL', 'http://127.0.0.1:3001')
  vi.stubEnv('WORKMESH_AGENT_INSTALLATION_TOKEN', 'fixture-installation')
  vi.stubEnv('WORKMESH_RUNNER_SERVICE_TOKEN', 'fixture-runner-service-token-00000001')
  const api = new RunnerApi(id)
  const features = Object.fromEntries(featureKeySchema.options.map(key => [key, true])) as Record<typeof featureKeySchema.options[number], boolean>
  const original = createAgentCapabilityManifest({ actorId: id, sessionId: id, sessionState: 'executing', sessionRevision: 2,
    effectiveCapabilities: ['work:read', 'work:write'], capabilityScope: { workspaceId: id, teamIds: [id], projectIds: [id], workItemIds: [], repositoryIds: [], capabilities: ['work:read', 'work:write'] },
    supportedProtocols: ['native_http'], pushConfigured: false, features })
  const manifest = qualifyAgentCapabilityManifest(original, { identity: { actorId: id, sessionId: id,
    credentialMode: 'agent_session', sessionKind: 'execution', delegationRole: 'executor', delegationScopeType: 'project' }, features, workItemId: null, projectId: id })
  const credential = { runnerAttemptId: id, fenceToken: 'fixture-fence-token', baseUrl: 'http://127.0.0.1:4000',
    apiType: 'openai-completions', apiKey: 'fixture-model-key', modelId: 'fixture-model', modelName: 'Fixture Model',
    capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 20000, maxOutputTokens: 1024 },
    connectionRevision: 1, modelRevision: 1, messages: [{ role: 'user', content_markdown: '测试 Stop' }] }
  const paths: string[] = []
  vi.spyOn(api, 'request').mockImplementation(async (_method, path) => {
    paths.push(path)
    if (path.endsWith('/claim')) return { runnerAttemptId: id }
    if (path.endsWith('/credential')) return credential
    if (path.endsWith('/start')) return {}
    if (path === '/api/v1/agent-capabilities?discovery=qualified') return manifest
    if (path.endsWith('/status')) return { attemptStatus: 'running', turnStatus: 'running', sessionState: 'stopping', delegationStatus: 'active' }
    throw new Error('UNEXPECTED_ORDINARY_REQUEST')
  })
  const cleanup = vi.spyOn(api, 'stopAfterCleanup').mockResolvedValue(undefined)
  try {
    await expect(executeTurn(api, { turnId: id, conversationId: id }, new AbortController().signal)).resolves.toBe('failed')
    expect(fixture.abort).toHaveBeenCalledTimes(2)
    expect(fixture.dispose).toHaveBeenCalledOnce()
    expect(cleanup).toHaveBeenCalledWith(failure === 'scratch' ? 'Pi model stopped; Runner scratch cleanup failed.'
      : 'Pi model idle could not be confirmed; Runner scratch retained.',
      [...(failure === 'idle' ? ['The Pi model did not confirm idle; inspect the Runner process before cleaning its owned temporary resources.'] : []),
        'Runner scratch cleanup failed; its owned temporary resources require operator inspection.'], `runner-stop-cleanup-${id}`)
    expect(paths.some(path => path.endsWith('/settle') || path.endsWith('/release') || path.endsWith('/activities'))).toBe(false)
    expect(fixture.scratch).toContain('workmesh-runner-')
  } finally {
    // The injected failure is exhausted; remove only this now-idle, validated Runner scratch.
    if (fixture.scratch) {
      removeScratch(fixture.scratch)
      console.log(JSON.stringify({ runnerTestResource: { kind: 'scratch', path: fixture.scratch, status: 'removed_after_injected_failure' } }))
    }
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  }
})
