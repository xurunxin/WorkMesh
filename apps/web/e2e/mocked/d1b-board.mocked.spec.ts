import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { fixedTime } from './d1b-workbench-fixture'
import { seedBoardBacklog, seedBoardDependencies } from './d1b-board-fixture'
import { verifyThemeInheritance } from './d1b-theme-probes'

const webUrl = 'http://127.0.0.1:3200'
const phase = process.env.WORKMESH_D1B_PHASE ?? 'after'
if (!['before', 'after'].includes(phase)) throw new Error('未知采集阶段')
const matrix = JSON.parse(await readFile(new URL('../../../../docs/reviews/d1b/surface-matrix.json', import.meta.url), 'utf8')) as {
  rows: Array<{ id: string; stage: string; request: { url: string }; canonical: { expectedURL: string }; fixture: { resources: { workItem: string } } }>
}
const rows = matrix.rows.filter(row => row.stage === 'board')
const states = ['ready', 'loading', 'error', 'empty', 'compact', 'portal', 'detail'] as const
const scope = '[data-wm-token-surface="board"]'
const screenshotOptions = { animations: 'disabled' as const, caret: 'hide' as const, fullPage: true }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function styles(page: Page) {
  return page.evaluate(() => Object.fromEntries([
    'body', '.app-sidebar', '.wm-shell-header', '.project-rail', '.project-workspace-header',
    '[data-testid="work-surfaces"]', '.wm-work-item-column', '.wm-work-item-card', '.wm-work-item-title',
    '.wm-dialog', '.wm-overlay', '.wm-sheet', '.wm-toast-viewport',
  ].map(selector => {
    const element = document.querySelector(selector)
    if (!element) return [selector, null]
    const style = getComputedStyle(element)
    return [selector, { color: style.color, background: style.backgroundColor, border: style.borderColor,
      radius: style.borderRadius, shadow: style.boxShadow, outline: style.outline, display: style.display }]
  })))
}

