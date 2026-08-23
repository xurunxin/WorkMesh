import { describe, expect, it } from 'vitest'
import { ApiError } from '../lib/api'
import { resolveTeamSelection } from './team-resolution'

type Team = Readonly<{ id: string; name: string }>

const runtime: Team = { id: 'team/runtime', name: 'Runtime' }
const platform: Team = { id: 'team-platform', name: 'Platform' }

const input = (overrides: Partial<Parameters<typeof resolveTeamSelection<Team>>[0]> = {}) => ({
  error: null,
  initialized: true,
  items: [runtime],
  loading: false,
  loadingMore: false,
  nextCursor: null,
  requestedTeamId: runtime.id,
  ...overrides,
})

describe('resolveTeamSelection', () => {
  it('resolves only a successfully loaded matching Team and encodes its workflow-state path', () => {
    expect(resolveTeamSelection(input())).toEqual({
      status: 'resolved',
      selectedTeam: runtime,
      workflowStatesPath: '/api/v1/teams/team%2Fruntime/states',
    })
  })

  it('keeps a requested Team pending until serial pagination finds it or exhausts successfully', () => {
    expect(resolveTeamSelection(input({ requestedTeamId: platform.id, nextCursor: 'page-2' }))).toEqual({
      status: 'pending', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({
      items: [runtime, platform],
      requestedTeamId: platform.id,
      nextCursor: null,
    }))).toEqual({
      status: 'resolved',
      selectedTeam: platform,
      workflowStatesPath: '/api/v1/teams/team-platform/states',
    })
    expect(resolveTeamSelection(input({ requestedTeamId: 'unknown', nextCursor: null }))).toEqual({
      status: 'unavailable', selectedTeam: null, workflowStatesPath: null,
    })
  })

  it('retains a matching initialized Team through refresh and ordinary errors, but revokes on 403', () => {
    expect(resolveTeamSelection(input({ loading: true }))).toEqual({
      status: 'resolved', selectedTeam: runtime, workflowStatesPath: '/api/v1/teams/team%2Fruntime/states',
    })
    expect(resolveTeamSelection(input({ loadingMore: true }))).toEqual({
      status: 'resolved', selectedTeam: runtime, workflowStatesPath: '/api/v1/teams/team%2Fruntime/states',
    })
    expect(resolveTeamSelection(input({ error: new TypeError('private diagnostic') }))).toEqual({
      status: 'resolved', selectedTeam: runtime, workflowStatesPath: '/api/v1/teams/team%2Fruntime/states',
    })
    expect(resolveTeamSelection(input({ error: new ApiError(403, 'forbidden') }))).toEqual({
      status: 'blocked', selectedTeam: null, workflowStatesPath: null,
    })
  })

  it('never interprets an unresolved or failed new Team scope as successfully empty', () => {
    expect(resolveTeamSelection(input({ initialized: false, items: [], loading: false, requestedTeamId: null }))).toEqual({
      status: 'pending', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({
      error: new TypeError('new scope failed'), initialized: false, items: [], requestedTeamId: null,
    }))).toEqual({
      status: 'blocked', selectedTeam: null, workflowStatesPath: null,
    })
  })

  it('retains exhausted empty and unavailable outcomes through same-scope refresh, but revokes them on 403', () => {
    expect(resolveTeamSelection(input({ items: [], loading: true, requestedTeamId: null }))).toEqual({
      status: 'empty', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({ error: new TypeError('empty refresh failed'), items: [], requestedTeamId: null }))).toEqual({
      status: 'empty', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({ error: new TypeError('unavailable refresh failed'), requestedTeamId: platform.id }))).toEqual({
      status: 'unavailable', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({ error: new ApiError(403, 'forbidden'), items: [], requestedTeamId: null }))).toEqual({
      status: 'blocked', selectedTeam: null, workflowStatesPath: null,
    })
  })

  it('chooses the first Team only after a successful first page and represents an empty result explicitly', () => {
    expect(resolveTeamSelection(input({ initialized: false, requestedTeamId: null, loading: true }))).toEqual({
      status: 'pending', selectedTeam: null, workflowStatesPath: null,
    })
    expect(resolveTeamSelection(input({ requestedTeamId: null, items: [platform, runtime] }))).toEqual({
      status: 'resolved',
      selectedTeam: platform,
      workflowStatesPath: '/api/v1/teams/team-platform/states',
    })
    expect(resolveTeamSelection(input({ requestedTeamId: null, items: [] }))).toEqual({
      status: 'empty', selectedTeam: null, workflowStatesPath: null,
    })
  })
})
