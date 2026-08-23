// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TOAST_DURATION_MS,
  toastStore,
  useToast,
} from './use-toast'

function ToastCount(): React.ReactNode {
  return createElement('output', null, useToast().toasts.length)
}

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toastStore.reset()
    document.body.innerHTML = '<main id="workmesh-main" tabindex="-1"></main>'
  })

  afterEach(() => {
    toastStore.reset()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps a pre-subscription push and publishes an immutable snapshot to every subscriber', () => {
    toastStore.push({ title: 'Before mount', tone: 'info' })
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = toastStore.subscribe(first)
    const unsubscribeSecond = toastStore.subscribe(second)

    toastStore.push({ title: 'After mount', tone: 'success' })

    expect(toastStore.getSnapshot().map((toast) => toast.title)).toEqual([
      'Before mount',
      'After mount',
    ])
    expect(Object.isFrozen(toastStore.getSnapshot())).toBe(true)
    expect(Object.isFrozen(toastStore.getSnapshot()[0])).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubscribeFirst()
    unsubscribeSecond()
  })

  it('uses one frozen empty server snapshot and hydrates the current client snapshot without losing a pre-mount push', async () => {
    const serverSnapshot = toastStore.getServerSnapshot()
    expect(serverSnapshot).toBe(toastStore.getServerSnapshot())
    expect(Object.isFrozen(serverSnapshot)).toBe(true)

    toastStore.push({ title: 'Queued before hydration', tone: 'error' })
    const markup = renderToString(createElement(ToastCount))
    expect(markup).toContain('0')

    const container = document.createElement('div')
    container.innerHTML = markup
    document.body.append(container)
    vi.useRealTimers()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, createElement(ToastCount))
    })
    await waitFor(() => expect(container.textContent).toBe('1'))
    await act(async () => root?.unmount())
  })

  it('replaces an explicit dedupe key, resets its timer, and adopts the latest valid focus origin', () => {
    const firstTrigger = document.createElement('button')
    const latestTrigger = document.createElement('button')
    document.body.append(firstTrigger, latestTrigger)
    firstTrigger.focus()
    const firstId = toastStore.push({
      title: 'Saving',
      tone: 'info',
      dedupeKey: 'save-team',
    })

    vi.advanceTimersByTime(4_000)
    latestTrigger.focus()
    const secondId = toastStore.push({
      title: 'Saved',
      description: 'The team is ready.',
      tone: 'success',
      dedupeKey: 'save-team',
    })

    expect(secondId).toBe(firstId)
    expect(toastStore.getSnapshot()).toHaveLength(1)
    expect(toastStore.getSnapshot()[0]?.title).toBe('Saved')
    expect(toastStore.getReturnFocus(firstId)).toBe(latestTrigger)
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(toastStore.getSnapshot()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('stacks different keys and resumes the exact remaining lifetime only after pointer and focus pauses clear', () => {
    const firstId = toastStore.push({ title: 'First', tone: 'success', dedupeKey: 'first' })
    toastStore.push({ title: 'Second', tone: 'success', dedupeKey: 'second' })
    vi.advanceTimersByTime(1_250)

    toastStore.pause(firstId, 'pointer')
    toastStore.pause(firstId, 'focus')
    vi.advanceTimersByTime(10_000)
    toastStore.resume(firstId, 'pointer')
    vi.advanceTimersByTime(10_000)
    expect(toastStore.getSnapshot().some((toast) => toast.id === firstId)).toBe(true)

    toastStore.resume(firstId, 'focus')
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1_250 - 1)
    expect(toastStore.getSnapshot().some((toast) => toast.id === firstId)).toBe(true)
    vi.advanceTimersByTime(1)
    expect(toastStore.getSnapshot().some((toast) => toast.id === firstId)).toBe(false)
  })

  it('keeps both active pause reasons across a same-key replacement', () => {
    const id = toastStore.push({ title: 'Saving', tone: 'info', dedupeKey: 'save' })
    toastStore.pause(id, 'pointer')
    toastStore.pause(id, 'focus')

    toastStore.push({ title: 'Saved', tone: 'success', dedupeKey: 'save' })
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2)
    expect(toastStore.getSnapshot()).toHaveLength(1)
    toastStore.resume(id, 'pointer')
    vi.advanceTimersByTime(TOAST_DURATION_MS * 2)
    expect(toastStore.getSnapshot()).toHaveLength(1)
    toastStore.resume(id, 'focus')
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(toastStore.getSnapshot()).toHaveLength(0)
  })

  it('rejects focus origins hidden by an ancestor and drops an older origin once it becomes invalid', () => {
    const firstContainer = document.createElement('div')
    const firstTrigger = document.createElement('button')
    firstContainer.append(firstTrigger)
    const hiddenContainer = document.createElement('div')
    const hiddenTrigger = document.createElement('button')
    hiddenContainer.style.display = 'none'
    hiddenContainer.append(hiddenTrigger)
    document.body.append(firstContainer, hiddenContainer)

    firstTrigger.focus()
    const id = toastStore.push({ title: 'Saving', tone: 'error', dedupeKey: 'save' })
    firstContainer.style.visibility = 'collapse'
    hiddenTrigger.focus()
    toastStore.push({ title: 'Failed', tone: 'error', dedupeKey: 'save' })

    expect(toastStore.getReturnFocus(id)).toBeNull()
  })

  it('skips a captured control hidden after its details owner closes and falls back to main', async () => {
    const details = document.createElement('details')
    details.open = true
    const summary = document.createElement('summary')
    summary.textContent = 'Actions'
    const trigger = document.createElement('button')
    details.append(summary, trigger)
    document.body.append(details)
    trigger.focus()
    const id = toastStore.push({ title: 'Persistent', tone: 'error' })
    details.open = false

    const toast = document.createElement('aside')
    toast.dataset.toastId = id
    const close = document.createElement('button')
    close.dataset.toastCloseId = id
    toast.append(close)
    document.body.append(toast)
    close.focus()
    toastStore.dismiss(id)
    toast.remove()
    await Promise.resolve()

    expect(document.activeElement).toBe(document.querySelector('#workmesh-main'))
  })

  it('never moves focus on push or expiry and reset clears timers, origins, and state while notifying subscribers', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const listener = vi.fn()
    const unsubscribe = toastStore.subscribe(listener)
    const id = toastStore.push({ title: 'Transient', tone: 'success' })
    expect(document.activeElement).toBe(trigger)
    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(document.activeElement).toBe(trigger)

    const persistentId = toastStore.push({ title: 'Persistent', tone: 'error' })
    expect(toastStore.getReturnFocus(persistentId)).toBe(trigger)
    toastStore.reset()
    expect(toastStore.getSnapshot()).toHaveLength(0)
    expect(toastStore.getReturnFocus(persistentId)).toBeNull()
    expect(listener).toHaveBeenCalledTimes(4)
    expect(vi.getTimerCount()).toBe(0)
    expect(toastStore.push({ title: 'Fresh', tone: 'error' })).toBe('toast-1')
    unsubscribe()
  })
})

describe('useToast', () => {
  beforeEach(() => toastStore.reset())
  afterEach(() => toastStore.reset())

  it('shares one external-store snapshot across hook consumers', () => {
    const first = renderHook(() => useToast())
    const second = renderHook(() => useToast())

    act(() => first.result.current.push({ title: 'Shared', tone: 'success' }))

    expect(first.result.current.toasts).toEqual(second.result.current.toasts)
    expect(second.result.current.toasts[0]?.title).toBe('Shared')
  })
})
