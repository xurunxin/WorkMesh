import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const webUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'
const evidenceRoot = String.raw`D:\Cache\Temp\workmesh-web-ui-evidence-2026-08-23\task-6.2`
const responseHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': webUrl,
  'Content-Type': 'application/json',
}

const canonicalFeatures = [
  'WORKMESH_BETA_PLANNING',
  'WORKMESH_BETA_TEMPLATES',
  'WORKMESH_BETA_COSTS',
  'WORKMESH_BETA_GITEA',
  'WORKMESH_BETA_OPERATIONS_UI',
  'WORKMESH_BETA_COORDINATION_MCP',
  'WORKMESH_EXPERIMENTAL_AUTOMATION',
  'WORKMESH_EXPERIMENTAL_AGENT_LOOPS',
  'WORKMESH_EXPERIMENTAL_A2A',
  'WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS',
  'WORKMESH_EXPERIMENTAL_MULTI_RUNTIME',
] as const

const teams = Array.from({ length: 14 }, (_, index) => ({
  id: index === 0 ? 'team-runtime' : `team-${index + 1}`,
  key: index === 0 ? 'RUN' : `T${String(index + 1).padStart(2, '0')}`,
  name: index === 0 ? 'Runtime Reliability' : `Acceptance Team ${index + 1}`,
  revision: index + 1,
}))

const agent = {
  id: 'agent/overlay',
  workspace_id: 'workspace-preview',
  actor_id: 'actor-agent-overlay',
  name: 'Overlay Agent',
  display_name: 'Overlay Agent',
  slug: 'overlay-agent',
  description: 'Exercises the production Agent Peek and Team Access overlay paths.',
  provider: 'openai',
  version: '1.0.0',
  supported_protocols: ['native_http'],
  skills: ['frontend', 'accessibility', 'runtime-reliability'],
  requested_capabilities: ['work:read', 'work:write', 'agent:session:start'],
  approved_capabilities: ['work:read', 'work:write'],
  max_concurrency: 2,
  heartbeat_interval_seconds: 30,
  is_active: true,
  revision: 1,
  team_access: [{
    agent_id: 'agent/overlay',
    team_id: 'team-runtime',
    approved_capabilities: ['work:read'],
    status: 'active',
    approved_by_actor_id: 'human-preview',
    revision: 1,
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
    revoked_at: null,
  }],
}

type Rect = { bottom: number; height: number; left: number; right: number; top: number; width: number }
type BackgroundSnapshot = {
  bodyStyle: string | null
  htmlStyle: string | null
  main: Rect
  scrollX: number
  scrollY: number
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function fulfillJson(route: Parameters<Parameters<Page['route']>[1]>[0], payload: unknown): Promise<void> {
  await route.fulfill({ status: 200, headers: responseHeaders, body: JSON.stringify(payload) })
}

async function installAgentFixtures(page: Page, requests: string[]): Promise<void> {
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: responseHeaders, body: '' })
    if (url.pathname === '/api/v1/features') return fulfillJson(route, {
      features: canonicalFeatures.map(key => ({ key, tier: key.includes('EXPERIMENTAL') ? 'experimental' : 'beta', enabled: key === 'WORKMESH_BETA_PLANNING' || key === 'WORKMESH_BETA_OPERATIONS_UI' })),
    })
    if (url.pathname === '/api/v1/agents') return fulfillJson(route, { items: [agent], nextCursor: null })
    if (url.pathname === '/api/v1/teams') return fulfillJson(route, { items: teams, nextCursor: null })
    if (url.pathname === '/api/v1/agent-sessions' || url.pathname === '/api/v1/actors/humans')
      return fulfillJson(route, { items: [], nextCursor: null })
    if (url.pathname === '/api/v1/approvals') return fulfillJson(route, { items: [], nextCursor: null })
    await route.continue()
  })
}

