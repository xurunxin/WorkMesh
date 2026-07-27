import crypto from "node:crypto";
import type { Config } from "@workmesh/config";
import {
  AuthRateLimitMetrics,
  type AuthRateLimitEndpoint,
} from "@workmesh/observability";
import type { AuthRateLimitEndpointClass } from "./inventory.js";
import type { AuthRateLimitStore } from "./redis-store.js";

const ADMIT_SCRIPT = `
local nowParts = redis.call('TIME')
local now = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local count = tonumber(ARGV[1])
local retry = 0
for i = 1, count do
  local capacity = tonumber(ARGV[2 + (i - 1) * 2])
  local refill = tonumber(ARGV[3 + (i - 1) * 2])
  local values = redis.call('HMGET', KEYS[i], 'tokens', 'last')
  local tokens = tonumber(values[1]) or capacity
  local last = tonumber(values[2]) or now
  tokens = math.min(capacity, tokens + math.max(0, now - last) / refill)
  if tokens < 1 then retry = math.max(retry, math.ceil((1 - tokens) * refill)) end
end
local failureUntil = tonumber(redis.call('HGET', KEYS[count + 1], 'until')) or 0
if failureUntil > now then retry = math.max(retry, failureUntil - now) end
if retry > 0 then return {0, retry} end
for i = 1, count do
  local capacity = tonumber(ARGV[2 + (i - 1) * 2])
  local refill = tonumber(ARGV[3 + (i - 1) * 2])
  local values = redis.call('HMGET', KEYS[i], 'tokens', 'last')
  local tokens = tonumber(values[1]) or capacity
  local last = tonumber(values[2]) or now
  tokens = math.min(capacity, tokens + math.max(0, now - last) / refill) - 1
  redis.call('HSET', KEYS[i], 'tokens', tokens, 'last', now)
  redis.call('PEXPIRE', KEYS[i], math.ceil(capacity * refill * 2))
end
return {1, 0}
`;

const FAILURE_SCRIPT = `
local nowParts = redis.call('TIME')
local now = tonumber(nowParts[1]) * 1000 + math.floor(tonumber(nowParts[2]) / 1000)
local count = tonumber(redis.call('HINCRBY', KEYS[1], 'count', 1))
local delay = math.min(tonumber(ARGV[2]), tonumber(ARGV[1]) * (2 ^ math.min(count - 1, 20)))
redis.call('HSET', KEYS[1], 'until', now + delay)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]) * 2)
return {count, delay}
`;

const SUCCESS_SCRIPT = `return redis.call('DEL', KEYS[1])`;

export class AuthRateLimitedError extends Error {
  readonly retryAfterMs: number;
  readonly endpointClass: AuthRateLimitEndpointClass;
  constructor(endpointClass: AuthRateLimitEndpointClass, retryAfterMs: number) {
    super("Authentication request rate limited");
    this.name = "AuthRateLimitedError";
    this.endpointClass = endpointClass;
    this.retryAfterMs = Math.max(1, retryAfterMs);
  }
}

export class AuthRateLimitUnavailableError extends Error {
  readonly endpointClass: AuthRateLimitEndpointClass;
  constructor(endpointClass: AuthRateLimitEndpointClass) {
    super("Authentication rate-limit service unavailable");
    this.name = "AuthRateLimitUnavailableError";
    this.endpointClass = endpointClass;
  }
}

type Admission = Readonly<{
  endpointClass: AuthRateLimitEndpointClass;
  operationId: string;
  socketPeer: string;
  clientIp: string;
  subject?: string;
}>;

type Dimension = Readonly<{ kind: string; value: string; capacity: number }>;

export class AuthRateLimiter {
  readonly #store: AuthRateLimitStore;
  readonly #config: Config;
  readonly #hmacKey: Buffer;
  readonly #metrics: AuthRateLimitMetrics;

