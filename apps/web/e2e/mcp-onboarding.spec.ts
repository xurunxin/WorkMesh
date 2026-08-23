import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const webUrl = 'http://127.0.0.1:3100'
const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

type RequestAudit = {
  counts: { discovery: number; info: number; mcp: number }
  mcp: null | {
    method: string
    cookiePresent: boolean
    authorizationPresent: boolean
    installationHeaderPresent: boolean
    hashPresent: boolean
  }
}

async function installMcpFixture(page: Page, supportedClients: readonly string[] = ['opencode', 'generic_mcp']): Promise<RequestAudit> {
  const audit: RequestAudit = { counts: { discovery: 0, info: 0, mcp: 0 }, mcp: null }
  await page.route(`${apiUrl}/**`, async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/.well-known/workmesh-agent') {
      audit.counts.discovery += 1
      return body({
        protocolVersion: 'v1',
        mcpUrl: `${apiUrl}/mcp?readiness=public-safe-${'x'.repeat(96)}`,
        wellKnownUrl: `${apiUrl}/.well-known/workmesh-agent`,
        apiVersion: 'v1',
        supportedClients,
        skill: {
          name: 'workmesh',
          version: '1.1.0',
          sha256: `sha256:${'a'.repeat(64)}`,
          signature: 'ed25519:safe-public-test-signature',
        },
      })
    }
    if (path === '/api/v1/info') {
      audit.counts.info += 1
      return body({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' })
    }
    if (path === '/mcp') {
      audit.counts.mcp += 1
      const requestHeaders = request.headers()
      audit.mcp = {
        method: request.method(),
        cookiePresent: Boolean(requestHeaders.cookie),
        authorizationPresent: Boolean(requestHeaders.authorization),
        installationHeaderPresent: Boolean(requestHeaders['x-workmesh-installation-token']),
        hashPresent: request.url().includes('#'),
      }
      return body({ error: { code: 'UNAUTHORIZED', message: 'credential required', correlationId: 'onboarding-e2e' } }, 401)
    }
    return body({ error: { code: 'NOT_FOUND', message: 'Unexpected public onboarding route.', correlationId: 'onboarding-e2e' } }, 404)
  })
  return audit
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const path = testInfo.outputPath(`${name}.json`)
  await writeFile(path, JSON.stringify(value, null, 2), 'utf8')
  await testInfo.attach(name, { path, contentType: 'application/json' })
}

async function expectNoForbiddenClientWasMounted(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-workmesh-forbidden-client-observed', 'true')
  await expect(page.locator('[data-mcp-guide-client="codex"], [data-mcp-guide-client="pi"], [data-client-type="codex"], [data-client-type="pi"]')).toHaveCount(0)
}

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: webUrl })
  await page.addInitScript(() => {
    const forbiddenSelector = '[data-mcp-guide-client="codex"], [data-mcp-guide-client="pi"], [data-client-type="codex"], [data-client-type="pi"]'
    const markForbidden = () => document.documentElement?.setAttribute('data-workmesh-forbidden-client-observed', 'true')
    const containsForbidden = (node: Node) => node instanceof Element
      && (node.matches(forbiddenSelector) || Boolean(node.querySelector(forbiddenSelector)))
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (containsForbidden(node)) markForbidden()
        }
      }
      if (document.querySelector(forbiddenSelector)) markForbidden()
    })
    observer.observe(document, { childList: true, subtree: true })
    if (document.querySelector(forbiddenSelector)) markForbidden()
  })
})

