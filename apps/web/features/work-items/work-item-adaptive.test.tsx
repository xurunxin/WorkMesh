// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WorkItemAdaptiveCollection, WorkItemCard, type WorkItemCardData, type WorkItemStatusOption } from '@workmesh/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { cleanup() })

/**
 * Wall-clock budget for the suite that mounts 300 real cards across three
 * layout changes and then proves not one of them re-rendered.
 *
 * It has to build 300 nodes to be able to assert that 300 nodes were not
 * rebuilt, so its cost tracks the host's scheduling speed rather than the
 * behaviour it checks. Vitest's 5s default was never a budget designed for it;
 * at the default this suite fails on a loaded machine and passes on an idle
 * one, which reports on the machine instead of on the code.
 *
 * Stating the budget explicitly weakens nothing: the identity, cardinality and
 * zero-mutation assertions below are unchanged, and they still fail the moment
 * the persistent-DOM contract regresses.
 */
const HEAVY_DOM_TEST_TIMEOUT_MS = 30_000

const columns: WorkItemStatusOption[] = [
  { id: 'backlog', name: 'Backlog', category: 'backlog' },
  { id: 'ready', name: 'Ready', category: 'ready' },
  { id: 'started', name: 'In Progress', category: 'started' },
  { id: 'review', name: 'Review', category: 'review' },
  { id: 'done', name: 'Done', category: 'done' },
]

const items: WorkItemCardData[] = Array.from({ length: 300 }, (_, offset) => {
  const ordinal = offset + 1
  const column = columns[offset % columns.length]!
  return {
    id: `work-${ordinal}`,
    identifier: `WM-${ordinal}`,
    labels: [ordinal % 2 === 0 ? 'planning' : 'frontend'],
    projectId: 'project-1',
    projectName: 'Kaneo UI Adoption',
    responsibleHuman: 'Alex Morgan',
    revision: 1,
    statusCategory: column.category,
    statusId: column.id,
    statusName: column.name,
    title: `Large Issue ${String(ordinal).padStart(3, '0')}`,
  }
})

function cardNodes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.wm-work-item-card')]
}

function mutationTouchesCard(record: MutationRecord): boolean {
  const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement
  if (target?.closest('.wm-work-item-card')) return true
  return [...record.addedNodes, ...record.removedNodes].some(node =>
    node instanceof HTMLElement && (node.matches('.wm-work-item-card') || Boolean(node.querySelector('.wm-work-item-card'))),
  )
}

