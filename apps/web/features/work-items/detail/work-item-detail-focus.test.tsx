// @vitest-environment jsdom
import type { ReactElement } from 'react'
import { cleanup, fireEvent, render as testingRender, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../../app/lib/i18n'
import { WorkItemDetail, WorkItemDetailUnavailable } from './work-item-detail'
import { toWorkItemDetailModel } from './view-model'
import type { StructuredDetailError, WorkItemDetailDto, WorkItemDetailOptions } from './contracts'
import type { DraftIdentity } from '../../rich-content/editor'

// Testing Library's automatic cleanup only fires when the test environment is
// `jsdom` and the project has been initialized for it; in this monorepo the
// suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated. We also reset localStorage so a draft left over from
// a previous case cannot auto-restore and dirty the form on mount.
afterEach(() => { cleanup() })
beforeEach(() => { window.localStorage.clear(); window.history.replaceState({}, '', '/') })

const item: WorkItemDetailDto = {
  id: 'w1',
  title: 'Detail',
  description: null,
  number: 8,
  revision: 2,
  status_id: 's1',
  status_name: 'In Progress',
  status_category: 'started',
  team_id: 't1',
  team_key: 'GEN',
  priority: 'high',
  due_date: null,
  responsible_human_actor_id: 'h1',
  responsible_human: { actor_id: 'h1', display_name: 'Human' },
  active_assignment: null,
  active_executor: null,
  shared_reviewers: [],
  labels: ['coord:active'],
  project_id: 'p1',
  milestone_id: null,
  parent_id: null,
}

const options: WorkItemDetailOptions = {
  statuses: [{ id: 's1', label: 'In Progress' }],
  humans: [{ id: 'h1', label: 'Human' }],
  projects: [{ id: 'p1', label: 'Project' }],
  milestones: [],
  parents: [],
}

const draftIdentity: Omit<DraftIdentity, 'field' | 'baseRevision'> = {
  workspaceId: 'ws',
  teamId: 't1',
  actorId: 'h1',
  resourceType: 'work_item',
  resourceId: 'w1',
}

const conflict: StructuredDetailError = {
  httpStatus: 409,
  code: 'REVISION_CONFLICT',
  message: 'Revision changed',
  details: { currentRevision: 3 },
  correlationId: 'corr-1',
  safeNextAction: 'Load the latest revision.',
}

const noop = () => {}
const resolveSave = async () => {}
const render = (ui: ReactElement) => testingRender(ui, { wrapper: LocaleProvider })

describe('WorkItemDetail focus on revision conflict', () => {
  it('moves focus to the Save button when a revision conflict is reported', () => {
    // Render in the clean (no-conflict) state first so we can dirty the form
    // before the conflict arrives. A real conflict only happens after the
    // Human has tried to save unsaved changes, so the Save button is enabled
    // (i.e. focusable) at the moment the conflict surfaces.
    const { rerender } = render(
      <WorkItemDetail
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )
    fireEvent.click(screen.getByRole('tab', { name: /^Details$/ }))
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'Changed title' } })

    rerender(
      <WorkItemDetail
        conflict={conflict}
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /^Details$/ }))
    const saveButton = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
    // The implementation calls `saveRef.current?.focus()` inside a useEffect
    // keyed on `hasConflict`; under jsdom the call lands synchronously inside
    // the render commit, so `document.activeElement` already points at the
    // Save button by the time the rerender resolves. The assertion goes
    // through the public DOM API (per the brief) rather than the ref.
    expect(document.activeElement).toBe(saveButton)
  })

  it('does not move focus to the Save button while no conflict is reported', () => {
    render(
      <WorkItemDetail
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /^Details$/ }))
    const saveButton = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
    // The full-page shell still receives focus on mount (existing behaviour),
    // so we only need to assert that focus is NOT sitting on the Save button.
    expect(document.activeElement).not.toBe(saveButton)
  })
})

