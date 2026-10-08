import { expect, type Page } from '@playwright/test'

export async function verifyThemeInheritance(page: Page) {
  const result = await page.evaluate(() => {
    const host = document.createElement('section')
    host.style.cssText = 'position:fixed;left:-10000px;top:0'
    document.querySelector('[data-wm-token-surface="workbench"]')!.append(host)
    const rows = []
    for (const theme of ['light', 'dark']) for (const compact of [false, true]) {
      const parent = document.createElement('div')
      parent.dataset.wmTheme = theme === 'light' ? 'dark' : 'light'
      if (compact) parent.dataset.wmDensity = 'compact'
      host.append(parent)
      const boundary = document.createElement('div')
      boundary.dataset.wmTheme = theme
      parent.append(boundary)
      const actual = document.createElement('div')
      actual.style.cssText = 'background:var(--wm-ref-surface-panel);border:1px solid var(--wm-ref-border-panel);box-shadow:var(--wm-ref-focus-ring);background-image:var(--wm-ref-grad-accent);height:var(--wm-ref-control-h-md)'
      boundary.append(actual)
      const expected = document.createElement('div')
      expected.style.cssText = theme === 'light'
        ? 'background:color-mix(in srgb, #f2ede6 92%, #faf7f2);border:1px solid color-mix(in srgb, #e2dbd1 70%, transparent);box-shadow:0 0 0 3px color-mix(in srgb,#6366f1 32%,transparent);background-image:linear-gradient(135deg,#4f46e5,#7839EE)'
        : 'background:color-mix(in srgb, #1F2226 92%, #0B0C0E);border:1px solid color-mix(in srgb, #24282D 70%, transparent);box-shadow:0 0 0 3px color-mix(in srgb,#5B8DEF 40%,transparent);background-image:linear-gradient(135deg,#4C8DFF,#A78BFA)'
      boundary.append(expected)
      const metrics = (element: HTMLElement) => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, border: style.borderTopColor, shadow: style.boxShadow, gradient: style.backgroundImage }
      }
      rows.push({ theme, compact, actual: metrics(actual), expected: metrics(expected), height: getComputedStyle(actual).height })
    }
    host.remove()
    return rows
  })
  for (const row of result) {
    expect(row.actual, `${row.theme}/${row.compact ? 'compact' : 'default'} 子树实际派生属性`).toEqual(row.expected)
    expect(row.height).toBe(row.compact ? '26px' : '32px')
  }
  return result
}
