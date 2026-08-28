// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from './lib/i18n'
import { ProjectWorkspace } from './project-workspace'

vi.mock('./lib/pagination', () => ({
  LoadMoreButton: () => null,
  usePagedApiList: () => ({
    error: null,
    initialized: true,
    items: [],
    loading: false,
    refresh: vi.fn(async () => undefined),
  }),
}))
vi.mock('./lib/realtime', () => ({ useRealtimeSubscription: () => undefined }))
vi.mock('./project-control-center', () => ({
  projectControlCenterFeatureEnabled: () => true,
  ProjectControlCenter: () => <div data-testid="project-control-center" />,
}))
vi.mock('./project-delivery', () => ({ ProjectDelivery: () => null }))

afterEach(cleanup)

const project = {
  id: 'project-1',
  name: 'Runtime Reliability',
  summary: 'Short summary',
  description: '# Full project brief\n\nThis content belongs to Overview only.',
  status: 'in_progress',
  target_date: null,
}

describe('ProjectWorkspace work views', () => {
  it('keeps the full project brief out of List while retaining compact context and navigation', () => {
    const onTabChange = vi.fn()
    render(<LocaleProvider><ProjectWorkspace
      items={[]}
      onTabChange={onTabChange}
      project={project}
      tab="list"
      workSurface={<div data-testid="work-surface">Work surface content</div>}
    /></LocaleProvider>)

    expect(screen.getByRole('heading', { name: project.name })).toBeVisible()
    expect(screen.queryByText('Full project brief')).toBeNull()
    expect(screen.queryByText('This content belongs to Overview only.')).toBeNull()
    expect(screen.queryByLabelText('项目工作汇总')).toBeNull()
    expect(screen.queryByRole('region', { name: '里程碑路线图' })).toBeNull()
    expect(screen.getByTestId('work-surface')).toBeVisible()
    expect(screen.getByTestId('project-tab-list')).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByTestId('project-tab-board'))
    expect(onTabChange).toHaveBeenCalledWith('board')
  })

  it('delegates Overview to the project control center without mixing in a work surface', () => {
    render(<LocaleProvider><ProjectWorkspace
      items={[]}
      onTabChange={vi.fn()}
      project={project}
      tab="overview"
      workSurface={<div data-testid="work-surface">Work surface content</div>}
    /></LocaleProvider>)

    expect(screen.getByTestId('project-control-center')).toBeVisible()
    expect(screen.queryByTestId('work-surface')).toBeNull()
    expect(screen.queryByText('This content belongs to Overview only.')).toBeNull()
  })
})
