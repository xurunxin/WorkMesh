import type { ConformanceReport } from './types.js'

const xml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;')

export const reportsToJson = (reports: readonly ConformanceReport[]): string =>
  `${JSON.stringify({ formatVersion: 1, reports }, null, 2)}\n`

export function reportsToJunit(reports: readonly ConformanceReport[]): string {
  const failures = reports.reduce((total, report) => total + report.summary.failed, 0)
  const tests = reports.reduce((total, report) => total + report.checks.length, 0)
  const cases = reports.flatMap(report => report.checks.map(check => {
    const name = `${report.fixture}.${check.id}`
    const failure = check.status === 'failed' ? `<failure message="${xml(check.diagnostic)}"/>` : ''
    return `    <testcase classname="${report.adapter}" name="${xml(name)}">${failure}<system-out>${xml(check.diagnostic)}</system-out></testcase>`
  })).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="workmesh-client-profile" tests="${tests}" failures="${failures}">\n${cases}\n</testsuite>\n`
}

export function reportsToTranscript(reports: readonly ConformanceReport[]): string {
  const sections = reports.map(report => [
    `## ${report.adapter} / ${report.fixture}`,
    '',
    `Result: ${report.status}. Checks: ${report.summary.passed} passed, ${report.summary.failed} failed.`,
    '',
    ...report.transcript.map(entry => `${entry.sequence}. [${entry.outcome}] ${entry.operation}: ${entry.summary}${entry.errorCode ? ` (code=${entry.errorCode})` : ''}`),
  ].join('\n'))
  return `# WorkMesh Agent Collaboration Client Profile conformance transcript\n\n${sections.join('\n\n')}\n`
}
