import { createHash } from 'node:crypto'
import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import {
  acquireLeaseInputSchema, qualifiedAgentCapabilityManifestResponseSchema, appendActivityInputSchema,
  completeAgentSessionInputSchema, consumeApprovalInputSchema,
  artifactInputSchema, artifactTypeSchema,
  createDocumentInputSchema, handoffInputSchema, projectInputSchema, publishPlanInputSchema,
  requestApprovalInputSchema, updateDocumentInputSchema, workItemInputSchema,
  workItemPatchSchema, workItemRelationInputSchema,
  childSessionInputSchema, reviewDelegationInputSchema, childSessionStatusQuerySchema,
  decisionInputSchema, roomMessageInputSchema, restoreDocumentRevisionInputSchema,
} from '@workmesh/contracts'
import { Type } from 'typebox'
import { z } from 'zod'
import { sessionWaitIntentSchema, type SessionWaitIntent } from './execution-lifecycle.js'

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
const pageParameters = Type.Object({ limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 8192 })) })
const pageQuery = (input: unknown): string => {
  const page = z.object({ limit: z.number().int().min(1).max(200).optional(), cursor: z.string().min(1).max(8192).optional() }).strict().parse(input)
  return `limit=${page.limit ?? 50}${page.cursor ? `&cursor=${encodeURIComponent(page.cursor)}` : ''}`
}

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
    // One maximum-size comment/document may exceed the ordinary display budget.
    // A page is never replaced by IDs while advancing its signed cursor.
    if (items) {
      if (items.length === 1 && encoded.length <= 200_000) return encoded
      throw new Error('TOOL_PAGE_TOO_LARGE: retry the same cursor with a smaller limit; no page was consumed')
    }
    return JSON.stringify({ truncated: true, message: 'Operation succeeded; fetch a narrower resource for full content.',
      id: object.id ?? null, status: object.status ?? null, revision: object.revision ?? null,
      currentRevision: { id: revision.id ?? null, contentHash: revision.contentHash ?? null } })
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
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
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
        if (request.method === 'GET') {
          const path = new URL(request.path, 'http://workmesh.invalid')
          for (let retry=0;retry<8;retry++) {
            const items = result && typeof result === 'object' && 'items' in result ? result.items : undefined
            if (!Array.isArray(items) || items.length<=1 || JSON.stringify(result).length<=resultLimit) break
            if (signal?.aborted) throw new Error('RUNNER_ABORTED')
            path.searchParams.set('limit',String(Math.max(1,Math.floor(items.length/2))))
            result = await api.request<unknown>('GET',path.pathname+path.search)
          }
        }
      } catch (error) {
        if (request.method !== 'GET' && recordCompletion) {
          const code = error instanceof Error ? error.message.slice(0, 100) : 'TOOL_REQUEST_FAILED'
          try { await recordToolActivity(api, attemptId, toolCallId, operationId, 'failed', payloadHash, code) }
          catch { /* Server Stop can revoke activity writes while the original error remains authoritative. */ }
        }
        // Pi将抛出的异常message交给模型；保全REST错误，而不把拒绝当成功结果。
        if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
          throw new Error(JSON.stringify({ error: { code: error.code, message: error.message,
            details: 'details' in error ? error.details : undefined,
            correlationId: 'correlationId' in error ? error.correlationId : undefined } }), { cause: error })
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
  onCompletionIntent?: (intent: SessionCompletionIntent) => void,
  onWaitIntent?: (intent: SessionWaitIntent) => void): Promise<ToolDefinition[]> {
  const manifest = qualifiedAgentCapabilityManifestResponseSchema.parse(
    await api.request<unknown>('GET', '/api/v1/agent-capabilities?discovery=qualified'))
  if (manifest.agent.sessionId !== api.sessionId || manifest.agent.sessionState !== 'executing')
    throw new Error('RUNNER_CAPABILITY_SESSION_MISMATCH')
  if (manifest.discovery.identity.sessionId !== api.sessionId
    || manifest.discovery.identity.sessionKind !== 'execution'
    || manifest.discovery.identity.credentialMode !== 'agent_session'
    || manifest.discovery.identity.actorId !== manifest.agent.actorId)
    throw new Error('RUNNER_CAPABILITY_SESSION_MISMATCH')
  const eligible = new Set(manifest.discovery.operations
    .filter(operation => operation.variant === null && operation.eligibility.status !== 'blocked')
    .map(operation => operation.operationId))
  const reviewer = manifest.discovery.identity.delegationRole === 'reviewer'
  if (reviewer) eligible.delete('publishAgentPlan')
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
  add('workmesh_get_session_context', 'getAgentSessionContext', 'Read the authorized fixed context and current pins for this exact Session.',
    Type.Object({}), () => ({ method: 'GET', path: `/api/v1/agent-sessions/${api.sessionId}/context` }))
  add('workmesh_get_session_plan', 'getAgentPlan', 'Read the current immutable plan for this exact Session.',
    Type.Object({}), () => ({ method: 'GET', path: `/api/v1/agent-sessions/${api.sessionId}/plan` }))
  add('workmesh_list_plan_versions', 'listAgentPlanVersions', 'Read published plan history for this exact Session.',
    pageParameters, input => ({ method: 'GET', path: `/api/v1/agent-sessions/${api.sessionId}/plans?${pageQuery(input)}` }))
  add('workmesh_list_sessions', 'listAgentSessions', 'Read authorized Session summaries. This never changes the current execution identity.',
    pageParameters, input => ({ method: 'GET', path: `/api/v1/agent-sessions?${pageQuery(input)}` }))
  add('workmesh_list_recovery_items', 'listRecoveryItems', 'Read current recovery items for this exact Session; recovery decisions remain Human controls.',
    pageParameters, input => ({ method: 'GET', path: `/api/v1/recovery-items?sessionId=${api.sessionId}&${pageQuery(input)}` }))
  add('workmesh_get_recovery_item', 'getRecoveryItem', 'Read an authorized recovery item using its opaque returned identifier.',
    Type.Object({ recoveryId: Type.String({ pattern: '^v1:[a-z_]+:[0-9a-f-]{36}$' }) }), input => ({ method: 'GET',
      path: `/api/v1/recovery-items/${encodeURIComponent(z.object({ recoveryId: z.string().regex(/^v1:[a-z_]+:[0-9a-f-]{36}$/) }).strict().parse(input).recoveryId)}` }))
  add('workmesh_list_approvals', 'listApprovals', 'Read approval requests for this exact Session.',
    pageParameters, input => ({ method: 'GET', path: `/api/v1/approvals?sessionId=${api.sessionId}&${pageQuery(input)}` }))
  add('workmesh_get_approval', 'getApproval', 'Read an authorized approval and its original action hash.',
    Type.Object({ approvalId: idParameter }), input => ({ method: 'GET',
      path: `/api/v1/approvals/${z.object({ approvalId: id }).parse(input).approvalId}` }))
  add('workmesh_consume_approval', 'consumeApproval',
    'Consume a current approved action for this Session using its exact Approval revision and original full sha256: action hash. This never decides a Human approval.',
    Type.Object({ approvalId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      actionPayloadHash: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }) }), input => {
      const { approvalId, ifMatch, ...body } = z.object({ approvalId: id, ifMatch: z.number().int().positive(),
        actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/approvals/${approvalId}/consume`, ifMatch,
        body: consumeApprovalInputSchema.parse(body) }
    })
  add('workmesh_transition_state', 'transitionAgentSessionState',
    'Transition this exact Session to planning or executing. Human pause, resume, Stop and terminal controls are unavailable.',
    Type.Object({ state: Type.Union([Type.Literal('planning'), Type.Literal('executing')]),
      ifMatch: Type.Integer({ minimum: 1 }), reason: Type.String({ minLength: 1, maxLength: 2000 }) }), input => {
      const { ifMatch, ...body } = z.object({ state: z.enum(['planning', 'executing']),
        ifMatch: z.number().int().positive(), reason: z.string().min(1).max(2000) }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/agent-sessions/${api.sessionId}/state`, body, ifMatch }
    }, false, false)
  if (onWaitIntent && eligible.has('transitionAgentSessionState')) available.push({
    name: 'workmesh_wait', label: 'WorkMesh wait',
    description: 'End this model turn with a public waiting reply. Approval waits require the exact approval ID and original sha256: action hash. The Runner settles the wait and continues in a new authorized Turn after Human approval or input.',
    parameters: Type.Object({ state: Type.Union([Type.Literal('awaiting_approval'), Type.Literal('awaiting_input'), Type.Literal('blocked')]),
      reason: Type.String({ minLength: 1, maxLength: 2000 }),
      approval: Type.Optional(Type.Object({ id: idParameter, actionPayloadHash: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }) })) }),
    execute: async (_callId, input, signal) => {
      if (signal?.aborted) throw new Error('RUNNER_ABORTED')
      const intent = sessionWaitIntentSchema.parse(input)
      onCall('workmesh_wait')
      onWaitIntent(intent)
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'waiting_after_turn_settlement', state: intent.state }) }],
        details: { source: 'workmesh_runner' } }
    },
  })
  add('workmesh_list_projects', 'listProjects', 'List authorized Projects with complete pagination.',
    Type.Object({ ...pageParameters.properties, teamId: Type.Optional(idParameter) }), input => {
      const { teamId, ...page } = z.object({ teamId: id.optional(), limit: z.number().int().min(1).max(200).optional(), cursor: z.string().max(8192).optional() }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/projects?${pageQuery(page)}${teamId ? `&teamId=${teamId}` : ''}` }
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
  add('workmesh_list_work_items', 'listWorkItems', 'List authorized Issues with filters and complete pagination.',
    Type.Object({ ...pageParameters.properties, teamId: Type.Optional(idParameter), projectId: Type.Optional(idParameter),
      milestoneId: Type.Optional(idParameter), parentId: Type.Optional(idParameter), statusId: Type.Optional(idParameter), search: Type.Optional(Type.String({ maxLength: 500 })) }), input => {
      const { cursor, limit, ...filters } = z.object({ teamId: id.optional(), projectId: id.optional(), milestoneId: id.optional(), parentId: id.optional(), statusId: id.optional(), search: z.string().max(500).optional(), cursor: z.string().max(8192).optional(), limit: z.number().int().min(1).max(200).optional() }).strict().parse(input)
      const query = new URLSearchParams(Object.entries(filters).filter((pair): pair is [string, string] => pair[1] !== undefined))
      return { method: 'GET', path: `/api/v1/work-items?${pageQuery({ cursor, limit })}&${query}` }
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
      projectId: Type.Optional(idParameter), parentId: Type.Optional(idParameter), milestoneId: Type.Optional(idParameter), responsibleHumanActorId: Type.Optional(idParameter),
      labels: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 30 })), dueDate: Type.Optional(Type.String({ format: 'date-time' })),
      priority: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('low'), Type.Literal('medium'),
        Type.Literal('high'), Type.Literal('urgent')])) }), input => ({
      method: 'POST', path: '/api/v1/work-items', body: workItemInputSchema.parse(input),
    }))
  add('workmesh_update_work_item', 'updateWorkItem',
    'Edit an authorized Issue with its exact current revision. Workflow status and Agent Session state are different.',
    Type.Object({ workItemId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      title: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
      description: Type.Optional(Type.Union([Type.String({ maxLength: 50_000 }),Type.Null()])),
      statusId: Type.Optional(idParameter), projectId: Type.Optional(Type.Union([idParameter, Type.Null()])),
      parentId: Type.Optional(Type.Union([idParameter, Type.Null()])), milestoneId: Type.Optional(Type.Union([idParameter, Type.Null()])),
      responsibleHumanActorId: Type.Optional(Type.Union([idParameter,Type.Null()])),
      placement: Type.Optional(Type.Object({beforeItemId:Type.Union([idParameter,Type.Null()])})),
      labels: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 60 }), { maxItems: 30 })), dueDate: Type.Optional(Type.Union([Type.String({ format: 'date-time' }),Type.Null()])),
      priority: Type.Optional(Type.Union([Type.Literal('none'), Type.Literal('low'), Type.Literal('medium'),
        Type.Literal('high'), Type.Literal('urgent')])) }), input => {
      const parsed = z.object({ workItemId: id, ifMatch: z.number().int().positive(),
        title: z.string().min(1).max(500).optional(), description: z.string().max(50_000).nullable().optional(),
        statusId: id.optional(), projectId: id.nullable().optional(), parentId: id.nullable().optional(), milestoneId: id.nullable().optional(), responsibleHumanActorId: id.nullable().optional(),
        labels: z.array(z.string().min(1).max(60)).max(30).optional(), dueDate: z.string().datetime({offset:true}).nullable().optional(),
        placement: z.object({beforeItemId:id.nullable()}).optional(),
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
  add('workmesh_create_milestone', 'createProjectMilestone', 'Create a structured milestone in an authorized Project.',
    Type.Object({ projectId: idParameter, name: Type.String({ minLength: 1, maxLength: 180 }), description: Type.Optional(Type.String({ maxLength: 10000 })), targetDate: Type.Optional(Type.String({ format: 'date' })) }), input => {
      const { projectId, ...body } = z.object({ projectId: id, name: z.string().min(1).max(180), description: z.string().max(10000).optional(), targetDate: z.string().date().optional() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/projects/${projectId}/milestones`, body }
    })
  add('workmesh_update_milestone', 'updateMilestone', 'Update a milestone using its current revision.',
    Type.Object({ milestoneId: idParameter, ifMatch: Type.Integer({ minimum: 1 }), name: Type.Optional(Type.String({ minLength: 1, maxLength: 180 })), description: Type.Optional(Type.Union([Type.String({ maxLength: 10000 }),Type.Null()])), targetDate: Type.Optional(Type.Union([Type.String({ format: 'date' }),Type.Null()])) }), input => {
      const { milestoneId, ifMatch, ...body } = z.object({ milestoneId: id, ifMatch: z.number().int().positive(), name: z.string().min(1).max(180).optional(), description: z.string().max(10000).nullable().optional(), targetDate: z.string().date().nullable().optional() }).strict().parse(input)
      return { method: 'PATCH', path: `/api/v1/milestones/${milestoneId}`, body, ifMatch }
    })
  add('workmesh_delete_milestone', 'deleteMilestone', 'Delete an empty authorized milestone at its current revision.',
    Type.Object({ milestoneId: idParameter, ifMatch: Type.Integer({ minimum: 1 }) }), input => {
      const { milestoneId, ifMatch } = z.object({ milestoneId: id, ifMatch: z.number().int().positive() }).strict().parse(input)
      return { method: 'DELETE', path: `/api/v1/milestones/${milestoneId}`, ifMatch }
    })
  add('workmesh_delete_work_item_relation', 'deleteWorkItemRelation', 'Remove an authorized relation at its current revision.',
    Type.Object({ workItemId: idParameter, relationId: idParameter, ifMatch: Type.Integer({ minimum: 1 }) }), input => {
      const { workItemId, relationId, ifMatch } = z.object({ workItemId: id, relationId: id, ifMatch: z.number().int().positive() }).strict().parse(input)
      return { method: 'DELETE', path: `/api/v1/work-items/${workItemId}/relations/${relationId}`, ifMatch }
    })
  add('workmesh_list_documents', 'listDocuments', 'List authorized ordinary Documents with their native UUID cursor.',
    Type.Object({ ownerType: ownerParameter, ownerId: idParameter, cursor: Type.Optional(idParameter), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }), input => {
      const { ownerType, ownerId, ...page } = z.object({ ownerType: z.enum(['project','work_item']), ownerId: id, cursor: id.optional(), limit: z.number().int().min(1).max(100).optional() }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/documents?ownerType=${ownerType}&ownerId=${ownerId}&${pageQuery(page)}` }
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
  add('workmesh_list_child_sessions', 'listAgentSessionChildren', 'Read minimal direct-child facts for this exact live parent; no child credentials or prompts.',
    Type.Object({ ...pageParameters.properties, childSessionId: Type.Optional(idParameter) }), input => {
      const { childSessionId, cursor, limit } = childSessionStatusQuerySchema.parse(input)
      return { method: 'GET', path: `/api/v1/agent-sessions/${api.sessionId}/children?${pageQuery({ cursor, limit })}${childSessionId ? `&childSessionId=${childSessionId}` : ''}` }
    })
  const creationFields = { planStepId: idParameter, planVersionId: idParameter,
    initialPrompt: Type.String({ minLength: 1, maxLength: 50000 }), budget: Type.Optional(Type.Record(Type.String(), Type.Number({ minimum: 0 }))) }
  add('workmesh_create_child_session', 'createChildAgentSession', 'Create a bounded required child in the current stable Plan step; an explicit budget reduces inherited limits. Use workmesh_create_review_delegation for reviewer evidence; ordinary role=reviewer retains limited capability and cannot publish code_review.',
    Type.Object({ ...creationFields, agentId: idParameter, required: Type.Optional(Type.Boolean()), role: Type.Optional(Type.Union([Type.Literal('executor'), Type.Literal('reviewer'), Type.Literal('researcher')])) }),
    input => ({ method: 'POST', path: `/api/v1/agent-sessions/${api.sessionId}/children`, body: childSessionInputSchema.parse(input) }))
  add('workmesh_create_review_delegation', 'createReviewDelegation', 'Create an independent reviewer with no plan publication capability. Explicitly reduce all constrained budget dimensions to fit remaining reservations.',
    Type.Object({ ...creationFields, reviewerAgentId: idParameter, ttlSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 3600 })) }),
    input => ({ method: 'POST', path: `/api/v1/agent-sessions/${api.sessionId}/review-delegations`, body: reviewDelegationInputSchema.parse(input) }))
  const pagedRead = (name: string, operation: string, prefix: string, field?: string) => {
    add(name, operation, 'Read authorized facts with complete pagination; reads never add activity.',
      Type.Object({ ...pageParameters.properties, ...(field ? { [field]: idParameter } : {}) }), input => {
        const parsed: Record<string, unknown> = z.object({ ...(field ? { [field]: id } : {}), limit: z.number().int().min(1).max(200).optional(), cursor: z.string().max(8192).optional() }).strict().parse(input)
        const resource = field ? id.parse(parsed[field]) : undefined
        const { [field ?? 'unused']: _resource, ...page } = parsed
        return { method: 'GET', path: `${prefix.replace('{id}', resource ?? '')}?${pageQuery(page)}` }
      })
  }
  pagedRead('workmesh_list_work_item_comments', 'listWorkItemComments', '/api/v1/work-items/{id}/comments', 'workItemId')
  pagedRead('workmesh_list_project_milestones', 'listProjectMilestones', '/api/v1/projects/{id}/milestones', 'projectId')
  pagedRead('workmesh_list_work_item_relations', 'listWorkItemRelations', '/api/v1/work-items/{id}/relations', 'workItemId')
  pagedRead('workmesh_list_handoffs', 'listHandoffs', '/api/v1/handoffs')
  add('workmesh_list_inbox_items','listInbox','Read authorized Inbox metadata, including resolved items, with complete pagination.',
    Type.Object({ ...pageParameters.properties, status: Type.Optional(Type.Union([Type.Literal('open'),Type.Literal('resolved')])) }), input => {
      const { status, ...page } = z.object({ status: z.enum(['open','resolved']).optional(), cursor: z.string().max(8192).optional(), limit: z.number().int().min(1).max(200).optional() }).strict().parse(input)
      return { method: 'GET',path: `/api/v1/inbox?${pageQuery(page)}${status?`&status=${status}`:''}` }
    })
  add('workmesh_list_document_history', 'listDocumentHistory', 'Read immutable Document history using its native revision-number cursor.',
    Type.Object({ documentId: idParameter, cursor: Type.Optional(Type.String({ pattern: '^[1-9][0-9]*$' })), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) }), input => {
      const { documentId, ...page } = z.object({ documentId: id, cursor: z.string().regex(/^[1-9][0-9]*$/).optional(), limit: z.number().int().min(1).max(100).optional() }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/documents/${documentId}/history?${pageQuery(page)}` }
    })
  add('workmesh_get_document_revision', 'getDocumentRevision', 'Read an authorized immutable Document revision.',
    Type.Object({ documentId: idParameter, revisionId: idParameter }), input => {
      const body = z.object({ documentId: id, revisionId: id }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/documents/${body.documentId}/revisions/${body.revisionId}` }
    })
  add('workmesh_diff_document_revisions', 'diffDocumentRevisions', 'Compare authorized immutable Document revisions.',
    Type.Object({ documentId: idParameter, fromRevisionId: idParameter, toRevisionId: idParameter }), input => {
      const { documentId, ...query } = z.object({ documentId: id, fromRevisionId: id, toRevisionId: id }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/documents/${documentId}/diff?${new URLSearchParams(query)}` }
    })
  add('workmesh_export_document_markdown', 'exportDocumentMarkdown', 'Read authorized Markdown as text.',
    Type.Object({ documentId: idParameter, revisionId: Type.Optional(idParameter) }), input => {
      const { documentId, revisionId } = z.object({ documentId: id, revisionId: id.optional() }).strict().parse(input)
      return { method: 'GET', path: `/api/v1/documents/${documentId}/export${revisionId ? `?revisionId=${revisionId}` : ''}` }
    })
  add('workmesh_restore_document_revision', 'restoreDocumentRevision', 'Restore a revision by appending a new revision; current revision and content hash must match.',
    Type.Object({ documentId: idParameter, ifMatch: Type.Integer({ minimum: 1 }), revisionId: idParameter, baseRevisionId: idParameter, baseContentHash: Type.String({ pattern: '^sha256:[a-f0-9]{64}$' }), changeSummary: Type.String({ minLength: 1, maxLength: 500 }) }), input => {
      const { documentId, ifMatch, ...body } = z.object({ documentId: id, ifMatch: z.number().int().positive(), revisionId: id, baseRevisionId: id, baseContentHash: z.string(), changeSummary: z.string() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/documents/${documentId}/restore`, ifMatch, body: restoreDocumentRevisionInputSchema.parse(body) }
    })
  for (const scope of ['workspace','team','project'] as const)
    add(`workmesh_get_${scope}_guidance`, `get${scope[0]!.toUpperCase()}${scope.slice(1)}Guidance`, 'Read published Guidance. Publication remains Human-only.',
      Type.Object({ scopeId: idParameter }), input => ({ method: 'GET', path: `/api/v1/${scope}s/${z.object({ scopeId: id }).strict().parse(input).scopeId}/guidance` }))
  for (const [name, operation, path, field] of [
    ['workmesh_get_milestone','getMilestone','/api/v1/milestones/','milestoneId'],
    ['workmesh_get_decision','getDecision','/api/v1/decisions/','decisionId'],
    ['workmesh_get_inbox_item','getInboxItem','/api/v1/inbox/','inboxItemId'],
  ] as const) add(name, operation, 'Read one authorized resource.', Type.Object({ [field]: idParameter }), input => ({ method: 'GET', path: path+z.object({ [field]: id }).strict().parse(input)[field] }))
  for (const [scope, field, operation] of [['work_item','workItemId','createWorkItemDecision'],['project','projectId','createProjectDecision'],['session','sessionId','createSessionDecision']] as const)
    add(`workmesh_create_${scope}_decision`, operation, 'Propose a Decision; Human-only finalization is never available here.',
      Type.Object({ ...(scope === 'session' ? {} : { [field]: idParameter }), title: Type.String({ minLength: 1, maxLength: 500 }), rationale: Type.String({ minLength: 1, maxLength: 20000 }), options: Type.Optional(Type.Array(Type.String())), evidence: Type.Optional(Type.Array(Type.String())), selectedOption: Type.Optional(Type.String()), affectedResources: Type.Optional(Type.Array(Type.Object({ resourceType: Type.String(), resourceId: idParameter, impact: Type.Optional(Type.String({minLength:1,maxLength:2000})) }))) }), input => {
        const parsed: Record<string, unknown> = z.object({ ...(scope === 'session' ? {} : { [field]: id }), title: z.string(), rationale: z.string(), options: z.array(z.string()).optional(), evidence: z.array(z.string()).optional(), selectedOption: z.string().optional(), affectedResources: decisionInputSchema.shape.affectedResources }).strict().parse(input)
        const { [field]: target, ...body } = parsed
        return { method: 'POST', path: `/api/v1/${scope === 'session' ? 'agent-sessions' : scope === 'project' ? 'projects' : 'work-items'}/${scope === 'session' ? api.sessionId : id.parse(target)}/decisions`, body: decisionInputSchema.parse(body) }
      })
  add('workmesh_get_work_room', 'getWorkRoom', 'Read the authorized room metadata; room timeline stays Human-only.',
    Type.Object({ workItemId: Type.Optional(idParameter), projectId: Type.Optional(idParameter) }), input => {
      const query = z.object({ workItemId: id.optional(), projectId: id.optional() }).strict().parse(input)
      const params = new URLSearchParams(query.workItemId ? { workItemId: query.workItemId } : query.projectId ? { projectId: query.projectId } : { sessionId: api.sessionId })
      return { method: 'GET', path: `/api/v1/rooms?${params}` }
    })
  add('workmesh_send_room_message', 'postWorkRoomMessage', 'Send a visible Room message as this Session. Reviewers must publish their own review_result.',
    Type.Object({ roomId: idParameter, intent: Type.String(), body: Type.String({ minLength: 1, maxLength: 50000 }), recipientActorId: Type.Optional(idParameter), recipientSessionId: Type.Optional(idParameter), recipientActorIds: Type.Optional(Type.Array(idParameter,{minItems:1,maxItems:50})),recipientSessionIds: Type.Optional(Type.Array(idParameter,{minItems:1,maxItems:50})),threadId: Type.Optional(idParameter),payload: Type.Optional(Type.Record(Type.String(),Type.Unknown())),replyToMessageId: Type.Optional(idParameter), requiresResponse: Type.Optional(Type.Boolean()) }), input => {
      const { roomId, ...body } = z.object({ roomId: id, intent: z.string(), body: z.string(), recipientActorId: id.optional(), recipientSessionId: id.optional(), recipientActorIds: z.array(id).optional(),recipientSessionIds: z.array(id).optional(),threadId: id.optional(),payload: z.record(z.unknown()).optional(),replyToMessageId: id.optional(), requiresResponse: z.boolean().optional() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/rooms/${roomId}/messages`, body: roomMessageInputSchema.parse({ ...body, sessionId: api.sessionId }) }
    })
  for (const action of ['claim','acknowledge'] as const) add(`workmesh_${action}_inbox_item`, action === 'claim' ? 'claimInboxItem' : 'acknowledgeInboxItem', 'Perform the exact Session Inbox action; metadata is not a claim.',
    Type.Object({ inboxItemId: idParameter }), input => {
      const { inboxItemId } = z.object({ inboxItemId: id }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/inbox/${inboxItemId}/${action}`, body: {} }
    })
  add('workmesh_reply_inbox_item','replyInboxItem','Reply as the exact recipient/claimant Session.',
    Type.Object({ inboxItemId: idParameter, ifMatch: Type.Integer({ minimum: 1 }), body: Type.String({ minLength: 1, maxLength: 50000 }), payload: Type.Optional(Type.Record(Type.String(),Type.Unknown())) }), input => {
      const { inboxItemId, ifMatch, ...body } = z.object({ inboxItemId: id, ifMatch: z.number().int().positive(), body: z.string().min(1).max(50000), payload: z.record(z.unknown()).optional() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/inbox/${inboxItemId}/reply`, body, ifMatch }
    })
  add('workmesh_request_handoff', 'requestHandoff', 'Request a source Handoff; acceptance is a Human action.',
    Type.Object({ handoffId: idParameter, reason: Type.Optional(Type.String()) }), input => {
      const { handoffId, ...body } = z.object({ handoffId: id, reason: z.string().optional() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/handoffs/${handoffId}/request`, body }
    })
  add('workmesh_publish_artifact', 'publishArtifact',
    'Publish a referenced result or evidence for this exact Session. An artifact is a durable record, not an approval.',
    Type.Object({ type: reviewer ? Type.Literal('code_review') : Type.Union(artifactTypeSchema.options.map(value=>Type.Literal(value))),
      title: Type.String({ minLength: 1, maxLength: 500 }),
      metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      uri: Type.Optional(Type.String({ format: 'uri' })),
      checksum: Type.Optional(Type.String({ pattern: '^sha256:[a-f0-9]{64}$' })) }), input => {
      const parsed = z.object({ type: (reviewer ? z.literal('code_review') : artifactTypeSchema), title: z.string().min(1).max(500), uri: z.string().url().optional(),
        checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(), metadata: z.record(z.unknown()).optional() }).parse(input)
      return { method: 'POST', path: '/api/v1/artifacts',
        body: artifactInputSchema.parse({ sessionId: api.sessionId, ...parsed,
          sourceTool: 'pi-workmesh-tool', metadata: parsed.metadata ?? {} }) }
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
    pageParameters, input => ({ method: 'GET', path: `/api/v1/leases?sessionId=${api.sessionId}&${pageQuery(input)}` }))
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
  add('workmesh_heartbeat_lease', 'heartbeatLease', 'Send diagnostic heartbeat for a Lease held by this Session; this does not renew it.',
    Type.Object({ leaseId: idParameter }), input => ({ method: 'POST',
      path: `/api/v1/leases/${z.object({ leaseId: id }).parse(input).leaseId}/heartbeat`, body: {} }), false, false)
  add('workmesh_renew_lease', 'renewLease', 'Renew a Lease held by this Session using its exact current version.',
    Type.Object({ leaseId: idParameter, ifMatch: Type.Integer({ minimum: 1 }),
      ttlSeconds: Type.Optional(Type.Integer({ minimum: 10, maximum: 3600 })) }), input => {
      const { leaseId, ifMatch, ...body } = z.object({ leaseId: id, ifMatch: z.number().int().positive(),
        ttlSeconds: z.number().int().min(10).max(3600).optional() }).strict().parse(input)
      return { method: 'POST', path: `/api/v1/leases/${leaseId}/renew`, ifMatch, body }
    }, false, false)
  add('workmesh_offer_handoff', 'offerHandoff',
    'Offer visible, structured work to another Agent. The target and server must accept before work transfers.',
    Type.Object({ targetAgentId: Type.Optional(idParameter), targetSkill: Type.Optional(Type.String({minLength:1,maxLength:160})), summary: Type.String({ minLength: 1, maxLength: 20000 }),
      scopeType: Type.Optional(Type.Union(['workspace','project','work_item','plan_step'].map(value=>Type.Literal(value)))), scopeId: Type.Optional(idParameter),
      completedWork: Type.Optional(Type.Array(Type.String({minLength:1,maxLength:10000}),{maxItems:100})), remainingWork: Type.Optional(Type.Array(Type.String({minLength:1,maxLength:10000}),{maxItems:100})),
      openQuestions: Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2000}),{maxItems:100})), risks: Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2000}),{maxItems:100})),
      acceptanceCriteria: Type.Optional(Type.Array(Type.String({minLength:1,maxLength:2000}),{maxItems:100})), requestedAction: Type.Optional(Type.String({minLength:1,maxLength:10000})),
      leaseTransferPolicy: Type.Optional(Type.Union([Type.Literal('retain'),Type.Literal('transfer'),Type.Literal('release')])),artifactIds: Type.Optional(Type.Array(idParameter,{maxItems:100})),contextSnapshotId: Type.Optional(idParameter),requestedCapabilities: Type.Optional(Type.Array(Type.String(),{maxItems:50})),status: Type.Optional(Type.Union([Type.Literal('draft'),Type.Literal('requested')])) }), input => {
      // Shared schema owns the mutually exclusive target and full structured package.
      const parsed = handoffInputSchema.parse({ ...(input as Record<string,unknown>), fromSessionId: api.sessionId })
      return { method: 'POST', path: '/api/v1/handoffs',
        body: parsed }
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
        ownerActorId: Type.Optional(idParameter), cancellationReason: Type.Optional(Type.String({minLength:1,maxLength:2000})), expectedArtifacts: Type.Optional(Type.Array(Type.String(),{maxItems:50})),
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
