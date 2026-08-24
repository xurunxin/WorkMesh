// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../app/lib/api'
import type { PagedCollection } from '../../app/lib/pagination'
import type { WorkItemDto } from './contracts'

const queryMock = vi.hoisted(() => ({ useWorkSurfaceQuery: vi.fn() }))

vi.mock('./query', async importOriginal => {
  const original = await importOriginal<typeof import('./query')>()
  return { ...original, useWorkSurfaceQuery: queryMock.useWorkSurfaceQuery }
})

vi.mock('./saved-views', () => ({
  createSavedViewController: () => ({
    create: vi.fn(),
    list: vi.fn(async () => []),
  }),
}))

vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))

import { WorkSurfaces } from './work-surfaces'

const workItem = (id: string, title: string): WorkItemDto => ({
  id,
  revision: 1,
  status_category: 'backlog',
  status_id: 'backlog',
  status_name: 'Backlog',
  title,
})

const collection = (overrides: Partial<PagedCollection<WorkItemDto>> = {}): PagedCollection<WorkItemDto> => ({
  error: null,
  initialized: true,
  items: [],
  loadMore: vi.fn(async (): Promise<void> => undefined),
  loading: false,
  loadingMore: false,
  nextCursor: null,
  refresh: vi.fn(async (): Promise<void> => undefined),
  ...overrides,
})

let activeCollection: PagedCollection<WorkItemDto>

describe('WorkSurfaces authenticated collection loading', () => {
  beforeEach(() => {
    activeCollection = collection()
    queryMock.useWorkSurfaceQuery.mockReset()
    queryMock.useWorkSurfaceQuery.mockImplementation(() => activeCollection)
  })

  afterEach(() => cleanup())

  it('gives initial loading exactly one named busy owner and decorative cells', () => {
    activeCollection = collection({ initialized: false, loading: true })
    const { container } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="board" scope="my-work" statuses={[
      { category: 'backlog', id: 'backlog', name: 'Backlog' },
      { category: 'started', id: 'started', name: 'Started' },
      { category: 'completed', id: 'completed', name: 'Completed' },
    ]} />)

    const status = screen.getByRole('status', { name: 'Loading Work Items' })
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1)
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('[data-testid="work-surfaces"]')).not.toHaveAttribute('aria-busy')
    expect(container.querySelector('.work-surface-board-loading')).not.toBeNull()
    expect(container.querySelectorAll('.skeleton-list-cell')).toHaveLength(3)
    expect(container.querySelectorAll('.skeleton-list-cell[aria-hidden="true"]')).toHaveLength(3)
    expect(screen.queryByText('No Work Items')).toBeNull()
  })

  it('renders initial failure without a skeleton or false empty state', () => {
    activeCollection = collection({
      error: new TypeError('private initial network diagnostic'),
      initialized: false,
    })
    const { container } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)

    expect(screen.getByText('WorkMesh is offline')).toBeVisible()
    expect(screen.queryByRole('status', { name: 'Loading Work Items' })).toBeNull()
    expect(screen.queryByText('No Work Items')).toBeNull()
    expect(screen.queryByText('private initial network diagnostic')).toBeNull()
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(0)
  })

  it('renders a successful real empty response only after initialization', () => {
    activeCollection = collection({ initialized: true, items: [] })
    render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" surfaceCopy={{ ariaLabel: '工作面板' }} />)

    expect(screen.getByRole('region', { name: '工作面板' })).toBeVisible()
    expect(screen.getByText('No Work Items')).toBeVisible()
    expect(screen.queryByRole('status', { name: 'Loading Work Items' })).toBeNull()
  })

  it('retains exact row DOM and focus through refresh and ordinary failure, then revokes on 403', () => {
    activeCollection = collection({ items: [workItem('work-retained', 'Retained authority row')] })
    const { container, rerender } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    const surface = screen.getByTestId('work-surfaces')
    const title = container.querySelector<HTMLElement>('[data-work-item-id="work-retained"] .wm-work-item-title')
    expect(title).not.toBeNull()
    title?.focus()

    activeCollection.loading = true
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(surface).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector<HTMLElement>('[data-work-item-id="work-retained"] .wm-work-item-title')).toBe(title)
    expect(document.activeElement).toBe(title)

    activeCollection.loading = false
    activeCollection.error = new TypeError('private refresh diagnostic')
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(surface).not.toHaveAttribute('aria-busy')
    expect(container.querySelector<HTMLElement>('[data-work-item-id="work-retained"] .wm-work-item-title')).toBe(title)
    expect(document.activeElement).toBe(title)
    expect(screen.getByText('WorkMesh is offline')).toBeVisible()
    expect(screen.queryByText('private refresh diagnostic')).toBeNull()

    activeCollection.error = new ApiError(403, 'private forbidden diagnostic')
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(screen.queryByText('Retained authority row')).toBeNull()
    expect(screen.getByText('Issues are unavailable')).toBeVisible()
    expect(screen.queryByText('private forbidden diagnostic')).toBeNull()
  })

  it('revokes old rows synchronously for a new or null authority and ignores mutations to the old collection', () => {
    const oldCollection = collection({ items: [workItem('old-work', 'Old scoped row')] })
    activeCollection = oldCollection
    const { container, rerender } = render(<WorkSurfaces authorityKey="workspace-a:actor-a:admin" initialLayout="list" scope="my-work" teamId="team-old" />)
    expect(screen.getByText('Old scoped row')).toBeVisible()
    expect(queryMock.useWorkSurfaceQuery).toHaveBeenLastCalledWith(expect.any(Object), 'workspace-a:actor-a:admin')

    activeCollection = collection({ initialized: false, loading: true })
    rerender(<WorkSurfaces authorityKey="workspace-b:actor-b:member" initialLayout="list" scope="my-work" teamId="team-new" />)
    expect(screen.queryByText('Old scoped row')).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading Work Items' })).toBeVisible()
    expect(container.querySelectorAll('[aria-busy="true"]')).toHaveLength(1)
    expect(queryMock.useWorkSurfaceQuery).toHaveBeenLastCalledWith(expect.any(Object), 'workspace-b:actor-b:member')

    oldCollection.items = [workItem('late-work', 'Late old-scope row')]
    rerender(<WorkSurfaces authorityKey="workspace-b:actor-b:member" initialLayout="list" scope="my-work" teamId="team-new" />)
    expect(screen.queryByText('Late old-scope row')).toBeNull()

    activeCollection = collection({ initialized: false, loading: false })
    rerender(<WorkSurfaces authorityKey={null} initialLayout="list" scope="my-work" teamId={null} />)
    const status = screen.getByRole('status', { name: 'Loading Work Items' })
    expect(status).toBeVisible()
    expect(within(status).getAllByRole('presentation', { hidden: true })).toHaveLength(6)
    expect(screen.queryByText('No Work Items')).toBeNull()
  })
})
