import crypto from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { ZodError, z } from "zod";
import {
  loadConfig,
  loadFeatureConfig,
  loadReleaseInfo,
  type FeatureConfig,
} from "@workmesh/config";
import {
  commentInputSchema,
  commentPatchSchema,
  errorBody,
  featureDefinitions,
  featureForApiRoute,
  installInputSchema,
  loginInputSchema,
  projectInputSchema,
  savedViewInputSchema,
  stateInputSchema,
  teamInputSchema,
  workItemInputSchema,
  workItemPatchSchema,
  workspaceInputSchema,
} from "@workmesh/contracts";
import {
  appendEvent,
  applyMigrations,
  assertPasswordPolicy,
  createDb,
  type Db,
  hashPassword,
  installWorkspaceInTx,
  opaqueToken,
  tokenHash,
  verifyPassword,
  withTx,
} from "@workmesh/db";
import { DomainError, etag, parseRevision } from "@workmesh/domain";
import { RealtimeMetrics } from "@workmesh/observability";
import {
  commands,
  mutate,
  type Actor,
  type CommandContext,
} from "./commands.js";
import { registerAgentRoutes } from "./agent/routes.js";
import { registerCollaborationRoutes } from "./collaboration/routes.js";
import { registerInboxRoutes } from "./inbox/routes.js";
import { registerDeliveryRoutes } from "./delivery/routes.js";
import { registerOperationsRoutes } from "./operations/routes.js";
import { registerAdminRetentionRoutes } from "./admin-retention.js";
import type { ApiActor } from "./agent/types.js";
import { installRoutePolicyInventory } from "./authz/route-policy.js";
import {
  authorizeRequest,
  policyForRequest,
  recordAuthorizationDenial,
} from "./authz/authorize.js";
import { validateExternalCorrelationId } from "./authz/request-metadata.js";
import { installAuthRateLimit } from "./auth-rate-limit/plugin.js";
import { AuthRateLimitedError, AuthRateLimitUnavailableError } from "./auth-rate-limit/limiter.js";
import type { AuthRateLimitStore } from "./auth-rate-limit/redis-store.js";
import {
  authClientContext,
  authIdempotentTransaction,
  type AuthReplayEnvelope,
} from "./auth-idempotency.js";
import {
  installBootstrapAuthentication,
  verifyBootstrapRequest,
} from "./bootstrap-auth.js";
import { createPaginator, type Paginator } from "./pagination.js";
import { attachWorkItemExecutors } from "./work-item-executors.js";
import { registerGuidanceRoutes } from "./guidance.js";
import { registerClientProfileRoutes } from "./client-profile.js";
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from "./live-read-authorization.js";
import { createEventReader } from "./realtime/event-reader.js";
import {
  createRealtimeCoordinator,
} from "./realtime/coordinator.js";
import {
  NoopWakeSource,
  RedisStreamWakeSource,
  type RealtimeWakeSource,
} from "./realtime/wake-source.js";
import { registerRealtimeRoutes } from "./realtime/routes.js";
import {
  CoordinationIdentityResolutionError,
  registerAgentConnectionRoutes,
  resolveCoordinationIdentity,
} from "./agent-connections.js";
import type { AgentConnectionCurrentIdentity } from "@workmesh/contracts";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
    correlationId: string;
    idempotencyKey?: string;
    rawBody?: Buffer;
    coordinationIdentity?: AgentConnectionCurrentIdentity;
  }

  interface FastifyInstance {
    workmeshRuntime: {
      accepting: boolean;
    };
  }
}

const config = loadConfig();
const publicMcpOrigin = config.PUBLIC_MCP_ORIGIN ?? config.WEB_ORIGIN;
const db = createDb();
const sessionCookie = "workmesh_session";
const dummyPasswordHash = "$argon2id$v=19$m=65536,t=3,p=4$jIrvJoYL8u7zyxBFSmb4rQ$ktNePxUds6iumXhzFBjTTBxpNThz95LuN0QCV/z1ixY";
const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const publicPaths = new Set([
  "/api/v1/auth/login",
  "/api/v1/install-status",
  "/api/v1/info",
  "/livez",
  "/readyz",
  "/health",
  "/.well-known/workmesh-agent",
  "/api/v1/agent-connections/redeem",
  ...(process.env.RUN_INTEGRATION === "1" ? ["/api/v1/test/reset-install"] as const : []),
]);

const stable = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value instanceof Date ? value.toISOString() : value;
};
const fingerprint = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
const header = (request: FastifyRequest, name: string) =>
  request.headers[name] as string | undefined;
const idParam = (request: FastifyRequest) =>
  z.object({ id: z.string().uuid() }).parse(request.params).id;
const oneRow = <T>(result: { rows: T[] }): T => {
  const row = result.rows[0];
  if (!row) throw new DomainError("NOT_FOUND", "Resource not found");
  return row;
};

function commandContext(
  request: FastifyRequest,
  body: unknown,
  params: Record<string, unknown> = {},
): CommandContext {
  const route =
    request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown";
  const operation = `${request.method} ${route}`;
  return {
    actor: request.actor!,
    idempotencyKey: request.idempotencyKey!,
    correlationId: request.correlationId,
    operation,
    requestHash: fingerprint({
      method: request.method,
      route,
      pathParams: params,
      body,
      ifMatch: header(request, "if-match") ?? null,
      agentSessionId:
        request.actor?.kind === "agent"
          ? request.actor.agentSessionId ?? null
          : null,
    }),
    clientContext: authClientContext(request),
  };
}

async function assertReadableTeam(
  request: FastifyRequest,
  teamId: string,
): Promise<void> {
  const current = request.actor! as unknown as ApiActor;
  const team = await db.query<{ id: string }>(
    "SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
    [teamId, current.workspaceId],
  );
  if (!team.rowCount) throw new DomainError("NOT_FOUND", "Team not found");
  if (current.kind === "agent") {
    const values: unknown[] = [current.agentSessionId ?? null, current.workspaceId, teamId];
    const liveAuthorization = liveSessionReadPredicate(current, "$1", "$2", values);
    const authorized = await db.query(
      `SELECT 1
         FROM agent_sessions scoped
        WHERE scoped.id=$1
          AND scoped.workspace_id=$2
          AND scoped.team_id=$3
          AND ${liveAuthorization}`,
      values,
    );
    if (!authorized.rowCount)
      throw new DomainError(
        "RESOURCE_SCOPE_DENIED",
        "Agent token cannot read this Team",
      );
    return;
  }
  if (current.workspaceRole === "admin") return;
  const membership = await db.query(
    "SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3",
    [current.workspaceId, teamId, current.id],
  );
  if (!membership.rowCount)
    throw new DomainError("FORBIDDEN", "Team membership is required");
}

