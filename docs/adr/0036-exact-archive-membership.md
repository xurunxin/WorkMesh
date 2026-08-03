# Exact archive membership

Status

Accepted

Context

Archive segments can contain events selected by age rather than a contiguous
Workspace cursor prefix. For example, an old event, a recent event, and a later
backdated old event produce one object whose cursor envelope spans all three
while containing only the first and third. Treating `start_cursor..end_cursor`
as coverage can hide backlog, delete an unrelated outbox proof, advance the
realtime floor past an unarchived event, and permanently skip that event.

Existing production segments predate an exact membership index. Some may
already be verified or pruned, and their online events may already have been
deleted. Their pinned Object-Locked archive object is the durable source from
which membership can be recovered.

Decision

`event_archive_segments.start_cursor` and `end_cursor` are envelope metadata
only. `event_archive_segment_events` stores authoritative per-event membership:
segment, Workspace, ordinal, event ID, cursor, canonical record SHA-256, and the
time at which that member passed below the realtime floor. Unique Workspace
event-ID and Workspace cursor constraints fail closed if two objects claim the
same event.

A new segment starts as a PostgreSQL-first durable `planned`/`pending_exact`
intent. The fenced planning transaction freezes `fixed_cutoff_at`, the segment
UUID and object key, canonical manifest, object and snapshot checksums, retain
horizon, and one provisional member reservation per exact event. It commits
before any object-store request. Provisional members are not coverage because
their parent is not `exact` and `verified`/`pruned`.

The Worker always recovers the oldest pending intent before planning another.
It reconstructs the identical body from the reservations and writes the stable
key with `If-None-Match: *`, SHA-256, segment/snapshot/cutoff metadata, and
`COMPLIANCE` retention. A 200, 412, timeout, 5xx, or lost response reconciles
the current HEAD of that same key. A 404 retries the same key; an identity,
checksum, lock, size, MIME, cutoff, or retain-horizon mismatch becomes a fenced
deterministic `failed` conflict. The Worker never compensates with DELETE and
never creates a replacement key or version. A lease lost after PUT leaves the
intent for its successor; only the successor can persist the reconciled
`VersionId`.

Upload, an `uploaded` or deterministic `failed` database row, provisional
members, and object existence do not establish coverage. All readback is pinned
to the persisted `VersionId`. The Worker verifies Object Lock, size, MIME,
checksum headers and metadata, segment/snapshot/cutoff identity, object
SHA-256, NDJSON manifest, snapshot digest, record order, and per-record digest.
Only then does one short fenced transaction recheck the current claim, exact
segment cutoff, pinned version, and every provisional reservation and atomically
flip the segment to `verified` plus `exact` while advancing the monotonic
watermark. A rollback leaves the intent and reservations non-authoritative.

Archive selection uses the fixed cutoff, delivered outbox proof, and absence of
trusted exact membership. It does not use the job watermark as an exclusion
boundary. The archive watermark is monotonic `GREATEST` telemetry for the
highest exact archived cursor; it is not continuous coverage.

Migration marks all pre-existing segments `legacy_unindexed`. The Worker lazily
reads each verified or pruned legacy segment from its pinned object and inserts
all members in the same fenced finalization transaction. Pruned legacy members
are restored with `floored_at`. This path neither resets a watermark nor lowers
a realtime floor and does not re-upload or re-archive the object. Missing,
corrupt, malformed, or duplicate membership fails closed and leaves the
segment non-authoritative.

Pruning locks the Workspace floor and inspects the bounded online event prefix
above it. It stops at the first event that is too recent or lacks trusted exact
membership. Every referenced pinned object and every candidate record digest
is revalidated. The transaction deletes only exact ordinary allowlisted event
IDs, marks every prefix member floored, advances the floor to the last prefix
cursor, and marks a segment pruned only after all its members are floored.
Protected events can remain online below the floor. Delivered outbox cleanup
requires the event's exact member to be floored at or below the Workspace
floor; cursor envelopes are never consulted.

Before scanning the prefix above the floor, pruning also repairs a bounded set
of historical online rows at or below the current floor whose exact member was
not previously marked `floored_at`. The repair holds the same Workspace floor
and job-fence locks, accepts only `exact` members in verified or pruned
segments, rereads the pinned object version, rechecks the canonical per-event
digest, cutoff, delivered outbox proof, event allowlist, and protected
references, and commits event deletion plus member state together. It never
lowers or advances the floor and never infers membership from an object
envelope. Missing or changed object bytes, a digest mismatch, or a lost fence
rolls back the whole repair. Ordinary event deletion removes its outbox proof
through the existing cascade; protected event outbox proof remains subject to
the existing exact-floored cleanup rule.

Formal soak, status, restart recovery, backlog, current-run evidence, and
restore gates join exact membership. `lastVerifiedEndCursor` is the maximum
exact archived event cursor and remains telemetry. Restore can explicitly read
a legacy object for compatibility, but formal restore accepts only
membership-complete exact segments.

Alternatives

A continuous archive prefix was rejected because a recent or undelivered event
would prevent later backdated events from meeting the archive latency gate.
Splitting every sparse object into one-event objects was rejected because it
does not remove the need to prove exact membership and increases object and
transaction overhead. Resetting watermarks, lowering floors, or re-archiving
legacy objects was rejected because those operations can regress externally
visible cursor semantics and duplicate immutable data.

Consequences

Archive, prune, cleanup, soak, status, and restore queries have one coverage
definition. Sparse segments may be partially floored while remaining
`verified`. Legacy materialization requires pinned-object availability before
pruning can cross the affected prefix. Membership facts intentionally have no
foreign key to `domain_events`, so they survive ordinary event deletion.
`retention_job_state.counters.repairedBelowFloor` reports the bounded member
repair count for the latest prune progress write; `floored_at` remains the
authoritative per-member completion fact.

Migration

`0029_exact_archive_membership.sql` adds the membership state and table, marks
existing segments `legacy_unindexed`, removes range uniqueness, documents
cursor bounds as envelopes, and installs exact uniqueness and floor indexes.
`0030_durable_archive_upload_intents.sql` makes `object_version_id` nullable
only for `planned`/deterministic `failed` intents, adds upload-attempt and fence
evidence, enforces metadata/fixed-cutoff equality, preserves older rows on the
`legacy_unindexed` compatibility path, and installs single-intent and pending
recovery indexes. New objects include a generated segment UUID in the stable
object key.

Spec changes

`WORKMESH_PRD.md`, `OPENAPI.yaml`, `SCHEMA.sql`, retention operations, and the
24-hour acceptance guide define exact membership as the only coverage proof.
There is no REST response-shape or event-contract change.
