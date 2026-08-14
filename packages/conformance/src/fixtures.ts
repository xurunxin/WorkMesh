import type { ClientBehaviorFixture, HostileScenario } from './types.js'

export const clientBehaviorFixtures = Object.freeze([
  {
    id: 'codex-style',
    deliveryMode: 'push',
    resumeMode: 'sse-cursor',
    description: 'Prompt-driven client that receives push assignment and resumes from a durable event cursor.',
  },
  {
    id: 'opencode-style',
    deliveryMode: 'pull',
    resumeMode: 'inbox-cursor',
    description: 'Polling client that discovers assignments and collaboration work through bounded pull APIs.',
  },
  {
    id: 'pi-style',
    deliveryMode: 'hybrid',
    resumeMode: 'sse-and-inbox',
    description: 'Hybrid client that combines event wakeups with Inbox reconciliation after reconnect.',
  },
] as const satisfies readonly ClientBehaviorFixture[])

export const hostileScenarios = Object.freeze([
  { id: 'revoked-delegation', errorCode: 'DELEGATION_NOT_ACTIVE', operation: 'get-session' },
  { id: 'expired-session-token', errorCode: 'UNAUTHENTICATED', operation: 'get-session' },
  { id: 'stopped-session', errorCode: 'SESSION_STOPPED', operation: 'append-activity' },
  { id: 'out-of-scope-resource', errorCode: 'RESOURCE_SCOPE_DENIED', operation: 'get-context' },
  { id: 'stale-revision', errorCode: 'REVISION_CONFLICT', operation: 'transition-session' },
  { id: 'lost-lease', errorCode: 'LEASE_EXPIRED', operation: 'provider-action' },
  { id: 'approval-required', errorCode: 'APPROVAL_REQUIRED', operation: 'request-merge' },
  { id: 'feature-disabled', errorCode: 'FEATURE_DISABLED', operation: 'provider-action' },
  { id: 'cursor-gap', errorCode: 'CURSOR_EXPIRED', operation: 'list-events' },
] as const satisfies readonly HostileScenario[])
