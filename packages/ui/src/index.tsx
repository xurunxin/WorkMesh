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
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple'
import { FloppyDiskIcon } from '@phosphor-icons/react/dist/csr/FloppyDisk'
import { FunnelXIcon } from '@phosphor-icons/react/dist/csr/FunnelX'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import { ProhibitIcon } from '@phosphor-icons/react/dist/csr/Prohibit'
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot'
import { UserCircleIcon } from '@phosphor-icons/react/dist/csr/UserCircle'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'

function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  icon?: ReactNode
  iconPosition?: 'start' | 'end'
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ children, className, icon, iconPosition = 'start', variant = 'secondary', ...props }: ButtonProps) {
  return <button className={classNames('wm-button', `wm-button-${variant}`, 'ui-button', `ui-button-${variant}`, className)} {...props}>{icon && iconPosition === 'start' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}<span className="wm-button-label">{children}</span>{icon && iconPosition === 'end' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}</button>
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
  icon?: ReactNode
  label: string
  testId?: string
}

export type AppShellProps = PropsWithChildren<{
  administrationNavigationLabel?: string
  actorName?: string
  contextLabel?: string
  footer?: ReactNode
  headerActions?: ReactNode
  mainNavigationLabel?: string
  menuLabel?: string
  mobileNavigationLabel?: string
  navigation: NavigationItem[]
  productName: string
  skipLabel?: string
  teamSwitcher?: ReactNode
  utilityNavigation?: NavigationItem[]
  workspaceNavigationLabel?: string
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
  >{item.icon && <span aria-hidden="true" className="app-navigation-icon">{item.icon}</span>}{item.label}</a>)}</>
}

