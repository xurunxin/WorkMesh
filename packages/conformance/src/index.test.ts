import { describe, expect, it } from 'vitest'
import { clientBehaviorFixtures } from './fixtures.js'
import { createMcpReferenceDriver, createNativeReferenceDriver, referenceSeed } from './reference-fixture.js'
import { reportsToJson, reportsToJunit, reportsToTranscript } from './reporters.js'
import { runClientConformance } from './runner.js'

describe('Agent Collaboration Client Profile conformance harness', () => {
  it('runs the same lifecycle, reconnect, idempotency, and hostile matrix through Native and MCP adapters', async () => {
    const reports = []
    for (const fixture of clientBehaviorFixtures) {
      reports.push(await runClientConformance({ driver: createNativeReferenceDriver(), fixture, seed: referenceSeed }))
      reports.push(await runClientConformance({ driver: createMcpReferenceDriver(), fixture, seed: referenceSeed }))
    }
    expect(reports).toHaveLength(6)
    expect(reports.every(report => report.status === 'passed')).toBe(true)
    expect(reports.every(report => report.summary.failed === 0)).toBe(true)
    expect(reports.every(report => report.checks.some(check => check.id === 'lifecycle.transition-executing' && check.status === 'passed'))).toBe(true)
    expect(reports.every(report => report.checks.some(check => check.id === 'lifecycle.complete' && check.diagnostic.includes('Refreshed revision')))).toBe(true)
    expect(reports.every(report => report.transcript.filter(entry => entry.operation.startsWith('hostile.') && entry.operation !== 'hostile.fail-closed-matrix').length === 9)).toBe(true)
    expect(reports.every(report => report.transcript.some(entry => entry.operation === 'hostile.cursor-gap' && entry.summary.includes('resync_from_server_cursor')))).toBe(true)
    expect(reports.every(report => report.transcript.some(entry => entry.operation === 'hostile.expired-session-token' && entry.errorCode === 'UNAUTHENTICATED'))).toBe(true)
    expect(reportsToJson(reports)).toContain('"formatVersion": 1')
    expect(reportsToJunit(reports)).toContain('<testsuite name="workmesh-client-profile"')
    expect(reportsToTranscript(reports)).toContain('codex-style')
    expect(reportsToTranscript(reports)).toContain('opencode-style')
    expect(reportsToTranscript(reports)).toContain('pi-style')
  })
})
