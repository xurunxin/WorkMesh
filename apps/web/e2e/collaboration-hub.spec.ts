import { expect, test } from '@playwright/test'

test.describe('Collaboration hub', () => {
  test('keeps the governed Attention Center readable on desktop and mobile', async ({ page }) => {
    const methods: string[] = []
    page.on('request', request => methods.push(request.method()))
    await page.goto('/?view=inbox')
    await expect(page.getByTestId('attention-center')).toBeVisible()
    expect(methods.filter(method => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))).toEqual([])
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 375)
    await page.setViewportSize({ width: 320, height: 800 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320)
  })
})
