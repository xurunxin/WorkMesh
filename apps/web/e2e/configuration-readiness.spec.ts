import { expect, test } from '@playwright/test'
import { readinessFixture } from './fixtures/configuration-readiness.js'
import { createDb } from '../../../packages/db/src/index.js'
import { randomUUID } from 'node:crypto'
test.use({ timezoneId: 'UTC', deviceScaleFactor: 1, launchOptions: { args: ['--disable-gpu', '--disable-skia-runtime-opts', '--force-color-profile=srgb', '--disable-partial-raster'] } })

test('依赖深度排序', async ({ page }) => {
  const f = await readinessFixture(page); await page.goto(f.href)
  const banner = page.getByTestId('readiness-banner')
  await expect(banner.locator('li')).toHaveCount(3)
  await expect(banner.locator('li').nth(0)).toContainText(/仓库|repository/)
  await expect(banner.locator('li').nth(1)).toContainText(/模型|model/)
  await expect(banner.locator('li').nth(2)).toContainText(/智能体|agent/)
  await expect(page.getByText(/平台无法确认 Runner 是否在线|cannot confirm whether the Runner/)).toBeVisible()
})
test('逐项配置后 Back 重算并允许逆序解决', async ({ page }) => {
  const f = await readinessFixture(page); await page.goto(f.href)
  await page.locator('#readiness-agent').click(); await expect(page).toHaveURL(/\/agents/)
  await f.setAgent(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(2)
  await page.locator('#readiness-model').click(); await expect(page).toHaveURL(/\/settings\/agent-workbench/)
  await f.setModel(); await page.goBack(); await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(1)
  await page.locator('#readiness-repository').click(); await expect(page).toHaveURL(/view=projects/)
  await f.configureRepository(); await page.goBack()
  await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  await expect(page.locator('#readiness-title')).toBeFocused()
  const sessions = await f.call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')
  expect(sessions.items).toEqual(f.sessionBaseline)
})
test('可观察项全部满足时无横幅', async ({ page }) => {
  const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  await f.configureRepository(); await page.goto(f.href)
  await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
})
test('ready/unknown/not_applicable 及普通空列表不长主动作', async ({ page }) => {
  const f = await readinessFixture(page); await f.setAgent(); await f.setModel()
  await page.goto(f.href.replace('workKind=repository', 'workKind=non_repository'))
  await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  await expect(page.getByTestId('readiness-banner')).toHaveCount(0); await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  await page.goto(`/workbench?teamId=${f.teamId}`)
  await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  await page.goto(`/?view=projects&teamId=${f.teamId}`)
  await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
})
test('Back/Forward、键盘焦点、390px 窄屏、中英文和明暗回归', async ({ page }, testInfo) => {
  const f = await readinessFixture(page)
  for (const locale of ['zh-CN', 'en']) for (const theme of ['light', 'dark']) {
    await page.context().addCookies([{ name: 'workmesh_locale', value: locale, url: process.env.WORKMESH_A2_LITE_URL ?? 'http://127.0.0.1:3100' }])
    await page.addInitScript(({ locale, theme }) => { localStorage.setItem('workmesh_locale', locale); localStorage.setItem('workmesh.theme', theme) }, { locale, theme })
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${f.href}&theme=${theme}`)
    const link = page.locator('#readiness-repository'); await expect(link).toBeVisible()
    if (locale === 'zh-CN' && theme === 'light') {
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png') }); await page.setViewportSize({ width: 390, height: 844 })
    }
    await page.screenshot({ path: testInfo.outputPath(`workbench-${locale}-${theme}.png`) })
    await link.focus(); await page.keyboard.press('Enter')
    await expect(page.locator('#project-repository-configuration')).toBeFocused()
    if (locale === 'zh-CN' && theme === 'light') {
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: testInfo.outputPath('project-desktop.png') }); await page.setViewportSize({ width: 390, height: 844 })
    }
    await page.screenshot({ path: testInfo.outputPath(`project-${locale}-${theme}.png`) })
    await page.goBack(); await expect(link).toBeFocused()
    await page.goForward(); await expect(page.locator('#project-repository-configuration')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
})
test('关闭 Gitea 的混合 provider 跨 Team 分页仍可配置 GitHub', async ({ page }) => {
  test.skip(process.env.WORKMESH_A2_DISABLE_GITEA !== '1', '关闭 Gitea 的独立 A2 服务运行；全仓服务保留其原 feature 设置')
  const f = await readinessFixture(page)
  const features = await f.call<{ features: Array<{ key: string; enabled: boolean }> }>('GET', '/api/v1/features')
  expect(features.features.find(value => value.key === 'WORKMESH_BETA_GITEA')?.enabled).toBe(false)
  const otherTeam = await f.call<{ id: string }>('POST', '/api/v1/teams', { name: 'A2 other Team', key: `B${randomUUID().slice(0, 6).toUpperCase()}` })
  const connection = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'GitHub pagination', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  const excluded = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'Gitea existing configuration', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  // A pre-existing provider can become disabled; do not use a disabled write command to seed it.
  const db = createDb()
  try { await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [excluded.id]) } finally { await db.end() }
  const expected: string[] = []
  for (let index = 0; index < 23; index++) {
    const repository = await f.call<{ id: string }>('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: f.teamId, externalId: String(index), fullName: `z-pagination/${String(index).padStart(2, '0')}`, defaultBranch: 'main' })
    expected.push(repository.id)
  }
  await f.call('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: otherTeam.id, externalId: 'other', fullName: '0-other/hidden', defaultBranch: 'main' })
  const seedDb = createDb()
  try { await seedDb.query(`INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch)
    SELECT workspace_id,id,$2,'disabled','0-gitea/hidden','main' FROM provider_connections WHERE id=$1`, [excluded.id, f.teamId]) } finally { await seedDb.end() }
  const seen: string[] = []; let cursor: string | null = null
  do {
    const own: { items: Array<{ id: string }>; nextCursor: string | null } = await f.call('GET', `/api/v1/repositories?teamId=${f.teamId}&availableOnly=true&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    seen.push(...own.items.map(value => value.id)); cursor = own.nextCursor
  } while (cursor)
  expect(seen).toEqual(expected)
  await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  const section = page.locator('#project-repository-configuration')
  await expect(section.locator('select').first().locator('option')).toHaveCount(20)
  await section.getByRole('button', { name: /加载更多|Load more/ }).click()
  await expect(section.locator('select').first().locator('option')).toHaveCount(23)
  await expect(section).not.toContainText('0-gitea/hidden'); await expect(section).not.toContainText('0-other/hidden')
  await f.configureRepository(true); await page.goto(f.href)
  await expect(page.locator('#readiness-repository')).toHaveCount(0)
})
test('A2 响应丢失后重试保持配置请求身份', async ({ page }) => {
  const f = await readinessFixture(page)
  await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  await f.configureRepository(false, true); await page.goto(f.href)
  await expect(page.locator('#readiness-repository')).toHaveCount(0)
})
test('URL 缺失非法重复工作类型不查询，也不推断上下文', async ({ page }) => {
  const f = await readinessFixture(page); const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/configuration-readiness?')) requests.push(request.url()) })
  for (const suffix of ['', '&workKind=invalid', '&workKind=repository&workKind=non_repository']) {
    await page.goto(`/workbench?teamId=${f.teamId}${suffix}`)
    await expect(page.getByTestId('configuration-readiness')).toContainText(/请从明确指定工作类型|explicit work type/)
    await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  }
  expect(requests).toEqual([])
})
test('Lite 安装后逐项补齐直到横幅消失 @lite', async ({ page }) => {
  test.skip(process.env.WORKMESH_A2_LITE !== '1', '需要独立 Lite 镜像、无源码安装环境和 HTTPS provider；仓库 E2E 不替代安装验收')
  const f = await readinessFixture(page); await page.goto(f.href)
  await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(3)
  await f.setAgent(); await f.setModel(); await page.reload()
  await page.locator('#readiness-repository').click(); await f.configureRepository(); await page.goBack()
  await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
})
