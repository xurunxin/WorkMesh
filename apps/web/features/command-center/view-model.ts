import type { Command, CommandCenterState, CommandGroupView, CommandSourceError, CommandSourceStatus } from './contracts'
import { groupCommands, rankCommands } from './registry'

export type CommandCenterViewModel = Readonly<{
  state: CommandCenterState
  groups: readonly CommandGroupView[]
  actionable: readonly Command[]
  statusMessage: string
  sourceNotices: readonly Readonly<{ source: CommandSourceStatus['source']; state: CommandSourceStatus['state'] | 'loading'; message: string }>[]
}>

const sourceLabels: Record<CommandSourceStatus['source'], string> = {
  projects: 'Projects',
  'work-items': 'Work items',
  agents: 'Agents',
  sessions: 'Agent sessions',
  inbox: 'Inbox',
}
const resourceSources = Object.keys(sourceLabels) as CommandSourceStatus['source'][]

function sourceNotices(input: Readonly<{
  loading: boolean
  query: string
  sourceStatuses: readonly CommandSourceStatus[]
}>): CommandCenterViewModel['sourceNotices'] {
  if (input.query.trim().length < 1) return []
  if (input.loading) return resourceSources.map(source => ({ source, state: 'loading', message: `${sourceLabels[source]} loading.` }))
  return input.sourceStatuses.flatMap(status => status.state === 'ready' ? [] : [{
    source: status.source,
    state: status.state,
    message: status.state === 'empty'
      ? `${sourceLabels[status.source]} has no matching results.`
      : status.state === 'truncated'
        ? `${sourceLabels[status.source]} has more matching results.`
        : status.state === 'forbidden'
          ? `${sourceLabels[status.source]} is unavailable for this actor.`
          : `${sourceLabels[status.source]} is temporarily unavailable.`,
  }])
}

export function commandCenterViewModel(input: Readonly<{
  commands: readonly Command[]
  errors: readonly CommandSourceError[]
  loading: boolean
  offline: boolean
  stale: boolean
  sourceStatuses: readonly CommandSourceStatus[]
  truncatedSources: readonly string[]
  query: string
}>): CommandCenterViewModel {
  const ranked = rankCommands(input.commands, input.query)
  const notices = sourceNotices(input)
  if (input.offline) {
    const navigation = ranked.filter(command => command.source === 'static' && command.kind === 'navigation')
    return { state: 'offline', groups: groupCommands(navigation), actionable: navigation, statusMessage: 'Offline. Resource results are unavailable until a fresh connection succeeds.', sourceNotices: [] }
  }
  if (input.stale) {
    const navigation = ranked.filter(command => command.source === 'static' && command.kind === 'navigation')
    return { state: 'stale', groups: groupCommands(navigation), actionable: navigation, statusMessage: 'Refreshing authority-aware results…', sourceNotices: [] }
  }
  if (input.query.trim().length < 1)
    return { state: 'ready', groups: groupCommands(ranked), actionable: ranked, statusMessage: 'Type at least one character to search authorized resources.', sourceNotices: [] }
  if (input.loading && ranked.length === 0)
    return { state: 'loading', groups: [], actionable: [], statusMessage: 'Searching currently authorized WorkMesh resources…', sourceNotices: notices }
  if (input.errors.length > 0 && ranked.every(command => command.source === 'static'))
    return { state: 'error', groups: groupCommands(ranked), actionable: ranked, statusMessage: 'Resource search is unavailable. Navigation remains available.', sourceNotices: notices }
  const partial = input.errors.length > 0 || input.truncatedSources.length > 0
  if (partial && ranked.length === 0)
    return { state: 'partial', groups: [], actionable: [], statusMessage: 'Partial results. Some sources are unavailable or have more matches.', sourceNotices: notices }
  if (ranked.length === 0)
    return { state: 'empty', groups: [], actionable: [], statusMessage: 'No currently authorized result matches this search.', sourceNotices: notices }
  return {
    state: partial ? 'partial' : 'ready',
    groups: groupCommands(ranked),
    actionable: ranked,
    statusMessage: partial
      ? 'Partial results. Some sources are unavailable or have more matches.'
      : `${ranked.length} result${ranked.length === 1 ? '' : 's'} available.`,
    sourceNotices: notices,
  }
}
