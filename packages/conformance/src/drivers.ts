import { WorkMeshClient } from '@workmesh/agent-sdk'
import { agentCapabilityManifestResponseSchema } from '@workmesh/contracts'
import type {
  CollaborationConformanceDriver,
  ConformanceSeed,
  DriverValue,
  FailureProbe,
} from './types.js'

type LifecycleHooks = Readonly<{
  disconnect?: () => Promise<void>
  reconnect?: (cursor: string) => Promise<void>
  failureProbe: (errorCode: string) => Promise<FailureProbe>
}>

const objectValue = (value: unknown): DriverValue =>
  value && typeof value === 'object' ? value as DriverValue : { value }

export class NativeHttpReferenceDriver implements CollaborationConformanceDriver {
  readonly adapter = 'native-http' as const
  constructor(private readonly client: WorkMeshClient, private readonly hooks: LifecycleHooks) {}

  async discover(profileVersion: string) {
    const [info, manifest] = await Promise.all([
      this.client.getServerInfo(),
      this.client.getAgentCapabilities({ profileVersion }),
    ])
    return { info: objectValue(info), manifest: agentCapabilityManifestResponseSchema.parse(manifest) }
  }
  async acknowledgeSession(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.acknowledge(seed.sessionId, { summary: 'Conformance assignment received.' }, { idempotencyKey })) }
  async getContext(seed: ConformanceSeed) { return objectValue(await this.client.getSessionContext(seed.sessionId)) }
  async listInbox(_seed: ConformanceSeed) { return objectValue(await this.client.listInbox('open')) }
  async acknowledgeInbox(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.acknowledgeInboxItem(seed.inboxItemId, { idempotencyKey })) }
  async postMessage(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.postRoomMessage(seed.roomId, { intent: 'status', body: 'Conformance client is active.', sessionId: seed.sessionId }, { idempotencyKey })) }
  async appendActivity(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.appendActivity(seed.sessionId, { kind: 'action_completed', summary: 'Conformance action completed.' }, { idempotencyKey })) }
  async publishArtifact(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.publishArtifact({ sessionId: seed.sessionId, workItemId: seed.workItemId, type: 'test_report', title: 'Client conformance evidence', sourceTool: '@workmesh/conformance' }, { idempotencyKey })) }
  async offerHandoff(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.offerHandoff({ fromSessionId: seed.sessionId, targetAgentId: seed.targetAgentId, scopeType: 'work_item', scopeId: seed.workItemId, summary: 'Conformance handoff package.', completedWork: ['Profile negotiation'], remainingWork: ['Verify recipient recovery'], acceptanceCriteria: ['Recipient can inspect the package'], requestedCapabilities: ['work:read'], status: 'requested' }, { idempotencyKey })) }
  async completeSession(seed: ConformanceSeed, artifactId: string, idempotencyKey: string) { return objectValue(await this.client.complete(seed.sessionId, { summary: 'Client Profile conformance completed.', artifactIds: [artifactId], checks: [{ name: 'client-profile-conformance', status: 'passed', summary: 'passed' }], limitations: [] }, { ifMatch: seed.sessionRevision, idempotencyKey })) }
  async disconnect() { await this.hooks.disconnect?.() }
  async reconnect(cursor: string) { await this.hooks.reconnect?.(cursor) }
  async listEvents(_seed: ConformanceSeed, cursor: string) { return (await this.client.listEvents({ cursor })).map(objectValue) }
  async probeFailure(errorCode: string) { return this.hooks.failureProbe(errorCode) }
}

export interface McpReferenceClient {
  readResource(uri: string): Promise<unknown>
  callTool(name: string, argumentsValue: Record<string, unknown>): Promise<unknown>
}

const unwrap = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'structuredContent' in value) {
    const structured = (value as { structuredContent?: unknown }).structuredContent
    if (structured && typeof structured === 'object' && 'data' in structured) return (structured as { data: unknown }).data
  }
  return value
}

export class McpReferenceDriver implements CollaborationConformanceDriver {
  readonly adapter = 'mcp' as const
  constructor(private readonly client: McpReferenceClient, private readonly hooks: LifecycleHooks) {}
  private async resource(uri: string): Promise<DriverValue> { return objectValue(unwrap(await this.client.readResource(uri))) }
  private async tool(name: string, args: Record<string, unknown>): Promise<DriverValue> { return objectValue(unwrap(await this.client.callTool(name, args))) }

  async discover(_profileVersion: string) {
    const [info, manifest] = await Promise.all([
      this.resource('workmesh://server/info'),
      this.resource('workmesh://agent/capabilities'),
    ])
    return { info, manifest: agentCapabilityManifestResponseSchema.parse(manifest) }
  }
  acknowledgeSession(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('ack_agent_session', { sessionId: seed.sessionId, summary: 'Conformance assignment received.', idempotencyKey }) }
  getContext(seed: ConformanceSeed) { return this.resource(`workmesh://session/${seed.sessionId}/context`) }
  listInbox(_seed: ConformanceSeed) { return this.tool('list_inbox_items', { status: 'open' }) }
  acknowledgeInbox(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('acknowledge_inbox_item', { inboxItemId: seed.inboxItemId, idempotencyKey }) }
  postMessage(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('post_work_room_message', { roomId: seed.roomId, intent: 'status', body: 'Conformance client is active.', sessionId: seed.sessionId, idempotencyKey }) }
  appendActivity(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('append_activity', { sessionId: seed.sessionId, kind: 'action_completed', summary: 'Conformance action completed.', idempotencyKey }) }
  publishArtifact(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('publish_artifact', { sessionId: seed.sessionId, workItemId: seed.workItemId, type: 'test_report', title: 'Client conformance evidence', sourceTool: '@workmesh/conformance', idempotencyKey }) }
  offerHandoff(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('offer_handoff', { fromSessionId: seed.sessionId, targetAgentId: seed.targetAgentId, scopeType: 'work_item', scopeId: seed.workItemId, summary: 'Conformance handoff package.', completedWork: ['Profile negotiation'], remainingWork: ['Verify recipient recovery'], acceptanceCriteria: ['Recipient can inspect the package'], requestedCapabilities: ['work:read'], status: 'requested', idempotencyKey }) }
  completeSession(seed: ConformanceSeed, artifactId: string, idempotencyKey: string) { return this.tool('complete_session', { sessionId: seed.sessionId, revision: seed.sessionRevision, summary: 'Client Profile conformance completed.', artifactIds: [artifactId], checks: [{ name: 'client-profile-conformance', status: 'passed', summary: 'passed' }], limitations: [], idempotencyKey }) }
  async disconnect() { await this.hooks.disconnect?.() }
  async reconnect(cursor: string) { await this.hooks.reconnect?.(cursor) }
  async listEvents(_seed: ConformanceSeed, cursor: string) {
    const value = await this.tool('list_events', { cursor })
    return Array.isArray(value.events) ? value.events.map(objectValue) : []
  }
  async probeFailure(errorCode: string) { return this.hooks.failureProbe(errorCode) }
}
