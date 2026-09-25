import { createHash } from 'node:crypto'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import {
  acquireLeaseInputSchema, agentCapabilityManifestResponseSchema, appendActivityInputSchema,
  completeAgentSessionInputSchema,
  artifactInputSchema,
  createDocumentInputSchema, handoffInputSchema, projectInputSchema, publishPlanInputSchema,
  requestApprovalInputSchema, updateDocumentInputSchema, workItemInputSchema,
  workItemPatchSchema, workItemRelationInputSchema,
} from '@workmesh/contracts'
import { Type } from 'typebox'
import { z } from 'zod'

export interface RunnerToolApi {
  readonly sessionId: string
  request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string,
    body?: unknown, ifMatch?: number, idempotencyKey?: string): Promise<T>
}

export type SessionCompletionIntent = Readonly<{
  body: z.infer<typeof completeAgentSessionInputSchema>
  ifMatch: number
  idempotencyKey: string
}>

const id = z.string().uuid()
const idParameter = Type.String({ format: 'uuid' })
const ownerParameter = Type.Union([Type.Literal('project'), Type.Literal('work_item')])
const resultLimit = 50_000

function operationKey(sessionId: string, attemptId: string, toolCallId: string, phase: string): string {
  const digest = createHash('sha256').update(JSON.stringify([sessionId, attemptId, toolCallId, phase])).digest('hex')
  return `pi-${digest}`
}

function boundedResult(value: unknown): string {
  const encoded = JSON.stringify(value)
  if (encoded.length > resultLimit) {
    const object = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {}
    const revision = object.currentRevision && typeof object.currentRevision === 'object'
      ? object.currentRevision as Record<string, unknown> : {}
    const items = Array.isArray(object.items) ? object.items : undefined
    return JSON.stringify({ truncated: true, message: 'Operation succeeded; fetch a narrower resource for full content.',
      id: object.id ?? null, status: object.status ?? null, revision: object.revision ?? null,
      currentRevision: { id: revision.id ?? null, contentHash: revision.contentHash ?? null },
      ...(items ? { itemCount: items.length, itemIds: items.slice(0, 100).map(item =>
        item && typeof item === 'object' ? (item as Record<string, unknown>).id ?? null : null) } : {}) })
  }
  return encoded
}

async function recordToolActivity(api: RunnerToolApi, attemptId: string, callId: string,
  operationId: string, phase: 'started' | 'succeeded' | 'failed', payloadHash: string,
  errorCode?: string): Promise<void> {
  await api.request('POST', `/api/v1/agent-sessions/${api.sessionId}/activities`, {
    kind: phase === 'started' ? 'action_started' : phase === 'succeeded' ? 'action_completed' : 'error',
    summary: `Pi ${operationId} ${phase}.`,
    toolInvocation: { toolName: operationId, status: phase,
      inputSanitized: { operationId, toolCallId: callId, runnerAttemptId: attemptId,
        payloadHash, ...(errorCode ? { errorCode } : {}) } },
    artifactIds: [], references: [], visibility: 'team', ephemeral: false,
  }, undefined, operationKey(api.sessionId, attemptId, callId, `activity-${phase}`))
}

type ToolRequest = Readonly<{
  method: 'GET' | 'POST' | 'PATCH' | 'PUT'
  path: string
  body?: unknown
  ifMatch?: number
}>

