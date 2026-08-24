# Stale self-claim recovery

Status: Accepted

## Context

GitHub Issue #83 exposed two related recovery gaps. An acknowledged execution
Session with no heartbeat was classified as stale immediately, and an active
executor Delegation whose only non-terminal Session was stale made its Work
Item permanently unclaimable. The generic state endpoint also advertised the
domain transition `stale -> acknowledged` while its route authorization
rejected every stale Session before the command could run.

The observed production shape is an active executor Delegation with a
`stale / heartbeat_timeout` Session, no active Lease, and no active-executor
projection. Requiring a Human to revoke it would defeat autonomous intake.
Reviving the old execution implicitly during a new claim would also blur
execution history and keep old credentials alive.

## Decision

Heartbeat liveness uses the newest available baseline in this order:
`last_heartbeat_at`, `acknowledged_at`, then `created_at`. The Worker evaluates
that baseline while holding the Session row lock. ACK and lifecycle
reconciliation therefore serialize, and a newly acknowledged Session receives
its configured heartbeat interval before it can become stale. The
`created_at` fallback gives legacy rows a deterministic result without a data
migration.

`claim_work_item` may recover an existing active executor Delegation only when
all of these facts still match the current Coordination Connection:

- workspace, Team, Work Item, Agent definition, Agent actor, and principal
  Human;
- executor role and an exact Work Item capability scope: the current workspace,
  exactly one current Team and Work Item, the current Project when present, no
  Repository, no extra scope keys, and an exact non-duplicated capability set;
- live Connection, Team grant, Coordination Delegation, and requested
  capabilities; and
- at least one non-terminal execution Session exists, and every such Session
  on the Delegation is stale.

The recovery is one short PostgreSQL transaction under the existing authority
and Work Item lock order. Locator reads collect the active Delegation, every
non-terminal execution Session, and every live Session Token that may be
fenced; the unified authority plan locks those rows before Installation Token
and Work Item rows, then re-reads the exact IDs before mutation. Assignment or
credential drift returns a retryable revision conflict. The transaction retains
the compatible Delegation, cancels each stale Session with an explicit
replacement reason, ends it, revokes its Session tokens, resolves its stale
Inbox projection, releases its active Leases with events, and creates one
distinct queued execution Session. The new Session records the latest stale Session as
`retry_of_session_id` when one exists and receives a fresh prompt, context,
budget, exchange credential, event, delivery, and outbox record. Old and new
Session events commit atomically.

A different Agent, principal, Team, scope, capability set, or any non-stale
non-terminal execution remains `WORK_ITEM_ALREADY_ASSIGNED`. Human forced
assignment therefore remains authoritative. Parallel recovery claims converge
to one queued replacement; after that replacement exists, other claim keys see
the ordinary assignment conflict. Exact idempotency replay returns the same
replacement response.

`list_claimable_work_items` includes both unassigned Work Items and the above
same-identity recoverable assignments, so autonomous recovery is discoverable.
The explicit ACK endpoint remains the only supported in-place recovery
operation for an exact old execution credential. The generic state endpoint is
not an ACK substitute because it does not record ACK metadata or establish a
new heartbeat baseline. Protocol and MCP descriptions make this distinction
explicit.

## Alternatives

- Revoke the Delegation and create another one: rejected because it overwrites
  the authority chosen by a prior Human forced assignment.
- Re-ACK the stale Session inside `claim_work_item`: rejected because a new
  claim is a new execution attempt and must fence old credentials and history.
- Require a Human or manual cleanup command: rejected because stale autonomous
  intake must reconcile without an operator-only recovery step.
- Add a database status or migration: rejected because current Session,
  Delegation, token, Lease, retry, event, and outbox fields represent the full
  lifecycle.

## Consequences

- Old stale execution attempts remain auditable and cannot continue writes.
- Same-Agent Human assignment can be resumed autonomously without being
  displaced.
- Claimable discovery and claim admission share the same recovery boundary.
- A stale assignment for another Agent still requires the existing Human
  forced-assignment workflow.
- Recovery performs only bounded row updates and inserts; it does not hold a
  transaction across network I/O.

## Migration

No database migration is required. Existing rows use `acknowledged_at` when
present and otherwise fall back to `created_at`. Existing stale assignments are
reconciled lazily on claim.

## Spec changes

- Update `AGENT_PROTOCOL.md` with heartbeat baselines and stale self-claim
  replacement semantics.
- Update `OPENAPI.yaml` claim and claimable descriptions.
- Update the Coordination Skill to direct Agents to replay `claim_work_item`
  for a compatible stale assignment.
- Keep `SCHEMA.sql` unchanged.
