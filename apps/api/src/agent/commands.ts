import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  agentExecutionCapacitySqlPredicate,
  appendEvent,
  assertAgentExecutionCapacityAfterLock,
  lockAgentAuthorityPlan,
  lockAgentAuthorityPlanWithInstallationTokenWrite,
  opaqueToken,
  tokenHash,
  withTx,
} from "@workmesh/db";
import { loadRetentionConfig } from "@workmesh/config";
import { agentSessionResponseSchema } from "@workmesh/contracts";
import {
  assertAgentSessionTransition, assertCompletionEvidence, assertRevision,
  assertWorkItemSelfClaimable,
  DomainError, validatePlanSteps,
} from "@workmesh/domain";
import type {
  AgentSessionState, Capability, ClaimWorkItemInput, CompleteAgentSessionInput,
  PlanStepInput, StatusCategory,
} from "@workmesh/contracts";
import { authIdempotentTransaction } from "../auth-idempotency.js";
import { isHeartbeatReplay, recordHeartbeatKey } from "../heartbeat-idempotency.js";
import { assertAgentWrite, loadAgentSessionForMutation } from "./guard.js";
import type { ApiActor, RequestMeta } from "./types.js";
import { materializeSessionContextSnapshot } from "../guidance.js";
import {
  locateConnectionInstallationTokenId,
  reconcileConnectionInstallationToken,
} from "../connection-installation-token.js";

const one = <T>(rows: T[]): T => { const value = rows[0]; if (!value) throw new DomainError("NOT_FOUND", "Resource not found"); return value; };
const normalizedSensitiveKeys = new Set([
  "token", "accessToken", "refreshToken", "authToken", "password", "passwd",
  "secret", "authorization", "cookie", "apiKey", "privateKey", "accessKeyId",
  "secretAccessKey", "clientSecret", "webhookSecret", "credential", "credentials",
].map(key => key.toLowerCase()));
const normalizedKey = (key: string): string => key.replace(/[^a-z0-9]/gi, "").toLowerCase();
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])) : value;
const canonicalPayloadHash = (value: unknown) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
/** PostgreSQL returns bigint values as strings; Agent Session responses must be contract-shaped JSON. */
export function normalizeAgentSessionResponse(row: unknown): Record<string, unknown> {
  if (!row || Array.isArray(row) || typeof row !== "object") throw new DomainError("INTERNAL_ERROR", "Agent session response row is invalid");
  let serialized: unknown;
  try {
    serialized = JSON.parse(JSON.stringify(row));
  } catch {
    throw new DomainError("INTERNAL_ERROR", "Agent session response row is not serializable");
  }
  if (!serialized || Array.isArray(serialized) || typeof serialized !== "object") throw new DomainError("INTERNAL_ERROR", "Agent session response row is invalid");
  const serializedRow = serialized as Record<string, unknown>;
  const sequence = serializedRow.sequence;
  let normalizedSequence: number;
  if (typeof sequence === "number") {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new DomainError("INTERNAL_ERROR", "Agent session sequence is invalid");
    normalizedSequence = sequence;
  } else if (typeof sequence === "string" && /^(?:0|[1-9]\d*)$/.test(sequence)) {
    normalizedSequence = Number(sequence);
    if (!Number.isSafeInteger(normalizedSequence)) throw new DomainError("INTERNAL_ERROR", "Agent session sequence exceeds the response precision limit");
  } else {
    throw new DomainError("INTERNAL_ERROR", "Agent session sequence is invalid");
  }
  const parsed = agentSessionResponseSchema.safeParse({ ...serializedRow, sequence: normalizedSequence });
  if (!parsed.success) throw new DomainError("INTERNAL_ERROR", "Agent session row violates the response contract");
  return { ...serializedRow, ...parsed.data };
}
/** Operational facts may be persisted, but credentials must never enter an event, activity, artifact, or approval payload. */
export function assertSanitized(value: unknown, path = "payload"): void {
  if (typeof value === "string") { assertSafeText(value, path); return; }
  if (Array.isArray(value)) { value.forEach((item, index) => assertSanitized(item, `${path}[${index}]`)); return; }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) { if (normalizedSensitiveKeys.has(normalizedKey(key))) throw new DomainError("VALIDATION_ERROR", `Sensitive field is not permitted in ${path}`); assertSanitized(item, `${path}.${key}`); }
}
const sensitiveText = /\b(?:bearer\s+[a-z0-9+/_.=~-]{8,}|(?:token|access[_ -]?token|secret|password|api[_ -]?key|client[_ -]?secret|webhook[_ -]?secret|private[_ -]?key|secret[_ -]?access[_ -]?key)\s*[:=]\s*["']?\S{4,}|x-api-key\s*:\s*\S{4,}|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:gh[oprsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}))/i;
const jwtLike = /\b(?:eyJ[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,}\.[a-zA-Z0-9_-]{4,}|[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,})\b/;
const pemPrivateKey = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/i;
export function assertSafeText(value: string | undefined, field: string): void { if(!value) return; if(sensitiveText.test(value)||jwtLike.test(value)||pemPrivateKey.test(value)||/https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value)) throw new DomainError("VALIDATION_ERROR",`Sensitive content is not permitted in ${field}`); }
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
  return appendEvent(tx, {
    workspaceId: meta.actor.workspaceId,
    teamId,
    actorId: meta.actor.id,
    correlationId: meta.correlationId,
    idempotencyKey: meta.idempotencyKey,
    type,
    aggregateType,
    aggregateId,
    revision,
    payload,
    sessionId,
    sessionSequence,
  });
};

