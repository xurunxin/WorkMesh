import type { AgentCapabilityManifest } from '@workmesh/contracts'

export type ClientFixtureStyle = 'codex-style' | 'opencode-style' | 'pi-style'
export type DeliveryMode = 'push' | 'pull' | 'hybrid'
export type ResumeMode = 'sse-cursor' | 'inbox-cursor' | 'sse-and-inbox'

export type ClientBehaviorFixture = Readonly<{
  id: ClientFixtureStyle
  deliveryMode: DeliveryMode
  resumeMode: ResumeMode
  description: string
}>

export type ConformanceSeed = Readonly<{
  sessionId: string
  sessionRevision: number
  workItemId: string
  roomId: string
  inboxItemId: string
  targetAgentId: string
  startCursor: string
  expectedEventIds: readonly string[]
}>

export type DriverValue = Readonly<Record<string, unknown>>
export type FailureProbe = Readonly<{ code: string; details?: unknown }>

export interface CollaborationConformanceDriver {
  readonly adapter: 'native-http' | 'mcp'
  discover(profileVersion: string): Promise<{ info: DriverValue; manifest: AgentCapabilityManifest }>
  acknowledgeSession(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  getContext(seed: ConformanceSeed): Promise<DriverValue>
  listInbox(seed: ConformanceSeed): Promise<DriverValue>
  acknowledgeInbox(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  postMessage(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  appendActivity(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  publishArtifact(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  offerHandoff(seed: ConformanceSeed, idempotencyKey: string): Promise<DriverValue>
  completeSession(seed: ConformanceSeed, artifactId: string, idempotencyKey: string): Promise<DriverValue>
  disconnect(): Promise<void>
  reconnect(cursor: string): Promise<void>
  listEvents(seed: ConformanceSeed, cursor: string): Promise<readonly DriverValue[]>
  probeFailure(errorCode: string): Promise<FailureProbe>
}

export type TranscriptEntry = Readonly<{
  sequence: number
  operation: string
  outcome: 'passed' | 'failed'
  summary: string
  errorCode?: string
}>

export type ConformanceCheck = Readonly<{
  id: string
  status: 'passed' | 'failed'
  diagnostic: string
}>

export type ConformanceReport = Readonly<{
  suiteVersion: '1.0'
  profileVersion: '1.0'
  adapter: CollaborationConformanceDriver['adapter']
  fixture: ClientFixtureStyle
  status: 'passed' | 'failed'
  checks: readonly ConformanceCheck[]
  transcript: readonly TranscriptEntry[]
  summary: Readonly<{ passed: number; failed: number }>
}>
