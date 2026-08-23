import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const responseHeaders = {
  'Access-Control-Allow-Origin': webUrl,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

const agents = [
  {
    id: 'agent/one', workspace_id: 'workspace-preview', actor_id: 'actor-agent-one', name: 'Slash Agent', slug: 'slash-agent',
    description: 'Exercises slash identifiers.', provider: 'openai', version: '1.0.0', supported_protocols: ['native_http'], skills: ['frontend'],
    requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, heartbeat_interval_seconds: 30,
    is_active: true, revision: 1, team_access: [],
  },
  {
    id: 'agent%two', workspace_id: 'workspace-preview', actor_id: 'actor-agent-two', name: 'Percent Agent', slug: 'percent-agent',
    description: 'Exercises percent identifiers.', provider: 'openai', version: '1.0.0', supported_protocols: ['native_http'], skills: ['review'],
    requested_capabilities: ['work:read'], approved_capabilities: ['work:read'], max_concurrency: 1, heartbeat_interval_seconds: 30,
    is_active: false, revision: 1, team_access: [],
  },
] as const

const pendingApproval = {
  id: 'approval-hotkeys', session_id: 'session-preview', approval_type: 'merge_pull_request', action_name: 'Review keyboard closure',
  risk_level: 'medium', rationale_summary: 'Keeps approval state independent from Agent focus and Peek.', status: 'pending', revision: 1,
  expires_at: '2026-08-24T00:00:00.000Z', created_at: '2026-08-23T00:00:00.000Z',
}

const canonicalFeatures = [
  { key: 'WORKMESH_BETA_PLANNING', tier: 'beta' },
  { key: 'WORKMESH_BETA_TEMPLATES', tier: 'beta' },
  { key: 'WORKMESH_BETA_COSTS', tier: 'beta' },
  { key: 'WORKMESH_BETA_GITEA', tier: 'beta' },
  { key: 'WORKMESH_BETA_OPERATIONS_UI', tier: 'beta' },
  { key: 'WORKMESH_BETA_COORDINATION_MCP', tier: 'beta' },
  { key: 'WORKMESH_EXPERIMENTAL_AUTOMATION', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_AGENT_LOOPS', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_A2A', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS', tier: 'experimental' },
  { key: 'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME', tier: 'experimental' },
] as const

async function installHotkeyFixtures(page: Page): Promise<void> {
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const body = (payload: unknown) => route.fulfill({
      status: 200,
      headers: responseHeaders,
      body: JSON.stringify(payload),
    })
    if (url.pathname === '/api/v1/agents') return body({ items: agents, nextCursor: null })
    if (url.pathname === '/api/v1/approvals') {
      return body({
        items: url.searchParams.get('status') === 'pending' ? [pendingApproval] : [],
        nextCursor: null,
      })
    }
    if (url.pathname === '/api/v1/features') return body({
      features: canonicalFeatures.map(feature => ({
        ...feature,
        enabled: feature.key === 'WORKMESH_BETA_OPERATIONS_UI' || feature.key === 'WORKMESH_BETA_PLANNING',
      })),
    })
    if (url.pathname === '/api/v1/cycles' || url.pathname === '/api/v1/initiatives')
      return body({ items: [], nextCursor: null })
    await route.continue()
  })
}

async function pressChord(page: Page, second: 'i' | 'a' | 's'): Promise<void> {
  await page.keyboard.press('g')
  await page.keyboard.press(second)
}

async function chooseAgentsTab(page: Page, tab: 'agents' | 'sessions' | 'approvals'): Promise<void> {
  const compact = page.locator('select.wm-tab-select').first()
  if (await compact.isVisible()) await compact.selectOption(tab)
  else await page.locator(`[role="tab"][aria-controls$="-panel-${tab}"]`).click()
}

async function attachGeometry(testInfo: TestInfo, name: string, target: Locator): Promise<void> {
  const evidence = await target.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      activeTag: document.activeElement?.tagName ?? null,
      boxShadow: style.boxShadow,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      rect: { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width },
      url: `${location.pathname}${location.search}${location.hash}`,
      viewport: { height: innerHeight, width: innerWidth },
    }
  })
  expect(evidence.rect.left).toBeGreaterThanOrEqual(0)
  expect(evidence.rect.top).toBeGreaterThanOrEqual(0)
  expect(evidence.rect.right).toBeLessThanOrEqual(evidence.viewport.width)
  expect(evidence.rect.bottom).toBeLessThanOrEqual(evidence.viewport.height)
  expect(evidence.documentScrollWidth).toBe(evidence.documentClientWidth)
  expect(evidence.outlineStyle !== 'none' || evidence.boxShadow !== 'none').toBe(true)
  console.info('TASK_6_1_MOCKED_GEOMETRY', JSON.stringify({ name, evidence }))
  const jsonPath = testInfo.outputPath(`${name}.json`)
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await writeFile(jsonPath, JSON.stringify(evidence, null, 2), 'utf8')
  await target.page().screenshot({ path: screenshotPath })
  await testInfo.attach(name, { path: jsonPath, contentType: 'application/json' })
  await testInfo.attach(`${name}-screenshot`, { path: screenshotPath, contentType: 'image/png' })
}

