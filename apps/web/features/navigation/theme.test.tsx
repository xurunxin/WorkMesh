// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../app/lib/i18n'
import { applyTheme, currentTheme, isThemeChoice, ThemeToggle, themeBootstrapScript, themeStorageKey } from './theme'

afterEach(() => {
  cleanup()
  window.localStorage.removeItem(themeStorageKey)
  delete document.documentElement.dataset.wmTheme
  document.documentElement.style.removeProperty('color-scheme')
  window.history.replaceState(null, '', window.location.pathname)
})

describe('theme bootstrap script (SSR no-flash contract)', () => {
  it('defaults to light when nothing is stored or forced', () => {
    new Function(themeBootstrapScript)()
    expect(document.documentElement.dataset.wmTheme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('applies the stored preference before first paint', () => {
    window.localStorage.setItem(themeStorageKey, 'dark')
    new Function(themeBootstrapScript)()
    expect(document.documentElement.dataset.wmTheme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('lets an explicit ?theme= link parameter win over storage', () => {
    window.localStorage.setItem(themeStorageKey, 'dark')
    window.history.replaceState(null, '', '/?theme=light')
    new Function(themeBootstrapScript)()
    expect(document.documentElement.dataset.wmTheme).toBe('light')
  })

  it('ignores unknown stored and forced values instead of executing them', () => {
    window.localStorage.setItem(themeStorageKey, 'dark"><img src=x onerror=alert(1)>')
    window.history.replaceState(null, '', '/?theme=rainbow')
    new Function(themeBootstrapScript)()
    expect(document.documentElement.dataset.wmTheme).toBe('light')
  })
})

describe('theme state helpers', () => {
  it('round-trips a choice through the document and storage', () => {
    expect(currentTheme()).toBe('light')
    applyTheme('dark')
    expect(currentTheme()).toBe('dark')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('dark')
  })

  it('validates choices without trusting raw input', () => {
    expect(isThemeChoice('dark')).toBe(true)
    expect(isThemeChoice('light')).toBe(true)
    expect(isThemeChoice('system')).toBe(false)
    expect(isThemeChoice(null)).toBe(false)
  })
})

describe('ThemeToggle', () => {
  it('reads the bootstrapped theme after mount, toggles, and persists the choice', () => {
    window.localStorage.setItem(themeStorageKey, 'dark')
    new Function(themeBootstrapScript)()
    render(<LocaleProvider><ThemeToggle /></LocaleProvider>)
    const toggle = screen.getByTestId('theme-toggle')
    expect(toggle.getAttribute('aria-label')).toBe('切换到浅色主题')
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.wmTheme).toBe('light')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('light')
    expect(toggle.getAttribute('aria-label')).toBe('切换到深色主题')
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.wmTheme).toBe('dark')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('dark')
  })

  it('falls back to the light identity with a dark-switch label when no bootstrap ran', () => {
    render(<LocaleProvider><ThemeToggle /></LocaleProvider>)
    expect(screen.getByTestId('theme-toggle').getAttribute('aria-label')).toBe('切换到深色主题')
  })
})
