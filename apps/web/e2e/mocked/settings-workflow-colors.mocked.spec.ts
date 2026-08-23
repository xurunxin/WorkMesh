import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const team = { id: 'team-color', name: 'Runtime', key: 'RUN', revision: 1 }
const existingState = { id: 'state-existing', name: 'Existing', category: 'planned', color: '#123abc', revision: 1 }
const responseHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': webUrl,
  'Content-Type': 'application/json',
}

type SettingsRouteOptions = Readonly<{
  blockedTeams?: boolean
  postedBodies?: unknown[]
  requestLog?: string[]
}>

async function installSettingsRoutes(page: Page, options: SettingsRouteOptions = {}) {
  let statesReads = 0
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    options.requestLog?.push(`${request.method()} ${path}${url.search}`)
    if (path !== '/api/v1/teams' && !/^\/api\/v1\/teams\/[^/]+\/states$/.test(path))
      return route.fallback()
    if (request.method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: responseHeaders })
    const body = (payload: unknown, status = 200) => route.fulfill({
      status,
      headers: responseHeaders,
      body: JSON.stringify(payload),
    })
    if (path === '/api/v1/teams') {
      if (options.blockedTeams) return body({
        error: { code: 'TEAM_LOOKUP_FAILED', message: 'private upstream diagnostic', correlationId: 'task-5.3-safe' },
      }, 503)
      return body({ items: [team], nextCursor: null })
    }
    if (request.method() === 'GET') {
      statesReads += 1
      return body({ items: [existingState], nextCursor: null })
    }
    const postedBody = request.postData() ? JSON.parse(request.postData() ?? 'null') as unknown : null
    options.postedBodies?.push(postedBody)
    const record = postedBody && typeof postedBody === 'object'
      ? postedBody as Record<string, unknown>
      : {}
    if (record.name === 'Fails') return body({
      error: { code: 'STATE_CREATE_FAILED', message: 'Unable to create workflow state.', correlationId: 'task-5.3-failure' },
    }, 422)
    return body({ id: 'state-created', revision: 1 })
  })
  return { statesReads: () => statesReads }
}

async function useEnglish(page: Page) {
  await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
}

async function removeNextDevelopmentIndicator(page: Page) {
  await page.evaluate(() => {
    for (const portal of document.querySelectorAll('nextjs-portal')) portal.remove()
  })
  await expect(page.locator('nextjs-portal')).toHaveCount(0)
}

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function measureWorkflowGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('main')
    const settings = document.querySelector<HTMLElement>('.settings-page')
    const panel = document.querySelector<HTMLElement>('.settings-page [role="tabpanel"]')
    const heading = document.querySelector<HTMLElement>('#workflow-settings-heading')
    const card = heading?.closest<HTMLElement>('.settings-card') ?? null
    const form = card?.querySelector<HTMLElement>('.workflow-state-create-form') ?? null
    const palette = form?.querySelector<HTMLElement>('.workflow-color-presets') ?? null
    const cards = palette ? [...palette.querySelectorAll<HTMLElement>('.workflow-color-option')] : []
    const labels = cards.map(card => card.querySelector<HTMLElement>('span:last-child'))
    if (!main || !settings || !panel || !card || !form || !palette || cards.length !== 6)
      throw new Error('Workflow color geometry target missing')
    if (labels.some(label => label === null)) throw new Error('Workflow color visible label missing')
    const rect = (element: HTMLElement) => {
      const value = element.getBoundingClientRect()
      return { bottom: value.bottom, height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
    }
    const cardRects = cards.map(rect)
    const labelRects = labels.map(label => ({
      rect: rect(label!),
      text: label!.textContent ?? '',
    }))
    const firstFiveTops = new Set(cardRects.slice(0, 5).map(value => Math.round(value.top)))
    const paletteColumns = new Set(cardRects.map(value => Math.round(value.left)))
    return {
      viewport: { height: window.innerHeight, width: window.innerWidth },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      main: rect(main),
      settings: rect(settings),
      panel: rect(panel),
      workflowCard: rect(card),
      form: rect(form),
      palette: rect(palette),
      presetCards: cardRects,
      presetLabels: labelRects,
      firstFiveRowCount: firstFiveTops.size,
      paletteColumnCount: paletteColumns.size,
    }
  })
}

