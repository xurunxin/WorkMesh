export type LatestRequest<TKey> = Readonly<{
  key: TKey
  signal: AbortSignal
  isCurrent: () => boolean
}>

export class LatestRequestGate<TKey> {
  private current: { controller: AbortController; key: TKey } | null = null

  begin(key: TKey): LatestRequest<TKey> {
    this.current?.controller.abort()
    const controller = new AbortController()
    const token = { controller, key }
    this.current = token
    return {
      key,
      signal: controller.signal,
      isCurrent: () => this.current === token && !controller.signal.aborted,
    }
  }

  cancel(): void {
    this.current?.controller.abort()
    this.current = null
  }
}
