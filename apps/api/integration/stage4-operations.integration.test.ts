import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createDb,
  opaqueToken,
  tokenHash,
} from "@workmesh/db";
import { FakeA2AAgent } from "@workmesh/a2a-adapter";
import { loadFeatureConfig } from "@workmesh/config";
import { buildApp } from "../src/server.js";
import { seedAgentSessionBearer } from "./agent-session-test-credentials.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Stage 4 API integration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Stage 4 API integration requires a dedicated *test* database.",
  );
const db = createDb(databaseUrl);
const enabledFeatures = loadFeatureConfig({
  WORKMESH_BETA_PLANNING: "true",
  WORKMESH_BETA_TEMPLATES: "true",
  WORKMESH_BETA_COSTS: "true",
  WORKMESH_BETA_GITEA: "true",
  WORKMESH_BETA_OPERATIONS_UI: "true",
  WORKMESH_EXPERIMENTAL_AUTOMATION: "true",
  WORKMESH_EXPERIMENTAL_AGENT_LOOPS: "true",
  WORKMESH_EXPERIMENTAL_A2A: "true",
  WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS: "true",
  WORKMESH_EXPERIMENTAL_MULTI_RUNTIME: "true",
});
const app = buildApp({ features: enabledFeatures });
type Response = {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  json: <T>() => T;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type Human = { cookie: string; csrf: string; actorId: string };

const call = async (
  human: Human,
  method: "GET" | "POST" | "PUT" | "PATCH",
  url: string,
  payload?: object,
  revision?: number,
): Promise<Response> =>
  (await app.inject({
    method,
    url,
    payload,
    headers: {
      cookie: human.cookie,
      "x-csrf-token": human.csrf,
      "idempotency-key": randomUUID(),
      ...(revision ? { "if-match": `"revision-${revision}"` } : {}),
    },
  })) as unknown as Response;

const agentCall = async (
  token: string,
  method: "GET" | "POST" | "PUT" | "PATCH",
  url: string,
  payload?: object,
): Promise<Response> =>
  (await app.inject({
    method,
    url,
    payload,
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": randomUUID(),
    },
  })) as unknown as Response;

const createExecutingReviewer = async (
  human: Human,
  workspaceId: string,
  teamId: string,
  workItemId: string,
  repositoryId: string,
): Promise<{ sessionId: string; token: string }> => {
  const capabilities = [
    "work:read",
    "work:write",
    "artifact:write",
    "repo:read",
  ];
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const registration = await call(human, "POST", "/api/v1/agents/register", {
    name: `Disabled Gitea reviewer ${suffix}`,
    slug: `disabled-gitea-reviewer-${suffix}`,
    provider: "fake",
    version: "1",
    supportedProtocols: ["native_http"],
    requestedCapabilities: capabilities,
    approvedCapabilities: capabilities,
    maxConcurrency: 1,
  });
  expect(registration.statusCode, JSON.stringify(registration.json())).toBe(
    200,
  );
  const agent = registration.json<{ id: string; installation_token: string }>();
  expect(
    (
      await call(
        human,
        "PUT",
        `/api/v1/agents/${agent.id}/team-access/${teamId}`,
        {
          approvedCapabilities: capabilities,
        },
      )
    ).statusCode,
  ).toBe(200);
  const actorId = (await db.query<{ actor_id: string }>(
    "SELECT actor_id FROM agent_definitions WHERE id=$1",
    [agent.id],
  )).rows[0]!.actor_id;
  const delegationId = (await db.query<{ id: string }>(
    `INSERT INTO delegations(
       workspace_id,team_id,agent_id,agent_actor_id,
       principal_human_actor_id,work_item_id,role,scope_type,scope_id,
       permissions_snapshot,capability_scope,status
     ) VALUES($1,$2,$3,$4,$5,$6,'reviewer','work_item',$6,$7,$8,'active')
     RETURNING id`,
    [
      workspaceId,
      teamId,
      agent.id,
      actorId,
      human.actorId,
      workItemId,
      capabilities,
      {
        workspaceId,
        teamIds: [teamId],
        projectIds: [],
        workItemIds: [workItemId],
        repositoryIds: [repositoryId],
        capabilities,
      },
    ],
  )).rows[0]!.id;
  const contextSnapshotId = (await db.query<{ id: string }>(
    `SELECT id FROM context_snapshots
      WHERE workspace_id=$1 AND work_item_id=$2
      ORDER BY created_at DESC,id DESC LIMIT 1`,
    [workspaceId, workItemId],
  )).rows[0]?.id ?? null;
  const sessionBody = (await db.query<{ id: string }>(
    `INSERT INTO agent_sessions(
       workspace_id,team_id,agent_id,agent_actor_id,delegation_id,
       work_item_id,context_snapshot_id,budget
     ) VALUES($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb)
     RETURNING id`,
    [
      workspaceId,
      teamId,
      agent.id,
      actorId,
      delegationId,
      workItemId,
      contextSnapshotId,
    ],
  )).rows[0]!;
  const token = await seedAgentSessionBearer(db, sessionBody.id, agent.id);
  const acknowledged = await agentCall(
    token,
    "POST",
    `/api/v1/agent-sessions/${sessionBody.id}/ack`,
    {
      summary: "Review accepted",
      externalUrls: [],
    },
  );
  expect(acknowledged.statusCode, JSON.stringify(acknowledged.json())).toBe(
    200,
  );
  const executing = (await app.inject({
    method: "POST",
    url: `/api/v1/agent-sessions/${sessionBody.id}/state`,
    payload: {
      state: "executing",
      reason: "Reviewing current pull-request head",
    },
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": randomUUID(),
      "if-match": `"revision-${acknowledged.json<{ revision: number }>().revision}"`,
    },
  })) as unknown as Response;
  expect(executing.statusCode, JSON.stringify(executing.json())).toBe(200);
  await db.query(
    `INSERT INTO repository_contexts(
       workspace_id,repository_id,session_id,base_branch,base_sha,branch_pattern,
       allowed_paths,permissions,guidance_manifest_hash,created_by_actor_id)
     VALUES($1,$2,$3,'main','base','workmesh/{workItemKey}-{slug}',
       ARRAY['**'],ARRAY['read','review'],$4,$5)`,
    [
      workspaceId,
      repositoryId,
      sessionBody.id,
      `sha256:${"b".repeat(64)}`,
      human.actorId,
    ],
  );
  return { sessionId: sessionBody.id, token };
};

