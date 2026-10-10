import type { Pool, PoolClient } from 'pg';
import type { WorkItemResponse } from '@workmesh/contracts';
type Queryable = Pick<Pool | PoolClient, 'query'>;
type WorkItemBase = Record<string, unknown> & {
    id: string;
    workspace_id: string;
    responsible_human_actor_id: string | null;
};
/**
 * Adds responsibility, assignment, and runtime executor projections in one
 * bounded query. Assignment comes from the active executor Delegation and is
 * visible before a queued Session obtains a lease. Runtime execution remains
 * lease-backed; the expiry predicate prevents a delayed Worker sweep from
 * exposing an already-expired executor.
 */
export declare function attachWorkItemExecutors<T extends WorkItemBase>(db: Queryable, items: readonly T[]): Promise<Array<T & Pick<WorkItemResponse, 'responsible_human' | 'active_assignment' | 'active_executor' | 'shared_reviewers'>>>;
export {};
