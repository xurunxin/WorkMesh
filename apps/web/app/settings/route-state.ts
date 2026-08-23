export type SettingsTab = 'workspace' | 'operations'

export type SettingsRoute = Readonly<{
  tab: SettingsTab
  teamId: string | null
}>

type SettingsRouteWrite = Readonly<Partial<SettingsRoute>>

export function readSettingsRoute(search: string): SettingsRoute {
  const parameters = new URLSearchParams(search)
  const team = parameters.get('team')
  return {
    tab: parameters.get('tab') === 'operations' ? 'operations' : 'workspace',
    teamId: team ? team : null,
  }
}

export function writeSettingsRoute(url: URL, next: SettingsRouteWrite): URL {
  const result = new URL(url.href)
  if ('tab' in next) {
    if (next.tab === 'operations') result.searchParams.set('tab', 'operations')
    else result.searchParams.delete('tab')
  }
  if ('teamId' in next) {
    if (next.teamId === null) result.searchParams.delete('team')
    else if (next.teamId !== undefined) result.searchParams.set('team', next.teamId)
  }
  return result
}
