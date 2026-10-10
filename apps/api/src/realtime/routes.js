import { DomainError } from '@workmesh/domain';
import { parseDurableCursor } from './cursor.js';
const header = (request, name) => request.headers[name];
export const parseEventBatchLimit = (value, fallback) => {
    if (value === undefined)
        return fallback;
    if (!/^[1-9][0-9]{0,2}$/.test(value))
        throw new DomainError('VALIDATION_ERROR', 'Event batch limit must be a canonical integer between 1 and 500');
    const limit = Number(value);
    if (limit > 500)
        throw new DomainError('VALIDATION_ERROR', 'Event batch limit must be a canonical integer between 1 and 500');
    return limit;
};
const waitForDrain = async (response, timeoutMs) => new Promise(resolve => {
    let settled = false;
    const finish = (value) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        response.off('drain', drained);
        response.off('close', closed);
        resolve(value);
    };
    const drained = () => finish(true);
    const closed = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    response.once('drain', drained);
    response.once('close', closed);
});
export const writeRealtimeChunk = async (response, chunk, timeoutMs) => response.write(chunk)
    ? true
    : waitForDrain(response, timeoutMs);
export const finishRealtimeStream = (response, termination) => {
    if (termination === 'backpressure') {
        if (!response.destroyed)
            response.destroy();
        return;
    }
    if (!response.writableEnded)
        response.end();
};
export const writeRealtimeStreamHeaders = (response, webOrigin) => {
    response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'access-control-allow-origin': webOrigin,
        'access-control-allow-credentials': 'true',
    });
    // A caught-up stream may not write a body until the next heartbeat. Flush the
    // admission result now so clients do not confuse an idle stream with a failed
    // connection.
    response.flushHeaders();
};
const cursorExpiredControl = (error) => `event: control\ndata: ${JSON.stringify({
    type: 'cursor.expired',
    error: {
        code: error.code,
        message: error.message,
        details: error.details,
    },
})}\n\n`;
export function createRealtimeCapacity(maxClients) {
    let activeClients = 0;
    return {
        tryAcquire: () => {
            if (activeClients >= maxClients)
                return undefined;
            activeClients += 1;
            let released = false;
            return () => {
                if (released)
                    return;
                released = true;
                activeClients -= 1;
            };
        },
    };
}
const capacityExceeded = () => new DomainError('REALTIME_CAPACITY_EXCEEDED', 'Realtime connection capacity is temporarily exhausted', { retryable: true, retryAfterSeconds: 1 });
export const markRealtimeCapacityExceeded = (reply) => {
    reply.header('retry-after', '1');
    reply.code(503);
};
export async function admitRealtimeClient(capacity, assertAvailable, onAcquired) {
    const release = capacity.tryAcquire();
    if (!release)
        throw capacityExceeded();
    try {
        onAcquired?.(release);
        await assertAvailable();
        return release;
    }
    catch (error) {
        release();
        throw error;
    }
}
export function registerRealtimeRoutes(app, { reader, coordinator, webOrigin, batchLimit = 100, heartbeatMs = 15_000, backpressureTimeoutMs = 5_000, maxClients = 1_000, onStreamError, }) {
    const capacity = createRealtimeCapacity(maxClients);
    app.get('/api/v1/events', async (request) => {
        const query = request.query;
        const cursor = parseDurableCursor(query.cursor ?? '0');
        const limit = parseEventBatchLimit(query.limit, batchLimit);
        return reader.list(request.actor, cursor, limit);
    });
    app.get('/api/v1/events/stream', async (request, reply) => {
        let closed = false;
        let cleanedUp = false;
        let pendingWake = true;
        let wake;
        let unsubscribe = () => undefined;
        let releaseCapacity = () => undefined;
        let closeListenerRegistered = false;
        let termination = 'graceful';
        const notify = () => {
            pendingWake = true;
            wake?.();
        };
        function cleanup() {
            if (cleanedUp)
                return;
            cleanedUp = true;
            if (closeListenerRegistered) {
                request.raw.off('close', stop);
                closeListenerRegistered = false;
            }
            try {
                unsubscribe();
            }
            finally {
                releaseCapacity();
            }
        }
        function stop() {
            closed = true;
            wake?.();
            cleanup();
        }
        try {
            const query = request.query;
            let cursor = parseDurableCursor(header(request, 'last-event-id') ?? query.cursor ?? '0');
            const actor = request.actor;
            // This check intentionally precedes response headers so an already
            // expired reconnect receives the ordinary structured HTTP 409 response.
            try {
                releaseCapacity = await admitRealtimeClient(capacity, () => reader.assertAvailable(actor.workspaceId, cursor), release => {
                    releaseCapacity = release;
                    request.raw.once('close', stop);
                    closeListenerRegistered = true;
                });
            }
            catch (error) {
                if (error instanceof DomainError
                    && error.code === 'REALTIME_CAPACITY_EXCEEDED')
                    markRealtimeCapacityExceeded(reply);
                throw error;
            }
            if (closed)
                return reply;
            unsubscribe = coordinator.subscribe(actor.workspaceId, notify);
            writeRealtimeStreamHeaders(reply.raw, webOrigin);
            const waitForWake = async () => {
                if (closed)
                    return 'closed';
                if (pendingWake) {
                    pendingWake = false;
                    return 'wake';
                }
                return new Promise(resolve => {
                    const timer = setTimeout(() => {
                        wake = undefined;
                        resolve('heartbeat');
                    }, heartbeatMs);
                    wake = () => {
                        clearTimeout(timer);
                        wake = undefined;
                        resolve(closed ? 'closed' : 'wake');
                    };
                });
            };
            void (async () => {
                try {
                    while (!closed) {
                        const signal = await waitForWake();
                        if (signal === 'closed')
                            break;
                        if (signal === 'heartbeat') {
                            if (!await writeRealtimeChunk(reply.raw, ': heartbeat\n\n', backpressureTimeoutMs)) {
                                coordinator.record('slow_client');
                                termination = 'backpressure';
                                break;
                            }
                            continue;
                        }
                        while (!closed) {
                            let events;
                            try {
                                events = await reader.list(actor, cursor, batchLimit);
                            }
                            catch (error) {
                                if (error instanceof DomainError
                                    && error.code === 'CURSOR_EXPIRED') {
                                    coordinator.record('cursor_expired');
                                    const sent = await writeRealtimeChunk(reply.raw, cursorExpiredControl(error), backpressureTimeoutMs);
                                    if (!sent) {
                                        coordinator.record('slow_client');
                                        termination = 'backpressure';
                                    }
                                    closed = true;
                                    break;
                                }
                                throw error;
                            }
                            if (!events.length)
                                break;
                            coordinator.record('delivery_batch');
                            for (const event of events) {
                                if (closed)
                                    break;
                                const sent = await writeRealtimeChunk(reply.raw, `id: ${event.cursor}\ndata: ${JSON.stringify(event)}\n\n`, backpressureTimeoutMs);
                                if (!sent) {
                                    coordinator.record('slow_client');
                                    termination = 'backpressure';
                                    closed = true;
                                    break;
                                }
                                cursor = event.cursor;
                            }
                            if (events.length < batchLimit)
                                break;
                        }
                    }
                }
                catch (error) {
                    await onStreamError?.(request, error);
                }
                finally {
                    closed = true;
                    cleanup();
                    finishRealtimeStream(reply.raw, termination);
                }
            })();
            return reply;
        }
        catch (error) {
            cleanup();
            throw error;
        }
    });
}
