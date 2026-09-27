'use client'

import { useEffect, useState } from 'react'
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon'
import { SunIcon } from '@phosphor-icons/react/dist/csr/Sun'
import { useLocale } from '../../app/lib/i18n'

export type ThemeChoice = 'light' | 'dark'
export const themeStorageKey = 'workmesh.theme'

/**
 * Inline bootstrap executed before hydration so the first paint already carries
 * the persisted theme — no dark→light flash on load. Precedence mirrors the
 * prototype: an explicit ?theme= link parameter wins, then the stored
 * preference, then the prototype's declared hero mode.
 *
 * The design system in design/README.md states "dark is the hero mode" and
 * design/prototype/app.css ships `color-scheme: dark` on :root with the cold
 * neutral #0B0C0E canvas, with light as the opt-in `[data-theme="light"]`
 * deviation. Shipping light as the default made the first paint disagree with
 * the visual baseline the prototype defines, so the default is now dark and
 * light is what a Human opts into. The dataset write needs
 * suppressHydrationWarning on <html> in the root layout.
 */
export const themeBootstrapScript = `(function(){try{var d=document.documentElement;var p=new URLSearchParams(location.search).get('theme');var s=null;try{s=window.localStorage.getItem('${themeStorageKey}')}catch(e){};var t=(p==='light'||p==='dark')?p:(s==='light'||s==='dark'?s:'dark');d.dataset.wmTheme=t;d.style.colorScheme=t}catch(e){}})();`

/** The prototype's hero mode, used whenever no explicit choice was persisted. */
export const defaultTheme: ThemeChoice = 'dark'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark'
}

/** Reads the choice the bootstrap script (or a prior toggle) left on <html>. */
export function currentTheme(doc: Document = document): ThemeChoice {
  return doc.documentElement.dataset.wmTheme === 'light' ? 'light' : defaultTheme
}

export function applyTheme(theme: ThemeChoice, doc: Document = document): void {
  doc.documentElement.dataset.wmTheme = theme
  doc.documentElement.style.colorScheme = theme
  try { window.localStorage.setItem(themeStorageKey, theme) } catch { /* Persistence is optional; the in-memory theme still applies. */ }
}

export function ThemeToggle() {
  const { t } = useLocale()
  // Null until mounted: the server render and the first client render must
  // agree (no icon), then the effect reads what the bootstrap script chose.
  const [theme, setTheme] = useState<ThemeChoice | null>(null)
  useEffect(() => { setTheme(currentTheme()) }, [])
  const nextLabel = theme === 'dark' ? t('themeToLight') : t('themeToDark')
  return <button
    aria-label={nextLabel}
    className="theme-toggle"
    data-testid="theme-toggle"
    onClick={() => {
      const next: ThemeChoice = (theme ?? currentTheme()) === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      setTheme(next)
    }}
    title={nextLabel}
    type="button"
  >{theme === 'dark'
    ? <SunIcon aria-hidden="true" size={16} weight="regular" />
    : theme === 'light' ? <MoonIcon aria-hidden="true" size={16} weight="regular" /> : null}</button>
}