export function AppShell({
  administrationNavigationLabel = 'Administration',
  actorName,
  children,
  contextLabel = 'Workspace',
  footer,
  headerActions,
  mainNavigationLabel = 'Main navigation',
  menuLabel = 'Menu',
  mobileNavigationLabel = 'Mobile navigation',
  navigation,
  productName,
  skipLabel = 'Skip to content',
  teamSwitcher,
  utilityNavigation = [],
  workspaceNavigationLabel = 'Workspace',
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const allNavigation = [...navigation, ...utilityNavigation]
  const hasNavigation = navigation.length > 0 || utilityNavigation.length > 0
  return <div className={`app-shell wm-theme${hasNavigation ? '' : ' app-shell--no-sidebar'}`}>
    <a className="wm-skip-link" href="#workmesh-main">{skipLabel}</a>
    {hasNavigation && <aside className="app-sidebar" aria-label={mainNavigationLabel}>
      <header className="app-brand"><h1>{productName}</h1>{actorName && <small>{actorName}</small>}</header>
      {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
      <nav className="app-navigation" aria-label={workspaceNavigationLabel}><NavigationLinks items={navigation} /></nav>
      {utilityNavigation.length > 0 && <nav className="app-navigation app-utility-navigation" aria-label={administrationNavigationLabel}><NavigationLinks items={utilityNavigation} /></nav>}
      {footer && <footer className="app-sidebar-footer">{footer}</footer>}
    </aside>}
    <div className="app-workspace">
      <header className="wm-shell-header">
        {hasNavigation && <details className="mobile-navigation" onToggle={event => setMobileOpen(event.currentTarget.open)} open={mobileOpen}>
          <summary onKeyDown={event => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setMobileOpen(open => !open)
          }}>{menuLabel}</summary>
          <div className="mobile-navigation-context">
            <header className="app-brand"><strong>{productName}</strong>{actorName && <small>{actorName}</small>}</header>
            {teamSwitcher && <div className="app-team-switcher">{teamSwitcher}</div>}
          </div>
          <nav aria-label={mobileNavigationLabel}><NavigationLinks items={allNavigation} onNavigate={() => setMobileOpen(false)} testIds={false} /></nav>
          {footer && <footer className="app-sidebar-footer mobile-navigation-footer">{footer}</footer>}
        </details>}
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
  closeLabel?: string
  description?: string
  open: boolean
  onClose: () => void
  title: string
}>

export function Dialog({ children, closeLabel = 'Close', description, onClose, open, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  useOverlayFocus(open, dialogRef)
  if (!open) return null
  return <div className="wm-overlay ui-dialog-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className="wm-dialog ui-dialog" onKeyDown={event => containOverlayKeyboard(event, dialogRef.current, onClose)} ref={dialogRef} role="dialog">
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><Button aria-label={`${closeLabel} ${title}`} icon={<XIcon aria-hidden size={16} />} onClick={onClose} type="button" variant="ghost">{closeLabel}</Button></header>
      <div className="wm-dialog-content ui-dialog-content">{children}</div>
    </section>
  </div>
}

export type SheetProps = PropsWithChildren<{
  className?: string
  closeLabel?: string
  description?: string
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
}>

export function Sheet({ children, className, closeLabel = 'Close', description, onClose, open, side = 'right', title }: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const sheetRef = useRef<HTMLElement | null>(null)
  useOverlayFocus(open, sheetRef)
  if (!open) return null
  return <div className="wm-overlay wm-sheet-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-sheet', `wm-sheet-${side}`, className)} onKeyDown={event => containOverlayKeyboard(event, sheetRef.current, onClose)} ref={sheetRef} role="dialog">
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><Button aria-label={`${closeLabel} ${title}`} onClick={onClose} type="button" variant="ghost">{closeLabel}</Button></header>
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
  projectId?: string | null
  projectName?: string | null
  labels?: string[]
  revision?: number
  activeAgent?: string | null
  activeAgentState?: string | null
  blockedByCount?: number
  blockingCount?: number
  subIssueCount?: number
  completedSubIssueCount?: number
}

export type WorkItemCopy = {
  agentExecutionState: (state: string) => string
  allHumans: string
  allMilestones: string
  allPriorities: string
  allProjects: string
  allStatuses: string
  boardColumn: (name: string) => string
  clearFilters: string
  completedSubIssues: (completed: number, total: number) => string
  dropWorkHere: string
  filterLabel: string
  filterLess: string
  filterMilestone: string
  filterMore: string
  filterPriority: string
  filterProject: string
  filterResponsibleHuman: string
  filterStatus: string
  filtersLabel: string
  labelAddPlaceholder: string
  labelMenuAriaLabel: (title: string) => string
  labelMenuEmpty: string
  labelMenuHeading: string
  labelMenuRemoveAll: string
  labelMenuSuggestions: string
  labelMoreCount: (count: number) => string
  loadMore: string
  loading: string
  moveItem: (title: string) => string
  noActiveAgent: string
  noResponsibleHuman: string
  openProject: (name: string) => string
  priorityName: (priority: string) => string
  boardColumnsLabel: string
  boardLabel: string
  listLabel: string
  savedView: string
  saveView: string
  saveViewName: string
  search: string
  searchPlaceholder: string
  selectProjectFirst: string
}

// Default copy is English. It is the FALLBACK layer for consumers that do
// not provide their own copy via the copy={...} prop. The consuming
// app's LocaleProvider supplies zh-CN-first typed Copy bundles and is
// the primary copy source. Use this default only when the consumer has
// no app-layer LocaleProvider wired in.
const defaultWorkItemCopy: WorkItemCopy = {
  agentExecutionState: state => ({ queued: 'Queued', acknowledged: 'Acknowledged', planning: 'Planning', executing: 'Executing', awaiting_input: 'Awaiting input', awaiting_approval: 'Awaiting approval', blocked: 'Blocked', paused: 'Paused', stopping: 'Stopping', stale: 'Stale', completed: 'Completed', failed: 'Failed', canceled: 'Canceled' }[state] ?? state),
  allHumans: 'All Humans',
  allMilestones: 'All milestones',
  allPriorities: 'All priorities',
  allProjects: 'All projects',
  allStatuses: 'All statuses',
  boardColumn: name => `${name} column`,
  clearFilters: 'Clear filters',
  completedSubIssues: (completed, total) => `Sub-issues ${completed}/${total}`,
  dropWorkHere: 'Drop work here',
  filterLabel: 'Label',
  filterLess: 'Fewer filters',
  filterMilestone: 'Milestone',
  filterMore: 'More filters',
  filterPriority: 'Priority',
  filterProject: 'Project',
  filterResponsibleHuman: 'Responsible Human',
  filterStatus: 'Status',
  filtersLabel: 'Issue filters',
  labelAddPlaceholder: 'Change or add labels…',
  labelMenuAriaLabel: title => `Labels for ${title}`,
  labelMenuEmpty: 'No labels available yet.',
  labelMenuHeading: 'Labels',
  labelMenuRemoveAll: 'Remove all labels',
  labelMenuSuggestions: 'Suggestions',
  labelMoreCount: count => `+${count} labels`,
  loadMore: 'Load more work items',
  loading: 'Loading…',
  moveItem: title => `Move ${title}`,
  noActiveAgent: 'No active Agent',
  noResponsibleHuman: 'No responsible Human',
  openProject: name => `Open project ${name}`,
  priorityName: priority => ({ none: 'No priority', urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }[priority] ?? priority),
  boardColumnsLabel: 'Issue board columns',
  boardLabel: 'Issue board',
  listLabel: 'Issue list',
  savedView: 'Saved view',
  saveView: 'Save view',
  saveViewName: 'Saved view name',
  search: 'Search',
  searchPlaceholder: 'Search title or identifier',
  selectProjectFirst: 'Select a project first',
}

function resolveWorkItemCopy(copy?: Partial<WorkItemCopy>): WorkItemCopy {
  return { ...defaultWorkItemCopy, ...copy }
}

export type WorkItemStatusOption = { id: string; name: string; category?: string }
export type WorkItemMoveSource = 'pointer' | 'keyboard' | 'explicit-status-selector'
export type WorkItemMoveCallback = (item: WorkItemCardData, targetStatusId: string, source: WorkItemMoveSource) => void | Promise<void>
export type WorkItemLabelChangeCallback = (item: WorkItemCardData, nextLabels: string[]) => void | Promise<void>
export type WorkItemCardDensity = 'compact' | 'comfortable'
export type WorkItemCardProps = {
  item: WorkItemCardData
  layout?: 'list' | 'board'
  density?: WorkItemCardDensity
  statusOptions?: WorkItemStatusOption[]
  onOpen?: (item: WorkItemCardData) => void
  onOpenProject?: (projectId: string) => void
  onMove?: WorkItemMoveCallback
  onLabelsChange?: WorkItemLabelChangeCallback
  availableLabels?: string[]
  maxVisibleLabels?: number
  draggable?: boolean
  dragState?: 'idle' | 'dragging' | 'pending'
  className?: string
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
  copy?: Partial<WorkItemCopy>
  showStatusControl?: boolean
}

function workItemClassNames(...values: Array<string | false | null | undefined>): string { return values.filter(Boolean).join(' ') }
function handlePresentationPromise(callback: (() => void | Promise<void>) | undefined): void {
  if (!callback) return
  try {
    const result = callback()
    if (result && typeof (result as Promise<void>).catch === 'function') void (result as Promise<void>).catch(() => undefined)
  } catch { /* Feature controller owns errors; presentation remains render-safe. */ }
}

const MAX_LABELS_BOARD = 3
const MAX_LABELS_LIST = 4

type WorkItemLabelMenuProps = {
  align?: 'start' | 'end'
  availableLabels: string[]
  current: string[]
  hiddenLabels: string[]
  item: WorkItemCardData
  onLabelsChange?: WorkItemLabelChangeCallback
  onOpenChange: (open: boolean) => void
  open: boolean
  text: WorkItemCopy
  title: string
}

function WorkItemLabelMenu({ align = 'start', availableLabels, current, hiddenLabels, item, onLabelsChange, onOpenChange, open, text, title }: WorkItemLabelMenuProps) {
  const [query, setQuery] = useState('')
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number; placement: 'start' | 'end' } | null>(null)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelPortalRef = useRef<HTMLDivElement | null>(null)
  const toggle = (label: string) => {
    if (!onLabelsChange) return
    const next = current.includes(label) ? current.filter(existing => existing !== label) : [...current, label]
    handlePresentationPromise(() => onLabelsChange(item, next))
  }
  const removeAll = () => {
    if (!onLabelsChange || current.length === 0) return
    handlePresentationPromise(() => onLabelsChange(item, []))
  }
  const addCustom = () => {
    const trimmed = query.trim()
    if (!onLabelsChange || !trimmed || current.includes(trimmed)) return
    handlePresentationPromise(() => onLabelsChange(item, [...current, trimmed]))
    setQuery('')
  }
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (rootRef.current?.contains(target)) return
      if (panelPortalRef.current?.contains(target)) return
      onOpenChange(false)
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
  useEffect(() => {
    if (open) {
      const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
      const recompute = () => {
        const trigger = triggerRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const preferredWidth = Math.min(352, Math.max(256, rect.width + 160))
        const minLeft = 12
        const maxLeft = window.innerWidth - preferredWidth - 12
        const left = align === 'end' ? Math.max(minLeft, Math.min(maxLeft, rect.right - preferredWidth)) : Math.max(minLeft, Math.min(maxLeft, rect.left))
        const top = rect.bottom + 6
        setPanelPos({ left, top, width: preferredWidth, placement: align })
      }
      recompute()
      window.addEventListener('resize', recompute)
      window.addEventListener('scroll', recompute, true)
      return () => {
        window.clearTimeout(handle)
        window.removeEventListener('resize', recompute)
        window.removeEventListener('scroll', recompute, true)
      }
    }
    setPanelPos(null)
    return undefined
  }, [align, open])
  const currentSet = new Set(current)
  const normalizedQuery = query.trim().toLowerCase()
  const suggestions = availableLabels
    .filter(label => !currentSet.has(label) && (normalizedQuery === '' || label.toLowerCase().includes(normalizedQuery)))
  const matchedCurrent = normalizedQuery === '' ? current : current.filter(label => label.toLowerCase().includes(normalizedQuery))
  const customMatch = normalizedQuery !== '' && !availableLabels.some(label => label.toLowerCase() === normalizedQuery) && !currentSet.has(query.trim())
  const dotsToShow = hiddenLabels.slice(0, 3)
  const extraCount = hiddenLabels.length - dotsToShow.length
  const panel = open && panelPos ? (
    <div
      aria-label={text.labelMenuAriaLabel(title)}
      className={workItemClassNames('wm-work-item-label-menu-panel', `align-${align}`)}
      id={panelId}
      role="dialog"
      onPointerDown={event => event.stopPropagation()}
      ref={panelPortalRef}
      style={{ left: `${panelPos.left}px`, position: 'fixed', top: `${panelPos.top}px`, width: `${panelPos.width}px` }}
    >
      <label className="wm-work-item-label-menu-input">
        <span className="wm-visually-hidden">{text.labelAddPlaceholder}</span>
        <input
          aria-label={text.labelAddPlaceholder}
          onChange={event => setQuery(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom() } }}
          placeholder={text.labelAddPlaceholder}
          ref={inputRef}
          type="text"
          value={query}
        />
      </label>
      {suggestions.length > 0 && (
        <section aria-label={text.labelMenuSuggestions} className="wm-work-item-label-menu-section">
          <h4>{text.labelMenuSuggestions}</h4>
          <ul>{suggestions.map(label => <li key={label}><button aria-pressed="false" className={`wm-work-item-label-menu-row wm-label-${workItemLabelTone(label)}`} onClick={() => toggle(label)} type="button"><span aria-hidden="true" className="wm-work-item-label-menu-row-check" /><span className="wm-work-item-label-menu-row-name">{label}</span></button></li>)}</ul>
        </section>
      )}
      {current.length > 0 && (
        <section aria-label={text.labelMenuHeading} className="wm-work-item-label-menu-section">
          <h4>{text.labelMenuHeading}</h4>
          <ul>{matchedCurrent.map(label => <li key={label}><button aria-pressed="true" className={`wm-work-item-label-menu-row is-checked wm-label-${workItemLabelTone(label)}`} onClick={() => toggle(label)} type="button"><span aria-hidden="true" className="wm-work-item-label-menu-row-check">✓</span><span className="wm-work-item-label-menu-row-name">{label}</span></button></li>)}</ul>
          <button className="wm-work-item-label-menu-remove-all" disabled={!onLabelsChange} onClick={removeAll} type="button">{text.labelMenuRemoveAll}</button>
        </section>
      )}
      {current.length === 0 && suggestions.length === 0 && !customMatch && (
        <p className="wm-work-item-label-menu-empty">{text.labelMenuEmpty}</p>
      )}
      {customMatch && (
        <button className="wm-work-item-label-menu-custom" disabled={!onLabelsChange} onClick={addCustom} type="button">{text.labelAddPlaceholder} "{query.trim()}"</button>
      )}
    </div>
  ) : null
  return <div className="wm-work-item-label-menu" ref={rootRef}>
    <button
      aria-controls={panelId}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={text.labelMenuAriaLabel(title)}
      className="wm-work-item-label-more"
      onClick={() => onOpenChange(!open)}
      onPointerDown={event => event.stopPropagation()}
      ref={triggerRef}
      type="button"
    >
      <span aria-hidden="true" className="wm-work-item-label-more-dots">
        {dotsToShow.map(label => <span key={label} aria-hidden="true" className={`wm-work-item-label-more-dot wm-label-${workItemLabelTone(label)}`} />)}
      </span>
      {extraCount > 0 && <span className="wm-work-item-label-more-text">+{extraCount}</span>}
    </button>
    {panel}
  </div>
}