async function agentReadableWorkItem(request: FastifyRequest, workItemId: string): Promise<void> {
  const current = request.actor! as unknown as ApiActor;
  if (current.kind !== "agent") return;
  if (current.authentication === "coordination_connection") {
    const values: unknown[] = [current.workspaceId, workItemId, current.agentSessionId];
    const liveAuthorization = liveSessionReadPredicate(
      current,
      "$3",
      "target.workspace_id",
      values,
    );
    const found = await db.query(
      `SELECT 1
         FROM work_items target
        WHERE target.workspace_id=$1
          AND target.id=$2
          AND target.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
              FROM agent_sessions scoped
             WHERE scoped.id=$3
               AND scoped.workspace_id=target.workspace_id
               AND scoped.team_id=target.team_id
               AND scoped.session_kind='coordination'
               AND scoped.coordination_connection_id IS NOT NULL
          )
          AND ${liveAuthorization}`,
      values,
    );
    if (!found.rowCount)
      throw new DomainError("RESOURCE_SCOPE_DENIED", "Coordination Connection cannot read this work item");
    return;
  }
  const found = await db.query(
    `SELECT 1 FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id AND a.is_active JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
      WHERE s.id=$1 AND s.workspace_id=$2 AND s.work_item_id=$3 AND d.status='active'
        AND 'work:read'=ANY(d.permissions_snapshot)
        AND 'work:read'=ANY(a.approved_capabilities)
        AND 'work:read'=ANY(ata.approved_capabilities)
        AND COALESCE(d.capability_scope->'teamIds','[]'::jsonb) ? s.team_id::text
        AND COALESCE(d.capability_scope->'workItemIds','[]'::jsonb) ? s.work_item_id::text`,
    [current.agentSessionId, current.workspaceId, workItemId],
  );
  if (!found.rowCount) throw new DomainError("RESOURCE_SCOPE_DENIED", "Agent token cannot read this work item");
}

function scopedTeamPredicate(
  request: FastifyRequest,
  column: string,
  values: unknown[],
): string {
  if (request.actor!.workspaceRole === "admin") return "";
  values.push(request.actor!.id);
  return ` AND EXISTS (SELECT 1 FROM memberships m JOIN teams mt ON mt.id=m.team_id AND mt.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.team_id=${column} AND m.actor_id=$${values.length} AND mt.deleted_at IS NULL)`;
}

