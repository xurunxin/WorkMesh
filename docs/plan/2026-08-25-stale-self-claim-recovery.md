# WorkMesh stale self-claim recovery — GitHub #83

Local ADR: `docs/adr/0048-stale-self-claim-recovery.md`

GitHub: https://github.com/xurunxin/WorkMesh/issues/83

## Goal

Make an acknowledged execution receive a real first-heartbeat window and let a
Coordination Agent atomically replace its own compatible abandoned stale
execution by calling the existing `claim_work_item` entry point. Preserve Human
forced assignment authority and make the recovery visible through
`list_claimable_work_items`.

## Task 1 — Implement, verify, and deliver the recovery slice

### Implementation

- Change lifecycle classification to use
  `last_heartbeat_at -> acknowledged_at -> created_at` under the Session lock.
- Extend claimable discovery with the exact same-identity, all-stale recovery
predicate, including exact Team, Project, Work Item, Repository, and capability
scope equality.
- In `claim_work_item`, retain a compatible executor Delegation, cancel and
fence all stale execution Sessions and their pre-locked credentials, resolve
stale Inbox projections, release their Leases with events, and create one queued
retry-linked Session in the same transaction.
- Keep all mismatched or live assignments as `WORK_ITEM_ALREADY_ASSIGNED` and
  preserve capacity, authority, revision, and idempotency gates.
- Document and test that stale in-place recovery uses the dedicated ACK command;
  the generic state transition is not an ACK substitute.
- Update Agent Protocol, OpenAPI, MCP/SDK descriptions where applicable, and
  the signed Coordination Skill.
- Create one PR, wait for required CI, merge to `main`, deploy the accepted SHA
  to the OpenWrt production topology, then remove only superseded application
  images after rollback and live acceptance gates pass.

### Tests

- Worker boundary tests for newly ACKed, legacy, degraded, stale, and
  ACK-versus-lifecycle serialized cases.
- API integration for same Agent/principal recovery, different Agent and Human
  forced-assignment rejection, mixed live/stale rejection, terminal-only
  compatible assignment, extra/mismatched/duplicated scope rejection, exact
  idempotency replay, transaction rollback, and 8–32 concurrent claims
  converging to one replacement.
- Assertions that stale tokens are revoked, Leases released, old state and new
  creation events/outbox are atomic, and no residual non-terminal execution
  remains besides the replacement.
- MCP lifecycle test proving list -> claim recovery -> exchange -> ACK ->
  heartbeat/context works without `agent:delegate`.
- Focused contracts/domain/API/Worker/SDK/MCP tests followed by repository lint,
  typecheck, unit, integration, E2E, route-policy, Skill, and production-image
  checks required by the affected surface.
- Production GEN-376 replay using the current Installation identity, with
  correlation-safe evidence and no credential output.

### Definition of done

- A first ACK cannot become stale before its configured heartbeat threshold.
- GEN-376 is returned by claimable discovery and `claim_work_item` returns one
  fresh queued Session while preserving the existing compatible Delegation.
- Old stale execution credentials and Leases are fenced, with atomic events and
  outbox evidence.
- Other-Agent, incompatible, or non-stale active assignments remain conflicts;
  Human forced assignment remains authoritative under races.
- Required local and CI checks pass, the accepted SHA is deployed, live MCP
  task processing succeeds, and only superseded production application images
  are removed.

## Boundaries

- No database migration or compatibility layer is added.
- No unrelated Web UI files are changed.
- No security/safety audit or speculative hardening is part of this task.
- Existing valid production data is reconciled in place; no global cleanup or
  image prune is allowed.
