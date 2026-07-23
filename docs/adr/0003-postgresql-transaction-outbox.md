# PostgreSQL transaction and outbox
Status: Accepted

## Context
State mutations must never commit without their event or lose externally deliverable work after an API or worker restart.
## Decision
Every successful command inserts current state, one domain event and one outbox event in one PostgreSQL transaction. Worker claims use `FOR UPDATE SKIP LOCKED`; a timed-out delivering lock is reclaimable and retry count is bounded.
## Alternatives
Publish before commit; Redis as authoritative queue.
## Consequences
Delivery is at least once; handlers must be idempotent.
## Migration
`domain_events` and `outbox_events` are introduced in migration 0001.
## Spec changes
None.
