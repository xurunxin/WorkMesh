# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configuration-readiness.spec.ts >> Back/Forward、键盘焦点、390px 窄屏、中英文和明暗回归
- Location: e2e\configuration-readiness.spec.ts:46:1

# Error details

```
TypeError: browserContext.addCookies: Invalid URL
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   | import { readinessFixture } from './fixtures/configuration-readiness.js'
  3   | import { createDb } from '../../../packages/db/src/index.js'
  4   | import { randomUUID } from 'node:crypto'
  5   | 
  6   | test('依赖深度排序', async ({ page }) => {
  7   |   const f = await readinessFixture(page); await page.goto(f.href)
  8   |   const banner = page.getByTestId('readiness-banner')
  9   |   await expect(banner.locator('li')).toHaveCount(3)
  10  |   await expect(banner.locator('li').nth(0)).toContainText(/仓库|repository/)
  11  |   await expect(banner.locator('li').nth(1)).toContainText(/模型|model/)
  12  |   await expect(banner.locator('li').nth(2)).toContainText(/智能体|agent/)
  13  |   await expect(page.getByText(/平台无法确认 Runner 是否在线|cannot confirm whether the Runner/)).toBeVisible()
  14  | })
  15  | test('逐项配置后 Back 重算并允许逆序解决', async ({ page }) => {
  16  |   const f = await readinessFixture(page); await page.goto(f.href)
  17  |   await page.locator('#readiness-agent').click(); await expect(page).toHaveURL(/\/agents/)
  18  |   await f.setAgent(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(2)
  19  |   await page.locator('#readiness-model').click(); await expect(page).toHaveURL(/\/settings\/agent-workbench/)
  20  |   await f.setModel(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(1)
  21  |   await page.locator('#readiness-repository').click(); await expect(page).toHaveURL(/view=projects/)
  22  |   await f.configureRepository(); await page.goBack()
  23  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  24  |   await expect(page.locator('#readiness-title')).toBeFocused()
  25  |   const sessions = await f.call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')
  26  |   expect(sessions.items).toEqual(f.sessionBaseline)
  27  | })
  28  | test('可观察项全部满足时无横幅', async ({ page }) => {
  29  |   const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  30  |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  31  |   await f.configureRepository(); await page.goto(f.href)
  32  |   await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  33  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  34  |   await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  35  | })
  36  | test('ready/unknown/not_applicable 及普通空列表不长主动作', async ({ page }) => {
  37  |   const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  38  |   await page.goto(f.href.replace('workKind=repository', 'workKind=non_repository'))
  39  |   await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  40  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0); await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  41  |   await page.goto(`/workbench?teamId=${f.teamId}`)
  42  |   await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  43  |   await page.goto(`/?view=projects&teamId=${f.teamId}`)
  44  |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  45  | })
  46  | test('Back/Forward、键盘焦点、390px 窄屏、中英文和明暗回归', async ({ page }) => {
  47  |   const f = await readinessFixture(page)
  48  |   for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) {
> 49  |     await page.context().addCookies([{ name: 'workmesh_locale', value: locale, url: new URL(page.url()).origin }])
      |                          ^ TypeError: browserContext.addCookies: Invalid URL
  50  |     await page.addInitScript(({ locale, theme }) => { localStorage.setItem('workmesh_locale', locale); localStorage.setItem('workmesh.theme', theme) }, { locale, theme })
  51  |     await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${f.href}&theme=${theme}`)
  52  |     const link = page.locator('#readiness-repository'); await expect(link).toBeVisible()
  53  |     await link.focus(); await page.keyboard.press('Enter')
  54  |     await expect(page.locator('#project-repository-configuration')).toBeFocused()
  55  |     await page.goBack(); await expect(link).toBeFocused()
  56  |     await page.goForward(); await expect(page.locator('#project-repository-configuration')).toBeVisible()
  57  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  58  |   }
  59  | })
  60  | test('关闭 Gitea 的混合 provider 跨 Team 分页仍可配置 GitHub', async ({ page }) => {
  61  |   const f = await readinessFixture(page)
  62  |   const features = await f.call<{ features: Array<{ key: string; enabled: boolean }> }>('GET', '/api/v1/features')
  63  |   expect(features.features.find(value => value.key === 'WORKMESH_BETA_GITEA')?.enabled).toBe(false)
  64  |   const otherTeam = await f.call<{ id: string }>('POST', '/api/v1/teams', { name: 'A2 other Team', key: `B${randomUUID().slice(0, 6).toUpperCase()}` })
  65  |   const connection = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'GitHub pagination', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  66  |   const excluded = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'fake', externalAccountId: randomUUID(), displayName: 'Gitea existing configuration', webhookSecret: 'a2-webhook-placeholder' })
  67  |   // A pre-existing provider can become disabled; do not use a disabled write command to seed it.
  68  |   const db = createDb()
  69  |   try { await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [excluded.id]) } finally { await db.end() }
  70  |   const expected: string[] = []
  71  |   for (let index = 0; index < 23; index++) {
  72  |     const repository = await f.call<{ id: string }>('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: f.teamId, externalId: String(index), fullName: `z-pagination/${String(index).padStart(2, '0')}`, defaultBranch: 'main' })
  73  |     expected.push(repository.id)
  74  |   }
  75  |   await f.call('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: otherTeam.id, externalId: 'other', fullName: '0-other/hidden', defaultBranch: 'main' })
  76  |   const seedDb = createDb()
  77  |   try { await seedDb.query(`INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch)
  78  |     SELECT workspace_id,id,$2,'disabled','0-gitea/hidden','main' FROM provider_connections WHERE id=$1`, [excluded.id, f.teamId]) } finally { await seedDb.end() }
  79  |   const seen: string[] = []; let cursor: string | null = null
  80  |   do {
  81  |     const own: { items: Array<{ id: string }>; nextCursor: string | null } = await f.call('GET', `/api/v1/repositories?teamId=${f.teamId}&availableOnly=true&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  82  |     seen.push(...own.items.map(value => value.id)); cursor = own.nextCursor
  83  |   } while (cursor)
  84  |   expect(seen).toEqual(expected)
  85  |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  86  |   const section = page.locator('#project-repository-configuration')
  87  |   await expect(section.locator('select').first().locator('option')).toHaveCount(20)
  88  |   await section.getByRole('button', { name: /加载更多|Load more/ }).click()
  89  |   await expect(section.locator('select').first().locator('option')).toHaveCount(23)
  90  |   await expect(section).not.toContainText('0-gitea/hidden'); await expect(section).not.toContainText('0-other/hidden')
  91  |   await f.configureRepository(true); await page.goto(f.href)
  92  |   await expect(page.locator('#readiness-repository')).toHaveCount(0)
  93  | })
  94  | test('Lite 安装后逐项补齐直到横幅消失 @lite', async ({ page }) => {
  95  |   test.skip(process.env.WORKMESH_A2_LITE !== '1', '需要独立 Lite 镜像、无源码安装环境和 HTTPS provider；仓库 E2E 不替代安装验收')
  96  |   const f = await readinessFixture(page); await page.goto(f.href)
  97  |   await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(3)
  98  |   await f.setAgent(); await f.setModel(); await page.reload()
  99  |   await page.locator('#readiness-repository').click(); await f.configureRepository(); await page.goBack()
  100 |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  101 | })
  102 | 
```