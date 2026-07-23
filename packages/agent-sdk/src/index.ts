import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { AgentSessionState, Capability, CompleteAgentSessionInput, PlanStepInput } from '@workmesh/contracts'

export type WorkMeshErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'WEBHOOK_TIMESTAMP_INVALID'
  | 'WEBHOOK_TIMESTAMP_EXPIRED'
  | string

export class WorkMeshSdkError extends Error {
  readonly code: WorkMeshErrorCode
  readonly status?: number
  readonly correlationId?: string
  readonly details?: unknown

  constructor(message: string, options: { code: WorkMeshErrorCode; status?: number; correlationId?: string; details?: unknown }) {
    super(message)
    this.name = 'WorkMeshSdkError'
    this.code = options.code
    this.status = options.status
    this.correlationId = options.correlationId
    this.details = options.details
  }
}

export type WorkMeshLogger = Pick<Console, 'debug' | 'warn'>

const sensitiveKey = /authorization|token|secret|password|signature|cookie/i

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactForLog(nested)]))
  }
  return value
}

/** Creates a repeatable key only when the caller supplies a stable operation id. */
export function stableIdempotencyKey(sessionId: string, operation: string, operationId: string = randomUUID()): string {
  const digest = createHash('sha256').update(`${sessionId}\u0000${operation}\u0000${operationId}`).digest('hex')
  return `wm_${digest.slice(0, 48)}`
}

export interface RetryOptions { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }
export interface WorkMeshClientOptions {
  baseUrl: string
  sessionToken?: string
  installationToken?: string
  fetch?: typeof globalThis.fetch
  logger?: WorkMeshLogger
  retry?: RetryOptions
}
export interface RequestOptions { signal?: AbortSignal; idempotencyKey?: string; ifMatch?: number | string; correlationId?: string }
export interface ApiCommand { id: string; revision: number }
export interface TokenExchange { sessionToken: string; expiresAt?: string }
export interface SessionAck { summary: string; externalUrls?: Array<{ label: string; url: string }> }
export interface Heartbeat { currentStepId?: string; usage: { runtimeSeconds: number; inputTokens?: number; outputTokens?: number; toolCalls?: number } }
export interface ActivityInput { kind: string; summary: string; detailsMarkdown?: string; toolInvocation?: unknown; artifactIds?: string[]; references?: unknown[]; visibility?: 'workspace' | 'team' | 'private'; ephemeral?: boolean }
export interface ApprovalInput { sessionId: string; approvalType: string; actionName: string; actionPayloadSanitized: Record<string, unknown>; actionPayloadHash: string; riskLevel: 'low' | 'medium' | 'high' | 'critical'; rationaleSummary: string; requiredApprovals?: number; expiresAt: string }
export interface ArtifactInput { sessionId: string; workItemId?: string; type: 'commit' | 'pull_request' | 'test_report' | 'document' | 'link' | 'file' | 'other'; title: string; uri?: string; checksum?: string; sourceTool?: string; metadata?: Record<string, unknown> }
export interface DelegateAndStartInput { agentId: string; principalHumanActorId: string; role?: 'executor' | 'reviewer' | 'researcher' | 'coordinator' | 'triager'; requestedCapabilities: Capability[]; initialPrompt: string; contextSnapshotId?: string; budget?: Record<string, number> }

export class WorkMeshClient {
  private readonly baseUrl: string
  private sessionToken?: string
  private readonly installationToken?: string
  private readonly requestFetch: typeof globalThis.fetch
  private readonly logger?: WorkMeshLogger
  private readonly retry: Required<RetryOptions>

  constructor(options: WorkMeshClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.sessionToken = options.sessionToken
    this.installationToken = options.installationToken
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.logger = options.logger
    this.retry = { maxAttempts: options.retry?.maxAttempts ?? 3, baseDelayMs: options.retry?.baseDelayMs ?? 150, maxDelayMs: options.retry?.maxDelayMs ?? 2_000 }
  }

  setSessionToken(token: string | undefined): void { this.sessionToken = token }

