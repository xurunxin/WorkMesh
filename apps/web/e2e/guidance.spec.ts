import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:3100',
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
}
const workspaceId = '00000000-0000-4000-8000-000000000101'
const teamId = '00000000-0000-4000-8000-000000000102'
const projectId = '00000000-0000-4000-8000-000000000103'
const authorId = '00000000-0000-4000-8000-000000000104'
const revision1 = { id: '00000000-0000-4000-8000-000000000105', revisionNumber: 1, contentHash: `sha256:${'a'.repeat(64)}`, changeSummary: 'Initial Guidance', authorActorId: authorId, authorDisplayName: 'Guidance admin', publishedAt: '2026-08-01T00:00:00.000Z' }
const revision2 = { id: '00000000-0000-4000-8000-000000000106', revisionNumber: 2, contentHash: `sha256:${'b'.repeat(64)}`, changeSummary: 'Reviewed Guidance', authorActorId: authorId, authorDisplayName: 'Guidance admin', publishedAt: '2026-08-02T00:00:00.000Z' }

test('manages versioned Guidance while keeping Project description separate', async ({ page }) => {
  let workspace = { scope: 'workspace', scopeId: workspaceId, documentId: '00000000-0000-4000-8000-000000000107', status: 'active', revision: 2, currentRevision: revision2, markdown: '# Workspace\n\nReviewed instructions.', updatedAt: revision2.publishedAt }
  const mutations: Array<{ path: string; ifMatch: string | undefined; body: unknown }> = []
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor: { id: authorId, displayName: 'Guidance admin', workspace_id: workspaceId }, csrfToken: 'guidance-csrf' })
    if (path === '/api/v1/features') return body({ features: [] })
    if (path === '/api/v1/info') return body({ serverVersion: '1.0.0', buildSha: 'guidance-e2e', schemaBaseline: 1 })
    if (path === '/api/v1/teams') return body({ items: [{ id: teamId, name: 'Guided Team', key: 'GUIDE', revision: 1 }], nextCursor: null })
    if (path === `/api/v1/teams/${teamId}/states` || path === '/api/v1/actors/humans' || path === '/api/v1/views' || path === '/api/v1/work-items') return body({ items: [], nextCursor: null })
    if (path === '/api/v1/projects') return body({ items: [{ id: projectId, team_id: teamId, name: 'Guided Project', summary: null, description: 'This is product context, not agent Guidance.', status: 'planned', lead_actor_id: null, target_date: null, revision: 1 }], nextCursor: null })
    if (path === `/api/v1/workspaces/${workspaceId}/guidance/history`) return body({ scope: 'workspace', scopeId: workspaceId, documentId: workspace.documentId, revision: workspace.revision, status: workspace.status, currentRevisionId: workspace.currentRevision?.id ?? null, revisions: [revision2, revision1], audit: [{ id: '00000000-0000-4000-8000-000000000108', action: 'published', fromRevisionId: revision1.id, toRevisionId: revision2.id, actorId: authorId, actorDisplayName: 'Guidance admin', reason: 'Reviewed Guidance', createdAt: revision2.publishedAt }] })
    if (path === `/api/v1/workspaces/${workspaceId}/guidance/diff`) return body({ scope: 'workspace', scopeId: workspaceId, from: revision1, to: revision2, changes: [{ kind: 'removed', oldLine: 2, newLine: null, text: 'Initial instructions.' }, { kind: 'added', oldLine: null, newLine: 2, text: 'Reviewed instructions.' }] })
    if (path === `/api/v1/workspaces/${workspaceId}/guidance` && request.method() === 'GET') return body(workspace)
    if (path === `/api/v1/workspaces/${workspaceId}/guidance` && request.method() === 'PUT') {
      mutations.push({ path, ifMatch: request.headers()['if-match'], body: request.postDataJSON() })
      workspace = { ...workspace, revision: 3, markdown: '# Workspace\n\nPublished from Web.', currentRevision: { ...revision2, id: '00000000-0000-4000-8000-000000000109', revisionNumber: 3, changeSummary: 'Web publication' } }
      return body(workspace)
    }
    if (path === `/api/v1/workspaces/${workspaceId}/guidance/archive`) {
      mutations.push({ path, ifMatch: request.headers()['if-match'], body: request.postDataJSON() })
      workspace = { ...workspace, revision: 4, status: 'archived', markdown: '' }
      return body(workspace)
    }
    if (path === `/api/v1/projects/${projectId}/guidance`) return body({ scope: 'project', scopeId: projectId, documentId: null, status: 'unpublished', revision: 0, currentRevision: null, markdown: '', updatedAt: '2026-08-03T00:00:00.000Z' })
    if (path === `/api/v1/projects/${projectId}/guidance/history`) return body({ scope: 'project', scopeId: projectId, documentId: null, revision: 0, status: 'unpublished', currentRevisionId: null, revisions: [], audit: [] })
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${request.method()} ${path}` } }, 404)
  })

  await page.goto('/')
  await page.getByTestId('view-guidance').click()
  await expect(page.getByTestId('guidance-panel')).toContainText('Reviewed Guidance')
  await page.getByTestId('guidance-markdown').fill('# Workspace\n\nPublished from Web.')
  await page.getByTestId('guidance-change-summary').fill('Web publication')
  await page.getByTestId('publish-guidance').click()
  await expect.poll(() => mutations.length).toBe(1)
  expect(mutations[0]).toEqual({ path: `/api/v1/workspaces/${workspaceId}/guidance`, ifMatch: '"revision-2"', body: { markdown: '# Workspace\n\nPublished from Web.', changeSummary: 'Web publication' } })

  await page.getByLabel('From Guidance revision').selectOption(revision1.id)
  await page.getByLabel('To Guidance revision').selectOption(revision2.id)
  await page.getByRole('button', { name: 'Show diff' }).click()
  await expect(page.getByTestId('guidance-diff')).toContainText('+ Reviewed instructions.')
  await page.getByPlaceholder('Required for archive or rollback').fill('Retire current instructions')
  await page.getByRole('button', { name: 'Archive current Guidance' }).click()
  await expect.poll(() => mutations.length).toBe(2)
  expect(mutations[1]).toEqual({ path: `/api/v1/workspaces/${workspaceId}/guidance/archive`, ifMatch: '"revision-3"', body: { reason: 'Retire current instructions' } })

  await page.getByLabel('Guidance scope').selectOption('project')
  await expect(page.getByText('Project description (not Guidance)')).toBeVisible()
  await expect(page.getByText('This is product context, not agent Guidance.')).toBeVisible()
  await expect(page.getByTestId('guidance-markdown')).toHaveValue('')
})
