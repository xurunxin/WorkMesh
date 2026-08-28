import { expect, test, type Page } from '@playwright/test'
import {
  equivalenceGroup,
  mockIds,
  readMockRequests,
  requestsFor,
  resetMock,
  restoreDefaultMock,
  writeMockEvidence,
} from './mock-control'

const webUrl = 'http://127.0.0.1:3200'
const targetSettingsUrl = `/settings?team=${mockIds.targetTeam}`

async function waitForTargetTeam(page: Page): Promise<void> {
  await expect(page).toHaveURL(`${webUrl}${targetSettingsUrl}`)
  await expect(page.getByRole('combobox', { name: 'Current team' })).toHaveValue(mockIds.targetTeam)
  await expect(page.getByRole('heading', { name: 'Workflow states' })).toBeVisible()
  await expect(page.getByText('Runtime Ready')).toBeVisible()
}

test.beforeEach(async ({ context, request }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
  await resetMock(request, 'settings-workspace')
})

test.afterEach(async ({ page, request }) => {
  await page.close()
  await restoreDefaultMock(request)
})

test('keeps a second-page Team authoritative and posts only the exact custom workflow color contract', async ({ page, request }, testInfo) => {
  const stateBodies: unknown[] = []
  page.on('request', observed => {
    const url = new URL(observed.url())
    if (observed.method() !== 'POST' || url.pathname !== `/api/v1/teams/${mockIds.targetTeam}/states`) return
    stateBodies.push(observed.postDataJSON() as unknown)
  })

  await page.goto(targetSettingsUrl)
  await waitForTargetTeam(page)

  const before = await readMockRequests(request)
  expect(requestsFor(before, 'GET', '/api/v1/teams').map(entry => entry.cursor)).toEqual([null, 'teams-p2'])
  expect(requestsFor(before, 'GET', `/api/v1/teams/${mockIds.firstTeam}/states`)).toHaveLength(0)
  expect(requestsFor(before, 'GET', `/api/v1/teams/${mockIds.targetTeam}/states`)).toHaveLength(1)

  await page.getByLabel('Status name').fill('Needs review')
  await page.getByLabel('Category').selectOption('started')
  await page.getByRole('radio', { name: 'Custom' }).check()
  await page.getByLabel('Custom color').fill('#0f766e')
  await expect(page.getByLabel('Color value')).toHaveText('#0f766e')
  await page.getByRole('button', { name: 'Create status' }).click()

  await expect(page.getByText('Needs review', { exact: true })).toBeVisible()
  expect(stateBodies).toEqual([{ name: 'Needs review', category: 'started', color: '#0f766e' }])
  await expect(page).toHaveURL(`${webUrl}${targetSettingsUrl}`)
  const after = await readMockRequests(request)
  const createRequests = requestsFor(after, 'POST', `/api/v1/teams/${mockIds.targetTeam}/states`)
  expect(createRequests).toHaveLength(1)
  expect(createRequests[0]).toMatchObject({ status: 200, hasIdempotencyKey: true, equivalenceGroup: 1 })
  expect(equivalenceGroup(after, 1)).toEqual({ group: 1, requestCount: 1, commitCount: 1 })
  await writeMockEvidence({ ledger: after, name: 'settings-workflow-green', page, testInfo })
})

test('canonicalizes the retired Settings Operations tab without requesting Teams or workflow states', async ({ page, request }, testInfo) => {
  const operationsUrl = `/settings?tab=operations&team=${mockIds.targetTeam}&opsQuery=Boundary#operations-cycles`
  await page.goto(operationsUrl)
  await expect(page).toHaveURL(`${webUrl}/operations?opsQuery=Boundary#operations-cycles`)
  await expect(page.getByText('Boundary Cycle')).toBeVisible()
  await expect(page.getByText('Boundary Initiative')).toBeVisible()

  const ledger = await readMockRequests(request)
  expect(ledger.requests.filter(entry => entry.path === '/api/v1/teams' || /\/states$/.test(entry.path))).toEqual([])
  expect(requestsFor(ledger, 'GET', '/api/v1/cycles')).toHaveLength(1)
  expect(requestsFor(ledger, 'GET', '/api/v1/initiatives')).toHaveLength(1)
  await writeMockEvidence({ ledger, name: 'settings-operations-redirect-green', page, testInfo })
})