export async function queueWebhookDeliveries(tx: PoolClient, agentId: string, eventId: string, eventType: string, sessionId: string | undefined, payload: Record<string, unknown>): Promise<void> {
  const targets = await tx.query<{ endpoint_id: string; version: number }>("SELECT e.id AS endpoint_id,s.version FROM agent_webhook_endpoints e JOIN agent_webhook_secrets s ON s.endpoint_id=e.id WHERE e.agent_id=$1 AND e.is_active AND s.status='active' AND (s.valid_until IS NULL OR s.valid_until>now())", [agentId]);
  for (const target of targets.rows) await tx.query("INSERT INTO agent_webhook_deliveries(agent_id,endpoint_id,secret_version,event_id,delivery_id,event_type,session_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [agentId, target.endpoint_id, target.version, eventId, crypto.randomUUID(), eventType, sessionId ?? null, payload]);
}

export type ExecutionInstallationAuthority = Readonly<{
  id: string
  connection_id: string | null
  credential_id: string | null
  connection_delegation_id: string | null
}>

export async function locateExecutionInstallationAuthority(
  tx: PoolClient,
  input: Readonly<{
    agentId: string
    teamId: string
    principalHumanActorId: string
    installationTokenId?: string
  }>,
): Promise<ExecutionInstallationAuthority | undefined> {
  return (await tx.query<ExecutionInstallationAuthority>(
    `SELECT token.id,connection.id AS connection_id,
            credential.id AS credential_id,
            connection.delegation_id AS connection_delegation_id
       FROM agent_installation_tokens token
       JOIN agent_definitions definition ON definition.id=token.agent_id
       LEFT JOIN agent_connection_credentials credential
         ON credential.token_hash=token.token_hash
       LEFT JOIN agent_connections connection
         ON connection.id=credential.connection_id
       LEFT JOIN delegations authority
         ON authority.id=connection.delegation_id
      WHERE token.agent_id=$1
        AND ($4::uuid IS NULL OR token.id=$4)
        AND token.revoked_at IS NULL
        AND (token.expires_at IS NULL OR token.expires_at>clock_timestamp())
        AND definition.is_active
        AND (
          credential.id IS NULL
          OR (
            (
              credential.status='active'
              OR (
                credential.status='overlap'
                AND credential.overlap_until IS NOT NULL
                AND credential.overlap_until>clock_timestamp()
              )
            )
            AND connection.status IN ('active','rotating')
            AND connection.agent_id=token.agent_id
            AND connection.agent_actor_id=definition.actor_id
            AND connection.team_id=$2
            AND connection.principal_human_actor_id=$3
            AND authority.status='active'
            AND authority.role='coordinator'
            AND authority.scope_type='team'
            AND authority.scope_id=connection.team_id
            AND authority.team_id=connection.team_id
            AND authority.agent_id=connection.agent_id
            AND authority.agent_actor_id=connection.agent_actor_id
            AND authority.principal_human_actor_id=connection.principal_human_actor_id
          )
        )
      ORDER BY (credential.id IS NOT NULL) DESC,token.created_at DESC,token.id
      LIMIT 1`,
    [
      input.agentId,
      input.teamId,
      input.principalHumanActorId,
      input.installationTokenId ?? null,
    ],
  )).rows[0]
}

/**
 * Connection-backed Installation authority is an outer lock tier. Lock every
 * selected Connection first and every exact credential second, both in stable
 * ID order, before entering the shared Agent authority lock plan. Native
 * Installation Tokens have neither row and therefore need no outer lock.
 */
export async function lockExecutionInstallationAuthorities(
  tx: PoolClient,
  authorities: readonly Pick<
    ExecutionInstallationAuthority,
    'connection_id' | 'credential_id'
  >[],
): Promise<void> {
  const connectionIds = [...new Set(authorities.flatMap(authority =>
    authority.connection_id ? [authority.connection_id] : []))].sort()
  if (connectionIds.length) await tx.query(
    `SELECT id FROM agent_connections
      WHERE id=ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [connectionIds],
  )
  const credentialIds = [...new Set(authorities.flatMap(authority =>
    authority.credential_id ? [authority.credential_id] : []))].sort()
  if (credentialIds.length) await tx.query(
    `SELECT id FROM agent_connection_credentials
      WHERE id=ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE`,
    [credentialIds],
  )
}

export async function revalidateExecutionInstallationAuthority(
  tx: PoolClient,
  input: Readonly<{
    authority: ExecutionInstallationAuthority
    agentId: string
    teamId: string
    principalHumanActorId: string
  }>,
): Promise<ExecutionInstallationAuthority> {
  const live = await locateExecutionInstallationAuthority(tx, {
    agentId: input.agentId,
    teamId: input.teamId,
    principalHumanActorId: input.principalHumanActorId,
    installationTokenId: input.authority.id,
  })
  if (
    !live
    || live.connection_id !== input.authority.connection_id
    || live.credential_id !== input.authority.credential_id
    || live.connection_delegation_id !== input.authority.connection_delegation_id
  ) throw new DomainError(
    'DELEGATION_NOT_ACTIVE',
    'Session delivery installation authority changed',
  )
  return live
}

/**
 * Provision delivery for a newly-created session inside the caller's existing
 * transaction.  The exchange nonce is deliberately only placed in the target
 * agent's webhook delivery, never returned to the coordinating session.
 */
export async function provisionNewSessionDelivery(tx: PoolClient, meta: RequestMeta, input: { sessionId: string; agentId: string; delegationId: string; teamId: string; workItemId: string | null; initialPrompt: string; installationAuthority: ExecutionInstallationAuthority }): Promise<void> {
  const locator = one((await tx.query<{
    project_id: string | null
    principal_human_actor_id: string
  }>(
    `SELECT coalesce(item.project_id,session.project_id) AS project_id,
            delegation.principal_human_actor_id
       FROM agent_sessions session
       JOIN delegations delegation ON delegation.id=session.delegation_id
       LEFT JOIN work_items item ON item.id=session.work_item_id
      WHERE session.id=$1 AND session.agent_id=$2
        AND session.delegation_id=$3 AND session.team_id=$4`,
    [input.sessionId, input.agentId, input.delegationId, input.teamId],
  )).rows);
  const liveSessionAuthority = (await tx.query(
    `SELECT 1
       FROM agent_sessions session
       JOIN delegations delegation ON delegation.id=session.delegation_id
       JOIN agent_definitions definition ON definition.id=session.agent_id
       JOIN agent_team_access access
         ON access.workspace_id=session.workspace_id
        AND access.agent_id=session.agent_id
        AND access.team_id=session.team_id
      WHERE session.id=$1 AND session.agent_id=$2
        AND session.delegation_id=$3 AND session.team_id=$4
        AND session.workspace_id=$5 AND delegation.status='active'
        AND definition.is_active AND access.revoked_at IS NULL`,
    [
      input.sessionId,
      input.agentId,
      input.delegationId,
      input.teamId,
      meta.actor.workspaceId,
    ],
  )).rows[0];
  if (!liveSessionAuthority)
    throw new DomainError('DELEGATION_NOT_ACTIVE', 'Session delivery authority is no longer active')
  const installation = await revalidateExecutionInstallationAuthority(tx, {
    authority: input.installationAuthority,
    agentId: input.agentId,
    teamId: input.teamId,
    principalHumanActorId: locator.principal_human_actor_id,
  })
  const exchangeToken = opaqueToken();
  await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,issued_by_actor_id) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)", [input.sessionId, input.agentId, installation.id, tokenHash(opaqueToken()), tokenHash(exchangeToken), meta.actor.id]);
  const eventId = await event(tx, meta, "agent.session.created", "agent_session", input.sessionId, 1, { delegationId: input.delegationId, workItemId: input.workItemId }, input.teamId, input.sessionId, 0);
  await queueWebhookDeliveries(tx, input.agentId, eventId, "agent.session.created", input.sessionId, { sessionId: input.sessionId, exchangeToken, initialPrompt: input.initialPrompt });
}

/** Same idempotency record as Stage 0, deliberately scoped to the authenticated actor. */
export async function agentMutate<T>(db: Pool, meta: RequestMeta, handler: (tx: PoolClient) => Promise<T>): Promise<T> {
  return withTx(db, async tx => {
    const retention = loadRetentionConfig();
    const reserved = await tx.query(
      `INSERT INTO api_idempotency_keys(
         workspace_id,actor_id,idempotency_key,operation,request_hash,
         replay_expires_at,conflict_expires_at
       ) VALUES($1,$2,$3,$4,$5,now()+($6::text||' hours')::interval,now()+($7::text||' days')::interval)
       ON CONFLICT(workspace_id,actor_id,idempotency_key) DO UPDATE
         SET operation=EXCLUDED.operation,request_hash=EXCLUDED.request_hash,
             response_status=NULL,response_body=NULL,created_at=now(),
             replay_expires_at=EXCLUDED.replay_expires_at,
             conflict_expires_at=EXCLUDED.conflict_expires_at
       WHERE api_idempotency_keys.conflict_expires_at<=now()
       RETURNING idempotency_key`,
      [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey, meta.operation, meta.requestHash, retention.genericReplayHours, retention.genericConflictDays],
    );
    if (!reserved.rowCount) {
      const previous = one((await tx.query<{ operation: string; request_hash: string; response_body: T | null; replay_expires_at: Date }>("SELECT operation,request_hash,response_body,replay_expires_at FROM api_idempotency_keys WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE", [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey])).rows);
      if (previous.operation !== meta.operation || previous.request_hash !== meta.requestHash) throw new DomainError("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was already used for a different request");
      if (previous.replay_expires_at.getTime() <= Date.now()) throw new DomainError("IDEMPOTENCY_REPLAY_EXPIRED", "Idempotency replay material expired; use a new key");
      if (previous.response_body === null) throw new DomainError("IDEMPOTENCY_REPLAY_UNAVAILABLE", "The original response is unavailable");
      return previous.response_body;
    }
    const response = await handler(tx);
    await tx.query("UPDATE api_idempotency_keys SET response_status=200,response_body=$4 WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3", [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey, response]);
    return response;
  });
}

async function secretAgentMutate<T>(
  db: Pool,
  meta: RequestMeta,
  request: unknown,
  handler: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const secretReplaySubject = meta.actor.humanSessionId ? `human-session:${meta.actor.humanSessionId}` : meta.actor.agentSessionId ? `agent-session:${meta.actor.agentSessionId}` : undefined;
  if (!secretReplaySubject) throw new DomainError("UNAUTHENTICATED", "Session identity is required");
  const replay = await authIdempotentTransaction(db, {
    idempotencyKey: meta.idempotencyKey,
    subject: secretReplaySubject,
    operation: meta.operation,
    request,
    clientContext: meta.clientContext ?? {},
  }, async tx => ({ status: 200, body: await handler(tx) }));
  return replay.body;
}

const requireAdmin = (actor: ApiActor) => { if (actor.kind !== "human" || actor.workspaceRole !== "admin") throw new DomainError("FORBIDDEN", "Workspace administrator role is required"); };
async function locateAgentRevocationRows(
  tx: PoolClient,
  workspaceId: string,
  agentId: string,
  delegationId?: string,
  teamId?: string,
) {
  const grants=(await tx.query<{team_id:string}>(
    'SELECT team_id FROM agent_team_access WHERE workspace_id=$1 AND agent_id=$2',
    [workspaceId,agentId],
  )).rows
  const delegations=(await tx.query<{id:string}>(
    `SELECT id FROM delegations
      WHERE workspace_id=$1 AND agent_id=$2
        AND ($3::uuid IS NULL OR id=$3)
        AND ($4::uuid IS NULL OR team_id=$4)`,
    [workspaceId,agentId,delegationId??null,teamId??null],
  )).rows
  const sessions=(await tx.query<{
    id:string
    work_item_id:string|null
    project_id:string|null
    work_item_project_id:string|null
  }>(
    `SELECT session.id,session.work_item_id,session.project_id,
            item.project_id AS work_item_project_id
       FROM agent_sessions session
       LEFT JOIN work_items item ON item.id=session.work_item_id
      WHERE session.workspace_id=$1 AND session.agent_id=$2
        AND ($3::uuid IS NULL OR session.delegation_id=$3)
        AND ($4::uuid IS NULL OR session.team_id=$4)`,
    [workspaceId,agentId,delegationId??null,teamId??null],
  )).rows
  const sessionIds=sessions.map(session=>session.id)
  const sessionTokenIds=sessionIds.length
    ? (await tx.query<{id:string}>(
        'SELECT id FROM agent_session_tokens WHERE session_id=ANY($1::uuid[])',
        [sessionIds],
      )).rows.map(row=>row.id)
    : []
  return {
    grants,
    delegationIds:delegations.map(delegation=>delegation.id),
    sessionIds,
    sessionTokenIds,
    workItemIds:sessions.flatMap(session=>session.work_item_id?[session.work_item_id]:[]),
    projectIds:sessions.flatMap(session=>[
      ...(session.project_id?[session.project_id]:[]),
      ...(session.work_item_project_id?[session.work_item_project_id]:[]),
    ]),
  }
}
export async function assertHumanTeam(tx: PoolClient, actor: ApiActor, teamId: string, manage = false): Promise<void> {
  const found = await tx.query<{ role: "admin" | "maintainer" | "member" }>("SELECT m.role FROM memberships m JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.team_id=$2 AND m.actor_id=$3 AND t.deleted_at IS NULL", [actor.workspaceId, teamId, actor.id]);
  if (actor.workspaceRole === "admin") return;
  const role = found.rows[0]?.role;
  if (!role || (manage && role === "member")) throw new DomainError("FORBIDDEN", manage ? "Team maintainer role is required" : "Team membership is required");
}

export async function registerAgent(db: Pool, meta: RequestMeta, input: Record<string, unknown>) {
  requireAdmin(meta.actor);
  return secretAgentMutate(db, meta, input, async tx => {
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
    const revocation=input.isActive===false
      ? await locateAgentRevocationRows(tx,meta.actor.workspaceId,id)
      : undefined
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[id],
      teamGrants:revocation?.grants.map(grant=>({
        workspaceId:meta.actor.workspaceId,
        agentId:id,
        teamId:grant.team_id,
      })),
      delegationIds:revocation?.delegationIds,
      sessionIds:revocation?.sessionIds,
      sessionTokenIds:revocation?.sessionTokenIds,
      workItemIds:revocation?.workItemIds,
      projectIds:revocation?.projectIds,
    })
    const current = one((await tx.query<{ revision: number; actor_id: string; requested_capabilities: Capability[]; approved_capabilities: Capability[] }>("SELECT revision,actor_id,requested_capabilities,approved_capabilities FROM agent_definitions WHERE id=$1 AND workspace_id=$2", [id, meta.actor.workspaceId])).rows);
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
  return secretAgentMutate(db, meta, { agentId, endpointId, revision }, async tx => {
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
    const revocation=await locateAgentRevocationRows(tx,meta.actor.workspaceId,agentId,undefined,teamId)
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[agentId],
      teamGrants:[{workspaceId:meta.actor.workspaceId,agentId,teamId}],
      delegationIds:revocation.delegationIds,
      sessionIds:revocation.sessionIds,
      sessionTokenIds:revocation.sessionTokenIds,
      workItemIds:revocation.workItemIds,
      projectIds:revocation.projectIds,
    })
    one((await tx.query("SELECT id FROM agent_definitions WHERE id=$1 AND workspace_id=$2",[agentId,meta.actor.workspaceId])).rows);
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
    const locator=one((await tx.query<{team_id:string;agent_id:string}>(
      'SELECT team_id,agent_id FROM delegations WHERE id=$1 AND workspace_id=$2',
      [delegationId,meta.actor.workspaceId],
    )).rows)
    const revocation=await locateAgentRevocationRows(tx,meta.actor.workspaceId,locator.agent_id,delegationId)
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[locator.agent_id],
      teamGrants:[{
        workspaceId:meta.actor.workspaceId,
        agentId:locator.agent_id,
        teamId:locator.team_id,
      }],
      delegationIds:[delegationId],
      sessionIds:revocation.sessionIds,
      sessionTokenIds:revocation.sessionTokenIds,
      workItemIds:revocation.workItemIds,
      projectIds:revocation.projectIds,
    })
    const delegation = one((await tx.query<{ team_id:string; agent_id:string; revision:number }>("SELECT team_id,agent_id,revision FROM delegations WHERE id=$1 AND workspace_id=$2", [delegationId,meta.actor.workspaceId])).rows);
    if(delegation.team_id!==locator.team_id||delegation.agent_id!==locator.agent_id)
      throw new DomainError("DELEGATION_NOT_ACTIVE","Delegation binding changed while revocation authority was acquired");
    assertRevision(revision,delegation.revision);
    const row = one((await tx.query("UPDATE delegations SET status='revoked',revoked_at=now(),revoked_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[delegationId,meta.actor.id])).rows);
    await tx.query("UPDATE agent_session_tokens t SET revoked_at=now() FROM agent_sessions s WHERE s.delegation_id=$1 AND t.session_id=s.id AND t.revoked_at IS NULL",[delegationId]);
    const sessions=await tx.query<{id:string}>("SELECT id FROM agent_sessions WHERE delegation_id=$1",[delegationId]); const eid=await event(tx,meta,"agent.delegation.revoked","delegation",delegationId,Number((row as {revision:number}).revision),{},delegation.team_id);
    for(const session of sessions.rows) await queueWebhookDeliveries(tx,delegation.agent_id,eid,"agent.delegation.revoked",session.id,{delegationId,sessionId:session.id}); return row;
  });
}

class RetryForcedAssignment extends Error {}

type CoordinationCallerCredentialLocator = Readonly<{
  connection_id: string
  credential_id: string
  connection_delegation_id: string
}>

async function locateCoordinationCallerCredential(
  tx: PoolClient,
  input: Readonly<{
    workspaceId: string
    actorId: string
    sessionId: string
    credentialHash: string
  }>,
): Promise<CoordinationCallerCredentialLocator | undefined> {
  return (await tx.query<CoordinationCallerCredentialLocator>(
    `SELECT connection.id AS connection_id,
            credential.id AS credential_id,
            connection.delegation_id AS connection_delegation_id
       FROM agent_connection_credentials credential
       JOIN agent_connections connection
         ON connection.id=credential.connection_id
       JOIN agent_coordination_sessions coordination
         ON coordination.connection_id=connection.id
       JOIN agent_sessions caller
         ON caller.id=coordination.agent_session_id
      WHERE credential.token_hash=$1
        AND connection.workspace_id=$2
        AND caller.id=$3
        AND caller.agent_actor_id=$4`,
    [
      input.credentialHash,
      input.workspaceId,
      input.sessionId,
      input.actorId,
    ],
  )).rows[0]
}

export async function delegateAndStartAgentSession(db: Pool, meta: RequestMeta, workItemId: string, expectedRevision: number, input: { agentId:string; principalHumanActorId:string; role:"executor"; requestedCapabilities:Capability[]; initialPrompt:string; contextSnapshotId?:string; budget:unknown }) {
  if (meta.actor.kind !== "human" && !meta.actor.agentSessionId) throw new DomainError("FORBIDDEN", "A Human or authorized Coordination Session is required");
  assertSafeText(input.initialPrompt, "initial prompt");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await secretAgentMutate(db, meta, { workItemId, expectedRevision, ...input }, async tx => {
        const locator = one((await tx.query<{
          team_id: string
          project_id: string | null
          delegation_id: string | null
          assigned_agent_id: string | null
        }>(
          `SELECT item.team_id,item.project_id,
                  assignment.id AS delegation_id,
                  assignment.agent_id AS assigned_agent_id
             FROM work_items item
             LEFT JOIN LATERAL (
               SELECT delegation.id,delegation.agent_id
                 FROM delegations delegation
                WHERE delegation.workspace_id=item.workspace_id
                  AND delegation.work_item_id=item.id
                  AND delegation.role='executor'
                  AND delegation.status='active'
                ORDER BY delegation.id
                LIMIT 1
             ) assignment ON true
            WHERE item.id=$1 AND item.workspace_id=$2
              AND item.deleted_at IS NULL`,
          [workItemId, meta.actor.workspaceId],
        )).rows);
        const caller = meta.actor.kind === "agent" && meta.actor.agentSessionId
          ? (await tx.query<{
              id: string
              agent_id: string
              team_id: string
              delegation_id: string
            }>(
              `SELECT id,agent_id,team_id,delegation_id
                 FROM agent_sessions
                WHERE id=$1 AND workspace_id=$2`,
              [meta.actor.agentSessionId, meta.actor.workspaceId],
            )).rows[0]
          : undefined;
        if (meta.actor.kind === "agent" && !caller)
          throw new DomainError("SESSION_NOT_ACTIVE", "The Coordination Session is no longer active");

        const callerCredential = caller && meta.actor.credentialHash
          ? await locateCoordinationCallerCredential(tx, {
              workspaceId: meta.actor.workspaceId,
              actorId: meta.actor.id,
              sessionId: caller.id,
              credentialHash: meta.actor.credentialHash,
            })
          : undefined
        if (meta.actor.kind === "agent" && !callerCredential)
          throw new DomainError(
            "SESSION_NOT_ACTIVE",
            "The exact Coordination credential is no longer active",
          );

        const activeSessionIds = (await tx.query<{ id: string }>(
          `SELECT id
             FROM agent_sessions session
            WHERE session.workspace_id=$1
              AND (
                (session.agent_id=$2 AND ${agentExecutionCapacitySqlPredicate("session")})
                OR (
                  $3::uuid IS NOT NULL
                  AND session.delegation_id=$3
                  AND ${agentExecutionCapacitySqlPredicate("session")}
                )
                OR session.id=$4::uuid
              )
            ORDER BY id`,
          [
            meta.actor.workspaceId,
            input.agentId,
            locator.delegation_id,
            caller?.id ?? null,
          ],
        )).rows.map(row => row.id);
        const activeSessionTokenIds = activeSessionIds.length
          ? (await tx.query<{ id: string }>(
              `SELECT id
                 FROM agent_session_tokens
                WHERE session_id=ANY($1::uuid[]) AND revoked_at IS NULL
                ORDER BY id`,
              [activeSessionIds],
            )).rows.map(row => row.id)
          : [];
        const installationAuthority = await locateExecutionInstallationAuthority(tx, {
          agentId: input.agentId,
          teamId: locator.team_id,
          principalHumanActorId: input.principalHumanActorId,
        });
        const installationTokenId = installationAuthority?.id;
        await lockExecutionInstallationAuthorities(tx, [
          ...(callerCredential ? [callerCredential] : []),
          ...(installationAuthority ? [installationAuthority] : []),
        ])

        const definitionIds = [
          input.agentId,
          ...(locator.assigned_agent_id ? [locator.assigned_agent_id] : []),
          ...(caller ? [caller.agent_id] : []),
        ];
        await lockAgentAuthorityPlan(tx, {
          definitionIds,
          teamGrants: definitionIds.map(agentId => ({
            workspaceId: meta.actor.workspaceId,
            agentId,
            teamId: locator.team_id,
          })),
          delegationIds: [
            ...(locator.delegation_id ? [locator.delegation_id] : []),
            ...(caller ? [caller.delegation_id] : []),
            ...(callerCredential ? [callerCredential.connection_delegation_id] : []),
            ...(installationAuthority?.connection_delegation_id
              ? [installationAuthority.connection_delegation_id]
              : []),
          ],
          sessionIds: activeSessionIds,
          sessionTokenIds: activeSessionTokenIds,
          installationTokenIds: installationTokenId ? [installationTokenId] : [],
          workItemIds: [workItemId],
          projectIds: locator.project_id ? [locator.project_id] : [],
        });

        const work = one((await tx.query<{
          team_id: string
          project_id: string | null
          revision: number
          responsible_human_actor_id: string | null
          title: string
          description: string | null
        }>(
          `SELECT team_id,project_id,revision,responsible_human_actor_id,
                  title,description
             FROM work_items
            WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL`,
          [workItemId, meta.actor.workspaceId],
        )).rows);
        if (work.team_id !== locator.team_id || work.project_id !== locator.project_id)
          throw new RetryForcedAssignment();

        if (meta.actor.kind === "human") {
          await assertHumanTeam(tx, meta.actor, work.team_id);
        } else {
          one((await tx.query(
            `SELECT connection.id
               FROM agent_sessions caller
               JOIN agent_coordination_sessions coordination
                 ON coordination.agent_session_id=caller.id
                 AND coordination.status='active'
                 AND coordination.expires_at>clock_timestamp()
               JOIN agent_connections connection
                 ON connection.id=coordination.connection_id
                AND connection.id=caller.coordination_connection_id
                AND connection.workspace_id=caller.workspace_id
                AND connection.team_id=caller.team_id
                AND connection.agent_id=caller.agent_id
                AND connection.agent_actor_id=caller.agent_actor_id
                 AND connection.delegation_id=caller.delegation_id
                 AND connection.principal_human_actor_id=coordination.principal_human_actor_id
               JOIN agent_connection_credentials credential
                 ON credential.connection_id=connection.id
                AND credential.token_hash=$6
               JOIN delegations authority
                 ON authority.id=connection.delegation_id
                AND authority.status='active'
               JOIN agent_team_access team_grant
                 ON team_grant.workspace_id=connection.workspace_id
                AND team_grant.agent_id=connection.agent_id
                AND team_grant.team_id=connection.team_id
                AND team_grant.revoked_at IS NULL
              WHERE caller.id=$1 AND caller.workspace_id=$2
                AND caller.agent_actor_id=$3
                AND caller.session_kind='coordination'
                 AND caller.state IN ('acknowledged','planning','executing')
                 AND connection.status IN ('active','rotating')
                 AND (
                   credential.status='active'
                   OR (
                     credential.status='overlap'
                     AND credential.overlap_until IS NOT NULL
                     AND credential.overlap_until>clock_timestamp()
                   )
                 )
                AND connection.team_id=$4
                AND connection.principal_human_actor_id=$5
                AND connection.grant_agent_delegate
                AND 'agent:delegate'=ANY(connection.granted_capabilities)
                AND 'agent:delegate'=ANY(authority.permissions_snapshot)
                AND 'agent:delegate'=ANY(team_grant.approved_capabilities)`,
            [
              caller!.id,
              meta.actor.workspaceId,
              meta.actor.id,
              work.team_id,
              input.principalHumanActorId,
              meta.actor.credentialHash,
            ],
          )).rows);
        }
        assertRevision(expectedRevision, work.revision);
        if (
          !work.responsible_human_actor_id
          || work.responsible_human_actor_id !== input.principalHumanActorId
        ) throw new DomainError("RESPONSIBLE_HUMAN_REQUIRED", "Delegation principal must remain the Work Item responsible Human");
        one((await tx.query(
          `SELECT 1
             FROM actors actor
             JOIN memberships membership
               ON membership.actor_id=actor.id
              AND membership.workspace_id=actor.workspace_id
            WHERE actor.id=$1 AND actor.workspace_id=$2
              AND actor.kind='human' AND actor.is_active
              AND membership.team_id=$3`,
          [input.principalHumanActorId, meta.actor.workspaceId, work.team_id],
        )).rows);

        const agent = one((await tx.query<{
          actor_id: string
          approved_capabilities: Capability[]
        }>(
          `SELECT actor_id,approved_capabilities
             FROM agent_definitions
            WHERE id=$1 AND workspace_id=$2 AND is_active`,
          [input.agentId, meta.actor.workspaceId],
        )).rows);
        const grant = one((await tx.query<{ approved_capabilities: Capability[] }>(
          `SELECT approved_capabilities
             FROM agent_team_access
            WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3
              AND revoked_at IS NULL`,
          [meta.actor.workspaceId, input.agentId, work.team_id],
        )).rows);
        const granted = agent.approved_capabilities.filter(capability =>
          grant.approved_capabilities.includes(capability));
        if (
          !input.requestedCapabilities.includes("work:read")
          || !input.requestedCapabilities.includes("work:write")
          || input.requestedCapabilities.some(capability => !granted.includes(capability))
        ) throw new DomainError(
          "CAPABILITY_DENIED",
          "Executor assignment requires approved work:read and work:write capabilities",
        );

        const current = (await tx.query<{
          id: string
          agent_id: string
          agent_actor_id: string
          principal_human_actor_id: string
          role: string
          scope_type: string
          scope_id: string
          permissions_snapshot: Capability[]
          revision: number
        }>(
          `SELECT id,agent_id,agent_actor_id,principal_human_actor_id,role,
                  scope_type,scope_id,permissions_snapshot,revision
             FROM delegations
            WHERE workspace_id=$1 AND work_item_id=$2
              AND role='executor' AND status='active'
            ORDER BY id
            LIMIT 1`,
          [meta.actor.workspaceId, workItemId],
        )).rows[0];
        if ((current?.id ?? null) !== locator.delegation_id)
          throw new RetryForcedAssignment();

        const currentSessions = current
          ? (await tx.query<Record<string, unknown> & {
              id: string
              state: AgentSessionState
              revision: number
              sequence: string | number
            }>(
              `SELECT *
                 FROM agent_sessions session
                WHERE workspace_id=$1 AND delegation_id=$2
                  AND ${agentExecutionCapacitySqlPredicate("session")}
                ORDER BY created_at DESC,id DESC`,
              [meta.actor.workspaceId, current.id],
            )).rows
          : [];
        const plannedSessionIds = new Set(activeSessionIds);
        if (currentSessions.some(session => !plannedSessionIds.has(session.id)))
          throw new RetryForcedAssignment();
        const currentSessionTokenIds = currentSessions.length
          ? (await tx.query<{ id: string }>(
              `SELECT id
                 FROM agent_session_tokens
                WHERE session_id=ANY($1::uuid[]) AND revoked_at IS NULL
                ORDER BY id`,
              [currentSessions.map(session => session.id)],
            )).rows.map(row => row.id)
          : [];
        const plannedSessionTokenIds = new Set(activeSessionTokenIds);
        if (currentSessionTokenIds.some(id => !plannedSessionTokenIds.has(id)))
          throw new RetryForcedAssignment();

        const requestedCapabilities = [...input.requestedCapabilities].sort();
        const currentCapabilities = current
          ? [...current.permissions_snapshot].sort()
          : [];
        const compatible = current
          && current.agent_id === input.agentId
          && current.agent_actor_id === agent.actor_id
          && current.principal_human_actor_id === input.principalHumanActorId
          && current.role === input.role
          && current.scope_type === "work_item"
          && current.scope_id === workItemId
          && JSON.stringify(currentCapabilities) === JSON.stringify(requestedCapabilities);
        if (
          compatible
          && currentSessions.length === 1
          && currentSessions[0]
          && !["stale", "stopping"].includes(currentSessions[0].state)
        ) return {
          delegation: current,
          session: normalizeAgentSessionResponse(currentSessions[0]),
        };

        if (current && meta.actor.kind !== "human")
          throw new DomainError(
            "WORK_ITEM_ALREADY_ASSIGNED",
            "Only a Human can replace the current executor assignment",
            {
              agentId: current.agent_id,
              activeExecutionStates: Object.fromEntries(
                currentSessions.map(session => session.state).map(state => [
                  state,
                  currentSessions.filter(session => session.state === state).length,
                ]),
              ),
            },
          );

        if (current) {
          for (const oldSession of currentSessions) {
            const canceled = one((await tx.query<{
              revision: number
              sequence: string | number
            }>(
              `UPDATE agent_sessions
                  SET state='canceled',
                      state_reason='replaced by Human forced assignment',
                      ended_at=now(),revision=revision+1,
                      sequence=sequence+1,updated_at=now()
                WHERE id=$1 AND session_kind='execution'
                  AND state NOT IN ('completed','failed','canceled')
              RETURNING revision,sequence`,
              [oldSession.id],
            )).rows);
            await tx.query(
              `UPDATE agent_session_tokens
                  SET revoked_at=COALESCE(revoked_at,now())
                WHERE session_id=$1 AND revoked_at IS NULL`,
              [oldSession.id],
            );
            const releasedLeases = (await tx.query<{ id: string; version: number }>(
              `UPDATE leases
                  SET status='released',released_at=now(),
                      released_by_actor_id=$2,
                      audit_reason='replaced by Human forced assignment',
                      version=version+1,updated_at=now()
                WHERE session_id=$1 AND status='active'
              RETURNING id,version`,
              [oldSession.id, meta.actor.id],
            )).rows;
            await tx.query(
              `UPDATE inbox_items
                  SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,
                      revision=revision+1,updated_at=now()
                WHERE workspace_id=$1 AND session_id=$2 AND status='open'
                  AND kind='session_stale'
                  AND source_type='agent_session' AND source_id=$2`,
              [meta.actor.workspaceId, oldSession.id, meta.actor.id],
            );
            const canceledEventId = await event(
              tx,
              meta,
              "agent.session.state_changed",
              "agent_session",
              oldSession.id,
              canceled.revision,
              {
                state: "canceled",
                reason: "replaced by Human forced assignment",
                assignmentMode: "forced",
              },
              work.team_id,
              oldSession.id,
              Number(canceled.sequence),
            );
            await queueWebhookDeliveries(
              tx,
              current.agent_id,
              canceledEventId,
              "agent.session.state_changed",
              oldSession.id,
              {
                sessionId: oldSession.id,
                state: "canceled",
                reason: "replaced by Human forced assignment",
              },
            );
            for (const lease of releasedLeases) await event(
              tx,
              meta,
              "lease.released",
              "lease",
              lease.id,
              lease.version,
              {
                reason: "replaced by Human forced assignment",
                sessionId: oldSession.id,
              },
              work.team_id,
              oldSession.id,
              Number(canceled.sequence),
            );
          }
          const revoked = one((await tx.query<{ revision: number }>(
            `UPDATE delegations
                SET status='revoked',revoked_at=now(),
                    revoked_by_actor_id=$2,revision=revision+1,updated_at=now()
              WHERE id=$1 AND status='active'
            RETURNING revision`,
            [current.id, meta.actor.id],
          )).rows);
          const revokedEventId = await event(
            tx,
            meta,
            "agent.delegation.revoked",
            "delegation",
            current.id,
            revoked.revision,
            {
              workItemId,
              assignmentMode: "forced",
              replacedByAgentId: input.agentId,
            },
            work.team_id,
          );
          await queueWebhookDeliveries(
            tx,
            current.agent_id,
            revokedEventId,
            "agent.delegation.revoked",
            undefined,
            { delegationId: current.id, workItemId },
          );
        }

        await assertAgentExecutionCapacityAfterLock(tx, {
          workspaceId: meta.actor.workspaceId,
          agentId: input.agentId,
        });
        if (!installationTokenId || !installationAuthority)
          throw new DomainError("NOT_FOUND", "Active installation token not found");
        const installation = await revalidateExecutionInstallationAuthority(tx, {
          authority: installationAuthority,
          agentId: input.agentId,
          teamId: work.team_id,
          principalHumanActorId: input.principalHumanActorId,
        });

        let contextSnapshotId = input.contextSnapshotId;
        if (contextSnapshotId) one((await tx.query<{ id: string }>(
          `SELECT id FROM context_snapshots
            WHERE id=$1 AND workspace_id=$2 AND work_item_id=$3`,
          [contextSnapshotId, meta.actor.workspaceId, workItemId],
        )).rows);
        if (!contextSnapshotId) contextSnapshotId = (await materializeSessionContextSnapshot(tx, {
          workspaceId: meta.actor.workspaceId,
          teamId: work.team_id,
          projectId: work.project_id,
          workItemId,
          workItem: {
            id: workItemId,
            title: work.title,
            description: work.description,
            revision: work.revision,
          },
          actorId: meta.actor.id,
        })).id;
        await revalidateExecutionInstallationAuthority(tx, {
          authority: installation,
          agentId: input.agentId,
          teamId: work.team_id,
          principalHumanActorId: input.principalHumanActorId,
        })
        const scope = {
          workspaceId: meta.actor.workspaceId,
          teamIds: [work.team_id],
          projectIds: work.project_id ? [work.project_id] : [],
          workItemIds: [workItemId],
          repositoryIds: [],
          capabilities: input.requestedCapabilities,
        };
        const delegation = one((await tx.query<Record<string, unknown>>(
          `INSERT INTO delegations(
             workspace_id,team_id,agent_id,agent_actor_id,
             principal_human_actor_id,work_item_id,role,scope_type,scope_id,
             permissions_snapshot,capability_scope,status
           ) VALUES($1,$2,$3,$4,$5,$6,$7,'work_item',$6,$8,$9,'active')
           RETURNING *`,
          [
            meta.actor.workspaceId,
            work.team_id,
            input.agentId,
            agent.actor_id,
            input.principalHumanActorId,
            workItemId,
            input.role,
            input.requestedCapabilities,
            scope,
          ],
        )).rows);
        await event(
          tx,
          meta,
          "agent.delegation.created",
          "delegation",
          String(delegation.id),
          Number(delegation.revision),
          { workItemId, agentId: input.agentId, assignmentMode: "forced" },
          work.team_id,
        );

        const session = one((await tx.query<Record<string, unknown>>(
          `INSERT INTO agent_sessions(
             workspace_id,team_id,agent_id,agent_actor_id,delegation_id,
             work_item_id,context_snapshot_id,budget
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [
            meta.actor.workspaceId,
            work.team_id,
            input.agentId,
            agent.actor_id,
            delegation.id,
            workItemId,
            contextSnapshotId,
            input.budget,
          ],
        )).rows);
        await tx.query(
          `INSERT INTO work_room_channels(
             workspace_id,subject_kind,subject_id,team_id
           ) VALUES($1,'session',$2,$3)
           ON CONFLICT(workspace_id,subject_kind,subject_id) DO NOTHING`,
          [meta.actor.workspaceId, session.id, work.team_id],
        );
        const exchangeToken = opaqueToken();
        await tx.query(
          `INSERT INTO agent_session_tokens(
             session_id,agent_id,installation_token_id,token_hash,
             exchange_nonce_hash,expires_at,issued_by_actor_id
           ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)`,
          [
            session.id,
            input.agentId,
            installation.id,
            tokenHash(opaqueToken()),
            tokenHash(exchangeToken),
            meta.actor.id,
          ],
        );
        await tx.query(
          `INSERT INTO agent_session_prompts(
             session_id,author_actor_id,body_markdown
           ) VALUES($1,$2,$3)`,
          [session.id, meta.actor.id, input.initialPrompt],
        );
        const sessionEventId = await event(
          tx,
          meta,
          "agent.session.created",
          "agent_session",
          String(session.id),
          1,
          {
            delegationId: delegation.id,
            workItemId,
            assignmentMode: "forced",
          },
          work.team_id,
          String(session.id),
          0,
        );
        await queueWebhookDeliveries(
          tx,
          input.agentId,
          sessionEventId,
          "agent.session.created",
          String(session.id),
          {
            sessionId: session.id,
            exchangeToken,
            initialPrompt: input.initialPrompt,
          },
        );
        return {
          delegation,
          session: normalizeAgentSessionResponse(session),
        };
      });
    } catch (error) {
      if (error instanceof RetryForcedAssignment && attempt < 7) continue;
      if (error instanceof RetryForcedAssignment)
        throw new DomainError(
          "REVISION_CONFLICT",
          "The Work Item assignment changed repeatedly; retry the forced assignment",
        );
      throw error;
    }
  }
  throw new DomainError("INTERNAL_ERROR", "Forced assignment retry loop did not terminate");
}

