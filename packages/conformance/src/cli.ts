import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { clientBehaviorFixtures } from './fixtures.js'
import { createMcpReferenceDriver, createNativeReferenceDriver, referenceSeed } from './reference-fixture.js'
import { reportsToJson, reportsToJunit, reportsToTranscript } from './reporters.js'
import { runClientConformance } from './runner.js'

const outputArgument = process.argv.indexOf('--output')
const output = resolve(outputArgument >= 0 ? process.argv[outputArgument + 1] ?? 'conformance-results' : 'conformance-results')
const reports = []
for (const fixture of clientBehaviorFixtures) {
  reports.push(await runClientConformance({ driver: createNativeReferenceDriver(), fixture, seed: referenceSeed }))
  reports.push(await runClientConformance({ driver: createMcpReferenceDriver(), fixture, seed: referenceSeed }))
}
await mkdir(output, { recursive: true })
await Promise.all([
  writeFile(resolve(output, 'report.json'), reportsToJson(reports), { encoding: 'utf8', mode: 0o600 }),
  writeFile(resolve(output, 'junit.xml'), reportsToJunit(reports), { encoding: 'utf8', mode: 0o600 }),
  writeFile(resolve(output, 'transcript.md'), reportsToTranscript(reports), { encoding: 'utf8', mode: 0o600 }),
])
const failures = reports.filter(report => report.status === 'failed')
console.log(`WorkMesh client conformance: ${reports.length - failures.length}/${reports.length} adapter/fixture runs passed. Evidence: ${output}`)
if (failures.length) process.exitCode = 1
