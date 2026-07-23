# Redis Stream outbox delivery
Status: Accepted

## Context
Stage 0 commits domain state, its domain event, and an outbox row atomically in PostgreSQL. The previous worker acknowledged rows without making an observable delivery, so a committed event had no external delivery path.

## Decision
The worker claims eligible outbox rows with `FOR UPDATE SKIP LOCKED`, joins their domain events, and sends them to the Redis Stream `workmesh:domain-events`. Each stream entry contains `outboxId`, `eventId`, `cursor`, `workspaceId`, `topic`, and serialized `payload`.

The worker marks a row delivered only after `XADD` succeeds. Claims are bounded to eight attempts. Failed deliveries use capped exponential backoff; the eighth failure is terminal (`dead`) and cannot be claimed again. Expired delivery locks are reclaimable.

This is at-least-once delivery. A process can crash after `XADD` and before the PostgreSQL acknowledgement, so stream consumers must deduplicate by `eventId` or `outboxId`.

## Alternatives
Mark delivered before publishing; use Redis as the source of truth; have SSE consume Redis directly.

## Consequences
Redis makes delivery observable without weakening PostgreSQL durability. SSE continues to read durable PostgreSQL events and cursors, so it does not depend on Stream retention or consumer groups.

## Migration
No data migration is required. Existing pending rows are eligible for delivery when a worker starts.

## Spec changes
External consumers of `workmesh:domain-events` must support duplicate messages and deduplicate using the supplied identifiers.