const defaultSelfClaimPrompt =
  "Execute this Work Item according to its current description, acceptance criteria, dependency state, and applicable WorkMesh Guidance.";

type SelfClaimIdentity = Readonly<{
  connection_id: string
  credential_id: string
  connection_team_id: string
  connection_agent_id: string
  connection_agent_actor_id: string
  connection_principal_human_actor_id: string
  connection_delegation_id: string
  connection_status: "active" | "rotating" | "revoked" | "pending"
  connection_capabilities: Capability[]
  credential_status: "active" | "overlap" | "rotated" | "revoked"
  credential_overlap_until: Date | null
  coordination_id: string
  coordination_status: "active" | "closed"
  coordination_expires_at: Date
  coordination_capabilities: Capability[]
  caller_session_id: string
  caller_session_kind: "execution" | "coordination"
  caller_session_state: AgentSessionState
  caller_coordination_connection_id: string | null
  caller_delegation_id: string
}>;

type SelfClaimCapabilityScope = Readonly<{
  workspaceId?: string
  teamIds?: string[]
  projectIds?: string[]
  workItemIds?: string[]
  repositoryIds?: string[]
  capabilities?: Capability[]
}>;

type ActiveSelfClaimAssignment = Record<string, unknown> & Readonly<{
  id: string
  team_id: string
  agent_id: string
  agent_actor_id: string
  principal_human_actor_id: string
  work_item_id: string | null
  role: string
  scope_type: string
  scope_id: string
  permissions_snapshot: Capability[]
  capability_scope: SelfClaimCapabilityScope
}>;

