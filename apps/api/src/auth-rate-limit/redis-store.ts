import { createClient, type RedisClientType } from "redis";

export interface AuthRateLimitStore {
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
  set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null>;
  close(): Promise<void>;
}

export class RedisAuthRateLimitStore implements AuthRateLimitStore {
  readonly #client: RedisClientType;
  readonly #commandTimeoutMs: number;
  #connecting?: Promise<unknown>;

  constructor(url: string, connectTimeoutMs: number, commandTimeoutMs: number) {
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

  async #ready(): Promise<void> {
    if (this.#client.isReady) return;
    this.#connecting ??= this.#client.connect().finally(() => {
      this.#connecting = undefined;
    });
    await this.#within(this.#connecting!);
  }

  async #within<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("Redis command deadline exceeded")),
            this.#commandTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown> {
    await this.#ready();
    return this.#within(this.#client.eval(script, options));
  }

  async set(
    key: string,
    value: string,
    options: { NX: true; EX: number },
  ): Promise<string | null> {
    await this.#ready();
    return this.#within(this.#client.set(key, value, options));
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.disconnect();
  }
}
