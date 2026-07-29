type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type WaitForHostApiReadinessOptions = {
  endpoint: URL;
  context: string;
  timeoutMs: number;
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
};

export type HostApiReadiness = {
  endpoint: string;
  status: number;
  attempts: number;
  elapsedMs: number;
};

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const errorProperties = (error: object): string => {
  const record = error as Record<string, unknown>;
  return ["code", "errno", "syscall", "address", "port"]
    .flatMap((key) =>
      record[key] === undefined ? [] : [`${key}=${String(record[key])}`],
    )
    .join(",");
};

export const transportErrorText = (error: unknown): string => {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      const properties = errorProperties(current);
      parts.push(
        `${current.name}: ${current.message}${properties ? ` [${properties}]` : ""}`,
      );
      current = current.cause;
      continue;
    }
    if (typeof current === "object") {
      const properties = errorProperties(current);
      parts.push(properties ? `Error: ${properties}` : String(current));
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  return parts.join(" <- ") || "unknown transport error";
};

export const waitForHostApiReadiness = async ({
  endpoint,
  context,
  timeoutMs,
  attemptTimeoutMs = 2_000,
  retryDelayMs = 100,
  fetchImpl = fetch,
  now = Date.now,
  delay = sleep,
}: WaitForHostApiReadinessOptions): Promise<HostApiReadiness> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error(
      `LOAD_API_READINESS_TIMEOUT_INVALID:${context}:${timeoutMs}`,
    );
  if (!Number.isFinite(attemptTimeoutMs) || attemptTimeoutMs <= 0)
    throw new Error(
      `LOAD_API_READINESS_ATTEMPT_TIMEOUT_INVALID:${context}:${attemptTimeoutMs}`,
    );
  if (!Number.isFinite(retryDelayMs) || retryDelayMs <= 0)
    throw new Error(
      `LOAD_API_READINESS_RETRY_DELAY_INVALID:${context}:${retryDelayMs}`,
    );

  const url = new URL("/health", endpoint);
  const started = now();
  let attempts = 0;
  let lastTransportError = "no attempt completed";

  for (;;) {
    const elapsedMs = Math.max(0, now() - started);
    if (elapsedMs >= timeoutMs)
      throw new Error(
        `LOAD_API_READINESS_TRANSPORT_TIMEOUT:${context}:${url.toString()}:` +
          `timeout=${timeoutMs}ms:attempts=${attempts}:last=${lastTransportError}`,
      );

    attempts += 1;
    const controller = new AbortController();
    const attemptBudgetMs = Math.max(
      1,
      Math.min(attemptTimeoutMs, timeoutMs - elapsedMs),
    );
    const timer = setTimeout(() => controller.abort(), attemptBudgetMs);
    timer.unref();
    let response: Response | undefined;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      lastTransportError = transportErrorText(error);
    } finally {
      clearTimeout(timer);
    }

    if (response) {
      void response.body?.cancel().catch(() => undefined);
      if (!response.ok)
        throw new Error(
          `LOAD_API_READINESS_HTTP_RESPONSE:${context}:${url.toString()}:` +
            `status=${response.status}:${response.statusText || "unknown"}`,
        );
      return {
        endpoint: url.toString(),
        status: response.status,
        attempts,
        elapsedMs: Math.max(0, now() - started),
      };
    }

    const remainingMs = timeoutMs - Math.max(0, now() - started);
    if (remainingMs <= 0) continue;
    await delay(Math.min(retryDelayMs, remainingMs));
  }
};
