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
            - generic [ref=e82]: "3"
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
            - generic [ref=e142]:
              - button "planned WebPi project 1791402255190 Project summary Target date · —" [ref=e143] [cursor=pointer]:
                - generic [ref=e144]: planned
                - strong [ref=e146]: WebPi project 1791402255190
                - generic [ref=e147]: Project summary
                - time [ref=e148]: Target date · —
              - button "planned Document project 1791402211406 Project overview Target date · —" [ref=e149] [cursor=pointer]:
                - generic [ref=e150]: planned
                - strong [ref=e152]: Document project 1791402211406
                - generic [ref=e153]: Project overview
                - time [ref=e154]: Target date · —
          - generic [ref=e157]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - generic [ref=e160]:
                  - heading "WebPi project 1791402255190" [level=1] [ref=e161]
                  - 'generic "Freshness: Updated just now" [ref=e162]': Updated just now
                - paragraph [ref=e163]: Project summary
              - generic [ref=e164]:
                - button "Edit project" [ref=e165] [cursor=pointer]:
                  - generic [ref=e166]: Edit project
                - button "Milestones" [ref=e167] [cursor=pointer]:
                  - generic [ref=e168]: Milestones
                - button "Documents" [ref=e169] [cursor=pointer]:
                  - generic [ref=e170]: Documents
                - button "New issue" [ref=e171] [cursor=pointer]:
                  - img [ref=e173]
                  - generic [ref=e175]: New issue
                - button "View Work" [ref=e176] [cursor=pointer]:
                  - img [ref=e178]
                  - generic [ref=e180]: View Work
            - group [ref=e181]:
              - generic "Project description" [ref=e182] [cursor=pointer]
            - generic [ref=e183]:
              - generic [ref=e184]:
                - term [ref=e185]: Project status
                - definition [ref=e186]: planned
              - generic [ref=e187]:
                - term [ref=e188]: Responsible Human
                - definition [ref=e189]: No responsible Human
              - generic [ref=e190]:
                - term [ref=e191]: Target date
                - definition [ref=e192]: "-"
              - generic [ref=e193]:
                - term [ref=e194]: Freshness
                - definition [ref=e195]: rev 1
            - generic [ref=e197]:
              - strong [ref=e198]: —
              - generic [ref=e199]: No Issues yet
            - tablist "Project navigation" [ref=e200]:
              - tab "Overview" [ref=e201]:
                - generic [ref=e202]: Overview
              - tab "Work" [selected] [ref=e203]:
                - generic [ref=e204]: Work
              - tab "Attention" [ref=e205]:
                - generic [ref=e206]: Attention
              - tab "Runs" [ref=e207]:
                - generic [ref=e208]: Runs
            - generic [ref=e210]:
              - tablist "Work" [ref=e211]:
                - tab "List" [selected] [ref=e212]:
                  - generic [ref=e213]: List
                - tab "Board" [ref=e214]:
                  - generic [ref=e215]: Board
                - tab "Backlog 0" [ref=e216]:
                  - generic [ref=e217]: Backlog
                  - generic [ref=e218]: "0"
              - region "Work surfaces" [ref=e220]:
                - region "Issue filters" [ref=e221]:
                  - generic [ref=e222]:
                    - generic [ref=e223]:
                      - text: Search
                      - textbox "Search" [ref=e224]:
                        - /placeholder: Search Issue title or number
                    - generic [ref=e225]:
                      - text: Status
                      - combobox "Status" [ref=e226]:
                        - option "All statuses" [selected]
                        - option "Ready"
                        - option "In Progress"
                    - generic [ref=e227]:
                      - text: Priority
                      - combobox "Priority" [ref=e228]:
                        - option "All priorities" [selected]
                        - option "no priority"
                        - option "urgent"
                        - option "high"
                        - option "medium"
                        - option "low"
                    - generic [ref=e229]:
                      - text: Responsible Human
                      - combobox "Responsible Human" [ref=e230]:
                        - option "All responsible" [selected]
                        - option "Alice"
                    - generic [ref=e231]:
                      - text: Project
                      - combobox "Project" [ref=e232]:
                        - option "All projects"
                        - option "WebPi project 1791402255190" [selected]
                        - option "Document project 1791402211406"
                    - generic [ref=e233]:
                      - text: Milestone
                      - combobox "Milestone" [ref=e234]:
                        - option "All milestones" [selected]
                        - option "Milestone 1791402256525"
                    - generic [ref=e235]:
                      - text: Label
                      - textbox "Label" [ref=e236]
                    - button "Clear filters" [ref=e237] [cursor=pointer]:
                      - img [ref=e239]
                      - generic [ref=e241]: Clear filters
                  - generic [ref=e242]:
                    - generic [ref=e243]:
                      - text: Saved view
                      - combobox "Saved view" [ref=e244]:
                        - option "Saved view" [selected]
                        - option "Active"
                        - option "Backlog"
                        - option "Focused board"
                        - option "My Work"
                    - generic [ref=e245]:
                      - generic [ref=e246]: Save view name
                      - textbox "Save view name" [ref=e247]:
                        - /placeholder: Save view
                      - button "Save view" [ref=e248] [cursor=pointer]:
                        - img [ref=e250]
                        - generic [ref=e252]: Save view
                - generic "Issue layout" [ref=e253]:
                  - button "List" [pressed] [ref=e254] [cursor=pointer]:
                    - img [ref=e256]
                    - generic [ref=e258]: List
                  - button "Board" [ref=e259] [cursor=pointer]:
                    - img [ref=e261]
                    - generic [ref=e263]: Board
                  - button "Issue density" [ref=e264] [cursor=pointer]:
                    - generic [ref=e265]: Compact
                - region "Issue list" [ref=e267]:
                  - generic [ref=e268]:
                    - generic [ref=e269]:
                      - generic [ref=e270]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
                      - 'article "BASE-5: Project issue 1791402260382" [ref=e273] [cursor=pointer]':
                        - generic [ref=e274]:
                          - generic [ref=e275]: BASE-5
                          - generic [ref=e276]: Ready
                        - button "Project issue 1791402260382" [active] [ref=e277]
                        - button "Open project WebPi project 1791402255190" [ref=e279]:
                          - img [ref=e280]
                          - generic [ref=e282]: WebPi project 1791402255190
                        - generic [ref=e283]:
                          - generic [ref=e284]:
                            - generic [ref=e285]: "?"
                            - text: No responsible human
                          - generic [ref=e286]:
                            - img [ref=e287]
                            - text: No running agent
                        - generic [ref=e291]:
                          - generic [ref=e292]: Move Project issue 1791402260382
                          - combobox "Move Project issue 1791402260382" [ref=e293]:
                            - option "Ready" [selected]
                            - option "In Progress"
                    - generic [ref=e295]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
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
