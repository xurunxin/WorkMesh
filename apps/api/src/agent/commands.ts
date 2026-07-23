import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { opaqueToken, tokenHash, withTx } from "@workmesh/db";
import {
  assertAgentSessionTransition, assertCompletionEvidence, assertRevision,
  DomainError, validatePlanSteps,
} from "@workmesh/domain";
import type {
  AgentSessionState, Capability, CompleteAgentSessionInput, PlanStepInput,
} from "@workmesh/contracts";
import { assertAgentWrite, loadAgentSessionForMutation } from "./guard.js";
import type { ApiActor, RequestMeta } from "./types.js";

const one = <T>(rows: T[]): T => { const value = rows[0]; if (!value) throw new DomainError("NOT_FOUND", "Resource not found"); return value; };
const sensitiveKey = /(^|[_-])(token|password|secret|authorization|cookie|api[_-]?key)([_-]|$)/i;
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;
const canonicalPayloadHash = (value: unknown) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
/** Operational facts may be persisted, but credentials must never enter an event, activity, artifact, or approval payload. */
export function assertSanitized(value: unknown, path = "payload"): void {
  if (typeof value === "string") { assertSafeText(value, path); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) { if (sensitiveKey.test(key)) throw new DomainError("VALIDATION_ERROR", `Sensitive field is not permitted in ${path}`); assertSanitized(item, `${path}.${key}`); }
}
const sensitiveText = /\b(?:bearer\s+[a-z0-9._~-]{12,}|(?:token|secret|password|api[_-]?key)\s*=\s*\S+)/i;
const jwtLike = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/;
export function assertSafeText(value: string | undefined, field: string): void { if(!value) return; if(sensitiveText.test(value)||jwtLike.test(value)||/https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value)) throw new DomainError("VALIDATION_ERROR",`Sensitive content is not permitted in ${field}`); }
const masterKey = (): Buffer => {
  const raw = process.env.WORKMESH_MASTER_KEY;
  if (!raw) throw new DomainError("INTERNAL_ERROR", "WORKMESH_MASTER_KEY is required for agent secret operations");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new DomainError("INTERNAL_ERROR", "WORKMESH_MASTER_KEY must decode to 32 bytes");
  return key;
};
const encryptSecret = (secret: string) => {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  return { ciphertext: Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]), iv, authTag: cipher.getAuthTag() };
};
const event = async (tx: PoolClient, meta: RequestMeta, type: string, aggregateType: string, aggregateId: string, revision: number, payload: Record<string, unknown>, teamId?: string, sessionId?: string, sequence?: number): Promise<string> => {
  let sessionSequence = sequence;
  if (sessionId && sessionSequence === undefined) sessionSequence = one((await tx.query<{ sequence: number }>("UPDATE agent_sessions SET sequence=sequence+1,updated_at=now() WHERE id=$1 RETURNING sequence", [sessionId])).rows).sequence;
  const inserted = await tx.query<{ id: string }>("INSERT INTO domain_events(workspace_id,team_id,event_type,aggregate_type,aggregate_id,aggregate_revision,actor_id,correlation_id,idempotency_key,payload,session_id,session_sequence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id", [meta.actor.workspaceId, teamId ?? null, type, aggregateType, aggregateId, revision, meta.actor.id, meta.correlationId, meta.idempotencyKey, payload, sessionId ?? null, sessionSequence ?? null]);
  await tx.query("INSERT INTO outbox_events(domain_event_id,topic,partition_key) VALUES($1,$2,$3)", [inserted.rows[0]!.id, type, aggregateId]);
  return inserted.rows[0]!.id;
};

async function queueWebhookDeliveries(tx: PoolClient, agentId: string, eventId: string, eventType: string, sessionId: string | undefined, payload: Record<string, unknown>): Promise<void> {
  const targets = await tx.query<{ endpoint_id: string; version: number }>("SELECT e.id AS endpoint_id,s.version FROM agent_webhook_endpoints e JOIN agent_webhook_secrets s ON s.endpoint_id=e.id WHERE e.agent_id=$1 AND e.is_active AND s.status='active' AND (s.valid_until IS NULL OR s.valid_until>now())", [agentId]);
  for (const target of targets.rows) await tx.query("INSERT INTO agent_webhook_deliveries(agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,session_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [agentId, target.endpoint_id, target.version, eventId, crypto.randomUUID(), eventType, sessionId ?? null, payload]);
}

/** Same idempotency record as Stage 0, deliberately scoped to the authenticated actor. */
export async function agentMutate<T>(db: Pool, meta: RequestMeta, handler: (tx: PoolClient) => Promise<T>): Promise<T> {
  return withTx(db, async tx => {
    const reserved = await tx.query("INSERT INTO api_idempotency_keys(workspace_id,actor_id,idempotency_key,operation,request_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING idempotency_key", [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey, meta.operation, meta.requestHash]);
    if (!reserved.rowCount) {
      const previous = one((await tx.query<{ operation: string; request_hash: string; response_body: T | null }>("SELECT operation,request_hash,response_body FROM api_idempotency_keys WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE", [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey])).rows);
      if (previous.operation !== meta.operation || previous.request_hash !== meta.requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request");
      if (previous.response_body === null) throw new DomainError("IDEMPOTENCY_REPLAY_UNAVAILABLE", "The original response is unavailable");
      return previous.response_body;
    }
    const response = await handler(tx);
    await tx.query("UPDATE api_idempotency_keys SET response_status=200,response_body=$4 WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3", [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey, response]);
    return response;
  });
}

const requireAdmin = (actor: ApiActor) => { if (actor.kind !== "human" || actor.workspaceRole !== "admin") throw new DomainError("FORBIDDEN", "Workspace administrator role is required"); };
export async function assertHumanTeam(tx: PoolClient, actor: ApiActor, teamId: string, manage = false): Promise<void> {
  const found = await tx.query<{ role: "admin" | "maintainer" | "member" }>("SELECT m.role FROM memberships m JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.team_id=$2 AND m.actor_id=$3 AND t.deleted_at IS NULL", [actor.workspaceId, teamId, actor.id]);
  if (actor.workspaceRole === "admin") return;
  const role = found.rows[0]?.role;
  if (!role || (manage && role === "member")) throw new DomainError("FORBIDDEN", manage ? "Team maintainer role is required" : "Team membership is required");
}

export async function registerAgent(db: Pool, meta: RequestMeta, input: Record<string, unknown>) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.name as string | undefined, "agent name"); assertSafeText(input.slug as string | undefined, "agent slug"); assertSafeText(input.description as string | undefined, "agent description"); assertSanitized(input.metadata ?? {});
    const requestedCapabilities = (input.requestedCapabilities ?? []) as Capability[];
    const approvedCapabilities = (input.approvedCapabilities ?? []) as Capability[];
    if (approvedCapabilities.some(capability => !requestedCapabilities.includes(capability))) throw new DomainError("CAPABILITY_DENIED", "Approved capabilities must be a subset of requested capabilities");
    const actor = one((await tx.query<{ id: string }>("INSERT INTO actors(workspace_id,kind,display_name,is_active) VALUES($1,'agent',$2,true) RETURNING id", [meta.actor.workspaceId, input.name])).rows);
    const row = one((await tx.query("INSERT INTO agent_definitions(workspace_id,actor_id,slug,display_name,description,endpoint_url,manifest,supported_protocols,skills,requested_capabilities,approved_capabilities,output_artifact_types,max_concurrency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [meta.actor.workspaceId, actor.id, input.slug, input.name, input.description ?? null, input.endpointUrl ?? null, { provider: input.provider, version: input.version, icon: input.icon ?? null, heartbeatIntervalSeconds: input.heartbeatIntervalSeconds, metadata: input.metadata ?? {} }, input.supportedProtocols, input.skills ?? [], requestedCapabilities, approvedCapabilities, input.outputArtifactTypes ?? [], input.maxConcurrency ?? 1])).rows);
    const installationToken = opaqueToken();
    await tx.query("INSERT INTO agent_installation_tokens(agent_id,token_hash,created_by_actor_id) VALUES($1,$2,$3)", [(row as { id: string }).id, tokenHash(installationToken), meta.actor.id]);
    if (input.endpointUrl) await tx.query("INSERT INTO agent_webhook_endpoints(agent_id,url) VALUES($1,$2)", [(row as { id: string }).id, input.endpointUrl]);
    await event(tx, meta, "agent.registered", "agent", String((row as { id: string }).id), Number((row as { revision: number }).revision), { slug: input.slug as string });
    return { ...row as object, installation_token: installationToken };
  });
}

export async function updateAgent(db: Pool, meta: RequestMeta, id: string, revision: number, input: Record<string, unknown>) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.name as string | undefined, "agent name"); assertSafeText(input.description as string | undefined, "agent description"); assertSanitized(input.metadata ?? {});
    const current = one((await tx.query<{ revision: number; actor_id: string; requested_capabilities: Capability[]; approved_capabilities: Capability[] }>("SELECT revision,actor_id,requested_capabilities,approved_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [id, meta.actor.workspaceId])).rows);
    assertRevision(revision, current.revision);
    const requestedCapabilities = (input.requestedCapabilities ?? current.requested_capabilities) as Capability[];
    const approvedCapabilities = (input.approvedCapabilities ?? current.approved_capabilities) as Capability[];
    if (approvedCapabilities.some(capability => !requestedCapabilities.includes(capability))) throw new DomainError("CAPABILITY_DENIED", "Approved capabilities must be a subset of requested capabilities");
    const fields: Array<[string, unknown]> = [["display_name", input.name], ["description", input.description], ["endpoint_url", input.endpointUrl], ["supported_protocols", input.supportedProtocols], ["skills", input.skills], ["requested_capabilities", input.requestedCapabilities], ["approved_capabilities", input.approvedCapabilities], ["output_artifact_types", input.outputArtifactTypes], ["max_concurrency", input.maxConcurrency], ["is_active", input.isActive]];
    const changed = fields.filter(([, value]) => value !== undefined);
    if (!changed.length) throw new DomainError("VALIDATION_ERROR", "At least one field is required");
    const values: unknown[] = [id, meta.actor.workspaceId];
    const assignments = changed.map(([column, value], index) => { values.push(value); return `${column}=$${index + 3}`; });
    const row = one((await tx.query(`UPDATE agent_definitions SET ${assignments.join(",")},revision=revision+1,updated_at=now() WHERE id=$1 AND workspace_id=$2 RETURNING *`, values)).rows);
    if (input.isActive === false) { await tx.query("UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND agent_id=$3 AND status='active'", [meta.actor.workspaceId, meta.actor.id, id]); await tx.query("UPDATE agent_session_tokens t SET revoked_at=now() FROM agent_sessions s WHERE t.session_id=s.id AND s.workspace_id=$1 AND s.agent_id=$2 AND t.revoked_at IS NULL", [meta.actor.workspaceId, id]); }
    await event(tx, meta, input.isActive === false ? "agent.delegation.revoked" : "agent.registered", "agent", id, Number((row as { revision: number }).revision), { updated: changed.map(([name]) => name) });
    return row;
  });
}

