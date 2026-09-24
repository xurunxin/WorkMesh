'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

// Overlay machinery shared by the overlay surfaces and dismissal-driven
// components (modal focus containment, dismissal layers, inert background
// synchronization, scroll locking). Internal only: never re-exported from
// the public barrel.

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
export type ModalLayer = {
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
export type DismissalLayer = {
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

export function eligibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter(element => isEligibleFocusTarget(element, root))
}

export function topModal(): ModalLayer | null {
  return modalStack.at(-1) ?? null
}

export function topDismissal(): DismissalLayer | null {
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

export function focusModalRoot(layer: ModalLayer): void {
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

export function coordinateDismissalTriggerActivation(event: {
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

export function useOverlayFocus(
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

export function useDismissalLayer(
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

export function handleModalBackdrop(event: { currentTarget: EventTarget & HTMLDivElement; defaultPrevented: boolean; stopPropagation: () => void; target: EventTarget }, layer: ModalLayer | null): void {
  if (event.defaultPrevented || event.target !== event.currentTarget || !layer || topModal() !== layer) return
  event.stopPropagation()
  if (suppressNextBackdropMouseDown) return
  if (topDismissal() || !layer.getDismissible()) return
  layer.onClose()
}