const hotkeyViewports = [{ width: 390, height: 844 }, { width: 1920, height: 1080 }] as const

for (const viewport of hotkeyViewports) {
  test.describe(`public and unknown route shortcut boundary at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('makes zero authenticated requests and mounts no command center or page chord', async ({ page }, testInfo) => {
      const authenticatedRequests: string[] = []
      const publicPaths = new Set([
        '/.well-known/workmesh-agent',
        '/api/v1/auth/install',
        '/api/v1/auth/login',
        '/api/v1/info',
        '/api/v1/install-status',
      ])
      page.on('request', request => {
        const url = new URL(request.url())
        if (url.origin === apiUrl && !publicPaths.has(url.pathname))
          authenticatedRequests.push(`${request.method()} ${url.pathname}`)
      })

      const evidence: Array<{ requested: string; settled: string; authenticatedRequests: readonly string[] }> = []
      for (const path of ['/login', '/install', '/connect', '/future-unknown-route']) {
        authenticatedRequests.length = 0
        await page.goto(path)
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(300)
        const settled = new URL(page.url()).pathname
        const before = page.url()
        await page.keyboard.press('/')
        await page.keyboard.press('Control+K')
        await pressChord(page, 'a')
        await page.waitForTimeout(100)
        expect(page.url()).toBe(before)
        await expect(page.getByTestId('command-center-trigger')).toHaveCount(0)
        expect(authenticatedRequests).toEqual([])
        evidence.push({ requested: path, settled, authenticatedRequests: [...authenticatedRequests] })
      }
      const evidencePath = testInfo.outputPath(`public-zero-auth-requests-${viewport.width}.json`)
      await writeFile(evidencePath, JSON.stringify(evidence, null, 2), 'utf8')
      await testInfo.attach(`public-zero-auth-requests-${viewport.width}`, { path: evidencePath, contentType: 'application/json' })
    })
  })
}

for (const viewport of hotkeyViewports) {
  test.describe(`page hotkeys at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('keeps global navigation, one visible filter, no-filter surfaces and command-center ownership deterministic', async ({ page }, testInfo) => {
      await installHotkeyFixtures(page)
      await page.goto('/?view=my-work')
      const issueSearch = page.locator('[data-hotkey-filter="true"]')
      await expect(issueSearch).toHaveCount(1)
      await page.keyboard.press('f')
      await expect(issueSearch).toBeFocused()
      await attachGeometry(testInfo, `home-filter-${viewport.width}`, issueSearch)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

      const historyLength = await page.evaluate(() => history.length)
      await pressChord(page, 'i')
      await expect(page).toHaveURL(`${webUrl}/?view=my-work`)
      expect(await page.evaluate(() => history.length)).toBe(historyLength)

      await issueSearch.focus()
      await pressChord(page, 'a')
      await expect(issueSearch).toBeFocused()
      expect(new URL(page.url()).pathname).toBe('/')
      expect(new URL(page.url()).searchParams.get('view')).toBe('my-work')
      expect(new URL(page.url()).searchParams.get('search')).toBe('ga')
      await issueSearch.fill('')
      await expect.poll(() => new URL(page.url()).searchParams.get('search')).toBeNull()
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

      const contextUrl = page.url()
      const select = page.locator('select:visible').first()
      await select.focus()
      await pressChord(page, 'a')
      await expect(select).toBeFocused()
      expect(page.url()).toBe(contextUrl)

      const button = page.getByTestId('command-center-trigger')
      await button.focus()
      await pressChord(page, 's')
      await expect(button).toBeFocused()
      expect(page.url()).toBe(contextUrl)

      const link = page.locator('a:visible').first()
      await link.focus()
      await pressChord(page, 'a')
      await expect(link).toBeFocused()
      expect(page.url()).toBe(contextUrl)

      await page.evaluate(() => {
        const editable = document.createElement('div')
        editable.contentEditable = 'plaintext-only'
        editable.dataset.hotkeyContext = 'contenteditable'
        editable.tabIndex = 0
        editable.textContent = 'Editable shortcut guard'
        document.body.append(editable)
      })
      const editable = page.locator('[data-hotkey-context="contenteditable"]')
      await editable.focus()
      await pressChord(page, 's')
      await expect(editable).toBeFocused()
      expect(page.url()).toBe(contextUrl)
      await editable.evaluate(element => element.remove())
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

      const stableHomeUrl = page.url()
      await page.keyboard.press('g')
      await page.keyboard.press('z')
      expect(page.url()).toBe(stableHomeUrl)
      await page.keyboard.press('g')
      await page.waitForTimeout(1_050)
      await page.keyboard.press('a')
      expect(page.url()).toBe(stableHomeUrl)

      await pressChord(page, 'a')
      await expect(page).toHaveURL(`${webUrl}/agents`)

      await page.goto('/?view=my-work')
      await page.keyboard.press('/')
      await expect(page.getByTestId('command-center')).toHaveCount(1)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      const modalUrl = page.url()
      await pressChord(page, 'a')
      expect(page.url()).toBe(modalUrl)
      await page.keyboard.press('f')
      expect(page.url()).toBe(modalUrl)
      await page.keyboard.press('/')
      await expect(page.getByTestId('command-center')).toHaveCount(1)
      await page.getByRole('button', { name: /关闭|Close/ }).click()
      await page.keyboard.press('Control+K')
      await expect(page.getByTestId('command-center')).toHaveCount(1)
      await page.getByRole('button', { name: /关闭|Close/ }).click()

      for (const path of ['/?view=inbox', '/?view=guidance', '/settings']) {
        await page.goto(path)
        await expect(page.locator('[data-hotkey-filter="true"]')).toHaveCount(0)
        const anchor = page.locator('a:visible').first()
        await anchor.focus()
        await page.keyboard.press('f')
        await expect(anchor).toBeFocused()
      }

      await page.goto('/operations')
      const operationsSearch = page.locator('[data-hotkey-filter="true"]')
      await expect(operationsSearch).toHaveCount(1)
      await page.keyboard.press('f')
      await expect(operationsSearch).toBeFocused()
      await attachGeometry(testInfo, `operations-filter-${viewport.width}`, operationsSearch)

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await pressChord(page, 's')
      await expect(page).toHaveURL(`${webUrl}/settings`)
      await page.waitForTimeout(300)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await pressChord(page, 'i')
      await expect(page).toHaveURL(`${webUrl}/?view=my-work`)
    })

    test('wraps Agent links, preserves native controls and keeps focus, Peek and approval state independent', async ({ page }, testInfo) => {
      await installHotkeyFixtures(page)
      await page.goto('/agents')
      const links = page.locator('[data-agent-roving-link="true"]')
      const agentSearch = page.locator('[data-hotkey-filter="true"]')
      await expect(agentSearch).toHaveCount(1)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await page.keyboard.press('f')
      await expect(agentSearch).toBeFocused()
      await expect(links).toHaveCount(2)
      await expect(links.nth(0)).toHaveAttribute('tabindex', '0')
      await expect(links.nth(1)).toHaveAttribute('tabindex', '-1')

      for (const tab of ['sessions', 'approvals'] as const) {
        await chooseAgentsTab(page, tab)
        await expect(page.locator('[data-hotkey-filter="true"]')).toHaveCount(0)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
        await page.keyboard.press('f')
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
      }
      await chooseAgentsTab(page, 'agents')

      await links.nth(0).focus()
      await page.keyboard.press('j')
      await expect(links.nth(1)).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(links.nth(0)).toBeFocused()
      await page.keyboard.press('k')
      await expect(links.nth(1)).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await expect(links.nth(0)).toBeFocused()

      if (viewport.width === 1920) {
        await chooseAgentsTab(page, 'approvals')
        const approval = page.getByRole('checkbox').last()
        await approval.check()
        await chooseAgentsTab(page, 'agents')
        await links.nth(0).focus()
        await page.keyboard.press('Space')
        await expect(page.locator('.agent-peek')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(links.nth(0)).toBeFocused()
        await page.keyboard.press('Escape')
        await chooseAgentsTab(page, 'approvals')
        await expect(page.getByRole('checkbox').last()).not.toBeChecked()
        await chooseAgentsTab(page, 'agents')
      }

      await links.nth(0).focus()
      await page.keyboard.press('Space')
      await expect(page.locator('.agent-peek')).toBeVisible()
      await page.keyboard.press('/')
      await expect(page.getByTestId('command-center')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(links.nth(0)).toBeFocused()

      const firstCard = page.getByTestId('agent-registry-agent/one')
      const manage = firstCard.getByRole('button')
      await manage.focus()
      await page.keyboard.press('Space')
      await expect(page.locator('.team-access-drawer')).toBeVisible()
      await expect(page.locator('.agent-peek')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(manage).toBeFocused()

      const search = page.locator('[data-hotkey-filter="true"]')
      await search.fill('Percent')
      await expect(links).toHaveCount(1)
      await expect(links.first()).toHaveAttribute('data-agent-id', 'agent%two')
      await expect(links.first()).toHaveAttribute('tabindex', '0')
      await search.fill('no matching agent')
      await expect(links).toHaveCount(0)
      await search.fill('')
      await expect(links).toHaveCount(2)

      const targetIndex = viewport.width === 390 ? 0 : 1
      const target = links.nth(targetIndex)
      const expectedPath = targetIndex === 0 ? '/agents/agent%2Fone' : '/agents/agent%25two'
      await expect(target).toHaveAttribute('href', expectedPath)
      await target.focus()
      await attachGeometry(testInfo, `agent-roving-${viewport.width}`, target)
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(`${webUrl}${expectedPath}`)
    })
  })
}
