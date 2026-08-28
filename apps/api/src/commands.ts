import type { Pool, PoolClient } from "pg";
import { appendEvent, withTx } from "@workmesh/db";
import { loadRetentionConfig } from "@workmesh/config";
import {
  DomainError,
  assertResponsibleHumanForStarted,
  assertRevision,
} from "@workmesh/domain";
import type { ApiActor } from "./agent/types.js";

type TeamRole = "admin" | "maintainer" | "member";
type StatusCategory =
  "backlog" | "planned" | "started" | "completed" | "canceled";

export type Actor = ApiActor;
export type CommandContext = {
  actor: Actor;
  idempotencyKey: string;
  correlationId: string;
  operation: string;
  requestHash: string;
  clientContext?: Record<string, string | null>;
};
export type MutationOptions = {
  beforeReserve?: (tx: PoolClient) => Promise<void>;
  authorizeReplay?: (tx: PoolClient) => Promise<void>;
};
type Team = { id: string; deleted_at: Date | null };
const one = <T>(rows: T[]): T => {
  const value = rows[0];
  if (!value) throw new DomainError("NOT_FOUND", "Resource not found");
  return value;
};

const workItemPlanningCodes = [
  "WORK_ITEM_PARENT_SELF",
  "WORK_ITEM_PARENT_DELETED",
  "WORK_ITEM_PARENT_PROJECT_MISMATCH",
  "WORK_ITEM_PARENT_CYCLE",
  "WORK_ITEM_MILESTONE_PROJECT_MISMATCH",
  "WORK_ITEM_MILESTONE_DELETED",
  "WORK_ITEM_HAS_ACTIVE_PARENT",
  "WORK_ITEM_HAS_ACTIVE_CHILDREN",
  "WORK_ITEM_HAS_ACTIVE_RELATIONS",
] as const;

async function planningWorkItemWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const invariant = workItemPlanningCodes.find((code) => message.includes(code));
    if (invariant)
      throw new DomainError(invariant, "Work Item hierarchy or active links violate a WorkMesh invariant");
    const constraint = (error as { constraint?: unknown }).constraint;
    if (constraint === "work_items_parent_same_team_fk")
      throw new DomainError("WORK_ITEM_PARENT_SCOPE_MISMATCH", "Parent and child must belong to the same Team");
    if (constraint === "work_items_milestone_project_fk")
      throw new DomainError("WORK_ITEM_MILESTONE_PROJECT_MISMATCH", "Milestone and Work Item must belong to the same Project");
    throw error;
  }
}

/** Stage 0 roles: admins bypass team membership; maintainers administer team
 * configuration/projects; all team members can work on work items/comments. */
async function teamAccess(
  tx: PoolClient,
  c: CommandContext,
  teamId: string,
  mode: "read" | "write" | "manage",
): Promise<Team> {
  const team = one(
    (
      await tx.query<Team>(
        "SELECT id,deleted_at FROM teams WHERE id=$1 AND workspace_id=$2 FOR UPDATE",
        [teamId, c.actor.workspaceId],
      )
    ).rows,
  );
  if (team.deleted_at) throw new DomainError("NOT_FOUND", "Team not found");
  if (c.actor.workspaceRole === "admin") return team;
  if (c.actor.kind === "agent" && c.actor.agentSessionId) {
    const coordination = await tx.query(
      `SELECT 1 FROM agent_sessions s
       JOIN delegations d ON d.id=s.delegation_id AND d.status='active'
       JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
       WHERE s.id=$1 AND s.workspace_id=$2 AND s.agent_actor_id=$3 AND s.team_id=$4
         AND s.session_kind='coordination' AND s.state IN ('acknowledged','planning','executing')
         AND d.role='coordinator' AND d.scope_type='team' AND d.scope_id=$4
         AND 'work:write'=ANY(d.permissions_snapshot)
         AND 'work:write'=ANY(ata.approved_capabilities)`,
      [c.actor.agentSessionId, c.actor.workspaceId, c.actor.id, teamId],
    );
    if (coordination.rowCount) return team;
  }
  const membership = await tx.query<{ role: TeamRole }>(
    "SELECT role FROM memberships WHERE workspace_id=$1 AND team_id=$2 AND actor_id=$3",
    [c.actor.workspaceId, teamId, c.actor.id],
  );
  const role = membership.rows[0]?.role;
  if (!role) throw new DomainError("FORBIDDEN", "Team membership is required");
  if (mode === "manage" && role === "member")
    throw new DomainError("FORBIDDEN", "Team maintainer role is required");
  return team;
}

