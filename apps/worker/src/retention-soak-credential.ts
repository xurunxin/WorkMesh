import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  agentSessionResponseSchema,
  exchangeAgentSessionTokenResponseSchema,
} from "@workmesh/contracts";
import {
  RETENTION_SOAK_REFRESH_BUDGET_MS,
  RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS,
} from "./retention-soak.js";

const DEFAULT_REFRESH_MARGIN_MS = 180_000;
const MAX_REFRESH_ATTEMPTS = 3;
const MAX_RETRY_AFTER_MS = 60_000;
const MAX_CUMULATIVE_RETRY_DELAY_MS = 120_000;
const DEFAULT_REQUEST_TIMEOUT_MS = RETENTION_SOAK_WORKLOAD_REQUEST_BUDGET_MS;

type Fetch = typeof fetch;

export type RetentionSoakCredentialMetrics = Readonly<{
  refreshCount: number;
  maximumRefreshLatencyMs: number;
  expiredBeforeRefreshCount: number;
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
  requestTimeoutMs?: number;
  refreshBudgetMs?: number;
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
  readonly #requestTimeoutMs: number;
  readonly #refreshBudgetMs: number;
  #sessionToken: string | undefined;
  #expiresAtMs = 0;
  #refreshCount = 0;
  #maximumRefreshLatencyMs = 0;
  #expiredBeforeRefreshCount = 0;
  #refreshInFlight: Promise<string> | undefined;
  #operationTail: Promise<void> = Promise.resolve();

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
    this.#requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#refreshBudgetMs =
      options.refreshBudgetMs ?? RETENTION_SOAK_REFRESH_BUDGET_MS;
    if (
      !Number.isFinite(this.#requestTimeoutMs) ||
      this.#requestTimeoutMs <= 0 ||
      !Number.isFinite(this.#refreshBudgetMs) ||
      this.#refreshBudgetMs <= 0 ||
      this.#refreshBudgetMs > RETENTION_SOAK_REFRESH_BUDGET_MS
    )
      throw new Error("RETENTION_SOAK_TOKEN_REFRESH_BUDGET_INVALID");
  }

  async token(): Promise<string> {
    return await this.#runExclusive(async () => await this.#tokenUnlocked());
  }

  async withToken<T>(operation: (token: string) => Promise<T>): Promise<T> {
    return await this.#runExclusive(
      async () => await operation(await this.#tokenUnlocked()),
    );
  }

  async #runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#operationTail.catch(() => undefined);
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#operationTail = previous.then(() => current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #tokenUnlocked(): Promise<string> {
    const now = this.#now();
    if (this.#sessionToken && now >= this.#expiresAtMs) {
      this.#expiredBeforeRefreshCount += 1;
      this.#sessionToken = undefined;
    }
    if (this.#sessionToken && this.#expiresAtMs - now > this.#refreshMarginMs)
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
      expiredBeforeRefreshCount: this.#expiredBeforeRefreshCount,
    };
  }

  async #refresh(): Promise<string> {
    const idempotencyKey = this.#idempotencyKey();
    const startedAt = this.#monotonicNow();
    const remainingBudgetMs = (): number =>
      this.#refreshBudgetMs - (this.#monotonicNow() - startedAt);
    const assertBudgetRemaining = (): void => {
      if (remainingBudgetMs() <= 0)
        throw new Error("RETENTION_SOAK_TOKEN_REFRESH_BUDGET_EXCEEDED");
    };
    const sleepWithinBudget = async (delayMs: number): Promise<void> => {
      if (delayMs >= remainingBudgetMs())
        throw new Error("RETENTION_SOAK_TOKEN_REFRESH_BUDGET_EXCEEDED");
      await this.#sleep(delayMs);
      assertBudgetRemaining();
    };
    let cumulativeDelayMs = 0;
    for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
      assertBudgetRemaining();
      let response: Response | undefined;
      let body: unknown;
      let responseBodyInvalid = false;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(this.#requestTimeoutMs, remainingBudgetMs()),
      );
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
            signal: controller.signal,
          },
        );
        if (response.ok) body = await response.json();
        else await response.arrayBuffer();
      } catch {
        responseBodyInvalid =
          response?.ok === true && !controller.signal.aborted;
        response = undefined;
      } finally {
        clearTimeout(timeout);
      }
      assertBudgetRemaining();
      if (responseBodyInvalid)
        throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RESPONSE_INVALID");
      if (!response) {
        if (attempt === MAX_REFRESH_ATTEMPTS)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_NETWORK_FAILED");
        const delayMs = Math.min(
          1_000 * 2 ** (attempt - 1),
          MAX_RETRY_AFTER_MS,
        );
        cumulativeDelayMs += delayMs;
        if (cumulativeDelayMs > MAX_CUMULATIVE_RETRY_DELAY_MS)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRY_DELAY_EXCEEDED");
        await sleepWithinBudget(delayMs);
        continue;
      }

      if (response.ok) {
        const parsed = exchangeAgentSessionTokenResponseSchema.safeParse(body);
        if (!parsed.success)
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RESPONSE_INVALID");
        const expiresAtMs = Date.parse(parsed.data.expiresAt);
        if (
          !Number.isFinite(expiresAtMs) ||
          expiresAtMs - this.#now() <= this.#refreshMarginMs
        )
          throw new Error("RETENTION_SOAK_TOKEN_REFRESH_EXPIRY_INVALID");
        if (this.#sessionToken && this.#now() >= this.#expiresAtMs)
          this.#expiredBeforeRefreshCount += 1;
        this.#sessionToken = parsed.data.sessionToken;
        this.#expiresAtMs = expiresAtMs;
        this.#refreshCount += 1;
        this.#maximumRefreshLatencyMs = Math.max(
          this.#maximumRefreshLatencyMs,
          this.#monotonicNow() - startedAt,
        );
        return parsed.data.sessionToken;
      }

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
      await sleepWithinBudget(delayMs);
    }
    throw new Error("RETENTION_SOAK_TOKEN_REFRESH_RETRIES_EXHAUSTED");
  }
}

