import {
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from 'react'

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ children, className, variant = 'secondary', ...props }: ButtonProps) {
  return <button className={classNames('wm-button', `wm-button-${variant}`, 'ui-button', `ui-button-${variant}`, className)} {...props}>{children}</button>
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean
}

export function Input({ className, invalid = false, ...props }: InputProps) {
  return <input aria-invalid={invalid || undefined} className={classNames('wm-input', invalid && 'is-invalid', className)} {...props} />
}

export type SelectProps = PropsWithChildren<SelectHTMLAttributes<HTMLSelectElement>> & {
  invalid?: boolean
}

export function Select({ children, className, invalid = false, ...props }: SelectProps) {
  return <select aria-invalid={invalid || undefined} className={classNames('wm-select', invalid && 'is-invalid', className)} {...props}>{children}</select>
}

export type NavigationItem = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & {
  active?: boolean
  href: string
  label: string
  testId?: string
}

export type AppShellProps = PropsWithChildren<{
  actorName?: string
  contextLabel?: string
  footer?: ReactNode
  headerActions?: ReactNode
  navigation: NavigationItem[]
  productName: string
  teamSwitcher?: ReactNode
  utilityNavigation?: NavigationItem[]
}>

function NavigationLinks({ items, onNavigate, testIds = true }: { items: NavigationItem[]; onNavigate?: () => void; testIds?: boolean }) {
  return <>{items.map(item => <a
    aria-current={item.active ? 'page' : undefined}
    className={classNames('app-navigation-link', item.active && 'is-active')}
    data-testid={testIds ? item.testId : undefined}
    href={item.href}
    key={`${item.href}:${item.label}`}
    onClick={event => {
      item.onClick?.(event)
      onNavigate?.()
    }}
  >{item.label}</a>)}</>
}

export function AppShell({
  actorName,
  children,
  contextLabel = 'Workspace',
  footer,
  headerActions,
  navigation,
  productName,
  teamSwitcher,
  utilityNavigation = [],
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const allNavigation = [...navigation, ...utilityNavigation]
  return <div className="app-shell wm-theme">
    <a className="wm-skip-link" href="#workmesh-main">Skip to content</a>
    <aside className="app-sidebar" aria-label="Main navigation">
      <header className="app-brand"><h1>{productName}</h1>{actorName && <small>{actorName}</small>}</header>
      {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
      <nav className="app-navigation" aria-label="Workspace"><NavigationLinks items={navigation} /></nav>
      {utilityNavigation.length > 0 && <nav className="app-navigation app-utility-navigation" aria-label="Administration"><NavigationLinks items={utilityNavigation} /></nav>}
      {footer && <footer className="app-sidebar-footer">{footer}</footer>}
    </aside>
    <div className="app-workspace">
      <header className="wm-shell-header">
        <details className="mobile-navigation" onToggle={event => setMobileOpen(event.currentTarget.open)} open={mobileOpen}>
          <summary onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setMobileOpen(open => !open)
          }}>Menu</summary>
          <div className="mobile-navigation-context">
            <header className="app-brand"><strong>{productName}</strong>{actorName && <small>{actorName}</small>}</header>
            {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
          </div>
          <nav aria-label="Mobile navigation"><NavigationLinks items={allNavigation} onNavigate={() => setMobileOpen(false)} testIds={false} /></nav>
          {footer && <footer className="app-sidebar-footer mobile-navigation-footer">{footer}</footer>}
        </details>
        <p>{contextLabel}</p>
        {headerActions && <div className="wm-shell-actions">{headerActions}</div>}
      </header>
      <main className="app-content" id="workmesh-main" tabIndex={-1}>{children}</main>
    </div>
  </div>
}

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function useOverlayFocus(open: boolean, ref: { current: HTMLElement | null }) {
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.querySelector<HTMLElement>(focusableSelector)?.focus()
    return () => previousFocus?.focus()
  }, [open, ref])
}

function containOverlayKeyboard(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null, onClose: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...(root?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])]
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

