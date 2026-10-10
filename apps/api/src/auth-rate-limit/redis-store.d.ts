export interface AuthRateLimitStore {
    eval(script: string, options: {
        keys: string[];
        arguments: string[];
    }): Promise<unknown>;
    set(key: string, value: string, options: {
        NX: true;
        EX: number;
    }): Promise<string | null>;
    ping?(): Promise<string>;
    close(): Promise<void>;
}
export declare class RedisAuthRateLimitStore implements AuthRateLimitStore {
    #private;
    constructor(url: string, connectTimeoutMs: number, commandTimeoutMs: number);
    eval(script: string, options: {
        keys: string[];
        arguments: string[];
    }): Promise<unknown>;
    set(key: string, value: string, options: {
        NX: true;
        EX: number;
    }): Promise<string | null>;
    ping(): Promise<string>;
    close(): Promise<void>;
}
