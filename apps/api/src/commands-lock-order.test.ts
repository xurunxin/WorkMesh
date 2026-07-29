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
    expect(tx.release).toHaveBeenCalledOnce();
  });
});
