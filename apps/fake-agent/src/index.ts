import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { WorkMeshClient, WorkMeshSdkError, stableIdempotencyKey, verifyWebhook } from '@workmesh/agent-sdk'

export interface FakeAgentOptions {
  apiUrl: string
  installationToken: string
  webhookSecrets: string[]
  ackDelayMs?: number
  stale?: boolean
  publishPlan?: boolean
  appendActivity?: boolean
  askQuestion?: boolean
  requestApproval?: boolean
  fail?: boolean
  complete?: boolean
  confirmStop?: boolean
  writeAfterStop?: boolean
}
interface ApprovalDecisionPayload {
  actor_id?: string
  decision?: 'approved' | 'rejected' | string
  reason?: string
  source?: string
}
interface DeliveryEvent {
  id?: string
  type?: string
  sessionId?: string
  session_id?: string
  payload?: {
    sessionId?: string
    exchangeToken?: string
    approvalId?: string
    decision?: ApprovalDecisionPayload
    workItem?: { id?: string }
    signal?: 'stop' | 'pause' | 'resume'
    state?: string
  }
}
export type FakeAgentApprovalDecision = {
  sessionId: string
  approvalId: string
  decision: 'approved' | 'rejected'
  reason: string
  immutable: true
}
type PendingPhase = 'running' | 'awaiting_input' | 'awaiting_approval'

export class FakeAgent {
  private readonly deliveries = new Set<string>()
  /** Session tokens live only in this process; they are never logged or persisted. */
  private readonly sessionClients = new Map<string, WorkMeshClient>()
  private readonly phases = new Map<string, PendingPhase>()
  private readonly askedForInput = new Set<string>()
  private readonly requestedApproval = new Set<string>()
  private readonly active = new Set<Promise<void>>()
  private readonly eventChains = new Map<string, Promise<void>>()
  private readonly decisionReasons = new Map<string, FakeAgentApprovalDecision>()
  private readonly pendingApprovalTerminals = new Map<string, { type: 'approval.approved' | 'approval.rejected'; workItemId?: string }>()
  readonly approvalDecisions: FakeAgentApprovalDecision[] = []
  readonly resultSummaries: string[] = []
  readonly errors: string[] = []
  constructor(readonly options: FakeAgentOptions, private readonly newClient = () => new WorkMeshClient({ baseUrl: options.apiUrl })) {}

  accept(rawBody: Buffer, headers: Record<string, string | undefined>): boolean {
    const verified = verifyWebhook(rawBody, headers, { secrets: this.options.webhookSecrets })
    const deliveryId = headers['workmesh-delivery-id'] ?? headers['WorkMesh-Delivery-Id']
    if (!deliveryId) throw new WorkMeshSdkError('Webhook delivery id is missing', { code: 'WEBHOOK_DELIVERY_ID_MISSING' })
    if (this.deliveries.has(deliveryId)) return false
    this.deliveries.add(deliveryId)
    const events = eventList(verified.payload)
    for (const event of events) this.start(event)
    return true
  }

  async whenIdle(): Promise<void> { await Promise.all([...this.active]) }

  private start(event: DeliveryEvent): void {
    const sessionId = event.sessionId ?? event.session_id ?? event.payload?.sessionId
    const previous = sessionId ? this.eventChains.get(sessionId) : undefined
    let task: Promise<void>
    task = (previous ?? Promise.resolve())
      .then(() => this.handle(event))
      .catch(error => {
        const message = error instanceof Error ? error.message : 'unknown error'
        this.errors.push(message)
        console.error('Fake Agent event failed', message)
      })
      .finally(() => {
        this.active.delete(task)
        if (sessionId && this.eventChains.get(sessionId) === task) this.eventChains.delete(sessionId)
      })
    if (sessionId) this.eventChains.set(sessionId, task)
    this.active.add(task)
  }