export const buildApp = (options: {
  features?: FeatureConfig;
  releaseInfo?: ReturnType<typeof loadReleaseInfo>;
  logger?: FastifyServerOptions["logger"];
  authRateLimitStore?: AuthRateLimitStore;
  readinessProbe?: () => Promise<void>;
  beforePagedQuery?: (route: string) => Promise<void> | void;
  afterAuthorizeRequest?: (request: FastifyRequest) => Promise<void> | void;
  realtimeWakeSource?: RealtimeWakeSource;
  realtimeDb?: Db;
  realtimeHealthyReconcileMs?: number;
  realtimeFallbackReconcileMs?: number;
  realtimeBatchLimit?: number;
  realtimeHeartbeatMs?: number;
  realtimeBackpressureTimeoutMs?: number;
  realtimeMaxClients?: number;
} = {}) => {
  const features = options.features ?? loadFeatureConfig();
  const releaseInfo = options.releaseInfo ?? loadReleaseInfo();
  const paginator = createPaginator(config, undefined, options.beforePagedQuery);
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.length ? config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS : false,
  });
  app.decorate("workmeshRuntime", { accepting: true });
  const realtimeDb = options.realtimeDb ?? db;
  const realtimeMetrics = new RealtimeMetrics();
  const realtimeCoordinator = createRealtimeCoordinator({
    db: realtimeDb,
    wakeSource:
      options.realtimeWakeSource
      ?? (process.env.NODE_ENV === "test"
        ? new NoopWakeSource()
        : new RedisStreamWakeSource(config.REDIS_URL)),
    metrics: realtimeMetrics,
    onReconcileError: error =>
      app.log.error({ err: error }, "Realtime reconciliation failed"),
    healthyReconcileMs:
      options.realtimeHealthyReconcileMs
      ?? config.REALTIME_HEALTHY_RECONCILE_MS,
    fallbackReconcileMs:
      options.realtimeFallbackReconcileMs
      ?? config.REALTIME_FALLBACK_RECONCILE_MS,
  });
  const eventReader = createEventReader(realtimeDb);
  installRoutePolicyInventory(app);
  const { limiter: authRateLimiter, store: authRateLimitStore } =
    installAuthRateLimit(app, config, options.authRateLimitStore);
  const readinessProbe = options.readinessProbe ?? (async () => {
    await db.query("SELECT 1");
    await authRateLimitStore.ping?.();
  });
  installBootstrapAuthentication(app, config);
  void app.register(cookie);
  void app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-WorkMesh-Bootstrap-Token",
      "X-CSRF-Token",
      "If-Match",
      "X-Correlation-Id",
      "Last-Event-ID",
      "X-WorkMesh-Installation-Token",
    ],
    exposedHeaders: ["ETag", "Retry-After", "RateLimit-Remaining", "RateLimit-Reset"],
  });
  app.addHook("onRequest", async (request) => {
    request.correlationId =
      validateExternalCorrelationId(header(request, "x-correlation-id"))
      ?? request.id;
    request.idempotencyKey = header(request, "idempotency-key");
  });
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.startsWith("/api/v1/provider-webhooks/")) return payload;
    const chunks: Buffer[] = [];
    let size = 0;
    payload.on("data", (chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.length;
      if (size <= 1_048_576) chunks.push(value);
    });
    payload.on("end", () => {
      if (size <= 1_048_576) request.rawBody = Buffer.concat(chunks);
    });
    return payload;
  });
  app.addHook("preHandler", async (request) => {
    if (
      request.routeOptions.url === "/api/v1/auth/install"
      && request.bootstrapAuthorization
    )
      return;
    if (
      publicPaths.has(request.routeOptions.url ?? "") ||
      request.routeOptions.url === "/health" || request.routeOptions.url === "/api/v1/agent-sessions/:id/token/exchange" || request.routeOptions.url === "/api/v1/agent-sessions/:id/token/refresh" || request.routeOptions.url === "/api/v1/provider-webhooks/:connectionId/github"
    )
      return;
    const coordinationToken = header(request, "x-workmesh-installation-token");
    const requiresCoordinationToken = request.routeOptions.url
      === "/api/v1/agent-connections/current-identity";
    if (coordinationToken || requiresCoordinationToken) {
      const candidateToken = coordinationToken ?? "";
      let identity: AgentConnectionCurrentIdentity;
      try {
        identity = await resolveCoordinationIdentity(db, candidateToken, {
          auditSecret: config.SESSION_SECRET,
        });
      } catch (error) {
        if (error instanceof CoordinationIdentityResolutionError) {
          request.log.warn({
            coordinationAuthDiagnosticId: error.diagnosticId,
            coordinationAuthReason: error.diagnosticReason,
            credentialAuditFingerprint: error.credentialAuditFingerprint,
            recognizedCredentialFingerprintPrefix:
              error.recognizedCredentialFingerprintPrefix,
            correlationId: request.correlationId,
          }, "Agent Connection authentication rejected");
        }
        throw error;
      }
      request.coordinationIdentity = identity;
      request.actor = {
        id: identity.agent_actor_id,
        workspaceId: identity.connection.workspace_id,
        displayName: identity.connection.name,
        csrfToken: "",
        workspaceRole: "member",
        kind: "agent",
        agentSessionId: identity.coordination_session.id,
        authentication: "coordination_connection",
        credentialHash: tokenHash(candidateToken),
      };
      return;
    }
    const bearer = header(request, "authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer) {
      const agent = (await db.query<{
        actor_id: string; workspace_id: string; display_name: string; session_id: string;
      }>("SELECT a.id AS actor_id,a.workspace_id,a.display_name,s.id AS session_id FROM agent_session_tokens t JOIN agent_sessions s ON s.id=t.session_id JOIN actors a ON a.id=s.agent_actor_id JOIN agent_definitions d ON d.id=s.agent_id WHERE t.token_hash=$1 AND t.expires_at>now() AND t.exchanged_at IS NOT NULL AND t.revoked_at IS NULL AND a.is_active AND d.is_active", [tokenHash(bearer)])).rows[0];
      if (!agent && (request.routeOptions.url === '/api/v1/handoffs/:id/reject' || request.routeOptions.url === '/api/v1/handoffs/:id/inspect')) {
        const installation = (await db.query<{ actor_id:string;workspace_id:string;display_name:string }>("SELECT a.id AS actor_id,a.workspace_id,a.display_name FROM agent_installation_tokens t JOIN agent_definitions d ON d.id=t.agent_id JOIN actors a ON a.id=d.actor_id WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at>now()) AND d.is_active AND a.is_active", [tokenHash(bearer)])).rows[0]
        if (installation) { request.actor = { id: installation.actor_id, workspaceId: installation.workspace_id, displayName: installation.display_name, csrfToken: '', workspaceRole: 'member', kind: 'agent', authentication: 'installation_target', credentialHash: tokenHash(bearer) }; return }
      }
      if (!agent) throw new DomainError("UNAUTHENTICATED", "Agent session token is invalid or expired");
      request.actor = { id: agent.actor_id, workspaceId: agent.workspace_id, displayName: agent.display_name, csrfToken: "", workspaceRole: "member", kind: "agent", agentSessionId: agent.session_id, authentication: "agent_session", credentialHash: tokenHash(bearer) };
      return;
    }
    const token = request.cookies[sessionCookie];
    if (!token) throw new DomainError("UNAUTHENTICATED", "Sign in is required");
    const result = await db.query<{
      id: string;
      session_id: string;
      workspace_id: string;
      display_name: string;
      csrf_token: string;
      workspace_role: "admin" | "member";
      has_membership: boolean;
    }>(
      "SELECT a.id,s.id AS session_id,a.workspace_id,a.display_name,s.csrf_token,a.workspace_role,EXISTS(SELECT 1 FROM memberships m JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=a.workspace_id AND m.actor_id=a.id AND t.deleted_at IS NULL) AS has_membership FROM sessions s JOIN actors a ON a.id=s.actor_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND a.kind='human' AND a.is_active=true",
      [tokenHash(token)],
    );
    let actor = result.rows[0];
    if (!actor && request.routeOptions.url === "/api/v1/auth/logout") {
      actor = (
        await db.query<{
          id: string;
          session_id: string;
          workspace_id: string;
          display_name: string;
          csrf_token: string;
          workspace_role: "admin" | "member";
          has_membership: boolean;
        }>(
          "SELECT a.id,s.id AS session_id,a.workspace_id,a.display_name,s.csrf_token,a.workspace_role,EXISTS(SELECT 1 FROM memberships m JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=a.workspace_id AND m.actor_id=a.id AND t.deleted_at IS NULL) AS has_membership FROM sessions s JOIN actors a ON a.id=s.actor_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NOT NULL AND a.kind='human' AND a.is_active=true",
          [tokenHash(token)],
        )
      ).rows[0];
    }
    if (!actor) throw new DomainError("UNAUTHENTICATED", "Session has expired");
    if (actor.workspace_role !== "admin" && !actor.has_membership)
      throw new DomainError(
        "FORBIDDEN",
        "An active workspace membership is required",
      );
    request.actor = {
      id: actor.id,
      workspaceId: actor.workspace_id,
      displayName: actor.display_name,
      csrfToken: actor.csrf_token,
      workspaceRole: actor.workspace_role,
      kind: "human",
      humanSessionId: actor.session_id,
      authentication: "human_session",
      credentialHash: tokenHash(token),
    };
    if (
      request.actor?.kind === "human" && mutationMethods.has(request.method) &&
      header(request, "x-csrf-token") !== actor.csrf_token
    )
      throw new DomainError("CSRF_FAILED", "Missing or invalid CSRF token");
  });
  app.addHook("preHandler", async (request) => {
    const policy = policyForRequest(request);
    // Installation-token exchange/refresh authenticate their one-time token in
    // the handler. Other installation-target routes already resolved an actor.
    if (policy.authentication !== "installation_target" || request.actor)
      { await authorizeRequest(db, request, policy); await options.afterAuthorizeRequest?.(request); }
    if (policy.idempotency === "required" && !request.idempotencyKey)
      throw new DomainError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required",
        {
          authorizationStage: "idempotency",
          policyId: policy.policyId,
        },
      );
  });
  app.addHook("preHandler", async (request) => {
    const feature = featureForApiRoute(request.routeOptions.url ?? "");
    if (!feature || features[feature]) return;
    const definition = featureDefinitions.find(candidate => candidate.key === feature)!;
    throw new DomainError(
      "FEATURE_DISABLED",
      `${feature} is disabled for this deployment`,
      { feature, tier: definition.tier },
    );
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    try {
      const value =
        typeof payload === "string"
          ? (JSON.parse(payload) as unknown)
          : (payload as unknown);
      if (
        value &&
        typeof value === "object" &&
        "revision" in value &&
        typeof (value as { revision: unknown }).revision === "number"
      )
        reply.header("ETag", etag((value as { revision: number }).revision));
    } catch {
      /* SSE payloads are not JSON responses. */
    }
    return payload;
  });
  app.setErrorHandler(async (error, request, reply) => {
    const correlationId = request.correlationId ?? request.id;
    if (error instanceof AuthRateLimitedError) {
      const retryAfter = Math.max(1, Math.ceil(error.retryAfterMs / 1_000));
      return reply.header("Retry-After", String(retryAfter)).header("RateLimit-Remaining", "0").header("RateLimit-Reset", String(retryAfter)).code(429).send(errorBody("AUTH_RATE_LIMITED", "Authentication request is temporarily rate limited", correlationId, { endpointClass: error.endpointClass, retryAfterSeconds: retryAfter }));
    }
    if (error instanceof AuthRateLimitUnavailableError)
      return reply.header("Retry-After", "1").code(503).send(errorBody("AUTH_RATE_LIMIT_UNAVAILABLE", "Authentication is temporarily unavailable", correlationId));
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send(
          errorBody(
            "VALIDATION_ERROR",
            "Invalid request",
            correlationId,
            error.flatten(),
          ),
        );
    if (error instanceof DomainError) {
      if (error.code === "REALTIME_CAPACITY_EXCEEDED")
        reply.header("Retry-After", "1");
      if (request.authRateLimitAdmission && (error.code === "INVALID_CREDENTIALS" || error.code === "UNAUTHENTICATED" || error.code === "BOOTSTRAP_AUTH_FAILED")) {
        try {
          const retryAfterMs = await authRateLimiter.credentialFailure(request.authRateLimitAdmission);
          reply.header("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
        } catch (rateError) {
          if (rateError instanceof AuthRateLimitUnavailableError)
            return reply.header("Retry-After", "1").code(503).send(errorBody("AUTH_RATE_LIMIT_UNAVAILABLE", "Authentication is temporarily unavailable", correlationId));
          throw rateError;
        }
      }
      try {
        await recordAuthorizationDenial({
          db,
          request,
          error,
          auditSecret: config.SESSION_SECRET,
        });
      } catch (auditError) {
        request.log.error(auditError, "Authorization denial audit failed");
      }
      const status =
        error.code === "REALTIME_CAPACITY_EXCEEDED"
          ? 503
          : error.code === "UNAUTHENTICATED" || error.code === "INVALID_CREDENTIALS" || error.code === "BOOTSTRAP_AUTH_FAILED"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "FEATURE_DISABLED" || error.code === "RESOURCE_SCOPE_DENIED" || error.code === "SESSION_SCOPE_DENIED" || error.code === "CAPABILITY_DENIED" || error.code === "APPROVAL_REQUIRED" || error.code === "REPOSITORY_ACCESS_DENIED" || error.code === "REPOSITORY_PATH_DENIED" || error.code === "PROVIDER_SIGNATURE_INVALID"
            ? 403
            : error.code === "NOT_FOUND" || error.code === "AGENT_CONNECTION_PAIRING_INVALID"
              ? 404
              : error.code === "AGENT_CONNECTION_PAIRING_EXPIRED"
                ? 410
                : error.code === "AGENT_CONNECTION_PAIRING_LOCKED"
                  ? 423
                  : error.code === "AGENT_CONNECTION_PRIVILEGE_ESCALATION" || error.code === "COORDINATOR_PRINCIPAL_HUMAN_INVALID"
                    ? 422
              : error.code.includes("CONFLICT") ||
                  error.code.endsWith("OUT_OF_ORDER") ||
                  error.code.startsWith("IDEMPOTENCY") ||
                  error.code === "INSTALLATION_ALREADY_COMPLETED" ||
                  error.code === "CURSOR_EXPIRED" || error.code === "AGENT_CONNECTION_REVOKED" || error.code === "AGENT_CONNECTION_PAIRING_CONSUMED" ||
                  ["SESSION_STOPPED", "SESSION_NOT_ACTIVE", "INVALID_SESSION_TRANSITION", "STOP_ACK_ALREADY_RECORDED", "PLAN_REVISION_CONFLICT", "AGENT_CONCURRENCY_LIMIT", "ACTIVE_DELEGATION_SCOPE_MISMATCH", "CHILD_SESSION_LIMIT", "PARENT_CHILDREN_INCOMPLETE", "CHILD_BUDGET_EXCEEDED", "COMPLETION_PLAN_INCOMPLETE", "REVIEW_COMPLETION_EVIDENCE_REQUIRED", "LEASE_CONFLICT", "LEASE_EXPIRED", "HANDOFF_STATE_CONFLICT", "HANDOFF_NOT_ACCEPTED", "HANDOFF_TARGET_INCOMPLETE", "HANDOFF_LEASE_POLICY_INCOMPLETE", "STALE_PLAN_VERSION", "ROUTING_TARGET_LOCKED", "ROUTING_TARGET_REQUIRED", "DELEGATION_NOT_ACTIVE", "DECISION_TRANSITION_CONFLICT", "REPOSITORY_HEAD_CHANGED", "MERGE_HEAD_CHANGED", "WORK_ITEM_BLOCK_CYCLE", "WORK_ITEM_PARENT_CYCLE", "WORK_ITEM_MILESTONE_PROJECT_MISMATCH", "WORK_ITEM_MILESTONE_DELETED", "WORK_ITEM_RELATION_ENDPOINT_DELETED", "WORK_ITEM_HAS_ACTIVE_PARENT", "WORK_ITEM_HAS_ACTIVE_CHILDREN", "WORK_ITEM_HAS_ACTIVE_RELATIONS", "MILESTONE_HAS_ACTIVE_WORK_ITEMS", "PLANNING_RELATION_ALREADY_EXISTS"].includes(error.code)
                ? 409
                : 400;
      return reply
        .code(status)
        .send(
          errorBody(error.code, error.message, correlationId, error.details),
        );
    }
    if (
      error instanceof Error &&
      error.message === "INSTALLATION_ALREADY_COMPLETED"
    )
      return reply
        .code(409)
        .send(
          errorBody(
            "INSTALLATION_ALREADY_COMPLETED",
            "Installation has already completed",
            correlationId,
          ),
        );
    if ((error as { code?: string }).code === "23505")
      return reply
        .code(409)
        .send(errorBody("CONFLICT", "A conflicting resource already exists", correlationId));
    request.log.error(error);
    return reply
      .code(500)
      .send(
        errorBody("INTERNAL_ERROR", "Unexpected server error", correlationId),
      );
  });

  const ready = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (!app.workmeshRuntime.accepting)
      return reply.code(503).send({ status: "not_ready" });
    try {
      await readinessProbe();
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  };
  app.get("/livez", async () => ({ status: "ok" }));
  app.get("/readyz", ready);
  app.get("/health", ready);
  app.get("/api/v1/info", async () => releaseInfo);
  app.get("/api/v1/features", async () => ({
    features: featureDefinitions.map(feature => ({
      key: feature.key,
      tier: feature.tier,
      enabled: features[feature.key],
    })),
  }));
  app.get("/api/v1/install-status", async () => ({
    installed:
      (
        await db.query(
          "SELECT 1 FROM platform_installation WHERE singleton=true",
        )
      ).rowCount === 1,
  }));
  app.post("/api/v1/auth/install", async (request, reply) => {
    const body = installInputSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    assertPasswordPolicy(body);
    const passwordHash = await hashPassword(body.password);
    const bootstrap = verifyBootstrapRequest(request, config);
    request.bootstrapAuthorization = bootstrap;
    const result = await authIdempotentTransaction(db, {
      idempotencyKey: request.idempotencyKey!,
      subject: `install:${bootstrap.credentialBinding}`,
      operation: "installWorkspace",
      request: { ...body, email: normalizedEmail },
      clientContext: authClientContext(request),
    }, async tx => {
      const installed = await installWorkspaceInTx(tx, {
        workspaceName: body.name,
        workspaceSlug: body.slug,
        adminName: body.adminName,
        email: normalizedEmail,
        passwordHash,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
      });
      return createHumanSessionEnvelope(tx, installed.actorId, installed.workspaceId, request.correlationId, request.idempotencyKey);
    });
    app.auditBootstrapSuccess(request, bootstrap.mode);
    return applyAuthEnvelope(reply, result);
  });
  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = loginInputSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();
    const actor = (
      await db.query<{
        id: string;
        workspace_id: string;
        password_hash: string;
      }>(
        "SELECT id,workspace_id,password_hash FROM actors WHERE email=$1 AND kind='human' AND is_active=true",
        [normalizedEmail],
      )
    ).rows[0];
    const passwordValid = await verifyPassword(actor?.password_hash ?? dummyPasswordHash, body.password);
    if (!actor || !passwordValid)
      throw new DomainError("INVALID_CREDENTIALS", "Invalid email or password");
    const result = await authIdempotentTransaction(db, {
      idempotencyKey: request.idempotencyKey!,
      subject: `login:${normalizedEmail}`,
      operation: "login",
      request: { email: normalizedEmail, password: body.password },
      clientContext: authClientContext(request),
    }, tx => createHumanSessionEnvelope(tx, actor.id, actor.workspace_id, request.correlationId, request.idempotencyKey));
    return applyAuthEnvelope(reply, result);
  });
  app.post("/api/v1/auth/logout", async (request, reply) => {
    const result = await authIdempotentTransaction(db, {
      idempotencyKey: request.idempotencyKey!,
      subject: `human-session:${request.actor!.humanSessionId!}`,
      operation: "logout",
      request: {},
      clientContext: authClientContext(request),
    }, async tx => {
      const revoked = await tx.query(
        "UPDATE sessions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id",
        [request.actor!.humanSessionId],
      );
      if (!revoked.rowCount)
        throw new DomainError("UNAUTHENTICATED", "Session has expired");
      await appendEvent(tx, {
        workspaceId: request.actor!.workspaceId,
        actorId: request.actor!.id,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        type: "auth.session.deleted",
        aggregateType: "session",
        aggregateId: request.actor!.humanSessionId!,
        audienceActorId: request.actor!.id,
        payload: {},
      });
      return { status: 200, body: { ok: true }, cookie: { action: "clear" } };
    });
    return applyAuthEnvelope(reply, result);
  });
  app.get("/api/v1/auth/me", async (request) => ({
    actor: {
      id: request.actor!.id,
      workspace_id: request.actor!.workspaceId,
      display_name: request.actor!.displayName,
      kind: "human",
      workspace_role: request.actor!.workspaceRole,
    },
    csrf_token: request.actor!.csrfToken,
    csrfToken: request.actor!.csrfToken,
  }));
  app.get("/api/v1/workspace", async (request) =>
    oneRow(
      await db.query("SELECT * FROM workspaces WHERE id=$1", [
        request.actor!.workspaceId,
      ]),
    ),
  );
  app.patch("/api/v1/workspace", async (request) => {
    const body = workspaceInputSchema.partial().parse(request.body);
    return commands.updateWorkspace(
      db,
      commandContext(request, body),
      parseRevision(header(request, "if-match")),
      body,
    );
  });

  app.get("/api/v1/teams", async (request) => {
    const current = request.actor! as unknown as ApiActor;
    const values: unknown[] = [current.workspaceId];
    let scope: string;
    if (current.kind === "agent") {
      values.push(current.agentSessionId);
      const sessionParameter = `$${values.length}`;
      const liveAuthorization = liveSessionReadPredicate(
        current,
        sessionParameter,
        "t.workspace_id",
        values,
      );
      scope = ` AND t.id=(
        SELECT scoped.team_id FROM agent_sessions scoped
        WHERE scoped.id=${sessionParameter} AND scoped.workspace_id=t.workspace_id
      ) AND ${liveAuthorization}`;
    } else {
      scope = scopedTeamPredicate(request, "t.id", values);
    }
    return paginator.query(db, request, request.query, {
      route: "/api/v1/teams",
      filters: {},
      sort: [{ key: "name", sql: "t.name", direction: "ASC" }, { key: "id", sql: "t.id", direction: "ASC" }],
    }, `SELECT t.* FROM teams t WHERE t.workspace_id=$1 AND t.deleted_at IS NULL${scope}`, values);
  });
  app.post("/api/v1/teams", async (request) => {
    const body = teamInputSchema.parse(request.body);
    return commands.createTeam(db, commandContext(request, body), body);
  });
  app.patch("/api/v1/teams/:id", async (request) => {
    const body = teamInputSchema.partial().parse(request.body);
    const id = idParam(request);
    return commands.updateTeam(
      db,
      commandContext(request, body, { id }),
      id,
      parseRevision(header(request, "if-match")),
      body,
    );
  });
  app.delete("/api/v1/teams/:id", async (request) => {
    const id = idParam(request);
    return commands.deleteTeam(
      db,
      commandContext(request, null, { id }),
      id,
      parseRevision(header(request, "if-match")),
    );
  });
  app.get("/api/v1/teams/:id/states", async (request) => {
    const id = idParam(request);
    await assertReadableTeam(request, id);
    const current = request.actor! as unknown as ApiActor;
    const values: unknown[] = [current.workspaceId, id];
    let liveAuthorization: string;
    if (current.kind === "agent") {
      values.push(current.agentSessionId);
      const sessionParameter = `$${values.length}`;
      liveAuthorization = `${liveSessionReadPredicate(
        current,
        sessionParameter,
        "state.workspace_id",
        values,
      )} AND state.team_id=(
        SELECT scoped.team_id FROM agent_sessions scoped
        WHERE scoped.id=${sessionParameter}
          AND scoped.workspace_id=state.workspace_id
      )`;
    } else {
      liveAuthorization = liveHumanTeamReadPredicate(
        current,
        "state.workspace_id",
        "state.team_id",
        values,
      );
    }
    return paginator.query(db, request, request.query, {
      route: "/api/v1/teams/:id/states",
      filters: { teamId: id },
      sort: [{ key: "position", sql: "state.position", direction: "ASC" }, { key: "id", sql: "state.id", direction: "ASC" }],
    }, `SELECT state.* FROM workflow_states state
      WHERE state.workspace_id=$1 AND state.team_id=$2
        AND state.is_archived=false AND ${liveAuthorization}`, values);
  });
  app.post("/api/v1/teams/:id/states", async (request) => {
    const body = stateInputSchema.parse(request.body);
    const id = idParam(request);
    return commands.createState(
      db,
      commandContext(request, body, { id }),
      id,
      body,
    );
  });

  app.get("/api/v1/projects", async (request) => {
    const current = request.actor! as unknown as ApiActor;
    const values: unknown[] = [current.workspaceId];
    let scope: string;
    if (current.kind === "agent") {
      values.push(current.agentSessionId);
      const sessionParameter = `$${values.length}`;
      const liveAuthorization = liveSessionReadPredicate(
        current,
        sessionParameter,
        "p.workspace_id",
        values,
      );
      const coordinationTeamScope = current.authentication === "coordination_connection"
        ? `(scoped.session_kind='coordination'
               AND scoped.coordination_connection_id IS NOT NULL)`
        : "FALSE";
      scope = ` AND EXISTS (
        SELECT 1
          FROM agent_sessions scoped
          LEFT JOIN work_items scoped_item
            ON scoped_item.id=scoped.work_item_id
           AND scoped_item.workspace_id=scoped.workspace_id
           AND scoped_item.deleted_at IS NULL
         WHERE scoped.id=${sessionParameter}
           AND scoped.workspace_id=p.workspace_id
           AND scoped.team_id=p.team_id
           AND (
             ${coordinationTeamScope}
             OR
             (
               scoped.work_item_id IS NOT NULL
               AND scoped_item.id IS NOT NULL
               AND scoped_item.project_id=p.id
             )
             OR (
               scoped.work_item_id IS NULL
               AND scoped.project_id=p.id
             )
           )
      ) AND ${liveAuthorization}`;
    } else {
      scope = scopedTeamPredicate(request, "p.team_id", values);
    }
    return paginator.query(db, request, request.query, {
      route: "/api/v1/projects",
      filters: {},
      sort: [{ key: "updated_at", sql: "p.updated_at", direction: "DESC" }, { key: "id", sql: "p.id", direction: "DESC" }],
    }, `SELECT p.* FROM projects p WHERE p.workspace_id=$1 AND p.deleted_at IS NULL${scope}`, values);
  });
  app.get("/api/v1/projects/:id", async (request) => {
    const project = oneRow(
      await db.query<{ team_id: string } & Record<string, unknown>>(
        "SELECT * FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
        [idParam(request), request.actor!.workspaceId],
      ),
    );
    await assertReadableTeam(request, project.team_id);
    return project;
  });
  app.post("/api/v1/projects", async (request) => {
    const body = projectInputSchema.parse(request.body);
    return commands.createProject(db, commandContext(request, body), body);
  });
  app.patch("/api/v1/projects/:id", async (request) => {
    const body = projectInputSchema.partial().parse(request.body) as Record<
      string,
      unknown
    >;
    const id = idParam(request);
    return commands.updateProject(
      db,
      commandContext(request, body, { id }),
      id,
      parseRevision(header(request, "if-match")),
      body,
    );
  });
  app.delete("/api/v1/projects/:id", async (request) => {
    const id = idParam(request);
    return commands.deleteProject(
      db,
      commandContext(request, null, { id }),
      id,
      parseRevision(header(request, "if-match")),
    );
  });

  app.get("/api/v1/actors/humans", async (request) => listHumans(request, paginator));
  app.get("/api/v1/work-items", async (request) => listWorkItems(request, paginator));
  app.get("/api/v1/work-items/:id", async (request) => {
    const workItem = oneRow(
      await db.query<{
        id: string;
        workspace_id: string;
        team_id: string;
        responsible_human_actor_id: string | null;
      } & Record<string, unknown>>(
        "SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category FROM work_items w JOIN teams t ON t.id=w.team_id JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1 AND w.workspace_id=$2 AND w.deleted_at IS NULL",
        [idParam(request), request.actor!.workspaceId],
      ),
    );
    await agentReadableWorkItem(request, idParam(request));
    if (request.actor!.kind === "human") await assertReadableTeam(request, workItem.team_id);
    return (await attachWorkItemExecutors(db, [workItem]))[0]!;
  });
  app.post("/api/v1/work-items", async (request) => {
    const body = workItemInputSchema.parse(request.body);
    return commands.createWorkItem(db, commandContext(request, body), body);
  });
  app.patch("/api/v1/work-items/:id", async (request) => {
    const body = workItemPatchSchema.parse(request.body) as Record<
      string,
      unknown
    >;
    const id = idParam(request);
    return commands.updateWorkItem(
      db,
      commandContext(request, body, { id }),
      id,
      parseRevision(header(request, "if-match")),
      body,
    );
  });
  app.delete("/api/v1/work-items/:id", async (request) => {
    const id = idParam(request);
    return commands.deleteWorkItem(
      db,
      commandContext(request, null, { id }),
      id,
      parseRevision(header(request, "if-match")),
    );
  });
  app.get("/api/v1/work-items/:id/comments", async (request) => {
    const id = idParam(request);
    const current = request.actor! as unknown as ApiActor;
    await agentReadableWorkItem(request, id);
    const workItem = oneRow(
      await db.query<{ team_id: string }>(
        "SELECT team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
        [id, current.workspaceId],
      ),
    );
    await assertReadableTeam(request, workItem.team_id);
    const values: unknown[] = [id, current.workspaceId];
    let liveAuthorization: string;
    if (current.kind === "agent") {
      values.push(current.agentSessionId);
      const sessionParameter = `$${values.length}`;
      liveAuthorization = `${liveSessionReadPredicate(
        current,
        sessionParameter,
        "w.workspace_id",
        values,
      )} AND w.id=(
        SELECT scoped.work_item_id FROM agent_sessions scoped
        WHERE scoped.id=${sessionParameter}
          AND scoped.workspace_id=w.workspace_id
      )`;
    } else {
      liveAuthorization = liveHumanTeamReadPredicate(
        current,
        "w.workspace_id",
        "w.team_id",
        values,
      );
    }
    return paginator.query(db, request, request.query, {
      route: "/api/v1/work-items/:id/comments",
      filters: { workItemId: id },
      sort: [{ key: "created_at", sql: "c.created_at", direction: "ASC" }, { key: "id", sql: "c.id", direction: "ASC" }],
    }, `SELECT c.*,a.display_name AS author_name,a.kind AS author_kind,
          COALESCE(
            array_agg(cm.actor_id) FILTER (WHERE cm.actor_id IS NOT NULL),
            '{}'::uuid[]
          ) AS mentions
        FROM comments c
        JOIN channels ch ON ch.id=c.channel_id
        JOIN work_items w
          ON w.id=ch.work_item_id
         AND w.workspace_id=c.workspace_id
         AND w.deleted_at IS NULL
        JOIN actors a ON a.id=c.author_actor_id
        LEFT JOIN comment_mentions cm ON cm.comment_id=c.id
        WHERE ch.work_item_id=$1 AND c.workspace_id=$2
          AND c.deleted_at IS NULL AND ${liveAuthorization}`,
      values,
      " GROUP BY c.id,a.display_name,a.kind");
  });
  app.post("/api/v1/work-items/:id/comments", async (request) => {
    const body = commentInputSchema.parse(request.body);
    const id = idParam(request);
    if ((request.actor! as unknown as ApiActor).kind !== "human") {
      throw new DomainError("RESOURCE_SCOPE_DENIED", "Work item comments are authored by Humans");
    }
    return commands.createComment(
      db,
      commandContext(request, body, { id }),
      id,
      body,
    );
  });
  app.patch("/api/v1/comments/:id", async (request) => {
    const body = commentPatchSchema.parse(request.body);
    const id = idParam(request);
    if ((request.actor! as unknown as ApiActor).kind !== "human") {
      throw new DomainError("RESOURCE_SCOPE_DENIED", "Work item comments are authored by Humans");
    }
    return commands.updateComment(
      db,
      commandContext(request, body, { id }),
      id,
      parseRevision(header(request, "if-match")),
      body,
    );
  });

  app.get("/api/v1/views", async (request) => {
    const current = request.actor! as unknown as ApiActor;
    const values: unknown[] = [current.workspaceId, current.id];
    let scope = "";
    let liveAuthorization = "";
    if (current.kind === "agent") {
      values.push(current.agentSessionId);
      const sessionParameter = `$${values.length}`;
      liveAuthorization = ` AND ${liveSessionReadPredicate(
        current,
        sessionParameter,
        "$1",
        values,
      )}`;
      scope = ` AND (
        v.team_id IS NULL OR v.team_id=(
          SELECT scoped.team_id FROM agent_sessions scoped
          WHERE scoped.id=${sessionParameter} AND scoped.workspace_id=v.workspace_id
        )
      )`;
    } else if (current.workspaceRole !== "admin") {
      values.push(current.id);
      scope = ` AND (v.team_id IS NULL OR EXISTS (SELECT 1 FROM memberships m JOIN teams mt ON mt.id=m.team_id AND mt.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.team_id=v.team_id AND m.actor_id=$${values.length} AND mt.deleted_at IS NULL))`;
    }
    const page = await paginator.query<{ item: Record<string, unknown>; id: string; name: string }>(db, request, request.query, {
      route: "/api/v1/views",
      filters: {},
      sort: [{ key: "name", sql: "visible.name", direction: "ASC" }, { key: "id", sql: "visible.id", direction: "ASC" }],
    }, `WITH visible AS (
      SELECT builtin.item,builtin.item->>'id' AS id,builtin.item->>'name' AS name
      FROM jsonb_array_elements($${values.length + 1}::jsonb) AS builtin(item)
      UNION ALL
      SELECT to_jsonb(v),v.id::text,v.name FROM saved_views v
      WHERE v.workspace_id=$1 AND v.owner_actor_id=$2${scope}
    ) SELECT visible.item,visible.id,visible.name FROM visible
      WHERE true${liveAuthorization}`, [...values, JSON.stringify([
      { id: "builtin:my-work", name: "My Work", filters: { responsible_human_actor_id: request.actor!.id }, layout: "list", built_in: true },
      { id: "builtin:active", name: "Active", filters: { status_category: "started" }, layout: "board", built_in: true },
      { id: "builtin:backlog", name: "Backlog", filters: { status_category: "backlog" }, layout: "list", built_in: true },
    ])]);
    return { items: page.items.map(row => row.item), nextCursor: page.nextCursor };
  });
  app.post("/api/v1/views", async (request) => {
    const body = savedViewInputSchema.parse(request.body);
    if (body.teamId) await assertReadableTeam(request, body.teamId);
    return createView(request, body);
  });
  registerRealtimeRoutes(app, {
    reader: eventReader,
    coordinator: realtimeCoordinator,
    webOrigin: config.WEB_ORIGIN,
    batchLimit:
      options.realtimeBatchLimit ?? config.REALTIME_BATCH_LIMIT,
    heartbeatMs:
      options.realtimeHeartbeatMs ?? config.REALTIME_HEARTBEAT_MS,
    backpressureTimeoutMs:
      options.realtimeBackpressureTimeoutMs
      ?? config.REALTIME_BACKPRESSURE_TIMEOUT_MS,
    maxClients:
      options.realtimeMaxClients ?? config.REALTIME_MAX_CLIENTS,
    onStreamError: async (request, error) => {
      if (error instanceof DomainError) {
        try {
          await recordAuthorizationDenial({
            db,
            request,
            error,
            auditSecret: config.SESSION_SECRET,
          });
        } catch (auditError) {
          request.log.error(
            auditError,
            "SSE authorization denial audit failed",
          );
        }
      }
      request.log.error(error, "SSE stream failed");
    },
  });
  app.addHook("onClose", async () => {
    await realtimeCoordinator.close();
  });
  registerAgentRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, paginator });
  registerClientProfileRoutes(app, { db, features });
  registerGuidanceRoutes(app, { db, meta: commandContext, header });
  registerCollaborationRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, paginator });
  registerInboxRoutes(app, { db, meta: commandContext, header, paginator });
  registerDeliveryRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, features, paginator });
  registerOperationsRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, features, paginator });
  registerAdminRetentionRoutes(app, db);
  registerAgentConnectionRoutes(app, {
    db,
    webOrigin: config.WEB_ORIGIN,
    publicMcpOrigin,
    meta: commandContext,
    header,
    paginator,
  });
  if (process.env.RUN_INTEGRATION === "1") {
    // Acceptance-only: drop the public schema and re-apply migrations so the
    // install flow can run against an empty database. Mounted only when the
    // operator opts in via RUN_INTEGRATION=1; the route is also pinned in
    // `publicPaths` for the same reason.
    app.post("/api/v1/test/reset-install", async () => {
      await db.query("DROP SCHEMA public CASCADE");
      await db.query("CREATE SCHEMA public");
      await applyMigrations(db);
      return { ok: true, reset: true };
    });
  }
  return app;
};