export async function authorizeTeamMutation(
  tx: PoolClient,
  context: CommandContext,
  teamId: string,
): Promise<void> {
  await teamAccess(tx, context, teamId, "write");
}

const workspaceAdmin = (c: CommandContext): void => {
  if (c.actor.workspaceRole !== "admin")
    throw new DomainError(
      "FORBIDDEN",
      "Workspace administrator role is required",
    );
};

async function activeHumanInTeam(
  tx: PoolClient,
  c: CommandContext,
  teamId: string,
  actorId: string,
): Promise<void> {
  const result = await tx.query(
    "SELECT 1 FROM actors a JOIN memberships m ON m.actor_id=a.id AND m.workspace_id=a.workspace_id JOIN teams t ON t.id=m.team_id AND t.workspace_id=m.workspace_id WHERE a.id=$1 AND a.workspace_id=$2 AND a.kind='human' AND a.is_active=true AND m.team_id=$3 AND t.deleted_at IS NULL",
    [actorId, c.actor.workspaceId, teamId],
  );
  if (!result.rowCount)
    throw new DomainError(
      "VALIDATION_ERROR",
      "Referenced human must be an active member of the target team",
    );
}

async function activeProject(
  tx: PoolClient,
  c: CommandContext,
  teamId: string,
  projectId: string,
): Promise<void> {
  const result = await tx.query(
    "SELECT 1 FROM projects WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND deleted_at IS NULL",
    [projectId, c.actor.workspaceId, teamId],
  );
  if (!result.rowCount)
    throw new DomainError(
      "VALIDATION_ERROR",
      "Project must belong to the work item team and be active",
    );
}

async function commentReferences(
  tx: PoolClient,
  channelId: string,
  parentCommentId?: string,
  replyToCommentId?: string,
): Promise<void> {
  for (const id of [parentCommentId, replyToCommentId]) {
    if (!id) continue;
    const found = await tx.query(
      "SELECT 1 FROM comments WHERE id=$1 AND channel_id=$2 AND deleted_at IS NULL",
      [id, channelId],
    );
    if (!found.rowCount)
      throw new DomainError(
        "VALIDATION_ERROR",
        "Comment parent and reply targets must be active comments in the same channel",
      );
  }
}

async function event(
  tx: PoolClient,
  c: CommandContext,
  type: string,
  aggregateType: string,
  aggregateId: string,
  revision: number,
  payload: Record<string, unknown>,
  teamId?: string,
): Promise<void> {
  await appendEvent(tx, {
    workspaceId: c.actor.workspaceId,
    teamId,
    actorId: c.actor.id,
    correlationId: c.correlationId,
    idempotencyKey: c.idempotencyKey,
    type,
    aggregateType,
    aggregateId,
    revision,
    payload,
  });
}

/** Reserve first so concurrent requests with the same key serialize on the PK.
 * A failed command rolls the reservation back together with all its writes. */
export async function mutate<T>(
  db: Pool,
  context: CommandContext,
  handler: (tx: PoolClient) => Promise<T>,
  options: MutationOptions = {},
): Promise<T> {
  return withTx(db, async (tx) => {
    // Cross-resource commands may need one deterministic coordination lock
    // before the idempotency insert takes actor/workspace foreign-key locks.
    // Otherwise reciprocal commands can each hold one FK lock before either
    // reaches its normal domain lock order.
    await options.beforeReserve?.(tx);
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
      [
        context.actor.workspaceId,
        context.actor.id,
        context.idempotencyKey,
        context.operation,
        context.requestHash,
        retention.genericReplayHours,
        retention.genericConflictDays,
      ],
    );
    if (!reserved.rowCount) {
      const previous = one(
        (
          await tx.query<{
            operation: string;
            request_hash: string;
            response_body: T | null;
            replay_expires_at: Date;
          }>(
            "SELECT operation,request_hash,response_body,replay_expires_at FROM api_idempotency_keys WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR UPDATE",
            [
              context.actor.workspaceId,
              context.actor.id,
              context.idempotencyKey,
            ],
          )
        ).rows,
      );
      if (
        previous.operation !== context.operation ||
        previous.request_hash !== context.requestHash
      )
        throw new DomainError(
          "IDEMPOTENCY_KEY_REUSED",
          "Idempotency key was used for a different operation or request",
        );
      if (previous.replay_expires_at.getTime() <= Date.now())
        throw new DomainError(
          "IDEMPOTENCY_REPLAY_EXPIRED",
          "Idempotency replay material expired; use a new key",
        );
      if (previous.response_body === null)
        throw new DomainError(
          "IDEMPOTENCY_REPLAY_UNAVAILABLE",
          "Idempotency response is unavailable",
        );
      await options.authorizeReplay?.(tx);
      return previous.response_body;
    }
    const response = await handler(tx);
    await tx.query(
      "UPDATE api_idempotency_keys SET response_status=200,response_body=$1 WHERE workspace_id=$2 AND actor_id=$3 AND idempotency_key=$4",
      [
        response,
        context.actor.workspaceId,
        context.actor.id,
        context.idempotencyKey,
      ],
    );
    return response;
  });
}

