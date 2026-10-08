# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stage0.spec.ts >> Stage 0 browser acceptance >> installs, manages work, synchronizes drag and mentions over SSE, and rejects child writes after team deletion
- Location: e2e\stage0.spec.ts:156:3

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'New project', exact: true }) resolved to 2 elements:
    1) <button aria-label="New project" class="wm-button wm-button-ghost ui-button ui-button-ghost">…</button> aka getByLabel('New project')
    2) <button class="wm-button wm-button-secondary ui-button ui-button-secondary">…</button> aka getByLabel('Repository configuration').getByRole('button', { name: 'New project' })

Call log:
  - waiting for getByRole('button', { name: 'New project', exact: true })

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
        - generic [ref=e18]: Alice
      - button "Collapse sidebar" [expanded] [ref=e19] [cursor=pointer]:
        - img [ref=e20]
        - generic [ref=e22]: Collapse sidebar
      - generic [ref=e24]:
        - text: Team
        - combobox "Current team" [ref=e25]:
          - option "No team" [disabled]
          - option "General (GEN)"
          - option "Stage 0 delivery edited (ACC)" [selected]
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
          - link "Projects" [active] [ref=e67] [cursor=pointer]:
            - /url: /?view=projects
            - img [ref=e69]
            - generic [ref=e71]: Projects
            - generic [ref=e72]: "0"
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
        - generic [ref=e98]: v1.0.0 · build unknown · schema 1
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
            - generic "Live" [ref=e119]:
              - generic [ref=e120]: Live
      - main [ref=e121]:
        - generic [ref=e122]:
          - complementary "Projects" [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]:
                - text: Workspace
                - heading "Projects" [level=1] [ref=e127]
              - button "New project" [ref=e128] [cursor=pointer]:
                - img [ref=e130]
            - generic [ref=e133]:
              - img [ref=e134]
              - strong [ref=e136]: No projects yet.
          - region "Repository configuration" [ref=e138]:
            - generic [ref=e139]:
              - heading "Repository configuration" [level=2] [ref=e140]
              - button "Refresh" [ref=e141] [cursor=pointer]:
                - generic [ref=e142]: Refresh
            - paragraph [ref=e143]:
              - text: Select or create a project to configure a repository.
              - button "New project" [ref=e144] [cursor=pointer]:
                - generic [ref=e145]: New project
            - paragraph [ref=e146]: No available repositories in this Team.
            - group [ref=e147]:
              - generic "Register repository" [ref=e148] [cursor=pointer]
            - group [ref=e149]:
              - generic "Create provider connection" [ref=e150] [cursor=pointer]
              - option "GitHub" [selected]
