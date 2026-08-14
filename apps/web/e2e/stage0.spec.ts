import { expect, test, type Page } from "@playwright/test";

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
  const settings = page.locator("details.team-admin");
  const form = settings.locator(
    'form:has(input[placeholder="New workflow status"])',
  );
  await form.getByPlaceholder("New workflow status").fill(name);
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
  await expect(
    page.getByTestId("create-work-item").locator('select[name="statusId"]'),
  ).toContainText(name);
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
  const form = page.getByTestId("create-work-item");
  await form.getByPlaceholder("Title").fill(input.title);
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
    await form.getByPlaceholder("labels, comma separated").fill(input.labels);
  await form.getByTestId("create-work-item-submit").click();
  await expect(page.getByTestId("work-list")).toContainText(input.title);
}

test.describe.configure({ mode: "serial" });

test.describe("Stage 0 browser acceptance", () => {
  test("installs, manages work, synchronizes drag and mentions over SSE, and rejects child writes after team deletion", async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);

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
    await expect(page.getByTestId("release-info")).toContainText("v1.0.0");
    await expect(page.getByTestId("release-info")).toContainText("schema 1");

    const settings = page.locator("details.team-admin");
    await settings.locator("summary").click();
    const createTeamForm = settings.locator(
      'form:has(input[placeholder="New team name"])',
    );
    await createTeamForm.getByPlaceholder("New team name").fill(teamName);
    await createTeamForm.getByPlaceholder("Key (e.g. ENG)").fill("E2E");
    await createTeamForm.getByRole("button", { name: "Create team" }).click();
    const teamSwitcher = page.getByLabel("Current team");
    await expect(teamSwitcher).toContainText(teamName);
    await teamSwitcher.selectOption({ label: `${teamName} (E2E)` });

    const updateTeamForm = settings.locator(
      'form:has(button:has-text("Save team"))',
    );
    await updateTeamForm.locator('input[name="name"]').fill(editedTeamName);
    await updateTeamForm.locator('input[name="key"]').fill("ACC");
    await updateTeamForm.getByRole("button", { name: "Save team" }).click();
    await expect(teamSwitcher).toHaveText(/Stage 0 delivery edited \(ACC\)/);

    // Newly created teams intentionally start without workflow states, so create the two states used by this browser flow.
    await createState(page, "Ready", "planned");
    await createState(page, "In Progress", "started");
    await expect(
      page.getByTestId("create-work-item").locator('select[name="statusId"]'),
    ).toContainText("In Progress");

    await page.getByTestId("view-projects").click();
    const projectForm = page.getByTestId("create-project");
    await projectForm.getByPlaceholder("Project name").fill(projectName);
    await projectForm
      .getByPlaceholder("Summary")
      .fill("Created in the browser acceptance flow");
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
      .getByRole("region", { name: "Work item filters" })
      .getByRole("button", { name: "Clear filters" })
      .click();
    await createWorkItem(page, {
      title: startedDecoyTitle,
      status: "In Progress",
      priority: "low",
      owner: "Alice",
      labels: "other",
    });
    await createWorkItem(page, {
      title: unassignedDecoyTitle,
      status: "Ready",
      priority: "low",
      labels: "other",
    });

    const filters = page.getByRole("region", { name: "Work item filters" });
    await filters.getByLabel("Search work").fill("Focus issue");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Filter status").selectOption({ label: "Ready" });
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Filter priority").selectOption("high");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      unassignedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Filter owner").selectOption({ label: "Alice" });
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      unassignedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters
      .getByLabel("Filter project")
      .selectOption({ label: projectName });
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();

    await filters.getByLabel("Filter label").fill("focus");
    await expect(page.getByTestId("work-list")).toContainText(issueTitle);
    await expect(page.getByTestId("work-list")).not.toContainText(
      startedDecoyTitle,
    );

    await page.getByTestId("layout-board").click();
    await filters.getByPlaceholder("Save current view").fill("Focused board");
    await filters.getByRole("button", { name: "Save view" }).click();
    await expect(filters.getByLabel("Saved views")).toContainText(
      "Focused board",
    );
    await filters.getByRole("button", { name: "Clear filters" }).click();
    await page.getByTestId("layout-list").click();
    await filters
      .getByLabel("Saved views")
      .selectOption({ label: "Focused board" });
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
      await secondPage
        .getByLabel("Current team")
        .selectOption({ label: `${editedTeamName} (ACC)` });
      await expect(secondPage.getByTestId(`work-${target!.id}`)).toBeVisible();
      await secondPage.getByTestId(`work-${target!.id}`).click();
      await expect(secondPage.getByTestId("work-item-drawer")).toBeVisible();

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

      const serverItem = await api<WorkItem>(
        page,
        `/api/v1/work-items/${target!.id}`,
      );
      expect(serverItem.status).toBe(200);
      expect(serverItem.body).toMatchObject({
        status_id: inProgress!.id,
        status_name: "In Progress",
        responsible_human_actor_id: me.body.actor.id,
      });
      await expect(
        secondPage
          .getByTestId("work-item-drawer")
          .locator('select[name="statusId"]'),
      ).toHaveValue(inProgress!.id);
      expect(secondPageNavigations).toBe(0);

      await page.getByTestId(`work-${target!.id}`).click();
      const drawer = page.getByTestId("work-item-drawer");
      await expect(drawer).toBeVisible();
      await drawer.getByPlaceholder("Write a comment").fill(commentBody);
      await drawer
        .getByLabel("Mention people")
        .selectOption({ label: "Alice" });
      await drawer.getByTestId("create-comment").click();
      await expect(drawer).toContainText(commentBody);
      await expect(secondPage.getByTestId("work-item-drawer")).toContainText(
        commentBody,
      );
      await expect(secondPage.getByTestId("work-item-drawer")).toContainText(
        "Mentioned: @Alice",
      );
      expect(secondPageNavigations).toBe(0);
      secondPage.off("framenavigated", observeNavigation);
    } finally {
      await secondContext.close();
    }

    page.once("dialog", (dialog) => dialog.accept());
    await settings.getByRole("button", { name: "Delete team" }).click();
    await expect(teamSwitcher).not.toContainText(editedTeamName);
    const childWrite = await api<ApiError>(page, "/api/v1/projects", {
      method: "POST",
      body: {
        teamId: team!.id,
        name: "Must not be created after team deletion",
      },
    });
    expect(childWrite.status).toBeGreaterThanOrEqual(400);
  });
});
