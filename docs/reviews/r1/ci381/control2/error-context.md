# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: project-editor.spec.ts >> Project creation and revisioned edit keep Markdown and the selected URL after reload
- Location: e2e\project-editor.spec.ts:3:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('.project-detail-pane').getByRole('button', { name: 'Project issue 1791408959437', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e6] [cursor=pointer]:
    - button "Open Next.js Dev Tools" [ref=e7]:
      - img [ref=e8]
    - generic [ref=e11]:
      - button "Open issues overlay" [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]: "4"
          - generic [ref=e15]: "5"
        - generic [ref=e16]:
          - text: Issue
          - generic [ref=e17]: s
      - button "Collapse issues badge" [ref=e18]:
        - img [ref=e19]
  - alert [ref=e21]
  - generic [ref=e22]:
    - link "Skip to content" [ref=e23] [cursor=pointer]:
      - /url: "#workmesh-main"
    - complementary "Main navigation" [ref=e24]:
      - generic [ref=e25]:
        - strong [ref=e27]: WorkMesh
        - generic [ref=e28]: Alice
      - button "Collapse sidebar" [expanded] [ref=e29] [cursor=pointer]:
        - img [ref=e30]
        - generic [ref=e32]: Collapse sidebar
      - generic [ref=e34]:
        - text: Team
        - combobox "Current team" [ref=e35]:
          - option "No team" [disabled]
          - option "Acceptance baseline (BASE)" [selected]
          - option "General (GEN)"
      - navigation "Workspace navigation" [ref=e36]:
        - generic [ref=e37]:
          - paragraph [ref=e38]: Workbench
          - link "Workbench" [ref=e39] [cursor=pointer]:
            - /url: /workbench
            - img [ref=e41]
            - generic [ref=e43]: Workbench
          - link "My work" [ref=e44] [cursor=pointer]:
            - /url: /?view=home
            - img [ref=e46]
            - generic [ref=e48]: My work
          - link "Issues" [ref=e49] [cursor=pointer]:
            - /url: /?view=my-work
            - img [ref=e51]
            - generic [ref=e53]: Issues
            - generic [ref=e54]: "1"
          - link "Guidance" [ref=e55] [cursor=pointer]:
            - /url: /?view=guidance
            - img [ref=e57]
            - generic [ref=e59]: Guidance
        - generic [ref=e60]:
          - paragraph [ref=e61]: Governance
          - link "Needs You" [ref=e62] [cursor=pointer]:
            - /url: /?view=inbox
            - img [ref=e64]
            - generic [ref=e66]: Needs You
          - link "Session" [ref=e67] [cursor=pointer]:
            - /url: /?view=sessions
            - img [ref=e69]
            - generic [ref=e71]: Session
          - link "Recovery" [ref=e72] [cursor=pointer]:
            - /url: /?view=recovery
            - img [ref=e74]
            - generic [ref=e76]: Recovery
          - link "Projects" [ref=e77] [cursor=pointer]:
            - /url: /?view=projects
            - img [ref=e79]
            - generic [ref=e81]: Projects
            - generic [ref=e82]: "2"
          - link "Agents" [ref=e83] [cursor=pointer]:
            - /url: /agents
            - img [ref=e85]
            - generic [ref=e87]: Agents
        - generic [ref=e88]:
          - paragraph [ref=e89]: Operations
          - link "Operations" [ref=e90] [cursor=pointer]:
            - /url: /operations
            - img [ref=e92]
            - generic [ref=e94]: Operations
      - navigation "Administration navigation" [ref=e95]:
        - link "Settings" [ref=e96] [cursor=pointer]:
          - /url: /settings
          - img [ref=e98]
          - generic [ref=e100]: Settings
      - generic [ref=e102]:
        - button "Sign out" [ref=e103] [cursor=pointer]:
          - img [ref=e105]
          - generic [ref=e107]: Sign out
        - generic [ref=e108]: v1.0.0 · build unknown · schema 1
    - generic [ref=e109]:
      - banner [ref=e110]:
        - paragraph [ref=e111]:
          - generic [ref=e112]: Projects
        - button "Search" [ref=e114] [cursor=pointer]:
          - img [ref=e116]
          - generic [ref=e118]:
            - generic [ref=e119]: Search
            - generic [ref=e120]: Ctrl K
        - generic [ref=e121]:
          - button "Switch to the light theme" [ref=e122]:
            - img [ref=e123]
          - generic [ref=e125]:
            - group "Language" [ref=e126]:
              - button "中" [ref=e127]
              - button "EN" [pressed] [ref=e128]
            - generic "Live" [ref=e129]:
              - generic [ref=e130]: Live
      - main [ref=e131]:
        - generic [ref=e133]:
          - complementary "Projects" [ref=e134]:
            - generic [ref=e135]:
              - generic [ref=e136]:
                - text: Workspace
                - heading "Projects" [level=1] [ref=e137]
              - button "New project" [ref=e138] [cursor=pointer]:
                - img [ref=e140]
            - button "planned WebPi project 1791408957631 Project summary Target date · —" [ref=e143] [cursor=pointer]:
              - generic [ref=e144]: planned
              - strong [ref=e146]: WebPi project 1791408957631
              - generic [ref=e147]: Project summary
              - time [ref=e148]: Target date · —
          - generic [ref=e151]:
            - generic [ref=e152]:
              - generic [ref=e153]:
                - generic [ref=e154]:
                  - heading "WebPi project 1791408957631" [level=1] [ref=e155]
                  - 'generic "Freshness: Updated just now" [ref=e156]': Updated just now
                - paragraph [ref=e157]: Project summary
              - generic [ref=e158]:
                - button "Edit project" [ref=e159] [cursor=pointer]:
                  - generic [ref=e160]: Edit project
                - button "Milestones" [ref=e161] [cursor=pointer]:
                  - generic [ref=e162]: Milestones
                - button "Documents" [ref=e163] [cursor=pointer]:
                  - generic [ref=e164]: Documents
                - button "New issue" [active] [ref=e165] [cursor=pointer]:
                  - img [ref=e167]
                  - generic [ref=e169]: New issue
                - button "View Work" [ref=e170] [cursor=pointer]:
                  - img [ref=e172]
                  - generic [ref=e174]: View Work
            - group [ref=e175]:
              - generic "Project description" [ref=e176] [cursor=pointer]
            - generic [ref=e177]:
              - generic [ref=e178]:
                - term [ref=e179]: Project status
                - definition [ref=e180]: planned
              - generic [ref=e181]:
                - term [ref=e182]: Responsible Human
                - definition [ref=e183]: No responsible Human
              - generic [ref=e184]:
                - term [ref=e185]: Target date
                - definition [ref=e186]: "-"
              - generic [ref=e187]:
                - term [ref=e188]: Freshness
                - definition [ref=e189]: rev 2
            - generic [ref=e191]:
              - strong [ref=e192]: —
              - generic [ref=e193]: No Issues yet
            - tablist "Project navigation" [ref=e194]:
              - tab "Overview" [selected] [ref=e195]:
                - generic [ref=e196]: Overview
              - tab "Work" [ref=e197]:
                - generic [ref=e198]: Work
              - tab "Attention" [ref=e199]:
                - generic [ref=e200]: Attention
              - tab "Runs" [ref=e201]:
                - generic [ref=e202]: Runs
            - group [ref=e203]:
              - generic "▸Project Control Center filters" [ref=e204] [cursor=pointer]
              - option "All" [selected]
              - option "All" [selected]
              - option "All" [selected]
              - option "At Risk"
              - option "All" [selected]
              - option "backlog"
              - option "planned"
              - option "started"
              - option "completed"
              - option "canceled"
              - option "All" [selected]
              - option "24h"
              - option "7d"
              - option "30d"
            - region "Project operational summary" [ref=e205]:
              - article [ref=e206]:
                - strong [ref=e207]: "0"
                - generic [ref=e208]: Needs You
              - article [ref=e209]:
                - strong [ref=e210]: "0"
                - generic [ref=e211]: Running
              - article [ref=e212]:
                - strong [ref=e213]: "0"
                - generic [ref=e214]: At Risk
              - article [ref=e215]:
                - strong [ref=e216]: "0"
                - generic [ref=e217]: Recently Verified
              - article [ref=e218]:
                - strong [ref=e219]: "2"
                - generic [ref=e220]: Ready
              - article [ref=e221]:
                - strong [ref=e222]: "0"
                - generic [ref=e223]: Blocked
            - generic [ref=e224]:
              - region "Needs You" [ref=e225]:
                - generic [ref=e227]:
                  - heading "Needs You" [level=2] [ref=e229]
                  - generic [ref=e230]: "0"
                - paragraph [ref=e231]: Items waiting for the responsible Human to decide or review.
                - generic [ref=e234]: No items in this section.
              - region "Running" [ref=e235]:
                - generic [ref=e237]:
                  - heading "Running" [level=2] [ref=e239]
                  - generic [ref=e240]: "0"
                - paragraph [ref=e241]: Work currently being executed by Agents.
                - generic [ref=e244]: No items in this section.
              - region "At Risk" [ref=e245]:
                - generic [ref=e247]:
                  - heading "At Risk" [level=2] [ref=e249]
                  - generic [ref=e250]: "0"
                - paragraph [ref=e251]: Execution that needs recovery or resynchronization.
                - generic [ref=e254]: No items in this section.
              - region "Recently Verified" [ref=e255]:
                - generic [ref=e257]:
                  - heading "Recently Verified" [level=2] [ref=e259]
                  - generic [ref=e260]: "0"
                - paragraph [ref=e261]: Work with completed verification and linked evidence.
                - generic [ref=e264]: No items in this section.
              - region "Ready" [ref=e265]:
                - generic [ref=e267]:
                  - heading "Ready" [level=2] [ref=e269]
                  - generic [ref=e270]: "2"
                - paragraph [ref=e271]: Work that satisfies the server-side readiness projection.
                - generic [ref=e272]:
                  - article [ref=e273]:
                    - generic [ref=e275]:
                      - generic [ref=e276]:
                        - 'generic "Lifecycle: Ready" [ref=e278]': Ready
                        - heading "Project issue 1791408959437" [level=3] [ref=e279]
                      - paragraph [ref=e280]:
                        - generic [ref=e283]:
                          - term [ref=e284]:
                            - img [ref=e285]
                            - text: Responsible Human
                          - definition [ref=e287]: No responsible Human
                        - text: "## Project issue Created from the selected Project."
                      - generic [ref=e289]:
                        - generic [ref=e290]:
                          - term [ref=e291]: Work Item
                          - definition [ref=e292]: Project issue 1791408959437
                        - generic [ref=e293]:
                          - term [ref=e294]: Pending Human actions
                          - definition [ref=e295]: "0"
                        - generic [ref=e296]:
                          - term [ref=e297]: Evidence
                          - definition [ref=e298]: "0"
                      - button "View details" [ref=e300] [cursor=pointer]:
                        - generic [ref=e301]: View details
                        - img [ref=e303]
                  - article [ref=e305]:
                    - generic [ref=e307]:
                      - generic [ref=e308]:
                        - 'generic "Lifecycle: Ready" [ref=e310]': Ready
                        - heading "Related issue 1791408960064" [level=3] [ref=e311]
                      - paragraph [ref=e312]:
                        - generic [ref=e315]:
                          - term [ref=e316]:
                            - img [ref=e317]
                            - text: Responsible Human
                          - definition [ref=e319]: No responsible Human
                        - text: Work Item is ready for execution
                      - generic [ref=e321]:
                        - generic [ref=e322]:
                          - term [ref=e323]: Work Item
                          - definition [ref=e324]: Related issue 1791408960064
                        - generic [ref=e325]:
                          - term [ref=e326]: Pending Human actions
                          - definition [ref=e327]: "0"
                        - generic [ref=e328]:
                          - term [ref=e329]: Evidence
                          - definition [ref=e330]: "0"
                      - button "View details" [ref=e332] [cursor=pointer]:
                        - generic [ref=e333]: View details
                        - img [ref=e335]
              - region "Blocked" [ref=e337]:
                - generic [ref=e339]:
                  - heading "Blocked" [level=2] [ref=e341]
                  - generic [ref=e342]: "0"
                - paragraph [ref=e343]: Work blocked by execution state or dependencies.
                - generic [ref=e346]: No items in this section.
  - region "Notifications":
    - status [ref=e347]:
      - generic [ref=e348]:
        - strong [ref=e349]: Issue created
        - paragraph [ref=e350]: Created “Related issue 1791408960064”.
      - 'button "Dismiss notification: Issue created (1/1)" [ref=e351] [cursor=pointer]':
        - generic [ref=e352]: Dismiss
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   |
  3   | test('Project creation and revisioned edit keep Markdown and the selected URL after reload', async ({ page }) => {
  4   |   // 仅诊断：延迟 Work 导航的 RSC 响应，模拟 trace 中导航尚未应用的交错。
  5   |   await page.route('**/*', async route => {
  6   |     const url = new URL(route.request().url())
  7   |     if (url.pathname === '/' && url.searchParams.get('tab') === 'list' && url.searchParams.has('_rsc')) {
  8   |       const response = await route.fetch()
  9   |       await new Promise(resolve => setTimeout(resolve, 1000))
  10  |       await route.fulfill({ response })
  11  |     } else await route.continue()
  12  |   })
  13  |   const originalName = `WebPi project ${Date.now()}`
  14  |   const updatedName = `${originalName} updated`
  15  |   await page.goto('/?view=projects')
  16  |   await page.locator('.project-rail header').getByRole('button', { name: /新建项目|New project/ }).click()
  17  |   const create = page.getByTestId('create-project')
  18  |   await create.locator('input[name="name"]').fill(originalName)
  19  |   await create.locator('input[name="summary"]').fill('Project summary')
  20  |   await create.locator('textarea[name="description"]').fill('## First revision\n\nReal Markdown description.')
  21  |   await create.getByRole('button', { name: /创建项目|Create project/ }).click()
  22  |   await expect(page.locator('.wm-page-head h1')).toHaveText(originalName)
  23  |   await expect(page).toHaveURL(/view=projects.*project=/)
  24  |
  25  |   const milestoneName = `Milestone ${Date.now()}`
  26  |   await page.locator('.project-detail-pane').getByRole('button', { name: /里程碑|Milestones/ }).click()
  27  |   const milestones = page.getByTestId('project-milestones')
  28  |   await milestones.getByRole('button', { name: /新建里程碑|New milestone/ }).click()
  29  |   const milestoneForm = page.getByTestId('milestone-form')
  30  |   await milestoneForm.locator('input[name="name"]').fill(milestoneName)
  31  |   await milestoneForm.locator('textarea[name="description"]').fill('## First milestone\n\nTracked with the project.')
  32  |   await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  33  |   await expect(milestones.locator('strong').filter({ hasText: milestoneName })).toBeVisible()
  34  |   await milestones.getByRole('button', { name: new RegExp(`(?:编辑|Edit) ${milestoneName}`) }).click()
  35  |   await milestoneForm.locator('input[name="targetDate"]').fill('2026-10-15')
  36  |   await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  37  |   await expect(milestones.getByText('2026-10-15')).toBeVisible()
  38  |   await page.keyboard.press('Escape')
  39  |   await expect(milestones).toBeHidden()
  40  |
  41  |   await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  42  |   const issue = page.getByTestId('create-work-item')
  43  |   const issueTitle = `Project issue ${Date.now()}`
  44  |   await issue.locator('input[name="title"]').fill(issueTitle)
  45  |   await issue.locator('textarea[name="description"]').fill('## Project issue\n\nCreated from the selected Project.')
  46  |   await expect(issue.locator('select[name="projectId"]')).toHaveValue(new URL(page.url()).searchParams.get('project') ?? '')
  47  |   let issueCreateRequests = 0
  48  |   page.on('request', request => {
  49  |     if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/work-items') issueCreateRequests += 1
  50  |   })
  51  |   await issue.evaluate(form => {
  52  |     const target = form as HTMLFormElement
  53  |     target.requestSubmit()
  54  |     target.requestSubmit()
  55  |   })
  56  |   await expect(issue).toBeHidden()
  57  |   expect(issueCreateRequests).toBe(1)
  58  |   await page.getByTestId('project-control-view-work').click()
  59  |   const firstIssue = page.locator('.project-detail-pane').getByRole('button', { name: issueTitle, exact: true })
  60  |   await expect(firstIssue).toBeVisible()
  61  |   await firstIssue.click()
  62  |   let detail = page.locator('.work-item-detail-sheet')
  63  |   await detail.getByRole('tab', { name: /详情|Details/ }).click()
  64  |   await detail.locator('select[name="milestoneId"]').selectOption({ label: milestoneName })
  65  |   await detail.getByRole('button', { name: /保存更改|Save changes/ }).click()
  66  |   // The sheet applies a save by round-tripping the projection and re-seeding
  67  |   // its draft, so the form only reports no unsaved edits once that lands.
  68  |   // Closing a still-dirty sheet answers a native discard prompt instead, which
  69  |   // Playwright dismisses, leaving the sheet open.
  70  |   await expect(detail.locator('.work-item-detail-actions').getByText(/Unsaved changes|有未保存的更改/)).toHaveCount(0)
  71  |   await expect(detail.locator('select[name="milestoneId"]')).toHaveValue(/.+/)
  72  |   await detail.getByRole('button', { name: /^(关闭|Close) / }).click()
  73  |   await expect(detail).toBeHidden()
  74  |
  75  |   const relatedIssueTitle = `Related issue ${Date.now()}`
  76  |   await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  77  |   const relatedCreate = page.getByTestId('create-work-item')
  78  |   await relatedCreate.locator('input[name="title"]').fill(relatedIssueTitle)
  79  |   await relatedCreate.getByTestId('create-work-item-submit').click()
  80  |   await expect(relatedCreate).toBeHidden()
> 81  |   await firstIssue.click()
      |                    ^ Error: locator.click: Test timeout of 90000ms exceeded.
  82  |   detail = page.locator('.work-item-detail-sheet')
  83  |   await detail.getByRole('tab', { name: /概览|Overview/ }).click()
  84  |   const relationships = detail.locator('.relationship-panel')
  85  |   const target = relationships.locator('select[name="targetWorkItemId"] option').filter({ hasText: relatedIssueTitle })
  86  |   await expect(target).toHaveCount(1)
  87  |   await relationships.locator('select[name="targetWorkItemId"]').selectOption(await target.getAttribute('value') ?? '')
  88  |   await relationships.getByRole('button', { name: /添加关系|Add relationship/ }).click()
  89  |   await expect(relationships.locator('.relation-list')).toContainText(relatedIssueTitle)
  90  |   await detail.getByRole('button', { name: /打开完整页面|Open full page/ }).click()
  91  |   await expect(page).toHaveURL(/workItem=/)
  92  |   await expect(page.locator('.work-item-full-page .relation-list')).toContainText(relatedIssueTitle)
  93  |   await page.locator('.work-item-full-page').getByRole('button', { name: /关闭|Close/ }).click()
  94  |   await expect(page).not.toHaveURL(/workItem=/)
  95  |   await expect(page.locator('.wm-page-head h1')).toHaveText(originalName)
  96  |
  97  |   await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  98  |   const edit = page.getByTestId('edit-project')
  99  |   await edit.locator('input[name="name"]').fill(updatedName)
  100 |   await edit.locator('textarea[name="description"]').fill('## Second revision\n\nPersisted after reload.')
  101 |   await edit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  102 |   await expect(page.locator('.wm-page-head h1')).toHaveText(updatedName)
  103 |   await page.locator('.hcp-project-description summary').click()
  104 |   await expect(page.locator('.hcp-project-description')).toContainText('Second revision')
  105 |
  106 |   await page.reload()
  107 |   await expect(page.locator('.wm-page-head h1')).toHaveText(updatedName)
  108 |   await page.locator('.hcp-project-description summary').click()
  109 |   await expect(page.locator('.hcp-project-description')).toContainText('Persisted after reload.')
  110 |
  111 |   await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  112 |   const staleEdit = page.getByTestId('edit-project')
  113 |   const other = await page.context().newPage()
  114 |   await other.goto(page.url())
  115 |   await expect(other.locator('.wm-page-head h1')).toHaveText(updatedName)
  116 |   await other.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  117 |   const otherEdit = other.getByTestId('edit-project')
  118 |   await otherEdit.locator('input[name="name"]').fill(`${updatedName} by another editor`)
  119 |   await otherEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  120 |   await expect(other.locator('.wm-page-head h1')).toHaveText(`${updatedName} by another editor`)
  121 |   await other.close()
  122 |
  123 |   const pendingMarkdown = '## Reviewed after conflict\n\nMy draft survives a stale revision.'
  124 |   await staleEdit.locator('textarea[name="description"]').fill(pendingMarkdown)
  125 |   await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  126 |   await expect(staleEdit.getByRole('alert')).toBeVisible()
  127 |   await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  128 |   await staleEdit.getByRole('button', { name: /重新加载最新数据|Reload latest work/ }).click()
  129 |   const reconciliation = staleEdit.getByTestId('draft-reconciliation')
  130 |   await expect(reconciliation).toBeVisible()
  131 |   await reconciliation.getByRole('button', { name: /恢复并检查|Restore for review/ }).click()
  132 |   await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  133 |   await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  134 |   await expect(page.locator('.wm-page-head h1')).toHaveText(`${updatedName} by another editor`)
  135 |   await expect(page.locator('.hcp-project-description')).toContainText('My draft survives a stale revision.')
  136 | })
  137 |
```
