import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const fixedTime = '2026-08-22T09:30:00.000Z'
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const screenshotStylePath = fileURLToPath(new URL('./d0-screenshot.css', import.meta.url))
const screenshotOptions = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  fullPage: true,
}

const surfaces = [
  { name: '工作台', slug: 'workbench', route: '/workbench', ready: '[data-testid="conversation-workbench"] h2:has-text("改动前基线对话")', text: '改动前基线对话' },
  { name: '看板', slug: 'board', route: '/?view=projects&project=project-1&tab=board', ready: '[data-testid="board"] [data-work-item-id="work-101"]', text: 'Final visual tour Issue' },
  { name: '项目总览', slug: 'project', route: '/?view=projects&project=project-1', ready: '[data-testid="project-workspace"]', text: 'Runtime Reliability' },
  { name: 'Agent 详情', slug: 'agent-detail', route: '/agents/agent%2F1', ready: '.agent-detail-page h1', text: 'Codex' },
  { name: '工作项列表', slug: 'issues-list', route: '/?view=my-work', ready: '[data-testid="work-list"] [data-work-item-id="work-101"]', text: 'Final visual tour Issue' },
  { name: '工作项详情', slug: 'issue-detail', route: '/?view=my-work&workItem=work-101', ready: '[data-testid="work-item-detail"] .work-item-execution-header h3', text: 'Final visual tour Issue' },
  { name: '设置', slug: 'settings', route: '/settings?team=team-page-2', ready: '.wm-workflow-state-list', text: 'Final tour active' },
] as const

// 现有 final-tour 夹具没有对话端点；这里只补固定的只读传输数据，不调用模型或写入领域。
async function seedWorkbench(context: BrowserContext): Promise<void> {
  const conversation = {
    id: 'conversation-d0', title: '改动前基线对话', status: 'active', revision: 1,
    team_id: 'team-2', agent_session_id: 'session-1', default_llm_connection_id: 'llm-d0',
    default_llm_model_id: 'model-d0', work_item_id: 'work-101', project_id: 'project-1',
    updated_at: fixedTime, context_pins: [],
  }
  const connection = {
    id: 'llm-d0', name: '基线模型服务', status: 'active', secret_status: 'configured',
    models: [{ id: 'model-d0', display_name: '基线模型', enabled: true }],
  }
  await context.route('**/api/v1/workbench/**', async route => {
    const request = route.request()
    expect(request.method(), '工作台基线只允许读取').toBe('GET')
    const pathname = new URL(request.url()).pathname
    const root = '/api/v1/workbench/conversations'
    let body: unknown
    switch (pathname) {
      case root: body = { items: [conversation], nextCursor: null }; break
      case `${root}/conversation-d0`: body = conversation; break
      case `${root}/conversation-d0/messages`: body = { items: [
        { id: 'message-d0-human', role: 'user', sequence: 1, content_markdown: '请核对工作项的改动前界面，并保留可评审的证据。', created_at: fixedTime },
        { id: 'message-d0-agent', role: 'assistant', sequence: 2, content_markdown: '已记录当前界面。人类负责人保留决策权，后续视觉变化需对照基线评审。', created_at: fixedTime },
      ], nextBefore: null }; break
      case `${root}/conversation-d0/turns`: body = { items: [
        { id: 'turn-d0', status: 'settled', sequence: 1, error_code: null, retry_of_turn_id: null, tool_invocations: [] },
      ], nextBefore: null }; break
      case '/api/v1/workbench/llm-connections': body = { items: [connection], nextCursor: null }; break
      case '/api/v1/workbench/llm-connections/llm-d0': body = connection; break
      default: throw new Error(`未登记的基线工作台请求：${pathname}`)
    }
    await route.fulfill({ status: 200, json: body })
  })
}

async function readyPage(page: Page, surface: typeof surfaces[number]): Promise<void> {
  await page.clock.setFixedTime(new Date(fixedTime))
  await page.goto(surface.route, { waitUntil: 'networkidle' })
  await expect(page.locator(surface.ready)).toBeVisible()
  await expect(page.locator(surface.ready)).toContainText(surface.text)
  if (surface.slug === 'board') {
    const card = page.locator(surface.ready)
    // 固定滚动到目标列顶部；移动端项目头部不能替代看板内容基线。
    await card.locator('xpath=ancestor::*[@data-workflow-state-id]').evaluate(column => {
      column.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' })
    })
    await expect(card).toBeInViewport({ ratio: 1 })
    await expect(card.locator('xpath=ancestor::*[@data-workflow-state-id]').locator('header')).toBeInViewport({ ratio: 1 })
  }
  await expect(page.locator('main [role="alert"]:visible')).toHaveCount(0)
  await expect(page.locator('.wm-skeleton:visible, [data-testid="loading"]:visible, [aria-busy="true"]:visible')).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => ({
    light: matchMedia('(prefers-color-scheme: light)').matches,
    theme: document.documentElement.dataset.wmTheme,
    dpr: devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }))).toEqual({ light: true, theme: 'light', dpr: 1, timezone: 'UTC' })
}

