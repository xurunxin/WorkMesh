import { Client } from "../../../packages/db/node_modules/pg/esm/index.mjs";

const connectionId = "bd2c7e2c-8020-4a61-b837-373895056d7a";
const connectionString = process.env.WORKMESH_AUDIT_DB_URL;

if (!connectionString) {
  throw new Error("WORKMESH_AUDIT_DB_URL is required");
}

const client = new Client({ connectionString });
await client.connect();

try {
  const connection = (
    await client.query(
      `select id, workspace_id, team_id, principal_human_actor_id, name,
              agent_slug, client_type, status, requested_capabilities,
              granted_capabilities, active_credential_fingerprint_prefix,
              pairing_code_expires_at, revision, created_at, updated_at,
              revoked_at
         from agent_connections
        where id = $1`,
      [connectionId],
    )
  ).rows[0];

  const pairings = (
    await client.query(
      `select count(*)::int as total,
              count(*) filter (where consumed_at is not null)::int as consumed,
              count(*) filter (
                where consumed_at is null and expires_at > now()
              )::int as live
         from agent_connection_pairings
        where connection_id = $1`,
      [connectionId],
    )
  ).rows[0];

  const credentials = (
    await client.query(
      `select count(*)::int as total,
              count(*) filter (where status = 'active')::int as active,
              count(*) filter (where status = 'revoked')::int as revoked
         from agent_connection_credentials
        where connection_id = $1`,
      [connectionId],
    )
  ).rows[0];

  const coordinationSessions = (
    await client.query(
      `select id, agent_session_id, workspace_id, connection_id, team_id,
              principal_human_actor_id, status, granted_capabilities,
              created_at, updated_at, closed_at
         from agent_coordination_sessions
        where connection_id = $1
        order by created_at`,
      [connectionId],
    )
  ).rows;

  const durableEvents = (
    await client.query(
      `select cursor, event_type, aggregate_revision, occurred_at
         from domain_events
        where aggregate_id = $1
        order by cursor`,
      [connectionId],
    )
  ).rows;

  process.stdout.write(
    `${JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        connection,
        pairings,
        credentials,
        coordinationSessions,
        durableEvents,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await client.end();
}
