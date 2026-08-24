import { mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  provisionRetentionSoak,
  type RetentionSoakProvisionOptions,
} from "./retention-soak-provision.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

type StoredResponse = Readonly<{
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}>;

const response = (stored: StoredResponse, status = 200): Response =>
  new Response(JSON.stringify(stored.body), {
    status,
    headers: { "content-type": "application/json", ...stored.headers },
  });

class ProvisionServer {
  readonly counts = new Map<string, number>();
  readonly replay = new Map<string, StoredResponse>();
  readonly bodies = new Map<string, Record<string, unknown>>();
  readonly requestHeaders = new Map<string, Headers>();
  installed = false;
  admin: Readonly<{ email: string; password: string }> | undefined;
  fault:
    | "install"
    | "registerAgent"
    | "delegateAndStart"
    | "refreshToken"
    | undefined;
  faultConsumed = false;

  constructor(fault?: ProvisionServer["fault"]) {
    this.fault = fault;
  }

  installExisting(email: string, password: string): void {
    this.installed = true;
    this.admin = { email, password };
  }

  readonly fetch = vi
    .fn<typeof fetch>()
    .mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      const headers = new Headers(init?.headers);
      const key = headers.get("idempotency-key");
      if (key && this.replay.has(key)) return response(this.replay.get(key)!);

      if (path === "/api/v1/auth/login") {
        if (
          !this.installed ||
          body.email !== this.admin?.email ||
          body.password !== this.admin?.password
        )
          return response({ body: { error: {} } }, 401);
        return this.complete("login", key, {
          body: { csrfToken: "login-csrf" },
          headers: { "set-cookie": "workmesh_session=login; Path=/" },
        });
      }
      if (path === "/api/v1/auth/install") {
        this.installed = true;
        this.admin = {
          email: String(body.email),
          password: String(body.password),
        };
        return this.complete("install", key, {
          body: { csrfToken: "install-csrf" },
          headers: { "set-cookie": "workmesh_session=install; Path=/" },
        });
      }
      if (path === "/api/v1/auth/me")
        return response({
          body: {
            actor: { id: "actor-id", workspace_id: "workspace-id" },
          },
        });
      if (path === "/api/v1/teams")
        return response({ body: { items: [{ id: "team-id" }] } });
      if (path === "/api/v1/teams/team-id/states")
        return response({
          body: { items: [{ id: "ready-id", name: "Ready" }] },
        });
      if (path === "/api/v1/work-items") {
        this.bodies.set("createWorkItem", body);
        return this.complete("createWorkItem", key, {
          body: { id: "work-item-id", revision: 1 },
        });
      }
      if (path === "/api/v1/agents/register") {
        this.bodies.set("registerAgent", body);
        return this.complete("registerAgent", key, {
          body: {
            id: "agent-id",
            installation_token: "installation-only-secret",
          },
        });
      }
      if (path === "/api/v1/agents/agent-id/team-access/team-id") {
        this.bodies.set("grantTeamAccess", body);
        return this.complete("grantTeamAccess", key, { body: {} });
      }
      if (path === "/api/v1/work-items/work-item-id/agent-session") {
        this.bodies.set("delegateAndStart", body);
        this.requestHeaders.set("delegateAndStart", headers);
        return this.complete("delegateAndStart", key, {
          body: {
            delegation: { id: "delegation-id" },
            session: { id: "session-id" },
          },
        });
      }
      if (path === "/api/v1/agent-sessions/session-id/token/refresh")
        return this.complete("refreshToken", key, {
          body: {
            sessionToken: "temporary-session-secret",
            expiresAt: "2026-07-29T00:15:00.000Z",
          },
        });
      if (path === "/api/v1/agent-sessions/session-id/ack")
        return this.complete("acknowledge", key, { body: { revision: 1 } });
      if (path === "/api/v1/agent-sessions/session-id/heartbeat")
        return this.complete("initialHeartbeat", key, { body: {} });
      if (path === "/api/v1/agent-sessions/session-id/state")
        return this.complete("transitionExecuting", key, { body: {} });
      return response({ body: {} }, 404);
    });

  private complete(
    operation: string,
    key: string | null,
    stored: StoredResponse,
  ): Response {
    if (!key) throw new Error(`missing idempotency key for ${operation}`);
    this.counts.set(operation, (this.counts.get(operation) ?? 0) + 1);
    this.replay.set(key, stored);
    if (this.fault === operation && !this.faultConsumed) {
      this.faultConsumed = true;
      throw new Error("response lost after commit");
    }
    return response(stored);
  }
}

const privateTestOptions = async (
  directory: string,
  server: ProvisionServer,
  overrides: Partial<RetentionSoakProvisionOptions> = {},
): Promise<RetentionSoakProvisionOptions> => ({
  apiUrl: "http://127.0.0.1:3001",
  bootstrapToken: "bootstrap-secret",
  statePath: join(directory, "session.json"),
  mode: "clean_stack",
  fetch: server.fetch,
  idempotencyKey: (() => {
    let key = 0;
    return () => `operation-key-${(key += 1)}`;
  })(),
  uniqueSuffix: () => "test-run",
  generatedAdminPassword: () => "Soak-recovery-password-Aa1!",
  platform: "linux",
  verifyPrivateFile: async () => undefined,
  replaceFile: async (source, target) => {
    await rm(target, { force: true });
    await rename(source, target);
  },
  ...overrides,
});