export type DialogProps = PropsWithChildren<{
  description?: string
  open: boolean
  onClose: () => void
  title: string
}>

export function Dialog({ children, description, onClose, open, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  useOverlayFocus(open, dialogRef)
  if (!open) return null
  return <div className="wm-overlay ui-dialog-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className="wm-dialog ui-dialog" onKeyDown={event => containOverlayKeyboard(event, dialogRef.current, onClose)} ref={dialogRef} role="dialog">
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><Button aria-label={`Close ${title}`} onClick={onClose} type="button" variant="ghost">Close</Button></header>
      <div className="wm-dialog-content ui-dialog-content">{children}</div>
    </section>
  </div>
}

export type SheetProps = PropsWithChildren<{
  description?: string
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
}>

export function Sheet({ children, description, onClose, open, side = 'right', title }: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const sheetRef = useRef<HTMLElement | null>(null)
  useOverlayFocus(open, sheetRef)
  if (!open) return null
  return <div className="wm-overlay wm-sheet-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-sheet', `wm-sheet-${side}`)} onKeyDown={event => containOverlayKeyboard(event, sheetRef.current, onClose)} ref={sheetRef} role="dialog">
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><Button aria-label={`Close ${title}`} onClick={onClose} type="button" variant="ghost">Close</Button></header>
      <div className="wm-sheet-content">{children}</div>
    </section>
  </div>
}

export type PopoverProps = PropsWithChildren<{
  align?: 'start' | 'end'
  label: string
  onOpenChange: (open: boolean) => void
  open: boolean
  trigger: ReactNode
}>

export function Popover({ align = 'start', children, label, onOpenChange, open, trigger }: PopoverProps) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onOpenChange(false)
    }
    const closeEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [onOpenChange, open])
  return <div className="wm-popover" ref={rootRef}>
    <button aria-controls={panelId} aria-expanded={open} aria-haspopup="dialog" className="wm-popover-trigger" onClick={() => onOpenChange(!open)} ref={triggerRef} type="button">{trigger}</button>
    {open && <div aria-label={label} className={classNames('wm-popover-panel', `wm-popover-${align}`)} id={panelId} role="dialog">{children}</div>}
  </div>
}

export type TabItem = { id: string; label: string; panel: ReactNode }
export type TabsProps = { ariaLabel: string; onValueChange: (value: string) => void; tabs: TabItem[]; value: string }

export function Tabs({ ariaLabel, onValueChange, tabs, value }: TabsProps) {
  const baseId = useId()
  const selected = tabs.find(tab => tab.id === value) ?? tabs[0]
  const move = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') targetIndex = 0
    if (event.key === 'End') targetIndex = tabs.length - 1
    if (targetIndex === null) return
    event.preventDefault()
    const target = tabs[targetIndex]
    if (!target) return
    onValueChange(target.id)
    document.getElementById(`${baseId}-tab-${target.id}`)?.focus()
  }
  return <div className="wm-tabs">
    <div aria-label={ariaLabel} className="wm-tab-list" role="tablist">{tabs.map((tab, index) => <button
      aria-controls={`${baseId}-panel-${tab.id}`}
      aria-selected={tab.id === selected?.id}
      className={classNames('wm-tab', tab.id === selected?.id && 'is-active')}
      id={`${baseId}-tab-${tab.id}`}
      key={tab.id}
      onClick={() => onValueChange(tab.id)}
      onKeyDown={event => move(event, index)}
      role="tab"
      tabIndex={tab.id === selected?.id ? 0 : -1}
      type="button"
    >{tab.label}</button>)}</div>
    {selected && <div aria-labelledby={`${baseId}-tab-${selected.id}`} className="wm-tab-panel" id={`${baseId}-panel-${selected.id}`} role="tabpanel">{selected.panel}</div>}
  </div>
}

export type BadgeProps = PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function Badge({ children, className, tone = 'neutral', ...props }: BadgeProps) {
  return <span className={classNames('wm-badge', `wm-badge-${tone}`, className)} {...props}>{children}</span>
}

