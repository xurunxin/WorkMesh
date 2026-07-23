# REST and SSE transport
Status: Accepted

## Context
The web client needs ordinary CRUD and durable realtime updates without retaining application connection state.
## Decision
Use REST JSON under `/api/v1` for CRUD and SSE for event streaming. SSE resumes from `Last-Event-ID` or `cursor` and reads PostgreSQL events.
## Alternatives
WebSocket-only state; Redis-only pub/sub.
## Consequences
Consumers may see an event more than once and must use its durable cursor/idempotency semantics.
## Migration
`domain_events.cursor` is indexed per workspace.
## Spec changes
None.
