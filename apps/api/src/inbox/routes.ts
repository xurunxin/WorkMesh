import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  inboxAcknowledgeInputSchema,
  inboxClaimInputSchema,
  inboxReplyInputSchema,
} from "@workmesh/contracts";
import { appendEvent, withTx } from "@workmesh/db";
import { DomainError, assertRevision, parseRevision } from "@workmesh/domain";
import {
  assertCurrentAgentCredentialInTx,
  authorizeCommandInTx,
} from "../agent/guard.js";
import { queueWebhookDeliveries } from "../agent/commands.js";
import type { ApiActor, RequestMeta } from "../agent/types.js";
import { mutate, type CommandContext } from "../commands.js";
import {
  liveHumanTeamReadPredicate,
  liveSessionReadPredicate,
} from "../live-read-authorization.js";
import type { Paginator } from "../pagination.js";

type Helpers = {
  db: Pool;
  meta: (
    request: FastifyRequest,
    body: unknown,
    params?: Record<string, unknown>,
  ) => RequestMeta;
  header: (request: FastifyRequest, name: string) => string | undefined;
  paginator: Paginator;
};

type InboxItem = {
  id: string;
  workspace_id: string;
  recipient_actor_id: string;
  recipient_human_actor_id: string | null;
  recipient_session_id: string | null;
  claimed_by_session_id: string | null;
  claimed_at: Date | null;
  team_id: string;
  session_id: string | null;
  kind: "ask" | "review_request" | "blocker" | "handoff" | "mention" | string;
  source_type: string;
  source_id: string;
  source_room_message_id: string | null;
  requires_response: boolean;
  status: "open" | "resolved";
  revision: number;
  payload: Record<string, unknown>;
  channel_id: string | null;
  source_message_body: string | null;
  source_message_intent: string | null;
  source_author_actor_id: string | null;
  source_author_session_id: string | null;
  source_thread_id: string | null;
  source_subject_kind: "work_item" | "project" | "session" | null;
  source_subject_id: string | null;
};

const uuid = z.string().uuid();
const currentActor = (request: FastifyRequest): ApiActor =>
  request.actor as unknown as ApiActor;
const itemId = (request: FastifyRequest): string =>
  uuid.parse((request.params as { id?: unknown }).id);
const command = <T>(
  db: Pool,
  meta: RequestMeta,
  fn: (tx: PoolClient) => Promise<T>,
  beforeReserve?: (tx: PoolClient) => Promise<void>,
): Promise<T> =>
  mutate(db, meta as unknown as CommandContext, fn, { beforeReserve });

const activeScopeSql = `
  i.team_id=current_scope.team_id
  AND (
    i.source_room_message_id IS NULL
    OR EXISTS (
      SELECT 1
        FROM room_messages source_message
        JOIN work_room_channels source_channel
          ON source_channel.id=source_message.channel_id
         AND source_channel.workspace_id=source_message.workspace_id
       WHERE source_message.id=i.source_room_message_id
         AND source_message.workspace_id=i.workspace_id
         AND (
           (
             source_channel.subject_kind='work_item'
             AND source_channel.subject_id=current_scope.work_item_id
           )
           OR (
             source_channel.subject_kind='project'
             AND EXISTS (
               SELECT 1 FROM projects source_project
                WHERE source_project.id=source_channel.subject_id
                  AND source_project.workspace_id=i.workspace_id
                  AND source_project.deleted_at IS NULL
             )
             AND (
               (
                 current_scope.work_item_id IS NOT NULL
                 AND EXISTS (
                   SELECT 1 FROM work_items scoped_work_item
                    WHERE scoped_work_item.id=current_scope.work_item_id
                      AND scoped_work_item.project_id=source_channel.subject_id
                      AND scoped_work_item.workspace_id=i.workspace_id
                      AND scoped_work_item.deleted_at IS NULL
                 )
               )
               OR (
                 current_scope.work_item_id IS NULL
                 AND source_channel.subject_id=current_scope.project_id
               )
             )
            )
            OR (
              source_channel.subject_kind='session'
              AND EXISTS (
                WITH RECURSIVE lineage(id) AS (
                  SELECT source_channel.subject_id
                  UNION ALL
                  SELECT child.id
                    FROM agent_sessions child
                    JOIN lineage parent ON child.parent_session_id=parent.id
                   WHERE child.workspace_id=i.workspace_id
                )
                SELECT 1 FROM lineage WHERE id=current_scope.id
              )
            )
          )
    )
  )`;