export type CardProps = PropsWithChildren<HTMLAttributes<HTMLElement>> & {
  actions?: ReactNode
  subtitle?: string
  title?: string
}

export function Card({ actions, children, className, subtitle, title, ...props }: CardProps) {
  return <section className={classNames('wm-card', className)} {...props}>
    {(title || subtitle || actions) && <header><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{actions}</header>}
    <div className="wm-card-content">{children}</div>
  </section>
}

export type ToastProps = {
  message: string
  onDismiss?: () => void
  open: boolean
  title?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

export function Toast({ message, onDismiss, open, title, tone = 'info' }: ToastProps) {
  if (!open) return null
  const urgent = tone === 'danger' || tone === 'warning'
  return <aside aria-live={urgent ? 'assertive' : 'polite'} className={classNames('wm-toast', `wm-toast-${tone}`)} role={urgent ? 'alert' : 'status'}>
    <div>{title && <strong>{title}</strong>}<p>{message}</p></div>
    {onDismiss && <Button aria-label="Dismiss notification" onClick={onDismiss} type="button" variant="ghost">Dismiss</Button>}
  </aside>
}

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & { label?: string }

export function Skeleton({ className, label = 'Loading', ...props }: SkeletonProps) {
  return <span aria-label={label} className={classNames('wm-skeleton', className)} role="status" {...props}><span className="wm-visually-hidden">{label}</span></span>
}

export type SurfaceState = 'initial' | 'loading' | 'ready' | 'empty' | 'refreshing' | 'forbidden' | 'not_found' | 'deleted' | 'conflict' | 'offline' | 'reconnecting' | 'error'
export type AsyncStateSurfaceProps = {
  actionLabel?: string
  description: string
  onAction?: () => void
  state: Exclude<SurfaceState, 'ready'>
  title: string
}

export function AsyncStateSurface({ actionLabel, description, onAction, state, title }: AsyncStateSurfaceProps) {
  const urgent = state === 'error' || state === 'forbidden' || state === 'conflict' || state === 'deleted'
  return <section aria-busy={state === 'loading' || state === 'refreshing' || state === 'reconnecting' || undefined} aria-live={urgent ? 'assertive' : 'polite'} className={classNames('wm-state-surface', `wm-state-${state}`)} role={urgent ? 'alert' : 'status'}>
    {state === 'loading' || state === 'refreshing' || state === 'reconnecting' ? <Skeleton label={title} /> : <span aria-hidden="true" className="wm-state-marker" />}
    <div><h2>{title}</h2><p>{description}</p></div>
    {actionLabel && onAction && <Button onClick={onAction} type="button" variant={urgent ? 'primary' : 'secondary'}>{actionLabel}</Button>}
  </section>
}

type NamedStateProps = Omit<AsyncStateSurfaceProps, 'state'>
export const EmptyState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="empty" />
export const ErrorState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="error" />
export const ForbiddenState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="forbidden" />
export const ConflictState = (props: NamedStateProps) => <AsyncStateSurface {...props} state="conflict" />

/** Presentation-only work-item data; transport DTOs are mapped by the feature layer. */
export type WorkItemCardData = {
  id: string
  identifier: string
  title: string
  statusId: string
  statusName: string
  statusCategory?: string
  priority?: string
  responsibleHuman?: string | null
  responsibleHumanActorId?: string | null
  project?: string | null
  labels?: string[]
  revision?: number
  activeAgent?: string | null
}

export type WorkItemStatusOption = { id: string; name: string; category?: string }
export type WorkItemMoveSource = 'pointer' | 'keyboard' | 'explicit-status-selector'
export type WorkItemMoveCallback = (item: WorkItemCardData, targetStatusId: string, source: WorkItemMoveSource) => void | Promise<void>
export type WorkItemCardProps = {
  item: WorkItemCardData
  statusOptions?: WorkItemStatusOption[]
  onOpen?: (item: WorkItemCardData) => void
  onMove?: WorkItemMoveCallback
  draggable?: boolean
  dragState?: 'idle' | 'dragging' | 'pending'
  className?: string
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
}

function workItemClassNames(...values: Array<string | false | null | undefined>): string { return values.filter(Boolean).join(' ') }
function handlePresentationPromise(callback: (() => void | Promise<void>) | undefined): void {
  if (!callback) return
  try {
    const result = callback()
    if (result && typeof (result as Promise<void>).catch === 'function') void (result as Promise<void>).catch(() => undefined)
  } catch { /* Feature controller owns errors; presentation remains render-safe. */ }
}

export function WorkItemCard({ className, draggable = false, dragState = 'idle', item, onMove, onOpen, onPointerDown, statusOptions = [] }: WorkItemCardProps) {
  const [isKeyboardMoving, setIsKeyboardMoving] = useState(false)
  const move = (statusId: string, source: WorkItemMoveSource) => {
    if (!onMove || !statusId || statusId === item.statusId) return
    setIsKeyboardMoving(source === 'keyboard')
    handlePresentationPromise(() => onMove(item, statusId, source))
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlePresentationPromise(onOpen ? () => onOpen(item) : undefined); return }
    if (!onMove || statusOptions.length === 0) return
    const index = statusOptions.findIndex(status => status.id === item.statusId)
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (index < 0 || direction === 0) return
    event.preventDefault()
    const next = statusOptions[(index + direction + statusOptions.length) % statusOptions.length]
    if (next) move(next.id, 'keyboard')
  }
  const handleDragStart = (event: DragEvent<HTMLElement>) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id) }
  return <article aria-busy={dragState === 'pending' || isKeyboardMoving || undefined} aria-label={`${item.identifier}: ${item.title}`} className={workItemClassNames('wm-work-item-card', `wm-work-item-card-${dragState}`, className)} data-work-item-id={item.id} draggable={draggable && dragState !== 'pending'} onClick={event => { if (!(event.target instanceof HTMLSelectElement)) handlePresentationPromise(onOpen ? () => onOpen(item) : undefined) }} onDragStart={draggable ? handleDragStart : undefined} onKeyDown={handleKeyDown} onPointerDown={onPointerDown} role="button" tabIndex={0}>
    <div className="wm-work-item-card-heading"><span className="wm-work-item-identifier">{item.identifier}</span>{item.priority && <span className={workItemClassNames('wm-work-item-priority', `priority-${item.priority}`)}>{item.priority}</span>}</div>
    <strong className="wm-work-item-title">{item.title}</strong>
    <div className="wm-work-item-metadata"><span>{item.responsibleHuman ?? 'No responsible Human'}</span><span>{item.activeAgent ?? 'No active Agent'}</span></div>
    {item.labels && item.labels.length > 0 && <div className="wm-work-item-labels">{item.labels.map(label => <span key={label}>{label}</span>)}</div>}
    {onMove && statusOptions.length > 0 && <label className="wm-work-item-status-control" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}><span className="wm-visually-hidden">Move {item.title}</span><select aria-label={`Move ${item.title}`} disabled={dragState === 'pending'} onChange={(event: ChangeEvent<HTMLSelectElement>) => move(event.currentTarget.value, 'explicit-status-selector')} value={item.statusId}>{statusOptions.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>}
  </article>
}

