import type { Pool, PoolClient } from 'pg';
import type { ApiActor } from './types.js';
/** Identity recognition only. No usage update, C Session creation, mirror reconciliation, or token signing. */
export declare function resolveExecutionResultIdentity(db: Pool | PoolClient, credentialHash: string, connectionHeader: boolean): Promise<ApiActor>;
export declare function getExecutionResult(db: Pool, actor: ApiActor, sessionId: string, rawQuery: unknown): Promise<{
    action: {
        operationKey: string;
        kind: "complete" | "stop_ack";
        confirmation: "confirmed" | "unavailable";
        unavailableReason: "receipt_missing" | "receipt_expired" | "result_unavailable" | null;
    };
    session: {
        id: string;
        state: "queued" | "acknowledged" | "planning" | "executing" | "awaiting_input" | "awaiting_approval" | "blocked" | "paused" | "stopping" | "stale" | "completed" | "failed" | "canceled";
        revision: number;
    };
    originalResult: {
        state: "completed" | "canceled";
        revision: number;
        operationId: "completeAgentSession" | "acknowledgeAgentSessionStop";
        sessionId: string;
        resultReference: {
            type: "agent_session";
            id: string;
            revision: number;
        };
        eventReference: {
            cursor: string;
            id: string;
        } | null;
    } | null;
    cleanup: {
        cleanupSummary: string;
        residualRisks: string[];
    } | null;
}>;
