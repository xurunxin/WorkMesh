import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { exchangeAgentSessionTokenResponseSchema } from "@workmesh/contracts";

type Fetch = typeof fetch;

export type RetentionSoakProvisionOptions = Readonly<{
  apiUrl: string;
  bootstrapToken: string;
  statePath: string;
  fetch?: Fetch;
  idempotencyKey?: () => string;
  uniqueSuffix?: () => string;
}>;

export type RetentionSoakProvisionState = Readonly<{
  schemaVersion: 2;
  sessionId: string;
  installationToken: string;
  workspaceId: string;
  teamId: string;
  workItemId: string;
}>;

const record = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};

const stringField = (
  value: Record<string, unknown>,
  name: string,
  code: string,
): string => {
  const field = value[name];
  if (typeof field !== "string" || !field) throw new Error(code);
  return field;
};

export const provisionRetentionSoak = async (
  options: RetentionSoakProvisionOptions,
): Promise<
  Readonly<{
    state: RetentionSoakProvisionState;
    statePath: string;
  }>
> => {
  const requestImpl = options.fetch ?? fetch;
  const idempotencyKey = options.idempotencyKey ?? randomUUID;
  const uniqueSuffix = options.uniqueSuffix ?? (() => `${Date.now()}`);
  const suffix = uniqueSuffix();
  const apiUrl = new URL(options.apiUrl).toString().replace(/\/$/, "");
  await mkdir(dirname(options.statePath), { recursive: true, mode: 0o700 });
  const stateFile = await open(options.statePath, "wx", 0o600);
  let stateWritten = false;

  try {
    const request = async (
      method: string,
      path: string,
      requestOptions: Readonly<{
        headers?: Readonly<Record<string, string>>;
        body?: object;
      }> = {},
    ): Promise<Readonly<{ body: unknown; headers: Headers }>> => {
      const response = await requestImpl(`${apiUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey(),
          ...requestOptions.headers,
        },
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body),
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      if (!response.ok)
        throw new Error(`RETENTION_SOAK_PROVISION_HTTP_${response.status}`);
      return { body, headers: response.headers };
    };

    const installed = await request("POST", "/api/v1/auth/install", {
      headers: { "x-workmesh-bootstrap-token": options.bootstrapToken },
      body: {
        name: "Retention Soak",
        slug: `retention-soak-${suffix}`,
        adminName: "Retention Operator",
        email: `retention-soak-${suffix}@example.test`,
        password: `Soak-${randomUUID()}-Aa1!`,
      },
    });
    const installedBody = record(
      installed.body,
      "RETENTION_SOAK_PROVISION_INSTALL_RESPONSE_INVALID",
    );
    const cookie = installed.headers.get("set-cookie")?.split(";")[0];
    const csrf = stringField(
      installedBody,
      "csrfToken",
      "RETENTION_SOAK_PROVISION_AUTH_SESSION_MISSING",
    );
    if (!cookie)
      throw new Error("RETENTION_SOAK_PROVISION_AUTH_SESSION_MISSING");

    const human = async (
      method: string,
      path: string,
      body?: object,
    ): Promise<unknown> =>
      (
        await request(method, path, {
          headers: { cookie, "x-csrf-token": csrf },
          body,
        })
      ).body;

    const me = record(
      await human("GET", "/api/v1/auth/me"),
      "RETENTION_SOAK_PROVISION_ME_RESPONSE_INVALID",
    );
    const actor = record(
      me.actor,
      "RETENTION_SOAK_PROVISION_ME_RESPONSE_INVALID",
    );
    const actorId = stringField(
      actor,
      "id",
      "RETENTION_SOAK_PROVISION_ME_RESPONSE_INVALID",
    );
    const workspaceId = stringField(
      actor,
      "workspace_id",
      "RETENTION_SOAK_PROVISION_ME_RESPONSE_INVALID",
    );
    const teams = record(
      await human("GET", "/api/v1/teams"),
      "RETENTION_SOAK_PROVISION_TEAM_MISSING",
    );
    const team = Array.isArray(teams.items)
      ? record(teams.items[0], "RETENTION_SOAK_PROVISION_TEAM_MISSING")
      : undefined;
    if (!team) throw new Error("RETENTION_SOAK_PROVISION_TEAM_MISSING");
    const teamId = stringField(
      team,
      "id",
      "RETENTION_SOAK_PROVISION_TEAM_MISSING",
    );
    const states = record(
      await human("GET", `/api/v1/teams/${teamId}/states`),
      "RETENTION_SOAK_PROVISION_READY_STATE_MISSING",
    );
    const ready = Array.isArray(states.items)
      ? states.items
          .map((value) =>
            record(value, "RETENTION_SOAK_PROVISION_READY_STATE_MISSING"),
          )
          .find((value) => value.name === "Ready")
      : undefined;
    if (!ready) throw new Error("RETENTION_SOAK_PROVISION_READY_STATE_MISSING");
    const readyId = stringField(
      ready,
      "id",
      "RETENTION_SOAK_PROVISION_READY_STATE_MISSING",
    );
    const work = record(
      await human("POST", "/api/v1/work-items", {
        teamId,
        title: "Issue #9 continuous 24-hour retention soak",
        statusId: readyId,
        responsibleHumanActorId: actorId,
      }),
      "RETENTION_SOAK_PROVISION_WORK_ITEM_INVALID",
    );
    const workItemId = stringField(
      work,
      "id",
      "RETENTION_SOAK_PROVISION_WORK_ITEM_INVALID",
    );
    const capabilities = [
      "work:read",
      "work:write",
      "plan:write",
      "artifact:write",
    ];
    const agent = record(
      await human("POST", "/api/v1/agents/register", {
        name: "Retention Soak Agent",
        slug: `retention-soak-agent-${suffix}`,
        provider: "fake",
        version: "1",
        heartbeatIntervalSeconds: 120,
        supportedProtocols: ["native_http"],
        requestedCapabilities: capabilities,
        approvedCapabilities: capabilities,
      }),
      "RETENTION_SOAK_PROVISION_AGENT_INVALID",
    );
    const agentId = stringField(
      agent,
      "id",
      "RETENTION_SOAK_PROVISION_AGENT_INVALID",
    );
    const installationToken = stringField(
      agent,
      "installation_token",
      "RETENTION_SOAK_PROVISION_AGENT_INVALID",
    );
    await human("PUT", `/api/v1/agents/${agentId}/team-access/${teamId}`, {
      approvedCapabilities: capabilities,
    });
    const delegation = record(
      await human("POST", `/api/v1/work-items/${workItemId}/delegations`, {
        agentId,
        principalHumanActorId: actorId,
        role: "executor",
        scopeType: "work_item",
        scopeId: workItemId,
        permissionsSnapshot: capabilities,
        capabilityScope: {
          workspaceId,
          teamIds: [teamId],
          projectIds: [],
          workItemIds: [workItemId],
          repositoryIds: [],
          capabilities,
        },
      }),
      "RETENTION_SOAK_PROVISION_DELEGATION_INVALID",
    );
    const delegationId = stringField(
      delegation,
      "id",
      "RETENTION_SOAK_PROVISION_DELEGATION_INVALID",
    );
    const session = record(
      await human("POST", "/api/v1/agent-sessions", {
        delegationId,
        workItemId,
        initialPrompt: "Run the formal 24-hour retention soak",
        budget: {},
      }),
      "RETENTION_SOAK_PROVISION_SESSION_INVALID",
    );
    const sessionId = stringField(
      session,
      "id",
      "RETENTION_SOAK_PROVISION_SESSION_INVALID",
    );
    const exchangeToken = stringField(
      session,
      "exchangeToken",
      "RETENTION_SOAK_PROVISION_SESSION_INVALID",
    );
    const exchange = await request(
      "POST",
      `/api/v1/agent-sessions/${sessionId}/token/exchange`,
      {
        headers: { authorization: `Bearer ${installationToken}` },
        body: { exchangeToken },
      },
    );
    const exchanged = exchangeAgentSessionTokenResponseSchema.safeParse(
      exchange.body,
    );
    if (!exchanged.success)
      throw new Error("RETENTION_SOAK_PROVISION_EXCHANGE_RESPONSE_INVALID");
    const sessionToken = exchanged.data.sessionToken;
    const ack = record(
      (
        await request("POST", `/api/v1/agent-sessions/${sessionId}/ack`, {
          headers: { authorization: `Bearer ${sessionToken}` },
          body: { summary: "accepted", externalUrls: [] },
        })
      ).body,
      "RETENTION_SOAK_PROVISION_ACK_RESPONSE_INVALID",
    );
    const revision = ack.revision;
    if (typeof revision !== "number" || !Number.isInteger(revision))
      throw new Error("RETENTION_SOAK_PROVISION_ACK_RESPONSE_INVALID");
    await request("POST", `/api/v1/agent-sessions/${sessionId}/heartbeat`, {
      headers: { authorization: `Bearer ${sessionToken}` },
      body: { usage: { runtimeSeconds: 0 } },
    });
    await request("POST", `/api/v1/agent-sessions/${sessionId}/state`, {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "if-match": `"revision-${revision}"`,
      },
      body: { state: "executing", reason: "formal retention soak started" },
    });

    const state: RetentionSoakProvisionState = {
      schemaVersion: 2,
      sessionId,
      installationToken,
      workspaceId,
      teamId,
      workItemId,
    };
    await stateFile.writeFile(`${JSON.stringify(state)}\n`, {
      encoding: "utf8",
    });
    await stateFile.sync();
    await chmod(options.statePath, 0o600);
    stateWritten = true;
    return { state, statePath: options.statePath };
  } finally {
    await stateFile.close();
    if (!stateWritten) await unlink(options.statePath).catch(() => undefined);
  }
};
