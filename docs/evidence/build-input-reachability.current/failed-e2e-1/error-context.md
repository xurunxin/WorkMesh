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
    - element is not stable
  - retrying click action
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
            - button "planned Document project 1791388019586 Project overview Target date · —" [ref=e143] [cursor=pointer]:
              - generic [ref=e144]: planned
              - strong [ref=e146]: Document project 1791388019586
              - generic [ref=e147]: Project overview
              - time [ref=e148]: Target date · —
          - generic [ref=e151]:
            - generic [ref=e152]:
              - generic [ref=e153]:
                - generic [ref=e154]:
                  - heading "Document project 1791388019586" [level=1] [ref=e155]
                  - 'generic "Freshness: Updated just now" [ref=e156]': Updated just now
                - paragraph [ref=e157]: There is nothing in this Project yet.
              - generic [ref=e158]:
                - button "Edit project" [ref=e159] [cursor=pointer]:
                  - generic [ref=e160]: Edit project
                - button "Milestones" [ref=e161] [cursor=pointer]:
                  - generic [ref=e162]: Milestones
                - button "Documents" [ref=e163] [cursor=pointer]:
                  - generic [ref=e164]: Documents
                - button "New issue" [ref=e165] [cursor=pointer]:
                  - img [ref=e167]
                  - generic [ref=e169]: New issue
                - button "View Work" [ref=e170] [cursor=pointer]:
                  - img [ref=e172]
                  - generic [ref=e174]: View Work
            - generic [ref=e175]:
              - generic [ref=e176]:
                - term [ref=e177]: Project status
                - definition [ref=e178]: planned
              - generic [ref=e179]:
                - term [ref=e180]: Responsible Human
                - definition [ref=e181]: No responsible Human
              - generic [ref=e182]:
                - term [ref=e183]: Target date
                - definition [ref=e184]: "-"
              - generic [ref=e185]:
                - term [ref=e186]: Freshness
                - definition [ref=e187]: rev 1
            - generic [ref=e189]:
              - strong [ref=e190]: —
              - generic [ref=e191]: No Issues yet
            - tablist "Project navigation" [ref=e192]:
              - tab "Overview" [ref=e193]:
                - generic [ref=e194]: Overview
              - tab "Work" [selected] [ref=e195]:
                - generic [ref=e196]: Work
              - tab "Attention" [ref=e197]:
                - generic [ref=e198]: Attention
              - tab "Runs" [ref=e199]:
                - generic [ref=e200]: Runs
            - generic [ref=e202]:
              - tablist "Work" [ref=e203]:
                - tab "List" [selected] [ref=e204]:
                  - generic [ref=e205]: List
                - tab "Board" [ref=e206]:
                  - generic [ref=e207]: Board
                - tab "Backlog 0" [ref=e208]:
                  - generic [ref=e209]: Backlog
                  - generic [ref=e210]: "0"
              - region "Work surfaces" [ref=e212]:
                - region "Issue filters" [ref=e213]:
                  - generic [ref=e214]:
                    - generic [ref=e215]:
                      - text: Search
                      - textbox "Search" [ref=e216]:
                        - /placeholder: Search Issue title or number
                    - generic [ref=e217]:
                      - text: Status
                      - combobox "Status" [ref=e218]:
                        - option "All statuses" [selected]
                        - option "Ready"
                        - option "In Progress"
                    - generic [ref=e219]:
                      - text: Priority
                      - combobox "Priority" [ref=e220]:
                        - option "All priorities" [selected]
                        - option "no priority"
                        - option "urgent"
                        - option "high"
                        - option "medium"
                        - option "low"
                    - generic [ref=e221]:
                      - text: Responsible Human
                      - combobox "Responsible Human" [ref=e222]:
                        - option "All responsible" [selected]
                        - option "Alice"
                    - generic [ref=e223]:
                      - text: Project
                      - combobox "Project" [ref=e224]:
                        - option "All projects"
                        - option "Document project 1791388019586" [selected]
                    - generic [ref=e225]:
                      - text: Milestone
                      - combobox "Milestone" [ref=e226]:
                        - option "All milestones" [selected]
                    - generic [ref=e227]:
                      - text: Label
                      - textbox "Label" [ref=e228]
                    - button "Clear filters" [ref=e229] [cursor=pointer]:
                      - img [ref=e231]
                      - generic [ref=e233]: Clear filters
                  - generic [ref=e234]:
                    - generic [ref=e235]:
                      - text: Saved view
                      - combobox "Saved view" [ref=e236]:
                        - option "Saved view" [selected]
                        - option "Active"
                        - option "Backlog"
                        - option "Focused board"
                        - option "My Work"
                    - generic [ref=e237]:
                      - generic [ref=e238]: Save view name
                      - textbox "Save view name" [ref=e239]:
                        - /placeholder: Save view
                      - button "Save view" [ref=e240] [cursor=pointer]:
                        - img [ref=e242]
                        - generic [ref=e244]: Save view
                - generic "Issue layout" [ref=e245]:
                  - button "List" [pressed] [ref=e246] [cursor=pointer]:
                    - img [ref=e248]
                    - generic [ref=e250]: List
                  - button "Board" [ref=e251] [cursor=pointer]:
                    - img [ref=e253]
                    - generic [ref=e255]: Board
                  - button "Issue density" [ref=e256] [cursor=pointer]:
                    - generic [ref=e257]: Compact
                - region "Issue list" [ref=e259]:
                  - generic [ref=e260]:
                    - generic [ref=e261]:
                      - generic [ref=e262]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
                      - 'article "BASE-4: Document issue 1791388022163" [ref=e265] [cursor=pointer]':
                        - generic [ref=e266]:
                          - generic [ref=e267]: BASE-4
                          - generic [ref=e268]: Ready
                        - button "Document issue 1791388022163" [active] [ref=e269]
                        - button "Open project Document project 1791388019586" [ref=e271]:
                          - img [ref=e272]
                          - generic [ref=e274]: Document project 1791388019586
                        - generic [ref=e275]:
                          - generic [ref=e276]:
                            - generic [ref=e277]: "?"
                            - text: No responsible human
                          - generic [ref=e278]:
                            - img [ref=e279]
                            - text: No running agent
                        - generic [ref=e283]:
                          - generic [ref=e284]: Move Document issue 1791388022163
                          - combobox "Move Document issue 1791388022163" [ref=e285]:
                            - option "Ready" [selected]
                            - option "In Progress"
                    - generic [ref=e287]: Hold Control with Left or Right Arrow to move an Issue to the adjacent column.
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