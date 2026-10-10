import { DomainError } from '@workmesh/domain';
const HEARTBEAT_DEDUPE_LIMIT = 128;
export async function isHeartbeatReplay(tx, input) {
    const existing = (await tx.query(`SELECT request_hash
       FROM heartbeat_idempotency_keys
      WHERE resource_kind=$1 AND resource_id=$2 AND idempotency_key=$3`, [input.resourceKind, input.resourceId, input.idempotencyKey])).rows[0];
    if (!existing)
        return false;
    if (existing.request_hash !== input.requestHash)
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', `Idempotency-Key was already used for a different ${input.resourceKind} heartbeat`);
    return true;
}
export async function recordHeartbeatKey(tx, input) {
    await tx.query(`INSERT INTO heartbeat_idempotency_keys(
       resource_kind,resource_id,idempotency_key,request_hash,expires_at
     ) VALUES($1,$2,$3,$4,now()+interval '24 hours')`, [input.resourceKind, input.resourceId, input.idempotencyKey, input.requestHash]);
    await tx.query(`DELETE FROM heartbeat_idempotency_keys keys
      WHERE keys.resource_kind=$1 AND keys.resource_id=$2
        AND (keys.observed_at,keys.idempotency_key) IN (
          SELECT observed_at,idempotency_key
            FROM heartbeat_idempotency_keys
           WHERE resource_kind=$1 AND resource_id=$2
           ORDER BY observed_at DESC,idempotency_key DESC
          OFFSET $3
        )`, [input.resourceKind, input.resourceId, HEARTBEAT_DEDUPE_LIMIT]);
}
