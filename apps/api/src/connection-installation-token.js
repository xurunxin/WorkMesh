import { DomainError } from '@workmesh/domain';
import { hasExecutionOrigin } from './agent/execution-origin.js';
export async function locateConnectionInstallationTokenId(tx, input) {
    const row = (await tx.query(`SELECT id,agent_id
       FROM agent_installation_tokens
      WHERE token_hash=$1`, [input.credentialHash])).rows[0];
    if (row && row.agent_id !== input.agentId)
        throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Connection credential does not belong to the current Agent');
    return row?.id;
}
/**
 * Reconciles the exact Connection credential into the existing Installation
 * Token table used by execution-Session exchange. The token hash is the stable
 * credential identity; no plaintext credential is persisted or copied.
 */
export async function reconcileConnectionInstallationToken(tx, input) {
    const connection = (await tx.query(`SELECT c.id FROM agent_connections c
    JOIN agent_connection_credentials credential ON credential.connection_id=c.id
    WHERE c.id=$1 AND c.agent_id=$2 AND credential.token_hash=$3`, [input.connectionId, input.agentId, input.credentialHash])).rows[0];
    if (!connection)
        throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Exact Connection credential is required');
    const originAvailable = await hasExecutionOrigin(tx);
    const row = (await tx.query(`INSERT INTO agent_installation_tokens(
       agent_id,token_hash,expires_at,revoked_at,created_by_actor_id${originAvailable ? ',origin_kind,origin_connection_id' : ''}
     ) VALUES($1,$2,$3,NULL,$4${originAvailable ? ",'connection',$5" : ''})
     ON CONFLICT(token_hash) DO UPDATE
       SET expires_at=EXCLUDED.expires_at,revoked_at=NULL
       WHERE agent_installation_tokens.agent_id=EXCLUDED.agent_id
     RETURNING id`, [
        input.agentId,
        input.credentialHash,
        input.expiresAt,
        input.createdByActorId ?? null,
        ...(originAvailable ? [input.connectionId] : []),
    ])).rows[0];
    if (!row)
        throw new DomainError('AGENT_IDENTITY_REQUIRED', 'Connection credential does not belong to the current Agent');
    return row.id;
}
