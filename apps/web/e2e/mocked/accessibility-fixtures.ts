import { expect, type Locator, type Page, type Route } from '@playwright/test'

export const accessibilityWebUrl = 'http://127.0.0.1:3200'
const apiUrl = 'http://127.0.0.1:3201'

const ids = {
  agentOne: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  agentTwo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  agentActorOne: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  agentActorTwo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  approvalHistory: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  approvalPending: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  human: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  project: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  run: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
  session: '11111111-1111-4111-8111-111111111111',
  team: '22222222-2222-4222-8222-222222222222',
  teamTwo: '22222222-2222-4222-8222-222222222223',
  workItem: '33333333-3333-4333-8333-333333333333',
} as const

export const accessibilityIds = ids

const team = { id: ids.team, key: 'GEN', name: 'General', revision: 1 }
const teamTwo = { id: ids.teamTwo, key: 'OPS', name: 'Operations', revision: 1 }
const human = { id: ids.human, display_name: 'Alex Morgan', email: 'alex@example.test' }
const workflowStates = [
  { category: 'backlog', color: '#64748b', id: 'state-backlog', name: 'Backlog', revision: 1 },
  { category: 'planned', color: '#7c3aed', id: 'state-planned', name: 'Planned', revision: 1 },
  { category: 'started', color: '#2563eb', id: 'state-started', name: 'In progress', revision: 1 },
  { category: 'completed', color: '#16a34a', id: 'state-completed', name: 'Completed', revision: 1 },
  { category: 'canceled', color: '#dc2626', id: 'state-canceled', name: 'Canceled', revision: 1 },
] as const
const project = {
  description: 'Deterministic project detail.',
  id: ids.project,
  lead_actor_id: ids.human,
  name: 'Runtime reliability',
  revision: 1,
  status: 'active',
  summary: 'Keyboard and semantic acceptance fixture.',
  target_date: '2026-09-30',
  team_id: ids.team,
}
const workItem = {
  active_executor: null,
  description: 'Deterministic Work Item detail body.',
  due_date: '2026-09-15',
  id: ids.workItem,
  labels: ['frontend'],
  milestone_id: null,
  number: 66,
  parent_id: null,
  priority: 'high',
  project_id: ids.project,
  project_name: project.name,
  responsible_human: { actor_id: ids.human, display_name: human.display_name },
  responsible_human_actor_id: ids.human,
  revision: 3,
  shared_reviewers: [],
  status_category: 'started',
  status_id: 'state-started',
  status_name: 'In progress',
  team_id: ids.team,
  team_key: team.key,
  title: 'Keyboard acceptance issue',
}
const access = {
  agent_id: ids.agentOne,
  approved_by_actor_id: ids.human,
  approved_capabilities: ['work:read', 'work:write'],
  created_at: '2026-08-23T00:00:00.000Z',
  revision: 1,
  revoked_at: null,
  status: 'active',
  team_id: ids.team,
  updated_at: '2026-08-23T00:00:00.000Z',
} as const
const agents = [
  {
    actor_id: ids.agentActorOne,
    approved_capabilities: ['work:read', 'work:write'],
    description: 'Primary deterministic keyboard fixture Agent.',
    heartbeat_interval_seconds: 30,
    id: ids.agentOne,
    is_active: true,
    max_concurrency: 2,
    name: 'Atlas Agent',
    provider: 'openai',
    requested_capabilities: ['work:read', 'work:write'],
    revision: 1,
    skills: ['frontend'],
    slug: 'atlas-agent',
    supported_protocols: ['native_http'],
    team_access: [access],
    version: '1.0.0',
    workspace_id: 'workspace-preview',
  },
  {
    actor_id: ids.agentActorTwo,
    approved_capabilities: ['work:read'],
    description: 'Secondary deterministic keyboard fixture Agent.',
    heartbeat_interval_seconds: 45,
    id: ids.agentTwo,
    is_active: false,
    max_concurrency: 1,
    name: 'Borealis Agent',
    provider: 'openai',
    requested_capabilities: ['work:read'],
    revision: 1,
    skills: ['review'],
    slug: 'borealis-agent',
    supported_protocols: ['native_http'],
    team_access: [],
    version: '1.0.0',
    workspace_id: 'workspace-preview',
  },
] as const
const session = {
  agent_actor_id: ids.agentActorOne,
  agent_id: ids.agentOne,
  budget: { maxRuntimeSeconds: 120 },
  created_at: '2026-08-23T01:00:00.000Z',
  current_plan_version_id: null,
  delegation_id: 'delegation-accessibility',
  error_code: null,
  error_summary: null,
  id: ids.session,
  last_heartbeat_at: '2026-08-23T01:05:00.000Z',
  principal_human_actor_id: ids.human,
  retry_of_session_id: null,
  revision: 3,
  state: 'executing',
  state_reason: 'Executing the acceptance fixture.',
  stop_requested_at: null,
  updated_at: '2026-08-23T01:05:00.000Z',
  work_item_id: ids.workItem,
}
const pendingApproval = {
  action_name: 'Review keyboard closure',
  approval_type: 'merge_pull_request',
  created_at: '2026-08-23T01:00:00.000Z',
  expires_at: '2026-08-24T01:00:00.000Z',
  id: ids.approvalPending,
  rationale_summary: 'A Human must review the deterministic change.',
  revision: 1,
  risk_level: 'medium',
  session_id: ids.session,
  status: 'pending',
}
const historyApproval = {
  ...pendingApproval,
  action_name: 'Reviewed keyboard closure',
  id: ids.approvalHistory,
  status: 'approved',
}
const run = {
  attempt_count: 3,
  created_at: '2026-08-23T02:00:00.000Z',
  dry_run: false,
  id: ids.run,
  last_error: 'The deterministic provider response could not be applied; the row description remains local to this run.',
  loop_id: null,
  max_attempts: 3,
  rule_id: 'rule-accessibility',
  session_id: ids.session,
  status: 'failed',
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

type JsonResponse = Readonly<{ body?: unknown; status?: number }>

export type RequestLedgerEntry = Readonly<{
  method: string
  path: string
  status: number
}>

function responseHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'content-type, if-match, idempotency-key, x-csrf-token',
    'Access-Control-Allow-Methods': 'DELETE, GET, OPTIONS, PATCH, POST',
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? accessibilityWebUrl,
    'Content-Type': 'application/json',
  }
}