export const commands = {
  updateWorkspace: (
    db: Pool,
    c: CommandContext,
    revision: number,
    input: { name?: string; slug?: string },
  ) =>
    mutate(db, c, async (tx) => {
      workspaceAdmin(c);
      const current = one(
        (
          await tx.query<{ revision: number }>(
            "SELECT revision FROM workspaces WHERE id=$1 FOR UPDATE",
            [c.actor.workspaceId],
          )
        ).rows,
      );
      assertRevision(revision, current.revision);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE workspaces SET name=COALESCE($1,name),slug=COALESCE($2,slug),revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision",
            [input.name ?? null, input.slug ?? null, c.actor.workspaceId],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        "workspace.updated",
        "workspace",
        item.id,
        item.revision,
        input,
      );
      return item;
    }),

  createTeam: (
    db: Pool,
    c: CommandContext,
    input: { name: string; key: string },
  ) =>
    mutate(db, c, async (tx) => {
      workspaceAdmin(c);
      const team = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "INSERT INTO teams(workspace_id,name,key) VALUES($1,$2,$3) RETURNING id,revision",
            [c.actor.workspaceId, input.name, input.key],
          )
        ).rows,
      );
      await tx.query(
        "INSERT INTO memberships(workspace_id,team_id,actor_id,role) VALUES($1,$2,$3,'maintainer')",
        [c.actor.workspaceId, team.id, c.actor.id],
      );
      await event(
        tx,
        c,
        "team.created",
        "team",
        team.id,
        team.revision,
        input,
        team.id,
      );
      return team;
    }),

  updateTeam: (
    db: Pool,
    c: CommandContext,
    id: string,
    revision: number,
    input: { name?: string; key?: string },
  ) =>
    mutate(db, c, async (tx) => {
      await teamAccess(tx, c, id, "manage");
      const current = one(
        (
          await tx.query<{ revision: number }>(
            "SELECT revision FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      assertRevision(revision, current.revision);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE teams SET name=COALESCE($1,name),key=COALESCE($2,key),revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,revision",
            [input.name ?? null, input.key ?? null, id],
          )
        ).rows,
      );
      await event(tx, c, "team.updated", "team", id, item.revision, input, id);
      return item;
    }),

  deleteTeam: (db: Pool, c: CommandContext, id: string, revision: number) =>
    mutate(db, c, async (tx) => {
      // Serialize team removals per workspace so concurrent deletes cannot
      // each observe another active team and leave the workspace with none.
      await tx.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [
        c.actor.workspaceId,
      ]);
      await teamAccess(tx, c, id, "manage");
      const current = one(
        (
          await tx.query<{ revision: number }>(
            "SELECT revision FROM teams WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      assertRevision(revision, current.revision);
      const anotherActiveTeam = await tx.query(
        "SELECT 1 FROM teams WHERE workspace_id=$1 AND id<>$2 AND deleted_at IS NULL LIMIT 1",
        [c.actor.workspaceId, id],
      );
      if (!anotherActiveTeam.rowCount)
        throw new DomainError(
          "LAST_ACTIVE_TEAM_CONFLICT",
          "A workspace must retain at least one active team",
        );
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE teams SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id,revision",
            [id],
          )
        ).rows,
      );
      await event(tx, c, "team.deleted", "team", id, item.revision, {}, id);
      return item;
    }),

  createState: (
    db: Pool,
    c: CommandContext,
    teamId: string,
    input: {
      name: string;
      category: string;
      color?: string;
      position?: number;
    },
  ) =>
    mutate(db, c, async (tx) => {
      await teamAccess(tx, c, teamId, "manage");
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "INSERT INTO workflow_states(workspace_id,team_id,name,category,color,position) VALUES($1,$2,$3,$4,COALESCE($5,'#64748b'),COALESCE($6,(SELECT COALESCE(max(position),-1)+1 FROM workflow_states WHERE workspace_id=$1 AND team_id=$2))) RETURNING id,revision",
            [
              c.actor.workspaceId,
              teamId,
              input.name,
              input.category,
              input.color ?? null,
              input.position ?? null,
            ],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        "workflow_state.created",
        "workflow_state",
        item.id,
        item.revision,
        input,
        teamId,
      );
      return item;
    }),

  updateState: (
    db: Pool,
    c: CommandContext,
    teamId: string,
    stateId: string,
    revision: number,
    input: { name?: string; color?: string },
  ) =>
    mutate(db, c, async (tx) => {
      await teamAccess(tx, c, teamId, "manage");
      const current = one(
        (
          await tx.query<{ revision: number }>(
            "SELECT revision FROM workflow_states WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND is_archived=false FOR UPDATE",
            [stateId, c.actor.workspaceId, teamId],
          )
        ).rows,
      );
      assertRevision(revision, current.revision);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE workflow_states SET name=COALESCE($1,name),color=COALESCE($2,color),revision=revision+1,updated_at=now() WHERE id=$3 AND workspace_id=$4 AND team_id=$5 AND is_archived=false RETURNING id,revision",
            [
              input.name ?? null,
              input.color ?? null,
              stateId,
              c.actor.workspaceId,
              teamId,
            ],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        "workflow_state.updated",
        "workflow_state",
        item.id,
        item.revision,
        input,
        teamId,
      );
      return item;
    }),

  createProject: (
    db: Pool,
    c: CommandContext,
    input: {
      teamId: string;
      name: string;
      summary?: string;
      description?: string | null;
      status?: string;
      leadActorId?: string | null;
      targetDate?: Date | null;
    },
  ) =>
    mutate(db, c, async (tx) => {
      await teamAccess(tx, c, input.teamId, "manage");
      if (input.leadActorId)
        await activeHumanInTeam(tx, c, input.teamId, input.leadActorId);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "INSERT INTO projects(workspace_id,team_id,name,summary,description,status,lead_actor_id,target_date) VALUES($1,$2,$3,$4,$5,COALESCE($6,'planned'),$7,$8) RETURNING id,revision",
            [
              c.actor.workspaceId,
              input.teamId,
              input.name,
              input.summary ?? null,
              input.description ?? null,
              input.status ?? null,
              input.leadActorId ?? null,
              input.targetDate ?? null,
            ],
          )
        ).rows,
      );
      await tx.query("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'project',$2,$3) ON CONFLICT(workspace_id,subject_kind,subject_id) DO NOTHING", [c.actor.workspaceId, item.id, input.teamId]);
      await event(
        tx,
        c,
        "project.created",
        "project",
        item.id,
        item.revision,
        input,
        input.teamId,
      );
      return item;
    }),

  updateProject: (
    db: Pool,
    c: CommandContext,
    id: string,
    revision: number,
    input: Record<string, unknown>,
  ) =>
    mutate(db, c, async (tx) => {
      const current = one(
        (
          await tx.query<{ revision: number; team_id: string }>(
            "SELECT revision,team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      await teamAccess(tx, c, current.team_id, "manage");
      assertRevision(revision, current.revision);
      if (
        Object.prototype.hasOwnProperty.call(input, "leadActorId") &&
        input.leadActorId
      )
        await activeHumanInTeam(
          tx,
          c,
          current.team_id,
          input.leadActorId as string,
        );
      const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(input, key);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE projects SET name=CASE WHEN $1 THEN $2 ELSE name END,summary=CASE WHEN $3 THEN $4 ELSE summary END,description=CASE WHEN $5 THEN $6 ELSE description END,status=CASE WHEN $7 THEN $8 ELSE status END,lead_actor_id=CASE WHEN $9 THEN $10 ELSE lead_actor_id END,target_date=CASE WHEN $11 THEN $12 ELSE target_date END,revision=revision+1,updated_at=now() WHERE id=$13 RETURNING id,revision",
            [
              has("name"),
              input.name ?? null,
              has("summary"),
              input.summary ?? null,
              has("description"),
              input.description ?? null,
              has("status"),
              input.status ?? null,
              has("leadActorId"),
              input.leadActorId ?? null,
              has("targetDate"),
              input.targetDate ?? null,
              id,
            ],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        "project.updated",
        "project",
        id,
        item.revision,
        input,
        current.team_id,
      );
      return item;
    }),

  deleteProject: (db: Pool, c: CommandContext, id: string, revision: number) =>
    mutate(db, c, async (tx) => {
      const current = one(
        (
          await tx.query<{ revision: number; team_id: string }>(
            "SELECT revision,team_id FROM projects WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      await teamAccess(tx, c, current.team_id, "manage");
      assertRevision(revision, current.revision);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE projects SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id,revision",
            [id],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        "project.deleted",
        "project",
        id,
        item.revision,
        {},
        current.team_id,
      );
      return item;
    }),

  createWorkItem: (
    db: Pool,
    c: CommandContext,
    input: {
      teamId: string;
      title: string;
      description?: string;
      statusId: string;
      priority: string;
      dueDate?: Date;
      responsibleHumanActorId?: string;
      labels: string[];
      projectId?: string;
      milestoneId?: string;
      parentId?: string;
    },
  ) =>
    mutate(db, c, async (tx) => {
      await teamAccess(tx, c, input.teamId, "write");
      let responsibleHumanActorId = input.responsibleHumanActorId;
      if (!responsibleHumanActorId && c.actor.kind === "agent" && c.actor.agentSessionId) {
        responsibleHumanActorId = (await tx.query<{ principal_human_actor_id: string }>(
          `SELECT d.principal_human_actor_id FROM agent_sessions s
           JOIN delegations d ON d.id=s.delegation_id AND d.status='active'
           WHERE s.id=$1 AND s.workspace_id=$2 AND s.agent_actor_id=$3
             AND s.session_kind='coordination' AND s.team_id=$4`,
          [c.actor.agentSessionId, c.actor.workspaceId, c.actor.id, input.teamId],
        )).rows[0]?.principal_human_actor_id;
      }
      const state = one(
        (
          await tx.query<{ category: StatusCategory }>(
            "SELECT category FROM workflow_states WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND is_archived=false",
            [input.statusId, c.actor.workspaceId, input.teamId],
          )
        ).rows,
      );
      if (responsibleHumanActorId)
        await activeHumanInTeam(
          tx,
          c,
          input.teamId,
          responsibleHumanActorId,
        );
      if (input.projectId)
        await activeProject(tx, c, input.teamId, input.projectId);
      if (input.milestoneId && !input.projectId)
        throw new DomainError(
          "INVALID_INPUT",
          "A milestone requires a project",
        );
      assertResponsibleHumanForStarted(
        state.category,
        responsibleHumanActorId,
      );
      const sequence = one(
        (
          await tx.query<{ next_work_item_number: number }>(
            "UPDATE teams SET next_work_item_number=next_work_item_number+1 WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL RETURNING next_work_item_number-1 AS next_work_item_number",
            [input.teamId, c.actor.workspaceId],
          )
        ).rows,
      );
      const item = one(
        (
          await planningWorkItemWrite(() => tx.query<{ id: string; revision: number; number: number }>(
            "INSERT INTO work_items(workspace_id,team_id,number,title,description,status_id,priority,due_date,responsible_human_actor_id,labels,project_id,milestone_id,parent_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id,revision,number",
            [
              c.actor.workspaceId,
              input.teamId,
              sequence.next_work_item_number,
              input.title,
              input.description ?? null,
              input.statusId,
              input.priority,
              input.dueDate ?? null,
              responsibleHumanActorId ?? null,
              input.labels,
              input.projectId ?? null,
              input.milestoneId ?? null,
              input.parentId ?? null,
            ],
          ))
        ).rows,
      );
      await tx.query(
        "INSERT INTO channels(workspace_id,work_item_id) VALUES($1,$2)",
        [c.actor.workspaceId, item.id],
      );
      await tx.query("INSERT INTO work_room_channels(workspace_id,subject_kind,subject_id,team_id) VALUES($1,'work_item',$2,$3) ON CONFLICT(workspace_id,subject_kind,subject_id) DO NOTHING", [c.actor.workspaceId, item.id, input.teamId]);
      await event(
        tx,
        c,
        "work_item.created",
        "work_item",
        item.id,
        item.revision,
        { ...input, responsibleHumanActorId, number: item.number },
        input.teamId,
      );
      return item;
    }),

  updateWorkItem: (
    db: Pool,
    c: CommandContext,
    id: string,
    revision: number,
    input: Record<string, unknown>,
  ) =>
    mutate(db, c, async (tx) => {
      const current = one(
        (
          await tx.query<{
            revision: number;
            team_id: string;
            responsible_human_actor_id: string | null;
            category: StatusCategory;
            project_id: string | null;
          }>(
            "SELECT w.revision,w.team_id,w.responsible_human_actor_id,w.project_id,s.category FROM work_items w JOIN workflow_states s ON s.id=w.status_id WHERE w.id=$1 AND w.workspace_id=$2 AND w.deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      await teamAccess(tx, c, current.team_id, "write");
      assertRevision(revision, current.revision);
      const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(input, key);
      const status = input.statusId
        ? one(
            (
              await tx.query<{ category: StatusCategory }>(
                "SELECT category FROM workflow_states WHERE id=$1 AND workspace_id=$2 AND team_id=$3 AND is_archived=false",
                [input.statusId, c.actor.workspaceId, current.team_id],
              )
            ).rows,
          ).category
        : current.category;
      const owner = has("responsibleHumanActorId")
        ? (input.responsibleHumanActorId as string | null)
        : current.responsible_human_actor_id;
      if (owner) await activeHumanInTeam(tx, c, current.team_id, owner);
      if (has("projectId") && input.projectId)
        await activeProject(tx, c, current.team_id, input.projectId as string);
      const projectId = has("projectId")
        ? (input.projectId as string | null)
        : current.project_id;
      if (has("milestoneId") && input.milestoneId && !projectId)
        throw new DomainError(
          "INVALID_INPUT",
          "A milestone requires a project",
        );
      assertResponsibleHumanForStarted(status, owner);
      const item = one(
        (
          await planningWorkItemWrite(() => tx.query<{ id: string; revision: number }>(
            "UPDATE work_items SET title=CASE WHEN $1 THEN $2 ELSE title END,description=CASE WHEN $3 THEN $4 ELSE description END,status_id=CASE WHEN $5 THEN $6 ELSE status_id END,priority=CASE WHEN $7 THEN $8 ELSE priority END,due_date=CASE WHEN $9 THEN $10 ELSE due_date END,responsible_human_actor_id=CASE WHEN $11 THEN $12 ELSE responsible_human_actor_id END,labels=CASE WHEN $13 THEN $14 ELSE labels END,project_id=CASE WHEN $15 THEN $16 ELSE project_id END,milestone_id=CASE WHEN $17 THEN $18 ELSE CASE WHEN $15 THEN NULL ELSE milestone_id END END,parent_id=CASE WHEN $19 THEN $20 ELSE parent_id END,revision=revision+1,updated_at=now() WHERE id=$21 RETURNING id,revision",
            [
              has("title"),
              input.title ?? null,
              has("description"),
              input.description ?? null,
              has("statusId"),
              input.statusId ?? null,
              has("priority"),
              input.priority ?? null,
              has("dueDate"),
              input.dueDate ?? null,
              has("responsibleHumanActorId"),
              owner,
              has("labels"),
              input.labels ?? null,
              has("projectId"),
              input.projectId ?? null,
              has("milestoneId"),
              input.milestoneId ?? null,
              has("parentId"),
              input.parentId ?? null,
              id,
            ],
          ))
        ).rows,
      );
      await event(
        tx,
        c,
        input.statusId ? "work_item.status_changed" : "work_item.updated",
        "work_item",
        id,
        item.revision,
        input,
        current.team_id,
      );
      return item;
    }),

  deleteWorkItem: (db: Pool, c: CommandContext, id: string, revision: number) =>
    mutate(db, c, async (tx) => {
      const current = one(
        (
          await tx.query<{ revision: number; team_id: string }>(
            "SELECT revision,team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, c.actor.workspaceId],
          )
        ).rows,
      );
      await teamAccess(tx, c, current.team_id, "write");
      assertRevision(revision, current.revision);
      const item = one(
        (
          await planningWorkItemWrite(() => tx.query<{ id: string; revision: number }>(
            "UPDATE work_items SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id,revision",
            [id],
          ))
        ).rows,
      );
      await event(
        tx,
        c,
        "work_item.deleted",
        "work_item",
        id,
        item.revision,
        {},
        current.team_id,
      );
      return item;
    }),

  createComment: (
    db: Pool,
    c: CommandContext,
    workItemId: string,
    input: {
      body: string;
      parentCommentId?: string;
      replyToCommentId?: string;
      mentions: string[];
    },
  ) =>
    mutate(db, c, async (tx) => {
      const workItem = one(
        (
          await tx.query<{ team_id: string }>(
            "SELECT team_id FROM work_items WHERE id=$1 AND workspace_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [workItemId, c.actor.workspaceId],
          )
        ).rows,
      );
      await teamAccess(tx, c, workItem.team_id, "write");
      const channel = one(
        (
          await tx.query<{ id: string }>(
            "SELECT id FROM channels WHERE work_item_id=$1 AND workspace_id=$2",
            [workItemId, c.actor.workspaceId],
          )
        ).rows,
      );
      await commentReferences(
        tx,
        channel.id,
        input.parentCommentId,
        input.replyToCommentId,
      );
      for (const actorId of input.mentions)
        await activeHumanInTeam(tx, c, workItem.team_id, actorId);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "INSERT INTO comments(workspace_id,channel_id,author_actor_id,parent_comment_id,reply_to_comment_id,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,revision",
            [
              c.actor.workspaceId,
              channel.id,
              c.actor.id,
              input.parentCommentId ?? null,
              input.replyToCommentId ?? null,
              input.body,
            ],
          )
        ).rows,
      );
      for (const actorId of input.mentions)
        await tx.query(
          "INSERT INTO comment_mentions(workspace_id,comment_id,actor_id) VALUES($1,$2,$3)",
          [c.actor.workspaceId, item.id, actorId],
        );
      await event(
        tx,
        c,
        "comment.created",
        "comment",
        item.id,
        item.revision,
        { workItemId, ...input },
        workItem.team_id,
      );
      return item;
    }),

  updateComment: (
    db: Pool,
    c: CommandContext,
    id: string,
    revision: number,
    input: { body?: string; isResolved?: boolean; deleted?: boolean },
  ) =>
    mutate(db, c, async (tx) => {
      const current = one(
        (
          await tx.query<{
            revision: number;
            author_actor_id: string;
            team_id: string;
            role: TeamRole | null;
          }>(
            "SELECT c.revision,c.author_actor_id,w.team_id,m.role FROM comments c JOIN channels ch ON ch.id=c.channel_id JOIN work_items w ON w.id=ch.work_item_id LEFT JOIN memberships m ON m.workspace_id=w.workspace_id AND m.team_id=w.team_id AND m.actor_id=$3 WHERE c.id=$1 AND c.workspace_id=$2 AND c.deleted_at IS NULL AND w.deleted_at IS NULL FOR UPDATE OF c",
            [id, c.actor.workspaceId, c.actor.id],
          )
        ).rows,
      );
      await teamAccess(tx, c, current.team_id, "write");
      if (
        c.actor.workspaceRole !== "admin" &&
        current.author_actor_id !== c.actor.id &&
        current.role === "member"
      )
        throw new DomainError(
          "FORBIDDEN",
          "Only the author or a team maintainer may edit a comment",
        );
      assertRevision(revision, current.revision);
      const item = one(
        (
          await tx.query<{ id: string; revision: number }>(
            "UPDATE comments SET body=COALESCE($1,body),is_resolved=COALESCE($2,is_resolved),deleted_at=CASE WHEN $3 THEN now() ELSE deleted_at END,revision=revision+1,updated_at=now() WHERE id=$4 RETURNING id,revision",
            [
              input.body ?? null,
              input.isResolved ?? null,
              input.deleted ?? false,
              id,
            ],
          )
        ).rows,
      );
      await event(
        tx,
        c,
        input.deleted
          ? "comment.deleted"
          : input.isResolved !== undefined
            ? input.isResolved ? "comment.resolved" : "comment.reopened"
            : "comment.updated",
        "comment",
        id,
        item.revision,
        input,
        current.team_id,
      );
      return item;
    }),
};
