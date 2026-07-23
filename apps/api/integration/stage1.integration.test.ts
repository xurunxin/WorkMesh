import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb, hashPassword, opaqueToken, tokenHash } from "@workmesh/db";
import { buildApp } from "../src/server.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl) throw new Error("Stage 1 integration requires RUN_INTEGRATION=1 and DATABASE_URL.");
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error("Stage 1 integration requires a dedicated *test* database.");

const db = createDb(databaseUrl);
const app = buildApp();
type Response = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T };
type Human = { cookie: string; csrf: string; actorId: string };
type Agent = { id: string; installationToken: string };
type Session = { id: string; revision: number; exchangeToken: string };
let admin: Human; let teamId = ""; let readyId = ""; let workItemId = ""; let agent: Agent;

const humanCall = async (human: Human, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> => await app.inject({ method, url, payload, headers: { cookie: human.cookie, "x-csrf-token": human.csrf, "idempotency-key": randomUUID(), ...extra } }) as unknown as Response;
const agentCall = async (token: string, method: "GET" | "POST" | "PUT", url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> => await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, "idempotency-key": randomUUID(), ...extra } }) as unknown as Response;

async function registerAgent(slug: string): Promise<Agent> {
  const response = await humanCall(admin, "POST", "/api/v1/agents/register", { name: slug, slug, provider: "fake", version: "1", supportedProtocols: ["native_http"], requestedCapabilities: ["work:read", "work:write", "plan:write", "artifact:write"], approvedCapabilities: ["work:read", "work:write", "plan:write", "artifact:write"] });
  expect(response.statusCode).toBe(200);
  const body = response.json<{ id: string; installation_token: string }>();
  expect(body.installation_token).toHaveLength(43);
  const grant = await humanCall(admin, "PUT", `/api/v1/agents/${body.id}/team-access/${teamId}`, { approvedCapabilities: ["work:read", "work:write", "plan:write", "artifact:write"] });
  expect(grant.statusCode).toBe(200);
  return { id: body.id, installationToken: body.installation_token };
}
async function delegate(agentId: string, key: string = randomUUID()) {
  const input = { agentId, principalHumanActorId: admin.actorId, role: "executor", scopeType: "work_item", scopeId: workItemId, permissionsSnapshot: ["work:read", "work:write", "plan:write", "artifact:write"], capabilityScope: { workspaceId: (await db.query<{ workspace_id: string }>("SELECT workspace_id FROM work_items WHERE id=$1", [workItemId])).rows[0]!.workspace_id, teamIds: [teamId], projectIds: [], workItemIds: [workItemId], repositoryIds: [], capabilities: ["work:read", "work:write", "plan:write", "artifact:write"] } };
  return await humanCall(admin, "POST", `/api/v1/work-items/${workItemId}/delegations`, input, { "idempotency-key": key });
}
async function start(delegationId: string, key: string = randomUUID()): Promise<Session> {
  const response = await humanCall(admin, "POST", "/api/v1/agent-sessions", { delegationId, workItemId, initialPrompt: "Implement the work item", budget: {} }, { "idempotency-key": key });
  expect(response.statusCode).toBe(200); return response.json<Session>();
}
async function exchange(session: Session, installationToken: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: `/api/v1/agent-sessions/${session.id}/token/exchange`, payload: { exchangeToken: session.exchangeToken }, headers: { authorization: `Bearer ${installationToken}`, "idempotency-key": randomUUID() } });
  expect(response.statusCode).toBe(200); return response.json<{ sessionToken: string }>().sessionToken;
}
async function ackAndExecute(session: Session, token: string): Promise<{ revision: number }> {
  const ack = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/ack`, { summary: "accepted", externalUrls: [] }); expect(ack.statusCode).toBe(200);
  const acknowledged = ack.json<{ revision: number }>();
  const state = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/state`, { state: "executing", reason: "started" }, { "if-match": `"revision-${acknowledged.revision}"` }); expect(state.statusCode).toBe(200);
  return state.json<{ revision: number }>();
}

