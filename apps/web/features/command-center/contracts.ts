export type CommandGroup =
  | 'recent'
  | 'navigation'
  | 'create'
  | 'projects'
  | 'work-items'
  | 'agents'
  | 'sessions'
  | 'inbox'

export type CommandKind =
  | 'navigation'
  | 'create'
  | 'project'
  | 'work-item'
  | 'agent'
  | 'session'
  | 'inbox'

export type Command = Readonly<{
  id: string
  kind: CommandKind
  group: CommandGroup
  title: string
  subtitle?: string
  keywords: readonly string[]
  href: string
  resourceId?: string
  source: 'static' | 'projects' | 'work-items' | 'agents' | 'sessions' | 'inbox'
}>

export type RecentCommandRef = Readonly<{
  id: string
  kind: CommandKind
  lastUsedAt: string
}>

export type CommandSourceError = Readonly<{
  source: Exclude<Command['source'], 'static'> | 'identity' | 'features' | 'teams'
  message: string
  state: 'forbidden' | 'error'
}>

export type CommandSourceStatus = Readonly<{
  source: Exclude<Command['source'], 'static'>
  state: 'ready' | 'empty' | 'forbidden' | 'error' | 'truncated'
}>

export type AuthorizedCommandSnapshot = Readonly<{
  commands: readonly Command[]
  errors: readonly CommandSourceError[]
  operationsEnabled: boolean
  sourceStatuses: readonly CommandSourceStatus[]
  truncatedSources: readonly string[]
}>

export type CommandCenterState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial'
  | 'empty'
  | 'error'
  | 'offline'
  | 'stale'

export type CommandGroupView = Readonly<{
  id: CommandGroup
  label: string
  commands: readonly Command[]
}>
