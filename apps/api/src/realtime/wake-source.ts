import { createClient, type RedisClientType } from 'redis'
import { parseDurableCursor } from './cursor.js'

export type RealtimeWakeHint = Readonly<{
  workspaceId: string
  cursor: string
}>
export type WakeAvailability = 'healthy' | 'unavailable'
export type RealtimeWakeSource = Readonly<{
  start: (
    onHint: (hint: RealtimeWakeHint) => void,
    onAvailability: (availability: WakeAvailability) => void,
  ) => void
  close: () => Promise<void>
}>

const streamKey = 'workmesh:domain-events'

export class RedisStreamWakeSource implements RealtimeWakeSource {
  readonly #client: RedisClientType
  #running = false
  #loop: Promise<void> | undefined

  constructor(redisUrl: string) {
    this.#client = createClient({ url: redisUrl })
    this.#client.on('error', () => undefined)
  }

  start(
    onHint: (hint: RealtimeWakeHint) => void,
    onAvailability: (availability: WakeAvailability) => void,
  ): void {
    if (this.#running) return
    this.#running = true
    this.#loop = this.#run(onHint, onAvailability)
  }

  async #run(
    onHint: (hint: RealtimeWakeHint) => void,
    onAvailability: (availability: WakeAvailability) => void,
  ): Promise<void> {
    let streamId = '$'
    while (this.#running) {
      try {
        if (!this.#client.isOpen) await this.#client.connect()
        onAvailability('healthy')
        const streams = await this.#client.xRead(
          { key: streamKey, id: streamId },
          { BLOCK: 1_000, COUNT: 100 },
        )
        for (const stream of streams ?? [])
          for (const message of stream.messages) {
            streamId = message.id
            const workspaceId = message.message.workspaceId
            const cursor = message.message.cursor
            if (workspaceId && cursor)
              try {
                onHint({
                  workspaceId,
                  cursor: parseDurableCursor(cursor),
                })
              } catch {
                // A malformed hint is ignored. PostgreSQL reconciliation remains
                // the only durable source and will observe the committed event.
              }
          }
      } catch {
        onAvailability('unavailable')
        if (this.#client.isOpen) this.#client.disconnect()
        await new Promise(resolve => setTimeout(resolve, 1_000))
      }
    }
  }

  async close(): Promise<void> {
    this.#running = false
    if (this.#client.isOpen) this.#client.disconnect()
    await this.#loop
  }
}

export class NoopWakeSource implements RealtimeWakeSource {
  start(
    _onHint: (hint: RealtimeWakeHint) => void,
    onAvailability: (availability: WakeAvailability) => void,
  ): void {
    onAvailability('unavailable')
  }
  async close(): Promise<void> {}
}
