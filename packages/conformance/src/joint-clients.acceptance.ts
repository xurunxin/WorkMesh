import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createOpenCodeRuntime } from './joint-clients.drivers.js'
import { createJointClientsFixture } from './joint-clients.fixture.js'
import { createExternalConsumer } from './joint-clients.external.js'
import { saveJointEvidence } from './joint-clients.reporter.js'
import { runCoreJourney, runGitJourney } from './joint-clients.journeys.fixture.js'
import { runClientRevisionFaults, runExternalContractFaults, runEventReplayFaults, runClientScopeConcurrencyFaults, runPiAtomicSettleFaults } from './joint-clients.faults.fixture.js'

// Supplementary real Pi/server/protocol suites run under the required root
// integration command. Consume its actual exit and immutable source receipt;
// presence of a report or a successful identity probe is never sufficient.
function verifySupplementaryReceipt() {
  const root = resolve(import.meta.dirname, '../../..')
  const label = process.env.M5_PROTOCOL_CHECK_LABEL
  if (!label) throw new Error('M5_REAL_SUPPLEMENTARY_RECEIPT_REQUIRED')
  const checks = JSON.parse(readFileSync(resolve(root, 'docs/plan/agent-mcp-m5/product-checks.json'), 'utf8')) as Array<{ label: string; argv: string[]; nativeExit: number; sourceBinding?: { path: string; sha256: string }; logs: { stdout: { path: string; sha256: string } } }>
  const receipt = [...checks].reverse().find(row => row.label === label)
  const fullCommand = receipt?.argv.join(' ') === 'pnpm.cmd test:integration'
  const resumed = receipt?.argv.slice(1).join(' ') === 'docs/plan/agent-mcp-m5/product-integration-resume.py'
  if (!receipt || receipt.nativeExit !== 0 || !fullCommand && !resumed || !receipt.sourceBinding) throw new Error('M5_REAL_SUPPLEMENTARY_CHECK_NOT_PASSED')
  if (resumed) {
    const proof = JSON.parse(readFileSync(resolve(root, 'docs/plan/agent-mcp-m5/product-integration-resume.json'), 'utf8')) as { currentConstituentChecks: string; originalWholeCommandExit: number; resumedCommands: Array<{ nativeExit: number }> }
    if (proof.currentConstituentChecks !== 'passed' || proof.originalWholeCommandExit !== 1 || proof.resumedCommands.length !== 3 || proof.resumedCommands.some(row => row.nativeExit !== 0)) throw new Error('M5_INTEGRATION_RESUME_INCOMPLETE')
  }
  const raw = readFileSync(resolve(root, receipt.sourceBinding.path))
  if (createHash('sha256').update(raw).digest('hex') !== receipt.sourceBinding.sha256) throw new Error('M5_SUPPLEMENTARY_SOURCE_RECEIPT_CHANGED')
  const output = readFileSync(resolve(root, receipt.logs.stdout.path))
  if (createHash('sha256').update(output).digest('hex') !== receipt.logs.stdout.sha256) throw new Error('M5_SUPPLEMENTARY_OUTPUT_CHANGED')
  type Entry = { path: string; sha256: string }
  const binding = JSON.parse(raw.toString('utf8')) as { before: { entries: Entry[] }; after: { entries: Entry[] } }
  const after = new Map(binding.after.entries.map(entry => [entry.path, entry.sha256]))
  const consumed = binding.before.entries.filter(entry => /^(apps|packages)\//.test(entry.path)
    && !/^packages\/conformance\/src\/joint-clients\.(acceptance|drivers|external|journeys\.fixture|faults\.fixture|provider\.fixture)\.ts$/.test(entry.path))
  if (!consumed.length) throw new Error('M5_SUPPLEMENTARY_SOURCE_BINDING_EMPTY')
  for (const entry of consumed) {
    const current = createHash('sha256').update(readFileSync(resolve(root, entry.path))).digest('hex')
    if (after.get(entry.path) !== entry.sha256 || current !== entry.sha256) throw new Error(`M5_SUPPLEMENTARY_CONSUMED_SOURCE_CHANGED:${entry.path}`)
  }
  saveJointEvidence('joint-supplementary-binding.json', { receipt, consumedEntries: consumed.length,
    exclusion: 'native acceptance-only modules not imported by the five integration suites', actualOutputHash: receipt.logs.stdout.sha256,
    baselineProtocolFixturesAreNotActualOpenCode: true })
  return { label, consumedEntries: consumed.length }
}

