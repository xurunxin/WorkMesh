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
  assertPasswordPolicy,
  createDb,
  hashPassword,
  installWorkspaceInTx,
  opaqueToken,
  tokenHash,
  verifyPassword,
  withTx,
} from "@workmesh/db";
import { DomainError, etag, parseRevision } from "@workmesh/domain";
import {
  commands,
  mutate,
  type Actor,
  type CommandContext,
} from "./commands.js";
import { registerAgentRoutes } from "./agent/routes.js";
import { registerCollaborationRoutes } from "./collaboration/routes.js";
import { registerDeliveryRoutes } from "./delivery/routes.js";
import { registerOperationsRoutes } from "./operations/routes.js";
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
  assertEventAudienceActive,
  eventAudienceQuery,
} from "./authz/event-audience.js";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
    correlationId: string;
    idempotencyKey?: string;
    rawBody?: Buffer;
  }
}

const config = loadConfig();
const db = createDb();
const sessionCookie = "workmesh_session";
const dummyPasswordHash = "$argon2id$v=19$m=65536,t=3,p=4$jIrvJoYL8u7zyxBFSmb4rQ$ktNePxUds6iumXhzFBjTTBxpNThz95LuN0QCV/z1ixY";
const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
const publicPaths = new Set([
  "/api/v1/auth/install",
  "/api/v1/auth/login",
  "/api/v1/install-status",
  "/api/v1/info",
  "/health",
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
    }),
    clientContext: authClientContext(request),
  };
}

async function assertReadableTeam(
  request: FastifyRequest,
  teamId: string,
): Promise<void> {
  const team = await db.query<{ id: string }>(
    "SELECT id FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
    [teamId, request.actor!.workspaceId],
  );
  if (!team.rowCount) throw new DomainError("NOT_FOUND", "Team not found");
  if (request.actor!.workspaceRole === "admin") return;
  const membership = await db.query(
    "SELECT 1 FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3",
    [request.actor!.workspaceId, teamId, request.actor!.id],
  );
  if (!membership.rowCount)
    throw new DomainError("FORBIDDEN", "Team membership is required");
}

