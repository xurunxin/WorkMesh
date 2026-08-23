import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

const team = { id: 'team-page', name: 'Pagination team', key: 'PAGE', revision: 1 }
const state = { id: 'state-page', name: 'Ready', category: 'planned', color: '#64748b', revision: 1 }
const workItem = (id: string, title: string, number: number) => ({
  id,
  title,
  description: null,
  number,
  revision: 1,
  status_id: state.id,
  status_name: state.name,
  status_category: state.category,
  team_id: team.id,
  team_key: team.key,
  priority: 'medium',
  due_date: null,
  responsible_human_actor_id: 'human-page',
  labels: [],
  project_id: null,
})

test('loads an opaque second page, de-duplicates it, and resets on filter change', async ({ page }) => {
  const workRequests: URL[] = []
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({
      actor: { id: 'human-page', displayName: 'Pagination human' },
      csrfToken: 'pagination-csrf',
    })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({
      serverVersion: '1.0.0',
      buildSha: 'pagination-e2e',
      schemaBaseline: 24,
    })
    if (path === '/api/v1/teams') return body({ items: [team], nextCursor: null })
    if (path === `/api/v1/teams/${team.id}/states`)
      return body({ items: [state], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({
      items: [{ id: 'human-page', display_name: 'Pagination human', email: 'human@example.test' }],
      nextCursor: null,
    })
    if (path === '/api/v1/projects' || path === '/api/v1/views')
      return body({ items: [], nextCursor: null })
    if (path === '/api/v1/work-items') {
      workRequests.push(url)
      if (url.searchParams.get('search') === 'Slow') {
        await new Promise(resolve => setTimeout(resolve, 350))
        return body({
          items: [workItem('work-stale', 'Stale slow response', 4)],
          nextCursor: null,
        }).catch(() => undefined)
      }
      if (url.searchParams.get('search'))
        return body({ items: [workItem('work-filtered', 'Filtered result', 3)], nextCursor: null })
      if (url.searchParams.get('cursor') === 'opaque-work-page-2')
        return body({
          items: [
            workItem('work-first', 'First page refreshed', 1),
            workItem('work-later', 'Only on the second page', 2),
          ],
          nextCursor: null,
        })
      return body({
        items: [workItem('work-first', 'First page record', 1)],
        nextCursor: 'opaque-work-page-2',
      })
    }
    if (path === '/api/v1/events/stream')
      return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${route.request().method()} ${path}` } }, 404)
  })

  await page.goto('/')
  await expect(page.locator('[data-work-item-id="work-first"]')).toBeVisible()
  await expect(page.locator('[data-work-item-id="work-later"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Load more work items' }).click()
  await expect(page.locator('[data-work-item-id="work-later"]')).toContainText('Only on the second page')
  await expect(page.locator('[data-work-item-id="work-first"]')).toHaveCount(1)

  const continuation = workRequests.find(request =>
    request.searchParams.get('cursor') === 'opaque-work-page-2')
  expect(continuation?.searchParams.get('limit')).toBe('100')
  expect(continuation?.searchParams.get('teamId')).toBe(team.id)
  expect(continuation?.searchParams.has('mine')).toBe(false)

  const search = page.getByRole('textbox', { name: 'Search', exact: true })
  await search.fill('Slow')
  await expect.poll(() => workRequests.some(request =>
    request.searchParams.get('search') === 'Slow')).toBe(true)
  await search.fill('Filtered')
  await expect(page.locator('[data-work-item-id="work-filtered"]')).toBeVisible()
  await expect(page.locator('[data-work-item-id="work-later"]')).toHaveCount(0)
  await page.waitForTimeout(450)
  await expect(page.locator('[data-work-item-id="work-stale"]')).toHaveCount(0)
  const filtered = workRequests.find(request => request.searchParams.get('search') === 'Filtered')
  expect(filtered?.searchParams.has('cursor')).toBe(false)
})

test('isolates changed scopes immediately while retaining same-scope refresh content', async ({ page }) => {
  let refreshTriggered = false
  let oldCursorRequests = 0
  let newCursorRequests = 0
  let sameScopeRefreshPending = false
  let changedScopePending = false
  let releaseSameScopeRefresh = () => {}
  let releaseChangedScope = () => {}
  const sameScopeRefreshGate = new Promise<void>(resolve => { releaseSameScopeRefresh = resolve })
  const changedScopeGate = new Promise<void>(resolve => { releaseChangedScope = resolve })

  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({
      actor: { id: 'human-page', displayName: 'Pagination human' },
      csrfToken: 'pagination-csrf',
    })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({
      serverVersion: '1.0.0',
      buildSha: 'pagination-scope-e2e',
      schemaBaseline: 24,
    })
    if (path === '/api/v1/teams') return body({ items: [team], nextCursor: null })
    if (path === `/api/v1/teams/${team.id}/states`)
      return body({ items: [state], nextCursor: null })
    if (path === '/api/v1/actors/humans') return body({
      items: [{ id: 'human-page', display_name: 'Pagination human', email: 'human@example.test' }],
      nextCursor: null,
    })
    if (path === '/api/v1/projects' || path === '/api/v1/views')
      return body({ items: [], nextCursor: null })
    if (path === '/api/v1/work-items') {
      if (route.request().method() === 'POST') {
        refreshTriggered = true
        return body(workItem('work-created', 'Refresh trigger', 2))
      }
      if (url.searchParams.get('cursor') === 'scope-a-old-cursor') {
        oldCursorRequests += 1
        return body({
          items: [workItem('work-stale-cursor', 'Loaded from stale cursor', 3)],
          nextCursor: null,
        })
      }
      if (url.searchParams.get('cursor') === 'scope-a-new-cursor') {
        newCursorRequests += 1
        return body({
          items: [workItem('work-new-cursor', 'Loaded from refreshed cursor', 4)],
          nextCursor: 'scope-a-after-load-more',
        })
      }
      if (url.searchParams.get('search') === 'Scope B') {
        changedScopePending = true
        await changedScopeGate
        return body({
          items: [workItem('work-scope-b', 'Scope B result', 2)],
          nextCursor: null,
        })
      }
      if (url.searchParams.get('teamId') === team.id) {
        if (refreshTriggered) {
          sameScopeRefreshPending = true
          await sameScopeRefreshGate
          return body({
            items: [workItem('work-scope-a', 'Scope A refreshed', 1)],
            nextCursor: 'scope-a-new-cursor',
          })
        }
      }
      return body({
        items: [workItem('work-scope-a', 'Scope A result', 1)],
        nextCursor: 'scope-a-old-cursor',
      })
    }
    if (path === '/api/v1/events/stream')
      return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${route.request().method()} ${path}` } }, 404)
  })

  await page.goto('/')
  await expect(page.locator('[data-work-item-id="work-scope-a"]')).toContainText('Scope A result')

  await page.getByRole('button', { name: 'New issue', exact: true }).click()
  const form = page.getByTestId('create-work-item')
  await form.getByLabel('Title', { exact: true }).fill('Refresh trigger')
  await form.getByTestId('create-work-item-submit').click()
  await expect.poll(() => sameScopeRefreshPending).toBe(true)
  await expect(page.locator('[data-work-item-id="work-scope-a"]')).toContainText('Scope A result')
  const loadMore = page.locator('.wm-work-surface-pagination')
  await expect(loadMore).toBeVisible()
  await expect(loadMore).toBeDisabled()
  await expect(loadMore).toHaveText('Loading…')
  await loadMore.evaluate(element => {
    const button = element as HTMLButtonElement
    button.disabled = false
    button.click()
  })
  await page.waitForTimeout(100)
  expect(oldCursorRequests).toBe(0)
  releaseSameScopeRefresh()
  await expect(page.locator('[data-work-item-id="work-scope-a"]')).toContainText('Scope A refreshed')
  await expect(loadMore).toBeEnabled()
  await loadMore.click()
  await expect(page.locator('[data-work-item-id="work-new-cursor"]')).toContainText('Loaded from refreshed cursor')
  expect(oldCursorRequests).toBe(0)
  expect(newCursorRequests).toBe(1)

  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Scope B')
  await expect.poll(() => changedScopePending).toBe(true)
  await expect(page.locator('[data-work-item-id="work-scope-a"]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Load more work items' })).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Loading Issues' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No Work Items' })).toHaveCount(0)
  releaseChangedScope()
  await expect(page.locator('[data-work-item-id="work-scope-b"]')).toContainText('Scope B result')
})