test.describe('D0 亮色视觉基线', () => {
  for (const surface of surfaces) {
    test(`${surface.name}：覆盖、两次采集一致、D1 可直接比对`, async ({ browser, request }, testInfo) => {
      const captures: Buffer[] = []
      const scrollPositions: unknown[] = []
      const viewport = testInfo.project.use.viewport
      if (!viewport) throw new Error('必须显式固定视口')
      for (const capture of [1, 2]) {
        const reset = await request.post(`${apiUrl}/__test/reset`, { data: { scenario: 'final-tour' } })
        expect(reset.ok()).toBe(true)
        const context = await browser.newContext({
          baseURL: webUrl, viewport, colorScheme: 'light', deviceScaleFactor: 1,
          locale: 'zh-CN', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block',
        })
        try {
          await context.addCookies([{ name: 'workmesh_locale', value: 'zh-CN', url: webUrl }])
          await context.addInitScript(() => localStorage.setItem('workmesh.theme', 'light'))
          if (surface.slug === 'workbench') await seedWorkbench(context)
          {
            // 既有通用 Session 路由会把 /context 返回成 Session；按当前只读 DTO 补齐夹具。
            await context.route('**/api/v1/agent-sessions/session-1/context', async route => {
              expect(route.request().method()).toBe('GET')
              await route.fulfill({ json: {
                contextSnapshotId: 'context-d0', guidanceUris: [], guidancePins: [], plan: null,
                workItem: { id: 'work-101', title: 'Final visual tour Issue', team_key: 'FT-', number: 101 },
              } })
            })
            await context.route('**/api/v1/agent-sessions/session-1/explanation', async route => {
              expect(route.request().method()).toBe('GET')
              const response = await route.fetch()
              expect(response.ok()).toBe(true)
              const body: unknown = await response.json()
              if (!body || typeof body !== 'object' || !('session' in body)
                || !body.session || typeof body.session !== 'object') {
                throw new Error('基线 Session explanation 夹具结构错误')
              }
              // 固定夹具：09:00 开始，09:30 观察，3600 秒预算消耗一半。
              await route.fulfill({ response, json: { ...body, session: {
                ...body.session, startedAt: '2026-08-22T09:00:00.000Z',
                budgetUtilization: [{ limit: 'runtimeSeconds', cap: 3600, used: 1800, ratio: 0.5, measurable: true, warning: false, exhausted: false }],
              } } })
            })
          }
          const page = await context.newPage()
          const failures: string[] = []
          page.on('pageerror', error => failures.push(error.message))
          page.on('response', response => {
            const pathname = new URL(response.url()).pathname
            if (pathname.startsWith('/api/') && response.status() >= 400) failures.push(`${response.status()} ${pathname}`)
          })
          await readyPage(page, surface)
          await page.addStyleTag({ path: screenshotStylePath })
          await expect(page).toHaveScreenshot(`${surface.slug}.png`, screenshotOptions)
          const bytes = await page.screenshot(screenshotOptions)
          if (surface.slug === 'board') scrollPositions.push(await page.evaluate(() => ({
            window: { x: scrollX, y: scrollY },
            containers: Array.from(document.querySelectorAll('.app-content, .content, .project-detail-pane, .wm-work-item-board-scroll')).map(element => ({
              selector: element.className, left: element.scrollLeft, top: element.scrollTop,
            })),
            cardBounds: document.querySelector('[data-work-item-id="work-101"]')?.getBoundingClientRect().toJSON(),
            columnHeaderBounds: document.querySelector('[data-work-item-id="work-101"]')?.closest('[data-workflow-state-id]')?.querySelector('header')?.getBoundingClientRect().toJSON(),
          })))
          captures.push(bytes)
          expect(failures, '不得把错误界面登记为基线').toEqual([])
          await testInfo.attach(`${surface.slug}-capture-${capture}`, { body: bytes, contentType: 'image/png' })
        } finally {
          await context.close()
        }
      }
      // 先落盘原始哈希，断言失败时仍保留两次采集证据；通过记录另由 replay.json 表示。
      const captureEvidencePath = testInfo.outputPath(`${surface.slug}-captures.json`)
      await writeFile(captureEvidencePath, JSON.stringify({
        viewport, captureSha256: captures.map(sha256),
        pairSha256Equal: sha256(captures[0]!) === sha256(captures[1]!),
        browserLaunchArguments: testInfo.project.use.launchOptions?.args,
      }, null, 2))
      await testInfo.attach(`${surface.slug}-captures`, { contentType: 'application/json', path: captureEvidencePath })
      expect(sha256(captures[1]!), '两个独立上下文的 PNG 必须逐字节一致').toBe(sha256(captures[0]!))
      if (surface.slug === 'board') expect(scrollPositions[1], '两个独立上下文的采集滚动位置必须相同').toEqual(scrollPositions[0])
      const replayPath = testInfo.outputPath(`${surface.slug}-replay.json`)
      await writeFile(replayPath, JSON.stringify({
        surface: surface.name, route: surface.route, viewport, locale: 'zh-CN',
        colorScheme: 'light', timezoneId: 'UTC', deviceScaleFactor: 1, fixedTime,
        browserVersion: browser.version(), platform: process.platform,
        browserLaunchArguments: testInfo.project.use.launchOptions?.args,
        snapshot: testInfo.snapshotPath(`${surface.slug}.png`),
        captureSha256: captures.map(sha256),
        scrollPositions,
        tokenSha256: sha256(await readFile(new URL('../../../../packages/ui/src/tokens.css', import.meta.url))),
      }, null, 2))
      await testInfo.attach(`${surface.slug}-replay`, { contentType: 'application/json', path: replayPath })
    })
  }
})
