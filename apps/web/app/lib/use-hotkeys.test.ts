// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOTKEY_CHORD_TIMEOUT_MS, useHotkeys } from './use-hotkeys'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.replaceChildren()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useHotkeys', () => {
  it('owns only g i/a/s and does not swallow the first or an unknown second key', () => {
    const navigate = vi.fn()
    renderHook(() => useHotkeys({ getFilterTarget: () => null, getLayerOpen: () => false, navigate }))

    expect(fireEvent.keyDown(document.body, { key: 'g' })).toBe(true)
    expect(fireEvent.keyDown(document.body, { key: 'i' })).toBe(false)
    expect(navigate).toHaveBeenLastCalledWith('i')
    fireEvent.keyDown(document.body, { key: 'g' })
    expect(fireEvent.keyDown(document.body, { key: 'z' })).toBe(true)
    expect(navigate).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'a' })
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 's' })
    expect(navigate.mock.calls.map(([destination]) => destination)).toEqual(['i', 'a', 's'])
  })

  it('accepts 999ms and expires at 1000ms', () => {
    const navigate = vi.fn()
    renderHook(() => useHotkeys({ getFilterTarget: () => null, getLayerOpen: () => false, navigate }))

    fireEvent.keyDown(document.body, { key: 'g' })
    act(() => { vi.advanceTimersByTime(HOTKEY_CHORD_TIMEOUT_MS - 1) })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(navigate).toHaveBeenCalledWith('a')

    navigate.mockClear()
    fireEvent.keyDown(document.body, { key: 'g' })
    act(() => { vi.advanceTimersByTime(HOTKEY_CHORD_TIMEOUT_MS) })
    expect(fireEvent.keyDown(document.body, { key: 'a' })).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('checks live modal state at both chord keys and for f', () => {
    let layerOpen = true
    const navigate = vi.fn()
    const input = document.body.appendChild(document.createElement('input'))
    input.dataset.hotkeyFilter = 'true'
    renderHook(() => useHotkeys({ getFilterTarget: () => input, getLayerOpen: () => layerOpen, navigate }))

    fireEvent.keyDown(document.body, { key: 'g' })
    layerOpen = false
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'g' })
    layerOpen = true
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(navigate).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(true)
    expect(input).not.toHaveFocus()
  })

  it('focuses only a connected, visible, enabled declared filter', () => {
    const navigate = vi.fn()
    const panel = document.body.appendChild(document.createElement('section'))
    const input = panel.appendChild(document.createElement('input'))
    input.dataset.hotkeyFilter = 'true'
    renderHook(() => useHotkeys({ getFilterTarget: () => input, getLayerOpen: () => false, navigate }))

    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(false)
    expect(input).toHaveFocus()

    input.blur()
    input.disabled = true
    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(true)
    input.disabled = false
    panel.hidden = true
    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(true)
    panel.hidden = false
    input.remove()
    expect(fireEvent.keyDown(document.body, { key: 'f' })).toBe(true)
  })

  it('preserves editable/interactive contexts, modifiers, repeats, composition and unmount cleanup', () => {
    const navigate = vi.fn()
    const input = document.body.appendChild(document.createElement('input'))
    input.dataset.hotkeyFilter = 'true'
    const button = document.body.appendChild(document.createElement('button'))
    const editable = document.body.appendChild(document.createElement('div'))
    editable.setAttribute('contenteditable', '')
    const { unmount } = renderHook(() => useHotkeys({ getFilterTarget: () => input, getLayerOpen: () => false, navigate }))

    for (const target of [input, button, editable]) {
      fireEvent.keyDown(target, { key: 'g' })
      fireEvent.keyDown(target, { key: 'a' })
    }
    fireEvent.keyDown(document.body, { ctrlKey: true, key: 'g' })
    fireEvent.keyDown(document.body, { key: 'g', repeat: true })
    fireEvent.keyDown(document.body, { isComposing: true, key: 'g' })
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'g' })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    act(() => { vi.advanceTimersByTime(HOTKEY_CHORD_TIMEOUT_MS) })
    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(navigate).not.toHaveBeenCalled()
  })
})
