export type A2AProtocolVersion = '0.3'
export const A2A_TASK_ID_MAX_LENGTH = 500

export type A2AAgentCard = {
  protocolVersion: A2AProtocolVersion
  name: string
  description?: string
  url: string
  skills: Array<{ id: string; name: string; description?: string }>
  capabilities?: { streaming?: boolean; pushNotifications?: boolean }
}

export type WorkMeshAgentManifest = {
  name: string
  description?: string
  endpointUrl: string
  supportedProtocols: ['a2a']
  skills: string[]
  manifest: {
    adapter: 'a2a'
    protocolVersion: A2AProtocolVersion
    capabilities: A2AAgentCard['capabilities']
  }
}

export type A2APart =
  | { kind: 'text'; text: string }
  | { kind: 'data'; data: Record<string, unknown> }
  | { kind: 'file'; uri: string; mediaType?: string; name?: string }

export type A2AMessage = {
  id: string
  role: 'user' | 'agent'
  parts: A2APart[]
  metadata?: Record<string, unknown>
}

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'auth-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'

export type A2ATask = {
  id: string
  contextId?: string
  status: {
    state: A2ATaskState
    message?: A2AMessage
    timestamp?: string
  }
  history?: A2AMessage[]
  artifacts?: Array<{ id: string; name: string; parts: A2APart[]; metadata?: Record<string, unknown> }>
  metadata?: Record<string, unknown>
}

export type WorkMeshTaskCommand = {
  externalTaskId: string
  sessionId?: string
  contextId?: string
  prompts: Array<{
    externalMessageId: string
    bodyMarkdown: string
    data: Record<string, unknown>[]
  }>
  state: 'queued' | 'executing' | 'awaiting_input' | 'awaiting_approval' | 'completed' | 'failed' | 'canceled'
  artifacts: Array<{
    externalArtifactId: string
    title: string
    type: 'file' | 'report'
    uri?: string
    metadata: Record<string, unknown>
  }>
}

export type WorkMeshStreamEvent =
  | { type: 'session.state_changed'; sessionId: string; state: WorkMeshTaskCommand['state']; occurredAt: string }
  | { type: 'session.message'; sessionId: string; messageId: string; bodyMarkdown: string; occurredAt: string }
  | { type: 'artifact.created'; sessionId: string; artifactId: string; title: string; uri?: string; occurredAt: string }

export type A2AStreamEvent =
  | { kind: 'status-update'; taskId: string; final: boolean; status: A2ATask['status'] }
  | { kind: 'artifact-update'; taskId: string; artifact: NonNullable<A2ATask['artifacts']>[number] }
  | { kind: 'message'; taskId: string; message: A2AMessage }

export class A2AValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

const taskStates = new Set<A2ATaskState>([
  'submitted', 'working', 'input-required', 'auth-required',
  'completed', 'failed', 'canceled', 'rejected',
])

