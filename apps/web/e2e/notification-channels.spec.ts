import { expect, test } from '@playwright/test'

test('Human manages their own notification target without exposing secrets or sending a probe', async ({
  page,
}) => {
  await page.goto('/settings')
  await expect(page.getByText('我的通知渠道', { exact: true })).toBeVisible()
  const secret = 'https://channel.example.test/hook?key=browser-private-fixture'
  const create = page.locator('form').filter({
    has: page.getByRole('button', { name: '创建目标', exact: true }),
  })
  await create.locator('input[name="name"]').fill('浏览器个人目标')
  await create.locator('input[name="secretMaterial"]').fill(secret)
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/notification-channel-targets') &&
      response.request().method() === 'POST',
  )
  await create.getByRole('button', { name: '创建目标' }).click()
  const response = await created
  expect(response.status()).toBe(201)
  expect(await response.text()).not.toContain(secret)
  await expect(create.locator('input[name="secretMaterial"]')).toHaveValue('')
  const target = page.getByRole('region', { name: '浏览器个人目标' })
  await expect(target).toBeVisible()
  await target.getByRole('button', { name: '禁用目标' }).click()
  await expect(target.getByRole('button', { name: '启用目标' })).toBeVisible()
  await page.reload()
  await expect(target.getByRole('button', { name: '启用目标' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(secret)
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  )
  expect(stored).not.toContain(secret)
  const revoked = page.waitForResponse(
    (response) =>
      response.url().includes('/notification-channel-targets/') &&
      response.request().method() === 'DELETE',
  )
  await target.getByRole('button', { name: '撤销目标' }).click()
  const revocation = await revoked
  expect(revocation.status()).toBe(200)
  expect(revocation.request().headers()['content-type']).toBeUndefined()
  expect(revocation.request().postData()).toBeNull()
  await expect(target).toContainText('已撤销')
  await expect(target).toContainText('秘密已清除')
})