async function installSettingsFixtures(page: Page, requests: string[]) {
  const deletion = deferred()
  const target = { id: 'team/delete-overlay', name: 'Runtime Reliability', key: 'RUN', revision: 11 }
  const survivor = { id: 'team-survivor', name: 'Platform', key: 'PLAT', revision: 4 }
  let deleted = false
  let deleteCount = 0
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    requests.push(`${request.method()} ${url.pathname}`)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: responseHeaders, body: '' })
    if (url.pathname === '/api/v1/features') return fulfillJson(route, {
      features: canonicalFeatures.map(key => ({ key, tier: key.includes('EXPERIMENTAL') ? 'experimental' : 'beta', enabled: true })),
    })
    if (request.method() === 'DELETE' && url.pathname === '/api/v1/teams/team%2Fdelete-overlay') {
      deleteCount += 1
      await deletion.promise
      deleted = true
      return route.fulfill({ status: 204, headers: responseHeaders, body: '' })
    }
    if (url.pathname === '/api/v1/teams') return fulfillJson(route, {
      items: deleted ? [survivor] : [target, survivor],
      nextCursor: null,
    })
    const stateMatch = url.pathname.match(/^\/api\/v1\/teams\/([^/]+)\/states$/)
    if (stateMatch) return fulfillJson(route, {
      items: [{ id: `state-${decodeURIComponent(stateMatch[1]!)}`, name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }],
      nextCursor: null,
    })
    await route.continue()
  })
  return {
    deleteCount: () => deleteCount,
    release: deletion.resolve,
    survivor,
    target,
  }
}

async function prepareScrollableBackground(page: Page): Promise<BackgroundSnapshot> {
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--task-6-2-html-preserved', '1')
    document.body.style.setProperty('--task-6-2-body-preserved', '1')
    const spacer = document.createElement('div')
    spacer.dataset.task62Spacer = 'true'
    spacer.style.height = '1800px'
    spacer.style.pointerEvents = 'none'
    spacer.style.width = '1px'
    document.body.append(spacer)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    window.scrollTo(0, 180)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  const snapshot = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    if (!main) throw new Error('Main landmark missing')
    const rect = main.getBoundingClientRect()
    return {
      bodyStyle: document.body.getAttribute('style'),
      htmlStyle: document.documentElement.getAttribute('style'),
      main: { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width },
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
  })
  expect(snapshot.scrollY).toBeGreaterThan(0)
  return snapshot
}

async function assertBackgroundRestored(page: Page, snapshot: BackgroundSnapshot): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(snapshot.scrollY)
  const restored = await page.evaluate(() => ({
    bodyStyle: document.body.getAttribute('style'),
    htmlStyle: document.documentElement.getAttribute('style'),
    scrollX: window.scrollX,
  }))
  expect(restored).toEqual({ bodyStyle: snapshot.bodyStyle, htmlStyle: snapshot.htmlStyle, scrollX: snapshot.scrollX })
}

async function expectValidPostDeleteFocus(page: Page): Promise<{
  connected: boolean
  identity: string
  visible: boolean
}> {
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) return false
    return active.matches('.app-team-switcher select, #team-settings-heading, #workmesh-main')
  })).toBe(true)

  const evidence = await page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) throw new Error('Post-delete focus is not an HTML element')
    const rect = active.getBoundingClientRect()
    const style = window.getComputedStyle(active)
    return {
      connected: active.isConnected,
      identity: active.id ? `#${active.id}` : `${active.tagName.toLowerCase()}${active.className ? `.${String(active.className).trim().replace(/\s+/g, '.')}` : ''}`,
      visible: style.display !== 'none'
        && style.visibility !== 'hidden'
        && active.getClientRects().length > 0
        && rect.width > 0
        && rect.height > 0,
    }
  })
  expect(evidence.connected).toBe(true)
  expect(evidence.visible).toBe(true)
  expect(evidence.identity).not.toBe('body')
  return evidence
}

async function measureOverlay(dialog: Locator, before: BackgroundSnapshot) {
  return dialog.evaluate((element, snapshot) => {
    if (!(element instanceof HTMLElement)) throw new Error('Overlay root missing')
    const main = document.querySelector<HTMLElement>('#workmesh-main')
    if (!main) throw new Error('Main landmark missing')
    const toRect = (target: HTMLElement) => {
      const rect = target.getBoundingClientRect()
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width }
    }
    const rect = toRect(element)
    const mainRect = toRect(main)
    return {
      activeInside: element.contains(document.activeElement),
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      centerDelta: Math.abs(rect.left - (window.innerWidth - rect.right)),
      dialog: rect,
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      htmlOverflow: document.documentElement.style.overflow,
      inertCount: document.querySelectorAll('[inert]').length,
      internalScroll: { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop },
      main: mainRect,
      mainShift: { left: Math.abs(mainRect.left - snapshot.main.left), width: Math.abs(mainRect.width - snapshot.main.width) },
      scroll: { x: window.scrollX, y: window.scrollY },
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  }, before)
}