function list(body: readonly unknown[]): JsonResponse {
  return { body: { items: body, nextCursor: null } }
}

export class AccessibilityFixture {
  readonly requests: RequestLedgerEntry[] = []
  readonly unexpected: string[] = []
  installed = true

  async install(page: Page): Promise<void> {
    await page.route(`${apiUrl}/**`, async route => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ headers: responseHeaders(route), status: 204 })
        return
      }
      const url = new URL(request.url())
      const response = this.response(url, request.method())
      if (!response) {
        const key = `${request.method()} ${url.pathname}${url.search}`
        this.unexpected.push(key)
        const status = 500
        this.requests.push({ method: request.method(), path: `${url.pathname}${url.search}`, status })
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'UNEXPECTED_MOCK_REQUEST', correlationId: 'accessibility-fixture', message: 'Unexpected mocked request.' } }),
          headers: responseHeaders(route),
          status,
        })
        return
      }
      const status = response.status ?? 200
      this.requests.push({ method: request.method(), path: `${url.pathname}${url.search}`, status })
      await route.fulfill({
        body: status === 204 ? undefined : JSON.stringify(response.body),
        headers: responseHeaders(route),
        status,
      })
    })
  }

  expectNoUnexpected(): void {
    expect(this.unexpected).toEqual([])
    expect(this.requests.filter(entry => entry.status === 404 || entry.status >= 500)).toEqual([])
  }

  private response(url: URL, method: string): JsonResponse | null {
    if (method !== 'GET') return null
    const path = url.pathname
    if (path === '/api/v1/install-status') return { body: { installed: this.installed } }
    if (path === '/api/v1/auth/me') return {
      body: {
        actor: { ...human, kind: 'human', workspace_id: 'workspace-preview', workspace_role: 'admin' },
        csrfToken: 'accessibility-fixture-csrf',
      },
    }
    if (path === '/api/v1/info') return {
      body: {
        buildSha: 'accessibility-fixture',
        mcpVersion: '1.29.0',
        preferredClientProfileVersion: '1.0',
        schemaBaseline: 24,
        serverVersion: '1.0.0',
        supportedClientProfileVersions: ['1.0'],
      },
    }
    if (path === '/api/v1/features') return {
      body: { features: canonicalFeatures.map(feature => ({ ...feature, enabled: true })) },
    }
    if (path === '/api/v1/events/stream') return { status: 204 }
    if (path === '/api/v1/teams') return list([team, teamTwo])
    if (path === `/api/v1/teams/${ids.team}/states` || path === `/api/v1/teams/${ids.teamTwo}/states`) return list(workflowStates)
    if (path === '/api/v1/actors/humans') return list([human])
    if (path === '/api/v1/projects') return list([project])
    if (path === `/api/v1/projects/${ids.project}`) return { body: project }
    if (path === `/api/v1/projects/${ids.project}/control-center`) {
      const empty = { items: [], nextCursor: null }
      return { body: {
        projectionVersion: 1,
        scope: { workspaceId: 'workspace-preview', projectId: ids.project },
        project: { id: ids.project, name: project.name, status: project.status, targetDate: project.target_date, responsibleHuman: { id: human.id, displayName: human.display_name, kind: 'human' }, revision: project.revision },
        revision: project.revision,
        freshness: { state: 'fresh', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
        collections: { attention: empty, running: empty, risks: empty, recently_verified: empty, ready_work: empty, blocked_work: empty },
      } }
    }
    if (path === `/api/v1/projects/${ids.project}/milestones`) return list([])
    if (path === '/api/v1/views') return list([])
    if (path === '/api/v1/work-items') return list([workItem])
    if (path === `/api/v1/work-items/${ids.workItem}`) return { body: workItem }
    if (path === `/api/v1/work-items/${ids.workItem}/execution-summary`) return { body: {
      projectionVersion: 1,
      workItem: { id: workItem.id, title: workItem.title, revision: workItem.revision, status: workItem.status_name },
      activeRuns: [],
      recentRuns: [],
      evidence: [],
      freshness: { state: 'current', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: '2026-08-27T00:00:00.000Z' },
    } }
    if (path === '/api/v1/human-attention') return list([])
    if (path === `/api/v1/work-items/${ids.workItem}/comments`) return list([])
    if (path === `/api/v1/work-items/${ids.workItem}/relations`) return list([])
    if (path === '/api/v1/rooms') return { body: [] }
    if (/^\/api\/v1\/rooms\/[^/]+\/timeline$/.test(path)) return list([])
    if (path === '/api/v1/handoffs' || path === '/api/v1/leases') return list([])
    if (path === '/api/v1/inbox') return list([])
    if (path === '/api/v1/agents') return list(agents)
    if (path === `/api/v1/agents/${ids.agentOne}`) return { body: agents[0] }
    if (path === `/api/v1/agents/${ids.agentTwo}`) return { body: agents[1] }
    if (path === '/api/v1/agent-sessions') return list([session])
    if (path === `/api/v1/agent-sessions/${ids.session}`) return { body: session }
    if (path === `/api/v1/agent-sessions/${ids.session}/explanation`) return { body: {
      projectionVersion: 1,
      session: { id: session.id, state: session.state, revision: session.revision, stateReason: session.state_reason, budget: session.budget, updatedAt: session.updated_at },
      project: { id: project.id, name: project.name, revision: project.revision },
      workItem: { id: workItem.id, title: workItem.title, revision: workItem.revision },
      responsibleHuman: { id: human.id, kind: 'human', displayName: human.display_name },
      activeAgent: { id: agents[0].actor_id, kind: 'agent', displayName: agents[0].name },
      plan: null,
      currentStep: null,
      planVersions: [],
      causalGroups: [],
      nextCursor: null,
      pendingAttention: [],
      changes: [{ type: 'agent_session', id: session.id, revision: session.revision }],
      evidence: [],
      evidenceDetails: [],
      verification: { state: 'pending', summary: 'Execution has not yet published successful validation evidence.' },
      health: { heartbeat: 'healthy', lastHeartbeatAt: session.last_heartbeat_at, leaseCount: 0, pendingApprovalCount: 0 },
      freshness: { state: 'current', observedAt: '2026-08-27T00:00:00.000Z', sourceUpdatedAt: session.updated_at },
      allowedControls: [
        { action: 'pause', allowed: true, reasonCode: 'ALLOWED', targetState: 'paused' },
        { action: 'resume', allowed: false, reasonCode: 'SESSION_NOT_PAUSED', targetState: null },
        { action: 'stop', allowed: true, reasonCode: 'ALLOWED', targetState: 'stopping' },
        { action: 'retry', allowed: false, reasonCode: 'SESSION_NOT_TERMINAL', targetState: null },
        { action: 'handoff', allowed: true, reasonCode: 'ALLOWED', targetState: 'awaiting_input' },
        { action: 'replan', allowed: true, reasonCode: 'ALLOWED', targetState: 'planning' },
        { action: 'steer', allowed: true, reasonCode: 'ALLOWED', targetState: 'executing' },
      ],
    } }
    if (path === `/api/v1/agent-sessions/${ids.session}/activities`) return list([])
    if (path === `/api/v1/agent-sessions/${ids.session}/plans`) return list([])
    if (path === '/api/v1/artifacts') return list([])
    if (path === '/api/v1/approvals') {
      if (url.searchParams.get('sessionId')) return list([pendingApproval])
      return list(url.searchParams.get('status') === 'pending' ? [pendingApproval] : [historyApproval])
    }
    if (path === '/api/v1/agent-connections') return list([])
    if (path === '/api/v1/usage-summary') return {
      body: {
        currency_buckets: [],
        input_tokens: '1200',
        output_tokens: '300',
        runtime_ms: '45000',
        tool_calls: '7',
        unknown_cost_records: 0,
      },
    }
    if (path === '/api/v1/cycles') return list([{ completed_items: 5, ends_at: '2026-08-31T00:00:00.000Z', id: 'cycle-accessibility', name: 'Keyboard cycle', starts_at: '2026-08-01T00:00:00.000Z', state: 'current', total_items: 10 }])
    if (path === '/api/v1/initiatives') return list([{ health: 'on_track', id: 'initiative-accessibility', name: 'Semantic reliability', priority: 'high', status: 'active' }])
    if (path === '/api/v1/automation-rules') return list([{ id: 'rule-accessibility', name: 'Keyboard rule', revision: 1, state: 'active', trigger: { type: 'manual' }, version: 1 }])
    if (path === '/api/v1/loops') return list([{ id: 'loop-accessibility', name: 'Keyboard loop', next_run_at: '2026-08-24T00:00:00.000Z', no_overlap: true, revision: 1, state: 'active' }])
    if (path === '/api/v1/automation-runs') return list([run])
    if (path === '/api/v1/templates') return list([{ id: 'template-accessibility', kind: 'work_item', name: 'Keyboard template', status: 'active', version: 1 }])
    if (path === '/.well-known/workmesh-agent') return {
      body: {
        apiVersion: 'v1',
        mcpUrl: `${apiUrl}/mcp`,
        protocolVersion: 'v1',
        skill: {
          name: 'workmesh',
          sha256: `sha256:${'a'.repeat(64)}`,
          signature: 'ed25519:fixture-signature',
          version: '1.1.0',
        },
        supportedClients: ['opencode', 'generic_mcp'],
        wellKnownUrl: `${apiUrl}/.well-known/workmesh-agent`,
      },
    }
    if (path === '/mcp') return {
      body: { error: { code: 'UNAUTHORIZED', correlationId: 'accessibility-fixture', message: 'Credential required.' } },
      status: 401,
    }
    return null
  }
}

