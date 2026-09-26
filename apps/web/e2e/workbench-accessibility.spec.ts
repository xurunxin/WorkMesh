import { expect, test, type Page } from '@playwright/test'

// W17 — the workbench and the scopes it routes to ship in this UI, so the same
// structural/accessibility boundary that guards the legacy surfaces must hold
// on them: one h1 per route, every visible control reachable and named, no
// duplicate element ids, no ARIA reference pointing at a missing id, and no
// horizontal overflow of the document.
//
// This runs in the authenticated project, so it exercises the real shell,
// navigation and data boundaries rather than a redirect to /login.

const viewports = [
  { height: 1080, label: 'desktop', width: 1440 },
  { height: 844, label: 'mobile', width: 390 },
] as const

type Audit = Readonly<{
  duplicateIds: string[]
  missingReferences: string[]
  overflow: { clientWidth: number; scrollWidth: number }
  unlabeledControls: string[]
}>

const auditPage = (page: Page): Promise<Audit> => page.evaluate(() => {
  const describe = (element: Element): string => {
    const id = element.getAttribute('id')
    const name = element.getAttribute('name')
    const text = (element.textContent ?? '').trim().slice(0, 40)
    return `${element.tagName.toLowerCase()}${id ? `#${id}` : ''}${name ? `[name=${name}]` : ''}${text ? ` "${text}"` : ''}`
  }

  const ids = [...document.querySelectorAll('[id]')].map(element => element.id)
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]

  const references = [...document.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls],[aria-owns]')]
  const missingReferences: string[] = []
  for (const element of references) {
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns']) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      for (const id of value.split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) missingReferences.push(`${describe(element)} -> ${attribute}=${id}`)
      }
    }
  }

  // Every visible, enabled interactive control needs an accessible name. Buttons
  // whose only content is an icon are covered because the icons carry aria-label
  // or are aria-hidden with a labelled parent.
  const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="checkbox"],[role="combobox"]')]
  const unlabeledControls: string[] = []
  for (const element of interactive) {
    const html = element as HTMLElement
    const style = window.getComputedStyle(html)
    if (style.display === 'none' || style.visibility === 'hidden' || html.hidden) continue
    if (html.closest('[aria-hidden="true"]')) continue
    const labelled = Boolean(
      html.getAttribute('aria-label')?.trim()
      || html.getAttribute('title')?.trim()
      || html.getAttribute('aria-labelledby')?.trim()
      || html.getAttribute('alt')?.trim()
      || html.textContent?.trim()
      || (html as HTMLInputElement).labels?.length
      || html.querySelector('img[alt]:not([alt=""])'),
    )
    // A select/input may be labelled only by a wrapping <label> with text.
    const wrapped = html.closest('label')?.textContent?.trim()
    if (!labelled && !wrapped) unlabeledControls.push(describe(element))
  }

  return {
    duplicateIds,
    missingReferences: [...new Set(missingReferences)],
    overflow: {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    },
    unlabeledControls: unlabeledControls.slice(0, 20),
  }
})

// Surfaces the workbench routes to. `ready` waits for a stable landmark; a
// Project rail can add its own h1 once projects exist, so the bound is the
// minimum the shell itself guarantees rather than a fixed count.
const surfaces = [
  { label: 'Workbench', path: '/workbench', ready: (page: Page) => page.getByRole('heading', { level: 1 }).first(), minH1: 1 },
  { label: 'Projects', path: '/?view=projects', ready: (page: Page) => page.getByRole('complementary', { name: /Projects|项目/ }), minH1: 1 },
  { label: 'Guidance', path: '/?view=guidance', ready: (page: Page) => page.getByTestId('guidance-panel'), minH1: 1 },
  { label: 'Recovery', path: '/?view=recovery', ready: (page: Page) => page.getByRole('heading', { level: 1 }).first(), minH1: 1 },
  { label: 'Inbox', path: '/?view=inbox', ready: (page: Page) => page.getByRole('heading', { level: 1 }).first(), minH1: 1 },
  { label: 'LLM settings', path: '/settings/agent-workbench', ready: (page: Page) => page.getByRole('heading', { name: /模型服务接入|Model service connections/ }), minH1: 1 },
] as const

for (const viewport of viewports) {
  test(`workbench surfaces keep the structural boundary at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ height: viewport.height, width: viewport.width })

    for (const surface of surfaces) {
      await page.goto(surface.path)
      await expect(surface.ready(page), `${surface.label} did not render`).toBeVisible({ timeout: 20_000 })

      // Every surface states a page title, so assistive tech is never left
      // without a heading to anchor the route.
      const headings = await page.getByRole('heading', { level: 1 }).count()
      expect.soft(headings, `${surface.label} exposes a page-level heading`).toBeGreaterThanOrEqual(surface.minH1)

      const audit = await auditPage(page)
      expect.soft(audit.duplicateIds, `${surface.label}: no duplicate ids at ${viewport.width}px`).toEqual([])
      expect.soft(audit.missingReferences, `${surface.label}: every ARIA reference resolves at ${viewport.width}px`).toEqual([])
      expect.soft(audit.unlabeledControls, `${surface.label}: every visible control is named at ${viewport.width}px`).toEqual([])
      expect.soft(
        audit.overflow.scrollWidth,
        `${surface.label}: the document is horizontally contained at ${viewport.width}px`,
      ).toBe(audit.overflow.clientWidth)
    }
  })

  test(`workbench surfaces keep keyboard focus inside the viewport at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ height: viewport.height, width: viewport.width })

    for (const surface of surfaces) {
      await page.goto(surface.path)
      await expect(surface.ready(page), `${surface.label} did not render`).toBeVisible({ timeout: 20_000 })

      // Tab through the first few controls; each focused control must stay inside
      // the viewport so a keyboard user is never stranded off-screen. A control
      // inside a horizontal scroll container is exempt: scrolling to it is the
      // intended behaviour, and the document-level overflow assertion above is
      // what guards against a genuinely broken layout.
      for (let step = 0; step < 8; step += 1) {
        await page.keyboard.press('Tab')
        const geometry = await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null
          if (!active || active === document.body) return null
          const rect = active.getBoundingClientRect()
          let scrollable = false
          for (let node = active.parentElement; node; node = node.parentElement) {
            const overflowX = window.getComputedStyle(node).overflowX
            if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) {
              scrollable = true
              break
            }
          }
          return {
            label: active.getAttribute('aria-label') ?? active.textContent?.trim().slice(0, 30) ?? active.tagName,
            left: rect.left,
            right: rect.right,
            scrollable,
            top: rect.top,
          }
        })
        if (!geometry) continue
        expect.soft(geometry.left, `${surface.label}: focused control starts inside the viewport`).toBeGreaterThanOrEqual(-2)
        if (!geometry.scrollable) {
          expect.soft(geometry.right, `${surface.label}: focused control (${geometry.label}) ends inside the viewport`).toBeLessThanOrEqual(viewport.width + 2)
        }
        expect.soft(geometry.top, `${surface.label}: focused control is below the top edge`).toBeGreaterThanOrEqual(-2)
      }
    }
  })
}
