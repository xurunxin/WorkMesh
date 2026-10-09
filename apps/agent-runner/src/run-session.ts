import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentSession, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { agentSessionExecutionResultResponseSchema, workbenchRunnerCredentialSchema } from '@workmesh/contracts'
import { Type } from 'typebox'
import { configuredModels } from './configured-model.js'
import { createWorkMeshTools, type RunnerToolApi, type SessionCompletionIntent } from './workmesh-tools.js'
import { createWorkbenchSkillLoader } from './workbench-skill.js'
import { ExecutionLifecycle, type ExecutionExit, type SessionWaitIntent } from './execution-lifecycle.js'

type Credential = ReturnType<typeof workbenchRunnerCredentialSchema.parse>
type TokenExchange = { sessionToken: string; expiresAt: string }
type WorkItem = { turnId: string; conversationId: string }
type AttemptStatus = { attemptStatus: string; turnStatus: string; sessionState: string; delegationStatus: string
  pendingSteeringMessage?: string | null }
type AgentSession = { id: string; state: string; revision: number; created_at: string }
type Assignment = { sessionId: string; state?: string; purpose?: 'execute' | 'monitor'; waitId?: string }
type Continuation = { waitId: string; sourceTurnId: string; sourceAttemptId: string;
  trigger: { kind: 'approval' | 'prompt' | 'message'; id: string } }

