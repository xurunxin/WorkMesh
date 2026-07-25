import { expect, test } from '@playwright/test'

const apiUrl = 'http://127.0.0.1:3101'
const headers = { 'Access-Control-Allow-Origin': 'http://127.0.0.1:3100', 'Access-Control-Allow-Credentials': 'true', 'Content-Type': 'application/json' }

test('renders the Stage 3 fake-provider delivery shelf without auto-closing work', async ({ page }) => {
  const actor = { id: 'human-1', displayName: 'Alex' }
  const project = { id: 'project-1', team_id: 'team-1', name: 'Git delivery', summary: 'Exact-head delivery', description: null, status: 'planned', lead_actor_id: actor.id, target_date: null, revision: 1 }
  const workItem = { id: 'work-1', title: 'Deliver exact-head PR', description: null, number: 42, revision: 3, status_id: 'state-started', status_name: 'In progress', status_category: 'started', team_id: 'team-1', team_key: 'ENG', priority: 'high', due_date: null, responsible_human_actor_id: actor.id, labels: [], project_id: project.id }
  await page.route(`${apiUrl}/api/v1/**`, async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const body = (payload: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(payload) })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === '/api/v1/install-status') return body({ installed: true })
    if (path === '/api/v1/auth/me') return body({ actor, csrfToken: 'stage3-csrf' })
    if (path === '/api/v1/teams') return body([{ id: 'team-1', name: 'Engineering', key: 'ENG', revision: 1 }])
    if (path === '/api/v1/actors/humans') return body([{ id: actor.id, display_name: 'Alex', email: 'alex@example.test' }])
    if (path === '/api/v1/projects') return body([project])
    if (path === '/api/v1/projects/project-1') return body(project)
    if (path === '/api/v1/projects/project-1/delivery') return body({
      milestones: [{ id: 'milestone-1', name: 'Git Delivery', total: 1, completed: 0, target_date: null }],
      updates: [{ id: 'update-1', health: 'on_track', body: 'PR checks and structured review passed.', status: 'published', created_at: '2026-07-24T00:00:00Z' }],
      artifacts: [
        { id: 'artifact-commit', type: 'commit', title: 'abc123', uri: 'https://example.test/commit/abc123', checksum: `sha256:${'a'.repeat(64)}` },
        { id: 'artifact-pr', type: 'pull_request', title: 'PR 42', uri: 'https://example.test/pull/42', checksum: `sha256:${'b'.repeat(64)}` },
        { id: 'artifact-test', type: 'test_report', title: 'pnpm test', uri: null, checksum: `sha256:${'c'.repeat(64)}` },
        { id: 'artifact-js', type: 'test_report', title: 'unsafe javascript URL', uri: 'javascript:alert(1)', checksum: `sha256:${'d'.repeat(64)}` },
        { id: 'artifact-data', type: 'test_report', title: 'unsafe data URL', uri: 'data:text/html,unsafe', checksum: `sha256:${'e'.repeat(64)}` },
        { id: 'artifact-userinfo', type: 'test_report', title: 'unsafe credential URL', uri: 'https://user:password@example.test/report', checksum: `sha256:${'f'.repeat(64)}` },
      ],
      dependencies: [{
        depends_on_project_id: 'project-platform',
        depends_on_project_name: 'Platform readiness',
        depends_on_project_status: 'at_risk',
      }],
      completionSuggestions: [{ id: 'suggestion-1', rationale: 'Pull request merged at the human-approved exact head.', status: 'open', revision: 1 }],
      providerPullRequests: [{
        id: 'provider-pr-42', provider: 'github', number: 42, state: 'open',
        headSha: 'abc123', headBranch: 'workmesh/ENG-42-delivery', uri: 'https://example.test/pull/42',
        provenance: { source: 'provider_webhook', sourceId: 'delivery-42' },
        checks: [{
          name: 'test', status: 'passed', required: true, headSha: 'abc123',
          detailsUrl: 'https://example.test/check/42',
          provenance: { source: 'provider_webhook', sourceId: 'check-delivery-42' },
        }],
      }],
      providerReviews: [{
        pullRequestId: 'provider-pr-42', state: 'approved', headSha: 'abc123',
        author: { providerId: 'provider-user-7', login: 'octo-reviewer' },
        uri: 'https://example.test/pull/42#review-7',
        provenance: { source: 'provider_webhook', sourceId: 'review-delivery-42' },
        authority: 'provider_observation',
      }],
      workMeshStructuredReviews: [{
        pullRequestId: 'provider-pr-42', verdict: 'approved', headSha: 'abc123',
        reviewerActorId: actor.id, artifactId: 'artifact-test',
        summary: 'One scoped recommendation; no blocking findings.',
        authority: 'workmesh_structured_review',
        findings: [{
          severity: 'medium',
          file: 'apps/api/src/routes/delivery.ts',
          line: 42,
          summary: 'Preserve exact-head evidence in the audit event.',
          evidence: 'The provider observation and approval both reference abc123.',
          recommendation: 'Keep the exact head SHA in the merge event payload.',
        }],
      }],
      mergeApprovals: [{
        approvalId: 'approval-42',
        provider: 'github',
        repository: 'metronx/workmesh-stage3-test',
        pullRequestId: 'provider-pr-42',
        pullRequestNumber: 42,
        headSha: 'abc123',
        method: 'squash',
        status: 'approved',
        invalidatedAt: null,
        invalidationReason: null,
      }],
    })
    if (path === '/api/v1/completion-suggestions/suggestion-1/decision' && route.request().method() === 'POST')
      return body({ id: 'suggestion-1', rationale: 'Pull request merged at the human-approved exact head.', status: 'accepted', revision: 2 })
    if (path === '/api/v1/views') return body([])
    if (path === '/api/v1/teams/team-1/states') return body([{ id: 'state-started', name: 'In progress', category: 'started', color: '#2563eb', revision: 1 }])
    if (path === '/api/v1/work-items') return body([workItem])
    if (path === '/api/v1/events/stream') return route.fulfill({ status: 204, headers })
    return body({ error: { message: `Unexpected ${route.request().method()} ${path}` } }, 404)
  })

  await page.goto('/')
  await page.getByTestId('view-projects').click()
  await page.getByTestId('project-project-1').click()
  const delivery = page.getByTestId('project-delivery')
  await expect(delivery).toContainText('Git Delivery')
  await expect(delivery).toContainText('0/1 · 0%')
  await expect(delivery).toContainText('commit')
  await expect(delivery).toContainText('pull_request')
  await expect(delivery).toContainText('test_report')
  await expect(delivery).toContainText('Agent evidence')
  await expect(delivery).toContainText('Provider-confirmed state')
  await expect(delivery).toContainText('github PR #42 · open')
  await expect(delivery).toContainText('required check test: passed')
  await expect(delivery).toContainText('Provider review observation: approved by octo-reviewer at abc123; not WorkMesh merge authority.')
  await expect(delivery).toContainText('WorkMesh structured review authority: approved at abc123')
  await expect(delivery).toContainText('medium: apps/api/src/routes/delivery.ts:42')
  await expect(delivery).toContainText('Evidence: The provider observation and approval both reference abc123.')
  await expect(delivery).toContainText('Recommendation: Keep the exact head SHA in the merge event payload.')
  const mergeApproval = delivery.getByTestId('merge-approval-card')
  await expect(mergeApproval).toContainText('github')
  await expect(mergeApproval).toContainText('metronx/workmesh-stage3-test')
  await expect(mergeApproval).toContainText('PR #42')
  await expect(mergeApproval).toContainText('Head: abc123')
  await expect(mergeApproval).toContainText('Method: squash')
  await expect(mergeApproval).toContainText('Status: approved')
  await expect(delivery).toContainText('Project dependencies')
  await expect(delivery).toContainText('Depends on: Platform readiness')
  await expect(delivery).toContainText('State: at_risk')
  await expect(delivery.locator('a[href^="javascript:"]')).toHaveCount(0)
  await expect(delivery.locator('a[href^="data:"]')).toHaveCount(0)
  await expect(delivery.locator('a[href*="user:password@"]')).toHaveCount(0)
  await expect(delivery).toContainText('PR checks and structured review passed.')
  await expect(delivery).toContainText('Decision only; the work item remains unchanged until a human workflow transition.')
  await delivery.getByRole('button', { name: 'Accept suggestion' }).click()
  await expect(delivery).toContainText('accepted')
  await expect(delivery.getByRole('button', { name: 'Accept suggestion' })).toHaveCount(0)
  await expect(page.getByTestId('work-work-1')).toContainText('In progress')
})
