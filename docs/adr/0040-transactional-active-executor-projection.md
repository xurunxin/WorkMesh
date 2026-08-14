# Transactional active executor projection

Status

Accepted

Context

A Work Item keeps a responsible Human, while Agent execution is authorized by
Delegations and coordinated by Leases. Reconstructing the currently executing
Agent from Session, Delegation, and Lease tables at every transport surface is
slow, inconsistent, and prone to treating a Lease as authority.

Decision

Maintain `work_item_executor_projections` as a PostgreSQL-derived read model.
Database triggers refresh the affected Work Item in the same transaction as a
Lease, Session, Delegation, or Work Item lifecycle change. Only unexpired active
Leases owned by a non-terminal, non-stale Session with an active Delegation are
projected.

An exclusive Lease produces at most one primary executor projection per Work
Item. A Work Item-level exclusive Lease has highest priority and may be held by
only one active Session. Different Plan Steps may still be leased exclusively by
different Sessions for parallel execution; when no Work Item-level Lease exists,
the oldest active Plan Step Lease is the stable representative. `review_shared`
Leases produce independent reviewer entries and do not replace the primary
executor.

The projection carries Agent, Session, Lease, execution state, heartbeat health,
last heartbeat, and Lease expiry identifiers/timestamps. API reads filter the
stored expiry against database time. The responsible Human remains a separate
field and is never derived from the executor projection. Client Work Item writes
cannot contain projection fields.

`rebuild_work_item_executor_projections` refreshes every selected Work Item from
the authoritative tables under the same per-Work-Item transaction advisory lock
used by incremental refreshes. The Worker exposes this as an explicit repair
job; Redis is not involved.

Alternatives

Computing the joins independently in REST, MCP, SDK, and Web was rejected
because surfaces could disagree and expiry races would be repeated. A Redis
projection was rejected because Redis is not authoritative. Storing an Agent as
the Work Item assignee was rejected because it would overwrite Human
responsibility. Application-only callbacks were rejected because alternate
writers and Worker expiry could bypass them.

Consequences

Projection writes add a small amount of transactional work and serialize
executor changes per Work Item. Projection conflicts abort the originating
transaction. A damaged or manually altered projection can be reproduced without
changing Lease, Session, or Delegation facts. Handoff transfer updates the
projection atomically; release leaves no primary executor, and retain does not
project a source whose Delegation is no longer active.

Migration

`v1/0002_active_executor_projection.sql` creates the table, indexes, refresh and
rebuild functions, triggers, and initial backfill. It is applied after the v1
baseline for clean installs and after baseline adoption for every supported
pre-v1 upgrade endpoint.

Spec changes

Work Item REST responses, native Agent context, Agent SDK, MCP resources/tools,
the Web Work Item drawer, OpenAPI, Agent Protocol, and `SCHEMA.sql` expose the
same responsible-Human and executor projection contract.
