# Human Attention governed responses

Status: Accepted

## Context

ADR 0050 made Human Attention a read-only projection over Decisions,
Approvals, Inbox items, Agent Sessions, and Completion Suggestions. Issue #92
requires Humans to respond from that projection without introducing a second
workflow authority or allowing the browser to invent command scope, bulk
compatibility, or lifecycle.

The existing Inbox reply route was exact-Session only even though typed
clarification and completion-review Inbox items can target a Human. Resolving a
message without an answer does not satisfy that workflow.

## Decision

Human Attention remains read-only. Each item publishes a typed response
descriptor, viewer relationship, and bulk policy derived from its authoritative
source. Option paths continue to name existing source commands and grant no
authority.

The existing revisioned `POST /api/v1/inbox/{id}/reply` command accepts either
an exact authorized Agent Session or the exact Human recipient. A Human reply:

- locks the Inbox item and source Session participants;
- verifies current Team membership or Workspace Admin authority;
- requires the exact Inbox revision and idempotency key;
- creates a typed Work Room answer/review result;
- resolves the source response requirement and matching Inbox receipts in the
  same PostgreSQL transaction;
- delivers the reply to the exact source actor/Session when it remains valid;
- returns `404` for a hidden or non-recipient item and a revision conflict for
  stale state.

Human Attention does not add a generic respond endpoint. Decision, Approval,
message resolution, Inbox reply, Session retry, Handoff, and Completion
Suggestion handlers remain authoritative.

Bulk approval is a client orchestration over independent authoritative
Approval commands. The server declares eligibility only for open `info`/`low`
risk Approvals with the same exact action payload hash. Every item is submitted
with its own revision and idempotency key. Partial failure does not roll back
successful independent decisions and leaves failed items selected for recovery.
High-risk, destructive, scope-expanding, credential, trust-boundary,
production-effect, or payload-distinct items are never bulk compatible.

## Alternatives

A generic Human Attention mutation endpoint was rejected because it would
become a second command dispatcher and policy surface. A database-backed
Attention lifecycle was rejected because source records already own lifecycle.
Client-only compatibility inference was rejected because it can combine
payload-distinct Approvals or stale revisions.

## Consequences

Global and Project Attention Centers can share one typed interaction model.
Human clarification replies now use the same exact Inbox/Work Room transaction
as Agent replies while retaining different actor authorization. Bulk operations
can partially succeed by design because each source mutation is its own atomic
unit.

## Migration

No database migration or backfill is required. Existing open Human Inbox items
become replyable immediately when the exact Human recipient reads them.

## Spec changes

- `OPENAPI.yaml` documents Human Inbox reply authorization, Attention filters,
  viewer/response/bulk metadata, and conflict-resolution rationale.
- `packages/contracts` owns the runtime contract and route-policy change.
- `AGENT_PROTOCOL.md` documents that response descriptors and bulk policy do
  not grant authority.
- GitHub issue #92 and `docs/plan/2026-08-26-attention-center.md` are the remote
  and local implementation records.