export type WorkItemListProps = { items: WorkItemCardData[]; statusOptions?: WorkItemStatusOption[]; onOpen?: (item: WorkItemCardData) => void; onMove?: WorkItemMoveCallback; empty?: ReactNode }
export function WorkItemList({ empty = 'No work items match this view.', items, onMove, onOpen, statusOptions = [] }: WorkItemListProps) {
  if (items.length === 0) return <section aria-label="Work item list" className="wm-work-item-list-empty" data-testid="work-items-empty">{empty}</section>
  return <section aria-label="Work item list" className="wm-work-item-list" data-testid="work-list">{items.map(item => <WorkItemCard item={item} key={item.id} onMove={onMove} onOpen={onOpen} statusOptions={statusOptions} />)}</section>
}

export type WorkItemBoardProps = { items: WorkItemCardData[]; columns: WorkItemStatusOption[]; onOpen?: (item: WorkItemCardData) => void; onMove?: WorkItemMoveCallback }
export function WorkItemBoard({ columns, items, onMove, onOpen }: WorkItemBoardProps) {
  const draggedItem = useRef<string | null>(null)
  const [pointerItem, setPointerItem] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<string | null>(null)
  const itemFor = (id: string | null) => id ? items.find(item => item.id === id) : undefined
  const moveTo = (column: WorkItemStatusOption, source: WorkItemMoveSource, id: string | null) => { const item = itemFor(id); draggedItem.current = null; setPointerItem(null); setDropColumn(null); if (item && item.statusId !== column.id) handlePresentationPromise(onMove ? () => onMove(item, column.id, source) : undefined) }
  const handleDrop = (column: WorkItemStatusOption, event: DragEvent<HTMLDivElement>) => { event.preventDefault(); moveTo(column, 'pointer', event.dataTransfer.getData('text/plain') || draggedItem.current) }
  return <section aria-label="Work item board" className="wm-work-item-board" data-testid="board" tabIndex={0}><div aria-label="Work item board columns" className="wm-work-item-board-scroll" role="region" tabIndex={0}>{columns.map((column, columnIndex) => { const columnItems = items.filter(item => item.statusId === column.id); return <div aria-label={`${column.name} column`} className={workItemClassNames('wm-work-item-column', dropColumn === column.id && 'is-drop-target')} data-testid={`column-${column.id}`} data-workflow-state-id={column.id} key={column.id} onDragOver={event => { event.preventDefault(); setDropColumn(column.id) }} onDragLeave={() => setDropColumn(current => current === column.id ? null : current)} onDrop={event => handleDrop(column, event)} onPointerUp={() => moveTo(column, 'pointer', pointerItem ?? draggedItem.current)} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const next = columns[columnIndex + (event.key === 'ArrowRight' ? 1 : -1)]; if (next) document.querySelector<HTMLElement>(`[data-workflow-state-id="${CSS.escape(next.id)}"]`)?.focus() }} role="group" tabIndex={0}><header><h3>{column.name}</h3><span aria-label={`${columnItems.length} items`}>{columnItems.length}</span></header><div className="wm-work-item-column-items">{columnItems.map(item => <WorkItemCard draggable dragState={draggedItem.current === item.id ? 'dragging' : 'idle'} item={item} key={item.id} onMove={onMove} onOpen={onOpen} onPointerDown={event => { if (event.target instanceof HTMLSelectElement) return; draggedItem.current = item.id; setPointerItem(item.id) }} statusOptions={columns} />)}</div><p className="wm-work-item-drop-hint">Drop work here</p></div> })}</div></section>
}