test('uses advertised radio clients atomically and keeps copy operations local and secret-safe', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const audit = await installMcpFixture(page)
  await page.goto('/connect#test')

  await expect(page.getByRole('heading', { name: 'Connect an Agent to WorkMesh' })).toBeVisible()
  await expect(page.getByText('Configuration ready')).toBeVisible()
  const openCode = page.getByRole('radio', { name: /OpenCode/ })
  const generic = page.getByRole('radio', { name: /Generic MCP/ })
  await expect(openCode).toBeChecked()
  await expect(page.getByRole('radio')).toHaveCount(2)
  await expectNoForbiddenClientWasMounted(page)

  await openCode.focus()
  await page.keyboard.press('ArrowRight')
  await expect(generic).toBeChecked()
  await expect(generic).toBeFocused()
  await page.keyboard.press('Space')
  await expect(generic).toBeChecked()
  await expect(generic).toBeFocused()

  await page.getByRole('button', { name: 'Copy config' }).click()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Configuration copied to the clipboard.')
  const configClipboardSafety = await page.evaluate(async () => {
    const value = await navigator.clipboard.readText()
    return {
      environmentNamePresent: value.includes('WORKMESH_INSTALLATION_TOKEN'),
      fragmentPresent: value.includes('#test'),
      credentialShapePresent: /w(?:mp|mi)_[A-Za-z0-9_-]{16,}/.test(value),
    }
  })
  expect(configClipboardSafety).toEqual({ environmentNamePresent: true, fragmentPresent: false, credentialShapePresent: false })

  await generic.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Copy config' })).toBeVisible()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('')

  await page.getByRole('button', { name: 'Copy secure connect URL' }).click()
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Secure connection link copied to the clipboard.')
  await openCode.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[aria-live="polite"]')).toHaveText('Secure connection link copied to the clipboard.')
  const linkClipboardSafety = await page.evaluate(async () => {
    const value = await navigator.clipboard.readText()
    return {
      shortTestFragmentPresent: value.endsWith('#test'),
      credentialShapePresent: /w(?:mp|mi)_[A-Za-z0-9_-]{16,}/.test(value),
    }
  })
  expect(linkClipboardSafety).toEqual({ shortTestFragmentPresent: true, credentialShapePresent: false })

  expect(audit.counts).toEqual({ discovery: 1, info: 1, mcp: 1 })
  expect(audit.mcp).toEqual({
    method: 'GET', cookiePresent: false, authorizationPresent: false, installationHeaderPresent: false, hashPresent: false,
  })
  expect(await page.evaluate(() => /w(?:mp|mi)_[A-Za-z0-9_-]{16,}/.test(document.body.innerText))).toBe(false)
  await expectNoForbiddenClientWasMounted(page)
  await attachJson(testInfo, 'task-5.5-interaction-request-evidence', {
    request: { counts: audit.counts, mcp: audit.mcp },
    clipboard: { config: configClipboardSafety, link: linkClipboardSafety },
    forbiddenClientObserved: false,
  })
})

test('fails closed when discovery advertises no usable client', async ({ page }) => {
  const audit = await installMcpFixture(page, [])
  await page.goto('/connect#test')

  const alert = page.locator('[role="alert"][data-onboarding-state="unsupported_client"]')
  await expect(alert).toContainText('Unsupported client')
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
  await expect(page.getByRole('region', { name: /Configuration preview/ })).toHaveCount(0)
  await expect(page.getByText('Generic Streamable HTTP MCP configuration')).toHaveCount(0)
  expect(audit.counts).toEqual({ discovery: 1, info: 1, mcp: 0 })
  await expectNoForbiddenClientWasMounted(page)
})

const viewportCases = [
  { name: '390-zh', locale: 'zh-CN', width: 390, height: 844 },
  { name: '390-en', locale: 'en', width: 390, height: 844 },
  { name: '1440-en', locale: 'en', width: 1440, height: 900 },
  { name: '1920-en', locale: 'en', width: 1920, height: 1080 },
] as const

