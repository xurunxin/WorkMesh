// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useToast } from './use-toast'

describe('useToast', () => {
  it('adds and dismisses a toast', () => {
    const { result } = renderHook(() => useToast())
    act(() => result.current.push({ title: 'Saved', tone: 'success' }))
    expect(result.current.toasts).toHaveLength(1)
    const id = result.current.toasts[0]!.id
    act(() => result.current.dismiss(id))
    expect(result.current.toasts).toHaveLength(0)
  })
})