test('makes a later Agent registry record reachable through explicit continuation', async ({ page }) => {
  const agentRequests: URL[] = []
  const agent = (id: string, name: string) => ({
    id,
    workspace_id: 'workspace-page',
    actor_id: `${id}-actor`,
    display_name: name,
    slug: id,
    description: `${name} description`,
    supported_protocols: ['native_http'],
    skills: [],
    requested_capabilities: [],
    approved_capabilities: [],
    max_concurrency: 1,
    is_active: true,
    revision: 1,
    team_access: [],
  })
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/auth/me') return body({
      actor: {
        id: 'human-agent-page',
        display_name: 'Agent operator',
        workspace_role: 'admin',
      },
      csrfToken: 'agent-page-csrf',
    })
    if (path === '/api/v1/agents') {
      agentRequests.push(url)
      return url.searchParams.get('cursor') === 'opaque-agent-page-2'
        ? body({ items: [agent('agent-later', 'Later Agent')], nextCursor: null })
        : body({ items: [agent('agent-first', 'First Agent')], nextCursor: 'opaque-agent-page-2' })
    }
    if (path === '/api/v1/teams'
      || path === '/api/v1/agent-sessions'
      || path === '/api/v1/approvals')
      return body({ items: [], nextCursor: null })
    if (path === '/api/v1/events/stream')
      return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${route.request().method()} ${path}` } }, 404)
  })

  await page.goto('/agents')
  await expect(page.getByTestId('agent-registry-agent-first')).toBeVisible()
  await expect(page.getByTestId('agent-registry-agent-later')).toHaveCount(0)
  await page.getByTestId('load-more-agents').click()
  await expect(page.getByTestId('agent-registry-agent-later')).toContainText('Later Agent')
  expect(agentRequests.some(request =>
    request.searchParams.get('cursor') === 'opaque-agent-page-2'
      && request.searchParams.get('limit') === '100')).toBe(true)
})
