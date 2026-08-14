import { expect, test } from '@playwright/test'

test.describe('Collaboration hub', () => {
  test('keeps Inbox and notification delivery truth readable on desktop and mobile', async ({ page }) => {
    const methods: string[] = []
    page.on('request', request => methods.push(request.method()))
    await page.goto('/?view=inbox')
    await expect(page.getByTestId('stage2-inbox')).toBeVisible()
    await expect(page.getByTestId('collaboration-feedback')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Notification feedback' })).toBeVisible()
    await expect(page.getByText(/Preferences and delivery outcomes are separate server facts/)).toBeVisible()
    expect(methods.filter(method => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))).toEqual([])
    await page.setViewportSize({ width: 375, height: 812 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 375)
    await page.setViewportSize({ width: 320, height: 800 })
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320)
  })
})
