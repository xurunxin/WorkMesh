// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../app/lib/api'
import type { WorkItemDto } from './contracts'

const queryState = vi.hoisted(() => ({
  collection: {
    error: null as Error | null,
    initialized: true,
    items: [] as WorkItemDto[],
    loadMore: vi.fn(async (): Promise<void> => undefined),
    loading: false,
    loadingMore: false,
    nextCursor: 'cursor-2' as string | null,
    refresh: vi.fn(async (): Promise<void> => undefined),
  },
}))
const surfaceProjectionProbe = vi.hoisted(() => ({
  cardRenders: new Map<string, number>(),
  calls: [] as Array<{ items: unknown[]; layout: 'board' | 'list' }>,
}))

vi.mock('@workmesh/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@workmesh/ui')>()
  const { memo } = await import('react')
  const ActualWorkItemAdaptiveCollection = actual.WorkItemAdaptiveCollection
  const CardRenderProbe = memo(function CardRenderProbe(props: {
    item: Parameters<typeof ActualWorkItemAdaptiveCollection>[0]['items'][number]
    onMove: Parameters<typeof ActualWorkItemAdaptiveCollection>[0]['onMove']
    onOpen: Parameters<typeof ActualWorkItemAdaptiveCollection>[0]['onOpen']
    onOpenProject: Parameters<typeof ActualWorkItemAdaptiveCollection>[0]['onOpenProject']
  }) {
    surfaceProjectionProbe.cardRenders.set(props.item.id, (surfaceProjectionProbe.cardRenders.get(props.item.id) ?? 0) + 1)
    return null
  })
  return {
    ...actual,
    WorkItemAdaptiveCollection: (props: Parameters<typeof ActualWorkItemAdaptiveCollection>[0]) => {
      surfaceProjectionProbe.calls.push({ items: props.items, layout: props.layout })
      return <><ActualWorkItemAdaptiveCollection {...props} />{props.items.map(item => <CardRenderProbe item={item} key={item.id} onMove={props.onMove} onOpen={props.onOpen} onOpenProject={props.onOpenProject} />)}</>
    },
  }
})

vi.mock('./query', async importOriginal => {
  const original = await importOriginal<typeof import('./query')>()
  return { ...original, useWorkSurfaceQuery: () => queryState.collection }
})

vi.mock('./saved-views', () => ({
  createSavedViewController: () => ({
    create: vi.fn(),
    list: vi.fn(async () => []),
  }),
}))

vi.mock('../../app/lib/realtime', () => ({ useRealtimeSubscription: vi.fn() }))

import { WorkSurfaces } from './work-surfaces'

class TestIntersectionObserver implements IntersectionObserver {
  static instances: TestIntersectionObserver[] = []

  readonly root = null
  readonly rootMargin: string
  readonly thresholds = [0]
  private readonly callback: IntersectionObserverCallback
  private target: Element | null = null

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.rootMargin = options?.rootMargin ?? '0px'
    TestIntersectionObserver.instances.push(this)
  }

  disconnect(): void {
    this.target = null
  }

  observe(target: Element): void {
    this.target = target
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  unobserve(target: Element): void {
    if (this.target === target) this.target = null
  }

  intersect(): void {
    if (!this.target) throw new Error('No pagination sentinel is being observed.')
    const entry = { isIntersecting: true, target: this.target } as IntersectionObserverEntry
    this.callback([entry], this)
  }
}