for (const row of rows) for (const state of states) {
  test(`${row.id}/${state}：看板前后、局部边界与真实导航`, async ({ browser, request }, info) => {
    expect((await request.post('http://127.0.0.1:3201/__test/reset', { data: { scenario: 'final-tour' } })).ok()).toBe(true)
    const theme = info.project.name.endsWith('-dark') ? 'dark' : 'light'
    const context = await browser.newContext({ ...info.project.use, baseURL: webUrl, viewport: info.project.use.viewport,
      colorScheme: 'light', deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block' })
    let release: (() => void) | undefined
    const held = new Promise<void>(resolve => { release = resolve })
    const requests: Array<{ method: string; path: string; status: number }> = [], failures: string[] = []
    try {
      await context.addCookies([{ name: 'workmesh_locale', value: 'zh-CN', url: webUrl }])
      await context.addInitScript(({ theme, compact }) => {
        try {
          localStorage.setItem('workmesh.theme', theme)
          localStorage.setItem('wm:board:density', compact ? 'compact' : 'comfortable')
        } catch { /* 初始about:blank没有存储权限；实际同源页面再次执行。 */ }
      }, { theme, compact: state === 'compact' })
      if (row.id === 'backlog-board') await seedBoardBacklog(context)
      await seedBoardDependencies(context)
      let simulateError = state === 'error'
      await context.route(url => url.pathname === '/api/v1/work-items', async route => {
        expect(route.request().method()).toBe('GET')
        if (state === 'loading') await held
        if (simulateError) await route.fulfill({ status: 503, json: { error: { code: 'D1B_BOARD_UNAVAILABLE', message: 'D1b看板只读暂不可用', correlationId: 'd1b-board' } } })
        else if (state === 'empty') await route.fulfill({ json: { items: [], nextCursor: null } })
        else await route.fallback()
      })
      const page = await context.newPage()
      page.on('pageerror', error => failures.push(error.message))
      page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) requests.push({ method: response.request().method(), path: url.pathname, status: response.status() }) })
      await page.clock.setFixedTime(new Date(fixedTime))
      await page.goto(row.request.url, { waitUntil: 'domcontentloaded' })
      await expect(page).toHaveURL(new URL(row.canonical.expectedURL, webUrl).href)
      await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme)
      const surface = page.getByTestId('work-surfaces')
      await expect(surface).toBeVisible()
      const card = surface.locator(`[data-work-item-id="${row.fixture.resources.workItem}"]`)
      if (state === 'loading') await expect(surface.locator('.work-surface-board-loading')).toBeVisible()
      else if (state === 'error') await expect(surface.getByRole('alert')).toBeVisible()
      else if (state === 'empty') { await expect(surface.locator('.wm-work-surface-state')).toBeVisible(); await expect(card).toHaveCount(0) }
      else {
        await expect(surface.getByTestId('board')).toHaveAttribute('data-layout', 'board')
        await expect(card).toBeVisible()
        await card.locator('xpath=ancestor::*[@data-workflow-state-id]').evaluate(column => column.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' }))
        // D0精确原路由保留整卡可见要求；其他移动区域允许滚动，验证操作标题实际可达。
        if (row.id === 'project-work-board') await expect(card).toBeInViewport({ ratio: 1 })
        else await expect(card.locator('.wm-work-item-title')).toBeInViewport()
        if (row.id === 'backlog-board') { await expect(card).toHaveAttribute('data-status-category', 'backlog'); await expect(surface.locator('[data-work-item-id="work-101"]')).toHaveCount(0) }
      }
      if (state === 'portal') {
        await page.getByTestId('command-center-trigger').focus(); await page.keyboard.press('Space')
        await expect(page.getByTestId('command-center')).toBeVisible()
        expect(await page.getByTestId('command-center').evaluate(element => element.closest('[data-wm-token-surface]') === null)).toBe(true)
      }
      if (state === 'detail') {
        await card.locator('.wm-work-item-title').focus(); await page.keyboard.press('Enter')
        await expect(page.getByTestId('work-item-detail')).toHaveAttribute('data-mode', 'sheet')
        expect(await page.getByTestId('work-item-detail').evaluate(element => element.closest('[data-wm-token-surface]') === null)).toBe(true)
      }
      await page.evaluate(() => document.fonts.ready)
      await page.addStyleTag({ path: fileURLToPath(new URL('./d0-screenshot.css', import.meta.url)) })
      await page.mouse.move(0, 0)
      const directory = fileURLToPath(new URL(`../../../../docs/reviews/d1b/evidence/board/${info.project.name}/${row.id}/${state}/`, import.meta.url))
      await mkdir(directory, { recursive: true })
      const png = await page.screenshot(screenshotOptions), snapshot = await styles(page)
      await writeFile(`${directory}/${phase}.png`, png)
      if (phase === 'after') {
        await expect(surface).toHaveAttribute('data-wm-token-surface', 'board')
        const before = JSON.parse(await readFile(`${directory}/before.json`, 'utf8')) as { styles: Record<string, unknown> }
        for (const selector of ['body', '.app-sidebar', '.wm-shell-header', '.project-rail', '.project-workspace-header', '.wm-dialog', '.wm-overlay', '.wm-sheet', '.wm-toast-viewport']) expect(snapshot[selector], `未迁区域 ${selector}`).toEqual(before.styles[selector])
        expect(snapshot['[data-testid="work-surfaces"]']?.background).toBe(theme === 'light' ? 'rgb(250, 247, 242)' : 'rgb(11, 12, 14)')
      } else await expect(page.locator(scope)).toHaveCount(0)
      const checks = { scope: true, portal: state === 'portal', detail: state === 'detail', recovery: false, navigation: false, keyboard: false }
      const derived = phase === 'after' && state === 'ready' ? await verifyThemeInheritance(page, 'board') : null
      if (state === 'portal' || state === 'detail') {
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(state === 'portal' ? 'command-center' : 'work-item-detail')).toHaveCount(0)
        await expect(state === 'portal' ? page.getByTestId('command-center-trigger') : card.locator('.wm-work-item-title')).toBeFocused()
      }
      if (state === 'loading') { release?.(); await expect(card).toBeVisible(); checks.recovery = true }
      if (state === 'error') { simulateError = false; await surface.getByRole('button', { name: '重试', exact: true }).click(); await expect(card).toBeVisible(); checks.recovery = true }
      if (state === 'ready') {
        const column = card.locator('xpath=ancestor::*[@data-workflow-state-id]')
        await column.focus(); await page.keyboard.press('ArrowRight')
        expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-workflow-state-id'))).toBe(true)
        checks.keyboard = true
        const sharedBefore = await styles(page)
        await surface.getByRole('button', { name: '列表视图', exact: true }).click()
        await expect(surface.getByTestId('work-list')).toHaveAttribute('data-layout', 'list')
        await expect(page.locator(scope)).toHaveCount(0)
        const listStyle = await card.evaluate(element => getComputedStyle(element).backgroundColor)
        expect(listStyle).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(20, 22, 25)')
        await surface.getByRole('button', { name: '看板视图', exact: true }).click()
        await expect(surface.getByTestId('board')).toHaveAttribute('data-layout', 'board')
        if (phase === 'after') await expect(surface).toHaveAttribute('data-wm-token-surface', 'board')
        for (const selector of ['body', '.app-sidebar', '.wm-shell-header']) expect((await styles(page))[selector]).toEqual(sharedBefore[selector])
        await page.getByTestId('theme-toggle').click()
        await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme === 'light' ? 'dark' : 'light')
        await page.getByTestId('theme-toggle').click()
        await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme)
        checks.navigation = true
      }
      expect(failures).toEqual([])
      expect(requests.filter(request => request.status >= 400).every(request => state === 'error' && request.status === 503 && request.path === '/api/v1/work-items')).toBe(true)
      const evidence = { phase, row: row.id, state, actualURL: page.url(), requestedURL: row.request.url, theme, viewport: info.project.use.viewport,
        fixedTime, browserVersion: browser.version(), launchArguments: info.project.use.launchOptions?.args,
        screenshot: { bytes: png.length, sha256: sha(png) }, styles: snapshot, requests, failures, checks, derived, humanReview: '待本面人工视觉评审' }
      await writeFile(`${directory}/${phase}.json`, JSON.stringify(evidence, null, 2) + '\n')
    } finally { release?.(); await context.close() }
  })
}
