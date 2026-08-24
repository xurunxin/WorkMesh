export type AuthenticatedActor = {
  id: string
  display_name: string
  workspace_id?: string
  workspace_role: 'admin' | 'member'
}

export function actorDisplayName(actor: Pick<AuthenticatedActor, 'display_name'>): string {
  return actor.display_name
}

/** Non-secret authority identity for invalidating client projections without changing request URLs. */
export function actorAuthorityScopeKey(
  actor: Pick<AuthenticatedActor, 'id' | 'workspace_id' | 'workspace_role'>,
): string
export function actorAuthorityScopeKey(actor: null): null
export function actorAuthorityScopeKey(
  actor: Pick<AuthenticatedActor, 'id' | 'workspace_id' | 'workspace_role'> | null,
): string | null
export function actorAuthorityScopeKey(
  actor: Pick<AuthenticatedActor, 'id' | 'workspace_id' | 'workspace_role'> | null,
): string | null {
  return actor ? `${actor.workspace_id ?? ''}:${actor.id}:${actor.workspace_role}` : null
}
