# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: human-reflow.spec.ts >> project rail and shell reflow at 320x800
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
    - generic [ref=e14]:
      - banner [ref=e15]:
        - group [ref=e16]:
          - generic "Menu" [ref=e17] [cursor=pointer]
          - option "No team" [disabled]
          - option "WorkMesh Product (WM)" [selected]
        - button "Search" [ref=e19] [cursor=pointer]:
          - img [ref=e21]
          - generic [ref=e24]: Search
      - main [ref=e25]:
        - generic [ref=e26]:
          - generic [ref=e27]:
            - complementary "Projects" [ref=e28]:
              - generic [ref=e29]:
                - heading "Projects" [level=1] [ref=e31]
                - button "New project" [ref=e32] [cursor=pointer]:
                  - img [ref=e34]
              - generic [ref=e36]:
                - button "in progress Kaneo UI Adoption Responsive dogfood plan" [ref=e37] [cursor=pointer]:
                  - generic [ref=e38]: in progress
                  - strong [ref=e40]: Kaneo UI Adoption
                  - generic [ref=e41]: Responsive dogfood plan
                - button "in progress A very long secondary planning project name Responsive dogfood plan" [active] [ref=e42] [cursor=pointer]:
                  - generic [ref=e43]: in progress
                  - strong [ref=e45]: A very long secondary planning project name
                  - generic [ref=e46]: Responsive dogfood plan
                - button "in progress Another long project for local rail scrolling Responsive dogfood plan" [ref=e47] [cursor=pointer]:
                  - generic [ref=e48]: in progress
                  - strong [ref=e50]: Another long project for local rail scrolling
                  - generic [ref=e51]: Responsive dogfood plan
                - button "in progress Operations reliability acceptance Responsive dogfood plan" [ref=e52] [cursor=pointer]:
                  - generic [ref=e53]: in progress
                  - strong [ref=e55]: Operations reliability acceptance
                  - generic [ref=e56]: Responsive dogfood plan
                - button "in progress Agent collaboration interaction polish Responsive dogfood plan" [ref=e57] [cursor=pointer]:
                  - generic [ref=e58]: in progress
                  - strong [ref=e60]: Agent collaboration interaction polish
                  - generic [ref=e61]: Responsive dogfood plan
                - button "in progress Human workflow responsive recovery Responsive dogfood plan" [ref=e62] [cursor=pointer]:
                  - generic [ref=e63]: in progress
                  - strong [ref=e65]: Human workflow responsive recovery
                  - generic [ref=e66]: Responsive dogfood plan
            - generic [ref=e69]:
              - generic [ref=e70]:
                - generic [ref=e71]:
                  - generic [ref=e72]:
                    - heading "A very long secondary planning project name" [level=1] [ref=e73]
                    - 'generic "Freshness: Updated just now" [ref=e74]': Updated just now
                  - paragraph [ref=e75]: Responsive dogfood plan
                - generic [ref=e76]:
                  - button "Edit project" [ref=e77] [cursor=pointer]:
                    - generic [ref=e78]: Edit project
                  - button "Milestones" [ref=e79] [cursor=pointer]:
                    - generic [ref=e80]: Milestones
                  - button "Documents" [ref=e81] [cursor=pointer]:
                    - generic [ref=e82]: Documents
                  - button "New issue" [ref=e83] [cursor=pointer]:
                    - img [ref=e85]
                    - generic [ref=e87]: New issue
                  - button "View Work" [ref=e88] [cursor=pointer]:
                    - img [ref=e90]
                    - generic [ref=e92]: View Work
              - group [ref=e93]:
                - generic "Project description" [ref=e94] [cursor=pointer]
              - generic [ref=e95]:
                - generic [ref=e96]:
                  - term [ref=e97]: Project status
                  - definition [ref=e98]: in progress
                - generic [ref=e99]:
                  - term [ref=e100]: Responsible Human
                  - definition [ref=e101]: Alex Morgan
                - generic [ref=e102]:
                  - term [ref=e103]: Target date
                  - definition [ref=e104]: 2026-09-15
                - generic [ref=e105]:
                  - term [ref=e106]: Freshness
                  - definition [ref=e107]: rev 4
              - tablist "Project navigation" [ref=e108]:
                - tab "Overview" [selected] [ref=e109]:
                  - generic [ref=e110]: Overview
                - tab "Work" [ref=e111]:
                  - generic [ref=e112]: Work
                - tab "Attention" [ref=e113]:
                  - generic [ref=e114]: Attention
                - tab "Runs" [ref=e115]:
                  - generic [ref=e116]: Runs
              - group [ref=e117]:
                - generic "▸Project Control Center filters" [ref=e118] [cursor=pointer]
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
              - region "Project operational summary" [ref=e119]:
                - article [ref=e120]:
                  - strong [ref=e121]: "0"
                  - generic [ref=e122]: Needs You
                - article [ref=e123]:
                  - strong [ref=e124]: "0"
                  - generic [ref=e125]: Running
                - article [ref=e126]:
                  - strong [ref=e127]: "0"
                  - generic [ref=e128]: At Risk
                - article [ref=e129]:
                  - strong [ref=e130]: "0"
                  - generic [ref=e131]: Recently Verified
                - article [ref=e132]:
                  - strong [ref=e133]: "0"
                  - generic [ref=e134]: Ready
                - article [ref=e135]:
                  - strong [ref=e136]: "0"
                  - generic [ref=e137]: Blocked
              - generic [ref=e138]:
                - region "Needs You" [ref=e139]:
                  - generic [ref=e141]:
                    - heading "Needs You" [level=2] [ref=e143]
                    - generic [ref=e144]: "0"
                  - paragraph [ref=e145]: Items waiting for the responsible Human to decide or review.
                  - generic [ref=e148]: No items in this section.
                - region "Running" [ref=e149]:
                  - generic [ref=e151]:
                    - heading "Running" [level=2] [ref=e153]
                    - generic [ref=e154]: "0"
                  - paragraph [ref=e155]: Work currently being executed by Agents.
                  - generic [ref=e158]: No items in this section.
                - region "At Risk" [ref=e159]:
                  - generic [ref=e161]:
                    - heading "At Risk" [level=2] [ref=e163]
                    - generic [ref=e164]: "0"
                  - paragraph [ref=e165]: Execution that needs recovery or resynchronization.
                  - generic [ref=e168]: No items in this section.
                - region "Recently Verified" [ref=e169]:
                  - generic [ref=e171]:
                    - heading "Recently Verified" [level=2] [ref=e173]
                    - generic [ref=e174]: "0"
                  - paragraph [ref=e175]: Work with completed verification and linked evidence.
                  - generic [ref=e178]: No items in this section.
                - region "Ready" [ref=e179]:
                  - generic [ref=e181]:
                    - heading "Ready" [level=2] [ref=e183]
                    - generic [ref=e184]: "0"
                  - paragraph [ref=e185]: Work that satisfies the server-side readiness projection.
                  - generic [ref=e188]: No items in this section.
                - region "Blocked" [ref=e189]:
                  - generic [ref=e191]:
                    - heading "Blocked" [level=2] [ref=e193]
                    - generic [ref=e194]: "0"
                  - paragraph [ref=e195]: Work blocked by execution state or dependencies.
                  - generic [ref=e198]: No items in this section.
          - region "Repository configuration" [ref=e199]:
            - generic [ref=e200]:
              - heading "Repository configuration" [level=2] [ref=e201]
              - button "Refresh" [ref=e202] [cursor=pointer]:
                - generic [ref=e203]: Refresh
            - alert [ref=e204]: The configuration request did not complete. Check the result before retrying.
            - paragraph [ref=e205]: No available repositories in this Team.
            - group [ref=e206]:
              - generic "Register repository" [ref=e207] [cursor=pointer]
            - group [ref=e208]:
              - generic "Create provider connection" [ref=e209] [cursor=pointer]
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