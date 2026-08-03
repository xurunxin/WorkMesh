import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createDb,
  installWorkspace,
  type Db,
} from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl)
  throw new Error(
    "Agent Session external URL migration requires RUN_INTEGRATION=1 and DATABASE_URL.",
  );
if (!/(^|[_-])test(?:[_-]|$)/i.test(new URL(databaseUrl).pathname.slice(1)))
  throw new Error(
    "Agent Session external URL migration requires a dedicated *test* database.",
  );

const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `workmesh_test_session_urls_upgrade_${suffix}`;
const cleanDatabase = `workmesh_test_session_urls_clean_${suffix}`;
const malformedObjectDatabase = `workmesh_test_session_urls_object_${suffix}`;
const malformedScalarDatabase = `workmesh_test_session_urls_scalar_${suffix}`;
const databases = [
  upgradeDatabase,
  cleanDatabase,
  malformedObjectDatabase,
  malformedScalarDatabase,
];
const admin = createDb(databaseUrl);
let upgrade: Db;
let clean: Db;
let malformedObject: Db;
let malformedScalar: Db;

const databaseUrlFor = (database: string): string => {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  url.searchParams.delete("options");
  return url.toString();
};

type SessionFixture = {
  agentActorId: string;
  agentId: string;
  delegationId: string;
  teamId: string;
  workItemId: string;
  workspaceId: string;
};

const createSessionFixture = async (
  db: Db,
  slug: string,
): Promise<SessionFixture> => {
  const installed = await installWorkspace(db, {
    workspaceName: `Session URLs ${slug}`,
    workspaceSlug: `session-urls-${slug}`,
    adminName: "Migration Admin",
    email: `${slug}@example.test`,
    password: "password-acceptance",
  });
  const state = (
    await db.query<{ id: string }>(
      "SELECT id FROM workflow_states WHERE team_id=$1 AND category='backlog'",
      [installed.teamId],
    )
  ).rows[0]!;
  const workItem = (
    await db.query<{ id: string }>(
      `INSERT INTO work_items(
         workspace_id,team_id,number,title,status_id,responsible_human_actor_id
       ) VALUES($1,$2,1,'Session URL migration',$3,$4)
       RETURNING id`,
      [installed.workspaceId, installed.teamId, state.id, installed.actorId],
    )
  ).rows[0]!;
  const agentActor = (
    await db.query<{ id: string }>(
      `INSERT INTO actors(workspace_id,kind,display_name)
       VALUES($1,'agent','Migration Agent')
       RETURNING id`,
      [installed.workspaceId],
    )
  ).rows[0]!;
  const agent = (
    await db.query<{ id: string }>(
      `INSERT INTO agent_definitions(
         workspace_id,actor_id,slug,display_name,supported_protocols
       ) VALUES($1,$2,$3,'Migration Agent',ARRAY['native_http']::agent_protocol[])
       RETURNING id`,
      [installed.workspaceId, agentActor.id, `migration-agent-${slug}`],
    )
  ).rows[0]!;
  const delegation = (
    await db.query<{ id: string }>(
      `INSERT INTO delegations(
         workspace_id,team_id,agent_id,agent_actor_id,
         principal_human_actor_id,work_item_id,role,scope_type,scope_id
       ) VALUES($1,$2,$3,$4,$5,$6,'executor','work_item',$6)
       RETURNING id`,
      [
        installed.workspaceId,
        installed.teamId,
        agent.id,
        agentActor.id,
        installed.actorId,
        workItem.id,
      ],
    )
  ).rows[0]!;
  return {
    workspaceId: installed.workspaceId,
    teamId: installed.teamId,
    agentId: agent.id,
    agentActorId: agentActor.id,
    delegationId: delegation.id,
    workItemId: workItem.id,
  };
};

const insertSession = async (
  db: Db,
  fixture: SessionFixture,
  externalUrls?: unknown,
): Promise<string> => {
  const columns = `workspace_id,team_id,agent_id,agent_actor_id,
    delegation_id,work_item_id`;
  const values = "$1,$2,$3,$4,$5,$6";
  const parameters: unknown[] = [
    fixture.workspaceId,
    fixture.teamId,
    fixture.agentId,
    fixture.agentActorId,
    fixture.delegationId,
    fixture.workItemId,
  ];
  if (externalUrls !== undefined) parameters.push(JSON.stringify(externalUrls));
  return (
    await db.query<{ id: string }>(
      `INSERT INTO agent_sessions(
         ${columns}${externalUrls === undefined ? "" : ",external_urls"}
       ) VALUES(
         ${values}${externalUrls === undefined ? "" : ",$7::jsonb"}
       ) RETURNING id`,
      parameters,
    )
  ).rows[0]!.id;
};

