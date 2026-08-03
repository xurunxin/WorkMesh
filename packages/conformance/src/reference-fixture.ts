import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createAgentCapabilityManifest, featureDefinitions, releaseMetadata } from '@workmesh/contracts'
import { McpReferenceDriver, NativeHttpReferenceDriver } from './drivers.js'
import type {
  CollaborationConformanceDriver,
  ConformanceSeed,
  DriverValue,
} from './types.js'

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`
export const referenceSeed: ConformanceSeed = Object.freeze({
  sessionId: id('1'),
  sessionRevision: 7,
  workItemId: id('2'),
  roomId: id('3'),
  inboxItemId: id('4'),
  targetAgentId: id('5'),
  startCursor: '40',
  expectedEventIds: [id('41'), id('42')],
})

type ReferenceFailure = Readonly<{
  operation: string
  errorCode: string
  status: number
  details: Readonly<Record<string, unknown>>
}>

const referenceFailures: Readonly<Record<string, ReferenceFailure>> = Object.freeze({
  'revoked-delegation': { operation: 'session', errorCode: 'DELEGATION_NOT_ACTIVE', status: 409, details: { delegationState: 'revoked' } },
  'expired-session-token': { operation: 'session', errorCode: 'UNAUTHENTICATED', status: 401, details: { tokenState: 'expired' } },
  'stopped-session': { operation: 'activity', errorCode: 'SESSION_STOPPED', status: 409, details: { sessionState: 'stopped' } },
  'out-of-scope-resource': { operation: 'context', errorCode: 'RESOURCE_SCOPE_DENIED', status: 403, details: { resourceState: 'outside_delegation_scope' } },
  'stale-revision': { operation: 'session-state', errorCode: 'REVISION_CONFLICT', status: 409, details: { currentRevision: 9, suppliedRevision: 7 } },
  'lost-lease': { operation: 'provider-action', errorCode: 'LEASE_EXPIRED', status: 409, details: { leaseState: 'expired' } },
  'approval-required': { operation: 'request-merge', errorCode: 'APPROVAL_REQUIRED', status: 409, details: { approvalState: 'missing' } },
  'feature-disabled': { operation: 'provider-action', errorCode: 'FEATURE_DISABLED', status: 403, details: { feature: 'WORKMESH_BETA_GITEA', enabled: false } },
  'cursor-gap': { operation: 'events', errorCode: 'CURSOR_EXPIRED', status: 409, details: { minimumCursor: '50', resyncCursor: '50', resyncRequired: true } },
})

class ReferenceProtocolError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Readonly<Record<string, unknown>>,
  ) {
    super(`Prepared reference failure: ${code}`)
  }
}

class ReferenceProtocolState {
  private disconnected = false
  private readonly effects = new Map<string, DriverValue>()
  private effectSequence = 100
  private sessionRevision = referenceSeed.sessionRevision
  private sessionState: 'queued' | 'acknowledged' | 'executing' | 'completed' = 'queued'
  private pendingFailure: ReferenceFailure | undefined
  readonly manifest = createAgentCapabilityManifest({
    actorId: id('6'),
    sessionId: referenceSeed.sessionId,
    sessionState: 'queued',
    sessionRevision: referenceSeed.sessionRevision,
    effectiveCapabilities: ['work:read', 'work:write', 'message:write', 'artifact:write'],
    capabilityScope: { workspaceId: id('7'), teamIds: [id('8')], projectIds: [], workItemIds: [referenceSeed.workItemId], repositoryIds: [], capabilities: ['work:read', 'work:write', 'message:write', 'artifact:write'] },
    supportedProtocols: ['native_http', 'mcp'],
    pushConfigured: true,
    features: Object.fromEntries(featureDefinitions.map(feature => [feature.key, false])) as Record<(typeof featureDefinitions)[number]['key'], boolean>,
  })
  readonly info = { ...releaseMetadata, buildSha: 'reference-fixture' }

  disconnect = async (): Promise<void> => { this.disconnected = true }
  reconnect = async (_cursor: string): Promise<void> => { this.disconnected = false }
  prepareFailure = async (scenarioId: string): Promise<void> => {
    const failure = referenceFailures[scenarioId]
    if (!failure) throw new Error(`Unknown hostile reference scenario: ${scenarioId}`)
    if (this.pendingFailure) throw new Error('A hostile reference scenario is already pending')
    this.pendingFailure = failure
  }

  private assertRevision(input: Readonly<Record<string, unknown>>): void {
    if (input.revision !== this.sessionRevision) {
      throw new ReferenceProtocolError('REVISION_CONFLICT', 409, {
        currentRevision: this.sessionRevision,
        suppliedRevision: input.revision,
      })
    }
  }

  private effect(
    operation: string,
    key: string | undefined,
    preferredId?: string,
    onCommit?: () => void,
  ): DriverValue {
    const dedupe = `${operation}:${key ?? `unkeyed-${this.effectSequence + 1}`}`
    const current = this.effects.get(dedupe)
    if (current) return current
    onCommit?.()
    const value = { id: preferredId ?? id(String(++this.effectSequence)), revision: this.sessionRevision }
    this.effects.set(dedupe, value)
    return value
  }

  private applyPendingFailure(operation: string): void {
    const pending = this.pendingFailure
    if (!pending) return
    if (pending.operation !== operation) {
      throw new Error(`Prepared hostile operation ${pending.operation} was invoked as ${operation}`)
    }
    this.pendingFailure = undefined
    throw new ReferenceProtocolError(pending.errorCode, pending.status, pending.details)
  }

  events(): DriverValue[] {
    if (this.disconnected) throw new Error('Reference client is disconnected')
    return referenceSeed.expectedEventIds.map((eventId, index) => ({
      cursor: String(41 + index),
      id: eventId,
      event_type: 'work.room.message.posted',
      event_version: 1,
      workspace_id: id('7'),
      team_id: id('8'),
      audience_actor_id: null,
      audience: { visibility: 'team', workspaceId: id('7'), teamId: id('8'), actorId: null },
      scopes: [{ type: 'work_item', id: referenceSeed.workItemId }],
      invalidates: [{ type: 'room', id: referenceSeed.roomId }],
      aggregate_type: 'room_message',
      aggregate_id: eventId,
      aggregate_revision: 1,
      actor_id: id('6'),
      correlation_id: `reference-${index}`,
      idempotency_key: null,
      payload: {},
      occurred_at: `2026-08-03T00:00:0${index}.000Z`,
    }))
  }

  dispatch(operation: string, key?: string, input: Readonly<Record<string, unknown>> = {}): unknown {
    if (this.disconnected) throw new Error('Reference client is disconnected')
    this.applyPendingFailure(operation)
    if (operation === 'server-info') return this.info
    if (operation === 'agent-capabilities') return this.manifest
    if (operation === 'session') return { id: referenceSeed.sessionId, state: this.sessionState, revision: this.sessionRevision }
    if (operation === 'context') return { sessionId: referenceSeed.sessionId, workItemId: referenceSeed.workItemId }
    if (operation === 'inbox') return { items: [{ id: referenceSeed.inboxItemId, kind: 'ask' }], nextCursor: null }
    if (operation === 'events') return this.events()
    if (operation === 'session-ack') {
      return this.effect(operation, key, undefined, () => {
        if (this.sessionState !== 'queued') throw new ReferenceProtocolError('INVALID_SESSION_TRANSITION', 409, { currentState: this.sessionState, requestedState: 'acknowledged' })
        this.sessionState = 'acknowledged'
        this.sessionRevision += 1
      })
    }
    if (operation === 'session-state') {
      return this.effect(operation, key, undefined, () => {
        this.assertRevision(input)
        if (this.sessionState !== 'acknowledged' || input.state !== 'executing') throw new ReferenceProtocolError('INVALID_SESSION_TRANSITION', 409, { currentState: this.sessionState, requestedState: input.state })
        this.sessionState = 'executing'
        this.sessionRevision += 1
      })
    }
    if (operation === 'activity') {
      return this.effect(operation, key, undefined, () => { this.sessionRevision += 1 })
    }
    if (operation === 'complete') {
      return this.effect(operation, key, undefined, () => {
        this.assertRevision(input)
        if (this.sessionState !== 'executing') throw new ReferenceProtocolError('INVALID_SESSION_TRANSITION', 409, { currentState: this.sessionState, requestedState: 'completed' })
        this.sessionState = 'completed'
        this.sessionRevision += 1
      })
    }
    if (operation === 'artifact') return this.effect(operation, key, id('200'))
    if (operation === 'handoff') return this.effect(operation, key, id('201'))
    return this.effect(operation, key)
  }
}

const operationFromNative = (url: URL, method: string): string => {
  if (url.pathname === '/api/v1/info') return 'server-info'
  if (url.pathname === '/api/v1/agent-capabilities') return 'agent-capabilities'
  if (/^\/api\/v1\/agent-sessions\/[^/]+$/.test(url.pathname)) return 'session'
  if (url.pathname.endsWith('/context')) return 'context'
  if (url.pathname === '/api/v1/inbox') return 'inbox'
  if (url.pathname === '/api/v1/events') return 'events'
  if (url.pathname === '/api/v1/provider-actions') return 'provider-action'
  if (/^\/api\/v1\/pull-requests\/[^/]+\/merge$/.test(url.pathname)) return 'request-merge'
  if (url.pathname === '/api/v1/artifacts') return 'artifact'
  if (url.pathname === '/api/v1/handoffs') return 'handoff'
  if (url.pathname.includes('/messages')) return 'message'
  if (url.pathname.includes('/activities')) return 'activity'
  if (url.pathname.endsWith('/acknowledge')) return 'inbox-ack'
  if (url.pathname.endsWith('/ack')) return 'session-ack'
  if (url.pathname.endsWith('/state')) return 'session-state'
  if (url.pathname.endsWith('/complete')) return 'complete'
  return `${method}:${url.pathname}`
}

const operationFromMcp = (name: string): string => ({
  ack_agent_session: 'session-ack',
  transition_agent_session_state: 'session-state',
  list_inbox_items: 'inbox',
  acknowledge_inbox_item: 'inbox-ack',
  post_work_room_message: 'message',
  append_activity: 'activity',
  publish_artifact: 'artifact',
  offer_handoff: 'handoff',
  complete_session: 'complete',
  list_events: 'events',
  create_repository_branch: 'provider-action',
  merge_pull_request: 'request-merge',
}[name] ?? name)

const bodyFrom = (body: BodyInit | null | undefined): Readonly<Record<string, unknown>> => {
  if (typeof body !== 'string' || body.length === 0) return {}
  const value: unknown = JSON.parse(body)
  return value && typeof value === 'object' ? value as Readonly<Record<string, unknown>> : {}
}

const revisionFrom = (headers: Headers): number | undefined => {
  const match = /^"revision-(\d+)"$/.exec(headers.get('if-match') ?? '')
  return match ? Number(match[1]) : undefined
}

const errorBody = (error: ReferenceProtocolError): object => ({
  error: {
    code: error.code,
    message: error.message,
    details: error.details,
    correlationId: `reference-${error.code.toLowerCase()}`,
  },
})

export function createNativeReferenceDriver(): CollaborationConformanceDriver {
  const state = new ReferenceProtocolState()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)
    const key = headers.get('idempotency-key') ?? undefined
    const body = bodyFrom(init?.body)
    const revision = revisionFrom(headers)
    try {
      const value = state.dispatch(operationFromNative(url, method), key, revision === undefined ? body : { ...body, revision })
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
    } catch (error) {
      if (!(error instanceof ReferenceProtocolError)) throw error
      return new Response(JSON.stringify(errorBody(error)), { status: error.status, headers: { 'content-type': 'application/json' } })
    }
  }
  return new NativeHttpReferenceDriver(
    new WorkMeshClient({ baseUrl: 'https://reference.workmesh.invalid', sessionToken: 'reference-session-token', fetch: fixtureFetch }),
    { disconnect: state.disconnect, reconnect: state.reconnect, prepareFailure: state.prepareFailure },
  )
}

export function createMcpReferenceDriver(): CollaborationConformanceDriver {
  const state = new ReferenceProtocolState()
  return new McpReferenceDriver({
    readResource: async uri => {
      if (uri === 'workmesh://server/info') return state.dispatch('server-info')
      if (uri === 'workmesh://agent/capabilities') return state.dispatch('agent-capabilities')
      if (/^workmesh:\/\/session\/[^/]+$/.test(uri)) return state.dispatch('session')
      if (uri.includes('/context')) return state.dispatch('context')
      throw new Error(`Unsupported reference resource: ${uri}`)
    },
    callTool: async (name, args) => {
      const operation = operationFromMcp(name)
      try {
        const value = state.dispatch(operation, typeof args.idempotencyKey === 'string' ? args.idempotencyKey : undefined, args)
        return { structuredContent: { data: operation === 'events' ? { events: value } : value } }
      } catch (error) {
        if (!(error instanceof ReferenceProtocolError)) throw error
        return { isError: true, structuredContent: errorBody(error) }
      }
    },
  }, { disconnect: state.disconnect, reconnect: state.reconnect, prepareFailure: state.prepareFailure })
}