const createHumanSessionEnvelope = async (
  tx: import("pg").PoolClient,
  actorId: string,
  workspaceId: string,
  correlationId: string,
  idempotencyKey?: string,
): Promise<AuthReplayEnvelope<{ csrf_token: string; csrfToken: string }>> => {
  const token = opaqueToken();
  const csrfToken = opaqueToken();
  const session = await tx.query<{ id: string }>(
    "INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '7 days') RETURNING id",
    [actorId, tokenHash(token), csrfToken],
  );
  await appendEvent(tx, {
    workspaceId,
    actorId,
    correlationId,
    idempotencyKey,
    type: "auth.session.created",
    aggregateType: "session",
    aggregateId: session.rows[0]!.id,
    audienceActorId: actorId,
    payload: {},
  });
  return {
    status: 200,
    body: { csrf_token: csrfToken, csrfToken },
    cookie: { action: "set", value: token, csrfToken },
  };
};

const applyAuthEnvelope = <T>(
  reply: FastifyReply,
  envelope: AuthReplayEnvelope<T>,
): T => {
  if (envelope.cookie?.action === "set")
    reply.setCookie(sessionCookie, envelope.cookie.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.sessionCookieSecure,
    path: "/",
    maxAge: 604800,
  });
  else if (envelope.cookie?.action === "clear")
    reply.clearCookie(sessionCookie, { path: "/" });
  reply.code(envelope.status);
  return envelope.body;
};

