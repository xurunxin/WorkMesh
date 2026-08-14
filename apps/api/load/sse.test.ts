import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  buildPhaseSnapshot,
  compareDecimalCursors,
  DeadlineError,
  DurableCursorTracker,
  openPausedRawSse,
  openSse,
  parseRawHttpHeaders,
  rawSseRequest,
  SseParser,
  waitForRawSaturation,
  withDeadline,
} from "./sse.js";

describe("load SSE parser and cursor tracker", () => {
  it("reassembles CRLF and LF frames across arbitrary chunk boundaries", () => {
    const parser = new SseParser();
    expect(parser.push("id: 900719925474099")).toEqual([]);
    expect(parser.push('3\r\ndata: {"part":')).toEqual([]);
    expect(parser.push("1}\r\ndata: tail\r\n\r\n: heartbeat\n\n")).toEqual([
      {
        id: "9007199254740993",
        data: '{"part":1}\ntail',
        event: undefined,
      },
    ]);
  });

  it("keeps decimal cursors exact beyond Number safe integer range", () => {
    expect(compareDecimalCursors("9007199254740993", "9007199254740992")).toBe(
      1,
    );
    const parser = new SseParser();
    expect(parser.push("id: 18446744073709551615\ndata: {}\n\n")[0]?.id).toBe(
      "18446744073709551615",
    );
  });

  it("classifies duplicates and out-of-order events without moving backward", () => {
    const tracker = new DurableCursorTracker("9007199254740992");
    expect(tracker.observe("9007199254740994")).toBe("advanced");
    expect(tracker.observe("9007199254740994")).toBe("duplicate");
    expect(tracker.observe("9007199254740993")).toBe("out_of_order");
    expect(tracker.last).toBe("9007199254740994");
    expect(tracker.duplicates).toBe(1);
    expect(tracker.outOfOrder).toBe(1);
  });

  it("builds and parses raw HTTP headers without cursor coercion", () => {
    const request = rawSseRequest({
      host: "127.0.0.1:3001",
      path: "/api/v1/events/stream",
      cookie: "workmesh_session=opaque",
      lastEventId: "9007199254740993",
    });
    expect(request).toContain("Last-Event-ID: 9007199254740993\r\n");
    expect(
      parseRawHttpHeaders(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\r\n",
      ),
    ).toEqual({
      statusCode: 200,
      headers: { "content-type": "text/event-stream" },
    });
    expect(() =>
      rawSseRequest({
        host: "localhost",
        path: "/events",
        cookie: "session=ok\r\nX-Evil: true",
        lastEventId: "1",
      }),
    ).toThrow("SSE_HEADER_INVALID:cookie");
  });

  it("sends an exact Last-Event-ID and parses a chunked live response", async () => {
    let observedCursor: string | string[] | undefined;
    const server = createServer((request, response) => {
      observedCursor = request.headers["last-event-id"];
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("id: 900719925474");
      response.write('0993\r\ndata: {"ok":');
      response.end("true}\r\n\r\n");
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("TEST_SERVER_ADDRESS_MISSING");
      const events: unknown[] = [];
      const connection = await openSse({
        endpoint: new URL(
          `http://127.0.0.1:${address.port}/api/v1/events/stream`,
        ),
        cookie: "workmesh_session=opaque",
        lastEventId: "9007199254740992",
        onEvent: (event) => events.push(event),
      });
      await connection.closed;
      expect(observedCursor).toBe("9007199254740992");
      expect(events).toEqual([
        {
          id: "9007199254740993",
          data: '{"ok":true}',
          event: undefined,
        },
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects a raw peer that closes before response headers", async () => {
    const server = createServer((request) => request.socket.destroy());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("TEST_SERVER_ADDRESS_MISSING");
      await expect(
        openPausedRawSse({
          endpoint: new URL(`http://127.0.0.1:${address.port}/events`),
          cookie: "workmesh_session=opaque",
          lastEventId: "1",
          timeoutMs: 1_000,
          context: "unit-raw-early-close",
        }),
      ).rejects.toThrow(/RAW_SSE_(?:END|CLOSE)_BEFORE_HEADERS/);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("bounds raw-header and SSE-header waits with contextual deadlines", async () => {
    const server = createServer(() => undefined);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("TEST_SERVER_ADDRESS_MISSING");
      const endpoint = new URL(`http://127.0.0.1:${address.port}/events`);
      await expect(
        openPausedRawSse({
          endpoint,
          cookie: "workmesh_session=opaque",
          lastEventId: "1",
          timeoutMs: 30,
          context: "unit-raw-timeout",
        }),
      ).rejects.toMatchObject({
        code: "LOAD_DEADLINE_EXCEEDED",
        context: expect.stringContaining("unit-raw-timeout"),
      });
      await expect(
        openSse({
          endpoint,
          cookie: "workmesh_session=opaque",
          lastEventId: "1",
          timeoutMs: 30,
          context: "unit-sse-timeout",
          onEvent: () => undefined,
        }),
      ).rejects.toMatchObject({
        code: "LOAD_DEADLINE_EXCEEDED",
        context: expect.stringContaining("unit-sse-timeout"),
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects a paused raw stream that closes before saturation", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
      setTimeout(() => response.destroy(), 20);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("TEST_SERVER_ADDRESS_MISSING");
      const raw = await openPausedRawSse({
        endpoint: new URL(`http://127.0.0.1:${address.port}/events`),
        cookie: "workmesh_session=opaque",
        lastEventId: "1",
        timeoutMs: 1_000,
        context: "unit-before-saturation",
      });
      await expect(
        waitForRawSaturation(raw, 1_000, "unit-before-saturation"),
      ).rejects.toThrow("RAW_SSE_CLOSED_BEFORE_THRESHOLD");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("provides a reusable deadline for HTTP-style operations", async () => {
    await expect(
      withDeadline(
        new Promise<never>(() => undefined),
        20,
        "unit-http-timeout",
      ),
    ).rejects.toEqual(expect.any(DeadlineError));
  });

  it("retains partial metrics and errors in a phase snapshot", () => {
    expect(
      buildPhaseSnapshot({
        startedAt: 10.2,
        finishedAt: 25.8,
        metrics: { clientsOpened: 4 },
        assertions: [{ name: "partial", passed: true }],
        error: "Error: injected phase failure",
      }),
    ).toEqual({
      durationMs: 16,
      metrics: { clientsOpened: 4 },
      assertions: [{ name: "partial", passed: true }],
      error: "Error: injected phase failure",
    });
  });
});
