import type { PoolClient } from "pg";
import { authorizeAgentMutation } from "@workmesh/domain";
import type { Capability } from "@workmesh/contracts";
import type { ApiActor } from "./types.js";
type SessionFacts = {
    id: string;
    actor_id: string;
    delegation_id: string;
    state: Parameters<typeof authorizeAgentMutation>[0]["session"]["state"];
    revision: number;
    stop_acknowledged_at: Date | null;
    permissions_snapshot: Capability[];
    capability_scope: {
        teamIds?: string[];
        workItemIds?: string[];
        projectIds?: string[];
    };
    delegation_status: string;
    team_id: string;
    work_item_id: string | null;
    work_item_exists: boolean;
    work_item_project_id: string | null;
    project_id: string | null;
    project_exists: boolean;
    current_plan_version_id: string | null;
    agent_id: string;
    agent_active: boolean;
    definition_capabilities: Capability[];
    team_capabilities: Capability[] | null;
};
export type AgentSessionAuthorityLocator = {
    agent_id: string;
    delegation_id: string;
    team_id: string;
    work_item_id: string | null;
    project_id: string | null;
    work_item_project_id: string | null;
    session_token_id: string | null;
    installation_token_id: string | null;
    coordination_connection_id?: string | null;
    coordination_credential_id?: string | null;
};
export declare function authorizeCommandInTx(tx: PoolClient, input: {
    actor: ApiActor;
    sessionId: string;
    capability: Capability;
    operation: Parameters<typeof authorizeAgentMutation>[0]['operation'];
    idempotencyKey: string;
    expectedRevision?: number;
    resourceId?: string | null;
}): Promise<SessionFacts>;
export declare function assertCurrentAgentCredentialInTx(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<void>;
export declare function locateAgentSessionAuthority(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<AgentSessionAuthorityLocator>;
export declare function loadAgentSessionForMutation(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<SessionFacts>;
/**
 * Re-read a Session authority graph after its complete D/G/L/S/ST/IT/W/P plan
 * has already been locked by a wider transaction-level planner. This explicit
 * post-lock API never acquires a ranked lock; ordinary callers must use
 * loadAgentSessionForMutation instead.
 */
export declare function revalidateLockedAgentSessionForMutation(tx: PoolClient, actor: ApiActor, sessionId: string, locator: AgentSessionAuthorityLocator): Promise<SessionFacts>;
export declare function assertAgentWrite(input: {
    actor: ApiActor;
    session: SessionFacts;
    sessionId: string;
    capability: Capability;
    operation: Parameters<typeof authorizeAgentMutation>[0]["operation"];
    idempotencyKey: string;
    expectedRevision?: number;
    resourceId?: string | null;
}): void;
export declare function assertExactAgentProjectBinding(session: SessionFacts, projectId: string): void;
export {};