async function createView(
  request: FastifyRequest,
  input: z.infer<typeof savedViewInputSchema>,
) {
  const c = commandContext(request, input);
  return mutate(db, c, async (tx) => {
    const row = oneRow(
      await tx.query<{ id: string; revision: number }>(
        "INSERT INTO saved_views(workspace_id,owner_actor_id,team_id,name,filters,layout) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,revision",
        [
          c.actor.workspaceId,
          c.actor.id,
          input.teamId ?? null,
          input.name,
          input.filters,
          input.layout,
        ],
      ),
    );
    await appendEvent(tx, {
      workspaceId: c.actor.workspaceId,
      teamId: input.teamId,
      actorId: c.actor.id,
      correlationId: c.correlationId,
      idempotencyKey: c.idempotencyKey,
      type: "saved_view.created",
      aggregateType: "saved_view",
      aggregateId: row.id,
      audienceActorId: c.actor.id,
      revision: row.revision,
      payload: input,
    });
    return row;
  });
}

async function listHumans(request: FastifyRequest, paginator: Paginator) {
  const query = request.query as { teamId?: string };
  if (request.actor!.kind === "agent") throw new DomainError("FORBIDDEN", "Human directory requires a human session");
  if (query.teamId) await assertReadableTeam(request, query.teamId);
  const values: unknown[] = [request.actor!.workspaceId];
  let sql =
    "SELECT DISTINCT a.id,a.email,a.display_name,a.kind,a.is_active,a.workspace_id FROM actors a JOIN memberships target ON target.actor_id=a.id AND target.workspace_id=a.workspace_id JOIN teams tt ON tt.id=target.team_id AND tt.workspace_id=target.workspace_id WHERE a.workspace_id=$1 AND a.kind='human' AND a.is_active=true AND tt.deleted_at IS NULL";
  if (query.teamId) {
    values.push(query.teamId);
    sql += ` AND target.team_id=$${values.length}`;
  }
  sql += ` AND ${liveHumanTeamReadPredicate(
    request.actor! as unknown as ApiActor,
    "a.workspace_id",
    "target.team_id",
    values,
  )}`;
  return paginator.query(db, request, request.query, {
    route: "/api/v1/actors/humans",
    filters: { teamId: query.teamId ?? null },
    sort: [{ key: "display_name", sql: "a.display_name", direction: "ASC" }, { key: "id", sql: "a.id", direction: "ASC" }],
  }, sql, values);
}

