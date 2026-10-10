import { type Db } from '@workmesh/db';
export type AgentWebhookDelivery = {
    id: string;
    agentId: string;
    endpointId: string;
    secretVersion: number;
    deliveryId: string;
    eventId: string | null;
    eventType: string;
    sessionId: string | null;
    payload: unknown;
    endpointUrl: string;
    secretCiphertext: Buffer | string;
    secretIv: Buffer | string;
    secretAuthTag: Buffer | string;
    keyVersion: string;
    attemptCount: number;
    leaseExpiresAt?: Date | string;
};
export type WebhookResponse = {
    status: number;
    body?: string;
};
export type ResolvedWebhookAddress = {
    address: string;
    family: 4 | 6;
};
export type WebhookDnsLookup = (hostname: string) => Promise<ResolvedWebhookAddress[]>;
export type WebhookFetch = (url: string, init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    redirect: 'error';
    signal: AbortSignal;
    resolvedAddresses: readonly ResolvedWebhookAddress[];
    readBody?: boolean;
}) => Promise<WebhookResponse>;
export type AgentWebhookWorker = {
    claimDeliveries: (limit?: number, lockTimeoutSeconds?: number) => Promise<AgentWebhookDelivery[]>;
    deliver: (delivery: AgentWebhookDelivery) => Promise<void>;
    fail: (delivery: AgentWebhookDelivery, error: unknown) => Promise<void>;
    tick: () => Promise<void>;
};
export declare const masterKeyFromEnvironment: (value?: string | undefined) => Buffer;
export declare const decryptWebhookSecret: (input: {
    ciphertext: Buffer | string;
    iv: Buffer | string;
    authTag: Buffer | string;
}, masterKey: Buffer) => Buffer;
export declare const signWebhook: (secret: Buffer, timestampSeconds: number, rawBody: string) => string;
export declare const signaturesMatch: (left: string, right: string) => boolean;
/** Recommended retry schedule (seconds) with a bounded symmetric jitter. */
export declare const retryDelaySeconds: (attemptCount: number, random?: () => number) => number;
export declare class WebhookDeliveryError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    constructor(code: string, retryable?: boolean);
}
export declare const isUnsafeWebhookAddress: (address: string) => boolean;
export declare const systemWebhookDnsLookup: WebhookDnsLookup;
export declare const resolveWebhookTarget: (rawUrl: string, { dnsLookup, allowPrivateAgentWebhooks, }?: {
    dnsLookup?: WebhookDnsLookup;
    allowPrivateAgentWebhooks?: boolean;
}) => Promise<{
    url: URL;
    addresses: ResolvedWebhookAddress[];
}>;
/**
 * The connection uses an address from the just-validated DNS answer rather
 * than resolving the hostname again, closing the validation/request race.
 */
export declare const fetchResolvedWebhook: WebhookFetch;
export declare function createAgentWebhookWorker({ db, workerId, masterKey, fetcher, maxAttempts, random, dnsLookup, allowPrivateAgentWebhooks, }: {
    db: Db;
    workerId?: string;
    masterKey?: Buffer;
    fetcher?: WebhookFetch;
    maxAttempts?: number;
    random?: () => number;
    dnsLookup?: WebhookDnsLookup;
    allowPrivateAgentWebhooks?: boolean;
}): AgentWebhookWorker;
export declare const encryptWebhookSecretForTest: (secret: Buffer, masterKey: Buffer) => {
    ciphertext: string;
    iv: string;
    authTag: string;
};