const insertIdempotencyResponse = async (
  db: Db,
  fixture: SessionFixture,
  idempotencyKey: string,
  responseBody: unknown | null,
  operation = "acknowledgeAgentSession",
): Promise<void> => {
  await db.query(
    `INSERT INTO api_idempotency_keys(
       workspace_id,actor_id,idempotency_key,operation,request_hash,
       response_status,response_body
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      fixture.workspaceId,
      fixture.agentActorId,
      idempotencyKey,
      operation,
      `sha256:${"a".repeat(64)}`,
      responseBody === null ? null : 200,
      responseBody === null ? null : JSON.stringify(responseBody),
    ],
  );
};

const responseBodyFor = async (
  db: Db,
  idempotencyKey: string,
): Promise<unknown> =>
  (
    await db.query<{ responseBody: unknown }>(
      `SELECT response_body AS "responseBody"
         FROM api_idempotency_keys
        WHERE idempotency_key=$1`,
      [idempotencyKey],
    )
  ).rows[0]!.responseBody;

const expectValidatedConstraints = async (db: Db): Promise<void> => {
  expect(
    (
      await db.query<{ conname: string; convalidated: boolean }>(
        `SELECT conname,convalidated
           FROM pg_constraint
          WHERE conname IN (
            'agent_sessions_external_urls_array_check',
            'api_idempotency_ack_session_external_urls_array_check'
          )
          ORDER BY conname`,
      )
    ).rows,
  ).toEqual([
    {
      conname: "agent_sessions_external_urls_array_check",
      convalidated: true,
    },
    {
      conname: "api_idempotency_ack_session_external_urls_array_check",
      convalidated: true,
    },
  ]);
};

const expectMigrationLedger = async (db: Db, count: number): Promise<void> => {
  expect(
    Number(
      (
        await db.query<{ count: string }>(
          `SELECT count(*)
             FROM schema_migrations
            WHERE version='0031_agent_session_external_urls_shape'`,
        )
      ).rows[0]!.count,
    ),
  ).toBe(count);
};

describe("0031 Agent Session external URL shape migration", () => {
  beforeAll(async () => {
    for (const database of databases)
      await admin.query(`CREATE DATABASE "${database}"`);
    upgrade = createDb(databaseUrlFor(upgradeDatabase));
    clean = createDb(databaseUrlFor(cleanDatabase));
    malformedObject = createDb(databaseUrlFor(malformedObjectDatabase));
    malformedScalar = createDb(databaseUrlFor(malformedScalarDatabase));
    await applyMigrations(upgrade, { through: 30 });
    await applyMigrations(malformedObject, { through: 30 });
    await applyMigrations(malformedScalar, { through: 30 });
    await applyMigrations(clean);
  }, 240_000);

  afterAll(async () => {
    await upgrade?.end();
    await clean?.end();
    await malformedObject?.end();
    await malformedScalar?.end();
    for (const database of databases)
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    await admin.end();
  }, 120_000);

  it("repairs only legacy empty objects while preserving valid Session and replay arrays", async () => {
    const fixture = await createSessionFixture(upgrade, "upgrade");
    const legacyEmptyObjectId = await insertSession(upgrade, fixture, {});
    const emptyArrayId = await insertSession(upgrade, fixture, []);
    const nonemptyArray = [
      { label: "Run", url: "https://example.test/runs/31" },
    ];
    const nonemptyArrayId = await insertSession(
      upgrade,
      fixture,
      nonemptyArray,
    );
    await insertIdempotencyResponse(upgrade, fixture, "ack-empty-object", {
      external_urls: {},
      marker: "repair",
    });
    await insertIdempotencyResponse(upgrade, fixture, "ack-empty-array", {
      external_urls: [],
      marker: "preserve-empty",
    });
    await insertIdempotencyResponse(upgrade, fixture, "ack-nonempty-array", {
      external_urls: nonemptyArray,
      marker: "preserve-nonempty",
    });
    await insertIdempotencyResponse(
      upgrade,
      fixture,
      "other-operation-empty-object",
      { external_urls: {}, marker: "other-operation" },
      "updateAgent",
    );
    await insertIdempotencyResponse(upgrade, fixture, "ack-in-progress", null);

    await applyMigrations(upgrade);

    const rows = (
      await upgrade.query<{ externalUrls: unknown; id: string }>(
        `SELECT id,external_urls AS "externalUrls"
           FROM agent_sessions
          WHERE id=ANY($1::uuid[])`,
        [[legacyEmptyObjectId, emptyArrayId, nonemptyArrayId]],
      )
    ).rows;
    const byId = new Map(rows.map((row) => [row.id, row.externalUrls]));
    expect(byId.get(legacyEmptyObjectId)).toEqual([]);
    expect(byId.get(emptyArrayId)).toEqual([]);
    expect(byId.get(nonemptyArrayId)).toEqual(nonemptyArray);
    expect(await responseBodyFor(upgrade, "ack-empty-object")).toEqual({
      external_urls: [],
      marker: "repair",
    });
    expect(await responseBodyFor(upgrade, "ack-empty-array")).toEqual({
      external_urls: [],
      marker: "preserve-empty",
    });
    expect(await responseBodyFor(upgrade, "ack-nonempty-array")).toEqual({
      external_urls: nonemptyArray,
      marker: "preserve-nonempty",
    });
    expect(
      await responseBodyFor(upgrade, "other-operation-empty-object"),
    ).toEqual({
      external_urls: {},
      marker: "other-operation",
    });
    expect(await responseBodyFor(upgrade, "ack-in-progress")).toBeNull();
    await expectValidatedConstraints(upgrade);
    await expectMigrationLedger(upgrade, 1);
  });

  it("installs a validated check and array default on a clean database", async () => {
    const fixture = await createSessionFixture(clean, "clean");
    const defaultSessionId = await insertSession(clean, fixture);
    expect(
      (
        await clean.query<{ externalUrls: unknown }>(
          `SELECT external_urls AS "externalUrls"
             FROM agent_sessions
            WHERE id=$1`,
          [defaultSessionId],
        )
      ).rows,
    ).toEqual([{ externalUrls: [] }]);
    await expect(insertSession(clean, fixture, {})).rejects.toThrow(
      /agent_sessions_external_urls_array_check/,
    );
    await expect(
      insertIdempotencyResponse(clean, fixture, "clean-invalid-ack", {
        external_urls: {},
      }),
    ).rejects.toThrow(/api_idempotency_ack_session_external_urls_array_check/);
    await expect(
      insertIdempotencyResponse(clean, fixture, "clean-in-progress", null),
    ).resolves.toBeUndefined();
    await expect(
      insertIdempotencyResponse(
        clean,
        fixture,
        "clean-other-operation",
        { external_urls: {} },
        "updateAgent",
      ),
    ).resolves.toBeUndefined();
    await expectValidatedConstraints(clean);
    await expectMigrationLedger(clean, 1);
  });

  it.each([
    ["nonempty object", () => malformedObject, { unexpected: true }],
    ["scalar", () => malformedScalar, "unexpected"],
  ])(
    "fails closed on a %s without rewriting it",
    async (_label, dbFor, value) => {
      const db = dbFor();
      const fixture = await createSessionFixture(
        db,
        _label === "scalar" ? "scalar" : "object",
      );
      const sessionId = await insertSession(db, fixture, value);

      await expect(applyMigrations(db)).rejects.toThrow(
        /agent_sessions_external_urls_array_check/,
      );

      expect(
        (
          await db.query<{ externalUrls: unknown }>(
            `SELECT external_urls AS "externalUrls"
             FROM agent_sessions
            WHERE id=$1`,
            [sessionId],
          )
        ).rows,
      ).toEqual([{ externalUrls: value }]);
      expect(
        (
          await db.query(
            `SELECT 1
             FROM pg_constraint
            WHERE conname IN (
              'agent_sessions_external_urls_array_check',
              'api_idempotency_ack_session_external_urls_array_check'
            )`,
          )
        ).rowCount,
      ).toBe(0);
      await expectMigrationLedger(db, 0);

      await db.query(
        "UPDATE agent_sessions SET external_urls='[]'::jsonb WHERE id=$1",
        [sessionId],
      );
      await insertIdempotencyResponse(
        db,
        fixture,
        `malformed-cache-${_label}`,
        { external_urls: value, marker: "unchanged" },
      );

      await expect(applyMigrations(db)).rejects.toThrow(
        /api_idempotency_ack_session_external_urls_array_check/,
      );

      expect(await responseBodyFor(db, `malformed-cache-${_label}`)).toEqual({
        external_urls: value,
        marker: "unchanged",
      });
      expect(
        (
          await db.query(
            `SELECT 1
               FROM pg_constraint
              WHERE conname IN (
                'agent_sessions_external_urls_array_check',
                'api_idempotency_ack_session_external_urls_array_check'
              )`,
          )
        ).rowCount,
      ).toBe(0);
      await expectMigrationLedger(db, 0);
    },
  );
});
