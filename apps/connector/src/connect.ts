import { join } from 'node:path'
import { agentConnectionRedeemInputSchema } from '@workmesh/contracts'
import { configurationSchema, expectationSchema, parse, parseJson, serialize, sha256, type Configuration, type Expectation } from './config.js'
import { ConnectorError, requireThat, safeError } from './errors.js'
import { cleanTemps, withDirectoryLock, readPrivate, atomicWrite, removePrivate } from './platform-security.js'
import { SystemSecretStore, type SecretStore } from './secret-store.js'
import { getPending } from './pending.js'
import { discover, defaultProtocol, validateCurrent, verifyPairing, type ProtocolDependencies } from './protocol.js'
import { commitConnection, recoverCommit, type CommitCheckpoint } from './commit.js'

export type ConnectOptions = {
  directory: string; expectation: Expectation; pairingCode: string;
  store?: SecretStore; protocol?: ProtocolDependencies;
  write?: typeof atomicWrite; checkpoint?: (stage: CommitCheckpoint | 'pending' | 'verified') => Promise<void>;
}
export async function connect(options: ConnectOptions): Promise<Configuration> {
  try {
    const e = parse(expectationSchema, options.expectation)
    parse(agentConnectionRedeemInputSchema, { pairingCode: options.pairingCode, agentSlug: e.agentSlug, client: e.client })
    const store = options.store ?? new SystemSecretStore()
    const protocol = options.protocol ?? defaultProtocol
    const checkpoint = options.checkpoint ?? (async () => {})
    return await withDirectoryLock(options.directory, async () => {
      await recoverCommit(options.directory, store)
      await cleanTemps(options.directory)
      const raw = await readPrivate(join(options.directory, 'config.json'))
      if (raw) {
        const config = parseJson(configurationSchema, raw.toString('utf8'))
        if (config.completion.pairingDigest === sha256(options.pairingCode)) {
          requireThat(config.completion.expectationHash === sha256(serialize(e)), 'CONNECTOR_EXPECTATION_CONFLICT')
          await discover(e, protocol.fetch)
          const skill = await readPrivate(join(options.directory, config.skillFile))
          requireThat(skill && `sha256:${sha256(skill)}` === e.skill.sha256, 'CONNECTOR_SKILL_BYTES_INVALID')
          const token = await store.get(config.secretReference)
          requireThat(token, 'CONNECTOR_SECRET_MISSING')
          await validateCurrent(e, token, config.fingerprint, protocol)
          return config
        }
      }
      const pending = await getPending(options.directory, e, options.pairingCode)
      await checkpoint('pending')
      const verified = await verifyPairing(e, pending, protocol)
      await checkpoint('verified')
      return commitConnection(options.directory, e, pending, verified, { store, write: options.write ?? atomicWrite, checkpoint })
    })
  } catch (error) { throw safeError(error) }
}
export async function abandonPending(directory: string, store: SecretStore = new SystemSecretStore()): Promise<void> {
  await withDirectoryLock(directory, async () => {
    await recoverCommit(directory, store)
    await cleanTemps(directory)
    await removePrivate(join(directory, 'pending.json'))
  })
}
export function clientSnippet(config: Configuration): string {
  const url = config.expectation.mcpUrl
  const header = 'X-WorkMesh-Installation-Token'
  if (config.expectation.client.type === 'codex') return `[mcp_servers.workmesh]\nurl = ${JSON.stringify(url)}\nenv_http_headers = { ${JSON.stringify(header)} = "WORKMESH_INSTALLATION_TOKEN" }`
  if (config.expectation.client.type === 'opencode') return JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { workmesh: { type: 'remote', url, enabled: true, oauth: false, headers: { [header]: '{env:WORKMESH_INSTALLATION_TOKEN}' } } } }, null, 2)
  return JSON.stringify({ mcpServers: { workmesh: { transport: 'streamable_http', url, headers: { [header]: '${WORKMESH_INSTALLATION_TOKEN}' } } } }, null, 2)
}
export { ConnectorError }
