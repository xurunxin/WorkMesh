'use client'
import { useEffect, useState } from 'react'
import { usePagedApiList } from './pagination'
import type { AuthenticatedActor } from './actor'

export type Team = { id: string; name: string; key: string }

export function useCurrentTeam(actor: AuthenticatedActor | null): { teamId: string | null; teams: Team[]; setTeamId: (id: string) => void; loading: boolean } {
  const teamsPage = usePagedApiList<Team>(actor ? '/api/v1/teams' : null)
  const teams = teamsPage.items
  const [teamId, setTeamId] = useState<string | null>(null)
  useEffect(() => {
    if (teamsPage.loading) return
    setTeamId(current => teams.some(team => team.id === current) ? current : teams[0]?.id ?? null)
  }, [teams, teamsPage.loading])
  return { teamId, setTeamId, teams, loading: teamsPage.loading }
}
