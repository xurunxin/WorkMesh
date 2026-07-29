import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { exchangeAgentSessionTokenResponseSchema } from "@workmesh/contracts";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

type Fetch = typeof fetch;
type ProvisionMode = "clean_stack" | "existing_installation";

type ProvisionOperation =
  | "install"
  | "login"
  | "createWorkItem"
  | "registerAgent"
  | "grantTeamAccess"
  | "createDelegation"
  | "createSession"
  | "exchangeToken"
  | "acknowledge"
  | "initialHeartbeat"
  | "transitionExecuting";

type ProvisionOperationKeys = Readonly<Record<ProvisionOperation, string>>;

type RetentionSoakProvisionCheckpoint = Readonly<{
  schemaVersion: 1;
  kind: "checkpoint";
  apiUrl: string;
  mode: ProvisionMode;
  suffix: string;
  createdAt: string;
  admin: Readonly<{ email: string; password: string }>;
  humanSession?: Readonly<{ cookie: string; csrf: string }>;
  operationKeys: ProvisionOperationKeys;
}>;

export type RetentionSoakProvisionOptions = Readonly<{
  apiUrl: string;
  statePath: string;
  mode: ProvisionMode;
  bootstrapToken?: string;
  adminEmail?: string;
  adminPassword?: string;
  fetch?: Fetch;
  idempotencyKey?: () => string;
  uniqueSuffix?: () => string;
  generatedAdminPassword?: () => string;
  now?: () => Date;
  requestTimeoutMs?: number;
  platform?: NodeJS.Platform;
  verifyPrivateFile?: (path: string) => Promise<void>;
  replaceFile?: (source: string, target: string) => Promise<void>;
}>;

export type RetentionSoakProvisionState = Readonly<{
  schemaVersion: 2;
  sessionId: string;
  installationToken: string;
  workspaceId: string;
  teamId: string;
  workItemId: string;
}>;

class ProvisionHttpError extends Error {
  constructor(readonly status: number) {
    super(`RETENTION_SOAK_PROVISION_HTTP_${status}`);
  }
}

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

const operationNames: readonly ProvisionOperation[] = [
  "install",
  "login",
  "createWorkItem",
  "registerAgent",
  "grantTeamAccess",
  "createDelegation",
  "createSession",
  "exchangeToken",
  "acknowledge",
  "initialHeartbeat",
  "transitionExecuting",
];

const parseOperationKeys = (value: unknown): ProvisionOperationKeys => {
  const source = record(value, "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID");
  return Object.fromEntries(
    operationNames.map((name) => [
      name,
      stringField(source, name, "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID"),
    ]),
  ) as unknown as ProvisionOperationKeys;
};

const parseState = (
  value: unknown,
): RetentionSoakProvisionCheckpoint | RetentionSoakProvisionState => {
  const source = record(value, "RETENTION_SOAK_PROVISION_STATE_INVALID");
  if (source.schemaVersion === 2) {
    return {
      schemaVersion: 2,
      sessionId: stringField(
        source,
        "sessionId",
        "RETENTION_SOAK_PROVISION_STATE_INVALID",
      ),
      installationToken: stringField(
        source,
        "installationToken",
        "RETENTION_SOAK_PROVISION_STATE_INVALID",
      ),
      workspaceId: stringField(
        source,
        "workspaceId",
        "RETENTION_SOAK_PROVISION_STATE_INVALID",
      ),
      teamId: stringField(
        source,
        "teamId",
        "RETENTION_SOAK_PROVISION_STATE_INVALID",
      ),
      workItemId: stringField(
        source,
        "workItemId",
        "RETENTION_SOAK_PROVISION_STATE_INVALID",
      ),
    };
  }
  if (
    source.schemaVersion !== 1 ||
    source.kind !== "checkpoint" ||
    (source.mode !== "clean_stack" && source.mode !== "existing_installation")
  )
    throw new Error("RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID");
  const admin = record(
    source.admin,
    "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
  );
  const humanSession =
    source.humanSession === undefined
      ? undefined
      : record(
          source.humanSession,
          "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
        );
  return {
    schemaVersion: 1,
    kind: "checkpoint",
    apiUrl: stringField(
      source,
      "apiUrl",
      "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
    ),
    mode: source.mode,
    suffix: stringField(
      source,
      "suffix",
      "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
    ),
    createdAt: stringField(
      source,
      "createdAt",
      "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
    ),
    admin: {
      email: stringField(
        admin,
        "email",
        "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
      ),
      password: stringField(
        admin,
        "password",
        "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
      ),
    },
    ...(humanSession
      ? {
          humanSession: {
            cookie: stringField(
              humanSession,
              "cookie",
              "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
            ),
            csrf: stringField(
              humanSession,
              "csrf",
              "RETENTION_SOAK_PROVISION_CHECKPOINT_INVALID",
            ),
          },
        }
      : {}),
    operationKeys: parseOperationKeys(source.operationKeys),
  };
};

