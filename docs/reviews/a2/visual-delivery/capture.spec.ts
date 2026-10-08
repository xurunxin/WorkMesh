import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

test('局部视觉：等待、超时重试、修改与窄屏恢复入口', async ({ page, request, browser }, testInfo) => {
  const reset = await request.post('http://127.0.0.1:3201/__test/reset', { data: { scenario: 'final-tour' } })
  expect(reset.ok()).toBe(true)
  const projectId = '11111111-1111-4111-8111-111111111111'
  const teamId = '22222222-2222-4222-8222-222222222222'
  const repositoryId = '33333333-3333-4333-8333-333333333333'
  const workspaceId = '44444444-4444-4444-8444-444444444444'
  const actionId = '55555555-5555-4555-8555-555555555555'
  const connectionId = '66666666-6666-4666-8666-666666666666'
  let posts = 0
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.context().addCookies([{ name: 'workmesh_locale', value: 'zh-CN', url: 'http://127.0.0.1:3200' }])
  await page.addInitScript(() => localStorage.setItem('workmesh.theme', 'light'))
  // 原有 final-tour 只读项目夹具使用非 UUID ID；只在这次采集的传输边界映射。
  // 页面、组件、apiMutation、期限与按钮均执行当前产品源码，不替换 DOM。
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/v1/repositories') {
      await route.fulfill({ json: { items: [{
        id: repositoryId, workspace_id: workspaceId, connection_id: connectionId, team_id: teamId,
        external_id: 'visual-fixture', full_name: 'WorkMesh / visual-fixture', default_branch: 'main',
        required_checks: [], can_configure_context: true,
      }], nextCursor: null } })
      return
    }
    if (pathname === `/api/v1/repositories/${repositoryId}/context`) {
      if (route.request().method() === 'POST') {
        ++posts
        await route.fulfill({ status: 202, json: { id: actionId, kind: 'resolve_repository_context', status: 'pending' } })
      } else await route.fulfill({ json: [] })
      return
    }
    const url = route.request().url().replaceAll(projectId, 'project-1').replaceAll(teamId, 'team-1')
    const response = await route.fetch({ url })
    const contentType = response.headers()['content-type'] ?? ''
    if (!contentType.includes('application/json')) { await route.fulfill({ response }); return }
    const raw = (await response.text()).replaceAll('project-1', projectId).replaceAll('team-1', teamId).replaceAll('workspace-preview', workspaceId)
    await route.fulfill({ response, body: raw })
  })
  await page.goto(`/?view=projects&teamId=${teamId}&project=${projectId}#project-repository-configuration`, { waitUntil: 'networkidle' })
  const section = page.locator('#project-repository-configuration')
  const sha = section.getByLabel('基线提交 SHA')
  await expect(sha).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.clock.install({ time: new Date('2026-10-09T00:00:00.000Z') })
  await sha.fill('a'.repeat(40))
  await section.getByRole('button', { name: '提交上下文配置', exact: true }).click()
  await expect(section.getByRole('status')).toHaveText('已提交，等待解析。')
  await expect(sha).toBeDisabled()
  const captures: Array<{ name: string; bytes: number; sha256: string; width: number; height: number }> = []
  const capture = async (name: string) => {
    const options = { path: testInfo.outputPath(`${name}.png`), animations: 'disabled' as const, caret: 'hide' as const }
    const bytes = name.endsWith('mobile') ? await page.screenshot({ ...options, fullPage: false }) : await section.screenshot(options)
    captures.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
  }
  await capture('waiting-desktop')
  await page.clock.fastForward(61_000)
  await expect(section.getByRole('button', { name: '重试确认', exact: true })).toBeEnabled()
  await expect(sha).toBeEnabled()
  await capture('timeout-desktop')
  await section.getByRole('button', { name: '重试确认', exact: true }).click()
  await expect(sha).toBeDisabled()
  expect(posts).toBe(1)
  await page.clock.fastForward(61_000)
  await expect(sha).toBeEnabled()
  await section.getByRole('button', { name: '修改配置', exact: true }).click()
  await expect(sha).toBeFocused()
  await sha.fill('b'.repeat(40))
  await capture('edit-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  // 固定高度滚动容器会裁掉元素长图；窄屏只采真实视口中的恢复入口。
  await section.evaluate(element => { element.scrollIntoView({ block: 'start', behavior: 'instant' }); element.focus({ preventScroll: true }) })
  await expect(section.getByRole('heading', { name: '仓库配置', exact: true })).toBeInViewport()
  await capture('edit-mobile')
  expect(errors).toEqual([])
  expect(posts).toBe(1)
  await writeFile(testInfo.outputPath('capture.json'), JSON.stringify({
    browserVersion: browser.version(), platform: process.platform,
    source: '当前 Next 页面和组件；final-tour 传输夹具加仓库动作待处理响应，不运行 API/Worker，不计作安装或领域验收',
    fixedClientTime: '2026-10-09T00:00:00.000Z', clockAdvancesMs: [61_000, 61_000],
    viewport: [{ width: 1440, height: 1000 }, { width: 390, height: 844 }],
    screenshot: { desktopRegion: '#project-repository-configuration', mobileRegion: '390 × 844 真实视口；配置区标题滚动到可视区', animations: 'disabled', caret: 'hide' },
    postCount: posts, pageErrors: errors, captures,
  }, null, 2))
})
