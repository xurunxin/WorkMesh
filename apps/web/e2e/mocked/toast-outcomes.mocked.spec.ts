import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const webUrl = 'http://127.0.0.1:3200'
const evidenceRoot = String.raw`D:\Cache\Temp\workmesh-web-ui-evidence-2026-08-23\task-6.3`
const responseHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': webUrl,
  'Content-Type': 'application/json',
}

type Team = { id: string; key: string; name: string; revision: number }
type RequestEvidence = { method: string; path: string; status: number }

async function fulfillJson(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  payload: unknown,
  status = 200,
): Promise<void> {
  await route.fulfill({ status, headers: responseHeaders, body: JSON.stringify(payload) })
}

async function installSettingsOutcomeFixtures(page: Page, requests: RequestEvidence[]): Promise<void> {
  let teams: Team[] = [
    { id: 'team-runtime', key: 'RUN', name: 'Runtime Reliability', revision: 1 },
    { id: 'team-platform', key: 'PLAT', name: 'Platform', revision: 2 },
  ]
  const states = new Map<string, Array<{ id: string; name: string; category: string; color: string; revision: number }>>()
  states.set('team-runtime', [{ id: 'state-ready', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }])

  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'OPTIONS') {
      requests.push({ method: 'OPTIONS', path: url.pathname, status: 204 })
      return route.fulfill({ status: 204, headers: responseHeaders, body: '' })
    }

    if (url.pathname === '/api/v1/teams' && request.method() === 'GET') {
      requests.push({ method: 'GET', path: url.pathname, status: 200 })
      return fulfillJson(route, { items: teams, nextCursor: null })
    }
    if (url.pathname === '/api/v1/teams' && request.method() === 'POST') {
      const payload: unknown = request.postDataJSON()
      const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const created: Team = {
        id: 'team-long-outcome',
        key: String(record.key ?? 'LONG'),
        name: String(record.name ?? 'Long outcome Team'),
        revision: 1,
      }
      teams = [...teams, created]
      states.set(created.id, [])
      requests.push({ method: 'POST', path: url.pathname, status: 201 })
      return fulfillJson(route, created, 201)
    }

    const stateMatch = url.pathname.match(/^\/api\/v1\/teams\/([^/]+)\/states$/)
    if (stateMatch) {
      const teamId = decodeURIComponent(stateMatch[1]!)
      if (request.method() === 'GET') {
        requests.push({ method: 'GET', path: url.pathname, status: 200 })
        return fulfillJson(route, { items: states.get(teamId) ?? [], nextCursor: null })
      }
      if (request.method() === 'POST') {
        const payload: unknown = request.postDataJSON()
        const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
        const created = {
          category: String(record.category ?? 'planned'),
          color: String(record.color ?? '#64748b'),
          id: 'state-long-outcome',
          name: String(record.name ?? 'Long outcome State'),
          revision: 1,
        }
        states.set(teamId, [...(states.get(teamId) ?? []), created])
        requests.push({ method: 'POST', path: url.pathname, status: 201 })
        return fulfillJson(route, created, 201)
      }
    }

    const teamMatch = url.pathname.match(/^\/api\/v1\/teams\/([^/]+)$/)
    if (teamMatch && request.method() === 'DELETE') {
      const teamId = decodeURIComponent(teamMatch[1]!)
      teams = teams.filter(team => team.id !== teamId)
      requests.push({ method: 'DELETE', path: url.pathname, status: 204 })
      return route.fulfill({ status: 204, headers: responseHeaders, body: '' })
    }
    await route.continue()
  })
}

async function pauseToast(toast: Locator): Promise<void> {
  await toast.evaluate(element => {
    element.dispatchEvent(new PointerEvent('pointerover', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'mouse',
    }))
  })
}

async function resumeToast(toast: Locator): Promise<void> {
  await toast.evaluate(element => {
    element.dispatchEvent(new PointerEvent('pointerout', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'mouse',
      relatedTarget: document.body,
    }))
  })
}

