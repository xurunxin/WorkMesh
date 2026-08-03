import { clientProfileErrorReactions, releaseMetadata } from '@workmesh/contracts'
import { hostileScenarios } from './fixtures.js'
import type {
  ClientBehaviorFixture,
  CollaborationConformanceDriver,
  ConformanceCheck,
  ConformanceReport,
  ConformanceSeed,
  DriverValue,
  TranscriptEntry,
} from './types.js'

const valueId = (value: DriverValue): string | undefined => typeof value.id === 'string' ? value.id : undefined
const valueRevision = (value: DriverValue): number | undefined =>
  typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0
    ? value.revision
    : undefined

export async function runClientConformance(input: {
  driver: CollaborationConformanceDriver
  fixture: ClientBehaviorFixture
  seed: ConformanceSeed
}): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = []
  const transcript: TranscriptEntry[] = []
  let sequence = 0
  const check = async (id: string, action: () => Promise<string>): Promise<void> => {
    try {
      const diagnostic = await action()
      checks.push({ id, status: 'passed', diagnostic })
      transcript.push({ sequence: ++sequence, operation: id, outcome: 'passed', summary: diagnostic })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined
      checks.push({ id, status: 'failed', diagnostic: message })
      transcript.push({ sequence: ++sequence, operation: id, outcome: 'failed', summary: message, errorCode })
    }
  }
  let artifactId = ''
  let currentRevision = input.seed.sessionRevision
  await check('profile.negotiation', async () => {
    const discovery = await input.driver.discover(releaseMetadata.preferredClientProfileVersion)
    if (discovery.manifest.profileVersion !== '1.0') throw new Error(`Expected profile 1.0; received ${discovery.manifest.profileVersion}`)
    if (!discovery.manifest.authorizationEvaluatedPerRequest) throw new Error('Manifest incorrectly claims to grant authorization')
    const extension = discovery.manifest.extensions.find(item => item.id === 'workmesh.engineering-graph')
    if (!extension || extension.enabled) throw new Error('Engineering Graph must be explicitly negotiated and disabled for Stable Core')
    if (input.fixture.deliveryMode !== 'pull' && !discovery.manifest.delivery.push.supported) throw new Error('Push fixture requires advertised push support')
    if (input.fixture.deliveryMode !== 'push' && !discovery.manifest.delivery.pull.supported) throw new Error('Pull fixture requires advertised Inbox support')
    return `Negotiated 1.0 from ${discovery.manifest.generatedFrom}; authorization remains live per request.`
  })
  await check('lifecycle.assignment-ack', async () => {
    const value = await input.driver.acknowledgeSession(input.seed, `${input.fixture.id}-ack`)
    if (!valueId(value)) throw new Error('Assignment acknowledgement did not return an effect id')
    currentRevision = valueRevision(value) ?? 0
    if (!currentRevision) throw new Error('Assignment acknowledgement did not return the current Session revision')
    return `Acknowledged Session ${input.seed.sessionId} at revision ${currentRevision}.`
  })
  await check('lifecycle.transition-executing', async () => {
    const value = await input.driver.transitionSession(input.seed, currentRevision, `${input.fixture.id}-executing`)
    currentRevision = valueRevision(value) ?? 0
    if (!currentRevision) throw new Error('Executing transition did not return the current Session revision')
    return `Transitioned Session to executing at revision ${currentRevision}.`
  })
  await check('lifecycle.context-inbox', async () => {
    const context = await input.driver.getContext(input.seed)
    const inbox = await input.driver.listInbox(input.seed)
    if (context.sessionId !== input.seed.sessionId) throw new Error('Context is not bound to the exact Session')
    if (!Array.isArray(inbox.items) || !inbox.items.some(item => item && typeof item === 'object' && 'id' in item && item.id === input.seed.inboxItemId)) throw new Error('Inbox omitted the prepared assignment item')
    await input.driver.acknowledgeInbox(input.seed, `${input.fixture.id}-inbox-ack`)
    return 'Retrieved exact Context and acknowledged the durable Inbox item.'
  })
  await check('lifecycle.collaborate-evidence-handoff', async () => {
    await input.driver.postMessage(input.seed, `${input.fixture.id}-message`)
    await input.driver.appendActivity(input.seed, `${input.fixture.id}-activity`)
    const artifact = await input.driver.publishArtifact(input.seed, `${input.fixture.id}-artifact`)
    artifactId = valueId(artifact) ?? ''
    if (!artifactId) throw new Error('Artifact publication did not return an id')
    const handoff = await input.driver.offerHandoff(input.seed, `${input.fixture.id}-handoff`)
    if (!valueId(handoff)) throw new Error('Handoff did not return an id')
    return `Collaborated visibly, published Artifact ${artifactId}, and offered a scoped Handoff.`
  })
  await check('idempotency.duplicate-mutation', async () => {
    const key = `${input.fixture.id}-duplicate`
    const first = await input.driver.appendActivity(input.seed, key)
    const second = await input.driver.appendActivity(input.seed, key)
    if (!valueId(first) || valueId(first) !== valueId(second)) throw new Error(`Duplicate key committed different effects: ${String(valueId(first))} vs ${String(valueId(second))}`)
    return `Duplicate delivery replayed effect ${valueId(first)} without a second commit.`
  })
  await check('reconnect.cursor-recovery', async () => {
    await input.driver.disconnect()
    await input.driver.reconnect(input.seed.startCursor)
    const events = await input.driver.listEvents(input.seed, input.seed.startCursor)
    const ids = events.map(valueId).filter((id): id is string => Boolean(id))
    const missing = input.seed.expectedEventIds.filter(id => !ids.includes(id))
    if (missing.length) throw new Error(`Reconnect lost events: ${missing.join(', ')}`)
    if (new Set(ids).size !== ids.length) throw new Error('Reconnect returned duplicate committed events')
    return `Recovered ${ids.length} unique events from cursor ${input.seed.startCursor}.`
  })
  await check('hostile.fail-closed-matrix', async () => {
    for (const scenario of hostileScenarios) {
      const { errorCode } = scenario
      const observed = await input.driver.probeFailure(scenario, input.seed)
      if (observed.code !== errorCode) throw new Error(`Expected ${errorCode}; received ${observed.code}`)
      const reaction = clientProfileErrorReactions.find(item => item.errorCode === errorCode)
      if (!reaction) throw new Error(`No required client reaction is registered for ${errorCode}`)
      transcript.push({ sequence: ++sequence, operation: `hostile.${scenario.id}`, outcome: 'passed', summary: `Observed ${errorCode}; fail closed: ${reaction.reaction}.`, errorCode })
    }
    return `Verified ${hostileScenarios.length} hostile states with actionable fail-closed reactions.`
  })
  await check('lifecycle.complete', async () => {
    if (!artifactId) throw new Error('Completion is blocked without evidence')
    const session = await input.driver.getSession(input.seed)
    currentRevision = valueRevision(session) ?? 0
    if (!currentRevision) throw new Error('Session refresh did not return the current revision')
    const value = await input.driver.completeSession(input.seed, artifactId, currentRevision, `${input.fixture.id}-complete`)
    if (!valueId(value)) throw new Error('Completion did not return an effect id')
    return `Refreshed revision ${currentRevision} and completed Session with Artifact ${artifactId}.`
  })
  const failed = checks.filter(item => item.status === 'failed').length
  return {
    suiteVersion: '1.0',
    profileVersion: '1.0',
    adapter: input.driver.adapter,
    fixture: input.fixture.id,
    status: failed ? 'failed' : 'passed',
    checks,
    transcript,
    summary: { passed: checks.length - failed, failed },
  }
}
