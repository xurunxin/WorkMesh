export type ShortcutScope = 'authenticated-workspace' | 'disabled'

const authenticatedWorkspaceRoutes: readonly RegExp[] = [
  /^\/$/,
  /^\/agents(?:\/[^/]+)?\/?$/,
  /^\/agent-sessions\/[^/]+\/?$/,
  /^\/settings\/?$/,
  /^\/operations\/?$/,
]

export function shortcutScope(pathname: string | null | undefined): ShortcutScope {
  if (!pathname || !pathname.startsWith('/')) return 'disabled'
  return authenticatedWorkspaceRoutes.some(pattern => pattern.test(pathname))
    ? 'authenticated-workspace'
    : 'disabled'
}

export function isAuthenticatedWorkspacePath(pathname: string | null | undefined): boolean {
  return shortcutScope(pathname) === 'authenticated-workspace'
}
