import { expect, test } from '@playwright/test'

test.describe('v29 Human rich content', () => {
  test('edits Markdown, keeps unsafe HTML inert, and preserves keyboard access', async ({ page }) => {
    await page.goto('/?view=active')
    await page.locator('[data-work-item-id] .wm-work-item-title').first().click()
    const description = page.getByRole('textbox', { name: 'Description (Markdown)' })
    await expect(description).toBeVisible()
    await description.fill('## Human context\n<script>alert(1)</script>')
    await description.press('Control+b')
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(await page.locator('script').filter({ hasText: 'alert(1)' }).count()).toBe(0)
  })

  test('reflows the Work Room and attachments at narrow viewports', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/?view=active')
    await page.locator('[data-work-item-id] .wm-work-item-title').first().click()
    const detail = page.getByRole('dialog')
    await detail.getByRole('combobox', { name: 'Issue sections' }).selectOption({ label: 'Discussion' })
    await expect(detail.getByRole('textbox', { name: 'Work item comment' })).toBeVisible()
    await detail.getByRole('tab', { name: 'Artifacts', exact: true }).click()
    await expect(detail.getByRole('region', { name: 'Work Item attachments' })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