describe("Stage 1 agent API acceptance", () => {
  beforeAll(async () => {
    await applyMigrations(db); await db.query("TRUNCATE workspaces CASCADE");
    const installed = await app.inject({ method: "POST", url: "/api/v1/auth/install", payload: { name: "Stage One", slug: "stage-one", adminName: "Admin", email: "admin@example.test", password: "stage-one-password" }, headers: { "idempotency-key": "stage1-install" } });
    const cookie = (Array.isArray(installed.headers["set-cookie"]) ? installed.headers["set-cookie"][0] : installed.headers["set-cookie"])?.split(";")[0] ?? "";
    const csrf = installed.json<{ csrfToken: string }>().csrfToken;
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() } });
    admin = { cookie, csrf, actorId: me.json<{ actor: { id: string } }>().actor.id };
    const teams = await humanCall(admin, "GET", "/api/v1/teams"); teamId = teams.json<Array<{ id: string }>>()[0]!.id;
    const states = await humanCall(admin, "GET", `/api/v1/teams/${teamId}/states`); readyId = states.json<Array<{ id: string; name: string }>>().find(state => state.name === "Ready")!.id;
    const work = await humanCall(admin, "POST", "/api/v1/work-items", { teamId, title: "Stage 1 acceptance", statusId: readyId, responsibleHumanActorId: admin.actorId }); workItemId = work.json<{ id: string }>().id;
    agent = await registerAgent("acceptance-agent");
  });
  afterAll(async () => { await app.close(); await db.end(); });

  it("runs delegation, idempotent start, agent exchange, plan, question/answer, and completion evidence", async () => {
    const delegation = await delegate(agent.id); expect(delegation.statusCode).toBe(200);
    const idempotencyKey = "stage1-start-replay"; const first = await start(delegation.json<{ id: string }>().id, idempotencyKey); const replay = await start(delegation.json<{ id: string }>().id, idempotencyKey);
    expect(replay.id).toBe(first.id);
    const token = await exchange(first, agent.installationToken); let current = await ackAndExecute(first, token);
    const stepId = randomUUID(); const plan = { changeSummary: "one step", steps: [{ id: stepId, title: "Implement", ordinal: 0, dependsOn: [], acceptanceCriteria: [], expectedArtifacts: [], status: "pending" }] };
    const published = await agentCall(token, "PUT", `/api/v1/agent-sessions/${first.id}/plan`, plan, { "if-match": `"revision-${current.revision}"` }); expect(published.statusCode).toBe(200); current = published.json<{ revision: number }>();
    const conflict = await agentCall(token, "PUT", `/api/v1/agent-sessions/${first.id}/plan`, plan, { "if-match": `"revision-${current.revision - 1}"` }); expect(conflict.statusCode).toBe(409);
    const question = await agentCall(token, "POST", `/api/v1/agent-sessions/${first.id}/activities`, { kind: "question", summary: "Need clarification", artifactIds: [], references: [], visibility: "team", ephemeral: false }); expect(question.statusCode).toBe(200);
    const reply = await humanCall(admin, "POST", `/api/v1/agent-sessions/${first.id}/prompt`, { bodyMarkdown: "Proceed", planRevision: 1 }); expect(reply.statusCode).toBe(200);
    const noEvidence = await agentCall(token, "POST", `/api/v1/agent-sessions/${first.id}/complete`, { summary: "done", artifactIds: [], checks: [], limitations: [] }, { "if-match": `"revision-${reply.json<{ revision: number }>().revision}"` }); expect(noEvidence.statusCode).toBe(400);
    const done = await agentCall(token, "POST", `/api/v1/agent-sessions/${first.id}/complete`, { summary: "done", artifactIds: [], checks: [{ name: "unit", status: "passed", summary: "ok" }], limitations: [] }, { "if-match": `"revision-${reply.json<{ revision: number }>().revision}"` }); expect(done.statusCode).toBe(200);
    const delegationBody = delegation.json<{ id: string; revision: number }>(); const revoke = await humanCall(admin, "POST", `/api/v1/delegations/${delegationBody.id}/revoke`, {}, { "if-match": `"revision-${delegationBody.revision}"` }); expect(revoke.statusCode).toBe(200);
  });

  it("rejects invalid transitions, writes after stop, expired session tokens, cross-team reads, and duplicate executors", async () => {
    const secondAgent = await registerAgent("second-agent");
    const firstDelegation = await delegate(secondAgent.id); const session = await start(firstDelegation.json<{ id: string }>().id); const token = await exchange(session, secondAgent.installationToken);
    const ack = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/ack`, { summary: "ack", externalUrls: [] }); const ackRevision = ack.json<{ revision: number }>().revision;
    const invalid = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/state`, { state: "paused", reason: "invalid" }, { "if-match": `"revision-${ackRevision}"` }); expect(invalid.statusCode).toBe(409);
    const executing = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/state`, { state: "executing", reason: "run" }, { "if-match": `"revision-${ackRevision}"` });
    const stop = await humanCall(admin, "POST", `/api/v1/agent-sessions/${session.id}/signals`, { signal: "stop", reason: "halt" }, { "if-match": `"revision-${executing.json<{ revision: number }>().revision}"` }); expect(stop.statusCode).toBe(200);
    const stoppedWrite = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/activities`, { kind: "message", summary: "must fail", artifactIds: [], references: [], visibility: "team", ephemeral: false }); expect(stoppedWrite.statusCode).toBe(409);
    await db.query("UPDATE agent_session_tokens SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 second' WHERE session_id=$1", [session.id]); const expired = await agentCall(token, "POST", `/api/v1/agent-sessions/${session.id}/heartbeat`, { usage: { runtimeSeconds: 1 } }); expect(expired.statusCode).toBe(401);
    const duplicate = await delegate(agent.id); expect(duplicate.statusCode).toBe(409);
    const workspaceId = (await db.query<{ workspace_id: string }>("SELECT workspace_id FROM work_items WHERE id=$1", [workItemId])).rows[0]!.workspace_id; const outsiderId = (await db.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,workspace_role,email,display_name,password_hash) VALUES($1,'human','member',$2,'Outsider',$3) RETURNING id", [workspaceId, `outsider-${randomUUID()}@example.test`, await hashPassword("outside-password")])).rows[0]!.id; const outsiderToken = opaqueToken(); await db.query("INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 day')", [outsiderId, tokenHash(outsiderToken), opaqueToken()]);
    const forbidden = await app.inject({ method: "GET", url: `/api/v1/agent-sessions/${session.id}`, headers: { cookie: `workmesh_session=${outsiderToken}`, "idempotency-key": randomUUID() } }); expect(forbidden.statusCode).toBe(403);
  });
});
