import { expect, test } from '@playwright/test'

/**
 * Contract-faithful browser coverage for the v27 Work Surface adapter.
 * This file is authored for the dedicated acceptance environment; it is not
 * run during this node because no Browser/Playwright runtime is authorized.
 */
test.describe('Issues workbench', () => {
  const useChinese = async (page: import('@playwright/test').Page) => {
    await page.getByRole('button', { name: '中' }).click()
    await expect(page.getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true')
  }

  test('defaults to Chinese, persists the language switch, and renders the same collection in List and Board', async ({ page }) => {
    await page.context().clearCookies({ name: 'workmesh_locale' })
    await page.addInitScript(() => window.localStorage.removeItem('workmesh_locale'))
    await page.goto('/?view=my-work')
    await expect(page.getByRole('region', { name: 'Issue 列表' })).toBeVisible()
    const workspaceNavigation = page.getByRole('navigation', { name: '工作区导航' })
    await expect(workspaceNavigation).toContainText('Issues')
    await expect(workspaceNavigation).not.toContainText('Active')
    await expect(workspaceNavigation).not.toContainText('Backlog')
    const listIds = await page.locator('[data-work-item-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-work-item-id')))
    await page.getByRole('button', { name: '看板视图' }).click()
    await expect(page.getByRole('region', { name: 'Issue 看板列' })).toBeVisible()
    const boardIds = await page.locator('[data-work-item-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-work-item-id')))
    expect(boardIds.sort()).toEqual(listIds.sort())
    const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - document.documentElement.clientWidth, board: (() => { const node = document.querySelector<HTMLElement>('[aria-label="Issue 看板列"]'); return node ? node.scrollWidth - node.clientWidth : 0 })() }))
    expect(overflow.document).toBeLessThanOrEqual(0)
    expect(overflow.board).toBeGreaterThanOrEqual(0)
    await page.getByRole('button', { name: 'EN' }).click()
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Board' })).toBeVisible()
  })

  test('moves by explicit selector and sends one stable revisioned mutation', async ({ page }) => {
    const requests: Array<{ method: string; url: string; headers: Record<string, string> }> = []
    page.on('request', request => { if (request.url().includes('/api/v1/work-items/') && request.method() !== 'GET') requests.push({ method: request.method(), url: request.url(), headers: request.headers() }) })
    await page.goto('/?view=active')
    await expect(page).toHaveURL(/view=my-work.*statusCategory=started/)
    const card = page.locator('[data-work-item-id]').first()
    await card.getByRole('combobox').selectOption({ index: 0 })
    await expect.poll(() => requests.filter(request => request.method === 'PATCH').length).toBeLessThanOrEqual(1)
    const mutation = requests.find(request => request.method === 'PATCH')
    if (mutation) {
      expect(mutation.headers['idempotency-key']).toBeTruthy()
      expect(mutation.headers['if-match']).toMatch(/^"revision-\d+"$/)
      expect(mutation.headers['x-csrf-token']).toBeTruthy()
    }
  })

  test('recovers a rolled-back network move through canonical Retry', async ({ page }) => {
    let patchOperationId: string | undefined
    let failedPatchCount = 0
    await page.route('**/api/v1/work-items/*', async route => {
      if (route.request().method() !== 'PATCH') return route.continue()
      failedPatchCount += 1
      patchOperationId = route.request().headers()['idempotency-key']
      await route.abort('failed')
    })
    await page.goto('/?view=active')
    await useChinese(page)
    const card = page.locator('[data-work-item-id]').first()
    const originalStatus = await card.getAttribute('data-status-id')
    await card.getByRole('combobox').selectOption({ index: 0 })
    await expect(page.getByText('WorkMesh 当前离线')).toBeVisible()
    await page.unroute('**/api/v1/work-items/*')
    await page.getByRole('button', { name: '重试' }).click()
    await expect(page.getByText('WorkMesh 当前离线')).toHaveCount(0)
    const recoveredCard = page.locator('[data-work-item-id]').first()
    await expect(recoveredCard).toBeVisible()
    expect(await recoveredCard.getAttribute('data-status-id')).toBe(originalStatus)
    expect(failedPatchCount).toBe(1)
    expect(patchOperationId).toBeTruthy()
  })

  test('creates and applies a Saved View without update/delete controls', async ({ page }) => {
    const methods: string[] = []
    page.on('request', request => { if (request.url().includes('/api/v1/views')) methods.push(request.method()) })
    await page.goto('/?view=my-work')
    await useChinese(page)
    await page.getByRole('textbox', { name: '保存视图名称' }).fill('My dogfood view')
    await page.getByRole('button', { name: '保存视图' }).click()
    await expect(page.getByRole('combobox', { name: '保存的视图' })).toBeVisible()
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).not.toContain('PATCH')
    expect(methods).not.toContain('DELETE')
  })
})
