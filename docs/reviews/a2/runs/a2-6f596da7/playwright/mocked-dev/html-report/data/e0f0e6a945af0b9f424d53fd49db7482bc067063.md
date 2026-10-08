# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mocked\d0-visual-baseline.mocked.spec.ts >> D0 亮色视觉基线 >> 看板：覆盖、两次采集一致、D1 可直接比对
- Location: e2e\mocked\d0-visual-baseline.mocked.spec.ts:90:5

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  672164 pixels (ratio 0.47 of all image pixels) are different.

  Snapshot: board.png

Call log:
  - Expect "toHaveScreenshot(board.png)" with timeout 15000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 672164 pixels (ratio 0.47 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 672164 pixels (ratio 0.47 of all image pixels) are different.

```

# Test source

```ts
  40  |     const request = route.request()
  41  |     expect(request.method(), '工作台基线只允许读取').toBe('GET')
  42  |     const pathname = new URL(request.url()).pathname
  43  |     const root = '/api/v1/workbench/conversations'
  44  |     let body: unknown
  45  |     switch (pathname) {
  46  |       case root: body = { items: [conversation], nextCursor: null }; break
  47  |       case `${root}/conversation-d0`: body = conversation; break
  48  |       case `${root}/conversation-d0/messages`: body = { items: [
  49  |         { id: 'message-d0-human', role: 'user', sequence: 1, content_markdown: '请核对工作项的改动前界面，并保留可评审的证据。', created_at: fixedTime },
  50  |         { id: 'message-d0-agent', role: 'assistant', sequence: 2, content_markdown: '已记录当前界面。人类负责人保留决策权，后续视觉变化需对照基线评审。', created_at: fixedTime },
  51  |       ], nextBefore: null }; break
  52  |       case `${root}/conversation-d0/turns`: body = { items: [
  53  |         { id: 'turn-d0', status: 'settled', sequence: 1, error_code: null, retry_of_turn_id: null, tool_invocations: [] },
  54  |       ], nextBefore: null }; break
  55  |       case '/api/v1/workbench/llm-connections': body = { items: [connection], nextCursor: null }; break
  56  |       case '/api/v1/workbench/llm-connections/llm-d0': body = connection; break
  57  |       default: throw new Error(`未登记的基线工作台请求：${pathname}`)
  58  |     }
  59  |     await route.fulfill({ status: 200, json: body })
  60  |   })
  61  | }
  62  | 
  63  | async function readyPage(page: Page, surface: typeof surfaces[number]): Promise<void> {
  64  |   await page.clock.setFixedTime(new Date(fixedTime))
  65  |   await page.goto(surface.route, { waitUntil: 'networkidle' })
  66  |   await expect(page.locator(surface.ready)).toBeVisible()
  67  |   await expect(page.locator(surface.ready)).toContainText(surface.text)
  68  |   if (surface.slug === 'board') {
  69  |     const card = page.locator(surface.ready)
  70  |     // 固定滚动到目标列顶部；移动端项目头部不能替代看板内容基线。
  71  |     await card.locator('xpath=ancestor::*[@data-workflow-state-id]').evaluate(column => {
  72  |       column.scrollIntoView({ block: 'start', inline: 'start', behavior: 'instant' })
  73  |     })
  74  |     await expect(card).toBeInViewport({ ratio: 1 })
  75  |     await expect(card.locator('xpath=ancestor::*[@data-workflow-state-id]').locator('header')).toBeInViewport({ ratio: 1 })
  76  |   }
  77  |   await expect(page.locator('main [role="alert"]:visible')).toHaveCount(0)
  78  |   await expect(page.locator('.wm-skeleton:visible, [data-testid="loading"]:visible, [aria-busy="true"]:visible')).toHaveCount(0)
  79  |   await page.evaluate(() => document.fonts.ready)
  80  |   expect(await page.evaluate(() => ({
  81  |     light: matchMedia('(prefers-color-scheme: light)').matches,
  82  |     theme: document.documentElement.dataset.wmTheme,
  83  |     dpr: devicePixelRatio,
  84  |     timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  85  |   }))).toEqual({ light: true, theme: 'light', dpr: 1, timezone: 'UTC' })
  86  | }
  87  | 
  88  | test.describe('D0 亮色视觉基线', () => {
  89  |   for (const surface of surfaces) {
  90  |     test(`${surface.name}：覆盖、两次采集一致、D1 可直接比对`, async ({ browser, request }, testInfo) => {
  91  |       const captures: Buffer[] = []
  92  |       const scrollPositions: unknown[] = []
  93  |       const viewport = testInfo.project.use.viewport
  94  |       if (!viewport) throw new Error('必须显式固定视口')
  95  |       for (const capture of [1, 2]) {
  96  |         const reset = await request.post(`${apiUrl}/__test/reset`, { data: { scenario: 'final-tour' } })
  97  |         expect(reset.ok()).toBe(true)
  98  |         const context = await browser.newContext({
  99  |           baseURL: webUrl, viewport, colorScheme: 'light', deviceScaleFactor: 1,
  100 |           locale: 'zh-CN', timezoneId: 'UTC', reducedMotion: 'reduce', serviceWorkers: 'block',
  101 |         })
  102 |         try {
  103 |           await context.addCookies([{ name: 'workmesh_locale', value: 'zh-CN', url: webUrl }])
  104 |           await context.addInitScript(() => localStorage.setItem('workmesh.theme', 'light'))
  105 |           if (surface.slug === 'workbench') await seedWorkbench(context)
  106 |           {
  107 |             // 既有通用 Session 路由会把 /context 返回成 Session；按当前只读 DTO 补齐夹具。
  108 |             await context.route('**/api/v1/agent-sessions/session-1/context', async route => {
  109 |               expect(route.request().method()).toBe('GET')
  110 |               await route.fulfill({ json: {
  111 |                 contextSnapshotId: 'context-d0', guidanceUris: [], guidancePins: [], plan: null,
  112 |                 workItem: { id: 'work-101', title: 'Final visual tour Issue', team_key: 'FT-', number: 101 },
  113 |               } })
  114 |             })
  115 |             await context.route('**/api/v1/agent-sessions/session-1/explanation', async route => {
  116 |               expect(route.request().method()).toBe('GET')
  117 |               const response = await route.fetch()
  118 |               expect(response.ok()).toBe(true)
  119 |               const body: unknown = await response.json()
  120 |               if (!body || typeof body !== 'object' || !('session' in body)
  121 |                 || !body.session || typeof body.session !== 'object') {
  122 |                 throw new Error('基线 Session explanation 夹具结构错误')
  123 |               }
  124 |               // 固定夹具：09:00 开始，09:30 观察，3600 秒预算消耗一半。
  125 |               await route.fulfill({ response, json: { ...body, session: {
  126 |                 ...body.session, startedAt: '2026-08-22T09:00:00.000Z',
  127 |                 budgetUtilization: [{ limit: 'runtimeSeconds', cap: 3600, used: 1800, ratio: 0.5, measurable: true, warning: false, exhausted: false }],
  128 |               } } })
  129 |             })
  130 |           }
  131 |           const page = await context.newPage()
  132 |           const failures: string[] = []
  133 |           page.on('pageerror', error => failures.push(error.message))
  134 |           page.on('response', response => {
  135 |             const pathname = new URL(response.url()).pathname
  136 |             if (pathname.startsWith('/api/') && response.status() >= 400) failures.push(`${response.status()} ${pathname}`)
  137 |           })
  138 |           await readyPage(page, surface)
  139 |           await page.addStyleTag({ path: screenshotStylePath })
> 140 |           await expect(page).toHaveScreenshot(`${surface.slug}.png`, screenshotOptions)
      |                              ^ Error: expect(page).toHaveScreenshot(expected) failed
  141 |           const bytes = await page.screenshot(screenshotOptions)
  142 |           if (surface.slug === 'board') scrollPositions.push(await page.evaluate(() => ({
  143 |             window: { x: scrollX, y: scrollY },
  144 |             containers: Array.from(document.querySelectorAll('.app-content, .content, .project-detail-pane, .wm-work-item-board-scroll')).map(element => ({
  145 |               selector: element.className, left: element.scrollLeft, top: element.scrollTop,
  146 |             })),
  147 |             cardBounds: document.querySelector('[data-work-item-id="work-101"]')?.getBoundingClientRect().toJSON(),
  148 |             columnHeaderBounds: document.querySelector('[data-work-item-id="work-101"]')?.closest('[data-workflow-state-id]')?.querySelector('header')?.getBoundingClientRect().toJSON(),
  149 |           })))
  150 |           captures.push(bytes)
  151 |           expect(failures, '不得把错误界面登记为基线').toEqual([])
  152 |           await testInfo.attach(`${surface.slug}-capture-${capture}`, { body: bytes, contentType: 'image/png' })
  153 |         } finally {
  154 |           await context.close()
  155 |         }
  156 |       }
  157 |       // 先落盘原始哈希，断言失败时仍保留两次采集证据；通过记录另由 replay.json 表示。
  158 |       const captureEvidencePath = testInfo.outputPath(`${surface.slug}-captures.json`)
  159 |       await writeFile(captureEvidencePath, JSON.stringify({
  160 |         viewport, captureSha256: captures.map(sha256),
  161 |         pairSha256Equal: sha256(captures[0]!) === sha256(captures[1]!),
  162 |         browserLaunchArguments: testInfo.project.use.launchOptions?.args,
  163 |       }, null, 2))
  164 |       await testInfo.attach(`${surface.slug}-captures`, { contentType: 'application/json', path: captureEvidencePath })
  165 |       expect(sha256(captures[1]!), '两个独立上下文的 PNG 必须逐字节一致').toBe(sha256(captures[0]!))
  166 |       if (surface.slug === 'board') expect(scrollPositions[1], '两个独立上下文的采集滚动位置必须相同').toEqual(scrollPositions[0])
  167 |       const replayPath = testInfo.outputPath(`${surface.slug}-replay.json`)
  168 |       await writeFile(replayPath, JSON.stringify({
  169 |         surface: surface.name, route: surface.route, viewport, locale: 'zh-CN',
  170 |         colorScheme: 'light', timezoneId: 'UTC', deviceScaleFactor: 1, fixedTime,
  171 |         browserVersion: browser.version(), platform: process.platform,
  172 |         browserLaunchArguments: testInfo.project.use.launchOptions?.args,
  173 |         snapshot: testInfo.snapshotPath(`${surface.slug}.png`),
  174 |         captureSha256: captures.map(sha256),
  175 |         scrollPositions,
  176 |         tokenSha256: sha256(await readFile(new URL('../../../../packages/ui/src/tokens.css', import.meta.url))),
  177 |       }, null, 2))
  178 |       await testInfo.attach(`${surface.slug}-replay`, { contentType: 'application/json', path: replayPath })
  179 |     })
  180 |   }
  181 | })
  182 | 
```