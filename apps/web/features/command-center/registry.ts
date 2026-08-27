import { projectWorkspaceHref } from '../../app/lib/project-work'
import type { Command, CommandGroup, CommandGroupView, RecentCommandRef } from './contracts'

const groupOrder: readonly CommandGroup[] = [
  'recent',
  'navigation',
  'create',
  'projects',
  'work-items',
  'agents',
  'sessions',
  'inbox',
]

const groupLabels: Record<CommandGroup, string> = {
  recent: 'Recent',
  navigation: 'Go to',
  create: 'Create',
  projects: 'Projects',
  'work-items': 'Work items',
  agents: 'Agents',
  sessions: 'Agent sessions',
  inbox: 'Inbox',
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase()
const words = (value: string): string[] => normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

export function staticCommands(operationsEnabled: boolean): Command[] {
  const commands: Command[] = [
    navigation('navigate:inbox', 'Inbox', '/?view=inbox', ['requests', 'reviews', 'blockers']),
    navigation('navigate:issues', 'Issues', '/?view=my-work', ['assigned', 'responsible', 'work items']),
    navigation('navigate:active-work', 'Issues · Active', '/?view=my-work&statusCategory=started', ['in progress', 'started']),
    navigation('navigate:backlog', 'Issues · Backlog', '/?view=my-work&statusCategory=backlog', ['planned', 'queued']),
    navigation('navigate:projects', 'Projects', '/?view=projects', ['planning']),
    navigation('navigate:agents', 'Agents', '/agents', ['sessions', 'connections']),
    navigation('navigate:settings', 'Settings', '/settings', ['workspace', 'teams']),
    create('create:work-item', 'Create issue', '/?view=my-work&intent=create-work-item', ['new task', 'new issue']),
    create('create:project', 'Create project', '/?view=projects&intent=create-project', ['new project']),
  ]
  if (operationsEnabled)
    commands.splice(6, 0, navigation('navigate:operations', 'Planning & Operations', '/operations', ['automation', 'usage']))
  return commands
}

function navigation(id: string, title: string, href: string, keywords: string[]): Command {
  return { id, kind: 'navigation', group: 'navigation', title, href, keywords, source: 'static' }
}

function create(id: string, title: string, href: string, keywords: string[]): Command {
  return { id, kind: 'create', group: 'create', title, href, keywords, source: 'static' }
}

export function projectCommand(project: Readonly<{ id: string; name: string; summary?: string | null; status?: string }>): Command {
  return {
    id: `resource:project:${project.id}`,
    kind: 'project',
    group: 'projects',
    title: project.name,
    subtitle: [project.status, project.summary].filter(Boolean).join(' · ') || 'Project',
    keywords: [project.id, project.summary ?? '', project.status ?? ''],
    href: projectWorkspaceHref({ projectId: project.id }),
    resourceId: project.id,
    source: 'projects',
  }
}

export function workItemCommand(item: Readonly<{ id: string; title: string; number: number; team_key: string; project_id?: string | null; status_name?: string; priority?: string }>): Command {
  const href = item.project_id
    ? projectWorkspaceHref({ projectId: item.project_id, workItemId: item.id })
    : `/?workItem=${encodeURIComponent(item.id)}`
  return {
    id: `resource:work-item:${item.id}`,
    kind: 'work-item',
    group: 'work-items',
    title: item.title,
    subtitle: `${item.team_key}-${item.number}${item.status_name ? ` · ${item.status_name}` : ''}`,
    keywords: [item.id, `${item.team_key}-${item.number}`, item.status_name ?? '', item.priority ?? ''],
    href,
    resourceId: item.id,
    source: 'work-items',
  }
}

export function agentCommand(agent: Readonly<{ id: string; name?: string; display_name?: string; slug: string; description?: string | null; is_active?: boolean }>): Command {
  const title = agent.name ?? agent.display_name ?? agent.slug
  return {
    id: `resource:agent:${agent.id}`,
    kind: 'agent',
    group: 'agents',
    title,
    subtitle: `${agent.slug} · ${agent.is_active === false ? 'inactive' : 'active'}`,
    keywords: [agent.id, agent.slug, agent.description ?? ''],
    href: `/agents/${encodeURIComponent(agent.id)}`,
    resourceId: agent.id,
    source: 'agents',
  }
}

export function sessionCommand(session: Readonly<{ id: string; state: string; agent_id: string; work_item_id?: string | null }>, agentTitle?: string): Command {
  return {
    id: `resource:session:${session.id}`,
    kind: 'session',
    group: 'sessions',
    title: agentTitle ? `${agentTitle} session` : `Session ${session.id.slice(0, 8)}`,
    subtitle: `${session.state.replaceAll('_', ' ')} · ${session.id.slice(0, 8)}`,
    keywords: [session.id, session.state, session.agent_id, session.work_item_id ?? ''],
    href: `/agent-sessions/${encodeURIComponent(session.id)}`,
    resourceId: session.id,
    source: 'sessions',
  }
}

export function inboxCommand(item: Readonly<{ id: string; kind: string; source_type: string; source_id: string; requires_response: boolean; payload?: Record<string, unknown> }>): Command {
  const payloadTitle = ['title', 'summary', 'body'].map(key => item.payload?.[key]).find(value => typeof value === 'string')
  const title = typeof payloadTitle === 'string' && payloadTitle.trim()
    ? payloadTitle.trim()
    : item.kind.replaceAll('_', ' ')
  return {
    id: `resource:inbox:${item.id}`,
    kind: 'inbox',
    group: 'inbox',
    title,
    subtitle: `${item.kind.replaceAll('_', ' ')}${item.requires_response ? ' · response required' : ''}`,
    keywords: [item.id, item.kind, item.source_type, item.source_id],
    href: `/?view=inbox&queue=messages&inboxItem=${encodeURIComponent(item.id)}`,
    resourceId: item.id,
    source: 'inbox',
  }
}

function score(command: Command, query: string): number | null {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0
  const title = normalize(command.title)
  const identifiers = [command.id, command.resourceId ?? '', ...command.keywords].map(normalize)
  if (title === normalizedQuery || identifiers.includes(normalizedQuery)) return 0
  if (title.startsWith(normalizedQuery) || identifiers.some(value => value.startsWith(normalizedQuery))) return 1
  if (words(command.title).some(word => word.startsWith(normalizedQuery))) return 2
  if (title.includes(normalizedQuery) || identifiers.some(value => value.includes(normalizedQuery))) return 3
  if (normalize(command.subtitle ?? '').includes(normalizedQuery)) return 4
  return null
}

export function rankCommands(commands: readonly Command[], query: string): Command[] {
  return commands
    .map(command => ({ command, rank: score(command, query) }))
    .filter((entry): entry is { command: Command; rank: number } => entry.rank !== null)
    .sort((left, right) => left.rank - right.rank
      || groupOrder.indexOf(left.command.group) - groupOrder.indexOf(right.command.group)
      || normalize(left.command.title).localeCompare(normalize(right.command.title), 'en')
      || left.command.id.localeCompare(right.command.id, 'en'))
    .map(entry => entry.command)
}

export function intersectRecent(recent: readonly RecentCommandRef[], freshCommands: readonly Command[]): Command[] {
  const fresh = new Map(freshCommands.map(command => [command.id, command]))
  return [...recent]
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .map(reference => fresh.get(reference.id))
    .filter((command): command is Command => Boolean(command))
    .slice(0, 5)
    .map(command => ({ ...command, group: 'recent' }))
}

export function groupCommands(commands: readonly Command[]): CommandGroupView[] {
  return groupOrder.flatMap(group => {
    const items = commands.filter(command => command.group === group)
    return items.length ? [{ id: group, label: groupLabels[group], commands: items }] : []
  })
}