describe("Stage 4 planning and operations API", () => {
  let human: Human;
  let workspaceId: string;
  let teamId: string;
  let projectId: string;
  let workItemId: string;

  beforeAll(async () => {
    await applyMigrations(db);
    await db.query("TRUNCATE TABLE workspaces CASCADE");
    const install = (await app.inject({
      method: "POST",
      url: "/api/v1/auth/install",
      payload: {
        name: "Stage Four",
        slug: `stage-four-${randomUUID()}`,
        adminName: "Admin",
        email: `${randomUUID()}@example.test`,
        password: "stage-four-api-password",
      },
      headers: {
        "idempotency-key": randomUUID(),
        "x-workmesh-bootstrap-token": process.env.WORKMESH_BOOTSTRAP_TOKEN!,
      },
    })) as unknown as Response;
    expect(install.statusCode, JSON.stringify(install.json())).toBe(200);
    const setCookie = Array.isArray(install.headers["set-cookie"])
      ? install.headers["set-cookie"][0]
      : install.headers["set-cookie"];
    human = {
      cookie:
        typeof setCookie === "string" ? (setCookie.split(";")[0] ?? "") : "",
      csrf: install.json<{ csrfToken: string }>().csrfToken,
      actorId: "",
    };
    const me = await call(human, "GET", "/api/v1/auth/me");
    human.actorId = me.json<{ actor: { id: string } }>().actor.id;
    teamId = (await call(human, "GET", "/api/v1/teams")).json<
      Page<{ id: string }>
    >().items[0]!.id;
    const stateId = (await call(human, "GET", `/api/v1/teams/${teamId}/states`))
      .json<Page<{ id: string; category: string }>>()
      .items.find((state) => state.category === "backlog")!.id;
    const project = await call(human, "POST", "/api/v1/projects", {
      teamId,
      name: "Operations project",
    });
    projectId = project.json<{ id: string }>().id;
    const work = await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: "Automate triage",
      statusId: stateId,
      responsibleHumanActorId: human.actorId,
    });
    workItemId = work.json<{ id: string }>().id;
    workspaceId = (
      await db.query<{ workspace_id: string }>(
        "SELECT workspace_id FROM projects WHERE id=$1",
        [projectId],
      )
    ).rows[0]!.workspace_id;
  }, 120_000);
  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it("publishes safe release metadata and discloses feature state only after authentication", async () => {
    const info = (await app.inject({
      method: "GET",
      url: "/api/v1/info",
    })) as unknown as Response;
    expect(info.statusCode).toBe(200);
    expect(info.json<Record<string, unknown>>()).toMatchObject({
      serverVersion: "1.0.0",
      restApiVersion: "1.0",
      agentProtocolVersion: "1.0",
      mcpVersion: "1.0.0",
      a2aUpstreamVersion: "0.3",
      preferredClientProfileVersion: "1.0",
      supportedClientProfileVersions: ["1.0"],
      conformanceSuiteVersion: "1.0",
      schemaBaseline: 1,
    });
    expect(Object.keys(info.json<Record<string, unknown>>()).sort()).toEqual([
      "a2aUpstreamVersion",
      "agentProtocolVersion",
      "buildSha",
      "conformanceSuiteVersion",
      "mcpVersion",
      "preferredClientProfileVersion",
      "restApiVersion",
      "schemaBaseline",
      "serverVersion",
      "supportedClientProfileVersions",
    ]);

    const unauthenticated = (await app.inject({
      method: "GET",
      url: "/api/v1/features",
    })) as unknown as Response;
    expect(unauthenticated.statusCode).toBe(401);
    const registry = await call(human, "GET", "/api/v1/features");
    expect(registry.statusCode).toBe(200);
    const deploymentFlags = registry.json<{
      features: Array<{ key: string; tier: string; enabled: boolean }>;
    }>().features;
    expect(deploymentFlags).toHaveLength(11);
    for (const feature of deploymentFlags)
      expect(Object.keys(feature).sort()).toEqual(["enabled", "key", "tier"]);
  });

  it("returns FEATURE_DISABLED after normal authentication without admitting work", async () => {
    const disabled = buildApp({ features: loadFeatureConfig({}) });
    try {
      const response = (await disabled.inject({
        method: "POST",
        url: "/api/v1/automation-rules",
        payload: {
          name: "Must not be admitted",
          trigger: { type: "event", eventTypes: ["work_item.created"] },
          actions: [{ type: "add_label", parameters: { label: "triage" } }],
        },
        headers: {
          cookie: human.cookie,
          "x-csrf-token": human.csrf,
          "idempotency-key": randomUUID(),
        },
      })) as unknown as Response;
      expect(response.statusCode).toBe(403);
      expect(
        response.json<{
          error: { code: string; details: { feature: string } };
        }>().error,
      ).toMatchObject({
        code: "FEATURE_DISABLED",
        details: { feature: "WORKMESH_EXPERIMENTAL_AUTOMATION" },
      });
      expect(
        (
          await db.query(
            "SELECT 1 FROM automation_rules WHERE name='Must not be admitted'",
          )
        ).rowCount,
      ).toBe(0);

      const serviceActorId = (
        await db.query<{ id: string }>(
          "INSERT INTO actors(workspace_id,kind,display_name) VALUES($1,'service','Disabled Gitea') RETURNING id",
          [workspaceId],
        )
      ).rows[0]!.id;
      const connectionId = (
        await db.query<{ id: string }>(
          `INSERT INTO provider_connections(
           workspace_id,provider,external_account_id,display_name,installation_id,
           service_actor_id,webhook_secret_ciphertext,credentials_ciphertext
         ) VALUES($1,'gitea',$2,'Disabled Gitea','https://gitea.example.test',$3,$4,$4)
         RETURNING id`,
          [
            workspaceId,
            randomUUID(),
            serviceActorId,
            Buffer.from("disabled-gitea"),
          ],
        )
      ).rows[0]!.id;
      const repositoryId = (
        await db.query<{ id: string }>(
          `INSERT INTO repositories(
           workspace_id,connection_id,team_id,external_id,full_name,default_branch
         ) VALUES($1,$2,$3,$4,'acme/disabled-gitea','main') RETURNING id`,
          [workspaceId, connectionId, teamId, randomUUID()],
        )
      ).rows[0]!.id;
      const pullRequestId = (
        await db.query<{ id: string }>(
          `INSERT INTO pull_request_projections(
           workspace_id,repository_id,external_id,number,uri,work_item_id,
           base_branch,head_branch,base_sha,head_sha,state,draft)
         VALUES($1,$2,'gitea-pr',17,'https://gitea.example.test/pulls/17',$3,
           'main','workmesh/OPS-1-gitea','base','gitea-head','open',false) RETURNING id`,
          [workspaceId, repositoryId, workItemId],
        )
      ).rows[0]!.id;
      const deliveryId = (
        await db.query<{ id: string }>(
          `INSERT INTO provider_webhook_deliveries(
           connection_id,repository_id,delivery_id,event_name,body_hash,payload)
         VALUES($1,$2,$3,'pull_request_review',$4,'{}') RETURNING id`,
          [
            connectionId,
            repositoryId,
            `gitea-review-${randomUUID()}`,
            `sha256:${"a".repeat(64)}`,
          ],
        )
      ).rows[0]!.id;
      await db.query(
        `INSERT INTO provider_review_projections(
           workspace_id,repository_id,pull_request_id,external_id,state,head_sha,
           author_external_id,author_login,uri,source_delivery_id,
           provider_observed_at,provider_observation_rank)
         VALUES($1,$2,$3,'review-17','approved','gitea-head','42','reviewer',
           'https://gitea.example.test/reviews/17',$4,now(),1)`,
        [workspaceId, repositoryId, pullRequestId, deliveryId],
      );
      await db.query(
        `INSERT INTO ci_check_projections(
           pull_request_id,external_id,name,status,required,head_sha,details_url)
         VALUES($1,'check-17','test','passed',true,'gitea-head',
           'https://gitea.example.test/checks/17')`,
        [pullRequestId],
      );

      const reviewer = await createExecutingReviewer(
        human,
        workspaceId,
        teamId,
        workItemId,
        repositoryId,
      );
      const reviewIdempotencyKey = randomUUID();
      const review = (await disabled.inject({
        method: "POST",
        url: `/api/v1/pull-requests/${pullRequestId}/reviews`,
        payload: {
          sessionId: reviewer.sessionId,
          artifactId: randomUUID(),
          headSha: "gitea-head",
          verdict: "changes_requested",
          summary: "Must not be admitted while Gitea is disabled",
          findings: [
            {
              severity: "high",
              file: "src/provider.ts",
              line: 17,
              summary: "Must not persist",
              evidence: "The provider capability is disabled.",
              recommendation: "Enable the reviewed provider before publishing.",
            },
          ],
        },
        headers: {
          authorization: `Bearer ${reviewer.token}`,
          "idempotency-key": reviewIdempotencyKey,
        },
      })) as unknown as Response;
      expect(review.statusCode).toBe(403);
      expect(
        review.json<{ error: { code: string; details: { feature: string } } }>()
          .error,
      ).toMatchObject({
        code: "FEATURE_DISABLED",
        details: { feature: "WORKMESH_BETA_GITEA" },
      });
      expect(
        (
          await db.query<{
            reviews: string;
            findings: string;
            events: string;
            outbox: string;
            idempotency: string;
          }>(
            `SELECT
           (SELECT count(*) FROM structured_reviews WHERE pull_request_id=$1)::text AS reviews,
           (SELECT count(*) FROM structured_review_findings finding
             JOIN structured_reviews review ON review.id=finding.review_id
            WHERE review.pull_request_id=$1)::text AS findings,
           (SELECT count(*) FROM domain_events
             WHERE aggregate_type='pull_request' AND aggregate_id=$1
               AND event_type='pull_request.reviewed')::text AS events,
           (SELECT count(*) FROM outbox_events outbox
             JOIN domain_events event ON event.id=outbox.domain_event_id
            WHERE event.aggregate_type='pull_request' AND event.aggregate_id=$1
              AND event.event_type='pull_request.reviewed')::text AS outbox,
           (SELECT count(*) FROM api_idempotency_keys
             WHERE idempotency_key=$2)::text AS idempotency`,
            [pullRequestId, reviewIdempotencyKey],
          )
        ).rows[0],
      ).toEqual({
        reviews: "0",
        findings: "0",
        events: "0",
        outbox: "0",
        idempotency: "0",
      });

      for (const url of [
        "/api/v1/repositories",
        `/api/v1/repositories/${repositoryId}/context`,
      ]) {
        const read = (await disabled.inject({
          method: "GET",
          url,
          headers: { cookie: human.cookie },
        })) as unknown as Response;
        expect(read.statusCode).toBe(403);
        expect(
          read.json<{ error: { code: string; details: { feature: string } } }>()
            .error,
        ).toMatchObject({
          code: "FEATURE_DISABLED",
          details: { feature: "WORKMESH_BETA_GITEA" },
        });
      }
      const delivery = (await disabled.inject({
        method: "GET",
        url: `/api/v1/projects/${projectId}/delivery`,
        headers: { cookie: human.cookie },
      })) as unknown as Response;
      expect(delivery.statusCode).toBe(403);
      expect(
        delivery.json<{
          error: { code: string; details: { feature: string } };
        }>().error,
      ).toMatchObject({
        code: "FEATURE_DISABLED",
        details: { feature: "WORKMESH_BETA_GITEA" },
      });
    } finally {
      await disabled.close();
    }
  });

  it("rejects manual trigger and dry-run before admission when a child action feature is disabled", async () => {
    const ruleId = (
      await db.query<{ id: string }>(
        `INSERT INTO automation_rules(workspace_id,team_id,name,created_by_actor_id)
       VALUES($1,$2,$3,$4) RETURNING id`,
        [workspaceId, teamId, `disabled-notify-${randomUUID()}`, human.actorId],
      )
    ).rows[0]!.id;
    const versionId = (
      await db.query<{ id: string }>(
        `INSERT INTO automation_rule_versions(
         rule_id,version,trigger,actions,max_attempts,created_by_actor_id)
       VALUES($1,1,$2,$3,3,$4) RETURNING id`,
        [
          ruleId,
          { type: "manual" },
          JSON.stringify([
            {
              type: "notify",
              parameters: {
                recipientActorId: human.actorId,
                title: "No admission",
              },
            },
          ]),
          human.actorId,
        ],
      )
    ).rows[0]!.id;
    await db.query(
      "UPDATE automation_rules SET current_version_id=$1 WHERE id=$2",
      [versionId, ruleId],
    );
    const childDisabled = buildApp({
      features: loadFeatureConfig({ WORKMESH_EXPERIMENTAL_AUTOMATION: "true" }),
    });
    try {
      for (const operation of ["trigger", "dry-run"]) {
        const response = (await childDisabled.inject({
          method: "POST",
          url: `/api/v1/automation-rules/${ruleId}/${operation}`,
          payload: {
            occurrenceKey: `${operation}:${randomUUID()}`,
            payload: {},
          },
          headers: {
            cookie: human.cookie,
            "x-csrf-token": human.csrf,
            "idempotency-key": randomUUID(),
          },
        })) as unknown as Response;
        expect(response.statusCode).toBe(403);
        expect(
          response.json<{
            error: { code: string; details: { feature: string } };
          }>().error,
        ).toMatchObject({
          code: "FEATURE_DISABLED",
          details: { feature: "WORKMESH_BETA_PLANNING" },
        });
      }
      expect(
        (
          await db.query("SELECT 1 FROM automation_runs WHERE rule_id=$1", [
            ruleId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await db.query(
            "SELECT 1 FROM automation_occurrences WHERE rule_id=$1",
            [ruleId],
          )
        ).rowCount,
      ).toBe(0);
    } finally {
      await childDisabled.close();
    }
  });

  it("serves Cycle carry-over, Initiative rollup, advanced View, and explainable health", async () => {
    const generated = await call(human, "POST", "/api/v1/cycles/generate", {
      teamId,
      firstStartsAt: "2026-07-27T00:00:00Z",
      durationWeeks: 1,
      count: 2,
      namePrefix: "Week",
    });
    expect(generated.statusCode, JSON.stringify(generated.json())).toBe(200);
    const [firstCycleId, secondCycleId] = generated.json<{ ids: string[] }>()
      .ids;
    expect(
      (
        await call(
          human,
          "PATCH",
          `/api/v1/work-items/${workItemId}/cycle`,
          { cycleId: firstCycleId },
          1,
        )
      ).statusCode,
    ).toBe(200);
    const carry = await call(
      human,
      "POST",
      `/api/v1/cycles/${firstCycleId}/carry-over`,
      { targetCycleId: secondCycleId },
    );
    expect(carry.json<{ moved: string[] }>().moved).toEqual([workItemId]);
    const cycles = await call(human, "GET", `/api/v1/cycles?teamId=${teamId}`);
    expect(cycles.json<Page<{ id: string }>>().items).toHaveLength(2);

    const initiative = await call(human, "POST", "/api/v1/initiatives", {
      name: "Reliable operations",
      ownerActorId: human.actorId,
      status: "active",
      priority: "high",
      health: "at_risk",
      projectIds: [projectId],
    });
    expect(initiative.statusCode).toBe(200);
    const rollup = await call(
      human,
      "GET",
      `/api/v1/initiatives/${initiative.json<{ id: string }>().id}/rollup`,
    );
    expect(rollup.json<{ projectCount: number }>().projectCount).toBe(1);

    const view = await call(human, "POST", "/api/v1/advanced-views", {
      name: "Expensive sessions",
      entityType: "session",
      filters: {
        cost: { minMinor: "100", currency: "USD" },
        sessionStates: ["executing"],
      },
      ordering: [{ field: "cost", direction: "desc" }],
      visibleFields: ["agent", "cost", "health"],
      layout: "timeline",
      scope: "workspace",
      favorite: true,
    });
    expect(view.statusCode, JSON.stringify(view.json())).toBe(200);
    const evaluated = await call(
      human,
      "GET",
      `/api/v1/advanced-views/${view.json<{ id: string }>().id}/results`,
    );
    expect(evaluated.statusCode, JSON.stringify(evaluated.json())).toBe(200);
    expect(evaluated.json<Page<unknown>>()).toEqual({
      items: [],
      nextCursor: null,
    });
    const unsupportedView = await call(
      human,
      "POST",
      "/api/v1/advanced-views",
      {
        name: "Unsupported filter",
        entityType: "issue",
        filters: { futureFilterThatMustNotBeIgnored: true },
        layout: "list",
        scope: "private",
      },
    );
    expect(unsupportedView.statusCode).toBe(400);
    expect(unsupportedView.json<{ error: { code: string } }>().error.code).toBe(
      "VIEW_FILTER_UNSUPPORTED",
    );

    const health = await call(
      human,
      "POST",
      `/api/v1/projects/${projectId}/health`,
      {
        source: "human",
        health: "at_risk",
        summary: "One blocking triage item remains.",
        confidence: 0.8,
        uncertainty: "The external queue can change.",
        publish: true,
        sources: [
          {
            kind: "work_item",
            id: workItemId,
            observedAt: "2026-07-26T00:00:00Z",
            value: { blocked: true },
          },
        ],
      },
      1,
    );
    expect(health.statusCode, JSON.stringify(health.json())).toBe(200);
    const healthHistory = await call(
      human,
      "GET",
      `/api/v1/projects/${projectId}/health`,
    );
    expect(
      healthHistory.json<Page<{ uncertainty: string; sources: unknown[] }>>()
        .items[0],
    ).toEqual(
      expect.objectContaining({
        uncertainty: "The external queue can change.",
        sources: expect.any(Array),
      }),
    );
  });

  it("persists immutable Rule dry-run traces with zero effects and inert Template imports", async () => {
    const invalidCron = await call(human, "POST", "/api/v1/automation-rules", {
      name: `Invalid cron ${randomUUID()}`,
      teamId,
      trigger: { type: "schedule", cron: "* * * * * *", timezone: "UTC" },
      actions: [{ type: "notify", parameters: { title: "Must not exist" } }],
    });
    expect(invalidCron.statusCode).toBe(400);
    const rule = await call(human, "POST", "/api/v1/automation-rules", {
      name: `Dry run ${randomUUID()}`,
      teamId,
      trigger: { type: "event", eventTypes: ["work_item.created"] },
      condition: { field: "priority", op: "eq", value: "urgent" },
      actions: [{ type: "notify", parameters: { title: "Urgent work" } }],
      maxAttempts: 3,
    });
    expect(rule.statusCode, JSON.stringify(rule.json())).toBe(200);
    const dryRun = await call(
      human,
      "POST",
      `/api/v1/automation-rules/${rule.json<{ id: string }>().id}/dry-run`,
      {
        occurrenceKey: `dry:${randomUUID()}`,
        payload: { priority: "urgent" },
      },
    );
    expect(
      dryRun.json<{
        status: string;
        trace: { matched: boolean; effectsCreated: number };
      }>(),
    ).toMatchObject({
      status: "dry_run",
      trace: { matched: true, effectsCreated: 0 },
    });
    expect(
      (
        await db.query("SELECT 1 FROM automation_effects WHERE run_id=$1", [
          dryRun.json<{ id: string }>().id,
        ])
      ).rowCount,
    ).toBe(0);

    const otherTeam = await call(human, "POST", "/api/v1/teams", {
      name: `Other ${randomUUID()}`,
      key: `O${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase(),
    });
    const otherActorId = randomUUID();
    const otherToken = opaqueToken();
    const otherCsrf = opaqueToken();
    await db.query(
      `INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,$2,'human','member',$3,'Other Team Member','unused')`,
      [otherActorId, workspaceId, `${randomUUID()}@example.test`],
    );
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role)
       VALUES($1,$2,$3,'member')`,
      [workspaceId, otherTeam.json<{ id: string }>().id, otherActorId],
    );
    await db.query(
      `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
       VALUES($1,$2,$3,now()+interval '1 hour')`,
      [otherActorId, tokenHash(otherToken), otherCsrf],
    );
    const crossTeam = await call(
      {
        cookie: `workmesh_session=${otherToken}`,
        csrf: otherCsrf,
        actorId: otherActorId,
      },
      "POST",
      `/api/v1/automation-rules/${rule.json<{ id: string }>().id}/dry-run`,
      {
        occurrenceKey: `cross-team:${randomUUID()}`,
        payload: { priority: "urgent" },
      },
    );
    expect(crossTeam.statusCode).toBe(403);

    const template = await call(human, "POST", "/api/v1/templates", {
      kind: "automation",
      name: `Triage template ${randomUUID()}`,
      body: { trigger: "work_item.created", labels: ["triage"] },
    });
    expect(template.statusCode).toBe(200);
    const activated = await call(
      human,
      "POST",
      `/api/v1/templates/${template.json<{ id: string }>().id}/state`,
      { status: "active" },
      1,
    );
    expect(activated.json<{ status: string }>().status).toBe("active");
    const imported = await call(human, "POST", "/api/v1/templates/import", {
      formatVersion: 1,
      templates: [
        {
          kind: "agent_run",
          name: `Imported ${randomUUID()}`,
          versions: [
            {
              body: { guidance: "Triage safely." },
              changeSummary: "Safe import",
            },
          ],
        },
      ],
    });
    expect(imported.json<{ status: string }>().status).toBe("draft");
    const importedId = imported.json<{ ids: string[] }>().ids[0]!;
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM templates WHERE id=$1",
          [importedId],
        )
      ).rows[0]!.status,
    ).toBe("draft");
  });

  it("atomically applies sequenced A2A deliveries to one Session across outbound streaming", async () => {
    const exactOutboundCursor = 9_007_199_254_740_993n;
    await db.query(
      `SELECT setval(
         'domain_events_cursor_seq',
         GREATEST($1::bigint,(
           SELECT COALESCE(max(cursor),0)+1 FROM domain_events
         )),
         false
       )`,
      [exactOutboundCursor.toString()],
    );
    const registration = await call(human, "POST", "/api/v1/agents/register", {
      name: "A2A conformance",
      slug: `a2a-${randomUUID()}`,
      provider: "fake",
      version: "1",
      supportedProtocols: ["a2a"],
      requestedCapabilities: ["work:read", "work:write"],
      approvedCapabilities: ["work:read", "work:write"],
      maxConcurrency: 2,
    });
    expect(registration.statusCode).toBe(200);
    const agentId = registration.json<{ id: string }>().id;
    expect(
      (
        await call(
          human,
          "PUT",
          `/api/v1/agents/${agentId}/team-access/${teamId}`,
          {
            approvedCapabilities: ["work:read", "work:write"],
          },
        )
      ).statusCode,
    ).toBe(200);
    const fake = new FakeA2AAgent();
    const binding = await call(human, "POST", "/api/v1/a2a-bindings", {
      agentId,
      protocolVersion: "0.3",
      agentCard: { ...fake.card, url: "https://example.com/a2a" },
    });
    expect(binding.statusCode, JSON.stringify(binding.json())).toBe(200);
    const externalTask = fake.complete(`task-${randomUUID()}`);
    const bindingId = binding.json<{ id: string }>().id;
    const submitted = {
      ...externalTask,
      status: { state: "submitted" as const },
      history: [],
      artifacts: [],
    };
    const firstDeliveryId = `delivery-${randomUUID()}`;
    const task = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: firstDeliveryId,
        sequence: 1,
        requestedCapabilities: ["work:read"],
        task: submitted,
      },
    );
    expect(task.statusCode, JSON.stringify(task.json())).toBe(200);
    const sessionId = task.json<{ sessionId: string }>().sessionId;
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM agent_sessions WHERE id=$1",
          [sessionId],
        )
      ).rows[0]!.state,
    ).toBe("queued");

    const working = { ...externalTask, status: { state: "working" as const } };
    const workingDeliveryId = `delivery-${randomUUID()}`;
    const workingResponse = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: workingDeliveryId,
        sequence: 2,
        requestedCapabilities: ["work:read"],
        task: working,
      },
    );
    expect(workingResponse.json<{ sessionId: string }>().sessionId).toBe(
      sessionId,
    );
    expect(
      (
        await db.query<{ state: string }>(
          "SELECT state FROM agent_sessions WHERE id=$1",
          [sessionId],
        )
      ).rows[0]!.state,
    ).toBe("executing");

    const agentToken = opaqueToken();
    const installationTokenId = (
      await db.query<{ id: string }>(
        "SELECT id FROM agent_installation_tokens WHERE agent_id=$1 AND revoked_at IS NULL LIMIT 1",
        [agentId],
      )
    ).rows[0]!.id;
    await db.query(
      `INSERT INTO agent_session_tokens(
         session_id,agent_id,installation_token_id,token_hash,exchange_nonce_hash,expires_at,exchanged_at
       ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now())`,
      [
        sessionId,
        agentId,
        installationTokenId,
        tokenHash(agentToken),
        tokenHash(opaqueToken()),
      ],
    );
    const agentUsageKey = `agent-usage:${randomUUID()}`;
    const agentUsage = await agentCall(
      agentToken,
      "POST",
      "/api/v1/usage-records",
      {
        dedupeKey: agentUsageKey,
        agentId,
        sessionId,
        projectId,
        occurredAt: new Date().toISOString(),
        costMinor: "0",
        currency: "USD",
        costSource: "provider_reported",
      },
    );
    expect(agentUsage.statusCode, JSON.stringify(agentUsage.json())).toBe(200);
    const deniedAgentUsageKey = `agent-usage-project-denied:${randomUUID()}`;
    const deniedAgentUsage = await agentCall(
      agentToken,
      "POST",
      "/api/v1/usage-records",
      {
        dedupeKey: deniedAgentUsageKey,
        agentId,
        sessionId,
        projectId: randomUUID(),
        occurredAt: new Date().toISOString(),
        costMinor: "1",
        currency: "USD",
        costSource: "provider_reported",
      },
    );
    expect(deniedAgentUsage.statusCode).toBe(403);
    expect(
      deniedAgentUsage.json<{ error: { code: string } }>().error.code,
    ).toBe("RESOURCE_SCOPE_DENIED");
    expect(
      (
        await db.query(
          "SELECT 1 FROM usage_records WHERE workspace_id=$1 AND dedupe_key=$2",
          [workspaceId, deniedAgentUsageKey],
        )
      ).rowCount,
    ).toBe(0);

    const firstStream = await call(
      human,
      "GET",
      `/api/v1/a2a-bindings/${bindingId}/tasks/${externalTask.id}/events`,
    );
    expect(firstStream.statusCode, JSON.stringify(firstStream.json())).toBe(
      200,
    );
    expect(
      firstStream.json<{ events: unknown[] }>().events.length,
    ).toBeGreaterThan(0);
    const outboundSequence = (
      await db.query<{ sequence: string }>(
        `SELECT sequence::text FROM a2a_deliveries
        WHERE binding_id=$1 AND external_task_id=$2 AND direction='outbound'
        ORDER BY sequence LIMIT 1`,
        [bindingId, externalTask.id],
      )
    ).rows[0]!.sequence;
    expect(outboundSequence).toBe(BigInt(outboundSequence).toString());
    expect(BigInt(outboundSequence)).toBeGreaterThanOrEqual(
      exactOutboundCursor,
    );
    const completionInboundSequence = 3;

    const completed = {
      ...externalTask,
      status: { state: "completed" as const },
      history: [
        ...externalTask.history!,
        {
          id: `${externalTask.id}:message:2`,
          role: "agent" as const,
          parts: [
            { kind: "text" as const, text: "Completion evidence attached." },
          ],
        },
      ],
      artifacts: [
        ...externalTask.artifacts!,
        {
          id: `${externalTask.id}:artifact:2`,
          name: "completion-evidence",
          parts: [{ kind: "data" as const, data: { verified: true } }],
        },
      ],
    };
    const completionDeliveryId = `delivery-${randomUUID()}`;
    const completion = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: completionDeliveryId,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:read"],
        task: completed,
      },
    );
    expect(completion.statusCode, JSON.stringify(completion.json())).toBe(200);
    expect(completion.json<{ sessionId: string }>().sessionId).toBe(sessionId);
    const session = (
      await db.query<{ state: string; result_summary: string }>(
        "SELECT state,result_summary FROM agent_sessions WHERE id=$1 AND workspace_id=$2",
        [sessionId, workspaceId],
      )
    ).rows[0];
    expect(session).toEqual({
      state: "completed",
      result_summary: "Completed through A2A",
    });
    expect(
      (
        await db.query(
          "SELECT 1 FROM agent_session_prompts WHERE session_id=$1",
          [sessionId],
        )
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await db.query("SELECT 1 FROM artifacts WHERE session_id=$1", [
          sessionId,
        ])
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await db.query<{ state: string }>(
          `SELECT payload->>'state' AS state FROM domain_events
        WHERE aggregate_id=$1 AND event_type='agent.session.state_changed'
        ORDER BY cursor`,
          [sessionId],
        )
      ).rows.map((row) => row.state),
    ).toEqual(["queued", "acknowledged", "executing", "completed"]);
    expect(
      (
        await db.query<{ count: string }>(
          `SELECT count(*)::text AS count
         FROM domain_events event
         JOIN outbox_events outbox ON outbox.domain_event_id=event.id
        WHERE event.aggregate_id=$1
          AND event.event_type='agent.session.state_changed'`,
          [sessionId],
        )
      ).rows[0]!.count,
    ).toBe("4");

    const acceptedBeforeReplay = (
      await db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM domain_events
        WHERE event_type='a2a.task.accepted' AND payload->>'deliveryId'=$1`,
        [completionDeliveryId],
      )
    ).rows[0]!.count;
    const replay = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: completionDeliveryId,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:read"],
        task: completed,
      },
    );
    expect(replay.json<{ sessionId: string }>().sessionId).toBe(sessionId);
    expect(
      (
        await db.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM domain_events
        WHERE event_type='a2a.task.accepted' AND payload->>'deliveryId'=$1`,
          [completionDeliveryId],
        )
      ).rows[0]!.count,
    ).toBe(acceptedBeforeReplay);

    const changedCapability = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: completionDeliveryId,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:write"],
        task: completed,
      },
    );
    expect(changedCapability.statusCode).toBe(409);
    expect(
      changedCapability.json<{ error: { code: string } }>().error.code,
    ).toBe("A2A_DELIVERY_CONFLICT");

    const siblingWork = await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: "A2A replay sibling",
      statusId: (await call(human, "GET", `/api/v1/teams/${teamId}/states`))
        .json<Page<{ id: string; category: string }>>()
        .items.find((state) => state.category === "backlog")!.id,
      responsibleHumanActorId: human.actorId,
    });
    const changedWorkItem = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId: siblingWork.json<{ id: string }>().id,
        deliveryId: completionDeliveryId,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:read"],
        task: completed,
      },
    );
    expect(changedWorkItem.statusCode).toBe(409);
    expect(changedWorkItem.json<{ error: { code: string } }>().error.code).toBe(
      "A2A_DELIVERY_CONFLICT",
    );

    const replayTeam = await call(human, "POST", "/api/v1/teams", {
      name: `A2A replay ${randomUUID()}`,
      key: `R${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase(),
    });
    const replayTeamId = replayTeam.json<{ id: string }>().id;
    expect(
      (
        await call(
          human,
          "PUT",
          `/api/v1/agents/${agentId}/team-access/${replayTeamId}`,
          {
            approvedCapabilities: ["work:read", "work:write"],
          },
        )
      ).statusCode,
    ).toBe(200);
    const replayProject = await call(human, "POST", "/api/v1/projects", {
      teamId: replayTeamId,
      name: "A2A replay project",
    });
    const replayTeamStateId = (
      await db.query<{ id: string }>(
        `INSERT INTO workflow_states(workspace_id,team_id,name,category,position)
       VALUES($1,$2,'Backlog','backlog',0) RETURNING id`,
        [workspaceId, replayTeamId],
      )
    ).rows[0]!.id;
    const replayTeamWork = await call(human, "POST", "/api/v1/work-items", {
      teamId: replayTeamId,
      projectId: replayProject.json<{ id: string }>().id,
      title: "A2A replay cross-team work",
      statusId: replayTeamStateId,
      responsibleHumanActorId: human.actorId,
    });
    const changedTeam = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId: replayTeamId,
        workItemId: replayTeamWork.json<{ id: string }>().id,
        deliveryId: completionDeliveryId,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:read"],
        task: completed,
      },
    );
    expect(changedTeam.statusCode).toBe(409);
    expect(changedTeam.json<{ error: { code: string } }>().error.code).toBe(
      "A2A_DELIVERY_CONFLICT",
    );

    const outOfOrder = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId,
        deliveryId: `delivery-${randomUUID()}`,
        sequence: completionInboundSequence,
        requestedCapabilities: ["work:read"],
        task: completed,
      },
    );
    expect(outOfOrder.statusCode).toBe(409);
    expect(outOfOrder.json<{ error: { code: string } }>().error.code).toBe(
      "A2A_DELIVERY_OUT_OF_ORDER",
    );

    const beforeIrrelevant = (
      await db.query<{ cursor: string }>(
        "SELECT coalesce(max(cursor),0)::text AS cursor FROM domain_events WHERE workspace_id=$1",
        [workspaceId],
      )
    ).rows[0]!.cursor;
    await db.query(
      `INSERT INTO domain_events(
         workspace_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id,payload
       )
       SELECT $1,'test.irrelevant','test',gen_random_uuid(),$2,gen_random_uuid(),'{}'::jsonb
         FROM generate_series(1,205)`,
      [workspaceId, human.actorId],
    );
    await db.query(
      `INSERT INTO domain_events(
         workspace_id,team_id,event_type,aggregate_type,aggregate_id,actor_id,correlation_id,payload
       ) VALUES($1,$2,'agent.activity.created','agent_session',$3,$4,gen_random_uuid(),$5)`,
      [
        workspaceId,
        teamId,
        sessionId,
        human.actorId,
        {
          sessionId,
          bodyMarkdown: "Mapped only after irrelevant cursor pages.",
        },
      ],
    );
    const emptyPage = await call(
      human,
      "GET",
      `/api/v1/a2a-bindings/${bindingId}/tasks/${externalTask.id}/events?after=${beforeIrrelevant}`,
    );
    const emptyPayload = emptyPage.json<{
      cursor: string;
      events: unknown[];
    }>();
    expect(emptyPayload.events).toEqual([]);
    expect(BigInt(emptyPayload.cursor)).toBeGreaterThan(
      BigInt(beforeIrrelevant),
    );
    const mappedPage = await call(
      human,
      "GET",
      `/api/v1/a2a-bindings/${bindingId}/tasks/${externalTask.id}/events?after=${emptyPayload.cursor}`,
    );
    expect(
      mappedPage.json<{
        cursor: string;
        events: Array<{ event: { kind: string } }>;
      }>().events,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: expect.objectContaining({ kind: "message" }),
        }),
      ]),
    );

    await db.query("UPDATE a2a_agent_bindings SET active=false WHERE id=$1", [
      bindingId,
    ]);
    const revoked = await call(
      human,
      "GET",
      `/api/v1/a2a-bindings/${bindingId}/tasks/${externalTask.id}/events`,
    );
    expect(revoked.statusCode).toBe(404);
  });

  it("applies A2A execution capacity only to a newly imported non-terminal task", async () => {
    const backlogStateId = (await call(
      human,
      "GET",
      `/api/v1/teams/${teamId}/states`,
    )).json<Page<{ id: string; category: string }>>().items
      .find((state) => state.category === "backlog")!.id;
    const capacityWork = await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: `A2A capacity import ${randomUUID()}`,
      statusId: backlogStateId,
      responsibleHumanActorId: human.actorId,
    });
    expect(capacityWork.statusCode, JSON.stringify(capacityWork.json())).toBe(200);
    const capacityWorkItemId = capacityWork.json<{ id: string }>().id;

    const registration = await call(human, "POST", "/api/v1/agents/register", {
      name: "A2A capacity",
      slug: `a2a-capacity-${randomUUID()}`,
      provider: "fake",
      version: "1",
      supportedProtocols: ["a2a"],
      requestedCapabilities: ["work:read", "work:write"],
      approvedCapabilities: ["work:read", "work:write"],
      maxConcurrency: 1,
    });
    expect(registration.statusCode, JSON.stringify(registration.json())).toBe(200);
    const agentId = registration.json<{ id: string }>().id;
    expect((await call(
      human,
      "PUT",
      `/api/v1/agents/${agentId}/team-access/${teamId}`,
      { approvedCapabilities: ["work:read", "work:write"] },
    )).statusCode).toBe(200);
    const fake = new FakeA2AAgent();
    const binding = await call(human, "POST", "/api/v1/a2a-bindings", {
      agentId,
      protocolVersion: "0.3",
      agentCard: { ...fake.card, url: "https://example.com/a2a-capacity" },
    });
    expect(binding.statusCode, JSON.stringify(binding.json())).toBe(200);
    const bindingId = binding.json<{ id: string }>().id;

    const activeTask = fake.complete(`active-${randomUUID()}`);
    const submitted = {
      ...activeTask,
      status: { state: "submitted" as const },
      history: [],
      artifacts: [],
    };
    const first = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId: capacityWorkItemId,
        deliveryId: `delivery-${randomUUID()}`,
        sequence: 1,
        requestedCapabilities: ["work:read"],
        task: submitted,
      },
    );
    expect(first.statusCode, JSON.stringify(first.json())).toBe(200);
    const activeSessionId = first.json<{ sessionId: string }>().sessionId;
    type AdmissionPersistenceCounts = {
      delegation_count: number;
      session_count: number;
      event_count: number;
      outbox_count: number;
    };
    const persistenceCountsBeforeRejection = (await db.query<AdmissionPersistenceCounts>(
      `SELECT
         (SELECT count(*)::int FROM delegations WHERE workspace_id=$1 AND agent_id=$2) AS delegation_count,
         (SELECT count(*)::int FROM agent_sessions WHERE workspace_id=$1 AND agent_id=$2) AS session_count,
         (SELECT count(*)::int FROM domain_events WHERE workspace_id=$1) AS event_count,
         (SELECT count(*)::int FROM outbox_events outbox
           JOIN domain_events event ON event.id=outbox.domain_event_id
          WHERE event.workspace_id=$1) AS outbox_count`,
      [workspaceId, agentId],
    )).rows[0]!;

    const rejectedTask = fake.complete(`rejected-${randomUUID()}`);
    const rejectedDeliveryId = `delivery-${randomUUID()}`;
    const rejected = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId: capacityWorkItemId,
        deliveryId: rejectedDeliveryId,
        sequence: 1,
        requestedCapabilities: ["work:read"],
        task: {
          ...rejectedTask,
          status: { state: "submitted" as const },
          history: [],
          artifacts: [],
        },
      },
    );
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json<{
      error: {
        code: string;
        details: {
          maxConcurrency: number;
          activeExecutionSessionCount: number;
          activeExecutionSessionsByState: Record<string, number>;
        };
      };
    }>().error).toMatchObject({
      code: "AGENT_CONCURRENCY_LIMIT",
      details: {
        maxConcurrency: 1,
        activeExecutionSessionCount: 1,
        activeExecutionSessionsByState: { queued: 1 },
      },
    });
    expect((await db.query(
      "SELECT 1 FROM a2a_deliveries WHERE binding_id=$1 AND delivery_id=$2",
      [bindingId, rejectedDeliveryId],
    )).rowCount).toBe(0);
    expect((await db.query<AdmissionPersistenceCounts>(
      `SELECT
         (SELECT count(*)::int FROM delegations WHERE workspace_id=$1 AND agent_id=$2) AS delegation_count,
         (SELECT count(*)::int FROM agent_sessions WHERE workspace_id=$1 AND agent_id=$2) AS session_count,
         (SELECT count(*)::int FROM domain_events WHERE workspace_id=$1) AS event_count,
         (SELECT count(*)::int FROM outbox_events outbox
           JOIN domain_events event ON event.id=outbox.domain_event_id
          WHERE event.workspace_id=$1) AS outbox_count`,
      [workspaceId, agentId],
    )).rows[0]).toEqual(persistenceCountsBeforeRejection);

    const existingUpdate = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId: capacityWorkItemId,
        deliveryId: `delivery-${randomUUID()}`,
        sequence: 2,
        requestedCapabilities: ["work:read"],
        task: { ...activeTask, status: { state: "working" as const } },
      },
    );
    expect(existingUpdate.statusCode, JSON.stringify(existingUpdate.json())).toBe(200);
    expect(existingUpdate.json<{ sessionId: string }>().sessionId).toBe(activeSessionId);

    const terminalWork = (await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: `Terminal A2A import ${randomUUID()}`,
      statusId: backlogStateId,
      responsibleHumanActorId: human.actorId,
    })).json<{ id: string }>();
    const terminalTask = fake.complete(`terminal-${randomUUID()}`);
    const terminalImport = await call(
      human,
      "POST",
      `/api/v1/a2a-bindings/${bindingId}/tasks`,
      {
        teamId,
        workItemId: terminalWork.id,
        deliveryId: `delivery-${randomUUID()}`,
        sequence: 1,
        requestedCapabilities: ["work:read"],
        task: terminalTask,
      },
    );
    expect(terminalImport.statusCode, JSON.stringify(terminalImport.json())).toBe(200);
    expect((await db.query<{ state: string }>(
      "SELECT state FROM agent_sessions WHERE id=$1",
      [terminalImport.json<{ sessionId: string }>().sessionId],
    )).rows[0]!.state).toBe("completed");

    await db.query(
      "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
      [activeSessionId],
    );

    const ordinaryWork = (await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: `Ordinary capacity contender ${randomUUID()}`,
      statusId: backlogStateId,
      responsibleHumanActorId: human.actorId,
    })).json<{ id: string; revision: number }>();
    const a2aWork = (await call(human, "POST", "/api/v1/work-items", {
      teamId,
      projectId,
      title: `A2A capacity contender ${randomUUID()}`,
      statusId: backlogStateId,
      responsibleHumanActorId: human.actorId,
    })).json<{ id: string }>();
    const crossEntryDeliveryId = `delivery-${randomUUID()}`;
    const crossEntryTask = fake.complete(`cross-entry-${randomUUID()}`);
    const [ordinaryAdmission, a2aAdmission] = await Promise.all([
      call(
        human,
        "POST",
        `/api/v1/work-items/${ordinaryWork.id}/agent-session`,
        {
          agentId,
          principalHumanActorId: human.actorId,
          role: "executor",
          requestedCapabilities: ["work:read", "work:write"],
          initialPrompt: "Compete for the final execution slot",
          budget: {},
        },
        ordinaryWork.revision,
      ),
      call(
        human,
        "POST",
        `/api/v1/a2a-bindings/${bindingId}/tasks`,
        {
          teamId,
          workItemId: a2aWork.id,
          deliveryId: crossEntryDeliveryId,
          sequence: 1,
          requestedCapabilities: ["work:read"],
          task: {
            ...crossEntryTask,
            status: { state: "submitted" as const },
            history: [],
            artifacts: [],
          },
        },
      ),
    ]);
    expect([ordinaryAdmission.statusCode, a2aAdmission.statusCode].sort()).toEqual([200, 409]);
    const rejectedAdmission = ordinaryAdmission.statusCode === 409
      ? ordinaryAdmission
      : a2aAdmission;
    expect(rejectedAdmission.json<{
      error: { code: string; details: { activeExecutionSessionCount: number } };
    }>().error).toMatchObject({
      code: "AGENT_CONCURRENCY_LIMIT",
      details: { activeExecutionSessionCount: 1 },
    });

    const admittedSessions = (await db.query<{ id: string; work_item_id: string }>(
      `SELECT id,work_item_id FROM agent_sessions
        WHERE agent_id=$1 AND work_item_id=ANY($2::uuid[])
        ORDER BY id`,
      [agentId, [ordinaryWork.id, a2aWork.id]],
    )).rows;
    const admittedDelegations = (await db.query<{ id: string; work_item_id: string }>(
      `SELECT id,work_item_id FROM delegations
        WHERE agent_id=$1 AND work_item_id=ANY($2::uuid[])
        ORDER BY id`,
      [agentId, [ordinaryWork.id, a2aWork.id]],
    )).rows;
    expect(admittedSessions).toHaveLength(1);
    expect(admittedDelegations).toHaveLength(1);
    expect(admittedSessions[0]!.work_item_id).toBe(admittedDelegations[0]!.work_item_id);
    const admissionEvents = (await db.query<{
      id: string;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
    }>(
      `SELECT id,event_type,aggregate_type,aggregate_id FROM domain_events
        WHERE workspace_id=$1
          AND ((aggregate_type='agent_session' AND aggregate_id=$2)
            OR (aggregate_type='delegation' AND aggregate_id=$3))`,
      [workspaceId, admittedSessions[0]!.id, admittedDelegations[0]!.id],
    )).rows;
    expect(admissionEvents.filter((event) => event.event_type === "agent.session.created")).toHaveLength(1);
    expect(admissionEvents).toHaveLength(ordinaryAdmission.statusCode === 200 ? 2 : 1);
    expect((await db.query(
      "SELECT 1 FROM outbox_events WHERE domain_event_id=ANY($1::uuid[])",
      [admissionEvents.map((event) => event.id)],
    )).rowCount).toBe(admissionEvents.length);
    expect((await db.query(
      "SELECT 1 FROM a2a_deliveries WHERE binding_id=$1 AND delivery_id=$2",
      [bindingId, crossEntryDeliveryId],
    )).rowCount).toBe(a2aAdmission.statusCode === 200 ? 1 : 0);
    await db.query(
      "UPDATE agent_sessions SET state='completed',ended_at=now() WHERE id=$1",
      [admittedSessions[0]!.id],
    );
  });

  it("keeps mixed-currency usage separate and applies one notification preference path", async () => {
    const session = (
      await db.query<{ id: string; agent_id: string }>(
        `SELECT id,agent_id FROM agent_sessions WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [workspaceId],
      )
    ).rows[0]!;
    const deniedDedupeKeys: string[] = [];
    const mismatchProject = await call(human, "POST", "/api/v1/projects", {
      teamId,
      name: `Usage mismatch ${randomUUID()}`,
    });
    const projectMismatchKey = `usage-project-mismatch:${randomUUID()}`;
    deniedDedupeKeys.push(projectMismatchKey);
    const projectMismatch = await call(human, "POST", "/api/v1/usage-records", {
      dedupeKey: projectMismatchKey,
      agentId: session.agent_id,
      sessionId: session.id,
      projectId: mismatchProject.json<{ id: string }>().id,
      occurredAt: new Date().toISOString(),
      costMinor: "1",
      currency: "USD",
      costSource: "manual",
    });
    expect(projectMismatch.statusCode).toBe(403);
    expect(projectMismatch.json<{ error: { code: string } }>().error.code).toBe(
      "RESOURCE_SCOPE_DENIED",
    );

    const agentMismatchKey = `usage-agent-mismatch:${randomUUID()}`;
    deniedDedupeKeys.push(agentMismatchKey);
    const agentMismatch = await call(human, "POST", "/api/v1/usage-records", {
      dedupeKey: agentMismatchKey,
      agentId: randomUUID(),
      sessionId: session.id,
      projectId,
      occurredAt: new Date().toISOString(),
      costMinor: "1",
      currency: "USD",
      costSource: "manual",
    });
    expect(agentMismatch.statusCode).toBe(403);
    expect(agentMismatch.json<{ error: { code: string } }>().error.code).toBe(
      "RESOURCE_SCOPE_DENIED",
    );

    const outsiderTeam = await call(human, "POST", "/api/v1/teams", {
      name: `Usage outsider ${randomUUID()}`,
      key: `U${randomUUID().replaceAll("-", "").slice(0, 5)}`.toUpperCase(),
    });
    const outsiderActorId = randomUUID();
    const outsiderToken = opaqueToken();
    const outsiderCsrf = opaqueToken();
    await db.query(
      `INSERT INTO actors(id,workspace_id,kind,workspace_role,email,display_name,password_hash)
       VALUES($1,$2,'human','member',$3,'Usage Outsider','unused')`,
      [outsiderActorId, workspaceId, `${randomUUID()}@example.test`],
    );
    await db.query(
      `INSERT INTO memberships(workspace_id,team_id,actor_id,role)
       VALUES($1,$2,$3,'member')`,
      [workspaceId, outsiderTeam.json<{ id: string }>().id, outsiderActorId],
    );
    await db.query(
      `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
       VALUES($1,$2,$3,now()+interval '1 hour')`,
      [outsiderActorId, tokenHash(outsiderToken), outsiderCsrf],
    );
    const crossTeamKey = `usage-cross-team:${randomUUID()}`;
    deniedDedupeKeys.push(crossTeamKey);
    const crossTeam = await call(
      {
        cookie: `workmesh_session=${outsiderToken}`,
        csrf: outsiderCsrf,
        actorId: outsiderActorId,
      },
      "POST",
      "/api/v1/usage-records",
      {
        dedupeKey: crossTeamKey,
        agentId: session.agent_id,
        sessionId: session.id,
        projectId,
        occurredAt: new Date().toISOString(),
        costMinor: "1",
        currency: "USD",
        costSource: "manual",
      },
    );
    expect(crossTeam.statusCode).toBe(403);
    expect(crossTeam.json<{ error: { code: string } }>().error.code).toBe(
      "FORBIDDEN",
    );

    const serviceActorId = randomUUID();
    const serviceToken = opaqueToken();
    const serviceCsrf = opaqueToken();
    await db.query(
      `INSERT INTO actors(id,workspace_id,kind,display_name)
       VALUES($1,$2,'service','Untrusted Usage Service')`,
      [serviceActorId, workspaceId],
    );
    await db.query(
      `INSERT INTO sessions(actor_id,token_hash,csrf_token,expires_at)
       VALUES($1,$2,$3,now()+interval '1 hour')`,
      [serviceActorId, tokenHash(serviceToken), serviceCsrf],
    );
    const serviceKey = `usage-service:${randomUUID()}`;
    deniedDedupeKeys.push(serviceKey);
    const unauthorizedService = await call(
      {
        cookie: `workmesh_session=${serviceToken}`,
        csrf: serviceCsrf,
        actorId: serviceActorId,
      },
      "POST",
      "/api/v1/usage-records",
      {
        dedupeKey: serviceKey,
        agentId: session.agent_id,
        sessionId: session.id,
        projectId,
        occurredAt: new Date().toISOString(),
        costMinor: "1",
        currency: "USD",
        costSource: "manual",
      },
    );
    expect(unauthorizedService.statusCode).toBe(401);
    expect(
      unauthorizedService.json<{ error: { code: string } }>(),
    ).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM usage_records WHERE workspace_id=$1 AND dedupe_key=ANY($2::text[])",
          [workspaceId, deniedDedupeKeys],
        )
      ).rows[0]!.count,
    ).toBe("0");

    for (const [currency, costMinor] of [
      ["USD", "125"],
      ["EUR", "450"],
    ] as const) {
      const recorded = await call(human, "POST", "/api/v1/usage-records", {
        dedupeKey: `mixed:${currency}:${randomUUID()}`,
        agentId: session.agent_id,
        sessionId: session.id,
        projectId,
        occurredAt: new Date().toISOString(),
        inputTokens: 10,
        outputTokens: 5,
        costMinor,
        currency,
        costSource: "provider_reported",
      });
      expect(recorded.statusCode, JSON.stringify(recorded.json())).toBe(200);
    }
    const summary = await call(
      human,
      "GET",
      `/api/v1/usage-summary?sessionId=${session.id}`,
    );
    expect(
      summary.json<{
        currency_buckets: Array<{ currency: string; known_cost_minor: string }>;
      }>().currency_buckets,
    ).toEqual(
      expect.arrayContaining([
        { currency: "EUR", known_cost_minor: "450", unknown_cost_records: 0 },
        { currency: "USD", known_cost_minor: "125", unknown_cost_records: 0 },
      ]),
    );
    const initiative = await call(human, "POST", "/api/v1/initiatives", {
      name: `Mixed currency ${randomUUID()}`,
      ownerActorId: human.actorId,
      status: "active",
      projectIds: [projectId],
    });
    const rollup = await call(
      human,
      "GET",
      `/api/v1/initiatives/${initiative.json<{ id: string }>().id}/rollup`,
    );
    expect(
      rollup.json<{
        currencyBuckets: Array<{
          currency: string;
          knownCostMinor: string;
          hasUnknownCost: boolean;
        }>;
      }>().currencyBuckets,
    ).toEqual([
      { currency: "EUR", knownCostMinor: "450", hasUnknownCost: false },
      { currency: "USD", knownCostMinor: "125", hasUnknownCost: false },
    ]);

    for (const entityType of ["issue", "project", "session"] as const) {
      const costView = await call(human, "POST", "/api/v1/advanced-views", {
        name: `${entityType} USD cost`,
        entityType,
        filters: {
          projectIds: [projectId],
          cost: { currency: "USD", minMinor: "1" },
        },
        ordering: [{ field: "cost", direction: "desc" }],
        visibleFields: ["cost"],
        layout: entityType === "session" ? "timeline" : "list",
        scope: "private",
      });
      expect(costView.statusCode, JSON.stringify(costView.json())).toBe(200);
      const result = await call(
        human,
        "GET",
        `/api/v1/advanced-views/${costView.json<{ id: string }>().id}/results`,
      );
      expect(result.statusCode, JSON.stringify(result.json())).toBe(200);
      const rows =
        result.json<
          Page<{ id: string; cost_minor: string; currency: string }>
        >().items;
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ cost_minor: "125", currency: "USD" }),
        ]),
      );
      expect(rows.some((row) => row.cost_minor === "575")).toBe(false);
    }

    const preciseCost = "9007199254740993";
    const preciseUsage = await call(human, "POST", "/api/v1/usage-records", {
      dedupeKey: `precise:JPY:${randomUUID()}`,
      agentId: session.agent_id,
      sessionId: session.id,
      projectId,
      occurredAt: new Date().toISOString(),
      costMinor: preciseCost,
      currency: "JPY",
      costSource: "provider_reported",
    });
    expect(preciseUsage.statusCode, JSON.stringify(preciseUsage.json())).toBe(
      200,
    );
    const preciseSummary = await call(
      human,
      "GET",
      `/api/v1/usage-summary?sessionId=${session.id}`,
    );
    expect(
      preciseSummary.json<{
        currency_buckets: Array<{ currency: string; known_cost_minor: string }>;
      }>().currency_buckets,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: "JPY",
          known_cost_minor: preciseCost,
        }),
      ]),
    );
    const preciseRollup = await call(
      human,
      "GET",
      `/api/v1/initiatives/${initiative.json<{ id: string }>().id}/rollup`,
    );
    expect(
      preciseRollup.json<{
        currencyBuckets: Array<{ currency: string; knownCostMinor: string }>;
      }>().currencyBuckets,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: "JPY",
          knownCostMinor: preciseCost,
        }),
      ]),
    );
    const preciseView = await call(human, "POST", "/api/v1/advanced-views", {
      name: "Precise JPY session cost",
      entityType: "session",
      filters: {
        projectIds: [projectId],
        cost: { currency: "JPY", minMinor: preciseCost },
      },
      visibleFields: ["cost"],
      layout: "timeline",
      scope: "private",
    });
    expect(preciseView.statusCode, JSON.stringify(preciseView.json())).toBe(
      200,
    );
    const preciseViewResult = await call(
      human,
      "GET",
      `/api/v1/advanced-views/${preciseView.json<{ id: string }>().id}/results`,
    );
    expect(
      preciseViewResult.json<
        Page<{
          cost_minor: string;
          currency: string;
        }>
      >().items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cost_minor: preciseCost, currency: "JPY" }),
      ]),
    );

    expect(
      (
        await call(human, "PUT", "/api/v1/notification-preferences", {
          channels: ["in_app", "browser"],
          digest: "hourly",
          minimumPriority: "mention",
          mutedKinds: ["muted.kind"],
        })
      ).statusCode,
    ).toBe(200);
    const preference = await call(
      human,
      "GET",
      "/api/v1/notification-preferences",
    );
    expect(preference.statusCode).toBe(200);
    expect(preference.json()).toEqual(
      expect.objectContaining({
        channels: ["in_app", "browser"],
        digest: "hourly",
        minimum_priority: "mention",
        muted_kinds: ["muted.kind"],
        webhook_configured: false,
        revision: 1,
      }),
    );
    expect(preference.json()).not.toHaveProperty("webhook_url");
    const muted = await call(human, "POST", "/api/v1/notifications", {
      recipientActorId: human.actorId,
      priority: "input",
      kind: "muted.kind",
      title: "Muted",
      sourceType: "work_item",
      sourceId: workItemId,
      channels: ["in_app", "browser"],
      dedupeKey: `muted:${randomUUID()}`,
    });
    expect(muted.statusCode).toBe(200);
    expect(
      (
        await db.query(
          "SELECT 1 FROM notification_deliveries WHERE notification_id=$1",
          [muted.json<{ id: string }>().id],
        )
      ).rowCount,
    ).toBe(0);
    const digested = await call(human, "POST", "/api/v1/notifications", {
      recipientActorId: human.actorId,
      priority: "approval",
      kind: "approval.ready",
      title: "Approve",
      sourceType: "work_item",
      sourceId: workItemId,
      channels: ["in_app", "browser", "webhook"],
      dedupeKey: `digest:${randomUUID()}`,
    });
    const deliveries = (
      await db.query<{ channel: string; delayed: boolean }>(
        `SELECT channel,available_at>now() AS delayed
         FROM notification_deliveries WHERE notification_id=$1 ORDER BY channel::text`,
        [digested.json<{ id: string }>().id],
      )
    ).rows;
    expect(deliveries).toEqual([
      { channel: "browser", delayed: true },
      { channel: "in_app", delayed: true },
    ]);
    await db.query(
      `UPDATE notification_deliveries SET status='failed',attempt_count=2,last_error='credential value must remain redacted'
       WHERE notification_id=$1 AND channel='browser'`,
      [digested.json<{ id: string }>().id],
    );
    const notificationPage = await call(
      human,
      "GET",
      "/api/v1/notifications?limit=1",
    );
    expect(notificationPage.statusCode).toBe(200);
    const listed = notificationPage.json<
      Page<{
        id: string;
        deliveries: Array<{
          channel: string;
          status: string;
          attempt_count: number;
          last_error_present: boolean;
        }>;
      }>
    >();
    expect(listed.items[0]).toEqual(
      expect.objectContaining({ id: digested.json<{ id: string }>().id }),
    );
    expect(listed.items[0]?.deliveries).toContainEqual(
      expect.objectContaining({
        channel: "browser",
        status: "failed",
        attempt_count: 2,
        last_error_present: true,
      }),
    );
    expect(JSON.stringify(listed)).not.toContain("credential value");
    expect(
      (
        await call(
          {
            cookie: `workmesh_session=${serviceToken}`,
            csrf: serviceCsrf,
            actorId: serviceActorId,
          },
          "GET",
          "/api/v1/notification-preferences",
        )
      ).statusCode,
    ).toBe(401);
  });
});
