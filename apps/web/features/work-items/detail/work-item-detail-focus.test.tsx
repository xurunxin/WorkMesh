// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkItemDetail } from './work-item-detail'
import { toWorkItemDetailModel } from './view-model'
import type { StructuredDetailError, WorkItemDetailDto, WorkItemDetailOptions } from './contracts'
import type { DraftIdentity } from '../../rich-content/editor'

// Testing Library's automatic cleanup only fires when the test environment is
// `jsdom` and the project has been initialized for it; in this monorepo the
// suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated. We also reset localStorage so a draft left over from
// a previous case cannot auto-restore and dirty the form on mount.
afterEach(() => { cleanup() })
beforeEach(() => { window.localStorage.clear() })

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

    const saveButton = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement
    // The full-page shell still receives focus on mount (existing behaviour),
    // so we only need to assert that focus is NOT sitting on the Save button.
    expect(document.activeElement).not.toBe(saveButton)
  })
})
