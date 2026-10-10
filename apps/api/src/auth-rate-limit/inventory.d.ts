export type AuthRateLimitEndpointClass = "install" | "login" | "agent_token" | "handoff_target" | "pairing";
export type AuthRateLimitSubject = "none" | "email" | "session" | "handoff" | "pairing";
export type AuthRateLimitRoute = Readonly<{
    method: "GET" | "POST";
    path: string;
    operationId: string;
    endpointClass: AuthRateLimitEndpointClass;
    subject: AuthRateLimitSubject;
}>;
export declare const authRateLimitInventory: readonly AuthRateLimitRoute[];
export declare function authRateLimitRoute(method: string, path: string): AuthRateLimitRoute | undefined;
export declare function assertAuthRateLimitInventory(): void;
