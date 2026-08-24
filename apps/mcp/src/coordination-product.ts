import { createHash } from 'node:crypto'
import { WorkMeshClient, WorkMeshSdkError } from '@workmesh/agent-sdk'
import { z } from 'zod'

type TeamRow = { id: string; key: string; name: string; revision?: number }
type WorkflowStateRow = { id: string; team_id: string; name: string; category: string; position: number; revision?: number }
type ProjectRow = { id: string; team_id: string; name: string; revision: number }
type WorkItemRow = { id: string; team_id: string; team_key: string; number: number; title: string; revision: number }
type MilestoneRow = { id: string; project_id: string; name: string; revision: number }

export type IdentifierKind = 'team' | 'workflow_state' | 'project' | 'work_item' | 'milestone'
export type IdentifierInput = { kind: IdentifierKind; ref: string; teamRef?: string; projectRef?: string }

const provenanceSchema = z.object({
  provider: z.string().min(1).max(100),
  sourceUrl: z.string().url().max(2_000),
  sourceIdentifier: z.string().min(1).max(500),
}).strict()

const importWorkItemSchema = z.object({
  sourceId: z.string().min(1).max(500),
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).optional(),
  status: z.string().min(1).max(180).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
  labels: z.array(z.string().min(1).max(60)).max(30).optional(),
  dueDate: z.string().date().optional(),
  milestoneSourceId: z.string().min(1).max(500).optional(),
  parentSourceId: z.string().min(1).max(500).optional(),
  provenance: provenanceSchema.optional(),
}).strict()

const importRelationSchema = z.object({
  sourceId: z.string().min(1).max(500).optional(),
  sourceWorkItemId: z.string().min(1).max(500),
  targetWorkItemId: z.string().min(1).max(500),
  kind: z.enum(['blocks', 'related']),
}).strict()

export const projectImportSchema = z.object({
  teamRef: z.string().min(1).max(500),
  defaultStatus: z.string().min(1).max(180),
  project: z.object({
    sourceId: z.string().min(1).max(500),
    name: z.string().min(1).max(180),
    summary: z.string().max(500).optional(),
    description: z.string().max(20_000).optional(),
    status: z.string().min(1).max(80).optional(),
    provenance: provenanceSchema.optional(),
  }).strict(),
  milestones: z.array(z.object({
    sourceId: z.string().min(1).max(500),
    name: z.string().min(1).max(180),
    description: z.string().max(10_000).optional(),
    targetDate: z.string().date().optional(),
    provenance: provenanceSchema.optional(),
  }).strict()).max(200).default([]),
  workItems: z.array(importWorkItemSchema).max(2_000).default([]),
  relations: z.array(importRelationSchema).max(5_000).default([]),
}).strict()

export type ProjectImportInput = z.infer<typeof projectImportSchema>
export const normalizedProjectImportPlanSchema = projectImportSchema.extend({
  schemaVersion: z.literal(1),
  workItems: importWorkItemSchema.extend({
    status: z.string().min(1).max(180),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    labels: z.array(z.string().min(1).max(60)).max(30),
  }).array().max(2_000),
  relations: importRelationSchema.extend({
    sourceId: z.string().min(1).max(500),
  }).array().max(5_000),
})
export const applyProjectImportSchema = z.object({
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  plan: normalizedProjectImportPlanSchema,
}).strict()
export type NormalizedProjectImportPlan = z.infer<typeof normalizedProjectImportPlanSchema>
export type PreparedProjectImport = {
  contentHash: string
  plan: NormalizedProjectImportPlan
  counts: { projects: 1; milestones: number; workItems: number; relations: number }
  sideEffectFree: true
}

const compactId = (id: string): string => id.replaceAll('-', '').toLowerCase()

export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'item'
}

export function projectReference(project: Pick<ProjectRow, 'id' | 'name'>, teamKey: string): string {
  return `${teamKey.toUpperCase()}/${slugify(project.name)}~${compactId(project.id).slice(-12)}`
}

