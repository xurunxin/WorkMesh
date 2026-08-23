export type ListIntent = 'previous' | 'next' | 'peek' | 'escape'

export type KeyboardIntentEvent = Readonly<{
  altKey: boolean
  ctrlKey: boolean
  defaultPrevented: boolean
  isComposing: boolean
  key: string
  metaKey: boolean
  repeat: boolean
  shiftKey: boolean
  target: EventTarget | null
}>

const interactiveSelector = [
  'input',
  'select',
  'textarea',
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function targetElement(target: EventTarget | null): Element | null {
  return typeof Element !== 'undefined' && target instanceof Element ? target : null
}

function hasEditableAncestor(element: Element): boolean {
  const editable = element.closest<HTMLElement>('[contenteditable]')
  if (!editable) return false
  const value = editable.getAttribute('contenteditable')?.trim().toLowerCase()
  return value !== 'false'
}

export function isInteractiveKeyboardTarget(
  target: EventTarget | null,
  options: Readonly<{ allowAgentRovingLink?: boolean }> = {},
): boolean {
  const element = targetElement(target)
  if (!element) return false
  const rovingLink = element.closest<HTMLElement>('[data-agent-roving-link="true"]')
  if (options.allowAgentRovingLink && rovingLink) return false
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (hasEditableAncestor(element)) return true
  return Boolean(element.closest(interactiveSelector))
}

export function isPlainKeyboardIntent(
  event: KeyboardIntentEvent,
  options: Readonly<{ allowAgentRovingLink?: boolean }> = {},
): boolean {
  return !event.defaultPrevented
    && !event.repeat
    && !event.isComposing
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && !isInteractiveKeyboardTarget(event.target, options)
}

export function nextFocusedId(
  ids: readonly string[],
  currentId: string | null,
  direction: -1 | 1,
): string | null {
  if (ids.length === 0) return null
  const currentIndex = currentId === null ? -1 : ids.indexOf(currentId)
  if (currentIndex < 0) return ids[0] ?? null
  return ids[(currentIndex + direction + ids.length) % ids.length] ?? null
}

export function listIntent(event: KeyboardIntentEvent): ListIntent | null {
  if (!isPlainKeyboardIntent(event, { allowAgentRovingLink: true })) return null
  if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') return 'previous'
  if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') return 'next'
  if (event.key === ' ') return 'peek'
  if (event.key === 'Escape') return 'escape'
  return null
}
