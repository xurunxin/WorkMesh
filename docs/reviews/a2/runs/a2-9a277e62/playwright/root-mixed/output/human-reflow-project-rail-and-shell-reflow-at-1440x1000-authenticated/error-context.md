# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: human-reflow.spec.ts >> project rail and shell reflow at 1440x1000
- Location: e2e\human-reflow.spec.ts:135:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 10

- Array []
+ Array [
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+   "GET /api/v1/repositories?teamId=7d13dccc-2210-44db-b030-76d56db1b998&availableOnly=true&limit=20",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e12]:
    - link "Skip to content" [ref=e13] [cursor=pointer]:
      - /url: "#workmesh-main"
    - complementary "Main navigation" [ref=e14]:
      - generic [ref=e15]:
        - strong [ref=e17]: WorkMesh
        - generic [ref=e18]: Alex Morgan
      - button "Collapse sidebar" [expanded] [ref=e19] [cursor=pointer]:
        - img [ref=e20]
        - generic [ref=e22]: Collapse sidebar
      - generic [ref=e24]:
        - text: Team
        - combobox "Current team" [ref=e25]:
          - option "No team" [disabled]
          - option "WorkMesh Product (WM)" [selected]
      - navigation "Workspace navigation" [ref=e26]:
        - generic [ref=e27]:
          - paragraph [ref=e28]: Workbench
          - link "Workbench" [ref=e29] [cursor=pointer]:
            - /url: /workbench
            - img [ref=e31]
            - generic [ref=e33]: Workbench
          - link "My work" [ref=e34] [cursor=pointer]:
            - /url: /?view=home
            - img [ref=e36]
            - generic [ref=e38]: My work
          - link "Issues" [ref=e39] [cursor=pointer]:
            - /url: /?view=my-work
            - img [ref=e41]
            - generic [ref=e43]: Issues
            - generic [ref=e44]: "0"
          - link "Guidance" [ref=e45] [cursor=pointer]:
            - /url: /?view=guidance
            - img [ref=e47]
            - generic [ref=e49]: Guidance
        - generic [ref=e50]:
          - paragraph [ref=e51]: Governance
          - link "Needs You" [ref=e52] [cursor=pointer]:
            - /url: /?view=inbox
            - img [ref=e54]
            - generic [ref=e56]: Needs You
          - link "Session" [ref=e57] [cursor=pointer]:
            - /url: /?view=sessions
            - img [ref=e59]
            - generic [ref=e61]: Session
          - link "Recovery" [ref=e62] [cursor=pointer]:
            - /url: /?view=recovery
            - img [ref=e64]
            - generic [ref=e66]: Recovery
          - link "Projects" [ref=e67] [cursor=pointer]:
            - /url: /?view=projects
            - img [ref=e69]
            - generic [ref=e71]: Projects
            - generic [ref=e72]: "6"
          - link "Agents" [ref=e73] [cursor=pointer]:
            - /url: /agents
            - img [ref=e75]
            - generic [ref=e77]: Agents
        - generic [ref=e78]:
          - paragraph [ref=e79]: Operations
          - link "Operations" [ref=e80] [cursor=pointer]:
            - /url: /operations
            - img [ref=e82]
            - generic [ref=e84]: Operations
      - navigation "Administration navigation" [ref=e85]:
        - link "Settings" [ref=e86] [cursor=pointer]:
          - /url: /settings
          - img [ref=e88]
          - generic [ref=e90]: Settings
      - generic [ref=e92]:
        - button "Sign out" [ref=e93] [cursor=pointer]:
          - img [ref=e95]
          - generic [ref=e97]: Sign out
        - generic [ref=e98]: v1.0.0 · build reflow-fixture · schema 24
    - generic [ref=e99]:
      - banner [ref=e100]:
        - paragraph [ref=e101]:
          - generic [ref=e102]: Projects
        - button "Search" [ref=e104] [cursor=pointer]:
          - img [ref=e106]
          - generic [ref=e108]:
            - generic [ref=e109]: Search
            - generic [ref=e110]: Ctrl K
        - generic [ref=e111]:
          - button "Switch to the light theme" [ref=e112]:
            - img [ref=e113]
          - generic [ref=e115]:
            - group "Language" [ref=e116]:
              - button "中" [ref=e117]
              - button "EN" [pressed] [ref=e118]
            - generic "Reconnecting" [ref=e119]:
              - generic [ref=e120]: Reconnecting
      - main [ref=e121]:
        - generic [ref=e122]:
          - generic [ref=e123]:
            - complementary "Projects" [ref=e124]:
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - text: Workspace
                  - heading "Projects" [level=1] [ref=e127]
                - button "New project" [ref=e128] [cursor=pointer]:
                  - img [ref=e130]
              - generic [ref=e132]:
                - button "in progress Kaneo UI Adoption Responsive dogfood plan Target date · 2026-09-15" [ref=e133] [cursor=pointer]:
                  - generic [ref=e134]: in progress
                  - strong [ref=e136]: Kaneo UI Adoption
                  - generic [ref=e137]: Responsive dogfood plan
                  - time [ref=e138]: Target date · 2026-09-15
                - button "in progress A very long secondary planning project name Responsive dogfood plan Target date · 2026-09-15" [active] [ref=e139] [cursor=pointer]:
                  - generic [ref=e140]: in progress
                  - strong [ref=e142]: A very long secondary planning project name
                  - generic [ref=e143]: Responsive dogfood plan
                  - time [ref=e144]: Target date · 2026-09-15
                - button "in progress Another long project for local rail scrolling Responsive dogfood plan Target date · 2026-09-15" [ref=e145] [cursor=pointer]:
                  - generic [ref=e146]: in progress
                  - strong [ref=e148]: Another long project for local rail scrolling
                  - generic [ref=e149]: Responsive dogfood plan
                  - time [ref=e150]: Target date · 2026-09-15
                - button "in progress Operations reliability acceptance Responsive dogfood plan Target date · 2026-09-15" [ref=e151] [cursor=pointer]:
                  - generic [ref=e152]: in progress
                  - strong [ref=e154]: Operations reliability acceptance
                  - generic [ref=e155]: Responsive dogfood plan
                  - time [ref=e156]: Target date · 2026-09-15
                - button "in progress Agent collaboration interaction polish Responsive dogfood plan Target date · 2026-09-15" [ref=e157] [cursor=pointer]:
                  - generic [ref=e158]: in progress
                  - strong [ref=e160]: Agent collaboration interaction polish
                  - generic [ref=e161]: Responsive dogfood plan
                  - time [ref=e162]: Target date · 2026-09-15
                - button "in progress Human workflow responsive recovery Responsive dogfood plan Target date · 2026-09-15" [ref=e163] [cursor=pointer]:
                  - generic [ref=e164]: in progress
                  - strong [ref=e166]: Human workflow responsive recovery
                  - generic [ref=e167]: Responsive dogfood plan
                  - time [ref=e168]: Target date · 2026-09-15
            - generic [ref=e171]:
              - generic [ref=e172]:
                - generic [ref=e173]:
                  - generic [ref=e174]:
                    - heading "A very long secondary planning project name" [level=1] [ref=e175]
                    - 'generic "Freshness: Updated just now" [ref=e176]': Updated just now
                  - paragraph [ref=e177]: Responsive dogfood plan
                - generic [ref=e178]:
                  - button "Edit project" [ref=e179] [cursor=pointer]:
                    - generic [ref=e180]: Edit project
                  - button "Milestones" [ref=e181] [cursor=pointer]:
                    - generic [ref=e182]: Milestones
                  - button "Documents" [ref=e183] [cursor=pointer]:
                    - generic [ref=e184]: Documents
                  - button "New issue" [ref=e185] [cursor=pointer]:
                    - img [ref=e187]
                    - generic [ref=e189]: New issue
                  - button "View Work" [ref=e190] [cursor=pointer]:
                    - img [ref=e192]
                    - generic [ref=e194]: View Work
              - group [ref=e195]:
                - generic "Project description" [ref=e196] [cursor=pointer]
              - generic [ref=e197]:
                - generic [ref=e198]:
                  - term [ref=e199]: Project status
                  - definition [ref=e200]: in progress
                - generic [ref=e201]:
                  - term [ref=e202]: Responsible Human
                  - definition [ref=e203]: Alex Morgan
                - generic [ref=e204]:
                  - term [ref=e205]: Target date
                  - definition [ref=e206]: 2026-09-15
                - generic [ref=e207]:
                  - term [ref=e208]: Freshness
                  - definition [ref=e209]: rev 4
              - tablist "Project navigation" [ref=e210]:
                - tab "Overview" [selected] [ref=e211]:
                  - generic [ref=e212]: Overview
                - tab "Work" [ref=e213]:
                  - generic [ref=e214]: Work
                - tab "Attention" [ref=e215]:
                  - generic [ref=e216]: Attention
                - tab "Runs" [ref=e217]:
                  - generic [ref=e218]: Runs
              - group [ref=e219]:
                - generic "▸Project Control Center filters" [ref=e220] [cursor=pointer]
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
              - region "Project operational summary" [ref=e221]:
                - article [ref=e222]:
                  - strong [ref=e223]: "0"
                  - generic [ref=e224]: Needs You
                - article [ref=e225]:
                  - strong [ref=e226]: "0"
                  - generic [ref=e227]: Running
                - article [ref=e228]:
                  - strong [ref=e229]: "0"
                  - generic [ref=e230]: At Risk
                - article [ref=e231]:
                  - strong [ref=e232]: "0"
                  - generic [ref=e233]: Recently Verified
                - article [ref=e234]:
                  - strong [ref=e235]: "0"
                  - generic [ref=e236]: Ready
                - article [ref=e237]:
                  - strong [ref=e238]: "0"
                  - generic [ref=e239]: Blocked
              - generic [ref=e240]:
                - region "Needs You" [ref=e241]:
                  - generic [ref=e243]:
                    - heading "Needs You" [level=2] [ref=e245]
                    - generic [ref=e246]: "0"
                  - paragraph [ref=e247]: Items waiting for the responsible Human to decide or review.
                  - generic [ref=e250]: No items in this section.
                - region "Running" [ref=e251]:
                  - generic [ref=e253]:
                    - heading "Running" [level=2] [ref=e255]
                    - generic [ref=e256]: "0"
                  - paragraph [ref=e257]: Work currently being executed by Agents.
                  - generic [ref=e260]: No items in this section.
                - region "At Risk" [ref=e261]:
                  - generic [ref=e263]:
                    - heading "At Risk" [level=2] [ref=e265]
                    - generic [ref=e266]: "0"
                  - paragraph [ref=e267]: Execution that needs recovery or resynchronization.
                  - generic [ref=e270]: No items in this section.
                - region "Recently Verified" [ref=e271]:
                  - generic [ref=e273]:
                    - heading "Recently Verified" [level=2] [ref=e275]
                    - generic [ref=e276]: "0"
                  - paragraph [ref=e277]: Work with completed verification and linked evidence.
                  - generic [ref=e280]: No items in this section.
                - region "Ready" [ref=e281]:
                  - generic [ref=e283]:
                    - heading "Ready" [level=2] [ref=e285]
                    - generic [ref=e286]: "0"
                  - paragraph [ref=e287]: Work that satisfies the server-side readiness projection.
                  - generic [ref=e290]: No items in this section.
                - region "Blocked" [ref=e291]:
                  - generic [ref=e293]:
                    - heading "Blocked" [level=2] [ref=e295]
                    - generic [ref=e296]: "0"
                  - paragraph [ref=e297]: Work blocked by execution state or dependencies.
                  - generic [ref=e300]: No items in this section.
          - region "Repository configuration" [ref=e301]:
            - generic [ref=e302]:
              - heading "Repository configuration" [level=2] [ref=e303]
              - button "Refresh" [ref=e304] [cursor=pointer]:
                - generic [ref=e305]: Refresh
            - alert [ref=e306]: The configuration request did not complete. Check the result before retrying.
            - paragraph [ref=e307]: No available repositories in this Team.
            - group [ref=e308]:
              - generic "Register repository" [ref=e309] [cursor=pointer]
            - group [ref=e310]:
              - generic "Create provider connection" [ref=e311] [cursor=pointer]
              - option "GitHub" [disabled] [selected]