```

# Test source

```ts
  120 |   await form
  121 |     .locator('select[name="statusId"]')
  122 |     .selectOption({ label: input.status });
  123 |   await form.locator('select[name="priority"]').selectOption(input.priority);
  124 |   if (input.owner)
  125 |     await form
  126 |       .locator('select[name="ownerId"]')
  127 |       .selectOption({ label: input.owner });
  128 |   if (input.project)
  129 |     await form
  130 |       .locator('select[name="projectId"]')
  131 |       .selectOption({ label: input.project });
  132 |   if (input.labels)
  133 |     await form.getByLabel("Labels").fill(input.labels);
  134 |   await form.getByTestId("create-work-item-submit").click();
  135 |   await expect(page.getByTestId("work-list")).toContainText(input.title);
  136 | }
  137 | 
  138 | test.describe.configure({ mode: "serial" });
  139 | 
  140 | test.describe("Stage 0 browser acceptance", () => {
  141 |   // Defensive reset: the global setup drops + re-applies migrations, but if a
  142 |   // prior fixture run left the API in an installed state, the install page
  143 |   // redirects to /login and this test can never reach the form. The reset
  144 |   // endpoint is mounted only when RUN_INTEGRATION=1, so it cannot fire in
  145 |   // production.
  146 |   test.beforeAll(async ({ request }) => {
  147 |     test.setTimeout(300_000);
  148 |     const response = await request.post(`${apiUrl}/api/v1/test/reset-install`, {
  149 |       headers: { "idempotency-key": `reset-install-${randomUUID()}` },
  150 |     });
  151 |     expect(response.status(), "reset-install must succeed for the bootstrap project").toBe(200);
  152 |     const body = await response.json();
  153 |     expect(body).toMatchObject({ ok: true, reset: true });
  154 |   });
  155 | 
  156 |   test("installs, manages work, synchronizes drag and mentions over SSE, and rejects child writes after team deletion", async ({
  157 |     browser,
  158 |     page,
  159 |   }) => {
  160 |     test.setTimeout(180_000);
  161 | 
  162 |     const teamName = "Stage 0 delivery";
  163 |     const editedTeamName = "Stage 0 delivery edited";
  164 |     const projectName = "Acceptance project";
  165 |     const issueTitle = "Focus issue delivered through the real API";
  166 |     const startedDecoyTitle = "Started decoy issue";
  167 |     const unassignedDecoyTitle = "Unassigned decoy issue";
  168 |     const commentBody = "Comment delivered through the real API";
  169 | 
  170 |     await page.goto("/install");
  171 |     const install = page.getByTestId("install-form");
  172 |     await install
  173 |       .getByPlaceholder("Deployment bootstrap token")
  174 |       .fill(process.env.WORKMESH_BOOTSTRAP_TOKEN!);
  175 |     await install
  176 |       .getByPlaceholder("Workspace", { exact: true })
  177 |       .fill("Acceptance workspace");
  178 |     await install
  179 |       .getByPlaceholder("workspace-slug")
  180 |       .fill("acceptance-workspace");
  181 |     await install.getByPlaceholder("Your name").fill("Alice");
  182 |     await install.getByPlaceholder("Email").fill("alice@example.test");
  183 |     await install
  184 |       .getByPlaceholder("At least 12 characters")
  185 |       .fill("password-acceptance");
  186 |     await install.getByTestId("install-submit").click();
  187 |     await expect(page.getByRole("heading", { name: "WorkMesh" })).toBeVisible();
  188 |     const releaseInfo = page.getByTestId("release-info").first();
  189 |     await expect(releaseInfo).toContainText("v1.0.0");
  190 |     await expect(releaseInfo).toContainText("schema 1");
  191 | 
  192 |     const englishLocale = page.getByRole("button", { name: "EN", exact: true });
  193 |     await englishLocale.click();
  194 |     await expect(englishLocale).toHaveAttribute("aria-pressed", "true");
  195 | 
  196 |     await page.getByRole("link", { name: "Settings", exact: true }).click();
  197 |     await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  198 |     const teamsRegion = page.getByRole("region", { name: "Teams" });
  199 |     const createTeamForm = teamsRegion.locator("form");
  200 |     await createTeamForm.getByLabel("Team name").fill(teamName);
  201 |     await createTeamForm.getByLabel("Team key").fill("E2E");
  202 |     await createTeamForm.getByRole("button", { name: "Create team" }).click();
  203 |     const teamSwitcher = page.getByLabel("Current team").first();
  204 |     await expect(teamSwitcher).toContainText(teamName);
  205 |     await teamSwitcher.selectOption({ label: `${teamName} (E2E)` });
  206 | 
  207 |     const teamDetails = page.getByRole("region", { name: "Team details" });
  208 |     const updateTeamForm = teamDetails.locator("form");
  209 |     await updateTeamForm.getByLabel("Team name").fill(editedTeamName);
  210 |     await updateTeamForm.getByLabel("Team key").fill("ACC");
  211 |     await updateTeamForm.getByRole("button", { name: "Save changes" }).click();
  212 |     await expect(teamSwitcher).toHaveText(/Stage 0 delivery edited \(ACC\)/);
  213 | 
  214 |     // Newly created teams intentionally start without workflow states, so create the two states used by this browser flow.
  215 |     await createState(page, "Ready", "planned", { option: "Blue", value: "#2563eb" });
  216 |     await createState(page, "In Progress", "started", { option: "Custom", value: "#8b5cf6" });
  217 |     await page.getByRole("link", { name: "Back to Issues", exact: true }).click();
  218 |     await page.getByLabel("Current team").first().selectOption({ label: `${editedTeamName} (ACC)` });
  219 |     await page.getByTestId("view-projects").click();
> 220 |     await page.getByRole("button", { name: "New project", exact: true }).click();
      |                                                                          ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'New project', exact: true }) resolved to 2 elements:
  221 |     const projectForm = page.getByTestId("create-project");
  222 |     await projectForm.getByLabel("Project name").fill(projectName);
  223 |     await projectForm.getByLabel("Summary").fill("Created in the browser acceptance flow");
  224 |     await projectForm.getByRole("button", { name: "Create project" }).click();
  225 |     await expect(
  226 |       page.getByRole("heading", { name: projectName }),
  227 |     ).toBeVisible();
  228 |     await page.getByTestId("project-control-view-work").click();
  229 | 
  230 |     await createWorkItem(page, {
  231 |       title: issueTitle,
  232 |       status: "Ready",
  233 |       priority: "high",
  234 |       owner: "Alice",
  235 |       project: projectName,
  236 |       labels: "acceptance, focus",
  237 |     });
  238 |     await page
  239 |       .getByRole("region", { name: "Issue filters" })
  240 |       .getByRole("button", { name: "Clear filters" })
  241 |       .click();
  242 |     await createWorkItem(page, {
  243 |       title: startedDecoyTitle,
  244 |       status: "In Progress",
  245 |       priority: "low",
  246 |       owner: "Alice",
  247 |       project: projectName,
  248 |       labels: "other",
  249 |     });
  250 |     await createWorkItem(page, {
  251 |       title: unassignedDecoyTitle,
  252 |       status: "Ready",
  253 |       priority: "low",
  254 |       project: projectName,
  255 |       labels: "other",
  256 |     });
  257 | 
  258 |     const filters = page.getByRole("region", { name: "Issue filters" });
  259 |     await filters.getByLabel("Search", { exact: true }).fill("Focus issue");
  260 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  261 |     await expect(page.getByTestId("work-list")).not.toContainText(
  262 |       startedDecoyTitle,
  263 |     );
  264 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  265 | 
  266 |     await filters.getByLabel("Status", { exact: true }).selectOption({ label: "Ready" });
  267 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  268 |     await expect(page.getByTestId("work-list")).not.toContainText(
  269 |       startedDecoyTitle,
  270 |     );
  271 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  272 | 
  273 |     await filters.getByLabel("Priority", { exact: true }).selectOption("high");
  274 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  275 |     await expect(page.getByTestId("work-list")).not.toContainText(
  276 |       unassignedDecoyTitle,
  277 |     );
  278 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  279 | 
  280 |     await filters
  281 |       .getByLabel("Responsible Human", { exact: true })
  282 |       .selectOption({ label: "Alice" });
  283 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  284 |     await expect(page.getByTestId("work-list")).not.toContainText(
  285 |       unassignedDecoyTitle,
  286 |     );
  287 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  288 | 
  289 |     const projectFilter = filters.getByLabel("Project", { exact: true });
  290 |     await projectFilter.selectOption({ label: projectName });
  291 |     await expect(projectFilter).toHaveValue(/.+/);
  292 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  293 |     await expect(page.getByTestId("work-list")).toContainText(startedDecoyTitle);
  294 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  295 | 
  296 |     const moreFilters = filters.getByRole("button", { name: "More filters", exact: true });
  297 |     await expect(moreFilters).toHaveAttribute("aria-expanded", "false");
  298 |     await moreFilters.click();
  299 |     const labelFilter = filters.getByLabel("Label", { exact: true });
  300 |     await expect(labelFilter).toBeVisible();
  301 |     await labelFilter.fill("focus");
  302 |     await expect(page.getByTestId("work-list")).toContainText(issueTitle);
  303 |     await expect(page.getByTestId("work-list")).not.toContainText(
  304 |       startedDecoyTitle,
  305 |     );
  306 | 
  307 |     const layoutToggle = page.getByLabel("Issue layout");
  308 |     const boardLayout = layoutToggle.getByRole("button", { name: "Board", exact: true });
  309 |     const listLayout = layoutToggle.getByRole("button", { name: "List", exact: true });
  310 |     await boardLayout.click();
  311 |     await expect(boardLayout).toHaveAttribute("aria-pressed", "true");
  312 |     await filters.getByPlaceholder("Save view").fill("Focused board");
  313 |     await filters.getByRole("button", { name: "Save view" }).click();
  314 |     const savedViews = filters.getByRole("combobox", { name: "Saved view", exact: true });
  315 |     await expect(savedViews).toContainText(
  316 |       "Focused board",
  317 |     );
  318 |     await filters.getByRole("button", { name: "Clear filters" }).click();
  319 |     await listLayout.click();
  320 |     await expect(listLayout).toHaveAttribute("aria-pressed", "true");
```