type RecoverableSelfClaimSession = Readonly<{
  id: string
  state: AgentSessionState
  revision: number
  sequence: number | string
  retry_count: number
  created_at: Date
}>;

const sameUniqueSet = <T extends string>(
  left: readonly T[],
  right: readonly T[],
): boolean => left.length === new Set(left).size
  && right.length === new Set(right).size
  && left.length === right.length
  && left.every(value => right.includes(value));

const exactSelfClaimScopeKeys = new Set([
  "workspaceId",
  "teamIds",
  "projectIds",
  "workItemIds",
  "repositoryIds",
  "capabilities",
]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === "string");

const isExactSelfClaimScope = (
  scope: SelfClaimCapabilityScope,
  expected: Readonly<{
    workspaceId: string
    teamId: string
    projectId: string | null
    workItemId: string
    capabilities: readonly Capability[]
  }>,
): boolean => {
  const keys = Object.keys(scope);
  return keys.length === exactSelfClaimScopeKeys.size
    && keys.every(key => exactSelfClaimScopeKeys.has(key))
    && scope.workspaceId === expected.workspaceId
    && isStringArray(scope.teamIds)
    && isStringArray(scope.projectIds)
    && isStringArray(scope.workItemIds)
    && isStringArray(scope.repositoryIds)
    && isStringArray(scope.capabilities)
    && sameUniqueSet(scope.teamIds ?? [], [expected.teamId])
    && sameUniqueSet(scope.projectIds ?? [], expected.projectId ? [expected.projectId] : [])
    && sameUniqueSet(scope.workItemIds ?? [], [expected.workItemId])
    && sameUniqueSet(scope.repositoryIds ?? [], [])
    && sameUniqueSet(scope.capabilities ?? [], expected.capabilities);
};

async function locateSelfClaimIdentity(
  tx: PoolClient,
  input: Readonly<{
    credentialHash: string
    workspaceId: string
    coordinationSessionId: string
    actorId: string
  }>,
): Promise<SelfClaimIdentity | undefined> {
  return (await tx.query<SelfClaimIdentity>(
    `SELECT connection.id AS connection_id,
            credential.id AS credential_id,
            connection.team_id AS connection_team_id,
            connection.agent_id AS connection_agent_id,
            connection.agent_actor_id AS connection_agent_actor_id,
            connection.principal_human_actor_id AS connection_principal_human_actor_id,
            connection.delegation_id AS connection_delegation_id,
            connection.status AS connection_status,
            connection.granted_capabilities AS connection_capabilities,
            credential.status AS credential_status,
            credential.overlap_until AS credential_overlap_until,
            coordination.id AS coordination_id,
            coordination.status AS coordination_status,
            coordination.expires_at AS coordination_expires_at,
            coordination.granted_capabilities AS coordination_capabilities,
            caller.id AS caller_session_id,
            caller.session_kind AS caller_session_kind,
            caller.state AS caller_session_state,
            caller.coordination_connection_id AS caller_coordination_connection_id,
            caller.delegation_id AS caller_delegation_id
       FROM agent_connection_credentials credential
       JOIN agent_connections connection
         ON connection.id=credential.connection_id
       JOIN agent_coordination_sessions coordination
         ON coordination.connection_id=connection.id
       JOIN agent_sessions caller
         ON caller.id=coordination.agent_session_id
      WHERE credential.token_hash=$1
        AND connection.workspace_id=$2
        AND caller.id=$3
        AND caller.agent_actor_id=$4`,
    [
      input.credentialHash,
      input.workspaceId,
      input.coordinationSessionId,
      input.actorId,
    ],
  )).rows[0]
}

/**
 * Atomically admits the current Coordination Agent to an unassigned Work Item.
 * Connection and exact credential identity are locked before the established
 * Agent authority order. The response bootstrap is only stored in the encrypted
 * authentication idempotency record and returned to the same Coordination
 * Session; it is never written to an event or delivery payload.
 */