const itemDetailSql = `
  SELECT i.*,
         source_message.channel_id,
         source_message.body AS source_message_body,
         source_message.intent::text AS source_message_intent,
         source_message.author_actor_id AS source_author_actor_id,
         source_message.session_id AS source_author_session_id,
         source_message.thread_id AS source_thread_id,
         source_channel.subject_kind::text AS source_subject_kind,
         source_channel.subject_id AS source_subject_id
    FROM inbox_items i
    JOIN agent_sessions current_scope
      ON current_scope.id=$3
     AND current_scope.workspace_id=i.workspace_id
     AND current_scope.agent_actor_id=$4
    LEFT JOIN room_messages source_message
      ON source_message.id=i.source_room_message_id
     AND source_message.workspace_id=i.workspace_id
    LEFT JOIN work_room_channels source_channel
      ON source_channel.id=source_message.channel_id
     AND source_channel.workspace_id=source_message.workspace_id
   WHERE i.id=$1
     AND i.workspace_id=$2
     AND i.recipient_human_actor_id IS NULL
     AND (
       i.recipient_session_id=current_scope.id
       OR i.claimed_by_session_id=current_scope.id
     )
     AND ${activeScopeSql}`;

async function loadAgentItemForUpdate(
  tx: PoolClient,
  request: FastifyRequest,
  capability: "work:read" | "work:write",
  operation: "inbox_claim" | "inbox_ack" | "inbox_reply",
): Promise<InboxItem> {
  const actor = currentActor(request);
  if (actor.kind !== "agent" || !actor.agentSessionId)
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  const idempotencyKey = request.idempotencyKey;
  if (!idempotencyKey)
    throw new DomainError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key is required",
    );
  await authorizeCommandInTx(tx, {
    actor,
    sessionId: actor.agentSessionId,
    capability,
    operation,
    idempotencyKey,
  });
  await assertCurrentAgentCredentialInTx(tx, actor, actor.agentSessionId);
  const row = (
    await tx.query<InboxItem>(`${itemDetailSql} FOR UPDATE OF i`, [
      itemId(request),
      actor.workspaceId,
      actor.agentSessionId,
      actor.id,
    ])
  ).rows[0];
  if (!row) throw new DomainError("NOT_FOUND", "Inbox item not found");
  return row;
}

async function lockReplyParticipantsBeforeReservation(
  tx: PoolClient,
  request: FastifyRequest,
): Promise<void> {
  const actor = currentActor(request);
  if (actor.kind !== "agent" || !actor.agentSessionId)
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  const participants = (
    await tx.query<{ source_session_id: string | null }>(
      `SELECT source_message.session_id AS source_session_id
           FROM inbox_items i
           JOIN agent_sessions current_scope
             ON current_scope.id=$3
            AND current_scope.workspace_id=i.workspace_id
            AND current_scope.agent_actor_id=$4
           LEFT JOIN room_messages source_message
             ON source_message.id=i.source_room_message_id
            AND source_message.workspace_id=i.workspace_id
          WHERE i.id=$1
            AND i.workspace_id=$2
            AND i.recipient_human_actor_id IS NULL
            AND (
              i.recipient_session_id=current_scope.id
              OR i.claimed_by_session_id=current_scope.id
            )
            AND ${activeScopeSql}`,
      [itemId(request), actor.workspaceId, actor.agentSessionId, actor.id],
    )
  ).rows[0];
  if (!participants)
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  const lockKeys = [actor.agentSessionId, participants.source_session_id]
    .filter((value): value is string => Boolean(value))
    .map(
      (sessionId) => `${actor.workspaceId}:inbox-reply-session:${sessionId}`,
    )
    .sort();
  for (const lockKey of [...new Set(lockKeys)])
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      lockKey,
    ]);
}