export function parseA2ATask(value: unknown): A2ATask {
  if (!value || typeof value !== 'object') throw new A2AValidationError('A2A_ENVELOPE_INVALID', 'Task must be an object')
  const task = value as Partial<A2ATask>
  if (typeof task.id !== 'string' || task.id.length < 1 || task.id.length > A2A_TASK_ID_MAX_LENGTH)
    throw new A2AValidationError('A2A_TASK_ID_INVALID', 'Task id is required and bounded')
  if (!task.status || !taskStates.has(task.status.state))
    throw new A2AValidationError('A2A_TASK_STATE_INVALID', 'Task state is not part of A2A 0.3')
  const validatePart = (part: A2APart): void => {
    if (!part || typeof part !== 'object' || !['text', 'data', 'file'].includes(part.kind))
      throw new A2AValidationError('A2A_PART_INVALID', 'Message and Artifact parts must be typed')
    if (part.kind === 'text' && (typeof part.text !== 'string' || part.text.length > 100_000))
      throw new A2AValidationError('A2A_TEXT_PART_INVALID', 'Text part is invalid or too large')
    if (part.kind === 'data' && (!part.data || typeof part.data !== 'object' || Array.isArray(part.data)))
      throw new A2AValidationError('A2A_DATA_PART_INVALID', 'Data part must be an object')
    if (part.kind === 'file') {
      if (typeof part.uri !== 'string' || part.uri.length > 4_000)
        throw new A2AValidationError('A2A_FILE_PART_INVALID', 'File URI is invalid')
      let url: URL
      try { url = new URL(part.uri) } catch {
        throw new A2AValidationError('A2A_FILE_PART_INVALID', 'File URI is invalid')
      }
      if (!['https:', 's3:'].includes(url.protocol) || url.username || url.password)
        throw new A2AValidationError('A2A_FILE_PART_INVALID', 'File URI scheme or credentials are unsafe')
    }
  }
  const validateMessage = (message: A2AMessage): void => {
    if (!message || typeof message.id !== 'string' || !['user', 'agent'].includes(message.role)
      || !Array.isArray(message.parts) || message.parts.length < 1 || message.parts.length > 100)
      throw new A2AValidationError('A2A_MESSAGE_INVALID', 'Message envelope is invalid')
    message.parts.forEach(validatePart)
  }
  if (task.history && (!Array.isArray(task.history) || task.history.length > 1_000))
    throw new A2AValidationError('A2A_HISTORY_INVALID', 'Task history is invalid or too large')
  task.history?.forEach(validateMessage)
  if (task.status.message) validateMessage(task.status.message)
  if (task.artifacts && (!Array.isArray(task.artifacts) || task.artifacts.length > 500))
    throw new A2AValidationError('A2A_ARTIFACTS_INVALID', 'Task Artifacts are invalid or too large')
  task.artifacts?.forEach(artifact => {
    if (!artifact || typeof artifact.id !== 'string' || typeof artifact.name !== 'string'
      || !Array.isArray(artifact.parts) || artifact.parts.length < 1 || artifact.parts.length > 100)
      throw new A2AValidationError('A2A_ARTIFACT_INVALID', 'Artifact envelope is invalid')
    artifact.parts.forEach(validatePart)
  })
  return task as A2ATask
}

const stateFromA2A: Record<A2ATaskState, WorkMeshTaskCommand['state']> = {
  submitted: 'queued',
  working: 'executing',
  'input-required': 'awaiting_input',
  'auth-required': 'awaiting_approval',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
  rejected: 'failed',
}
const stateToA2A: Record<WorkMeshTaskCommand['state'], A2ATaskState> = {
  queued: 'submitted',
  executing: 'working',
  awaiting_input: 'input-required',
  awaiting_approval: 'auth-required',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
}

const textFromParts = (parts: readonly A2APart[]): string =>
  parts.filter((part): part is Extract<A2APart, { kind: 'text' }> => part.kind === 'text')
    .map(part => part.text)
    .join('\n\n')

export function mapAgentCard(card: A2AAgentCard): WorkMeshAgentManifest {
  if (card.protocolVersion !== '0.3') throw new Error(`A2A_VERSION_UNSUPPORTED:${card.protocolVersion}`)
  const url = new URL(card.url)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A2A_AGENT_URL_INVALID')
  return {
    name: card.name,
    description: card.description,
    endpointUrl: card.url,
    supportedProtocols: ['a2a'],
    skills: card.skills.map(skill => skill.id),
    manifest: {
      adapter: 'a2a',
      protocolVersion: card.protocolVersion,
      capabilities: card.capabilities,
    },
  }
}