  async exchangeSessionToken(sessionId: string, exchangeToken: string, installationToken: string, options: RequestOptions = {}): Promise<TokenExchange> {
    // The one-time code is not a bearer credential: the active installation token proves the Agent identity.
    const result = await this.request<TokenExchange>('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/token/exchange`, { exchangeToken }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'token-exchange'), authorizationToken: installationToken, skipTokenRefresh: true })
    this.sessionToken = result.sessionToken
    return result
  }
  async refreshSessionToken(sessionId: string, installationToken = this.installationToken, options: RequestOptions = {}): Promise<TokenExchange> {
    if (!installationToken) throw new WorkMeshSdkError('An installation token is required to refresh a session token', { code: 'INSTALLATION_TOKEN_REQUIRED' })
    const result = await this.request<TokenExchange>('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/token/refresh`, {}, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'token-refresh'), authorizationToken: installationToken, skipTokenRefresh: true, refreshSessionId: sessionId })
    this.sessionToken = result.sessionToken
    return result
  }

  getSession<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}`, undefined, { ...options, refreshSessionId: sessionId }) }
  getSessionContext<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/context`, undefined, { ...options, refreshSessionId: sessionId }) }
  getPlan<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/plan`, undefined, { ...options, refreshSessionId: sessionId }) }
  getActivities<T = unknown>(sessionId: string, options: RequestOptions = {}): Promise<T> { return this.request('GET', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/activities`, undefined, { ...options, refreshSessionId: sessionId }) }
  getWorkItem<T = unknown>(workItemId: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/work-items/${encodeURIComponent(workItemId)}`, undefined, options) }
  listWorkItems<T = unknown>(query: Record<string, string | number | boolean | undefined> = {}, options?: RequestOptions): Promise<T> {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value))
    return this.request('GET', `/api/v1/work-items${params.size ? `?${params}` : ''}`, undefined, options)
  }
  getGuidance<T = unknown>(scope: 'workspace' | 'team' | 'project', id: string, options?: RequestOptions): Promise<T> { return this.request('GET', `/api/v1/${scope}s/${encodeURIComponent(id)}/guidance`, undefined, options) }
  /** Delegation and session creation happen in one server transaction. */
  delegateAndStart<T = unknown>(workItemId: string, input: DelegateAndStartInput, options: RequestOptions & { ifMatch: number | string }): Promise<T> {
    return this.request('POST', `/api/v1/work-items/${encodeURIComponent(workItemId)}/agent-session`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(workItemId, 'delegate-and-start'), ifMatch: options.ifMatch })
  }

  acknowledge(sessionId: string, input: SessionAck, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'ack', input, options) }
  heartbeat(sessionId: string, input: Heartbeat, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'heartbeat', input, options) }
  sendPrompt(sessionId: string, input: { bodyMarkdown: string; planRevision?: number; workItemRevision?: number }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'prompt', input, options) }
  appendActivity(sessionId: string, input: ActivityInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'activities', input, options) }
  sendMessage(sessionId: string, bodyMarkdown: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.appendActivity(sessionId, { kind: 'message', summary: bodyMarkdown, detailsMarkdown: bodyMarkdown }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'message') }) }
  askQuestion(sessionId: string, question: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.appendActivity(sessionId, { kind: 'question', summary: question, detailsMarkdown: question }, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'question') }) }
  publishPlan(sessionId: string, input: { changeSummary: string; steps: PlanStepInput[]; approvalId?: string; approvalPayloadHash?: string }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('PUT', sessionId, 'plan', input, options, true) }
  sendSignal(sessionId: string, signal: 'stop' | 'pause' | 'resume', reason: string, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'signals', { signal, reason }, options, true) }
  stopAcknowledgement(sessionId: string, input: { cleanupSummary: string; residualRisks?: string[] }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'stop-ack', input, options, true) }
  complete(sessionId: string, input: CompleteAgentSessionInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'complete', input, options, true) }
  fail(sessionId: string, input: { code: string; summary: string; retryable?: boolean; evidence?: string[] }, options: RequestOptions = {}): Promise<ApiCommand> { return this.mutate('POST', sessionId, 'fail', input, options, true) }
  retrySession<T = unknown>(sessionId: string, input: { reason: string; initialPrompt?: string; reuseContext?: boolean }, options: RequestOptions & { ifMatch: number | string }): Promise<T> { return this.request('POST', `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/retry`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, 'retry'), refreshSessionId: sessionId }) }
  publishArtifact(input: ArtifactInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.request('POST', '/api/v1/artifacts', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, 'publish-artifact'), refreshSessionId: input.sessionId }) }
  requestApproval(input: ApprovalInput, options: RequestOptions = {}): Promise<ApiCommand> { return this.request('POST', '/api/v1/approvals', input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(input.sessionId, 'request-approval'), refreshSessionId: input.sessionId }) }
  consumeApproval<T = unknown>(approvalId: string, input: { actionPayloadHash: string }, options: RequestOptions & { sessionId: string; ifMatch: number | string }): Promise<T> {
    return this.request('POST', `/api/v1/approvals/${encodeURIComponent(approvalId)}/consume`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(options.sessionId, `consume-approval:${approvalId}`), refreshSessionId: options.sessionId })
  }

  private mutate(method: 'POST' | 'PUT', sessionId: string, operation: string, input: unknown, options: RequestOptions, revisioned = false): Promise<ApiCommand> {
    return this.request(method, `/api/v1/agent-sessions/${encodeURIComponent(sessionId)}/${operation}`, input, { ...options, idempotencyKey: options.idempotencyKey ?? stableIdempotencyKey(sessionId, operation), ifMatch: revisioned ? options.ifMatch : undefined, refreshSessionId: sessionId })
  }

  private async request<T>(method: string, path: string, body?: unknown, options: RequestOptions & { authorizationToken?: string; skipTokenRefresh?: boolean; refreshSessionId?: string } = {}): Promise<T> {
    const url = new URL(path, `${this.baseUrl}/`).toString()
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (options.authorizationToken ?? this.sessionToken) headers.authorization = `Bearer ${options.authorizationToken ?? this.sessionToken}`
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey
    if (options.correlationId) headers['x-correlation-id'] = options.correlationId
    if (options.ifMatch !== undefined) headers['if-match'] = typeof options.ifMatch === 'number' ? `"revision-${options.ifMatch}"` : options.ifMatch
    let refreshedToken = false
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await this.requestFetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: options.signal })
        if (!response.ok) {
          const payload = await readErrorPayload(response)
          const error = toSdkError(response.status, payload)
          if (response.status === 401 && !refreshedToken && !options.skipTokenRefresh && this.installationToken && options.refreshSessionId && error.code !== 'SESSION_STOPPED') {
            refreshedToken = true
            await this.refreshSessionToken(options.refreshSessionId, this.installationToken, { signal: options.signal, correlationId: options.correlationId })
            if (this.sessionToken) headers.authorization = `Bearer ${this.sessionToken}`
            continue
          }
          if (shouldRetry(response.status) && attempt < this.retry.maxAttempts) {
            await wait(retryDelay(attempt, response.headers.get('retry-after'), this.retry), options.signal)
            continue
          }
          throw error
        }
        if (response.status === 204) return undefined as T
        return await readJson(response) as T
      } catch (cause) {
        if (cause instanceof WorkMeshSdkError || options.signal?.aborted) throw cause
        if (attempt >= this.retry.maxAttempts) throw new WorkMeshSdkError('Unable to reach WorkMesh API', { code: 'NETWORK_ERROR', details: redactForLog({ cause: cause instanceof Error ? cause.message : String(cause) }) })
        this.logger?.warn('WorkMesh request failed; retrying', redactForLog({ method, path, attempt, cause: cause instanceof Error ? cause.message : String(cause) }))
        await wait(retryDelay(attempt, null, this.retry), options.signal)
      }
    }
  }
}

function shouldRetry(status: number): boolean { return status === 429 || (status >= 500 && status <= 599) }
function retryDelay(attempt: number, retryAfter: string | null, retry: Required<RetryOptions>): number {
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, retry.maxDelayMs)
  return Math.min(retry.baseDelayMs * 2 ** (attempt - 1), retry.maxDelayMs)
}
function wait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { throw new WorkMeshSdkError('WorkMesh returned invalid JSON', { code: 'MALFORMED_RESPONSE', status: response.status }) }
}
async function readErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 2_000) } }
}
function toSdkError(status: number, payload: unknown): WorkMeshSdkError {
  const candidate = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error?: unknown }).error : undefined
  if (candidate && typeof candidate === 'object') {
    const error = candidate as { code?: unknown; message?: unknown; correlationId?: unknown; details?: unknown }
    return new WorkMeshSdkError(typeof error.message === 'string' ? error.message : `WorkMesh request failed (${status})`, { code: typeof error.code === 'string' ? error.code : 'HTTP_ERROR', status, correlationId: typeof error.correlationId === 'string' ? error.correlationId : undefined, details: error.details })
  }
  return new WorkMeshSdkError(`WorkMesh request failed (${status})`, { code: 'HTTP_ERROR', status, details: payload })
}

export interface WebhookVerificationOptions { secrets: readonly string[]; now?: Date; toleranceSeconds?: number }
export interface VerifiedWebhook { timestamp: number; secretIndex: number; payload: unknown }

/** Verifies HMAC against raw bytes. Supply old and new secrets during rotation. */
export function verifyWebhook(rawBody: string | Uint8Array, headers: Headers | Record<string, string | undefined>, options: WebhookVerificationOptions): VerifiedWebhook {
  const header = (name: string): string | undefined => headers instanceof Headers ? headers.get(name) ?? undefined : headers[name] ?? headers[name.toLowerCase()]
  const timestampText = header('WorkMesh-Timestamp')
  const signature = header('WorkMesh-Signature')
  const timestamp = timestampText ? Number(timestampText) : Number.NaN
  if (!Number.isInteger(timestamp)) throw new WorkMeshSdkError('Webhook timestamp is invalid', { code: 'WEBHOOK_TIMESTAMP_INVALID' })
  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1_000)
  if (Math.abs(now - timestamp) > (options.toleranceSeconds ?? 300)) throw new WorkMeshSdkError('Webhook timestamp is outside the replay window', { code: 'WEBHOOK_TIMESTAMP_EXPIRED' })
  if (!signature) throw new WorkMeshSdkError('Webhook signature is missing', { code: 'WEBHOOK_SIGNATURE_INVALID' })
  const supplied = signature.replace(/^v1=/, '')
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : Buffer.from(rawBody)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp}.`), body])
  const index = options.secrets.findIndex(secret => secureEqual(createHmac('sha256', secret).update(signedPayload).digest('hex'), supplied))
  if (index < 0) throw new WorkMeshSdkError('Webhook signature is invalid', { code: 'WEBHOOK_SIGNATURE_INVALID' })
  try { return { timestamp, secretIndex: index, payload: JSON.parse(body.toString('utf8')) } } catch { throw new WorkMeshSdkError('Webhook body is not valid JSON', { code: 'MALFORMED_RESPONSE' }) }
}
function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex'); const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export type { AgentSessionState, Capability }