function expectContained(evidence: Awaited<ReturnType<typeof measureOverlay>>, maxWidth: number): void {
  expect(evidence.dialog.width).toBeLessThanOrEqual(maxWidth + 0.5)
  expect(evidence.dialog.left).toBeGreaterThanOrEqual(-0.5)
  expect(evidence.dialog.top).toBeGreaterThanOrEqual(-0.5)
  expect(evidence.dialog.right).toBeLessThanOrEqual(evidence.viewport.width + 0.5)
  expect(evidence.dialog.bottom).toBeLessThanOrEqual(evidence.viewport.height + 0.5)
  expect(evidence.document.scrollWidth).toBe(evidence.document.clientWidth)
  expect(evidence.mainShift.left).toBeLessThanOrEqual(1)
  expect(evidence.mainShift.width).toBeLessThanOrEqual(1)
  expect(evidence.bodyPosition).toBe('fixed')
  expect(evidence.htmlOverflow).toBe('hidden')
  expect(evidence.inertCount).toBeGreaterThan(0)
  expect(evidence.activeInside).toBe(true)
}

async function persistEvidence(page: Page, testInfo: TestInfo, name: string, payload: unknown): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true })
  await page.evaluate(() => { document.querySelectorAll('nextjs-portal').forEach(element => element.remove()) })
  const jsonPath = join(evidenceRoot, `${name}.json`)
  const screenshotPath = join(evidenceRoot, `${name}.png`)
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8')
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach(name, { path: jsonPath, contentType: 'application/json' })
  await testInfo.attach(`${name}-screenshot`, { path: screenshotPath, contentType: 'image/png' })
}

async function rejectBackgroundFocus(dialog: Locator) {
  return dialog.evaluate(element => {
    const candidates = [...document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]')]
      .filter(candidate => candidate.isConnected && !element.contains(candidate))
    const background = candidates.find(candidate => candidate.closest('[inert]'))
    if (!background) throw new Error('Background focus target missing')
    const inertAncestor = background.closest<HTMLElement>('[inert]')
    background.focus()
    background.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    return {
      activeInside: element.contains(document.activeElement),
      inertAncestor: Boolean(inertAncestor),
      target: {
        ariaLabel: background.getAttribute('aria-label'),
        className: background.className,
        id: background.id,
        tagName: background.tagName,
      },
    }
  })
}

async function assertBackgroundWheelLocked(page: Page, dialog: Locator) {
  const before = await page.evaluate(() => window.scrollY)
  const box = await dialog.boundingBox()
  if (!box) throw new Error('Overlay geometry missing for wheel assertion')
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(24, box.height / 2))
  await page.mouse.wheel(0, 500)
  await page.waitForTimeout(50)
  const after = await page.evaluate(() => window.scrollY)
  expect(after).toBe(before)
  return { after, before, delta: after - before }
}

async function dispatchOutsidePointerChain(dialog: Locator) {
  return dialog.evaluate(element => {
    const backdrop = element.parentElement
    if (!(backdrop instanceof HTMLElement)) throw new Error('Overlay backdrop missing')
    const pointerdown = new PointerEvent('pointerdown', { bubbles: true, button: 0, cancelable: true, pointerId: 1, pointerType: 'mouse' })
    const mousedown = new MouseEvent('mousedown', { bubbles: true, button: 0, cancelable: true })
    const click = new MouseEvent('click', { bubbles: true, button: 0, cancelable: true })
    backdrop.dispatchEvent(pointerdown)
    backdrop.dispatchEvent(mousedown)
    backdrop.dispatchEvent(click)
    return {
      clickPrevented: click.defaultPrevented,
      mousedownPrevented: mousedown.defaultPrevented,
      pointerdownPrevented: pointerdown.defaultPrevented,
    }
  })
}

const viewports = [{ width: 390, height: 844 }, { width: 1920, height: 1080 }] as const