```

# Test source

```ts
  106 |     if (!rail || !railList) throw new Error('Missing project rail')
  107 |     return {
  108 |       body: { clientWidth: document.body.clientWidth, scrollWidth: document.body.scrollWidth }, content: read('.content'),
  109 |       document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
  110 |       main: read('#workmesh-main'), navigation: { mobile: visible('.mobile-navigation'), sidebar: visible('.app-sidebar') },
  111 |       shell: read('.app-shell'),
  112 |       rail: { ...read('.project-rail'), display: getComputedStyle(rail).display },
  113 |       railList: { ...read('.project-rail-list'), display: getComputedStyle(railList).display, overflowX: getComputedStyle(railList).overflowX, overflowY: getComputedStyle(railList).overflowY },
  114 |       workspace: read('.app-workspace'),
  115 |     }
  116 |   })
  117 | }
  118 | 
  119 | async function tabToProjectAction(page: Page): Promise<{ height: number; left: number; right: number; top: number; width: number } | null> {
  120 |   await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  121 |   for (let index = 0; index < 48; index += 1) {
  122 |     await page.keyboard.press('Tab')
  123 |     const action = await page.evaluate(() => {
  124 |       const active = document.activeElement
  125 |       if (!(active instanceof HTMLElement) || !active.matches('#workmesh-main .project-rail button')) return null
  126 |       const value = active.getBoundingClientRect()
  127 |       return { height: value.height, left: value.left, right: value.right, top: value.top, width: value.width }
  128 |     })
  129 |     if (action) return action
  130 |   }
  131 |   return null
  132 | }
  133 | 
  134 | for (const viewport of viewports) {
  135 |   test(`project rail and shell reflow at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
  136 |     await page.setViewportSize(viewport)
  137 |     const unexpected = await installRoutes(page)
  138 |     await page.context().addCookies([{ name: 'workmesh_locale', value: 'en', url: String(testInfo.project.use.baseURL) }])
  139 |     await page.goto('/?view=projects', { waitUntil: 'domcontentloaded' })
  140 |     const rail = page.getByRole('complementary', { name: 'Projects' })
  141 |     const railList = page.locator('.project-rail-list')
  142 |     await expect(rail).toBeVisible()
  143 | 
  144 |     const geometry = await measure(page)
  145 |     expect(geometry.document.scrollWidth).toBeLessThanOrEqual(geometry.document.clientWidth)
  146 |     expect(geometry.body.scrollWidth).toBeLessThanOrEqual(geometry.body.clientWidth)
  147 |     expect(geometry.shell.scrollWidth).toBeLessThanOrEqual(geometry.shell.clientWidth)
  148 |     expect(geometry.workspace.scrollWidth).toBeLessThanOrEqual(geometry.workspace.clientWidth)
  149 |     expect(geometry.content.right).toBeLessThanOrEqual(viewport.width + .5)
  150 |     expect(geometry.main.width).toBeGreaterThan(0)
  151 |     expect(geometry.main.left).toBeGreaterThanOrEqual(-.5)
  152 |     expect(geometry.main.right).toBeLessThanOrEqual(viewport.width + .5)
  153 |     expect(geometry.navigation.mobile + geometry.navigation.sidebar).toBe(1)
  154 |     expect(geometry.navigation.mobile).toBe(viewport.width <= 760 ? 1 : 0)
  155 |     expect(geometry.navigation.sidebar).toBe(viewport.width <= 760 ? 0 : 1)
  156 |     expect(geometry.rail.display).toBe('flex')
  157 |     expect(geometry.rail.right).toBeLessThanOrEqual(viewport.width + .5)
  158 |     expect(geometry.rail.bottom).toBeLessThanOrEqual(viewport.height + .5)
  159 | 
  160 |     const projectAction = await tabToProjectAction(page)
  161 |     expect(projectAction).not.toBeNull()
  162 |     expect(projectAction!.width).toBeGreaterThan(0)
  163 |     expect(projectAction!.height).toBeGreaterThanOrEqual(viewport.width <= 760 ? 40 : 36)
  164 |     expect(projectAction!.left).toBeGreaterThanOrEqual(-.5)
  165 |     expect(projectAction!.right).toBeLessThanOrEqual(viewport.width + .5)
  166 | 
  167 |     if (geometry.railList.display === 'flex') {
  168 |       expect(geometry.railList.overflowX).toBe('auto')
  169 |       expect(geometry.railList.scrollWidth).toBeGreaterThan(geometry.railList.clientWidth)
  170 |       await railList.evaluate(element => { element.scrollLeft = element.scrollWidth })
  171 |       await expect.poll(() => railList.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  172 |       await railList.evaluate(element => { element.scrollLeft = 0 })
  173 |     } else {
  174 |       expect(geometry.railList.display).toBe('grid')
  175 |       expect(geometry.railList.overflowY).toBe('auto')
  176 |     }
  177 | 
  178 |     if (viewport.width <= 760) {
  179 |       const controls = await page.locator('.mobile-navigation summary, #workmesh-main .page-actions .wm-button, .project-rail .wm-button, .mobile-navigation select').evaluateAll(elements => elements.flatMap(element => {
  180 |         const value = element.getBoundingClientRect()
  181 |         const style = getComputedStyle(element)
  182 |         return style.display === 'none' || style.visibility === 'hidden' || value.width === 0 || value.height === 0
  183 |           ? [] : [{ label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName, height: value.height, width: value.width }]
  184 |       }))
  185 |       expect(controls.length).toBeGreaterThan(0)
  186 |       expect(
  187 |         controls.filter(control => control.height < 40 || control.width < 40),
  188 |         'visible mobile controls smaller than 40px',
  189 |       ).toEqual([])
  190 |     }
  191 | 
  192 |     const child = rail.getByRole('button', { name: /secondary planning project/i })
  193 |     await child.focus()
  194 |     await page.keyboard.press('Enter')
  195 |     await expect(page).toHaveURL(new RegExp(`project=${projects[1]!.id}`))
  196 |     await expect(page.getByRole('heading', { name: projects[1]!.name })).toBeVisible()
  197 | 
  198 |     const resolved = await measure(page)
  199 |     expect(resolved.document.scrollWidth).toBeLessThanOrEqual(resolved.document.clientWidth)
  200 |     if (viewport.width === 1920) {
  201 |       const leftMargin = resolved.content.left - resolved.workspace.left
  202 |       const rightMargin = resolved.workspace.right - resolved.content.right
  203 |       expect(Math.abs(resolved.content.width - resolved.workspace.width)).toBeLessThanOrEqual(1)
  204 |       expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(2)
  205 |     }
> 206 |     expect(unexpected).toEqual([])
      |                        ^ Error: expect(received).toEqual(expected) // deep equality
  207 |     await persistEvidence(page, testInfo, `project-rail-${viewport.width}x${viewport.height}`, { initial: geometry, projectAction, resolved, unexpected })
  208 |   })
  209 | }
  210 | 
```