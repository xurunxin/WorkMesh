# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: configuration-readiness.spec.ts >> 部分撤权后项目配置只读，撤销 Team 后不回退或保留旧操作
- Location: e2e\configuration-readiness.spec.ts:147:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel(/当前团队|Current team/i)
Expected: ""
Error: strict mode violation: getByLabel(/当前团队|Current team/i) resolved to 2 elements:
    1) <select aria-label="Current team">…</select> aka getByRole('complementary', { name: 'Main navigation' }).getByLabel('Current team')
    2) <select aria-label="Current team">…</select> aka getByRole('banner').getByLabel('Current team')

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for getByLabel(/当前团队|Current team/i)

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - link "Skip to content" [ref=e3] [cursor=pointer]:
      - /url: "#workmesh-main"
    - complementary "Main navigation" [ref=e4]:
      - generic [ref=e5]:
        - strong [ref=e7]: WorkMesh
        - generic [ref=e8]: A2 Human
      - button "Collapse sidebar" [expanded] [ref=e9] [cursor=pointer]:
        - img [ref=e10]
        - generic [ref=e12]: Collapse sidebar
      - generic [ref=e14]:
        - text: Team
        - combobox "Current team" [ref=e15]:
          - option "No team" [disabled] [selected]
          - option "A2 other authorized Team"
      - navigation "Workspace navigation" [ref=e16]:
        - generic [ref=e17]:
          - paragraph [ref=e18]: Workbench
          - link "Workbench" [ref=e19] [cursor=pointer]:
            - /url: /workbench
            - img [ref=e21]
            - generic [ref=e23]: Workbench
          - link "My work" [ref=e24] [cursor=pointer]:
            - /url: /?view=home
            - img [ref=e26]
            - generic [ref=e28]: My work
          - link "Issues" [ref=e29] [cursor=pointer]:
            - /url: /?view=my-work
            - img [ref=e31]
            - generic [ref=e33]: Issues
          - link "Guidance" [ref=e34] [cursor=pointer]:
            - /url: /?view=guidance
            - img [ref=e36]
            - generic [ref=e38]: Guidance
        - generic [ref=e39]:
          - paragraph [ref=e40]: Governance
          - link "Needs You" [ref=e41] [cursor=pointer]:
            - /url: /?view=inbox
            - img [ref=e43]
            - generic [ref=e45]: Needs You
          - link "Session" [ref=e46] [cursor=pointer]:
            - /url: /?view=sessions
            - img [ref=e48]
            - generic [ref=e50]: Session
          - link "Recovery" [ref=e51] [cursor=pointer]:
            - /url: /?view=recovery
            - img [ref=e53]
            - generic [ref=e55]: Recovery
          - link "Projects" [ref=e56] [cursor=pointer]:
            - /url: /?view=projects
            - img [ref=e58]
            - generic [ref=e60]: Projects
          - link "Agents" [ref=e61] [cursor=pointer]:
            - /url: /agents
            - img [ref=e63]
            - generic [ref=e65]: Agents
        - generic [ref=e66]:
          - paragraph [ref=e67]: Operations
          - link "Operations" [ref=e68] [cursor=pointer]:
            - /url: /operations
            - img [ref=e70]
            - generic [ref=e72]: Operations
      - navigation "Administration navigation" [ref=e73]:
        - link "Settings" [ref=e74] [cursor=pointer]:
          - /url: /settings
          - img [ref=e76]
          - generic [ref=e78]: Settings
      - generic [ref=e80]:
        - button "Sign out" [ref=e81] [cursor=pointer]:
          - img [ref=e83]
          - generic [ref=e85]: Sign out
        - generic [ref=e86]: v1.0.0 · build unknown · schema 1
    - generic [ref=e87]:
      - banner [ref=e88]:
        - paragraph [ref=e89]:
          - generic [ref=e90]: Workbench
        - button "Search" [ref=e92] [cursor=pointer]:
          - img [ref=e94]
          - generic [ref=e96]:
            - generic [ref=e97]: Search
            - generic [ref=e98]: Ctrl K
        - generic [ref=e99]:
          - button "Switch to the light theme" [ref=e100]:
            - img [ref=e101]
          - group "Language" [ref=e104]:
            - button "中" [ref=e105]
            - button "EN" [pressed] [ref=e106]
      - main [ref=e107]:
        - generic [ref=e109]:
          - complementary "Conversations" [ref=e110]:
            - link "Back to the classic screen" [ref=e111] [cursor=pointer]:
              - /url: /?view=my-work
            - generic [ref=e112]:
              - heading "Agent workbench" [level=1] [ref=e113]
              - link "Model settings" [ref=e114] [cursor=pointer]:
                - /url: /settings/agent-workbench
            - button "Create conversation" [ref=e115] [cursor=pointer]:
              - generic [ref=e116]: Create conversation
            - paragraph [ref=e117]: Conversations
            - list [ref=e118]:
              - paragraph [ref=e119]: No conversations yet
            - paragraph [ref=e120]: Executors
            - generic [ref=e122]:
              - generic [ref=e124]: Delegated session
              - generic [ref=e125]: —
          - region "Conversation" [ref=e126]:
            - paragraph [ref=e128]: Work context is unavailable or does not match the current conversation.
            - generic [ref=e129]:
              - paragraph [ref=e130]: Select or create a conversation.
              - generic "Choose a starting point" [ref=e131]:
                - button "Introduce WorkMesh and explain how to use its main features." [ref=e132] [cursor=pointer]:
                  - generic [ref=e133]: Introduce WorkMesh and explain how to use its main features.
                - button "Help me organize project goals, tasks, and next actions." [ref=e134] [cursor=pointer]:
                  - generic [ref=e135]: Help me organize project goals, tasks, and next actions.
                - button "Help me turn a task into clear goals, a plan, and acceptance criteria." [ref=e136] [cursor=pointer]:
                  - generic [ref=e137]: Help me turn a task into clear goals, a plan, and acceptance criteria.
          - complementary "Execution context" [ref=e138]:
            - heading "Execution context" [level=2] [ref=e139]
            - paragraph [ref=e140]: Select a conversation to view context.
  - button "Open Next.js Dev Tools" [ref=e146] [cursor=pointer]:
    - img [ref=e147]
  - alert [ref=e150]
