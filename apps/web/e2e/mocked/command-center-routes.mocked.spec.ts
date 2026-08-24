import { expect, test } from '@playwright/test'
import {
  readMockRequests,
  requestsFor,
  resetMock,
  restoreDefaultMock,
  writeMockEvidence,
} from './mock-control'

const webUrl = 'http://127.0.0.1:3200'

test.beforeEach(async ({ context, request }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
  await resetMock(request, 'command-center')
})

test.afterEach(async ({ request }) => {
  await restoreDefaultMock(request)
})

test('queries command resources with limit 50, follows one encoded Agent route, restores context, and keeps g a navigation-only', async ({ page, request }, testInfo) => {
  const priorUrl = '/agents?tab=agents&name=Command&status=active'
  await page.goto(priorUrl)
  await expect(page.getByTestId('agent-registry-agent/command-route')).toBeVisible()

  const trigger = page.getByTestId('command-center-trigger')
  await trigger.focus()
  await trigger.click()
  const search = page.getByRole('combobox', { name: 'Search WorkMesh' })
  await expect(search).toBeFocused()
  await search.fill('Command Orbit')

  const agentOption = page.getByRole('option', { name: /Command Orbit/ })
  await expect(agentOption).toBeVisible()
  await expect(agentOption).toHaveAttribute('href', '/agents/agent%2Fcommand-route')
  await expect.poll(async () => requestsFor(await readMockRequests(request), 'GET', '/api/v1/agents')
    .filter(entry => entry.limit === 50).length).toBe(1)
  const searchedLedger = await readMockRequests(request)
  expect(requestsFor(searchedLedger, 'GET', '/api/v1/agents').filter(entry => entry.limit === 50)).toEqual([
    {
      method: 'GET',
      path: '/api/v1/agents',
      status: 200,
      outcome: 'completed',
      cursor: null,
      limit: 50,
      hasIdempotencyKey: false,
      equivalenceGroup: null,
    },
  ])
  expect(requestsFor(searchedLedger, 'GET', '/api/v1/work-items').filter(entry => entry.limit === 50)).toHaveLength(1)

  await search.press('Enter')
  await expect(page).toHaveURL(`${webUrl}/agents/agent%2Fcommand-route`)
  await expect(page.getByRole('heading', { level: 1, name: 'Command Orbit' })).toBeVisible()
  await expect(page.getByTestId('command-center')).toHaveCount(0)

  await page.goBack()
  await expect(page).toHaveURL(`${webUrl}${priorUrl}`)
  await expect(trigger).toBeFocused()
  await expect(page.getByTestId('command-center')).toHaveCount(0)

  await page.getByRole('heading', { level: 1, name: 'Agents' }).click()
  await expect(trigger).not.toBeFocused()
  await page.keyboard.press('g')
  await page.keyboard.press('a')
  await expect(page).toHaveURL(`${webUrl}/agents`)
  await expect(page.getByTestId('command-center')).toHaveCount(0)
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0)
  await writeMockEvidence({ ledger: await readMockRequests(request), name: 'command-route-green', page, testInfo })
})
