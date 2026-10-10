import type { PoolClient } from 'pg';
import type { ApiActor, RequestMeta } from './types.js';
/** Detect additive columns per transaction: migration fixtures deliberately use older schemas. */
export declare function hasExecutionOrigin(tx: PoolClient): Promise<boolean>;
export type ExecutionOrigin = Readonly<{
    kind: 'native' | 'connection' | 'unproven';
    sessionTokenId: string;
    installationTokenId: string | null;
    connectionId: string | null;
}>;
export declare function resolveExecutionOrigin(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<ExecutionOrigin>;
/** Discover identifiers before the outer Connection tier, then acquire the full authority plan. */
export declare function lockExecutionOriginAuthority(tx: PoolClient, actor: ApiActor, sessionId: string): Promise<void>;
export declare function saveExecutionOrigin(tx: PoolClient, meta: RequestMeta, sessionId: string): Promise<void>;
