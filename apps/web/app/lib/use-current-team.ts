'use client'
import { useEffect, useState } from 'react'
import { usePagedApiList } from './pagination'
import { actorAuthorityScopeKey, type AuthenticatedActor } from './actor'
import { isCollectionAuthorityRevoked } from './collection-authority'

export type Team = { id: string; name: string; key: string }

export type CurrentTeamAuthority = {
  error: Error | null
  initialized: boolean
  loading: boolean
  setTeamId: (id: string) => void
  teamId: string | null
  teams: Team[]
}

export function useCurrentTeam(actor: AuthenticatedActor | null): CurrentTeamAuthority {
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null, { scopeKey: actorAuthorityScopeKey(actor) })
  const initialized = Boolean(actor)
    && teamsPage.initialized
    && !isCollectionAuthorityRevoked(teamsPage.error)
  const teams = initialized ? teamsPage.items : []
  const [teamId, setTeamId] = useState<string | null>(null)
  useEffect(() => {
    if (!initialized) {
      setTeamId(null)
      return
    }
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [initialized, teams])
  const selectedTeamId = initialized
    ? (teams.some(team => team.id === teamId) ? teamId : teams[0]?.id ?? null)
    : null
  return {
    error: actor ? teamsPage.error : null,
    initialized,
    loading: Boolean(actor) && teamsPage.loading,
    setTeamId,
    teamId: selectedTeamId,
    teams,
  }
}