async function activeIdentity(page: Page): Promise<{
  connected: boolean
  identity: string
  insideToast: boolean
  tag: string
  visible: boolean
}> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement)) {
      return { connected: false, identity: 'non-html', insideToast: false, tag: 'unknown', visible: false }
    }
    const style = window.getComputedStyle(active)
    const rect = active.getBoundingClientRect()
    return {
      connected: active.isConnected,
      identity: active.id || active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 80) || active.tagName.toLowerCase(),
      insideToast: Boolean(active.closest('.wm-toast-viewport')),
      tag: active.tagName.toLowerCase(),
      visible: style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && rect.width > 0 && rect.height > 0,
    }
  })
}

async function stackEvidence(page: Page) {
  return page.locator('.wm-toast-viewport').evaluate(element => {
    if (!(element instanceof HTMLElement)) throw new Error('Toast viewport missing')
    const viewportRect = element.getBoundingClientRect()
    const items = [...element.querySelectorAll<HTMLElement>('.wm-toast')].map(item => {
      const rect = item.getBoundingClientRect()
      const close = item.querySelector<HTMLButtonElement>('[data-toast-close-id]')
      return {
        atomic: item.getAttribute('aria-atomic'),
        closeName: close?.getAttribute('aria-label') ?? '',
        rect: { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width },
        role: item.getAttribute('role'),
        title: item.querySelector('strong')?.textContent ?? '',
      }
    })
    return {
      activeInsideToast: Boolean(document.activeElement?.closest('.wm-toast-viewport')),
      document: {
        clientHeight: document.documentElement.clientHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      },
      items,
      liveDescendants: element.querySelectorAll('[aria-live]').length,
      overflowY: window.getComputedStyle(element).overflowY,
      region: {
        ariaLabel: element.getAttribute('aria-label'),
        ariaLive: element.getAttribute('aria-live'),
        clientHeight: element.clientHeight,
        rect: { bottom: viewportRect.bottom, height: viewportRect.height, left: viewportRect.left, right: viewportRect.right, top: viewportRect.top, width: viewportRect.width },
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
        zIndex: window.getComputedStyle(element).zIndex,
      },
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  })
}

function assertStackGeometry(evidence: Awaited<ReturnType<typeof stackEvidence>>): void {
  expect(evidence.items).toHaveLength(3)
  expect(evidence.region.ariaLive).toBeNull()
  expect(evidence.liveDescendants).toBe(0)
  expect(evidence.items.every(item => item.atomic === 'true' && item.role === 'status')).toBe(true)
  const closeNames = evidence.items.map(item => item.closeName)
  expect(closeNames.every(Boolean)).toBe(true)
  expect(new Set(closeNames).size).toBe(3)
  const ordered = [...evidence.items].sort((left, right) => left.rect.top - right.rect.top)
  for (let index = 1; index < ordered.length; index += 1)
    expect(ordered[index]!.rect.top).toBeGreaterThanOrEqual(ordered[index - 1]!.rect.bottom)
  expect(evidence.region.rect.left).toBeGreaterThanOrEqual(16)
  expect(evidence.region.rect.right).toBeLessThanOrEqual(evidence.viewport.width - 16 + 0.5)
  expect(evidence.region.rect.width).toBeLessThanOrEqual(420.5)
  if (evidence.viewport.width === 390) expect(evidence.region.rect.width).toBeLessThanOrEqual(358.5)
  if (evidence.viewport.width === 1920) expect(evidence.region.rect.width).toBeGreaterThanOrEqual(418)
  expect(evidence.region.rect.bottom).toBeLessThanOrEqual(evidence.viewport.height - 16 + 0.5)
  expect(evidence.region.rect.top).toBeGreaterThanOrEqual(16)
  expect(evidence.region.scrollHeight).toBeGreaterThan(evidence.region.clientHeight)
  expect(evidence.overflowY).toBe('auto')
  expect(evidence.document.scrollWidth).toBe(evidence.document.clientWidth)
  expect(evidence.activeInsideToast).toBe(false)
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

const matrices = [
  { height: 844, locale: 'zh-CN', width: 390 },
  { height: 1080, locale: 'en', width: 1920 },
] as const

for (const matrix of matrices) {
  test.describe(`toast outcomes at ${matrix.width}x${matrix.height} (${matrix.locale})`, () => {
    test.use({ viewport: { height: matrix.height, width: matrix.width } })

    test('stacks, pauses, resumes, scrolls, and dismisses three real localized outcomes without stealing focus', async ({ page }, testInfo) => {
      test.setTimeout(60_000)
      const requests: RequestEvidence[] = []
      await installSettingsOutcomeFixtures(page, requests)
      if (matrix.locale === 'en') {
        await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: webUrl }])
      }
      await page.goto('/settings?team=team-runtime')
      const createTeamLabel = matrix.locale === 'en' ? 'Create team' : '新建团队'
      const createStateLabel = matrix.locale === 'en' ? 'Create status' : '新建状态'
      const deleteTeamLabel = matrix.locale === 'en' ? 'Delete team' : '删除团队'
      const teamNameLabel = matrix.locale === 'en' ? 'Team name' : '团队名称'
      const teamKeyLabel = matrix.locale === 'en' ? 'Team key' : '团队标识'
      const stateNameLabel = matrix.locale === 'en' ? 'Status name' : '状态名称'
      const longTeamName = matrix.locale === 'en'
        ? 'Runtime reliability wide and narrow notification geometry with localized operational evidence '.repeat(5).trim()
        : '运行可靠性宽屏与窄屏通知几何和本地化操作证据'.repeat(8)
      const longStateName = matrix.locale === 'en'
        ? 'Awaiting independent review with retained actionable context and deterministic focus recovery '.repeat(5).trim()
        : '等待独立审查并保留可操作上下文与确定性焦点恢复'.repeat(8)

      const createTeam = page.locator('form').filter({ has: page.getByRole('button', { name: createTeamLabel }) })
      await expect(createTeam).toBeVisible()
      await createTeam.getByRole('textbox', { name: teamNameLabel }).fill(longTeamName)
      await createTeam.getByRole('textbox', { name: teamKeyLabel }).fill('LONG')
      const createTeamSubmit = createTeam.getByRole('button', { name: createTeamLabel })
      await createTeamSubmit.focus()
      const focusBeforeTeam = await activeIdentity(page)
      await page.keyboard.press('Enter')
      await expect(page.locator('.wm-toast')).toHaveCount(1)
      const focusAfterTeam = await activeIdentity(page)
      expect(focusAfterTeam).toEqual(focusBeforeTeam)
      await expect(createTeamSubmit).toBeFocused()
      await pauseToast(page.locator('.wm-toast').nth(0))
      await expect.poll(() => new URL(page.url()).searchParams.get('team')).toBe('team-long-outcome')

      const createState = page.locator('.workflow-state-create-form')
      await expect(createState).toBeVisible()
      await createState.getByRole('textbox', { name: stateNameLabel }).fill(longStateName)
      const createStateSubmit = createState.getByRole('button', { name: createStateLabel })
      await createStateSubmit.focus()
      const focusBeforeState = await activeIdentity(page)
      await page.keyboard.press('Enter')
      await expect(page.locator('.wm-toast')).toHaveCount(2)
      const focusAfterState = await activeIdentity(page)
      expect(focusAfterState).toEqual(focusBeforeState)
      await expect(createStateSubmit).toBeFocused()
      await pauseToast(page.locator('.wm-toast').nth(1))

      const deleteTeam = page.getByRole('button', { name: deleteTeamLabel })
      await deleteTeam.focus()
      await page.keyboard.press('Enter')
      const dialog = page.locator('.delete-team-dialog')
      await expect(dialog).toBeVisible()
      const modalLayering = await page.evaluate(() => {
        const toastViewport = document.querySelector<HTMLElement>('.wm-toast-viewport')
        const overlay = document.querySelector<HTMLElement>('.wm-overlay')
        if (!toastViewport || !overlay) throw new Error('Modal/toast layering probe missing')
        return {
          overlayZ: Number(window.getComputedStyle(overlay).zIndex),
          toastInert: Boolean(toastViewport.closest('[inert]')),
          toastZ: Number(window.getComputedStyle(toastViewport).zIndex),
        }
      })
      expect(modalLayering.toastInert).toBe(true)
      expect(modalLayering.toastZ).toBeLessThan(modalLayering.overlayZ)
      const confirm = dialog.locator('.wm-button-danger')
      await confirm.focus()
      await page.keyboard.press('Enter')
      await expect(dialog).toHaveCount(0)
      await expect(page.locator('.wm-toast')).toHaveCount(3)
      const focusAfterDelete = await activeIdentity(page)
      const expectedDeleteFocus = matrix.width === 1920
        ? { identity: 'Current team', tag: 'select' }
        : { identity: 'team-settings-heading', tag: 'h2' }
      expect(focusAfterDelete).toMatchObject({ connected: true, insideToast: false, visible: true, ...expectedDeleteFocus })
      if (matrix.width === 1920) {
        await expect(page.getByRole('combobox', { name: 'Current team' })).toBeFocused()
      } else {
        await expect(page.locator('#team-settings-heading')).toBeFocused()
      }
      await pauseToast(page.locator('.wm-toast').nth(2))

      const initial = await stackEvidence(page)
      assertStackGeometry(initial)
      await persistEvidence(page, testInfo, `toast-stack-${matrix.width}x${matrix.height}-${matrix.locale}`, {
        focus: {
          afterDelete: focusAfterDelete,
          afterState: focusAfterState,
          afterTeam: focusAfterTeam,
          beforeState: focusBeforeState,
          beforeTeam: focusBeforeTeam,
        },
        geometry: initial,
        locale: matrix.locale,
        modalLayering,
        requests,
        url: page.url(),
      })
      const scrolled = await page.locator('.wm-toast-viewport').evaluate(element => {
        if (!(element instanceof HTMLElement)) throw new Error('Toast viewport missing')
        element.scrollTop = element.scrollHeight
        return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }
      })
      expect(scrolled.scrollTop).toBeGreaterThan(0)
      await persistEvidence(page, testInfo, `toast-stack-scrolled-${matrix.width}x${matrix.height}-${matrix.locale}`, {
        geometry: initial,
        localScroll: scrolled,
        locale: matrix.locale,
        modalLayering,
        requests,
        url: page.url(),
      })

      await page.waitForTimeout(5_200)
      await expect(page.locator('.wm-toast')).toHaveCount(3)
      await createTeamSubmit.focus()
      const focusBeforeExpiry = await activeIdentity(page)
      await resumeToast(page.locator('.wm-toast').nth(2))
      await page.waitForTimeout(5_200)
      await expect(page.locator('.wm-toast')).toHaveCount(2)
      const focusAfterExpiry = await activeIdentity(page)
      expect(focusAfterExpiry).toEqual(focusBeforeExpiry)
      await expect(createTeamSubmit).toBeFocused()
      await persistEvidence(page, testInfo, `toast-expiry-focus-${matrix.width}x${matrix.height}-${matrix.locale}`, {
        after: focusAfterExpiry,
        before: focusBeforeExpiry,
        remainingToastCount: await page.locator('.wm-toast').count(),
      })

      const firstClose = page.locator('[data-toast-close-id]').nth(0)
      await firstClose.focus()
      await firstClose.click()
      await expect(page.locator('.wm-toast')).toHaveCount(1)
      await expect(page.locator('[data-toast-close-id]').first()).toBeFocused()
      const remainingClose = page.locator('[data-toast-close-id]').first()
      await remainingClose.click()
      await expect(page.locator('.wm-toast-viewport')).toHaveCount(0)
      expect((await activeIdentity(page)).insideToast).toBe(false)
    })
  })
}
