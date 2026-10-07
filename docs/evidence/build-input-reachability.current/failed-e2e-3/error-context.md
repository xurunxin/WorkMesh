# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: documents.spec.ts >> Project and Issue documents keep immutable revisions through the real Web and API
- Location: e2e\documents.spec.ts:3:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('.work-item-detail-sheet').getByRole('tab', { name: /讨论|Discussion/ })
    - locator resolved to <button role="tab" tabindex="-1" type="button" class="wm-tab" aria-selected="false" id="_r_14_-tab-discussion" aria-controls="_r_14_-panel-discussion">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

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
            - button "planned Document project 1791389448135 Project overview Target date · —" [ref=e142] [cursor=pointer]:
              - generic [ref=e143]: planned
              - strong [ref=e145]: Document project 1791389448135
              - generic [ref=e146]: Project overview
              - time [ref=e147]: Target date · —
          - generic [ref=e150]:
            - generic [ref=e151]:
              - generic [ref=e152]:
                - generic [ref=e153]:
                  - heading "Document project 1791389448135" [level=1] [ref=e154]
                  - 'generic "Freshness: Updated just now" [ref=e155]': Updated just now
                - paragraph [ref=e156]: There is nothing in this Project yet.
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
            - generic [ref=e174]:
              - generic [ref=e175]:
                - term [ref=e176]: Project status
                - definition [ref=e177]: planned
              - generic [ref=e178]:
                - term [ref=e179]: Responsible Human
                - definition [ref=e180]: No responsible Human
              - generic [ref=e181]:
                - term [ref=e182]: Target date
                - definition [ref=e183]: "-"
              - generic [ref=e184]:
                - term [ref=e185]: Freshness
                - definition [ref=e186]: rev 1
            - generic [ref=e188]:
              - strong [ref=e189]: —
              - generic [ref=e190]: No Issues yet
            - tablist "Project navigation" [ref=e191]:
              - tab "Overview" [ref=e192]:
                - generic [ref=e193]: Overview
              - tab "Work" [selected] [ref=e194]:
                - generic [ref=e195]: Work
              - tab "Attention" [ref=e196]:
                - generic [ref=e197]: Attention
              - tab "Runs" [ref=e198]:
                - generic [ref=e199]: Runs
            - generic [ref=e201]:
              - tablist "Work" [ref=e202]:
                - tab "List" [selected] [ref=e203]:
                  - generic [ref=e204]: List
                - tab "Board" [ref=e205]:
                  - generic [ref=e206]: Board
                - tab "Backlog 0" [ref=e207]:
                  - generic [ref=e208]: Backlog
                  - generic [ref=e209]: "0"
              - region "Work surfaces" [ref=e211]:
                - region "Issue filters" [ref=e212]:
                  - generic [ref=e213]:
                    - generic [ref=e214]:
                      - text: Search
                      - textbox "Search" [ref=e215]:
                        - /placeholder: Search Issue title or number
                    - generic [ref=e216]:
                      - text: Status
                      - combobox "Status" [ref=e217]:
                        - option "All statuses" [selected]
                        - option "Ready"
                        - option "In Progress"
                    - generic [ref=e218]:
                      - text: Priority
                      - combobox "Priority" [ref=e219]:
                        - option "All priorities" [selected]
                        - option "no priority"
                        - option "urgent"
                        - option "high"
                        - option "medium"
                        - option "low"
                    - generic [ref=e220]:
                      - text: Responsible Human
                      - combobox "Responsible Human" [ref=e221]:
                        - option "All responsible" [selected]
                        - option "Alice"
                    - generic [ref=e222]:
                      - text: Project
                      - combobox "Project" [ref=e223]:
                        - option "All projects"
                        - option "Document project 1791389448135" [selected]
                    - generic [ref=e224]:
                      - text: Milestone
                      - combobox "Milestone" [ref=e225]:
                        - option "All milestones" [selected]
                    - generic [ref=e226]:
                      - text: Label
                      - textbox "Label" [ref=e227]
                    - button "Clear filters" [ref=e228] [cursor=pointer]:
                      - img [ref=e230]
                      - generic [ref=e232]: Clear filters
                  - generic [ref=e233]:
                    - generic [ref=e234]:
                      - text: Saved view
                      - combobox "Saved view" [ref=e235]:
                        - option "Saved view" [selected]
                        - option "Active"
                        - option "Backlog"
                        - option "Focused board"
                        - option "My Work"
                    - generic [ref=e236]:
                      - generic [ref=e237]: Save view name
                      - textbox "Save view name" [ref=e238]:
                        - /placeholder: Save view
                      - button "Save view" [ref=e239] [cursor=pointer]:
                        - img [ref=e241]
                        - generic [ref=e243]: Save view
                - generic "Issue layout" [ref=e244]:
                  - button "List" [pressed] [ref=e245] [cursor=pointer]:
                    - img [ref=e247]
                    - generic [ref=e249]: List
                  - button "Board" [ref=e250] [cursor=pointer]:
                    - img [ref=e252]
                    - generic [ref=e254]: Board
                  - button "Issue density" [ref=e255] [cursor=pointer]:
                    - generic [ref=e256]: Compact
                - region "Issue list" [ref=e258]:
                  - generic [ref=e259]:
                    - generic [ref=e260]:
                      - generic [ref=e261]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
                      - 'article "BASE-4: Document issue 1791389450658" [ref=e264] [cursor=pointer]':
                        - generic [ref=e265]:
                          - generic [ref=e266]: BASE-4
                          - generic [ref=e267]: Ready
                        - button "Document issue 1791389450658" [active] [ref=e268]
                        - button "Open project Document project 1791389448135" [ref=e270]:
                          - img [ref=e271]
                          - generic [ref=e273]: Document project 1791389448135
                        - generic [ref=e274]:
                          - generic [ref=e275]:
                            - generic [ref=e276]: "?"
                            - text: No responsible human
                          - generic [ref=e277]:
                            - img [ref=e278]
                            - text: No running agent
                        - generic [ref=e282]:
                          - generic [ref=e283]: Move Document issue 1791389450658
                          - combobox "Move Document issue 1791389450658" [ref=e284]:
                            - option "Ready" [selected]
                            - option "In Progress"
                    - generic [ref=e286]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | 
  3  | test('Project and Issue documents keep immutable revisions through the real Web and API', async ({ page }) => {
  4  |   const projectName = `Document project ${Date.now()}`
  5  |   await page.goto('/?view=projects')
  6  |   await page.locator('.project-rail header').getByRole('button', { name: /新建项目|New project/ }).click()
  7  |   const createProject = page.getByTestId('create-project')
  8  |   await createProject.locator('input[name="name"]').fill(projectName)
  9  |   await createProject.getByRole('button', { name: /创建项目|Create project/ }).click()
  10 |   await expect(page.locator('.wm-page-head h1')).toHaveText(projectName)
  11 | 
  12 |   await page.locator('.project-detail-pane').getByRole('button', { name: /^(文档|Documents)$/ }).click()
  13 |   const manager = page.getByTestId('document-manager')
  14 |   await expect(manager).toBeVisible()
  15 |   await manager.getByRole('button', { name: /新建文档|New document/ }).click()
  16 |   await manager.locator('input[maxlength="180"]').fill('Project brief')
  17 |   await manager.locator('textarea[name="markdown"]').fill('# Project brief\n\nFirst revision.')
  18 |   await manager.getByRole('button', { name: /保存修订|Save revision/ }).click()
  19 |   await expect(manager.locator('.wm-document-reading')).toContainText('First revision.')
  20 | 
  21 |   await manager.getByRole('tab', { name: /^(编辑|Edit)$/ }).click()
  22 |   await manager.locator('textarea[name="markdown"]').fill('# Project brief\n\nSecond revision.')
  23 |   await manager.getByRole('button', { name: /保存修订|Save revision/ }).click()
  24 |   await expect(manager.locator('.wm-document-reading')).toContainText('Second revision.')
  25 |   await manager.getByRole('tab', { name: /^(历史|History)$/ }).click()
  26 |   const revisions = manager.locator('.wm-document-history li button')
  27 |   await expect(revisions).toHaveCount(2)
  28 |   await revisions.nth(1).click()
  29 |   // Inspecting a revision shows it in the reading surface, which is a sibling of
  30 |   // the timeline rather than a child of it.
  31 |   await expect(manager.locator('.wm-document-reading')).toContainText('First revision.')
  32 |   await manager.getByRole('button', { name: /恢复此版本为新修订|Restore this version as a new revision/ }).click()
  33 |   await expect(manager.locator('.wm-document-reading')).toContainText('First revision.')
  34 |   await expect(manager.locator('.wm-document-reading small')).toContainText('r3')
  35 |   // The restore commits its visible effect before the collection refresh settles,
  36 |   // and the dialog refuses to close while a mutation is in flight. Wait for the
  37 |   // surface to report idle before asserting that Escape dismisses it - the
  38 |   // restore action itself is gone by then, because the view returns to reading.
  39 |   await expect(manager).toHaveAttribute('data-busy', 'false')
  40 |   await page.keyboard.press('Escape')
  41 |   await expect(manager).toBeHidden()
  42 | 
  43 |   await page.locator('.project-detail-pane').getByRole('button', { name: /新建 Issue|New issue/ }).click()
  44 |   const issueTitle = `Document issue ${Date.now()}`
  45 |   const createIssue = page.getByTestId('create-work-item')
  46 |   await createIssue.locator('input[name="title"]').fill(issueTitle)
  47 |   await createIssue.getByTestId('create-work-item-submit').click()
  48 |   await expect(createIssue).toBeHidden()
  49 |   await page.getByTestId('project-control-view-work').click()
  50 |   await page.locator('.project-detail-pane').getByRole('button', { name: issueTitle, exact: true }).click()
  51 |   const detail = page.locator('.work-item-detail-sheet')
> 52 |   await detail.getByRole('tab', { name: /讨论|Discussion/ }).click()
     |                                                            ^ Error: locator.click: Test timeout of 90000ms exceeded.
  53 |   await detail.getByRole('button', { name: /^(文档|Documents)$/ }).click()
  54 |   await expect(manager).toBeVisible()
  55 |   await manager.getByRole('button', { name: /新建文档|New document/ }).click()
  56 |   await manager.locator('input[maxlength="180"]').fill('Issue runbook')
  57 |   await manager.locator('textarea[name="markdown"]').fill('# Issue runbook\n\nOwned by this Issue.')
  58 |   await manager.getByRole('button', { name: /保存修订|Save revision/ }).click()
  59 |   await expect(manager.locator('.wm-document-reading')).toContainText('Owned by this Issue.')
  60 | })
  61 | 
```