// Exported for the isolation/resource-limit evidence tests (W10). The behaviours are
// the same ones the entry script enforces at runtime.
export function validatedApiUrl(value: string): URL {
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
export class RunnerApiError extends Error {
  constructor(readonly status: number, readonly code: string,
    message = code, readonly details?: unknown, readonly correlationId?: string) { super(message) }
}
export class RunnerApi {
  readonly #baseUrl: URL
  readonly #sessionId: string
  readonly #installationToken: string
  readonly #runnerToken: string
  #sessionToken = ''
  #expiresAt = 0
  #closed = false
  #cleanupDeadline = 0
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
  closeExecution(): void {
    this.#closed = true
    if (!this.#cleanupDeadline) this.#cleanupDeadline = Date.now() + 30_000
  }
  async #refresh(): Promise<void> {
    const response = await fetch(new URL(`/api/v1/agent-sessions/${this.#sessionId}/token/refresh`, this.#baseUrl), {
      method: 'POST', headers: { 'Authorization': `Bearer ${this.#installationToken}`,
        'Idempotency-Key': randomUUID(), 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw await runnerResponseError(response, 'SESSION_TOKEN_REFRESH_FAILED')
    const payload = await response.json() as TokenExchange
    if (!payload.sessionToken || !Number.isFinite(Date.parse(payload.expiresAt)))
      throw new Error('SESSION_TOKEN_REFRESH_INVALID')
    this.#sessionToken = payload.sessionToken
    this.#expiresAt = Date.parse(payload.expiresAt)
  }
  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
    body?: unknown, ifMatch?: number, explicitIdempotencyKey?: string): Promise<T> {
    if (!this.#closed && (!this.#sessionToken || this.#expiresAt - Date.now() < 60_000)) await this.#refresh()
    if (!this.#sessionToken) throw new Error('RUNNER_EXECUTION_TOKEN_UNAVAILABLE')
    const idempotencyKey = explicitIdempotencyKey ?? randomUUID()
    const send = () => fetch(new URL(path, this.#baseUrl), {
      method, headers: { 'Authorization': `Bearer ${this.#sessionToken}`,
        'X-WorkMesh-Runner-Token': this.#runnerToken,
        'Idempotency-Key': idempotencyKey, 'Content-Type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'If-Match': `"revision-${ifMatch}"` }) },
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(15_000),
    })
    const response = await send()
    if (!response.ok) {
      throw await runnerResponseError(response, `HTTP_${response.status}`)
    }
    return response.json() as Promise<T>
  }

  // Cleanup runs outside model tools and never refreshes or changes the held E credential.
  async stopAfterCleanup(cleanupSummary: string, residualRisks: string[], operationKey: string): Promise<void> {
    if (!this.#sessionToken) return
    this.closeExecution()
    const token = this.#sessionToken
    const remaining = this.#cleanupDeadline - Date.now()
    if (remaining <= 0) { this.#reportCleanup(operationKey, 'budget_exhausted', undefined); return }
    const deadline = AbortSignal.timeout(remaining)
    const raw = async <T>(path: string, body: unknown, key: string, revision?: number): Promise<T> => {
      const response = await fetch(new URL(path, this.#baseUrl), { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          'Idempotency-Key': key, ...(revision === undefined ? {} : { 'If-Match': `"revision-${revision}"` }) },
        body: JSON.stringify(body), signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]) })
      if (!response.ok) throw await runnerResponseError(response, 'RUNNER_CLEANUP_FAILED')
      return response.json() as Promise<T>
    }
    const heartbeatPath = `/api/v1/agent-sessions/${this.#sessionId}/heartbeat`
    let current: AgentSession
    try { current = await raw(heartbeatPath, { usage: { runtimeSeconds: 0 } }, `${operationKey}-diagnostic`) }
    catch (error) { this.#reportCleanup(operationKey, 'unable_to_read_stop', error); return }
    if (current.state !== 'stopping') return
    const body = { cleanupSummary, residualRisks }
    try { await raw(`/api/v1/agent-sessions/${this.#sessionId}/stop-ack`, body, operationKey, current.revision) }
    catch (error) {
      // A transport failure may have committed; only the original action may be confirmed.
      if (error instanceof RunnerApiError && error.code === 'REVISION_CONFLICT') {
        current = await raw(heartbeatPath, { usage: { runtimeSeconds: 0 } }, `${operationKey}-revision`)
        if (current.state !== 'stopping') { this.#reportCleanup(operationKey, 'stop_changed', error); return }
        operationKey = `${operationKey}-revision-${current.revision}`
        try { await raw(`/api/v1/agent-sessions/${this.#sessionId}/stop-ack`, body, operationKey, current.revision); return }
        catch (retryError) { error = retryError }
      }
      try {
        const path = `/api/v1/agent-sessions/${this.#sessionId}/execution-result?action=stop_ack&operationKey=${encodeURIComponent(operationKey)}`
        const response = await fetch(new URL(path, this.#baseUrl), {
          headers: { Authorization: `Bearer ${this.#installationToken}` },
          signal: AbortSignal.any([deadline, AbortSignal.timeout(10_000)]) })
        if (!response.ok) throw await runnerResponseError(response, 'RUNNER_STOP_CONFIRMATION_FAILED')
        const result = agentSessionExecutionResultResponseSchema.parse(await response.json())
        if (result.session.id !== this.#sessionId || result.action.kind !== 'stop_ack' || result.action.operationKey !== operationKey)
          throw new Error('RUNNER_STOP_CONFIRMATION_BINDING_INVALID')
        if (result.action.confirmation !== 'confirmed') this.#reportCleanup(operationKey, 'unconfirmed', error)
      } catch (confirmationError) { this.#reportCleanup(operationKey, 'unconfirmed', confirmationError) }
    }
  }
  #reportCleanup(operationKey: string, status: string, error: unknown): void {
    console.error(JSON.stringify({ sessionId: this.#sessionId, operationKey, cleanup: status,
      code: error instanceof RunnerApiError ? error.code : 'RUNNER_CLEANUP_UNCONFIRMED' }))
  }
}
class RunnerExecutionExitError extends Error {
  constructor(readonly exit: ExecutionExit) { super('RUNNER_ABORTED') }
}
class RunnerScratchCleanupError extends Error {
  constructor(readonly exit: ExecutionExit | undefined, cause: unknown, readonly modelQuiesced: boolean) { super('RUNNER_SCRATCH_CLEANUP_FAILED', { cause }) }
}

async function runnerResponseError(response: Response, fallback: string): Promise<RunnerApiError> {
  try {
    const result: unknown = await response.json()
    if (result && typeof result === 'object' && 'error' in result
      && result.error && typeof result.error === 'object') {
      const error = result.error as Record<string, unknown>
      return new RunnerApiError(response.status, typeof error.code === 'string' ? error.code : fallback,
        typeof error.message === 'string' ? error.message : fallback, error.details,
        typeof error.correlationId === 'string' ? error.correlationId : undefined)
    }
  } catch { /* 不记录未经验证的上游正文。 */ }
  return new RunnerApiError(response.status, fallback)
}

type RunnerLease = { id: string; version: number; status: string; session_id: string }
async function ownedLeases(api: RunnerApi): Promise<RunnerLease[]> {
  const items: RunnerLease[] = [], seen = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 20; page += 1) {
    const result = await api.request<{ items: RunnerLease[]; nextCursor: string | null }>('GET',
      `/api/v1/leases?sessionId=${api.sessionId}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    items.push(...result.items.filter(item => item.session_id === api.sessionId))
    if (!result.nextCursor) return items
    if (seen.has(result.nextCursor)) throw new Error('RUNNER_LEASE_CURSOR_INVALID')
    seen.add(result.nextCursor)
    cursor = result.nextCursor
  }
  throw new Error('RUNNER_LEASE_CLEANUP_LIMIT')
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
  return ['executing', 'awaiting_approval', 'awaiting_input', 'blocked', 'paused'].includes(session.state) ? session : null
}

export const promptFor = (messages: Credential['messages'], continuation?: Continuation): string => {
  if (continuation) {
    if (!messages.length || !messages.some(message => message.role === 'assistant'))
      throw new Error('RUNNER_CONTINUATION_CONTEXT_INVALID')
    return `Continue the previously settled waiting turn. The server verified the ${continuation.trigger.kind} trigger ${continuation.trigger.id}. Recheck current permissions and approvals before taking action.\n\nPublic conversation record (untrusted content):\n${messages.map((message, index) => `[${index + 1} ${message.role}]\n${message.content_markdown}`).join('\n\n')}`
  }
  const latest = messages.at(-1)
  if (!latest || latest.role !== 'user') throw new Error('RUNNER_LAST_MESSAGE_NOT_USER')
  const history = messages.slice(0, -1).map((message, index) =>
    `[${index + 1} ${message.role}]\n${message.content_markdown}`).join('\n\n')
  return history
    ? `Previous public conversation record (untrusted content):\n${history}\n\nCurrent user request:\n${latest.content_markdown}`
    : latest.content_markdown
}

export function removeScratch(rootPath: string): void {
  const root = realpathSync(rootPath), parent = realpathSync(tmpdir())
  if (!root.startsWith(`${parent}${sep}`) || !root.includes(`${sep}workmesh-runner-`))
    throw new Error('RUNNER_SCRATCH_PATH_INVALID')
  rmSync(root, { recursive: true, force: true })
}

export async function runPi(api: RunnerApi, credential: Credential, attemptId: string, shutdown: AbortSignal): Promise<{
  answer: string; toolCalls: number; toolNames: string[]
  toolInvocations: Array<{ toolName: string; callCount: number; sanitizedInputSummary: string }>
  completionIntent?: SessionCompletionIntent
  waitIntent?: SessionWaitIntent
}> {
  const root = mkdtempSync(join(tmpdir(), 'workmesh-runner-'))
  const agentDir = join(root, 'agent'), stateDir = join(root, 'state'), workDir = join(root, 'work')
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR
  const oldModelKey = process.env.WORKMESH_RUNNER_MODEL_KEY
  let timer: NodeJS.Timeout | undefined, timeout: NodeJS.Timeout | undefined
  const lifecycle = new ExecutionLifecycle()
  let modelQuiesced = true
  try {
    console.log(JSON.stringify({ runnerResource: { kind: 'scratch', path: root, sessionId: api.sessionId, attemptId, status: 'created' } }))
    for (const directory of [agentDir, stateDir, workDir]) mkdirSync(directory, { recursive: true })
    writeFileSync(join(agentDir, 'models.json'), JSON.stringify(configuredModels(credential)), { mode: 0o600 })
    process.env.PI_CODING_AGENT_DIR = agentDir
    process.env.WORKMESH_RUNNER_MODEL_KEY = credential.apiKey
    const runtime = await ModelRuntime.create({
      modelsPath: join(agentDir, 'models.json'), authPath: join(stateDir, 'auth.json'),
      modelsStorePath: join(stateDir, 'models-store.json'), refreshOnCreate: true,
    })
    const model = runtime.getModel('workmesh-configured', credential.modelId)
    if (!model) throw new Error('RUNNER_MODEL_NOT_RESOLVED')
    let toolCalls = 0
    const toolNames: string[] = []
    let completionIntent: SessionCompletionIntent | undefined
    let waitIntent: SessionWaitIntent | undefined
    let abortModel: (() => void) | undefined
    // Per-tool settlement detail: name -> count, plus one sanitized summary of the
    // arguments each tool saw. Raw arguments never leave the runner process.
    const toolInvocationCounts = new Map<string, number>()
    const toolInvocationSummaries = new Map<string, string>()
    const recordInvocation = (name: string, input?: unknown): void => {
      toolCalls += 1
      toolInvocationCounts.set(name, (toolInvocationCounts.get(name) ?? 0) + 1)
      if (toolNames.length < 50) toolNames.push(name)
      if (!toolInvocationSummaries.has(name)) {
        const shape = input === undefined ? 'no arguments'
          : Array.isArray(input) ? `array of ${input.length}`
          : typeof input === 'object' && input !== null
            ? `keys: ${Object.keys(input as Record<string, unknown>).slice(0, 12).join(', ') || 'none'}`
          : typeof input
        toolInvocationSummaries.set(name, shape.slice(0, 2_000))
      }
    }
    const contextTool = {
      name: 'workmesh_session_context', label: 'WorkMesh session context',
      description: 'Read the current authorized WorkMesh Agent Session context. This tool never mutates WorkMesh.',
      parameters: Type.Object({}),
      execute: async () => {
        lifecycle.assertOpen()
        recordInvocation('workmesh_session_context')
        const context = await lifecycle.tool(() => api.request<unknown>('GET', `/api/v1/agent-sessions/${api.sessionId}/context`))
        lifecycle.assertOpen()
        const encoded = JSON.stringify(context)
        if (encoded.length > 20_000) throw new Error('RUNNER_CONTEXT_TOO_LARGE')
        return { content: [{ type: 'text' as const, text: encoded }], details: { source: 'workmesh_session_context' } }
      },
    }
    const toolApi: RunnerToolApi = { sessionId: api.sessionId,
      request: <T>(...args: Parameters<RunnerToolApi['request']>): Promise<T> => {
        return lifecycle.request(args[0], () => api.request<T>(...args))
      },
    }
    const workmeshTools = await createWorkMeshTools(toolApi, attemptId, name => {
      recordInvocation(name)
    }, intent => {
      if (waitIntent) throw new Error('RUNNER_WAIT_COMPLETION_CONFLICT')
      if (completionIntent && JSON.stringify(completionIntent) !== JSON.stringify(intent))
        throw new Error('RUNNER_COMPLETION_INTENT_CONFLICT')
      completionIntent = intent
    }, credential.executionWaitsEnabled ? intent => {
      if (completionIntent || (waitIntent && JSON.stringify(waitIntent) !== JSON.stringify(intent)))
        throw new Error('RUNNER_WAIT_COMPLETION_CONFLICT')
      waitIntent = intent
      lifecycle.close('wait')
      abortModel?.()
    } : undefined)
    const guardedTools = workmeshTools.map(tool => ({ ...tool,
      execute: (...args: Parameters<typeof tool.execute>) => lifecycle.tool(() => tool.execute(...args)),
    }))
    const resourceLoader = await createWorkbenchSkillLoader(workDir, agentDir)
    const { session } = await createAgentSession({
      cwd: workDir, agentDir, model, modelRuntime: runtime,
      resourceLoader, sessionManager: SessionManager.inMemory(), noTools: 'builtin',
      customTools: [contextTool, ...guardedTools],
    })
    modelQuiesced = false
    abortModel = () => { void session.abort() }
    let stopped = false, polling = false
    const onShutdown = () => { lifecycle.close('shutdown'); api.closeExecution(); stopped = true; void session.abort() }
    shutdown.addEventListener('abort', onShutdown, { once: true })
    if (shutdown.aborted) onShutdown()
    // Injected steering: the human can add context to the running turn. The server
    // hands the message once through the status poll; it is delivered as an extra
    // user prompt to the live session without cancelling the attempt.
    const consumedSteering = new Set<string>()
    const deliverSteering = async (message: string): Promise<void> => {
      if (lifecycle.exit) return
      if (consumedSteering.has(message)) return
      consumedSteering.add(message)
      try { await session.prompt(message) } catch { consumedSteering.delete(message) }
    }
    timer = setInterval(() => {
      if (polling || stopped || lifecycle.exit) return
      polling = true
      void api.request<AttemptStatus>('GET', `/api/v1/workbench/runner-attempts/${attemptId}/status`)
        .then(status => {
          if (['stopping', 'canceled'].includes(status.sessionState) || status.delegationStatus !== 'active') {
            lifecycle.close(['stopping', 'canceled'].includes(status.sessionState) ? 'stop' : 'revoked')
            api.closeExecution(); stopped = true; void session.abort()
            return
          }
          if (lifecycle.exit) return
          if (status.attemptStatus !== 'running' || status.turnStatus !== 'running'
            || !['executing', 'planning'].includes(status.sessionState) || status.delegationStatus !== 'active') {
            lifecycle.close(status.sessionState === 'stopping' ? 'stop' : status.delegationStatus !== 'active' ? 'revoked' : 'external_state')
            if (status.sessionState === 'stopping' || status.delegationStatus !== 'active') api.closeExecution()
            stopped = true; void session.abort()
            return
          }
          const steering = status.pendingSteeringMessage
          if (steering) void deliverSteering(steering)
        })
        .catch(() => { lifecycle.close('revoked'); api.closeExecution(); stopped = true; void session.abort() })
        .finally(() => { polling = false })
    }, 1_000)
    timeout = setTimeout(() => { lifecycle.close('timeout'); stopped = true; void session.abort() }, 120_000)
    try {
      try { await session.prompt(promptFor(credential.messages, credential.continuation)) }
      catch (error) {
        if (lifecycle.exit && lifecycle.exit !== 'wait') throw new RunnerExecutionExitError(lifecycle.exit)
        if (lifecycle.exit !== 'wait') throw error
      }
      await session.waitForIdle()
      if (lifecycle.exit === 'wait' && waitIntent) {
        if (!lifecycle.reconciled) throw new Error('RUNNER_WAIT_EFFECTS_UNRECONCILED')
        return { answer: waitIntent.reason, toolCalls, toolNames,
          toolInvocations: [...toolInvocationCounts.entries()].map(([toolName, callCount]) => ({
            toolName, callCount, sanitizedInputSummary: toolInvocationSummaries.get(toolName) ?? 'no arguments' })), waitIntent }
      }
      if (stopped) throw new RunnerExecutionExitError(lifecycle.exit ?? 'external_state')
      const answer = session.getLastAssistantText()?.trim()
      if (!answer || answer.length > 50_000) throw new Error('RUNNER_ANSWER_INVALID')
      const toolInvocations = [...toolInvocationCounts.entries()].map(([toolName, callCount]) => ({
        toolName, callCount,
        sanitizedInputSummary: toolInvocationSummaries.get(toolName) ?? 'no arguments',
      }))
      return { answer, toolCalls, toolNames, toolInvocations, ...(completionIntent ? { completionIntent } : {}) }
    } finally {
      shutdown.removeEventListener('abort', onShutdown)
      // prompt can reject during Stop before the normal waitForIdle path. Pi's
      // synchronous dispose only signals abort; await idle before touching scratch.
      try { await session.abort(); modelQuiesced = true }
      finally { session.dispose() }
    }
  } finally {
    if (timer) clearInterval(timer)
    if (timeout) clearTimeout(timeout)
    if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = oldAgentDir
    if (oldModelKey === undefined) delete process.env.WORKMESH_RUNNER_MODEL_KEY
    else process.env.WORKMESH_RUNNER_MODEL_KEY = oldModelKey
    try {
      if (!modelQuiesced) throw new Error('RUNNER_MODEL_NOT_IDLE')
      removeScratch(root)
      console.log(JSON.stringify({ runnerResource: { kind: 'scratch', path: root, sessionId: api.sessionId, attemptId, status: 'removed' } }))
    } catch (error) {
      console.error(JSON.stringify({ runnerResource: { kind: 'scratch', path: root, sessionId: api.sessionId, attemptId, status: 'retained' } }))
      throw new RunnerScratchCleanupError(lifecycle.exit, error, modelQuiesced)
    }
  }
}

export async function executeTurn(api: RunnerApi, item: WorkItem, shutdown: AbortSignal): Promise<'completed' | 'waiting' | 'settled' | 'failed'> {
  let attemptId = ''
  let fenceToken = ''
  let started = false
  let settlementUncertain = false
  let cleanupRequired = false
  let cleanupFailed = false
  let modelQuiesced = true
  try {
    const claim = await api.request<{ runnerAttemptId: string }>('POST',
      `/api/v1/workbench/turns/${item.turnId}/claim`, { executionWaits: true }, undefined, `runner-claim-${item.turnId}`)
    attemptId = claim.runnerAttemptId
    const credential = workbenchRunnerCredentialSchema.parse(await api.request<unknown>('GET',
      `/api/v1/workbench/runner-attempts/${attemptId}/credential`))
    fenceToken = credential.fenceToken
    await api.request('POST', `/api/v1/workbench/runner-attempts/${attemptId}/start`, { fenceToken }, undefined, `runner-start-${attemptId}`)
    started = true
    const { answer, toolCalls, toolNames, toolInvocations, completionIntent, waitIntent } = await runPi(api, credential, attemptId, shutdown)
    const settlePath = `/api/v1/workbench/runner-attempts/${attemptId}/settle`
    const settledTurn = {
      fenceToken, assistantMessageMarkdown: answer,
      settlement: { outcome: 'settled', summaryMarkdown: 'Pi completed the WorkMesh turn.',
        noArtifactReason: 'Text-only answer; no artifact was produced.', externalEffectsReconciled: true },
      toolInvocations,
    } as const
    const sendSettle = (body: unknown, key: string) =>
      api.request<{ status: string; sessionCompletion: string }>('POST', settlePath, body, undefined, key)
    const replayableSettle = async (body: unknown, key: string) => {
      settlementUncertain = true
      try {
        const result = await sendSettle(body, key)
        settlementUncertain = false
        return result
      }
      catch (error) {
        // A committed transaction can lose its HTTP response. Reuse the same
        // idempotency key so the API returns the durable result on retry.
        if (error instanceof RunnerApiError && error.status < 500) { settlementUncertain = false; throw error }
        // If this retry fails, the first request may already have committed.
        const result = await sendSettle(body, key)
        settlementUncertain = false
        return result
      }
    }
    if (waitIntent) {
      const leases = await ownedLeases(api)
      for (const lease of leases) {
        if (lease.status !== 'active' || lease.session_id !== api.sessionId) continue
        const key = `runner-wait-release-${attemptId}-${lease.id}`
        try { await api.request('POST', `/api/v1/leases/${lease.id}/release`, { reason: 'The Runner is settling a wait.' }, lease.version, key) }
        catch (error) {
          // Reconcile a potentially committed release before doing anything else.
          const current = (await ownedLeases(api)).find(item => item.id === lease.id)
          if (!current || current.status === 'active') throw error
        }
      }
      const current = await api.request<AgentSession>('GET', `/api/v1/agent-sessions/${api.sessionId}`)
      if (current.state !== 'executing' || shutdown.aborted) throw new Error('RUNNER_ABORTED')
      const waitingTurn = { ...settledTurn,
        settlement: { ...settledTurn.settlement, summaryMarkdown: 'Pi settled a public waiting reply.' },
        sessionWait: { ...waitIntent, ifMatch: current.revision } }
      try { await replayableSettle(waitingTurn, `runner-settle-${attemptId}`) }
      catch (error) {
        if (settlementUncertain || !(error instanceof RunnerApiError) || error.code !== 'REVISION_CONFLICT') throw error
        const latest = await api.request<AgentSession>('GET', `/api/v1/agent-sessions/${api.sessionId}`)
        if (latest.state !== 'executing' || shutdown.aborted) throw new Error('RUNNER_ABORTED')
        await replayableSettle({ ...waitingTurn, sessionWait: { ...waitIntent, ifMatch: latest.revision } },
          `runner-settle-wait-${attemptId}-revision-${latest.revision}`)
      }
      settlementUncertain = false
      console.log(JSON.stringify({ turnId: item.turnId, attemptId, status: 'waiting', state: waitIntent.state, toolCalls, toolNames }))
      return 'waiting'
    }
    let completionFailure: string | null = null
    let settled: { status: string; sessionCompletion: string }
    try {
      settled = await replayableSettle(completionIntent ? { ...settledTurn,
        sessionCompletion: { ifMatch: completionIntent.ifMatch,
          operationKey: completionIntent.idempotencyKey, body: completionIntent.body } }
        : settledTurn, `runner-settle-${attemptId}`)
    } catch (error) {
      if (!completionIntent || settlementUncertain || !(error instanceof RunnerApiError) || error.status >= 500)
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
    settlementUncertain = false
    return settled.sessionCompletion === 'completed' ? 'completed' : 'settled'
  } catch (error) {
    cleanupRequired = true
    const code = error instanceof RunnerApiError ? error.code : error instanceof Error ? error.message : 'RUNNER_UNKNOWN_ERROR'
    cleanupFailed = code === 'RUNNER_SCRATCH_CLEANUP_FAILED'
    if (error instanceof RunnerScratchCleanupError) modelQuiesced = error.modelQuiesced
    const stoppedOrRevoked = (error instanceof RunnerExecutionExitError || error instanceof RunnerScratchCleanupError)
      && ['stop', 'revoked'].includes(error.exit ?? '')
    if (started && fenceToken && !settlementUncertain && !stoppedOrRevoked && code !== 'RUNNER_FENCE_STALE') {
      try {
        await api.request('POST', `/api/v1/workbench/runner-attempts/${attemptId}/settle`, {
          fenceToken, settlement: { outcome: code === 'RUNNER_ABORTED' ? 'aborted' : 'failed', summaryMarkdown: 'Pi turn ended before a public answer was produced.',
            errorCode: 'RUNNER_EXECUTION_FAILED', externalEffectsReconciled: false },
        }, undefined, `runner-failure-${attemptId}`)
      } catch { /* A stopped or revoked session must not regain write authority. */ }
    }
    console.error(JSON.stringify({ turnId: item.turnId, attemptId: attemptId || null,
      status: 'failed', code: code.slice(0, 120) }))
    return 'failed'
  } finally {
    if (cleanupRequired) {
      try { await api.stopAfterCleanup(!modelQuiesced ? 'Pi model idle could not be confirmed; Runner scratch retained.'
        : cleanupFailed ? 'Pi model stopped; Runner scratch cleanup failed.' : 'Pi model stopped and the Runner scratch directory cleanup completed.',
        [...(settlementUncertain ? ['The Turn settlement response is unconfirmed; reconcile its original operation key.'] : []),
          ...(!modelQuiesced ? ['The Pi model did not confirm idle; inspect the Runner process before cleaning its owned temporary resources.'] : []),
          ...(cleanupFailed ? ['Runner scratch cleanup failed; its owned temporary resources require operator inspection.'] : [])],
        `runner-stop-cleanup-${attemptId || item.turnId}`) }
      catch { console.error(JSON.stringify({ sessionId: api.sessionId, cleanup: 'unconfirmed', code: 'RUNNER_STOP_CLEANUP_FAILED' })) }
    }
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
    const sessions: Assignment[] = fixedSessionId
      ? [{ sessionId: fixedSessionId }] : await discoverAssignments()
    for (const assignment of sessions) {
      if (shutdown.signal.aborted) break
      const sessionId = assignment.sessionId
      const api = new RunnerApi(sessionId)
      try {
        const observed = assignment.purpose === 'monitor' || ['awaiting_approval', 'awaiting_input', 'blocked', 'paused'].includes(assignment.state ?? '')
          ? await api.request<AgentSession>('GET', `/api/v1/agent-sessions/${sessionId}`) : await ensureExecuting(api, assignment.state)
        const session = observed
        if (!session) continue
        const heartbeatPath = `/api/v1/agent-sessions/${sessionId}/heartbeat`
        const heartbeat = () => api.request('POST', heartbeatPath, {
          usage: { runtimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(session.created_at)) / 1000)) },
        })
        if (Date.now() - (heartbeatLastSent.get(sessionId) ?? 0) >= 10_000) {
          await heartbeat()
          heartbeatLastSent.set(sessionId, Date.now())
        }
        // A durable wait has no live model, Attempt or Lease. Worker admission creates the continuation.
        if (assignment.purpose === 'monitor' || session.state !== 'executing') continue
        let heartbeatBusy = false
        const heartbeatTimer = setInterval(() => {
          if (heartbeatBusy || shutdown.signal.aborted) return
          heartbeatBusy = true
          void heartbeat().then(() => { heartbeatLastSent.set(sessionId, Date.now()) })
            .catch(() => undefined).finally(() => { heartbeatBusy = false })
        }, 10_000)
        try {
        const result = await api.request<{ items: WorkItem[] }>('GET',
          `/api/v1/agent-sessions/${api.sessionId}/workbench-turns?executionWaits=true`)
        for (const item of result.items) {
          if (shutdown.signal.aborted) break
          const result = await executeTurn(api, item, shutdown.signal)
          if (result === 'completed' || result === 'waiting' || result === 'failed') break
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

async function discoverAssignments(): Promise<Assignment[]> {
  const base = validatedApiUrl(required('WORKMESH_API_URL'))
  const response = await fetch(new URL('/api/v1/workbench/runner/assignments?executionWaits=true', base), {
    headers: { 'Authorization': `Bearer ${required('WORKMESH_AGENT_INSTALLATION_TOKEN')}`,
      'X-WorkMesh-Runner-Token': required('WORKMESH_RUNNER_SERVICE_TOKEN') },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new RunnerApiError(response.status, 'RUNNER_ASSIGNMENT_DISCOVERY_FAILED')
  const payload = await response.json() as { items?: Array<{ sessionId?: unknown; state?: unknown; purpose?: unknown; waitId?: unknown }> }
  if (!Array.isArray(payload.items) || payload.items.length > 100
    || payload.items.some(item => typeof item.sessionId !== 'string'
      || !['queued','acknowledged','executing','awaiting_approval','awaiting_input','blocked','paused'].includes(String(item.state))
      || (item.purpose !== undefined && !['execute', 'monitor'].includes(String(item.purpose)))))
    throw new Error('RUNNER_ASSIGNMENT_RESPONSE_INVALID')
  return payload.items.map(item => ({ sessionId: item.sessionId as string, state: item.state as string,
    ...(item.purpose ? { purpose: item.purpose as 'execute' | 'monitor' } : {}),
    ...(typeof item.waitId === 'string' ? { waitId: item.waitId } : {}) }))
}

// Run the loop only when this file is the process entry point, so the isolation
// evidence tests can import the validation helpers without starting the runner.
// `tsx src/run-session.ts` keeps argv[1] pointing at this file, which is exactly
// what the package.json scripts use.
const isEntrypoint = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  const resolved = realpathSync(entry)
  return resolved === realpathSync(fileURLToPath(import.meta.url)) || resolved.endsWith('run-session.ts')
})()

if (isEntrypoint) {
  main().catch(error => {
    const code = error instanceof RunnerApiError ? error.code : error instanceof Error ? error.message : 'RUNNER_FATAL_ERROR'
    console.error(JSON.stringify({ status: 'fatal', code: code.slice(0, 120) }))
    process.exitCode = 1
  })
}
