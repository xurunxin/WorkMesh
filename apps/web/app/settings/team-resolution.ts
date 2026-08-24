export type TeamResolution<T extends { id: string }> =
  | Readonly<{
      status: 'resolved'
      selectedTeam: T
      workflowStatesPath: string
    }>
  | Readonly<{
      status: 'pending' | 'unavailable' | 'blocked' | 'empty'
      selectedTeam: null
      workflowStatesPath: null
    }>

type TeamResolutionInput<T extends { id: string }> = Readonly<{
  initialized: boolean
  items: readonly T[]
  requestedTeamId: string | null
  loading: boolean
  loadingMore: boolean
  error: Error | null
  nextCursor: string | null
}>

const unresolved = <T extends { id: string }>(
  status: Exclude<TeamResolution<T>['status'], 'resolved'>,
): TeamResolution<T> => ({ status, selectedTeam: null, workflowStatesPath: null })

export function resolveTeamSelection<T extends { id: string }>(
  input: TeamResolutionInput<T>,
): TeamResolution<T> {
  if (!input.initialized) return unresolved(input.error ? 'blocked' : 'pending')
  if (isCollectionAuthorityRevoked(input.error)) return unresolved('blocked')

  const selectedTeam = input.requestedTeamId
    ? input.items.find(team => team.id === input.requestedTeamId) ?? null
    : input.items[0] ?? null

  if (selectedTeam) {
    return {
      status: 'resolved',
      selectedTeam,
      workflowStatesPath: `/api/v1/teams/${encodeURIComponent(selectedTeam.id)}/states`,
    }
  }
  if (input.nextCursor) return unresolved(input.error ? 'blocked' : 'pending')
  return unresolved(input.items.length === 0 ? 'empty' : 'unavailable')
}
import { isCollectionAuthorityRevoked } from '../lib/collection-authority'