function makeTool(api: RunnerToolApi, attemptId: string, onCall: (name: string) => void,
  name: string, operationId: string, description: string,
  parameters: ToolDefinition['parameters'], build: (input: unknown, toolCallId: string) => ToolRequest,
  recordStart = true, recordCompletion = true): ToolDefinition {
  return {
    name, label: name.replaceAll('_', ' '), description, parameters,
    execute: async (toolCallId, input, signal) => {
      onCall(name)
      if (signal?.aborted) throw new Error('RUNNER_ABORTED')
      let request: ToolRequest
      try { request = build(input, toolCallId) }
      catch (error) {
        const paths = error instanceof z.ZodError ? error.issues.map(issue => issue.path.join('.')) : []
        console.error(JSON.stringify({ tool: name, stage: 'input_validation', paths }))
        throw error
      }
      const payloadHash = createHash('sha256').update(JSON.stringify(request.body ?? {})).digest('hex')
      const key = operationKey(api.sessionId, attemptId, toolCallId, operationId)
      if (request.method !== 'GET' && recordStart) {
        try { await recordToolActivity(api, attemptId, toolCallId, operationId, 'started', payloadHash) }
        catch (error) {
          console.error(JSON.stringify({ tool: name, stage: 'activity_start',
            code: error instanceof Error ? error.message.slice(0, 100) : 'UNKNOWN' }))
          throw error
        }
      }
      let result: unknown
      try {
        result = await api.request<unknown>(request.method, request.path,
          request.body, request.ifMatch, key)
      } catch (error) {
        if (request.method !== 'GET' && recordCompletion) {
          const code = error instanceof Error ? error.message.slice(0, 100) : 'TOOL_REQUEST_FAILED'
          try { await recordToolActivity(api, attemptId, toolCallId, operationId, 'failed', payloadHash, code) }
          catch { /* Server Stop can revoke activity writes while the original error remains authoritative. */ }
        }
        throw error
      }
      let completionActivityRecorded = true
      if (request.method !== 'GET' && recordCompletion) {
        try { await recordToolActivity(api, attemptId, toolCallId, operationId, 'succeeded', payloadHash) }
        catch { completionActivityRecorded = false }
      }
      const reported = completionActivityRecorded ? result : {
        result, auditWarning: 'The command succeeded, but its completion activity could not be recorded; reconcile from the domain event.',
      }
      return { content: [{ type: 'text' as const, text: boundedResult(reported) }],
        details: { source: 'workmesh_rest', operationId, operationKey: key, completionActivityRecorded } }
    },
  }
}