  private async handle(event: DeliveryEvent): Promise<void> {
    const sessionId = event.sessionId ?? event.session_id ?? event.payload?.sessionId
    if (!sessionId) return
    const client = this.sessionClients.get(sessionId)
    const signal = signalFromEvent(event)
    if (signal === 'stop') {
      if (!client) return
      if (this.options.confirmStop !== false) {
        const session = await client.getSession<{ revision: number }>(sessionId)
        await client.stopAcknowledgement(sessionId, { cleanupSummary: 'Fake Agent stopped and released local work.', residualRisks: [] }, { ifMatch: session.revision, idempotencyKey: stableIdempotencyKey(sessionId, 'stop-ack') })
      }
      if (this.options.writeAfterStop) await this.intentionalStoppedWrite(client, sessionId)
      return
    }
    if (event.type === 'agent.session.prompted') {
      if (client && this.phases.get(sessionId) === 'awaiting_input') {
        await client.sendMessage(sessionId, 'Fake Agent received a new prompt and is resuming work.')
        this.phases.set(sessionId, 'running')
        await this.afterInteractiveStep(sessionId, client, event.payload?.workItem?.id)
      }
      return
    }
    if (signal === 'pause') return
    if (signal === 'resume') {
      if (client) await client.appendActivity(sessionId, { kind: 'status', summary: 'Fake Agent resumed after a server signal.' })
      return
    }
    if (event.type === 'approval.decision.recorded' && client) {
      const approvalId = event.payload?.approvalId
      const decision = event.payload?.decision?.decision
      const reason = event.payload?.decision?.reason?.trim()
      if (!approvalId || (decision !== 'approved' && decision !== 'rejected') || !reason) {
        throw new WorkMeshSdkError('Approval decision event is missing a valid decision or reason', { code: 'APPROVAL_DECISION_INVALID' })
      }
      const recorded: FakeAgentApprovalDecision = { sessionId, approvalId, decision, reason, immutable: true }
      this.approvalDecisions.push(recorded)
      this.decisionReasons.set(`${sessionId}:${approvalId}`, recorded)
      if (this.options.appendActivity !== false) {
        await client.appendActivity(sessionId, {
          kind: 'message',
          summary: `Fake Agent received Human ${decision} decision.`,
          detailsMarkdown: `Decision reason: ${reason}`,
        }, { idempotencyKey: stableIdempotencyKey(sessionId, `approval-decision:${approvalId}`) })
      }
      const terminal = this.pendingApprovalTerminals.get(`${sessionId}:${approvalId}`)
      if (terminal && this.phases.get(sessionId) === 'awaiting_approval') {
        this.pendingApprovalTerminals.delete(`${sessionId}:${approvalId}`)
        this.phases.set(sessionId, 'running')
        await this.completeFlow(sessionId, client, terminal.workItemId, {
          decision: terminal.type === 'approval.approved' ? 'approved' : 'rejected',
          reason,
        })
      }
      return
    }
    if ((event.type === 'approval.approved' || event.type === 'approval.rejected') && client && this.phases.get(sessionId) === 'awaiting_approval') {
      const approvalId = event.payload?.approvalId
      const recorded = approvalId ? this.decisionReasons.get(`${sessionId}:${approvalId}`) : undefined
      if (approvalId && !recorded) {
        this.pendingApprovalTerminals.set(`${sessionId}:${approvalId}`, {
          type: event.type,
          workItemId: event.payload?.workItem?.id,
        })
        return
      }
      this.phases.set(sessionId, 'running')
      await this.completeFlow(sessionId, client, event.payload?.workItem?.id, {
        decision: event.type === 'approval.approved' ? 'approved' : 'rejected',
        reason: recorded?.reason,
      })
      return
    }
    if (event.type !== 'agent.session.created') return
    const exchangeToken = event.payload?.exchangeToken
    if (!exchangeToken) throw new WorkMeshSdkError('Session-created delivery does not contain an exchange token', { code: 'EXCHANGE_TOKEN_MISSING' })
    if (this.options.stale) return
    const createdClient = this.newClient()
    if (this.options.ackDelayMs) await delay(this.options.ackDelayMs)
    await createdClient.exchangeSessionToken(sessionId, exchangeToken, this.options.installationToken)
    this.sessionClients.set(sessionId, createdClient)
    await createdClient.acknowledge(sessionId, { summary: 'Fake Agent received the session and is preparing an observable plan.' })
    await createdClient.getSessionContext(sessionId)
    const acknowledgedSession = await createdClient.getSession<{ revision: number }>(sessionId)
    await createdClient.transitionState(
      sessionId,
      'executing',
      'Fake Agent began deterministic conformance execution.',
      {
        ifMatch: acknowledgedSession.revision,
        idempotencyKey: stableIdempotencyKey(sessionId, 'execute'),
      },
    )
    if (this.options.publishPlan !== false) {
      const session = await createdClient.getSession<{ revision: number }>(sessionId)
      await createdClient.publishPlan(sessionId, { changeSummary: 'Fake Agent standard conformance plan.', steps: [{ id: randomUUID(), title: 'Produce a deterministic conformance result', ordinal: 0, status: 'in_progress', dependsOn: [], acceptanceCriteria: ['A test report artifact is published'], expectedArtifacts: ['test_report'] }] }, { ifMatch: session.revision })
    }
    if (this.options.appendActivity !== false) await createdClient.appendActivity(sessionId, { kind: 'action_completed', summary: 'Fake Agent executed its deterministic conformance action.', toolInvocation: { toolName: 'fake-agent', inputSanitized: {}, status: 'succeeded', resultSummary: 'conformance action completed' } })
    if (this.options.fail) {
      const session = await createdClient.getSession<{ revision: number }>(sessionId)
      await createdClient.fail(sessionId, { code: 'FAKE_AGENT_FAILURE', summary: 'Intentional conformance failure.', retryable: false, evidence: ['fake-agent configured to fail'] }, { ifMatch: session.revision })
      return
    }
    await this.afterInteractiveStep(sessionId, createdClient, event.payload?.workItem?.id)
  }

