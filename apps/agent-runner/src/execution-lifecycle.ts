import { z } from 'zod'

export const sessionWaitIntentSchema = z.object({
  state: z.enum(['awaiting_approval', 'awaiting_input', 'blocked']),
  reason: z.string().min(1).max(2_000),
  approval: z.object({ id: z.string().uuid(), actionPayloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.state === 'awaiting_approval') !== Boolean(value.approval))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Approval binding is required only for approval waits.' })
})
export type SessionWaitIntent = z.infer<typeof sessionWaitIntentSchema>
export type ExecutionExit = 'wait' | 'fail' | 'stop' | 'revoked' | 'shutdown' | 'timeout' | 'external_state'
const exitPriority: Record<ExecutionExit, number> = { wait: 0, fail: 0, external_state: 1, timeout: 2, shutdown: 3, revoked: 4, stop: 5 }
const definiteRejection = (error: unknown): boolean => error instanceof Error
  && 'status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500 && error.status !== 408
  && 'code' in error && typeof error.code === 'string' && !error.code.startsWith('HTTP_')
const uncertainCause = (error: unknown): boolean => {
  const seen = new Set<unknown>()
  while (error instanceof Error && !seen.has(error)) {
    if (error instanceof TypeError || error instanceof DOMException) return true
    seen.add(error)
    error = 'cause' in error ? error.cause : undefined
  }
  return false
}

// All model tools and steering share this gate, including callbacks already in flight.
export class ExecutionLifecycle {
  #exit: ExecutionExit | undefined
  #inFlight = 0
  #uncertain = false
  get exit(): ExecutionExit | undefined { return this.#exit }
  get reconciled(): boolean { return this.#inFlight === 0 && !this.#uncertain }
  assertOpen(): void { if (this.#exit) throw new Error('RUNNER_TOOL_CLOSED') }
  close(reason: ExecutionExit): void {
    if (!this.#exit || exitPriority[reason] > exitPriority[this.#exit]) this.#exit = reason
  }
  async request<T>(method: string, send: () => Promise<T>): Promise<T> {
    this.assertOpen()
    try { return await send() }
    catch (error) {
      // A failed write response, including JSON decoding or an HTTP 5xx, can follow commit.
      if (method !== 'GET' && !definiteRejection(error)) this.#uncertain = true
      throw error
    }
  }
  async tool<T>(run: () => Promise<T>): Promise<T> {
    this.assertOpen()
    this.#inFlight += 1
    try { return await run() }
    catch (error) {
      // Structured HTTP rejections are definite; transport failures may have committed.
      if (uncertainCause(error))
        this.#uncertain = true
      throw error
    } finally { this.#inFlight -= 1 }
  }
}
