'use client'

import { useCallback, useMemo, useState } from 'react'
import { Button, ComponentCatalog, WorkItemAdaptiveCollection, type WorkItemCardData, type WorkItemMoveSource, type WorkItemStatusOption } from '@workmesh/ui'
import { KanbanIcon } from '@phosphor-icons/react/dist/csr/Kanban'
import { RowsIcon } from '@phosphor-icons/react/dist/csr/Rows'
import { useWorkMeshDocumentTitle } from '../lib/document-title'
import { useLocale } from '../lib/i18n'

type CatalogTheme = 'light' | 'dark'
type CatalogDensity = 'cozy' | 'compact'

/**
 * Live board fixture. The shared board owns drag, drop, and keyboard moves, so
 * a static screenshot cannot prove any of them still work — this fixture lets
 * the real component be driven by hand at /ui-catalog.
 */
const BOARD_COLUMNS: WorkItemStatusOption[] = [
  { id: 'cat-open', name: 'Open', category: 'open', color: '#2563EB' },
  { id: 'cat-started', name: 'In progress', category: 'started', color: '#8A5A00' },
  { id: 'cat-review', name: 'In review', category: 'review', color: '#087443' },
  { id: 'cat-done', name: 'Done', category: 'done', color: '#087443' },
]

const BOARD_SEED: WorkItemCardData[] = [
  { id: 'fixture-1', identifier: 'WM-1042', title: 'Freeze the board card anatomy', statusId: 'cat-open', statusName: 'Open', statusCategory: 'open', priority: 'high', dueDate: '2000-01-01', responsibleHuman: 'Nate Coleman', revision: 1, projectId: 'p1', projectName: 'Control plane', labels: ['design', 'frontend'] },
  { id: 'fixture-2', identifier: 'WM-1043', title: 'Server-enforced stop', statusId: 'cat-open', statusName: 'Open', statusCategory: 'open', priority: 'urgent', responsibleHuman: 'Andre Thomas', revision: 1, labels: ['protocol'], blockedByCount: 2 },
  { id: 'fixture-3', identifier: 'WM-1044', title: 'Keep focus after a cross-column move', statusId: 'cat-open', statusName: 'Open', statusCategory: 'open', responsibleHuman: 'Chloe Martin', activeAgent: 'Fixer', activeAgentState: 'executing', revision: 1 },
  { id: 'fixture-4', identifier: 'WM-1030', title: 'Transactional outbox recovery', statusId: 'cat-started', statusName: 'In progress', statusCategory: 'started', priority: 'medium', responsibleHuman: 'Leah Morgan', revision: 1, projectId: 'p2', projectName: 'Reliability', subIssueCount: 4, completedSubIssueCount: 3 },
  { id: 'fixture-5', identifier: 'WM-1010', title: 'SSE cursor resume', statusId: 'cat-review', statusName: 'In review', statusCategory: 'review', responsibleHuman: 'Marcus Reed', revision: 1, blockingCount: 4 },
]

/** The fixture owns its own state so the move never touches a server. */
function BoardFixture() {
  const { t } = useLocale()
  const [layout, setLayout] = useState<'list' | 'board'>('board')
  const [items, setItems] = useState<WorkItemCardData[]>(BOARD_SEED)
  const [lastMove, setLastMove] = useState<string | null>(null)

  const move = useCallback((item: WorkItemCardData, targetStatusId: string, source: WorkItemMoveSource) => {
    const target = BOARD_COLUMNS.find(column => column.id === targetStatusId)
    setItems(current => current.map(candidate => candidate.id === item.id
      ? { ...candidate, statusId: targetStatusId, statusName: target?.name ?? candidate.statusName, statusCategory: target?.category }
      : candidate))
    setLastMove(`${item.identifier} → ${target?.name ?? targetStatusId} (${source})`)
  }, [])

  return <section style={{ display: 'grid', gap: '.75rem', padding: '1rem', border: '1px solid var(--wm-border)', borderRadius: 'var(--wm-radius-panel)' }}>
    <h2 style={{ margin: 0, fontSize: 'var(--wm-text-md)' }}>{t('catalogBoardTitle')}</h2>
    <p style={{ margin: 0, color: 'var(--wm-text-muted)', fontSize: 'var(--wm-text-sm)' }}>
      {t('catalogBoardHint')} <output data-testid="board-fixture-last-move">{lastMove ?? '—'}</output>
    </p>
    <div className="work-surface-layout-toggle" aria-label={t('catalogBoardLayout')}>
      <Button aria-pressed={layout === 'list'} icon={<RowsIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => setLayout('list')} variant="ghost">{t('catalogViewList')}</Button>
      <Button aria-pressed={layout === 'board'} icon={<KanbanIcon aria-hidden="true" size={16} weight="bold" />} onClick={() => setLayout('board')} variant="ghost">{t('catalogViewBoard')}</Button>
    </div>
    <div style={{ display: 'flex', minHeight: 0, height: 460, overflow: 'hidden' }}>
      <WorkItemAdaptiveCollection columns={BOARD_COLUMNS} items={items} layout={layout} onMove={move} />
    </div>
  </section>
}

/** Visual fixture surface for the shared component library. Theme and
 *  density are scoped via data attributes so light/dark and compact
 *  comparisons can be captured at an identical viewport. */
export default function UiCatalogPage() {
  const { t } = useLocale()
  const [theme, setTheme] = useState<CatalogTheme>('dark')
  const [density, setDensity] = useState<CatalogDensity>('cozy')
  useWorkMeshDocumentTitle('Component catalog')
  const board = useMemo(() => <BoardFixture />, [])

  return <div style={{ minHeight: '100vh' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.75rem 1.25rem', borderBottom: '1px solid var(--wm-border)' }}>
      <Button aria-pressed={theme === 'light'} size="sm" variant={theme === 'light' ? 'primary' : 'secondary'} onClick={() => setTheme('light')}>{t('catalogThemeLight')}</Button>
      <Button aria-pressed={theme === 'dark'} size="sm" variant={theme === 'dark' ? 'primary' : 'secondary'} onClick={() => setTheme('dark')}>{t('catalogThemeDark')}</Button>
      <Button aria-pressed={density === 'compact'} size="sm" variant={density === 'compact' ? 'primary' : 'secondary'} onClick={() => setDensity(density === 'compact' ? 'cozy' : 'compact')}>{t('catalogThemeCompact')}</Button>
    </div>
    <div data-wm-density={density === 'compact' ? 'compact' : undefined} data-wm-theme={theme}>
      {board}
      <ComponentCatalog intro={`Shared control fixtures rendered in ${theme} theme, ${density} density. Compare against the design/prototype reference at the same viewport.`} />
    </div>
  </div>
}