for (const viewport of viewports) {
  test.describe(`overlay contract at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport })

    test('keeps Agent Peek and Team Access focus, scroll, containment, and return ownership deterministic', async ({ page }, testInfo) => {
      const requests: string[] = []
      await installAgentFixtures(page, requests)
      await page.goto('/agents')
      const agentLink = page.locator('[data-agent-roving-link="true"]').first()
      await expect(agentLink).toBeVisible()
      const background = await prepareScrollableBackground(page)

      await agentLink.evaluate(element => element.focus({ preventScroll: true }))
      await page.keyboard.press('Space')
      const peek = page.locator('.agent-peek')
      await expect(peek).toBeVisible()
      const firstPeekControl = peek.locator(':scope > header button').first()
      await expect(firstPeekControl).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      expect(await peek.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Tab')
      await expect(firstPeekControl).toBeFocused()
      await peek.dispatchEvent('mousedown')
      await expect(peek).toBeVisible()
      const peekFocusRejection = await rejectBackgroundFocus(peek)
      expect(peekFocusRejection.activeInside).toBe(true)
      expect(peekFocusRejection.inertAncestor).toBe(true)
      const peekWheelLock = await assertBackgroundWheelLocked(page, peek)
      const peekEvidence = await measureOverlay(peek, background)
      expectContained(peekEvidence, 620)
      expect(peekEvidence.bodyTop).toBe(`-${background.scrollY}px`)
      await persistEvidence(page, testInfo, `agent-peek-${viewport.width}x${viewport.height}`, {
        contractLimits: { delete: 560, dialog: 760, sheet: 620 },
        focusRejection: peekFocusRejection,
        geometry: peekEvidence,
        requests,
        url: page.url(),
        wheelLock: peekWheelLock,
      })
      const peekBackdropChain = await dispatchOutsidePointerChain(peek)
      await expect(peek).toHaveCount(0)
      await expect(agentLink).toBeFocused()
      await assertBackgroundRestored(page, background)

      await page.keyboard.press('Space')
      await expect(peek).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(peek).toHaveCount(0)
      await expect(agentLink).toBeFocused()
      await assertBackgroundRestored(page, background)

      const card = page.getByTestId('agent-registry-agent/overlay')
      const manage = card.getByRole('button').first()
      await manage.evaluate(element => element.focus({ preventScroll: true }))
      await page.keyboard.press('Space')
      const accessSheet = page.getByRole('dialog').filter({ has: page.locator('.team-access-drawer') })
      await expect(accessSheet).toBeVisible()
      const accessFocusRejection = await rejectBackgroundFocus(accessSheet)
      expect(accessFocusRejection.activeInside).toBe(true)
      expect(accessFocusRejection.inertAncestor).toBe(true)
      const accessWheelLock = await assertBackgroundWheelLocked(page, accessSheet)
      const internalScroll = await accessSheet.evaluate(element => {
        const before = element.scrollTop
        element.scrollTop = element.scrollHeight
        return { after: element.scrollTop, before, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }
      })
      expect(internalScroll.scrollHeight).toBeGreaterThan(internalScroll.clientHeight)
      expect(internalScroll.after).toBeGreaterThan(internalScroll.before)
      const accessEvidence = await measureOverlay(accessSheet, background)
      expectContained(accessEvidence, 620)
      expect(accessEvidence.bodyTop).toBe(`-${background.scrollY}px`)
      await accessSheet.dispatchEvent('mousedown')
      await expect(accessSheet).toBeVisible()
      await persistEvidence(page, testInfo, `team-access-${viewport.width}x${viewport.height}`, {
        backdropChain: peekBackdropChain,
        contractLimits: { delete: 560, dialog: 760, sheet: 620 },
        focusRejection: accessFocusRejection,
        geometry: accessEvidence,
        internalScroll,
        requests,
        url: page.url(),
        wheelLock: accessWheelLock,
      })
      await page.keyboard.press('Escape')
      await expect(accessSheet).toHaveCount(0)
      await expect(manage).toBeFocused()
      await assertBackgroundRestored(page, background)

      if (viewport.width === 390) {
        await page.goto('/preview-issues')
        const labelTriggers = page.locator('.wm-work-item-label-more')
        await expect.poll(() => labelTriggers.count()).toBeGreaterThanOrEqual(2)
        await labelTriggers.nth(0).evaluate(element => element.focus({ preventScroll: true }))
        await page.keyboard.press('Enter')
        await expect(page.locator('.wm-work-item-label-menu-panel')).toHaveCount(1)
        const firstMenuLabel = await page.locator('.wm-work-item-label-menu-panel').getAttribute('aria-label')
        await labelTriggers.nth(1).evaluate(element => element.focus({ preventScroll: true }))
        await page.keyboard.press('Space')
        await expect(page.locator('.wm-work-item-label-menu-panel')).toHaveCount(1)
        const secondMenuLabel = await page.locator('.wm-work-item-label-menu-panel').getAttribute('aria-label')
        expect(secondMenuLabel).not.toBe(firstMenuLabel)
        const pointerChain = await page.locator('.wm-work-item-label-menu-panel').evaluate(element => ({
          ariaLabel: element.getAttribute('aria-label'),
          documentClientWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
        }))
        expect(pointerChain.documentScrollWidth).toBe(pointerChain.documentClientWidth)
        await persistEvidence(page, testInfo, 'keyboard-dismissal-chain-390x844', {
          firstActivation: 'Enter',
          firstMenuLabel,
          geometry: pointerChain,
          panelCount: 1,
          secondActivation: 'Space',
          secondMenuLabel,
        })
      }

      await page.evaluate(() => document.querySelector('[data-task62-spacer="true"]')?.remove())
    })

    test('keeps busy delete nondismissible and restores the exact background after completion', async ({ page }, testInfo) => {
      const requests: string[] = []
      const fixture = await installSettingsFixtures(page, requests)
      await page.goto(`/settings?team=${encodeURIComponent(fixture.target.id)}`)
      const deleteTeam = page.getByRole('button', { name: /^(Delete team|删除团队)$/ })
      await expect(deleteTeam).toBeVisible()
      const background = await prepareScrollableBackground(page)
      await deleteTeam.evaluate(element => element.focus({ preventScroll: true }))
      expect(await page.evaluate(() => window.scrollY)).toBe(background.scrollY)
      await page.keyboard.press('Enter')
      const dialog = page.locator('.delete-team-dialog')
      await expect(dialog).toBeVisible()
      const firstDialogControl = dialog.locator(':scope > header button').first()
      await expect(firstDialogControl).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press('Tab')
      await expect(firstDialogControl).toBeFocused()

      const idleEvidence = await measureOverlay(dialog, background)
      expectContained(idleEvidence, 560)
      expect(idleEvidence.bodyTop).toBe(`-${background.scrollY}px`)
      if (viewport.width === 1920) expect(idleEvidence.centerDelta).toBeLessThanOrEqual(2)
      const idleWheelLock = await assertBackgroundWheelLocked(page, dialog)
      const confirm = dialog.locator('.wm-button-danger')
      await confirm.click()
      await expect.poll(fixture.deleteCount).toBe(1)
      await expect(dialog.getByRole('status')).toBeVisible()
      await expect(dialog).toBeFocused()
      await expect(dialog.locator(':scope > header button')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeVisible()
      const busyBackdropChain = await dispatchOutsidePointerChain(dialog)
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Tab')
      await expect(dialog).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(dialog).toBeFocused()
      const busyFocusRejection = await rejectBackgroundFocus(dialog)
      expect(busyFocusRejection.activeInside).toBe(true)
      expect(busyFocusRejection.inertAncestor).toBe(true)
      const busyWheelLock = await assertBackgroundWheelLocked(page, dialog)
      const busyEvidence = await measureOverlay(dialog, background)
      expectContained(busyEvidence, 560)
      expect(busyEvidence.bodyTop).toBe(`-${background.scrollY}px`)
      if (viewport.width === 1920) expect(busyEvidence.centerDelta).toBeLessThanOrEqual(2)
      await persistEvidence(page, testInfo, `busy-delete-${viewport.width}x${viewport.height}`, {
        backdropChain: busyBackdropChain,
        busy: busyEvidence,
        contractLimits: { delete: 560, dialog: 760, sheet: 620 },
        focusRejection: busyFocusRejection,
        idle: idleEvidence,
        idleWheelLock,
        requests,
        url: page.url(),
        wheelLock: busyWheelLock,
      })

      fixture.release()
      await expect(dialog).toHaveCount(0)
      await assertBackgroundRestored(page, background)
      expect(fixture.deleteCount()).toBe(1)
      const postDeleteFocus = await expectValidPostDeleteFocus(page)
      await persistEvidence(page, testInfo, `post-delete-focus-${viewport.width}x${viewport.height}`, {
        focus: postDeleteFocus,
        requests,
        url: page.url(),
      })
      await page.evaluate(() => document.querySelector('[data-task62-spacer="true"]')?.remove())
    })
  })
}