export async function rotateWebhookSecret(db: Pool, meta: RequestMeta, agentId: string, endpointId: string, revision: number) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    const agent = one((await tx.query<{ revision: number }>("SELECT revision FROM agent_definitions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [agentId, meta.actor.workspaceId])).rows); assertRevision(revision, agent.revision);
    one((await tx.query("SELECT e.id FROM agent_webhook_endpoints e JOIN agent_definitions a ON a.id=e.agent_id WHERE e.id=$1 AND e.agent_id=$2 AND a.workspace_id=$3 FOR UPDATE", [endpointId, agentId, meta.actor.workspaceId])).rows);
    await tx.query("UPDATE agent_webhook_secrets SET status='retiring',valid_until=now()+interval '10 minutes' WHERE endpoint_id=$1 AND status='active'", [endpointId]);
    const version = Number((await tx.query<{ version: number }>("SELECT coalesce(max(version),0)+1 AS version FROM agent_webhook_secrets WHERE endpoint_id=$1", [endpointId])).rows[0]?.version ?? 1);
    const secret = opaqueToken(); const encrypted = encryptSecret(secret);
    await tx.query("INSERT INTO agent_webhook_secrets(endpoint_id,version,secret_ciphertext,iv,auth_tag,key_version,status,valid_from,created_by_actor_id) VALUES($1,$2,$3,$4,$5,1,'active',now(),$6)", [endpointId, version, encrypted.ciphertext, encrypted.iv, encrypted.authTag, meta.actor.id]);
    const row = one((await tx.query("UPDATE agent_definitions SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [agentId])).rows);
    await event(tx, meta, "agent.registered", "agent", agentId, Number((row as { revision: number }).revision), { webhookSecretRotated: true, endpointId, version });
    return { endpointId, version, secret };
  });
}

export async function createWebhookEndpoint(db: Pool, meta: RequestMeta, agentId: string, url: string) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    const agent = one((await tx.query<{ revision:number }>("SELECT revision FROM agent_definitions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [agentId,meta.actor.workspaceId])).rows);
    const endpoint = one((await tx.query("INSERT INTO agent_webhook_endpoints(agent_id,url) VALUES($1,$2) RETURNING *", [agentId,url])).rows);
    const updated = one((await tx.query("UPDATE agent_definitions SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [agentId])).rows);
    await event(tx,meta,"agent.registered","agent",agentId,Number((updated as {revision:number}).revision),{webhookEndpointCreated:true,endpointId:(endpoint as {id:string}).id,previousRevision:agent.revision});
    return endpoint;
  });
}

export async function grantAgentTeamAccess(db: Pool, meta: RequestMeta, agentId: string, teamId: string, capabilities: Capability[]) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    const agent = one((await tx.query<{ requested_capabilities: Capability[] }>("SELECT requested_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [agentId, meta.actor.workspaceId])).rows);
    if (capabilities.some(capability => !agent.requested_capabilities.includes(capability))) throw new DomainError("CAPABILITY_DENIED", "Team grant must be a subset of requested capabilities");
    one((await tx.query("SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL", [teamId, meta.actor.workspaceId])).rows);
    const row = one((await tx.query(`WITH saved AS (
      INSERT INTO agent_team_access(workspace_id,agent_id,team_id,granted_by_actor_id,approved_capabilities,revoked_at)
      VALUES($1,$2,$3,$4,$5,NULL)
      ON CONFLICT(agent_id,team_id) DO UPDATE SET granted_by_actor_id=EXCLUDED.granted_by_actor_id,approved_capabilities=EXCLUDED.approved_capabilities,revoked_at=NULL
      RETURNING *
    ) SELECT saved.*, 'active'::text AS status, saved.granted_by_actor_id AS approved_by_actor_id, 1::integer AS revision, saved.created_at AS updated_at FROM saved`, [meta.actor.workspaceId, agentId, teamId, meta.actor.id, capabilities])).rows);
    await event(tx, meta, "agent.registered", "agent_team_access", agentId, 1, { agentId, teamId, capabilities }, teamId); return row;
  });
}

export async function revokeAgentTeamAccess(db: Pool, meta: RequestMeta, agentId: string, teamId: string) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    one((await tx.query("SELECT id FROM agent_definitions WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[agentId,meta.actor.workspaceId])).rows);
    one((await tx.query("SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",[teamId,meta.actor.workspaceId])).rows);
    const row = one((await tx.query(`WITH saved AS (
      UPDATE agent_team_access SET revoked_at=now()
      WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL
      RETURNING *
    ) SELECT saved.*, 'revoked'::text AS status, saved.granted_by_actor_id AS approved_by_actor_id, 1::integer AS revision, saved.created_at AS updated_at FROM saved`,[meta.actor.workspaceId,agentId,teamId])).rows);
    const delegations=await tx.query<{id:string;revision:number;agent_id:string}>("UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$4,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND status='active' RETURNING id,revision,agent_id",[meta.actor.workspaceId,agentId,teamId,meta.actor.id]);
    const sessions=await tx.query<{id:string;delegation_id:string}>("SELECT s.id,s.delegation_id FROM agent_sessions s WHERE s.workspace_id=$1 AND s.agent_id=$2 AND s.team_id=$3",[meta.actor.workspaceId,agentId,teamId]);
    await tx.query("UPDATE agent_session_tokens t SET revoked_at=now() FROM agent_sessions s WHERE t.session_id=s.id AND s.workspace_id=$1 AND s.agent_id=$2 AND s.team_id=$3 AND t.revoked_at IS NULL",[meta.actor.workspaceId,agentId,teamId]);
    const updated=one((await tx.query("UPDATE agent_definitions SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[agentId])).rows);
    await event(tx,meta,"agent.registered","agent_team_access",agentId,Number((updated as {revision:number}).revision),{agentId,teamId,revoked:true},teamId);
    for(const delegation of delegations.rows){ const eventId=await event(tx,meta,"agent.delegation.revoked","delegation",delegation.id,delegation.revision,{teamAccessRevoked:true},teamId); for(const session of sessions.rows.filter(session=>session.delegation_id===delegation.id)) await queueWebhookDeliveries(tx,agentId,eventId,"agent.delegation.revoked",session.id,{delegationId:delegation.id,sessionId:session.id}); }
    return row;
  });
}

export async function revokeDelegation(db: Pool, meta: RequestMeta, delegationId: string, revision: number) {
  requireAdmin(meta.actor);
  return agentMutate(db, meta, async tx => {
    const delegation = one((await tx.query<{ team_id:string; agent_id:string; revision:number }>("SELECT team_id,agent_id,revision FROM delegations WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [delegationId,meta.actor.workspaceId])).rows); assertRevision(revision,delegation.revision);
    const row = one((await tx.query("UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[delegationId,meta.actor.id])).rows);
    await tx.query("UPDATE agent_session_tokens t SET revoked_at=now() FROM agent_sessions s WHERE s.delegation_id=$1 AND t.session_id=s.id AND t.revoked_at IS NULL",[delegationId]);
    const sessions=await tx.query<{id:string}>("SELECT id FROM agent_sessions WHERE delegation_id=$1",[delegationId]); const eid=await event(tx,meta,"agent.delegation.revoked","delegation",delegationId,Number((row as {revision:number}).revision),{},delegation.team_id);
    for(const session of sessions.rows) await queueWebhookDeliveries(tx,delegation.agent_id,eid,"agent.delegation.revoked",session.id,{delegationId,sessionId:session.id}); return row;
  });
}

export async function createDelegation(db: Pool, meta: RequestMeta, workItemId: string, input: { agentId: string; principalHumanActorId: string; role: string; scopeType: string; scopeId: string; permissionsSnapshot: Capability[]; capabilityScope: unknown; startsAt?: string; endsAt?: string }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can delegate work");
  return agentMutate(db, meta, async tx => {
    const work = one((await tx.query<{ team_id: string; responsible_human_actor_id: string | null }>("SELECT team_id,responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE", [workItemId, meta.actor.workspaceId])).rows); await assertHumanTeam(tx, meta.actor, work.team_id);
    if (input.scopeType !== "work_item" || input.scopeId !== workItemId) throw new DomainError("VALIDATION_ERROR", "A work-item delegation must scope exactly that work item");
    if (!work.responsible_human_actor_id || input.principalHumanActorId !== work.responsible_human_actor_id) throw new DomainError("RESPONSIBLE_HUMAN_REQUIRED", "Delegation principal must be the work item's responsible human");
    const agent = one((await tx.query<{ id: string; approved_capabilities: Capability[]; max_concurrency: number }>("SELECT id,approved_capabilities,max_concurrency FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active=true FOR UPDATE", [input.agentId, meta.actor.workspaceId])).rows);
    one((await tx.query("SELECT 1 FROM actors a JOIN memberships m ON m.actor_id=a.id AND m.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2 AND a.kind='human' AND a.is_active AND m.team_id=$3", [input.principalHumanActorId, meta.actor.workspaceId, work.team_id])).rows);
    const grant = one((await tx.query<{ approved_capabilities: Capability[] }>("SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL FOR UPDATE", [meta.actor.workspaceId, input.agentId, work.team_id])).rows);
    const granted = agent.approved_capabilities.filter(capability => grant.approved_capabilities.includes(capability));
    if (input.permissionsSnapshot.some(capability => !granted.includes(capability))) throw new DomainError("CAPABILITY_DENIED", "Requested delegation capabilities exceed definition or team approval");
    const active = await tx.query<{ count: number }>("SELECT count(*)::int AS count FROM agent_sessions WHERE agent_id=$1 AND state NOT IN ('completed','failed','canceled')", [input.agentId]);
    if ((active.rows[0]?.count ?? 0) >= agent.max_concurrency) throw new DomainError("AGENT_CONCURRENCY_LIMIT", "Agent concurrency limit reached");
    const capabilityScope = { workspaceId: meta.actor.workspaceId, teamIds: [work.team_id], projectIds: [], workItemIds: [workItemId], repositoryIds: [], capabilities: input.permissionsSnapshot };
    const row = one((await tx.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,status) SELECT $1,$2,a.id,a.actor_id,$3,$4,$5,$6,$4,$8,$9,'active' FROM agent_definitions a WHERE a.id=$7 AND a.workspace_id=$1 RETURNING *", [meta.actor.workspaceId, work.team_id, input.principalHumanActorId, workItemId, input.role, input.scopeType, input.agentId, input.permissionsSnapshot, capabilityScope])).rows);
    await event(tx, meta, "agent.delegation.created", "delegation", String((row as { id: string }).id), Number((row as { revision: number }).revision), { workItemId, agentId: input.agentId }, work.team_id);
    return row;
  });
}

export async function createAgentSession(db: Pool, meta: RequestMeta, input: { delegationId: string; workItemId?: string; projectId?: string; planStepId?: string; initialPrompt: string; contextSnapshotId?: string; budget: unknown }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can start an agent session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.initialPrompt, "initial prompt");
    const delegation = one((await tx.query<{ id: string; team_id: string; agent_id: string; agent_actor_id: string; work_item_id: string | null; principal_human_actor_id: string; status: string }>("SELECT * FROM delegations WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [input.delegationId, meta.actor.workspaceId])).rows);
    if (delegation.status !== "active") throw new DomainError("DELEGATION_NOT_ACTIVE", "Delegation is not active"); await assertHumanTeam(tx, meta.actor, delegation.team_id);
    const agent = one((await tx.query<{ max_concurrency: number; approved_capabilities: Capability[] }>("SELECT max_concurrency,approved_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active FOR UPDATE", [delegation.agent_id, meta.actor.workspaceId])).rows);
    const grant = one((await tx.query<{ approved_capabilities: Capability[] }>("SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL FOR UPDATE", [meta.actor.workspaceId, delegation.agent_id, delegation.team_id])).rows);
    const delegationCapabilities = (await tx.query<{ permissions_snapshot: Capability[] }>("SELECT permissions_snapshot FROM delegations WHERE id=$1", [delegation.id])).rows[0]!.permissions_snapshot;
    if (delegationCapabilities.some(capability => !grant.approved_capabilities.includes(capability) || !agent.approved_capabilities.includes(capability))) throw new DomainError("DELEGATION_NOT_ACTIVE", "Delegation capabilities are no longer approved for this team");
    const active = await tx.query("SELECT id FROM agent_sessions WHERE agent_id=$1 AND state NOT IN ('completed','failed','canceled') FOR UPDATE", [delegation.agent_id]);
    if ((active.rowCount ?? 0) >= agent.max_concurrency) throw new DomainError("AGENT_CONCURRENCY_LIMIT", "Agent concurrency limit reached");
    const workItemId = input.workItemId ?? delegation.work_item_id;
    if (workItemId !== delegation.work_item_id) throw new DomainError("RESOURCE_SCOPE_DENIED", "The session subject is outside the delegation");
    const work = workItemId ? one((await tx.query<{ id: string; title: string; description: string | null; revision: number; responsible_human_actor_id: string | null }>("SELECT id,title,description,revision,responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [workItemId, meta.actor.workspaceId])).rows) : undefined;
    if (work && !work.responsible_human_actor_id) throw new DomainError("RESPONSIBLE_HUMAN_REQUIRED", "A delegated work item must retain a responsible human");
    let contextSnapshotId = input.contextSnapshotId;
    if (contextSnapshotId) {
      const context = one((await tx.query<{ id:string }>("SELECT id FROM context_snapshots WHERE id=$1 AND workspace_id=$2 AND work_item_id IS NOT DISTINCT FROM $3",[contextSnapshotId,meta.actor.workspaceId,workItemId ?? null])).rows);
      contextSnapshotId=context.id;
    }
    if (!contextSnapshotId) {
      const manifest = { workItem: work ? { id: work.id, title: work.title, description: work.description, revision: work.revision } : null };
      const contentHash = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
      const created = await tx.query<{ id: string }>("INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,content_hash,created_by_actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,content_hash) DO NOTHING RETURNING id", [meta.actor.workspaceId, workItemId ?? null, manifest, contentHash, meta.actor.id]);
      contextSnapshotId = created.rows[0]?.id ?? one((await tx.query<{ id: string }>("SELECT id FROM context_snapshots WHERE workspace_id=$1 AND content_hash=$2", [meta.actor.workspaceId,contentHash])).rows).id;
    }
    const session = one((await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,project_id,plan_step_id,context_snapshot_id,budget) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [meta.actor.workspaceId, delegation.team_id, delegation.agent_id, delegation.agent_actor_id, delegation.id, workItemId ?? null, input.projectId ?? null, input.planStepId ?? null, contextSnapshotId, input.budget])).rows);
    const installation = one((await tx.query<{ id: string }>("SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [delegation.agent_id])).rows);
    const exchangeNonce = opaqueToken();
    await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,issued_by_actor_id) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)", [(session as { id: string }).id, delegation.agent_id, installation.id, tokenHash(opaqueToken()), tokenHash(exchangeNonce), meta.actor.id]);
    await tx.query("INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)", [(session as { id: string }).id, meta.actor.id, input.initialPrompt]);
    const eventId = await event(tx, meta, "agent.session.created", "agent_session", String((session as { id: string }).id), 1, { delegationId: delegation.id, workItemId: workItemId ?? null }, delegation.team_id, String((session as { id: string }).id), 0);
    await queueWebhookDeliveries(tx, delegation.agent_id, eventId, "agent.session.created", String((session as { id: string }).id), { sessionId: (session as { id: string }).id, exchangeToken: exchangeNonce, initialPrompt: input.initialPrompt });
    return { ...session as object, exchangeToken: exchangeNonce };
  });
}

export async function delegateAndStartAgentSession(db: Pool, meta: RequestMeta, workItemId: string, expectedRevision: number, input: { agentId:string; principalHumanActorId:string; role:string; requestedCapabilities:Capability[]; initialPrompt:string; contextSnapshotId?:string; budget:unknown }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can start an agent session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.initialPrompt, "initial prompt");
    const work=one((await tx.query<{team_id:string;revision:number;responsible_human_actor_id:string|null;title:string;description:string|null}>("SELECT team_id,revision,responsible_human_actor_id,title,description FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",[workItemId,meta.actor.workspaceId])).rows);
    await assertHumanTeam(tx,meta.actor,work.team_id); assertRevision(expectedRevision,work.revision);
    if (!work.responsible_human_actor_id || work.responsible_human_actor_id!==input.principalHumanActorId) throw new DomainError("RESPONSIBLE_HUMAN_REQUIRED","Delegation principal must remain the work item's responsible human");
    one((await tx.query("SELECT 1 FROM actors a JOIN memberships m ON m.actor_id=a.id AND m.workspace_id=a.workspace_id WHERE a.id=$1 AND a.workspace_id=$2 AND a.kind='human' AND a.is_active AND m.team_id=$3",[input.principalHumanActorId,meta.actor.workspaceId,work.team_id])).rows);
    const agent=one((await tx.query<{actor_id:string;approved_capabilities:Capability[];max_concurrency:number}>("SELECT actor_id,approved_capabilities,max_concurrency FROM agent_definitions WHERE id=$1 AND workspace_id=$2 AND is_active FOR UPDATE",[input.agentId,meta.actor.workspaceId])).rows);
    const grant=one((await tx.query<{approved_capabilities:Capability[]}>("SELECT approved_capabilities FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3 AND revoked_at IS NULL FOR UPDATE",[meta.actor.workspaceId,input.agentId,work.team_id])).rows);
    const granted=agent.approved_capabilities.filter(capability=>grant.approved_capabilities.includes(capability));
    if (input.requestedCapabilities.some(capability=>!granted.includes(capability))) throw new DomainError("CAPABILITY_DENIED","Requested delegation capabilities exceed definition or team approval");
    let delegation=(await tx.query("SELECT * FROM delegations WHERE workspace_id=$1 AND work_item_id=$2 AND agent_id=$3 AND principal_human_actor_id=$4 AND role=$5 AND status='active' FOR UPDATE",[meta.actor.workspaceId,workItemId,input.agentId,input.principalHumanActorId,input.role])).rows[0] as Record<string,unknown>|undefined;
    if (delegation) {
      const existingCapabilities = [...((delegation.permissions_snapshot as Capability[]) ?? [])].sort();
      const requestedCapabilities = [...input.requestedCapabilities].sort();
      if (JSON.stringify(existingCapabilities) !== JSON.stringify(requestedCapabilities) || delegation.scope_type !== "work_item" || delegation.scope_id !== workItemId) throw new DomainError("ACTIVE_DELEGATION_SCOPE_MISMATCH", "Existing active delegation has a different work-item scope or capability snapshot");
    }
    if (!delegation) {
      const scope={workspaceId:meta.actor.workspaceId,teamIds:[work.team_id],projectIds:[],workItemIds:[workItemId],repositoryIds:[],capabilities:input.requestedCapabilities};
      delegation=one((await tx.query("INSERT INTO delegations(workspace_id,team_id,agent_id,agent_actor_id,principal_human_actor_id,work_item_id,role,scope_type,scope_id,permissions_snapshot,capability_scope,status) VALUES($1,$2,$3,$4,$5,$6,$7,'work_item',$6,$8,$9,'active') RETURNING *",[meta.actor.workspaceId,work.team_id,input.agentId,agent.actor_id,input.principalHumanActorId,workItemId,input.role,input.requestedCapabilities,scope])).rows) as Record<string,unknown>;
      await event(tx,meta,"agent.delegation.created","delegation",String(delegation.id),Number(delegation.revision),{workItemId,agentId:input.agentId},work.team_id);
    }
    const active=await tx.query("SELECT id FROM agent_sessions WHERE agent_id=$1 AND state NOT IN ('completed','failed','canceled') FOR UPDATE",[input.agentId]);
    if ((active.rowCount ?? 0)>=agent.max_concurrency) throw new DomainError("AGENT_CONCURRENCY_LIMIT","Agent concurrency limit reached");
    let contextId=input.contextSnapshotId;
    if (contextId) one((await tx.query("SELECT id FROM context_snapshots WHERE id=$1 AND workspace_id=$2 AND work_item_id=$3",[contextId,meta.actor.workspaceId,workItemId])).rows);
    if (!contextId) { const manifest={workItem:{id:workItemId,title:work.title,description:work.description,revision:work.revision}}; const hash=crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex"); const created=await tx.query<{id:string}>("INSERT INTO context_snapshots(workspace_id,work_item_id,manifest,content_hash,created_by_actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,content_hash) DO NOTHING RETURNING id",[meta.actor.workspaceId,workItemId,manifest,hash,meta.actor.id]); contextId=created.rows[0]?.id??one((await tx.query<{id:string}>("SELECT id FROM context_snapshots WHERE workspace_id=$1 AND content_hash=$2",[meta.actor.workspaceId,hash])).rows).id; }
    const session=one((await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,context_snapshot_id,budget) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[meta.actor.workspaceId,work.team_id,input.agentId,agent.actor_id,delegation.id,workItemId,contextId,input.budget])).rows) as Record<string,unknown>;
    const install=one((await tx.query<{id:string}>("SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[input.agentId])).rows);
    const exchange=opaqueToken(); await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,issued_by_actor_id) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)",[session.id,input.agentId,install.id,tokenHash(opaqueToken()),tokenHash(exchange),meta.actor.id]);
    await tx.query("INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)",[session.id,meta.actor.id,input.initialPrompt]);
    const eventId=await event(tx,meta,"agent.session.created","agent_session",String(session.id),1,{delegationId:delegation.id,workItemId},work.team_id,String(session.id),0); await queueWebhookDeliveries(tx,input.agentId,eventId,"agent.session.created",String(session.id),{sessionId:session.id,exchangeToken:exchange,initialPrompt:input.initialPrompt});
    return {delegation,session:{...session,exchangeToken:exchange}};
  });
}

export async function exchangeAgentToken(db: Pool, sessionId: string, nonce: string, installationBearer: string) {
  return withTx(db, async tx => {
    const token = one((await tx.query<{ id: string; installation_token_id: string; expires_at: Date }>("SELECT t.id,t.installation_token_id,t.expires_at FROM agent_session_tokens t JOIN agent_sessions s ON s.id=t.session_id WHERE t.session_id=$1 AND t.exchange_nonce_hash=$2 AND t.expires_at>now() AND t.exchanged_at IS NULL AND t.revoked_at IS NULL AND s.state NOT IN ('completed','failed','canceled') FOR UPDATE", [sessionId, tokenHash(nonce)])).rows);
    const installation = await tx.query("SELECT 1 FROM agent_installation_tokens WHERE id=$1 AND token_hash=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE", [token.installation_token_id, tokenHash(installationBearer)]);
    if (!installation.rowCount) throw new DomainError("UNAUTHENTICATED", "Active installation credential is required");
    const bearer = opaqueToken();
    await tx.query("UPDATE agent_session_tokens SET token_hash=$2,exchanged_at=now() WHERE id=$1", [token.id, tokenHash(bearer)]);
    await tx.query("UPDATE agent_installation_tokens SET last_used_at=now() WHERE id=$1", [token.installation_token_id]);
    return { sessionToken: bearer, expiresAt: token.expires_at.toISOString() };
  });
}

export async function refreshAgentToken(db: Pool, sessionId: string, installationBearer: string) {
  return withTx(db, async tx => {
    const session = one((await tx.query<{ id: string; agent_id: string; delegation_id: string; state: string; delegation_status:string; agent_active:boolean; team_active:boolean }>("SELECT s.id,s.agent_id,s.delegation_id,s.state,d.status AS delegation_status,a.is_active AS agent_active,EXISTS(SELECT 1 FROM agent_team_access ata WHERE ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL) AS team_active FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id WHERE s.id=$1 FOR UPDATE", [sessionId])).rows);
    if (["stopping", "completed", "failed", "canceled"].includes(session.state)) throw new DomainError("SESSION_STOPPED", "Stopped session cannot refresh its token");
    if (!session.agent_active || session.delegation_status !== "active" || !session.team_active) throw new DomainError("DELEGATION_NOT_ACTIVE", "Agent delegation or team access is no longer active");
    const installation = one((await tx.query<{ id: string }>("SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE", [session.agent_id, tokenHash(installationBearer)])).rows);
    await tx.query("UPDATE agent_session_tokens SET revoked_at=now() WHERE session_id=$1 AND revoked_at IS NULL", [sessionId]);
    const raw = opaqueToken(); await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,exchanged_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now())", [sessionId, session.agent_id, installation.id, tokenHash(raw), tokenHash(opaqueToken())]);
    return { sessionToken: raw, expiresAt: new Date(Date.now() + 900_000).toISOString() };
  });
}

export async function retrySession(db: Pool, meta: RequestMeta, sourceId: string, revision: number, input: { reason: string; initialPrompt?: string; reuseContext: boolean }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can retry a session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "retry reason"); assertSafeText(input.initialPrompt, "retry prompt");
    const source = one((await tx.query<Record<string, unknown>>("SELECT s.*,d.principal_human_actor_id,d.status AS delegation_status,a.is_active AS agent_active,EXISTS(SELECT 1 FROM agent_team_access ata WHERE ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL) AS team_active,a.max_concurrency FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id WHERE s.id=$1 AND s.workspace_id=$2 FOR UPDATE", [sourceId, meta.actor.workspaceId])).rows) as Record<string, unknown>;
    await assertHumanTeam(tx, meta.actor, source.team_id as string); assertRevision(revision, source.revision as number);
    if (!['failed','canceled','stale'].includes(source.state as string)) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED", "Only failed, canceled, or stale sessions can be retried");
    if (!source.agent_active || source.delegation_status!=="active" || !source.team_active) throw new DomainError("DELEGATION_NOT_ACTIVE","Retry requires an active agent delegation and team grant");
    if ((await tx.query("SELECT 1 FROM agent_sessions WHERE retry_of_session_id=$1 FOR UPDATE",[sourceId])).rowCount) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED","A direct retry already exists for this source session");
    if (source.state === "stale") {
      const competing = await tx.query("SELECT 1 FROM agent_sessions WHERE delegation_id=$1 AND id<>$2 AND state NOT IN ('completed','failed','canceled') FOR UPDATE", [source.delegation_id, sourceId]);
      if (competing.rowCount) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED", "A stale session cannot be retried while another session is active for its delegation");
      const canceled = one((await tx.query("UPDATE agent_sessions SET state='canceled',state_reason='retrying stale session',ended_at=now(),sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision,sequence", [sourceId])).rows);
      await event(tx, meta, "agent.session.state_changed", "agent_session", sourceId, Number((canceled as {revision:number}).revision), { state: "canceled", reason: "retrying stale session" }, source.team_id as string, sourceId, Number((canceled as {sequence:number}).sequence));
    }
    const activeCount=await tx.query<{count:number}>("SELECT count(*)::int AS count FROM agent_sessions WHERE agent_id=$1 AND state NOT IN ('completed','failed','canceled')",[source.agent_id]); if((activeCount.rows[0]?.count??0)>=Number(source.max_concurrency)) throw new DomainError("AGENT_CONCURRENCY_LIMIT","Agent concurrency limit reached");
    const prompt = input.initialPrompt ?? `Retry: ${input.reason}`;
    const row = one((await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,project_id,plan_step_id,context_snapshot_id,budget,retry_of_session_id,retry_reason,retry_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [source.workspace_id,source.team_id,source.agent_id,source.agent_actor_id,source.delegation_id,source.work_item_id,source.project_id,source.plan_step_id,input.reuseContext ? source.context_snapshot_id : null,source.budget,sourceId,input.reason,(source.retry_count as number)+1])).rows);
    const install = one((await tx.query<{ id: string }>("SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [source.agent_id])).rows); const exchange = opaqueToken();
    await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')", [(row as {id:string}).id,source.agent_id,install.id,tokenHash(opaqueToken()),tokenHash(exchange)]);
    await tx.query("INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown) VALUES($1,$2,$3)", [(row as {id:string}).id,meta.actor.id,prompt]);
    const eid = await event(tx,meta,"agent.session.created","agent_session",(row as {id:string}).id,1,{retryOf:sourceId},source.team_id as string,(row as {id:string}).id,0); await queueWebhookDeliveries(tx,source.agent_id as string,eid,"agent.session.created",(row as {id:string}).id,{sessionId:(row as {id:string}).id,exchangeToken:exchange,initialPrompt:prompt}); return row;
  });
}

export async function appendActivity(db: Pool, meta: RequestMeta, sessionId: string, input: { kind: string; summary: string; detailsMarkdown?: string; toolInvocation?: unknown; artifactIds: string[]; references: unknown[]; visibility: string; ephemeral: boolean }, revision?: number) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.summary,"activity summary"); assertSafeText(input.detailsMarkdown,"activity details");
    assertSanitized({ toolInvocation: input.toolInvocation, references: input.references });
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "activity", idempotencyKey: meta.idempotencyKey, expectedRevision: revision });
    if (input.kind === "question") assertAgentSessionTransition(session.state, "awaiting_input");
    const updated = one((await tx.query<{ sequence: number; revision: number }>("UPDATE agent_sessions SET state=CASE WHEN $2='question' THEN 'awaiting_input'::agent_session_state ELSE state END,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING sequence,revision", [sessionId, input.kind])).rows);
    const row = one((await tx.query("INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary,details_markdown,tool_invocation,artifact_ids,references_json,visibility,ephemeral) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [sessionId, meta.actor.id, updated.sequence, input.kind, input.summary, input.detailsMarkdown ?? null, input.toolInvocation ?? null, input.artifactIds, input.references, input.visibility, input.ephemeral])).rows);
    if (input.kind === "question") { const principal = one((await tx.query<{ principal_human_actor_id: string }>("SELECT principal_human_actor_id FROM delegations WHERE id=$1", [session.delegation_id])).rows); await tx.query("INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,session_id,kind,source_type,source_id,payload) VALUES($1,$2,$3,'waiting_input','activity',$4,$5) ON CONFLICT DO NOTHING", [meta.actor.workspaceId, principal.principal_human_actor_id, sessionId, (row as { id: string }).id, { summary: input.summary }]); }
    await event(tx, meta, "agent.activity.appended", "agent_activity", String((row as { id: string }).id), updated.revision, { kind: input.kind }, session.team_id, sessionId, updated.sequence);
    return row;
  });
}

export async function acknowledge(db: Pool, meta: RequestMeta, sessionId: string, input: { summary: string; externalUrls: unknown[] }) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.summary,"acknowledgement summary");
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "ack", idempotencyKey: meta.idempotencyKey });
    assertAgentSessionTransition(session.state, "acknowledged");
    const row = one((await tx.query("UPDATE agent_sessions SET state='acknowledged',state_reason=$2,acknowledged_at=now(),external_urls=$3,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, input.summary, input.externalUrls])).rows);
    await event(tx, meta, "agent.session.acknowledged", "agent_session", sessionId, Number((row as { revision: number }).revision), { summary: input.summary }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
}

export async function heartbeat(db: Pool, meta: RequestMeta, sessionId: string, input: { currentStepId?: string; usage: unknown }) {
  return agentMutate(db, meta, async tx => {
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "heartbeat", idempotencyKey: meta.idempotencyKey });
    const row = one((await tx.query("UPDATE agent_sessions SET last_heartbeat_at=now(),sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId])).rows);
    await tx.query("INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary,details_markdown,ephemeral) VALUES($1,$2,$3,'heartbeat','Heartbeat',$4,true)", [sessionId, meta.actor.id, (row as { sequence: number }).sequence, JSON.stringify(input)]);
    await event(tx, meta, "agent.activity.appended", "agent_session", sessionId, Number((row as { revision: number }).revision), { kind: "heartbeat" }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
}

export async function transitionState(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: { state: AgentSessionState; reason: string }) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "state reason");
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "activity", idempotencyKey: meta.idempotencyKey, expectedRevision });
    assertAgentSessionTransition(session.state, input.state);
    const row = one((await tx.query("UPDATE agent_sessions SET state=$2,state_reason=$3,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, input.state, input.reason])).rows);
    await event(tx, meta, "agent.session.state_changed", "agent_session", sessionId, Number((row as { revision: number }).revision), { state: input.state, reason: input.reason }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
}

export async function publishPlan(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: { changeSummary: string; steps: PlanStepInput[]; approvalId?:string; approvalPayloadHash?:string }) {
  const result = await agentMutate(db, meta, async tx => {
    assertSafeText(input.changeSummary,"plan summary"); for(const step of input.steps){assertSafeText(step.title,"plan title");assertSafeText(step.description,"plan description");}
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "plan:write", operation: "plan", idempotencyKey: meta.idempotencyKey, expectedRevision });
    if (session.state === "awaiting_approval") {
      if (!input.approvalId || !input.approvalPayloadHash) throw new DomainError("APPROVAL_REQUIRED", "Publishing a plan while awaiting approval requires an approval id and payload hash");
      const consumed = await consumeApprovalInTx(tx,meta,sessionId,input.approvalId,input.approvalPayloadHash,"agent.plan.publish");
      if ("expired" in consumed) return consumed;
    }
    const previous = session.current_plan_version_id ? (await tx.query<PlanStepInput>("SELECT id,title,description,status,ordinal,owner_actor_id AS \"ownerActorId\",coalesce(acceptance_criteria,'[]'::jsonb) AS \"acceptanceCriteria\",expected_artifacts AS \"expectedArtifacts\",cancellation_reason AS \"cancellationReason\",coalesce((SELECT array_agg(depends_on_step_id) FROM agent_plan_step_dependencies WHERE plan_version_id=$1 AND step_id=s.id),'{}'::uuid[]) AS \"dependsOn\" FROM agent_plan_steps s WHERE plan_version_id=$1", [session.current_plan_version_id])).rows : [];
    validatePlanSteps(input.steps, previous);
    const planRevision = Number((await tx.query<{ revision: number }>("SELECT coalesce(max(revision),0)+1 AS revision FROM agent_plan_versions WHERE session_id=$1", [sessionId])).rows[0]?.revision ?? 1);
    const version = one((await tx.query<{ id: string }>("INSERT INTO agent_plan_versions(session_id,revision,parent_version_id,change_summary,author_actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [sessionId, planRevision, session.current_plan_version_id ?? null, input.changeSummary, meta.actor.id])).rows);
    for (const step of input.steps) await tx.query("INSERT INTO agent_plan_steps(plan_version_id,id,title,description,status,ordinal,owner_actor_id,acceptance_criteria,expected_artifacts,cancellation_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [version.id, step.id, step.title, step.description ?? null, step.status, step.ordinal, step.ownerActorId ?? null, step.acceptanceCriteria, step.expectedArtifacts, step.cancellationReason ?? null]);
    for (const step of input.steps) for (const dependency of step.dependsOn) await tx.query("INSERT INTO agent_plan_step_dependencies(plan_version_id,step_id,depends_on_step_id) VALUES($1,$2,$3)", [version.id, step.id, dependency]);
    const row = one((await tx.query("UPDATE agent_sessions SET current_plan_version_id=$2,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, version.id])).rows);
    await event(tx, meta, "agent.plan.published", "agent_plan_version", version.id, Number((row as { revision: number }).revision), { planRevision }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return { ...row as object, plan: { id: version.id, revision: planRevision, steps: input.steps } };
  });
  if ("expired" in result) throw new DomainError("APPROVAL_EXPIRED", "Approval has expired");
  return result;
}

export async function prompt(db: Pool, meta: RequestMeta, sessionId: string, input: { bodyMarkdown: string; planRevision?: number; workItemRevision?: number }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can prompt an agent session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.bodyMarkdown,"prompt");
    const session = one((await tx.query<{ id: string; team_id: string; state: AgentSessionState; revision: number; sequence: number }>("SELECT id,team_id,state,revision,sequence FROM agent_sessions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [sessionId, meta.actor.workspaceId])).rows); await assertHumanTeam(tx, meta.actor, session.team_id);
    await tx.query("INSERT INTO agent_session_prompts(session_id,author_actor_id,body_markdown,plan_revision,work_item_revision) VALUES($1,$2,$3,$4,$5)", [sessionId, meta.actor.id, input.bodyMarkdown, input.planRevision ?? null, input.workItemRevision ?? null]);
    const state = session.state === "awaiting_input" ? "executing" : session.state;
    const row = one((await tx.query("UPDATE agent_sessions SET state=$2,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, state])).rows);
    await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,updated_at=now() WHERE workspace_id=$1 AND session_id=$2 AND kind='waiting_input' AND status='open'", [meta.actor.workspaceId, sessionId, meta.actor.id]);
    const eventId = await event(tx, meta, "agent.session.prompted", "agent_session", sessionId, Number((row as { revision: number }).revision), { resumed: state !== session.state }, session.team_id, sessionId, Number((row as { sequence: number }).sequence));
    await queueWebhookDeliveries(tx, (await tx.query<{ agent_id: string }>("SELECT agent_id FROM agent_sessions WHERE id=$1", [sessionId])).rows[0]!.agent_id, eventId, "agent.session.prompted", sessionId, { sessionId, prompt: input.bodyMarkdown }); return row;
  });
}

export async function signal(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: { signal: "stop" | "pause" | "resume"; reason: string }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can control an agent session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "signal reason");
    const session = one((await tx.query<{ state: AgentSessionState; revision: number; team_id: string }>("SELECT state,revision,team_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [sessionId, meta.actor.workspaceId])).rows); await assertHumanTeam(tx, meta.actor, session.team_id); assertRevision(expectedRevision, session.revision);
    const next: AgentSessionState = input.signal === "stop" ? "stopping" : input.signal === "pause" ? "paused" : "executing"; assertAgentSessionTransition(session.state, next);
    const row = one((await tx.query("UPDATE agent_sessions SET state=$2::agent_session_state,state_reason=$3,stop_requested_at=CASE WHEN $2::agent_session_state='stopping' THEN now() ELSE stop_requested_at END,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, next, input.reason])).rows);
    const eventType=`agent.session.signal.${input.signal}`;
    const eventId = await event(tx, meta, eventType, "agent_session", sessionId, Number((row as { revision: number }).revision), { signal: input.signal, reason: input.reason, state: next }, session.team_id, sessionId, Number((row as { sequence: number }).sequence));
    await queueWebhookDeliveries(tx, (await tx.query<{ agent_id: string }>("SELECT agent_id FROM agent_sessions WHERE id=$1", [sessionId])).rows[0]!.agent_id, eventId, eventType, sessionId, { sessionId, signal: input.signal, reason: input.reason, state:next }); return row;
  });
}

export async function finishSession(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: CompleteAgentSessionInput | { code: string; summary: string; retryable: boolean; evidence: string[] }, failed = false) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.summary,"session summary");
    assertSanitized(failed ? { evidence: (input as { evidence: string[] }).evidence } : { checks: (input as CompleteAgentSessionInput).checks, limitations: (input as CompleteAgentSessionInput).limitations, noArtifactReason: (input as CompleteAgentSessionInput).noArtifactReason });
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: failed ? "fail" : "complete", idempotencyKey: meta.idempotencyKey, expectedRevision });
    const completion = input as CompleteAgentSessionInput; if (!failed) assertCompletionEvidence(completion);
    const next: AgentSessionState = failed ? "failed" : "completed"; assertAgentSessionTransition(session.state, next);
    const row = one((await tx.query("UPDATE agent_sessions SET state=$2,state_reason=$3,result_summary=$3,result_evidence=$4,no_artifact_reason=$5,error_code=$6,error_summary=$7,ended_at=now(),sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, next, input.summary, failed ? { evidence:(input as { evidence: string[] }).evidence,retryable:(input as { retryable:boolean }).retryable } : { artifactIds: completion.artifactIds, checks: completion.checks, limitations: completion.limitations }, failed ? null : completion.noArtifactReason ?? null, failed ? (input as { code: string }).code : null, failed ? input.summary : null])).rows);
    await event(tx, meta, failed ? "agent.session.failed" : "agent.session.completed", "agent_session", sessionId, Number((row as { revision: number }).revision), { summary: input.summary }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
}

export async function stopAck(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: { cleanupSummary: string; residualRisks: string[] }) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.cleanupSummary, "stop acknowledgement summary"); assertSanitized(input.residualRisks, "residual risks");
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "stop_ack", idempotencyKey: meta.idempotencyKey, expectedRevision });
    const row = one((await tx.query("UPDATE agent_sessions SET stop_acknowledged_at=now(),state='canceled',state_reason=$2,ended_at=now(),sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, input.cleanupSummary])).rows);
    await tx.query("INSERT INTO agent_activities(session_id,actor_id,sequence,kind,summary,details_markdown) VALUES($1,$2,$3,'stop_ack',$4,$5)", [sessionId, meta.actor.id, (row as { sequence: number }).sequence, input.cleanupSummary, JSON.stringify(input.residualRisks)]);
    await event(tx, meta, "agent.session.state_changed", "agent_session", sessionId, Number((row as { revision: number }).revision), { state: "canceled", stopAck: true }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
}

export async function publishArtifact(db: Pool, meta: RequestMeta, input: { sessionId: string; workItemId?: string; type: string; title: string; uri?: string; checksum?: string; sourceTool?: string; metadata: unknown }) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.type, "artifact type"); assertSafeText(input.title, "artifact title"); assertSafeText(input.uri, "artifact uri"); assertSafeText(input.sourceTool, "artifact source tool");
    assertSanitized(input.metadata);
    const session = await loadAgentSessionForMutation(tx, meta.actor, input.sessionId);
    if (input.workItemId && input.workItemId !== session.work_item_id) throw new DomainError("RESOURCE_SCOPE_DENIED", "Artifact work item must match the session work item");
    assertAgentWrite({ actor: meta.actor, session, sessionId: input.sessionId, capability: "artifact:write", operation: "artifact", idempotencyKey: meta.idempotencyKey, resourceId: input.workItemId ?? session.work_item_id });
    const row = one((await tx.query("INSERT INTO artifacts(workspace_id,session_id,work_item_id,producer_actor_id,type,title,uri,checksum,source_tool,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [meta.actor.workspaceId, input.sessionId, input.workItemId ?? session.work_item_id, meta.actor.id, input.type, input.title, input.uri ?? null, input.checksum ?? null, input.sourceTool ?? null, input.metadata])).rows);
    await event(tx, meta, "artifact.published", "artifact", String((row as { id: string }).id), session.revision, { type: input.type }, session.team_id, input.sessionId, undefined); return row;
  });
}

export async function requestApproval(db: Pool, meta: RequestMeta, input: { sessionId: string; approvalType: string; actionName: string; actionPayloadSanitized: unknown; actionPayloadHash: string; riskLevel: string; rationaleSummary: string; requiredApprovals: number; expiresAt: string }) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.approvalType,"approval type"); assertSafeText(input.actionName,"approval action name"); assertSafeText(input.riskLevel,"approval risk level"); assertSafeText(input.rationaleSummary,"approval rationale");
    assertSanitized(input.actionPayloadSanitized);
    if (new Date(input.expiresAt).getTime() <= Date.now()) throw new DomainError("VALIDATION_ERROR", "Approval expiry must be in the future");
    if (canonicalPayloadHash(input.actionPayloadSanitized) !== input.actionPayloadHash) throw new DomainError("APPROVAL_PAYLOAD_MISMATCH", "Approval hash must match the canonical sanitized payload");
    const session = await loadAgentSessionForMutation(tx, meta.actor, input.sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId: input.sessionId, capability: "work:write", operation: "activity", idempotencyKey: meta.idempotencyKey });
    const row = one((await tx.query("INSERT INTO approvals(workspace_id,session_id,requested_by_actor_id,approval_type,action_name,action_payload_sanitized,action_payload_hash,risk_level,rationale_summary,required_approvals,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *", [meta.actor.workspaceId, input.sessionId, meta.actor.id, input.approvalType, input.actionName, input.actionPayloadSanitized, input.actionPayloadHash, input.riskLevel, input.rationaleSummary, input.requiredApprovals, input.expiresAt])).rows);
    const principal = one((await tx.query<{ principal_human_actor_id: string }>("SELECT principal_human_actor_id FROM delegations WHERE id=$1", [session.delegation_id])).rows); await tx.query("INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,session_id,kind,source_type,source_id,payload) VALUES($1,$2,$3,'approval','approval',$4,$5)", [meta.actor.workspaceId, principal.principal_human_actor_id, input.sessionId, (row as { id: string }).id, { action: input.actionName }]);
    const requestedPayload={approvalId:String((row as {id:string}).id),sessionId:input.sessionId,status:"pending" as const,actionName:input.actionName,actionPayloadHash:input.actionPayloadHash,requiredApprovals:input.requiredApprovals,expiresAt:new Date((row as {expires_at:Date}).expires_at).toISOString()};
    await event(tx, meta, "approval.requested", "approval", requestedPayload.approvalId, 1, requestedPayload, session.team_id, input.sessionId); return row;
  });
}

export async function decideApproval(db: Pool, meta: RequestMeta, approvalId: string, expectedRevision: number, input: { decision: "approved" | "rejected"; reason: string }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can decide approval");
  const result = await agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "approval decision reason");
    const approval = one((await tx.query<{ revision: number; session_id: string; status: string; team_id: string; agent_id:string; required_approvals:number; expires_at:Date }>("SELECT a.revision,a.session_id,a.status,a.required_approvals,a.expires_at,s.team_id,s.agent_id FROM approvals a JOIN agent_sessions s ON s.id=a.session_id WHERE a.id=$1 AND a.workspace_id=$2 FOR UPDATE", [approvalId, meta.actor.workspaceId])).rows); await assertHumanTeam(tx, meta.actor, approval.team_id); assertRevision(expectedRevision, approval.revision);
    if (approval.status !== "pending") throw new DomainError("CONFLICT", "Approval is no longer pending");
    if (approval.expires_at.getTime() <= Date.now()) { const expired=one((await tx.query("UPDATE approvals SET status='expired',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[approvalId])).rows); const payload={approvalId,status:"expired" as const,expiredAt:new Date((expired as {updated_at:Date}).updated_at).toISOString()}; const eventId=await event(tx,meta,"approval.expired","approval",approvalId,Number((expired as {revision:number}).revision),payload,approval.team_id,approval.session_id); await queueWebhookDeliveries(tx,approval.agent_id,eventId,"approval.expired",approval.session_id,{...payload,sessionId:approval.session_id}); return {expired:true}; }
    const inserted=await tx.query("INSERT INTO approval_decisions(approval_id,actor_id,decision,reason) VALUES($1,$2,$3,$4) ON CONFLICT(approval_id,actor_id) DO NOTHING RETURNING actor_id,decision,reason,decided_at", [approvalId, meta.actor.id, input.decision, input.reason]); if(!inserted.rowCount) throw new DomainError("CONFLICT","Actor already decided this approval");
    const counts=one((await tx.query<{approved:number;rejected:number}>("SELECT count(*) FILTER(WHERE decision='approved')::int AS approved,count(*) FILTER(WHERE decision='rejected')::int AS rejected FROM approval_decisions WHERE approval_id=$1",[approvalId])).rows);
    const status=input.decision==='rejected' ? 'rejected' : counts.approved>=approval.required_approvals ? 'approved' : 'pending';
    const row = one((await tx.query("UPDATE approvals SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [approvalId,status])).rows);
    if(status!=="pending") await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,updated_at=now() WHERE workspace_id=$1 AND source_type='approval' AND source_id=$3 AND status='open'", [meta.actor.workspaceId, meta.actor.id, approvalId]);
    const quorum={required:approval.required_approvals,approved:counts.approved,rejected:counts.rejected,reached:counts.approved>=approval.required_approvals};
    const recorded=inserted.rows[0] as {actor_id:string;decision:"approved"|"rejected";reason:string;decided_at:Date};
    const decision={...recorded,decided_at:new Date(recorded.decided_at).toISOString()};
    const decisionPayload={approvalId,decision,quorum,status:status as "pending"|"approved"|"rejected"};
    const decisionEventId=await event(tx, meta, "approval.decision.recorded", "approval", approvalId, Number((row as { revision: number }).revision), decisionPayload, approval.team_id, approval.session_id);
    await queueWebhookDeliveries(tx,approval.agent_id,decisionEventId,"approval.decision.recorded",approval.session_id,{...decisionPayload,sessionId:approval.session_id});
    if(status!=="pending") { const eventType=status==="approved" ? "approval.approved" : "approval.rejected"; const payload={approvalId,status,quorum,finalizedAt:new Date((row as {updated_at:Date}).updated_at).toISOString()}; const eventId=await event(tx, meta, eventType, "approval", approvalId, Number((row as { revision: number }).revision), payload, approval.team_id, approval.session_id); await queueWebhookDeliveries(tx,approval.agent_id,eventId,eventType,approval.session_id,{...payload,sessionId:approval.session_id}); }
    return {approval:row,decision:inserted.rows[0],quorum:{required:approval.required_approvals,approved:counts.approved,rejected:counts.rejected,reached:counts.approved>=approval.required_approvals},status};
  });
  if ("expired" in result && result.expired) throw new DomainError("APPROVAL_EXPIRED","Approval has expired");
  return result;
}

async function consumeApprovalInTx(tx: PoolClient, meta: RequestMeta, sessionId:string, approvalId:string, hash:string, expectedActionName?:string) {
  const approval=one((await tx.query<{id:string;session_id:string;action_name:string;action_payload_sanitized:unknown;action_payload_hash:string;status:string;expires_at:Date;revision:number;required_approvals:number;team_id:string;agent_id:string}>("SELECT a.*,s.team_id,s.agent_id FROM approvals a JOIN agent_sessions s ON s.id=a.session_id WHERE a.id=$1 AND a.workspace_id=$2 FOR UPDATE",[approvalId,meta.actor.workspaceId])).rows);
  if(approval.session_id!==sessionId) throw new DomainError("APPROVAL_SESSION_MISMATCH","Approval belongs to another session");
  if(expectedActionName && approval.action_name!==expectedActionName) throw new DomainError("APPROVAL_PAYLOAD_MISMATCH","Approval action does not authorize this operation");
  if(approval.action_payload_hash!==hash || canonicalPayloadHash(approval.action_payload_sanitized)!==hash) throw new DomainError("APPROVAL_PAYLOAD_MISMATCH","Approval payload hash does not match");
  if(approval.expires_at.getTime()<=Date.now()){ const expired=one((await tx.query("UPDATE approvals SET status='expired',revision=revision+1,updated_at=now() WHERE id=$1 AND status='approved' RETURNING revision,updated_at",[approvalId])).rows); const payload={approvalId,status:"expired" as const,expiredAt:new Date((expired as {updated_at:Date}).updated_at).toISOString()}; const eventId=await event(tx,meta,"approval.expired","approval",approvalId,Number((expired as {revision:number}).revision),payload,approval.team_id,sessionId); await queueWebhookDeliveries(tx,approval.agent_id,eventId,"approval.expired",sessionId,{...payload,sessionId}); return {expired:true as const}; }
  if(approval.status==='consumed') throw new DomainError("APPROVAL_ALREADY_CONSUMED","Approval was already consumed");
  if(approval.status!=="approved") throw new DomainError("APPROVAL_NOT_APPROVED","Approval is not approved");
  const quorum=one((await tx.query<{approved:number}>("SELECT count(*) FILTER(WHERE decision='approved')::int AS approved FROM approval_decisions WHERE approval_id=$1",[approvalId])).rows); if(quorum.approved<approval.required_approvals) throw new DomainError("APPROVAL_QUORUM_NOT_REACHED","Approval quorum has not been reached");
  return one((await tx.query("UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND status='approved' RETURNING *",[approvalId])).rows);
}

export async function consumeApproval(db:Pool,meta:RequestMeta,approvalId:string,expectedRevision:number,input:{actionPayloadHash:string}) { const result=await agentMutate(db,meta,async tx=>{ const sessionId=meta.actor.agentSessionId; if(meta.actor.kind!=="agent"||!sessionId) throw new DomainError("FORBIDDEN","Agent session token is required"); const session=await loadAgentSessionForMutation(tx,meta.actor,sessionId); assertAgentWrite({actor:meta.actor,session,sessionId,capability:"work:write",operation:"activity",idempotencyKey:meta.idempotencyKey}); const current=one((await tx.query<{revision:number}>("SELECT revision FROM approvals WHERE id=$1 AND workspace_id=$2",[approvalId,meta.actor.workspaceId])).rows); assertRevision(expectedRevision,current.revision); const row=await consumeApprovalInTx(tx,meta,sessionId,approvalId,input.actionPayloadHash); if("expired" in row) return row; return {approval_id:row.id,status:"consumed",consumed_at:row.consumed_at,action_payload_hash:row.action_payload_hash}; }); if("expired" in result) throw new DomainError("APPROVAL_EXPIRED","Approval has expired"); return result; }