const defaultVerifyPrivateFile = async (
  path: string,
  platform: NodeJS.Platform,
): Promise<void> => {
  if (platform === "win32")
    throw new Error("RETENTION_SOAK_PROVISION_NATIVE_WINDOWS_UNSUPPORTED");
  const mode = (await stat(path)).mode & 0o777;
  if ((mode & 0o077) !== 0)
    throw new Error("RETENTION_SOAK_PROVISION_STATE_PERMISSIONS_UNSAFE");
};

const writePrivateExclusive = async (
  path: string,
  text: string,
  verify: (path: string) => Promise<void>,
): Promise<void> => {
  const file = await open(path, "wx", 0o600);
  let complete = false;
  try {
    await file.writeFile(text, { encoding: "utf8" });
    await file.sync();
    await chmod(path, 0o600);
    await verify(path);
    complete = true;
  } finally {
    await file.close();
    if (!complete) await unlink(path).catch(() => undefined);
  }
};

const replacePrivateAtomically = async (
  path: string,
  text: string,
  verify: (path: string) => Promise<void>,
  replaceFile: (source: string, target: string) => Promise<void>,
): Promise<void> => {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.final-${randomUUID()}`,
  );
  await writePrivateExclusive(temporaryPath, text, verify);
  try {
    await replaceFile(temporaryPath, path);
    await verify(path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

const authEnvelope = (
  body: unknown,
  headers: Headers,
): Readonly<{ cookie: string; csrf: string }> => {
  const source = record(body, "RETENTION_SOAK_PROVISION_AUTH_SESSION_MISSING");
  const cookie = headers.get("set-cookie")?.split(";")[0];
  const csrf = stringField(
    source,
    "csrfToken",
    "RETENTION_SOAK_PROVISION_AUTH_SESSION_MISSING",
  );
  if (!cookie) throw new Error("RETENTION_SOAK_PROVISION_AUTH_SESSION_MISSING");
  return { cookie, csrf };
};

export const provisionRetentionSoak = async (
  options: RetentionSoakProvisionOptions,
): Promise<
  Readonly<{
    state: RetentionSoakProvisionState;
    statePath: string;
  }>
> => {
  const platform = options.platform ?? process.platform;
  if (platform === "win32")
    throw new Error("RETENTION_SOAK_PROVISION_NATIVE_WINDOWS_UNSUPPORTED");
  const apiUrl = new URL(options.apiUrl).toString().replace(/\/$/, "");
  const verify =
    options.verifyPrivateFile ??
    ((path) => defaultVerifyPrivateFile(path, platform));
  const replaceFile = options.replaceFile ?? rename;
  const requestImpl = options.fetch ?? fetch;
  const idempotencyKey = options.idempotencyKey ?? randomUUID;
  const uniqueSuffix = options.uniqueSuffix ?? (() => `${Date.now()}`);
  const now = options.now ?? (() => new Date());
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  await mkdir(dirname(options.statePath), { recursive: true, mode: 0o700 });
  let checkpointExisted = true;
  let persisted: RetentionSoakProvisionCheckpoint | RetentionSoakProvisionState;
  try {
    await verify(options.statePath);
    persisted = parseState(
      JSON.parse(await readFile(options.statePath, "utf8")) as unknown,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    checkpointExisted = false;
    const suffix = uniqueSuffix();
    const admin =
      options.mode === "existing_installation"
        ? {
            email: options.adminEmail?.trim() ?? "",
            password: options.adminPassword ?? "",
          }
        : {
            email: `retention-soak-${suffix}@example.test`,
            password:
              options.generatedAdminPassword?.() ?? `Soak-${randomUUID()}-Aa1!`,
          };
    if (!admin.email || !admin.password)
      throw new Error(
        "RETENTION_SOAK_PROVISION_REQUIRES_EXISTING_ADMIN_CREDENTIALS",
      );
    const operationKeys = Object.fromEntries(
      operationNames.map((name) => [name, idempotencyKey()]),
    ) as unknown as ProvisionOperationKeys;
    persisted = {
      schemaVersion: 1,
      kind: "checkpoint",
      apiUrl,
      mode: options.mode,
      suffix,
      createdAt: now().toISOString(),
      admin,
      operationKeys,
    };
    await writePrivateExclusive(
      options.statePath,
      `${JSON.stringify(persisted)}\n`,
      verify,
    );
  }

  if (persisted.schemaVersion === 2)
    return { state: persisted, statePath: options.statePath };
  let checkpoint = persisted;
  if (checkpoint.apiUrl !== apiUrl || checkpoint.mode !== options.mode)
    throw new Error("RETENTION_SOAK_PROVISION_CHECKPOINT_CONTEXT_MISMATCH");
  if (checkpoint.mode === "clean_stack" && !options.bootstrapToken)
    throw new Error("RETENTION_SOAK_PROVISION_REQUIRES_BOOTSTRAP_TOKEN");

  const request = async (
    operation: ProvisionOperation | undefined,
    method: string,
    path: string,
    requestOptions: Readonly<{
      headers?: Readonly<Record<string, string>>;
      body?: object;
    }> = {},
  ): Promise<Readonly<{ body: unknown; headers: Headers }>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await requestImpl(`${apiUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(operation
            ? { "idempotency-key": checkpoint.operationKeys[operation] }
            : {}),
          ...requestOptions.headers,
        },
        body:
          requestOptions.body === undefined
            ? undefined
            : JSON.stringify(requestOptions.body),
        signal: controller.signal,
      });
      try {
        body = await response.json();
      } catch {
        if (controller.signal.aborted)
          throw new Error("RETENTION_SOAK_PROVISION_REQUEST_TIMEOUT");
        body = undefined;
      }
    } catch {
      if (controller.signal.aborted)
        throw new Error("RETENTION_SOAK_PROVISION_REQUEST_TIMEOUT");
      throw new Error("RETENTION_SOAK_PROVISION_REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new ProvisionHttpError(response.status);
    return { body, headers: response.headers };
  };

  const login = async () => {
    const response = await request("login", "POST", "/api/v1/auth/login", {
      body: checkpoint.admin,
    });
    return authEnvelope(response.body, response.headers);
  };
  const install = async () => {
    const response = await request("install", "POST", "/api/v1/auth/install", {
      headers: {
        "x-workmesh-bootstrap-token": options.bootstrapToken!,
      },
      body: {
        name: "Retention Soak",
        slug: `retention-soak-${checkpoint.suffix}`,
        adminName: "Retention Operator",
        email: checkpoint.admin.email,
        password: checkpoint.admin.password,
      },
    });
    return authEnvelope(response.body, response.headers);
  };

  let auth = checkpoint.humanSession;
  if (!auth) {
    if (checkpoint.mode === "existing_installation" || checkpointExisted) {
      try {
        auth = await login();
      } catch (error) {
        if (
          checkpoint.mode !== "clean_stack" ||
          !(error instanceof ProvisionHttpError) ||
          error.status !== 401
        )
          throw error;
        auth = await install();
      }
    } else {
      auth = await install();
    }
    checkpoint = { ...checkpoint, humanSession: auth };
    await replacePrivateAtomically(
      options.statePath,
      `${JSON.stringify(checkpoint)}\n`,
      verify,
      replaceFile,
    );
  }

  const human = async (
    operation: ProvisionOperation | undefined,
    method: string,
    path: string,
    body?: object,
  ): Promise<unknown> =>
    (
      await request(operation, method, path, {
        headers: { cookie: auth.cookie, "x-csrf-token": auth.csrf },
        body,
      })
    ).body;

  const me = record(
    await human(undefined, "GET", "/api/v1/auth/me"),
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
    await human(undefined, "GET", "/api/v1/teams"),
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
    await human(undefined, "GET", `/api/v1/teams/${teamId}/states`),
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
    await human("createWorkItem", "POST", "/api/v1/work-items", {
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
  const capabilities = ["work:write"];
  const agent = record(
    await human("registerAgent", "POST", "/api/v1/agents/register", {
      name: "Retention Soak Agent",
      slug: `retention-soak-agent-${checkpoint.suffix}`,
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
  await human(
    "grantTeamAccess",
    "PUT",
    `/api/v1/agents/${agentId}/team-access/${teamId}`,
    { approvedCapabilities: capabilities },
  );
  const delegation = record(
    await human(
      "createDelegation",
      "POST",
      `/api/v1/work-items/${workItemId}/delegations`,
      {
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
      },
    ),
    "RETENTION_SOAK_PROVISION_DELEGATION_INVALID",
  );
  const delegationId = stringField(
    delegation,
    "id",
    "RETENTION_SOAK_PROVISION_DELEGATION_INVALID",
  );
  const session = record(
    await human("createSession", "POST", "/api/v1/agent-sessions", {
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
    "exchangeToken",
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
      await request(
        "acknowledge",
        "POST",
        `/api/v1/agent-sessions/${sessionId}/ack`,
        {
          headers: { authorization: `Bearer ${sessionToken}` },
          body: { summary: "accepted", externalUrls: [] },
        },
      )
    ).body,
    "RETENTION_SOAK_PROVISION_ACK_RESPONSE_INVALID",
  );
  const revision = ack.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision))
    throw new Error("RETENTION_SOAK_PROVISION_ACK_RESPONSE_INVALID");
  await request(
    "initialHeartbeat",
    "POST",
    `/api/v1/agent-sessions/${sessionId}/heartbeat`,
    {
      headers: { authorization: `Bearer ${sessionToken}` },
      body: { usage: { runtimeSeconds: 0 } },
    },
  );
  await request(
    "transitionExecuting",
    "POST",
    `/api/v1/agent-sessions/${sessionId}/state`,
    {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "if-match": `"revision-${revision}"`,
      },
      body: { state: "executing", reason: "formal retention soak started" },
    },
  );

  const state: RetentionSoakProvisionState = {
    schemaVersion: 2,
    sessionId,
    installationToken,
    workspaceId,
    teamId,
    workItemId,
  };
  await replacePrivateAtomically(
    options.statePath,
    `${JSON.stringify(state)}\n`,
    verify,
    replaceFile,
  );
  return { state, statePath: options.statePath };
};
