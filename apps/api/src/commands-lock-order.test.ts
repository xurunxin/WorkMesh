import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { mutate, type CommandContext } from "./commands.js";

const context: CommandContext = {
  actor: {
    id: "00000000-0000-4000-8000-000000000001",
    kind: "agent",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    workspaceRole: "member",
    displayName: "Lock-order Agent",
    csrfToken: "",
  },
  idempotencyKey: "lock-order",
  correlationId: "lock-order",
  operation: "replyInboxItem",
  requestHash: "request-hash",
};

describe("command coordination lock order", () => {
  it("runs cross-resource coordination before idempotency foreign-key locks", async () => {
    const calls: string[] = [];
    const tx = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replaceAll(/\s+/g, " ").trim();
        calls.push(normalized);
        return {
          rowCount: normalized.startsWith("INSERT INTO api_idempotency_keys")
            ? 1
            : 0,
          rows: [],
        };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const db = {
      connect: vi.fn().mockResolvedValue(tx),
    } as unknown as Pool;
    const authorizeReplay = vi.fn();

    await mutate(
      db,
      context,
      async () => {
        calls.push("HANDLER");
        return { ok: true };
      },
      {
        beforeReserve: async (client) => {
          await client.query("SELECT pg_advisory_xact_lock(1)");
        },
        authorizeReplay,
      },
    );

    expect(calls).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(1)",
      expect.stringMatching(/^INSERT INTO api_idempotency_keys/),
      "HANDLER",
      expect.stringMatching(/^UPDATE api_idempotency_keys/),
      "COMMIT",
    ]);
    expect(authorizeReplay).not.toHaveBeenCalled();
    expect(tx.release).toHaveBeenCalledOnce();
  });

  it("revalidates a matching cached response only after replay metadata is valid", async () => {
    const calls: string[] = [];
    const replay = { protected: "detail" };
    const tx = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replaceAll(/\s+/g, " ").trim();
        calls.push(normalized);
        if (normalized.startsWith("INSERT INTO api_idempotency_keys"))
          return { rowCount: 0, rows: [] };
        if (normalized.startsWith("SELECT operation,request_hash"))
          return {
            rowCount: 1,
            rows: [{
              operation: context.operation,
              request_hash: context.requestHash,
              response_body: replay,
              replay_expires_at: new Date(Date.now() + 60_000),
            }],
          };
        return { rowCount: 0, rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const db = {
      connect: vi.fn().mockResolvedValue(tx),
    } as unknown as Pool;
    const handler = vi.fn();

    const result = await mutate(db, context, handler, {
      authorizeReplay: async () => {
        calls.push("AUTHORIZE_REPLAY");
      },
    });

    expect(result).toEqual(replay);
    expect(handler).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "BEGIN",
      expect.stringMatching(/^INSERT INTO api_idempotency_keys/),
      expect.stringMatching(/^SELECT operation,request_hash/),
      "AUTHORIZE_REPLAY",
      "COMMIT",
    ]);
  });

  it("preserves replay conflict semantics without invoking live authorization", async () => {
    const authorizeReplay = vi.fn();
    const tx = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replaceAll(/\s+/g, " ").trim();
        if (normalized.startsWith("INSERT INTO api_idempotency_keys"))
          return { rowCount: 0, rows: [] };
        if (normalized.startsWith("SELECT operation,request_hash"))
          return {
            rowCount: 1,
            rows: [{
              operation: context.operation,
              request_hash: "different-request",
              response_body: { protected: "detail" },
              replay_expires_at: new Date(Date.now() + 60_000),
            }],
          };
        return { rowCount: 0, rows: [] };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const db = {
      connect: vi.fn().mockResolvedValue(tx),
    } as unknown as Pool;

    await expect(mutate(db, context, vi.fn(), { authorizeReplay })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(authorizeReplay).not.toHaveBeenCalled();
  });
});