  private async afterInteractiveStep(sessionId: string, client: WorkMeshClient, workItemId?: string): Promise<void> {
    if (this.options.askQuestion && !this.askedForInput.has(sessionId)) {
      this.askedForInput.add(sessionId)
      this.phases.set(sessionId, 'awaiting_input')
      await client.askQuestion(sessionId, 'Fake Agent question: should this conformance result be retained?')
      return
    }
    if (this.options.requestApproval && !this.requestedApproval.has(sessionId)) {
      this.requestedApproval.add(sessionId)
      const actionPayloadSanitized = { actionName: 'fake_agent.finish', sessionId }
      this.phases.set(sessionId, 'awaiting_approval')
      await client.requestApproval({ sessionId, approvalType: 'fake_agent_confirmation', actionName: actionPayloadSanitized.actionName, actionPayloadSanitized, actionPayloadHash: canonicalJsonSha256(actionPayloadSanitized), riskLevel: 'low', rationaleSummary: 'Exercise the approval protocol.', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
      return
    }
    await this.completeFlow(sessionId, client, workItemId)
  }

  private async completeFlow(sessionId: string, client: WorkMeshClient, workItemId?: string, decisionContext?: { decision: 'approved' | 'rejected'; reason?: string }): Promise<void> {
    const decisionSummary = decisionContext
      ? ` after Human ${decisionContext.decision} decision.`
      : '.'
    const reasonSummary = decisionContext?.reason ? ` Decision reason: ${decisionContext.reason}` : ''
    const summary = `Fake Agent conformance flow completed${decisionSummary}${reasonSummary}`
    this.resultSummaries.push(summary)
    const artifact = await client.publishArtifact({
      sessionId,
      workItemId,
      type: 'test_report',
      title: 'Fake Agent conformance report',
      sourceTool: 'fake-agent',
      metadata: {
        status: decisionContext?.decision === 'rejected' ? 'rejected' : 'passed',
        command: 'fake-agent conformance',
        humanDecision: decisionContext?.decision ?? null,
        humanDecisionReason: decisionContext?.reason ?? null,
      },
    }) as { id: string }
    if (this.options.complete !== false) {
      const session = await client.getSession<{ revision: number }>(sessionId)
      await client.complete(sessionId, { summary, artifactIds: [artifact.id], checks: [{ name: 'fake-agent-conformance', command: 'fake-agent conformance', status: 'passed', summary: 'passed' }], limitations: [] }, { ifMatch: session.revision })
    }
  }

  private async intentionalStoppedWrite(client: WorkMeshClient, sessionId: string): Promise<void> {
    try {
      await client.appendActivity(sessionId, { kind: 'error', summary: 'Intentional invalid post-stop write for conformance testing.' }, { idempotencyKey: stableIdempotencyKey(sessionId, 'intentional-post-stop-write') })
      throw new Error('Post-stop write unexpectedly succeeded')
    } catch (error) {
      if (error instanceof WorkMeshSdkError && (error.status === 409 || error.status === 403)) return
      throw error
    }
  }
}

export function createFakeAgentServer(agent: FakeAgent): Server {
  return createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/workmesh/events') return send(response, 404, { error: 'not found' })
    try {
      const raw = await readRawBody(request)
      const headers = Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]))
      const accepted = agent.accept(raw, headers)
      send(response, accepted ? 202 : 409, { accepted, duplicate: !accepted })
    } catch (error) {
      const message = error instanceof WorkMeshSdkError ? error.code : 'INVALID_WEBHOOK'
      send(response, 401, { error: message })
    }
  })
}

