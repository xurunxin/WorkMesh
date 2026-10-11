import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { agentConnectionRedeemInputSchema } from '@workmesh/contracts'
import { type Expectation, type Pending, parse, parseJson, pendingSchema, serialize, sha256 } from './config.js'
import { requireThat } from './errors.js'
import { atomicWrite, readPrivate } from './platform-security.js'

// 调用者持有目录锁；损坏或不同请求绝不能静默换 key。
export async function getPending(directory: string, expectation: Expectation, pairingCode: string): Promise<Pending> {
  const body = JSON.stringify(parse(agentConnectionRedeemInputSchema, { pairingCode, agentSlug: expectation.agentSlug, client: expectation.client }))
  const expectationHash = sha256(serialize(expectation))
  const path = join(directory, 'pending.json')
  const existing = await readPrivate(path)
  if (existing) {
    const pending = parseJson(pendingSchema, existing.toString('utf8'))
    requireThat(pending.body === body && pending.expectationHash === expectationHash
      && pending.target === expectation.redeemUrl && pending.origin === new URL(expectation.deploymentUrl).origin
      && pending.userAgent === 'workmesh-connector/0.1.0', 'CONNECTOR_PENDING_CONFLICT')
    return pending
  }
  const pending: Pending = { key: randomUUID(), body, expectationHash, target: expectation.redeemUrl,
    origin: new URL(expectation.deploymentUrl).origin, userAgent: 'workmesh-connector/0.1.0' }
  await atomicWrite(path, serialize(pending))
  return pending
}
