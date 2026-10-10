import type { Pool } from 'pg';
import type { RealtimeWakeSource } from './wake-source.js';
export type RealtimeMetricEvent = 'wake_hint' | 'reconcile_changed' | 'reconcile_error' | 'wake_unavailable' | 'delivery_batch' | 'cursor_expired' | 'slow_client';
export type RealtimeMetricRecorder = Readonly<{
    record: (event: RealtimeMetricEvent) => void;
}>;
export type RealtimeCoordinator = Readonly<{
    subscribe: (workspaceId: string, listener: () => void) => () => void;
    record: (event: RealtimeMetricEvent) => void;
    close: () => Promise<void>;
}>;
export declare function createRealtimeCoordinator({ db, wakeSource, metrics, onReconcileError, healthyReconcileMs, fallbackReconcileMs, }: {
    db: Pool;
    wakeSource: RealtimeWakeSource;
    metrics?: RealtimeMetricRecorder;
    onReconcileError?: (error: unknown) => void;
    healthyReconcileMs?: number;
    fallbackReconcileMs?: number;
}): RealtimeCoordinator;