test('uses native preset keyboard behavior and exact success/failure state bodies', async ({ page }) => {
  const postedBodies: unknown[] = []
  const routes = await installSettingsRoutes(page, { postedBodies })
  await useEnglish(page)
  await page.goto('/settings?team=team-color')

  const workflow = page.getByRole('region', { name: 'Workflow states' })
  const form = workflow.locator('.workflow-state-create-form')
  const category = form.getByRole('combobox', { name: 'Category' })
  const neutral = form.getByRole('radio', { name: 'Neutral' })
  const blue = form.getByRole('radio', { name: 'Blue' })
  const custom = form.getByRole('radio', { name: 'Custom' })
  await expect(neutral).toBeChecked()
  await expect(form.getByLabel('Custom color')).toHaveCount(0)
  await expect(workflow.locator('.workflow-state-list .workflow-color')).toHaveCSS('background-color', 'rgb(18, 58, 188)')

  await category.focus()
  await category.press('Tab')
  await expect(neutral).toBeFocused()
  await neutral.press('ArrowRight')
  await expect(blue).toBeChecked()
  await expect(blue).toBeFocused()
  await form.getByRole('textbox', { name: 'Status name' }).fill('Review')
  await category.selectOption('started')
  await form.getByRole('button', { name: 'Create status' }).click()

  const successToast = page
    .getByRole('region', { name: 'Notifications' })
    .getByRole('status')
    .filter({ hasText: 'State “Review” is ready to use.' })
  await expect(successToast).toContainText('Workflow state created')
  await expect(neutral).toBeChecked()
  await expect(form.getByRole('textbox', { name: 'Status name' })).toHaveValue('')
  await expect(category).toHaveValue('planned')
  await expect(workflow.locator('.workflow-state-list')).not.toContainText('Review')
  await expect.poll(routes.statesReads).toBeGreaterThanOrEqual(2)
  expect(postedBodies[0]).toEqual({ name: 'Review', category: 'started', color: '#2563eb' })

  await custom.focus()
  await custom.press('Space')
  await expect(custom).toBeChecked()
  const customInput = form.getByLabel('Custom color')
  await expect(customInput).toBeFocused()
  await expect(customInput).toHaveValue('#8b5cf6')
  await expect(form.getByRole('status', { name: 'Color value' })).toHaveText('#8b5cf6')
  await customInput.evaluate((element, value) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (!setter) throw new Error('Native color value setter unavailable')
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, '#123456')
  await expect(form.getByRole('status', { name: 'Color value' })).toHaveText('#123456')
  await form.getByRole('textbox', { name: 'Status name' }).fill('Fails')
  await form.getByRole('button', { name: 'Create status' }).click()

  await expect(page.getByRole('tabpanel', { name: 'Workspace' }).getByRole('alert'))
    .toContainText('Unable to create workflow state.')
  await expect(custom).toBeChecked()
  await expect(customInput).toHaveValue('#123456')
  expect(postedBodies[1]).toEqual({ name: 'Fails', category: 'planned', color: '#123456' })
  expect(postedBodies).toHaveLength(2)
})

test('does not render state creation controls for an unresolved Team', async ({ page }) => {
  const requestLog: string[] = []
  await installSettingsRoutes(page, { blockedTeams: true, requestLog })
  await useEnglish(page)
  await page.goto('/settings?team=missing')

  await expect(page.getByRole('tabpanel', { name: 'Workspace' }).getByRole('alert'))
    .toContainText('The selected team is unavailable or no longer accessible.')
  await expect(page.getByRole('group', { name: 'Status color' })).toHaveCount(0)
  expect(requestLog.some(value => value.includes('/states'))).toBe(false)
  await expect(page).toHaveURL(`${webUrl}/settings?team=missing`)
})

test('contains the workflow palette at 390, 1440, and 1920 with bounded wide layouts', async ({ page }, testInfo) => {
  await installSettingsRoutes(page)
  await useEnglish(page)
  const geometry: Awaited<ReturnType<typeof measureWorkflowGeometry>>[] = []

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/settings?team=team-color')
    await expect(page.getByRole('group', { name: 'Status color' })).toBeVisible()
    await settleLayout(page)
    const measured = await measureWorkflowGeometry(page)
    geometry.push(measured)

    expect(measured.document.scrollWidth).toBe(measured.document.clientWidth)
    expect(measured.workflowCard.width / measured.panel.width).toBeGreaterThanOrEqual(.98)
    expect(measured.presetCards.every(card => card.height >= 44)).toBe(true)
    expect(measured.presetLabels.map(label => label.text)).toEqual(['Neutral', 'Blue', 'Green', 'Amber', 'Red', 'Custom'])
    expect(measured.presetLabels.every((label, index) => {
      const card = measured.presetCards[index]!
      return label.rect.width > 0 && label.rect.left >= card.left && label.rect.right <= card.right
    })).toBe(true)
    expect(measured.workflowCard.left).toBeGreaterThanOrEqual(-1)
    expect(measured.workflowCard.right).toBeLessThanOrEqual(measured.document.clientWidth + 1)
    if (viewport.width === 390) {
      expect(measured.paletteColumnCount).toBeGreaterThanOrEqual(1)
      expect(measured.paletteColumnCount).toBeLessThanOrEqual(2)
      expect(measured.form.width).toBeLessThanOrEqual(measured.workflowCard.width)
    } else {
      expect(measured.form.width).toBeGreaterThanOrEqual(720)
      expect(measured.form.width).toBeLessThanOrEqual(960)
      expect(measured.firstFiveRowCount).toBe(1)
      expect(measured.presetCards.slice(0, 5).every(card => card.width >= 112 && card.width <= 168)).toBe(true)
    }

    await removeNextDevelopmentIndicator(page)
    const screenshotPath = testInfo.outputPath(`task-5.3-workflow-colors-${viewport.width}-pass.png`)
    await page.screenshot({ fullPage: true, path: screenshotPath })
    await testInfo.attach(`task-5.3-workflow-colors-${viewport.width}-pass`, {
      contentType: 'image/png',
      path: screenshotPath,
    })
  }

  const geometryPath = testInfo.outputPath('task-5.3-workflow-colors-geometry-pass.json')
  await writeFile(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  await testInfo.attach('task-5.3-workflow-colors-geometry-pass', {
    contentType: 'application/json',
    path: geometryPath,
  })
})
