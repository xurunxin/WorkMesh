# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configuration-readiness.spec.ts >> 逐项配置后 Back 重算并允许逆序解决
- Location: e2e\configuration-readiness.spec.ts:15:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#project-repository-configuration').getByLabel(/仓库$|^Repository$/)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('#project-repository-configuration').getByLabel(/仓库$|^Repository$/)

```

```yaml
- alert
- link "Skip to content":
  - /url: "#workmesh-main"
- complementary "Main navigation":
  - strong: WorkMesh
  - text: A2 Human
  - button "Collapse sidebar" [expanded]
  - text: Team
  - combobox "Current team":
    - option "No team" [disabled]
    - option "A2 6f56476a (A6F5647)" [selected]
    - option "A2 bb1ee617 (ABB1EE6)"
    - option "Acceptance baseline (BASE)"
    - option "General (GEN)"
  - navigation "Workspace navigation":
    - paragraph: Workbench
    - link "Workbench":
      - /url: /workbench
    - link "My work":
      - /url: /?view=home
    - link "Issues":
      - /url: /?view=my-work
    - link "Guidance":
      - /url: /?view=guidance
    - paragraph: Governance
    - link "Needs You":
      - /url: /?view=inbox
    - link "Session":
      - /url: /?view=sessions
    - link "Recovery":
      - /url: /?view=recovery
    - link "Projects":
      - /url: /?view=projects
    - link "Agents":
      - /url: /agents
    - paragraph: Operations
    - link "Operations":
      - /url: /operations
  - navigation "Administration navigation":
    - link "Settings":
      - /url: /settings
  - button "Sign out"
  - text: v1.0.0 · build unknown · schema 1
- banner:
  - paragraph: Projects
  - button "Search": Search Ctrl K
  - button "Switch to the light theme"
  - group "Language":
    - button "中"
    - button "EN" [pressed]
  - text: Live
- main:
  - complementary "Projects":
    - text: Workspace
    - heading "Projects" [level=1]
    - button "New project"
    - button "planned A2 project 6f56476a Project overview Target date · —":
      - text: planned
      - strong: A2 project 6f56476a
      - text: Project overview
      - time: Target date · —
  - heading "A2 project 6f56476a" [level=1]
  - text: Updated just now
  - paragraph: There is nothing in this Project yet.
  - button "Edit project"
  - button "Milestones"
  - button "Documents"
  - button "New issue"
  - button "View Work"
  - term: Project status
  - definition: planned
  - term: Responsible Human
  - definition: No responsible Human
  - term: Target date
  - definition: "-"
  - term: Freshness
  - definition: rev 1
  - strong: —
  - text: No Issues yet
  - tablist "Project navigation":
    - tab "Overview" [selected]
    - tab "Work"
    - tab "Attention"
    - tab "Runs"
  - group: ▸Project Control Center filters
  - region "Project operational summary":
    - article:
      - strong: "0"
      - text: Needs You
    - article:
      - strong: "0"
      - text: Running
    - article:
      - strong: "0"
      - text: At Risk
    - article:
      - strong: "0"
      - text: Recently Verified
    - article:
      - strong: "0"
      - text: Ready
    - article:
      - strong: "0"
      - text: Blocked
  - region "Needs You":
    - heading "Needs You" [level=2]
    - text: "0"
    - paragraph: Items waiting for the responsible Human to decide or review.
    - text: No items in this section.
  - region "Running":
    - heading "Running" [level=2]
    - text: "0"
    - paragraph: Work currently being executed by Agents.
    - text: No items in this section.
  - region "At Risk":
    - heading "At Risk" [level=2]
    - text: "0"
    - paragraph: Execution that needs recovery or resynchronization.
    - text: No items in this section.
  - region "Recently Verified":
    - heading "Recently Verified" [level=2]
    - text: "0"
    - paragraph: Work with completed verification and linked evidence.
    - text: No items in this section.
  - region "Ready":
    - heading "Ready" [level=2]
    - text: "0"
    - paragraph: Work that satisfies the server-side readiness projection.
    - text: No items in this section.
  - region "Blocked":
    - heading "Blocked" [level=2]
    - text: "0"
    - paragraph: Work blocked by execution state or dependencies.
    - text: No items in this section.
  - region "Repository configuration":
    - heading "Repository configuration" [level=2]
    - button "Refresh"
    - text: Repository
    - combobox "Repository":
      - option "a2/fixture" [selected]
    - heading "Latest context for the current target" [level=3]
    - paragraph: No context configured for the current target.
    - group:
      - text: Base branch
      - textbox "Base branch": main
      - text: Base commit SHA
      - textbox "Base commit SHA"
      - text: Work branch pattern
      - textbox "Work branch pattern": "workmesh/{workItemKey}-{slug}"
      - text: Allowed paths (one per line)
      - textbox "Allowed paths (one per line)": .
      - group "Context permissions":
        - text: Context permissions
        - checkbox "Read" [checked]
        - text: Read
        - checkbox "Write branch"
        - text: Write branch
        - checkbox "Open PR"
        - text: Open PR
        - checkbox "Review"
        - text: Review
        - checkbox "Merge"
        - text: Merge
        - checkbox "CI"
        - text: CI
      - button "Submit context configuration"
    - group:
      - text: Register repository
      - group:
        - text: Existing connection ID
        - textbox "Existing connection ID": 9821ac00-8790-4ed0-a3b8-44983f882c39
        - text: Provider repository ID
        - textbox "Provider repository ID": "42"
        - text: Repository full name
        - textbox "Repository full name": a2/fixture
        - text: Default branch
        - textbox "Default branch": main
        - text: HTTPS clone URL
        - textbox "HTTPS clone URL"
        - button "Register repository"
    - group: Create provider connection