function workItemLabelTone(label: string): string {
  const normalized = label.toLowerCase()
  if (/security|safe|安全|blocker|阻塞/.test(normalized)) return 'danger'
  if (/migration|迁移|risk|风险/.test(normalized)) return 'warning'
  if (/module|模块|admin|管理/.test(normalized)) return 'info'
  if (/coord|协同|done|完成/.test(normalized)) return 'success'
  if (/type|类型|enhancement|增强/.test(normalized)) return 'accent'
  return 'neutral'
}

export function WorkItemCard({ availableLabels, className, copy, density = 'comfortable', draggable = false, dragState = 'idle', item, layout = 'list', maxVisibleLabels, onLabelsChange, onMove, onOpen, onOpenProject, onPointerDown, showStatusControl = true, statusOptions = [] }: WorkItemCardProps) {
  const text = resolveWorkItemCopy(copy)
  const [labelMenuOpen, setLabelMenuOpen] = useState(false)
  const move = (statusId: string, source: WorkItemMoveSource) => {
    if (!onMove || !statusId || statusId === item.statusId) return
    handlePresentationPromise(() => onMove(item, statusId, source))
  }
  const handleDragStart = (event: DragEvent<HTMLElement>) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id) }
  const stopPointer = (event: ReactPointerEvent<HTMLElement>) => event.stopPropagation()
  const hasFacts = Boolean(item.blockedByCount || item.blockingCount || item.subIssueCount)
  const hasLabels = Boolean(item.labels && item.labels.length > 0)
  const statusCategory = item.statusCategory ?? 'unknown'
  const subIssueTotal = item.subIssueCount ?? 0
  const subIssueDone = item.completedSubIssueCount ?? 0
  const subIssuePct = subIssueTotal > 0 ? Math.round((subIssueDone / subIssueTotal) * 100) : 0
  const visibleLimit = maxVisibleLabels ?? (layout === 'board' ? MAX_LABELS_BOARD : MAX_LABELS_LIST)
  const labels = item.labels ?? []
  const overflow = Math.max(0, labels.length - visibleLimit)
  const shownLabels = overflow > 0 ? labels.slice(0, visibleLimit) : labels
  const hiddenLabels = overflow > 0 ? labels.slice(visibleLimit) : []
  const canEditLabels = Boolean(onLabelsChange && availableLabels && availableLabels.length > 0)
  const showLabelRow = layout === 'board' || hasLabels
  const openLabelMenu = () => {
    if (!canEditLabels) return
    setLabelMenuOpen(true)
  }
  return <article aria-busy={dragState === 'pending' || undefined} aria-label={`${item.identifier}: ${item.title}`} className={workItemClassNames('wm-work-item-card', `wm-work-item-card-${layout}`, density === 'compact' && 'wm-work-item-card--compact', `wm-work-item-card-${dragState}`, labelMenuOpen && 'is-label-menu-open', className)} data-status-category={statusCategory} data-density={density} data-work-item-id={item.id} draggable={draggable && dragState !== 'pending'} onDragStart={draggable ? handleDragStart : undefined} onPointerDown={onPointerDown}>
    <div className="wm-work-item-card-heading">
      <span className="wm-work-item-identifier">{item.identifier}</span>
      {item.priority && <span className={workItemClassNames('wm-work-item-priority', `priority-${item.priority}`)}>{text.priorityName(item.priority)}</span>}
    </div>
    <button className="wm-work-item-title" onClick={() => handlePresentationPromise(onOpen ? () => onOpen(item) : undefined)} onPointerDown={stopPointer} type="button">{item.title}</button>
    {(layout === 'board' || (item.projectId && item.projectName)) && <div aria-hidden={!item.projectId || !item.projectName || undefined} className="wm-work-item-project-slot">{item.projectId && item.projectName && <button aria-label={text.openProject(item.projectName)} className="wm-work-item-project" onClick={() => handlePresentationPromise(onOpenProject ? () => onOpenProject(item.projectId!) : undefined)} onPointerDown={stopPointer} type="button"><FolderSimpleIcon aria-hidden="true" size={13} weight="bold" /><span>{item.projectName}</span></button>}</div>}
    <div className="wm-work-item-metadata"><span><UserCircleIcon aria-hidden="true" size={15} weight="fill" />{item.responsibleHuman ?? text.noResponsibleHuman}</span><span><RobotIcon aria-hidden="true" size={15} weight="duotone" />{item.activeAgent ? `${item.activeAgent}${item.activeAgentState ? ` · ${text.agentExecutionState(item.activeAgentState)}` : ''}` : text.noActiveAgent}</span></div>
    {showLabelRow && <div aria-hidden={!hasLabels || undefined} className={workItemClassNames('wm-work-item-labels', !hasLabels && 'is-empty')}>
      {shownLabels.map(label => canEditLabels
        ? <button aria-label={text.labelMenuAriaLabel(item.title)} className={`wm-work-item-label wm-label-${workItemLabelTone(label)}`} key={label} onClick={openLabelMenu} onPointerDown={stopPointer} type="button">{label}</button>
        : <span className={`wm-work-item-label wm-label-${workItemLabelTone(label)}`} key={label}>{label}</span>)}
      {overflow > 0 && <WorkItemLabelMenu
        align="end"
        availableLabels={availableLabels ?? []}
        current={labels}
        hiddenLabels={hiddenLabels}
        item={item}
        onLabelsChange={onLabelsChange}
        onOpenChange={setLabelMenuOpen}
        open={labelMenuOpen}
        text={text}
        title={item.title}
      />}
    </div>}
    {(layout === 'board' || hasFacts) && <div aria-hidden={!hasFacts || undefined} className={workItemClassNames('wm-work-item-facts', !hasFacts && 'is-empty')}>{item.blockedByCount ? <span className="wm-fact-blocker" title="被阻塞"><ProhibitIcon aria-hidden="true" size={14} weight="bold" />{item.blockedByCount}</span> : null}{item.blockingCount ? <span className="wm-fact-blocking" title="阻塞下游"><ProhibitIcon aria-hidden="true" size={14} weight="regular" />{item.blockingCount}</span> : null}{subIssueTotal > 0 ? <span className="wm-fact-sub-issue" title="子 Issue 进度"><span className="wm-sub-progress" aria-hidden="true"><span className="wm-sub-progress-fill" style={{ width: `${subIssuePct}%` }} /></span><GitBranchIcon aria-hidden="true" size={14} weight="bold" />{text.completedSubIssues(subIssueDone, subIssueTotal)}</span> : null}</div>}
    {showStatusControl && onMove && statusOptions.length > 0 && <label className="wm-work-item-status-control" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}><span className="wm-visually-hidden">{text.moveItem(item.title)}</span><select aria-label={text.moveItem(item.title)} disabled={dragState === 'pending'} onChange={(event: ChangeEvent<HTMLSelectElement>) => move(event.currentTarget.value, 'explicit-status-selector')} value={item.statusId}>{statusOptions.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select></label>}
  </article>
}

