import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { exchangeAgentSessionTokenResponseSchema } from "@workmesh/contracts";

const DEFAULT_REFRESH_MARGIN_MS = 180_000;
const MAX_REFRESH_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_CUMULATIVE_RETRY_DELAY_MS = 120_000;

type Fetch = typeof fetch;

export type RetentionSoakCredentialMetrics = Readonly<{
  refreshCount: number;
  maximumRefreshLatencyMs: number;
}>;

export type RetentionSoakCredentialManagerOptions = Readonly<{
  apiUrl: string;
  sessionId: string;
  installationToken: string;
  fetch?: Fetch;
  now?: () => number;
  monotonicNow?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  idempotencyKey?: () => string;
  refreshMarginMs?: number;
}>;

const parseRetryAfterMs = (
  value: string | null,
  now: number,
  fallbackMs: number,
): number => {
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(value);
  if (Number.isFinite(date))
    return Math.min(Math.max(0, date - now), MAX_RETRY_AFTER_MS);
  return fallbackMs;
};

export class RetentionSoakCredentialManager {
  readonly #apiUrl: string;
  readonly #sessionId: string;
  readonly #installationToken: string;
  readonly #fetch: Fetch;
  readonly #now: () => number;
  readonly #monotonicNow: () => number;
  readonly #sleep: (delayMs: number) => Promise<void>;
  readonly #idempotencyKey: () => string;
  readonly #refreshMarginMs: number;
  #sessionToken: string | undefined;
  #expiresAtMs = 0;
  #refreshCount = 0;
  #maximumRefreshLatencyMs = 0;
  #refreshInFlight: Promise<string> | undefined;

  constructor(options: RetentionSoakCredentialManagerOptions) {
    this.#apiUrl = options.apiUrl;
    this.#sessionId = options.sessionId;
    this.#installationToken = options.installationToken;
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? Date.now;
    this.#monotonicNow =
      options.monotonicNow ?? performance.now.bind(performance);
    this.#sleep =
      options.sleep ??
      ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.#idempotencyKey = options.idempotencyKey ?? randomUUID;
    this.#refreshMarginMs =
      options.refreshMarginMs ?? DEFAULT_REFRESH_MARGIN_MS;
  }

  async token(): Promise<string> {
    if (
      this.#sessionToken &&
      this.#expiresAtMs - this.#now() > this.#refreshMarginMs
    )
      return this.#sessionToken;
    if (this.#refreshInFlight) return this.#refreshInFlight;
    const refresh = this.#refresh();
    this.#refreshInFlight = refresh;
    try {
      return await refresh;
    } finally {
      if (this.#refreshInFlight === refresh) this.#refreshInFlight = undefined;
    }
  }

  metrics(): RetentionSoakCredentialMetrics {
    return {
      refreshCount: this.#refreshCount,
      maximumRefreshLatencyMs: this.#maximumRefreshLatencyMs,
    };
  }

  async #refresh(): Promise<string> {
    const idempotencyKey = this.#idempotencyKey();
    const startedAt = this.#monotonicNow();
    let cumulativeDelayMs = 0;
    for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.#fetch(
          `${this.#apiUrl}/api/v1/agent-sessions/${encodeURIComponent(
            this.#sessionId,
          )}/token/refresh`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.#installationToken}`,
              "content-type": "application/json",
              "idempotency-key": idempotencyKey,
            },
            body: "{}",
          },
        );
      } catch {
        if (attempt === MAX_REFRESH_ATTEMPTS)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_NETWORK_FAILED");
        const delayMs = Math.min(
          1_000 * 2 ** (attempt - 1),
          MAX_RETRY_AFTER_MS,
        );
        cumulativeDelayMs += delayMs;
        if (cumulativeDelayMs > MAX_CUMULATIVE_RETRY_DELAY_MS)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRY_DELAY_EXCEEDED");
        await this.#sleep(delayMs);
        continue;
      }

      if (response.ok) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RESPONSE_INVALID");
        }
        const parsed = exchangeAgentSessionTokenResponseSchema.safeParse(body);
        if (!parsed.success)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RESPONSE_INVALID");
        const expiresAtMs = Date.parse(parsed.data.expiresAt);
        if (
          !Number.isFinite(expiresAtMs) ||
          expiresAtMs - this.#now() <= this.#refreshMarginMs
        )
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_EXPIRY_INVALID");
        this.#sessionToken = parsed.data.sessionToken;
        this.#expiresAtMs = expiresAtMs;
        this.#refreshCount += 1;
        this.#maximumRefreshLatencyMs = Math.max(
          this.#maximumRefreshLatencyMs,
          this.#monotonicNow() - startedAt,
        );
        return parsed.data.sessionToken;
      }

      await response.arrayBuffer().catch(() => undefined);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable)
        throw new Error(`RETENTION_SOAK_TOKEN_REFRESH_HTTP_${response.status}`);
      if (attempt === MAX_REFRESH_ATTEMPTS)
        throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRIES_EXHAUSTED");
      const delayMs = parseRetryAfterMs(
        response.headers.get("retry-after"),
        this.#now(),
        Math.min(1_000 * 2 ** (attempt - 1), MAX_RETRY_AFTER_MS),
      );
      cumulativeDelayMs += delayMs;
      if (cumulativeDelayMs > MAX_CUMULATIVE_RETRY_DELAY_MS)
        throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRY_DELAY_EXCEEDED");
      await this.#sleep(delayMs);
    }
    throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRIES_EXHAUSTED");
  }
}

export const callRetentionSoakAgent = async (
  credentials: RetentionSoakCredentialManager,
  apiUrl: string,
  path: string,
  payload: object,
  options: Readonly<{
    fetch?: Fetch;
    idempotencyKey?: () => string;
    monotonicNow?: () => number;
  }> = {},
): Promise<number> => {
  const request = options.fetch ?? fetch;
  const idempotencyKey = options.idempotencyKey ?? randomUUID;
  const monotonicNow =
    options.monotonicNow ?? performance.now.bind(performance);
  const sessionToken = await credentials.token();
  const startedAt = monotonicNow();
  const response = await request(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey(),
    },
    body: JSON.stringify(payload),
  });
  await response.arrayBuffer();
  if (!response.ok)
    throw new Error(`RETENTION_SOAK_ACTIVE_WORKLOAD_HTTP_${response.status}`);
  return monotonicNow() - startedAt;
};