const evidenceRoot = process.env.M5_EVIDENCE_ROOT
const executable = process.env.M5_CLIENT_EXECUTABLE
if (!evidenceRoot || !executable) throw new Error('M5_CLIENT_EXECUTABLE_AND_EVIDENCE_ROOT_REQUIRED')
mkdirSync(evidenceRoot, { recursive: true })
let stage = 'private-client-gate'
let actualIdentityRoundTrip = false
try {
  const completedRun = process.argv.find(arg => arg.startsWith('--verify-completed-run='))?.slice('--verify-completed-run='.length)
  if (completedRun) {
    // Resume only the evidence gate after all actual client assertions completed.
    // Never rerun, synthesize or certify a missing journey from an identity probe.
    const root = resolve(import.meta.dirname, '../../..')
    const checks = JSON.parse(readFileSync(resolve(root, 'docs/plan/agent-mcp-m5/product-checks.json'), 'utf8')) as Array<{ label: string; argv: string[]; nativeExit: number; sourceBinding: { path: string; sha256: string }; logs: Record<'stdout' | 'stderr', { path: string; sha256: string }> }>
    const original = checks.find(row => row.label === completedRun)
    if (!original || original.argv.join(' ') !== 'pnpm.cmd --filter @workmesh/conformance acceptance:joint' || original.nativeExit !== 1) throw new Error('M5_COMPLETED_ACTUAL_RUN_REQUIRED')
    const checkedBytes = (path: string, sha: string) => {
      const bytes = readFileSync(resolve(root, path))
      if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`M5_ORIGINAL_RUN_BYTES_CHANGED:${path}`)
      return bytes
    }
    const output = checkedBytes(original.logs.stdout.path, original.logs.stdout.sha256).toString('utf8')
    const error = checkedBytes(original.logs.stderr.path, original.logs.stderr.sha256).toString('utf8')
    if (!error.includes('Error: M5_REAL_SUPPLEMENTARY_CHECK_NOT_PASSED')) throw new Error('M5_ONLY_SUPPLEMENTARY_GATE_MAY_RESUME')
    const required = ['O-N','P-N','O-G','P-G','F5 actual O/P revision','actual O contract faults','actual O/P event replay and resync','actual scope/state/concurrent claim','actual Pi atomic settle rollback and visible refusal warning']
    const observed = output.split(/\r?\n/).flatMap(line => {
      try { const row = JSON.parse(line) as { completed?: unknown }; return typeof row.completed === 'string' ? [row.completed] : [] } catch { return [] }
    })
    if (JSON.stringify(observed) !== JSON.stringify(required)) throw new Error('M5_ACTUAL_JOURNEY_PREFIX_INCOMPLETE')
    type Entry = { path: string; sha256: string }
    const binding = JSON.parse(checkedBytes(original.sourceBinding.path, original.sourceBinding.sha256).toString('utf8')) as { before: { entries: Entry[] }; after: { entries: Entry[] } }
    const after = new Map(binding.after.entries.map(row => [row.path, row.sha256]))
    const entryPath = 'packages/conformance/src/joint-clients.acceptance.ts'
    const archivedEntry = readFileSync(resolve(root, 'docs/plan/agent-mcp-m5/input/joint-acceptance-before-continuation.ts.txt'))
    const consumed = binding.before.entries.filter(row => /^(apps|packages)\//.test(row.path) && !row.path.endsWith('.test.ts'))
    for (const row of consumed) {
      const bytes = row.path === entryPath ? archivedEntry : readFileSync(resolve(root, row.path))
      if (after.get(row.path) !== row.sha256 || createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error(`M5_ACTUAL_JOURNEY_SOURCE_CHANGED:${row.path}`)
    }
    stage = 'supplementary-evidence-continuation'
    const supplementary = verifySupplementaryReceipt()
    saveJointEvidence('joint-acceptance-result.json', { completed: required.slice(0,4), categories: ['normal','authority','state','idempotency','revision','rollback','replay','concurrency','restart-stop'],
      originalActualRun: original, originalExitRemains: 1, continuedOnlyEvidenceGate: true, actualPrefix: observed, stableRuntimeEntries: consumed.length,
      archivedOriginalEntry: 'input/joint-acceptance-before-continuation.ts.txt', entryChange: 'adds explicit evidence continuation; original actual-run entry bytes preserved', supplementary,
      localJointAcceptance: 'passed', finalProductAcceptance: 'pending independent review, latest Required CI and actual Done/main', externalSignedTransfer: 'unsupported; two tools prohibited' })
    console.log(JSON.stringify({ continuedOnlyEvidenceGate: true, originalExitRemains: 1, localJointAcceptance: 'passed', finalProductAcceptance: 'not_accepted' }))
  } else if (process.argv.includes('--probe-isolation')) {
    const driver = await createOpenCodeRuntime({ executable, evidenceRoot })
    const resources = await driver.close()
    writeFileSync(resolve(evidenceRoot, 'opencode-isolation.json'), JSON.stringify({ stage: 'private-paths-only', resources, actualModelRun: false }, null, 2))
    console.log(JSON.stringify({ isolationPaths: 'proved', actualModelRun: false, fullAcceptance: 'not_run' }))
  } else {
    const f = await createJointClientsFixture()
    let external: Awaited<ReturnType<typeof createExternalConsumer>> | undefined
    try {
      const connection = await f.pairClient('opencode')
      external = await createExternalConsumer({ baseUrl: f.baseUrl, installationToken: connection.token, allowedTools: ['verify_connection'] })
      const verified = await external.invoke<unknown>('verify_connection', {})
      actualIdentityRoundTrip = true
      saveJointEvidence('opencode-actual-identity.json', { verified, clientType: 'opencode', actualModelRun: true })
      console.log(JSON.stringify({ actualIdentityRoundTrip: true, fullAcceptance: 'not_run' }))
    } finally { await external?.close(); await f.close() }
    const selected = process.argv.find(arg => arg.startsWith('--journey='))?.slice('--journey='.length)
    const fault = process.argv.find(arg => arg.startsWith('--fault='))?.slice('--fault='.length)
    if (fault && !['revision', 'external-contract', 'events-replay', 'scope-concurrency', 'atomic-settle'].includes(fault)) throw new Error('M5_UNKNOWN_FAULT_SELECTION')
    const journeys = [
      { id: 'O-N', run: () => runCoreJourney('opencode') },
      { id: 'P-N', run: () => runCoreJourney('pi') },
      { id: 'O-G', run: () => runGitJourney('opencode') },
      { id: 'P-G', run: () => runGitJourney('pi') },
    ]
    if (selected && !journeys.some(journey => journey.id === selected)) throw new Error('M5_UNKNOWN_JOURNEY')
    const completed: string[] = []
    for (const journey of journeys.filter(item => !fault && (!selected || item.id === selected))) {
      stage = journey.id
      await journey.run(); completed.push(journey.id)
      saveJointEvidence('joint-main-journeys.json', { completed, selected: selected ?? null, fullAcceptance: 'not_completed', faultMatrix: 'not_completed' })
      console.log(JSON.stringify({ completed: journey.id, fullAcceptance: 'not_completed' }))
    }
    // A selected chain is a diagnostic command, never an all-M5 certificate.
    stage = 'nine-category-fault-matrix'
    if (fault === 'revision' || !selected && !fault) { await runClientRevisionFaults(); console.log(JSON.stringify({ completed: 'F5 actual O/P revision', fullAcceptance: 'not_completed' })) }
    if (fault === 'external-contract' || !selected && !fault) { await runExternalContractFaults(); console.log(JSON.stringify({ completed: 'actual O contract faults', fullAcceptance: 'not_completed' })) }
    if (fault === 'events-replay' || !selected && !fault) { await runEventReplayFaults(); console.log(JSON.stringify({ completed: 'actual O/P event replay and resync', fullAcceptance: 'not_completed' })) }
    if (fault === 'scope-concurrency' || !selected && !fault) { await runClientScopeConcurrencyFaults(); console.log(JSON.stringify({ completed: 'actual scope/state/concurrent claim', fullAcceptance: 'not_completed' })) }
    if (fault === 'atomic-settle' || !selected && !fault) { await runPiAtomicSettleFaults(); console.log(JSON.stringify({ completed: 'actual Pi atomic settle rollback and visible refusal warning', fullAcceptance: 'not_completed' })) }
    if (!selected && !fault) {
      const supplementary = verifySupplementaryReceipt()
      saveJointEvidence('joint-acceptance-result.json', { completed, categories: ['normal','authority','state','idempotency','revision','rollback','replay','concurrency','restart-stop'], supplementary, localJointAcceptance: 'passed', finalProductAcceptance: 'pending independent review, latest Required CI and actual Done/main', externalSignedTransfer: 'unsupported; two tools prohibited' })
      console.log(JSON.stringify({ completed, localJointAcceptance: 'passed', finalProductAcceptance: 'not_accepted' }))
    }
  }
} catch (error) {
  saveJointEvidence(`joint-acceptance-failure-${randomUUID()}.json`, { error: String(error), stage, actualIdentityRoundTrip, fullAcceptance: 'not_completed' })
  throw error
}
