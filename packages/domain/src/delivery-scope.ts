export function allowedPath(path: string, scopes: string[]): boolean {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return false
  return scopes.some((scope) => {
    const prefix = scope.replaceAll('\\', '/').replace(/\/\*\*$/, '').replace(/\*$/, '')
    const directory = prefix.replace(/\/$/, '')
    return directory === '' || normalized === directory || normalized.startsWith(`${directory}/`)
  })
}

export function matchesBranchPattern(pattern: string, workItemKey: string, branch: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = escaped
    .replaceAll('\\{workItemKey\\}', workItemKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .replaceAll('\\{slug\\}', '[a-z0-9]+(?:-[a-z0-9]+)*')
  return new RegExp(`^${expression}$`).test(branch)
}

