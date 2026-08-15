import { expect, test } from '@playwright/test'

/**
 * v28 Human-journey contract. Run only in the dedicated hash-bound candidate
 * acceptance environment; this spec never substitutes for the in-app Browser
 * evidence required by the TaskGraph.
 */
test.describe('v28 Work Item detail', () => {
  test('shares the Work Item projection across Sheet and Full Page', async ({ page }) => {
    await page.goto('/?view=active')
    await page.locator('[data-work-item-id] .wm-work-item-title').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('responsible-human')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Agent executions' })).toBeVisible()
    await page.getByRole('button', { name: 'Open full page' }).click()
    await expect(page.getByRole('region', { name: 'Full Issue', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/workItem=/)
    await page.goBack()
    await expect(page.getByRole('region', { name: 'Full Issue', exact: true })).toHaveCount(0)
  })

  test('warns before discarding unsaved edits and keeps revisioned mutation headers', async ({ page }) => {
    const mutations: Array<{ headers: Record<string, string>; body: string | null }> = []
    page.on('request', request => {
      if (request.method() === 'PATCH' && /\/api\/v1\/work-items\//.test(request.url()))
        mutations.push({ headers: request.headers(), body: request.postData() })
    })
    await page.goto('/?view=active')
    await page.locator('[data-work-item-id] .wm-work-item-title').first().click()
    const title = page.getByLabel('Title')
    await title.fill(`${await title.inputValue()} edited`)
    page.once('dialog', dialog => dialog.dismiss())
    await page.getByRole('button', { name: /^Close / }).last().click()
    await expect(page.getByText('Unsaved changes')).toBeVisible()
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => mutations.length).toBe(1)
    expect(mutations[0]?.headers['if-match']).toMatch(/^"revision-\d+"$/)
    expect(mutations[0]?.headers['idempotency-key']).toBeTruthy()
    expect(mutations[0]?.headers['x-csrf-token']).toBeTruthy()
  })

  test('keeps narrow detail views within the document and actions reachable', async ({ page }) => {
    for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 800 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/?view=active')
      await page.locator('[data-work-item-id] .wm-work-item-title').first().click()
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
      const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
      expect(width.scroll).toBeLessThanOrEqual(width.client)
      await page.getByRole('button', { name: /^Close / }).last().click()
    }
  })
})