async function appendInboxEvent(
  tx: PoolClient,
  meta: RequestMeta,
  item: InboxItem,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await appendEvent(tx, {
    workspaceId: meta.actor.workspaceId,
    teamId: item.team_id,
    audienceActorId: item.recipient_actor_id,
    actorId: meta.actor.id,
    correlationId: meta.correlationId,
    idempotencyKey: meta.idempotencyKey,
    type,
    aggregateType: "inbox_item",
    aggregateId: item.id,
    revision: item.revision,
    sessionId: meta.actor.agentSessionId,
    payload: {
      ...payload,
      sessionId: meta.actor.agentSessionId,
      roomId: item.channel_id,
    },
  });
}

async function authorizeExactReplyRecipient(
  tx: PoolClient,
  item: InboxItem,
): Promise<string | undefined> {
  if (!item.source_author_actor_id) return undefined;
  const sourceActor = (
    await tx.query<{ kind: "human" | "agent" | "service" }>(
      `SELECT kind
         FROM actors
        WHERE workspace_id=$1
          AND id=$2
          AND is_active
        FOR UPDATE`,
      [item.workspace_id, item.source_author_actor_id],
    )
  ).rows[0];
  if (!sourceActor)
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  if (sourceActor.kind === "human") {
    const authorizedHuman = await tx.query(
      `SELECT 1
         FROM actors source_actor
        WHERE source_actor.workspace_id=$1
          AND source_actor.id=$2
          AND source_actor.kind='human'
          AND source_actor.is_active
          AND (
            source_actor.workspace_role='admin'
            OR EXISTS (
              SELECT 1
                FROM memberships membership
               WHERE membership.workspace_id=source_actor.workspace_id
                 AND membership.team_id=$3
                 AND membership.actor_id=source_actor.id
            )
          )
        FOR UPDATE OF source_actor`,
      [item.workspace_id, item.source_author_actor_id, item.team_id],
    );
    if (!authorizedHuman.rowCount)
      throw new DomainError("NOT_FOUND", "Inbox item not found");
    return undefined;
  }
  if (
    sourceActor.kind !== "agent" ||
    !item.source_author_session_id ||
    !item.source_subject_kind ||
    !item.source_subject_id
  )
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  const recipient = (await tx.query<{ agent_id: string }>(
     `SELECT source_session.agent_id
       FROM actors source_actor
       JOIN agent_definitions definition
         ON definition.workspace_id=source_actor.workspace_id
        AND definition.actor_id=source_actor.id
       JOIN agent_team_access team_access
         ON team_access.workspace_id=definition.workspace_id
        AND team_access.agent_id=definition.id
        AND team_access.team_id=$4
        AND team_access.revoked_at IS NULL
       JOIN agent_sessions source_session
         ON source_session.workspace_id=definition.workspace_id
        AND source_session.agent_id=definition.id
        AND source_session.id=$2
        AND source_session.agent_actor_id=$3
       LEFT JOIN work_items source_work_item
         ON source_work_item.id=source_session.work_item_id
        AND source_work_item.workspace_id=source_session.workspace_id
        AND source_work_item.deleted_at IS NULL
       LEFT JOIN projects source_work_item_project
         ON source_work_item_project.id=source_work_item.project_id
        AND source_work_item_project.workspace_id=source_session.workspace_id
        AND source_work_item_project.deleted_at IS NULL
       LEFT JOIN projects source_session_project
         ON source_session_project.id=source_session.project_id
        AND source_session_project.workspace_id=source_session.workspace_id
        AND source_session_project.deleted_at IS NULL
       JOIN delegations delegation
         ON delegation.id=source_session.delegation_id
        AND delegation.workspace_id=source_session.workspace_id
        AND delegation.status='active'
      WHERE source_actor.workspace_id=$1
        AND source_actor.id=$3
        AND source_actor.kind='agent'
        AND source_actor.is_active
        AND definition.is_active
        AND source_session.team_id=$4
        AND source_session.state IN(
          'acknowledged','planning','executing',
          'awaiting_input','awaiting_approval','blocked'
        )
        AND 'work:read'=ANY(definition.approved_capabilities)
        AND 'work:read'=ANY(team_access.approved_capabilities)
        AND 'work:read'=ANY(delegation.permissions_snapshot)
        AND COALESCE(delegation.capability_scope->'teamIds','[]'::jsonb)
            ? source_session.team_id::text
        AND (
          (
            source_session.work_item_id IS NOT NULL
            AND source_work_item.id IS NOT NULL
            AND COALESCE(
              delegation.capability_scope->'workItemIds',
              '[]'::jsonb
            ) ? source_session.work_item_id::text
          )
          OR (
            source_session.work_item_id IS NULL
            AND (
              source_session.project_id IS NULL
              OR (
                source_session_project.id IS NOT NULL
                AND COALESCE(
                  delegation.capability_scope->'projectIds',
                  '[]'::jsonb
                ) ? source_session.project_id::text
              )
            )
          )
        )
        AND (
          (
            $5='work_item'
            AND source_session.work_item_id=$6
            AND COALESCE(delegation.capability_scope->'workItemIds','[]'::jsonb)
                ? source_session.work_item_id::text
          )
          OR (
            $5='project'
            AND EXISTS (
              SELECT 1 FROM projects source_room_project
               WHERE source_room_project.id=$6
                 AND source_room_project.workspace_id=$1
                 AND source_room_project.deleted_at IS NULL
            )
            AND (
              (
                source_session.work_item_id IS NOT NULL
                AND source_work_item_project.id=$6
              )
              OR (
                source_session.work_item_id IS NULL
                AND source_session_project.id=$6
                AND COALESCE(
                  delegation.capability_scope->'projectIds',
                  '[]'::jsonb
                ) ? $6::text
              )
            )
          )
          OR (
            $5='session'
            AND EXISTS (
              WITH RECURSIVE lineage(id) AS (
                SELECT $6::uuid
                UNION ALL
                SELECT child.id
                  FROM agent_sessions child
                  JOIN lineage parent ON child.parent_session_id=parent.id
                 WHERE child.workspace_id=$1
              )
              SELECT 1 FROM lineage WHERE id=source_session.id
            )
          )
        )
      FOR UPDATE OF source_actor,definition,team_access,delegation,source_session`,
    [
      item.workspace_id,
      item.source_author_session_id,
      item.source_author_actor_id,
      item.team_id,
      item.source_subject_kind,
      item.source_subject_id,
    ],
  )).rows[0];
  if (!recipient)
    throw new DomainError("NOT_FOUND", "Inbox item not found");
  return recipient.agent_id;
}

