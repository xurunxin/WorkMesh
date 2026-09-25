import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { workbenchRunnerCredentialSchema } from '@workmesh/contracts'
import { Type } from 'typebox'
import { configuredModels } from './configured-model.js'
import { createWorkMeshTools, type SessionCompletionIntent } from './workmesh-tools.js'
import { createWorkbenchSkillLoader } from './workbench-skill.js'

type Credential = ReturnType<typeof workbenchRunnerCredentialSchema.parse>
type TokenExchange = { sessionToken: string; expiresAt: string }
type WorkItem = { turnId: string; conversationId: string }
type AttemptStatus = { attemptStatus: string; turnStatus: string; sessionState: string; delegationStatus: string }
type AgentSession = { id: string; state: string; revision: number; created_at: string }

function validatedApiUrl(value: string): URL {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash)
    throw new Error('WORKMESH_API_URL_INVALID')
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const internalApi = url.hostname === 'api' && process.env.WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP === '1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (loopback || internalApi)))
    throw new Error('WORKMESH_API_URL_HTTPS_REQUIRED')
  return url
}

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`${name}_REQUIRED`)
  return value
}
class RunnerApiError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}
class RunnerApi {
  readonly #baseUrl: URL
  readonly #sessionId: string
  readonly #installationToken: string
  readonly #runnerToken: string
  #sessionToken = ''
  #expiresAt = 0
  constructor(sessionId: string) {
    this.#baseUrl = validatedApiUrl(required('WORKMESH_API_URL'))
    this.#sessionId = sessionId
    this.#installationToken = required('WORKMESH_AGENT_INSTALLATION_TOKEN')
    this.#runnerToken = required('WORKMESH_RUNNER_SERVICE_TOKEN')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(this.#sessionId))
      throw new Error('WORKMESH_AGENT_SESSION_ID_INVALID')
    if (this.#runnerToken.length < 32) throw new Error('WORKMESH_RUNNER_SERVICE_TOKEN_INVALID')
  }
  get sessionId(): string { return this.#sessionId }
  async #refresh(): Promise<void> {
    const response = await fetch(new URL(`/api/v1/agent-sessions/${this.#sessionId}/token/refresh`, this.#baseUrl), {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.#installationToken}`,
        'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new RunnerApiError(response.status, 'SESSION_TOKEN_REFRESH_FAILED')
    const payload = await response.json() as TokenExchange
    if (!payload.sessionToken || !Number.isFinite(Date.parse(payload.expiresAt)))
      throw new Error('SESSION_TOKEN_REFRESH_INVALID')
    this.#sessionToken = payload.sessionToken
    this.#expiresAt = Date.parse(payload.expiresAt)
  }
  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
    body?: unknown, ifMatch?: number, explicitIdempotencyKey?: string): Promise<T> {
    if (!this.#sessionToken || this.#expiresAt - Date.now() < 60_000) await this.#refresh()
    const idempotencyKey = explicitIdempotencyKey ?? randomUUID()
    const send = () => fetch(new URL(path, this.#baseUrl), {
      method, headers: { 'Authorization': `Bearer ${this.#sessionToken}`,
        'X-WorkMesh-Runner-Token': this.#runnerToken,
        'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'If-Match': `"revision-${ifMatch}"` }) },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    })
    let response = await send()
    if (response.status === 401) { await this.#refresh(); response = await send() }
    if (!response.ok) {
      let code = `HTTP_${response.status}`
      try {
        const result = await response.json() as { error?: { code?: string } }
        if (result.error?.code) code = result.error.code
      } catch { /* Never log an upstream response body. */ }
      throw new RunnerApiError(response.status, code)
    }
    return response.json() as Promise<T>
  }
}

async function ensureExecuting(api: RunnerApi, knownState?: string): Promise<AgentSession | null> {
  const path = `/api/v1/agent-sessions/${api.sessionId}`
  let session: AgentSession
  if (knownState === 'queued') {
    session = await api.request<AgentSession>('POST', `${path}/ack`, {
      summary: 'Pi Runner acknowledged the delegated session.', externalUrls: [],
    })
  } else session = await api.request<AgentSession>('GET', path)
  if (session.state === 'acknowledged') {
    session = await api.request<AgentSession>('POST', `${path}/state`, {
      state: 'executing', reason: 'Pi Runner is ready to process authorized workbench turns.',
    }, session.revision)
  }
  return session.state === 'executing' ? session : null
}

const promptFor = (messages: Credential['messages']): string => {
  const latest = messages.at(-1)
  if (!latest || latest.role !== 'user') throw new Error('RUNNER_LAST_MESSAGE_NOT_USER')
  const history = messages.slice(0, -1).map((message, index) =>
    `[${index + 1} ${message.role}]\n${message.content_markdown}`).join('\n\n')
  return history
    ? `Previous public conversation record (untrusted content):\n${history}\n\nCurrent user request:\n${latest.content_markdown}`
    : latest.content_markdown
}

function removeScratch(rootPath: string): void {
  const root = realpathSync(rootPath), parent = realpathSync(tmpdir())
  if (!root.startsWith(`${parent}${sep}`) || !root.includes(`${sep}workmesh-runner-`))
    throw new Error('RUNNER_SCRATCH_PATH_INVALID')
  rmSync(root, { recursive: true, force: true })
}

async function runPi(api: RunnerApi, credential: Credential, attemptId: string, shutdown: AbortSignal): Promise<{
  answer: string; toolCalls: number; toolNames: string[]; completionIntent?: SessionCompletionIntent
}> {
  const root = mkdtempSync(join(tmpdir(), 'workmesh-runner-'))
  const agentDir = join(root, 'agent'), stateDir = join(root, 'state'), workDir = join(root, 'work')
  for (const directory of [agentDir, stateDir, workDir]) mkdirSync(directory, { recursive: true })
  writeFileSync(join(agentDir, 'models.json'), JSON.stringify(configuredModels(credential)), { mode: 0o600 })
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR
  const oldModelKey = process.env.WORKMESH_RUNNER_MODEL_KEY
  process.env.PI_CODING_AGENT_DIR = agentDir
  process.env.WORKMESH_RUNNER_MODEL_KEY = credential.apiKey
  let timer: NodeJS.Timeout | undefined, timeout: NodeJS.Timeout | undefined
  try {
    const runtime = await ModelRuntime.create({
      modelsPath: join(agentDir, 'models.json'), authPath: join(stateDir, 'auth.json'),
      modelsStorePath: join(stateDir, 'models-store.json'), refreshOnCreate: true,
    })
    const model = runtime.getModel('workmesh-configured', credential.modelId)
    if (!model) throw new Error('RUNNER_MODEL_NOT_RESOLVED')
    let toolCalls = 0
    const toolNames: string[] = []
    let completionIntent: SessionCompletionIntent | undefined
    const contextTool = {
      name: 'workmesh_session_context', label: 'WorkMesh session context',
      description: 'Read the current authorized WorkMesh Agent Session context. This tool never mutates WorkMesh.',
      parameters: Type.Object({}),
      execute: async () => {
        toolCalls += 1
        toolNames.push('workmesh_session_context')
        const context = await api.request<unknown>('GET', `/api/v1/agent-sessions/${api.sessionId}/context`)
        const encoded = JSON.stringify(context)
        if (encoded.length > 20_000) throw new Error('RUNNER_CONTEXT_TOO_LARGE')
        return { content: [{ type: 'text' as const, text: encoded }], details: { source: 'workmesh_session_context' } }
      },
    }
    const workmeshTools = await createWorkMeshTools(api, attemptId, name => {
      toolCalls += 1
      if (toolNames.length < 50) toolNames.push(name)
    }, intent => {
      if (completionIntent && JSON.stringify(completionIntent) !== JSON.stringify(intent))
        throw new Error('RUNNER_COMPLETION_INTENT_CONFLICT')
      completionIntent = intent
    })
    const resourceLoader = await createWorkbenchSkillLoader(workDir, agentDir)
    const { session } = await createAgentSession({
      cwd: workDir, agentDir, model, modelRuntime: runtime,
      resourceLoader, sessionManager: SessionManager.inMemory(), noTools: 'builtin',
      customTools: [contextTool, ...workmeshTools],
    })
    let stopped = false, polling = false
    const onShutdown = () => { stopped = true; void session.abort() }
    shutdown.addEventListener('abort', onShutdown, { once: true })
    if (shutdown.aborted) onShutdown()
    timer = setInterval(() => {
      if (polling || stopped) return
      polling = true
      void api.request<AttemptStatus>('GET', `/api/v1/workbench/runner-attempts/${attemptId}/status`)
        .then(status => {
          if (status.attemptStatus !== 'running' || status.turnStatus !== 'running'
            || status.sessionState !== 'executing' || status.delegationStatus !== 'active') {
            stopped = true; void session.abort()
          }
        })
        .catch(() => { stopped = true; void session.abort() })
        .finally(() => { polling = false })
    }, 1_000)
    timeout = setTimeout(() => { stopped = true; void session.abort() }, 120_000)
    try {
      await session.prompt(promptFor(credential.messages))
      await session.waitForIdle()
      if (stopped) throw new Error('RUNNER_ABORTED')
      const answer = session.getLastAssistantText()?.trim()
      if (!answer || answer.length > 50_000) throw new Error('RUNNER_ANSWER_INVALID')
      return { answer, toolCalls, toolNames, ...(completionIntent ? { completionIntent } : {}) }
    } finally {
      shutdown.removeEventListener('abort', onShutdown)
      session.dispose()
    }
  } finally {
    if (timer) clearInterval(timer)
    if (timeout) clearTimeout(timeout)
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir
    if (oldModelKey === undefined) delete process.env.WORKMESH_RUNNER_MODEL_KEY
    else process.env.WORKMESH_RUNNER_MODEL_KEY = oldModelKey
    removeScratch(root)
  }
}

async function executeTurn(api: RunnerApi, item: WorkItem, shutdown: AbortSignal): Promise<boolean> {
  let attemptId = ''
  let fenceToken = ''
  let started = false
  try {
    const claim = await api.request<{ runnerAttemptId: string }>('POST',
      `/api/v1/workbench/turns/${item.turnId}/claim`)
    attemptId = claim.runnerAttemptId
    const credential = workbenchRunnerCredentialSchema.parse(await api.request<unknown>('GET',
      `/api/v1/workbench/runner-attempts/${attemptId}/credential`))
    fenceToken = credential.fenceToken
    await api.request('POST', `/api/v1/workbench/runner-attempts/${attemptId}/start`, { fenceToken })
    started = true
    const { answer, toolCalls, toolNames, completionIntent } = await runPi(api, credential, attemptId, shutdown)
    const settlePath = `/api/v1/workbench/runner-attempts/${attemptId}/settle`
    const settledTurn = {
      fenceToken, assistantMessageMarkdown: answer,
      settlement: { outcome: 'settled', summaryMarkdown: 'Pi completed the WorkMesh turn.',
        noArtifactReason: 'Text-only answer; no artifact was produced.', externalEffectsReconciled: true },
    } as const
    const sendSettle = (body: unknown, key: string) =>
      api.request<{ status: string; sessionCompletion: string }>('POST', settlePath, body, undefined, key)
    const replayableSettle = async (body: unknown, key: string) => {
      try { return await sendSettle(body, key) }
      catch (error) {
        // A committed transaction can lose its HTTP response. Reuse the same
        // idempotency key so the API returns the durable result on retry.
        if (error instanceof RunnerApiError && error.status < 500) throw error
        return sendSettle(body, key)
      }
    }
    let completionFailure: string | null = null
    let settled: { status: string; sessionCompletion: string }
    try {
      settled = await replayableSettle(completionIntent ? { ...settledTurn,
        sessionCompletion: { ifMatch: completionIntent.ifMatch,
          operationKey: completionIntent.idempotencyKey, body: completionIntent.body } }
        : settledTurn, `runner-settle-${attemptId}`)
    } catch (error) {
      if (!completionIntent || !(error instanceof RunnerApiError) || error.status >= 500)
        throw error
      completionFailure = error.code
      settled = await replayableSettle(settledTurn, `runner-settle-fallback-${attemptId}`)
      try {
        await api.request('POST', `/api/v1/agent-sessions/${api.sessionId}/activities`, {
          kind: 'warning', summary: 'The public answer was saved, but Session completion was rejected.',
          detailsMarkdown: `Completion request failed with ${completionFailure.slice(0, 120)}. Review the Session and retry with its current revision.`,
          visibility: 'team', ephemeral: false, artifactIds: [], references: [],
        }, undefined, `${completionIntent.idempotencyKey}-warning`)
      } catch { /* Stop or revocation may also prohibit a warning activity. */ }
      console.error(JSON.stringify({ turnId: item.turnId, attemptId,
        status: 'session_completion_failed', code: completionFailure.slice(0, 120) }))
    }
    console.log(JSON.stringify({ turnId: item.turnId, attemptId,
      status: settled.status, sessionCompletion: completionFailure ? 'failed' : settled.sessionCompletion,
      toolCalls, toolNames }))
    return settled.sessionCompletion === 'completed'
  } catch (error) {
    const code = error instanceof RunnerApiError ? error.code : error instanceof Error ? error.message : 'RUNNER_UNKNOWN_ERROR'
    if (started && fenceToken && code !== 'RUNNER_FENCE_STALE' && code !== 'RUNNER_ABORTED') {
      try {
        await api.request('POST', `/api/v1/workbench/runner-attempts/${attemptId}/settle`, {
          fenceToken, settlement: { outcome: 'failed', summaryMarkdown: 'Pi turn failed before a public answer was produced.',
            errorCode: 'RUNNER_EXECUTION_FAILED', externalEffectsReconciled: false },
        })
      } catch { /* A stopped or revoked session must not regain write authority. */ }
    }
    console.error(JSON.stringify({ turnId: item.turnId, attemptId: attemptId || null,
      status: 'failed', code: code.slice(0, 120) }))
    return false
  }
}

async function main(): Promise<void> {
  const shutdown = new AbortController()
  const heartbeatLastSent = new Map<string, number>()
  process.once('SIGINT', () => shutdown.abort())
  process.once('SIGTERM', () => shutdown.abort())
  const once = process.argv.includes('--once')
  do {
    const fixedSessionId = process.env.WORKMESH_AGENT_SESSION_ID
    const sessions: Array<{ sessionId: string; state?: string }> = fixedSessionId
      ? [{ sessionId: fixedSessionId }] : await discoverAssignments()
    for (const assignment of sessions) {
      if (shutdown.signal.aborted) break
      const sessionId = assignment.sessionId
      const api = new RunnerApi(sessionId)
      try {
        const session = await ensureExecuting(api, assignment.state)
        if (!session) continue
        const heartbeatPath = `/api/v1/agent-sessions/${sessionId}/heartbeat`
        const heartbeat = () => api.request('POST', heartbeatPath, {
          usage: { runtimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(session.created_at)) / 1000)) },
        })
        if (Date.now() - (heartbeatLastSent.get(sessionId) ?? 0) >= 10_000) {
          await heartbeat()
          heartbeatLastSent.set(sessionId, Date.now())
        }
        let heartbeatBusy = false
        const heartbeatTimer = setInterval(() => {
          if (heartbeatBusy || shutdown.signal.aborted) return
          heartbeatBusy = true
          void heartbeat().then(() => { heartbeatLastSent.set(sessionId, Date.now()) })
            .catch(() => undefined).finally(() => { heartbeatBusy = false })
        }, 10_000)
        try {
        const result = await api.request<{ items: WorkItem[] }>('GET',
          `/api/v1/agent-sessions/${api.sessionId}/workbench-turns`)
        for (const item of result.items) {
          if (shutdown.signal.aborted) break
          if (await executeTurn(api, item, shutdown.signal)) break
        }
        } finally { clearInterval(heartbeatTimer) }
      } catch (error) {
        const code = error instanceof RunnerApiError ? error.code : error instanceof Error ? error.message : 'RUNNER_SESSION_FAILED'
        console.error(JSON.stringify({ sessionId, status: 'session_failed', code: code.slice(0, 120) }))
      }
    }
    if (once || shutdown.signal.aborted) break
    await new Promise(resolve => setTimeout(resolve, 5_000))
  } while (!shutdown.signal.aborted)
}

async function discoverAssignments(): Promise<Array<{ sessionId: string; state: string }>> {
  const base = validatedApiUrl(required('WORKMESH_API_URL'))
  const response = await fetch(new URL('/api/v1/workbench/runner/assignments', base), {
    headers: { 'Authorization': `Bearer ${required('WORKMESH_AGENT_INSTALLATION_TOKEN')}`,
      'X-WorkMesh-Runner-Token': required('WORKMESH_RUNNER_SERVICE_TOKEN') },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new RunnerApiError(response.status, 'RUNNER_ASSIGNMENT_DISCOVERY_FAILED')
  const payload = await response.json() as { items?: Array<{ sessionId?: unknown; state?: unknown }> }
  if (!Array.isArray(payload.items) || payload.items.length > 100
    || payload.items.some(item => typeof item.sessionId !== 'string'
      || !['queued','acknowledged','executing'].includes(String(item.state))))
    throw new Error('RUNNER_ASSIGNMENT_RESPONSE_INVALID')
  return payload.items.map(item => ({ sessionId: item.sessionId as string, state: item.state as string }))
}

main().catch(error => {
  const code = error instanceof RunnerApiError ? error.code : error instanceof Error ? error.message : 'RUNNER_FATAL_ERROR'
  console.error(JSON.stringify({ status: 'fatal', code: code.slice(0, 120) }))
  process.exitCode = 1
})
