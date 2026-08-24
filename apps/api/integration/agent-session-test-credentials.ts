import type { Pool } from 'pg'
import { opaqueToken, tokenHash } from '@workmesh/db'

async function activeInstallationTokenId(
  db: Pool,
  agentId: string,
): Promise<string> {
  const installation = (await db.query<{ id: string }>(
    `SELECT id
       FROM agent_installation_tokens
      WHERE agent_id=$1 AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at>clock_timestamp())
      ORDER BY created_at DESC,id DESC
      LIMIT 1`,
    [agentId],
  )).rows[0]
  if (!installation) throw new Error('Active test installation token not found')
  return installation.id
}

export async function seedAgentSessionBearer(
  db: Pool,
  sessionId: string,
  agentId: string,
): Promise<string> {
  const installationTokenId = await activeInstallationTokenId(db, agentId)
  const bearer = opaqueToken()
  const exchangeNonce = opaqueToken()
  const updated = await db.query(
    `UPDATE agent_session_tokens
        SET installation_token_id=$3,
            token_hash=$4,
            exchange_nonce_hash=$5,
            expires_at=now()+interval '15 minutes',
            exchanged_at=now(),
            revoked_at=NULL
      WHERE id=(
        SELECT id
          FROM agent_session_tokens
         WHERE session_id=$1 AND agent_id=$2 AND revoked_at IS NULL
         ORDER BY created_at DESC,id DESC
         LIMIT 1
      )`,
    [
      sessionId,
      agentId,
      installationTokenId,
      tokenHash(bearer),
      tokenHash(exchangeNonce),
    ],
  )
  if (!updated.rowCount) await db.query(
    `INSERT INTO agent_session_tokens(
       session_id,agent_id,installation_token_id,token_hash,
       exchange_nonce_hash,expires_at,exchanged_at
     ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',now())`,
    [
      sessionId,
      agentId,
      installationTokenId,
      tokenHash(bearer),
      tokenHash(exchangeNonce),
    ],
  )
  return bearer
}

export async function seedAgentSessionExchangeToken(
  db: Pool,
  sessionId: string,
  agentId: string,
): Promise<string> {
  const installationTokenId = await activeInstallationTokenId(db, agentId)
  const exchangeToken = opaqueToken()
  const updated = await db.query(
    `UPDATE agent_session_tokens
        SET installation_token_id=$3,
            token_hash=$4,
            exchange_nonce_hash=$5,
            expires_at=now()+interval '15 minutes',
            exchanged_at=NULL,
            revoked_at=NULL
      WHERE id=(
        SELECT id
          FROM agent_session_tokens
         WHERE session_id=$1 AND agent_id=$2 AND revoked_at IS NULL
         ORDER BY created_at DESC,id DESC
         LIMIT 1
      )`,
    [
      sessionId,
      agentId,
      installationTokenId,
      tokenHash(opaqueToken()),
      tokenHash(exchangeToken),
    ],
  )
  if (!updated.rowCount) await db.query(
    `INSERT INTO agent_session_tokens(
       session_id,agent_id,installation_token_id,token_hash,
       exchange_nonce_hash,expires_at
     ) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')`,
    [
      sessionId,
      agentId,
      installationTokenId,
      tokenHash(opaqueToken()),
      tokenHash(exchangeToken),
    ],
  )
  return exchangeToken
}
