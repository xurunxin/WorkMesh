import { createClient } from 'redis';
import { parseDurableCursor } from './cursor.js';
const streamKey = 'workmesh:domain-events';
export class RedisStreamWakeSource {
    #client;
    #running = false;
    #loop;
    constructor(redisUrl) {
        this.#client = createClient({ url: redisUrl });
        this.#client.on('error', () => undefined);
    }
    start(onHint, onAvailability) {
        if (this.#running)
            return;
        this.#running = true;
        this.#loop = this.#run(onHint, onAvailability);
    }
    async #run(onHint, onAvailability) {
        let streamId = '$';
        while (this.#running) {
            try {
                if (!this.#client.isOpen)
                    await this.#client.connect();
                onAvailability('healthy');
                const streams = await this.#client.xRead({ key: streamKey, id: streamId }, { BLOCK: 1_000, COUNT: 100 });
                for (const stream of streams ?? [])
                    for (const message of stream.messages) {
                        streamId = message.id;
                        const workspaceId = message.message.workspaceId;
                        const cursor = message.message.cursor;
                        if (workspaceId && cursor)
                            try {
                                onHint({
                                    workspaceId,
                                    cursor: parseDurableCursor(cursor),
                                });
                            }
                            catch {
                                // A malformed hint is ignored. PostgreSQL reconciliation remains
                                // the only durable source and will observe the committed event.
                            }
                    }
            }
            catch {
                onAvailability('unavailable');
                if (this.#client.isOpen)
                    this.#client.disconnect();
                await new Promise(resolve => setTimeout(resolve, 1_000));
            }
        }
    }
    async close() {
        this.#running = false;
        if (this.#client.isOpen)
            this.#client.disconnect();
        await this.#loop;
    }
}
export class NoopWakeSource {
    start(_onHint, onAvailability) {
        onAvailability('unavailable');
    }
    async close() { }
}
