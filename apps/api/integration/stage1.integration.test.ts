import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, createDb, hashPassword, opaqueToken, tokenHash } from "@workmesh/db";
import { buildApp } from "../src/server.js";
import type { AuthRateLimitStore } from "../src/auth-rate-limit/redis-store.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl) throw new Error("Stage 1 integration requires RUN_INTEGRATION=1 and DATABASE_URL.");
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1))) throw new Error("Stage 1 integration requires a dedicated *test* database.");

const db = createDb(databaseUrl);
type Page<T> = { items: T[]; nextCursor: string | null };
class SwitchableRateLimitStore implements AuthRateLimitStore {
  calls = 0;
  offline = false;
  async eval(script: string): Promise<unknown> {
    this.calls += 1;
    if (this.offline) throw new Error("simulated Redis outage");
    if (script.includes("HINCRBY")) return [1, 500];
    if (script.includes("redis.call('DEL'")) return 1;
    return [1, 0];
  }
  async set(): Promise<string | null> {
    if (this.offline) throw new Error("simulated Redis outage");
    return "OK";
  }
  async close(): Promise<void> {}
}
const rateLimitStore = new SwitchableRateLimitStore();
const app = buildApp({ authRateLimitStore: rateLimitStore });
type Response = { statusCode: number; headers: Record<string, string | string[] | number | undefined>; json: <T>() => T };
type Human = { cookie: string; csrf: string; actorId: string };
type Agent = { id: string; installationToken: string };
type Session = { id: string; revision: number; exchangeToken: string };
let admin: Human; let teamId = ""; let readyId = ""; let workItemId = ""; let agent: Agent;
let appUrl = "";