describe('WorkSurfaces pagination ownership', () => {
  beforeEach(() => {
    queryState.collection.error = null
    queryState.collection.initialized = true
    queryState.collection.items = [{ id: 'work-1', revision: 1, status_category: 'backlog', status_id: 'backlog', status_name: 'Backlog', title: 'Recover pagination' }]
    queryState.collection.loading = false
    queryState.collection.loadingMore = false
    queryState.collection.nextCursor = 'cursor-2'
    queryState.collection.loadMore.mockClear()
    queryState.collection.refresh.mockClear()
    surfaceProjectionProbe.cardRenders.clear()
    surfaceProjectionProbe.calls = []
    TestIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps one explicit pagination owner and no WorkSurface observer contract', () => {
    const source = readFileSync(resolve(process.cwd(), 'features/work-items/work-surfaces.tsx'), 'utf8')
    const collectionStart = source.indexOf('<WorkItemAdaptiveCollection')
    const collectionEnd = source.indexOf('/>', collectionStart)
    const collectionCall = source.slice(collectionStart, collectionEnd + 2)

    expect(collectionStart).toBeGreaterThan(-1)
    expect(collectionEnd).toBeGreaterThan(collectionStart)
    expect(collectionCall).not.toContain('onLoadMore')
    expect(source.match(/new IntersectionObserver/g) ?? []).toHaveLength(0)
    expect(source).not.toContain("rootMargin: '320px 0px'")
    expect(source.match(/<WorkSurfacePagination/g)).toHaveLength(1)
  })

  it('does not install an observer or load another page while pagination is loading', () => {
    queryState.collection.loadingMore = true

    const { container, rerender } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="board" scope="my-work" />)

    expect(TestIntersectionObserver.instances).toHaveLength(0)
    expect(queryState.collection.loadMore).not.toHaveBeenCalled()
    expect(container.querySelector<HTMLButtonElement>('.wm-work-surface-pagination')).toBeDisabled()

    queryState.collection.loadingMore = false
    queryState.collection.nextCursor = null
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="board" scope="my-work" />)
    expect(container.querySelector('.wm-work-surface-pagination')).toBeNull()
  })

  it('ignores viewport intersections and loads exactly once for one explicit activation', () => {
    const { container } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="board" scope="my-work" />)

    for (const observer of TestIntersectionObserver.instances) act(() => observer.intersect())
    expect(queryState.collection.loadMore).not.toHaveBeenCalled()
    const explicitLoad = container.querySelector<HTMLButtonElement>('.wm-work-surface-pagination')
    expect(explicitLoad).not.toBeNull()
    fireEvent.click(explicitLoad!)

    expect(queryState.collection.loadMore).toHaveBeenCalledTimes(1)
  })

  it('does not retain the removed per-column sentinel stylesheet contract', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles.css'), 'utf8')
    expect(css).not.toContain('.wm-work-item-column-sentinel')
  })

  it('reuses one normalized item projection for layout-only changes', async () => {
    queryState.collection.items = [
      { id: 'work-1', revision: 1, status_category: 'backlog', status_id: 'backlog', status_name: 'Backlog', title: 'First Issue' },
      { id: 'work-2', revision: 1, status_category: 'backlog', status_id: 'backlog', status_name: 'Backlog', title: 'Second Issue' },
    ]
    queryState.collection.nextCursor = null
    const { container } = render(<WorkSurfaces
      authorityKey="test-authority"
      initialLayout="list"
      scope="my-work"
      statuses={[{ id: 'backlog', name: 'Backlog', category: 'backlog' }]}
    />)
    const listItems = surfaceProjectionProbe.calls.filter(call => call.layout === 'list').at(-1)?.items
    expect(listItems).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /^Board$/ }))
    await screen.findByTestId('board')
    expect(container.querySelectorAll('[data-work-item-id]')).toHaveLength(2)
    const boardItems = surfaceProjectionProbe.calls.filter(call => call.layout === 'board').at(-1)?.items
    expect(boardItems).toBe(listItems)

    fireEvent.click(screen.getByRole('button', { name: /^List$/ }))
    const restoredListItems = surfaceProjectionProbe.calls.filter(call => call.layout === 'list').at(-1)?.items
    expect(restoredListItems).toBe(listItems)
  })

  it('keeps all 300 card renders stable when a layout callback rerenders the parent with new inline handlers', async () => {
    queryState.collection.items = Array.from({ length: 300 }, (_, offset) => {
      const ordinal = offset + 1
      const status = ['backlog', 'ready', 'started', 'review', 'done'][offset % 5]!
      return { id: `work-${ordinal}`, revision: 1, status_category: status, status_id: status, status_name: status, title: `Issue ${ordinal}` }
    })
    queryState.collection.nextCursor = null

    function InlineCallbackParent() {
      const [layout, setLayout] = useState<'board' | 'list'>('list')
      const [callbackVersion, setCallbackVersion] = useState(0)
      return <WorkSurfaces
        authorityKey="test-authority"
        initialLayout={layout}
        onError={() => { void callbackVersion }}
        onLayoutChange={next => { setLayout(next); setCallbackVersion(version => version + 1) }}
        onOpenItem={() => { void callbackVersion }}
        onOpenProject={() => { void callbackVersion }}
        scope="my-work"
        statuses={[
          { id: 'backlog', name: 'Backlog', category: 'backlog' },
          { id: 'ready', name: 'Ready', category: 'planned' },
          { id: 'started', name: 'In Progress', category: 'started' },
          { id: 'review', name: 'Review', category: 'started' },
          { id: 'done', name: 'Done', category: 'completed' },
        ]}
      />
    }

    render(<InlineCallbackParent />)
    expect(surfaceProjectionProbe.cardRenders.size).toBe(300)
    expect(new Set(surfaceProjectionProbe.cardRenders.values())).toEqual(new Set([1]))

    fireEvent.click(screen.getByRole('button', { name: /^Board$/ }))
    await screen.findByTestId('board')
    expect(new Set(surfaceProjectionProbe.cardRenders.values())).toEqual(new Set([1]))

    fireEvent.click(screen.getByRole('button', { name: /^List$/ }))
    await screen.findByTestId('work-list')
    expect(new Set(surfaceProjectionProbe.cardRenders.values())).toEqual(new Set([1]))
  }, 15_000)

  it('renders a single loading skeleton instead of a false empty state before initialization', () => {
    queryState.collection.initialized = false
    queryState.collection.items = []
    queryState.collection.loading = true
    queryState.collection.nextCursor = null

    const { container } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)

    expect(screen.getByRole('status', { name: 'Loading Work Items' })).toBeVisible()
    expect(screen.queryByText('No Work Items')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.skeleton-list-cell')).toHaveLength(6)
  })

  it('preserves a resolved row and its focus through refresh and refresh failure', () => {
    const { rerender } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    const title = document.querySelector<HTMLElement>('[data-work-item-id="work-1"] .wm-work-item-title')
    expect(title).not.toBeNull()
    title?.focus()
    expect(document.activeElement).toBe(title)

    queryState.collection.loading = true
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(screen.getByText('Recover pagination')).toBeVisible()
    expect(document.activeElement).toBe(title)

    queryState.collection.loading = false
    queryState.collection.error = new TypeError('network refresh failed')
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(screen.getByText('Recover pagination')).toBeVisible()
    expect(document.querySelector('[data-work-item-id="work-1"] .wm-work-item-title')).toBe(title)
    expect(document.activeElement).toBe(title)
  })

  it('retains authorized rows for a conflict but revokes them for a forbidden refresh', () => {
    const { rerender } = render(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)

    queryState.collection.error = new ApiError(409, 'conflict')
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(screen.getByText('Recover pagination')).toBeVisible()
    expect(document.querySelector('.wm-work-surface-pagination')).toBeVisible()

    queryState.collection.error = new ApiError(403, 'forbidden')
    rerender(<WorkSurfaces authorityKey="test-authority" initialLayout="list" scope="my-work" />)
    expect(screen.queryByText('Recover pagination')).not.toBeInTheDocument()
    expect(document.querySelector('.wm-work-surface-pagination')).toBeNull()
    expect(screen.getByText('Issues are unavailable')).toBeVisible()
  })
})
