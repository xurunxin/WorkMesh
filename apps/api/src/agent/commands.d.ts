import type { Pool, PoolClient } from "pg";
import type { AgentSessionState, Capability, ClaimWorkItemInput, CompleteAgentSessionInput, PlanStepInput } from "@workmesh/contracts";
import type { ApiActor, RequestMeta } from "./types.js";
/** PostgreSQL returns bigint values as strings; Agent Session responses must be contract-shaped JSON. */
export declare function normalizeAgentSessionResponse(row: unknown): Record<string, unknown>;
/** Operational facts may be persisted, but credentials must never enter an event, activity, artifact, or approval payload. */
export declare function assertSanitized(value: unknown, path?: string): void;
export declare function assertSafeText(value: string | undefined, field: string): void;
export declare function queueWebhookDeliveries(tx: PoolClient, agentId: string, eventId: string, eventType: string, sessionId: string | undefined, payload: Record<string, unknown>): Promise<void>;
export type ExecutionInstallationAuthority = Readonly<{
    id: string;
    connection_id: string | null;
    credential_id: string | null;
    connection_delegation_id: string | null;
}>;
export declare function locateExecutionInstallationAuthority(tx: PoolClient, input: Readonly<{
    agentId: string;
    teamId: string;
    principalHumanActorId: string;
    installationTokenId?: string;
}>): Promise<ExecutionInstallationAuthority | undefined>;
/**
 * Connection-backed Installation authority is an outer lock tier. Lock every
 * selected Connection first and every exact credential second, both in stable
 * ID order, before entering the shared Agent authority lock plan. Native
 * Installation Tokens have neither row and therefore need no outer lock.
 */
export declare function lockExecutionInstallationAuthorities(tx: PoolClient, authorities: readonly Pick<ExecutionInstallationAuthority, 'connection_id' | 'credential_id'>[]): Promise<void>;
export declare function revalidateExecutionInstallationAuthority(tx: PoolClient, input: Readonly<{
    authority: ExecutionInstallationAuthority;
    agentId: string;
    teamId: string;
    principalHumanActorId: string;
}>): Promise<ExecutionInstallationAuthority>;
/**
 * Provision delivery for a newly-created session inside the caller's existing
 * transaction.  The exchange nonce is deliberately only placed in the target
 * agent's webhook delivery, never returned to the coordinating session.
 */
export declare function provisionNewSessionDelivery(tx: PoolClient, meta: RequestMeta, input: {
    sessionId: string;
    agentId: string;
    delegationId: string;
    teamId: string;
    workItemId: string | null;
    initialPrompt: string;
    installationAuthority: ExecutionInstallationAuthority;
}): Promise<void>;
/** Same idempotency record as Stage 0, deliberately scoped to the authenticated actor. */
export declare function agentMutate<T>(db: Pool, meta: RequestMeta, handler: (tx: PoolClient) => Promise<T>): Promise<T>;
export declare function assertHumanTeam(tx: PoolClient, actor: ApiActor, teamId: string, manage?: boolean): Promise<void>;
export declare function registerAgent(db: Pool, meta: RequestMeta, input: Record<string, unknown>): Promise<{
    installation_token: string;
}>;
export declare function updateAgent(db: Pool, meta: RequestMeta, id: string, revision: number, input: Record<string, unknown>): Promise<Record<string, unknown>>;
export declare function rotateWebhookSecret(db: Pool, meta: RequestMeta, agentId: string, endpointId: string, revision: number): Promise<{
    endpointId: string;
    version: number;
    secret: string;
}>;
export declare function createWebhookEndpoint(db: Pool, meta: RequestMeta, agentId: string, url: string): Promise<any>;
export declare function grantAgentTeamAccess(db: Pool, meta: RequestMeta, agentId: string, teamId: string, capabilities: Capability[]): Promise<any>;
export declare function revokeAgentTeamAccess(db: Pool, meta: RequestMeta, agentId: string, teamId: string): Promise<any>;
export declare function revokeDelegation(db: Pool, meta: RequestMeta, delegationId: string, revision: number): Promise<any>;
export declare function delegateAndStartAgentSession(db: Pool, meta: RequestMeta, workItemId: string, expectedRevision: number, input: {
    agentId: string;
    principalHumanActorId: string;
    role: "executor";
    requestedCapabilities: Capability[];
    initialPrompt: string;
    contextSnapshotId?: string;
    budget: unknown;
}): Promise<{
    delegation: {
        id: string;
        agent_id: string;
        agent_actor_id: string;
        principal_human_actor_id: string;
        role: string;
        scope_type: string;
        scope_id: string;
        permissions_snapshot: Capability[];
        revision: number;
    };
    session: Record<string, unknown>;
} | {
    delegation: Record<string, unknown>;
    session: Record<string, unknown>;
}>;
/**
 * Atomically admits the current Coordination Agent to an unassigned Work Item.
 * Connection and exact credential identity are locked before the established
 * Agent authority order. The response bootstrap is only stored in the encrypted
 * authentication idempotency record and returned to the same Coordination
 * Session; it is never written to an event or delivery payload.
 */