async function agentReadableWorkItem(request: FastifyRequest, workItemId: string): Promise<void> {
  const current = request.actor!;
  if (current.kind !== "agent") return;
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

function parseCursor(raw: unknown): number {
  if (typeof raw !== "string" && typeof raw !== "number")
    throw new DomainError(
      "VALIDATION_ERROR",
      "Cursor must be a non-negative safe integer",
    );
  const cursor = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new DomainError(
      "VALIDATION_ERROR",
      "Cursor must be a non-negative safe integer",
    );
  return cursor;
}

export const buildApp = (options: {
  features?: FeatureConfig;
  releaseInfo?: ReturnType<typeof loadReleaseInfo>;
  logger?: FastifyServerOptions["logger"];
  authRateLimitStore?: AuthRateLimitStore;
} = {}) => {
  const features = options.features ?? loadFeatureConfig();
  const releaseInfo = options.releaseInfo ?? loadReleaseInfo();
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: () => crypto.randomUUID(),
    trustProxy: config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS.length ? config.AUTH_RATE_LIMIT_TRUSTED_PROXY_CIDRS : false,
  });
  installRoutePolicyInventory(app);
  const { limiter: authRateLimiter } = installAuthRateLimit(app, config, options.authRateLimitStore);
  void app.register(cookie);
  void app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Idempotency-Key",
      "X-CSRF-Token",
      "If-Match",
      "X-Correlation-Id",
      "Last-Event-ID",
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
      publicPaths.has(request.routeOptions.url ?? "") ||
      request.routeOptions.url === "/health" || request.routeOptions.url === "/api/v1/agent-sessions/:id/token/exchange" || request.routeOptions.url === "/api/v1/agent-sessions/:id/token/refresh" || request.routeOptions.url === "/api/v1/provider-webhooks/:connectionId/github"
    )
      return;
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
      await authorizeRequest(db, request, policy);
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
      if (request.authRateLimitAdmission && (error.code === "INVALID_CREDENTIALS" || error.code === "UNAUTHENTICATED")) {
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
        error.code === "UNAUTHENTICATED" || error.code === "INVALID_CREDENTIALS"
          ? 401
          : error.code === "FORBIDDEN" || error.code === "FEATURE_DISABLED" || error.code === "RESOURCE_SCOPE_DENIED" || error.code === "SESSION_SCOPE_DENIED" || error.code === "CAPABILITY_DENIED" || error.code === "APPROVAL_REQUIRED" || error.code === "REPOSITORY_ACCESS_DENIED" || error.code === "REPOSITORY_PATH_DENIED" || error.code === "PROVIDER_SIGNATURE_INVALID"
            ? 403
            : error.code === "NOT_FOUND"
              ? 404
              : error.code.includes("CONFLICT") ||
                  error.code.endsWith("OUT_OF_ORDER") ||
                  error.code.startsWith("IDEMPOTENCY") ||
                  error.code === "INSTALLATION_ALREADY_COMPLETED" ||
                  ["SESSION_STOPPED", "SESSION_NOT_ACTIVE", "INVALID_SESSION_TRANSITION", "STOP_ACK_ALREADY_RECORDED", "PLAN_REVISION_CONFLICT", "AGENT_CONCURRENCY_LIMIT", "ACTIVE_DELEGATION_SCOPE_MISMATCH", "CHILD_SESSION_LIMIT", "PARENT_CHILDREN_INCOMPLETE", "CHILD_BUDGET_EXCEEDED", "COMPLETION_PLAN_INCOMPLETE", "REVIEW_COMPLETION_EVIDENCE_REQUIRED", "LEASE_CONFLICT", "LEASE_EXPIRED", "HANDOFF_STATE_CONFLICT", "HANDOFF_NOT_ACCEPTED", "HANDOFF_TARGET_INCOMPLETE", "HANDOFF_LEASE_POLICY_INCOMPLETE", "STALE_PLAN_VERSION", "ROUTING_TARGET_LOCKED", "ROUTING_TARGET_REQUIRED", "DELEGATION_NOT_ACTIVE", "DECISION_TRANSITION_CONFLICT", "REPOSITORY_HEAD_CHANGED", "MERGE_HEAD_CHANGED"].includes(error.code)
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

  app.get("/health", async () => {
    await db.query("SELECT 1");
    return { status: "ok" };
  });
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
    const result = await authIdempotentTransaction(db, {
      idempotencyKey: request.idempotencyKey!,
      subject: "install:singleton",
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
    const values: unknown[] = [request.actor!.workspaceId];
    const scope = scopedTeamPredicate(request, "t.id", values);
    return (
      await db.query(
        `SELECT t.* FROM teams t WHERE t.workspace_id=$1 AND t.deleted_at IS NULL${scope} ORDER BY t.name`,
        values,
      )
    ).rows;
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
    return (
      await db.query(
        "SELECT * FROM workflow_states WHERE workspace_id=$1 AND team_id=$2 AND is_archived=false ORDER BY position",
        [request.actor!.workspaceId, id],
      )
    ).rows;
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
    const values: unknown[] = [request.actor!.workspaceId];
    const scope = scopedTeamPredicate(request, "p.team_id", values);
    return (
      await db.query(
        `SELECT p.* FROM projects p WHERE p.workspace_id=$1 AND p.deleted_at IS NULL${scope} ORDER BY p.updated_at DESC`,
        values,
      )
    ).rows;
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

  app.get("/api/v1/actors/humans", async (request) => listHumans(request));
  app.get("/api/v1/work-items", async (request) => listWorkItems(request));
  app.get("/api/v1/work-items/:id", async (request) => {
    const workItem = oneRow(
      await db.query<{ team_id: string } & Record<string, unknown>>(
        "SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category FROM work_items w JOIN teams t ON t.id=w.team_id JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1 AND w.workspace_id=$2 AND w.deleted_at IS NULL",
        [idParam(request), request.actor!.workspaceId],
      ),
    );
    await agentReadableWorkItem(request, idParam(request));
    if (request.actor!.kind === "human") await assertReadableTeam(request, workItem.team_id);
    return workItem;
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
    const workItem = oneRow(
      await db.query<{ team_id: string }>(
        "SELECT team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL",
        [id, request.actor!.workspaceId],
      ),
    );
    await assertReadableTeam(request, workItem.team_id);
    return (
      await db.query(
        "SELECT c.*,a.display_name AS author_name,COALESCE(array_agg(cm.actor_id) FILTER (WHERE cm.actor_id IS NOT NULL),'{}'::uuid[]) AS mentions FROM comments c JOIN channels ch ON ch.id=c.channel_id JOIN actors a ON a.id=c.author_actor_id LEFT JOIN comment_mentions cm ON cm.comment_id=c.id WHERE ch.work_item_id=$1 AND c.workspace_id=$2 AND c.deleted_at IS NULL GROUP BY c.id,a.display_name ORDER BY min(c.created_at)",
        [id, request.actor!.workspaceId],
      )
    ).rows;
  });
  app.post("/api/v1/work-items/:id/comments", async (request) => {
    const body = commentInputSchema.parse(request.body);
    const id = idParam(request);
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
    return commands.updateComment(
      db,
      commandContext(request, body, { id }),
      id,
      parseRevision(header(request, "if-match")),
      body,
    );
  });

  app.get("/api/v1/views", async (request) => {
    const values: unknown[] = [request.actor!.workspaceId, request.actor!.id];
    let scope = "";
    if (request.actor!.workspaceRole !== "admin") {
      values.push(request.actor!.id);
      scope = ` AND (v.team_id IS NULL OR EXISTS (SELECT 1 FROM memberships m JOIN teams mt ON mt.id=m.team_id AND mt.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.team_id=v.team_id AND m.actor_id=$${values.length} AND mt.deleted_at IS NULL))`;
    }
    const stored = (
      await db.query(
        `SELECT * FROM saved_views v WHERE v.workspace_id=$1 AND v.owner_actor_id=$2${scope} ORDER BY v.name`,
        values,
      )
    ).rows;
    return [
      {
        id: "builtin:my-work",
        name: "My Work",
        filters: { responsible_human_actor_id: request.actor!.id },
        layout: "list",
        built_in: true,
      },
      {
        id: "builtin:active",
        name: "Active",
        filters: { status_category: "started" },
        layout: "board",
        built_in: true,
      },
      {
        id: "builtin:backlog",
        name: "Backlog",
        filters: { status_category: "backlog" },
        layout: "list",
        built_in: true,
      },
      ...stored,
    ];
  });
  app.post("/api/v1/views", async (request) => {
    const body = savedViewInputSchema.parse(request.body);
    if (body.teamId) await assertReadableTeam(request, body.teamId);
    return createView(request, body);
  });
  app.get("/api/v1/events", async (request) => eventList(request));
  app.get("/api/v1/events/stream", async (request, reply) =>
    sse(request, reply),
  );
  registerAgentRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam });
  registerCollaborationRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam });
  registerDeliveryRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, features });
  registerOperationsRoutes(app, { db, meta: commandContext, header, readableTeam: assertReadableTeam, features });
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
      revision: row.revision,
      payload: input,
    });
    return row;
  });
}

