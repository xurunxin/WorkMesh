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
    expect(styles).toMatch(/\.project-strip\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/s)
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
    expect(operations).toContain('EmptyState')
  })

  it('removes legacy dark theme colors and class names', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    for (const color of ['#0f172a', '#1e293b', '#334155', '#475569', '#1d4ed8', '#fca5a5', '#94a3b8', '#cbd5e1', '#e2e8f0', '#7f1d1d', '#111827']) {
      expect(styles, `legacy color ${color} should be gone`).not.toContain(color)
    }
    for (const cls of ['.shell ', '.auth,', '.auth {', '.work-tabs', '.state-executing', '.state-completed', '.state-failed']) {
      expect(styles, `legacy class ${cls} should be gone`).not.toContain(cls)
    }
    // The bare class names .agent-center and .session-page are still used by the new
    // foundation as .app-shell .agent-center / .app-shell .session-page (the active
    // agents and session pages both render those class names), so a plain substring
    // check would over-match. Use anchored patterns that fire only on the legacy
    // selectors (where these names start the selector, not mid-compound).
    expect(styles, 'legacy .agent-center should be gone').not.toMatch(/(^|[,;{])\.agent-center[, >{]/)
    expect(styles, 'legacy .session-page should be gone').not.toMatch(/(^|[,;{])\.session-page[, >{]/)
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
