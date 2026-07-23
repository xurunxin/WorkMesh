# Handoff transaction

Status: Accepted

## Context

A handoff must not strand a work item with partially transferred authority.

## Decision

Offering a handoff creates an immutable handoff context snapshot linked to the prior snapshot; it never rewrites prior context. A requested exact-agent handoff is delivered to that agent's configured webhook before acceptance. The installation credential may authenticate only the exact pending target's reject operation; it does not grant session or resource mutation authority. Machine rejection reasons are a closed protocol enum.

Target selection may persist a separate, idempotent routing-attempt fact before acceptance so failed routing remains auditable. Accepting a handoff is still one PostgreSQL transaction: revalidate the exact target or deterministic shortlist selection, scope, capability intersection, status, access, and concurrency; create the target delegation and child session; transfer or release only in-scope active leases; provision target-only session delivery; mark the handoff accepted; then append events/outbox. An exact-agent request cannot be redirected at acceptance. Test-only failure hooks cover intermediate boundaries. Completion requires the accepted child session to have completed with evidence and the lease policy to be satisfied.

## Alternatives

Webhook-first transfer; multiple independently committed API calls.

## Consequences

External delivery begins only after commit. Any injected failure rolls all intermediates back.

## Migration

Migration 0007 adds `handoffs`, routing attempts, and routing records.

## Spec changes

None.