export type SemanticSnapshot = Readonly<{
  documentClientWidth: number
  documentScrollWidth: number
  duplicateIds: readonly string[]
  mainCount: number
  mainH1Count: number
  missingReferences: readonly string[]
  nestedInteractive: readonly string[]
  visibleH1Count: number
  visibleH1Text: readonly string[]
}>

export async function semanticSnapshot(page: Page): Promise<SemanticSnapshot> {
  return page.evaluate(() => {
    const visible = (element: Element): boolean => {
      const target = element as HTMLElement
      const rect = target.getBoundingClientRect()
      const style = getComputedStyle(target)
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const idCounts = new Map<string, number>()
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      if (!element.id) continue
      idCounts.set(element.id, (idCounts.get(element.id) ?? 0) + 1)
    }
    const duplicateIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id).sort()
    const missingReferences: string[] = []
    for (const element of document.querySelectorAll<HTMLElement>('[aria-labelledby], [aria-describedby], [aria-controls]')) {
      for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls'] as const) {
        const value = element.getAttribute(attribute)
        if (!value) continue
        for (const token of value.trim().split(/\s+/)) {
          const target = document.getElementById(token)
          if (!target || !target.isConnected || idCounts.get(token) !== 1)
            missingReferences.push(`${element.tagName.toLocaleLowerCase()}[${attribute}="${token}"]`)
        }
      }
    }
    const outerSelector = 'a[href], button, label, [role="button"], [role="link"], [role="tab"]'
    const innerSelector = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"]'
    const nestedInteractive: string[] = []
    for (const outer of document.querySelectorAll<HTMLElement>(outerSelector)) {
      if (!visible(outer)) continue
      const nested = [...outer.querySelectorAll<HTMLElement>(innerSelector)].filter(visible)
      const invalid = nested.filter(inner => !(outer instanceof HTMLLabelElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(inner.tagName)))
      if (invalid.length > 0) nestedInteractive.push(`${outer.tagName.toLocaleLowerCase()} -> ${invalid.map(element => element.tagName.toLocaleLowerCase()).join(',')}`)
    }
    const visibleH1 = [...document.querySelectorAll('h1')].filter(visible)
    const main = [...document.querySelectorAll('main')].filter(visible)
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      duplicateIds,
      mainCount: main.length,
      mainH1Count: main.reduce((count, element) => count + [...element.querySelectorAll('h1')].filter(visible).length, 0),
      missingReferences,
      nestedInteractive,
      visibleH1Count: visibleH1.length,
      visibleH1Text: visibleH1.map(element => element.textContent?.trim() ?? ''),
    }
  })
}

