export type SettingsRoute = Readonly<{
  teamId: string | null
}>

type SettingsRouteWrite = Readonly<Partial<SettingsRoute>>

export function readSettingsRoute(search: string): SettingsRoute {
  const parameters = new URLSearchParams(search)
  const team = parameters.get('team')
  return {
    teamId: team ? team : null,
  }
}

export function writeSettingsRoute(url: URL, next: SettingsRouteWrite): URL {
  const result = new URL(url.href)
  if ('teamId' in next) {
    if (next.teamId === null) result.searchParams.delete('team')
    else if (next.teamId !== undefined) result.searchParams.set('team', next.teamId)
  }
  return result
}

export function legacySettingsOperationsHref(url: URL): string | null {
  if (url.searchParams.get('tab') !== 'operations') return null
  const result = new URL(url.href)
  result.pathname = '/operations'
  result.searchParams.delete('tab')
  result.searchParams.delete('team')
  return `${result.pathname}${result.search}${result.hash}`
}
