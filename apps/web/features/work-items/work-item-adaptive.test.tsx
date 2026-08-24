// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { WorkItemAdaptiveCollection, type WorkItemCardData, type WorkItemStatusOption } from '@workmesh/ui'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { cleanup() })

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
  })

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
