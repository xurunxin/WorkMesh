import { ApiError, apiListRequest, apiRequest, pagedPath, type ListResponse } from '../../app/lib/api'
import type { Agent, AgentSession } from '../../app/lib/agents'
import type { AuthorizedCommandSnapshot, Command, CommandSourceError, CommandSourceStatus } from './contracts'
import { agentCommand, inboxCommand, projectCommand, sessionCommand, workItemCommand } from './registry'

type FeatureRegistry = { features: Array<{ key: string; enabled: boolean }> }
type Team = { id: string; name: string; key: string }
type Project = { id: string; name: string; summary: string | null; status: string }
type WorkItem = { id: string; title: string; number: number; team_key: string; project_id: string | null; status_name: string; priority: string }
type InboxItem = { id: string; kind: string; source_type: string; source_id: string; requires_response: boolean; payload: Record<string, unknown> }
type PageResult<T> = { items: T[]; truncated: boolean }

const maxTeams = 3
const maxPages = 3
const pageLimit = 50
const minimumResourceQueryLength = 1

async function boundedPages<T extends { id: string }>(path: string, signal: AbortSignal, pages = maxPages): Promise<PageResult<T>> {
  const items = new Map<string, T>()
  let cursor: string | null = null
  let truncated = false
  for (let page = 0; page < pages; page += 1) {
    const response: ListResponse<T> = await apiListRequest<T>(pagedPath(path, cursor, pageLimit), { signal })
    for (const item of response.items) items.set(item.id, item)
    cursor = response.nextCursor
    if (!cursor) return { items: [...items.values()], truncated: false }
  }
  truncated = Boolean(cursor)
  return { items: [...items.values()], truncated }
}

const errorMessage = (reason: unknown): string => reason instanceof Error ? reason.message : 'Request failed'
const errorState = (reason: unknown): CommandSourceError['state'] => reason instanceof ApiError && (reason.status === 401 || reason.status === 403)
  ? 'forbidden'
  : 'error'

async function settledSource<T>(
  source: CommandSourceError['source'],
  request: Promise<PageResult<T>>,
): Promise<{ source: CommandSourceError['source']; result?: PageResult<T>; error?: CommandSourceError }> {
  try { return { source, result: await request } }
  catch (reason) { return { source, error: { source, message: errorMessage(reason), state: errorState(reason) } } }
}

function uniqueCommands(commands: readonly Command[]): Command[] {
  return [...new Map(commands.map(command => [command.id, command])).values()]
}

export async function queryAuthorizedCommands(query: string, signal: AbortSignal): Promise<AuthorizedCommandSnapshot> {
  await apiRequest('/api/v1/auth/me', { signal })
  const [featuresSettled, teamsSettled] = await Promise.allSettled([
    apiRequest<FeatureRegistry>('/api/v1/features', { signal }),
    boundedPages<Team>('/api/v1/teams', signal, 1),
  ])
  if (signal.aborted) throw new DOMException('Superseded command search', 'AbortError')

  const errors: CommandSourceError[] = []
  const truncatedSources: string[] = []
  const operationsEnabled = featuresSettled.status === 'fulfilled'
    && featuresSettled.value.features.some(feature => feature.key === 'WORKMESH_BETA_OPERATIONS_UI' && feature.enabled)
  if (featuresSettled.status === 'rejected') errors.push({ source: 'features', message: errorMessage(featuresSettled.reason), state: errorState(featuresSettled.reason) })

  const allTeams = teamsSettled.status === 'fulfilled' ? teamsSettled.value.items : []
  if (teamsSettled.status === 'rejected') errors.push({ source: 'teams', message: errorMessage(teamsSettled.reason), state: errorState(teamsSettled.reason) })
  const teams = allTeams.slice(0, maxTeams)
  if (allTeams.length > maxTeams || (teamsSettled.status === 'fulfilled' && teamsSettled.value.truncated)) truncatedSources.push('teams')

  const normalizedQuery = query.trim()
  if (normalizedQuery.length < minimumResourceQueryLength) {
    return { commands: [], errors, operationsEnabled, sourceStatuses: [], truncatedSources: [...new Set(truncatedSources)] }
  }
  const workItemRequests = teams.map(team => {
    const params = new URLSearchParams({ teamId: team.id })
    if (normalizedQuery) params.set('search', normalizedQuery)
    return boundedPages<WorkItem>(`/api/v1/work-items?${params.toString()}`, signal, 1)
  })
  const workItems = Promise.all(workItemRequests).then(results => ({
    items: results.flatMap(result => result.items),
    truncated: results.some(result => result.truncated),
  }))
  const sessionRequests = teams.map(team => {
    const params = new URLSearchParams({ teamId: team.id })
    return boundedPages<AgentSession>(`/api/v1/agent-sessions?${params.toString()}`, signal)
  })
  const sessionsForTeams = Promise.all(sessionRequests).then(results => ({
    items: results.flatMap(result => result.items),
    truncated: results.some(result => result.truncated),
  }))

  const sources = await Promise.all([
    settledSource('projects', boundedPages<Project>('/api/v1/projects', signal)),
    settledSource('work-items', workItems),
    settledSource('agents', boundedPages<Agent>('/api/v1/agents', signal)),
    settledSource('sessions', sessionsForTeams),
    settledSource('inbox', boundedPages<InboxItem>('/api/v1/inbox?status=open', signal)),
  ])
  if (signal.aborted) throw new DOMException('Superseded command search', 'AbortError')

  const sourceStatuses: CommandSourceStatus[] = []
  for (const source of sources) {
    if (source.error) errors.push(source.error)
    if (source.result?.truncated) truncatedSources.push(source.source)
    sourceStatuses.push({
      source: source.source as CommandSourceStatus['source'],
      state: source.error?.state
        ?? (source.result?.truncated ? 'truncated' : source.result?.items.length === 0 ? 'empty' : 'ready'),
    })
  }
  const projects = sources[0]?.result?.items as Project[] | undefined
  const items = sources[1]?.result?.items as WorkItem[] | undefined
  const agents = sources[2]?.result?.items as Agent[] | undefined
  const sessions = sources[3]?.result?.items as AgentSession[] | undefined
  const inbox = sources[4]?.result?.items as InboxItem[] | undefined
  const agentTitles = new Map((agents ?? []).map(agent => [agent.id, agent.name ?? agent.display_name ?? agent.slug]))
  const commands = uniqueCommands([
    ...(projects ?? []).map(projectCommand),
    ...(items ?? []).map(workItemCommand),
    ...(agents ?? []).map(agentCommand),
    ...(sessions ?? []).map(session => sessionCommand(session, agentTitles.get(session.agent_id))),
    ...(inbox ?? []).map(inboxCommand),
  ])
  return { commands, errors, operationsEnabled, sourceStatuses, truncatedSources: [...new Set(truncatedSources)] }
}