export declare function claimWorkItem(db: Pool, meta: RequestMeta, workItemId: string, expectedRevision: number, input: ClaimWorkItemInput): Promise<{
    delegation: Record<string, unknown>;
    session: Record<string, unknown>;
    exchangeToken: string;
}>;
export declare function resolveInstallationSessionSubject(db: Pool, sessionId: string, installationBearer: string, exchangeNonce?: string): Promise<string>;
export declare function exchangeAgentToken(db: Pool, input: {
    sessionId: string;
    nonce: string;
    installationBearer: string;
    idempotencyKey: string;
    clientContext: Record<string, string | null>;
}): Promise<{
    sessionToken: string;
    expiresAt: string;
}>;
export declare function refreshAgentToken(db: Pool, input: {
    sessionId: string;
    tokenId?: string;
    installationBearer: string;
    idempotencyKey: string;
    clientContext: Record<string, string | null>;
}): Promise<{
    sessionToken: string;
    expiresAt: string;
}>;
export declare function retrySession(db: Pool, meta: RequestMeta, sourceId: string, revision: number, input: {
    reason: string;
    initialPrompt?: string;
    reuseContext: boolean;
}): Promise<any>;
export declare function appendActivity(db: Pool, meta: RequestMeta, sessionId: string, input: {
    kind: string;
    summary: string;
    detailsMarkdown?: string;
    toolInvocation?: unknown;
    artifactIds: string[];
    references: unknown[];
    visibility: string;
    ephemeral: boolean;
}, revision?: number): Promise<any>;
export declare function acknowledge(db: Pool, meta: RequestMeta, sessionId: string, input: {
    summary: string;
    externalUrls: unknown[];
}): Promise<Record<string, unknown>>;
export declare function heartbeat(db: Pool, meta: RequestMeta, sessionId: string, input: {
    currentStepId?: string;
    usage: unknown;
}): Promise<Record<string, unknown>>;
export declare function transitionState(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: {
    state: AgentSessionState;
    reason: string;
}): Promise<any>;
export declare function publishPlan(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: {
    changeSummary: string;
    steps: PlanStepInput[];
    approvalId?: string;
    approvalPayloadHash?: string;
}): Promise<any>;
export declare function prompt(db: Pool, meta: RequestMeta, sessionId: string, input: {
    bodyMarkdown: string;
    planRevision?: number;
    workItemRevision?: number;
}, expectedRevision?: number): Promise<any>;
export declare function signal(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: {
    signal: "stop" | "pause" | "resume";
    reason: string;
    stopMode?: "graceful" | "immediate";
}): Promise<any>;
export declare function finishSession(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: CompleteAgentSessionInput | {
    code: string;
    summary: string;
    retryable: boolean;
    evidence: string[];
}, failed?: boolean): Promise<any>;
/** Shared command policy for direct completion and atomic Workbench Turn settlement. */
export declare function finishSessionInTransaction(tx: PoolClient, meta: RequestMeta, sessionId: string, expectedRevision: number, input: CompleteAgentSessionInput | {
    code: string;
    summary: string;
    retryable: boolean;
    evidence: string[];
}, failed?: boolean): Promise<any>;
export declare function stopAck(db: Pool, meta: RequestMeta, sessionId: string, expectedRevision: number, input: {
    cleanupSummary: string;
    residualRisks: string[];
}): Promise<any>;
export declare function publishArtifact(db: Pool, meta: RequestMeta, input: {
    sessionId: string;
    workItemId?: string;
    type: string;
    title: string;
    uri?: string;
    checksum?: string;
    sourceTool?: string;
    metadata: unknown;
}): Promise<any>;
export declare function requestApproval(db: Pool, meta: RequestMeta, input: {
    sessionId: string;
    approvalType: string;
    actionName: string;
    actionPayloadSanitized: unknown;
    actionPayloadHash: string;
    riskLevel: string;
    rationaleSummary: string;
    requiredApprovals: number;
    expiresAt: string;
}): Promise<{
    status: "canceled" | "expired" | "pending" | "approved" | "rejected" | "consumed";
    id: string;
    revision: number;
    workspace_id: string;
    session_id: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
    requested_by_actor_id: string;
    approval_type: string;
    action_name: string;
    action_payload_sanitized: Record<string, unknown>;
    action_payload_hash: string;
    risk_level: "high" | "medium" | "low" | "critical";
    rationale_summary: string;
    required_approvals: number;
    consumed_at: string | null;
    decisions: {
        reason: string;
        actor_id: string;
        decision: "approved" | "rejected";
        source: "human" | "workspace_policy";
        policy_workspace_id: string | null;
        policy_revision: number | null;
        decided_at: string;
    }[];
    quorum: {
        required: number;
        approved: number;
        rejected: number;
        reached: boolean;
    };
    viewer_actionability?: {
        status: "actionable";
        allowed_decisions: ["approved", "rejected"];
    } | {
        status: "blocked";
        reason: "expired" | "authority_revoked" | "viewer_already_decided" | "session_inactive" | "already_decided";
    } | undefined;
}>;
export declare function decideApproval(db: Pool, meta: RequestMeta, approvalId: string, expectedRevision: number, input: {
    decision: "approved" | "rejected";
    reason: string;
}): Promise<{
    expired: boolean;
    approval?: undefined;
    decision?: undefined;
    quorum?: undefined;
    status?: undefined;
} | {
    approval: {
        status: "canceled" | "expired" | "pending" | "approved" | "rejected" | "consumed";
        id: string;
        revision: number;
        workspace_id: string;
        session_id: string;
        expires_at: string;
        created_at: string;
        updated_at: string;
        requested_by_actor_id: string;
        approval_type: string;
        action_name: string;
        action_payload_sanitized: Record<string, unknown>;
        action_payload_hash: string;
        risk_level: "high" | "medium" | "low" | "critical";
        rationale_summary: string;
        required_approvals: number;
        consumed_at: string | null;
        decisions: {
            reason: string;
            actor_id: string;
            decision: "approved" | "rejected";
            source: "human" | "workspace_policy";
            policy_workspace_id: string | null;
            policy_revision: number | null;
            decided_at: string;
        }[];
        quorum: {
            required: number;
            approved: number;
            rejected: number;
            reached: boolean;
        };
        viewer_actionability?: {
            status: "actionable";
            allowed_decisions: ["approved", "rejected"];
        } | {
            status: "blocked";
            reason: "expired" | "authority_revoked" | "viewer_already_decided" | "session_inactive" | "already_decided";
        } | undefined;
    };
    decision: {
        decided_at: string;
        actor_id: string;
        decision: "approved" | "rejected";
        reason: string;
        source: "human";
        policy_workspace_id: null;
        policy_revision: null;
    };
    quorum: {
        required: number;
        approved: number;
        rejected: number;
        reached: boolean;
    };
    status: string;
    expired?: undefined;
}>;
export declare function consumeApproval(db: Pool, meta: RequestMeta, approvalId: string, expectedRevision: number, input: {
    actionPayloadHash: string;
}): Promise<any>;