export function workItemReference(item: Pick<WorkItemRow, 'team_key' | 'number'>): string {
  return `${item.team_key.toUpperCase()}-${item.number}`
}

const trimOptional = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const optional = <T>(key: string, value: T | undefined): Record<string, T> =>
  value === undefined ? {} : { [key]: value }

function normalizeProvenance(value: z.infer<typeof provenanceSchema> | undefined) {
  if (!value) return undefined
  return {
    provider: value.provider.trim(),
    sourceIdentifier: value.sourceIdentifier.trim(),
    sourceUrl: value.sourceUrl,
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const planHash = (plan: NormalizedProjectImportPlan): string =>
  `sha256:${createHash('sha256').update(canonicalJson(plan)).digest('hex')}`

function assertUniqueSourceIds(kind: string, values: ReadonlyArray<{ sourceId: string }>): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value.sourceId)) {
      throw new WorkMeshSdkError(`Duplicate ${kind} sourceId ${value.sourceId}`, {
        code: 'IMPORT_SOURCE_ID_DUPLICATE',
        details: { kind, sourceId: value.sourceId },
      })
    }
    seen.add(value.sourceId)
  }
}

function assertAcyclic(nodes: readonly string[], edges: ReadonlyMap<string, readonly string[]>, code: string): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (node: string): void => {
    if (visiting.has(node)) {
      throw new WorkMeshSdkError('The import graph contains a cycle', {
        code,
        details: { node },
      })
    }
    if (visited.has(node)) return
    visiting.add(node)
    for (const target of edges.get(node) ?? []) visit(target)
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of nodes) visit(node)
}

