import type { PoolClient } from 'pg';
export declare function locateConnectionInstallationTokenId(tx: PoolClient, input: Readonly<{
    agentId: string;
    credentialHash: string;
}>): Promise<string | undefined>;
/**
 * Reconciles the exact Connection credential into the existing Installation
 * Token table used by execution-Session exchange. The token hash is the stable
 * credential identity; no plaintext credential is persisted or copied.
 */
export declare function reconcileConnectionInstallationToken(tx: PoolClient, input: Readonly<{
    agentId: string;
    credentialHash: string;
    expiresAt: Date | null;
    createdByActorId?: string;
    connectionId: string;
}>): Promise<string>;
