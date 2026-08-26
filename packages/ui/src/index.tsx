'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
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
  type RefObject,
  type RefAttributes,
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

export type ButtonProps = PropsWithChildren<RefAttributes<HTMLButtonElement> & ButtonHTMLAttributes<HTMLButtonElement>> & {
  icon?: ReactNode
  iconPosition?: 'start' | 'end'
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ children, className, icon, iconPosition = 'start', variant = 'secondary', ...props }: ButtonProps) {
  return <button className={classNames('wm-button', `wm-button-${variant}`, 'ui-button', `ui-button-${variant}`, className)} {...props}>{icon && iconPosition === 'start' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}<span className="wm-button-label">{children}</span>{icon && iconPosition === 'end' && <span aria-hidden="true" className="wm-button-icon">{icon}</span>}</button>
}

export type InputProps = RefAttributes<HTMLInputElement> & InputHTMLAttributes<HTMLInputElement> & {
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
      <header className="app-brand"><strong>{productName}</strong>{actorName && <small>{actorName}</small>}</header>
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

const focusableSelector = [
  'button',
  '[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(', ')

type OverlayIdentity = symbol
type ModalLayer = {
  backdrop: HTMLElement
  backgroundElements: Set<HTMLElement>
  getDismissible: () => boolean
  getInitialFocus: () => HTMLElement | null
  id: OverlayIdentity
  lastFocused: HTMLElement | null
  onClose: () => void
  returnFocus: HTMLElement | null
  root: HTMLElement
}
type DismissalLayer = {
  contains: (target: Node) => boolean
  dismissed: boolean
  getRoot: () => HTMLElement | null
  getTrigger: () => HTMLElement | null
  id: OverlayIdentity
  onDismiss: () => void
  ownerModalId: OverlayIdentity | null
}
type InertRecord = { count: number; hadAttribute: boolean; value: boolean }
type ScrollLockSnapshot = {
  bodyStyle: string | null
  htmlStyle: string | null
  scrollX: number
  scrollY: number
}

const modalStack: ModalLayer[] = []
const dismissalStack: DismissalLayer[] = []
const inertRecords = new Map<HTMLElement, InertRecord>()
const handledDismissalPointerEvents = new WeakSet<Event>()
let activeBackgroundElements = new Set<HTMLElement>()
let scrollLockSnapshot: ScrollLockSnapshot | null = null
let backgroundObserver: MutationObserver | null = null
let listenersAttached = false
let redirectingFocus = false
let suppressNextBackdropMouseDown = false
let compatibilitySuppressionEpoch = 0
let compatibilitySuppressionTimer: number | null = null

function elementIsHidden(element: HTMLElement, boundary?: HTMLElement): boolean {
  const closedDetails = element.closest('details:not([open])')
  if (closedDetails) {
    const summary = closedDetails.querySelector(':scope > summary')
    if (!(summary instanceof HTMLElement) || !summary.contains(element)) return true
  }
  let current: HTMLElement | null = element
  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true' || current.inert || current.hasAttribute('inert')) return true
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true
    if (current === boundary) break
    current = current.parentElement
  }
  return false
}

function elementIsDisabled(element: HTMLElement): boolean {
  if (element.getAttribute('aria-disabled') === 'true') return true
  if (
    (element instanceof HTMLButtonElement
      || element instanceof HTMLInputElement
      || element instanceof HTMLSelectElement
      || element instanceof HTMLTextAreaElement)
    && element.disabled
  ) return true
  return Boolean(element.closest('fieldset:disabled'))
}

function isEligibleFocusTarget(element: HTMLElement | null, boundary?: HTMLElement): element is HTMLElement {
  if (!element?.isConnected || (boundary && !boundary.contains(element))) return false
  if (elementIsHidden(element, boundary) || elementIsDisabled(element)) return false
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false
  if (element.tabIndex < 0) return false
  return element.matches(focusableSelector)
}

function eligibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter(element => isEligibleFocusTarget(element, root))
}

function topModal(): ModalLayer | null {
  return modalStack.at(-1) ?? null
}

function topDismissal(): DismissalLayer | null {
  const ownerId = topModal()?.id ?? null
  for (let index = dismissalStack.length - 1; index >= 0; index -= 1) {
    const layer = dismissalStack[index]
    if (layer?.ownerModalId === ownerId) return layer
  }
  return null
}

function owningModal(element: HTMLElement | null): ModalLayer | null {
  if (!element) return null
  for (let index = modalStack.length - 1; index >= 0; index -= 1) {
    const layer = modalStack[index]
    if (layer?.root.contains(element)) return layer
  }
  return null
}

function focusModalRoot(layer: ModalLayer): void {
  if (!layer.root.isConnected || elementIsHidden(layer.root)) return
  layer.root.focus({ preventScroll: true })
  layer.lastFocused = layer.root
}

function focusInitialModalTarget(layer: ModalLayer): void {
  const explicit = layer.getInitialFocus()
  if (isEligibleFocusTarget(explicit, layer.root)) {
    explicit.focus()
    layer.lastFocused = explicit
    return
  }
  const first = eligibleControls(layer.root)[0]
  if (first) {
    first.focus()
    layer.lastFocused = first
    return
  }
  focusModalRoot(layer)
}

function focusReturnTarget(layer: ModalLayer): void {
  if (isEligibleFocusTarget(layer.returnFocus)) {
    layer.returnFocus.focus({ preventScroll: true })
    return
  }
  const parent = topModal()
  if (parent) {
    focusModalRoot(parent)
    return
  }
  const main = document.getElementById('workmesh-main')
  if (main instanceof HTMLElement && main.isConnected && !elementIsHidden(main)) main.focus({ preventScroll: true })
}

function acquireInert(element: HTMLElement): void {
  const existing = inertRecords.get(element)
  if (existing) {
    existing.count += 1
    return
  }
  const record = { count: 1, hadAttribute: element.hasAttribute('inert'), value: element.inert }
  inertRecords.set(element, record)
  element.inert = true
  element.setAttribute('inert', '')
}

function releaseInert(element: HTMLElement): void {
  const record = inertRecords.get(element)
  if (!record) return
  record.count -= 1
  if (record.count > 0) return
  inertRecords.delete(element)
  element.inert = record.value
  if (record.hadAttribute) element.setAttribute('inert', '')
  else element.removeAttribute('inert')
}

function backgroundSiblings(root: HTMLElement): Set<HTMLElement> {
  const siblings = new Set<HTMLElement>()
  let current: HTMLElement | null = root
  while (current?.parentElement) {
    const parent: HTMLElement = current.parentElement
    for (const sibling of parent.children) {
      if (sibling !== current && sibling instanceof HTMLElement) siblings.add(sibling)
    }
    if (parent === document.body) break
    current = parent
  }
  return siblings
}

function syncBackgroundInert(): void {
  for (const element of activeBackgroundElements) releaseInert(element)
  activeBackgroundElements = new Set<HTMLElement>()
  const layer = topModal()
  if (!layer?.root.isConnected) return
  activeBackgroundElements = backgroundSiblings(layer.root)
  layer.backgroundElements = activeBackgroundElements
  for (const element of activeBackgroundElements) acquireInert(element)
}

