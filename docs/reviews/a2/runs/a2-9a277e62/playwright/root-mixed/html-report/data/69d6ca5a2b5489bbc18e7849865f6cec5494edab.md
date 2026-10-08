# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: human-reflow.spec.ts >> project rail and shell reflow at 760x900
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
        - generic [ref=e25]:
          - button "Switch to the light theme" [ref=e26]:
            - img [ref=e27]
          - generic [ref=e29]:
            - group "Language" [ref=e30]:
              - button "中" [ref=e31]
              - button "EN" [pressed] [ref=e32]
            - generic "Reconnecting" [ref=e33]:
              - generic [ref=e34]: Reconnecting
      - main [ref=e35]:
        - generic [ref=e36]:
          - generic [ref=e37]:
            - complementary "Projects" [ref=e38]:
              - generic [ref=e39]:
                - heading "Projects" [level=1] [ref=e41]
                - button "New project" [ref=e42] [cursor=pointer]:
                  - img [ref=e44]
              - generic [ref=e46]:
                - button "in progress Kaneo UI Adoption Responsive dogfood plan" [ref=e47] [cursor=pointer]:
                  - generic [ref=e48]: in progress
                  - strong [ref=e50]: Kaneo UI Adoption
                  - generic [ref=e51]: Responsive dogfood plan
                - button "in progress A very long secondary planning project name Responsive dogfood plan" [active] [ref=e52] [cursor=pointer]:
                  - generic [ref=e53]: in progress
                  - strong [ref=e55]: A very long secondary planning project name
                  - generic [ref=e56]: Responsive dogfood plan
                - button "in progress Another long project for local rail scrolling Responsive dogfood plan" [ref=e57] [cursor=pointer]:
                  - generic [ref=e58]: in progress
                  - strong [ref=e60]: Another long project for local rail scrolling
                  - generic [ref=e61]: Responsive dogfood plan
                - button "in progress Operations reliability acceptance Responsive dogfood plan" [ref=e62] [cursor=pointer]:
                  - generic [ref=e63]: in progress
                  - strong [ref=e65]: Operations reliability acceptance
                  - generic [ref=e66]: Responsive dogfood plan
                - button "in progress Agent collaboration interaction polish Responsive dogfood plan" [ref=e67] [cursor=pointer]:
                  - generic [ref=e68]: in progress
                  - strong [ref=e70]: Agent collaboration interaction polish
                  - generic [ref=e71]: Responsive dogfood plan
                - button "in progress Human workflow responsive recovery Responsive dogfood plan" [ref=e72] [cursor=pointer]:
                  - generic [ref=e73]: in progress
                  - strong [ref=e75]: Human workflow responsive recovery
                  - generic [ref=e76]: Responsive dogfood plan
            - generic [ref=e79]:
              - generic [ref=e80]:
                - generic [ref=e81]:
                  - generic [ref=e82]:
                    - heading "A very long secondary planning project name" [level=1] [ref=e83]
                    - 'generic "Freshness: Updated just now" [ref=e84]': Updated just now
                  - paragraph [ref=e85]: Responsive dogfood plan
                - generic [ref=e86]:
                  - button "Edit project" [ref=e87] [cursor=pointer]:
                    - generic [ref=e88]: Edit project
                  - button "Milestones" [ref=e89] [cursor=pointer]:
                    - generic [ref=e90]: Milestones
                  - button "Documents" [ref=e91] [cursor=pointer]:
                    - generic [ref=e92]: Documents
                  - button "New issue" [ref=e93] [cursor=pointer]:
                    - img [ref=e95]
                    - generic [ref=e97]: New issue
                  - button "View Work" [ref=e98] [cursor=pointer]:
                    - img [ref=e100]
                    - generic [ref=e102]: View Work
              - group [ref=e103]:
                - generic "Project description" [ref=e104] [cursor=pointer]
              - generic [ref=e105]:
                - generic [ref=e106]:
                  - term [ref=e107]: Project status
                  - definition [ref=e108]: in progress
                - generic [ref=e109]:
                  - term [ref=e110]: Responsible Human
                  - definition [ref=e111]: Alex Morgan
                - generic [ref=e112]:
                  - term [ref=e113]: Target date
                  - definition [ref=e114]: 2026-09-15
                - generic [ref=e115]:
                  - term [ref=e116]: Freshness
                  - definition [ref=e117]: rev 4
              - tablist "Project navigation" [ref=e118]:
                - tab "Overview" [selected] [ref=e119]:
                  - generic [ref=e120]: Overview
                - tab "Work" [ref=e121]:
                  - generic [ref=e122]: Work
                - tab "Attention" [ref=e123]:
                  - generic [ref=e124]: Attention
                - tab "Runs" [ref=e125]:
                  - generic [ref=e126]: Runs
              - group [ref=e127]:
                - generic "▸Project Control Center filters" [ref=e128] [cursor=pointer]
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
              - region "Project operational summary" [ref=e129]:
                - article [ref=e130]:
                  - strong [ref=e131]: "0"
                  - generic [ref=e132]: Needs You
                - article [ref=e133]:
                  - strong [ref=e134]: "0"
                  - generic [ref=e135]: Running
                - article [ref=e136]:
                  - strong [ref=e137]: "0"
                  - generic [ref=e138]: At Risk
                - article [ref=e139]:
                  - strong [ref=e140]: "0"
                  - generic [ref=e141]: Recently Verified
                - article [ref=e142]:
                  - strong [ref=e143]: "0"
                  - generic [ref=e144]: Ready
                - article [ref=e145]:
                  - strong [ref=e146]: "0"
                  - generic [ref=e147]: Blocked
              - generic [ref=e148]:
                - region "Needs You" [ref=e149]:
                  - generic [ref=e151]:
                    - heading "Needs You" [level=2] [ref=e153]
                    - generic [ref=e154]: "0"
                  - paragraph [ref=e155]: Items waiting for the responsible Human to decide or review.
                  - generic [ref=e158]: No items in this section.
                - region "Running" [ref=e159]:
                  - generic [ref=e161]:
                    - heading "Running" [level=2] [ref=e163]
                    - generic [ref=e164]: "0"
                  - paragraph [ref=e165]: Work currently being executed by Agents.
                  - generic [ref=e168]: No items in this section.
                - region "At Risk" [ref=e169]:
                  - generic [ref=e171]:
                    - heading "At Risk" [level=2] [ref=e173]
                    - generic [ref=e174]: "0"
                  - paragraph [ref=e175]: Execution that needs recovery or resynchronization.
                  - generic [ref=e178]: No items in this section.
                - region "Recently Verified" [ref=e179]:
                  - generic [ref=e181]:
                    - heading "Recently Verified" [level=2] [ref=e183]
                    - generic [ref=e184]: "0"
                  - paragraph [ref=e185]: Work with completed verification and linked evidence.
                  - generic [ref=e188]: No items in this section.
                - region "Ready" [ref=e189]:
                  - generic [ref=e191]:
                    - heading "Ready" [level=2] [ref=e193]
                    - generic [ref=e194]: "0"
                  - paragraph [ref=e195]: Work that satisfies the server-side readiness projection.
                  - generic [ref=e198]: No items in this section.
                - region "Blocked" [ref=e199]:
                  - generic [ref=e201]:
                    - heading "Blocked" [level=2] [ref=e203]
                    - generic [ref=e204]: "0"
                  - paragraph [ref=e205]: Work blocked by execution state or dependencies.
                  - generic [ref=e208]: No items in this section.
          - region "Repository configuration" [ref=e209]:
            - generic [ref=e210]:
              - heading "Repository configuration" [level=2] [ref=e211]
              - button "Refresh" [ref=e212] [cursor=pointer]:
                - generic [ref=e213]: Refresh
            - alert [ref=e214]: The configuration request did not complete. Check the result before retrying.
            - paragraph [ref=e215]: No available repositories in this Team.
            - group [ref=e216]:
              - generic "Register repository" [ref=e217] [cursor=pointer]
            - group [ref=e218]:
              - generic "Create provider connection" [ref=e219] [cursor=pointer]
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