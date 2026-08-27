# Authorized Recovery and freshness projection

Status: Accepted

## Context

Issue #97 requires one Recovery Center that explains why execution is unsafe,
which durable facts are preserved, and which existing command can reconcile the
condition. Human Attention already identifies several recovery-shaped requests,
while Run Explanation, Action Preview, Leases, Approvals, and realtime expose
the source facts independently. Reclassifying those facts in the browser would
duplicate policy and could leak hidden resources.

## Decision

Add a versioned, read-only Recovery projection. Version 1 derives typed items
from authorized Agent Sessions, active executor Delegations, Leases, Approvals,
Activities, Artifacts, and replacement Sessions. It does not add a recovery
state machine or mutable recovery table. A projection rebuild is the repair
operation.

Each item names an explicit condition, severity, lifecycle, affected scope,
source revision and durable cursor, per-item freshness, active-executor status,
Session/Delegation/Lease/Connection facts, preserved commits/artifacts/evidence,
the status of uncommitted runtime work, retry bounds already used, downstream
impact, and supported actions. Actions only link to existing authoritative
commands or their #94 consequence previews; the projection never grants
authority and never revives a terminal Session in place.

Version 1 ships stable source mappings for stale/failed/canceled Sessions,
missing first heartbeat and heartbeat timeout, active assignment without a live
executor, lost or expired Lease, expired Approval, repeated validation failure,
missing completion evidence, and configured retry/budget exhaustion where those
facts exist. Optional Graph/autonomy/provider conditions contribute no rows
until their authoritative domains expose them.

The existing freshness vocabulary (`current`, `refreshing`, `stale`, `offline`,
`resync_required`, and `partial`) is reused. The server marks each action that
requires current state. The Web combines source freshness with realtime
connection state, keeps the last authorized snapshot and Human drafts visible,
and disables freshness-sensitive mutations until a targeted refresh or full
authorized resync succeeds.

Human reads apply the final live Human-Team predicate before projection. Agent
reads use the final live Session/resource predicate. Detail requests return the
same not-found response for missing and unauthorized items. Related counts,
reasons, labels, actions, and timing are therefore computed only after the
authorized row boundary.

Resolved history remains derived from immutable terminal facts, replacement
Sessions, completed Handoffs, and superseding Approvals. Existing durable domain
events remain realtime invalidation authority; cursor gaps request a full
authorized snapshot and do not mutate projection state locally.

## Alternatives

- A mutable `recovery_items` table was rejected because it would introduce a
  second lifecycle that must reconcile with the real sources.
- Browser-side recovery classification was rejected because it duplicates
  policy and can combine differently authorized facts.
- Local repair toggles were rejected because they would bypass existing Session,
  Lease, Handoff, Approval, Delegation, and Work Item commands.

## Consequences

Humans receive a bounded operational diagnosis and safe recovery entry point.
Projection queries are more complex, but remain deterministic, repairable, and
isolated from mutation transactions. Unsupported source domains are explicit
rather than inferred.

## Migration

No database migration or backfill is required. Existing durable facts appear on
the next authorized read.

## Spec changes

- `OPENAPI.yaml` defines Recovery list/detail operations and schemas.
- `packages/contracts` owns the runtime Recovery and freshness contracts.
- The Web adds the canonical `/?view=recovery` route and Project-scoped adapter.
- GitHub issue #97 and the matching WorkMesh Project/Issues carry acceptance
  evidence for this ADR.
