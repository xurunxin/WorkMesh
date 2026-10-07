// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleProvider } from '../../app/lib/i18n'
import { applyTheme, currentTheme, defaultTheme, isThemeChoice, ThemeToggle, themeBootstrapScript, themeStorageKey } from './theme'

type TokenBaseline = {
  baseCommit: string
  declarations: Array<{ selector: string; token: string; value: string }>
  consumers: Array<{ file: string; token: string; count: number }>
}

const tokenBaseline = JSON.parse(readFileSync(resolve(process.cwd(), 'features/navigation/theme-token-baseline.json'), 'utf8')) as TokenBaseline
const tokenCssPath = resolve(process.cwd(), '../../packages/ui/src/tokens.css')
const runtimeTokenDefinitions: Record<string, Array<{ file: string; marker: string }>> = {
  '--wm-dismissal-depth': [{ file: 'packages/ui/src/internal/overlay.ts', marker: "setProperty('--wm-dismissal-depth'" }],
  '--wm-status-color': [
    { file: 'packages/ui/src/domain/workflow.tsx', marker: "'--wm-status-color':" },
    { file: 'packages/ui/src/domain/work-item.tsx', marker: "'--wm-status-color':" },
  ],
}

function parseTokenDeclarations(css: string) {
  const declarations: Array<{ selector: string; token: string; value: string }> = []
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/gs)) {
    const selector = match[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ')
    for (const declaration of match[2]!.matchAll(/(--wm-[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations.push({ selector, token: declaration[1]!, value: declaration[2]!.trim() })
    }
  }
  return declarations
}

function sourceWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

afterEach(() => {
  cleanup()
  window.localStorage.removeItem(themeStorageKey)
  delete document.documentElement.dataset.wmTheme
  document.documentElement.style.removeProperty('color-scheme')
  window.history.replaceState(null, '', window.location.pathname)
})

describe('theme bootstrap script (SSR no-flash contract)', () => {
  it('defaults to the prototype hero mode (dark) when nothing is stored or forced', () => {
    new Function(themeBootstrapScript)()
    expect(defaultTheme).toBe('dark')
    expect(document.documentElement.dataset.wmTheme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('applies the stored preference before first paint', () => {
    window.localStorage.setItem(themeStorageKey, 'light')
    new Function(themeBootstrapScript)()
    expect(document.documentElement.dataset.wmTheme).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
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
    expect(document.documentElement.dataset.wmTheme).toBe('dark')
  })
})

describe('theme state helpers', () => {
  it('round-trips a choice through the document and storage', () => {
    expect(currentTheme()).toBe('dark')
    applyTheme('light')
    expect(currentTheme()).toBe('light')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('light')
  })

  it('validates choices without trusting raw input', () => {
    expect(isThemeChoice('dark')).toBe(true)
    expect(isThemeChoice('light')).toBe(true)
    expect(isThemeChoice('system')).toBe(false)
    expect(isThemeChoice(null)).toBe(false)
  })
})

describe('coexisting reference token contract', () => {
  it('preserves every base token declaration, scope, value, and existing CSS consumer', () => {
    expect(tokenBaseline.baseCommit).toBe('9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7')
    const css = readFileSync(tokenCssPath, 'utf8')
    const currentDeclarations = parseTokenDeclarations(css)
    for (const declaration of tokenBaseline.declarations) {
      expect(currentDeclarations).toContainEqual(declaration)
    }

    for (const consumer of tokenBaseline.consumers) {
      const sourcePath = resolve(process.cwd(), '../../', consumer.file)
      const source = sourceWithoutComments(readFileSync(sourcePath, 'utf8'))
      const tokenPattern = new RegExp(`var\\(\\s*${consumer.token}\\s*(?=[,)])`)
      expect(source.split(/\r?\n/).filter(line => tokenPattern.test(line))).toHaveLength(consumer.count)
      if (!currentDeclarations.some(declaration => declaration.token === consumer.token)) {
        const definitions = runtimeTokenDefinitions[consumer.token] ?? []
        expect(definitions.length, `missing definition source for ${consumer.token}`).toBeGreaterThan(0)
        for (const definition of definitions) {
          const definitionSource = readFileSync(resolve(process.cwd(), '../../', definition.file), 'utf8')
          expect(definitionSource).toContain(definition.marker)
        }
      }
    }
  })

  it('declares measured light slots and resolves dark slots through existing semantics', () => {
    const css = readFileSync(tokenCssPath, 'utf8')
    const lightSlots: Record<string, string> = {
      '--wm-ref-surface': '#faf7f2',
      '--wm-ref-surface-elevated': '#fdfaf6',
      '--wm-ref-surface-hover': '#f2ede6',
      '--wm-ref-surface-secondary': '#f2ede6',
      '--wm-ref-surface-inset': '#f2ede6',
      '--wm-ref-border-default': '#e2dbd1',
      '--wm-ref-border-strong': '#cec6bb',
      '--wm-ref-text-primary': '#1c1917',
      '--wm-ref-text-secondary': '#57534e',
      '--wm-ref-text-tertiary': '#78716c',
      '--wm-ref-text-dim': '#a8a29e',
      '--wm-ref-status-pending': '#9ca3af',
      '--wm-ref-status-running': '#3b82f6',
      '--wm-ref-status-needs-human': '#f59e0b',
      '--wm-ref-status-done': '#22c55e',
      '--wm-ref-danger-candidate': '#ef4444',
      '--wm-ref-accent': '#4f46e5',
      '--wm-ref-focus': '#6366f1',
      '--wm-ref-radius-control': '6px',
      '--wm-ref-radius-card': '8px',
      '--wm-ref-radius-column': '12px',
    }
    const declarations = parseTokenDeclarations(css)
    for (const [token, value] of Object.entries(lightSlots)) {
      expect(declarations).toContainEqual({ selector: ':root', token, value })
    }

    const dark = declarations.filter(declaration => declaration.selector === "[data-wm-theme='dark']")
    const darkAliases: Record<string, string> = {
      '--wm-ref-surface': '--wm-canvas',
      '--wm-ref-surface-elevated': '--wm-surface-raised',
      '--wm-ref-surface-hover': '--wm-surface-hover',
      '--wm-ref-surface-secondary': '--wm-surface-subtle',
      '--wm-ref-surface-inset': '--wm-surface-inset',
      '--wm-ref-border-default': '--wm-border',
      '--wm-ref-border-strong': '--wm-border-strong',
      '--wm-ref-text-primary': '--wm-text',
      '--wm-ref-text-secondary': '--wm-text-muted',
      '--wm-ref-text-tertiary': '--wm-text-subtle',
      '--wm-ref-text-dim': '--wm-text-muted',
      '--wm-ref-status-pending': '--wm-neutral',
      '--wm-ref-status-running': '--wm-info',
      '--wm-ref-status-needs-human': '--wm-warning',
      '--wm-ref-status-done': '--wm-success',
      '--wm-ref-danger-candidate': '--wm-danger',
      '--wm-ref-accent': '--wm-accent',
      '--wm-ref-focus': '--wm-focus',
    }
    for (const [token, value] of Object.entries(darkAliases)) {
      expect(dark).toContainEqual({ selector: "[data-wm-theme='dark']", token, value: `var(${value})` })
    }
    expect(css).toContain('CSS candidate observed in utilities; this is not an observed error-state component.')
    expect(css).toContain('D1a reference measurements coexist with shipped tokens until D1b migrates consumers.')
  })
})

describe('ThemeToggle', () => {
  it('reads the bootstrapped theme after mount, toggles, and persists the choice', () => {
    window.localStorage.setItem(themeStorageKey, 'light')
    new Function(themeBootstrapScript)()
    render(<LocaleProvider><ThemeToggle /></LocaleProvider>)
    const toggle = screen.getByTestId('theme-toggle')
    expect(toggle.getAttribute('aria-label')).toBe('切换到深色主题')
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.wmTheme).toBe('dark')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('dark')
    expect(toggle.getAttribute('aria-label')).toBe('切换到浅色主题')
    fireEvent.click(toggle)
    expect(document.documentElement.dataset.wmTheme).toBe('light')
    expect(window.localStorage.getItem(themeStorageKey)).toBe('light')
  })

  it('falls back to the prototype hero mode with a light-switch label when no bootstrap ran', () => {
    render(<LocaleProvider><ThemeToggle /></LocaleProvider>)
    expect(screen.getByTestId('theme-toggle').getAttribute('aria-label')).toBe('切换到浅色主题')
  })
})
