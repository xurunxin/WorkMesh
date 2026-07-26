import type {
  AutomationAction,
  AutomationCondition,
  NotificationPriority,
} from '@workmesh/contracts'
import { DomainError } from './index.js'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export type CycleWindow = {
  ordinal: number
  name: string
  startsAt: Date
  endsAt: Date
}

export function generateCycleWindows(input: {
  firstStartsAt: Date
  durationWeeks: number
  count: number
  namePrefix: string
}): CycleWindow[] {
  if (!Number.isInteger(input.durationWeeks) || input.durationWeeks < 1 || input.durationWeeks > 8)
    throw new DomainError('INVALID_CYCLE_DURATION', 'Cycle duration must be between one and eight weeks')
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 52)
    throw new DomainError('INVALID_CYCLE_COUNT', 'Cycle generation count must be between one and 52')
  const first = Date.UTC(
    input.firstStartsAt.getUTCFullYear(),
    input.firstStartsAt.getUTCMonth(),
    input.firstStartsAt.getUTCDate(),
  )
  return Array.from({ length: input.count }, (_, index) => {
    const startsAt = new Date(first + index * input.durationWeeks * WEEK_MS)
    return {
      ordinal: index + 1,
      name: `${input.namePrefix} ${index + 1}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.durationWeeks * WEEK_MS),
    }
  })
}

export function classifyCycle(
  cycle: Pick<CycleWindow, 'startsAt' | 'endsAt'>,
  now: Date,
): 'current' | 'upcoming' | 'history' {
  if (now.getTime() < cycle.startsAt.getTime()) return 'upcoming'
  if (now.getTime() >= cycle.endsAt.getTime()) return 'history'
  return 'current'
}

export function cycleProgress(input: {
  total: number
  completed: number
  estimateTotal: number
  estimateCompleted: number
}): { itemPercent: number; estimatePercent: number } {
  const percent = (done: number, total: number): number =>
    total <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((done / total) * 10_000) / 100))
  return {
    itemPercent: percent(input.completed, input.total),
    estimatePercent: percent(input.estimateCompleted, input.estimateTotal),
  }
}

export function selectCarryOverWorkItems<T extends { id: string; completed: boolean }>(
  source: readonly T[],
  explicitIds?: readonly string[],
): T[] {
  const ids = explicitIds ? new Set(explicitIds) : undefined
  return source.filter(item => !item.completed && (!ids || ids.has(item.id)))
}

export type InitiativeProject = {
  id: string
  status: string
  health: 'on_track' | 'at_risk' | 'off_track' | 'unknown'
  completedItems: number
  totalItems: number
  costBuckets?: readonly {
    currency: string
    knownCostMinor: string
    hasUnknownCost: boolean
  }[]
}

const healthRank = { unknown: 0, on_track: 1, at_risk: 2, off_track: 3 } as const

export function rollupInitiative(projects: readonly InitiativeProject[]): {
  projectCount: number
  completedProjectCount: number
  completedItems: number
  totalItems: number
  progressPercent: number
  health: InitiativeProject['health']
  currencyBuckets: Array<{ currency: string; knownCostMinor: string; hasUnknownCost: boolean }>
  hasUnknownCost: boolean
} {
  const completedItems = projects.reduce((sum, project) => sum + project.completedItems, 0)
  const totalItems = projects.reduce((sum, project) => sum + project.totalItems, 0)
  const health = projects.reduce<InitiativeProject['health']>(
    (worst, project) => healthRank[project.health] > healthRank[worst] ? project.health : worst,
    'unknown',
  )
  const costs = new Map<string, { knownCostMinor: bigint; hasUnknownCost: boolean }>()
  for (const project of projects) for (const bucket of project.costBuckets ?? []) {
    const current = costs.get(bucket.currency) ?? { knownCostMinor: 0n, hasUnknownCost: false }
    current.knownCostMinor += BigInt(bucket.knownCostMinor)
    current.hasUnknownCost ||= bucket.hasUnknownCost
    costs.set(bucket.currency, current)
  }
  const currencyBuckets = [...costs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, bucket]) => ({
      currency,
      knownCostMinor: bucket.knownCostMinor.toString(),
      hasUnknownCost: bucket.hasUnknownCost,
    }))
  return {
    projectCount: projects.length,
    completedProjectCount: projects.filter(project => project.status === 'completed').length,
    completedItems,
    totalItems,
    progressPercent: totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 10_000) / 100,
    health,
    currencyBuckets,
    hasUnknownCost: currencyBuckets.some(bucket => bucket.hasUnknownCost),
  }
}

const readPath = (value: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)

function compare(actual: unknown, op: NonNullable<AutomationCondition['op']>, expected: unknown): boolean {
  switch (op) {
    case 'eq': return Object.is(actual, expected)
    case 'neq': return !Object.is(actual, expected)
    case 'exists': return expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null
    case 'in': return Array.isArray(expected) && expected.some(item => Object.is(actual, item))
    case 'contains': return Array.isArray(actual)
      ? actual.some(item => Object.is(item, expected))
      : typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)
    case 'gt': return typeof actual === 'number' && typeof expected === 'number' && actual > expected
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected
    case 'lt': return typeof actual === 'number' && typeof expected === 'number' && actual < expected
    case 'lte': return typeof actual === 'number' && typeof expected === 'number' && actual <= expected
  }
}

export function evaluateAutomationCondition(
  condition: AutomationCondition | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (!condition) return true
  if (condition.all) return condition.all.every(item => evaluateAutomationCondition(item as AutomationCondition, payload))
  if (condition.any) return condition.any.some(item => evaluateAutomationCondition(item as AutomationCondition, payload))
  if (condition.not) return !evaluateAutomationCondition(condition.not as AutomationCondition, payload)
  if (condition.field && condition.op) return compare(readPath(payload, condition.field), condition.op, condition.value)
  return false
}

export type AutomationTrace = {
  matched: boolean
  dryRun: boolean
  actions: Array<{ action: AutomationAction; effect: 'planned' | 'skipped' }>
  effectsCreated: 0
}

export function dryRunAutomation(
  condition: AutomationCondition | undefined,
  actions: readonly AutomationAction[],
  payload: Record<string, unknown>,
): AutomationTrace {
  const matched = evaluateAutomationCondition(condition, payload)
  return {
    matched,
    dryRun: true,
    actions: actions.map(action => ({ action, effect: matched ? 'planned' : 'skipped' })),
    effectsCreated: 0,
  }
}

export function automationRetry(attempt: number, maxAttempts: number): {
  terminal: boolean
  status: 'pending' | 'dead'
  delaySeconds: number
} {
  if (attempt >= maxAttempts) return { terminal: true, status: 'dead', delaySeconds: 0 }
  return {
    terminal: false,
    status: 'pending',
    delaySeconds: Math.min(900, 5 * 2 ** Math.max(0, attempt - 1)),
  }
}

export function assertLoopAdmission(input: {
  noOverlap: boolean
  activeRunCount: number
  requestedCostMinor: string
  consumedCostMinor: string
  hardCostMinor?: string
  requestedTokens?: number
  consumedTokens?: number
  hardTokens?: number
}): void {
  if (input.noOverlap && input.activeRunCount > 0)
    throw new DomainError('LOOP_OVERLAP', 'Loop already has an active run')
  if (
    input.hardCostMinor !== undefined
    && BigInt(input.consumedCostMinor) + BigInt(input.requestedCostMinor) > BigInt(input.hardCostMinor)
  )
    throw new DomainError('BUDGET_HARD_LIMIT', 'Run admission would exceed the hard budget')
  if (
    input.hardTokens !== undefined
    && (input.consumedTokens ?? 0) + (input.requestedTokens ?? 0) > input.hardTokens
  )
    throw new DomainError('BUDGET_HARD_LIMIT', 'Run admission would exceed the hard token budget')
}

export type UsageTotal = {
  inputTokens: number
  outputTokens: number
  runtimeMs: number
  toolCalls: number
  knownCostMinor: string
  unknownCostRecords: number
}

export function aggregateUsage(records: readonly {
  inputTokens?: number
  outputTokens?: number
  runtimeMs?: number
  toolCalls?: number
  costMinor?: string
  costSource: 'provider_reported' | 'rate_card' | 'manual' | 'unknown'
}[]): UsageTotal {
  const total = records.reduce<Omit<UsageTotal, 'knownCostMinor'> & { knownCostMinor: bigint }>((current, record) => ({
    inputTokens: current.inputTokens + (record.inputTokens ?? 0),
    outputTokens: current.outputTokens + (record.outputTokens ?? 0),
    runtimeMs: current.runtimeMs + (record.runtimeMs ?? 0),
    toolCalls: current.toolCalls + (record.toolCalls ?? 0),
    knownCostMinor: current.knownCostMinor + BigInt(record.costMinor ?? '0'),
    unknownCostRecords: current.unknownCostRecords + Number(record.costSource === 'unknown'),
  }), {
    inputTokens: 0,
    outputTokens: 0,
    runtimeMs: 0,
    toolCalls: 0,
    knownCostMinor: 0n,
    unknownCostRecords: 0,
  })
  return { ...total, knownCostMinor: total.knownCostMinor.toString() }
}

const priorityRank: Record<NotificationPriority, number> = {
  input: 6,
  approval: 5,
  agent_failure: 4,
  mention: 3,
  handoff: 2,
  update: 1,
}

export function shouldDeliverNotification(input: {
  priority: NotificationPriority
  minimumPriority: NotificationPriority
  kind: string
  mutedKinds: readonly string[]
}): boolean {
  return !input.mutedKinds.includes(input.kind)
    && priorityRank[input.priority] >= priorityRank[input.minimumPriority]
}

export type ForecastSource = {
  id: string
  kind: string
  observedAt: Date
  weight: number
  signal: -1 | 0 | 1
  explanation: string
}

export function explainProjectForecast(input: {
  targetAt?: Date
  now: Date
  progressPercent: number
  sources: readonly ForecastSource[]
}): {
  health: 'on_track' | 'at_risk' | 'off_track' | 'unknown'
  confidence: number
  uncertainty: string
  explanation: string[]
  sources: Array<{ id: string; kind: string; observedAt: string }>
} {
  if (input.sources.length === 0) {
    return {
      health: 'unknown',
      confidence: 0,
      uncertainty: 'No source-linked observations are available.',
      explanation: [],
      sources: [],
    }
  }
  const weighted = input.sources.reduce((sum, source) => sum + source.signal * source.weight, 0)
  const weight = input.sources.reduce((sum, source) => sum + source.weight, 0)
  const score = weight === 0 ? 0 : weighted / weight
  const daysRemaining = input.targetAt
    ? Math.ceil((input.targetAt.getTime() - input.now.getTime()) / DAY_MS)
    : undefined
  const deadlineRisk = daysRemaining !== undefined && daysRemaining < 0 && input.progressPercent < 100
  const health = deadlineRisk || score < -0.45 ? 'off_track' : score < -0.1 ? 'at_risk' : 'on_track'
  const confidence = Math.min(1, Math.round((weight / Math.max(1, input.sources.length)) * 100) / 100)
  return {
    health,
    confidence,
    uncertainty: confidence < 0.5
      ? 'Confidence is limited because source coverage or weight is low.'
      : 'Forecast remains uncertain because observed execution can change.',
    explanation: [
      ...input.sources.map(source => source.explanation),
      ...(deadlineRisk ? ['The target date has passed while work remains incomplete.'] : []),
    ],
    sources: input.sources.map(source => ({
      id: source.id,
      kind: source.kind,
      observedAt: source.observedAt.toISOString(),
    })),
  }
}

const forbiddenImportKeys = /(^|_)(secret|token|password|credential|private_key|authority|capabilit(y|ies)|delegation|approval)(_|$)/i

export function sanitizeImportedTemplate(value: unknown, path = '$'): unknown {
  if (Array.isArray(value)) return value.map((item, index) => sanitizeImportedTemplate(item, `${path}[${index}]`))
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenImportKeys.test(key))
      throw new DomainError('UNSAFE_TEMPLATE_IMPORT', `Template import cannot carry authority or secrets at ${path}.${key}`)
    result[key] = sanitizeImportedTemplate(item, `${path}.${key}`)
  }
  return result
}
