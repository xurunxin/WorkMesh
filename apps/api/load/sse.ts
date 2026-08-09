import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import net from "node:net";

const decimalCursor = /^(0|[1-9][0-9]*)$/;

export const assertDecimalCursor = (value: string): string => {
  if (!decimalCursor.test(value))
    throw new Error(`SSE_CURSOR_INVALID:${value}`);
  return value;
};

export const compareDecimalCursors = (left: string, right: string): number => {
  const leftValue = BigInt(assertDecimalCursor(left));
  const rightValue = BigInt(assertDecimalCursor(right));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

export type ParsedSseEvent = Readonly<{
  id?: string;
  event?: string;
  data: string;
}>;

export class SseParser {
  #buffer = "";
  readonly #decoder = new TextDecoder();

  push(chunk: Uint8Array | string): ParsedSseEvent[] {
    this.#buffer +=
      typeof chunk === "string"
        ? chunk
        : this.#decoder.decode(chunk, { stream: true });
    const events: ParsedSseEvent[] = [];
    for (;;) {
      const boundary = /\r?\n\r?\n/.exec(this.#buffer);
      if (!boundary || boundary.index === undefined) break;
      const frame = this.#buffer.slice(0, boundary.index);
      this.#buffer = this.#buffer.slice(boundary.index + boundary[0].length);
      const parsed = this.#parseFrame(frame);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  finish(): ParsedSseEvent[] {
    this.#buffer += this.#decoder.decode();
    if (this.#buffer.length === 0) return [];
    const parsed = this.#parseFrame(this.#buffer);
    this.#buffer = "";
    return parsed ? [parsed] : [];
  }

  #parseFrame(frame: string): ParsedSseEvent | undefined {
    let id: string | undefined;
    let event: string | undefined;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.length === 0 || line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator < 0 ? line : line.slice(0, separator);
      const rawValue = separator < 0 ? "" : line.slice(separator + 1);
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "id") id = assertDecimalCursor(value);
      else if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (id === undefined && event === undefined && data.length === 0)
      return undefined;
    return { id, event, data: data.join("\n") };
  }
}

export type CursorObservation = "advanced" | "duplicate" | "out_of_order";

export class DurableCursorTracker {
  readonly #seen = new Set<string>();
  #last: string;
  duplicates = 0;
  outOfOrder = 0;

  constructor(initialCursor = "0") {
    this.#last = assertDecimalCursor(initialCursor);
  }

  get last(): string {
    return this.#last;
  }

  has(cursor: string): boolean {
    return this.#seen.has(cursor);
  }

  observe(cursor: string): CursorObservation {
    cursor = assertDecimalCursor(cursor);
    if (this.#seen.has(cursor)) {
      this.duplicates += 1;
      return "duplicate";
    }
    this.#seen.add(cursor);
    if (compareDecimalCursors(cursor, this.#last) <= 0) {
      this.outOfOrder += 1;
      return "out_of_order";
    }
    this.#last = cursor;
    return "advanced";
  }
}

const safeHeaderValue = (name: string, value: string): string => {
  if (/[\r\n]/.test(value)) throw new Error(`SSE_HEADER_INVALID:${name}`);
  return value;
};

export const rawSseRequest = ({
  host,
  path,
  cookie,
  lastEventId,
}: {
  host: string;
  path: string;
  cookie: string;
  lastEventId: string;
}): string => {
  const headers = [
    `GET ${safeHeaderValue("path", path)} HTTP/1.1`,
    `Host: ${safeHeaderValue("host", host)}`,
    "Accept: text/event-stream",
    "Connection: keep-alive",
    `Cookie: ${safeHeaderValue("cookie", cookie)}`,
    `Last-Event-ID: ${assertDecimalCursor(lastEventId)}`,
    "",
    "",
  ];
  return headers.join("\r\n");
};

export type RawHttpHeaders = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string>>;
}>;

export const parseRawHttpHeaders = (value: string): RawHttpHeaders => {
  const lines = value.split("\r\n");
  const status = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: |$)/.exec(lines[0] ?? "");
  if (!status) throw new Error("SSE_RAW_STATUS_INVALID");
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (line.length === 0) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("SSE_RAW_HEADER_INVALID");
    const name = line.slice(0, separator).trim().toLowerCase();
    const content = line.slice(separator + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${content}` : content;
  }
  return { statusCode: Number(status[1]), headers };
};

export class DeadlineError extends Error {
  readonly code = "LOAD_DEADLINE_EXCEEDED";

  constructor(
    readonly context: string,
    readonly timeoutMs: number,
  ) {
    super(`LOAD_DEADLINE_EXCEEDED:${context}:${timeoutMs}ms`);
  }
}

export const withDeadline = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  context: string,
  onTimeout?: () => void,
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error(`LOAD_DEADLINE_INVALID:${context}:${timeoutMs}`);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new DeadlineError(context, timeoutMs));
    }, timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const buildPhaseSnapshot = <TAssertion>({
  startedAt,
  finishedAt,
  metrics,
  assertions,
  error,
}: {
  startedAt: number;
  finishedAt: number;
  metrics: Record<string, unknown>;
  assertions: TAssertion[];
  error?: string;
}): {
  durationMs: number;
  metrics: Record<string, unknown>;
  assertions: TAssertion[];
  error?: string;
} => ({
  durationMs: Math.max(0, Math.round(finishedAt - startedAt)),
  metrics: { ...metrics },
  assertions: [...assertions],
  ...(error ? { error } : {}),
});

export type RawSocketEvidence = Readonly<{
  pauseAt: number;
  bytesRead: number;
  readableLength: number;
  readableHighWaterMark: number;
  destroyed: boolean;
  readableEnded: boolean;
}>;

export type RawSocketClose = Readonly<{
  closeAt: number;
  endAt?: number;
  error?: string;
  hadError: boolean;
}>;

export type PausedRawSse = Readonly<{
  socket: net.Socket;
  headers: RawHttpHeaders;
  pauseAt: number;
  closed: Promise<RawSocketClose>;
  evidence: () => RawSocketEvidence;
}>;

export const openPausedRawSse = async ({
  endpoint,
  cookie,
  lastEventId,
  timeoutMs,
  context,
}: {
  endpoint: URL;
  cookie: string;
  lastEventId: string;
  timeoutMs: number;
  context: string;
}): Promise<PausedRawSse> => {
  const socket = net.createConnection({
    host: endpoint.hostname,
    port: Number(endpoint.port),
  });
  let bytesRead = 0;
  let pauseAt = 0;
  let endAt: number | undefined;
  let closeError: Error | undefined;
  let headersSettled = false;
  let settleClose: (value: RawSocketClose) => void = () => undefined;
  const closed = new Promise<RawSocketClose>((resolve) => {
    settleClose = resolve;
  });
  socket.once("end", () => {
    endAt = performance.now();
  });
  socket.on("error", (error) => {
    closeError = error;
  });
  socket.once("close", (hadError) => {
    settleClose({
      closeAt: performance.now(),
      endAt,
      error: closeError
        ? `${closeError.name}: ${closeError.message}`
        : undefined,
      hadError,
    });
  });

  const headerOperation = new Promise<RawHttpHeaders>((resolve, reject) => {
    let received = Buffer.alloc(0);
    const rejectEarly = (kind: string, error?: Error): void => {
      if (headersSettled) return;
      headersSettled = true;
      reject(
        error ??
          new Error(
            `RAW_SSE_${kind}_BEFORE_HEADERS:${context}:${endpoint.toString()}`,
          ),
      );
    };
    socket.once("error", (error) => rejectEarly("ERROR", error));
    socket.once("end", () => rejectEarly("END"));
    socket.once("close", () => rejectEarly("CLOSE"));
    socket.once("connect", () => {
      socket.write(
        rawSseRequest({
          host: endpoint.host,
          path: endpoint.pathname + endpoint.search,
          cookie,
          lastEventId,
        }),
      );
    });
    socket.on("data", (chunk) => {
      if (headersSettled) return;
      bytesRead += chunk.length;
      received = Buffer.concat([received, chunk]);
      const boundary = received.indexOf("\r\n\r\n");
      if (boundary < 0) return;
      try {
        const parsed = parseRawHttpHeaders(
          received.subarray(0, boundary + 4).toString("latin1"),
        );
        headersSettled = true;
        socket.pause();
        pauseAt = performance.now();
        resolve(parsed);
      } catch (error) {
        headersSettled = true;
        reject(error);
      }
    });
  });

  try {
    const headers = await withDeadline(
      headerOperation,
      timeoutMs,
      `${context}:raw-headers:${endpoint.toString()}`,
      () => socket.destroy(),
    );
    return {
      socket,
      headers,
      pauseAt,
      closed,
      evidence: () => ({
        pauseAt,
        bytesRead,
        readableLength: socket.readableLength,
        readableHighWaterMark: socket.readableHighWaterMark,
        destroyed: socket.destroyed,
        readableEnded: socket.readableEnded,
      }),
    };
  } catch (error) {
    socket.destroy();
    throw error;
  }
};

export const proveRawSocketOpen = async (
  raw: PausedRawSse,
  minimumOpenMs: number,
  context: string,
): Promise<RawSocketEvidence> => {
  await Promise.race([
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, minimumOpenMs);
      timer.unref();
    }),
    raw.closed.then((closed) => {
      throw new Error(
        `RAW_SSE_CLOSED_BEFORE_LOAD:${context}:${JSON.stringify({
          closed,
          evidence: raw.evidence(),
        })}`,
      );
    }),
  ]);
  const evidence = raw.evidence();
  if (evidence.destroyed || evidence.readableEnded)
    throw new Error(
      `RAW_SSE_NOT_OPEN_BEFORE_LOAD:${context}:${JSON.stringify(evidence)}`,
    );
  return evidence;
};

export type RawSaturationEvidence = RawSocketEvidence &
  Readonly<{ thresholdReachedAt: number }>;

export const waitForRawSaturation = async (
  raw: PausedRawSse,
  timeoutMs: number,
  context: string,
): Promise<RawSaturationEvidence> =>
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (
      result: RawSaturationEvidence | Error,
      failed: boolean,
    ): void => {
      if (settled) return;
      settled = true;
      clearInterval(interval);
      clearTimeout(timeout);
      if (failed) reject(result);
      else resolve(result as RawSaturationEvidence);
    };
    const sample = (): void => {
      const evidence = raw.evidence();
      if (
        evidence.readableHighWaterMark > 0 &&
        evidence.readableLength >= evidence.readableHighWaterMark
      )
        finish({ ...evidence, thresholdReachedAt: performance.now() }, false);
    };
    const interval = setInterval(sample, 10);
    interval.unref();
    const timeout = setTimeout(
      () =>
        finish(
          new DeadlineError(
            `${context}:raw-saturation:${JSON.stringify(raw.evidence())}`,
            timeoutMs,
          ),
          true,
        ),
      timeoutMs,
    );
    timeout.unref();
    void raw.closed.then((closed) =>
      finish(
        new Error(
          `RAW_SSE_CLOSED_BEFORE_THRESHOLD:${context}:${JSON.stringify({
            closed,
            evidence: raw.evidence(),
          })}`,
        ),
        true,
      ),
    );
    sample();
  });

export const waitForRawCloseAfterThreshold = async (
  raw: PausedRawSse,
  thresholdReachedAt: number,
  timeoutMs: number,
  context: string,
): Promise<RawSocketClose & Readonly<{ closeAfterThresholdMs: number }>> => {
  const closed = await withDeadline(
    raw.closed,
    timeoutMs,
    `${context}:raw-close-after-threshold`,
  );
  if (closed.closeAt < thresholdReachedAt)
    throw new Error(
      `RAW_SSE_CLOSED_BEFORE_THRESHOLD:${context}:${JSON.stringify(closed)}`,
    );
  return {
    ...closed,
    closeAfterThresholdMs: closed.closeAt - thresholdReachedAt,
  };
};

export class SseHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly headers: IncomingHttpHeaders,
    readonly body: string,
  ) {
    super(`SSE_HTTP_${statusCode}`);
  }
}

export type SseCloseResult = Readonly<{
  error?: Error;
}>;

export type SseConnection = Readonly<{
  close: () => void;
  closed: Promise<SseCloseResult>;
  headers: IncomingHttpHeaders;
}>;

const responseBody = async (response: IncomingMessage): Promise<string> =>
  await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    response.once("error", reject);
  });

export const openSse = async ({
  endpoint,
  cookie,
  lastEventId,
  onEvent,
  timeoutMs = 10_000,
  context = "sse-open",
}: {
  endpoint: URL;
  cookie: string;
  lastEventId: string;
  onEvent: (event: ParsedSseEvent) => void;
  timeoutMs?: number;
  context?: string;
}): Promise<SseConnection> => {
  assertDecimalCursor(lastEventId);
  const options: RequestOptions = {
    protocol: endpoint.protocol,
    hostname: endpoint.hostname,
    port: endpoint.port,
    method: "GET",
    path: endpoint.pathname + endpoint.search,
    headers: {
      accept: "text/event-stream",
      cookie: safeHeaderValue("cookie", cookie),
      "last-event-id": lastEventId,
    },
  };
  return await new Promise((resolve, reject) => {
    const request = http.request(options);
    let opened = false;
    let settledOpen = false;
    const openTimer = setTimeout(() => {
      if (settledOpen) return;
      settledOpen = true;
      const error = new DeadlineError(
        `${context}:headers:${endpoint.toString()}`,
        timeoutMs,
      );
      request.destroy(error);
      reject(error);
    }, timeoutMs);
    openTimer.unref();
    const finishOpen = (): boolean => {
      if (settledOpen) return false;
      settledOpen = true;
      clearTimeout(openTimer);
      return true;
    };
    request.once("error", (error) => {
      if (!opened && finishOpen()) reject(error);
    });
    request.once("response", (response) => {
      if (!finishOpen()) {
        response.destroy();
        return;
      }
      if (response.statusCode !== 200) {
        void withDeadline(
          responseBody(response),
          timeoutMs,
          `${context}:error-body:${endpoint.toString()}`,
          () => response.destroy(),
        ).then(
          (body) =>
            reject(
              new SseHttpError(
                response.statusCode ?? 0,
                response.headers,
                body,
              ),
            ),
          reject,
        );
        return;
      }
      opened = true;
      const parser = new SseParser();
      let closeResult: SseCloseResult = {};
      let settleClosed: (result: SseCloseResult) => void = () => undefined;
      const closed = new Promise<SseCloseResult>((closedResolve) => {
        settleClosed = closedResolve;
      });
      let settled = false;
      const finish = (result: SseCloseResult): void => {
        if (settled) return;
        settled = true;
        closeResult = result;
        settleClosed(closeResult);
      };
      response.on("data", (chunk) => {
        try {
          for (const event of parser.push(Buffer.from(chunk))) onEvent(event);
        } catch (error) {
          const failure =
            error instanceof Error ? error : new Error(String(error));
          finish({ error: failure });
          request.destroy(failure);
        }
      });
      response.once("end", () => {
        try {
          for (const event of parser.finish()) onEvent(event);
          finish({});
        } catch (error) {
          finish({
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
      response.once("error", (error) => finish({ error }));
      response.once("close", () => finish(closeResult));
      resolve({
        headers: response.headers,
        closed,
        close: () => request.destroy(),
      });
    });
    request.end();
  });
};
