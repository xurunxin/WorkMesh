import { WorkMeshClient } from '@workmesh/agent-sdk'
import { createAgentCapabilityManifest, featureDefinitions, releaseMetadata } from '@workmesh/contracts'
import { McpReferenceDriver, NativeHttpReferenceDriver } from './drivers.js'
import type { CollaborationConformanceDriver, ConformanceSeed, DriverValue } from './types.js'

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

class ReferenceProtocolState {
  private disconnected = false
  private readonly effects = new Map<string, DriverValue>()
  private effectSequence = 100
  readonly manifest = createAgentCapabilityManifest({
    actorId: id('6'),
    sessionId: referenceSeed.sessionId,
    sessionState: 'executing',
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
  failureProbe = async (errorCode: string) => ({ code: errorCode, details: { fixture: true } })

  private effect(operation: string, key: string | undefined, preferredId?: string): DriverValue {
    const dedupe = `${operation}:${key ?? `unkeyed-${this.effectSequence}`}`
    const current = this.effects.get(dedupe)
    if (current) return current
    const value = { id: preferredId ?? id(String(++this.effectSequence)), revision: referenceSeed.sessionRevision }
    this.effects.set(dedupe, value)
    return value
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

  dispatch(operation: string, key?: string): unknown {
    if (this.disconnected) throw new Error('Reference client is disconnected')
    if (operation === 'server-info') return this.info
    if (operation === 'agent-capabilities') return this.manifest
    if (operation === 'context') return { sessionId: referenceSeed.sessionId, workItemId: referenceSeed.workItemId }
    if (operation === 'inbox') return { items: [{ id: referenceSeed.inboxItemId, kind: 'ask' }], nextCursor: null }
    if (operation === 'events') return this.events()
    if (operation === 'artifact') return this.effect(operation, key, id('200'))
    if (operation === 'handoff') return this.effect(operation, key, id('201'))
    return this.effect(operation, key)
  }
}

const operationFromNative = (url: URL, method: string): string => {
  if (url.pathname === '/api/v1/info') return 'server-info'
  if (url.pathname === '/api/v1/agent-capabilities') return 'agent-capabilities'
  if (url.pathname.endsWith('/context')) return 'context'
  if (url.pathname === '/api/v1/inbox') return 'inbox'
  if (url.pathname === '/api/v1/events') return 'events'
  if (url.pathname === '/api/v1/artifacts') return 'artifact'
  if (url.pathname === '/api/v1/handoffs') return 'handoff'
  if (url.pathname.includes('/messages')) return 'message'
  if (url.pathname.includes('/activities')) return 'activity'
  if (url.pathname.endsWith('/acknowledge')) return 'inbox-ack'
  if (url.pathname.endsWith('/ack')) return 'session-ack'
  if (url.pathname.endsWith('/complete')) return 'complete'
  return `${method}:${url.pathname}`
}

const operationFromMcp = (name: string): string => ({
  ack_agent_session: 'session-ack',
  list_inbox_items: 'inbox',
  acknowledge_inbox_item: 'inbox-ack',
  post_work_room_message: 'message',
  append_activity: 'activity',
  publish_artifact: 'artifact',
  offer_handoff: 'handoff',
  complete_session: 'complete',
  list_events: 'events',
}[name] ?? name)

export function createNativeReferenceDriver(): CollaborationConformanceDriver {
  const state = new ReferenceProtocolState()
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    const method = init?.method ?? 'GET'
    const key = new Headers(init?.headers).get('idempotency-key') ?? undefined
    const value = state.dispatch(operationFromNative(url, method), key)
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new NativeHttpReferenceDriver(
    new WorkMeshClient({ baseUrl: 'https://reference.workmesh.invalid', sessionToken: 'reference-session-token', fetch: fixtureFetch }),
    { disconnect: state.disconnect, reconnect: state.reconnect, failureProbe: state.failureProbe },
  )
}

export function createMcpReferenceDriver(): CollaborationConformanceDriver {
  const state = new ReferenceProtocolState()
  return new McpReferenceDriver({
    readResource: async uri => {
      if (uri === 'workmesh://server/info') return state.dispatch('server-info')
      if (uri === 'workmesh://agent/capabilities') return state.dispatch('agent-capabilities')
      if (uri.includes('/context')) return state.dispatch('context')
      throw new Error(`Unsupported reference resource: ${uri}`)
    },
    callTool: async (name, args) => {
      const operation = operationFromMcp(name)
      const value = state.dispatch(operation, typeof args.idempotencyKey === 'string' ? args.idempotencyKey : undefined)
      return { structuredContent: { data: operation === 'events' ? { events: value } : value } }
    },
  }, { disconnect: state.disconnect, reconnect: state.reconnect, failureProbe: state.failureProbe })
}
