import { expect, test } from '@playwright/test'

test('an administrator configures and revokes a model service without exposing its credential', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings/agent-workbench')
  await expect(page.getByRole('heading', { name: /模型服务接入|Model service connections/ })).toBeVisible()

  const secret = 'workmesh-browser-fixture-secret-2026'
  const create = page.locator('form').filter({ has: page.locator('input[name="baseUrl"]') }).first()
  await create.locator('input[name="name"]').fill('MiniMax browser fixture')
  await create.locator('input[name="baseUrl"]').fill('https://api.minimaxi.com/v1')
  await create.locator('input[name="secretMaterial"]').fill(secret)
  await create.getByRole('button', { name: /保存服务|Save service/ }).click()
  await expect(page.getByRole('status')).toContainText(/连接已保存|Connection saved/)
  await expect(create.locator('input[name="secretMaterial"]')).not.toHaveValue(secret)
  await expect(page.locator('body')).not.toContainText(secret)

  const model = page.locator('form').filter({ has: page.locator('input[name="modelId"]') })
  await model.locator('input[name="modelId"]').fill('MiniMax-M3')
  await model.locator('input[name="displayName"]').fill('MiniMax M3')
  await model.locator('input[name="contextWindowTokens"]').fill('204800')
  await model.locator('input[name="maxOutputTokens"]').fill('16384')
  await model.locator('input[name="toolCalling"]').check()
  await model.getByRole('button', { name: /登记模型|Add model/ }).click()
  await expect(page.getByText('MiniMax M3')).toBeVisible()

  await page.reload()
  await expect(page.getByText('MiniMax M3')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(secret)
  await page.getByRole('button', { name: /吊销服务|Revoke service/ }).click()
  await page.getByRole('button', { name: /确认吊销|Confirm revoke/ }).click()
  await expect(page.getByRole('status')).toContainText(/连接已吊销|Connection revoked/)
})