```

# Test source

```ts
  1  | import { randomUUID } from 'node:crypto'
  2  | import { expect, type Page } from '@playwright/test'
  3  | import { createDb } from '../../../../packages/db/src/index.js'
  4  | import { resolveReadinessContext } from './configuration-readiness-provider.js'
  5  | 
  6  | const apiUrl = process.env.WORKMESH_A2_LITE_URL ?? 'http://127.0.0.1:3101'
  7  | const lite = process.env.WORKMESH_A2_LITE === '1'
  8  | type RecordBody = Record<string, unknown>
  9  | export async function readinessFixture(page: Page) {
  10 |   const suffix = randomUUID().slice(0, 8)
  11 |   if (lite) {
  12 |     await page.goto('/install')
  13 |     for (const [name, value] of Object.entries({ bootstrapToken: process.env.WORKMESH_BOOTSTRAP_TOKEN!, workspace: 'A2 Lite', slug: `a2-${suffix}`, name: 'A2 Human', email: `a2-${suffix}@example.test`, password: 'a2-browser-password' })) await page.locator(`input[name="${name}"]`).fill(value)
  14 |     await page.getByTestId('install-submit').click()
  15 |     await expect(page).not.toHaveURL(/\/install/)
  16 |   }
  17 |   const meResponse = await page.request.get(`${apiUrl}/api/v1/auth/me`)
  18 |   expect(meResponse.ok()).toBe(true)
  19 |   let me = await meResponse.json() as { actor: { id: string; workspace_id: string }; csrfToken: string }
  20 |   let csrf = me.csrfToken
  21 |   const call = async <T>(method: string, path: string, body?: RecordBody, headers: Record<string, string> = {}): Promise<T> => {
  22 |     const response = await page.request.fetch(`${apiUrl}${path}`, { method, ...(body ? { data: body } : {}), headers: { 'x-csrf-token': csrf, 'idempotency-key': randomUUID(), ...headers } })
  23 |     expect(response.ok(), `${path}: ${response.status()} ${await response.text()}`).toBe(true)
  24 |     return await response.json() as T
  25 |   }
  26 |   const team = await call<{ id: string }>('POST', '/api/v1/teams', { name: `A2 ${suffix}`, key: `A${suffix.replaceAll('-', '').slice(0, 6).toUpperCase()}` })
  27 |   if (!lite) {
  28 |     // Only Human identity is seeded. Every readiness/configuration fact uses its real command.
  29 |     const db = createDb()
  30 |     const email = `a2-${suffix}@example.test`
  31 |     try {
  32 |       const human = (await db.query<{ id: string }>(`INSERT INTO actors(workspace_id,kind,display_name,email,password_hash,workspace_role)
  33 |         SELECT workspace_id,'human','A2 Human',$2,password_hash,'admin' FROM actors WHERE id=$1 RETURNING id`, [me.actor.id, email])).rows[0]!
  34 |       await db.query("INSERT INTO memberships(workspace_id,team_id,actor_id,role) SELECT workspace_id,$2,$3,'admin' FROM actors WHERE id=$1", [me.actor.id, team.id, human.id])
  35 |     } finally { await db.end() }
  36 |     const login = await page.request.post(`${apiUrl}/api/v1/auth/login`, { data: { email, password: 'password-acceptance' }, headers: { 'idempotency-key': randomUUID() } })
  37 |     expect(login.ok(), await login.text()).toBe(true)
  38 |     csrf = (await login.json() as { csrfToken: string }).csrfToken
  39 |     me = await call<typeof me>('GET', '/api/v1/auth/me')
  40 |   }
  41 |   const project = await call<{ id: string }>('POST', '/api/v1/projects', { teamId: team.id, name: `A2 project ${suffix}` })
  42 |   const sessionBaseline = await call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')
  43 |   const href = `/workbench?workKind=repository&teamId=${team.id}&projectId=${project.id}`
  44 |   const setModel = async () => {
  45 |     const connection = await call<{ id: string; revision: number }>('POST', '/api/v1/workbench/llm-connections', { scope: 'team', teamId: team.id, name: `A2 model ${suffix}`, apiType: 'openai-completions', baseUrl: 'https://models.example.test/v1', secretMaterial: 'a2-model-placeholder' })
  46 |     await call('POST', `/api/v1/workbench/llm-connections/${connection.id}/models`, { externalModelId: 'a2-test', displayName: 'A2 test model', enabled: true, capabilities: { inputModalities: ['text'], toolCalling: true, reasoning: false, contextWindowTokens: 10000, maxOutputTokens: 1000 } }, { 'if-match': `"revision-${connection.revision}"` })
  47 |     return connection
  48 |   }
  49 |   const setAgent = async () => {
  50 |     const agent = await call<{ id: string }>('POST', '/api/v1/agents/register', { name: `A2 ${suffix}`, slug: `a2-${suffix}`, provider: 'fake', version: '1', supportedProtocols: ['native_http'], requestedCapabilities: ['work:read'], approvedCapabilities: ['work:read'], maxConcurrency: 1 })
  51 |     await call('PUT', `/api/v1/agents/${agent.id}/team-access/${team.id}`, { approvedCapabilities: ['work:read'] })
  52 |     return agent
  53 |   }
  54 |   const configureRepository = async (github = false) => {
  55 |     const connection = await call<{ id: string }>('POST', '/api/v1/provider-connections', lite ? {
  56 |       provider: 'gitea', externalAccountId: suffix, displayName: 'A2 HTTPS Gitea', webhookSecret: 'a2-webhook-placeholder', baseUrl: process.env.WORKMESH_A2_GITEA_URL!, accessToken: 'a2-provider-placeholder',
  57 |     } : { provider: github ? 'github' : 'fake', externalAccountId: suffix, displayName: 'A2 deterministic provider', webhookSecret: 'a2-webhook-placeholder', ...(github ? { installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) } : {}) })
  58 |     const section = page.locator('#project-repository-configuration')
  59 |     await expect(section).toBeVisible()
  60 |     await section.locator('summary').filter({ hasText: /注册仓库|Register repository/ }).click()
  61 |     await section.getByLabel(/已有连接 ID|Existing connection ID/).fill(connection.id)
  62 |     await section.getByLabel(/提供商仓库 ID|Provider repository ID/).fill('42')
  63 |     await section.getByLabel(/仓库全名|Repository full name/).fill('a2/fixture')
  64 |     const registered = page.waitForResponse(response => response.url().endsWith('/api/v1/repositories') && response.request().method() === 'POST')
  65 |     await section.getByRole('button', { name: /注册仓库|Register repository/ }).click()
  66 |     const registeredResponse = await registered
  67 |     expect(registeredResponse.ok()).toBe(true)
  68 |     const repository = await registeredResponse.json() as { id: string }
> 69 |     await expect(section.getByLabel(/仓库$|^Repository$/)).toBeVisible()
     |                                                          ^ Error: expect(locator).toBeVisible() failed
  70 |     await section.getByLabel(/仓库$|^Repository$/).selectOption(repository.id)
  71 |     await expect(section.getByLabel(/基线提交 SHA|Base commit SHA/)).toBeVisible()
  72 |     await section.getByLabel(/基线提交 SHA|Base commit SHA/).fill('a2-base-sha')
  73 |     const resolution = page.waitForResponse(response => response.url().endsWith('/context') && response.request().method() === 'POST')
  74 |     await section.getByRole('button', { name: /提交上下文配置|Submit context configuration/ }).click()
  75 |     const response = await resolution; expect(response.ok()).toBe(true)
  76 |     const action = await response.json() as { id: string }
  77 |     await expect(section).toContainText(/已提交，等待解析|Submitted; waiting/)
  78 |     if (!lite) await resolveReadinessContext(action.id)
  79 |     await expect(section).toContainText(/上下文已配置|Context configured/, { timeout: 60000 })
  80 |   }
  81 |   return { call, teamId: team.id, projectId: project.id, actorId: me.actor.id, href, setModel, setAgent, configureRepository, sessionBaseline: sessionBaseline.items }
  82 | }
  83 | 
```