async function listHumans(request: FastifyRequest) {
  const query = request.query as { teamId?: string };
  if (request.actor!.kind === "agent") throw new DomainError("FORBIDDEN", "Human directory requires a human session");
  if (query.teamId) await assertReadableTeam(request, query.teamId);
  const values: unknown[] = [request.actor!.workspaceId];
  let sql =
    "SELECT DISTINCT a.id,a.email,a.display_name,a.kind,a.is_active,a.workspace_id FROM actors a JOIN memberships target ON target.actor_id=a.id AND target.workspace_id=a.workspace_id JOIN teams tt ON tt.id=target.team_id AND tt.workspace_id=target.workspace_id WHERE a.workspace_id=$1 AND a.kind='human' AND a.is_active=true AND tt.deleted_at IS NULL";
  if (query.teamId) {
    values.push(query.teamId);
    sql += ` AND target.team_id=$${values.length}`;
  } else if (request.actor!.workspaceRole !== "admin") {
    values.push(request.actor!.id);
    sql += ` AND EXISTS (SELECT 1 FROM memberships accessible JOIN teams at ON at.id=accessible.team_id AND at.workspace_id=accessible.workspace_id WHERE accessible.workspace_id=a.workspace_id AND accessible.actor_id=$${values.length} AND accessible.team_id=target.team_id AND at.deleted_at IS NULL)`;
  }
  return (await db.query(sql + " ORDER BY a.display_name", values)).rows;
}

