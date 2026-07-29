import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionRetentionSoak } from "./retention-soak-provision.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const json = (body: unknown, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });

describe("retention soak provisioning", () => {
  it("writes only schema v2 restart authority to a private state file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const statePath = join(directory, "session.json");
    const installationToken = "installation-only-secret";
    const sessionToken = "temporary-session-secret";
    const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      if (path === "/api/v1/auth/install")
        return json(
          { csrfToken: "csrf-secret" },
          { "set-cookie": "workmesh_session=cookie-secret; Path=/" },
        );
      if (path === "/api/v1/auth/me")
        return json({
          actor: { id: "actor-id", workspace_id: "workspace-id" },
        });
      if (path === "/api/v1/teams") return json({ items: [{ id: "team-id" }] });
      if (path === "/api/v1/teams/team-id/states")
        return json({ items: [{ id: "ready-id", name: "Ready" }] });
      if (path === "/api/v1/work-items") return json({ id: "work-item-id" });
      if (path === "/api/v1/agents/register")
        return json({ id: "agent-id", installation_token: installationToken });
      if (path === "/api/v1/agents/agent-id/team-access/team-id")
        return json({});
      if (path === "/api/v1/work-items/work-item-id/delegations")
        return json({ id: "delegation-id" });
      if (path === "/api/v1/agent-sessions")
        return json({
          id: "session-id",
          exchangeToken: "x".repeat(32),
        });
      if (path === "/api/v1/agent-sessions/session-id/token/exchange")
        return json({
          sessionToken,
          expiresAt: "2026-07-29T00:15:00.000Z",
        });
      if (path === "/api/v1/agent-sessions/session-id/ack")
        return json({ revision: 1 });
      if (
        path === "/api/v1/agent-sessions/session-id/heartbeat" ||
        path === "/api/v1/agent-sessions/session-id/state"
      )
        return json({});
      return new Response(undefined, { status: 404 });
    });

    const result = await provisionRetentionSoak({
      apiUrl: "http://127.0.0.1:3001",
      bootstrapToken: "bootstrap-secret",
      statePath,
      fetch: request,
      idempotencyKey: () => "provision-idempotency-key",
      uniqueSuffix: () => "test-run",
    });
    const text = await readFile(statePath, "utf8");
    const state = JSON.parse(text) as Record<string, unknown>;
    const mode = (await stat(statePath)).mode & 0o777;

    expect(result.state.schemaVersion).toBe(2);
    expect(state).toEqual({
      schemaVersion: 2,
      sessionId: "session-id",
      installationToken,
      workspaceId: "workspace-id",
      teamId: "team-id",
      workItemId: "work-item-id",
    });
    expect(state).not.toHaveProperty("sessionToken");
    expect(text).not.toContain(sessionToken);
    if (process.platform !== "win32") expect(mode & 0o077).toBe(0);
    expect(request).toHaveBeenCalledTimes(13);
  });

  it("reserves the state path before making provisioning mutations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const statePath = join(directory, "session.json");
    await writeFile(statePath, "existing-state\n", "utf8");
    const request = vi.fn<typeof fetch>();

    await expect(
      provisionRetentionSoak({
        apiUrl: "http://127.0.0.1:3001",
        bootstrapToken: "bootstrap-secret",
        statePath,
        fetch: request,
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(request).not.toHaveBeenCalled();
    await expect(readFile(statePath, "utf8")).resolves.toBe("existing-state\n");
  });
});
