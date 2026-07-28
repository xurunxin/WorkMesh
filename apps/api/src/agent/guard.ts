import type { PoolClient } from "pg";
import { authorizeAgentMutation, DomainError } from "@workmesh/domain";
import type { Capability } from "@workmesh/contracts";
import type { ApiActor } from "./types.js";

type SessionFacts = {
  id: string; actor_id: string; delegation_id: string; state: Parameters<typeof authorizeAgentMutation>[0]["session"]["state"];
  revision: number; stop_acknowledged_at: Date | null; permissions_snapshot: Capability[]; capability_scope: { teamIds?: string[]; workItemIds?: string[]; projectIds?: string[] };
  delegation_status: string; team_id: string; work_item_id: string | null; project_id: string | null; current_plan_version_id: string | null; agent_id: string; agent_active:boolean; definition_capabilities:Capability[]; team_capabilities:Capability[]|null;
};

type SessionLocator = {
  agent_id: string
  delegation_id: string
  team_id: string
}

const inactiveAuthority = (): never => {
  throw new DomainError(
    "DELEGATION_NOT_ACTIVE",
    "Agent delegation or team grant is no longer active",
  )
}

export async function authorizeCommandInTx(
  tx: PoolClient,
  input: {
    actor: ApiActor
    sessionId: string
    capability: Capability
    operation: Parameters<typeof authorizeAgentMutation>[0]['operation']
    idempotencyKey: string
    expectedRevision?: number
    resourceId?: string | null
  },
): Promise<SessionFacts> {
  const session = await loadAgentSessionForMutation(tx, input.actor, input.sessionId)
  assertAgentWrite({ ...input, session })
  return session
}

export async function loadAgentSessionForMutation(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<SessionFacts> {
  // Locate immutable authority keys without taking a lock, then acquire every
  // authority lock in the same order used by Team-grant revocation:
  // definition -> exact durable Team grant -> delegation -> session.
  const locator = (await tx.query<SessionLocator>(
    `SELECT agent_id,delegation_id,team_id
     FROM agent_sessions
     WHERE id=$1 AND workspace_id=$2`,
    [sessionId, actor.workspaceId],
  )).rows[0]
  if (!locator) {
    throw new DomainError("AGENT_SESSION_NOT_FOUND", "Agent session not found")
  }

  const definition = (await tx.query<{
    is_active: boolean
    approved_capabilities: Capability[]
  }>(
    `SELECT is_active,approved_capabilities
     FROM agent_definitions
     WHERE id=$1 AND workspace_id=$2
     FOR UPDATE`,
    [locator.agent_id, actor.workspaceId],
  )).rows[0]
  if (!definition) return inactiveAuthority()

  // Lock the durable row even after revocation. Filtering revoked_at in this
  // SELECT would turn a concurrent revoke into an unlocked nullable join.
  const teamGrant = (await tx.query<{
    approved_capabilities: Capability[]
    revoked_at: Date | null
  }>(
    `SELECT approved_capabilities,revoked_at
     FROM agent_team_access
     WHERE workspace_id=$1 AND agent_id=$2 AND team_id=$3
     FOR UPDATE`,
    [actor.workspaceId, locator.agent_id, locator.team_id],
  )).rows[0]
  if (!teamGrant) return inactiveAuthority()

  const delegation = (await tx.query<{
    permissions_snapshot: Capability[]
    capability_scope: SessionFacts["capability_scope"]
    status: string
  }>(
    `SELECT permissions_snapshot,capability_scope,status
     FROM delegations
     WHERE id=$1 AND workspace_id=$2 AND agent_id=$3 AND team_id=$4
     FOR UPDATE`,
    [
      locator.delegation_id,
      actor.workspaceId,
      locator.agent_id,
      locator.team_id,
    ],
  )).rows[0]
  if (!delegation) return inactiveAuthority()

  const session = (await tx.query<Omit<
    SessionFacts,
    | "permissions_snapshot"
    | "capability_scope"
    | "delegation_status"
    | "agent_active"
    | "definition_capabilities"
    | "team_capabilities"
  >>(
    `SELECT id,agent_actor_id AS actor_id,delegation_id,state,revision,
            stop_acknowledged_at,team_id,work_item_id,project_id,
            current_plan_version_id,agent_id
     FROM agent_sessions
     WHERE id=$1 AND workspace_id=$2 AND agent_id=$3
       AND delegation_id=$4 AND team_id=$5
     FOR UPDATE`,
    [
      sessionId,
      actor.workspaceId,
      locator.agent_id,
      locator.delegation_id,
      locator.team_id,
    ],
  )).rows[0]
  if (!session) {
    throw new DomainError("AGENT_SESSION_NOT_FOUND", "Agent session not found")
  }

  return {
    ...session,
    permissions_snapshot: delegation.permissions_snapshot,
    capability_scope: delegation.capability_scope,
    delegation_status: delegation.status,
    agent_active: definition.is_active,
    definition_capabilities: definition.approved_capabilities,
    team_capabilities: teamGrant.revoked_at === null
      ? teamGrant.approved_capabilities
      : null,
  }
}

export function assertAgentWrite(input: {
  actor: ApiActor; session: SessionFacts; sessionId: string; capability: Capability; operation: Parameters<typeof authorizeAgentMutation>[0]["operation"];
  idempotencyKey: string; expectedRevision?: number; resourceId?: string | null;
}): void {
  const scope = input.session.capability_scope ?? {};
  const resourceId = input.resourceId ?? input.session.work_item_id ?? input.session.project_id;
  const liveCapabilities = (input.session.permissions_snapshot ?? []).filter(capability => input.session.definition_capabilities.includes(capability) && input.session.team_capabilities?.includes(capability));
  if (!input.session.agent_active || input.session.delegation_status !== "active" || !input.session.team_capabilities) throw new DomainError("DELEGATION_NOT_ACTIVE", "Agent delegation or team grant is no longer active");
  const resourceInScope = Boolean(scope.teamIds?.includes(input.session.team_id)) &&
    (!resourceId || Boolean(scope.workItemIds?.includes(resourceId) || scope.projectIds?.includes(resourceId)));
  authorizeAgentMutation({
    actorId: input.actor.id, actorKind: input.actor.kind === "agent" ? "agent" : "human",
    session: { id: input.session.id, actorId: input.session.actor_id, delegationId: input.session.delegation_id,
      state: input.session.state, revision: input.session.revision, stopCleanupAcknowledged: Boolean(input.session.stop_acknowledged_at) },
    targetSessionId: input.sessionId, delegation: { id: input.session.delegation_id, active: input.session.delegation_status === "active" },
    capability: input.capability, grantedCapabilities: liveCapabilities, resourceInScope,
    expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey, operation: input.operation,
  });
}
