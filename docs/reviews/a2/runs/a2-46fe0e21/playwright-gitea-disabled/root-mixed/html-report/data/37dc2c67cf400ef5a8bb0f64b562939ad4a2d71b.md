# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stage0.spec.ts >> Stage 0 browser acceptance >> installs, manages work, synchronizes drag and mentions over SSE, and rejects child writes after team deletion
- Location: e2e\stage0.spec.ts:156:3

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByRole('region', { name: 'Team details' }).getByRole('textbox', { name: 'Team name' })
Expected: "Stage 0 delivery edited"
Received: "General"
Timeout:  10000ms

Call log:
  - Expect "toHaveValue" with timeout 10000ms
  - waiting for getByRole('region', { name: 'Team details' }).getByRole('textbox', { name: 'Team name' })
    23 × locator resolved to <input required="" name="name" value="General"/>
       - unexpected value "General"

```

```yaml
- textbox "Team name": General
```

# Test source

```ts
  369 |       { name: "workmesh_locale", value: "en", url: webUrl },
  370 |     ]);
  371 |     try {
  372 |       const secondPage = await secondContext.newPage();
  373 |       await secondPage.goto("/login");
  374 |       const login = secondPage.getByTestId("login-form");
  375 |       await login.getByPlaceholder("Email").fill("alice@example.test");
  376 |       await login.getByPlaceholder("Password").fill("password-acceptance");
  377 |       await login.getByTestId("login-submit").click();
  378 |       // 等待默认落点的 canonical 重定向，避免旧首页的异步 replace 覆盖随后点击。
  379 |       await secondPage.waitForURL((url) => url.pathname === "/workbench");
  380 |       // Address the surface this test is about. Signing in lands on the
  381 |       // default landing, which is the Agent workbench, not the Issues list.
  382 |       await secondPage.getByTestId("view-my-work").click();
  383 |       await secondPage.waitForURL(
  384 |         (url) => url.pathname === "/" && url.searchParams.get("view") === "my-work",
  385 |       );
  386 |       const secondEnglishLocale = secondPage.getByRole("button", { name: "EN", exact: true });
  387 |       await secondEnglishLocale.click();
  388 |       await expect(secondEnglishLocale).toHaveAttribute("aria-pressed", "true");
  389 |       await secondPage
  390 |         .getByLabel("Current team")
  391 |         .first()
  392 |         .selectOption({ label: `${editedTeamName} (ACC)` });
  393 |       const secondPageItem = secondPage.locator(
  394 |         `[data-work-item-id="${target!.id}"]`,
  395 |       );
  396 |       await expect(secondPageItem).toBeVisible();
  397 |       await secondPageItem.locator(".wm-work-item-title").click();
  398 |       const secondDrawer = secondPage.getByRole("dialog");
  399 |       await expect(secondDrawer).toBeVisible();
  400 |       await secondDrawer
  401 |         .getByRole("tab", { name: "Details", exact: true })
  402 |         .click();
  403 | 
  404 |       let secondPageDocumentNavigations = 0;
  405 |       const observeNavigation = (request: Request) => {
  406 |         if (request.isNavigationRequest() && request.frame() === secondPage.mainFrame()) {
  407 |           secondPageDocumentNavigations += 1;
  408 |         }
  409 |       };
  410 |       secondPage.on("request", observeNavigation);
  411 | 
  412 |       const card = page
  413 |         .getByTestId("board")
  414 |         .locator("article")
  415 |         .filter({ hasText: issueTitle });
  416 |       const inProgressColumn = page.locator('[data-testid^="column-"]').filter({
  417 |         has: page.getByRole("heading", { name: "In Progress", exact: true }),
  418 |       });
  419 |       await card.dragTo(inProgressColumn);
  420 |       await expect(inProgressColumn).toContainText(issueTitle);
  421 | 
  422 |       await expect
  423 |         .poll(async () => {
  424 |           const response = await api<WorkItem>(
  425 |             page,
  426 |             `/api/v1/work-items/${target!.id}`,
  427 |           );
  428 |           return { status: response.status, ...response.body };
  429 |         })
  430 |         .toMatchObject({
  431 |           status: 200,
  432 |           status_id: inProgress!.id,
  433 |           status_name: "In Progress",
  434 |           responsible_human_actor_id: me.body.actor.id,
  435 |         });
  436 |       await expect(
  437 |         secondDrawer.locator('select[name="statusId"]'),
  438 |       ).toHaveValue(inProgress!.id);
  439 |       expect(secondPageDocumentNavigations).toBe(0);
  440 |       await secondDrawer.getByRole("tab", { name: "Discussion", exact: true }).click();
  441 | 
  442 |       await page.locator(`[data-work-item-id="${target!.id}"] .wm-work-item-title`).click();
  443 |       const drawer = page.getByRole("dialog");
  444 |       await expect(drawer).toBeVisible();
  445 |       await drawer.getByRole("tab", { name: "Discussion", exact: true }).click();
  446 |       await drawer
  447 |         .getByRole("textbox", { name: "Work item comment" })
  448 |         .fill(commentBody);
  449 |       await drawer
  450 |         .getByLabel("Mention people")
  451 |         .selectOption({ label: "Alice" });
  452 |       await drawer.getByRole("button", { name: "Post comment" }).click();
  453 |       await expect(drawer).toContainText(commentBody);
  454 |       await expect(secondDrawer).toContainText(commentBody);
  455 |       await expect(secondDrawer).toContainText("Mentioned: @Alice");
  456 |       expect(secondPageDocumentNavigations).toBe(0);
  457 |       secondPage.off("request", observeNavigation);
  458 |       await drawer
  459 |         .getByRole("button", { name: /^Close ACC-\d+$/ })
  460 |         .click();
  461 |       await expect(drawer).toBeHidden();
  462 |     } finally {
  463 |       await secondContext.close();
  464 |     }
  465 | 
  466 |     await page.getByRole("link", { name: "Settings", exact: true }).click();
  467 |     await page.getByLabel("Current team").first().selectOption({ label: `${editedTeamName} (ACC)` });
  468 |     const deleteTeamDetails = page.getByRole("region", { name: "Team details" });