export type WorkItemListProps = { items: WorkItemCardData[]; statusOptions?: WorkItemStatusOption[]; density?: WorkItemCardDensity; onOpen?: (item: WorkItemCardData) => void; onOpenProject?: (projectId: string) => void; onMove?: WorkItemMoveCallback; onLabelsChange?: WorkItemLabelChangeCallback; availableLabels?: string[]; maxVisibleLabels?: number; empty?: ReactNode; copy?: Partial<WorkItemCopy> }
export function WorkItemList({ availableLabels, copy, density, empty = 'No work items match this view.', items, maxVisibleLabels, onLabelsChange, onMove, onOpen, onOpenProject, statusOptions = [] }: WorkItemListProps) {
  const text = resolveWorkItemCopy(copy)
  if (items.length === 0) return <section aria-label={text.listLabel} className="wm-work-item-list-empty" data-testid="work-items-empty">{empty}</section>
  return <section aria-label={text.listLabel} className="wm-work-item-list" data-testid="work-list">{items.map(item => <WorkItemCard availableLabels={availableLabels} copy={copy} density={density} item={item} key={item.id} layout="list" maxVisibleLabels={maxVisibleLabels} onLabelsChange={onLabelsChange} onMove={onMove} onOpen={onOpen} onOpenProject={onOpenProject} statusOptions={statusOptions} />)}</section>
}

