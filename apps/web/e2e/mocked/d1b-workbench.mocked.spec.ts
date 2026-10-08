import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { verifyThemeInheritance } from './d1b-theme-probes'
import { fixedTime, seedWorkbench } from './d1b-workbench-fixture'

const webUrl = 'http://127.0.0.1:3200'
const phase = process.env.WORKMESH_D1B_PHASE ?? 'after'
if (!['before', 'after'].includes(phase)) throw new Error('WORKMESH_D1B_PHASE 必须为 before 或 after')
const matrix = JSON.parse(await readFile(new URL('../../../../docs/reviews/d1b/surface-matrix.json', import.meta.url), 'utf8')) as {
  rows: Array<{ id: string; stage: string; request: { url: string }; canonical: { expectedURL: string } }>
}
const rows = matrix.rows.filter(row => row.stage === 'workbench')
const states = ['ready', 'create', 'loading', 'error', 'empty', 'rich', 'portal'] as const
const scope = '[data-wm-token-surface="workbench"]'
const screenshotOptions = { animations: 'disabled' as const, caret: 'hide' as const, fullPage: true }

async function styles(page: Page) {
  return page.evaluate(() => {
    const selectors = ['html', 'body', '.app-sidebar', '.wm-shell-header', '.workbench-page', '[data-testid="conversation-workbench"]', '[data-testid="conversation-workbench"] > aside', '[aria-controls="workbench-create-form"]', '[data-testid="rich-markdown"]', '[role="alert"]', '.wm-dialog', '.wm-overlay', '.wm-toast-viewport']
    return Object.fromEntries(selectors.map(selector => {
      const element = document.querySelector(selector)
      if (!element) return [selector, null]
      const s = getComputedStyle(element)
      return [selector, { color: s.color, background: s.backgroundColor, border: s.borderColor, radius: s.borderRadius, shadow: s.boxShadow, outline: s.outline, gradient: s.backgroundImage, display: s.display, gridColumns: s.gridTemplateColumns, rect: element.getBoundingClientRect().toJSON() }]
    }))
  })
}

