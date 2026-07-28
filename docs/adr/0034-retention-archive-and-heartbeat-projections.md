# Retention archive and bounded heartbeat projections

Status

Accepted

Context

Unbounded heartbeat facts and indefinite replay/event retention make a
self-hosted WorkMesh installation grow with pulse frequency rather than domain
work. Event deletion is high risk because PostgreSQL cursors are the durable
realtime contract and A2A, audit, recovery, and outbox rows may reference an
event.

Decision

Steady Agent Session and Lease heartbeats update one current projection under
the existing identity, delegation, capability, scope, idempotency, and Stop
gates. They do not advance workflow revision or Session sequence and do not
append activity, event, or outbox rows. Session health is a durable
`healthy`/`degraded`/`stale` projection. A transition is serialized by the
Session row lock and emits once; heartbeat never restores a stale, stopping, or
terminal Session.

Generic idempotency stores response replay material for at least 24 hours and a
conflict tombstone for at least 30 days. Authentication-secret replay remains
the separate 15-minute/24-hour encrypted contract.

Retention jobs use fixed cutoffs, bounded `SKIP LOCKED` batches, a durable
claim lease, and a monotonically increasing fence. A stale owner cannot write
progress or enter the destructive transaction. Event archives are canonical
cursor-sorted NDJSON records containing the complete event, normalized
scope/invalidation resources, and its delivered outbox proof. They are
deterministically gzipped, uploaded, and read back before becoming verified.
The database stores both the uncompressed snapshot digest and exact object
SHA-256.

Production defaults are archive-only: archival is enabled, generic cleanup and
event pruning are disabled. Pruning has a second explicit kill switch. It locks
one Workspace retention floor exclusively, rechecks the verified segment,
cutoff, count, digest, references, and outbox status, deletes only an exact
ordinary-event allowlist, and advances the floor in the same transaction.
Every event append takes the matching shared floor lock. Unknown, protected,
A2A-referenced, audit, uncertain recovery, and undelivered rows remain in
PostgreSQL even when the realtime floor advances past them. Delivered outbox
proof is cleaned only after the containing verified segment has been floored;
ordinary-event outbox rows otherwise disappear atomically with their event.
Archive objects are retained for at least 365 days.

Alternatives

Time-partition drops were rejected because protected and ordinary events share
time ranges. Redis-only retention was rejected because Redis is not durable
replay. Object-store upload acknowledgement without readback was rejected
because it cannot prove recoverability. A lease without a monotonic fence was
rejected because a paused worker could overwrite a newer owner's progress.

Consequences

Operators get a sanitized Workspace-admin status endpoint but no archive
download API. Cleanup and prune require explicit enablement. The Worker
publishes its effective mode and last-seen time into durable job state, so the
API never infers destructive mode from its own environment. Undelivered outbox
rows block archival at their cursor; permanent protected rows do not block
later ordinary-event floor advancement.
Issue #11 owns any future archive discovery/download/restore product surface,
key-management UX, or legal-hold workflow.

Migration

Migration `0026_retention_archive_and_heartbeat_health.sql` adds heartbeat
projections, generic idempotency horizons, archive segments, durable job state,
the policy inventory, cleanup indexes, and the append-side retention lock.

Spec changes

`OPENAPI.yaml`, `WORKMESH_PRD.md`, `AGENT_PROTOCOL.md`, `SCHEMA.sql`,
`.env.example`, Docker Compose, operator documentation, and the acceptance soak
harness define the executable boundary.
