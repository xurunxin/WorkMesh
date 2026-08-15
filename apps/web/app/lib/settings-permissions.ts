export type WorkspaceRole = 'admin' | 'member'

export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === 'admin'
}