function eventList(payload: unknown): DeliveryEvent[] {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { events?: unknown }).events)) return (payload as { events: DeliveryEvent[] }).events
  return payload && typeof payload === 'object' ? [payload as DeliveryEvent] : []
}
function signalFromEvent(event: DeliveryEvent): 'stop' | 'pause' | 'resume' | undefined {
  if (event.type === 'agent.session.signal.stop') return 'stop'
  if (event.type === 'agent.session.signal.pause') return 'pause'
  if (event.type === 'agent.session.signal.resume') return 'resume'
  if (event.type === 'agent.session.state_changed') {
    if (event.payload?.signal) return event.payload.signal
    if (event.payload?.state === 'paused') return 'pause'
    if (event.payload?.state === 'executing') return 'resume'
    if (event.payload?.state === 'stopping' || event.payload?.state === 'canceled') return 'stop'
  }
  return undefined
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]))
  return value
}
export function canonicalJsonSha256(value: unknown): string { return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}` }
function readRawBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => { const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(Buffer.from(chunk))); request.on('end', () => resolve(Buffer.concat(chunks))); request.on('error', reject) })
}
function send(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
function delay(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)) }

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const apiUrl = process.env.WORKMESH_API_URL
  const installationToken = process.env.WORKMESH_INSTALLATION_TOKEN
  const secret = process.env.WORKMESH_WEBHOOK_SECRET
  if (!apiUrl || !installationToken || !secret) throw new Error('WORKMESH_API_URL, WORKMESH_INSTALLATION_TOKEN, and WORKMESH_WEBHOOK_SECRET are required')
  const agent = new FakeAgent({ apiUrl, installationToken, webhookSecrets: [secret, ...(process.env.WORKMESH_WEBHOOK_OLD_SECRET ? [process.env.WORKMESH_WEBHOOK_OLD_SECRET] : [])], ackDelayMs: Number(process.env.FAKE_AGENT_ACK_DELAY_MS ?? 0), stale: process.env.FAKE_AGENT_STALE === 'true', askQuestion: process.env.FAKE_AGENT_ASK_QUESTION === 'true', requestApproval: process.env.FAKE_AGENT_REQUEST_APPROVAL === 'true', fail: process.env.FAKE_AGENT_FAIL === 'true', writeAfterStop: process.env.FAKE_AGENT_WRITE_AFTER_STOP === 'true' })
  createFakeAgentServer(agent).listen(Number(process.env.PORT ?? 4010), '127.0.0.1', () => console.log('Fake Agent listening on 127.0.0.1'))
}
