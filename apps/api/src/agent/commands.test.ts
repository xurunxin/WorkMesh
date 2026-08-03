import { randomUUID } from "node:crypto";
import { agentSessionResponseSchema } from "@workmesh/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { heartbeatReplay, recordHeartbeatKey, txQuery } = vi.hoisted(() => ({
  heartbeatReplay: vi.fn(),
  recordHeartbeatKey: vi.fn(),
  txQuery: vi.fn(),
}));

vi.mock("@workmesh/config", () => ({
  loadRetentionConfig: () => ({
    genericReplayHours: 24,
    genericConflictDays: 30,
  }),
}));
vi.mock("@workmesh/db", () => ({
  appendEvent: vi.fn().mockResolvedValue("event-id"),
  opaqueToken: vi.fn(),
  tokenHash: vi.fn(),
  withTx: async (
    _db: unknown,
    handler: (tx: { query: typeof txQuery }) => unknown,
  ) => handler({ query: txQuery }),
}));
vi.mock("../heartbeat-idempotency.js", () => ({
  isHeartbeatReplay: heartbeatReplay,
  recordHeartbeatKey,
}));
vi.mock("./guard.js", () => ({
  assertAgentWrite: vi.fn(),
  loadAgentSessionForMutation: vi
    .fn()
    .mockResolvedValue({ team_id: "team-id", state: "queued" }),
}));

import {
  acknowledge,
  heartbeat,
  normalizeAgentSessionResponse,
} from "./commands.js";

const timestamp = "2026-07-30T00:00:00.000Z";
const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  workspace_id: randomUUID(),
  agent_id: randomUUID(),
  agent_actor_id: randomUUID(),
  delegation_id: randomUUID(),
  work_item_id: randomUUID(),
  project_id: null,
  plan_step_id: null,
  state: "executing",
  state_reason: null,
  sequence: "7",
  revision: 2,
  current_plan_version_id: null,
  context_snapshot_id: null,
  budget: {},
  external_urls: [{ label: "Run", url: "https://example.test/runs/7" }],
  last_heartbeat_at: new Date(timestamp),
  heartbeat_health: "healthy",
  heartbeat_health_changed_at: new Date(timestamp),
  heartbeat_checked_at: new Date(timestamp),
  heartbeat_current_step_id: null,
  heartbeat_usage: { runtimeSeconds: 7 },
  retry_of_session_id: null,
  stop_requested_at: null,
  ended_at: null,
  error_code: null,
  error_summary: null,
  created_at: new Date(timestamp),
  updated_at: new Date(timestamp),
  ...overrides,
});

const meta = {
  actor: { workspaceId: "workspace-id", id: "actor-id" },
  idempotencyKey: "session-key",
  operation: "heartbeatAgentSession",
  requestHash: "hash",
  correlationId: "correlation-id",
} as never;

beforeEach(() => {
  txQuery.mockReset();
  heartbeatReplay.mockReset().mockResolvedValue(false);
  recordHeartbeatKey.mockReset().mockResolvedValue(undefined);
});

describe("normalizeAgentSessionResponse", () => {
  it("returns a contract-valid response from pg bigint and JSONB values", () => {
    const response = normalizeAgentSessionResponse(sessionRow());

    expect(response.sequence).toBe(7);
    expect(response.external_urls).toEqual([
      { label: "Run", url: "https://example.test/runs/7" },
    ]);
    expect(agentSessionResponseSchema.parse(response)).toMatchObject({
      sequence: 7,
    });
  });

  it("fails closed instead of coercing an invalid persisted JSONB external_urls value", () => {
    expect(() =>
      normalizeAgentSessionResponse(sessionRow({ external_urls: {} })),
    ).toThrowError(expect.objectContaining({ code: "INTERNAL_ERROR" }));
  });

  it.each([
    ["negative", -1],
    ["fractional", "1.5"],
    ["unsafe", String(Number.MAX_SAFE_INTEGER + 1)],
  ])("rejects a %s sequence", (_label, sequence) => {
    expect(() =>
      normalizeAgentSessionResponse(sessionRow({ sequence })),
    ).toThrowError(expect.objectContaining({ code: "INTERNAL_ERROR" }));
  });
});

