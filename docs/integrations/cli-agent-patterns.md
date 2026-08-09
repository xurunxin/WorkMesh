# CLI agent integration patterns

These examples describe observable behavior only. WorkMesh does not depend on
private Codex, OpenCode, or pi-coding-agent implementation details.

| Fixture | Assignment | Work loop | Recovery |
| --- | --- | --- | --- |
| Codex-style | signed push | Context, Room, Activity, Artifact | replay durable SSE cursor, then reconcile Inbox |
| OpenCode-style | bounded Inbox pull | poll Inbox/events around tool execution | resume opaque Inbox and decimal event cursors independently |
| pi-style | push wakeup plus pull | event-driven execution with periodic reconciliation | replay events and refresh Context/Inbox before effects |

For every pattern: negotiate Profile 1.0, use the exact Session token, keep one
stable idempotency key per intent, refetch on revision conflict, stop on revoked
authority, and publish evidence before completion. Run `pnpm test:conformance`
to verify the reference behavior and inspect its full transcript.