type HumanWorkItemSurfaceRow = Record<string, unknown> & {
  id: string;
  workspace_id: string;
  responsible_human_actor_id: string | null;
  project_name: string | null;
  blocked_by_count: number;
  blocking_count: number;
  sub_issue_count: number;
  completed_sub_issue_count: number;
};

type HumanWorkItemSurface = Omit<HumanWorkItemSurfaceRow,
  "blocked_by_count" | "blocking_count" | "sub_issue_count" | "completed_sub_issue_count"
> & Pick<HumanWorkItemSurfaceRow, "id" | "workspace_id" | "responsible_human_actor_id"> & {
  surface_summary: {
    blocked_by_count: number;
    blocking_count: number;
    sub_issue_count: number;
    completed_sub_issue_count: number;
  };
};

/**
 * The human collection carries only relationship counts, never relationship
 * targets. Agent collection reads deliberately bypass this projection so a
 * session cannot use it to infer work outside its live scope.
 */
function attachHumanWorkItemSurface(items: readonly HumanWorkItemSurfaceRow[]): HumanWorkItemSurface[] {
  return items.map((item) => {
    const {
      blocked_by_count,
      blocking_count,
      completed_sub_issue_count,
      sub_issue_count,
      ...workItem
    } = item;
    return {
      ...workItem,
      surface_summary: {
        blocked_by_count,
        blocking_count,
        completed_sub_issue_count,
        sub_issue_count,
      },
    } as HumanWorkItemSurface;
  });
}

