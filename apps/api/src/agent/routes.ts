import type { Pool } from "pg";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import {
  acknowledgeAgentSessionInputSchema, agentPatchSchema, agentRegistrationInputSchema, appendActivityInputSchema, exchangeAgentSessionTokenInputSchema,
  artifactInputSchema, completeAgentSessionInputSchema, createAgentSessionInputSchema, decideApprovalInputSchema,
  delegationInputSchema, failAgentSessionInputSchema, heartbeatInputSchema, promptAgentSessionInputSchema,
  publishPlanInputSchema, requestApprovalInputSchema, signalAgentSessionInputSchema, stopAcknowledgementInputSchema, agentSessionStateSchema, retryAgentSessionInputSchema, refreshAgentSessionTokenInputSchema, delegateAndStartAgentSessionInputSchema, consumeApprovalInputSchema,
  sessionContextResponseSchema,
} from "@workmesh/contracts";
import { DomainError, parseRevision } from "@workmesh/domain";
import * as commands from "./commands.js";
import type { ApiActor, RequestMeta } from "./types.js";
import { authClientContext } from "../auth-idempotency.js";
import type { Paginator } from "../pagination.js";
import { liveSessionReadPredicate } from "../live-read-authorization.js";
import { attachWorkItemExecutors } from "../work-item-executors.js";
import { guidancePinsFromSnapshot } from "../guidance.js";

type Helpers = { db: Pool; meta: (request: FastifyRequest, body: unknown, params?: Record<string, unknown>) => RequestMeta; header: (request: FastifyRequest, name: string) => string | undefined; readableTeam: (request: FastifyRequest, teamId: string) => Promise<void>; paginator: Paginator };
const id = (request: FastifyRequest) => z.object({ id: z.string().uuid() }).parse(request.params).id;
const actor = (request: FastifyRequest) => request.actor as unknown as ApiActor;
const needHuman = (request: FastifyRequest) => { if (actor(request).kind !== "human") throw new DomainError("FORBIDDEN", "Human session required"); };
const needAdmin = (request: FastifyRequest) => { if (actor(request).kind !== "human" || actor(request).workspaceRole !== "admin") throw new DomainError("FORBIDDEN", "Workspace administrator role is required"); };
const privateIp = (address: string) => address === "::1" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd") || /^127\./.test(address) || /^10\./.test(address) || /^192\.168\./.test(address) || /^169\.254\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
export const assertWebhookUrl = async (raw: string): Promise<void> => { const url = new URL(raw); if (url.protocol !== "http:" && url.protocol !== "https:") throw new DomainError("VALIDATION_ERROR", "Webhook URL must use HTTP or HTTPS"); if (process.env.ALLOW_PRIVATE_AGENT_WEBHOOKS === "true") return; if (url.hostname === "localhost") throw new DomainError("VALIDATION_ERROR", "Private webhook targets are disabled"); const addresses = net.isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }); if (addresses.some(entry => privateIp(entry.address))) throw new DomainError("VALIDATION_ERROR", "Private webhook targets are disabled"); };
const agentOwnsSession = (request: FastifyRequest, sessionId: string) => { const current = actor(request); if (current.kind === "agent" && current.agentSessionId !== sessionId) throw new DomainError("RESOURCE_SCOPE_DENIED", "Agent token is scoped to its current session"); };
const sessionQuery = z.object({ teamId: z.string().uuid().optional(), workItemId: z.string().uuid().optional(), agentId: z.string().uuid().optional(), principalHumanActorId: z.string().uuid().optional(), state: z.string().optional() });