export type WorkItemBoardProps = { items: WorkItemCardData[]; columns: WorkItemStatusOption[]; density?: WorkItemCardDensity; onOpen?: (item: WorkItemCardData) => void; onOpenProject?: (projectId: string) => void; onMove?: WorkItemMoveCallback; onLabelsChange?: WorkItemLabelChangeCallback; availableLabels?: string[]; maxVisibleLabels?: number; copy?: Partial<WorkItemCopy>; columnWidths?: Record<string, number>; onColumnWidthChange?: (columnId: string, width: number) => void; pannable?: boolean; minColumnWidth?: number; maxColumnWidth?: number }
const DEFAULT_COLUMN_WIDTH = 320
const MIN_COLUMN_WIDTH = 240
const MAX_COLUMN_WIDTH = 600
export function WorkItemBoard({ availableLabels, columnWidths, columns, copy, density, items, maxColumnWidth = MAX_COLUMN_WIDTH, maxVisibleLabels, minColumnWidth = MIN_COLUMN_WIDTH, onColumnWidthChange, onLabelsChange, onMove, onOpen, onOpenProject, pannable = true }: WorkItemBoardProps) {
  const text = resolveWorkItemCopy(copy)
  const draggedItem = useRef<string | null>(null)
  const [pointerItem, setPointerItem] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const itemFor = (id: string | null) => id ? items.find(item => item.id === id) : undefined
  const moveTo = (column: WorkItemStatusOption, source: WorkItemMoveSource, id: string | null) => { const item = itemFor(id); draggedItem.current = null; setPointerItem(null); setDropColumn(null); if (item && item.statusId !== column.id) handlePresentationPromise(onMove ? () => onMove(item, column.id, source) : undefined) }
  const handleDrop = (column: WorkItemStatusOption, event: DragEvent<HTMLDivElement>) => { event.preventDefault(); moveTo(column, 'pointer', event.dataTransfer.getData('text/plain') || draggedItem.current) }
  const startResize = (column: WorkItemStatusOption) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onColumnWidthChange) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidths?.[column.id] ?? DEFAULT_COLUMN_WIDTH
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMovePointer = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const next = Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.round(startWidth + delta)))
      onColumnWidthChange(column.id, next)
    }
    const onUpPointer = () => {
      target.removeEventListener('pointermove', onMovePointer)
      target.removeEventListener('pointerup', onUpPointer)
      target.removeEventListener('pointercancel', onUpPointer)
    }
    target.addEventListener('pointermove', onMovePointer)
    target.addEventListener('pointerup', onUpPointer)
    target.addEventListener('pointercancel', onUpPointer)
  }
  const onPointerDownBoard = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pannable) return
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.wm-work-item-card') || target.closest('.wm-work-item-status-control') || target.closest('button, select, a, input, textarea')) return
    const scroller = scrollRef.current
    if (!scroller) return
    panning.current = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop }
    setIsPanning(true)
    const target_el = event.currentTarget
    target_el.setPointerCapture(event.pointerId)
    const onMovePointer = (moveEvent: PointerEvent) => {
      if (!panning.current || !scroller) return
      scroller.scrollLeft = panning.current.left - (moveEvent.clientX - panning.current.x)
      scroller.scrollTop = panning.current.top - (moveEvent.clientY - panning.current.y)
    }
    const onUpPointer = () => {
      panning.current = null
      setIsPanning(false)
      target_el.removeEventListener('pointermove', onMovePointer)
      target_el.removeEventListener('pointerup', onUpPointer)
      target_el.removeEventListener('pointercancel', onUpPointer)
    }
    target_el.addEventListener('pointermove', onMovePointer)
    target_el.addEventListener('pointerup', onUpPointer)
    target_el.addEventListener('pointercancel', onUpPointer)
  }
  return <section aria-label={text.boardLabel} className={workItemClassNames('wm-work-item-board', isPanning && 'is-panning')} data-testid="board" tabIndex={0}><div aria-label={text.boardColumnsLabel} className="wm-work-item-board-scroll" onPointerDown={onPointerDownBoard} ref={scrollRef} role="region" tabIndex={0}>{columns.map((column, columnIndex) => { const columnItems = items.filter(item => item.statusId === column.id); const statusCategory = column.category ?? 'unknown'; const width = columnWidths?.[column.id] ?? DEFAULT_COLUMN_WIDTH; return <div aria-label={text.boardColumn(column.name)} className={workItemClassNames('wm-work-item-column', dropColumn === column.id && 'is-drop-target')} data-status-category={statusCategory} data-testid={`column-${column.id}`} data-workflow-state-id={column.id} key={column.id} style={{ flex: `0 0 ${width}px` }} onDragOver={event => { event.preventDefault(); setDropColumn(column.id) }} onDragLeave={() => setDropColumn(current => current === column.id ? null : current)} onDrop={event => handleDrop(column, event)} onPointerUp={() => moveTo(column, 'pointer', pointerItem ?? draggedItem.current)} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const next = columns[columnIndex + (event.key === 'ArrowRight' ? 1 : -1)]; if (next) document.querySelector<HTMLElement>(`[data-workflow-state-id="${CSS.escape(next.id)}"]`)?.focus() }} role="group" tabIndex={0}><header><h3>{column.name}</h3><span aria-label={`${columnItems.length} items`} className="wm-column-count">{columnItems.length}</span></header><div className="wm-work-item-column-items">{columnItems.map(item => <WorkItemCard availableLabels={availableLabels} copy={copy} density={density} draggable dragState={draggedItem.current === item.id ? 'dragging' : 'idle'} item={item} key={item.id} layout="board" maxVisibleLabels={maxVisibleLabels} onLabelsChange={onLabelsChange} onMove={onMove} onOpen={onOpen} onOpenProject={onOpenProject} onPointerDown={event => { if (event.target instanceof HTMLSelectElement) return; draggedItem.current = item.id; setPointerItem(item.id) }} statusOptions={columns} />)}</div><p className="wm-work-item-drop-hint">{text.dropWorkHere}</p>{onColumnWidthChange ? <div aria-hidden className="wm-work-item-column-resize" onPointerDown={startResize(column)} title="拖动调整列宽"><span className="wm-work-item-column-resize-grip" /></div> : null}</div> })}</div></section>
}