export async function createWorkMeshTools(api: RunnerToolApi, attemptId: string, onCall: (name: string) => void,
  onCompletionIntent?: (intent: SessionCompletionIntent) => void): Promise<ToolDefinition[]> {
  const manifest = agentCapabilityManifestResponseSchema.parse(
    await api.request<unknown>('GET', '/api/v1/agent-capabilities'))
  if (manifest.agent.sessionId !== api.sessionId || manifest.agent.sessionState !== 'executing')
    throw new Error('RUNNER_CAPABILITY_SESSION_MISMATCH')
  const eligible = new Set(manifest.operations
    .filter(operation => operation.supported && operation.eligibleByCapability)
    .map(operation => operation.operationId))
  const available: ToolDefinition[] = []
  const add = (name: string, operationId: string, description: string,
    parameters: ToolDefinition['parameters'], build: (input: unknown, toolCallId: string) => ToolRequest,
    recordStart = true, recordCompletion = true) => {
    if (eligible.has(operationId)) available.push(makeTool(api, attemptId, onCall,
      name, operationId, description, parameters, build, recordStart, recordCompletion))
  }

  add('workmesh_get_session', 'getAgentSession',
    'Read the exact current Agent Session, including its revision for plan publication and other guarded commands.',
    Type.Object({}), () => ({ method: 'GET', path: `/api/v1/agent-sessions/${api.sessionId}` }))
  add('workmesh_list_projects', 'listProjects', 'List authorized Projects. Use the returned IDs for later operations.',
    Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }), input => {
      const { limit } = z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input)
      return { method: 'GET', path: `/api/v1/projects?limit=${limit ?? 50}` }
    })
  add('workmesh_get_project', 'getProject', 'Read an authorized Project by ID.',
    Type.Object({ projectId: idParameter }), input => {
      const { projectId } = z.object({ projectId: id }).parse(input)
      return { method: 'GET', path: `/api/v1/projects/${projectId}` }
    })
  add('workmesh_create_project', 'createProject',
    'Create a Project in the delegated Team. Only a coordination authority with project management scope can succeed.',
    Type.Object({ teamId: idParameter, name: Type.String({ minLength: 1, maxLength: 180 }),
      summary: Type.Optional(Type.String({ maxLength: 500 })),
      description: Type.Optional(Type.String({ maxLength: 20_000 })) }), input => ({
      method: 'POST', path: '/api/v1/projects', body: projectInputSchema.parse(input),
    }))
  add('workmesh_update_project', 'updateProject',
    'Ordinary Project edit. Read its current revision first and pass If-Match; policy and Guidance changes are separate Human controls.',
    Type.Object({ projectId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      name: Type.Optional(Type.String({ minLength: 1, maxLength: 180 })),
      summary: Type.Optional(Type.String({ maxLength: 500 })),
      description: Type.Optional(Type.String({ maxLength: 20_000 })) }), input => {
      const parsed = z.object({ projectId: id, ifMatch: z.number().int().positive(),
        name: z.string().min(1).max(180).optional(), summary: z.string().max(500).optional(),
        description: z.string().max(20_000).optional() }).parse(input)
      const { projectId, ifMatch, ...body } = parsed
      if (Object.keys(body).length === 0) throw new Error('TOOL_EMPTY_PROJECT_UPDATE')
      return { method: 'PATCH', path: `/api/v1/projects/${projectId}`, body, ifMatch }
    })
  add('workmesh_list_work_items', 'listWorkItems',
    'List Issues authorized for the exact Agent Session. Execution Sessions only see their delegated Issue.',
    Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }), input => {
      const { limit } = z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input)
      return { method: 'GET', path: `/api/v1/work-items?limit=${limit ?? 50}` }
    })
  add('workmesh_get_work_item', 'getWorkItem', 'Read an authorized Issue, including its current revision.',
    Type.Object({ workItemId: idParameter }), input => {
      const { workItemId } = z.object({ workItemId: id }).parse(input)
      return { method: 'GET', path: `/api/v1/work-items/${workItemId}` }
    })
  add('workmesh_create_work_item', 'createWorkItem',
    'Create an Issue in the delegated Team. The responsible Human remains a Human; a started state requires one.',
    Type.Object({ teamId: idParameter, title: Type.String({ minLength: 1, maxLength: 500 }),
      statusId: idParameter, description: Type.Optional(Type.String({ maxLength: 50_000 })),
      projectId: Type.Optional(idParameter), responsibleHumanActorId: Type.Optional(idParameter),
      priority: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('low'), Type.Literal('medium'),
        Type.Literal('high'), Type.Literal('urgent')])) }), input => ({
      method: 'POST', path: '/api/v1/work-items', body: workItemInputSchema.parse(input),
    }))
  add('workmesh_update_work_item', 'updateWorkItem',
    'Edit an authorized Issue with its exact current revision. Workflow status and Agent Session state are different.',
    Type.Object({ workItemId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
      description: Type.Optional(Type.String({ maxLength: 50_000 })),
      statusId: Type.Optional(idParameter), projectId: Type.Optional(idParameter),
      responsibleHumanActorId: Type.Optional(idParameter),
      priority: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('low'), Type.Literal('medium'),
        Type.Literal('high'), Type.Literal('urgent')])) }), input => {
      const parsed = z.object({ workItemId: id, ifMatch: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(), description: z.string().max(50_000).optional(),
        statusId: id.optional(), projectId: id.optional(), responsibleHumanActorId: id.optional(),
        priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional() }).parse(input)
      const { workItemId, ifMatch, ...fields } = parsed
      if (Object.keys(fields).length === 0) throw new Error('TOOL_EMPTY_ISSUE_UPDATE')
      return { method: 'PATCH', path: `/api/v1/work-items/${workItemId}`,
        body: workItemPatchSchema.parse(fields), ifMatch }
    })
  add('workmesh_create_work_item_relation', 'createWorkItemRelation',
    'Add a blocks or related Issue relation within the delegated scope. Use stable Issue IDs.',
    Type.Object({ workItemId: idParameter, targetWorkItemId: idParameter,
      kind: Type.Union([Type.Literal('blocks'), Type.Literal('related')]) }), input => {
      const parsed = z.object({ workItemId: id, targetWorkItemId: id,
        kind: z.enum(['blocks', 'related']) }).parse(input)
      return { method: 'POST', path: `/api/v1/work-items/${parsed.workItemId}/relations`,
        body: workItemRelationInputSchema.parse({ targetWorkItemId: parsed.targetWorkItemId, kind: parsed.kind }) }
    })
  add('workmesh_list_documents', 'listDocuments', 'List current documents for an authorized Project or Issue.',
    Type.Object({ ownerType: ownerParameter, ownerId: idParameter }), input => {
      const { ownerType, ownerId } = z.object({ ownerType: z.enum(['project', 'work_item']), ownerId: id }).parse(input)
      return { method: 'GET', path: `/api/v1/documents?ownerType=${ownerType}&ownerId=${ownerId}&limit=50` }
    })
  add('workmesh_get_document', 'getDocument', 'Read the exact current document revision and content hash before editing.',
    Type.Object({ documentId: idParameter }), input => {
      const { documentId } = z.object({ documentId: id }).parse(input)
      return { method: 'GET', path: `/api/v1/documents/${documentId}` }
    })
  add('workmesh_create_document', 'createDocument',
    'Create a normal Project or Issue Markdown document within the active delegated scope. This cannot publish Guidance.',
    Type.Object({ ownerType: ownerParameter, ownerId: idParameter,
      title: Type.String({ minLength: 1, maxLength: 180 }), markdown: Type.String({ maxLength: 200000 }),
      changeSummary: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })) }), input => {
      const body = createDocumentInputSchema.parse(input)
      return { method: 'POST', path: '/api/v1/documents', body }
    })
  add('workmesh_update_document', 'updateDocument',
    'Revise a normal document using its exact If-Match revision, base revision ID, and SHA-256 hash. A conflict preserves the old revision.',
    Type.Object({ documentId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      title: Type.String({ minLength: 1, maxLength: 180 }), markdown: Type.String({ maxLength: 200000 }),
      baseRevisionId: idParameter, baseContentHash: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }),
      changeSummary: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })) }), input => {
      const parsed = z.object({ documentId: id, ifMatch: z.number().int().positive(),
        title: z.string(), markdown: z.string(), baseRevisionId: id,
        baseContentHash: z.string(), changeSummary: z.string().optional() }).parse(input)
      const { documentId, ifMatch, ...rest } = parsed
      return { method: 'PATCH', path: `/api/v1/documents/${documentId}`,
        body: updateDocumentInputSchema.parse(rest), ifMatch }
    })
  add('workmesh_publish_artifact', 'publishArtifact',
    'Publish a referenced result or evidence for this exact Session. An artifact is a durable record, not an approval.',
    Type.Object({ type: Type.Union([Type.Literal('commit'), Type.Literal('pull_request'),
      Type.Literal('test_report'), Type.Literal('document'), Type.Literal('link'),
      Type.Literal('file'), Type.Literal('other')]),
      title: Type.String({ minLength: 1, maxLength: 500 }),
      uri: Type.Optional(Type.String({ format: 'uri' })),
      checksum: Type.Optional(Type.String({ pattern: '^sha256:[a-f0-9]{64}$' })) }), input => {
      const parsed = z.object({ type: z.enum(['commit', 'pull_request', 'test_report', 'document',
        'link', 'file', 'other']), title: z.string().min(1).max(500), uri: z.string().url().optional(),
        checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional() }).parse(input)
      return { method: 'POST', path: '/api/v1/artifacts',
        body: artifactInputSchema.parse({ sessionId: api.sessionId, ...parsed,
          sourceTool: 'pi-workmesh-tool', metadata: {} }) }
    })
  add('workmesh_request_approval', 'requestApproval',
    'Request human approval for a concrete action. Sanitize and hash the action payload. This tool cannot decide an approval.',
    Type.Object({ approvalType: Type.String({ minLength: 1, maxLength: 160 }),
      actionName: Type.String({ minLength: 1, maxLength: 300 }),
      actionPayloadSanitized: Type.Record(Type.String(), Type.Unknown()),
      actionPayloadHash: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }),
      riskLevel: Type.Union([Type.Literal('low'), Type.Literal('medium'),
        Type.Literal('high'), Type.Literal('critical')]),
      rationaleSummary: Type.String({ minLength: 1, maxLength: 10000 }),
      expiresAt: Type.String({ format: 'date-time' }) }), input => {
      const parsed = z.object({ approvalType: z.string(), actionName: z.string(),
        actionPayloadSanitized: z.record(z.unknown()), actionPayloadHash: z.string(),
        riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
        rationaleSummary: z.string(), expiresAt: z.string() }).parse(input)
      return { method: 'POST', path: '/api/v1/approvals',
        body: requestApprovalInputSchema.parse({ sessionId: api.sessionId, ...parsed }) }
    })
  add('workmesh_list_leases', 'listLeases',
    'Read leases for this exact Session, including the current version needed for release.',
    Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }), input => {
      const { limit } = z.object({ limit: z.number().int().min(1).max(100).optional() }).parse(input)
      return { method: 'GET', path: `/api/v1/leases?sessionId=${api.sessionId}&limit=${limit ?? 50}` }
    })
  add('workmesh_acquire_lease', 'acquireLease',
    'Acquire a short coordination lease for an authorized Issue or plan step. A lease never grants authority.',
    Type.Object({ resourceType: Type.Union([Type.Literal('work_item'), Type.Literal('plan_step')]),
      resourceId: idParameter, reason: Type.String({ minLength: 1, maxLength: 2000 }),
      ttlSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 3600 })) }), input => {
      const parsed = z.object({ resourceType: z.enum(['work_item', 'plan_step']),
        resourceId: id, reason: z.string(), ttlSeconds: z.number().int().optional() }).parse(input)
      return { method: 'POST', path: '/api/v1/leases',
        body: acquireLeaseInputSchema.parse({ sessionId: api.sessionId, ...parsed }) }
    })
  add('workmesh_release_lease', 'releaseLease',
    'Release an active lease held by this Session. Read its current version first; releasing a lease never changes authorization.',
    Type.Object({ leaseId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      reason: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })) }), input => {
      const parsed = z.object({ leaseId: id, ifMatch: z.number().int().positive(),
        reason: z.string().min(1).max(2000).optional() }).parse(input)
      return { method: 'POST', path: `/api/v1/leases/${parsed.leaseId}/release`,
        body: parsed.reason ? { reason: parsed.reason } : {}, ifMatch: parsed.ifMatch }
    })
  add('workmesh_offer_handoff', 'offerHandoff',
    'Offer visible, structured work to another Agent. The target and server must accept before work transfers.',
    Type.Object({ targetAgentId: idParameter, summary: Type.String({ minLength: 1, maxLength: 20000 }),
      remainingWork: Type.Array(Type.String({ minLength: 1, maxLength: 10000 }), { maxItems: 100 }),
      acceptanceCriteria: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 2000 }),
        { maxItems: 100 })) }), input => {
      const parsed = z.object({ targetAgentId: id, summary: z.string(),
        remainingWork: z.array(z.string()), acceptanceCriteria: z.array(z.string()).optional() }).parse(input)
      return { method: 'POST', path: '/api/v1/handoffs',
        body: handoffInputSchema.parse({ fromSessionId: api.sessionId, ...parsed }) }
    })
  add('workmesh_append_activity', 'appendAgentActivity',
    'Record concise progress, evidence, a visible question, or a warning on this exact Session. Never include secrets or hidden reasoning.',
    Type.Object({ kind: Type.Union([Type.Literal('status'), Type.Literal('evidence'),
      Type.Literal('question'), Type.Literal('message'), Type.Literal('warning')]),
      summary: Type.String({ minLength: 1, maxLength: 10000 }),
      detailsMarkdown: Type.Optional(Type.String({ maxLength: 50000 })) }), (input, toolCallId) => {
      const parsed = z.object({ kind: z.enum(['status', 'evidence', 'question', 'message', 'warning']),
        summary: z.string(), detailsMarkdown: z.string().optional() }).parse(input)
      const contentHash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex')
      return { method: 'POST', path: `/api/v1/agent-sessions/${api.sessionId}/activities`,
        body: appendActivityInputSchema.parse({ ...parsed, visibility: 'team', ephemeral: false,
          toolInvocation: { toolName: 'appendAgentActivity', status: 'succeeded',
            inputSanitized: { operationId: 'appendAgentActivity', toolCallId,
              runnerAttemptId: attemptId, payloadHash: contentHash } } }) }
    }, false, false)
  add('workmesh_publish_plan', 'publishAgentPlan',
    'Publish a whole immutable plan version. Keep stable step IDs across revisions. Call workmesh_get_session for its exact current revision first.',
    Type.Object({ ifMatch: Type.Integer({ minimum: 1 }),
      changeSummary: Type.String({ minLength: 1, maxLength: 5000 }),
      steps: Type.Array(Type.Object({ id: idParameter,
        title: Type.String({ minLength: 1, maxLength: 500 }),
        ordinal: Type.Integer({ minimum: 0 }),
        description: Type.Optional(Type.String({ maxLength: 20000 })),
        status: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('in_progress'),
          Type.Literal('blocked'), Type.Literal('completed'), Type.Literal('canceled')])),
        dependsOn: Type.Optional(Type.Array(idParameter, { maxItems: 100 })),
        acceptanceCriteria: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 2000 }),
          { maxItems: 100 })) }), { minItems: 1, maxItems: 500 }),
      approvalId: Type.Optional(idParameter),
      approvalPayloadHash: Type.Optional(Type.String({ pattern: '^sha256:[a-f0-9]{64}$' })) }), input => {
      const parsed = z.object({ ifMatch: z.number().int().positive(),
        changeSummary: z.string(), steps: z.array(z.unknown()),
        approvalId: id.optional(), approvalPayloadHash: z.string().optional() }).parse(input)
      const { ifMatch, ...plan } = parsed
      return { method: 'PUT', path: `/api/v1/agent-sessions/${api.sessionId}/plan`,
        body: publishPlanInputSchema.parse(plan), ifMatch }
    }, false)
  if (onCompletionIntent && eligible.has('completeAgentSession')) {
    available.push({
      name: 'workmesh_complete_session', label: 'workmesh complete session',
      description: 'Request completion of this exact Session. Give an evidence-backed summary and current Session revision. The Runner commits completion only after its public answer is durably settled; verify the final Session state afterward.',
      parameters: Type.Object({ ifMatch: Type.Integer({ minimum: 1 }),
        summary: Type.String({ minLength: 1, maxLength: 20_000 }),
        artifactIds: Type.Optional(Type.Array(idParameter, { maxItems: 100 })),
        checks: Type.Optional(Type.Array(Type.Object({ name: Type.String({ minLength: 1, maxLength: 160 }),
          command: Type.Optional(Type.String({ maxLength: 10_000 })),
          status: Type.Union([Type.Literal('passed'), Type.Literal('failed'), Type.Literal('skipped')]),
          summary: Type.String({ minLength: 1, maxLength: 10_000 }) }), { maxItems: 100 })),
        limitations: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 2000 }), { maxItems: 100 })),
        noArtifactReason: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })) }),
      execute: async (toolCallId, input, signal) => {
        onCall('workmesh_complete_session')
        if (signal?.aborted) throw new Error('RUNNER_ABORTED')
        const { ifMatch, ...body } = z.object({ ifMatch: z.number().int().positive(),
          summary: z.string(), artifactIds: z.array(id).optional(),
          checks: z.array(z.unknown()).optional(), limitations: z.array(z.string()).optional(),
          noArtifactReason: z.string().optional() }).parse(input)
        const intent: SessionCompletionIntent = {
          body: completeAgentSessionInputSchema.parse(body), ifMatch,
          idempotencyKey: operationKey(api.sessionId, attemptId, toolCallId, 'completeAgentSession'),
        }
        onCompletionIntent(intent)
        return { content: [{ type: 'text' as const, text: boundedResult({
          status: 'queued_after_turn_settlement', sessionId: api.sessionId,
          message: 'Completion is pending. Give the user a public answer; then inspect the Session state.',
        }) }], details: { source: 'workmesh_runner', operationId: 'completeAgentSession',
          operationKey: intent.idempotencyKey } }
      },
    })
  }
  return available
}
