import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createOpenCodeRuntime } from './joint-clients.drivers.js'
import { createJointClientsFixture } from './joint-clients.fixture.js'
import { createExternalConsumer } from './joint-clients.external.js'
import { saveJointEvidence } from './joint-clients.reporter.js'
import { runCoreJourney, runGitJourney } from './joint-clients.journeys.fixture.js'

const evidenceRoot = process.env.M5_EVIDENCE_ROOT
const executable = process.env.M5_CLIENT_EXECUTABLE
if (!evidenceRoot || !executable) throw new Error('M5_CLIENT_EXECUTABLE_AND_EVIDENCE_ROOT_REQUIRED')
mkdirSync(evidenceRoot, { recursive: true })
try {
  if (process.argv.includes('--probe-isolation')) {
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
      saveJointEvidence('opencode-actual-identity.json', { verified, clientType: 'opencode', actualModelRun: true })
      console.log(JSON.stringify({ actualIdentityRoundTrip: true, fullAcceptance: 'not_run' }))
    } finally { await external?.close(); await f.close() }
    const selected = process.argv.find(arg => arg.startsWith('--journey='))?.slice('--journey='.length)
    const journeys = [
      { id: 'O-N', run: () => runCoreJourney('opencode') },
      { id: 'P-N', run: () => runCoreJourney('pi') },
      { id: 'O-G', run: () => runGitJourney('opencode') },
      { id: 'P-G', run: () => runGitJourney('pi') },
    ]
    if (selected && !journeys.some(journey => journey.id === selected)) throw new Error('M5_UNKNOWN_JOURNEY')
    const completed: string[] = []
    for (const journey of journeys.filter(item => !selected || item.id === selected)) {
      await journey.run(); completed.push(journey.id)
      saveJointEvidence('joint-main-journeys.json', { completed, selected: selected ?? null, fullAcceptance: 'not_completed', faultMatrix: 'not_completed' })
      console.log(JSON.stringify({ completed: journey.id, fullAcceptance: 'not_completed' }))
    }
    // A selected chain is a diagnostic command, never an all-M5 certificate.
    if (!selected) throw new Error('M5_JOINT_FAULT_MATRIX_NOT_COMPLETED: main journeys cannot certify nine categories')
  }
} catch (error) {
  writeFileSync(resolve(evidenceRoot, 'opencode-isolation-gap.json'), JSON.stringify({ error: String(error), actualModelRun: false, fullAcceptance: 'not_run' }, null, 2))
  throw error
}
