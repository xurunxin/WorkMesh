import type { PoolClient } from "pg";
import { authorizeAgentMutation, DomainError } from "@workmesh/domain";
import type { Capability } from "@workmesh/contracts";
import type { ApiActor } from "./types.js";

type SessionFacts = {
  id: string; actor_id: string; delegation_id: string; state: Parameters<typeof authorizeAgentMutation>[0]["session"]["state"];
  revision: number; stop_acknowledged_at: Date | null; permissions_snapshot: Capability[]; capability_scope: { teamIds?: string[]; workItemIds?: string[]; projectIds?: string[] };
  delegation_status: string; team_id: string; work_item_id: string | null; project_id: string | null; current_plan_version_id: string | null; agent_id: string; agent_active:boolean; definition_capabilities:Capability[]; team_capabilities:Capability[]|null;
};

export async function loadAgentSessionForMutation(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<SessionFacts> {
  const result = await tx.query<SessionFacts>(
    `SELECT s.id,s.agent_actor_id AS actor_id,s.delegation_id,s.state,s.revision,s.stop_acknowledged_at,
      d.permissions_snapshot,d.capability_scope,d.status AS delegation_status,s.team_id,s.work_item_id,s.project_id,s.current_plan_version_id,s.agent_id,a.is_active AS agent_active,a.approved_capabilities AS definition_capabilities,ata.approved_capabilities AS team_capabilities
     FROM agent_sessions s JOIN delegations d ON d.id=s.delegation_id JOIN agent_definitions a ON a.id=s.agent_id
     LEFT JOIN agent_team_access ata ON ata.workspace_id=s.workspace_id AND ata.agent_id=s.agent_id AND ata.team_id=s.team_id AND ata.revoked_at IS NULL
     WHERE s.id=$1 AND s.workspace_id=$2 FOR UPDATE OF s`, [sessionId, actor.workspaceId]);
  const session = result.rows[0];
  if (!session) throw new DomainError("AGENT_SESSION_NOT_FOUND", "Agent session not found");
  return session;
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
