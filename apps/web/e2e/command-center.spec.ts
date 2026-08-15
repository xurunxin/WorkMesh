import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}
const team = { id: '7d13dccc-2210-44db-b030-76d56db1b998', name: 'General', key: 'GEN', revision: 1 }
const human = { id: '1ea95f79-9388-4418-bdd3-56a72871d70e', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }
const project = { id: '3f12de4f-b117-4a78-9e10-da102c892ae1', team_id: team.id, name: 'Kaneo UI Adoption', summary: 'Command search', status: 'Active', revision: 1 }
const workItem = { id: '11b3a703-1b3d-4886-bfe9-b9d4f082bdd4', title: 'Add authority-aware command palette', number: 6, team_key: 'GEN', project_id: project.id, status_name: 'In Progress', priority: 'medium' }

test('enforces the query threshold, names source failures, and supports keyboard navigation', async ({ page }) => {
  const resourceRequests: string[] = []
  let captureResourceRequests = false
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    const list = (items: unknown[]) => body({ items, nextCursor: null })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'preview-csrf' })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({ serverVersion: '1.0.0', buildSha: 'command-center-test', schemaBaseline: 24 })
    if (path === '/api/v1/teams') return list([team])
    if (path === `/api/v1/teams/${team.id}/states`) return list([{ id: 'state-backlog', name: 'Backlog', category: 'backlog', color: '#a8a29e', revision: 1 }])
    if (path === '/api/v1/actors/humans') return list([human])
    if (path === '/api/v1/views') return list([])
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    const isWorkSurfaceRequest = path === '/api/v1/work-items' && url.searchParams.get('mine') === 'true'
    if (captureResourceRequests && !isWorkSurfaceRequest && ['/api/v1/projects', '/api/v1/work-items', '/api/v1/agents', '/api/v1/agent-sessions', '/api/v1/inbox'].includes(path)) resourceRequests.push(route.request().url())
    if (path === '/api/v1/projects') return list([project])
    if (path === '/api/v1/work-items') return list([workItem])
    if (path === '/api/v1/agents') return body({ error: { code: 'RESOURCE_SCOPE_DENIED', message: 'Denied', correlationId: 'command-center-e2e' } }, 403)
    if (path === '/api/v1/agent-sessions') {
      expect(url.searchParams.get('teamId')).toBe(team.id)
      return list([])
    }
    if (path === '/api/v1/inbox') return list([])
    return body({ error: { code: 'NOT_FOUND', message: `Unexpected ${path}`, correlationId: 'command-center-e2e' } }, 404)
  })

  await page.goto('/?view=my-work')
  const trigger = page.getByTestId('command-center-trigger')
  await expect(trigger).toBeVisible()
  captureResourceRequests = true
  await trigger.click()
  const search = page.getByRole('combobox', { name: 'Search WorkMesh' })
  await expect(search).toBeFocused()
  await expect(page.getByRole('status')).toContainText('Type at least one character')
  expect(resourceRequests).toEqual([])

  await search.fill('GEN-6')
  await expect(page.getByRole('option', { name: /Add authority-aware command palette/ })).toBeVisible()
  await expect(page.getByLabel('Search source status')).toContainText('Agents is unavailable for this actor.')
  await expect(page.getByLabel('Search source status')).toContainText('Agent sessions has no matching results.')
  expect(resourceRequests.some(value => value.includes(`/agent-sessions?teamId=${team.id}`))).toBe(true)

  await search.press('ArrowDown')
  await search.press('Escape')
  await expect(search).not.toBeVisible()
  await expect(trigger).toBeFocused()

  const workSearch = page.getByRole('textbox', { name: 'Search work' })
  await workSearch.focus()
  await workSearch.press('Control+k')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await trigger.press('Control+k')
  await expect(page.getByRole('dialog')).toBeVisible()
})
