import type { ClientBehaviorFixture } from './types.js'

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
  { id: 'revoked-delegation', errorCode: 'DELEGATION_NOT_ACTIVE' },
  { id: 'expired-session-token', errorCode: 'UNAUTHENTICATED' },
  { id: 'stopped-session', errorCode: 'SESSION_STOPPED' },
  { id: 'out-of-scope-resource', errorCode: 'RESOURCE_SCOPE_DENIED' },
  { id: 'stale-revision', errorCode: 'REVISION_CONFLICT' },
  { id: 'lost-lease', errorCode: 'LEASE_EXPIRED' },
  { id: 'approval-required', errorCode: 'APPROVAL_REQUIRED' },
  { id: 'feature-disabled', errorCode: 'FEATURE_DISABLED' },
  { id: 'cursor-gap', errorCode: 'CURSOR_EXPIRED' },
] as const)
