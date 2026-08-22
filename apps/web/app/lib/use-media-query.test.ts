// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useMediaQuery } from './use-media-query'

type MediaStub = {
  matches: boolean
  trigger: (next: boolean) => void
  listeners: Set<(event: { matches: boolean }) => void>
}

const installMatchMedia = (initial = false): MediaStub => {
  const stub: MediaStub = {
    matches: initial,
    listeners: new Set(),
    trigger(next: boolean) {
      stub.matches = next
      for (const listener of stub.listeners) listener({ matches: next })
    },
  }
  const factory = (): unknown => ({
    get matches() { return stub.matches },
    media: '',
    onchange: null,
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => { stub.listeners.add(listener) },
    removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => { stub.listeners.delete(listener) },
    addListener: (listener: (event: { matches: boolean }) => void) => { stub.listeners.add(listener) },
    removeListener: (listener: (event: { matches: boolean }) => void) => { stub.listeners.delete(listener) },
    dispatchEvent: () => true,
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: factory,
  })
  return stub
}

afterEach(() => { cleanup() })

describe('useMediaQuery', () => {
  beforeEach(() => {
    installMatchMedia(false)
  })

  it('starts with false so SSR and the first client render match', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 1180px)'))
    expect(result.current).toBe(false)
  })

  it('updates to the current matchMedia value after mount', () => {
    const stub = installMatchMedia(true)
    expect(stub.matches).toBe(true)
    const { result } = renderHook(() => useMediaQuery('(max-width: 1180px)'))
    expect(result.current).toBe(true)
  })

  it('reacts to subsequent change events emitted by the media query', () => {
    const stub = installMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 1180px)'))
    expect(result.current).toBe(false)
    act(() => { stub.trigger(true) })
    expect(result.current).toBe(true)
    act(() => { stub.trigger(false) })
    expect(result.current).toBe(false)
  })
})