async function insertReceipt(
  tx: PoolClient,
  meta: RequestMeta,
  inboxItemId: string,
  kind: "claimed" | "read" | "acknowledged" | "replied",
  replyMessageId?: string,
): Promise<boolean> {
  const result = await tx.query(
    `INSERT INTO inbox_item_receipts(
       inbox_item_id,workspace_id,actor_id,session_id,kind,reply_message_id,
       correlation_id,idempotency_key
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT DO NOTHING`,
    [
      inboxItemId,
      meta.actor.workspaceId,
      meta.actor.id,
      meta.actor.agentSessionId,
      kind,
      replyMessageId ?? null,
      meta.correlationId,
      meta.idempotencyKey,
    ],
  );
  return Boolean(result.rowCount);
}

async function detailWithReceipts(
  tx: Pick<PoolClient, "query">,
  item: InboxItem,
): Promise<Record<string, unknown>> {
  const receipts = await tx.query(
    `SELECT id,actor_id,session_id,kind,reply_message_id,created_at
       FROM inbox_item_receipts
      WHERE inbox_item_id=$1
      ORDER BY created_at,id`,
    [item.id],
  );
  return { ...item, receipts: receipts.rows, detailAvailable: true };
}

function listAgentInbox(
  request: FastifyRequest,
  h: Helpers,
  actor: ApiActor,
  status: "open" | "resolved",
) {
  if (!actor.agentSessionId)
    throw new DomainError("NOT_FOUND", "Inbox is not available");
  const values: unknown[] = [
    actor.workspaceId,
    status,
    actor.id,
    actor.agentSessionId,
  ];
  const where = [
    "i.workspace_id=$1",
    "i.status=$2",
    "i.recipient_human_actor_id IS NULL",
    `CASE
      WHEN i.recipient_session_id IS NOT NULL
        THEN i.recipient_session_id=$4
      WHEN i.claimed_by_session_id IS NOT NULL
        THEN i.claimed_by_session_id=$4
      ELSE i.recipient_actor_id=$3
    END`,
    activeScopeSql,
    liveSessionReadPredicate(actor, "$4", "i.workspace_id", values),
  ];
  return h.paginator.query(
    h.db,
    request,
    request.query,
    {
      route: "/api/v1/inbox",
      filters: { status, currentSessionId: actor.agentSessionId },
      sort: [
        { key: "created_at", sql: "i.created_at", direction: "DESC" },
        { key: "id", sql: "i.id", direction: "DESC" },
      ],
    },
    `SELECT i.id,i.kind,i.source_type,i.source_id,i.status,i.requires_response,
            i.recipient_session_id,i.claimed_by_session_id,i.claimed_at,
            i.revision,i.created_at,i.updated_at,
            CASE
              WHEN CASE
                WHEN i.recipient_session_id IS NOT NULL
                  THEN i.recipient_session_id=$4
                WHEN i.claimed_by_session_id IS NOT NULL
                  THEN i.claimed_by_session_id=$4
                ELSE false
              END THEN i.payload
              ELSE jsonb_build_object(
                'intent',i.payload->'intent',
                'channelId',i.payload->'channelId'
              )
            END AS payload,
            CASE
              WHEN i.recipient_session_id IS NOT NULL
                THEN i.recipient_session_id=$4
              WHEN i.claimed_by_session_id IS NOT NULL
                THEN i.claimed_by_session_id=$4
              ELSE false
            END AS detail_available
       FROM inbox_items i
       JOIN agent_sessions current_scope
          ON current_scope.id=$4
         AND current_scope.workspace_id=i.workspace_id
         AND current_scope.agent_actor_id=$3
      WHERE ${where.join(" AND ")}`,
    values,
  );
}