async function readableSession(request: FastifyRequest, h: Helpers, sessionId: string) {
  agentOwnsSession(request, sessionId);
  const session = (await h.db.query<{ id:string; team_id:string; work_item_id:string|null; work_item_exists:boolean; project_id:string|null; project_exists:boolean; delegation_status:string; permissions_snapshot:string[]; capability_scope:{teamIds?:string[];workItemIds?:string[];projectIds?:string[]}; agent_active:boolean; definition_capabilities:string[]; team_capabilities:string[]|null }>(`SELECT s.id,s.team_id,s.work_item_id,scope_item.id IS NOT NULL AS work_item_exists,s.project_id,session_project.id IS NOT NULL AS project_exists,d.status AS delegation_status,d.permissions_snapshot,d.capability_scope,a.is_active AS agent_active,a.approved_capabilities AS definition_capabilities,ata.approved_capabilities AS team_capabilities FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id LEFT JOIN work_items scope_item ON scope_item.id=s.work_item_id AND scope_item.workspace_id=s.workspace_id AND scope_item.deleted_at IS NULL LEFT JOIN projects session_project ON session_project.id=s.project_id AND session_project.workspace_id=s.workspace_id AND session_project.deleted_at IS NULL LEFT JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL WHERE s.id=$1 AND s.workspace_id=$2`, [sessionId, actor(request).workspaceId])).rows[0];
  if (!session) throw new DomainError("NOT_FOUND", "Agent session not found");
  if (actor(request).kind === "human") { await h.readableTeam(request, session.team_id); return session; }
  const scope = session.capability_scope ?? {};
  const resourceInScope = session.work_item_id
    ? session.work_item_exists && Boolean(scope.workItemIds?.includes(session.work_item_id))
    : !session.project_id || session.project_exists && Boolean(scope.projectIds?.includes(session.project_id));
  if (!session.agent_active || session.delegation_status !== "active" || !session.permissions_snapshot.includes("work:read") || !session.definition_capabilities.includes("work:read") || !session.team_capabilities?.includes("work:read") || !scope.teamIds?.includes(session.team_id) || !resourceInScope) throw new DomainError("RESOURCE_SCOPE_DENIED", "Agent token lacks read scope for this session");
  return session;
}

