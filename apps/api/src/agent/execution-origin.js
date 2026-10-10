import { lockAgentAuthorityPlan } from '@workmesh/db';
import { DomainError } from '@workmesh/domain';
import { locateAgentSessionAuthority } from './guard.js';
/** Detect additive columns per transaction: migration fixtures deliberately use older schemas. */
export async function hasExecutionOrigin(tx) {
    return (await tx.query(`SELECT EXISTS(SELECT 1 FROM pg_attribute
      WHERE attrelid=to_regclass('public.agent_installation_tokens') AND attname='origin_kind'
        AND NOT attisdropped) AS present`)).rows[0]?.present === true;
}
export async function resolveExecutionOrigin(tx, actor, sessionId) {
    if (actor.kind !== 'agent' || actor.authentication === 'coordination_connection'
        || actor.agentSessionId !== sessionId || !actor.credentialHash) {
        throw new DomainError('UNAUTHENTICATED', 'An exact execution credential is required');
    }
    const originAvailable = await hasExecutionOrigin(tx);
    const rows = (await tx.query(`SELECT token.id AS session_token_id,token.installation_token_id,
       ${originAvailable ? 'installation.origin_kind,installation.origin_connection_id' : 'NULL::text AS origin_kind,NULL::uuid AS origin_connection_id'},
       credential.connection_id AS credential_connection_id
     FROM agent_session_tokens token
     JOIN agent_sessions session ON session.id=token.session_id
     LEFT JOIN agent_installation_tokens installation
       ON installation.id=token.installation_token_id AND installation.agent_id=session.agent_id
     LEFT JOIN agent_connection_credentials credential ON credential.token_hash=installation.token_hash
     WHERE token.session_id=$1 AND token.token_hash=$2 AND session.workspace_id=$3
       AND session.agent_actor_id=$4 AND token.revoked_at IS NULL
       AND token.exchanged_at IS NOT NULL AND token.expires_at>clock_timestamp()`, [sessionId, actor.credentialHash, actor.workspaceId, actor.id])).rows;
    if (rows.length !== 1)
        throw new DomainError('UNAUTHENTICATED', 'Execution credential is no longer unique and live');
    const row = rows[0];
    const kind = row.installation_token_id && row.origin_kind === 'native'
        && !row.origin_connection_id && !row.credential_connection_id ? 'native'
        : row.installation_token_id && row.origin_kind === 'connection'
            && row.origin_connection_id && row.origin_connection_id === row.credential_connection_id ? 'connection'
            : 'unproven';
    return { kind, sessionTokenId: row.session_token_id, installationTokenId: row.installation_token_id,
        connectionId: kind === 'connection' ? row.origin_connection_id : null };
}
/** Discover identifiers before the outer Connection tier, then acquire the full authority plan. */
export async function lockExecutionOriginAuthority(tx, actor, sessionId) {
    const locator = await locateAgentSessionAuthority(tx, actor, sessionId);
    const connectionsAvailable = (await tx.query("SELECT to_regclass('public.agent_connection_credentials') IS NOT NULL AS present")).rows[0]?.present === true;
    const connection = connectionsAvailable && locator.installation_token_id ? (await tx.query(`SELECT c.id AS connection_id,credential.id AS credential_id,c.delegation_id
     FROM agent_installation_tokens installation
     JOIN agent_connection_credentials credential ON credential.token_hash=installation.token_hash
     JOIN agent_connections c ON c.id=credential.connection_id
     WHERE installation.id=$1`, [locator.installation_token_id])).rows[0] : undefined;
    if (connection) {
        await tx.query('SELECT id FROM agent_connections WHERE id=$1 FOR UPDATE', [connection.connection_id]);
        await tx.query('SELECT id FROM agent_connection_credentials WHERE id=$1 FOR UPDATE', [connection.credential_id]);
    }
    await lockAgentAuthorityPlan(tx, {
        definitionIds: [locator.agent_id],
        teamGrants: [{ workspaceId: actor.workspaceId, agentId: locator.agent_id, teamId: locator.team_id }],
        delegationIds: [locator.delegation_id, ...(connection ? [connection.delegation_id] : [])], sessionIds: [sessionId],
        sessionTokenIds: locator.session_token_id ? [locator.session_token_id] : [],
        installationTokenIds: locator.installation_token_id ? [locator.installation_token_id] : [],
        workItemIds: locator.work_item_id ? [locator.work_item_id] : [],
        projectIds: [locator.project_id, locator.work_item_project_id].filter((id) => id !== null),
    });
}
export async function saveExecutionOrigin(tx, meta, sessionId) {
    if (!await hasExecutionOrigin(tx))
        return;
    const origin = await resolveExecutionOrigin(tx, meta.actor, sessionId);
    const saved = await tx.query(`UPDATE api_idempotency_keys SET
     execution_source_kind=$4,execution_session_id=$5,execution_session_token_id=$6,
     execution_installation_token_id=$7,execution_connection_id=$8
     WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3`, [meta.actor.workspaceId, meta.actor.id, meta.idempotencyKey, origin.kind, sessionId,
        origin.sessionTokenId, origin.installationTokenId, origin.connectionId]);
    if (saved.rowCount !== 1)
        throw new DomainError('IDEMPOTENCY_REPLAY_UNAVAILABLE', 'Execution receipt reservation is missing');
}
