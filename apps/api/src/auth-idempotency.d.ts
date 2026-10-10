import type { Pool, PoolClient } from "pg";
export declare const AUTH_REPLAY_WINDOW_MS: number;
export declare const AUTH_CONFLICT_RETENTION_MS: number;
export type AuthReplayEnvelope<T> = {
    status: number;
    body: T;
    cookie?: {
        action: "set";
        value: string;
        csrfToken: string;
    } | {
        action: "clear";
    };
};
type AuthIdempotencyInput = {
    idempotencyKey: string;
    subject: string;
    operation: string;
    request: unknown;
    clientContext: unknown;
};
export declare const canonicalJson: (value: unknown) => string;
export declare const replayKeyFingerprintMatches: (stored: string | null) => boolean;
export declare function authIdempotentTransaction<T>(db: Pool, input: AuthIdempotencyInput, handler: (tx: PoolClient) => Promise<AuthReplayEnvelope<T>>): Promise<AuthReplayEnvelope<T>>;
export declare const authClientContext: (request: {
    headers: Record<string, unknown>;
}) => Record<string, string | null>;
export {};