export function registerInboxRoutes(app: FastifyInstance, h: Helpers): void {
  app.get("/api/v1/inbox", async (request) => {
    const actor = currentActor(request);
    const query = z
      .object({
        status: z.enum(["open", "resolved"]).default("open"),
      })
      .parse(request.query);
    if (actor.kind === "human") {
      const values: unknown[] = [actor.workspaceId, actor.id, query.status];
      const liveAuthorization = liveHumanTeamReadPredicate(
        actor,
        "i.workspace_id",
        "i.team_id",
        values,
      );
      return h.paginator.query(
        h.db,
        request,
        request.query,
        {
          route: "/api/v1/inbox",
          filters: { status: query.status },
          sort: [
            { key: "created_at", sql: "created_at", direction: "DESC" },
            { key: "id", sql: "id", direction: "DESC" },
          ],
        },
        `SELECT i.* FROM inbox_items i
          WHERE i.workspace_id=$1
            AND i.recipient_human_actor_id=$2
            AND i.status=$3
            AND ${liveAuthorization}`,
        values,
      );
    }

    return listAgentInbox(request, h, actor, query.status);
  });

  app.get("/api/v1/inbox/:id", async (request) => {
    const actor = currentActor(request);
    if (actor.kind === "human") {
      const values: unknown[] = [
        itemId(request),
        actor.workspaceId,
        actor.id,
      ];
      const liveAuthorization = liveHumanTeamReadPredicate(
        actor,
        "i.workspace_id",
        "i.team_id",
        values,
      );
      const row = (
        await h.db.query(
          `SELECT i.* FROM inbox_items i
          WHERE i.id=$1
            AND i.workspace_id=$2
            AND i.recipient_human_actor_id=$3
            AND ${liveAuthorization}`,
          values,
        )
      ).rows[0];
      if (!row) throw new DomainError("NOT_FOUND", "Inbox item not found");
      return row;
    }
    if (!actor.agentSessionId)
      throw new DomainError("NOT_FOUND", "Inbox item not found");
    const values: unknown[] = [
      itemId(request),
      actor.workspaceId,
      actor.agentSessionId,
      actor.id,
    ];
    const liveAuthorization = liveSessionReadPredicate(
      actor,
      "$3",
      "i.workspace_id",
      values,
    );
    const item = (
      await h.db.query<InboxItem>(
        `${itemDetailSql} AND ${liveAuthorization}`,
        values,
      )
    ).rows[0];
    if (!item) throw new DomainError("NOT_FOUND", "Inbox item not found");
    return detailWithReceipts(h.db, item);
  });

  app.post("/api/v1/inbox/:id/claim", async (request) => {
    const body = inboxClaimInputSchema.parse(request.body ?? {});
    const actor = currentActor(request);
    if (actor.kind !== "agent" || !actor.agentSessionId)
      throw new DomainError("NOT_FOUND", "Inbox item not found");
    const idempotencyKey = request.idempotencyKey;
    if (!idempotencyKey)
      throw new DomainError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key is required",
      );
    return command(
      h.db,
      h.meta(request, body, { id: itemId(request) }),
      async (tx) => {
        await authorizeCommandInTx(tx, {
          actor,
          sessionId: actor.agentSessionId!,
          capability: "work:read",
          operation: "inbox_claim",
          idempotencyKey,
        });
        await assertCurrentAgentCredentialInTx(
          tx,
          actor,
          actor.agentSessionId!,
        );
        const values: unknown[] = [
          itemId(request),
          actor.workspaceId,
          actor.agentSessionId,
          actor.id,
        ];
        const item = (
          await tx.query<InboxItem>(
            `SELECT i.*,
                source_message.channel_id,
                source_message.body AS source_message_body,
                source_message.intent::text AS source_message_intent,
                source_message.author_actor_id AS source_author_actor_id,
                source_message.session_id AS source_author_session_id,
                source_message.thread_id AS source_thread_id
           FROM inbox_items i
           JOIN agent_sessions current_scope
             ON current_scope.id=$3
            AND current_scope.workspace_id=i.workspace_id
            AND current_scope.agent_actor_id=$4
           LEFT JOIN room_messages source_message
             ON source_message.id=i.source_room_message_id
            AND source_message.workspace_id=i.workspace_id
          WHERE i.id=$1 AND i.workspace_id=$2
            AND i.status='open'
            AND i.recipient_human_actor_id IS NULL
            AND i.recipient_actor_id=$4
            AND i.recipient_session_id IS NULL
            AND i.claimed_by_session_id IS NULL
            AND ${activeScopeSql}
          FOR UPDATE OF i`,
            values,
          )
        ).rows[0];
        if (!item) throw new DomainError("NOT_FOUND", "Inbox item not found");
        const claimed = (
          await tx.query<InboxItem>(
            `UPDATE inbox_items
            SET claimed_by_session_id=$2,claimed_at=now(),
                revision=revision+1,updated_at=now()
          WHERE id=$1 AND status='open' AND claimed_by_session_id IS NULL
          RETURNING *`,
            [item.id, actor.agentSessionId],
          )
        ).rows[0];
        if (!claimed)
          throw new DomainError("NOT_FOUND", "Inbox item not found");
        const result = { ...item, ...claimed };
        const meta = h.meta(request, body, { id: item.id });
        await insertReceipt(tx, meta, item.id, "claimed");
        await appendInboxEvent(tx, meta, result, "inbox.item.claimed", {});
        return detailWithReceipts(tx, result);
      },
    );
  });

  app.post("/api/v1/inbox/:id/acknowledge", async (request) => {
    inboxAcknowledgeInputSchema.parse(request.body ?? {});
    return command(
      h.db,
      h.meta(request, request.body ?? {}, { id: itemId(request) }),
      async (tx) => {
        const item = await loadAgentItemForUpdate(
          tx,
          request,
          "work:read",
          "inbox_ack",
        );
        const meta = h.meta(request, request.body ?? {}, { id: item.id });
        const inserted = await insertReceipt(tx, meta, item.id, "acknowledged");
        if (inserted)
          await appendInboxEvent(tx, meta, item, "inbox.item.acknowledged", {});
        return detailWithReceipts(tx, item);
      },
    );
  });

  app.post("/api/v1/inbox/:id/reply", async (request) => {
    const body = inboxReplyInputSchema.parse(request.body);
    const expectedRevision = parseRevision(h.header(request, "if-match"));
    return command(
      h.db,
      h.meta(request, body, { id: itemId(request) }),
      async (tx) => {
        const item = await loadAgentItemForUpdate(
          tx,
          request,
          "work:write",
          "inbox_reply",
        );
        assertRevision(expectedRevision, item.revision);
        if (
          item.status !== "open" ||
          !item.source_room_message_id ||
          !item.channel_id
        )
          throw new DomainError(
            "INBOX_REPLY_CONFLICT",
            "Inbox item cannot be replied to",
          );
        if (item.kind === "review_request") {
          await authorizeCommandInTx(tx, {
            actor: currentActor(request),
            sessionId: currentActor(request).agentSessionId!,
            capability: "artifact:write",
            operation: "inbox_reply",
            idempotencyKey: request.idempotencyKey!,
          });
          const reviewer = (
            await tx.query<{ role: string }>(
              `SELECT d.role
             FROM agent_sessions s
             JOIN delegations d ON d.id=s.delegation_id
            WHERE s.id=$1 AND s.workspace_id=$2
            FOR UPDATE OF d`,
              [
                currentActor(request).agentSessionId,
                currentActor(request).workspaceId,
              ],
            )
          ).rows[0];
          if (reviewer?.role !== "reviewer")
            throw new DomainError(
              "CAPABILITY_DENIED",
              "Review replies require a reviewer delegation with artifact:write",
            );
        }
        const reply = (
          await tx.query<{ id: string }>(
            `INSERT INTO room_messages(
           channel_id,workspace_id,author_actor_id,session_id,intent,
           recipient_actor_id,reply_to_message_id,thread_id,body,
           structured_payload,requires_response
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
         RETURNING id`,
            [
              item.channel_id,
              currentActor(request).workspaceId,
              currentActor(request).id,
              currentActor(request).agentSessionId,
              item.kind === "review_request" ? "review_result" : "answer",
              item.source_author_actor_id,
              item.source_room_message_id,
              item.source_thread_id ?? item.source_room_message_id,
              body.body,
              body.payload,
            ],
          )
        ).rows[0]!;
        if (item.source_author_actor_id)
          await tx.query(
            `INSERT INTO room_message_recipients(message_id,actor_id)
           VALUES($1,$2)`,
            [reply.id, item.source_author_actor_id],
          );
        if (item.source_author_session_id && item.source_author_actor_id)
          await tx.query(
            `INSERT INTO room_message_session_recipients(
             message_id,workspace_id,session_id,actor_id
           ) VALUES($1,$2,$3,$4)`,
            [
              reply.id,
              currentActor(request).workspaceId,
              item.source_author_session_id,
              item.source_author_actor_id,
            ],
          );
        const sourceAgentId = await authorizeExactReplyRecipient(tx, item);
        if (item.requires_response)
          await tx.query(
            `INSERT INTO room_message_response_resolutions(
             message_id,resolved_by_actor_id,resolution
           ) VALUES($1,$2,$3)`,
            [
              item.source_room_message_id,
              currentActor(request).id,
              `inbox_reply:${reply.id}`,
            ],
          );
        const resolved = (
          await tx.query<InboxItem>(
            `UPDATE inbox_items
            SET status='resolved',resolved_at=now(),resolved_by_actor_id=$2,
                revision=revision+1,updated_at=now()
          WHERE id=$1 AND status='open' AND revision=$3
          RETURNING *`,
            [item.id, currentActor(request).id, item.revision],
          )
        ).rows[0];
        if (!resolved)
          throw new DomainError(
            "REVISION_CONFLICT",
            "Inbox item changed while replying",
          );
        await tx.query(
          `UPDATE inbox_items
              SET status='resolved',resolved_at=now(),resolved_by_actor_id=$3,
                  revision=revision+1,updated_at=now()
            WHERE workspace_id=$1
              AND source_type='room_message'
              AND source_id=$2
              AND id<>$4
              AND status='open'`,
          [
            currentActor(request).workspaceId,
            item.source_room_message_id,
            currentActor(request).id,
            item.id,
          ],
        );
        const result = { ...item, ...resolved };
        const meta = h.meta(request, body, { id: item.id });
        const roomEventId = await appendEvent(tx, {
          workspaceId: meta.actor.workspaceId,
          teamId: item.team_id,
          audienceActorId: sourceAgentId
            ? item.source_author_actor_id ?? undefined
            : undefined,
          actorId: meta.actor.id,
          correlationId: meta.correlationId,
          idempotencyKey: meta.idempotencyKey,
          type: "room.message.posted",
          aggregateType: "room_message",
          aggregateId: reply.id,
          sessionId: sourceAgentId
            ? item.source_author_session_id ?? undefined
            : meta.actor.agentSessionId,
          payload: {
            intent: item.kind === "review_request" ? "review_result" : "answer",
            channelId: item.channel_id,
            replyToMessageId: item.source_room_message_id,
          },
        });
        if (
          sourceAgentId &&
          item.source_author_actor_id &&
          item.source_author_session_id
        ) {
          const sourceInbox = (
            await tx.query<{ id: string }>(
              `INSERT INTO inbox_items(
                 workspace_id,recipient_actor_id,recipient_session_id,session_id,
                 team_id,kind,source_type,source_id,source_room_message_id,
                 requires_response,payload
               ) VALUES($1,$2,$3,$4,$5,'mention','room_message',$6,$6,false,$7)
               ON CONFLICT DO NOTHING
               RETURNING id`,
              [
                meta.actor.workspaceId,
                item.source_author_actor_id,
                item.source_author_session_id,
                meta.actor.agentSessionId,
                item.team_id,
                reply.id,
                {
                  intent:
                    item.kind === "review_request"
                      ? "review_result"
                      : "answer",
                  channelId: item.channel_id,
                  replyToMessageId: item.source_room_message_id,
                },
              ],
            )
          ).rows[0];
          if (sourceInbox) {
            await appendEvent(tx, {
              workspaceId: meta.actor.workspaceId,
              teamId: item.team_id,
              audienceActorId: item.source_author_actor_id,
              actorId: meta.actor.id,
              correlationId: meta.correlationId,
              idempotencyKey: meta.idempotencyKey,
              type: "inbox.item.created",
              aggregateType: "inbox_item",
              aggregateId: sourceInbox.id,
              sessionId: item.source_author_session_id,
              payload: {
                kind: "mention",
                sourceMessageId: reply.id,
              },
            });
          }
          await queueWebhookDeliveries(
            tx,
            sourceAgentId,
            roomEventId,
            "room.message.posted",
            item.source_author_session_id,
            {
              messageId: reply.id,
              channelId: item.channel_id,
              intent:
                item.kind === "review_request" ? "review_result" : "answer",
              sessionId: item.source_author_session_id,
            },
          );
        }
        await insertReceipt(tx, meta, item.id, "replied", reply.id);
        await appendInboxEvent(tx, meta, result, "inbox.item.replied", {
          replyMessageId: reply.id,
        });
        return {
          ...(await detailWithReceipts(tx, result)),
          replyMessageId: reply.id,
        };
      },
      (tx) => lockReplyParticipantsBeforeReservation(tx, request),
    );
  });
}