describe('WorkItemAdaptiveCollection persistent DOM', () => {
  it('keeps the exact 300 card and five column nodes across list-board-list while preserving boundary focus', () => {
    const view = render(<WorkItemAdaptiveCollection columns={columns} items={items} layout="list" />)
    const root = view.container.querySelector<HTMLElement>('.wm-work-item-adaptive')
    const initialCards = new Map(cardNodes(view.container).map(card => [card.dataset.workItemId, card]))
    const initialColumns = new Map([...view.container.querySelectorAll<HTMLElement>('[data-workflow-state-id]')].map(column => [column.dataset.workflowStateId, column]))

    expect(root).toHaveAttribute('data-layout', 'list')
    expect(root).toHaveAttribute('data-testid', 'work-list')
    expect(initialCards.size).toBe(300)
    expect(initialColumns.size).toBe(5)
    expect([...initialColumns.values()].every(column => column.getAttribute('role') === 'presentation')).toBe(true)
    expect(view.container.querySelectorAll('.wm-work-item-column-header:not([hidden])')).toHaveLength(0)
    expect(view.container.querySelectorAll('.wm-work-item-drop-hint:not([hidden])')).toHaveLength(0)
    expect(view.container.querySelectorAll('.wm-work-item-column-resize:not([hidden])')).toHaveLength(0)
    const boundary = initialCards.get('work-201')?.querySelector<HTMLElement>('.wm-work-item-title')
    boundary?.focus()
    expect(document.activeElement).toBe(boundary)

    const cardMutations: MutationRecord[] = []
    const observer = new MutationObserver(() => undefined)
    observer.observe(root!, { attributes: true, childList: true, characterData: true, subtree: true })

    view.rerender(<WorkItemAdaptiveCollection columns={columns} items={items} layout="board" />)
    expect(root).toHaveAttribute('data-layout', 'board')
    expect(root).toHaveAttribute('data-testid', 'board')
    const boardCards = new Map(cardNodes(view.container).map(card => [card.dataset.workItemId, card]))
    const boardColumns = new Map([...view.container.querySelectorAll<HTMLElement>('[data-workflow-state-id]')].map(column => [column.dataset.workflowStateId, column]))
    expect(boardCards.size).toBe(300)
    for (const [id, card] of initialCards) expect(boardCards.get(id)).toBe(card)
    for (const [id, column] of initialColumns) expect(boardColumns.get(id)).toBe(column)
    cardMutations.push(...observer.takeRecords().filter(mutationTouchesCard))
    expect([...initialColumns.values()].every(column => column.getAttribute('role') === 'group')).toBe(true)
    expect(view.container.querySelectorAll('.wm-work-item-column-header:not([hidden])')).toHaveLength(5)
    expect(view.container.querySelectorAll('.wm-work-item-drop-hint:not([hidden])')).toHaveLength(5)
    expect(document.activeElement).toBe(boundary)

    view.rerender(<WorkItemAdaptiveCollection columns={columns} items={items} layout="list" />)
    const restoredCards = new Map(cardNodes(view.container).map(card => [card.dataset.workItemId, card]))
    expect(restoredCards.size).toBe(300)
    for (const [id, card] of initialCards) expect(restoredCards.get(id)).toBe(card)
    expect(document.activeElement).toBe(boundary)
    cardMutations.push(...observer.takeRecords().filter(mutationTouchesCard))
    const cardIds = [...restoredCards.keys()]
    expect(new Set(cardIds).size).toBe(300)
    const htmlIds = [...view.container.querySelectorAll<HTMLElement>('[id]')].map(element => element.id)
    expect(new Set(htmlIds).size).toBe(htmlIds.length)
    expect(cardMutations).toHaveLength(0)
    observer.disconnect()
  }, HEAVY_DOM_TEST_TIMEOUT_MS)

  it('keeps open, project, status and board drag actions on the persistent card', () => {
    const onMove = vi.fn()
    const onOpen = vi.fn()
    const onOpenProject = vi.fn()
    const view = render(<WorkItemAdaptiveCollection columns={columns} items={items.slice(0, 5)} layout="list" onMove={onMove} onOpen={onOpen} onOpenProject={onOpenProject} />)
    const firstCard = view.container.querySelector<HTMLElement>('[data-work-item-id="work-1"]')
    fireEvent.click(firstCard!.querySelector('.wm-work-item-title')!)
    fireEvent.click(firstCard!.querySelector('.wm-work-item-project')!)
    fireEvent.change(firstCard!.querySelector('select')!, { target: { value: 'ready' } })
    expect(onOpen).toHaveBeenCalledWith(items[0])
    expect(onOpenProject).toHaveBeenCalledWith('project-1')
    expect(onMove).toHaveBeenCalledWith(items[0], 'ready', 'explicit-status-selector')

    const listTransfer = new Map<string, string>()
    const listDataTransfer = {
      effectAllowed: 'none',
      getData: (format: string): string => listTransfer.get(format) ?? '',
      setData: (format: string, value: string): void => { listTransfer.set(format, value) },
    }
    const moveCountBeforeListDrag = onMove.mock.calls.length
    expect(fireEvent.dragStart(firstCard!, { dataTransfer: listDataTransfer })).toBe(false)
    fireEvent.drop(view.container.querySelector('[data-workflow-state-id="ready"]')!, { dataTransfer: listDataTransfer })
    expect(listDataTransfer.getData('text/plain')).toBe('')
    expect(firstCard).not.toHaveClass('wm-work-item-card-dragging')
    expect(onMove).toHaveBeenCalledTimes(moveCountBeforeListDrag)

    view.rerender(<WorkItemAdaptiveCollection columns={columns} items={items.slice(0, 5)} layout="board" onMove={onMove} onOpen={onOpen} onOpenProject={onOpenProject} />)
    const transfer = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      getData: (format: string): string => transfer.get(format) ?? '',
      setData: (format: string, value: string): void => { transfer.set(format, value) },
    }
    fireEvent.dragStart(firstCard!, { dataTransfer })
    expect(firstCard).toHaveClass('wm-work-item-card-dragging')
    expect(view.container.querySelectorAll('.wm-work-item-card-dragging')).toHaveLength(1)
    fireEvent.drop(view.container.querySelector('[data-workflow-state-id="ready"]')!, { dataTransfer })
    expect(onMove).toHaveBeenLastCalledWith(items[0], 'ready', 'pointer')
    fireEvent.dragEnd(firstCard!)
    expect(firstCard).not.toHaveClass('wm-work-item-card-dragging')
  })
})

describe('WorkItemAdaptiveCollection run budget row', () => {
  const budgeted: WorkItemCardData = {
    ...items[0]!,
    activeAgent: 'Atlas',
    activeAgentState: 'executing',
    activeBudget: { cap: 3600, exhausted: false, limit: 'runtimeSeconds', measurable: true, ratio: 0.42, used: 1512, warning: false },
  }

  // The collection hands its cards `layout="adaptive"` and keeps one keyed card
  // tree across list/board, so a card may not learn the resolved layout through
  // a prop. Board placement is CSS on the collection's own `data-layout`, and
  // this asserts the card-level half: only a real board card drops the figure.
  it('states the assigned run budget on a list row and on an adaptive card, but not on a board card', () => {
    const list = render(<WorkItemAdaptiveCollection columns={columns} items={[budgeted]} layout="list" />)
    expect(list.container.querySelectorAll('.wm-budget-chip')).toHaveLength(1)
    expect(list.container.querySelector('.wm-budget-chip')?.textContent).toContain('42%')
    // It rides the row's small-facts strip, not a line of its own.
    expect(list.container.querySelector('.wm-work-item-facts .wm-budget-chip')).not.toBeNull()

    const board = render(<WorkItemCard item={budgeted} layout="board" />)
    expect(board.container.querySelectorAll('.wm-budget-chip')).toHaveLength(0)
  })

  it('keeps the card tree keyed and the budget mounted across the layout switch', () => {
    const view = render(<WorkItemAdaptiveCollection columns={columns} items={[budgeted]} layout="list" />)
    const firstCard = cardNodes(view.container)[0]
    const chip = view.container.querySelector('.wm-budget-chip')
    view.rerender(<WorkItemAdaptiveCollection columns={columns} items={[budgeted]} layout="board" />)
    expect(cardNodes(view.container)[0]).toBe(firstCard)
    expect(view.container.querySelector('.wm-budget-chip')).toBe(chip)
  })

  it('hides the budget in board through the collection stylesheet, not through a prop', () => {
    const tokens = readFileSync(resolve(process.cwd(), '../../packages/ui/src/tokens.css'), 'utf8')
    expect(tokens).toMatch(/\.wm-work-item-adaptive\[data-layout='board'\] \.wm-budget-chip \{ display: none; \}/)
  })
})