export function prepareProjectImport(raw: ProjectImportInput): PreparedProjectImport {
  const input = projectImportSchema.parse(raw)
  const project = {
    sourceId: input.project.sourceId.trim(),
    name: input.project.name.trim(),
    ...optional('summary', trimOptional(input.project.summary)),
    ...optional('description', trimOptional(input.project.description)),
    ...optional('status', trimOptional(input.project.status)),
    ...optional('provenance', normalizeProvenance(input.project.provenance)),
  }
  const milestones = input.milestones.map(item => ({
    sourceId: item.sourceId.trim(),
    name: item.name.trim(),
    ...optional('description', trimOptional(item.description)),
    ...optional('targetDate', item.targetDate),
    ...optional('provenance', normalizeProvenance(item.provenance)),
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  const workItems = input.workItems.map(item => ({
    sourceId: item.sourceId.trim(),
    title: item.title.trim(),
    status: (trimOptional(item.status) ?? input.defaultStatus.trim()),
    priority: item.priority ?? 'none',
    labels: [...new Set(item.labels?.map(label => label.trim()) ?? [])].sort(),
    ...optional('description', trimOptional(item.description)),
    ...optional('dueDate', item.dueDate),
    ...optional('milestoneSourceId', trimOptional(item.milestoneSourceId)),
    ...optional('parentSourceId', trimOptional(item.parentSourceId)),
    ...optional('provenance', normalizeProvenance(item.provenance)),
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  const relations = input.relations.map(item => {
    const sourceWorkItemId = item.sourceWorkItemId.trim()
    const targetWorkItemId = item.targetWorkItemId.trim()
    const [canonicalSource, canonicalTarget] = item.kind === 'related' && sourceWorkItemId > targetWorkItemId
      ? [targetWorkItemId, sourceWorkItemId]
      : [sourceWorkItemId, targetWorkItemId]
    return {
      sourceId: trimOptional(item.sourceId) ?? `${item.kind}:${canonicalSource}:${canonicalTarget}`,
      sourceWorkItemId: canonicalSource,
      targetWorkItemId: canonicalTarget,
      kind: item.kind,
    }
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  const plan = normalizedProjectImportPlanSchema.parse({
    schemaVersion: 1,
    teamRef: input.teamRef.trim().toUpperCase(),
    defaultStatus: input.defaultStatus.trim(),
    project,
    milestones,
    workItems,
    relations,
  })
  assertUniqueSourceIds('milestone', plan.milestones)
  assertUniqueSourceIds('work item', plan.workItems)
  assertUniqueSourceIds('relation', plan.relations)
  const milestoneIds = new Set(plan.milestones.map(item => item.sourceId))
  const workItemIds = new Set(plan.workItems.map(item => item.sourceId))
  for (const item of plan.workItems) {
    if (item.milestoneSourceId && !milestoneIds.has(item.milestoneSourceId)) {
      throw new WorkMeshSdkError('A Work Item references an unknown source Milestone', {
        code: 'IMPORT_REFERENCE_INVALID',
        details: { sourceId: item.sourceId, milestoneSourceId: item.milestoneSourceId },
      })
    }
    if (item.parentSourceId && !workItemIds.has(item.parentSourceId)) {
      throw new WorkMeshSdkError('A Work Item references an unknown source parent', {
        code: 'IMPORT_REFERENCE_INVALID',
        details: { sourceId: item.sourceId, parentSourceId: item.parentSourceId },
      })
    }
  }
  for (const relation of plan.relations) {
    if (!workItemIds.has(relation.sourceWorkItemId) || !workItemIds.has(relation.targetWorkItemId)) {
      throw new WorkMeshSdkError('A relation references an unknown source Work Item', {
        code: 'IMPORT_REFERENCE_INVALID',
        details: relation,
      })
    }
    if (relation.sourceWorkItemId === relation.targetWorkItemId) {
      throw new WorkMeshSdkError('A relation cannot target the same source Work Item', {
        code: 'IMPORT_RELATION_SELF',
        details: relation,
      })
    }
  }
  const parentEdges = new Map<string, readonly string[]>(plan.workItems
    .filter(item => item.parentSourceId)
    .map(item => [item.sourceId, [item.parentSourceId!]] as const))
  assertAcyclic([...workItemIds], parentEdges, 'IMPORT_PARENT_CYCLE')
  const blockerEdges = new Map<string, string[]>()
  for (const relation of plan.relations.filter(item => item.kind === 'blocks')) {
    const targets = blockerEdges.get(relation.sourceWorkItemId) ?? []
    targets.push(relation.targetWorkItemId)
    blockerEdges.set(relation.sourceWorkItemId, targets)
  }
  assertAcyclic([...workItemIds], blockerEdges, 'IMPORT_BLOCKER_CYCLE')
  return {
    contentHash: planHash(plan),
    plan,
    counts: { projects: 1, milestones: plan.milestones.length, workItems: plan.workItems.length, relations: plan.relations.length },
    sideEffectFree: true,
  }
}

function importKey(contentHash: string, kind: string, sourceId: string): string {
  const sourceHash = createHash('sha256').update(sourceId).digest('hex')
  return `project-import:${contentHash.slice('sha256:'.length)}:${kind}:${sourceHash}`
}

function descriptionWithProvenance(
  description: string | undefined,
  provenance: z.infer<typeof provenanceSchema> | undefined,
  maxLength: number,
): string | undefined {
  if (!provenance) return description
  const marker = `Source: ${provenance.provider} ${provenance.sourceIdentifier}\n${provenance.sourceUrl}`
  const value = description ? `${description}\n\n---\n${marker}` : marker
  if (value.length > maxLength) {
    throw new WorkMeshSdkError('Description plus provenance exceeds the target field limit', {
      code: 'IMPORT_DESCRIPTION_TOO_LONG',
      details: { maxLength, actualLength: value.length, sourceIdentifier: provenance.sourceIdentifier },
    })
  }
  return value
}

function topologicalWorkItems(plan: NormalizedProjectImportPlan): NormalizedProjectImportPlan['workItems'] {
  const remaining = new Map(plan.workItems.map(item => [item.sourceId, item]))
  const ordered: NormalizedProjectImportPlan['workItems'] = []
  const completed = new Set<string>()
  while (remaining.size) {
    const ready = [...remaining.values()]
      .filter(item => !item.parentSourceId || completed.has(item.parentSourceId))
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    if (!ready.length) {
      throw new WorkMeshSdkError('The normalized parent graph cannot be scheduled', {
        code: 'IMPORT_PARENT_CYCLE',
      })
    }
    for (const item of ready) {
      ordered.push(item)
      completed.add(item.sourceId)
      remaining.delete(item.sourceId)
    }
  }
  return ordered
}

type EntityMapping = { sourceId: string; targetId: string; targetRef: string; revision: number }

export async function applyProjectImport(
  client: WorkMeshClient,
  raw: z.infer<typeof applyProjectImportSchema>,
): Promise<unknown> {
  const input = applyProjectImportSchema.parse(raw)
  const actualHash = planHash(input.plan)
  if (input.contentHash !== actualHash) {
    throw new WorkMeshSdkError('The prepared import content hash does not match the normalized plan', {
      code: 'IMPORT_HASH_MISMATCH',
      details: { expectedContentHash: actualHash, suppliedContentHash: input.contentHash },
    })
  }
  const team = await resolveTeam(client, input.plan.teamRef)
  const workflowStates = await collectPages<WorkflowStateRow>(cursor =>
    client.listWorkflowStates(team.id, { cursor, limit: 200 }),
  )
  const statusByName = new Map(workflowStates.map(state => [state.name.trim().toLowerCase(), state]))
  for (const item of input.plan.workItems) {
    if (!statusByName.has(item.status.trim().toLowerCase())) {
      throw new WorkMeshSdkError(`Workflow state ${item.status} was not found in Team ${team.key}`, {
        code: 'IMPORT_WORKFLOW_STATE_NOT_FOUND',
        details: { sourceId: item.sourceId, status: item.status, teamRef: team.key },
      })
    }
  }
  const project = await client.createProject<{ id: string; revision: number }>({
    teamId: team.id,
    name: input.plan.project.name,
    summary: input.plan.project.summary,
    description: descriptionWithProvenance(input.plan.project.description, input.plan.project.provenance, 20_000),
    status: input.plan.project.status,
  }, {
    idempotencyKey: importKey(input.contentHash, 'project', input.plan.project.sourceId),
  })
  const projectRef = projectReference({ id: project.id, name: input.plan.project.name }, team.key)
  const milestoneMapping = new Map<string, EntityMapping>()
  for (const milestone of input.plan.milestones) {
    const created = await client.createMilestone<MilestoneRow>(project.id, {
      name: milestone.name,
      description: descriptionWithProvenance(milestone.description, milestone.provenance, 10_000),
      targetDate: milestone.targetDate,
    }, {
      idempotencyKey: importKey(input.contentHash, 'milestone', milestone.sourceId),
    })
    milestoneMapping.set(milestone.sourceId, {
      sourceId: milestone.sourceId,
      targetId: created.id,
      targetRef: milestoneReference(created, projectRef),
      revision: created.revision,
    })
  }
  const workItemMapping = new Map<string, EntityMapping>()
  for (const item of topologicalWorkItems(input.plan)) {
    const status = statusByName.get(item.status.trim().toLowerCase())!
    const created = await client.createWorkItem<{ id: string; revision: number; number: number }>({
      teamId: team.id,
      projectId: project.id,
      milestoneId: item.milestoneSourceId ? milestoneMapping.get(item.milestoneSourceId)!.targetId : undefined,
      parentId: item.parentSourceId ? workItemMapping.get(item.parentSourceId)!.targetId : undefined,
      title: item.title,
      description: descriptionWithProvenance(item.description, item.provenance, 50_000),
      statusId: status.id,
      priority: item.priority,
      dueDate: item.dueDate,
      labels: item.labels,
    }, {
      idempotencyKey: importKey(input.contentHash, 'work-item', item.sourceId),
    })
    workItemMapping.set(item.sourceId, {
      sourceId: item.sourceId,
      targetId: created.id,
      targetRef: workItemReference({ team_key: team.key, number: created.number }),
      revision: created.revision,
    })
  }
  const relationMappings: EntityMapping[] = []
  for (const relation of input.plan.relations) {
    const source = workItemMapping.get(relation.sourceWorkItemId)!
    const target = workItemMapping.get(relation.targetWorkItemId)!
    const created = await client.createWorkItemRelation<{ id: string; revision: number }>(source.targetId, {
      targetWorkItemId: target.targetId,
      kind: relation.kind,
    }, {
      idempotencyKey: importKey(input.contentHash, 'relation', relation.sourceId),
    })
    relationMappings.push({
      sourceId: relation.sourceId,
      targetId: created.id,
      targetRef: `relation:${created.id}`,
      revision: created.revision,
    })
  }
  const mapping = {
    project: {
      sourceId: input.plan.project.sourceId,
      targetId: project.id,
      targetRef: projectRef,
      revision: project.revision,
    },
    milestones: [...milestoneMapping.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    workItems: [...workItemMapping.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    relations: relationMappings.sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  }
  return {
    contentHash: input.contentHash,
    reportHash: `sha256:${createHash('sha256').update(canonicalJson(mapping)).digest('hex')}`,
    complete: true,
    persistedBy: 'api_idempotency_keys',
    replayWindowSeconds: 86_400,
    mapping,
  }
}

function milestoneReference(milestone: Pick<MilestoneRow, 'id' | 'name'>, projectRef: string): string {
  return `${projectRef}#${slugify(milestone.name)}~${compactId(milestone.id).slice(-12)}`
}

async function collectPages<T>(
  read: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor?: string | null }>,
): Promise<T[]> {
  const items: T[] = []
  let cursor: string | undefined
  const visitedCursors = new Set<string>()
  for (let page = 0; page < 100; page += 1) {
    const response = await read(cursor)
    items.push(...response.items)
    if (!response.nextCursor) return items
    if (visitedCursors.has(response.nextCursor)) {
      throw new WorkMeshSdkError('Identifier resolution received a repeated pagination cursor', {
        code: 'IDENTIFIER_CURSOR_REPEATED',
        details: { cursor: response.nextCursor },
      })
    }
    visitedCursors.add(response.nextCursor)
    cursor = response.nextCursor
  }
  throw new WorkMeshSdkError('Identifier resolution exceeded the bounded pagination scan', {
    code: 'IDENTIFIER_SCAN_LIMIT',
    details: { maxPages: 100 },
  })
}

function exactlyOne<T>(kind: IdentifierKind, ref: string, candidates: T[]): T {
  if (candidates.length === 1) return candidates[0]!
  if (candidates.length === 0) {
    throw new WorkMeshSdkError(`No ${kind} matches ${ref}`, {
      code: 'IDENTIFIER_NOT_FOUND',
      details: { kind, ref },
    })
  }
  throw new WorkMeshSdkError(`More than one ${kind} matches ${ref}`, {
    code: 'IDENTIFIER_AMBIGUOUS',
    details: { kind, ref, candidateCount: candidates.length },
  })
}

async function resolveTeam(client: WorkMeshClient, ref: string): Promise<TeamRow> {
  const teams = await collectPages<TeamRow>(cursor => client.listTeams({ cursor, limit: 200 }))
  const normalized = ref.trim().toLowerCase()
  return exactlyOne('team', ref, teams.filter(team =>
    team.id.toLowerCase() === normalized || team.key.toLowerCase() === normalized,
  ))
}

async function connectionTeam(client: WorkMeshClient): Promise<TeamRow> {
  const response = await client.listTeams<TeamRow>({ limit: 2 })
  if (response.items.length !== 1 || response.nextCursor) {
    throw new WorkMeshSdkError('A Coordination Connection must expose exactly one Team', {
      code: 'CONNECTION_SCOPE_INVALID',
      details: { teamCount: response.items.length, hasMoreTeams: Boolean(response.nextCursor) },
    })
  }
  return response.items[0]!
}

function referenceSuffix(ref: string): string | undefined {
  const matches = [...ref.matchAll(/~([a-f0-9]{8,32})(?=#|$)/gi)]
  return matches.at(-1)?.[1]?.toLowerCase()
}

function suffixMatch(suffix: string | undefined, id: string): boolean {
  return suffix !== undefined && compactId(id).endsWith(suffix)
}

async function resolveProject(client: WorkMeshClient, ref: string, team?: TeamRow): Promise<{ project: ProjectRow; team: TeamRow }> {
  const resolvedTeam = team ?? await connectionTeam(client)
  const projects = await collectPages<ProjectRow>(cursor =>
    client.listProjects({ teamId: resolvedTeam.id }, { cursor, limit: 200 }),
  )
  const normalized = ref.trim().toLowerCase()
  const slug = normalized.includes('/') ? normalized.slice(normalized.indexOf('/') + 1).split('~')[0]! : normalized
  const suffix = referenceSuffix(ref)
  const project = exactlyOne('project', ref, projects.filter(candidate =>
    candidate.id.toLowerCase() === normalized
      || suffixMatch(suffix, candidate.id)
      || (suffix === undefined && (
        candidate.name.toLowerCase() === normalized
        || slugify(candidate.name) === slug
      )),
  ))
  return { project, team: resolvedTeam }
}

export async function getWorkMeshContext(client: WorkMeshClient): Promise<unknown> {
  const [manifest, connectionIdentity, team] = await Promise.all([
    client.getAgentCapabilities(),
    client.getCurrentAgentConnectionIdentity(),
    connectionTeam(client),
  ])
  if (manifest.agent.capabilityScope.teamIds.length !== 1
    || manifest.agent.capabilityScope.teamIds[0] !== team.id
    || connectionIdentity.team_id !== team.id
    || connectionIdentity.agent_actor_id !== manifest.agent.actorId
    || connectionIdentity.coordination_session.id !== manifest.agent.sessionId) {
    throw new WorkMeshSdkError('The live Team does not match the Coordination capability scope', {
      code: 'CONNECTION_LIVE_PROBE_INCONSISTENT',
      details: {
        teamId: team.id,
        scopedTeamIds: manifest.agent.capabilityScope.teamIds,
        connectionTeamId: connectionIdentity.team_id,
        connectionActorId: connectionIdentity.agent_actor_id,
        manifestActorId: manifest.agent.actorId,
        connectionSessionId: connectionIdentity.coordination_session.id,
        manifestSessionId: manifest.agent.sessionId,
      },
    })
  }
  const [workflowPage, release, features] = await Promise.all([
    client.listWorkflowStates<WorkflowStateRow>(team.id, { limit: 200 }),
    client.getServerInfo(),
    client.getFeatures(),
  ])
  const workflowStates = [...workflowPage.items]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(state => ({
      id: state.id,
      name: state.name,
      category: state.category,
      position: state.position,
      revision: state.revision,
      ref: `${team.key.toUpperCase()}/state/${slugify(state.name)}`,
    }))
  const defaultWorkflowState = workflowStates.find(state => state.category === 'planned')
    ?? workflowStates.find(state => state.category === 'backlog')
    ?? workflowStates[0]
  if (!defaultWorkflowState) {
    throw new WorkMeshSdkError('The Connection Team has no usable workflow state', {
      code: 'WORKFLOW_STATE_NOT_FOUND',
      details: { teamId: team.id },
    })
  }
  const allowedOperations = manifest.operations
    .filter(operation => operation.supported && operation.eligibleByCapability)
    .map(operation => operation.operationId)
    .sort()
  return {
    identity: manifest.agent,
    connectionIdentity,
    team: { ...team, ref: team.key.toUpperCase() },
    workflowStates,
    defaultWorkflowState,
    release,
    features,
    profileVersion: manifest.profileVersion,
    allowedOperations,
    eventCursor: {
      cursor: '0',
      semantics: 'replay_from_origin',
      durable: manifest.delivery.realtime.durableCursor,
    },
  }
}

export async function resolveIdentifier(client: WorkMeshClient, input: IdentifierInput): Promise<unknown> {
  if (input.kind === 'team') {
    const team = await resolveTeam(client, input.ref)
    return { kind: 'team', id: team.id, ref: team.key.toUpperCase(), displayName: team.name, revision: team.revision }
  }
  const team = input.teamRef ? await resolveTeam(client, input.teamRef) : await connectionTeam(client)
  if (input.kind === 'workflow_state') {
    const states = await collectPages<WorkflowStateRow>(cursor => client.listWorkflowStates(team.id, { cursor, limit: 200 }))
    const normalized = input.ref.trim().toLowerCase()
    const nameRef = normalized.includes('/state/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized
    const state = exactlyOne('workflow_state', input.ref, states.filter(candidate =>
      candidate.id.toLowerCase() === normalized
        || candidate.name.toLowerCase() === normalized
        || slugify(candidate.name) === nameRef,
    ))
    return { kind: 'workflow_state', id: state.id, ref: `${team.key.toUpperCase()}/state/${slugify(state.name)}`, displayName: state.name, revision: state.revision, teamRef: team.key.toUpperCase() }
  }
  if (input.kind === 'project') {
    const { project } = await resolveProject(client, input.ref, team)
    return { kind: 'project', id: project.id, ref: projectReference(project, team.key), displayName: project.name, revision: project.revision, teamRef: team.key.toUpperCase() }
  }
  if (input.kind === 'work_item') {
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.ref)) {
      const item = await client.getWorkItem<WorkItemRow>(input.ref)
      return { kind: 'work_item', id: item.id, ref: workItemReference(item), displayName: item.title, revision: item.revision, teamRef: item.team_key.toUpperCase() }
    }
    const page = await client.listWorkItems<WorkItemRow>({ teamId: team.id, search: input.ref }, { limit: 200 })
    const item = exactlyOne('work_item', input.ref, page.items.filter(candidate => workItemReference(candidate).toLowerCase() === input.ref.toLowerCase()))
    return { kind: 'work_item', id: item.id, ref: workItemReference(item), displayName: item.title, revision: item.revision, teamRef: item.team_key.toUpperCase() }
  }
  if (!input.projectRef) {
    throw new WorkMeshSdkError('Milestone resolution requires projectRef', {
      code: 'IDENTIFIER_CONTEXT_REQUIRED',
      details: { kind: input.kind, required: 'projectRef' },
    })
  }
  const { project } = await resolveProject(client, input.projectRef, team)
  const milestones = await collectPages<MilestoneRow>(cursor => client.listProjectMilestones(project.id, { cursor, limit: 200 }))
  const normalized = input.ref.trim().toLowerCase()
  const slug = normalized.includes('#') ? normalized.slice(normalized.indexOf('#') + 1).split('~')[0]! : normalized
  const suffix = referenceSuffix(input.ref)
  const milestone = exactlyOne('milestone', input.ref, milestones.filter(candidate =>
    candidate.id.toLowerCase() === normalized
      || suffixMatch(suffix, candidate.id)
      || (suffix === undefined && (
        candidate.name.toLowerCase() === normalized
        || slugify(candidate.name) === slug
      )),
  ))
  const projectRef = projectReference(project, team.key)
  return { kind: 'milestone', id: milestone.id, ref: milestoneReference(milestone, projectRef), displayName: milestone.name, revision: milestone.revision, teamRef: team.key.toUpperCase(), projectRef }
}
