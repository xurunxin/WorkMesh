import type { PoolClient } from 'pg'
import { DomainError } from '@workmesh/domain'

/**
 * Reconciles the exact Connection credential into the existing Installation
 * Token table used by execution-Session exchange. The token hash is the stable
 * credential identity; no plaintext credential is persisted or copied.
 */
export async function reconcileConnectionInstallationToken(
  tx: PoolClient,
  input: Readonly<{
    agentId: string
    credentialHash: string
    expiresAt: Date | null
    createdByActorId?: string
  }>,
): Promise<string> {
  const row = (await tx.query<{ id: string }>(
    `INSERT INTO agent_installation_tokens(
       agent_id,token_hash,expires_at,revoked_at,created_by_actor_id
     ) VALUES($1,$2,$3,NULL,$4)
     ON CONFLICT(token_hash) DO UPDATE
       SET expires_at=EXCLUDED.expires_at,revoked_at=NULL
       WHERE agent_installation_tokens.agent_id=EXCLUDED.agent_id
     RETURNING id`,
    [
      input.agentId,
      input.credentialHash,
      input.expiresAt,
      input.createdByActorId ?? null,
    ],
  )).rows[0]
  if (!row)
    throw new DomainError(
      'AGENT_IDENTITY_REQUIRED',
      'Connection credential does not belong to the current Agent',
    )
  return row.id
}
