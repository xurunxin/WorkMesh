import type { Config } from "@workmesh/config";
import { AuthRateLimitMetrics } from "@workmesh/observability";
import type { AuthRateLimitEndpointClass } from "./inventory.js";
import type { AuthRateLimitStore } from "./redis-store.js";
export declare class AuthRateLimitedError extends Error {
    readonly retryAfterMs: number;
    readonly endpointClass: AuthRateLimitEndpointClass;
    constructor(endpointClass: AuthRateLimitEndpointClass, retryAfterMs: number);
}
export declare class AuthRateLimitUnavailableError extends Error {
    readonly endpointClass: AuthRateLimitEndpointClass;
    constructor(endpointClass: AuthRateLimitEndpointClass);
}
type Admission = Readonly<{
    endpointClass: AuthRateLimitEndpointClass;
    operationId: string;
    socketPeer: string;
    clientIp: string;
    subject?: string;
}>;
export declare class AuthRateLimiter {
    #private;
    constructor(store: AuthRateLimitStore, config: Config, metrics?: AuthRateLimitMetrics);
    admit(input: Admission): Promise<void>;
    credentialFailure(input: Admission): Promise<number>;
    credentialSuccess(input: Admission): Promise<void>;
    sampledThrottleLog(input: Admission): Promise<boolean>;
}
export type AuthRateLimitAdmission = Admission;
export {};
