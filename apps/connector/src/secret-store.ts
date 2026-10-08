import { AsyncEntry } from '@napi-rs/keyring'
import { ConnectorError } from './errors.js'

export interface SecretStore {
  put(reference: string, token: string): Promise<void>
  get(reference: string): Promise<string | null>
  delete(reference: string): Promise<void>
}
export class SystemSecretStore implements SecretStore {
  private entry(reference: string): AsyncEntry {
    return new AsyncEntry('WorkMesh.connector', reference, { linux: { store: 'secret-service' } })
  }
  async put(reference: string, token: string): Promise<void> {
    try { await this.entry(reference).setPassword(token) } catch { throw new ConnectorError('CONNECTOR_SECRET_STORE_UNAVAILABLE') }
  }
  async get(reference: string): Promise<string | null> {
    try { return await this.entry(reference).getPassword() ?? null } catch { throw new ConnectorError('CONNECTOR_SECRET_STORE_UNAVAILABLE') }
  }
  async delete(reference: string): Promise<void> {
    try { await this.entry(reference).deleteCredential() } catch { throw new ConnectorError('CONNECTOR_SECRET_COMPENSATION_FAILED') }
  }
}
