// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

// Testing Library's automatic cleanup only fires when the test environment
// is `jsdom` and the project has been initialized for it; in this monorepo
// the suite mixes node + jsdom files, so we unmount explicitly to keep each
// test's DOM isolated. (Same pattern as approvals-table.test.tsx.)
afterEach(() => { cleanup() })

// Inject the production stylesheet into <head> once per suite. The regression
// in commit 868478f silently dropped three rules from styles.css; without the
// real sheet, a duplicated local <style> in this file would mask the bug, so
// we read the file the page actually loads and assert against that source of
// truth. `import.meta.dirname` is the directory of the test module, which is
// stable across Vitest's jsdom env (where `import.meta.url` may not be a
// `file:` URL and `new URL(..., import.meta.url)` would throw).
let styleElement: HTMLStyleElement | null = null
const findStyleRule = (selector: string): CSSStyleRule | undefined => {
  const rules = Array.from(styleElement?.sheet?.cssRules ?? [])
  return rules.find((rule): rule is CSSStyleRule =>
    'selectorText' in rule
    && typeof rule.selectorText === 'string'
    && rule.selectorText.split(',').map(value => value.trim()).includes(selector),
  )
}

beforeAll(() => {
  const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')
  styleElement = document.createElement('style')
  styleElement.setAttribute('data-source', 'styles.css')
  styleElement.textContent = css
  document.head.appendChild(styleElement)
})
afterAll(() => {
  if (styleElement && styleElement.parentNode) styleElement.parentNode.removeChild(styleElement)
  styleElement = null
})

describe('agent-session-detail approval inbox', () => {
  it('restores the per-approval card surface styles removed by 868478f', () => {
    // The session-detail page still renders one <article> per pending approval
    // inside <section class="approval-inbox">. The regression removed the
    // rules that styled those articles, so the cards lost their surface.
    const { container } = render(
      <section className="app-shell">
        <section className="agent-session-detail">
          <section className="approval-inbox" aria-label="Approval inbox">
            <article>
              <strong>Merge PR #42</strong>
              <span className="risk-high">high risk</span>
              <p>Squash merges a platform-blocking change.</p>
              <div className="approval-actions">
                <button type="button">Approve</button>
                <button type="button">Reject</button>
              </div>
            </article>
          </section>
        </section>
      </section>,
    )

    const article = container.querySelector('.approval-inbox > article')
    expect(article, 'session-detail still emits one <article> per approval').not.toBeNull()
    const articleStyle = getComputedStyle(article as HTMLElement)
    // The restored rule forces a grid surface for the per-approval card; the
    // unruled default would have been `display: block`, which is what the
    // regression produced.
    expect(articleStyle.display).toBe('grid')
    // jsdom does not resolve inherited CSS variables in computed border
    // shorthands. Inspect the real parsed rule to prove that the detail-only
    // selector carries the shared surface border and background.
    const surfaceRule = findStyleRule('.app-shell .agent-session-detail .approval-inbox article')
    expect(surfaceRule).toBeDefined()
    expect(surfaceRule?.style.border).toBe('1px solid var(--wm-border)')
    expect(surfaceRule?.style.background).toBe('var(--wm-surface-subtle)')
  })

  it('lays out the shared direct approval controls as a wrapping action row', () => {
    const { container } = render(
      <section className="app-shell">
        <section className="agent-session-detail">
          <section className="approval-inbox" aria-label="Approval inbox">
            <article>
              <div className="approval-decision-controls">
                <div className="approval-row-actions">
                <button type="button">Approve</button>
                <button type="button">Reject</button>
                </div>
              </div>
            </article>
          </section>
        </section>
      </section>,
    )

    const actions = container.querySelector('.approval-inbox .approval-row-actions')
    expect(actions, 'session-detail reuses the shared direct approval action row').not.toBeNull()
    const actionsStyle = getComputedStyle(actions as HTMLElement)
    // Without the restored rule, the buttons would stack vertically on a
    // default block div. The restored rule forces a wrapping flex row.
    expect(actionsStyle.display).toBe('flex')
    expect(actionsStyle.flexWrap).toBe('wrap')
  })

  it('uses the shared decision component instead of a second raw decide endpoint', () => {
    const source = readFileSync(join(import.meta.dirname, 'agent-session-detail.tsx'), 'utf8')
    expect(source).toContain('<ApprovalDecisionControls')
    expect(source).toContain('decideApproval(approval, decision, reason)')
    expect(source).not.toMatch(/api\/v1\/approvals\/\$\{approval\.id\}\/decide/)
  })

  it('keeps the approval scope, sanitized payload, and explicit context links on Session', () => {
    const source = readFileSync(join(import.meta.dirname, 'agent-session-detail.tsx'), 'utf8')
    expect(source).toContain('formatApprovalPayload(approval.action_payload_sanitized)')
    expect(source).toContain('approval.action_payload_hash')
    expect(source).toContain('sessionId}?tab=artifacts')
    expect(source).toContain('session.work_item_id')
    expect(source).toContain('aria-label={agentsCopy.approvalContextLabel}')
  })
})