const humanWorkItemSurfaceJoins = `
  LEFT JOIN projects project ON project.id=w.project_id
    AND project.workspace_id=w.workspace_id
    AND project.deleted_at IS NULL
  LEFT JOIN (
    SELECT target_work_item_id AS work_item_id,COUNT(*)::integer AS blocked_by_count
      FROM work_item_relations
     WHERE workspace_id=$1 AND kind='blocks' AND deleted_at IS NULL
     GROUP BY target_work_item_id
  ) blocked_by ON blocked_by.work_item_id=w.id
  LEFT JOIN (
    SELECT source_work_item_id AS work_item_id,COUNT(*)::integer AS blocking_count
      FROM work_item_relations
     WHERE workspace_id=$1 AND kind='blocks' AND deleted_at IS NULL
     GROUP BY source_work_item_id
  ) blocking ON blocking.work_item_id=w.id
  LEFT JOIN (
    SELECT child.parent_id AS work_item_id,
           COUNT(*)::integer AS sub_issue_count,
           COUNT(*) FILTER (WHERE child_state.category='completed')::integer AS completed_sub_issue_count
      FROM work_items child
      JOIN workflow_states child_state ON child_state.id=child.status_id
     WHERE child.workspace_id=$1 AND child.deleted_at IS NULL AND child.parent_id IS NOT NULL
     GROUP BY child.parent_id
  ) sub_issues ON sub_issues.work_item_id=w.id`;

