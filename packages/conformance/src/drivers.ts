import { WorkMeshClient } from '@workmesh/agent-sdk'
import { agentCapabilityManifestResponseSchema } from '@workmesh/contracts'
import type {
  CollaborationConformanceDriver,
  ConformanceSeed,
  DriverValue,
  FailureProbe,
  HostileScenario,
} from './types.js'

type LifecycleHooks = Readonly<{
  disconnect?: () => Promise<void>
  reconnect?: (cursor: string) => Promise<void>
  prepareFailure: (scenarioId: string) => Promise<void>
}>

const objectValue = (value: unknown): DriverValue =>
  value && typeof value === 'object' ? value as DriverValue : { value }

const failureFrom = (error: unknown): FailureProbe => {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return { code: error.code, details: 'details' in error ? error.details : undefined }
  }
  throw error instanceof Error ? error : new Error(`Hostile probe failed without a machine error code: ${String(error)}`)
}

const mcpError = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || !('structuredContent' in value)) return undefined
  const structured = (value as { structuredContent?: unknown }).structuredContent
  if (!structured || typeof structured !== 'object' || !('error' in structured)) return undefined
  const error = structured.error
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return undefined
  return Object.assign(
    new Error('message' in error && typeof error.message === 'string' ? error.message : error.code),
    error,
  )
}

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
  async transitionSession(seed: ConformanceSeed, revision: number, idempotencyKey: string) { return objectValue(await this.client.transitionState(seed.sessionId, 'executing', 'Run Client Profile conformance.', { ifMatch: revision, idempotencyKey })) }
  async getSession(seed: ConformanceSeed) { return objectValue(await this.client.getSession(seed.sessionId)) }
  async getContext(seed: ConformanceSeed) { return objectValue(await this.client.getSessionContext(seed.sessionId)) }
  async listInbox(_seed: ConformanceSeed) { return objectValue(await this.client.listInbox('open')) }
  async acknowledgeInbox(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.acknowledgeInboxItem(seed.inboxItemId, { idempotencyKey })) }
  async postMessage(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.postRoomMessage(seed.roomId, { intent: 'status', body: 'Conformance client is active.', sessionId: seed.sessionId }, { idempotencyKey })) }
  async appendActivity(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.appendActivity(seed.sessionId, { kind: 'action_completed', summary: 'Conformance action completed.' }, { idempotencyKey })) }
  async publishArtifact(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.publishArtifact({ sessionId: seed.sessionId, workItemId: seed.workItemId, type: 'test_report', title: 'Client conformance evidence', sourceTool: '@workmesh/conformance' }, { idempotencyKey })) }
  async offerHandoff(seed: ConformanceSeed, idempotencyKey: string) { return objectValue(await this.client.offerHandoff({ fromSessionId: seed.sessionId, targetAgentId: seed.targetAgentId, scopeType: 'work_item', scopeId: seed.workItemId, summary: 'Conformance handoff package.', completedWork: ['Profile negotiation'], remainingWork: ['Verify recipient recovery'], acceptanceCriteria: ['Recipient can inspect the package'], requestedCapabilities: ['work:read'], status: 'requested' }, { idempotencyKey })) }
  async completeSession(seed: ConformanceSeed, artifactId: string, revision: number, idempotencyKey: string) { return objectValue(await this.client.complete(seed.sessionId, { summary: 'Client Profile conformance completed.', artifactIds: [artifactId], checks: [{ name: 'client-profile-conformance', status: 'passed', summary: 'passed' }], limitations: [] }, { ifMatch: revision, idempotencyKey })) }
  async disconnect() { await this.hooks.disconnect?.() }
  async reconnect(cursor: string) { await this.hooks.reconnect?.(cursor) }
  async listEvents(_seed: ConformanceSeed, cursor: string) { return (await this.client.listEvents({ cursor })).map(objectValue) }
  async probeFailure(scenario: HostileScenario, seed: ConformanceSeed) {
    await this.hooks.prepareFailure(scenario.id)
    try {
      if (scenario.operation === 'get-session') await this.client.getSession(seed.sessionId)
      else if (scenario.operation === 'get-context') await this.client.getSessionContext(seed.sessionId)
      else if (scenario.operation === 'append-activity') await this.client.appendActivity(seed.sessionId, { kind: 'action_completed', summary: `Hostile probe: ${scenario.id}.` }, { idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'transition-session') await this.client.transitionState(seed.sessionId, 'executing', `Hostile probe: ${scenario.id}.`, { ifMatch: seed.sessionRevision, idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'provider-action') await this.client.requestProviderAction({ kind: 'create_branch', repositoryId: seed.targetAgentId, workItemId: seed.workItemId, sessionId: seed.sessionId, name: `hostile-${scenario.id}`, baseSha: 'reference-head' }, { idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'request-merge') await this.client.requestMerge(seed.targetAgentId, { sessionId: seed.sessionId, approvalId: seed.inboxItemId, actionPayloadHash: `sha256:${'a'.repeat(64)}`, headSha: 'reference-head', method: 'squash' }, { idempotencyKey: `hostile-${scenario.id}` })
      else await this.client.listEvents({ cursor: seed.startCursor })
      throw new Error(`Hostile scenario ${scenario.id} unexpectedly succeeded`)
    } catch (error) {
      return failureFrom(error)
    }
  }
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
  private async tool(name: string, args: Record<string, unknown>): Promise<DriverValue> {
    const response = await this.client.callTool(name, args)
    const error = mcpError(response)
    if (error) throw error
    return objectValue(unwrap(response))
  }

  async discover(_profileVersion: string) {
    const [info, manifest] = await Promise.all([
      this.resource('workmesh://server/info'),
      this.resource('workmesh://agent/capabilities'),
    ])
    return { info, manifest: agentCapabilityManifestResponseSchema.parse(manifest) }
  }
  acknowledgeSession(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('ack_agent_session', { sessionId: seed.sessionId, summary: 'Conformance assignment received.', idempotencyKey }) }
  transitionSession(seed: ConformanceSeed, revision: number, idempotencyKey: string) { return this.tool('transition_agent_session_state', { sessionId: seed.sessionId, state: 'executing', reason: 'Run Client Profile conformance.', revision, idempotencyKey }) }
  getSession(seed: ConformanceSeed) { return this.resource(`workmesh://session/${seed.sessionId}`) }
  getContext(seed: ConformanceSeed) { return this.resource(`workmesh://session/${seed.sessionId}/context`) }
  listInbox(_seed: ConformanceSeed) { return this.tool('list_inbox_items', { status: 'open' }) }
  acknowledgeInbox(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('acknowledge_inbox_item', { inboxItemId: seed.inboxItemId, idempotencyKey }) }
  postMessage(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('post_work_room_message', { roomId: seed.roomId, intent: 'status', body: 'Conformance client is active.', sessionId: seed.sessionId, idempotencyKey }) }
  appendActivity(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('append_activity', { sessionId: seed.sessionId, kind: 'action_completed', summary: 'Conformance action completed.', idempotencyKey }) }
  publishArtifact(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('publish_artifact', { sessionId: seed.sessionId, workItemId: seed.workItemId, type: 'test_report', title: 'Client conformance evidence', sourceTool: '@workmesh/conformance', idempotencyKey }) }
  offerHandoff(seed: ConformanceSeed, idempotencyKey: string) { return this.tool('offer_handoff', { fromSessionId: seed.sessionId, targetAgentId: seed.targetAgentId, scopeType: 'work_item', scopeId: seed.workItemId, summary: 'Conformance handoff package.', completedWork: ['Profile negotiation'], remainingWork: ['Verify recipient recovery'], acceptanceCriteria: ['Recipient can inspect the package'], requestedCapabilities: ['work:read'], status: 'requested', idempotencyKey }) }
  completeSession(seed: ConformanceSeed, artifactId: string, revision: number, idempotencyKey: string) { return this.tool('complete_session', { sessionId: seed.sessionId, revision, summary: 'Client Profile conformance completed.', artifactIds: [artifactId], checks: [{ name: 'client-profile-conformance', status: 'passed', summary: 'passed' }], limitations: [], idempotencyKey }) }
  async disconnect() { await this.hooks.disconnect?.() }
  async reconnect(cursor: string) { await this.hooks.reconnect?.(cursor) }
  async listEvents(_seed: ConformanceSeed, cursor: string) {
    const value = await this.tool('list_events', { cursor })
    return Array.isArray(value.events) ? value.events.map(objectValue) : []
  }
  async probeFailure(scenario: HostileScenario, seed: ConformanceSeed) {
    await this.hooks.prepareFailure(scenario.id)
    try {
      if (scenario.operation === 'get-session') await this.getSession(seed)
      else if (scenario.operation === 'get-context') await this.getContext(seed)
      else if (scenario.operation === 'append-activity') await this.tool('append_activity', { sessionId: seed.sessionId, kind: 'action_completed', summary: `Hostile probe: ${scenario.id}.`, idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'transition-session') await this.tool('transition_agent_session_state', { sessionId: seed.sessionId, state: 'executing', reason: `Hostile probe: ${scenario.id}.`, revision: seed.sessionRevision, idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'provider-action') await this.tool('create_repository_branch', { repositoryId: seed.targetAgentId, workItemId: seed.workItemId, sessionId: seed.sessionId, name: `hostile-${scenario.id}`, baseSha: 'reference-head', idempotencyKey: `hostile-${scenario.id}` })
      else if (scenario.operation === 'request-merge') await this.tool('merge_pull_request', { pullRequestId: seed.targetAgentId, sessionId: seed.sessionId, approvalId: seed.inboxItemId, actionPayloadHash: `sha256:${'a'.repeat(64)}`, headSha: 'reference-head', method: 'squash', idempotencyKey: `hostile-${scenario.id}` })
      else await this.tool('list_events', { cursor: seed.startCursor })
      throw new Error(`Hostile scenario ${scenario.id} unexpectedly succeeded`)
    } catch (error) {
      return failureFrom(error)
    }
  }
}