export function mapTask(task: A2ATask): WorkMeshTaskCommand {
  task = parseA2ATask(task)
  const messages = task.history ?? []
  return {
    externalTaskId: task.id,
    contextId: task.contextId,
    prompts: messages.map(message => ({
      externalMessageId: message.id,
      bodyMarkdown: textFromParts(message.parts),
      data: message.parts
        .filter((part): part is Extract<A2APart, { kind: 'data' }> => part.kind === 'data')
        .map(part => part.data),
    })),
    state: stateFromA2A[task.status.state],
    artifacts: (task.artifacts ?? []).flatMap(artifact => {
      const file = artifact.parts.find((part): part is Extract<A2APart, { kind: 'file' }> => part.kind === 'file')
      return [{
        externalArtifactId: artifact.id,
        title: artifact.name,
        type: file ? 'file' as const : 'report' as const,
        uri: file?.uri,
        metadata: {
          ...(artifact.metadata ?? {}),
          data: artifact.parts
            .filter((part): part is Extract<A2APart, { kind: 'data' }> => part.kind === 'data')
            .map(part => part.data),
          text: textFromParts(artifact.parts),
        },
      }]
    }),
  }
}

export function mapStreamEvent(taskId: string, event: WorkMeshStreamEvent): A2AStreamEvent {
  if (event.type === 'session.state_changed') {
    const state = stateToA2A[event.state]
    return {
      kind: 'status-update',
      taskId,
      final: ['completed', 'failed', 'canceled'].includes(event.state),
      status: { state, timestamp: event.occurredAt },
    }
  }
  if (event.type === 'session.message') {
    return {
      kind: 'message',
      taskId,
      message: { id: event.messageId, role: 'agent', parts: [{ kind: 'text', text: event.bodyMarkdown }] },
    }
  }
  return {
    kind: 'artifact-update',
    taskId,
    artifact: {
      id: event.artifactId,
      name: event.title,
      parts: event.uri
        ? [{ kind: 'file', uri: event.uri }]
        : [{ kind: 'data', data: { noExternalUri: true } }],
    },
  }
}

export type A2AAuthorization = {
  workspaceId: string
  bindingId: string
  agentId: string
  externalTaskId: string
  requestedCapabilities: readonly string[]
  resource: { teamId?: string; projectId?: string; workItemId?: string }
}

/**
 * Transport adapter only. It cannot read WorkMesh context or create a Session
 * until the caller has revalidated the live binding, Agent, Team grant,
 * capability intersection, and resource scope.
 */
export class A2AAdapter {
  constructor(
    private readonly authorizeContext: (request: A2AAuthorization) => Promise<void>,
    private readonly createSession: (command: WorkMeshTaskCommand, authorization: A2AAuthorization) => Promise<{ sessionId: string }>,
  ) {}

  async acceptTask(taskInput: unknown, authorization: Omit<A2AAuthorization, 'externalTaskId'>): Promise<{
    sessionId: string
    command: WorkMeshTaskCommand
  }> {
    const task = parseA2ATask(taskInput)
    const request = { ...authorization, externalTaskId: task.id }
    // This callback is intentionally before mapTask consumers can enrich the
    // command with any internal context.
    await this.authorizeContext(request)
    const command = mapTask(task)
    const session = await this.createSession(command, request)
    return { sessionId: session.sessionId, command: { ...command, sessionId: session.sessionId } }
  }
}

export class FakeA2AAgent {
  readonly card: A2AAgentCard = {
    protocolVersion: '0.3',
    name: 'WorkMesh A2A Conformance Agent',
    url: 'https://fake-a2a.invalid',
    skills: [{ id: 'issue.triage', name: 'Issue triage' }],
    capabilities: { streaming: true },
  }

  complete(taskId: string): A2ATask {
    return {
      id: taskId,
      status: { state: 'completed', timestamp: '2026-07-26T00:00:00Z' },
      history: [{
        id: `${taskId}:message:1`,
        role: 'agent',
        parts: [{ kind: 'text', text: 'Triage completed.' }],
      }],
      artifacts: [{
        id: `${taskId}:artifact:1`,
        name: 'triage-report',
        parts: [{ kind: 'data', data: { priority: 'high', labels: ['triaged'] } }],
      }],
    }
  }
}
