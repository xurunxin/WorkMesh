export type HomeScope = 'my-work' | 'active' | 'backlog' | 'inbox' | 'recovery' | 'projects' | 'guidance'

const homeScopes = new Set<HomeScope>([
  'my-work',
  'active',
  'backlog',
  'inbox',
  'recovery',
  'projects',
  'guidance',
])

export function homeScopeHref(scope: HomeScope): string {
  return `/?view=${scope}`
}

export function parseHomeScope(search: string): HomeScope {
  const value = new URLSearchParams(search).get('view')
  return value && homeScopes.has(value as HomeScope) ? value as HomeScope : 'my-work'
}