function acquireScrollLock(): void {
  if (scrollLockSnapshot) return
  const root = document.documentElement
  const body = document.body
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  scrollLockSnapshot = {
    bodyStyle: body.getAttribute('style'),
    htmlStyle: root.getAttribute('style'),
    scrollX,
    scrollY,
  }
  const scrollbarWidth = root.clientWidth > 0 ? Math.max(0, window.innerWidth - root.clientWidth) : 0
  const bodyPaddingRight = Number.parseFloat(getComputedStyle(body).paddingRight) || 0
  root.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `${-scrollY}px`
  body.style.left = `${-scrollX}px`
  body.style.right = '0'
  body.style.width = '100%'
  if (scrollbarWidth > 0) body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`
}

function releaseScrollLock(): void {
  const snapshot = scrollLockSnapshot
  if (!snapshot) return
  scrollLockSnapshot = null
  if (snapshot.htmlStyle === null) document.documentElement.removeAttribute('style')
  else document.documentElement.setAttribute('style', snapshot.htmlStyle)
  if (snapshot.bodyStyle === null) document.body.removeAttribute('style')
  else document.body.setAttribute('style', snapshot.bodyStyle)
  if (snapshot.scrollX !== 0 || snapshot.scrollY !== 0) window.scrollTo(snapshot.scrollX, snapshot.scrollY)
}

function updateLayerDepths(): void {
  modalStack.forEach((layer, index) => {
    layer.backdrop.dataset.overlayDepth = String(index)
    layer.backdrop.style.setProperty('--wm-overlay-depth', String(index * 2))
  })
  dismissalStack.forEach((layer, index) => {
    const root = layer.getRoot()
    if (!root) return
    root.dataset.dismissalDepth = String(index)
    root.style.setProperty('--wm-dismissal-depth', String(index))
  })
}

function containTopModalTab(event: globalThis.KeyboardEvent, layer: ModalLayer): void {
  const controls = eligibleControls(layer.root)
  if (controls.length === 0) {
    event.preventDefault()
    event.stopPropagation()
    focusModalRoot(layer)
    return
  }
  const first = controls[0]!
  const last = controls.at(-1)!
  const active = document.activeElement
  if (event.shiftKey && (active === first || !layer.root.contains(active))) {
    event.preventDefault()
    event.stopPropagation()
    last.focus()
  } else if (!event.shiftKey && (active === last || !layer.root.contains(active))) {
    event.preventDefault()
    event.stopPropagation()
    first.focus()
  }
}

function restoreDismissalFocus(layer: DismissalLayer): void {
  const trigger = layer.getTrigger()
  if (isEligibleFocusTarget(trigger)) {
    trigger.focus({ preventScroll: true })
    return
  }
  const owner = modalStack.find(candidate => candidate.id === layer.ownerModalId) ?? topModal()
  if (owner) focusModalRoot(owner)
  else {
    const main = document.getElementById('workmesh-main')
    if (main instanceof HTMLElement && main.isConnected && !elementIsHidden(main)) main.focus({ preventScroll: true })
  }
}

function dismissTopLayer(layer: DismissalLayer): void {
  if (topDismissal() !== layer || layer.dismissed) return
  layer.dismissed = true
  layer.onDismiss()
  restoreDismissalFocus(layer)
}

function coordinateDismissalTriggerActivation(event: {
  currentTarget: EventTarget & HTMLElement
  defaultPrevented: boolean
  detail: number
}): void {
  // Pointer activation is coordinated by pointerdown so the compatibility
  // mouse/click chain stays idempotent. Keyboard and assistive-technology
  // activation emits click(detail=0) without pointerdown and must retire a
  // sibling dismissal before its trigger opens the next layer.
  if (event.defaultPrevented || event.detail !== 0) return
  const dismissal = topDismissal()
  if (!dismissal || dismissal.contains(event.currentTarget)) return
  const controlledId = event.currentTarget.getAttribute('aria-controls')
  const controlled = controlledId ? document.getElementById(controlledId) : null
  if (controlled && dismissal.contains(controlled)) return
  dismissTopLayer(dismissal)
  event.currentTarget.focus({ preventScroll: true })
}

function handleOverlayKeydown(event: globalThis.KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    const dismissal = topDismissal()
    if (dismissal) {
      event.preventDefault()
      event.stopPropagation()
      dismissTopLayer(dismissal)
      return
    }
    const modal = topModal()
    if (!modal) return
    event.preventDefault()
    event.stopPropagation()
    if (modal.getDismissible()) modal.onClose()
    return
  }
  if (event.key === 'Tab') {
    const modal = topModal()
    if (modal) containTopModalTab(event, modal)
  }
}

function handleOverlayPointerdown(event: PointerEvent): void {
  if (event.defaultPrevented) return
  const dismissal = topDismissal()
  if (!dismissal || !(event.target instanceof Node) || dismissal.contains(event.target)) return
  const nextTrigger = event.target instanceof Element
    ? event.target.closest<HTMLElement>('[data-wm-dismissal-trigger="true"]')
    : null
  if (nextTrigger) {
    handledDismissalPointerEvents.add(event)
    dismissTopLayer(dismissal)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  handledDismissalPointerEvents.add(event)
  resetCompatibilitySuppression()
  suppressNextBackdropMouseDown = true
  const epoch = compatibilitySuppressionEpoch
  compatibilitySuppressionTimer = window.setTimeout(() => {
    if (epoch === compatibilitySuppressionEpoch) {
      suppressNextBackdropMouseDown = false
      compatibilitySuppressionTimer = null
    }
  }, 0)
  dismissTopLayer(dismissal)
}

function handleOverlayPointerdownCapture(event: PointerEvent): void {
  const dismissal = topDismissal()
  if (!dismissal || !(event.target instanceof Node) || dismissal.contains(event.target)) return
  queueMicrotask(() => {
    if (handledDismissalPointerEvents.has(event) || event.defaultPrevented || topDismissal() !== dismissal || dismissal.contains(event.target as Node)) return
    handledDismissalPointerEvents.add(event)
    dismissTopLayer(dismissal)
  })
}

function resetCompatibilitySuppression(): void {
  compatibilitySuppressionEpoch += 1
  suppressNextBackdropMouseDown = false
  if (compatibilitySuppressionTimer !== null) {
    window.clearTimeout(compatibilitySuppressionTimer)
    compatibilitySuppressionTimer = null
  }
}

function handleSuppressedCompatibilityEvent(event: MouseEvent): void {
  if (!suppressNextBackdropMouseDown) return
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  if (event.type === 'click') resetCompatibilitySuppression()
}

function handleOverlayFocusin(event: FocusEvent): void {
  if (redirectingFocus || !(event.target instanceof HTMLElement)) return
  const modal = topModal()
  if (!modal || modal.root.contains(event.target)) {
    if (modal && modal.root.contains(event.target)) modal.lastFocused = event.target
    return
  }
  const dismissal = topDismissal()
  const dismissalRoot = dismissal?.getRoot()
  if (dismissal?.ownerModalId === modal.id && dismissalRoot?.contains(event.target)) return
  redirectingFocus = true
  const target = isEligibleFocusTarget(modal.lastFocused, modal.root)
    ? modal.lastFocused
    : eligibleControls(modal.root)[0]
  if (target) target.focus({ preventScroll: true })
  else focusModalRoot(modal)
  redirectingFocus = false
}

function syncOverlayListeners(): void {
  const needed = modalStack.length > 0 || dismissalStack.length > 0
  if (needed === listenersAttached) return
  listenersAttached = needed
  if (needed) {
    document.addEventListener('keydown', handleOverlayKeydown)
    document.addEventListener('pointerdown', handleOverlayPointerdownCapture, true)
    document.addEventListener('pointerdown', handleOverlayPointerdown)
    document.addEventListener('mousedown', handleSuppressedCompatibilityEvent, true)
    document.addEventListener('click', handleSuppressedCompatibilityEvent, true)
    document.addEventListener('focusin', handleOverlayFocusin)
  } else {
    document.removeEventListener('keydown', handleOverlayKeydown)
    document.removeEventListener('pointerdown', handleOverlayPointerdownCapture, true)
    document.removeEventListener('pointerdown', handleOverlayPointerdown)
    document.removeEventListener('mousedown', handleSuppressedCompatibilityEvent, true)
    document.removeEventListener('click', handleSuppressedCompatibilityEvent, true)
    document.removeEventListener('focusin', handleOverlayFocusin)
    resetCompatibilitySuppression()
  }
}

function clearDismissalDepth(layer: DismissalLayer): void {
  const root = layer.getRoot()
  root?.removeAttribute('data-dismissal-depth')
  root?.style.removeProperty('--wm-dismissal-depth')
}

function retireDismissalsOutsideTopModal(): void {
  const ownerId = topModal()?.id ?? null
  const retiring = dismissalStack.filter(layer => layer.ownerModalId !== ownerId)
  if (retiring.length === 0) return
  for (const layer of retiring) {
    const index = dismissalStack.findIndex(candidate => candidate.id === layer.id)
    if (index >= 0) dismissalStack.splice(index, 1)
    clearDismissalDepth(layer)
    if (!layer.dismissed) {
      layer.dismissed = true
      layer.onDismiss()
    }
  }
}

function rebindDismissalOwnersFromDom(): void {
  for (const layer of dismissalStack) {
    const owner = owningModal(layer.getTrigger() ?? layer.getRoot())
    layer.ownerModalId = owner?.id ?? null
  }
}

function registerModal(layer: ModalLayer): void {
  if (modalStack.some(candidate => candidate.id === layer.id)) return
  let index = modalStack.length
  for (let candidateIndex = 0; candidateIndex < modalStack.length; candidateIndex += 1) {
    const candidate = modalStack[candidateIndex]
    if (candidate && layer.root.contains(candidate.root)) {
      index = candidateIndex
      layer.returnFocus = candidate.returnFocus
      break
    }
  }
  modalStack.splice(index, 0, layer)
  rebindDismissalOwnersFromDom()
  retireDismissalsOutsideTopModal()
  if (modalStack.length === 1) acquireScrollLock()
  syncBackgroundInert()
  if (!backgroundObserver) {
    backgroundObserver = new MutationObserver(() => syncBackgroundInert())
    backgroundObserver.observe(document.body, { childList: true, subtree: true })
  }
  updateLayerDepths()
  syncOverlayListeners()
  if (topModal() === layer) focusInitialModalTarget(layer)
}

function unregisterModal(layer: ModalLayer): void {
  const index = modalStack.findIndex(candidate => candidate.id === layer.id)
  if (index < 0) return
  const wasTop = topModal() === layer
  modalStack.splice(index, 1)
  layer.backdrop.removeAttribute('data-overlay-depth')
  layer.backdrop.style.removeProperty('--wm-overlay-depth')
  syncBackgroundInert()
  if (modalStack.length === 0) {
    backgroundObserver?.disconnect()
    backgroundObserver = null
    releaseScrollLock()
  }
  updateLayerDepths()
  syncOverlayListeners()
  if (wasTop) focusReturnTarget(layer)
}

function registerDismissal(layer: DismissalLayer): void {
  if (dismissalStack.some(candidate => candidate.id === layer.id)) return
  if (layer.ownerModalId !== (topModal()?.id ?? null)) {
    layer.onDismiss()
    return
  }
  let index = dismissalStack.length
  for (let candidateIndex = 0; candidateIndex < dismissalStack.length; candidateIndex += 1) {
    const candidate = dismissalStack[candidateIndex]
    const candidateAnchor = candidate?.getTrigger() ?? candidate?.getRoot()
    if (candidate && candidateAnchor && layer.contains(candidateAnchor)) {
      index = candidateIndex
      break
    }
  }
  dismissalStack.splice(index, 0, layer)
  updateLayerDepths()
  syncOverlayListeners()
}

function unregisterDismissal(layer: DismissalLayer): void {
  const index = dismissalStack.findIndex(candidate => candidate.id === layer.id)
  if (index < 0) {
    clearDismissalDepth(layer)
    return
  }
  const wasTop = topDismissal() === layer
  dismissalStack.splice(index, 1)
  clearDismissalDepth(layer)
  updateLayerDepths()
  syncOverlayListeners()
  if (wasTop && !layer.dismissed) restoreDismissalFocus(layer)
}

function useOverlayFocus(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  backdropRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null> | undefined,
  dismissible: boolean,
  onClose: () => void,
): RefObject<ModalLayer | null> {
  const identityRef = useRef<OverlayIdentity>(Symbol('modal-layer'))
  const closeRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const initialRef = useRef(initialFocusRef)
  const layerRef = useRef<ModalLayer | null>(null)
  closeRef.current = onClose
  dismissibleRef.current = dismissible
  initialRef.current = initialFocusRef
  useLayoutEffect(() => {
    if (!open || !rootRef.current || !backdropRef.current) return
    const layer: ModalLayer = {
      backdrop: backdropRef.current,
      backgroundElements: new Set<HTMLElement>(),
      getDismissible: () => dismissibleRef.current,
      getInitialFocus: () => initialRef.current?.current ?? null,
      id: identityRef.current,
      lastFocused: null,
      onClose: () => closeRef.current(),
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      root: rootRef.current,
    }
    layerRef.current = layer
    registerModal(layer)
    return () => {
      unregisterModal(layer)
      if (layerRef.current === layer) layerRef.current = null
    }
  }, [backdropRef, open, rootRef])
  return layerRef
}

function useDismissalLayer(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  onOpenChange: (open: boolean) => void,
  floatingRef?: RefObject<HTMLElement | null>,
): void {
  const identityRef = useRef<OverlayIdentity>(Symbol('dismissal-layer'))
  const openChangeRef = useRef(onOpenChange)
  openChangeRef.current = onOpenChange
  useEffect(() => {
    if (!open || !rootRef.current) return
    const layer: DismissalLayer = {
      contains: target => Boolean(rootRef.current?.contains(target) || floatingRef?.current?.contains(target) || triggerRef.current?.contains(target)),
      dismissed: false,
      getRoot: () => floatingRef?.current ?? rootRef.current,
      getTrigger: () => triggerRef.current,
      id: identityRef.current,
      onDismiss: () => openChangeRef.current(false),
      ownerModalId: owningModal(triggerRef.current ?? rootRef.current)?.id ?? null,
    }
    registerDismissal(layer)
    return () => unregisterDismissal(layer)
  }, [floatingRef, open, rootRef, triggerRef])
}

function handleModalBackdrop(event: { currentTarget: EventTarget & HTMLDivElement; defaultPrevented: boolean; stopPropagation: () => void; target: EventTarget }, layer: ModalLayer | null): void {
  if (event.defaultPrevented || event.target !== event.currentTarget || !layer || topModal() !== layer) return
  event.stopPropagation()
  if (suppressNextBackdropMouseDown) return
  if (topDismissal() || !layer.getDismissible()) return
  layer.onClose()
}

export type DialogProps = PropsWithChildren<{
  className?: string
  closeLabel?: string
  description?: string
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  title: string
}>

export function Dialog({ children, className, closeLabel = 'Close', description, dismissible = true, initialFocusRef, onClose, open, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useOverlayFocus(open, dialogRef, backdropRef, initialFocusRef, dismissible, onClose)
  useEffect(() => {
    const layer = layerRef.current
    if (open && !dismissible && layer && eligibleControls(layer.root).length === 0) focusModalRoot(layer)
  }, [dismissible, layerRef, open])
  if (!open) return null
  return <div className="wm-overlay ui-dialog-backdrop" onMouseDown={event => handleModalBackdrop(event, layerRef.current)} ref={backdropRef}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-dialog', 'ui-dialog', className)} ref={dialogRef} role="dialog" tabIndex={-1}>
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>{dismissible && <Button aria-label={`${closeLabel} ${title}`} icon={<XIcon aria-hidden size={16} />} onClick={() => { const layer = layerRef.current; if (layer && topModal() === layer && !topDismissal()) layer.onClose() }} type="button" variant="ghost">{closeLabel}</Button>}</header>
      <div className="wm-dialog-content ui-dialog-content">{children}</div>
    </section>
  </div>
}

export type SheetProps = PropsWithChildren<{
  className?: string
  closeLabel?: string
  description?: string
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
}>

export function Sheet({ children, className, closeLabel = 'Close', description, dismissible = true, initialFocusRef, onClose, open, side = 'right', title }: SheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const sheetRef = useRef<HTMLElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const layerRef = useOverlayFocus(open, sheetRef, backdropRef, initialFocusRef, dismissible, onClose)
  useEffect(() => {
    const layer = layerRef.current
    if (open && !dismissible && layer && eligibleControls(layer.root).length === 0) focusModalRoot(layer)
  }, [dismissible, layerRef, open])
  if (!open) return null
  return <div className="wm-overlay wm-sheet-overlay" onMouseDown={event => handleModalBackdrop(event, layerRef.current)} ref={backdropRef}>
    <section aria-describedby={description ? descriptionId : undefined} aria-labelledby={titleId} aria-modal="true" className={classNames('wm-sheet', `wm-sheet-${side}`, className)} ref={sheetRef} role="dialog" tabIndex={-1}>
      <header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div>{dismissible && <Button aria-label={`${closeLabel} ${title}`} onClick={() => { const layer = layerRef.current; if (layer && topModal() === layer && !topDismissal()) layer.onClose() }} type="button" variant="ghost">{closeLabel}</Button>}</header>
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
  useDismissalLayer(open, rootRef, triggerRef, onOpenChange)
  return <div className="wm-popover" ref={rootRef}>
    <button aria-controls={panelId} aria-expanded={open} aria-haspopup="dialog" className="wm-popover-trigger" data-wm-dismissal-trigger="true" onClick={event => { coordinateDismissalTriggerActivation(event); onOpenChange(!open) }} ref={triggerRef} type="button">{trigger}</button>
    {open && <div aria-label={label} className={classNames('wm-popover-panel', `wm-popover-${align}`)} id={panelId} role="dialog">{children}</div>}
  </div>
}

export type TabItem = { id: string; label: string; panel: ReactNode }
export type TabsProps = {
  ariaLabel: string
  compact?: boolean
  onValueChange: (value: string) => void
  tabs: TabItem[]
  value: string
}

export function Tabs({ ariaLabel, compact = false, onValueChange, tabs, value }: TabsProps) {
  const baseId = useId()
  const selected = tabs.find(tab => tab.id === value) ?? tabs[0]
  const compactLabelId = `${baseId}-compact-label`
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
  // When compact, render a native <select> so the tab list collapses into
  // a single form control on narrow viewports. The select still drives the
  // same onValueChange handler so the active panel and any controlled
  // parent state stay in lock-step with the keyboard/button variant.
  if (compact) {
    return <div className="wm-tabs wm-tabs-compact">
      <label className="wm-tab-list-compact">
        <span className="wm-visually-hidden" id={compactLabelId}>{selected?.label ?? ariaLabel}</span>
        <Select aria-label={ariaLabel} className="wm-tab-select" value={selected?.id ?? ''} onChange={event => onValueChange(event.currentTarget.value)}>
          {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </Select>
      </label>
      {selected && <div aria-labelledby={compactLabelId} className="wm-tab-panel" id={`${baseId}-panel-${selected.id}`} role="tabpanel">{selected.panel}</div>}
    </div>
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
    {tabs.map(tab => {
      const active = tab.id === selected?.id
      return <div
        aria-labelledby={`${baseId}-tab-${tab.id}`}
        className="wm-tab-panel"
        hidden={!active}
        id={`${baseId}-panel-${tab.id}`}
        key={tab.id}
        role="tabpanel"
      >{active ? tab.panel : null}</div>
    })}
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
  headingLevel?: 1 | 2
  subtitle?: string
  title?: string
}

export function Card({ actions, children, className, headingLevel = 2, subtitle, title, ...props }: CardProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return <section className={classNames('wm-card', className)} {...props}>
    {(title || subtitle || actions) && <header><div>{title && <Heading>{title}</Heading>}{subtitle && <p>{subtitle}</p>}</div>{actions}</header>}
    <div className="wm-card-content">{children}</div>
  </section>
}

export type ToastProps = {
  dismissLabel?: string
  dismissText?: string
  message: string
  onBlurCapture?: HTMLAttributes<HTMLElement>['onBlurCapture']
  onDismiss?: () => void
  onFocusCapture?: HTMLAttributes<HTMLElement>['onFocusCapture']
  onPointerEnter?: HTMLAttributes<HTMLElement>['onPointerEnter']
  onPointerLeave?: HTMLAttributes<HTMLElement>['onPointerLeave']
  open: boolean
  title?: string
  toastId?: string
  tone?: 'info' | 'success' | 'warning' | 'danger'
}

export function Toast({
  dismissLabel = 'Dismiss notification',
  dismissText = 'Dismiss',
  message,
  onBlurCapture,
  onDismiss,
  onFocusCapture,
  onPointerEnter,
  onPointerLeave,
  open,
  title,
  toastId,
  tone = 'info',
}: ToastProps) {
  if (!open) return null
  const urgent = tone === 'danger' || tone === 'warning'
  return <aside
    aria-atomic={true}
    className={classNames('wm-toast', `wm-toast-${tone}`)}
    data-toast-id={toastId}
    onBlurCapture={onBlurCapture}
    onFocusCapture={onFocusCapture}
    onPointerEnter={onPointerEnter}
    onPointerLeave={onPointerLeave}
    role={urgent ? 'alert' : 'status'}
  >
    <div>{title && <strong>{title}</strong>}<p>{message}</p></div>
    {onDismiss && <Button aria-label={dismissLabel} data-toast-close-id={toastId} onClick={onDismiss} type="button" variant="ghost">{dismissText}</Button>}
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
  layout?: 'list' | 'board' | 'adaptive'
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
  activeTriggerRef: RefObject<HTMLButtonElement | null>
  align?: 'start' | 'end'
  anchorVersion: number
  availableLabels: string[]
  current: string[]
  hiddenLabels: string[]
  item: WorkItemCardData
  onLabelsChange?: WorkItemLabelChangeCallback
  onOpenChange: (open: boolean) => void
  open: boolean
  panelId: string
  showTrigger: boolean
  text: WorkItemCopy
  title: string
}

function WorkItemLabelMenu({ activeTriggerRef, align = 'start', anchorVersion, availableLabels, current, hiddenLabels, item, onLabelsChange, onOpenChange, open, panelId, showTrigger, text, title }: WorkItemLabelMenuProps) {
  const [query, setQuery] = useState('')
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number; placement: 'start' | 'end' } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
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
  useDismissalLayer(open, rootRef, activeTriggerRef, onOpenChange, panelPortalRef)
  useEffect(() => {
    if (open) {
      const handle = window.setTimeout(() => inputRef.current?.focus(), 0)
      const recompute = () => {
        const trigger = activeTriggerRef.current ?? moreTriggerRef.current
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
  }, [activeTriggerRef, align, anchorVersion, open])
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
    {showTrigger && <button
      aria-controls={panelId}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={text.labelMenuAriaLabel(title)}
      className="wm-work-item-label-more"
      data-wm-dismissal-trigger="true"
      onClick={event => {
        coordinateDismissalTriggerActivation(event)
        activeTriggerRef.current = event.currentTarget
        onOpenChange(!open)
      }}
      onPointerDown={event => event.stopPropagation()}
      ref={moreTriggerRef}
      type="button"
    >
      <span aria-hidden="true" className="wm-work-item-label-more-dots">
        {dotsToShow.map(label => <span key={label} aria-hidden="true" className={`wm-work-item-label-more-dot wm-label-${workItemLabelTone(label)}`} />)}
      </span>
      {extraCount > 0 && <span className="wm-work-item-label-more-text">+{extraCount}</span>}
    </button>}
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
  const [labelMenuAnchorVersion, setLabelMenuAnchorVersion] = useState(0)
  const labelMenuId = useId()
  const labelMenuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const move = (statusId: string, source: WorkItemMoveSource) => {
    if (!onMove || !statusId || statusId === item.statusId) return
    handlePresentationPromise(() => onMove(item, statusId, source))
  }
  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    if (layout === 'adaptive' && !event.currentTarget.closest('.wm-work-item-adaptive[data-layout="board"]')) {
      event.currentTarget.classList.remove('wm-work-item-card-dragging')
      event.preventDefault()
      return
    }
    if (layout === 'adaptive') event.currentTarget.classList.add('wm-work-item-card-dragging')
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
  }
  const handleDragEnd = (event: DragEvent<HTMLElement>) => {
    if (layout === 'adaptive') event.currentTarget.classList.remove('wm-work-item-card-dragging')
  }
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
  const showStableLayoutSlots = layout === 'board' || layout === 'adaptive'
  const showLabelRow = showStableLayoutSlots || hasLabels
  const openLabelMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!canEditLabels) return
    coordinateDismissalTriggerActivation(event)
    labelMenuTriggerRef.current = event.currentTarget
    setLabelMenuAnchorVersion(version => version + 1)
    setLabelMenuOpen(true)
  }
  return <article aria-busy={dragState === 'pending' || undefined} aria-label={`${item.identifier}: ${item.title}`} className={workItemClassNames('wm-work-item-card', `wm-work-item-card-${layout}`, density === 'compact' && 'wm-work-item-card--compact', `wm-work-item-card-${dragState}`, labelMenuOpen && 'is-label-menu-open', className)} data-status-category={statusCategory} data-density={density} data-work-item-id={item.id} draggable={draggable && dragState !== 'pending'} onDragEnd={draggable ? handleDragEnd : undefined} onDragStart={draggable ? handleDragStart : undefined} onPointerDown={onPointerDown}>
    <div className="wm-work-item-card-heading">
      <span className="wm-work-item-identifier">{item.identifier}</span>
      <span className={workItemClassNames('wm-work-item-status-pill', `status-${statusCategory}`)}>{item.statusName}</span>
      {item.priority && <span className={workItemClassNames('wm-work-item-priority', `priority-${item.priority}`)}>{text.priorityName(item.priority)}</span>}
    </div>
    <button className="wm-work-item-title" onClick={() => handlePresentationPromise(onOpen ? () => onOpen(item) : undefined)} onPointerDown={stopPointer} type="button">{item.title}</button>
    {(showStableLayoutSlots || (item.projectId && item.projectName)) && <div aria-hidden={!item.projectId || !item.projectName || undefined} className={workItemClassNames('wm-work-item-project-slot', (!item.projectId || !item.projectName) && 'is-empty')}>{item.projectId && item.projectName && <button aria-label={text.openProject(item.projectName)} className="wm-work-item-project" onClick={() => handlePresentationPromise(onOpenProject ? () => onOpenProject(item.projectId!) : undefined)} onPointerDown={stopPointer} type="button"><FolderSimpleIcon aria-hidden="true" size={13} weight="bold" /><span>{item.projectName}</span></button>}</div>}
    <div className="wm-work-item-metadata"><span><UserCircleIcon aria-hidden="true" size={15} weight="fill" />{item.responsibleHuman ?? text.noResponsibleHuman}</span><span><RobotIcon aria-hidden="true" size={15} weight="duotone" />{item.activeAgent ? `${item.activeAgent}${item.activeAgentState ? ` · ${text.agentExecutionState(item.activeAgentState)}` : ''}` : text.noActiveAgent}</span></div>
    {showLabelRow && <div aria-hidden={!hasLabels || undefined} className={workItemClassNames('wm-work-item-labels', !hasLabels && 'is-empty')}>
      {shownLabels.map(label => canEditLabels
        ? <button aria-controls={labelMenuId} aria-expanded={labelMenuOpen} aria-haspopup="dialog" aria-label={text.labelMenuAriaLabel(item.title)} className={`wm-work-item-label wm-label-${workItemLabelTone(label)}`} key={label} onClick={openLabelMenu} onPointerDown={stopPointer} type="button">{label}</button>
        : <span className={`wm-work-item-label wm-label-${workItemLabelTone(label)}`} key={label}>{label}</span>)}
      {canEditLabels && hasLabels && <WorkItemLabelMenu
        activeTriggerRef={labelMenuTriggerRef}
        align="end"
        anchorVersion={labelMenuAnchorVersion}
        availableLabels={availableLabels ?? []}
        current={labels}
        hiddenLabels={hiddenLabels}
        item={item}
        onLabelsChange={onLabelsChange}
        onOpenChange={setLabelMenuOpen}
        open={labelMenuOpen}
        panelId={labelMenuId}
        showTrigger={overflow > 0}
        text={text}
        title={item.title}
      />}
    </div>}
    {(showStableLayoutSlots || hasFacts) && <div aria-hidden={!hasFacts || undefined} className={workItemClassNames('wm-work-item-facts', !hasFacts && 'is-empty')}>{item.blockedByCount ? <span className="wm-fact-blocker" title="被阻塞"><ProhibitIcon aria-hidden="true" size={14} weight="bold" />{item.blockedByCount}</span> : null}{item.blockingCount ? <span className="wm-fact-blocking" title="阻塞下游"><ProhibitIcon aria-hidden="true" size={14} weight="regular" />{item.blockingCount}</span> : null}{subIssueTotal > 0 ? <span className="wm-fact-sub-issue" title="子 Issue 进度"><span className="wm-sub-progress" aria-hidden="true"><span className="wm-sub-progress-fill" style={{ width: `${subIssuePct}%` }} /></span><GitBranchIcon aria-hidden="true" size={14} weight="bold" />{text.completedSubIssues(subIssueDone, subIssueTotal)}</span> : null}</div>}
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

export type WorkItemAdaptiveCollectionProps = WorkItemBoardProps & {
  empty?: ReactNode
  layout: 'list' | 'board'
}

type AdaptiveWorkItemCardProps = Pick<WorkItemCardProps,
  | 'availableLabels'
  | 'copy'
  | 'density'
  | 'item'
  | 'maxVisibleLabels'
  | 'onLabelsChange'
  | 'onMove'
  | 'onOpen'
  | 'onOpenProject'
  | 'statusOptions'
> & {
  onCardPointerDown: (itemId: string, event: ReactPointerEvent<HTMLElement>) => void
  order: number
}

const AdaptiveWorkItemCard = memo(function AdaptiveWorkItemCard({ item, onCardPointerDown, order, ...props }: AdaptiveWorkItemCardProps) {
  return <div className="wm-work-item-adaptive-card-slot" style={{ order }}>
    <WorkItemCard {...props} draggable item={item} layout="adaptive" onPointerDown={event => onCardPointerDown(item.id, event)} />
  </div>
})

type AdaptiveColumnProps = {
  cards: ReactNode
  column: WorkItemStatusOption
  columnIndex: number
  count: number
  dropTarget: boolean
  layout: 'list' | 'board'
  onColumnDragLeave: (columnId: string) => void
  onColumnDragOver: (columnId: string, event: DragEvent<HTMLDivElement>) => void
  onColumnDrop: (column: WorkItemStatusOption, event: DragEvent<HTMLDivElement>) => void
  onColumnKeyDown: (columnIndex: number, event: KeyboardEvent<HTMLDivElement>) => void
  onColumnPointerUp: (column: WorkItemStatusOption) => void
  onColumnResize: (column: WorkItemStatusOption, event: ReactPointerEvent<HTMLDivElement>) => void
  showResize: boolean
  text: WorkItemCopy
  width: number
}

const AdaptiveWorkItemColumn = memo(function AdaptiveWorkItemColumn({ cards, column, columnIndex, count, dropTarget, layout, onColumnDragLeave, onColumnDragOver, onColumnDrop, onColumnKeyDown, onColumnPointerUp, onColumnResize, showResize, text, width }: AdaptiveColumnProps) {
  const board = layout === 'board'
  return <div
    aria-label={board ? text.boardColumn(column.name) : undefined}
    className={workItemClassNames('wm-work-item-column', 'wm-work-item-adaptive-column', dropTarget && 'is-drop-target')}
    data-status-category={column.category ?? 'unknown'}
    data-testid={`column-${column.id}`}
    data-workflow-state-id={column.id}
    onDragLeave={board ? () => onColumnDragLeave(column.id) : undefined}
    onDragOver={board ? event => onColumnDragOver(column.id, event) : undefined}
    onDrop={board ? event => onColumnDrop(column, event) : undefined}
    onKeyDown={board ? event => onColumnKeyDown(columnIndex, event) : undefined}
    onPointerUp={board ? () => onColumnPointerUp(column) : undefined}
    role={board ? 'group' : 'presentation'}
    style={{ flex: `0 0 ${width}px` }}
    tabIndex={board ? 0 : -1}
  >
    <header className="wm-work-item-column-header" hidden={!board}><h3>{column.name}</h3><span aria-label={`${count} items`} className="wm-column-count">{count}</span></header>
    <div className="wm-work-item-column-items wm-work-item-adaptive-column-items">{cards}</div>
    <p className="wm-work-item-drop-hint" hidden={!board}>{text.dropWorkHere}</p>
    {showResize && <div aria-hidden className="wm-work-item-column-resize" hidden={!board} onPointerDown={event => onColumnResize(column, event)}><span className="wm-work-item-column-resize-grip" /></div>}
  </div>
})

/**
 * Keeps one keyed card tree mounted while the collection changes presentation.
 * The five column containers persist; list mode flattens them with CSS and uses
 * each card's source-order value, while board mode restores the grouped layout.
 */
export function WorkItemAdaptiveCollection({ availableLabels, columnWidths, columns, copy, density, empty = 'No work items match this view.', items, layout, maxColumnWidth = MAX_COLUMN_WIDTH, maxVisibleLabels, minColumnWidth = MIN_COLUMN_WIDTH, onColumnWidthChange, onLabelsChange, onMove, onOpen, onOpenProject, pannable = true }: WorkItemAdaptiveCollectionProps) {
  const text = useMemo(() => resolveWorkItemCopy(copy), [copy])
  const draggedItem = useRef<string | null>(null)
  const [pointerItem, setPointerItem] = useState<string | null>(null)
  const [dropColumn, setDropColumn] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const effectiveColumns = useMemo(() => {
    if (columns.length > 0) return columns
    const inferred = new Map<string, WorkItemStatusOption>()
    for (const item of items) {
      if (!inferred.has(item.statusId)) inferred.set(item.statusId, { id: item.statusId, name: item.statusName, category: item.statusCategory })
    }
    return [...inferred.values()]
  }, [columns, items])

  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const columnModels = useMemo(() => {
    const byColumn = new Map(effectiveColumns.map(column => [column.id, [] as Array<{ item: WorkItemCardData; order: number }>]))
    const fallbackColumnId = effectiveColumns[0]?.id
    items.forEach((item, order) => {
      const columnId = byColumn.has(item.statusId) ? item.statusId : fallbackColumnId
      if (columnId) byColumn.get(columnId)?.push({ item, order })
    })
    return effectiveColumns.map(column => ({ column, entries: byColumn.get(column.id) ?? [] }))
  }, [effectiveColumns, items])

  const onCardPointerDown = useCallback((itemId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (!event.currentTarget.closest('.wm-work-item-adaptive[data-layout="board"]')) return
    if (event.target instanceof HTMLSelectElement) return
    draggedItem.current = itemId
    setPointerItem(itemId)
  }, [])

  const cardColumns = useMemo(() => columnModels.map(({ column, entries }) => ({
    cards: entries.map(({ item, order }) => <AdaptiveWorkItemCard
      availableLabels={availableLabels}
      copy={copy}
      density={density}
      item={item}
      key={item.id}
      maxVisibleLabels={maxVisibleLabels}
      onCardPointerDown={onCardPointerDown}
      onLabelsChange={onLabelsChange}
      onMove={onMove}
      onOpen={onOpen}
      onOpenProject={onOpenProject}
      order={order}
      statusOptions={effectiveColumns}
    />),
    column,
    count: entries.length,
  })), [availableLabels, columnModels, copy, density, effectiveColumns, maxVisibleLabels, onCardPointerDown, onLabelsChange, onMove, onOpen, onOpenProject])

  const moveTo = useCallback((column: WorkItemStatusOption, source: WorkItemMoveSource, id: string | null) => {
    const item = id ? itemById.get(id) : undefined
    draggedItem.current = null
    setPointerItem(null)
    setDropColumn(null)
    if (item && item.statusId !== column.id) handlePresentationPromise(onMove ? () => onMove(item, column.id, source) : undefined)
  }, [itemById, onMove])

  const onColumnDragOver = useCallback((columnId: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDropColumn(columnId)
  }, [])
  const onColumnDragLeave = useCallback((columnId: string) => {
    setDropColumn(current => current === columnId ? null : current)
  }, [])
  const onColumnDrop = useCallback((column: WorkItemStatusOption, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    moveTo(column, 'pointer', event.dataTransfer.getData('text/plain') || draggedItem.current)
  }, [moveTo])
  const onColumnPointerUp = useCallback((column: WorkItemStatusOption) => {
    moveTo(column, 'pointer', pointerItem ?? draggedItem.current)
  }, [moveTo, pointerItem])
  const onColumnKeyDown = useCallback((columnIndex: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = effectiveColumns[columnIndex + (event.key === 'ArrowRight' ? 1 : -1)]
    if (next) scrollRef.current?.querySelector<HTMLElement>(`[data-workflow-state-id="${CSS.escape(next.id)}"]`)?.focus()
  }, [effectiveColumns])
  const onColumnResize = useCallback((column: WorkItemStatusOption, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onColumnWidthChange) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = columnWidths?.[column.id] ?? DEFAULT_COLUMN_WIDTH
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const onMovePointer = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      onColumnWidthChange(column.id, Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.round(startWidth + delta))))
    }
    const onUpPointer = () => {
      target.removeEventListener('pointermove', onMovePointer)
      target.removeEventListener('pointerup', onUpPointer)
      target.removeEventListener('pointercancel', onUpPointer)
    }
    target.addEventListener('pointermove', onMovePointer)
    target.addEventListener('pointerup', onUpPointer)
    target.addEventListener('pointercancel', onUpPointer)
  }, [columnWidths, maxColumnWidth, minColumnWidth, onColumnWidthChange])
  const onPointerDownBoard = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (layout !== 'board' || !pannable || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.wm-work-item-card') || target.closest('.wm-work-item-status-control') || target.closest('button, select, a, input, textarea')) return
    const scroller = scrollRef.current
    if (!scroller) return
    panning.current = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop }
    setIsPanning(true)
    const pointerTarget = event.currentTarget
    pointerTarget.setPointerCapture(event.pointerId)
    const onMovePointer = (moveEvent: PointerEvent) => {
      if (!panning.current) return
      scroller.scrollLeft = panning.current.left - (moveEvent.clientX - panning.current.x)
      scroller.scrollTop = panning.current.top - (moveEvent.clientY - panning.current.y)
    }
    const onUpPointer = () => {
      panning.current = null
      setIsPanning(false)
      pointerTarget.removeEventListener('pointermove', onMovePointer)
      pointerTarget.removeEventListener('pointerup', onUpPointer)
      pointerTarget.removeEventListener('pointercancel', onUpPointer)
    }
    pointerTarget.addEventListener('pointermove', onMovePointer)
    pointerTarget.addEventListener('pointerup', onUpPointer)
    pointerTarget.addEventListener('pointercancel', onUpPointer)
  }, [layout, pannable])

  if (items.length === 0) return <section aria-label={text.listLabel} className="wm-work-item-list-empty" data-testid="work-items-empty">{empty}</section>
  return <section
    aria-label={layout === 'board' ? text.boardLabel : text.listLabel}
    className={workItemClassNames('wm-work-item-adaptive', isPanning && 'is-panning')}
    data-layout={layout}
    data-testid={layout === 'board' ? 'board' : 'work-list'}
    tabIndex={layout === 'board' ? 0 : undefined}
  >
    <div
      aria-label={layout === 'board' ? text.boardColumnsLabel : undefined}
      className="wm-work-item-board-scroll wm-work-item-adaptive-scroll"
      onPointerDown={onPointerDownBoard}
      ref={scrollRef}
      role={layout === 'board' ? 'region' : undefined}
      tabIndex={layout === 'board' ? 0 : undefined}
    >{cardColumns.map(({ cards, column, count }, columnIndex) => <AdaptiveWorkItemColumn
      cards={cards}
      column={column}
      columnIndex={columnIndex}
      count={count}
      dropTarget={dropColumn === column.id}
      key={column.id}
      layout={layout}
      onColumnDragLeave={onColumnDragLeave}
      onColumnDragOver={onColumnDragOver}
      onColumnDrop={onColumnDrop}
      onColumnKeyDown={onColumnKeyDown}
      onColumnPointerUp={onColumnPointerUp}
      onColumnResize={onColumnResize}
      showResize={Boolean(onColumnWidthChange)}
      text={text}
      width={columnWidths?.[column.id] ?? DEFAULT_COLUMN_WIDTH}
    />)}</div>
  </section>
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
      <label>{text.search}<input aria-label={text.search} data-hotkey-filter="true" onChange={event => set('search', event.currentTarget.value)} placeholder={text.searchPlaceholder} value={value.search ?? ''} /></label>
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

export type AttentionKind = 'decision' | 'approval' | 'clarification' | 'conflict' | 'recovery' | 'completion_review'
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type UrgencyLevel = 'normal' | 'soon' | 'urgent' | 'overdue'
export type FreshnessState = 'fresh' | 'partial' | 'stale' | 'offline'
export type RunHealth = 'healthy' | 'degraded' | 'stalled' | 'failed' | 'unknown'
export type LifecycleState = 'open' | 'seen' | 'applying' | 'decided' | 'verified' | 'failed' | 'expired' | 'superseded'

type SemanticBadgeProps<T extends string> = {
  categoryLabel: string
  label: string
  value: T
}

function SemanticBadge<T extends string>({ categoryLabel, label, value }: SemanticBadgeProps<T>) {
  return <Badge aria-label={`${categoryLabel}: ${label}`} className={`wm-semantic-badge wm-semantic-${value}`} data-semantic-value={value}>{label}</Badge>
}

export function AttentionKindBadge(props: SemanticBadgeProps<AttentionKind>) { return <SemanticBadge {...props} /> }
export function RiskBadge(props: SemanticBadgeProps<RiskLevel>) { return <SemanticBadge {...props} /> }
export function UrgencyBadge(props: SemanticBadgeProps<UrgencyLevel>) { return <SemanticBadge {...props} /> }
export function FreshnessBadge(props: SemanticBadgeProps<FreshnessState>) { return <SemanticBadge {...props} /> }
export function RunHealthBadge(props: SemanticBadgeProps<RunHealth>) { return <SemanticBadge {...props} /> }
export function LifecycleBadge(props: SemanticBadgeProps<LifecycleState>) { return <SemanticBadge {...props} /> }

export type ActorAttributionProps = {
  activeAgent?: { label: string; name: string } | null
  relationshipLabel?: string
  responsibleHuman: { label: string; name: string }
}

export function ActorAttribution({ activeAgent, relationshipLabel, responsibleHuman }: ActorAttributionProps) {
  return <dl className="wm-actor-attribution">
    <div className="wm-actor-human"><dt><UserCircleIcon aria-hidden="true" size={16} />{responsibleHuman.label}</dt><dd>{responsibleHuman.name}</dd></div>
    {activeAgent && <div className="wm-actor-agent"><dt><RobotIcon aria-hidden="true" size={16} />{activeAgent.label}</dt><dd>{activeAgent.name}</dd></div>}
    {activeAgent && relationshipLabel && <div className="wm-actor-relationship"><dt>{relationshipLabel}</dt><dd>{activeAgent.name} / {responsibleHuman.name}</dd></div>}
  </dl>
}

export type ProjectControlNavigationItem = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> & {
  active?: boolean
  badge?: string
  href: string
  id: string
  label: string
}

export function ProjectControlNavigation({ items, label }: { items: readonly ProjectControlNavigationItem[]; label: string }) {
  return <nav aria-label={label} className="wm-project-navigation"><ul>{items.map(item => <li key={item.id}><a aria-current={item.active ? 'page' : undefined} className={item.active ? 'is-active' : undefined} href={item.href} onClick={item.onClick}>{item.label}{item.badge && <span>{item.badge}</span>}</a></li>)}</ul></nav>
}

export type ControlCenterSectionProps = PropsWithChildren<{
  action?: ReactNode
  count: number
  description?: string
  title: string
  tone: 'attention' | 'running' | 'risk' | 'verified'
}>

export function ControlCenterSection({ action, children, count, description, title, tone }: ControlCenterSectionProps) {
  const headingId = useId()
  return <section aria-labelledby={headingId} className={`wm-control-section wm-control-section-${tone}`}>
    <header><div><span aria-hidden="true" className="wm-control-section-marker" /><h2 id={headingId}>{title}</h2><span className="wm-control-section-count">{count}</span></div>{action}</header>
    {description && <p className="wm-control-section-description">{description}</p>}
    <div className="wm-control-section-content">{children}</div>
  </section>
}

export type AttentionListItemProps = {
  actions?: ReactNode
  actor?: ReactNode
  badges?: ReactNode
  description: string
  metadata?: ReactNode
  title: string
}

export function AttentionListItem({ actions, actor, badges, description, metadata, title }: AttentionListItemProps) {
  return <article className="wm-attention-item">
    <div className="wm-attention-item-main"><div className="wm-attention-item-badges">{badges}</div><h3>{title}</h3><p>{description}</p>{actor}{metadata && <div className="wm-attention-item-meta">{metadata}</div>}</div>
    {actions && <div className="wm-attention-item-actions">{actions}</div>}
  </article>
}

export function AttentionCard(props: AttentionListItemProps) { return <div className="wm-attention-card"><AttentionListItem {...props} /></div> }

export type RunStatusBarProps = {
  completed: number
  label: string
  total: number
}

export function RunStatusBar({ completed, label, total }: RunStatusBarProps) {
  const safeTotal = Math.max(0, total)
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal)
  return <div className="wm-run-status" aria-label={label} role="group">
    <div aria-hidden="true" className="wm-run-status-segments">{Array.from({ length: safeTotal }, (_, index) => <span className={index < safeCompleted ? 'is-complete' : ''} key={index} />)}</div>
    <span>{safeCompleted}/{safeTotal}</span>
  </div>
}

export type RunDigestCardProps = PropsWithChildren<{
  actions?: ReactNode
  attribution: ReactNode
  badges?: ReactNode
  description?: string
  status: ReactNode
  title: string
}>

export function RunDigestCard({ actions, attribution, badges, children, description, status, title }: RunDigestCardProps) {
  return <article className="wm-run-digest">
    <header><div><div className="wm-run-digest-badges">{badges}</div><h3>{title}</h3>{description && <p>{description}</p>}</div><div className="wm-run-digest-status">{status}</div></header>
    {attribution}
    {children && <div className="wm-run-digest-details">{children}</div>}
    {actions && <footer>{actions}</footer>}
  </article>
}

export type PlanStep = {
  description?: string
  id: string
  label: string
  state: 'complete' | 'current' | 'pending' | 'blocked'
}

export function PlanStepRail({ label, steps }: { label: string; steps: readonly PlanStep[] }) {
  return <ol aria-label={label} className="wm-plan-step-rail">{steps.map(step => <li className={`state-${step.state}`} key={step.id}><span aria-hidden="true" className="wm-plan-step-marker" /><div><strong>{step.label}</strong>{step.description && <span>{step.description}</span>}</div></li>)}</ol>
}

export type TimelineEntry = {
  actor?: string
  description: string
  id: string
  label: string
  time: string
}

export function CausalTimeline({ entries, label }: { entries: readonly TimelineEntry[]; label: string }) {
  return <ol aria-label={label} className="wm-causal-timeline">{entries.map(entry => <li key={entry.id}><span aria-hidden="true" className="wm-causal-marker" /><div><header><strong>{entry.label}</strong><time dateTime={entry.time}>{entry.time}</time></header><p>{entry.description}</p>{entry.actor && <small>{entry.actor}</small>}</div></li>)}</ol>
}

export function TechnicalEventGroup({ children, count, label }: PropsWithChildren<{ count: number; label: string }>) {
  return <details className="wm-technical-events"><summary>{label}<span>{count}</span></summary><div>{children}</div></details>
}

export type EvidenceReference = {
  description?: string
  href: string
  id: string
  label: string
  typeLabel: string
}

export function EvidenceReferenceList({ evidence, label }: { evidence: readonly EvidenceReference[]; label: string }) {
  return <ul aria-label={label} className="wm-evidence-list">{evidence.map(reference => <li key={reference.id}><a href={reference.href}><strong>{reference.label}</strong><span>{reference.typeLabel}</span>{reference.description && <small>{reference.description}</small>}</a></li>)}</ul>
}

export function EvidenceDrawer({ children, closeLabel, description, onClose, open, title }: PropsWithChildren<{ closeLabel: string; description?: string; onClose: () => void; open: boolean; title: string }>) {
  return <Sheet closeLabel={closeLabel} description={description} onClose={onClose} open={open} title={title}>{children}</Sheet>
}

export type ConsequencePreviewDialogProps = {
  cancelLabel: string
  confirmLabel: string
  consequences: readonly string[]
  description: string
  onCancel: () => void
  onConfirm: () => void
  open: boolean
  title: string
}

export function ConsequencePreviewDialog({ cancelLabel, confirmLabel, consequences, description, onCancel, onConfirm, open, title }: ConsequencePreviewDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  return <Dialog closeLabel={cancelLabel} description={description} initialFocusRef={cancelRef} onClose={onCancel} open={open} title={title}>
    <ul className="wm-consequence-list">{consequences.map(consequence => <li key={consequence}>{consequence}</li>)}</ul>
    <div className="wm-consequence-actions"><Button onClick={onConfirm} type="button" variant="danger">{confirmLabel}</Button><Button onClick={onCancel} ref={cancelRef} type="button">{cancelLabel}</Button></div>
  </Dialog>
}

export type AffectedResource = { href?: string; id: string; label: string; typeLabel: string }
export function AffectedResourceList({ label, resources }: { label: string; resources: readonly AffectedResource[] }) {
  return <ul aria-label={label} className="wm-resource-list">{resources.map(resource => <li key={resource.id}><span>{resource.typeLabel}</span>{resource.href ? <a href={resource.href}>{resource.label}</a> : <strong>{resource.label}</strong>}</li>)}</ul>
}

export function ReasonCodeList({ label, reasons }: { label: string; reasons: readonly Readonly<{ code: string; explanation: string }>[] }) {
  return <dl aria-label={label} className="wm-reason-list">{reasons.map(reason => <div key={reason.code}><dt><code>{reason.code}</code></dt><dd>{reason.explanation}</dd></div>)}</dl>
}

export type ControlCapability = { enabled: boolean; id: string; label: string; reason?: string }
export function ControlCapabilityBar({ capabilities, label, onSelect }: { capabilities: readonly ControlCapability[]; label: string; onSelect?: (id: string) => void }) {
  return <div aria-label={label} className="wm-capability-bar" role="toolbar">{capabilities.map(capability => <Button aria-describedby={capability.reason ? `wm-capability-${capability.id}-reason` : undefined} disabled={!capability.enabled} key={capability.id} onClick={() => onSelect?.(capability.id)} type="button" variant="ghost">{capability.label}{capability.reason && <span className="wm-visually-hidden" id={`wm-capability-${capability.id}-reason`}>{capability.reason}</span>}</Button>)}</div>
}
