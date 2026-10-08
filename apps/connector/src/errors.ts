export class ConnectorError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'ConnectorError' }
}
export function requireThat(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ConnectorError(code)
}
export function safeError(error: unknown): ConnectorError {
  return error instanceof ConnectorError ? error : new ConnectorError('CONNECTOR_FAILED')
}