```

# Test source

```ts
  68  |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  69  |   }
  70  | })
  71  | test('关闭 Gitea 的混合 provider 跨 Team 分页仍可配置 GitHub', async ({ page }) => {
  72  |   test.skip(process.env.WORKMESH_A2_DISABLE_GITEA !== '1', '关闭 Gitea 的独立 A2 服务运行；全仓服务保留其原 feature 设置')
  73  |   const f = await readinessFixture(page)
  74  |   const features = await f.call<{ features: Array<{ key: string; enabled: boolean }> }>('GET', '/api/v1/features')
  75  |   expect(features.features.find(value => value.key === 'WORKMESH_BETA_GITEA')?.enabled).toBe(false)
  76  |   const otherTeam = await f.call<{ id: string }>('POST', '/api/v1/teams', { name: 'A2 other Team', key: `B${randomUUID().slice(0, 6).toUpperCase()}` })
  77  |   const connection = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'GitHub pagination', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  78  |   const excluded = await f.call<{ id: string }>('POST', '/api/v1/provider-connections', { provider: 'github', externalAccountId: randomUUID(), displayName: 'Gitea existing configuration', webhookSecret: 'a2-webhook-placeholder', installationId: '42', appId: '42', privateKey: 'a2-fixture-key-'.repeat(6) })
  79  |   // A pre-existing provider can become disabled; do not use a disabled write command to seed it.
  80  |   const db = createDb()
  81  |   try { await db.query("UPDATE provider_connections SET provider='gitea' WHERE id=$1", [excluded.id]) } finally { await db.end() }
  82  |   const expected: string[] = []
  83  |   for (let index = 0; index < 23; index++) {
  84  |     const repository = await f.call<{ id: string }>('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: f.teamId, externalId: String(index), fullName: `z-pagination/${String(index).padStart(2, '0')}`, defaultBranch: 'main' })
  85  |     expected.push(repository.id)
  86  |   }
  87  |   await f.call('POST', '/api/v1/repositories', { connectionId: connection.id, teamId: otherTeam.id, externalId: 'other', fullName: '0-other/hidden', defaultBranch: 'main' })
  88  |   const seedDb = createDb()
  89  |   try { await seedDb.query(`INSERT INTO repositories(workspace_id,connection_id,team_id,external_id,full_name,default_branch)
  90  |     SELECT workspace_id,id,$2,'disabled','0-gitea/hidden','main' FROM provider_connections WHERE id=$1`, [excluded.id, f.teamId]) } finally { await seedDb.end() }
  91  |   const seen: string[] = []; let cursor: string | null = null
  92  |   do {
  93  |     const own: { items: Array<{ id: string }>; nextCursor: string | null } = await f.call('GET', `/api/v1/repositories?teamId=${f.teamId}&availableOnly=true&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
  94  |     seen.push(...own.items.map(value => value.id)); cursor = own.nextCursor
  95  |   } while (cursor)
  96  |   expect(seen).toEqual(expected)
  97  |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  98  |   const section = page.locator('#project-repository-configuration')
  99  |   await expect(section.locator('select').first().locator('option')).toHaveCount(20)
  100 |   await section.getByRole('button', { name: /加载更多|Load more/ }).click()
  101 |   await expect(section.locator('select').first().locator('option')).toHaveCount(23)
  102 |   await expect(section).not.toContainText('0-gitea/hidden'); await expect(section).not.toContainText('0-other/hidden')
  103 |   await f.configureRepository(true); await page.goto(f.href)
  104 |   await expect(page.locator('#readiness-repository')).toHaveCount(0)
  105 | })
  106 | test('A2 响应丢失后重试保持配置请求身份', async ({ page }) => {
  107 |   const f = await readinessFixture(page)
  108 |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  109 |   await f.configureRepository(false, true); await page.goto(f.href)
  110 |   await expect(page.locator('#readiness-repository')).toHaveCount(0)
  111 | })
  112 | 
  113 | test('项目内创建连接并注册仓库，凭证清除且不自动激活', async ({ page }) => {
  114 |   const f = await readinessFixture(page)
  115 |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  116 |   const section = page.locator('#project-repository-configuration')
  117 |   await section.locator('summary').filter({ hasText: /创建提供商连接|Create provider connection/ }).click()
  118 |   await section.getByLabel(/外部账户 ID|External account ID/).fill(randomUUID())
  119 |   await section.getByLabel(/连接名称|Connection name/).fill('A2 created in project')
  120 |   await section.getByLabel(/Webhook 秘密|Webhook secret/).fill('a2-ui-webhook-placeholder')
  121 |   await section.getByLabel('GitHub Installation ID').fill('42')
  122 |   await section.getByLabel('GitHub App ID').fill('42')
  123 |   await section.getByLabel(/GitHub 私钥|GitHub private key/).fill('a2-ui-key-placeholder-'.repeat(6))
  124 |   const response = page.waitForResponse(value => value.url().endsWith('/api/v1/provider-connections') && value.request().method() === 'POST')
  125 |   await section.getByRole('button', { name: /创建提供商连接|Create provider connection/ }).click()
  126 |   const created = await response; expect(created.ok()).toBe(true)
  127 |   const connection = await created.json() as { id: string }
  128 |   await expect(section.getByLabel(/Webhook 秘密|Webhook secret/)).toHaveValue('')
  129 |   await expect(section.getByLabel(/GitHub 私钥|GitHub private key/)).toHaveValue('')
  130 |   await expect(section.getByLabel(/已有连接 ID|Existing connection ID/)).toHaveValue(connection.id)
  131 |   expect(await page.evaluate(() => JSON.stringify({ storage: { ...localStorage, ...sessionStorage }, url: location.href }))).not.toContain('a2-ui-key-placeholder')
  132 |   await f.configureRepository(true, false, connection.id)
  133 |   await page.goto(f.href); await expect(page.locator('#readiness-repository')).toHaveCount(0)
  134 |   expect((await f.call<{ items: unknown[] }>('GET', '/api/v1/agent-sessions')).items).toEqual(f.sessionBaseline)
  135 | })
  136 | test('URL 缺失非法重复工作类型不查询，也不推断上下文', async ({ page }) => {
  137 |   const f = await readinessFixture(page); const requests: string[] = []
  138 |   page.on('request', request => { if (request.url().includes('/configuration-readiness?')) requests.push(request.url()) })
  139 |   for (const suffix of ['', '&workKind=invalid', '&workKind=repository&workKind=non_repository']) {
  140 |     await page.goto(`/workbench?teamId=${f.teamId}${suffix}`)
  141 |     await expect(page.getByTestId('configuration-readiness')).toContainText(/请从明确指定工作类型|explicit work type/)
  142 |     await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  143 |   }
  144 |   expect(requests).toEqual([])
  145 | })
  146 | 
  147 | test('部分撤权后项目配置只读，撤销 Team 后不回退或保留旧操作', async ({ page }) => {
  148 |   const f = await readinessFixture(page)
  149 |   await page.goto(`/?view=projects&teamId=${f.teamId}&project=${f.projectId}#project-repository-configuration`)
  150 |   await f.configureRepository()
  151 |   const db = createDb()
  152 |   try {
  153 |     // Preserve an authorized workspace membership so this proves no Team fallback.
  154 |     await f.call('POST', '/api/v1/teams', { name: 'A2 other authorized Team', key: `R${randomUUID().slice(0, 6).toUpperCase()}` })
  155 |     await db.query("UPDATE actors SET workspace_role='member' WHERE id=$1", [f.actorId])
  156 |     await db.query("UPDATE memberships SET role='member' WHERE team_id=$1 AND actor_id=$2", [f.teamId, f.actorId])
  157 |     await page.reload()
  158 |     const section = page.locator('#project-repository-configuration')
  159 |     await expect(section).toContainText(/需要 Team 管理员或维护者|requires a Team administrator/)
  160 |     await expect(section.getByRole('button', { name: /提交上下文配置|Submit context configuration/ })).toHaveCount(0)
  161 |     await expect(section.locator('summary')).toHaveCount(0)
  162 |     await page.goto(f.href)
  163 |     await expect(page.getByText(/平台无法确认 Runner|cannot confirm whether the Runner/)).toBeVisible()
  164 |     await db.query('DELETE FROM memberships WHERE team_id=$1 AND actor_id=$2', [f.teamId, f.actorId])
  165 |     await page.reload()
  166 |     await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  167 |     await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
> 168 |     await expect(page.getByLabel(/当前团队|Current team/i)).toHaveValue('')
      |                                                         ^ Error: expect(locator).toHaveValue(expected) failed
  169 |     await expect(page.getByTestId('configuration-readiness')).toContainText(/工作上下文不存在|Work context is unavailable/)
  170 |     await db.query('DELETE FROM memberships WHERE actor_id=$1', [f.actorId])
  171 |     await page.reload()
  172 |     await expect(page.locator('main [role="alert"]')).toContainText(/membership|成员/)
  173 |     await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  174 |     await expect(page.getByTestId('readiness-primary-action')).toHaveCount(0)
  175 |   } finally { await db.end() }
  176 | })
  177 | test('Lite 安装后逐项补齐直到横幅消失 @lite', async ({ page }) => {
  178 |   test.skip(process.env.WORKMESH_A2_LITE !== '1', '需要独立 Lite 镜像、无源码安装环境和 HTTPS provider；仓库 E2E 不替代安装验收')
  179 |   const f = await readinessFixture(page); await page.goto(f.href)
  180 |   await expect(page.getByTestId('readiness-banner').locator('li')).toHaveCount(3)
  181 |   await f.setAgent(); await f.setModel(); await page.reload()
  182 |   await page.locator('#readiness-repository').click(); await f.configureRepository(); await page.goBack()
  183 |   await expect(page.getByTestId('readiness-banner')).toHaveCount(0)
  184 | })
  185 | 
```