for (const viewport of viewportCases) {
  test(`keeps deliberate onboarding geometry at ${viewport.name}`, async ({ context, page }, testInfo) => {
    await context.addCookies([{ name: 'workmesh_locale', value: viewport.locale, url: webUrl }])
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    const audit = await installMcpFixture(page)
    await page.goto('/connect#test')
    await expect(page.locator('[data-mcp-guide-client="opencode"]')).toBeVisible()

    const preview = page.getByRole('region', { name: viewport.locale === 'zh-CN' ? /配置预览/ : /Configuration preview/ })
    if (viewport.width === 390) {
      await preview.focus()
      await page.keyboard.down('ArrowRight')
      await page.waitForTimeout(250)
      await page.keyboard.up('ArrowRight')
      await expect.poll(() => preview.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    }

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>('.onboarding-shell')
      const grid = document.querySelector<HTMLElement>('.onboarding-grid')
      const columns = Array.from(document.querySelectorAll<HTMLElement>('.onboarding-grid > .onboarding-card'))
      const clientCards = Array.from(document.querySelectorAll<HTMLElement>('.mcp-client-card'))
      const configPreview = document.querySelector<HTMLElement>('.config-preview')
      if (!shell || !grid || columns.length !== 2 || clientCards.length === 0 || !configPreview) throw new Error('Onboarding geometry targets are unavailable.')
      const shellRect = shell.getBoundingClientRect()
      const clientColumnRect = columns[0]!.getBoundingClientRect()
      const configColumnRect = columns[1]!.getBoundingClientRect()
      const cardRects = clientCards.map(card => card.getBoundingClientRect())
      return {
        viewportWidth: window.innerWidth,
        documentClientWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        windowScrollX: window.scrollX,
        shellWidth: shellRect.width,
        shellLeftWhitespace: shellRect.left,
        shellRightWhitespace: window.innerWidth - shellRect.right,
        shellWhitespaceDelta: Math.abs(shellRect.left - (window.innerWidth - shellRect.right)),
        gridColumnCount: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        clientColumnWidth: clientColumnRect.width,
        configColumnWidth: configColumnRect.width,
        maximumClientCardWidth: Math.max(...cardRects.map(rect => rect.width)),
        minimumClientCardHeight: Math.min(...cardRects.map(rect => rect.height)),
        clientCardOverflow: clientCards.some(card => card.scrollWidth > card.clientWidth + 1),
        previewClientWidth: configPreview.clientWidth,
        previewScrollWidth: configPreview.scrollWidth,
        previewScrollLeft: configPreview.scrollLeft,
      }
    })

    expect(geometry.documentScrollWidth).toBe(geometry.viewportWidth)
    expect(geometry.documentClientWidth).toBe(geometry.viewportWidth)
    expect(geometry.windowScrollX).toBe(0)
    expect(geometry.minimumClientCardHeight).toBeGreaterThanOrEqual(44)
    expect(geometry.clientCardOverflow).toBe(false)
    if (viewport.width === 390) {
      expect(geometry.shellWidth).toBeGreaterThanOrEqual(356)
      expect(geometry.shellWidth).toBeLessThanOrEqual(360)
      expect(geometry.gridColumnCount).toBe(1)
      expect(geometry.maximumClientCardWidth).toBeLessThanOrEqual(326)
      expect(geometry.previewScrollWidth).toBeGreaterThan(geometry.previewClientWidth)
      expect(geometry.previewScrollLeft).toBeGreaterThan(0)
    } else {
      expect(geometry.shellWidth).toBeGreaterThanOrEqual(1118)
      expect(geometry.shellWidth).toBeLessThanOrEqual(1122)
      expect(geometry.shellWhitespaceDelta).toBeLessThanOrEqual(2)
      expect(geometry.gridColumnCount).toBe(2)
      expect(geometry.clientColumnWidth).toBeGreaterThanOrEqual(330)
      expect(geometry.clientColumnWidth).toBeLessThanOrEqual(390)
      expect(geometry.configColumnWidth).toBeGreaterThanOrEqual(630)
      expect(geometry.configColumnWidth).toBeLessThanOrEqual(700)
      expect(geometry.maximumClientCardWidth).toBeLessThanOrEqual(360)
    }
    expect(audit.counts).toEqual({ discovery: 1, info: 1, mcp: 1 })
    await expectNoForbiddenClientWasMounted(page)

    console.info('TASK_5_5_ROOT_GEOMETRY', JSON.stringify({ name: viewport.name, geometry }))

    const screenshotPath = testInfo.outputPath(`task-5.5-connect-${viewport.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    await testInfo.attach(`task-5.5-connect-${viewport.name}`, { path: screenshotPath, contentType: 'image/png' })
    await attachJson(testInfo, `task-5.5-connect-${viewport.name}-geometry`, {
      locale: viewport.locale,
      viewport: { width: viewport.width, height: viewport.height },
      geometry,
      request: { counts: audit.counts, mcp: audit.mcp },
      credentialShapePresent: false,
      forbiddenClientObserved: false,
    })
  })
}

test('fails closed when public discovery is unavailable without rendering raw diagnostics', async ({ page }) => {
  await page.route(`${apiUrl}/**`, route => route.fulfill({
    status: 503,
    headers,
    body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'untrusted-upstream-detail', correlationId: 'onboarding-e2e' } }),
  }))
  await page.goto('/connect#test')
  const alert = page.locator('[role="alert"][data-onboarding-state]')
  await expect(alert).toContainText('Discovery unavailable')
  await expect(alert).toContainText('Do not infer endpoints')
  await expect(alert).not.toContainText('untrusted-upstream-detail')
})

test('renders the server feature-disabled state without misclassifying discovery', async ({ page }) => {
  await page.route(`${apiUrl}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/info') return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({ preferredClientProfileVersion: '1.0', supportedClientProfileVersions: ['1.0'], mcpVersion: '1.29.0' }),
    })
    return route.fulfill({
      status: 403,
      headers,
      body: JSON.stringify({ error: { code: 'FEATURE_DISABLED', message: 'untrusted-feature-detail', correlationId: 'onboarding-e2e' } }),
    })
  })
  await page.goto('/connect#test')
  const alert = page.locator('[role="alert"][data-onboarding-state]')
  await expect(alert).toHaveAttribute('data-onboarding-state', 'coordination_feature_disabled')
  await expect(alert).toContainText('Coordination feature disabled')
  await expect(alert).not.toContainText('Discovery unavailable')
  await expect(alert).not.toContainText('untrusted-feature-detail')
})
