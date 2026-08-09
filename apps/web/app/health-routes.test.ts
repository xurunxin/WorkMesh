import { describe, expect, it } from 'vitest'
import { GET as live } from './livez/route.js'
import { GET as ready } from './readyz/route.js'

describe('web container health routes', () => {
  it('exposes independent liveness and readiness responses', async () => {
    const liveResponse = live()
    const readyResponse = ready()
    expect(liveResponse.status).toBe(200)
    expect(readyResponse.status).toBe(200)
    await expect(liveResponse.json()).resolves.toEqual({ status: 'ok' })
    await expect(readyResponse.json()).resolves.toEqual({ status: 'ok' })
  })
})
