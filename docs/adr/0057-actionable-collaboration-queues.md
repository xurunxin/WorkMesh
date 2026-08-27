# Actionable collaboration queues and contextual threads

Status

Accepted

Context

WorkMesh already persists typed Human Attention, Human and Agent Inbox items,
session-scoped claims and receipts, Work Room messages, notifications, and
governed response commands. The current Web surface shows Human Attention alone
at `view=inbox`; the older Inbox cards and notification delivery cards are not
part of the active route and expose source identifiers before business context.
Human operators also cannot inspect the bounded delivery state of Agent Inbox
items without acting as an Agent Session.

Decision

The Inbox route becomes a collaboration queue with three deliberately separate
layers: typed Human Attention for required decisions, Human-owned informational
Inbox items and contextual threads, and a read-only Agent delivery queue for
authorized operational observation. Acknowledgement, read, reply, resolution,
and Agent claim remain distinct server facts. Human responses reuse the existing
revisioned Inbox reply and governed Attention commands.

The Agent delivery projection exposes recipient kind, claimant, receipts,
deadline, source subject, and stale-recipient state, but never exposes an exact
Session item's body or mutable claim controls. Human thread detail is loaded only
for a Human-owned Inbox item and uses its authoritative Work Room references.
Low-value notifications may be grouped only when kind, source, outcome, and
delivery health are equivalent; failures, conflicts, Human requests, state
transitions, evidence, and delivery results remain individual.

URL parameters own the selected queue, filters, and Inbox item. Realtime refresh
preserves the active selection and announces queued changes without moving the
operator's current target.

Alternatives

- Keeping Human Attention as the whole Inbox hides informational collaboration
  and Agent delivery state and was rejected.
- Exposing Agent Inbox through Agent credentials would violate principal and
  exact-Session isolation and was rejected.
- Combining acknowledgement with resolution would erase append-only receipt
  semantics and was rejected.

Consequences

Humans can distinguish work requiring judgment from messages and delivery
diagnostics, follow contextual links, and reply without copying identifiers.
Agent claim authority remains unchanged. The new read projection and enriched
Human list add API contracts but no durable state.

Migration

No durable data migration is required. Existing Inbox items, receipts, and Work
Room messages are projected in place. Existing `view=inbox` links remain valid
and default to the Human-required queue.

Spec changes

Implements GitHub Issue #96 under roadmap #87. `OPENAPI.yaml` gains the authorized
Agent Inbox observability read and enriched Human Inbox projection schemas.
