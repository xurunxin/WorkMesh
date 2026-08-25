# Human Attention authorized projection

Status: Accepted

## Context

Issue #88 requires one typed Human Attention contract for Human and Agent
clients. The existing Decisions, Approvals, Inbox items, Agent Sessions, and
Completion Suggestions remain authoritative. A browser-side union of Session
states, message intent names, or free text cannot preserve their different
lifecycle, authorization, revision, evidence, and response semantics.

## Decision

Human Attention is a versioned, read-only projection. Version 1 uses stable
identity `v1:<source-type>:<source-id>` and is rebuilt directly from current
authoritative records. It does not have its own table, outbox stream, scheduler,
or command handler.

| Projection kind | Authoritative source | Open condition | Terminal mapping |
| --- | --- | --- | --- |
| `decision` | Decision | `proposed` and not transition-consumed | finalized becomes `decided`; transition-consumed becomes `superseded` |
| `approval` | Approval | pending and not expired | approved/rejected become `decided`; consumed becomes `verified`; expired becomes `expired` |
| `clarification` | Inbox `waiting_input` or typed room `ask` | Inbox item is open | resolved Inbox item becomes `verified` |
| `conflict` | Inbox `blocker`, or blocked Session without an open blocker item | source is open or Session has no retry | resolved Inbox or a retry makes the source non-open |
| `recovery` | Inbox `session_stale`/`handoff`, or stale/failed Session without the matching open Inbox item | recovery has not resolved and no retry exists | resolved Inbox or a retry becomes `verified` |
| `completion_review` | Completion Suggestion or Inbox `review_request` | source is open | accepted becomes `verified`; dismissed becomes `superseded`; resolved Inbox becomes `verified` |

The Session fallback closes an interruption gap without duplicating the normal
Inbox projection. A matching open Inbox item wins. Retry identity remains the
new Session; terminal history is not reopened.

Every item contains explicit kind, lifecycle status, reason codes, risk,
urgency, source revision, affected resource references, evidence references,
correlation identity, and freshness. `summaryDerived: true` distinguishes the
bounded presentation summary from an authoritative source fact. Missing legacy
event correlation produces `freshness.state=partial`; a stale Session produces
`freshness.state=stale`. Expiry is evaluated from authoritative timestamps, so
repeated reads converge within the documented clock boundary.

The version 1 status vocabulary also reserves `seen`, `applying`, and `failed`
for command-application projections. This read slice does not synthesize those
states: it returns them only when a future authoritative source exposes the
matching committed lifecycle fact.

Option descriptors name existing commands and their transport preconditions.
They never grant authority. The referenced handler still enforces current
identity, Session, delegation, capability, resource scope, approval, lease,
revision, and idempotency invariants.

The list and detail queries apply the final live read-authorization predicate
before rows are returned. Human Inbox-derived items require exact recipient
identity. Agent reads require the exact live Session plus matching Session,
Work Item, or Project scope; an unauthorized detail returns the same `404` as a
missing item. Counts, timing, reasons, and options therefore cannot disclose a
hidden source.

Existing committed domain events remain the realtime authority. Web consumers
refresh the projection for Decision, Approval, Inbox, Completion Suggestion,
and resync invalidations. Replayed events cannot duplicate items because
identity is derived from the source record rather than event delivery.

Optional Graph and autonomy sources contribute no rows while their features are
disabled. Stable sources continue to work without them.

## Alternatives

- A dedicated attention table was rejected because it would create a second
  workflow state machine and require reconciliation against the real sources.
- Client-side inference was rejected because it duplicates policy and can leak
  hidden state through inconsistent filtering.
- A new synthetic attention event stream was rejected because existing durable
  source events already provide scoped invalidation and replay semantics.

## Consequences

Clients receive one adapter-neutral representation through REST, the Agent SDK,
and MCP. Current projection rebuild is the repair operation. Query cost grows
with the source union; indexes and a maintained read model may be introduced
later without changing version 1 semantics.

## Migration

No database migration or backfill is required. Existing records are visible on
the next read. The Web Agent diagnostics surface now consumes the projection
instead of classifying Session states locally.

## Spec changes

- `OPENAPI.yaml` defines list/detail operations and version 1 schemas.
- `packages/contracts` owns the Zod and route-policy contracts.
- `AGENT_PROTOCOL.md` defines Native and MCP representation rules.
- GitHub issue #88 is the remote implementation and acceptance record for this
  ADR.
