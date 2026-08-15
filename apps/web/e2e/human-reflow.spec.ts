import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}

const team = { id: '7d13dccc-2210-44db-b030-76d56db1b998', name: 'WorkMesh Product', key: 'WM', revision: 1 }
const human = { id: '1ea95f79-9388-4418-bdd3-56a72871d70e', display_name: 'Alex Morgan', email: 'alex@workmesh.test' }
const project = {
  id: '3f12de4f-b117-4a78-9e10-da102c892ae1',
  team_id: team.id,
  name: 'Kaneo UI Adoption',
  summary: 'Responsive dogfood plan',
  description: `Validate the evidence at https://example.test/${'long-unbroken-project-evidence-segment-'.repeat(18)}/artifact`,
  status: 'in_progress',
  lead_actor_id: human.id,
  target_date: '2026-09-15',
  revision: 4,
}

test('keeps the project workspace inside narrow viewports while the project strip scrolls locally', async ({ page }) => {
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    const list = (items: unknown[]) => body({ items, nextCursor: null })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' }, csrfToken: 'preview-csrf' })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({ serverVersion: '1.0.0', buildSha: 'reflow-test', schemaBaseline: 24 })
    if (path === '/api/v1/teams') return list([team])
    if (path === `/api/v1/teams/${team.id}/states`) return list([{ id: 'f0000000-0000-4000-8000-000000000001', name: 'Backlog', category: 'backlog', color: '#a8a29e', revision: 1 }])
    if (path === '/api/v1/actors/humans') return list([human])
    if (path === '/api/v1/projects') return list([
      project,
      { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae2', name: 'A very long secondary planning project name' },
      { ...project, id: '3f12de4f-b117-4a78-9e10-da102c892ae3', name: 'Another long project for local strip scrolling' },
    ])
    if (path === `/api/v1/projects/${project.id}`) return body(project)
    if (path === '/api/v1/views' || path === '/api/v1/work-items') return list([])
    if (path === `/api/v1/projects/${project.id}/milestones`) return list([])
    if (path === `/api/v1/projects/${project.id}/delivery`) return body({ milestones: [], updates: [], artifacts: [], dependencies: [], completionSuggestions: [], providerPullRequests: [], providerReviews: [], workMeshStructuredReviews: [], mergeApprovals: [] })
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { code: 'NOT_FOUND', message: `Unexpected ${path}`, correlationId: 'reflow-e2e' } }, 404)
  })

  for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 800 }]) {
    await page.setViewportSize(viewport)
    await page.goto(`/?view=projects&project=${project.id}`)
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible()
    const overflow = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`Missing ${selector}`)
        return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, right: element.getBoundingClientRect().right }
      }
      return {
        document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
        body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth },
        workspace: read('.app-workspace'),
        content: read('.app-content'),
        strip: read('.project-strip'),
      }
    })
    expect(overflow.document.scrollWidth).toBeLessThanOrEqual(overflow.document.clientWidth)
    expect(overflow.body.scrollWidth).toBeLessThanOrEqual(overflow.body.clientWidth)
    expect(overflow.workspace.scrollWidth).toBeLessThanOrEqual(overflow.workspace.clientWidth)
    expect(overflow.content.scrollWidth).toBeLessThanOrEqual(overflow.content.clientWidth)
    expect(overflow.strip.right).toBeLessThanOrEqual(viewport.width)
    expect(overflow.strip.scrollWidth).toBeGreaterThan(overflow.strip.clientWidth)
  }
})
