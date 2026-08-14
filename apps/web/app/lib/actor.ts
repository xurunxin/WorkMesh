export type AuthenticatedActor = {
  id: string
  display_name: string
  workspace_id?: string
  workspace_role: 'admin' | 'member'
}

export function actorDisplayName(actor: Pick<AuthenticatedActor, 'display_name'>): string {
  return actor.display_name
}
