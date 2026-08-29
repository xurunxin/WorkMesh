import { describe, expect, it } from 'vitest'
import { LatestRequestGate } from './latest-request'

describe('LatestRequestGate', () => {
  it('allows only the request matching the latest Project URL to commit', () => {
    const gate = new LatestRequestGate<string>()
    const first = gate.begin('project-a')
    const second = gate.begin('project-b')

    expect(first.signal.aborted).toBe(true)
    expect(first.isCurrent()).toBe(false)
    expect(second.signal.aborted).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it('retires the active Project request when navigation leaves the workspace', () => {
    const gate = new LatestRequestGate<string>()
    const request = gate.begin('project-a')
    gate.cancel()

    expect(request.signal.aborted).toBe(true)
    expect(request.isCurrent()).toBe(false)
  })
})
