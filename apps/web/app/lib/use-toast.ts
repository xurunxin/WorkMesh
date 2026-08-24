'use client'

import { useSyncExternalStore } from 'react'

export const TOAST_DURATION_MS = 5_000

export type ToastTone = 'info' | 'success' | 'error'
export type ToastPauseReason = 'pointer' | 'focus'

export type ToastInput = Readonly<{
  title: string
  description?: string
  tone: ToastTone
  dedupeKey?: string
}>

export type Toast = Readonly<ToastInput & { id: string }>

type Listener = () => void

type ToastRuntime = {
  remainingMs: number
  startedAt: number | null
  timer: ReturnType<typeof setTimeout> | null
  pauseReasons: Set<ToastPauseReason>
  returnFocus: HTMLElement | null
}

const EMPTY_TOASTS: readonly Toast[] = Object.freeze([])
let snapshot: readonly Toast[] = EMPTY_TOASTS
let nextId = 0
const listeners = new Set<Listener>()
const runtimes = new Map<string, ToastRuntime>()

function emit(): void {
  for (const listener of listeners) listener()
}

function isValidFocusOrigin(element: Element | null): element is HTMLElement {
  if (typeof HTMLElement === 'undefined' || !(element instanceof HTMLElement)) return false
  if (!element.isConnected || element === document.body || element === document.documentElement) return false
  if (element.matches(':disabled, [aria-disabled="true"]')) return false
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false
  let ancestor: HTMLElement | null = element
  while (ancestor) {
    if (ancestor.matches('details:not([open])')) {
      const summary = ancestor.querySelector<HTMLElement>(':scope > summary')
      if (!summary?.contains(element)) return false
    }
    ancestor = ancestor.parentElement
  }
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = window.getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

function captureFocusOrigin(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return isValidFocusOrigin(document.activeElement) ? document.activeElement : null
}

function clearRuntimeTimer(runtime: ToastRuntime): void {
  if (runtime.timer !== null) clearTimeout(runtime.timer)
  runtime.timer = null
  runtime.startedAt = null
}

function focusAfterManualDismiss(
  removedId: string,
  removedIndex: number,
  returnFocus: HTMLElement | null,
): void {
  if (typeof document === 'undefined') return
  queueMicrotask(() => {
    const closeControls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-toast-close-id]'),
    )
    const nextControl = closeControls[removedIndex] ?? closeControls[removedIndex - 1]
    if (nextControl?.isConnected) {
      nextControl.focus({ preventScroll: true })
      return
    }
    if (isValidFocusOrigin(returnFocus)) {
      returnFocus.focus({ preventScroll: true })
      return
    }
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    if (main?.isConnected) main.focus({ preventScroll: true })
  })
}

function removeToast(id: string, moveFocus: boolean): void {
  const removedIndex = snapshot.findIndex((toast) => toast.id === id)
  if (removedIndex < 0) return
  const runtime = runtimes.get(id)
  const root = typeof document === 'undefined'
    ? null
    : Array.from(document.querySelectorAll<HTMLElement>('[data-toast-id]'))
      .find((element) => element.dataset.toastId === id) ?? null
  const focusedInside = Boolean(root?.contains(document.activeElement))
  if (runtime) clearRuntimeTimer(runtime)
  runtimes.delete(id)
  snapshot = Object.freeze(snapshot.filter((toast) => toast.id !== id))
  emit()
  if (moveFocus && focusedInside) {
    focusAfterManualDismiss(id, removedIndex, runtime?.returnFocus ?? null)
  }
}

function schedule(id: string): void {
  const runtime = runtimes.get(id)
  const toast = snapshot.find((candidate) => candidate.id === id)
  if (!runtime || !toast || toast.tone === 'error' || runtime.pauseReasons.size > 0) return
  clearRuntimeTimer(runtime)
  runtime.startedAt = Date.now()
  runtime.timer = setTimeout(() => removeToast(id, false), runtime.remainingMs)
}

function freezeToast(id: string, input: ToastInput): Toast {
  return Object.freeze({ id, ...input })
}

function push(input: ToastInput): string {
  const origin = captureFocusOrigin()
  const duplicate = input.dedupeKey === undefined
    ? undefined
    : snapshot.find((toast) => toast.dedupeKey === input.dedupeKey)

  if (duplicate) {
    const runtime = runtimes.get(duplicate.id)
    if (runtime) {
      clearRuntimeTimer(runtime)
      runtime.remainingMs = TOAST_DURATION_MS
      runtime.returnFocus = origin ?? (isValidFocusOrigin(runtime.returnFocus) ? runtime.returnFocus : null)
    }
    snapshot = Object.freeze(snapshot.map((toast) => (
      toast.id === duplicate.id ? freezeToast(duplicate.id, input) : toast
    )))
    emit()
    schedule(duplicate.id)
    return duplicate.id
  }

  const id = `toast-${++nextId}`
  const toast = freezeToast(id, input)
  runtimes.set(id, {
    remainingMs: TOAST_DURATION_MS,
    startedAt: null,
    timer: null,
    pauseReasons: new Set(),
    returnFocus: origin,
  })
  snapshot = Object.freeze([...snapshot, toast])
  emit()
  schedule(id)
  return id
}

function pause(id: string, reason: ToastPauseReason): void {
  const runtime = runtimes.get(id)
  if (!runtime || runtime.pauseReasons.has(reason)) return
  if (runtime.pauseReasons.size === 0 && runtime.startedAt !== null) {
    runtime.remainingMs = Math.max(0, runtime.remainingMs - (Date.now() - runtime.startedAt))
    clearRuntimeTimer(runtime)
  }
  runtime.pauseReasons.add(reason)
}

function resume(id: string, reason: ToastPauseReason): void {
  const runtime = runtimes.get(id)
  if (!runtime || !runtime.pauseReasons.delete(reason) || runtime.pauseReasons.size > 0) return
  schedule(id)
}

function reset(): void {
  for (const runtime of runtimes.values()) clearRuntimeTimer(runtime)
  runtimes.clear()
  snapshot = EMPTY_TOASTS
  nextId = 0
  emit()
}

export const toastStore = {
  getSnapshot: (): readonly Toast[] => snapshot,
  getServerSnapshot: (): readonly Toast[] => EMPTY_TOASTS,
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  push,
  dismiss: (id: string): void => removeToast(id, true),
  pause,
  resume,
  reset,
  getReturnFocus: (id: string): HTMLElement | null => runtimes.get(id)?.returnFocus ?? null,
} as const

export function useToast(): {
  toasts: readonly Toast[]
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  pause: (id: string, reason: ToastPauseReason) => void
  resume: (id: string, reason: ToastPauseReason) => void
} {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getServerSnapshot,
  )
  return {
    toasts,
    push: toastStore.push,
    dismiss: toastStore.dismiss,
    pause: toastStore.pause,
    resume: toastStore.resume,
  }
}
