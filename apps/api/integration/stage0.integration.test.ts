import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createDb,
  opaqueToken,
  tokenHash,
} from "@workmesh/db";
import { buildApp } from "../src/server.js";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type InstallResponse = { csrfToken: string };
type AuthResponse = { actor: { id: string } };
type Created = { id: string; revision: number };
type Page<T> = { items: T[]; nextCursor: string | null };
type WorkflowState = { id: string; name: string; color: string; revision: number };
type WorkItem = Created & {
  title: string;
  description: string | null;
  due_date: string | null;
  project_id: string | null;
  responsible_human_actor_id: string | null;
  status_name: string;
};
type Comment = Created & {
  body: string;
  parent_comment_id: string | null;
  is_resolved: boolean;
};
type Event = {
  cursor: number | string;
  aggregate_id: string;
  event_type: string;
};
type InjectResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  json: <T>() => T;
};

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl) {
  throw new Error(
    "API integration tests require RUN_INTEGRATION=1 and DATABASE_URL.",
  );
}
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error(
    "API integration tests require DATABASE_URL to name a dedicated test database.",
  );
}

const db = createDb(databaseUrl);
const app = buildApp();
let cookie = "";
let csrf = "";
let actorId = "";
let teamId = "";
let readyId = "";
let startedId = "";
let appUrl = "";

const call = async (
  method: Method,
  url: string,
  payload?: object | string,
  headers: Record<string, string> = {},
): Promise<InjectResponse> =>
  await app.inject({
    method,
    url,
    payload,
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "idempotency-key": randomUUID(),
      ...headers,
    },
  });

async function nextSseId(cursor: string): Promise<string> {
  const controller = new AbortController();
  const response = await fetch(
    `${appUrl}/api/v1/events/stream?cursor=${cursor}`,
    { headers: { cookie }, signal: controller.signal },
  );
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("SSE response did not expose a readable body");
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done)
      throw new Error("SSE stream ended before an event was received");
    text += decoder.decode(chunk.value, { stream: true });
    const eventEnd = text.indexOf("\n\n");
    if (eventEnd < 0) continue;
    const match = /^id: (\d+)$/m.exec(text.slice(0, eventEnd));
    if (!match) {
      text = text.slice(eventEnd + 2);
      continue;
    }
    await reader.cancel();
    controller.abort();
    return match[1]!;
  }
}

