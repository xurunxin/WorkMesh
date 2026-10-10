import type { PoolClient } from 'pg';
type HeartbeatKey = Readonly<{
    resourceKind: 'session' | 'lease';
    resourceId: string;
    idempotencyKey: string;
    requestHash: string;
}>;
export declare function isHeartbeatReplay(tx: PoolClient, input: HeartbeatKey): Promise<boolean>;
export declare function recordHeartbeatKey(tx: PoolClient, input: HeartbeatKey): Promise<void>;
export {};
