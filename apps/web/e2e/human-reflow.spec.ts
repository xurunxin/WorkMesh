import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const evidenceRoot = 'D:\\Cache\\Temp\\workmesh-web-ui-evidence-2026-08-23\\task-6.5'
const team = { id: '7d13dccc-2210-44db-b030-76d56db1b998', name: 'WorkMesh Product', key: 'WM', revision: 1 }
const human = { id: '1ea95f79-9388-4418-bdd3-56a72871d70e', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }
const project = {
  id: '3f12de4f-b117-4a78-9e10-da102c892ae1', team_id: team.id, name: 'Kaneo UI Adoption',
  summary: 'Responsive dogfood plan', description: `Validate the evidence at https://example.test/${'long-unbroken-project-evidence-segment-'.repeat(18)}/artifact`,
  status: 'in_progress', lead_actor_id: human.id, target_date: '2026-09-15', revision: 4,
}
const projects = [
  project,
  { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae2', name: 'A very long secondary planning project name' },
  { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae3', name: 'Another long project for local rail scrolling' },
  { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae4', name: 'Operations reliability acceptance' },
  { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae5', name: 'Agent collaboration interaction polish' },
  { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae6', name: 'Human workflow responsive recovery' },
]
const viewports = [
  { width: 320, height: 800 }, { width: 375, height: 812 }, { width: 390, height: 844 },
  { width: 760, height: 900 }, { width: 761, height: 900 }, { width: 768, height: 1024 },
  { width: 1440, height: 900 }, { width: 1440, height: 1000 }, { width: 1920, height: 1080 },
] as const

function responseHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, if-match, idempotency-key, x-csrf-token',
    'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST',
    'Content-Type': 'application/json',
  }
}

async function installRoutes(page: Page): Promise<string[]> {
  const unexpected: string[] = []
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const headers = responseHeaders(route)
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const url = new URL(request.url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    const list = (items: unknown[]) => body({ items, nextCursor: null })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'reflow-fixture' })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({ serverVersion: '1.0.0', buildSha: 'reflow-fixture', schemaBaseline: 24 })
    if (path === '/api/v1/teams') return list([team])
    if (path === `/api/v1/teams/${team.id}/states`) return list([{ id: 'f0000000-0000-4000-8000-000000000001', name: 'Backlog', category: 'backlog', color: '#a8a29e', revision: 1 }])
    if (path === '/api/v1/actors/humans') return list([human])
    if (path === '/api/v1/projects') return list(projects)
    const selectedProject = projects.find(candidate => path === `/api/v1/projects/${candidate.id}`)
    if (selectedProject) return body(selectedProject)
    const controlCenterProject = projects.find(candidate => path === `/api/v1/projects/${candidate.id}/control-center`)
    if (controlCenterProject) {
      const empty = { items: [], nextCursor: null }
      return body({
        projectionVersion: 1,
        scope: { workspaceId: 'workspace-preview', projectId: controlCenterProject.id },
        project: { id: controlCenterProject.id, name: controlCenterProject.name, status: controlCenterProject.status, targetDate: controlCenterProject.target_date, responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' }, revision: controlCenterProject.revision },
        revision: controlCenterProject.revision,
        freshness: { state: 'fresh', observedAt: '2026-08-26T00:00:00.000Z', sourceUpdatedAt: '2026-08-26T00:00:00.000Z' },
        collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
      })
    }
    const projectId = path.match(/^\/api\/v1\/projects\/([^/]+)\/(milestones|delivery)$/)?.[1]
    if (projectId && path.endsWith('/milestones')) return list([])
    if (projectId && path.endsWith('/delivery')) return body({ milestones: [], updates: [], artifacts: [], dependencies: [], completionSuggestions: [], providerPullRequests: [], providerReviews: [], workMeshStructuredReviews: [], mergeApprovals: [] })
    if (path === '/api/v1/views' || path === '/api/v1/work-items') return list([])
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    const key = `${request.method()} ${path}${url.search}`
    unexpected.push(key)
    return body({ error: { code: 'UNEXPECTED_MOCK_REQUEST', message: 'Unexpected mocked request.', correlationId: 'reflow-fixture' } }, 500)
  })
  return unexpected
}

async function persistEvidence(page: Page, testInfo: TestInfo, name: string, geometry: unknown): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true })
  const jsonPath = join(evidenceRoot, `${name}.json`)
  const screenshotPath = join(evidenceRoot, `${name}.png`)
  await writeFile(jsonPath, JSON.stringify(geometry, null, 2), 'utf8')
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach(name, { path: jsonPath, contentType: 'application/json' })
  await testInfo.attach(`${name}-screenshot`, { path: screenshotPath, contentType: 'image/png' })
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Missing ${selector}`)
      const value = element.getBoundingClientRect()
      return { bottom: value.bottom, clientHeight: element.clientHeight, clientWidth: element.clientWidth, height: value.height, left: value.left, right: value.right, scrollHeight: element.scrollHeight, scrollWidth: element.scrollWidth, top: value.top, width: value.width }
    }
    const visible = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(element => {
      const value = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && value.width > 0 && value.height > 0
    }).length
    const rail = document.querySelector<HTMLElement>('.project-rail')
    const railList = document.querySelector<HTMLElement>('.project-rail-list')
    if (!rail || !railList) throw new Error('Missing project rail')
    return {
      body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth }, content: read('.content'),
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      main: read('#workmesh-main'), navigation: { mobile: visible('.mobile-navigation'), sidebar: visible('.app-sidebar') },
      shell: read('.app-shell'),
      rail: { ...read('.project-rail'), display: getComputedStyle(rail).display },
      railList: { ...read('.project-rail-list'), display: getComputedStyle(railList).display, overflowX: getComputedStyle(railList).overflowX, overflowY: getComputedStyle(railList).overflowY },
      workspace: read('.app-workspace'),
    }
  })
}

async function tabToProjectAction(page: Page): Promise<{ height: number; left: number; right: number; top: number; width: number } | null> {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  for (let index = 0; index < 48; index += 1) {
    await page.keyboard.press('Tab')
    const action = await page.evaluate(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !active.matches('#workmesh-main .project-rail button')) return null
      const value = active.getBoundingClientRect()
      return { height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
    })
    if (action) return action
  }
  return null
}

for (const viewport of viewports) {
  test(`project rail and shell reflow at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const unexpected = await installRoutes(page)
    await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: String(testInfo.project.use.baseURL) }])
    await page.goto('/?view=projects', { waitUntil: 'domcontentloaded' })
    const rail = page.getByRole('complementary', { name: 'Projects' })
    const railList = page.locator('.project-rail-list')
    await expect(rail).toBeVisible()

    const geometry = await measure(page)
    expect(geometry.document.scrollWidth).toBeLessThanOrEqual(geometry.document.clientWidth)
    expect(geometry.body.scrollWidth).toBeLessThanOrEqual(geometry.body.clientWidth)
    expect(geometry.shell.scrollWidth).toBeLessThanOrEqual(geometry.shell.clientWidth)
    expect(geometry.workspace.scrollWidth).toBeLessThanOrEqual(geometry.workspace.clientWidth)
    expect(geometry.content.right).toBeLessThanOrEqual(viewport.width + .5)
    expect(geometry.main.width).toBeGreaterThan(0)
    expect(geometry.main.left).toBeGreaterThanOrEqual(-.5)
    expect(geometry.main.right).toBeLessThanOrEqual(viewport.width + .5)
    expect(geometry.navigation.mobile + geometry.navigation.sidebar).toBe(1)
    expect(geometry.navigation.mobile).toBe(viewport.width <= 760 ? 1 : 0)
    expect(geometry.navigation.sidebar).toBe(viewport.width <= 760 ? 0 : 1)
    expect(geometry.rail.display).toBe('flex')
    expect(geometry.rail.right).toBeLessThanOrEqual(viewport.width + .5)
    expect(geometry.rail.bottom).toBeLessThanOrEqual(viewport.height + .5)

    const projectAction = await tabToProjectAction(page)
    expect(projectAction).not.toBeNull()
    expect(projectAction!.width).toBeGreaterThan(0)
    expect(projectAction!.height).toBeGreaterThanOrEqual(viewport.width <= 760 ? 40 : 36)
    expect(projectAction!.left).toBeGreaterThanOrEqual(-.5)
    expect(projectAction!.right).toBeLessThanOrEqual(viewport.width + .5)

    if (geometry.railList.display === 'flex') {
      expect(geometry.railList.overflowX).toBe('auto')
      expect(geometry.railList.scrollWidth).toBeGreaterThan(geometry.railList.clientWidth)
      await railList.evaluate(element => { element.scrollLeft = element.scrollWidth })
      await expect.poll(() => railList.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
      await railList.evaluate(element => { element.scrollLeft = 0 })
    } else {
      expect(geometry.railList.display).toBe('grid')
      expect(geometry.railList.overflowY).toBe('auto')
    }

    if (viewport.width <= 760) {
      const controls = await page.locator('.mobile-navigation summary, #workmesh-main .page-actions .wm-button, .project-rail .wm-button, .mobile-navigation select').evaluateAll(elements => elements.flatMap(element => {
        const value = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return style.display === 'none' || style.visibility === 'hidden' || value.width === 0 || value.height === 0
          ? [] : [{ label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName, height: value.height, width: value.width }]
      }))
      expect(controls.length).toBeGreaterThan(0)
      expect(
        controls.filter(control => control.height < 40 || control.width < 40),
        'visible mobile controls smaller than 40px',
      ).toEqual([])
    }

    const child = rail.getByRole('button', { name: /secondary planning project/i })
    await child.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`project=${projects[1]!.id}`))
    await expect(page.getByRole('heading', { name: projects[1]!.name })).toBeVisible()

    const resolved = await measure(page)
    expect(resolved.document.scrollWidth).toBeLessThanOrEqual(resolved.document.clientWidth)
    if (viewport.width === 1920) {
      const leftMargin = resolved.content.left - resolved.workspace.left
      const rightMargin = resolved.workspace.right - resolved.content.right
      expect(Math.abs(resolved.content.width - resolved.workspace.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(2)
    }
    expect(unexpected).toEqual([])
    await persistEvidence(page, testInfo, `project-rail-${viewport.width}x${viewport.height}`, { initial: geometry, projectAction, resolved, unexpected })
  })
}
