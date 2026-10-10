import type { ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { EventReader } from './event-reader.js';
import type { RealtimeCoordinator } from './coordinator.js';
export declare const parseEventBatchLimit: (value: string | undefined, fallback: number) => number;
export declare const writeRealtimeChunk: (response: ServerResponse, chunk: string, timeoutMs: number) => Promise<boolean>;
export type RealtimeStreamTermination = 'graceful' | 'backpressure';
export declare const finishRealtimeStream: (response: ServerResponse, termination: RealtimeStreamTermination) => void;
export declare const writeRealtimeStreamHeaders: (response: ServerResponse, webOrigin: string) => void;
export type RealtimeCapacity = Readonly<{
    tryAcquire: () => (() => void) | undefined;
}>;
export declare function createRealtimeCapacity(maxClients: number): RealtimeCapacity;
export declare const markRealtimeCapacityExceeded: (reply: Pick<FastifyReply, "header" | "code">) => void;
export declare function admitRealtimeClient(capacity: RealtimeCapacity, assertAvailable: () => Promise<unknown>, onAcquired?: (release: () => void) => void): Promise<() => void>;
export declare function registerRealtimeRoutes(app: FastifyInstance, { reader, coordinator, webOrigin, batchLimit, heartbeatMs, backpressureTimeoutMs, maxClients, onStreamError, }: {
    reader: EventReader;
    coordinator: RealtimeCoordinator;
    webOrigin: string;
    batchLimit?: number;
    heartbeatMs?: number;
    backpressureTimeoutMs?: number;
    maxClients?: number;
    onStreamError?: (request: FastifyRequest, error: unknown) => Promise<void> | void;
}): void;