describe("heartbeat", () => {
  it("normalizes the fresh response returned by the update branch", async () => {
    txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT heartbeat_health"))
        return {
          rowCount: 1,
          rows: [
            {
              heartbeat_health: "healthy",
              heartbeat_idempotency_key: null,
              heartbeat_request_hash: null,
              state: "executing",
              revision: 2,
              sequence: "7",
            },
          ],
        };
      if (sql.includes("UPDATE agent_sessions"))
        return {
          rowCount: 1,
          rows: [sessionRow({ sequence: "7" })],
        };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await heartbeat({} as never, meta, "session-id", {
      usage: { runtimeSeconds: 7 },
    });

    expect(agentSessionResponseSchema.parse(response)).toMatchObject({
      sequence: 7,
    });
    expect(recordHeartbeatKey).toHaveBeenCalledOnce();
  });

  it("normalizes the actual replay branch without updating the session", async () => {
    heartbeatReplay.mockResolvedValue(true);
    txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT heartbeat_health"))
        return {
          rowCount: 1,
          rows: [
            {
              heartbeat_health: "healthy",
              heartbeat_idempotency_key: "heartbeat-key",
              heartbeat_request_hash: "hash",
              state: "executing",
              revision: 2,
              sequence: "8",
            },
          ],
        };
      if (sql.includes("SELECT * FROM agent_sessions"))
        return {
          rowCount: 1,
          rows: [sessionRow({ sequence: "8" })],
        };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await heartbeat({} as never, meta, "session-id", {
      usage: { runtimeSeconds: 8 },
    });

    expect(agentSessionResponseSchema.parse(response)).toMatchObject({
      sequence: 8,
    });
    expect(
      txQuery.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE agent_sessions"),
      ),
    ).toBe(false);
    expect(recordHeartbeatKey).not.toHaveBeenCalled();
  });
});

describe("acknowledge", () => {
  it("writes JSONB array text and returns a contract-valid normalized response", async () => {
    txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO api_idempotency_keys"))
        return { rowCount: 1, rows: [] };
      if (sql.includes("UPDATE agent_sessions SET state='acknowledged'"))
        return {
          rowCount: 1,
          rows: [
            sessionRow({
              external_urls: [],
              sequence: "1",
              state: "acknowledged",
              state_reason: "Acknowledged",
            }),
          ],
        };
      if (sql.includes("UPDATE api_idempotency_keys SET"))
        return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await acknowledge(
      {} as never,
      {
        actor: { workspaceId: "workspace-id", id: "actor-id" },
        idempotencyKey: "acknowledge-key",
        operation: "acknowledgeAgentSession",
        requestHash: "hash",
        correlationId: "correlation-id",
      } as never,
      "session-id",
      { summary: "Acknowledged", externalUrls: [] },
    );

    expect(agentSessionResponseSchema.parse(response)).toMatchObject({
      external_urls: [],
      sequence: 1,
      state: "acknowledged",
    });
    const update = txQuery.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE agent_sessions SET state='acknowledged'"),
    );
    expect(update?.[0]).toContain("external_urls=$3::jsonb");
    expect(update?.[1]).toEqual(["session-id", "Acknowledged", "[]"]);
  });

  it("normalizes an idempotent replay after agentMutate returns it", async () => {
    txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO api_idempotency_keys"))
        return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT operation,request_hash,response_body"))
        return {
          rowCount: 1,
          rows: [
            {
              operation: "acknowledgeAgentSession",
              request_hash: "hash",
              replay_expires_at: new Date(Date.now() + 60_000),
              response_body: sessionRow({
                external_urls: [],
                sequence: "2",
                state: "acknowledged",
                state_reason: "Acknowledged",
              }),
            },
          ],
        };
      throw new Error(`Unexpected query: ${sql}`);
    });

    const response = await acknowledge(
      {} as never,
      {
        actor: { workspaceId: "workspace-id", id: "actor-id" },
        idempotencyKey: "acknowledge-key",
        operation: "acknowledgeAgentSession",
        requestHash: "hash",
        correlationId: "correlation-id",
      } as never,
      "session-id",
      { summary: "Acknowledged", externalUrls: [] },
    );

    expect(agentSessionResponseSchema.parse(response)).toMatchObject({
      external_urls: [],
      sequence: 2,
      state: "acknowledged",
    });
    expect(
      txQuery.mock.calls.some(([sql]) =>
        String(sql).includes("UPDATE agent_sessions SET state='acknowledged'"),
      ),
    ).toBe(false);
  });
});
