# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configuration-readiness.spec.ts >> 逐项配置后 Back 重算并允许逆序解决
- Location: e2e\configuration-readiness.spec.ts:16:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  locator('#readiness-title')
Expected: focused
Received: inactive
Timeout:  10000ms

Call log:
  - Expect "toBeFocused" with timeout 10000ms
  - waiting for locator('#readiness-title')
    22 × locator resolved to <h2 tabindex="-1" id="readiness-title" class="configuration-readiness_srOnly__bQnr1">Observable configuration is satisfied</h2>
       - unexpected value "inactive"

```

```yaml
- heading "Observable configuration is satisfied" [level=2]
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   | import { readinessFixture } from './fixtures/configuration-readiness.js'
  3   | import { createDb } from '../../../packages/db/src/index.js'
  4   | import { randomUUID } from 'node:crypto'
  5   | test.use({ timezoneId: 'UTC', deviceScaleFactor: 1, launchOptions: { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-partial-raster'] } })
  6   | 
  7   | test('依赖深度排序', async ({ page }) => {
  8   |   const f = await readinessFixture(page); await page.goto(f.href)
  9   |   const banner = page.getByTestId('readiness-banner')
  10  |   await expect(banner.locator('li')).toHaveCount(3)
  11  |   await expect(banner.locator('li').nth(0)).toContainText(/仓库|repository/)
  12  |   await expect(banner.locator('li').nth(1)).toContainText(/模型|model/)
  13  |   await expect(banner.locator('li').nth(2)).toContainText(/智能体|agent/)
  14  |   await expect(page.getByText(/平台无法确认 Runner 是否在线|cannot confirm whether the Runner/)).toBeVisible()
  15  | })
  16  | test('逐项配置后 Back 重算并允许逆序解决', async ({ page }) => {
  17  |   const f = await readinessFixture(page); await page.goto(f.href)
  18  |   await page.locator('#readiness-agent').click(); await expect(page).toHaveURL(/\/agents/)
  19  |   await f.setAgent(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(2)
  20  |   await page.locator('#readiness-model').click(); await expect(page).toHaveURL(/\/settings\/agent-workbench/)
  21  |   await f.setModel(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(1)
  22  |   await page.locator('#readiness-repository').click(); await expect(page).toHaveURL(/view=projects/)
  23  |   await f.configureRepository(); await page.goBack()
  24  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
> 25  |   await expect(page.locator('#readiness-title')).toBeFocused()
      |                                                  ^ Error: expect(locator).toBeFocused() failed
  26  |   const sessions = await f.call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')
  27  |   expect(sessions.items).toEqual(f.sessionBaseline)
  28  | })
  29  | test('可观察项全部满足时无横幅', async ({ page }) => {
  30  |   const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  31  |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  32  |   await f.configureRepository(); await page.goto(f.href)
  33  |   await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  34  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  35  |   await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  36  | })
  37  | test('ready/unknown/not_applicable 及普通空列表不长主动作', async ({ page }) => {
  38  |   const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  39  |   await page.goto(f.href.replace('workKind=repository', 'workKind=non_repository'))
  40  |   await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  41  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0); await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  42  |   await page.goto(`/workbench?teamId=${f.teamId}`)
  43  |   await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  44  |   await page.goto(`/?view=projects&teamId=${f.teamId}`)
  45  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  46  | })
  47  | test('Back/Forward、键盘焦点、390px 窄屏、中英文和明暗回归', async ({ page }, testInfo) => {
  48  |   const f = await readinessFixture(page)
  49  |   for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) {
  50  |     await page.context().addCookies([{ name: 'workmesh_locale', value: locale, url: process.env.WORKMESH_A2_LITE_URL ?? 'http://127.0.0.1:3100' }])
  51  |     await page.addInitScript(({ locale, theme }) => { localStorage.setItem('workmesh_locale', locale); localStorage.setItem('workmesh.theme', theme) }, { locale, theme })
  52  |     await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${f.href}&theme=${theme}`)
  53  |     const link = page.locator('#readiness-repository'); await expect(link).toBeVisible()
  54  |     if (locale === 'zh-CN' && theme === 'light') {
  55  |       await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png') }); await page.setViewportSize({ width: 390, height: 844 })
  56  |     }
  57  |     await page.screenshot({ path: testInfo.outputPath(`workbench-${locale}-${theme}.png`) })
  58  |     await link.focus(); await page.keyboard.press('Enter')
  59  |     await expect(page.locator('#project-repository-configuration')).toBeFocused()
  60  |     if (locale === 'zh-CN' && theme === 'light') {
  61  |       await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath('project-desktop.png') }); await page.setViewportSize({ width: 390, height: 844 })
  62  |     }
  63  |     await page.screenshot({ path: testInfo.outputPath(`project-${locale}-${theme}.png`) })
  64  |     await page.goBack(); await expect(link).toBeFocused()
  65  |     await page.goForward(); await expect(page.locator('#project-repository-configuration')).toBeVisible()
  66  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  67  |   }
  68  | })
  69  | test('关闭 Gitea 的混合 provider 跨 Team 分页仍可配置 GitHub', async ({ page }) => {
  70  |   test.skip(process.env.WORKMESH_A2_DISABLE_GITEA !== '1', '关闭 Gitea 的独立 A2 服务运行；全仓服务保留其原 feature 设置')
  71  |   const f = await readinessFixture(page)
  72  |   const features = await f.call<{ features: Array<{ key: string; enabled: boolean }> }>('GET', '/api/v1/features')
  73  |   expect(features.features.find(value => value.key === 'WORKMESH_BETA_GITEA')?.enabled).toBe(false)
  74  |   const otherTeam = await f.call<{ id: string }>('POST', '/api/v1/teams', { name: 'A2 other Team', key: `B${randomUUID().slice(0, 6).toUpperCase()}` })
  75  |   const connection = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'GitHub pagination', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  76  |   const excluded = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'Gitea existing configuration', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  77  |   // A pre-existing provider can become disabled; do not use a disabled write command to seed it.
  78  |   const db = createDb()
  79  |   try { await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [excluded.id]) } finally { await db.end() }
  80  |   const expected: string[] = []
  81  |   for (let index = 0; index < 23; index++) {
  82  |     const repository = await f.call<{ id: string }>('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: f.teamId, externalId: String(index), fullName: `z-pagination/${String(index).padStart(2, '0')}`, defaultBranch: 'main' })
  83  |     expected.push(repository.id)
  84  |   }
  85  |   await f.call('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: otherTeam.id, externalId: 'other', fullName: '0-other/hidden', defaultBranch: 'main' })
  86  |   const seedDb = createDb()
  87  |   try { await seedDb.query(`INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch)
  88  |     SELECT workspace_id,id,$2,'disabled','0-gitea/hidden','main' FROM provider_connections WHERE id=$1`, [excluded.id, f.teamId]) } finally { await seedDb.end() }
  89  |   const seen: string[] = []; let cursor: string | null = null
  90  |   do {
  91  |     const own: { items: Array<{ id: string }>; nextCursor: string | null } = await f.call('GET', `/api/v1/repositories?teamId=${f.teamId}&availableOnly=true&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  92  |     seen.push(...own.items.map(value => value.id)); cursor = own.nextCursor
  93  |   } while (cursor)
  94  |   expect(seen).toEqual(expected)
  95  |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  96  |   const section = page.locator('#project-repository-configuration')
  97  |   await expect(section.locator('select').first().locator('option')).toHaveCount(20)
  98  |   await section.getByRole('button', { name: /加载更多|Load more/ }).click()
  99  |   await expect(section.locator('select').first().locator('option')).toHaveCount(23)
  100 |   await expect(section).not.toContainText('0-gitea/hidden'); await expect(section).not.toContainText('0-other/hidden')
  101 |   await f.configureRepository(true); await page.goto(f.href)
  102 |   await expect(page.locator('#readiness-repository')).toHaveCount(0)
  103 | })
  104 | test('A2 响应丢失后重试保持配置请求身份', async ({ page }) => {
  105 |   const f = await readinessFixture(page)
  106 |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  107 |   await f.configureRepository(false, true); await page.goto(f.href)
  108 |   await expect(page.locator('#readiness-repository')).toHaveCount(0)
  109 | })
  110 | test('URL 缺失非法重复工作类型不查询，也不推断上下文', async ({ page }) => {
  111 |   const f = await readinessFixture(page); const requests: string[] = []
  112 |   page.on('request', request => { if (request.url().includes('/configuration-readiness?')) requests.push(request.url()) })
  113 |   for (const suffix of ['', '&workKind=invalid', '&workKind=repository&workKind=non_repository']) {
  114 |     await page.goto(`/workbench?teamId=${f.teamId}${suffix}`)
  115 |     await expect(page.getByTestId('configuration-readiness')).toContainText(/请从明确指定工作类型|explicit work type/)
  116 |     await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  117 |   }
  118 |   expect(requests).toEqual([])
  119 | })
  120 | test('Lite 安装后逐项补齐直到横幅消失 @lite', async ({ page }) => {
  121 |   test.skip(process.env.WORKMESH_A2_LITE !== '1', '需要独立 Lite 镜像、无源码安装环境和 HTTPS provider；仓库 E2E 不替代安装验收')
  122 |   const f = await readinessFixture(page); await page.goto(f.href)
  123 |   await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(3)
  124 |   await f.setAgent(); await f.setModel(); await page.reload()
  125 |   await page.locator('#readiness-repository').click(); await f.configureRepository(); await page.goBack()
```