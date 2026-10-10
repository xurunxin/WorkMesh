import type { PoolClient } from 'pg';
/** Caller holds the parent authority/session locks; both creation paths share this admission. */
export declare function admitChildSession(tx: PoolClient, parent: {
    id: string;
    current_plan_version_id: string | null;
    max_child_sessions: number;
    budget: Record<string, unknown>;
}, input: {
    planStepId: string;
    planVersionId: string;
    budget?: Record<string, number>;
}): Promise<Record<string, number>>;
