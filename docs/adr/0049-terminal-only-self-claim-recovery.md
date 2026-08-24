# Terminal-only self-claim recovery

Status: Accepted

## Context

GitHub Issue #85 exposed a remaining autonomous-intake dead end after ADR 0048.
An active executor Delegation can outlive its execution attempt. When every
execution Session on that Delegation is terminal, the execution-capacity
predicate correctly returns no rows, but claim admission treated the empty
non-terminal set as incompatible. The Work Item was neither actively executing
nor claimable, and the terminal Session could not be reopened.

The same state can arise after `completed`, `failed`, or `canceled` execution.
A compatible active Delegation may also have no Session after an interrupted
legacy setup. Neither shape should require Human cleanup when the current
Coordination Connection still proves the exact assignment authority.

## Decision

Self-claim recovery evaluates the active executor Delegation separately from
its execution history. A Delegation is recoverable when its workspace, Team,
Work Item, Agent definition, Agent actor, principal Human, role, exact scope,
capability snapshot, and live Connection authority all match, and every
non-terminal execution Session on it is stale. The empty non-terminal set is a
valid recoverable set.

Recovery keeps terminal Sessions immutable. When stale Sessions exist, it
retains ADR 0048 behavior: cancel and fence them, release active Leases, resolve
their stale Inbox entries, and create a queued replacement. Otherwise it creates
the queued replacement without rewriting historical Sessions. The replacement
links `retry_of_session_id` to the newest stale Session, or to the newest
terminal execution Session when no stale Session exists. A sessionless compatible
Delegation produces a new initial execution with no retry link.

The active Delegation and selected recovery source are locked in the existing
short claim transaction. After the authority lock plan completes, admission
re-reads both the complete non-terminal set and the newest terminal source. Any
drift returns a revision conflict. Capacity is asserted after stale Sessions are
fenced and before the queued replacement is inserted. State, events, outbox,
prompt, context, and credential commit atomically.

`list_claimable_work_items` uses the same empty-or-all-stale non-terminal rule.
Any queued, acknowledged, planning, executing, awaiting, blocked, paused,
stopping, or otherwise live non-stale execution remains an authoritative
conflict. A Human-selected or identity-incompatible assignment also remains a
conflict.

The Work Item projection continues to expose the durable active Delegation as
`active_assignment` and lease-backed runtime ownership as `active_executor`.
A terminal historical Session may therefore appear on `active_assignment`
while `active_executor` is null; claimable discovery, not the projection alone,
communicates whether exact-identity recovery is currently admitted.

## Alternatives

- Reopen the terminal Session: rejected because terminal result, end time, and
  execution history are immutable.
- Revoke and recreate the Delegation: rejected because the compatible authority
  fact remains valid and may have been selected by a Human.
- Require manual cleanup: rejected because ordinary autonomous intake must
  reconcile completed and interrupted attempts itself.
- Add a Delegation lifecycle column: rejected because existing Delegation,
  Session, retry, and capacity facts already express the required state.

## Consequences

- Completing, failing, or canceling an execution releases capacity and allows
  the exact same Connection identity to continue unfinished Work Item work.
- Terminal history remains immutable and the new attempt receives a distinct
  Session and credential.
- Terminal-only, sessionless, and all-stale recovery serialize through the same
  assignment lock and converge under concurrent claims.
- Discovery and mutation use the same empty-or-all-stale non-terminal boundary.

## Migration

No database migration is required. Existing active Delegations are reconciled
lazily on claim. Existing terminal Sessions and Delegation rows are preserved.

## Spec changes

- Update `AGENT_PROTOCOL.md` and `OPENAPI.yaml` with terminal-only and empty-set
  recovery semantics.
- Update MCP tool descriptions and the signed WorkMesh Skill.
- Add API integration and projection tests for terminal history, conflicts,
  concurrency, replay, rollback, and execution continuation.