describe('WorkItemDetail full-page heading ownership', () => {
  it('shows the reason beside an unavailable Human assignment action', () => {
    render(
      <WorkItemDetail
        agentAction={{ disabled: true, label: 'Choose an Agent', onClick: noop, reason: 'No eligible Agent has both required capabilities.' }}
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    const button = screen.getByRole('button', { name: 'Choose an Agent' })
    const hint = screen.getByText('No eligible Agent has both required capabilities.')
    expect(button).toBeDisabled()
    expect(hint).toBeVisible()
    expect(hint).not.toHaveClass('wm-visually-hidden')
    expect(button).toHaveAttribute('aria-describedby', hint.id)
  })

  it('owns exactly one h1 named for the active Issue without changing the visible key toolbar', () => {
    render(
      <WorkItemDetail
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    const detail = screen.getByTestId('work-item-detail')
    const surface = detail.closest('.work-item-full-page')
    expect(surface).not.toBeNull()
    const headings = surface?.querySelectorAll('h1') ?? []
    expect(headings).toHaveLength(1)
    const heading = headings[0]
    expect(heading).toHaveTextContent('Detail')
    expect(heading).toHaveClass('wm-visually-hidden')
    expect(surface).toHaveAttribute('aria-labelledby', heading?.id)
    expect(detail.querySelector('.work-item-detail-toolbar strong')).toHaveTextContent('GEN-8')
  })

  it('keeps the quick-view Sheet free of a competing page h1', () => {
    render(
      <WorkItemDetail
        copy={undefined}
        draftIdentity={draftIdentity}
        mode="sheet"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    expect(screen.getByTestId('work-item-detail').querySelectorAll('h1')).toHaveLength(0)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('GEN-8')
  })

  it('gives the unavailable full-page surface its own requested-Issue h1', () => {
    render(
      <WorkItemDetailUnavailable
        copy={undefined}
        error={conflict}
        mode="full_page"
        onClose={noop}
        onRetry={noop}
        requestedKey="GEN-404"
      />,
    )

    const surface = screen.getByTestId('work-item-detail-unavailable').closest('.work-item-full-page')
    expect(surface).not.toBeNull()
    const headings = surface?.querySelectorAll('h1') ?? []
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('GEN-404')
    expect(surface).toHaveAttribute('aria-labelledby', headings[0]?.id)
  })
})

describe('WorkItemDetail tab continuity', () => {
  it('keeps Agent executions selected when the same Issue receives a newer revision', () => {
    const { rerender } = render(
      <WorkItemDetail
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /^Agent executions$/ }))
    expect(screen.getByRole('tab', { name: /^Agent executions$/ })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).toContain('workItemSection=agent')
    expect(window.location.search).toContain('workItemSectionItem=w1')

    rerender(
      <WorkItemDetail
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel({ ...item, revision: 3, title: 'Updated detail' })}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    expect(screen.getByRole('tab', { name: /^Agent executions$/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: /^Agent executions$/ })).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /^Details$/ }))
    expect(screen.getByDisplayValue('Updated detail')).toBeVisible()
  })

  it('resets the selected tab when the Issue changes or an explicit reset is requested', () => {
    const { rerender } = render(
      <WorkItemDetail
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel(item)}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /^Agent executions$/ }))
    rerender(
      <WorkItemDetail
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel({ ...item, id: 'w2', number: 9, revision: 1, title: 'Another detail' })}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={0}
        supplemental={null}
      />,
    )
    expect(screen.getByRole('tab', { name: /^Overview$/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(screen.getByRole('tab', { name: /^Agent executions$/ }))
    rerender(
      <WorkItemDetail
        draftIdentity={draftIdentity}
        mode="full_page"
        model={toWorkItemDetailModel({ ...item, id: 'w2', number: 9, revision: 2, title: 'Another detail' })}
        onClose={noop}
        onOpenFull={noop}
        onReloadLatest={noop}
        onSave={resolveSave}
        options={options}
        resetKey={1}
        supplemental={null}
      />,
    )
    expect(screen.getByRole('tab', { name: /^Overview$/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('restores a URL-owned section after remount without coupling it to an internal reset counter', () => {
    const props = {
      draftIdentity, mode: 'full_page' as const, model: toWorkItemDetailModel(item), onClose: noop, onOpenFull: noop,
      onReloadLatest: noop, onSave: resolveSave, options, resetKey: 0, supplemental: null,
    }
    const first = render(<WorkItemDetail {...props} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Discussion$/ }))
    first.unmount()

    render(<WorkItemDetail {...props} />)
    expect(screen.getByRole('tab', { name: /^Discussion$/ })).toHaveAttribute('aria-selected', 'true')
    expect(window.location.search).not.toContain('workItemSectionReset')
  })
})