export async function expectNamedVisibleControls(page: Page): Promise<void> {
  const controls = page.locator('a[href]:visible, button:visible, input:visible, select:visible, textarea:visible, summary:visible, [role="tab"]:visible')
  const count = await controls.count()
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    const descriptor = await control.evaluate(element => {
      const id = element.id ? `#${element.id}` : ''
      const testId = element.getAttribute('data-testid')
      return `${element.tagName.toLocaleLowerCase()}${id}${testId ? `[data-testid="${testId}"]` : ''}`
    })
    await expect.soft(control, `${descriptor} should have an accessible name`).toHaveAccessibleName(/\S/, { timeout: 200 })
  }
}

export async function tabUntilFocused(page: Page, target: Locator, maximumTabs = 80): Promise<boolean> {
  if (await target.count() !== 1 || !await target.isVisible()) return false
  for (let index = 0; index < maximumTabs; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate(element => element === document.activeElement)) return true
  }
  return false
}

export async function focusGeometry(target: Locator): Promise<Readonly<{
  bottom: number
  boxShadow: string
  cssHeight: string
  devicePixelRatio: number
  height: number
  left: number
  minHeight: string
  outlineStyle: string
  outlineWidth: string
  right: number
  top: number
  transform: string
  viewportHeight: number
  viewportWidth: number
  width: number
  zoom: string
}>> {
  return target.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      bottom: rect.bottom,
      boxShadow: style.boxShadow,
      cssHeight: style.height,
      devicePixelRatio,
      height: rect.height,
      left: rect.left,
      minHeight: style.minHeight,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      right: rect.right,
      top: rect.top,
      transform: style.transform,
      viewportHeight: innerHeight,
      viewportWidth: innerWidth,
      width: rect.width,
      zoom: style.zoom,
    }
  })
}
