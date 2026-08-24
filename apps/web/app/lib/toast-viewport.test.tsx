// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog } from '@workmesh/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from './i18n'
import { ToastViewport } from './toast-viewport'
import { TOAST_DURATION_MS, toastStore } from './use-toast'

describe('ToastViewport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    toastStore.reset()
    document.body.innerHTML = '<main id="workmesh-main" tabindex="-1"></main>'
  })

  afterEach(() => {
    cleanup()
    toastStore.reset()
    vi.useRealTimers()
    document.cookie = 'workmesh_locale=; Path=/; Max-Age=0'
    window.localStorage.removeItem('workmesh_locale')
  })

  it('renders no viewport while empty and one atomic live role per toast with unique localized close names', () => {
    render(<LocaleProvider><ToastViewport /></LocaleProvider>)
    expect(screen.queryByRole('region', { name: '通知' })).toBeNull()

    act(() => {
      toastStore.push({ title: '团队已创建', description: '团队 Runtime 已可使用。', tone: 'success' })
      toastStore.push({ title: '团队已创建', description: '团队 Platform 已可使用。', tone: 'success' })
      toastStore.push({ title: '操作未完成', description: '请检查连接后重试。', tone: 'error' })
    })

    const region = screen.getByRole('region', { name: '通知' })
    expect(region).not.toHaveAttribute('aria-live')
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getAllByRole('status')[0]).toHaveAttribute('aria-atomic', 'true')
    expect(screen.getAllByRole('alert')[0]).toHaveAttribute('aria-atomic', 'true')
    const closeNames = screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))
    expect(closeNames).toEqual([
      '关闭通知：团队已创建（1/3）',
      '关闭通知：团队已创建（2/3）',
      '关闭通知：操作未完成（3/3）',
    ])
    expect(new Set(closeNames).size).toBe(3)
  })

  it('wires pointer and focus-within as independent pause reasons without moving focus', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Origin'
    document.body.append(trigger)
    trigger.focus()
    render(<LocaleProvider><ToastViewport /></LocaleProvider>)

    act(() => toastStore.push({ title: '已保存', description: '更改已保存。', tone: 'success' }))
    expect(document.activeElement).toBe(trigger)
    const toast = screen.getByRole('status')
    const close = screen.getByRole('button', { name: '关闭通知：已保存（1/1）' })
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.pointerEnter(toast)
    close.focus()
    fireEvent.focus(close)
    fireEvent.pointerLeave(toast)
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 2))
    expect(screen.getByRole('status')).toBeVisible()

    fireEvent.blur(close, { relatedTarget: document.body })
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1_000 - 1))
    expect(screen.getByRole('status')).toBeVisible()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('moves focus only for a focused manual dismissal: next close, captured origin, then main fallback', async () => {
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    const trigger = document.createElement('button')
    trigger.textContent = 'Origin'
    document.body.append(trigger)
    trigger.focus()
    render(<LocaleProvider><ToastViewport /></LocaleProvider>)
    act(() => {
      toastStore.push({ title: 'First', tone: 'error' })
      toastStore.push({ title: 'Second', tone: 'error' })
      toastStore.push({ title: 'Third', tone: 'error' })
    })

    const second = screen.getByRole('button', { name: '关闭通知：Second（2/3）' })
    second.focus()
    await act(async () => fireEvent.click(second))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭通知：Third（2/2）' }))
    await act(async () => fireEvent.click(document.activeElement as HTMLElement))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭通知：First（1/1）' }))
    await act(async () => fireEvent.click(document.activeElement as HTMLElement))
    expect(document.activeElement).toBe(trigger)

    trigger.focus()
    act(() => toastStore.push({ title: 'Detached origin', tone: 'error' }))
    trigger.remove()
    const detachedClose = screen.getByRole('button', { name: '关闭通知：Detached origin（1/1）' })
    detachedClose.focus()
    await act(async () => fireEvent.click(detachedClose))
    expect(document.activeElement).toBe(main)
  })

  it('keeps an existing toast inert and visually below a live modal while preserving per-edge safe areas', () => {
    toastStore.push({ title: 'Saved before modal', tone: 'error' })
    render(<LocaleProvider>
      <ToastViewport />
      <Dialog closeLabel="关闭" onClose={() => undefined} open title="确认操作">
        <button type="button">确认</button>
      </Dialog>
    </LocaleProvider>)

    const toast = document.querySelector<HTMLElement>('[data-toast-id]')
    expect(toast).not.toBeNull()
    expect(toast?.closest('[inert]')).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭 确认操作' }))

    const css = readFileSync(`${process.cwd()}/app/styles.css`, 'utf8')
    expect(css).toContain('z-index: calc(var(--wm-overlay-z) - 1)')
    expect(css).toContain('max(1rem, env(safe-area-inset-left)) - max(1rem, env(safe-area-inset-right))')
    expect(css).toContain('max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom))')
  })
})
