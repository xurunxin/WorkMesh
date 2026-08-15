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

  it('owns foundation tokens in packages/ui and migrates the first three shell routes', () => {
    const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
    const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
    const home = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    const agents = readFileSync(new URL('./agents/page.tsx', import.meta.url), 'utf8')
    const operations = readFileSync(new URL('./operations/page.tsx', import.meta.url), 'utf8')

    expect(styles).not.toMatch(/--wm-color-canvas\s*:/)
    expect(layout).toContain("import '@workmesh/ui/tokens.css'")
    for (const route of [home, agents, operations]) {
      expect(route).toContain('AppShell')
      expect(route).toContain('RealtimeStatus')
    }
    expect(home).toContain('ErrorState')
    expect(agents).toContain('ErrorState')
    expect(operations).toContain('EmptyState')
  })
})