const humanWorkItemSurfaceSelect = `SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category,
  project.name AS project_name,
  COALESCE(blocked_by.blocked_by_count,0)::integer AS blocked_by_count,
  COALESCE(blocking.blocking_count,0)::integer AS blocking_count,
  COALESCE(sub_issues.sub_issue_count,0)::integer AS sub_issue_count,
  COALESCE(sub_issues.completed_sub_issue_count,0)::integer AS completed_sub_issue_count`;

async function listWorkItems(request: FastifyRequest, paginator: Paginator) {
  const query = request.query as {
    teamId?: string;
    statusId?: string;
    projectId?: string;
    milestoneId?: string;
    mine?: string;
    search?: string;
    priority?: string;
    ownerId?: string;
    responsibleHumanActorId?: string;
    label?: string;
    statusCategory?: string;
  };
  if (request.actor!.kind === "agent" && (request.actor! as unknown as ApiActor).authentication !== "coordination_connection") {
    const current = request.actor! as unknown as ApiActor;
    const session = oneRow(await db.query<{ work_item_id: string | null }>("SELECT work_item_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2", [current.agentSessionId, current.workspaceId]));
    if (!session.work_item_id) throw new DomainError("RESOURCE_SCOPE_DENIED", "Agent session has no work-item read scope");
    await agentReadableWorkItem(request, session.work_item_id);
    const values: unknown[] = [
      current.workspaceId,
      session.work_item_id,
      current.agentSessionId,
    ];
    const liveAuthorization = liveSessionReadPredicate(
      current,
      "$3",
      "w.workspace_id",
      values,
    );
    const page = await paginator.query<Record<string, unknown> & { id: string; workspace_id: string; responsible_human_actor_id: string | null }>(db, request, request.query, {
      route: "/api/v1/work-items",
      filters: { agentSessionId: current.agentSessionId },
      sort: [{ key: "updated_at", sql: "w.updated_at", direction: "DESC" }, { key: "id", sql: "w.id", direction: "DESC" }],
    }, `SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category
          FROM work_items w
          JOIN teams t ON t.id=w.team_id
          JOIN workflow_states s ON s.id=w.status_id
         WHERE w.workspace_id=$1
           AND w.id=$2
           AND w.id=(
             SELECT live_target.work_item_id
               FROM agent_sessions live_target
              WHERE live_target.id=$3
                AND live_target.workspace_id=w.workspace_id
           )
           AND w.deleted_at IS NULL
           AND t.deleted_at IS NULL
           AND ${liveAuthorization}`, values);
    return { ...page, items: await attachWorkItemExecutors(db,page.items) };
  }
  if (query.teamId) await assertReadableTeam(request, query.teamId);
  const values: unknown[] = [request.actor!.workspaceId];
  let where = "WHERE w.workspace_id=$1 AND w.deleted_at IS NULL AND t.deleted_at IS NULL";
  if (request.actor!.kind === "agent") {
    const current = request.actor! as unknown as ApiActor;
    values.push(current.agentSessionId);
    const sessionParameter = `$${values.length}`;
    const coordinationAuthorization = liveSessionReadPredicate(
      current,
      sessionParameter,
      "w.workspace_id",
      values,
    );
    where += ` AND EXISTS (
      SELECT 1
        FROM agent_sessions scoped
       WHERE scoped.id=${sessionParameter}
         AND scoped.workspace_id=w.workspace_id
         AND scoped.team_id=w.team_id
         AND scoped.session_kind='coordination'
         AND scoped.coordination_connection_id IS NOT NULL
    ) AND ${coordinationAuthorization}`;
  } else {
    where += scopedTeamPredicate(request, "w.team_id", values);
  }
  for (const [key, column] of [
    ["teamId", "w.team_id"],
    ["statusId", "w.status_id"],
    ["projectId", "w.project_id"],
    ["milestoneId", "w.milestone_id"],
    ["priority", "w.priority"],
    ["statusCategory", "s.category"],
  ] as const) {
    const value = query[key];
    if (value) {
      values.push(value);
      where += ` AND ${column}=$${values.length}`;
    }
  }
  const owner =
    query.responsibleHumanActorId ??
    query.ownerId ??
    (query.mine === "true" ? request.actor!.id : undefined);
  if (owner) {
    values.push(owner);
    where += ` AND w.responsible_human_actor_id=$${values.length}`;
  }
  if (query.label) {
    values.push(query.label);
    where += ` AND $${values.length}=ANY(w.labels)`;
  }
  if (query.search) {
    values.push(query.search);
    where += ` AND (t.key || '-' || w.number::text = $${values.length} OR w.title % $${values.length} OR to_tsvector('simple',coalesce(w.title,'') || ' ' || coalesce(w.description,'')) @@ plainto_tsquery('simple',$${values.length}))`;
  }
  const binding = {
    route: "/api/v1/work-items",
    filters: {
      teamId: query.teamId ?? null,
      statusId: query.statusId ?? null,
      projectId: query.projectId ?? null,
      milestoneId: query.milestoneId ?? null,
      priority: query.priority ?? null,
      statusCategory: query.statusCategory ?? null,
      responsibleHumanActorId: owner ?? null,
      label: query.label ?? null,
      search: query.search ?? null,
    },
    sort: [{ key: "updated_at", sql: "w.updated_at", direction: "DESC" }, { key: "id", sql: "w.id", direction: "DESC" }],
  } as const;
  if (request.actor!.kind !== "human") {
    const page = await paginator.query<Record<string, unknown> & { id: string; workspace_id: string; responsible_human_actor_id: string | null }>(
      db,
      request,
      request.query,
      binding,
      `SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category
          FROM work_items w
          JOIN teams t ON t.id=w.team_id
          JOIN workflow_states s ON s.id=w.status_id
          ${where}`,
      values,
    );
    return { ...page, items: await attachWorkItemExecutors(db, page.items) };
  }
  const page = await paginator.query<HumanWorkItemSurfaceRow>(db, request, request.query, binding, `${humanWorkItemSurfaceSelect}
          FROM work_items w
          JOIN teams t ON t.id=w.team_id
          JOIN workflow_states s ON s.id=w.status_id
          ${humanWorkItemSurfaceJoins}
         ${where}`, values);
  return { ...page, items: await attachWorkItemExecutors(db, attachHumanWorkItemSurface(page.items)) };
}

if (process.env.NODE_ENV !== "test") {
  const app = buildApp();
  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    app.workmeshRuntime.accepting = false;
    const timeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30_000);
    const timeout = setTimeout(() => {
      app.log.error("API graceful shutdown deadline exceeded");
      app.server.closeAllConnections();
      process.exit(1);
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000);
    timeout.unref();
    void app.close()
      .then(() => db.end())
      .then(() => {
        clearTimeout(timeout);
        process.exit(0);
      })
      .catch((error) => {
        clearTimeout(timeout);
        app.log.error(error, "API graceful shutdown failed");
        process.exit(1);
      });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  app.listen({ port: config.API_PORT, host: config.API_HOST }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