  constructor(
    store: AuthRateLimitStore,
    config: Config,
    metrics = new AuthRateLimitMetrics(),
  ) {
    this.#store = store;
    this.#config = config;
    this.#metrics = metrics;
    const source = Buffer.from(
      config.AUTH_RATE_LIMIT_HMAC_KEY ?? config.SESSION_SECRET,
      "utf8",
    );
    this.#hmacKey = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        source,
        Buffer.from("workmesh-auth-rate-limit"),
        Buffer.from("redis-key-hmac-v1"),
        32,
      ),
    );
  }

  #fingerprint(kind: string, value: string): string {
    return crypto
      .createHmac("sha256", this.#hmacKey)
      .update(`${kind}\0${value}`)
      .digest("hex");
  }

  #key(kind: string, value: string): string {
    return `{authrl}:v1:${kind}:${this.#fingerprint(kind, value)}`;
  }

  #failureKey(input: Admission): string {
    return this.#key(
      "failure",
      `${input.operationId}\0${input.clientIp}\0${input.subject ?? "-"}`,
    );
  }

  #dimensions(input: Admission): Dimension[] {
    const dimensions: Dimension[] = [
      {
        kind: "endpoint",
        value: input.operationId,
        capacity: this.#config.AUTH_RATE_LIMIT_ENDPOINT_BURST,
      },
      {
        kind: "socket",
        value: input.socketPeer,
        capacity: this.#config.AUTH_RATE_LIMIT_SOCKET_BURST,
      },
      {
        kind: "client",
        value: input.clientIp,
        capacity: this.#config.AUTH_RATE_LIMIT_CLIENT_IP_BURST,
      },
    ];
    if (input.endpointClass === "install") {
      dimensions.push({
        kind: "bootstrap",
        value: "global",
        capacity: this.#config.AUTH_RATE_LIMIT_INSTALL_BURST,
      });
    }
    if (input.subject) {
      dimensions.push({
        kind: "subject-client",
        value: `${input.operationId}\0${input.subject}\0${input.clientIp}`,
        capacity: this.#config.AUTH_RATE_LIMIT_SUBJECT_BURST,
      });
    }
    return dimensions;
  }

  async admit(input: Admission): Promise<void> {
    const dimensions = this.#dimensions(input);
    try {
      const raw = await this.#store.eval(ADMIT_SCRIPT, {
        keys: [
          ...dimensions.map((dimension) =>
            this.#key(dimension.kind, dimension.value),
          ),
          this.#failureKey(input),
        ],
        arguments: [
          String(dimensions.length),
          ...dimensions.flatMap((dimension) => [
            String(dimension.capacity),
            String(this.#config.AUTH_RATE_LIMIT_REFILL_MS),
          ]),
        ],
      });
      const result = raw as [number | string, number | string];
      if (Number(result[0]) !== 1) {
        this.#metrics.record(
          input.endpointClass as AuthRateLimitEndpoint,
          "limited",
        );
        throw new AuthRateLimitedError(input.endpointClass, Number(result[1]));
      }
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "allowed",
      );
    } catch (error) {
      if (error instanceof AuthRateLimitedError) throw error;
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "unavailable",
      );
      throw new AuthRateLimitUnavailableError(input.endpointClass);
    }
  }

  async credentialFailure(input: Admission): Promise<number> {
    try {
      const result = (await this.#store.eval(FAILURE_SCRIPT, {
        keys: [this.#failureKey(input)],
        arguments: [
          String(this.#config.AUTH_RATE_LIMIT_BACKOFF_BASE_MS),
          String(this.#config.AUTH_RATE_LIMIT_BACKOFF_MAX_MS),
        ],
      })) as [number | string, number | string];
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "credential_failure",
      );
      return Number(result[1]);
    } catch {
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "unavailable",
      );
      throw new AuthRateLimitUnavailableError(input.endpointClass);
    }
  }

  async credentialSuccess(input: Admission): Promise<void> {
    try {
      await this.#store.eval(SUCCESS_SCRIPT, {
        keys: [this.#failureKey(input)],
        arguments: [],
      });
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "credential_success",
      );
    } catch {
      this.#metrics.record(
        input.endpointClass as AuthRateLimitEndpoint,
        "unavailable",
      );
      throw new AuthRateLimitUnavailableError(input.endpointClass);
    }
  }

  async sampledThrottleLog(input: Admission): Promise<boolean> {
    try {
      return (
        (await this.#store.set(
          this.#key("log-sample", `${input.operationId}\0${input.clientIp}`),
          "1",
          { NX: true, EX: 60 },
        )) === "OK"
      );
    } catch {
      return false;
    }
  }
}

export type AuthRateLimitAdmission = Admission;
