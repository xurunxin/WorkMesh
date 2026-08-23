import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('human UI layout contract', () => {
  it('keeps work item drawers above the narrow navigation', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/\.mobile-navigation\s*\{[^}]*z-index:\s*10;/s)
    expect(styles).toMatch(/\.app-shell \.drawer\s*\{[^}]*z-index:\s*20;/s)
    expect(styles).toMatch(/\.content > \.conflict-notice\s*\{[^}]*z-index:\s*30;/s)
  })

  it('keeps project planning inside the viewport while allowing local project navigation scroll', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/\.app-shell,\s*\.app-workspace,\s*\.app-content,\s*\.content,\s*\.project-workspace,\s*\.project-plan-header,\s*\.project-plan-copy\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s)
    expect(styles).toMatch(/\.project-plan-copy\s+:where\(h2,\s*p\)\s*\{[^}]*overflow-wrap:\s*anywhere;/s)
    expect(styles).toMatch(/\.project-strip\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain;/s)
    expect(styles).toMatch(/\.project-strip\s*>\s*\*\s*\{[^}]*flex:\s*0\s+0\s+auto;/s)
  })

  it('removes the real Work Surface pulse under reduced motion without hiding its state', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.work-surface-stale\s*\{[^}]*animation:\s*none\s*!important;/s)
    expect(styles).toContain('.wm-work-surface-stale { opacity: .72; }')
    expect(styles).toContain('.wm-work-surface-state-marker')
  })

  it('covers public Connect descendants with the reduced-motion duration contract', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.connect-page\s+\*,\s*\.connect-page\s+\*::before,\s*\.connect-page\s+\*::after\s*\{[^}]*transition-duration:\s*\.01ms\s*!important;[^}]*animation-duration:\s*\.01ms\s*!important;[^}]*animation-iteration-count:\s*1\s*!important;/s)
  })

  it('keeps the 760/761 shell boundary and mobile discrete controls explicit', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/\.app-brand\s*>\s*strong\s*\{[^}]*font-size:\s*1\.08rem;[^}]*letter-spacing:\s*-\.02em;/s)
    expect(styles).not.toMatch(/\.app-brand\s+h1\s*\{/)
    expect(styles).toMatch(/main#workmesh-main:focus-visible\s*\{[^}]*outline:\s*0;[^}]*box-shadow:\s*inset\s+0\s+3px\s+0\s+var\(--wm-focus\);/s)
    expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)\s*\{[^}]*\.app-shell\s*\{\s*display:\s*block;/s)
    expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*\.app-shell\s+:where\([^)]*button[^)]*summary[^)]*\)\s*\{[^}]*min-height:\s*40px;/s)
    expect(styles).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*\.app-shell\s+\.agent-registry-filters\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s)
    expect(styles).toMatch(/@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.operations-tab\s*>\s*header\.operations-header\s*\{[^}]*flex-direction:\s*column;/s)
  })

  it('keeps compact text controls above the measured 40px touch boundary', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/@media\s*\(max-width:\s*760px\)[\s\S]*?\.app-shell\s+input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\[type='file'\]\):not\(\[type='range'\]\):not\(\[type='date'\]\):not\(\[type='time'\]\):not\(\[type='color'\]\)\s*\{[^}]*min-height:\s*42px;/s)
  })

  it('keeps standalone Operations metrics dense without crossing the padded content box', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

    expect(styles).toMatch(/@media\s*\(min-width:\s*1200px\)\s*and\s*\(max-width:\s*1599px\)\s*\{[\s\S]*?\.content--full\s+\.operations-usage-loading\s+\.skeleton-list,\s*\.content--full\s+\.operations-metrics-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*13rem\),\s*17rem\)\);/s)
    expect(styles).toMatch(/@media\s*\(min-width:\s*1600px\)\s*\{[\s\S]*?\.content--full\s+\.operations-metrics\s*\{[^}]*width:\s*calc\(85%\s*\+\s*3rem\s*\+\s*1px\);/s)
  })

  it('owns foundation tokens in packages/ui and migrates the four workspace shell routes', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
    const home = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')
    const agents = readFileSync(new URL('./agents/page.tsx', import.meta.url), 'utf8')
    const operations = readFileSync(new URL('./operations/page.tsx', import.meta.url), 'utf8')

    expect(styles).not.toMatch(/--wm-color-canvas\s*:/)
    expect(layout).toContain("import '@workmesh/ui/tokens.css'")
    for (const route of [home, settings, agents, operations]) {
      expect(route).toContain('AppShell')
    }
    // settings intentionally omits RealtimeStatus (administrative surface, no live workspace data)
    for (const route of [home, agents, operations]) {
      expect(route).toContain('RealtimeStatus')
    }
    expect(home).toContain('ErrorState')
    expect(agents).toContain('ErrorState')
    // Operations content is now embedded inside the Settings page as a tab.
    expect(settings).toContain('OperationsContent')
    // The standalone /operations route is a thin wrapper that redirects and re-uses
    // the same AppShell. It must still render via the unified shell.
    expect(operations).toContain('AppShell')
    expect(operations).toContain('OperationsContent')
  })

  it('removes legacy dark theme colors and class names', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    for (const color of ['#0f172a', '#1e293b', '#334155', '#475569', '#1d4ed8', '#fca5a5', '#94a3b8', '#cbd5e1', '#e2e8f0', '#7f1d1d', '#111827']) {
      expect(styles, `legacy color ${color} should be gone`).not.toContain(color)
    }
    for (const cls of ['.shell ', '.auth,', '.auth {', '.work-tabs']) {
      expect(styles, `legacy class ${cls} should be gone`).not.toContain(cls)
    }
    // The bare class names .agent-center / .session-page and the agent-state
    // sub-classes .state-executing / .state-completed / .state-failed are all
    // still in use as compound selectors under .app-shell .agent-state (e.g.
    // .app-shell .agent-state.state-executing). A plain substring check would
    // over-match, so use anchored patterns that only fire when these names
    // start a selector (the legacy form), not when they're mid-compound.
    expect(styles, 'legacy .agent-center should be gone').not.toMatch(/(^|[,;{])\.agent-center[, >{]/)
    expect(styles, 'legacy .session-page should be gone').not.toMatch(/(^|[,;{])\.session-page[, >{]/)
    for (const stateClass of ['.state-executing', '.state-completed', '.state-failed']) {
      expect(styles, `legacy class ${stateClass} should be gone`).not.toMatch(new RegExp(`(^|[,;{])\\${stateClass}[, >{]`))
    }
  })

  it('removes operations-only theme colors and class names', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    for (const color of ['#f7f8fb', '#e4e7ec', '#667085', '#475467', '#eaecf0']) {
      expect(styles, `operations color ${color} should be gone`).not.toContain(color)
    }
    expect(styles, '.operations-shell { should be gone').not.toContain('.operations-shell {')
  })

  it('renders the four migrated routes inside the unified AppShell', () => {
    const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
    const home = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')
    const operations = readFileSync(new URL('./operations/page.tsx', import.meta.url), 'utf8')
    const connect = readFileSync(new URL('./connect/page.tsx', import.meta.url), 'utf8')
    const login = readFileSync(new URL('./login/page.tsx', import.meta.url), 'utf8')
    const install = readFileSync(new URL('./install/page.tsx', import.meta.url), 'utf8')
    const agents = readFileSync(new URL('./agents/page.tsx', import.meta.url), 'utf8')

    expect(layout).toContain("import '@workmesh/ui/tokens.css'")
    for (const route of [home, settings, operations, connect, agents, login, install]) {
      expect(route, 'route should import LocaleToggle/useLocale').toMatch(/useLocale|from '[^']*lib\/i18n'/)
    }
    for (const route of [home, settings, operations, agents]) {
      expect(route, 'workspace route should wrap in AppShell').toContain('AppShell')
    }
    for (const route of [login, install]) {
      expect(route, 'public route should wrap in AppShell').toContain('AppShell')
      expect(route, 'public route should use auth-shell').toContain('auth-shell')
    }
  })

  it('no longer carries an inline text object in settings/page.tsx', () => {
    const settings = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8')
    expect(settings).not.toContain("locale === 'zh-CN' ?")
  })
})