export type WorkItemFilterValues = { search?: string; statusId?: string; priority?: string; responsibleHumanActorId?: string; ownerId?: string; projectId?: string; milestoneId?: string; label?: string; statusCategory?: string; mine?: boolean }
export type WorkItemFilterOption = { id: string; label: string; name?: string }
export type WorkItemFiltersProps = { value: WorkItemFilterValues; statuses?: WorkItemFilterOption[]; humans?: WorkItemFilterOption[]; projects?: WorkItemFilterOption[]; milestones?: WorkItemFilterOption[]; savedViews?: Array<{ id: string; name: string }>; onChange: (value: WorkItemFilterValues) => void; onClear?: () => void; onApplySavedView?: (id: string) => void; onCreateSavedView?: (name: string) => void | Promise<void>; copy?: Partial<WorkItemCopy>; compact?: boolean; onCompactChange?: (next: boolean) => void }
export function WorkItemFilters({ compact, humans = [], milestones = [], onApplySavedView, onChange, onClear, onCompactChange, onCreateSavedView, projects = [], savedViews = [], statuses = [], value, copy }: WorkItemFiltersProps) {
  const text = resolveWorkItemCopy(copy)
  const [savedViewName, setSavedViewName] = useState('')
  // In compact mode, Milestone/Label collapse behind a "More filters" toggle.
  // The user-driven state is local to the component so the parent's filter
  // values never change just from expanding the row. When the parent supplies
  // an onCompactChange handler, the toggle also reports the new preference
  // back so the parent can persist it.
  const [advancedExpanded, setAdvancedExpanded] = useState<boolean>(!compact)
  const showAdvanced = !compact || advancedExpanded
  const toggleAdvanced = () => {
    const next = !advancedExpanded
    setAdvancedExpanded(next)
    // Report the parent's view of compact mode (the negation of the local
    // "are the advanced fields visible" state) so it can persist.
    if (onCompactChange) onCompactChange(!next)
  }
  const set = (key: keyof WorkItemFilterValues, next: string | boolean | undefined) => onChange({ ...value, [key]: next || undefined })
  const setResponsibleHuman = (next: string) => onChange({ ...value, responsibleHumanActorId: next || undefined, ownerId: undefined, mine: undefined })
  const setProject = (next: string) => onChange({ ...value, projectId: next || undefined, milestoneId: undefined })
  const submitSavedView = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!savedViewName.trim() || !onCreateSavedView) return; handlePresentationPromise(() => onCreateSavedView(savedViewName.trim())); setSavedViewName('') }
  return <section aria-label={text.filtersLabel} className="wm-work-item-filters">
    <div className="wm-work-item-filter-row">
      <label>{text.search}<input aria-label={text.search} onChange={event => set('search', event.currentTarget.value)} placeholder={text.searchPlaceholder} value={value.search ?? ''} /></label>
      <label>{text.filterStatus}<select aria-label={text.filterStatus} onChange={event => set('statusId', event.currentTarget.value)} value={value.statusId ?? ''}><option value="">{text.allStatuses}</option>{statuses.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label>{text.filterPriority}<select aria-label={text.filterPriority} onChange={event => set('priority', event.currentTarget.value)} value={value.priority ?? ''}><option value="">{text.allPriorities}</option>{['none', 'urgent', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{text.priorityName(priority)}</option>)}</select></label>
      <label>{text.filterResponsibleHuman}<select aria-label={text.filterResponsibleHuman} onChange={event => setResponsibleHuman(event.currentTarget.value)} value={value.responsibleHumanActorId ?? value.ownerId ?? ''}><option value="">{text.allHumans}</option>{humans.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label>{text.filterProject}<select aria-label={text.filterProject} onChange={event => setProject(event.currentTarget.value)} value={value.projectId ?? ''}><option value="">{text.allProjects}</option>{projects.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      {showAdvanced && <label>{text.filterMilestone}<select aria-label={text.filterMilestone} disabled={!value.projectId} onChange={event => set('milestoneId', event.currentTarget.value)} value={value.milestoneId ?? ''}><option value="">{value.projectId ? text.allMilestones : text.selectProjectFirst}</option>{milestones.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
      {showAdvanced && <label>{text.filterLabel}<input aria-label={text.filterLabel} onChange={event => set('label', event.currentTarget.value)} placeholder={text.filterLabel} value={value.label ?? ''} /></label>}
      {compact && <Button aria-expanded={advancedExpanded} aria-label={advancedExpanded ? text.filterLess : text.filterMore} className="wm-work-item-filters-more" data-testid="work-item-filters-more" onClick={toggleAdvanced} type="button" variant="ghost">{advancedExpanded ? text.filterLess : text.filterMore}</Button>}
      {onClear && <Button icon={<FunnelXIcon size={16} weight="bold" />} onClick={onClear} type="button" variant="ghost">{text.clearFilters}</Button>}
    </div>
    {(savedViews.length > 0 || onCreateSavedView) && <div className="wm-work-item-filter-saved">
      {savedViews.length > 0 && <label className="wm-work-item-saved-views">{text.savedView}<select aria-label={text.savedView} defaultValue="" onChange={event => { if (event.currentTarget.value) onApplySavedView?.(event.currentTarget.value); event.currentTarget.value = '' }}><option value="">{text.savedView}</option>{savedViews.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>}
      {onCreateSavedView && <form className="wm-work-item-save-view" onSubmit={submitSavedView}><label className="wm-visually-hidden" htmlFor="wm-save-view-name">{text.saveViewName}</label><input id="wm-save-view-name" onChange={event => setSavedViewName(event.currentTarget.value)} placeholder={text.saveView} required value={savedViewName} /><Button icon={<FloppyDiskIcon size={16} weight="bold" />} type="submit">{text.saveView}</Button></form>}
    </div>}
  </section>
}

export type WorkSurfaceStateKind = 'initial' | 'loading' | 'ready' | 'empty' | 'refreshing' | 'forbidden' | 'conflict' | 'offline' | 'reconnecting' | 'error'
export type WorkSurfaceStateProps = { state: Exclude<WorkSurfaceStateKind, 'ready'>; title: string; description: string; actionLabel?: string; onAction?: () => void }
export function WorkSurfaceState({ actionLabel, description, onAction, state, title }: WorkSurfaceStateProps) { const urgent = state === 'error' || state === 'forbidden' || state === 'conflict'; const busy = state === 'loading' || state === 'refreshing' || state === 'reconnecting'; return <section aria-busy={busy || undefined} aria-live={urgent ? 'assertive' : 'polite'} className={workItemClassNames('wm-work-surface-state', `state-${state}`)} data-testid={`work-surface-state-${state}`} role={urgent ? 'alert' : 'status'}><span aria-hidden="true" className="wm-work-surface-state-marker" /><div><h2>{title}</h2><p>{description}</p></div>{actionLabel && onAction && <Button onClick={onAction} type="button">{actionLabel}</Button>}</section> }
export type WorkSurfacePaginationProps = { nextCursor: string | null; loading?: boolean; onLoadMore?: () => void | Promise<void>; copy?: Partial<Pick<WorkItemCopy, 'loadMore' | 'loading'>> }
export function WorkSurfacePagination({ copy, loading = false, nextCursor, onLoadMore }: WorkSurfacePaginationProps) { const text = resolveWorkItemCopy(copy); if (!nextCursor || !onLoadMore) return null; return <Button className="wm-work-surface-pagination" disabled={loading} onClick={() => handlePresentationPromise(onLoadMore)} type="button">{loading ? text.loading : text.loadMore}</Button> }
