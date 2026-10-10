import type { Pool, PoolClient } from 'pg';
import { type ApprovalResponse, type ApprovalViewerActionability } from '@workmesh/contracts';
import type { ApiActor } from './types.js';
type Queryable = Pick<Pool | PoolClient, 'query'>;
type ApprovalRow = Record<string, unknown> & {
    id: string;
    required_approvals: number;
    status: string;
    expires_at: Date | string;
};
export type ApprovalQuorum = {
    required: number;
    approved: number;
    rejected: number;
    reached: boolean;
};
export declare function normalizeApprovalResponse(row: Record<string, unknown>, decisions: unknown, quorum: ApprovalQuorum, viewerActionability?: ApprovalViewerActionability): ApprovalResponse;
/**
 * Adds immutable decisions, quorum, and the current Human viewer preview to a
 * page of Approval rows in one bounded query. Agent context reads intentionally
 * omit viewer_actionability because Agents cannot make Human decisions.
 */
export declare function projectApprovalResponses(db: Queryable, rows: readonly ApprovalRow[], viewer: ApiActor, now?: number): Promise<ApprovalResponse[]>;
export declare function loadApprovalViewerActionability(db: Queryable, approvalIds: readonly string[], viewer: ApiActor, now?: number): Promise<Map<string, ApprovalViewerActionability>>;
export {};