describe("retention soak provisioning", () => {
  for (const fault of [
    "install",
    "registerAgent",
    "delegateAndStart",
    "refreshToken",
  ] as const) {
    it(`resumes without duplicates after ${fault} response loss`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
      temporaryDirectories.push(directory);
      const server = new ProvisionServer(fault);
      const options = await privateTestOptions(directory, server);

      await expect(provisionRetentionSoak(options)).rejects.toThrow(
        "RETENTION_SOAK_PROVISION_REQUEST_FAILED",
      );
      const checkpointText = await readFile(options.statePath, "utf8");
      const checkpoint = JSON.parse(checkpointText) as Record<string, unknown>;
      expect(checkpoint).toMatchObject({
        schemaVersion: 1,
        kind: "checkpoint",
        admin: {
          email: "retention-soak-test-run@example.test",
          password: "Soak-recovery-password-Aa1!",
        },
      });
      expect(checkpointText).not.toContain("installation-only-secret");
      expect(checkpointText).not.toContain("temporary-session-secret");
      if (fault !== "install")
        expect(checkpointText).toContain("workmesh_session=install");

      const result = await provisionRetentionSoak(options);
      const finalText = await readFile(options.statePath, "utf8");
      expect(result.state).toEqual({
        schemaVersion: 2,
        sessionId: "session-id",
        installationToken: "installation-only-secret",
        workspaceId: "workspace-id",
        teamId: "team-id",
        workItemId: "work-item-id",
      });
      expect(JSON.parse(finalText)).toEqual(result.state);
      expect(finalText).not.toContain("Soak-recovery-password-Aa1!");
      expect(finalText).not.toContain("temporary-session-secret");
      expect(finalText).not.toContain("workmesh_session");
      for (const count of server.counts.values()) expect(count).toBe(1);
      if (fault === "install") expect(server.counts.get("login")).toBe(1);
      else expect(server.counts.get("login")).toBeUndefined();
    });
  }

  it("supports an already-installed isolated stack through admin login", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const server = new ProvisionServer();
    server.installExisting("admin@example.test", "existing-password");
    const options = await privateTestOptions(directory, server, {
      mode: "existing_installation",
      bootstrapToken: undefined,
      adminEmail: "admin@example.test",
      adminPassword: "existing-password",
    });

    await expect(provisionRetentionSoak(options)).resolves.toMatchObject({
      state: { schemaVersion: 2, sessionId: "session-id" },
    });
    expect(server.counts.get("install")).toBeUndefined();
    expect(server.counts.get("login")).toBe(1);
  });

  it("uses work:read and work:write for the soak Agent and delegation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const server = new ProvisionServer();
    const options = await privateTestOptions(directory, server);
    await provisionRetentionSoak(options);

    expect(server.bodies.get("registerAgent")).toMatchObject({
      requestedCapabilities: ["work:read", "work:write"],
      approvedCapabilities: ["work:read", "work:write"],
    });
    expect(server.bodies.get("grantTeamAccess")).toEqual({
      approvedCapabilities: ["work:read", "work:write"],
    });
    expect(server.bodies.get("delegateAndStart")).toMatchObject({
      agentId: "agent-id",
      principalHumanActorId: "actor-id",
      role: "executor",
      requestedCapabilities: ["work:read", "work:write"],
    });
    expect(server.requestHeaders.get("delegateAndStart")?.get("if-match")).toBe(
      '"revision-1"',
    );
  });

  it("refuses native Windows before persistence or remote access", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const statePath = join(directory, "session.json");
    const request = vi.fn<typeof fetch>();
    await expect(
      provisionRetentionSoak({
        apiUrl: "http://127.0.0.1:3001",
        bootstrapToken: "bootstrap-secret",
        statePath,
        mode: "clean_stack",
        fetch: request,
        platform: "win32",
      }),
    ).rejects.toThrow("RETENTION_SOAK_PROVISION_NATIVE_WINDOWS_UNSUPPORTED");
    expect(request).not.toHaveBeenCalled();
    await expect(stat(statePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("times out a remote request and retains the private checkpoint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workmesh-soak-"));
    temporaryDirectories.push(directory);
    const server = new ProvisionServer();
    const options = await privateTestOptions(directory, server, {
      requestTimeoutMs: 1,
      fetch: vi.fn<typeof fetch>().mockImplementation(
        async (_input, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    });

    await expect(provisionRetentionSoak(options)).rejects.toThrow(
      "RETENTION_SOAK_PROVISION_REQUEST_TIMEOUT",
    );
    await expect(readFile(options.statePath, "utf8")).resolves.toContain(
      '"kind":"checkpoint"',
    );
  });
});
