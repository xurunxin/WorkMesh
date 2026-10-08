import { connect } from '../src/connect.js'
import type { SecretStore } from '../src/secret-store.js'
import { fixture, pairingCode } from './fixture.js'
import { expectationSchema, parseJson } from '../src/config.js'
import { safeError } from '../src/errors.js'

let id = 0
const pending = new Map<number, (value: string | null) => void>()
process.on('message', (message: { id: number; value: string | null }) => { pending.get(message.id)?.(message.value); pending.delete(message.id) })
const call = (operation: string, ref: string, token?: string): Promise<string | null> => new Promise(resolve => {
  const key = ++id; pending.set(key, resolve); process.send?.({ operation, ref, token, id: key })
})
const store: SecretStore = {
  put: async (ref, token) => { await call('put', ref, token) }, get: ref => call('get', ref), delete: async ref => { await call('delete', ref) },
}
const f = await fixture(undefined, parseJson(expectationSchema, process.env.WM_TEST_EXPECTATION!))
await connect({ directory: process.env.WM_TEST_DIRECTORY!, expectation: f.e, pairingCode, store, protocol: {
  ...f.protocol,
  fetch: async (input, init) => {
    if (String(input) === f.e.redeemUrl) process.send?.({ request: { key: new Headers(init?.headers).get('Idempotency-Key'), body: init?.body, origin: new Headers(init?.headers).get('Origin'), userAgent: new Headers(init?.headers).get('User-Agent') } })
    return f.protocol.fetch(input, init)
  },
}, checkpoint: async stage => {
  process.send?.({ stage })
  if (stage === process.env.WM_TEST_STOP_AT) await new Promise(() => {})
} }).then(() => { process.send?.({ complete: true }); process.disconnect?.() }, error => {
  process.send?.({ error: safeError(error).code }); process.exitCode = 1; process.disconnect?.()
})