const humanCall = async (human: Human, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> => await app.inject({ method, url, payload, headers: { cookie: human.cookie, "x-csrf-token": human.csrf, "idempotency-key": randomUUID(), ...extra } }) as unknown as Response;
const agentCall = async (token: string, method: "GET" | "POST" | "PUT", url: string, payload?: object, extra: Record<string, string> = {}): Promise<Response> => await app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}`, "idempotency-key": randomUUID(), ...extra } }) as unknown as Response;
const percentile = (sorted: readonly number[], ratio: number): number =>
  sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
const openHttpConnections = async (): Promise<number> =>
  await new Promise((resolve, reject) =>
    app.server.getConnections((error, count) =>
      error ? reject(error) : resolve(count),
    ),
  );
const heartbeatStorageMetrics = async (sessionId: string) => (
  await db.query<{
    dedupeRows: string;
    databaseBytes: string;
    heartbeatTableBytes: string;
    databaseConnections: string;
  }>(
    `SELECT
       (SELECT count(*) FROM heartbeat_idempotency_keys
         WHERE resource_kind='session' AND resource_id=$1)::text AS "dedupeRows",
       pg_database_size(current_database())::text AS "databaseBytes",
       pg_total_relation_size('heartbeat_idempotency_keys')::text AS "heartbeatTableBytes",
       (SELECT count(*) FROM pg_stat_activity
         WHERE datname=current_database())::text AS "databaseConnections"`,
    [sessionId],
  )
).rows[0]!;

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
    appUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const installed = await app.inject({ method: "POST", url: "/api/v1/auth/install", payload: { name: "Stage One", slug: "stage-one", adminName: "Admin", email: "admin@example.test", password: "stage-one-password" }, headers: { "idempotency-key": "stage1-install", "x-workmesh-bootstrap-token": process.env.WORKMESH_BOOTSTRAP_TOKEN! } });
    const cookie = (Array.isArray(installed.headers["set-cookie"]) ? installed.headers["set-cookie"][0] : installed.headers["set-cookie"])?.split(";")[0] ?? "";
    const csrf = installed.json<{ csrfToken: string }>().csrfToken;
    const me = await app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie, "x-csrf-token": csrf, "idempotency-key": randomUUID() } });
    admin = { cookie, csrf, actorId: me.json<{ actor: { id: string } }>().actor.id };
    const teams = await humanCall(admin, "GET", "/api/v1/teams"); teamId = teams.json<Page<{ id: string }>>().items[0]!.id;
    const states = await humanCall(admin, "GET", `/api/v1/teams/${teamId}/states`); readyId = states.json<Page<{ id: string; name: string }>>().items.find(state => state.name === "Ready")!.id;
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

  it(
    "keeps steady heartbeats bounded and emits a concurrent health recovery once",
    async () => {
      const pulseCount = process.env.RUN_HEARTBEAT_LOAD === "1" ? 10_000 : 250;
      const previousWorkItemId = workItemId;
      const work = await humanCall(admin, "POST", "/api/v1/work-items", {
        teamId,
        title: "Bounded heartbeat projection",
        statusId: readyId,
        responsibleHumanActorId: admin.actorId,
      });
      workItemId = work.json<{ id: string }>().id;
      const heartbeatAgent = await registerAgent(
        `heartbeat-agent-${randomUUID()}`,
      );
      const delegation = await delegate(heartbeatAgent.id);
      const session = await start(delegation.json<{ id: string }>().id);
      const token = await exchange(session, heartbeatAgent.installationToken);
      await ackAndExecute(session, token);
      const sessionK1 = randomUUID();
      const sessionK2 = randomUUID();
      expect((await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        { usage: { runtimeSeconds: 10 } },
        { "idempotency-key": sessionK1 },
      )).statusCode).toBe(200);
      expect((await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        { usage: { runtimeSeconds: 20 } },
        { "idempotency-key": sessionK2 },
      )).statusCode).toBe(200);
      const sessionRetry = await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        { usage: { runtimeSeconds: 10 } },
        { "idempotency-key": sessionK1 },
      );
      expect(sessionRetry.statusCode).toBe(200);
      expect(
        (await db.query<{ runtime_seconds: string }>(
          "SELECT heartbeat_usage->>'runtimeSeconds' AS runtime_seconds FROM agent_sessions WHERE id=$1",
          [session.id],
        )).rows[0]?.runtime_seconds,
      ).toBe("20");
      const sessionMismatch = await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        { usage: { runtimeSeconds: 11 } },
        { "idempotency-key": sessionK1 },
      );
      expect(sessionMismatch.statusCode).toBe(409);
      expect(sessionMismatch.json<{ error: { code: string } }>().error.code)
        .toBe("IDEMPOTENCY_KEY_REUSED");

      const acquired = await agentCall(
        token,
        "POST",
        "/api/v1/leases",
        {
          sessionId: session.id,
          resourceType: "work_item",
          resourceId: workItemId,
          kind: "exclusive",
          reason: "Heartbeat ordering coverage",
          ttlSeconds: 300,
        },
      );
      expect(acquired.statusCode).toBe(200);
      const leaseId = acquired.json<{ id: string }>().id;
      const leaseK1 = randomUUID();
      const leaseK2 = randomUUID();
      for (const key of [leaseK1, leaseK2, leaseK1]) {
        const response = await agentCall(
          token,
          "POST",
          `/api/v1/leases/${leaseId}/heartbeat`,
          {},
          { "idempotency-key": key },
        );
        expect(response.statusCode).toBe(200);
      }
      const leaseMismatch = await agentCall(
        token,
        "POST",
        `/api/v1/leases/${leaseId}/heartbeat`,
        { ttlSeconds: 60 },
        { "idempotency-key": leaseK1 },
      );
      expect(leaseMismatch.statusCode).toBe(409);
      expect(leaseMismatch.json<{ error: { code: string } }>().error.code)
        .toBe("IDEMPOTENCY_KEY_REUSED");
      const before = (
        await db.query<{
          revision: number;
          sequence: string;
          activities: string;
          events: string;
          outbox: string;
          idempotency: string;
          heartbeat_dedupe: string;
        }>(
          `
      SELECT s.revision,s.sequence::text,
             (SELECT count(*) FROM agent_activities WHERE session_id=s.id)::text AS activities,
             (SELECT count(*) FROM domain_events WHERE session_id=s.id)::text AS events,
             (SELECT count(*) FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.session_id=s.id)::text AS outbox,
              (SELECT count(*) FROM api_idempotency_keys WHERE actor_id=s.agent_actor_id)::text AS idempotency
             ,(SELECT count(*) FROM heartbeat_idempotency_keys
                WHERE resource_kind='session' AND resource_id=s.id)::text AS heartbeat_dedupe
        FROM agent_sessions s WHERE s.id=$1
    `,
          [session.id],
        )
      ).rows[0]!;
      const loadEnabled = process.env.RUN_HEARTBEAT_LOAD === "1";
      const storageBefore = loadEnabled
        ? await heartbeatStorageMetrics(session.id)
        : undefined;
      const loadStartedAt = new Date();
      const loadStarted = performance.now();
      const cpuStarted = process.cpuUsage();
      const rssStarted = process.memoryUsage().rss;
      let peakRssBytes = rssStarted;
      let peakHttpConnections = await openHttpConnections();
      const heartbeatLatenciesMs: number[] = [];
      for (let offset = 0; offset < pulseCount; offset += 25) {
        const responses = await Promise.all(
          Array.from({ length: Math.min(25, pulseCount - offset) }, async (_, index) => {
            if (!loadEnabled)
              return await agentCall(
                token,
                "POST",
                `/api/v1/agent-sessions/${session.id}/heartbeat`,
                { usage: { runtimeSeconds: offset + index } },
              );
            const requestStarted = performance.now();
            const response = await fetch(
              `${appUrl}/api/v1/agent-sessions/${session.id}/heartbeat`,
              {
                method: "POST",
                headers: {
                  authorization: `Bearer ${token}`,
                  "content-type": "application/json",
                  "idempotency-key": randomUUID(),
                },
                body: JSON.stringify({
                  usage: { runtimeSeconds: offset + index },
                }),
              },
            );
            await response.arrayBuffer();
            heartbeatLatenciesMs.push(performance.now() - requestStarted);
            return { statusCode: response.status } as Response;
          }),
        );
        expect(responses.every((response) => response.statusCode === 200)).toBe(
          true,
        );
        if (loadEnabled) {
          peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
          peakHttpConnections = Math.max(
            peakHttpConnections,
            await openHttpConnections(),
          );
        }
      }
      const steady = (
        await db.query<{
          revision: number;
          sequence: string;
          heartbeat_health: string;
          activities: string;
          events: string;
          outbox: string;
          idempotency: string;
          heartbeat_dedupe: string;
        }>(
          `
      SELECT s.revision,s.sequence::text,s.heartbeat_health,
             (SELECT count(*) FROM agent_activities WHERE session_id=s.id)::text AS activities,
             (SELECT count(*) FROM domain_events WHERE session_id=s.id)::text AS events,
             (SELECT count(*) FROM outbox_events outbox JOIN domain_events event ON event.id=outbox.domain_event_id WHERE event.session_id=s.id)::text AS outbox,
             (SELECT count(*) FROM api_idempotency_keys WHERE actor_id=s.agent_actor_id)::text AS idempotency,
             (SELECT count(*) FROM heartbeat_idempotency_keys
               WHERE resource_kind='session' AND resource_id=s.id)::text AS heartbeat_dedupe
        FROM agent_sessions s WHERE s.id=$1
    `,
          [session.id],
        )
      ).rows[0]!;
      expect(steady).toMatchObject({
        revision: before.revision,
        sequence: before.sequence,
        heartbeat_health: "healthy",
        activities: before.activities,
        events: before.events,
        outbox: before.outbox,
        idempotency: before.idempotency,
      });
      expect(Number(steady.heartbeat_dedupe)).toBeLessThanOrEqual(128);
      if (loadEnabled) {
        const reportPath = process.env.HEARTBEAT_LOAD_REPORT_PATH;
        if (!reportPath)
          throw new Error("HEARTBEAT_LOAD_REPORT_PATH is required in load mode");
        const durationMs = performance.now() - loadStarted;
        const cpu = process.cpuUsage(cpuStarted);
        const rssEnded = process.memoryUsage().rss;
        const storageAfter = await heartbeatStorageMetrics(session.id);
        const sortedLatencies = heartbeatLatenciesMs.slice().sort((a, b) => a - b);
        const p99LimitMs = Number(
          process.env.HEARTBEAT_LOAD_P99_MAX_MS ?? "2000",
        );
        const rssGrowthLimitBytes =
          Number(process.env.HEARTBEAT_LOAD_RSS_GROWTH_MAX_MB ?? "256")
          * 1024 * 1024;
        const checks = {
          allRequestsSucceeded: heartbeatLatenciesMs.length === pulseCount,
          boundedDedupe: Number(storageAfter.dedupeRows) <= 128,
          p99WithinLimit:
            percentile(sortedLatencies, 0.99) <= p99LimitMs,
          rssGrowthWithinLimit:
            Math.max(0, peakRssBytes - rssStarted) <= rssGrowthLimitBytes,
        };
        const report = {
          schemaVersion: 1,
          status: Object.values(checks).every(Boolean) ? "passed" : "failed",
          transport: "http",
          startedAt: loadStartedAt.toISOString(),
          endedAt: new Date().toISOString(),
          requestCount: pulseCount,
          concurrency: 25,
          durationMs,
          throughputPerSecond: pulseCount / (durationMs / 1_000),
          latencyMs: {
            p50: percentile(sortedLatencies, 0.5),
            p95: percentile(sortedLatencies, 0.95),
            p99: percentile(sortedLatencies, 0.99),
            max: sortedLatencies.at(-1) ?? 0,
            p99Limit: p99LimitMs,
          },
          process: {
            cpuUserMicros: cpu.user,
            cpuSystemMicros: cpu.system,
            rssStartedBytes: rssStarted,
            peakRssBytes,
            rssEndedBytes: rssEnded,
            rssGrowthLimitBytes,
          },
          http: {
            peakOpenConnections: peakHttpConnections,
            finalOpenConnections: await openHttpConnections(),
          },
          database: {
            bytesBefore: Number(storageBefore!.databaseBytes),
            bytesAfter: Number(storageAfter.databaseBytes),
            heartbeatTableBytesBefore: Number(
              storageBefore!.heartbeatTableBytes,
            ),
            heartbeatTableBytesAfter: Number(
              storageAfter.heartbeatTableBytes,
            ),
            connectionsBefore: Number(storageBefore!.databaseConnections),
            connectionsAfter: Number(storageAfter.databaseConnections),
            dedupeRows: Number(storageAfter.dedupeRows),
          },
          checks,
        };
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
        });
        expect(report.status).toBe("passed");
      }

      await db.query(
        "UPDATE agent_sessions SET heartbeat_health='degraded',heartbeat_health_changed_at=now() WHERE id=$1",
        [session.id],
      );
      const concurrent = await Promise.all(
        Array.from({ length: 25 }, (_, index) =>
          agentCall(
            token,
            "POST",
            `/api/v1/agent-sessions/${session.id}/heartbeat`,
            {
              usage: { runtimeSeconds: 20_000 + index },
            },
          ),
        ),
      );
      expect(concurrent.every((response) => response.statusCode === 200)).toBe(
        true,
      );
      expect(
        (
          await db.query(
            "SELECT 1 FROM domain_events WHERE session_id=$1 AND event_type='agent.session.health_changed'",
            [session.id],
          )
        ).rowCount,
      ).toBe(1);
      const afterRecovery = (
        await db.query<{ revision: number; sequence: string }>(
          "SELECT revision,sequence::text FROM agent_sessions WHERE id=$1",
          [session.id],
        )
      ).rows[0]!;
      expect(afterRecovery).toEqual({
        revision: before.revision,
        sequence: before.sequence,
      });

      const stop = await humanCall(
        admin,
        "POST",
        `/api/v1/agent-sessions/${session.id}/signals`,
        {
          signal: "stop",
          reason: "verify diagnostic heartbeat",
        },
        { "if-match": `"revision-${afterRecovery.revision}"` },
      );
      expect(stop.statusCode).toBe(200);
      await db.query(
        "UPDATE agent_sessions SET heartbeat_health='degraded' WHERE id=$1",
        [session.id],
      );
      const diagnostic = await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        {
          usage: { runtimeSeconds: 30_000 },
        },
      );
      expect(diagnostic.statusCode).toBe(200);
      expect(
        (
          await db.query<{ state: string; heartbeat_health: string }>(
            "SELECT state,heartbeat_health FROM agent_sessions WHERE id=$1",
            [session.id],
          )
        ).rows[0],
      ).toEqual({ state: "stopping", heartbeat_health: "degraded" });
      workItemId = previousWorkItemId;
    },
    process.env.RUN_HEARTBEAT_LOAD === "1" ? 900_000 : 120_000,
  );

  it("restricts sanitized retention status to a Workspace administrator", async () => {
    const workspaceId = (
      await db.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM actors WHERE id=$1",
        [admin.actorId],
      )
    ).rows[0]!.workspace_id;
    await db.query(
      `INSERT INTO retention_job_state(
         job_name,workspace_id,worker_mode,worker_seen_at
       )
       SELECT 'worker_runtime',workspace_id,'archive_only',now()
         FROM actors WHERE id=$1
       ON CONFLICT(job_name,workspace_id) DO UPDATE
         SET worker_mode=EXCLUDED.worker_mode,
             worker_seen_at=EXCLUDED.worker_seen_at`,
      [admin.actorId],
    );
    await db.query(
      `INSERT INTO event_archive_segments(
         workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
         object_key,object_version_id,object_size_bytes,object_sha256,
         snapshot_digest,retain_until,state,uploaded_at,verified_at,
         membership_state
       ) VALUES(
         $1,9000000000000,9000000000999,now(),1,$2,'range-version',1,$3,$4,
         now()+interval '366 days','verified',now(),now(),'pending_exact'
       )`,
      [
        workspaceId,
        `retention-range-only-${randomUUID()}`,
        `sha256:${"a".repeat(64)}`,
        `sha256:${"b".repeat(64)}`,
      ],
    );
    const exactSegmentId = (
      await db.query<{ id: string }>(
        `INSERT INTO event_archive_segments(
           workspace_id,start_cursor,end_cursor,fixed_cutoff_at,row_count,
           object_key,object_version_id,object_size_bytes,object_sha256,
           snapshot_digest,retain_until,state,uploaded_at,verified_at,
           membership_state
         ) VALUES(
           $1,8000000000000,9000000001000,now(),1,$2,'exact-version',1,$3,$4,
           now()+interval '366 days','verified',now(),now(),'exact'
         ) RETURNING id`,
        [
          workspaceId,
          `retention-exact-${randomUUID()}`,
          `sha256:${"c".repeat(64)}`,
          `sha256:${"d".repeat(64)}`,
        ],
      )
    ).rows[0]!.id;
    await db.query(
      `INSERT INTO event_archive_segment_events(
         segment_id,workspace_id,ordinal,event_id,event_cursor,record_sha256
       ) VALUES($1,$2,0,$3,8000000000500,$4)`,
      [
        exactSegmentId,
        workspaceId,
        randomUUID(),
        `sha256:${"e".repeat(64)}`,
      ],
    );
    const status = await humanCall(
      admin,
      "GET",
      "/api/v1/admin/retention/status",
    );
    expect(status.statusCode).toBe(200);
    const body = status.json<{
      mode: string;
      workerSeenAt: string | null;
      workerFresh: boolean;
      policies: unknown[];
      floor: { prunedThroughCursor: string };
      archive: { lastVerifiedEndCursor: string | null };
      blockers: {
        protectedWebhookEvents: number;
        unverifiedSegments: number;
      };
      redis: {
        status: string;
        streamLength: number | null;
        exactLimit: number;
      };
    }>();
    expect(body).toMatchObject({
      mode: "archive_only",
      workerSeenAt: expect.any(String),
      workerFresh: true,
      floor: { prunedThroughCursor: "0" },
      archive: { lastVerifiedEndCursor: "8000000000500" },
      blockers: {
        protectedWebhookEvents: expect.any(Number),
        unverifiedSegments: expect.any(Number),
      },
      redis: { exactLimit: 100_000 },
    });
    expect(["ok", "unavailable"]).toContain(body.redis.status);
    expect(body.redis.streamLength === null).toBe(
      body.redis.status === "unavailable",
    );
    expect(body.policies.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("archivePrefix");
    expect(serialized).not.toContain("redisUrl");
    await db.query(
      `UPDATE retention_job_state
          SET worker_seen_at=now()-interval '3 hours'
        WHERE job_name='worker_runtime'
          AND workspace_id=(SELECT workspace_id FROM actors WHERE id=$1)`,
      [admin.actorId],
    );
    const staleStatus = await humanCall(
      admin,
      "GET",
      "/api/v1/admin/retention/status",
    );
    expect(staleStatus.statusCode).toBe(200);
    expect(staleStatus.json<{ mode: string; workerFresh: boolean }>()).toMatchObject({
      mode: "unknown",
      workerFresh: false,
    });

    const memberId = (
      await db.query<{ id: string }>(
        `INSERT INTO actors(
           workspace_id,kind,workspace_role,email,display_name,password_hash
         ) VALUES($1,'human','member',$2,'Retention member',$3) RETURNING id`,
        [
          workspaceId,
          `retention-member-${randomUUID()}@example.test`,
          await hashPassword("retention-member-password"),
        ],
      )
    ).rows[0]!.id;
    const memberToken = opaqueToken();
    const memberCsrf = opaqueToken();
    await db.query(
      `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
       VALUES($1,$2,$3,now()+interval '1 day')`,
      [memberId, tokenHash(memberToken), memberCsrf],
    );
    const member = await app.inject({
      method: "GET",
      url: "/api/v1/admin/retention/status",
      headers: {
        cookie: `workmesh_session=${memberToken}`,
        "x-csrf-token": memberCsrf,
        "idempotency-key": randomUUID(),
      },
    });
    expect(member.statusCode).toBe(403);

    const previousWorkItemId = workItemId;
    try {
      const work = await humanCall(admin, "POST", "/api/v1/work-items", {
        teamId,
        title: "Retention status agent denial",
        statusId: readyId,
        responsibleHumanActorId: admin.actorId,
      });
      workItemId = work.json<{ id: string }>().id;
      const statusAgent = await registerAgent(
        `retention-status-agent-${randomUUID()}`,
      );
      const delegation = await delegate(statusAgent.id);
      const session = await start(delegation.json<{ id: string }>().id);
      const token = await exchange(session, statusAgent.installationToken);
      const agentResponse = await agentCall(
        token,
        "GET",
        "/api/v1/admin/retention/status",
      );
      expect(agentResponse.statusCode).toBe(403);
    } finally {
      workItemId = previousWorkItemId;
    }
  }, 120_000);

  it("keeps authenticated work, Agent writes, and an existing SSE stream available during limiter Redis outage", async () => {
    const previousWorkItemId = workItemId;
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const work = await humanCall(admin, "POST", "/api/v1/work-items", {
        teamId,
        title: "Redis outage isolation",
        statusId: readyId,
        responsibleHumanActorId: admin.actorId,
      });
      workItemId = work.json<{ id: string }>().id;
      const outageAgent = await registerAgent(`outage-agent-${randomUUID()}`);
      const delegation = await delegate(outageAgent.id);
      const session = await start(delegation.json<{ id: string }>().id);
      const token = await exchange(session, outageAgent.installationToken);
      await ackAndExecute(session, token);

      const streamCursor = Number((await db.query<{ cursor: string }>(
        "SELECT COALESCE(max(cursor),0)::text AS cursor FROM domain_events",
      )).rows[0]!.cursor);
      const stream = await fetch(
        `${appUrl}/api/v1/events/stream?cursor=${streamCursor}`,
        { headers: { cookie: admin.cookie }, signal: controller.signal },
      );
      expect(stream.status).toBe(200);
      reader = stream.body?.getReader();
      if (!reader) throw new Error("SSE response did not expose a reader");

      const callsBeforeOutage = rateLimitStore.calls;
      rateLimitStore.offline = true;

      const teams = await humanCall(admin, "GET", "/api/v1/teams");
      expect(teams.statusCode).toBe(200);
      const heartbeat = await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/heartbeat`,
        { usage: { runtimeSeconds: 1 } },
      );
      expect(heartbeat.statusCode).toBe(200);
      const activity = await agentCall(
        token,
        "POST",
        `/api/v1/agent-sessions/${session.id}/activities`,
        {
          kind: "message",
          summary: "continues while limiter Redis is offline",
          artifactIds: [],
          references: [],
          visibility: "team",
          ephemeral: false,
        },
      );
      expect(activity.statusCode).toBe(200);
      const activityId = activity.json<{ id: string }>().id;

      const unavailableLogin = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { "idempotency-key": randomUUID() },
        payload: {
          email: "admin@example.test",
          password: "stage-one-password",
        },
      });
      expect(unavailableLogin.statusCode).toBe(503);
      expect(unavailableLogin.json()).toMatchObject({
        error: { code: "AUTH_RATE_LIMIT_UNAVAILABLE" },
      });
      expect(rateLimitStore.calls).toBe(callsBeforeOutage + 1);

      const decoder = new TextDecoder();
      let streamed = "";
      const expiresAt = Date.now() + 5_000;
      while (!streamed.includes(activityId)) {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0)
          throw new Error("Timed out waiting for SSE outage evidence");
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error("Timed out waiting for SSE chunk")),
              remaining,
            )),
        ]);
        if (chunk.done) throw new Error("SSE stream closed during Redis outage");
        streamed += decoder.decode(chunk.value, { stream: true });
      }
      expect(streamed).toContain("agent.activity.appended");
      expect(rateLimitStore.calls).toBe(callsBeforeOutage + 1);
    } finally {
      rateLimitStore.offline = false;
      workItemId = previousWorkItemId;
      controller.abort();
      await reader?.cancel().catch(() => undefined);
    }
  }, 30_000);
});