export type WorkItemFilterValues = { search?: string; statusId?: string; priority?: string; responsibleHumanActorId?: string; ownerId?: string; projectId?: string; label?: string; statusCategory?: string; mine?: boolean }
export type WorkItemFilterOption = { id: string; label: string; name?: string }
export type WorkItemFiltersProps = { value: WorkItemFilterValues; statuses?: WorkItemFilterOption[]; humans?: WorkItemFilterOption[]; projects?: WorkItemFilterOption[]; savedViews?: Array<{ id: string; name: string }>; onChange: (value: WorkItemFilterValues) => void; onClear?: () => void; onApplySavedView?: (id: string) => void; onCreateSavedView?: (name: string) => void | Promise<void> }
export function WorkItemFilters({ humans = [], onApplySavedView, onChange, onClear, onCreateSavedView, projects = [], savedViews = [], statuses = [], value }: WorkItemFiltersProps) {
  const [savedViewName, setSavedViewName] = useState('')
  const set = (key: keyof WorkItemFilterValues, next: string | boolean | undefined) => onChange({ ...value, [key]: next || undefined })
  const setResponsibleHuman = (next: string) => onChange({ ...value, responsibleHumanActorId: next || undefined, ownerId: undefined, mine: undefined })
  const submitSavedView = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!savedViewName.trim() || !onCreateSavedView) return; handlePresentationPromise(() => onCreateSavedView(savedViewName.trim())); setSavedViewName('') }
  return <section aria-label="Work item filters" className="wm-work-item-filters"><label>Search<input aria-label="Search work" onChange={event => set('search', event.currentTarget.value)} placeholder="Search title or identifier" value={value.search ?? ''} /></label><label>Status<select aria-label="Filter status" onChange={event => set('statusId', event.currentTarget.value)} value={value.statusId ?? ''}><option value="">All statuses</option>{statuses.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Priority<select aria-label="Filter priority" onChange={event => set('priority', event.currentTarget.value)} value={value.priority ?? ''}><option value="">All priorities</option>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>Responsible Human<select aria-label="Filter responsible Human" onChange={event => setResponsibleHuman(event.currentTarget.value)} value={value.responsibleHumanActorId ?? value.ownerId ?? ''}><option value="">All Humans</option>{humans.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Project<select aria-label="Filter project" onChange={event => set('projectId', event.currentTarget.value)} value={value.projectId ?? ''}><option value="">All projects</option>{projects.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Label<input aria-label="Filter label" onChange={event => set('label', event.currentTarget.value)} placeholder="Exact label" value={value.label ?? ''} /></label><div className="wm-work-item-filter-actions">{onClear && <button onClick={onClear} type="button">Clear filters</button>}{savedViews.length > 0 && <label>Saved view<select aria-label="Saved views" defaultValue="" onChange={event => { if (event.currentTarget.value) onApplySavedView?.(event.currentTarget.value); event.currentTarget.value = '' }}><option value="">Open saved view</option>{savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>}{onCreateSavedView && <form className="wm-work-item-save-view" onSubmit={submitSavedView}><label className="wm-visually-hidden" htmlFor="wm-save-view-name">Saved view name</label><input id="wm-save-view-name" onChange={event => setSavedViewName(event.currentTarget.value)} placeholder="Save current view" required value={savedViewName} /><button type="submit">Save view</button></form>}</div></section>
}

export type WorkSurfaceStateKind = 'initial' | 'loading' | 'ready' | 'empty' | 'refreshing' | 'forbidden' | 'conflict' | 'offline' | 'reconnecting' | 'error'
export type WorkSurfaceStateProps = { state: Exclude<WorkSurfaceStateKind, 'ready'>; title: string; description: string; actionLabel?: string; onAction?: () => void }
export function WorkSurfaceState({ actionLabel, description, onAction, state, title }: WorkSurfaceStateProps) { const urgent = state === 'error' || state === 'forbidden' || state === 'conflict'; const busy = state === 'loading' || state === 'refreshing' || state === 'reconnecting'; return <section aria-busy={busy || undefined} aria-live={urgent ? 'assertive' : 'polite'} className={workItemClassNames('wm-work-surface-state', `state-${state}`)} data-testid={`work-surface-state-${state}`} role={urgent ? 'alert' : 'status'}><span aria-hidden="true" className="wm-work-surface-state-marker" /><div><h2>{title}</h2><p>{description}</p></div>{actionLabel && onAction && <button onClick={onAction} type="button">{actionLabel}</button>}</section> }
export type WorkSurfacePaginationProps = { nextCursor: string | null; loading?: boolean; onLoadMore?: () => void | Promise<void> }
export function WorkSurfacePagination({ loading = false, nextCursor, onLoadMore }: WorkSurfacePaginationProps) { if (!nextCursor || !onLoadMore) return null; return <button className="wm-work-surface-pagination" disabled={loading} onClick={() => handlePresentationPromise(onLoadMore)} type="button">{loading ? 'Loading…' : 'Load more work items'}</button> }