export function registerAgentRoutes(app: FastifyInstance, h: Helpers): void {
  app.get("/api/v1/agents", async request => {
    needHuman(request);
    return h.paginator.query(h.db, request, request.query, {
      route: "/api/v1/agents",
      filters: {},
      sort: [{ key: "display_name", sql: "a.display_name", direction: "ASC" }, { key: "id", sql: "a.id", direction: "ASC" }],
    },
      `SELECT a.*, COALESCE(access.team_access, '[]'::jsonb) AS team_access
       FROM agent_definitions a
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'agent_id', ata.agent_id, 'team_id', ata.team_id,
           'approved_capabilities', ata.approved_capabilities,
           'status', CASE WHEN ata.revoked_at IS NULL THEN 'active' ELSE 'revoked' END,
           'approved_by_actor_id', ata.granted_by_actor_id,
           'revision', a.revision, 'created_at', ata.created_at,
           'updated_at', ata.created_at, 'revoked_at', ata.revoked_at
         ) ORDER BY ata.created_at) AS team_access
         FROM (
           SELECT * FROM agent_team_access scoped
           WHERE scoped.workspace_id=a.workspace_id AND scoped.agent_id=a.id
           ORDER BY scoped.created_at DESC,scoped.team_id LIMIT 200
         ) ata
       ) access ON true
       WHERE a.workspace_id=$1`,
      [actor(request).workspaceId]);
  });
  app.post("/api/v1/agents/register", async request => { const body=agentRegistrationInputSchema.parse(request.body); if(body.endpointUrl) await assertWebhookUrl(body.endpointUrl); return commands.registerAgent(h.db,h.meta(request,body),body); });
  app.get("/api/v1/agents/:id", async request => { needHuman(request); const row = (await h.db.query("SELECT * FROM agent_definitions WHERE id=$1 AND workspace_id=$2", [id(request), actor(request).workspaceId])).rows[0]; if (!row) throw new DomainError("NOT_FOUND", "Agent not found"); return row; });
  app.patch("/api/v1/agents/:id", async request => { const body = agentPatchSchema.parse(request.body); if(body.endpointUrl) await assertWebhookUrl(body.endpointUrl); const agentId = id(request); return commands.updateAgent(h.db, h.meta(request, body, { id: agentId }), agentId, parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agents/:id/webhook-endpoints", async request => { needAdmin(request); const body = z.object({ url: z.string().url() }).parse(request.body); await assertWebhookUrl(body.url); const agentId = id(request); return commands.createWebhookEndpoint(h.db,h.meta(request,body,{id:agentId}),agentId,body.url); });
  app.post("/api/v1/agents/:id/webhook-endpoints/:endpointId/rotate-secret", async request => commands.rotateWebhookSecret(h.db, h.meta(request, {}, request.params as Record<string, unknown>), id(request), z.object({ endpointId: z.string().uuid() }).parse(request.params).endpointId, parseRevision(h.header(request, "if-match"))));
  app.put("/api/v1/agents/:id/team-access/:teamId", async request => { const body = z.object({ approvedCapabilities: z.array(z.string()).min(1) }).parse(request.body); return commands.grantAgentTeamAccess(h.db, h.meta(request, body, request.params as Record<string, unknown>), id(request), z.object({ teamId: z.string().uuid() }).parse(request.params).teamId, body.approvedCapabilities as never); });
  app.delete("/api/v1/agents/:id/team-access/:teamId", async request => commands.revokeAgentTeamAccess(h.db, h.meta(request, {}, request.params as Record<string, unknown>), id(request), z.object({ teamId: z.string().uuid() }).parse(request.params).teamId));

  app.post("/api/v1/work-items/:id/delegations", async request => { const body = delegationInputSchema.parse(request.body); const workItemId = id(request); return commands.createDelegation(h.db, h.meta(request, body, { id: workItemId }), workItemId, body); });
  app.post("/api/v1/work-items/:id/agent-session", async request => { const body = delegateAndStartAgentSessionInputSchema.parse(request.body); const workItemId = id(request); return commands.delegateAndStartAgentSession(h.db, h.meta(request, body, { id: workItemId }), workItemId, parseRevision(h.header(request, "if-match")), body); });
  app.get("/api/v1/delegations/:id", async request => { needHuman(request); const row = (await h.db.query("SELECT * FROM delegations WHERE id=$1 AND workspace_id=$2", [id(request), actor(request).workspaceId])).rows[0] as { team_id?: string } | undefined; if (!row) throw new DomainError("NOT_FOUND", "Delegation not found"); await h.readableTeam(request, row.team_id!); return row; });
  app.post("/api/v1/delegations/:id/revoke", async request => commands.revokeDelegation(h.db,h.meta(request,{}, {id:id(request)}),id(request),parseRevision(h.header(request,"if-match"))));

  app.get("/api/v1/agent-sessions", async request => {
    const query = sessionQuery.parse(request.query);
    const current = actor(request);
    const values: unknown[] = [current.workspaceId];
    const where = ["s.workspace_id=$1"];
    if (current.kind === "agent") {
      await readableSession(request,h,current.agentSessionId!);
      values.push(current.agentSessionId!);
      where.push(`s.id=$${values.length}`);
      where.push(liveSessionReadPredicate(
        current,
        "s.id",
        "s.workspace_id",
        values,
      ));
    } else if(current.workspaceRole!=="admin"){
      values.push(current.id);
      where.push(`EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=s.workspace_id AND m.team_id=s.team_id AND m.actor_id=$${values.length})`);
    }
    for (const [column, value] of Object.entries({
      "s.team_id": query.teamId,
      "s.work_item_id": query.workItemId,
      "s.agent_id": query.agentId,
      "d.principal_human_actor_id": query.principalHumanActorId,
      "s.state": query.state,
    })) if (value) {
      values.push(value);
      where.push(`${column}=$${values.length}`);
    }
    return h.paginator.query(h.db,request,request.query,{
      route:"/api/v1/agent-sessions",
      filters:{
        teamId:query.teamId??null,
        workItemId:query.workItemId??null,
        agentId:query.agentId??null,
        principalHumanActorId:query.principalHumanActorId??null,
        state:query.state??null,
      },
      sort:[
        {key:"updated_at",sql:"s.updated_at",direction:"DESC"},
        {key:"id",sql:"s.id",direction:"DESC"},
      ],
    },`SELECT s.*,d.principal_human_actor_id,
              coalesce((a.manifest->>'heartbeatIntervalSeconds')::int,30)
                AS heartbeat_interval_seconds,
              s.created_at+interval '10 seconds' AS ack_deadline
         FROM agent_sessions s
         JOIN delegations d ON d.id=s.delegation_id
         JOIN agent_definitions a ON a.id=s.agent_id
        WHERE ${where.join(" AND ")}`,values);
  });
  app.post("/api/v1/agent-sessions", async request => { const body = createAgentSessionInputSchema.parse(request.body); return commands.createAgentSession(h.db, h.meta(request, body), body); });
  app.post("/api/v1/agent-sessions/:id/token/exchange", async request => { const body = exchangeAgentSessionTokenInputSchema.parse(request.body); const bearer = h.header(request, "authorization")?.replace(/^Bearer\s+/i, ""); if (!bearer) throw new DomainError("UNAUTHENTICATED", "Installation bearer token is required"); return commands.exchangeAgentToken(h.db, { sessionId: id(request), nonce: body.exchangeToken, installationBearer: bearer, idempotencyKey: request.idempotencyKey!, clientContext: authClientContext(request) }); });
  app.post("/api/v1/agent-sessions/:id/token/refresh", async request => { const body = refreshAgentSessionTokenInputSchema.parse(request.body); const bearer = h.header(request, "authorization")?.replace(/^Bearer\s+/i, ""); if (!bearer) throw new DomainError("UNAUTHENTICATED", "Installation bearer token is required"); return commands.refreshAgentToken(h.db,{ sessionId:id(request), tokenId:body.tokenId, installationBearer:bearer, idempotencyKey:request.idempotencyKey!, clientContext:authClientContext(request) }); });
  app.get("/api/v1/agent-sessions/:id", async request => { const sessionId = id(request); await readableSession(request,h,sessionId); const row = (await h.db.query("SELECT s.*,coalesce((a.manifest->>'heartbeatIntervalSeconds')::int,30) AS heartbeat_interval_seconds,s.created_at+interval '10 seconds' AS ack_deadline FROM agent_sessions s JOIN agent_definitions a ON a.id=s.agent_id WHERE s.id=$1 AND s.workspace_id=$2", [sessionId, actor(request).workspaceId])).rows[0]; if (!row) throw new DomainError("NOT_FOUND", "Agent session not found"); return row; });
  app.post("/api/v1/agent-sessions/:id/ack", async request => { const body = acknowledgeAgentSessionInputSchema.parse(request.body); return commands.acknowledge(h.db, h.meta(request, body, { id: id(request) }), id(request), body); });
  app.post("/api/v1/agent-sessions/:id/heartbeat", async request => { const body = heartbeatInputSchema.parse(request.body); return commands.heartbeat(h.db, h.meta(request, body, { id: id(request) }), id(request), body); });
  app.post("/api/v1/agent-sessions/:id/state", async request => { const body = z.object({ state: agentSessionStateSchema, reason: z.string().min(1).max(2_000) }).parse(request.body); return commands.transitionState(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agent-sessions/:id/prompt", async request => { const body = promptAgentSessionInputSchema.parse(request.body); return commands.prompt(h.db, h.meta(request, body, { id: id(request) }), id(request), body); });
  app.post("/api/v1/agent-sessions/:id/activities", async request => { const body = appendActivityInputSchema.parse(request.body); return commands.appendActivity(h.db, h.meta(request, body, { id: id(request) }), id(request), body); });
  app.get("/api/v1/agent-sessions/:id/activities", async request => {
    const sessionId = id(request);
    const current = actor(request);
    await readableSession(request,h,sessionId);
    const values: unknown[] = [sessionId, current.workspaceId];
    const liveAuthorization = liveSessionReadPredicate(
      current,
      "activity.session_id",
      "$2",
      values,
    );
    return h.paginator.query(h.db,request,request.query,{
      route:"/api/v1/agent-sessions/:id/activities",
      filters:{sessionId},
      sort:[
        {key:"sequence",sql:"activity.sequence",direction:"ASC"},
        {key:"id",sql:"activity.id",direction:"ASC"},
      ],
    },`SELECT activity.*
         FROM agent_activities activity
        WHERE activity.session_id=$1
          AND ${liveAuthorization}`,values);
  });
  app.get("/api/v1/agent-sessions/:id/plan", async request => { const sessionId = id(request); const session=await readableSession(request,h,sessionId); const version=(await h.db.query<{current_plan_version_id:string|null}>("SELECT current_plan_version_id FROM agent_sessions WHERE id=$1",[session.id])).rows[0]?.current_plan_version_id; if (!version) return null; const plan = (await h.db.query("SELECT * FROM agent_plan_versions WHERE id=$1", [version])).rows[0]; const steps = (await h.db.query("SELECT * FROM agent_plan_steps WHERE plan_version_id=$1 ORDER BY ordinal", [version])).rows; return { ...plan as object, steps }; });
  app.get("/api/v1/agent-sessions/:id/plans", async request => {
    const sessionId = id(request);
    const current = actor(request);
    await readableSession(request,h,sessionId);
    const values: unknown[] = [sessionId, current.workspaceId];
    const liveAuthorization = liveSessionReadPredicate(
      current,
      "plan.session_id",
      "$2",
      values,
    );
    return h.paginator.query(h.db,request,request.query,{
      route:"/api/v1/agent-sessions/:id/plans",
      filters:{sessionId},
      sort:[
        {key:"revision",sql:"plan.revision",direction:"ASC"},
        {key:"id",sql:"plan.id",direction:"ASC"},
      ],
    },`SELECT plan.*
         FROM agent_plan_versions plan
        WHERE plan.session_id=$1
          AND ${liveAuthorization}`,values);
  });
  app.get("/api/v1/agent-sessions/:id/context", async request => {
    const sessionId = id(request);
    await readableSession(request,h,sessionId);
    const rawSession=(await h.db.query<Record<string,unknown> & {team_id:string;work_item_id:string|null;project_id:string|null;current_plan_version_id:string|null;context_snapshot_id:string|null}>("SELECT session.* FROM agent_sessions session WHERE session.id=$1 AND session.workspace_id=$2",[sessionId,actor(request).workspaceId])).rows[0];
    if(!rawSession) throw new DomainError("NOT_FOUND","Agent session not found");
    const session=commands.normalizeAgentSessionResponse(rawSession);
    const rawWorkItem=rawSession.work_item_id
      ? (await h.db.query<Record<string,unknown> & {id:string;workspace_id:string;responsible_human_actor_id:string|null}>("SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category FROM work_items w JOIN teams t ON t.id=w.team_id JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1 AND w.workspace_id=$2 AND w.deleted_at IS NULL",[rawSession.work_item_id,actor(request).workspaceId])).rows[0] ?? null
      : null;
    const projectedWorkItem=rawWorkItem ? (await attachWorkItemExecutors(h.db,[rawWorkItem]))[0]! : null;
    const workItem=projectedWorkItem ? Object.fromEntries(Object.entries(projectedWorkItem).filter(([key])=>key!=="cycle_id")) : null;
    const plan=rawSession.current_plan_version_id ? (await h.db.query("SELECT * FROM agent_plan_versions WHERE id=$1",[rawSession.current_plan_version_id])).rows[0] ?? null:null;
    const planWithSteps=plan?{...plan as object,steps:(await h.db.query("SELECT * FROM agent_plan_steps WHERE plan_version_id=$1 ORDER BY ordinal",[rawSession.current_plan_version_id])).rows}:null;
    const guidancePins=await guidancePinsFromSnapshot(h.db,actor(request).workspaceId,rawSession.context_snapshot_id);
    const guidanceUris=guidancePins.map(pin=>pin.uri);
    const response={session,workItem,plan:planWithSteps,contextSnapshotId:rawSession.context_snapshot_id,guidanceUris,guidancePins};
    return sessionContextResponseSchema.parse(JSON.parse(JSON.stringify(response)) as unknown);
  });
  app.put("/api/v1/agent-sessions/:id/plan", async request => { const body = publishPlanInputSchema.parse(request.body); return commands.publishPlan(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agent-sessions/:id/signals", async request => { const body = signalAgentSessionInputSchema.parse(request.body); return commands.signal(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agent-sessions/:id/stop-ack", async request => { const body = stopAcknowledgementInputSchema.parse(request.body); return commands.stopAck(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agent-sessions/:id/complete", async request => { const body = completeAgentSessionInputSchema.parse(request.body); return commands.finishSession(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/agent-sessions/:id/fail", async request => { const body = failAgentSessionInputSchema.parse(request.body); return commands.finishSession(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body, true); });
  app.post("/api/v1/agent-sessions/:id/retry", async request => { const body = retryAgentSessionInputSchema.parse(request.body); return commands.retrySession(h.db,h.meta(request,body,{id:id(request)}),id(request),parseRevision(h.header(request,"if-match")),body); });
  app.post("/api/v1/artifacts", async request => { const body = artifactInputSchema.parse(request.body); return commands.publishArtifact(h.db, h.meta(request, body), body); });
  app.get("/api/v1/artifacts", async request => {
    const query = z.object({
      sessionId: z.string().uuid().optional(),
      workItemId: z.string().uuid().optional(),
    }).parse(request.query);
    const current=actor(request);
    const values: unknown[] = [current.workspaceId];
    const where = ["artifacts.workspace_id=$1"];
    if(current.kind==="agent"){
      await readableSession(request,h,current.agentSessionId!);
      values.push(current.agentSessionId!);
      where.push(`artifacts.session_id=$${values.length}`);
    } else if(query.sessionId){
      values.push(query.sessionId);
      where.push(`artifacts.session_id=$${values.length}`);
      await readableSession(request,h,query.sessionId);
    }
    where.push(liveSessionReadPredicate(
      current,
      "artifacts.session_id",
      "artifacts.workspace_id",
      values,
    ));
    if (query.workItemId) {
      values.push(query.workItemId);
      where.push(`artifacts.work_item_id=$${values.length}`);
    }
    return h.paginator.query(h.db,request,request.query,{
      route:"/api/v1/artifacts",
      filters:{sessionId:query.sessionId??null,workItemId:query.workItemId??null},
      sort:[
        {key:"created_at",sql:"artifacts.created_at",direction:"DESC"},
        {key:"id",sql:"artifacts.id",direction:"DESC"},
      ],
    },`SELECT artifacts.* FROM artifacts WHERE ${where.join(" AND ")}`,values);
  });
  app.post("/api/v1/approvals", async request => { const body = requestApprovalInputSchema.parse(request.body); return commands.requestApproval(h.db, h.meta(request, body), body); });
  app.get("/api/v1/approvals", async request => {
    const query = z.object({
      sessionId: z.string().uuid().optional(),
      status: z.string().optional(),
    }).parse(request.query);
    const current=actor(request);
    const values: unknown[] = [current.workspaceId];
    const where = ["approvals.workspace_id=$1"];
    if(current.kind==="agent"){
      await readableSession(request,h,current.agentSessionId!);
      values.push(current.agentSessionId!);
      where.push(`approvals.session_id=$${values.length}`);
    } else if(query.sessionId){
      values.push(query.sessionId);
      where.push(`approvals.session_id=$${values.length}`);
      await readableSession(request,h,query.sessionId);
    }
    where.push(liveSessionReadPredicate(
      current,
      "approvals.session_id",
      "approvals.workspace_id",
      values,
    ));
    if (query.status) {
      values.push(query.status);
      where.push(`approvals.status=$${values.length}`);
    }
    return h.paginator.query(h.db,request,request.query,{
      route:"/api/v1/approvals",
      filters:{sessionId:query.sessionId??null,status:query.status??null},
      sort:[
        {key:"created_at",sql:"approvals.created_at",direction:"DESC"},
        {key:"id",sql:"approvals.id",direction:"DESC"},
      ],
    },`SELECT approvals.* FROM approvals WHERE ${where.join(" AND ")}`,values);
  });
  app.get("/api/v1/approvals/:id", async request => { const row = (await h.db.query<{session_id:string}>("SELECT session_id FROM approvals WHERE id=$1 AND workspace_id=$2", [id(request), actor(request).workspaceId])).rows[0]; if (!row) throw new DomainError("NOT_FOUND", "Approval not found"); await readableSession(request,h,row.session_id); return (await h.db.query("SELECT * FROM approvals WHERE id=$1",[id(request)])).rows[0]; });
  app.post("/api/v1/approvals/:id/decide", async request => { const body = decideApprovalInputSchema.parse(request.body); return commands.decideApproval(h.db, h.meta(request, body, { id: id(request) }), id(request), parseRevision(h.header(request, "if-match")), body); });
  app.post("/api/v1/approvals/:id/consume", async request => { const body=consumeApprovalInputSchema.parse(request.body); return commands.consumeApproval(h.db,h.meta(request,body,{id:id(request)}),id(request),parseRevision(h.header(request,"if-match")),body); });

}
