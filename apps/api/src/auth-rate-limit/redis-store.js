import { createClient } from "redis";
export class RedisAuthRateLimitStore {
    #client;
    #commandTimeoutMs;
    #connecting;
    constructor(url, connectTimeoutMs, commandTimeoutMs) {
        this.#commandTimeoutMs = commandTimeoutMs;
        this.#client = createClient({
            url,
            disableOfflineQueue: true,
            socket: {
                connectTimeout: connectTimeoutMs,
                reconnectStrategy: false,
            },
        });
        this.#client.on("error", () => {
            // Availability is surfaced to the exact credential route making a call.
        });
    }
    async #ready() {
        if (this.#client.isReady)
            return;
        this.#connecting ??= this.#client.connect().finally(() => {
            this.#connecting = undefined;
        });
        await this.#within(this.#connecting);
    }
    async #within(promise) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error("Redis command deadline exceeded")), this.#commandTimeoutMs);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    async eval(script, options) {
        await this.#ready();
        return this.#within(this.#client.eval(script, options));
    }
    async set(key, value, options) {
        await this.#ready();
        return this.#within(this.#client.set(key, value, options));
    }
    async ping() {
        await this.#ready();
        return this.#within(this.#client.ping());
    }
    async close() {
        if (this.#client.isOpen)
            await this.#client.disconnect();
    }
}
