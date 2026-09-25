import { expect, test } from '@playwright/test'

test('the authenticated Agent workbench opens on desktop and mobile with a real service settings path', async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/workbench')
    await expect(page.getByRole('heading', { name: /Agent 工作台|Agent workbench/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /模型服务设置|Model settings/ })).toHaveAttribute('href', '/settings/agent-workbench')
    await expect(page.getByRole('button', { name: /新建对话|Create conversation/ })).toBeVisible()
    await expect(page.locator('[data-testid="conversation-workbench"]')).toBeVisible()
  }
})