test('freezes delete confirmation, blocks synchronous duplicates, retries the same failed intent, and restores focus', async ({ page, request }, testInfo) => {
  await resetMock(request, 'settings-delete-failure')
  await page.goto(targetSettingsUrl)
  await waitForTargetTeam(page)

  const deleteButton = page.getByRole('button', { name: 'Delete team', exact: true })
  await deleteButton.focus()
  await deleteButton.click()
  const dialog = page.getByRole('dialog', { name: 'Delete Team' })
  const confirm = dialog.getByRole('button', { name: 'Delete Team Runtime' })
  await expect(dialog).toContainText('Runtime')
  await expect(dialog).toContainText('RUN')

  await confirm.evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('Delete confirmation must be an HTML button.')
    element.click()
    element.click()
  })
  await expect(dialog.getByRole('alert')).toHaveText('Unable to delete this Team. Check your connection and try again.')
  let ledger = await readMockRequests(request)
  expect(requestsFor(ledger, 'DELETE', `/api/v1/teams/${mockIds.targetTeam}`)).toHaveLength(1)
  expect(equivalenceGroup(ledger, 1)).toEqual({ group: 1, requestCount: 1, commitCount: 0 })
  await expect(dialog).toContainText('Runtime')
  await expect(dialog).toContainText('RUN')

  await confirm.click()
  await expect.poll(async () => requestsFor(
    await readMockRequests(request),
    'DELETE',
    `/api/v1/teams/${mockIds.targetTeam}`,
  ).length).toBe(2)
  ledger = await readMockRequests(request)
  expect(requestsFor(ledger, 'DELETE', `/api/v1/teams/${mockIds.targetTeam}`).map(entry => entry.equivalenceGroup)).toEqual([1, 1])
  expect(equivalenceGroup(ledger, 1)).toEqual({ group: 1, requestCount: 2, commitCount: 0 })

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(deleteButton).toBeFocused()
  await expect(page).toHaveURL(`${webUrl}${targetSettingsUrl}`)

  await deleteButton.click()
  await expect(page.getByRole('dialog', { name: 'Delete Team' })).toContainText('Runtime')
  await page.getByRole('dialog', { name: 'Delete Team' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(deleteButton).toBeFocused()
  await writeMockEvidence({ ledger, name: 'settings-delete-failure-green', page, testInfo })
})

test('retries one delete intent, separates the committed DELETE from refresh recovery, and lets Team resolution repair the URL', async ({ page, request }, testInfo) => {
  await resetMock(request, 'settings-delete-retry')
  await page.goto(targetSettingsUrl)
  await waitForTargetTeam(page)

  const deleteButton = page.getByRole('button', { name: 'Delete team', exact: true })
  await deleteButton.click()
  const dialog = page.getByRole('dialog', { name: 'Delete Team' })
  const confirm = dialog.getByRole('button', { name: 'Delete Team Runtime' })
  await confirm.evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('Delete confirmation must be an HTML button.')
    element.click()
    element.click()
  })
  await expect(dialog.getByRole('alert')).toHaveText('Unable to delete this Team. Check your connection and try again.')
  await confirm.click()

  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Team deleted')).toBeVisible()
  await expect(page).toHaveURL(`${webUrl}${targetSettingsUrl}`)
  await expect(page.getByText('Unable to load Settings.', { exact: true })).toBeVisible()

  let ledger = await readMockRequests(request)
  const deletions = requestsFor(ledger, 'DELETE', `/api/v1/teams/${mockIds.targetTeam}`)
  expect(deletions.map(entry => ({ status: entry.status, group: entry.equivalenceGroup }))).toEqual([
    { status: 503, group: 1 },
    { status: 204, group: 1 },
  ])
  expect(equivalenceGroup(ledger, 1)).toEqual({ group: 1, requestCount: 2, commitCount: 1 })
  expect(requestsFor(ledger, 'GET', '/api/v1/teams').at(-1)?.status).toBe(503)

  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page).toHaveURL(`${webUrl}/settings?team=${mockIds.firstTeam}`)
  const teamSelector = page.getByRole('combobox', { name: 'Current team' })
  await expect(teamSelector).toHaveValue(mockIds.firstTeam)
  await expect(teamSelector).toBeFocused()
  ledger = await readMockRequests(request)
  expect(requestsFor(ledger, 'GET', `/api/v1/teams/${mockIds.firstTeam}/states`).length).toBeGreaterThan(0)
  await writeMockEvidence({ ledger, name: 'settings-delete-recovery-green', page, testInfo })
})
