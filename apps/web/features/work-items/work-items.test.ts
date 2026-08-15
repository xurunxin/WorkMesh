import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../app/lib/api'
import { appendWorkSurfacePage, normalizeWorkSurfacePage, serializeWorkSurfaceQuery, workSurfaceQueryForScope, workSurfaceScopeForQuery } from './query'
import { buildMoveRequest, createWorkItemMoveCommandAdapter, recoverMoveNetworkFailure } from './move-command'
import { createSavedViewController, sanitizeSavedViewPreference } from './saved-views'
import { toWorkSurfaceItem, workSurfaceErrorState } from './view-model'
import { requestWorkSurfaceLayout } from './work-surfaces'

describe('Work Surface query boundary', () => {
  it('serializes visible filters with the canonical Human key and leaves cursor ownership to the paginator', () => {
    expect(serializeWorkSurfaceQuery({ teamId: 'team-1', search: 'WM-7', ownerId: 'human-1', priority: 'high', mine: true }))
      .toBe('?teamId=team-1&search=WM-7&priority=high&responsibleHumanActorId=human-1&mine=true')
  })

  it('applies scope semantics without changing layout or issuing a second query', () => {
    expect(workSurfaceQueryForScope('active', { teamId: 'team-1', mine: true })).toEqual({ teamId: 'team-1', statusCategory: 'started' })
    expect(workSurfaceQueryForScope('project-work-items', {}, 'project-1')).toEqual({ projectId: 'project-1' })
    expect(workSurfaceQueryForScope('project-work-items', { statusCategory: 'backlog' }, 'project-1')).toEqual({ projectId: 'project-1', statusCategory: 'backlog' })
    expect(workSurfaceScopeForQuery({ projectId: 'project-1' }, 'my-work')).toBe('project-work-items')
    expect(workSurfaceScopeForQuery({ mine: true }, 'active')).toBe('my-work')
  })

  it('passes the opaque server cursor through and appends by stable id', () => {
    expect(normalizeWorkSurfacePage({ items: [{ id: 'a' }], nextCursor: 'opaque.cursor' })).toEqual({ items: [{ id: 'a' }], nextCursor: 'opaque.cursor' })
    expect(appendWorkSurfacePage({ items: [{ id: 'a', value: 1 }], nextCursor: 'one' }, { items: [{ id: 'a', value: 2 }, { id: 'b', value: 3 }], nextCursor: null })).toEqual({ items: [{ id: 'a', value: 2 }, { id: 'b', value: 3 }], nextCursor: null })
  })
})

