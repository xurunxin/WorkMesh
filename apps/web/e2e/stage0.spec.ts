import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type ApiResponse<T> = { status: number; body: T };
type PageResult<T> = { items: T[]; nextCursor: string | null };
type Team = { id: string; name: string; key: string; revision: number };
type State = { id: string; name: string; category: string };
type WorkItem = {
  id: string;
  title: string;
  revision: number;
  status_id: string;
  status_name: string;
  responsible_human_actor_id: string | null;
};
type ApiError = { error: { code: string } };

const apiUrl = "http://127.0.0.1:3101";
const authenticatedStatePath = resolve("test-results/.auth/admin.json");

async function api<T>(
  page: Page,
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  return page.evaluate(
    async ({ apiUrl, path, init }) => {
      const headers = new Headers(init.headers);
      if (init.body !== undefined)
        headers.set("Content-Type", "application/json");
      if (init.method && init.method !== "GET") {
        headers.set("Idempotency-Key", crypto.randomUUID());
        headers.set(
          "X-CSRF-Token",
          sessionStorage.getItem("workmesh.csrf-token") ?? "",
        );
      }
      const response = await fetch(`${apiUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: "include",
      });
      return { status: response.status, body: await response.json() };
    },
    { apiUrl, path, init },
  );
}

async function createState(
  page: Page,
  name: string,
  category: string,
): Promise<void> {
  const workflow = page.getByRole("region", { name: "Workflow states" });
  const form = workflow.locator("form");
  await form.getByLabel("Status name").fill(name);
  await form.locator('select[name="category"]').selectOption(category);
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      new URL(response.url()).pathname.match(
        /^\/api\/v1\/teams\/[^/]+\/states$/,
      ) !== null
    );
  });
  await form.getByRole("button", { name: "Create status" }).click();
  const response = await responsePromise;
  expect(response.status()).toBeGreaterThanOrEqual(200);
  expect(response.status()).toBeLessThan(300);
  await expect(workflow).toContainText(name);
}

async function createWorkItem(
  page: Page,
  input: {
    title: string;
    status: string;
    priority: string;
    owner?: string;
    project?: string;
    labels?: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: "New issue", exact: true }).click();
  const form = page.getByTestId("create-work-item");
  await form.getByLabel("Title", { exact: true }).fill(input.title);
  await form
    .locator('select[name="statusId"]')
    .selectOption({ label: input.status });
  await form.locator('select[name="priority"]').selectOption(input.priority);
  if (input.owner)
    await form
      .locator('select[name="ownerId"]')
      .selectOption({ label: input.owner });
  if (input.project)
    await form
      .locator('select[name="projectId"]')
      .selectOption({ label: input.project });
  if (input.labels)
    await form.getByLabel("Labels").fill(input.labels);
  await form.getByTestId("create-work-item-submit").click();
  await expect(page.getByTestId("work-list")).toContainText(input.title);
}

test.describe.configure({ mode: "serial" });

test.describe("Stage 0 browser acceptance", () => {
  test("installs, manages work, synchronizes drag and mentions over SSE, and rejects child writes after team deletion", async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);

    const teamName = "Stage 0 delivery";
    const editedTeamName = "Stage 0 delivery edited";
    const projectName = "Acceptance project";
    const issueTitle = "Focus issue delivered through the real API";
    const startedDecoyTitle = "Started decoy issue";
    const unassignedDecoyTitle = "Unassigned decoy issue";
    const commentBody = "Comment delivered through the real API";

    await page.goto("/install");
    const install = page.getByTestId("install-form");
    await install
      .getByPlaceholder("Deployment bootstrap token")
      .fill(process.env.WORKMESH_BOOTSTRAP_TOKEN!);
    await install
      .getByPlaceholder("Workspace", { exact: true })
      .fill("Acceptance workspace");
    await install
      .getByPlaceholder("workspace-slug")
      .fill("acceptance-workspace");
    await install.getByPlaceholder("Your name").fill("Alice");
    await install.getByPlaceholder("Email").fill("alice@example.test");
    await install
      .getByPlaceholder("At least 12 characters")
      .fill("password-acceptance");
    await install.getByTestId("install-submit").click();
    await expect(page.getByRole("heading", { name: "WorkMesh" })).toBeVisible();
    const releaseInfo = page.getByTestId("release-info").first();
    await expect(releaseInfo).toContainText("v1.0.0");
    await expect(releaseInfo).toContainText("schema 1");

    const englishLocale = page.getByRole("button", { name: "EN", exact: true });
    await englishLocale.click();
    await expect(englishLocale).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    const teamsRegion = page.getByRole("region", { name: "Teams" });
    const createTeamForm = teamsRegion.locator("form");
    await createTeamForm.getByLabel("Team name").fill(teamName);
    await createTeamForm.getByLabel("Team key").fill("E2E");
    await createTeamForm.getByRole("button", { name: "Create team" }).click();
    const teamSwitcher = page.getByLabel("Current team").first();
    await expect(teamSwitcher).toContainText(teamName);
    await teamSwitcher.selectOption({ label: `${teamName} (E2E)` });

    const teamDetails = page.getByRole("region", { name: "Team details" });
    const updateTeamForm = teamDetails.locator("form");
    await updateTeamForm.getByLabel("Team name").fill(editedTeamName);
    await updateTeamForm.getByLabel("Team key").fill("ACC");
    await updateTeamForm.getByRole("button", { name: "Save changes" }).click();
    await expect(teamSwitcher).toHaveText(/Stage 0 delivery edited \(ACC\)/);

    // Newly created teams intentionally start without workflow states, so create the two states used by this browser flow.
    await createState(page, "Ready", "planned");
    await createState(page, "In Progress", "started");
    await page.getByRole("link", { name: "Back to Issues", exact: true }).click();
    await page.getByLabel("Current team").first().selectOption({ label: `${editedTeamName} (ACC)` });
    await page.getByTestId("view-projects").click();
    await page.getByRole("button", { name: "New project", exact: true }).click();
    const projectForm = page.getByTestId("create-project");
    await projectForm.getByLabel("Project name").fill(projectName);
    await projectForm.getByLabel("Summary").fill("Created in the browser acceptance flow");
    await projectForm.getByRole("button", { name: "Create project" }).click();
    await expect(
      page.getByRole("heading", { name: projectName }),
    ).toBeVisible();

    await createWorkItem(page, {
      title: issueTitle,
      status: "Ready",
      priority: "high",
      owner: "Alice",
      project: projectName,
      labels: "acceptance, focus",
    });
    await page
      .getByRole("region", { name: "Issue filters" })
      .getByRole("button", { name: "Clear filters" })
      .click();
    await createWorkItem(page, {
      title: startedDecoyTitle,
      status: "In Progress",
      priority: "low",
      owner: "Alice",
      project: projectName,
      labels: "other",
    });
    await createWorkItem(page, {
      title: unassignedDecoyTitle,
      status: "Ready",
      priority: "low",
      project: projectName,
      labels: "other",
    });

    const filters = page.getByRole("region", { name: "Issue filters" });
    await filters.getByLabel("Search", { exact: true }).fill("Focus issue");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Status", { exact: true }).selectOption({ label: "Ready" });
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Priority", { exact: true }).selectOption("high");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      unassignedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters
      .getByLabel("Responsible Human", { exact: true })
      .selectOption({ label: "Alice" });
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      unassignedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    const projectFilter = filters.getByLabel("Project", { exact: true });
    await projectFilter.selectOption({ label: projectName });
    await expect(projectFilter).toHaveValue(/.+/);
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).toContainText(startedDecoyTitle);
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Label", { exact: true }).fill("focus");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );

    const layoutToggle = page.getByLabel("Issue layout");
    const boardLayout = layoutToggle.getByRole("button", { name: "Board", exact: true });
    const listLayout = layoutToggle.getByRole("button", { name: "List", exact: true });
    await boardLayout.click();
    await expect(boardLayout).toHaveAttribute("aria-pressed", "true");
    await filters.getByPlaceholder("Save view").fill("Focused board");
    await filters.getByRole("button", { name: "Save view" }).click();
    const savedViews = filters.getByRole("combobox", { name: "Saved view", exact: true });
    await expect(savedViews).toContainText(
      "Focused board",
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();
    await listLayout.click();
    await expect(listLayout).toHaveAttribute("aria-pressed", "true");
    await savedViews.selectOption({ label: "Focused board" });
    await expect(page.getByTestId("board")).toBeVisible();
    await expect(page.getByTestId("board")).toContainText(issueTitle);
    await expect(page.getByTestId("board")).not.toContainText(
      startedDecoyTitle,
    );

    const [teams, me] = await Promise.all([
      api<PageResult<Team>>(page, "/api/v1/teams"),
      api<{ actor: { id: string } }>(page, "/api/v1/auth/me"),
    ]);
    expect(teams.status).toBe(200);
    expect(me.status).toBe(200);
    const team = teams.body.items.find(
      (candidate) => candidate.name === editedTeamName,
    );
    expect(team).toBeDefined();
    const states = await api<PageResult<State>>(
      page,
      `/api/v1/teams/${team!.id}/states`,
    );
    const ready = states.body.items.find((state) => state.name === "Ready");
    const inProgress = states.body.items.find(
      (state) => state.name === "In Progress",
    );
    expect([ready, inProgress]).not.toContain(undefined);

    const target = (
      await api<PageResult<WorkItem>>(
        page,
        `/api/v1/work-items?teamId=${team!.id}&search=Focus%20issue`,
      )
    ).body.items.find((item) => item.title === issueTitle);
    expect(target).toBeDefined();
    const ownerInvariant = await api<ApiError>(
      page,
      `/api/v1/work-items/${target!.id}`,
      {
        method: "PATCH",
        headers: { "If-Match": `"revision-${target!.revision}"` },
        body: { statusId: inProgress!.id, responsibleHumanActorId: null },
      },
    );
    expect(ownerInvariant.status).toBe(400);
    expect(ownerInvariant.body.error.code).toBe("RESPONSIBLE_HUMAN_REQUIRED");

    const secondContext = await browser.newContext();
    try {
      const secondPage = await secondContext.newPage();
      await secondPage.goto("/login");
      const login = secondPage.getByTestId("login-form");
      await login.getByPlaceholder("Email").fill("alice@example.test");
      await login.getByPlaceholder("Password").fill("password-acceptance");
      await login.getByTestId("login-submit").click();
      const secondEnglishLocale = secondPage.getByRole("button", { name: "EN", exact: true });
      await secondEnglishLocale.click();
      await expect(secondEnglishLocale).toHaveAttribute("aria-pressed", "true");
      await secondPage
        .getByLabel("Current team")
        .first()
        .selectOption({ label: `${editedTeamName} (ACC)` });
      const secondPageItem = secondPage.locator(
        `[data-work-item-id="${target!.id}"]`,
      );
      await expect(secondPageItem).toBeVisible();
      await secondPageItem.locator(".wm-work-item-title").click();
      const secondDrawer = secondPage.getByRole("dialog");
      await expect(secondDrawer).toBeVisible();

      let secondPageNavigations = 0;
      const observeNavigation = () => {
        secondPageNavigations += 1;
      };
      secondPage.on("framenavigated", observeNavigation);

      const card = page
        .getByTestId("board")
        .locator("article")
        .filter({ hasText: issueTitle });
      const inProgressColumn = page.locator('[data-testid^="column-"]').filter({
        has: page.getByRole("heading", { name: "In Progress", exact: true }),
      });
      await card.dragTo(inProgressColumn);
      await expect(inProgressColumn).toContainText(issueTitle);

      await expect
        .poll(async () => {
          const response = await api<WorkItem>(
            page,
            `/api/v1/work-items/${target!.id}`,
          );
          return { status: response.status, ...response.body };
        })
        .toMatchObject({
          status: 200,
          status_id: inProgress!.id,
          status_name: "In Progress",
          responsible_human_actor_id: me.body.actor.id,
        });
      await expect(
        secondDrawer.locator('select[name="statusId"]'),
      ).toHaveValue(inProgress!.id);
      expect(secondPageNavigations).toBe(0);

      await page.locator(`[data-work-item-id="${target!.id}"] .wm-work-item-title`).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible();
      await drawer
        .getByRole("textbox", { name: "Work item comment" })
        .fill(commentBody);
      await drawer
        .getByLabel("Mention people")
        .selectOption({ label: "Alice" });
      await drawer.getByRole("button", { name: "Post comment" }).click();
      await expect(drawer).toContainText(commentBody);
      await expect(secondDrawer).toContainText(commentBody);
      await expect(secondDrawer).toContainText("Mentioned: @Alice");
      expect(secondPageNavigations).toBe(0);
      secondPage.off("framenavigated", observeNavigation);
      await drawer
        .getByRole("button", { name: /^Close ACC-\d+$/ })
        .click();
      await expect(drawer).toBeHidden();
    } finally {
      await secondContext.close();
    }

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.getByLabel("Current team").first().selectOption({ label: `${editedTeamName} (ACC)` });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("region", { name: "Team details" }).getByRole("button", { name: "Delete team" }).click();
    await expect(teamSwitcher).not.toContainText(editedTeamName);
    const childWrite = await api<ApiError>(page, "/api/v1/projects", {
      method: "POST",
      body: {
        teamId: team!.id,
        name: "Must not be created after team deletion",
      },
    });
    expect(childWrite.status).toBeGreaterThanOrEqual(400);

    // Leave one deterministic authenticated fixture for the dependent browser
    // project. Playwright contexts are isolated, so persist only the session
    // cookie; each page refreshes its CSRF token through /auth/me.
    const baselineTeam = await api<Team>(page, "/api/v1/teams", {
      method: "POST",
      body: { name: "Acceptance baseline", key: "BASE" },
    });
    expect(baselineTeam.status).toBe(200);
    const baselineReady = await api<State>(
      page,
      `/api/v1/teams/${baselineTeam.body.id}/states`,
      { method: "POST", body: { name: "Ready", category: "planned" } },
    );
    const baselineStarted = await api<State>(
      page,
      `/api/v1/teams/${baselineTeam.body.id}/states`,
      {
        method: "POST",
        body: { name: "In Progress", category: "started" },
      },
    );
    expect(baselineReady.status).toBe(200);
    expect(baselineStarted.status).toBe(200);
    const baselineItem = await api<WorkItem>(page, "/api/v1/work-items", {
      method: "POST",
      body: {
        teamId: baselineTeam.body.id,
        title: "Authenticated browser fixture",
        statusId: baselineStarted.body.id,
        responsibleHumanActorId: me.body.actor.id,
      },
    });
    expect(baselineItem.status).toBe(200);
    const stableActiveItem = await api<WorkItem>(page, "/api/v1/work-items", {
      method: "POST",
      body: {
        teamId: baselineTeam.body.id,
        title: "Stable active browser fixture",
        statusId: baselineStarted.body.id,
        responsibleHumanActorId: me.body.actor.id,
      },
    });
    expect(stableActiveItem.status).toBe(200);
    await mkdir(dirname(authenticatedStatePath), { recursive: true });
    await page.context().storageState({ path: authenticatedStatePath });
  });
});
