import type { AgentConnectionErrorRecovery } from '@workmesh/contracts'

export class ConnectorError extends Error {
  readonly retryAfterMs?: number
  constructor(readonly code: string, readonly recovery?: AgentConnectionErrorRecovery, readonly correlationId?: string,
    retryAfterMs?: number, readonly status?: number) {
    super(code); this.name = 'ConnectorError'
    this.retryAfterMs = typeof retryAfterMs === 'number' && Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0 ? retryAfterMs : undefined
  }
}
export function requireThat(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ConnectorError(code)
}
export function safeError(error: unknown): ConnectorError {
  return error instanceof ConnectorError ? error : new ConnectorError('CONNECTOR_FAILED')
}