describe('Work Surface view model and mutation seams', () => {
  it('keeps the local layout update before notifying the parent adapter', () => {
    const calls: string[] = []
    requestWorkSurfaceLayout('board', layout => calls.push(`local:${layout}`), layout => calls.push(`parent:${layout}`))
    expect(calls).toEqual(['local:board', 'parent:board'])
  })
  it('maps unknown enum values safely and exposes structured authorization state', () => {
    const item = toWorkSurfaceItem({ id: '1', title: 'Unknown', revision: 3, status_id: 's', status_name: 'Custom', status_category: 'future', priority: 'critical' })
    expect(item.statusCategory).toBe('unknown')
    expect(item.priority).toBe('unknown')
    expect(workSurfaceErrorState(new ApiError(403, 'Denied'))).toBe('forbidden')
  })

  it('builds one revision/idempotency-aware command for all move input methods', () => {
    const request = buildMoveRequest({ workItemId: 'work-1', targetStatusId: 'started', currentRevision: 7, responsibleHumanActorId: 'human-1', source: 'keyboard' }, 'move-operation-1')
    expect(request.path).toBe('/api/v1/work-items/work-1')
    expect(new Headers(request.init.headers).get('Idempotency-Key')).toBe('move-operation-1')
    expect(new Headers(request.init.headers).get('If-Match')).toBe('"revision-7"')
    expect(request.init.body).toContain('"statusId":"started"')
  })

  it('rolls back and preserves conflict intent without blind retry', async () => {
    const request = vi.fn(async () => { throw new ApiError(409, 'revision conflict') })
    const rollback = vi.fn()
    const onConflict = vi.fn()
    const adapter = createWorkItemMoveCommandAdapter({ request, rollback, onConflict })
    const intent = { workItemId: 'work-1', targetStatusId: 'started', currentRevision: 7, responsibleHumanActorId: 'human-1', source: 'pointer' as const }
    await expect(adapter.move(intent)).rejects.toBeInstanceOf(ApiError)
    expect(rollback).toHaveBeenCalledWith(intent)
    expect(onConflict).toHaveBeenCalledOnce()
    await expect(adapter.replay(intent)).rejects.toThrow('eligible network intent')
  })

  it('waits for canonical convergence before reporting a successful move', async () => {
    const order: string[] = []
    const adapter = createWorkItemMoveCommandAdapter({
      request: async <T>() => { order.push('request'); return { id: 'work-1', title: 'Moved', revision: 8 } as T },
      onSuccess: async () => { order.push('refresh-start'); await Promise.resolve(); order.push('refresh-complete') },
    })
    await adapter.move({ workItemId: 'work-1', targetStatusId: 'done', currentRevision: 7, responsibleHumanActorId: 'human-1', source: 'keyboard' })
    order.push('resolved')
    expect(order).toEqual(['request', 'refresh-start', 'refresh-complete', 'resolved'])
  })

  it('rolls back a network move and replays only the exact eligible operation id', async () => {
    const operationIds: string[] = []
    const request = async <T>(_path: string, init: RequestInit): Promise<T> => {
      operationIds.push(new Headers(init.headers).get('Idempotency-Key') ?? '')
      if (operationIds.length === 1) throw new TypeError('network offline')
      return { id: 'work-1', title: 'Recovered', revision: 8 } as T
    }
    const rollback = vi.fn()
    const onOffline = vi.fn()
    const adapter = createWorkItemMoveCommandAdapter({ request, rollback, onOffline })
    const intent = { workItemId: 'work-1', targetStatusId: 'done', currentRevision: 7, responsibleHumanActorId: 'human-1', source: 'keyboard' as const }

    await expect(adapter.move(intent)).rejects.toThrow('network offline')
    expect(rollback).toHaveBeenCalledWith(intent)
    expect(onOffline).toHaveBeenCalledOnce()
    await expect(adapter.replay(intent)).resolves.toMatchObject({ item: { revision: 8 } })
    expect(operationIds).toHaveLength(2)
    expect(operationIds[1]).toBe(operationIds[0])
  })

  it('clears the stale mutation error before canonical Retry convergence', async () => {
    const order: string[] = []
    await recoverMoveNetworkFailure({
      clearActionError: () => order.push('clear-action-error'),
      refreshCanonicalCollection: async () => { order.push('refresh-start'); await Promise.resolve(); order.push('refresh-complete') },
    })
    expect(order).toEqual(['clear-action-error', 'refresh-start', 'refresh-complete'])
  })

})

describe('Saved View boundary', () => {
  it('persists only preferences and strips rows, cursors, authority and credentials', () => {
    expect(sanitizeSavedViewPreference({ id: 'view-1', name: 'Mine', team_id: 'team-1', layout: 'board', filters: { owner_id: 'human-1', items: [{ id: 'secret' }], csrfToken: 'secret' }, items: [{ id: 'secret' }], resultCursor: 'cursor' })).toEqual({ id: 'view-1', name: 'Mine', teamId: 'team-1', layout: 'board', filters: { responsibleHumanActorId: 'human-1' } })
  })

  it('merges the create response id into the saved preference', async () => {
    const controller = createSavedViewController({
      create: vi.fn().mockResolvedValue({ id: 'view-created', revision: 1 }),
    })

    await expect(controller.create({
      name: 'Focused board',
      teamId: 'team-1',
      layout: 'board',
      filters: { label: 'focus' },
    })).resolves.toEqual({
      id: 'view-created',
      name: 'Focused board',
      teamId: 'team-1',
      layout: 'board',
      filters: { label: 'focus' },
    })
  })
})