async function listWorkItems(request: FastifyRequest) {
  const query = request.query as {
    teamId?: string;
    statusId?: string;
    projectId?: string;
    mine?: string;
    search?: string;
    priority?: string;
    ownerId?: string;
    responsibleHumanActorId?: string;
    label?: string;
    statusCategory?: string;
  };
  if (request.actor!.kind === "agent") {
    const session = oneRow(await db.query<{ work_item_id: string | null }>("SELECT work_item_id FROM agent_sessions WHERE id=$1 AND workspace_id=$2", [request.actor!.agentSessionId, request.actor!.workspaceId]));
    if (!session.work_item_id) throw new DomainError("RESOURCE_SCOPE_DENIED", "Agent session has no work-item read scope");
    await agentReadableWorkItem(request, session.work_item_id);
    return (await db.query("SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category FROM work_items w JOIN teams t ON t.id=w.team_id JOIN workflow_states s ON s.id=w.status_id WHERE w.workspace_id=$1 AND w.id=$2 AND w.deleted_at IS NULL AND t.deleted_at IS NULL", [request.actor!.workspaceId, session.work_item_id])).rows;
  }
  if (query.teamId) await assertReadableTeam(request, query.teamId);
  const values: unknown[] = [request.actor!.workspaceId];
  let sql =
    "SELECT w.*,t.key AS team_key,s.name AS status_name,s.category AS status_category FROM work_items w JOIN teams t ON t.id=w.team_id JOIN workflow_states s ON s.id=w.status_id WHERE w.workspace_id=$1 AND w.deleted_at IS NULL AND t.deleted_at IS NULL";
  sql += scopedTeamPredicate(request, "w.team_id", values);
  for (const [key, column] of [
    ["teamId", "w.team_id"],
    ["statusId", "w.status_id"],
    ["projectId", "w.project_id"],
    ["priority", "w.priority"],
    ["statusCategory", "s.category"],
  ] as const) {
    const value = query[key];
    if (value) {
      values.push(value);
      sql += ` AND ${column}=$${values.length}`;
    }
  }
  const owner =
    query.responsibleHumanActorId ??
    query.ownerId ??
    (query.mine === "true" ? request.actor!.id : undefined);
  if (owner) {
    values.push(owner);
    sql += ` AND w.responsible_human_actor_id=$${values.length}`;
  }
  if (query.label) {
    values.push(query.label);
    sql += ` AND $${values.length}=ANY(w.labels)`;
  }
  if (query.search) {
    values.push(query.search);
    sql += ` AND (t.key || '-' || w.number::text = $${values.length} OR w.title % $${values.length} OR to_tsvector('simple',coalesce(w.title,'') || ' ' || coalesce(w.description,'')) @@ plainto_tsquery('simple',$${values.length}))`;
  }
  return (await db.query(sql + " ORDER BY w.updated_at DESC", values)).rows;
}

function eventSql(
  request: FastifyRequest,
  cursor: number,
): { sql: string; values: unknown[] } {
  const query = eventAudienceQuery(request.actor!, cursor);
  return { sql: query.sql, values: [...query.values] };
}

const eventResponse = (row: Record<string, unknown>) => ({
  ...row,
  cursor: Number(row.cursor),
  sequence: row.sequence === null || row.sequence === undefined ? row.sequence : Number(row.sequence),
  sessionSequence: row.sessionSequence === null || row.sessionSequence === undefined ? row.sessionSequence : Number(row.sessionSequence),
  occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
});
async function eventList(request: FastifyRequest) {
  const cursor = parseCursor(
    (request.query as { cursor?: string }).cursor ?? 0,
  );
  const query = eventSql(request, cursor);
  return (
    await db.query(query.sql + " ORDER BY e.cursor LIMIT 500", query.values)
  ).rows.map((row) => eventResponse(row as Record<string, unknown>));
}

async function sse(request: FastifyRequest, reply: FastifyReply) {
  let cursor = parseCursor(
    (request.query as { cursor?: string }).cursor ??
      header(request, "last-event-id") ??
      0,
  );
  let closed = false;
  const stop = () => {
    closed = true;
  };
  request.raw.once("close", stop);
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": config.WEB_ORIGIN,
    "access-control-allow-credentials": "true",
  });
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 750));
  const send = async () => {
    if (closed) return;
    await assertEventAudienceActive(db, request.actor!);
    const query = eventSql(request, cursor);
    const rows = (
      await db.query(query.sql + " ORDER BY e.cursor LIMIT 500", query.values)
    ).rows;
    for (const row of rows) {
      if (closed) return;
      const event = eventResponse(row as Record<string, unknown>);
      reply.raw.write(
        `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`,
      );
      cursor = event.cursor as number;
    }
  };
  void (async () => {
    try {
      while (!closed) {
        await send();
        if (closed) break;
        reply.raw.write(": heartbeat\n\n");
        await wait();
      }
    } catch (error) {
      if (error instanceof DomainError) {
        try {
          await recordAuthorizationDenial({
            db,
            request,
            error,
            auditSecret: config.SESSION_SECRET,
          });
        } catch (auditError) {
          request.log.error(auditError, "SSE authorization denial audit failed");
        }
      }
      request.log.error(error, "SSE stream failed");
      if (!closed) {
        closed = true;
        reply.raw.end();
      }
    }
  })();
  return reply;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildApp();
  app.listen({ port: config.API_PORT, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
}
