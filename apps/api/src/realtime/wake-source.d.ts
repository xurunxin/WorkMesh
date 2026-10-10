export type RealtimeWakeHint = Readonly<{
    workspaceId: string;
    cursor: string;
}>;
export type WakeAvailability = 'healthy' | 'unavailable';
export type RealtimeWakeSource = Readonly<{
    start: (onHint: (hint: RealtimeWakeHint) => void, onAvailability: (availability: WakeAvailability) => void) => void;
    close: () => Promise<void>;
}>;
export declare class RedisStreamWakeSource implements RealtimeWakeSource {
    #private;
    constructor(redisUrl: string);
    start(onHint: (hint: RealtimeWakeHint) => void, onAvailability: (availability: WakeAvailability) => void): void;
    close(): Promise<void>;
}
export declare class NoopWakeSource implements RealtimeWakeSource {
    start(_onHint: (hint: RealtimeWakeHint) => void, onAvailability: (availability: WakeAvailability) => void): void;
    close(): Promise<void>;
}
