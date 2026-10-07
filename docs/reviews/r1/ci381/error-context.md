# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: project-editor.spec.ts >> Project creation and revisioned edit keep Markdown and the selected URL after reload
- Location: e2e/project-editor.spec.ts:3:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('.work-item-detail-sheet').getByRole('tab', { name: /详情|Details/ })

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
          - generic [ref=e14]: "0"
          - generic [ref=e15]: "1"
        - generic [ref=e16]: Issue
      - button "Collapse issues badge" [ref=e17]:
        - img [ref=e18]
  - alert [ref=e20]
  - generic [ref=e21]:
    - link "Skip to content" [ref=e22] [cursor=pointer]:
      - /url: "#workmesh-main"
    - complementary "Main navigation" [ref=e23]:
      - generic [ref=e24]:
        - strong [ref=e26]: WorkMesh
        - generic [ref=e27]: Alice
      - button "Collapse sidebar" [expanded] [ref=e28] [cursor=pointer]:
        - img [ref=e29]
        - generic [ref=e31]: Collapse sidebar
      - generic [ref=e33]:
        - text: Team
        - combobox "Current team" [ref=e34]:
          - option "No team" [disabled]
          - option "Acceptance baseline (BASE)" [selected]
          - option "General (GEN)"
      - navigation "Workspace navigation" [ref=e35]:
        - generic [ref=e36]:
          - paragraph [ref=e37]: Workbench
          - link "Workbench" [ref=e38] [cursor=pointer]:
            - /url: /workbench
            - img [ref=e40]
            - generic [ref=e42]: Workbench
          - link "My work" [ref=e43] [cursor=pointer]:
            - /url: /?view=home
            - img [ref=e45]
            - generic [ref=e47]: My work
          - link "Issues" [ref=e48] [cursor=pointer]:
            - /url: /?view=my-work
            - img [ref=e50]
            - generic [ref=e52]: Issues
            - generic [ref=e53]: "1"
          - link "Guidance" [ref=e54] [cursor=pointer]:
            - /url: /?view=guidance
            - img [ref=e56]
            - generic [ref=e58]: Guidance
        - generic [ref=e59]:
          - paragraph [ref=e60]: Governance
          - link "Needs You" [ref=e61] [cursor=pointer]:
            - /url: /?view=inbox
            - img [ref=e63]
            - generic [ref=e65]: Needs You
          - link "Session" [ref=e66] [cursor=pointer]:
            - /url: /?view=sessions
            - img [ref=e68]
            - generic [ref=e70]: Session
          - link "Recovery" [ref=e71] [cursor=pointer]:
            - /url: /?view=recovery
            - img [ref=e73]
            - generic [ref=e75]: Recovery
          - link "Projects" [ref=e76] [cursor=pointer]:
            - /url: /?view=projects
            - img [ref=e78]
            - generic [ref=e80]: Projects
            - generic [ref=e81]: "2"
          - link "Agents" [ref=e82] [cursor=pointer]:
            - /url: /agents
            - img [ref=e84]
            - generic [ref=e86]: Agents
        - generic [ref=e87]:
          - paragraph [ref=e88]: Operations
          - link "Operations" [ref=e89] [cursor=pointer]:
            - /url: /operations
            - img [ref=e91]
            - generic [ref=e93]: Operations
      - navigation "Administration navigation" [ref=e94]:
        - link "Settings" [ref=e95] [cursor=pointer]:
          - /url: /settings
          - img [ref=e97]
          - generic [ref=e99]: Settings
      - generic [ref=e101]:
        - button "Sign out" [ref=e102] [cursor=pointer]:
          - img [ref=e104]
          - generic [ref=e106]: Sign out
        - generic [ref=e107]: v1.0.0 · build unknown · schema 1
    - generic [ref=e108]:
      - banner [ref=e109]:
        - paragraph [ref=e110]:
          - generic [ref=e111]: Projects
        - button "Search" [ref=e113] [cursor=pointer]:
          - img [ref=e115]
          - generic [ref=e117]:
            - generic [ref=e118]: Search
            - generic [ref=e119]: Ctrl K
        - generic [ref=e120]:
          - button "Switch to the light theme" [ref=e121]:
            - img [ref=e122]
          - generic [ref=e124]:
            - group "Language" [ref=e125]:
              - button "中" [ref=e126]
              - button "EN" [pressed] [ref=e127]
            - generic "Live" [ref=e128]:
              - generic [ref=e129]: Live
      - main [ref=e130]:
        - generic [ref=e132]:
          - complementary "Projects" [ref=e133]:
            - generic [ref=e134]:
              - generic [ref=e135]:
                - text: Workspace
                - heading "Projects" [level=1] [ref=e136]
              - button "New project" [ref=e137] [cursor=pointer]:
                - img [ref=e139]
            - button "planned WebPi project 1791407724208 Project summary Target date · —" [ref=e142] [cursor=pointer]:
              - generic [ref=e143]: planned
              - strong [ref=e145]: WebPi project 1791407724208
              - generic [ref=e146]: Project summary
              - time [ref=e147]: Target date · —
          - generic [ref=e150]:
            - generic [ref=e151]:
              - generic [ref=e152]:
                - generic [ref=e153]:
                  - heading "WebPi project 1791407724208" [level=1] [ref=e154]
                  - 'generic "Freshness: Updated just now" [ref=e155]': Updated just now
                - paragraph [ref=e156]: Project summary
              - generic [ref=e157]:
                - button "Edit project" [ref=e158] [cursor=pointer]:
                  - generic [ref=e159]: Edit project
                - button "Milestones" [ref=e160] [cursor=pointer]:
                  - generic [ref=e161]: Milestones
                - button "Documents" [ref=e162] [cursor=pointer]:
                  - generic [ref=e163]: Documents
                - button "New issue" [ref=e164] [cursor=pointer]:
                  - img [ref=e166]
                  - generic [ref=e168]: New issue
                - button "View Work" [ref=e169] [cursor=pointer]:
                  - img [ref=e171]
                  - generic [ref=e173]: View Work
            - group [ref=e174]:
              - generic "Project description" [ref=e175] [cursor=pointer]
            - generic [ref=e176]:
              - generic [ref=e177]:
                - term [ref=e178]: Project status
                - definition [ref=e179]: planned
              - generic [ref=e180]:
                - term [ref=e181]: Responsible Human
                - definition [ref=e182]: No responsible Human
              - generic [ref=e183]:
                - term [ref=e184]: Target date
                - definition [ref=e185]: "-"
              - generic [ref=e186]:
                - term [ref=e187]: Freshness
                - definition [ref=e188]: rev 1
            - generic [ref=e190]:
              - strong [ref=e191]: —
              - generic [ref=e192]: No Issues yet
            - tablist "Project navigation" [ref=e193]:
              - tab "Overview" [ref=e194]:
                - generic [ref=e195]: Overview
              - tab "Work" [selected] [ref=e196]:
                - generic [ref=e197]: Work
              - tab "Attention" [ref=e198]:
                - generic [ref=e199]: Attention
              - tab "Runs" [ref=e200]:
                - generic [ref=e201]: Runs
            - generic [ref=e203]:
              - tablist "Work" [ref=e204]:
                - tab "List" [selected] [ref=e205]:
                  - generic [ref=e206]: List
                - tab "Board" [ref=e207]:
                  - generic [ref=e208]: Board
                - tab "Backlog 0" [ref=e209]:
                  - generic [ref=e210]: Backlog
                  - generic [ref=e211]: "0"
              - region "Work surfaces" [ref=e213]:
                - region "Issue filters" [ref=e214]:
                  - generic [ref=e215]:
                    - generic [ref=e216]:
                      - text: Search
                      - textbox "Search" [ref=e217]:
                        - /placeholder: Search Issue title or number
                    - generic [ref=e218]:
                      - text: Status
                      - combobox "Status" [ref=e219]:
                        - option "All statuses" [selected]
                        - option "Ready"
                        - option "In Progress"
                    - generic [ref=e220]:
                      - text: Priority
                      - combobox "Priority" [ref=e221]:
                        - option "All priorities" [selected]
                        - option "no priority"
                        - option "urgent"
                        - option "high"
                        - option "medium"
                        - option "low"
                    - generic [ref=e222]:
                      - text: Responsible Human
                      - combobox "Responsible Human" [ref=e223]:
                        - option "All responsible" [selected]
                        - option "Alice"
                    - generic [ref=e224]:
                      - text: Project
                      - combobox "Project" [ref=e225]:
                        - option "All projects"
                        - option "WebPi project 1791407724208" [selected]
                    - generic [ref=e226]:
                      - text: Milestone
                      - combobox "Milestone" [ref=e227]:
                        - option "All milestones" [selected]
                        - option "Milestone 1791407727803"
                    - generic [ref=e228]:
                      - text: Label
                      - textbox "Label" [ref=e229]
                    - button "Clear filters" [ref=e230] [cursor=pointer]:
                      - img [ref=e232]
                      - generic [ref=e234]: Clear filters
                  - generic [ref=e235]:
                    - generic [ref=e236]:
                      - text: Saved view
                      - combobox "Saved view" [ref=e237]:
                        - option "Saved view" [selected]
                        - option "Active"
                        - option "Backlog"
                        - option "Focused board"
                        - option "My Work"
                    - generic [ref=e238]:
                      - generic [ref=e239]: Save view name
                      - textbox "Save view name" [ref=e240]:
                        - /placeholder: Save view
                      - button "Save view" [ref=e241] [cursor=pointer]:
                        - img [ref=e243]
                        - generic [ref=e245]: Save view
                - generic "Issue layout" [ref=e246]:
                  - button "List" [pressed] [ref=e247] [cursor=pointer]:
                    - img [ref=e249]
                    - generic [ref=e251]: List
                  - button "Board" [ref=e252] [cursor=pointer]:
                    - img [ref=e254]
                    - generic [ref=e256]: Board
                  - button "Issue density" [ref=e257] [cursor=pointer]:
                    - generic [ref=e258]: Compact
                - region "Issue list" [ref=e260]:
                  - generic [ref=e261]:
                    - generic [ref=e262]:
                      - generic [ref=e263]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
                      - 'article "BASE-3: Project issue 1791407728811" [ref=e266] [cursor=pointer]':
                        - generic [ref=e267]:
                          - generic [ref=e268]: BASE-3
                          - generic [ref=e269]: Ready
                        - button "Project issue 1791407728811" [active] [ref=e270]
                        - button "Open project WebPi project 1791407724208" [ref=e272]:
                          - img [ref=e273]
                          - generic [ref=e275]: WebPi project 1791407724208
                        - generic [ref=e276]:
                          - generic [ref=e277]:
                            - generic [ref=e278]: "?"
                            - text: No responsible human
                          - generic [ref=e279]:
                            - img [ref=e280]
                            - text: No running agent
                        - generic [ref=e284]:
                          - generic [ref=e285]: Move Project issue 1791407728811
                          - combobox "Move Project issue 1791407728811" [ref=e286]:
                            - option "Ready" [selected]
                            - option "In Progress"
                    - generic [ref=e288]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test'
  2   |
  3   | test('Project creation and revisioned edit keep Markdown and the selected URL after reload', async ({ page }) => {
  4   |   const originalName = `WebPi project ${Date.now()}`
  5   |   const updatedName = `${originalName} updated`
  6   |   await page.goto('/?view=projects')
  7   |   await page.locator('.project-rail header').getByRole('button', { name: /新建项目|New project/ }).click()
  8   |   const create = page.getByTestId('create-project')
  9   |   await create.locator('input[name="name"]').fill(originalName)
  10  |   await create.locator('input[name="summary"]').fill('Project summary')
  11  |   await create.locator('textarea[name="description"]').fill('## First revision\n\nReal Markdown description.')
  12  |   await create.getByRole('button', { name: /创建项目|Create project/ }).click()
  13  |   await expect(page.locator('.wm-page-head h1')).toHaveText(originalName)
  14  |   await expect(page).toHaveURL(/view=projects.*project=/)
  15  |
  16  |   const milestoneName = `Milestone ${Date.now()}`
  17  |   await page.locator('.project-detail-pane').getByRole('button', { name: /里程碑|Milestones/ }).click()
  18  |   const milestones = page.getByTestId('project-milestones')
  19  |   await milestones.getByRole('button', { name: /新建里程碑|New milestone/ }).click()
  20  |   const milestoneForm = page.getByTestId('milestone-form')
  21  |   await milestoneForm.locator('input[name="name"]').fill(milestoneName)
  22  |   await milestoneForm.locator('textarea[name="description"]').fill('## First milestone\n\nTracked with the project.')
  23  |   await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  24  |   await expect(milestones.locator('strong').filter({ hasText: milestoneName })).toBeVisible()
  25  |   await milestones.getByRole('button', { name: new RegExp(`(?:编辑|Edit) ${milestoneName}`) }).click()
  26  |   await milestoneForm.locator('input[name="targetDate"]').fill('2026-10-15')
  27  |   await milestoneForm.getByRole('button', { name: /保存里程碑|Save milestone/ }).click()
  28  |   await expect(milestones.getByText('2026-10-15')).toBeVisible()
  29  |   await page.keyboard.press('Escape')
  30  |   await expect(milestones).toBeHidden()
  31  |
  32  |   await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  33  |   const issue = page.getByTestId('create-work-item')
  34  |   const issueTitle = `Project issue ${Date.now()}`
  35  |   await issue.locator('input[name="title"]').fill(issueTitle)
  36  |   await issue.locator('textarea[name="description"]').fill('## Project issue\n\nCreated from the selected Project.')
  37  |   await expect(issue.locator('select[name="projectId"]')).toHaveValue(new URL(page.url()).searchParams.get('project') ?? '')
  38  |   let issueCreateRequests = 0
  39  |   page.on('request', request => {
  40  |     if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/work-items') issueCreateRequests += 1
  41  |   })
  42  |   await issue.evaluate(form => {
  43  |     const target = form as HTMLFormElement
  44  |     target.requestSubmit()
  45  |     target.requestSubmit()
  46  |   })
  47  |   await expect(issue).toBeHidden()
  48  |   expect(issueCreateRequests).toBe(1)
  49  |   await page.getByTestId('project-control-view-work').click()
  50  |   const firstIssue = page.locator('.project-detail-pane').getByRole('button', { name: issueTitle, exact: true })
  51  |   await expect(firstIssue).toBeVisible()
  52  |   await firstIssue.click()
  53  |   let detail = page.locator('.work-item-detail-sheet')
> 54  |   await detail.getByRole('tab', { name: /详情|Details/ }).click()
      |                                                         ^ Error: locator.click: Test timeout of 90000ms exceeded.
  55  |   await detail.locator('select[name="milestoneId"]').selectOption({ label: milestoneName })
  56  |   await detail.getByRole('button', { name: /保存更改|Save changes/ }).click()
  57  |   // The sheet applies a save by round-tripping the projection and re-seeding
  58  |   // its draft, so the form only reports no unsaved edits once that lands.
  59  |   // Closing a still-dirty sheet answers a native discard prompt instead, which
  60  |   // Playwright dismisses, leaving the sheet open.
  61  |   await expect(detail.locator('.work-item-detail-actions').getByText(/Unsaved changes|有未保存的更改/)).toHaveCount(0)
  62  |   await expect(detail.locator('select[name="milestoneId"]')).toHaveValue(/.+/)
  63  |   await detail.getByRole('button', { name: /^(关闭|Close) / }).click()
  64  |   await expect(detail).toBeHidden()
  65  |
  66  |   const relatedIssueTitle = `Related issue ${Date.now()}`
  67  |   await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  68  |   const relatedCreate = page.getByTestId('create-work-item')
  69  |   await relatedCreate.locator('input[name="title"]').fill(relatedIssueTitle)
  70  |   await relatedCreate.getByTestId('create-work-item-submit').click()
  71  |   await expect(relatedCreate).toBeHidden()
  72  |   await firstIssue.click()
  73  |   detail = page.locator('.work-item-detail-sheet')
  74  |   await detail.getByRole('tab', { name: /概览|Overview/ }).click()
  75  |   const relationships = detail.locator('.relationship-panel')
  76  |   const target = relationships.locator('select[name="targetWorkItemId"] option').filter({ hasText: relatedIssueTitle })
  77  |   await expect(target).toHaveCount(1)
  78  |   await relationships.locator('select[name="targetWorkItemId"]').selectOption(await target.getAttribute('value') ?? '')
  79  |   await relationships.getByRole('button', { name: /添加关系|Add relationship/ }).click()
  80  |   await expect(relationships.locator('.relation-list')).toContainText(relatedIssueTitle)
  81  |   await detail.getByRole('button', { name: /打开完整页面|Open full page/ }).click()
  82  |   await expect(page).toHaveURL(/workItem=/)
  83  |   await expect(page.locator('.work-item-full-page .relation-list')).toContainText(relatedIssueTitle)
  84  |   await page.locator('.work-item-full-page').getByRole('button', { name: /关闭|Close/ }).click()
  85  |   await expect(page).not.toHaveURL(/workItem=/)
  86  |   await expect(page.locator('.wm-page-head h1')).toHaveText(originalName)
  87  |
  88  |   await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  89  |   const edit = page.getByTestId('edit-project')
  90  |   await edit.locator('input[name="name"]').fill(updatedName)
  91  |   await edit.locator('textarea[name="description"]').fill('## Second revision\n\nPersisted after reload.')
  92  |   await edit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  93  |   await expect(page.locator('.wm-page-head h1')).toHaveText(updatedName)
  94  |   await page.locator('.hcp-project-description summary').click()
  95  |   await expect(page.locator('.hcp-project-description')).toContainText('Second revision')
  96  |
  97  |   await page.reload()
  98  |   await expect(page.locator('.wm-page-head h1')).toHaveText(updatedName)
  99  |   await page.locator('.hcp-project-description summary').click()
  100 |   await expect(page.locator('.hcp-project-description')).toContainText('Persisted after reload.')
  101 |
  102 |   await page.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  103 |   const staleEdit = page.getByTestId('edit-project')
  104 |   const other = await page.context().newPage()
  105 |   await other.goto(page.url())
  106 |   await expect(other.locator('.wm-page-head h1')).toHaveText(updatedName)
  107 |   await other.getByRole('button', { name: /编辑项目|Edit project/ }).click()
  108 |   const otherEdit = other.getByTestId('edit-project')
  109 |   await otherEdit.locator('input[name="name"]').fill(`${updatedName} by another editor`)
  110 |   await otherEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  111 |   await expect(other.locator('.wm-page-head h1')).toHaveText(`${updatedName} by another editor`)
  112 |   await other.close()
  113 |
  114 |   const pendingMarkdown = '## Reviewed after conflict\n\nMy draft survives a stale revision.'
  115 |   await staleEdit.locator('textarea[name="description"]').fill(pendingMarkdown)
  116 |   await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  117 |   await expect(staleEdit.getByRole('alert')).toBeVisible()
  118 |   await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  119 |   await staleEdit.getByRole('button', { name: /重新加载最新数据|Reload latest work/ }).click()
  120 |   const reconciliation = staleEdit.getByTestId('draft-reconciliation')
  121 |   await expect(reconciliation).toBeVisible()
  122 |   await reconciliation.getByRole('button', { name: /恢复并检查|Restore for review/ }).click()
  123 |   await expect(staleEdit.locator('textarea[name="description"]')).toHaveValue(pendingMarkdown)
  124 |   await staleEdit.getByRole('button', { name: /保存更改|Save changes/ }).click()
  125 |   await expect(page.locator('.wm-page-head h1')).toHaveText(`${updatedName} by another editor`)
  126 |   await expect(page.locator('.hcp-project-description')).toContainText('My draft survives a stale revision.')
  127 | })
  128 |
```
