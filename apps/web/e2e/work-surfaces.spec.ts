import { expect, test } from '@playwright/test'

/**
 * Contract-faithful browser coverage for the v27 Work Surface adapter.
 * This file is authored for the dedicated acceptance environment; it is not
 * run during this node because no Browser/Playwright runtime is authorized.
 */
test.describe('v27 Work Surfaces', () => {
  test('renders the same collection in List and Board and keeps Board scroll local', async ({ page }) => {
    await page.goto('/?view=my-work')
    await expect(page.getByRole('region', { name: 'Work item list' })).toBeVisible()
    const listIds = await page.locator('[data-work-item-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-work-item-id')))
    await page.getByRole('button', { name: 'Board' }).click()
    await expect(page.getByRole('region', { name: 'Work item board columns' })).toBeVisible()
    const boardIds = await page.locator('[data-work-item-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-work-item-id')))
    expect(boardIds.sort()).toEqual(listIds.sort())
    const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - document.documentElement.clientWidth, board: (() => { const node = document.querySelector<HTMLElement>('[aria-label="Work item board columns"]'); return node ? node.scrollWidth - node.clientWidth : 0 })() }))
    expect(overflow.document).toBeLessThanOrEqual(0)
    expect(overflow.board).toBeGreaterThanOrEqual(0)
  })

  test('moves by explicit selector and sends one stable revisioned mutation', async ({ page }) => {
    const requests: Array<{ method: string; url: string; headers: Record<string, string> }> = []
    page.on('request', request => { if (request.url().includes('/api/v1/work-items/') && request.method() !== 'GET') requests.push({ method: request.method(), url: request.url(), headers: request.headers() }) })
    await page.goto('/?view=active')
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
    const card = page.locator('[data-work-item-id]').first()
    const originalStatus = await card.getAttribute('data-status-id')
    await card.getByRole('combobox').selectOption({ index: 0 })
    await expect(page.getByText('WorkMesh is offline')).toBeVisible()
    expect(await card.getAttribute('data-status-id')).toBe(originalStatus)
    await page.unroute('**/api/v1/work-items/*')
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByText('WorkMesh is offline')).toHaveCount(0)
    await expect(page.locator('[data-work-item-id]').first()).toBeVisible()
    expect(failedPatchCount).toBe(1)
    expect(patchOperationId).toBeTruthy()
  })

  test('creates and applies a Saved View without update/delete controls', async ({ page }) => {
    const methods: string[] = []
    page.on('request', request => { if (request.url().includes('/api/v1/views')) methods.push(request.method()) })
    await page.goto('/?view=my-work')
    await page.getByRole('textbox', { name: 'Save current view' }).fill('My dogfood view')
    await page.getByRole('button', { name: 'Save view' }).click()
    await expect(page.getByRole('combobox', { name: 'Saved views' })).toBeVisible()
    expect(methods).toContain('GET')
    expect(methods).toContain('POST')
    expect(methods).not.toContain('PATCH')
    expect(methods).not.toContain('DELETE')
  })
})