type AuthorizedCallResult = Readonly<{
  latencyMs: number;
  body: unknown;
}>;

const callRetentionSoakAgentInternal = async (
  credentials: RetentionSoakCredentialManager,
  apiUrl: string,
  path: string,
  payload: object,
  options: Readonly<{
    fetch?: Fetch;
    idempotencyKey?: () => string;
    monotonicNow?: () => number;
    requestTimeoutMs?: number;
    readJson?: boolean;
  }> = {},
): Promise<AuthorizedCallResult> => {
  const request = options.fetch ?? fetch;
  const idempotencyKey = options.idempotencyKey ?? randomUUID;
  const monotonicNow =
    options.monotonicNow ?? performance.now.bind(performance);
  return await credentials.withToken(async (sessionToken) => {
    const startedAt = monotonicNow();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    let body: unknown;
    try {
      response = await request(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${sessionToken}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey(),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.ok && options.readJson) body = await response.json();
      else await response.arrayBuffer();
    } catch {
      if (controller.signal.aborted)
        throw new Error("RETENTION_SOAK_ACTIVE_WORKLOAD_TIMEOUT");
      throw new Error("RETENTION_SOAK_ACTIVE_WORKLOAD_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok)
      throw new Error(`RETENTION_SOAK_ACTIVE_WORKLOAD_HTTP_${response.status}`);
    return { latencyMs: monotonicNow() - startedAt, body };
  });
};

export const callRetentionSoakAgent = async (
  credentials: RetentionSoakCredentialManager,
  apiUrl: string,
  path: string,
  payload: object,
  options: Readonly<{
    fetch?: Fetch;
    idempotencyKey?: () => string;
    monotonicNow?: () => number;
    requestTimeoutMs?: number;
  }> = {},
): Promise<number> =>
  (
    await callRetentionSoakAgentInternal(
      credentials,
      apiUrl,
      path,
      payload,
      options,
    )
  ).latencyMs;

export const callRetentionSoakHeartbeat = async (
  credentials: RetentionSoakCredentialManager,
  apiUrl: string,
  sessionId: string,
  runtimeSeconds: number,
  options: Readonly<{
    fetch?: Fetch;
    idempotencyKey?: () => string;
    monotonicNow?: () => number;
    requestTimeoutMs?: number;
  }> = {},
): Promise<Readonly<{ latencyMs: number; acceptedAt: string }>> => {
  const result = await callRetentionSoakAgentInternal(
    credentials,
    apiUrl,
    `/api/v1/agent-sessions/${sessionId}/heartbeat`,
    { usage: { runtimeSeconds } },
    { ...options, readJson: true },
  );
  const parsed = agentSessionResponseSchema.safeParse(result.body);
  if (!parsed.success || !parsed.data.last_heartbeat_at)
    throw new Error("RETENTION_SOAK_HEARTBEAT_RESPONSE_INVALID");
  return {
    latencyMs: result.latencyMs,
    acceptedAt: parsed.data.last_heartbeat_at,
  };
};