export async function claimWorkItem(
  db: Pool,
  meta: RequestMeta,
  workItemId: string,
  expectedRevision: number,
  input: ClaimWorkItemInput,
) {
  if (
    meta.actor.kind !== "agent"
    || meta.actor.authentication !== "coordination_connection"
    || !meta.actor.agentSessionId
    || !meta.actor.credentialHash
  ) throw new DomainError("FORBIDDEN", "An active Coordination Connection is required to claim work");
  const coordinationSessionId = meta.actor.agentSessionId;
  const credentialHash = meta.actor.credentialHash;

  return secretAgentMutate(
    db,
    meta,
    { workItemId, expectedRevision, ...input },
    async tx => {
      const initialPrompt = input.initialPrompt ?? defaultSelfClaimPrompt;
      assertSafeText(initialPrompt, "initial prompt");

      const locatedIdentity = one([await locateSelfClaimIdentity(tx, {
        credentialHash,
        workspaceId: meta.actor.workspaceId,
        coordinationSessionId,
        actorId: meta.actor.id,
      })].filter((value): value is SelfClaimIdentity => value !== undefined));
      await lockExecutionInstallationAuthorities(tx, [{
        connection_id: locatedIdentity.connection_id,
        credential_id: locatedIdentity.credential_id,
      }]);
      const identity = one([await locateSelfClaimIdentity(tx, {
        credentialHash,
        workspaceId: meta.actor.workspaceId,
        coordinationSessionId,
        actorId: meta.actor.id,
      })].filter((value): value is SelfClaimIdentity => value !== undefined));
      if (
        identity.connection_id !== locatedIdentity.connection_id
        || identity.credential_id !== locatedIdentity.credential_id
      ) throw new DomainError(
        "AGENT_CONNECTION_REVOKED",
        "The exact Coordination credential changed while claim authority was acquired",
      );

      const credentialActive = identity.credential_status === "active"
        || (
          identity.credential_status === "overlap"
          && identity.credential_overlap_until !== null
          && identity.credential_overlap_until.getTime() > Date.now()
        );
      const coordinationActive = identity.coordination_status === "active"
        && identity.coordination_expires_at.getTime() > Date.now()
        && identity.caller_session_kind === "coordination"
        && ["acknowledged", "planning", "executing"].includes(identity.caller_session_state)
        && identity.caller_coordination_connection_id === identity.connection_id
        && identity.caller_delegation_id === identity.connection_delegation_id;
      if (
        !credentialActive
        || !coordinationActive
        || !["active", "rotating"].includes(identity.connection_status)
      ) throw new DomainError("AGENT_CONNECTION_REVOKED", "The Coordination Connection is no longer active");

      const existingInstallationTokenId = await locateConnectionInstallationTokenId(tx, {
        agentId: identity.connection_agent_id,
        credentialHash,
      });

      const locator = one((await tx.query<{
        team_id: string
        project_id: string | null
        active_delegation_id: string | null
      }>(
        `SELECT item.team_id,item.project_id,
                assignment.id AS active_delegation_id
           FROM work_items item
           LEFT JOIN LATERAL (
             SELECT delegation.id
               FROM delegations delegation
              WHERE delegation.workspace_id=item.workspace_id
                AND delegation.work_item_id=item.id
                AND delegation.role='executor'
                AND delegation.status='active'
              ORDER BY delegation.id
              LIMIT 1
           ) assignment ON true
          WHERE item.id=$1 AND item.workspace_id=$2
            AND item.deleted_at IS NULL`,
        [workItemId, meta.actor.workspaceId],
      )).rows);
      const countedSessionIds = (await tx.query<{ id: string }>(
        `SELECT session.id
           FROM agent_sessions session
          WHERE session.workspace_id=$1
            AND (
              session.id=$2
              OR (
                session.agent_id=$3
                AND ${agentExecutionCapacitySqlPredicate("session")}
              )
              OR (
                $4::uuid IS NOT NULL
                AND session.delegation_id=$4
                AND ${agentExecutionCapacitySqlPredicate("session")}
              )
            )
          ORDER BY session.id`,
        [
          meta.actor.workspaceId,
          identity.caller_session_id,
          identity.connection_agent_id,
          locator.active_delegation_id,
        ],
      )).rows.map(row => row.id);
      const replacementSessionTokenIds = locator.active_delegation_id
        ? (await tx.query<{ id: string }>(
            `SELECT token.id
               FROM agent_session_tokens token
               JOIN agent_sessions session ON session.id=token.session_id
              WHERE session.workspace_id=$1
                AND session.delegation_id=$2
                AND ${agentExecutionCapacitySqlPredicate("session")}
                AND token.revoked_at IS NULL
              ORDER BY token.id`,
            [meta.actor.workspaceId, locator.active_delegation_id],
          )).rows.map(row => row.id)
        : [];

      const installationTokenId = await lockAgentAuthorityPlanWithInstallationTokenWrite(tx, {
        definitionIds: [identity.connection_agent_id],
        teamGrants: [{
          workspaceId: meta.actor.workspaceId,
          agentId: identity.connection_agent_id,
          teamId: identity.connection_team_id,
        }],
        delegationIds: [
          identity.connection_delegation_id,
          ...(locator.active_delegation_id ? [locator.active_delegation_id] : []),
        ],
        sessionIds: countedSessionIds,
        sessionTokenIds: replacementSessionTokenIds,
        installationTokenIds: existingInstallationTokenId
          ? [existingInstallationTokenId]
          : [],
        workItemIds: [workItemId],
        projectIds: locator.project_id ? [locator.project_id] : [],
      }, async rankTx => reconcileConnectionInstallationToken(rankTx, {
        agentId: identity.connection_agent_id,
        credentialHash,
        expiresAt: identity.credential_status === "overlap"
          ? identity.credential_overlap_until
          : null,
        createdByActorId: meta.actor.id,
      }));
      const claimInstallationAuthority: ExecutionInstallationAuthority = {
        id: installationTokenId,
        connection_id: identity.connection_id,
        credential_id: identity.credential_id,
        connection_delegation_id: identity.connection_delegation_id,
      }

      const coordination = one((await tx.query<{
        status: "active" | "closed"
        expires_at: Date
        connection_id: string
        workspace_id: string
        team_id: string
        agent_id: string
        agent_actor_id: string
        principal_human_actor_id: string
        delegation_id: string
        granted_capabilities: Capability[]
        session_state: AgentSessionState
        session_kind: "execution" | "coordination"
        session_connection_id: string | null
        session_delegation_id: string
      }>(
        `SELECT coordination.status,coordination.expires_at,
                coordination.connection_id,coordination.workspace_id,
                coordination.team_id,coordination.agent_id,
                coordination.agent_actor_id,
                coordination.principal_human_actor_id,
                coordination.delegation_id,
                coordination.granted_capabilities,
                session.state AS session_state,
                session.session_kind AS session_kind,
                session.coordination_connection_id AS session_connection_id,
                session.delegation_id AS session_delegation_id
           FROM agent_coordination_sessions coordination
           JOIN agent_sessions session
             ON session.id=coordination.agent_session_id
          WHERE coordination.id=$1 AND session.id=$2
          FOR UPDATE OF coordination`,
        [identity.coordination_id, identity.caller_session_id],
      )).rows);
      if (
        coordination.status !== "active"
        || coordination.expires_at.getTime() <= Date.now()
        || coordination.connection_id !== identity.connection_id
        || coordination.workspace_id !== meta.actor.workspaceId
        || coordination.team_id !== identity.connection_team_id
        || coordination.agent_id !== identity.connection_agent_id
        || coordination.agent_actor_id !== meta.actor.id
        || coordination.principal_human_actor_id !== identity.connection_principal_human_actor_id
        || coordination.delegation_id !== identity.connection_delegation_id
        || coordination.session_kind !== "coordination"
        || !["acknowledged", "planning", "executing"].includes(coordination.session_state)
        || coordination.session_connection_id !== identity.connection_id
        || coordination.session_delegation_id !== identity.connection_delegation_id
      ) throw new DomainError("SESSION_NOT_ACTIVE", "The Coordination Session is no longer active");

      const definition = one((await tx.query<{
        actor_id: string
        approved_capabilities: Capability[]
        is_active: boolean
      }>(
        `SELECT actor_id,approved_capabilities,is_active
           FROM agent_definitions
          WHERE id=$1 AND workspace_id=$2`,
        [identity.connection_agent_id, meta.actor.workspaceId],
      )).rows);
      const grant = one((await tx.query<{
        approved_capabilities: Capability[]
        revoked_at: Date | null
      }>(
        `SELECT approved_capabilities,revoked_at
           FROM agent_team_access
          WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3`,
        [
          meta.actor.workspaceId,
          identity.connection_agent_id,
          identity.connection_team_id,
        ],
      )).rows);
      const authority = one((await tx.query<{
        status: string
        agent_id: string
        agent_actor_id: string
        principal_human_actor_id: string
        team_id: string
        permissions_snapshot: Capability[]
      }>(
        `SELECT status,agent_id,agent_actor_id,principal_human_actor_id,
                team_id,permissions_snapshot
           FROM delegations
          WHERE id=$1 AND workspace_id=$2`,
        [identity.connection_delegation_id, meta.actor.workspaceId],
      )).rows);
      if (
        !definition.is_active
        || definition.actor_id !== meta.actor.id
        || grant.revoked_at !== null
        || authority.status !== "active"
        || authority.agent_id !== identity.connection_agent_id
        || authority.agent_actor_id !== meta.actor.id
        || authority.principal_human_actor_id !== identity.connection_principal_human_actor_id
        || authority.team_id !== identity.connection_team_id
      ) throw new DomainError("DELEGATION_NOT_ACTIVE", "The Connection authority is no longer active");

      const liveCapabilities = identity.connection_capabilities.filter(capability =>
        capability !== "agent:delegate"
        && identity.coordination_capabilities.includes(capability)
        && coordination.granted_capabilities.includes(capability)
        && definition.approved_capabilities.includes(capability)
        && grant.approved_capabilities.includes(capability)
        && authority.permissions_snapshot.includes(capability));
      if (!liveCapabilities.includes("work:read") || !liveCapabilities.includes("work:write"))
        throw new DomainError("CAPABILITY_DENIED", "Self-claim requires live work:read and work:write capabilities");
      const explicitlyRequestedCapabilities = input.requestedCapabilities;
      if (
        explicitlyRequestedCapabilities
        && (
          !explicitlyRequestedCapabilities.includes("work:read")
          || !explicitlyRequestedCapabilities.includes("work:write")
          || explicitlyRequestedCapabilities.includes("agent:delegate")
          || explicitlyRequestedCapabilities.some(capability => !liveCapabilities.includes(capability))
        )
      ) throw new DomainError("CAPABILITY_DENIED", "Requested execution capabilities exceed the live Connection authority");

      const work = one((await tx.query<{
        team_id: string
        project_id: string | null
        revision: number
        responsible_human_actor_id: string | null
        title: string
        description: string | null
        status_category: StatusCategory
      }>(
        `SELECT item.team_id,item.project_id,item.revision,
                item.responsible_human_actor_id,item.title,item.description,
                state.category AS status_category
           FROM work_items item
           JOIN workflow_states state ON state.id=item.status_id
          WHERE item.id=$1 AND item.workspace_id=$2
            AND item.deleted_at IS NULL`,
        [workItemId, meta.actor.workspaceId],
      )).rows);
      if (
        work.team_id !== locator.team_id
        || work.project_id !== locator.project_id
        || work.team_id !== identity.connection_team_id
      ) throw new DomainError("RESOURCE_SCOPE_DENIED", "The Work Item is outside the Connection Team");
      assertRevision(expectedRevision, work.revision);

      const assignment = (await tx.query<ActiveSelfClaimAssignment>(
        `SELECT *
           FROM delegations
          WHERE workspace_id=$1 AND work_item_id=$2
            AND role='executor' AND status='active'
          ORDER BY id
          LIMIT 1`,
        [meta.actor.workspaceId, workItemId],
      )).rows[0];
      if ((assignment?.id ?? null) !== locator.active_delegation_id)
        throw new DomainError(
          "REVISION_CONFLICT",
          "The Work Item assignment changed while stale recovery authority was acquired; retry the claim",
        );
      const assignmentSessions = assignment
        ? (await tx.query<RecoverableSelfClaimSession>(
          `SELECT id,state,revision,sequence,retry_count,created_at
             FROM agent_sessions session
            WHERE session.workspace_id=$1
              AND session.delegation_id=$2
              AND ${agentExecutionCapacitySqlPredicate("session")}
            ORDER BY created_at DESC,id DESC`,
          [meta.actor.workspaceId, assignment.id],
        )).rows
        : [];
      const activeAssignmentSessionTokenIds = assignmentSessions.length
        ? (await tx.query<{ id: string }>(
            `SELECT id
               FROM agent_session_tokens
              WHERE session_id=ANY($1::uuid[]) AND revoked_at IS NULL
              ORDER BY id`,
            [assignmentSessions.map(session => session.id)],
          )).rows.map(row => row.id)
        : [];
      if (!sameUniqueSet(activeAssignmentSessionTokenIds, replacementSessionTokenIds))
        throw new DomainError(
          "REVISION_CONFLICT",
          "The stale Session credentials changed while recovery authority was acquired; retry the claim",
        );
      const assignmentCapabilities = assignment?.permissions_snapshot ?? [];
      const assignmentScope = assignment?.capability_scope ?? {};
      const assignmentCompatible = Boolean(
        assignment
        && assignment.team_id === work.team_id
        && assignment.agent_id === identity.connection_agent_id
        && assignment.agent_actor_id === meta.actor.id
        && assignment.principal_human_actor_id === identity.connection_principal_human_actor_id
        && assignment.work_item_id === workItemId
        && assignment.role === "executor"
        && assignment.scope_type === "work_item"
        && assignment.scope_id === workItemId
        && assignmentCapabilities.includes("work:read")
        && assignmentCapabilities.includes("work:write")
        && !assignmentCapabilities.includes("agent:delegate")
        && assignmentCapabilities.every(capability => liveCapabilities.includes(capability))
        && isExactSelfClaimScope(assignmentScope, {
          workspaceId: meta.actor.workspaceId,
          teamId: work.team_id,
          projectId: work.project_id,
          workItemId,
          capabilities: assignmentCapabilities,
        })
        && (
          !explicitlyRequestedCapabilities
          || sameUniqueSet(explicitlyRequestedCapabilities, assignmentCapabilities)
        )
        && assignmentSessions.length > 0
        && assignmentSessions.every(session => countedSessionIds.includes(session.id))
        && assignmentSessions.every(session => session.state === "stale")
      );
      if (assignment && !assignmentCompatible) {
        const activeExecutionStates = Object.fromEntries(
          [...new Set(assignmentSessions.map(session => session.state))]
            .sort()
            .map(state => [
              state,
              assignmentSessions.filter(session => session.state === state).length,
            ]),
        );
        throw new DomainError(
          "WORK_ITEM_ALREADY_ASSIGNED",
          "The Work Item has an executor assignment that this Connection cannot recover",
          { agentId: assignment.agent_id, activeExecutionStates },
        );
      }
      assertWorkItemSelfClaimable({
        statusCategory: work.status_category,
        responsibleHumanActorId: work.responsible_human_actor_id,
        principalHumanActorId: identity.connection_principal_human_actor_id,
        hasActiveExecutorDelegation: false,
      });

      const replacementReason = "replaced by stale self-claim recovery";
      for (const oldSession of assignmentSessions) {
        const canceled = one((await tx.query<{
          revision: number
          sequence: number | string
        }>(
          `UPDATE agent_sessions
              SET state='canceled',state_reason=$2,ended_at=now(),
                  revision=revision+1,sequence=sequence+1,updated_at=now()
            WHERE id=$1 AND session_kind='execution' AND state='stale'
          RETURNING revision,sequence`,
          [oldSession.id, replacementReason],
        )).rows);
        await tx.query(
          `UPDATE agent_session_tokens
              SET revoked_at=COALESCE(revoked_at,now())
            WHERE session_id=$1 AND revoked_at IS NULL`,
          [oldSession.id],
        );
        const releasedLeases = (await tx.query<{ id: string; version: number }>(
          `UPDATE leases
              SET status='released',released_at=now(),released_by_actor_id=$2,
                  audit_reason=$3,version=version+1,updated_at=now()
            WHERE session_id=$1 AND status='active'
          RETURNING id,version`,
          [oldSession.id, meta.actor.id, replacementReason],
        )).rows;
        await tx.query(
          `UPDATE inbox_items
              SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,
                  revision=revision+1,updated_at=now()
            WHERE workspace_id=$1 AND session_id=$2 AND status='open'
              AND kind='session_stale'
              AND source_type='agent_session' AND source_id=$2`,
          [meta.actor.workspaceId, oldSession.id, meta.actor.id],
        );
        const canceledEventId = await event(
          tx,
          meta,
          "agent.session.state_changed",
          "agent_session",
          oldSession.id,
          canceled.revision,
          {
            state: "canceled",
            reason: replacementReason,
            assignmentMode: "self_claim_recovery",
          },
          work.team_id,
          oldSession.id,
          Number(canceled.sequence),
        );
        await queueWebhookDeliveries(
          tx,
          identity.connection_agent_id,
          canceledEventId,
          "agent.session.state_changed",
          oldSession.id,
          { sessionId: oldSession.id, state: "canceled", reason: replacementReason },
        );
        for (const lease of releasedLeases) await event(
          tx,
          meta,
          "lease.released",
          "lease",
          lease.id,
          lease.version,
          { reason: replacementReason, sessionId: oldSession.id },
          work.team_id,
          oldSession.id,
          Number(canceled.sequence),
        );
      }
      await assertAgentExecutionCapacityAfterLock(tx, {
        workspaceId: meta.actor.workspaceId,
        agentId: identity.connection_agent_id,
      });

      let contextSnapshotId = input.contextSnapshotId;
      if (contextSnapshotId) one((await tx.query<{ id: string }>(
        `SELECT id FROM context_snapshots
          WHERE id=$1 AND workspace_id=$2 AND work_item_id=$3`,
        [contextSnapshotId, meta.actor.workspaceId, workItemId],
      )).rows);
      if (!contextSnapshotId) contextSnapshotId = (await materializeSessionContextSnapshot(tx, {
        workspaceId: meta.actor.workspaceId,
        teamId: work.team_id,
        projectId: work.project_id,
        workItemId,
        workItem: {
          id: workItemId,
          title: work.title,
          description: work.description,
          revision: work.revision,
        },
        actorId: meta.actor.id,
      })).id;

      const finalIdentity = await locateSelfClaimIdentity(tx, {
        credentialHash,
        workspaceId: meta.actor.workspaceId,
        coordinationSessionId,
        actorId: meta.actor.id,
      })
      const finalAuthorityCheckAt = Date.now()
      const finalCredentialActive = finalIdentity?.credential_status === "active"
        || (
          finalIdentity?.credential_status === "overlap"
          && finalIdentity.credential_overlap_until !== null
          && finalIdentity.credential_overlap_until.getTime() > finalAuthorityCheckAt
        )
      if (
        !finalIdentity
        || finalIdentity.connection_id !== identity.connection_id
        || finalIdentity.credential_id !== identity.credential_id
        || finalIdentity.connection_status === "revoked"
        || !finalCredentialActive
        || finalIdentity.coordination_status !== "active"
        || finalIdentity.coordination_expires_at.getTime() <= finalAuthorityCheckAt
        || finalIdentity.caller_session_kind !== "coordination"
        || !["acknowledged", "planning", "executing"].includes(
          finalIdentity.caller_session_state,
        )
        || finalIdentity.caller_coordination_connection_id !== identity.connection_id
        || finalIdentity.caller_delegation_id !== identity.connection_delegation_id
      ) throw new DomainError(
        "AGENT_CONNECTION_REVOKED",
        "The exact Coordination authority expired before the claim was admitted",
      )
      await revalidateExecutionInstallationAuthority(tx, {
        authority: claimInstallationAuthority,
        agentId: identity.connection_agent_id,
        teamId: work.team_id,
        principalHumanActorId: identity.connection_principal_human_actor_id,
      })

      const executionCapabilities = assignment
        ? assignmentCapabilities
        : explicitlyRequestedCapabilities ?? liveCapabilities;
      const capabilityScope = {
        workspaceId: meta.actor.workspaceId,
        teamIds: [work.team_id],
        projectIds: work.project_id ? [work.project_id] : [],
        workItemIds: [workItemId],
        repositoryIds: [],
        capabilities: executionCapabilities,
      };
      let delegation: Record<string, unknown>;
      if (assignment) {
        delegation = assignment;
      } else {
        delegation = one((await tx.query<Record<string, unknown>>(
          `INSERT INTO delegations(
             workspace_id,team_id,agent_id,agent_actor_id,
             principal_human_actor_id,work_item_id,role,scope_type,scope_id,
             permissions_snapshot,capability_scope,status
           ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6,$7,$8,'active')
           RETURNING *`,
          [
            meta.actor.workspaceId,
            work.team_id,
            identity.connection_agent_id,
            meta.actor.id,
            identity.connection_principal_human_actor_id,
            workItemId,
            executionCapabilities,
            capabilityScope,
          ],
        )).rows);
        await event(
          tx,
          meta,
          "agent.delegation.created",
          "delegation",
          String(delegation.id),
          Number(delegation.revision),
          {
            workItemId,
            agentId: identity.connection_agent_id,
            assignmentMode: "self_claim",
          },
          work.team_id,
        );
      }

      const recoverySource = assignmentSessions[0];
      const session = one((await tx.query<Record<string, unknown>>(
        `INSERT INTO agent_sessions(
           workspace_id,team_id,agent_id,agent_actor_id,delegation_id,
           work_item_id,context_snapshot_id,budget,retry_of_session_id,
           retry_reason,retry_count
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          meta.actor.workspaceId,
          work.team_id,
          identity.connection_agent_id,
          meta.actor.id,
          delegation.id,
          workItemId,
          contextSnapshotId,
          input.budget ?? {},
          recoverySource?.id ?? null,
          assignment ? replacementReason : null,
          recoverySource ? recoverySource.retry_count + 1 : 0,
        ],
      )).rows);
      await tx.query(
        `INSERT INTO work_room_channels(
           workspace_id,subject_kind,subject_id,team_id
         ) VALUES($1,'session',$2,$3)
         ON CONFLICT(workspace_id,subject_kind,subject_id) DO NOTHING`,
        [meta.actor.workspaceId, session.id, work.team_id],
      );

      const exchangeToken = opaqueToken();
      await tx.query(
        `INSERT INTO agent_session_tokens(
           session_id,agent_id,installation_token_id,token_hash,
           exchange_nonce_hash,expires_at,issued_by_actor_id
         ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)`,
        [
          session.id,
          identity.connection_agent_id,
          installationTokenId,
          tokenHash(opaqueToken()),
          tokenHash(exchangeToken),
          meta.actor.id,
        ],
      );
      await tx.query(
        `INSERT INTO agent_session_prompts(
           session_id,author_actor_id,body_markdown
         ) VALUES($1,$2,$3)`,
        [session.id, meta.actor.id, initialPrompt],
      );
      const sessionEventId = await event(
        tx,
        meta,
        "agent.session.created",
        "agent_session",
        String(session.id),
        1,
        {
          delegationId: delegation.id,
          workItemId,
          assignmentMode: assignment ? "self_claim_recovery" : "self_claim",
          retryOfSessionId: recoverySource?.id ?? null,
        },
        work.team_id,
        String(session.id),
        0,
      );
      await queueWebhookDeliveries(
        tx,
        identity.connection_agent_id,
        sessionEventId,
        "agent.session.created",
        String(session.id),
        { sessionId: session.id, initialPrompt },
      );
      return {
        delegation,
        session: normalizeAgentSessionResponse(session),
        exchangeToken,
      };
    },
  );
}

export async function resolveInstallationSessionSubject(
  db: Pool,
  sessionId: string,
  installationBearer: string,
  exchangeNonce?: string,
): Promise<string> {
  const values: unknown[] = [sessionId, tokenHash(installationBearer)];
  const exchangePredicate = exchangeNonce
    ? `AND EXISTS(
         SELECT 1 FROM agent_session_tokens st
          WHERE st.session_id=s.id AND st.installation_token_id=t.id
            AND st.exchange_nonce_hash=$3
       )`
    : "";
  if (exchangeNonce) values.push(tokenHash(exchangeNonce));
  const resolved = (
    await db.query<{ actor_id: string }>(
      `SELECT d.actor_id
         FROM agent_sessions s
         JOIN agent_definitions d ON d.id=s.agent_id
         JOIN agent_installation_tokens t ON t.agent_id=d.id
         JOIN delegations execution_delegation ON execution_delegation.id=s.delegation_id
         LEFT JOIN agent_connection_credentials credential
           ON credential.token_hash=t.token_hash
         LEFT JOIN agent_connections connection
           ON connection.id=credential.connection_id
         LEFT JOIN delegations connection_authority
           ON connection_authority.id=connection.delegation_id
        WHERE s.id=$1 AND t.token_hash=$2 AND t.revoked_at IS NULL
          AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
          AND d.is_active
          AND (
            credential.id IS NULL
            OR (
              credential.status='active'
              OR (
                credential.status='overlap'
                AND credential.overlap_until IS NOT NULL
                AND credential.overlap_until>clock_timestamp()
              )
            )
          )
          AND (
            credential.id IS NULL
            OR (
              connection.status IN ('active','rotating')
              AND connection.agent_id=s.agent_id
              AND connection.agent_actor_id=s.agent_actor_id
              AND connection.team_id=s.team_id
              AND connection.principal_human_actor_id=execution_delegation.principal_human_actor_id
              AND connection_authority.status='active'
              AND connection_authority.role='coordinator'
              AND connection_authority.scope_type='team'
              AND connection_authority.scope_id=connection.team_id
              AND connection_authority.agent_id=connection.agent_id
              AND connection_authority.agent_actor_id=connection.agent_actor_id
              AND connection_authority.team_id=connection.team_id
              AND connection_authority.principal_human_actor_id=connection.principal_human_actor_id
            )
          )
          ${exchangePredicate}
        LIMIT 1`,
      values,
    )
  ).rows[0];
  if (!resolved)
    throw new DomainError(
      "UNAUTHENTICATED",
      "Active installation credential is required",
    );
  return `installation:${resolved.actor_id}:session:${sessionId}`;
}

type CredentialAuthorityLocator = {
  agent_id: string
  delegation_id: string
  team_id: string
  work_item_id: string | null
  project_id: string | null
  work_item_project_id: string | null
  installation_token_id: string | null
}

type ConnectionCredentialAuthority = {
  connection_id: string
  credential_id: string
  connection_status: string
  connection_team_id: string
  connection_agent_id: string
  connection_agent_actor_id: string
  connection_principal_human_actor_id: string
  connection_delegation_id: string
  credential_status: string
  credential_overlap_until: Date | null
}

async function locateConnectionCredentialAuthority(
  tx: Pick<PoolClient, 'query'> | Pool,
  installationHash: string,
): Promise<ConnectionCredentialAuthority | undefined> {
  return (await tx.query<ConnectionCredentialAuthority>(
    `SELECT connection.id AS connection_id,
            credential.id AS credential_id,
            connection.status AS connection_status,
            connection.team_id AS connection_team_id,
            connection.agent_id AS connection_agent_id,
            connection.agent_actor_id AS connection_agent_actor_id,
            connection.principal_human_actor_id AS connection_principal_human_actor_id,
            connection.delegation_id AS connection_delegation_id,
            credential.status AS credential_status,
            credential.overlap_until AS credential_overlap_until
       FROM agent_connection_credentials credential
       JOIN agent_connections connection ON connection.id=credential.connection_id
      WHERE credential.token_hash=$1`,
    [installationHash],
  )).rows[0]
}

async function lockCredentialAuthority(
  tx: PoolClient,
  input: {
    workspaceId?: string
    sessionId: string
    installationHash: string
    sessionTokenIds: string[]
  },
): Promise<CredentialAuthorityLocator> {
  const locatedConnection = await locateConnectionCredentialAuthority(
    tx,
    input.installationHash,
  )
  if (locatedConnection) await lockExecutionInstallationAuthorities(tx, [{
    connection_id: locatedConnection.connection_id,
    credential_id: locatedConnection.credential_id,
  }])
  const connection = await locateConnectionCredentialAuthority(
    tx,
    input.installationHash,
  )
  if (
    Boolean(connection) !== Boolean(locatedConnection)
    || (
      connection
      && locatedConnection
      && (
        connection.connection_id !== locatedConnection.connection_id
        || connection.credential_id !== locatedConnection.credential_id
      )
    )
  ) throw new DomainError(
    'UNAUTHENTICATED',
    'Installation credential binding changed while authority was acquired',
  )
  if (connection) {
    const credentialActive = connection.credential_status === 'active'
      || (
        connection.credential_status === 'overlap'
        && connection.credential_overlap_until !== null
        && connection.credential_overlap_until.getTime() > Date.now()
      )
    if (!credentialActive || !['active', 'rotating'].includes(connection.connection_status))
      throw new DomainError('UNAUTHENTICATED', 'Active installation credential is required')
  }
  const locator = one((await tx.query<CredentialAuthorityLocator>(
    `SELECT session.agent_id,session.delegation_id,session.team_id,
            session.work_item_id,session.project_id,
            item.project_id AS work_item_project_id,
            installation.id AS installation_token_id
       FROM agent_sessions session
       LEFT JOIN work_items item ON item.id=session.work_item_id
       LEFT JOIN agent_installation_tokens installation
         ON installation.agent_id=session.agent_id
        AND installation.token_hash=$2
      WHERE session.id=$1
        AND ($3::uuid IS NULL OR session.workspace_id=$3)`,
    [input.sessionId, input.installationHash, input.workspaceId ?? null],
  )).rows)
  const workspaceId = input.workspaceId ?? one((await tx.query<{ workspace_id: string }>(
    'SELECT workspace_id FROM agent_sessions WHERE id=$1',
    [input.sessionId],
  )).rows).workspace_id
  const authorityDefinitions = [...new Set([
    locator.agent_id,
    ...(connection ? [connection.connection_agent_id] : []),
  ])]
  const authorityTeamGrants = [
    { workspaceId, agentId: locator.agent_id, teamId: locator.team_id },
    ...(connection ? [{
      workspaceId,
      agentId: connection.connection_agent_id,
      teamId: connection.connection_team_id,
    }] : []),
  ].filter((candidate, index, rows) => rows.findIndex(row =>
    row.workspaceId === candidate.workspaceId
    && row.agentId === candidate.agentId
    && row.teamId === candidate.teamId) === index)
  await lockAgentAuthorityPlan(tx, {
    definitionIds: authorityDefinitions,
    teamGrants: authorityTeamGrants,
    delegationIds: [...new Set([
      locator.delegation_id,
      ...(connection ? [connection.connection_delegation_id] : []),
    ])],
    sessionIds: [input.sessionId],
    sessionTokenIds: input.sessionTokenIds,
    installationTokenIds: locator.installation_token_id
      ? [locator.installation_token_id]
      : [],
    workItemIds: locator.work_item_id ? [locator.work_item_id] : [],
    projectIds: [
      ...(locator.project_id ? [locator.project_id] : []),
      ...(locator.work_item_project_id ? [locator.work_item_project_id] : []),
    ],
  })
  const live = (await tx.query<{
    agent_id: string
    agent_actor_id: string
    delegation_id: string
    principal_human_actor_id: string
    team_id: string
    work_item_id: string | null
    project_id: string | null
    work_item_project_id: string | null
  }>(
    `SELECT session.agent_id,session.agent_actor_id,session.delegation_id,
            delegation.principal_human_actor_id,
            session.team_id,
            session.work_item_id,session.project_id,item.project_id AS work_item_project_id
       FROM agent_sessions session
       JOIN agent_definitions definition
         ON definition.id=session.agent_id AND definition.is_active
       JOIN delegations delegation
         ON delegation.id=session.delegation_id
        AND delegation.workspace_id=session.workspace_id
        AND delegation.agent_id=session.agent_id
        AND delegation.team_id=session.team_id
        AND delegation.status='active'
       JOIN agent_team_access access
         ON access.workspace_id=session.workspace_id
        AND access.agent_id=session.agent_id
        AND access.team_id=session.team_id
        AND access.revoked_at IS NULL
       LEFT JOIN work_items item
         ON item.id=session.work_item_id
        AND item.workspace_id=session.workspace_id
        AND item.deleted_at IS NULL
       LEFT JOIN projects project
         ON project.id=coalesce(item.project_id,session.project_id)
        AND project.workspace_id=session.workspace_id
        AND project.deleted_at IS NULL
      WHERE session.id=$1
        AND ($2::uuid IS NULL OR session.workspace_id=$2)
        AND (session.work_item_id IS NULL OR item.id IS NOT NULL)
        AND (
          coalesce(item.project_id,session.project_id) IS NULL
          OR project.id IS NOT NULL
        )`,
    [input.sessionId, input.workspaceId ?? null],
  )).rows[0]
  if (
    !live
    || live.agent_id !== locator.agent_id
    || live.delegation_id !== locator.delegation_id
    || live.team_id !== locator.team_id
    || live.work_item_id !== locator.work_item_id
    || live.project_id !== locator.project_id
    || live.work_item_project_id !== locator.work_item_project_id
  ) throw new DomainError("DELEGATION_NOT_ACTIVE", "Agent credential authority is no longer active")
  if (connection) {
    const connectionAuthority = one((await tx.query<{
      status: string
      role: string
      scope_type: string
      scope_id: string
      team_id: string
      agent_id: string
      agent_actor_id: string
      principal_human_actor_id: string
    }>(
      `SELECT status,role,scope_type,scope_id,team_id,agent_id,
              agent_actor_id,principal_human_actor_id
         FROM delegations WHERE id=$1`,
      [connection.connection_delegation_id],
    )).rows)
    if (
      connection.connection_agent_id !== live.agent_id
      || connection.connection_agent_actor_id !== live.agent_actor_id
      || connection.connection_team_id !== live.team_id
      || connection.connection_principal_human_actor_id !== live.principal_human_actor_id
      || connectionAuthority.status !== 'active'
      || connectionAuthority.role !== 'coordinator'
      || connectionAuthority.scope_type !== 'team'
      || connectionAuthority.scope_id !== connection.connection_team_id
      || connectionAuthority.team_id !== connection.connection_team_id
      || connectionAuthority.agent_id !== connection.connection_agent_id
      || connectionAuthority.agent_actor_id !== connection.connection_agent_actor_id
      || connectionAuthority.principal_human_actor_id !== connection.connection_principal_human_actor_id
    ) throw new DomainError('UNAUTHENTICATED', 'Installation credential does not match the exact Session authority')

    const finalConnection = await locateConnectionCredentialAuthority(
      tx,
      input.installationHash,
    )
    const finalCredentialActive = finalConnection?.credential_status === 'active'
      || (
        finalConnection?.credential_status === 'overlap'
        && finalConnection.credential_overlap_until !== null
        && finalConnection.credential_overlap_until.getTime() > Date.now()
      )
    if (
      !finalConnection
      || finalConnection.connection_id !== connection.connection_id
      || finalConnection.credential_id !== connection.credential_id
      || !['active', 'rotating'].includes(finalConnection.connection_status)
      || !finalCredentialActive
    ) throw new DomainError(
      'UNAUTHENTICATED',
      'Installation credential expired while Session authority was acquired',
    )
  }
  return locator
}

export async function exchangeAgentToken(
  db: Pool,
  input: {
    sessionId: string;
    nonce: string;
    installationBearer: string;
    idempotencyKey: string;
    clientContext: Record<string, string | null>;
  },
) {
  const subject = await resolveInstallationSessionSubject(
    db,
    input.sessionId,
    input.installationBearer,
    input.nonce,
  );
  const replay = await authIdempotentTransaction(db, {
    idempotencyKey: input.idempotencyKey,
    subject,
    operation: "exchangeAgentSessionToken",
    request: { sessionId: input.sessionId, exchangeToken: input.nonce },
    clientContext: input.clientContext,
  }, async tx => {
    const tokenId = one((await tx.query<{ id: string }>(
      "SELECT id FROM agent_session_tokens WHERE session_id=$1 AND exchange_nonce_hash=$2",
      [input.sessionId, tokenHash(input.nonce)],
    )).rows).id;
    const locator = await lockCredentialAuthority(tx, {
      sessionId: input.sessionId,
      installationHash: tokenHash(input.installationBearer),
      sessionTokenIds: [tokenId],
    });
    const token = one((await tx.query<{ id: string; installation_token_id: string; expires_at: Date }>("SELECT t.id,t.installation_token_id,t.expires_at FROM agent_session_tokens t JOIN agent_sessions s ON s.id=t.session_id WHERE t.id=$1 AND t.session_id=$2 AND t.exchange_nonce_hash=$3 AND t.expires_at>clock_timestamp() AND t.exchanged_at IS NULL AND t.revoked_at IS NULL AND s.state NOT IN ('completed','failed','canceled')", [tokenId, input.sessionId, tokenHash(input.nonce)])).rows);
    if (token.installation_token_id !== locator.installation_token_id)
      throw new DomainError("UNAUTHENTICATED", "Installation credential binding changed");
    const installation = await tx.query("SELECT 1 FROM agent_installation_tokens WHERE id=$1 AND agent_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())", [token.installation_token_id, locator.agent_id, tokenHash(input.installationBearer)]);
    if (!installation.rowCount) throw new DomainError("UNAUTHENTICATED", "Active installation credential is required");
    const bearer = opaqueToken();
    await tx.query("UPDATE agent_session_tokens SET token_hash=$2,exchanged_at=now() WHERE id=$1", [token.id, tokenHash(bearer)]);
    await tx.query("UPDATE agent_installation_tokens SET last_used_at=now() WHERE id=$1", [token.installation_token_id]);
    return { status: 200, body: { sessionToken: bearer, expiresAt: token.expires_at.toISOString() } };
  });
  return replay.body;
}

export async function refreshAgentToken(
  db: Pool,
  input: {
    sessionId: string;
    tokenId?: string;
    installationBearer: string;
    idempotencyKey: string;
    clientContext: Record<string, string | null>;
  },
) {
  const subject = await resolveInstallationSessionSubject(
    db,
    input.sessionId,
    input.installationBearer,
  );
  const replay = await authIdempotentTransaction(db, {
    idempotencyKey: input.idempotencyKey,
    subject,
    operation: "refreshAgentSessionToken",
    request: { sessionId: input.sessionId, tokenId: input.tokenId ?? null },
    clientContext: input.clientContext,
  }, async tx => {
    const sessionTokenIds = (await tx.query<{ id: string }>(
      `WITH ranked_live AS (
         SELECT id,row_number() OVER(ORDER BY created_at DESC,id DESC) AS live_rank
           FROM agent_session_tokens
          WHERE session_id=$1 AND revoked_at IS NULL
            AND expires_at>clock_timestamp()
       ), cleanup AS (
         SELECT token.id,token.created_at
           FROM agent_session_tokens token
           LEFT JOIN ranked_live live ON live.id=token.id
          WHERE token.session_id=$1
            AND (
              token.revoked_at IS NOT NULL
              OR token.expires_at<=clock_timestamp()
              OR live.live_rank>=64
            )
          ORDER BY token.created_at,token.id
          LIMIT 256
       ) SELECT id FROM cleanup ORDER BY id`,
      [input.sessionId],
    )).rows.map(row => row.id);
    const locator = await lockCredentialAuthority(tx, {
      sessionId: input.sessionId,
      installationHash: tokenHash(input.installationBearer),
      sessionTokenIds,
    });
    const session = one((await tx.query<{ id: string; agent_id: string; state: string }>("SELECT id,agent_id,state FROM agent_sessions WHERE id=$1 AND agent_id=$2", [input.sessionId, locator.agent_id])).rows);
    if (["stopping", "completed", "failed", "canceled"].includes(session.state)) throw new DomainError("SESSION_STOPPED", "Stopped session cannot refresh its token");
    if (!locator.installation_token_id)
      throw new DomainError("UNAUTHENTICATED", "Active installation credential is required");
    const installation = one((await tx.query<{ id: string }>("SELECT id FROM agent_installation_tokens WHERE id=$1 AND agent_id=$2 AND token_hash=$3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())", [locator.installation_token_id, session.agent_id, tokenHash(input.installationBearer)])).rows);
    if (sessionTokenIds.length) await tx.query(
      `DELETE FROM agent_session_tokens
        WHERE session_id=$1 AND id=ANY($2::uuid[])
          AND (
            revoked_at IS NOT NULL
            OR expires_at<=clock_timestamp()
            OR id NOT IN (
              SELECT id FROM agent_session_tokens
               WHERE session_id=$1 AND revoked_at IS NULL
                 AND expires_at>clock_timestamp()
               ORDER BY created_at DESC,id DESC
               LIMIT 63
            )
          )`,
      [input.sessionId, sessionTokenIds],
    );
    const raw = opaqueToken(); await tx.query("INSERT INTO agent_session_tokens(session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,exchanged_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now())", [input.sessionId, session.agent_id, installation.id, tokenHash(raw), tokenHash(opaqueToken())]);
    return { status: 200, body: { sessionToken: raw, expiresAt: new Date(Date.now() + 900_000).toISOString() } };
  });
  return replay.body;
}

export async function retrySession(db: Pool, meta: RequestMeta, sourceId: string, revision: number, input: { reason: string; initialPrompt?: string; reuseContext: boolean }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can retry a session");
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "retry reason"); assertSafeText(input.initialPrompt, "retry prompt");
    const locator=one((await tx.query<{
      agent_id:string;delegation_id:string;team_id:string;work_item_id:string|null
      project_id:string|null;work_item_project_id:string|null;principal_human_actor_id:string
    }>(`SELECT s.agent_id,s.delegation_id,s.team_id,s.work_item_id,s.project_id,
               w.project_id AS work_item_project_id,
               delegation.principal_human_actor_id
          FROM agent_sessions s
          JOIN delegations delegation ON delegation.id=s.delegation_id
          LEFT JOIN work_items w ON w.id=s.work_item_id
         WHERE s.id=$1 AND s.workspace_id=$2`,[sourceId,meta.actor.workspaceId])).rows);
    const relatedSessionIds=(await tx.query<{id:string}>(`SELECT id FROM agent_sessions session WHERE session.retry_of_session_id=$1 OR (session.delegation_id=$2 AND ${agentExecutionCapacitySqlPredicate('session')})`,[sourceId,locator.delegation_id])).rows.map(row=>row.id);
    const installationAuthority=await locateExecutionInstallationAuthority(tx,{
      agentId:locator.agent_id,
      teamId:locator.team_id,
      principalHumanActorId:locator.principal_human_actor_id,
    });
    const installationTokenId=installationAuthority?.id;
    await lockExecutionInstallationAuthorities(tx,
      installationAuthority ? [installationAuthority] : [])
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[locator.agent_id],
      teamGrants:[{workspaceId:meta.actor.workspaceId,agentId:locator.agent_id,teamId:locator.team_id}],
      delegationIds:[
        locator.delegation_id,
        ...(installationAuthority?.connection_delegation_id
          ? [installationAuthority.connection_delegation_id]
          : []),
      ],
      sessionIds:[sourceId,...relatedSessionIds],
      installationTokenIds:installationTokenId?[installationTokenId]:[],
      workItemIds:locator.work_item_id?[locator.work_item_id]:[],
      projectIds:[
        ...(locator.project_id?[locator.project_id]:[]),
        ...(locator.work_item_project_id?[locator.work_item_project_id]:[]),
      ],
    });
    const source = one((await tx.query<Record<string, unknown>>("SELECT s.*,d.principal_human_actor_id,d.status AS delegation_status,a.is_active AS agent_active,EXISTS(SELECT 1 FROM agent_team_access ata WHERE ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL) AS team_active,a.max_concurrency,w.project_id AS work_item_project_id FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id LEFT JOIN work_items w ON w.id=s.work_item_id AND w.workspace_id=s.workspace_id AND w.deleted_at IS NULL WHERE s.id=$1 AND s.workspace_id=$2", [sourceId, meta.actor.workspaceId])).rows) as Record<string, unknown>;
    if(source.agent_id!==locator.agent_id||source.delegation_id!==locator.delegation_id||source.team_id!==locator.team_id||source.work_item_id!==locator.work_item_id||source.project_id!==locator.project_id||source.work_item_project_id!==locator.work_item_project_id) throw new DomainError("DELEGATION_NOT_ACTIVE","Retry authority binding changed");
    await assertHumanTeam(tx, meta.actor, source.team_id as string); assertRevision(revision, source.revision as number);
    if (!['failed','canceled','stale'].includes(source.state as string)) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED", "Only failed, canceled, or stale sessions can be retried");
    if (!source.agent_active || source.delegation_status!=="active" || !source.team_active) throw new DomainError("DELEGATION_NOT_ACTIVE","Retry requires an active agent delegation and team grant");
    if ((await tx.query("SELECT 1 FROM agent_sessions WHERE retry_of_session_id=$1",[sourceId])).rowCount) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED","A direct retry already exists for this source session");
    if (source.state === "stale") {
      const competing = await tx.query(`SELECT 1 FROM agent_sessions session WHERE session.delegation_id=$1 AND session.id<>$2 AND ${agentExecutionCapacitySqlPredicate('session')}`, [source.delegation_id, sourceId]);
      if (competing.rowCount) throw new DomainError("AGENT_SESSION_RETRY_NOT_ALLOWED", "A stale session cannot be retried while another session is active for its delegation");
      const canceled = one((await tx.query("UPDATE agent_sessions SET state='canceled',state_reason='retrying stale session',ended_at=now(),sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision,sequence", [sourceId])).rows);
      await event(tx, meta, "agent.session.state_changed", "agent_session", sourceId, Number((canceled as {revision:number}).revision), { state: "canceled", reason: "retrying stale session" }, source.team_id as string, sourceId, Number((canceled as {sequence:number}).sequence));
    }
    await assertAgentExecutionCapacityAfterLock(tx,{workspaceId:meta.actor.workspaceId,agentId:source.agent_id as string});
    const prompt = input.initialPrompt ?? `Retry: ${input.reason}`;
    let retryContextId=source.context_snapshot_id as string|null;
    if(!input.reuseContext) {
      const retryWork=source.work_item_id ? one((await tx.query<{id:string;title:string;description:string|null;revision:number;project_id:string|null}>("SELECT id,title,description,revision,project_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",[source.work_item_id,source.workspace_id])).rows) : null;
      retryContextId=(await materializeSessionContextSnapshot(tx,{
        workspaceId:source.workspace_id as string,teamId:source.team_id as string,projectId:retryWork?.project_id??source.project_id as string|null,
        workItemId:source.work_item_id as string|null,workItem:retryWork,actorId:meta.actor.id,
      })).id;
    }
    if(!installationTokenId||!installationAuthority)
      throw new DomainError("NOT_FOUND","Active installation token not found");
    const install = await revalidateExecutionInstallationAuthority(tx,{
      authority:installationAuthority,
      agentId:locator.agent_id,
      teamId:locator.team_id,
      principalHumanActorId:locator.principal_human_actor_id,
    });
    const row = one((await tx.query("INSERT INTO agent_sessions(workspace_id,team_id,agent_id,agent_actor_id,delegation_id,work_item_id,project_id,plan_step_id,context_snapshot_id,budget,retry_of_session_id,retry_reason,retry_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [source.workspace_id,source.team_id,source.agent_id,source.agent_actor_id,source.delegation_id,source.work_item_id,source.project_id,source.plan_step_id,retryContextId,source.budget,sourceId,input.reason,(source.retry_count as number)+1])).rows);
    await tx.query("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'session',$2,$3) ON CONFLICT(workspace_id,subject_kind,subject_id) DO NOTHING", [source.workspace_id as string, (row as { id: string }).id, source.team_id as string]);
    const exchange = opaqueToken();
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
    if (input.kind === "question") { const responsible = one((await tx.query<{ responsible_human_actor_id: string }>("SELECT responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2", [session.work_item_id, meta.actor.workspaceId])).rows); await tx.query("INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,recipient_actor_id,session_id,team_id,kind,source_type,source_id,payload) VALUES($1,$2,$2,$3,$4,'waiting_input','activity',$5,$6) ON CONFLICT DO NOTHING", [meta.actor.workspaceId, responsible.responsible_human_actor_id, sessionId, session.team_id, (row as { id: string }).id, { summary: input.summary }]); }
    await event(tx, meta, "agent.activity.appended", "agent_activity", String((row as { id: string }).id), updated.revision, { kind: input.kind }, session.team_id, sessionId, updated.sequence);
    return row;
  });
}

export async function acknowledge(db: Pool, meta: RequestMeta, sessionId: string, input: { summary: string; externalUrls: unknown[] }) {
  const response = await agentMutate(db, meta, async tx => {
    assertSafeText(input.summary,"acknowledgement summary");
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "ack", idempotencyKey: meta.idempotencyKey });
    assertAgentSessionTransition(session.state, "acknowledged");
    const row = one((await tx.query("UPDATE agent_sessions SET state='acknowledged',state_reason=$2,acknowledged_at=now(),external_urls=$3::jsonb,sequence=sequence+1,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [sessionId, input.summary, JSON.stringify(input.externalUrls)])).rows);
    if (session.state === "stale") await tx.query(
      `UPDATE inbox_items
          SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,
              revision=revision+1,updated_at=now()
        WHERE workspace_id=$1 AND session_id=$2 AND status='open'
          AND kind='session_stale'
          AND source_type='agent_session' AND source_id=$2`,
      [meta.actor.workspaceId, sessionId, meta.actor.id],
    );
    await event(tx, meta, "agent.session.acknowledged", "agent_session", sessionId, Number((row as { revision: number }).revision), { summary: input.summary }, session.team_id, sessionId, Number((row as { sequence: number }).sequence)); return row;
  });
  return normalizeAgentSessionResponse(response);
}

export async function heartbeat(db: Pool, meta: RequestMeta, sessionId: string, input: { currentStepId?: string; usage: unknown }) {
  return withTx(db, async tx => {
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId); assertAgentWrite({ actor: meta.actor, session, sessionId, capability: "work:write", operation: "heartbeat", idempotencyKey: meta.idempotencyKey });
    const projection = one((await tx.query<{
      heartbeat_health: "healthy" | "degraded" | "stale";
      heartbeat_idempotency_key: string | null;
      heartbeat_request_hash: string | null;
      state: AgentSessionState;
      revision: number;
      sequence: number;
    }>("SELECT heartbeat_health,heartbeat_idempotency_key,heartbeat_request_hash,state,revision,sequence FROM agent_sessions WHERE id=$1 FOR UPDATE", [sessionId])).rows);
    if (await isHeartbeatReplay(tx, {
      resourceKind: "session",
      resourceId: sessionId,
      idempotencyKey: meta.idempotencyKey,
      requestHash: meta.requestHash,
    })) {
      return normalizeAgentSessionResponse(one((await tx.query("SELECT * FROM agent_sessions WHERE id=$1", [sessionId])).rows));
    }
    const restorable = !["stopping","stale","completed","failed","canceled"].includes(projection.state);
    const nextHealth = restorable ? "healthy" : projection.heartbeat_health;
    const row = one((await tx.query(
      `UPDATE agent_sessions
          SET last_heartbeat_at=now(),heartbeat_checked_at=now(),
              heartbeat_current_step_id=$2,
              heartbeat_usage=heartbeat_usage
                || jsonb_build_object(
                     'runtimeSeconds',
                     GREATEST(
                       COALESCE((heartbeat_usage->>'runtimeSeconds')::bigint,0),
                       ($3::jsonb->>'runtimeSeconds')::bigint
                     )
                   )
                || CASE WHEN $3::jsonb ? 'inputTokens'
                        THEN jsonb_build_object(
                          'inputTokens',
                          GREATEST(
                            COALESCE((heartbeat_usage->>'inputTokens')::bigint,0),
                            ($3::jsonb->>'inputTokens')::bigint
                          )
                        ) ELSE '{}'::jsonb END
                || CASE WHEN $3::jsonb ? 'outputTokens'
                        THEN jsonb_build_object(
                          'outputTokens',
                          GREATEST(
                            COALESCE((heartbeat_usage->>'outputTokens')::bigint,0),
                            ($3::jsonb->>'outputTokens')::bigint
                          )
                        ) ELSE '{}'::jsonb END
                || CASE WHEN $3::jsonb ? 'toolCalls'
                        THEN jsonb_build_object(
                          'toolCalls',
                          GREATEST(
                            COALESCE((heartbeat_usage->>'toolCalls')::bigint,0),
                            ($3::jsonb->>'toolCalls')::bigint
                          )
                        ) ELSE '{}'::jsonb END,
              heartbeat_health=$4,
              heartbeat_health_changed_at=CASE WHEN heartbeat_health<>$4 THEN now() ELSE heartbeat_health_changed_at END,
              heartbeat_idempotency_key=$5,heartbeat_request_hash=$6,
              updated_at=now()
        WHERE id=$1
        RETURNING *`,
      [sessionId, input.currentStepId ?? null, input.usage, nextHealth, meta.idempotencyKey, meta.requestHash],
    )).rows);
    await recordHeartbeatKey(tx, {
      resourceKind: "session",
      resourceId: sessionId,
      idempotencyKey: meta.idempotencyKey,
      requestHash: meta.requestHash,
    });
    if (nextHealth !== projection.heartbeat_health) {
      await event(tx, meta, "agent.session.health_changed", "agent_session", sessionId, projection.revision, {
        from: projection.heartbeat_health,
        to: nextHealth,
        reason: "heartbeat_received",
      }, session.team_id, sessionId, projection.sequence);
    }
    return normalizeAgentSessionResponse(row);
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
    const delegation = one((await tx.query<{ role: string }>("SELECT role FROM delegations WHERE id=$1", [session.delegation_id])).rows);
    if (delegation.role === "reviewer") throw new DomainError("FORBIDDEN", "Reviewer sessions cannot publish implementation plans");
    if (session.state === "awaiting_approval") {
      if (!input.approvalId || !input.approvalPayloadHash) throw new DomainError("APPROVAL_REQUIRED", "Publishing a plan while awaiting approval requires an approval id and payload hash");
      const consumed = await consumeApprovalInTx(tx,meta,sessionId,input.approvalId,input.approvalPayloadHash,"agent.plan.publish");
      if ("expired" in consumed) return consumed;
    }
    const previous = session.current_plan_version_id ? (await tx.query<PlanStepInput>("SELECT id,title,description,status,ordinal,owner_actor_id AS \"ownerActorId\",coalesce(acceptance_criteria,'[]'::jsonb) AS \"acceptanceCriteria\",expected_artifacts AS \"expectedArtifacts\",cancellation_reason AS \"cancellationReason\",coalesce((SELECT array_agg(depends_on_step_id) FROM agent_plan_step_dependencies WHERE plan_version_id=$1 AND step_id=s.id),'{}'::uuid[]) AS \"dependsOn\" FROM agent_plan_steps s WHERE plan_version_id=$1", [session.current_plan_version_id])).rows : [];
    validatePlanSteps(input.steps, previous);
    const planRevision = Number((await tx.query<{ revision: number }>("SELECT coalesce(max(revision),0)+1 AS revision FROM agent_plan_versions WHERE session_id=$1", [sessionId])).rows[0]?.revision ?? 1);
    const version = one((await tx.query<{ id: string }>("INSERT INTO agent_plan_versions(session_id,revision,parent_version_id,change_summary,author_actor_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [sessionId, planRevision, session.current_plan_version_id ?? null, input.changeSummary, meta.actor.id])).rows);
    for (const step of input.steps) await tx.query("INSERT INTO agent_plan_steps(plan_version_id,id,title,description,status,ordinal,owner_actor_id,acceptance_criteria,expected_artifacts,cancellation_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)", [version.id, step.id, step.title, step.description ?? null, step.status, step.ordinal, step.ownerActorId ?? null, JSON.stringify(step.acceptanceCriteria), step.expectedArtifacts, step.cancellationReason ?? null]);
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
    await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND session_id=$2 AND kind='waiting_input' AND status='open'", [meta.actor.workspaceId, sessionId, meta.actor.id]);
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
    if (input.signal === "stop") {
      const leases = (await tx.query<{ id: string }>("UPDATE leases SET status='released',released_at=now(),released_by_actor_id=$2,audit_reason='stop requested',version=version+1,updated_at=now() WHERE session_id=$1 AND status='active' RETURNING id", [sessionId, meta.actor.id])).rows;
      for (const lease of leases) await event(tx, meta, "lease.released", "lease", lease.id, 1, { reason: "stop requested", sessionId }, session.team_id, sessionId, Number((row as { sequence: number }).sequence));
    }
    const eventType=`agent.session.signal.${input.signal}`;
    const eventId = await event(tx, meta, eventType, "agent_session", sessionId, Number((row as { revision: number }).revision), { signal: input.signal, reason: input.reason, state: next }, session.team_id, sessionId, Number((row as { sequence: number }).sequence));
    await queueWebhookDeliveries(tx, (await tx.query<{ agent_id: string }>("SELECT agent_id FROM agent_sessions WHERE id=$1", [sessionId])).rows[0]!.agent_id, eventId, eventType, sessionId, { sessionId, signal: input.signal, reason: input.reason, state:next }); return row;
  });
}

export async function finishSession(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: CompleteAgentSessionInput | { code: string; summary: string; retryable: boolean; evidence: string[] }, failed = false) {
  return agentMutate(db, meta, async tx => {
    assertSafeText(input.summary,"session summary");
    assertSanitized(failed ? { evidence: (input as { evidence: string[] }).evidence } : { checks: (input as CompleteAgentSessionInput).checks, limitations: (input as CompleteAgentSessionInput).limitations, noArtifactReason: (input as CompleteAgentSessionInput).noArtifactReason });
    const session = await loadAgentSessionForMutation(tx, meta.actor, sessionId);
    const sessionDelegation = one((await tx.query<{ role: string }>("SELECT role FROM delegations WHERE id=$1", [session.delegation_id])).rows);
    assertAgentWrite({ actor: meta.actor, session, sessionId, capability: sessionDelegation.role === "reviewer" ? "artifact:write" : "work:write", operation: failed ? "fail" : "complete", idempotencyKey: meta.idempotencyKey, expectedRevision });
    const completion = input as CompleteAgentSessionInput; if (!failed) assertCompletionEvidence(completion);
    if (!failed) {
      const blockers = (await tx.query<{ id: string }>("SELECT id FROM agent_sessions WHERE parent_session_id=$1 AND required_for_parent=true AND state<>'completed' ORDER BY created_at", [sessionId])).rows.map(row => row.id);
      if (blockers.length) throw new DomainError("COMPLETION_PLAN_INCOMPLETE", "Required child sessions must complete before the parent session", { blockerSessionIds: blockers });
      if (sessionDelegation.role === "reviewer") {
        const reviewResult = await tx.query("SELECT 1 FROM room_messages WHERE workspace_id=$1 AND session_id=$2 AND author_actor_id=$3 AND intent='review_result' LIMIT 1", [meta.actor.workspaceId, sessionId, meta.actor.id]);
        const codeReview = await tx.query("SELECT 1 FROM artifacts WHERE workspace_id=$1 AND session_id=$2 AND producer_actor_id=$3 AND type='code_review' LIMIT 1", [meta.actor.workspaceId, sessionId, meta.actor.id]);
        if (!reviewResult.rowCount || !codeReview.rowCount) throw new DomainError("REVIEW_COMPLETION_EVIDENCE_REQUIRED", "Reviewer completion requires a review_result message and code_review artifact");
      }
    }
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
    const delegation = one((await tx.query<{ role: string }>("SELECT role FROM delegations WHERE id=$1", [session.delegation_id])).rows);
    if (delegation.role === "reviewer" && input.type !== "code_review") throw new DomainError("REVIEW_ARTIFACT_REQUIRED", "Reviewer sessions may publish only a code_review artifact");
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
    const responsible = one((await tx.query<{ responsible_human_actor_id: string }>("SELECT responsible_human_actor_id FROM work_items WHERE id=$1 AND workspace_id=$2", [session.work_item_id, meta.actor.workspaceId])).rows); await tx.query("INSERT INTO inbox_items(workspace_id,recipient_human_actor_id,recipient_actor_id,session_id,team_id,kind,source_type,source_id,payload) VALUES($1,$2,$2,$3,$4,'approval','approval',$5,$6)", [meta.actor.workspaceId, responsible.responsible_human_actor_id, input.sessionId, session.team_id, (row as { id: string }).id, { action: input.actionName }]);
    const requestedPayload={approvalId:String((row as {id:string}).id),sessionId:input.sessionId,status:"pending" as const,actionName:input.actionName,actionPayloadHash:input.actionPayloadHash,requiredApprovals:input.requiredApprovals,expiresAt:new Date((row as {expires_at:Date}).expires_at).toISOString()};
    await event(tx, meta, "approval.requested", "approval", requestedPayload.approvalId, 1, requestedPayload, session.team_id, input.sessionId); return row;
  });
}

export async function decideApproval(db: Pool, meta: RequestMeta, approvalId: string, expectedRevision: number, input: { decision: "approved" | "rejected"; reason: string }) {
  if (meta.actor.kind !== "human") throw new DomainError("FORBIDDEN", "Only a human can decide approval");
  const result = await agentMutate(db, meta, async tx => {
    assertSafeText(input.reason, "approval decision reason");
    const locator=one((await tx.query<{
      session_id:string;agent_id:string;delegation_id:string;team_id:string;
      work_item_id:string|null;project_id:string|null;work_item_project_id:string|null;
    }>(`SELECT approval.session_id,session.agent_id,session.delegation_id,session.team_id,
               session.work_item_id,session.project_id,item.project_id AS work_item_project_id
          FROM approvals approval
          JOIN agent_sessions session ON session.id=approval.session_id
          LEFT JOIN work_items item ON item.id=session.work_item_id
         WHERE approval.id=$1 AND approval.workspace_id=$2`,
    [approvalId,meta.actor.workspaceId])).rows);
    const credentials=await tx.query<{session_token_id:string;installation_token_id:string}>(
      `SELECT token.id AS session_token_id,token.installation_token_id
         FROM agent_session_tokens token
        WHERE token.session_id=$1
        ORDER BY token.id`,
      [locator.session_id],
    );
    await lockAgentAuthorityPlan(tx,{
      definitionIds:[locator.agent_id],
      teamGrants:[{workspaceId:meta.actor.workspaceId,agentId:locator.agent_id,teamId:locator.team_id}],
      delegationIds:[locator.delegation_id],
      sessionIds:[locator.session_id],
      sessionTokenIds:credentials.rows.map(row=>row.session_token_id),
      installationTokenIds:credentials.rows.map(row=>row.installation_token_id),
      workItemIds:locator.work_item_id?[locator.work_item_id]:[],
      projectIds:[
        ...(locator.project_id?[locator.project_id]:[]),
        ...(locator.work_item_project_id?[locator.work_item_project_id]:[]),
      ],
    });
    const live=one((await tx.query<{
      agent_id:string;delegation_id:string;team_id:string;work_item_id:string|null;
      project_id:string|null;work_item_project_id:string|null;state:string;
      definition_active:boolean;grant_revoked_at:Date|null;delegation_status:string;
      work_item_exists:boolean;project_exists:boolean;
    }>(`SELECT session.agent_id,session.delegation_id,session.team_id,
               session.work_item_id,session.project_id,item.project_id AS work_item_project_id,
               session.state,definition.is_active AS definition_active,
               access.revoked_at AS grant_revoked_at,delegation.status AS delegation_status,
               (session.work_item_id IS NULL OR item.id IS NOT NULL) AS work_item_exists,
               (coalesce(item.project_id,session.project_id) IS NULL OR project.id IS NOT NULL)
                 AS project_exists
          FROM agent_sessions session
          JOIN agent_definitions definition ON definition.id=session.agent_id
          JOIN agent_team_access access
            ON access.workspace_id=session.workspace_id
           AND access.agent_id=session.agent_id AND access.team_id=session.team_id
          JOIN delegations delegation ON delegation.id=session.delegation_id
          LEFT JOIN work_items item
            ON item.id=session.work_item_id AND item.workspace_id=session.workspace_id
           AND item.deleted_at IS NULL
          LEFT JOIN projects project
            ON project.id=coalesce(item.project_id,session.project_id)
           AND project.workspace_id=session.workspace_id AND project.deleted_at IS NULL
         WHERE session.id=$1 AND session.workspace_id=$2`,
    [locator.session_id,meta.actor.workspaceId])).rows);
    if(
      live.agent_id!==locator.agent_id||live.delegation_id!==locator.delegation_id
      ||live.team_id!==locator.team_id||live.work_item_id!==locator.work_item_id
      ||live.project_id!==locator.project_id
      ||live.work_item_project_id!==locator.work_item_project_id
      ||!live.definition_active||live.grant_revoked_at!==null
      ||live.delegation_status!=='active'
      ||!live.work_item_exists||!live.project_exists
      ||!['queued','acknowledged','executing','awaiting_input','awaiting_approval'].includes(live.state)
    ) throw new DomainError('DELEGATION_NOT_ACTIVE','Approval Session authority is no longer active');
    const approval=one((await tx.query<{
      revision:number;session_id:string;status:string;required_approvals:number;expires_at:Date;
      team_id:string;agent_id:string;
    }>(`SELECT approval.revision,approval.session_id,approval.status,
               approval.required_approvals,approval.expires_at,$3::uuid AS team_id,$4::uuid AS agent_id
          FROM approvals approval
         WHERE approval.id=$1 AND approval.workspace_id=$2
         FOR UPDATE OF approval`,
    [approvalId,meta.actor.workspaceId,live.team_id,live.agent_id])).rows);
    if(approval.session_id!==locator.session_id)
      throw new DomainError('CONFLICT','Approval Session binding changed');
    await assertHumanTeam(tx, meta.actor, approval.team_id); assertRevision(expectedRevision, approval.revision);
    if (approval.status !== "pending") throw new DomainError("CONFLICT", "Approval is no longer pending");
    if (approval.expires_at.getTime() <= Date.now()) { const expired=one((await tx.query("UPDATE approvals SET status='expired',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",[approvalId])).rows); const payload={approvalId,status:"expired" as const,expiredAt:new Date((expired as {updated_at:Date}).updated_at).toISOString()}; const eventId=await event(tx,meta,"approval.expired","approval",approvalId,Number((expired as {revision:number}).revision),payload,approval.team_id,approval.session_id); await queueWebhookDeliveries(tx,approval.agent_id,eventId,"approval.expired",approval.session_id,{...payload,sessionId:approval.session_id}); return {expired:true}; }
    const inserted=await tx.query("INSERT INTO approval_decisions(approval_id,actor_id,decision,reason) VALUES($1,$2,$3,$4) ON CONFLICT(approval_id,actor_id) DO NOTHING RETURNING actor_id,decision,reason,decided_at", [approvalId, meta.actor.id, input.decision, input.reason]); if(!inserted.rowCount) throw new DomainError("CONFLICT","Actor already decided this approval");
    const counts=one((await tx.query<{approved:number;rejected:number}>("SELECT count(*) FILTER(WHERE decision='approved')::int AS approved,count(*) FILTER(WHERE decision='rejected')::int AS rejected FROM approval_decisions WHERE approval_id=$1",[approvalId])).rows);
    const status=input.decision==='rejected' ? 'rejected' : counts.approved>=approval.required_approvals ? 'approved' : 'pending';
    const row = one((await tx.query("UPDATE approvals SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *", [approvalId,status])).rows);
    if(status!=="pending") await tx.query("UPDATE inbox_items SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND source_type='approval' AND source_id=$3 AND status='open'", [meta.actor.workspaceId, meta.actor.id, approvalId]);
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
  if(!expectedActionName && approval.action_name==="provider.pull_request.merge") throw new DomainError("APPROVAL_CONSUME_CONFLICT","Merge approvals may only be consumed by the exact-head provider worker");
  if(expectedActionName && approval.action_name!==expectedActionName) throw new DomainError("APPROVAL_PAYLOAD_MISMATCH","Approval action does not authorize this operation");
  if(approval.action_payload_hash!==hash || canonicalPayloadHash(approval.action_payload_sanitized)!==hash) throw new DomainError("APPROVAL_PAYLOAD_MISMATCH","Approval payload hash does not match");
  if(approval.expires_at.getTime()<=Date.now()){ const expired=one((await tx.query("UPDATE approvals SET status='expired',revision=revision+1,updated_at=now() WHERE id=$1 AND status='approved' RETURNING revision,updated_at",[approvalId])).rows); const payload={approvalId,status:"expired" as const,expiredAt:new Date((expired as {updated_at:Date}).updated_at).toISOString()}; const eventId=await event(tx,meta,"approval.expired","approval",approvalId,Number((expired as {revision:number}).revision),payload,approval.team_id,sessionId); await queueWebhookDeliveries(tx,approval.agent_id,eventId,"approval.expired",sessionId,{...payload,sessionId}); return {expired:true as const}; }
  if(approval.status==='consumed') throw new DomainError("APPROVAL_ALREADY_CONSUMED","Approval was already consumed");
  if(approval.status!=="approved") throw new DomainError("APPROVAL_NOT_APPROVED","Approval is not approved");
  const quorum=one((await tx.query<{approved:number}>("SELECT count(*) FILTER(WHERE decision='approved')::int AS approved FROM approval_decisions WHERE approval_id=$1",[approvalId])).rows); if(quorum.approved<approval.required_approvals) throw new DomainError("APPROVAL_QUORUM_NOT_REACHED","Approval quorum has not been reached");
  return one((await tx.query("UPDATE approvals SET status='consumed',consumed_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 AND status='approved' RETURNING *",[approvalId])).rows);
}

export async function consumeApproval(db:Pool,meta:RequestMeta,approvalId:string,expectedRevision:number,input:{actionPayloadHash:string}) { const result=await agentMutate(db,meta,async tx=>{ const sessionId=meta.actor.agentSessionId; if(meta.actor.kind!=="agent"||!sessionId) throw new DomainError("FORBIDDEN","Agent session token is required"); const session=await loadAgentSessionForMutation(tx,meta.actor,sessionId); assertAgentWrite({actor:meta.actor,session,sessionId,capability:"work:write",operation:"activity",idempotencyKey:meta.idempotencyKey}); const current=one((await tx.query<{revision:number}>("SELECT revision FROM approvals WHERE id=$1 AND workspace_id=$2",[approvalId,meta.actor.workspaceId])).rows); assertRevision(expectedRevision,current.revision); const row=await consumeApprovalInTx(tx,meta,sessionId,approvalId,input.actionPayloadHash); if("expired" in row) return row; return {approval_id:row.id,status:"consumed",consumed_at:row.consumed_at,action_payload_hash:row.action_payload_hash}; }); if("expired" in result) throw new DomainError("APPROVAL_EXPIRED","Approval has expired"); return result; }