> 469 |     await expect(deleteTeamDetails.getByRole("textbox", { name: "Team name" })).toHaveValue(editedTeamName);
      |                                                                                 ^ Error: expect(locator).toHaveValue(expected) failed
  470 |     await deleteTeamDetails.getByRole("button", { name: "Delete team" }).click();
  471 |     const deleteDialog = page.getByRole("dialog", { name: "Delete Team" });
  472 |     await expect(deleteDialog).toContainText(editedTeamName);
  473 |     await deleteDialog.getByRole("button", { name: `Delete Team ${editedTeamName}` }).click();
  474 |     await expect(teamSwitcher).not.toContainText(editedTeamName);
  475 |     const childWrite = await api<ApiError>(page, "/api/v1/projects", {
  476 |       method: "POST",
  477 |       body: {
  478 |         teamId: team!.id,
  479 |         name: "Must not be created after team deletion",
  480 |       },
  481 |     });
  482 |     expect(childWrite.status).toBeGreaterThanOrEqual(400);
  483 | 
  484 |     // Leave one deterministic authenticated fixture for the dependent browser
  485 |     // project. Playwright contexts are isolated, so persist only the session
  486 |     // cookie; each page refreshes its CSRF token through /auth/me.
  487 |     const baselineTeam = await api<Team>(page, "/api/v1/teams", {
  488 |       method: "POST",
  489 |       body: { name: "Acceptance baseline", key: "BASE" },
  490 |     });
  491 |     expect(baselineTeam.status).toBe(200);
  492 |     const baselineReady = await api<State>(
  493 |       page,
  494 |       `/api/v1/teams/${baselineTeam.body.id}/states`,
  495 |       { method: "POST", body: { name: "Ready", category: "planned" } },
  496 |     );
  497 |     const baselineStarted = await api<State>(
  498 |       page,
  499 |       `/api/v1/teams/${baselineTeam.body.id}/states`,
  500 |       {
  501 |         method: "POST",
  502 |         body: { name: "In Progress", category: "started" },
  503 |       },
  504 |     );
  505 |     expect(baselineReady.status).toBe(200);
  506 |     expect(baselineStarted.status).toBe(200);
  507 |     const baselineItem = await api<WorkItem>(page, "/api/v1/work-items", {
  508 |       method: "POST",
  509 |       body: {
  510 |         teamId: baselineTeam.body.id,
  511 |         title: "Authenticated browser fixture",
  512 |         statusId: baselineStarted.body.id,
  513 |         responsibleHumanActorId: me.body.actor.id,
  514 |       },
  515 |     });
  516 |     expect(baselineItem.status).toBe(200);
  517 |     const stableActiveItem = await api<WorkItem>(page, "/api/v1/work-items", {
  518 |       method: "POST",
  519 |       body: {
  520 |         teamId: baselineTeam.body.id,
  521 |         title: "Stable active browser fixture",
  522 |         statusId: baselineStarted.body.id,
  523 |         responsibleHumanActorId: me.body.actor.id,
  524 |       },
  525 |     });
  526 |     expect(stableActiveItem.status).toBe(200);
  527 |     await mkdir(dirname(authenticatedStatePath), { recursive: true });
  528 |     await page.context().storageState({ path: authenticatedStatePath });
  529 |   });
  530 | });
  531 | 
```