for (const row of rows) {
  for (const state of row.id === 'root-redirect' ? ['ready'] as const : states) {
    test(`${row.id}/${state}：真实路由、明暗布局、截图和键盘`, async ({ browser, request }, info) => {
      const theme = info.project.name.endsWith('-dark') ? 'dark' : 'light'
      const reset = await request.post('http://127.0.0.1:3201/__test/reset', { data: { scenario: 'final-tour' } })
      expect(reset.ok()).toBe(true)
      const context = await browser.newContext({ ...info.project.use, baseURL: webUrl, viewport: info.project.use.viewport, colorScheme: 'light', deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block' })
      let release: (() => void) | undefined
      const held = new Promise<void>(resolve => { release = resolve })
      const requests: Array<{ method: string; path: string; status: number }> = []
      const failures: string[] = []
      try {
        await context.addCookies([{ name: 'workmesh_locale', value: 'zh-CN', url: webUrl }])
        await context.addInitScript(theme => { if (!localStorage.getItem('workmesh.theme')) localStorage.setItem('workmesh.theme', theme) }, theme)
        await seedWorkbench(context)
        let simulateError = state === 'error'
        await context.route('**/api/v1/workbench/conversations', async route => {
          expect(route.request().method()).toBe('GET')
          if (state === 'loading') await held
          if (simulateError) await route.fulfill({ status: 503, json: { error: { code: 'D1B_READ_UNAVAILABLE', message: 'D1b 只读夹具暂不可用', correlationId: 'd1b-read' } } })
          else if (state === 'empty') await route.fulfill({ json: { items: [], nextCursor: null } })
          else await route.fallback()
        })
        if (state === 'rich') await context.route('**/api/v1/workbench/conversations/conversation-d0/messages?**', async route => {
          expect(route.request().method()).toBe('GET')
          await route.fulfill({ json: { items: [{ id: 'd1b-rich', role: 'assistant', sequence: 1, content_markdown: '# 只读内容\n\n[返回工作项](/?view=my-work)\n\n```ts\nconst status = "started"\n```\n\n> 状态与权限保持真实', created_at: fixedTime }], nextBefore: null } })
        })
        const page = await context.newPage()
        page.on('pageerror', error => failures.push(error.message))
        page.on('response', response => {
          const url = new URL(response.url())
          if (url.pathname.startsWith('/api/')) requests.push({ method: response.request().method(), path: url.pathname, status: response.status() })
        })
        await page.clock.setFixedTime(new Date(fixedTime))
        await page.goto(row.request.url, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(new URL(row.canonical.expectedURL, webUrl).href)
        const workbench = page.getByTestId('conversation-workbench')
        await expect(workbench).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme)
        if (state === 'loading') await expect(workbench.locator('[role="list"] > p')).toBeVisible()
        else if (state === 'error') await expect(workbench.getByRole('alert')).toContainText('D1b 只读夹具暂不可用')
        else if (state === 'empty') {
          await expect(workbench.locator('[role="list"] > p')).toBeVisible()
          await expect(workbench.locator('h2').filter({ hasText: '改动前基线对话' })).toHaveCount(0)
        } else {
          await expect(workbench.locator('h2').filter({ hasText: '改动前基线对话' })).toBeVisible()
          await expect(workbench.locator('[role="alert"]')).toHaveCount(0)
        }
        if (state === 'create') {
          const create = workbench.locator('[aria-controls="workbench-create-form"]')
          await create.focus()
          await page.keyboard.press('Space')
          await expect(create).toHaveAttribute('aria-expanded', 'true')
          await page.keyboard.press('Tab')
          await expect(page.locator('#workbench-create-form input')).toBeFocused()
        }
        if (state === 'rich') await expect(workbench.locator('pre')).toContainText('const status')
        if (state === 'portal') {
          await page.getByTestId('command-center-trigger').focus()
          await page.keyboard.press('Space')
          await expect(page.getByTestId('command-center')).toBeVisible()
          await expect(page.getByRole('combobox', { name: '搜索 WorkMesh', exact: true })).toBeFocused()
          expect(await page.getByTestId('command-center').evaluate(element => element.closest('[data-wm-token-surface]') === null)).toBe(true)
        }
        await page.evaluate(() => document.fonts.ready)
        await page.addStyleTag({ path: fileURLToPath(new URL('./d0-screenshot.css', import.meta.url)) })
        await page.mouse.move(0, 0)
        const directory = fileURLToPath(new URL(`../../../../docs/reviews/d1b/evidence/workbench/${info.project.name}/${row.id}/${state}/`, import.meta.url))
        await mkdir(directory, { recursive: true })
        const png = await page.screenshot(screenshotOptions)
        await writeFile(`${directory}/${phase}.png`, png)
        const snapshot = await styles(page)
        if (phase === 'after') {
          await expect(page.locator(scope)).toHaveCount(1)
          const before = JSON.parse(await readFile(`${directory}/before.json`, 'utf8')) as { styles: Record<string, unknown> }
          for (const shared of ['body', '.app-sidebar', '.wm-shell-header', '.wm-dialog', '.wm-overlay', '.wm-toast-viewport']) expect(snapshot[shared], `未迁共享区域 ${shared}`).toEqual(before.styles[shared])
          expect(snapshot['[data-testid="conversation-workbench"]']?.background).toBe(theme === 'light' ? 'rgb(250, 247, 242)' : 'rgb(11, 12, 14)')
        }
        const derived = phase === 'after' && state === 'ready' ? await verifyThemeInheritance(page) : null
        const evidence = { derived, phase, row: row.id, state, actualURL: page.url(), theme, viewport: info.project.use.viewport, fixedTime, browserVersion: browser.version(), launchArguments: info.project.use.launchOptions?.args, screenshot: { sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length }, styles: snapshot, requests, failures, humanReview: '待人工视觉评审' }
        await writeFile(`${directory}/${phase}.json`, JSON.stringify(evidence, null, 2) + '\n')
        expect(failures).toEqual([])
        const rejected = requests.filter(request => request.status >= 400)
        expect(rejected.every(request => state === 'error' && request.status === 503 && request.path === '/api/v1/workbench/conversations')).toBe(true)
        if (state === 'loading') { release?.(); await expect(workbench.locator('h2').filter({ hasText: '改动前基线对话' })).toBeVisible() }
        if (state === 'error') {
          simulateError = false
          await workbench.getByRole('button', { name: '重试', exact: true }).click()
          await expect(workbench.locator('h2').filter({ hasText: '改动前基线对话' })).toBeVisible()
        }
        if (state === 'portal') {
          await page.keyboard.press('Escape')
          await expect(page.getByTestId('command-center')).toHaveCount(0)
          await expect(page.getByTestId('command-center-trigger')).toBeFocused()
        }
        if (state === 'ready') {
          const toggle = page.getByTestId('theme-toggle')
          if (await toggle.isVisible()) await toggle.click()
          else await page.goto(`/workbench?theme=${theme === 'light' ? 'dark' : 'light'}`)
          await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme === 'light' ? 'dark' : 'light')
          await page.reload()
          await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme === 'light' ? 'dark' : 'light')
          if (await toggle.isVisible()) await toggle.click()
          else await page.goto(`/workbench?theme=${theme}`)
          await expect(page.locator('html')).toHaveAttribute('data-wm-theme', theme)
          const back = page.getByTestId('workbench-back-to-issues')
          await back.focus()
          await page.keyboard.press('Enter')
          await expect(page.getByTestId('work-list')).toBeVisible()
          await expect(page.locator(scope)).toHaveCount(0)
          await page.goBack()
          await expect(page.getByTestId('conversation-workbench')).toBeVisible()
        }
        await writeFile(`${directory}/${phase}.json`, JSON.stringify({ ...evidence, checks: { screenshot: true, readyOrState: true, keyboardCreate: state === 'create', errorRecovery: state === 'error', themeNavigation: state === 'ready', portalCloseAndFocus: state === 'portal', derived: derived !== null }, finalURL: page.url(), finalTheme: await page.locator('html').getAttribute('data-wm-theme'), failures, requests }, null, 2) + '\n')
      } finally { release?.(); await context.close() }
    })
  }
}