describe("Stage 0 PostgreSQL API acceptance", () => {
  beforeAll(async () => {
    await applyMigrations(db);
    await db.query("TRUNCATE workspaces CASCADE");
    appUrl = await app.listen({ port: 0, host: "127.0.0.1" });

    const install = await app.inject({
      method: "POST",
      url: "/api/v1/auth/install",
      payload: {
        name: "Acceptance",
        slug: "acceptance",
        adminName: "Alice",
        email: "alice@example.test",
        password: "password-acceptance",
      },
      headers: {
        "idempotency-key": "install-acceptance",
        "x-workmesh-bootstrap-token": process.env.WORKMESH_BOOTSTRAP_TOKEN!,
      },
    });
    expect(install.statusCode).toBe(200);
    const setCookie = install.headers["set-cookie"];
    const firstCookie = Array.isArray(setCookie)
      ? (setCookie[0] ?? "")
      : (setCookie ?? "");
    cookie = firstCookie.split(";")[0] ?? "";
    csrf = install.json<InstallResponse>().csrfToken;
    expect(cookie).toMatch(/^workmesh_session=/);
    expect(csrf).toHaveLength(43);

    const me = await call("GET", "/api/v1/auth/me");
    expect(me.statusCode).toBe(200);
    actorId = me.json<AuthResponse>().actor.id;
    const teams = await call("GET", "/api/v1/teams");
    teamId = teams.json<Page<{ id: string }>>().items[0]?.id ?? "";
    const states = (await call("GET", `/api/v1/teams/${teamId}/states`)).json<
      Page<WorkflowState>
    >().items;
    readyId = states.find((state) => state.name === "Ready")?.id ?? "";
    startedId = states.find((state) => state.name === "In Progress")?.id ?? "";
    expect([teamId, readyId, startedId]).not.toContain("");
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("covers authentication, idempotency, revisions, nullable patches, filtering, comments, and SSE recovery", async () => {
    const csrfFailure = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      payload: { name: "Rejected", key: "REJ" },
      headers: { cookie, "idempotency-key": "missing-csrf" },
    });
    expect(csrfFailure.statusCode).toBe(400);
    expect(csrfFailure.json<{ error: { code: string } }>().error.code).toBe(
      "CSRF_FAILED",
    );

    const project = await call("POST", "/api/v1/projects", {
      teamId,
      name: "Acceptance project",
      description: "will clear",
      leadActorId: actorId,
      targetDate: "2030-01-02",
    });
    expect(project.statusCode).toBe(200);
    const projectCreated = project.json<Created>();
    const clearedProject = await call(
      "PATCH",
      `/api/v1/projects/${projectCreated.id}`,
      { description: null, leadActorId: null, targetDate: null },
      { "if-match": `"revision-${projectCreated.revision}"` },
    );
    expect(clearedProject.statusCode).toBe(200);
    const projectDetail = await call(
      "GET",
      `/api/v1/projects/${projectCreated.id}`,
    );
    expect(
      projectDetail.json<{
        description: null;
        lead_actor_id: null;
        target_date: null;
      }>(),
    ).toMatchObject({
      description: null,
      lead_actor_id: null,
      target_date: null,
    });

    const idempotencyKey = "work-item-idempotency-replay";
    const eventsBefore = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM domain_events",
    );
    const outboxBefore = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox_events",
    );
    const workInput = {
      teamId,
      title: "Acceptance search needle",
      description: "needle body",
      statusId: readyId,
      priority: "high",
      labels: ["acceptance", "filter-tag"],
      projectId: projectCreated.id,
    };
    const firstCreate = await call("POST", "/api/v1/work-items", workInput, {
      "idempotency-key": idempotencyKey,
    });
    const replayCreate = await call("POST", "/api/v1/work-items", workInput, {
      "idempotency-key": idempotencyKey,
    });
    expect(firstCreate.statusCode).toBe(200);
    expect(replayCreate.statusCode).toBe(200);
    const created = firstCreate.json<Created>();
    expect(replayCreate.json<Created>()).toEqual(created);
    const crossEndpointReuse = await call(
      "POST",
      "/api/v1/views",
      { name: "Rejected replay", filters: {}, layout: "list" },
      { "idempotency-key": idempotencyKey },
    );
    expect(crossEndpointReuse.statusCode).toBe(409);
    const eventsAfter = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM domain_events",
    );
    const outboxAfter = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM outbox_events",
    );
    expect(eventsAfter.rows[0]?.count).toBe(
      (eventsBefore.rows[0]?.count ?? 0) + 1,
    );
    expect(outboxAfter.rows[0]?.count).toBe(
      (outboxBefore.rows[0]?.count ?? 0) + 1,
    );

    const stale = await call(
      "PATCH",
      `/api/v1/work-items/${created.id}`,
      { title: "stale" },
      { "if-match": '"revision-999"' },
    );
    expect(stale.statusCode).toBe(409);
    const noOwnerStarted = await call(
      "PATCH",
      `/api/v1/work-items/${created.id}`,
      { statusId: startedId },
      { "if-match": '"revision-1"' },
    );
    expect(noOwnerStarted.statusCode).toBe(400);
    expect(noOwnerStarted.json<{ error: { code: string } }>().error.code).toBe(
      "RESPONSIBLE_HUMAN_REQUIRED",
    );
    const started = await call(
      "PATCH",
      `/api/v1/work-items/${created.id}`,
      { statusId: startedId, responsibleHumanActorId: actorId },
      { "if-match": '"revision-1"' },
    );
    expect(started.statusCode).toBe(200);
    expect(started.headers.etag).toBe('"revision-2"');
    const readyAgain = await call(
      "PATCH",
      `/api/v1/work-items/${created.id}`,
      { statusId: readyId },
      { "if-match": '"revision-2"' },
    );
    const nullable = await call(
      "PATCH",
      `/api/v1/work-items/${created.id}`,
      {
        description: null,
        dueDate: null,
        projectId: null,
        responsibleHumanActorId: null,
      },
      { "if-match": `"revision-${readyAgain.json<Created>().revision}"` },
    );
    expect(nullable.statusCode).toBe(200);
    const item = (
      await call("GET", `/api/v1/work-items/${created.id}`)
    ).json<WorkItem>();
    expect(item).toMatchObject({
      description: null,
      due_date: null,
      project_id: null,
      responsible_human_actor_id: null,
    });

    const byLabel = (
      await call("GET", "/api/v1/work-items?label=filter-tag")
    ).json<Page<WorkItem>>().items;
    const bySearch = (
      await call("GET", "/api/v1/work-items?search=needle")
    ).json<Page<WorkItem>>().items;
    expect(byLabel.map((result) => result.id)).toContain(created.id);
    expect(bySearch.map((result) => result.id)).toContain(created.id);

    const rootComment = await call(
      "POST",
      `/api/v1/work-items/${created.id}/comments`,
      { body: "Root comment", mentions: [] },
    );
    const root = rootComment.json<Created>();
    const replyComment = await call(
      "POST",
      `/api/v1/work-items/${created.id}/comments`,
      {
        body: "Thread reply",
        parentCommentId: root.id,
        replyToCommentId: root.id,
        mentions: [],
      },
    );
    const reply = replyComment.json<Created>();
    const edited = await call(
      "PATCH",
      `/api/v1/comments/${root.id}`,
      { body: "Root comment edited" },
      { "if-match": `"revision-${root.revision}"` },
    );
    const resolved = await call(
      "PATCH",
      `/api/v1/comments/${reply.id}`,
      { isResolved: true },
      { "if-match": `"revision-${reply.revision}"` },
    );
    const deleted = await call(
      "PATCH",
      `/api/v1/comments/${reply.id}`,
      { deleted: true },
      { "if-match": `"revision-${resolved.json<Created>().revision}"` },
    );
    expect([
      edited.statusCode,
      resolved.statusCode,
      deleted.statusCode,
    ]).toEqual([200, 200, 200]);
    const visibleComments = (
      await call("GET", `/api/v1/work-items/${created.id}/comments`)
    ).json<Page<Comment>>().items;
    expect(visibleComments).toEqual([
      expect.objectContaining({ id: root.id, body: "Root comment edited" }),
    ]);
    const deletedComment = await db.query<{
      is_resolved: boolean;
      deleted_at: string | null;
    }>("SELECT is_resolved,deleted_at FROM comments WHERE id=$1", [reply.id]);
    expect(deletedComment.rows[0]).toMatchObject({ is_resolved: true });
    expect(deletedComment.rows[0]?.deleted_at).not.toBeNull();

    const cursor = String(
      (await call("GET", "/api/v1/events?cursor=0")).json<Event[]>().at(-1)
        ?.cursor ?? "0",
    );
    const exactSseCursorFloor = 9_007_199_254_740_993n;
    await db.query(
      `SELECT setval(
         'domain_events_cursor_seq',
         GREATEST($1::bigint,(
           SELECT COALESCE(max(cursor),0)+1 FROM domain_events
         )),
         false
       )`,
      [exactSseCursorFloor.toString()],
    );
    const streamCreated = await call("POST", "/api/v1/work-items", {
      teamId,
      title: "SSE reconnect",
      statusId: readyId,
      priority: "none",
      labels: [],
    });
    const streamItem = streamCreated.json<Created>();
    const firstStreamCursor = await nextSseId(cursor);
    expect(firstStreamCursor).toBe(BigInt(firstStreamCursor).toString());
    expect(BigInt(firstStreamCursor)).toBeGreaterThanOrEqual(
      exactSseCursorFloor,
    );
    expect(BigInt(firstStreamCursor)).toBeGreaterThan(BigInt(cursor));
    const streamPatch = await call(
      "PATCH",
      `/api/v1/work-items/${streamItem.id}`,
      { title: "SSE reconnect updated" },
      { "if-match": `"revision-${streamItem.revision}"` },
    );
    expect(streamPatch.statusCode).toBe(200);
    const reconnectedCursor = await nextSseId(firstStreamCursor);
    expect(BigInt(reconnectedCursor)).toBeGreaterThan(
      BigInt(firstStreamCursor),
    );

    const projectDeleted = await call(
      "DELETE",
      `/api/v1/projects/${projectCreated.id}`,
      undefined,
      { "if-match": `"revision-${clearedProject.json<Created>().revision}"` },
    );
    const workDeleted = await call(
      "DELETE",
      `/api/v1/work-items/${created.id}`,
      undefined,
      { "if-match": `"revision-${nullable.json<Created>().revision}"` },
    );
    expect([projectDeleted.statusCode, workDeleted.statusCode]).toEqual([
      200, 200,
    ]);
    expect(
      (await call("GET", "/api/v1/projects"))
        .json<Page<{ id: string }>>().items
        .map((value) => value.id),
    ).not.toContain(projectCreated.id);
    expect(
      (await call("GET", "/api/v1/work-items"))
        .json<Page<WorkItem>>().items
        .map((value) => value.id),
    ).not.toContain(created.id);
  }, 30_000);

  it("enforces membership and workspace isolation, deleted-team writes, and concurrent idempotency", async () => {
    const memberId = randomUUID();
    const memberToken = opaqueToken();
    const memberCsrf = opaqueToken();
    await db.query(
      "INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,$2,'human','member',$3,'No Membership','unused')",
      [
        memberId,
        (
          await db.query<{ workspace_id: string }>(
            "SELECT workspace_id FROM actors WHERE id=$1",
            [actorId],
          )
        ).rows[0]!.workspace_id,
        "no-membership@example.test",
      ],
    );
    await db.query(
      "INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [memberId, tokenHash(memberToken), memberCsrf],
    );
    const noMembership = await app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/states`,
      headers: { cookie: `workmesh_session=${memberToken}` },
    });
    expect(noMembership.statusCode).toBe(403);

    const otherWorkspace = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Other','other-workspace') RETURNING id",
      )
    ).rows[0]!;
    const otherActor = randomUUID();
    const otherTeam = (
      await db.query<{ id: string }>(
        "INSERT INTO teams(workspace_id,name,key) VALUES($1,'Other team','OTH') RETURNING id",
        [otherWorkspace.id],
      )
    ).rows[0]!;
    const otherToken = opaqueToken();
    const otherCsrf = opaqueToken();
    await db.query(
      "INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,$2,'human','member',$3,'Other Member','unused')",
      [otherActor, otherWorkspace.id, "other-member@example.test"],
    );
    await db.query(
      "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'member')",
      [otherWorkspace.id, otherTeam.id, otherActor],
    );
    await db.query(
      "INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [otherActor, tokenHash(otherToken), otherCsrf],
    );
    const otherHeaders = {
      cookie: `workmesh_session=${otherToken}`,
      "x-csrf-token": otherCsrf,
      "idempotency-key": randomUUID(),
      "if-match": '"revision-1"',
    };
    const crossWorkspaceRead = await app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/states`,
      headers: otherHeaders,
    });
    const crossWorkspaceWrite = await app.inject({
      method: "PATCH",
      url: `/api/v1/teams/${teamId}`,
      payload: { name: "Nope" },
      headers: otherHeaders,
    });
    expect(crossWorkspaceRead.statusCode).toBe(404);
    expect(crossWorkspaceWrite.statusCode).toBe(404);

    const temporaryTeam = await call("POST", "/api/v1/teams", {
      name: "Temporary",
      key: "TMP",
    });
    const temporary = temporaryTeam.json<Created>();
    const deletedTeam = await call(
      "DELETE",
      `/api/v1/teams/${temporary.id}`,
      undefined,
      { "if-match": `"revision-${temporary.revision}"` },
    );
    const childWrite = await call("POST", "/api/v1/projects", {
      teamId: temporary.id,
      name: "must fail",
    });
    expect(deletedTeam.statusCode).toBe(200);
    expect(childWrite.statusCode).toBeGreaterThanOrEqual(400);

    const concurrentKey = randomUUID();
    const concurrentInput = {
      teamId,
      title: "Concurrent idempotency",
      statusId: readyId,
      priority: "none",
      labels: [],
    };
    const [left, right] = await Promise.all([
      call("POST", "/api/v1/work-items", concurrentInput, {
        "idempotency-key": concurrentKey,
      }),
      call("POST", "/api/v1/work-items", concurrentInput, {
        "idempotency-key": concurrentKey,
      }),
    ]);
    expect([left.statusCode, right.statusCode]).toEqual([200, 200]);
    expect(left.json<Created>()).toEqual(right.json<Created>());
  }, 30_000);

  it("updates workflow state names and colors with revisioned idempotent event delivery", async () => {
    const beforeStates = (await call("GET", `/api/v1/teams/${teamId}/states`)).json<Page<WorkflowState>>().items;
    const ready = beforeStates.find((state) => state.id === readyId)!;
    const eventCountBefore = Number((await db.query<{ count: string }>(
      "SELECT count(*) AS count FROM domain_events WHERE aggregate_id=$1 AND event_type='workflow_state.updated'",
      [ready.id],
    )).rows[0]!.count);
    const outboxCountBefore = Number((await db.query<{ count: string }>(
      "SELECT count(*) AS count FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.aggregate_id=$1 AND event.event_type='workflow_state.updated'",
      [ready.id],
    )).rows[0]!.count);
    const key = "workflow-state-update-replay";
    const patch = { name: "Ready for QA", color: "#7C3AED" };
    const updated = await call(
      "PATCH",
      `/api/v1/teams/${teamId}/states/${ready.id}`,
      patch,
      { "if-match": `"revision-${ready.revision}"`, "idempotency-key": key },
    );
    expect(updated.statusCode).toBe(200);
    const updatedCommand = updated.json<Created>();
    expect(updatedCommand.revision).toBe(ready.revision + 1);

    const replay = await call(
      "PATCH",
      `/api/v1/teams/${teamId}/states/${ready.id}`,
      patch,
      { "if-match": `"revision-${ready.revision}"`, "idempotency-key": key },
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json<Created>()).toEqual(updatedCommand);

    const latest = (await call("GET", `/api/v1/teams/${teamId}/states`)).json<Page<WorkflowState>>().items.find(state => state.id === ready.id)!;
    expect(latest).toMatchObject({ name: patch.name, color: patch.color, revision: updatedCommand.revision });
    expect(Number((await db.query<{ count: string }>(
      "SELECT count(*) AS count FROM domain_events WHERE aggregate_id=$1 AND event_type='workflow_state.updated'",
      [ready.id],
    )).rows[0]!.count)).toBe(eventCountBefore + 1);
    expect(Number((await db.query<{ count: string }>(
      "SELECT count(*) AS count FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.aggregate_id=$1 AND event.event_type='workflow_state.updated'",
      [ready.id],
    )).rows[0]!.count)).toBe(outboxCountBefore + 1);

    const empty = await call("PATCH", `/api/v1/teams/${teamId}/states/${ready.id}`, {}, { "if-match": `"revision-${latest.revision}"` });
    const invalidColor = await call("PATCH", `/api/v1/teams/${teamId}/states/${ready.id}`, { color: "purple" }, { "if-match": `"revision-${latest.revision}"` });
    const stale = await call("PATCH", `/api/v1/teams/${teamId}/states/${ready.id}`, { name: "Stale" }, { "if-match": `"revision-${ready.revision}"` });
    const keyConflict = await call("PATCH", `/api/v1/teams/${teamId}/states/${ready.id}`, { name: "Different payload" }, { "if-match": `"revision-${latest.revision}"`, "idempotency-key": key });
    const duplicateName = await call("PATCH", `/api/v1/teams/${teamId}/states/${ready.id}`, { name: beforeStates.find(state => state.id !== ready.id)!.name }, { "if-match": `"revision-${latest.revision}"` });
    expect(empty.statusCode).toBe(400);
    expect(invalidColor.statusCode).toBe(400);
    expect(stale.statusCode).toBe(409);
    expect(keyConflict.statusCode).toBe(409);
    expect(duplicateName.statusCode).toBe(409);
  });

  it("protects the sole active team and lets admins recover zero-team workspaces", async () => {
    const workspace = (
      await db.query<{ id: string }>(
        "INSERT INTO workspaces(name,slug) VALUES('Recovery','recovery-workspace') RETURNING id",
      )
    ).rows[0]!;
    const adminId = randomUUID();
    const adminToken = opaqueToken();
    const adminCsrf = opaqueToken();
    const soleTeam = (
      await db.query<{ id: string; revision: number }>(
        "INSERT INTO teams(workspace_id,name,key) VALUES($1,'Only team','ONLY') RETURNING id,revision",
        [workspace.id],
      )
    ).rows[0]!;
    await db.query(
      "INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,$2,'human','admin',$3,'Recovery Admin','unused')",
      [adminId, workspace.id, "recovery-admin@example.test"],
    );
    await db.query(
      "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer')",
      [workspace.id, soleTeam.id, adminId],
    );
    await db.query(
      "INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
      [adminId, tokenHash(adminToken), adminCsrf],
    );
    const adminHeaders = {
      cookie: `workmesh_session=${adminToken}`,
      "x-csrf-token": adminCsrf,
      "idempotency-key": randomUUID(),
    };

    const rejectedDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${soleTeam.id}`,
      headers: {
        ...adminHeaders,
        "if-match": `"revision-${soleTeam.revision}"`,
      },
    });
    expect(rejectedDelete.statusCode).toBe(409);
    expect(
      rejectedDelete.json<{ error: { code: string } }>().error.code,
    ).toBe("LAST_ACTIVE_TEAM_CONFLICT");

    // Simulate a legacy workspace that predates the command invariant.
    await db.query("UPDATE teams SET deleted_at=now() WHERE id=$1", [
      soleTeam.id,
    ]);
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: adminHeaders,
    });
    const teams = await app.inject({
      method: "GET",
      url: "/api/v1/teams",
      headers: adminHeaders,
    });
    const recovered = await app.inject({
      method: "POST",
      url: "/api/v1/teams",
      payload: { name: "Recovered team", key: "RCV" },
      headers: { ...adminHeaders, "idempotency-key": randomUUID() },
    });
    expect(me.statusCode).toBe(200);
    expect(teams.statusCode).toBe(200);
    expect(teams.json<Page<{ id: string }>>()).toEqual({ items: [], nextCursor: null });
    expect(recovered.statusCode).toBe(200);
  });
});
