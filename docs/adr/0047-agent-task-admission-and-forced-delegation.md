# Agent task admission and forced delegation

Status

Accepted for implementation.

Context

WorkMesh already separates the responsible Human from Agent execution, and it
already exposes an atomic Human operation that creates a Delegation and initial
Agent Session. The Web UI hid that operation below Discussion, passed the
logged-in Human instead of the Issue's responsible Human, and showed only the
lease projection in the Agent execution tab. Agents connected through the
Coordination MCP can list Team Issues but cannot accept one without another
Human or an Agent holding `agent:delegate` explicitly delegating it.

The desired interaction follows Linear's current Agent model: the Human remains
the primary owner while an Agent is a separate delegate. WorkMesh additionally
allows an eligible Agent to pull unassigned work. Human action is authoritative:
an explicit Human delegation is a forced assignment, while Agent self-claim is
permitted only when no active executor Delegation exists.

References:

- https://linear.app/docs/agents-in-linear
- https://linear.app/developers/agents
- `docs/adr/0004-actor-model.md`
- `docs/adr/0012-mcp-domain-boundary.md`
- `docs/adr/0040-transactional-active-executor-projection.md`
- `docs/adr/0043-agent-connection-and-coordination-mcp.md`
- `docs/adr/0046-agent-connection-recovery-and-execution-capacity.md`

Decision

## One assignment authority

The existing active executor Delegation remains the durable assignment fact.
No parallel claim table, owner field, cache, or second Session model is added.
The existing partial unique index allowing one active executor Delegation per
Work Item remains the database backstop.

Assignment mode is command and event provenance rather than a new authorization
field:

- `forced` — a Human explicitly chooses an Agent through the atomic Human route;
- `self_claim` — the Agent bound to the current Coordination Connection accepts
  an Issue for itself;
- existing handoff, automation, loop, review, and child flows retain their own
  existing provenance and never become implicit self-claims.

The responsible Human remains unchanged by either mode.

## Human forced assignment

`POST /api/v1/work-items/{id}/agent-session` is the only Human assignment
mutation. It is named and documented as force-assign-and-start. The request
continues to require `Idempotency-Key` and `If-Match` and creates the Delegation,
queued execution Session, context, prompt, Session credential, domain events,
outbox, and webhook delivery atomically.

The server derives Team and Work Item facts and requires
`principalHumanActorId` to equal the persisted responsible Human. A Workspace
Admin or Team maintainer may invoke the route; the caller does not replace that
principal.

Forced assignment converges as follows:

1. Same Agent, role, scope, capability set, and an existing non-terminal
   execution Session returns that assignment instead of creating a duplicate.
2. A different Agent or incompatible assignment cancels old non-terminal
   execution Sessions, releases their active leases, revokes the old active
   executor Delegation, and creates the requested assignment in the same short
   transaction.
3. Existing terminal Session state, result, end time, and error facts are not
   rewritten.
4. A failed replacement rolls the whole transaction back, leaving the previous
   assignment usable.

The legacy public two-step mutations (`POST .../delegations` followed by
`POST /agent-sessions`) are removed. The duplicate MCP alias
`start_agent_session` is removed; explicit Agent-to-Agent delegation keeps the
single `delegate_work_item` adapter over the atomic route.

## Agent self-claim

Coordination MCP adds:

- `list_claimable_work_items` — uses the normal Work Item list contract with
  `claimable=true` and a cursor. It returns only non-deleted, non-terminal Issues
  in the Connection Team whose responsible Human equals the Connection
  principal and which have no active executor Delegation.
- `claim_work_item` — maps to the new Coordination-only
  `POST /api/v1/work-items/{id}/claim` operation.

Claim input requires the Work Item revision and an idempotency key. It may carry
an execution capability subset, initial prompt, context snapshot, and budget.
It never accepts Agent, principal, Team, role, or Connection identifiers. The
server derives those from the locked active Coordination Session and Connection;
role is always `executor`.

If capabilities are omitted, the server uses the live intersection of the
Connection, Agent definition, Team grant, and Coordination Delegation, excluding
`agent:delegate`; `work:read` must remain. If the prompt is omitted, the server
creates a stable prompt to execute the current Issue description, acceptance
criteria, and applicable Guidance.

Self-claim never displaces existing work. Any active executor Delegation returns
`WORK_ITEM_ALREADY_ASSIGNED` with safe current assignment/session state. Concurrent
claims serialize on the Work Item and converge to exactly one Delegation and one
non-terminal execution Session; the unique index remains the final backstop.

Self-claim requires `work:read` and `work:write`, not `agent:delegate`. The latter
continues to mean assigning work to another Agent.

## Capacity, interruption, and transactions

All assignment paths use the shared execution-capacity predicate from ADR 0046:
only `session_kind = 'execution'` and a non-terminal state consume capacity.
Coordination Sessions never consume an execution slot.

Each mutation uses bounded PostgreSQL transactions with no network or slow I/O.
Self-claim first locks the current Connection and authenticated credential, then
uses the established authority order: Agent definition, Team grant, active
Delegation, counted execution Sessions and credentials, Work Item, then
context/project rows. It never acquires a Connection lock after an Agent
definition lock. After locks, it revalidates Connection, principal,
capabilities, revision, assignment, and capacity before writing state, events,
and outbox.

The claim transaction returns a replayable exchange bootstrap bound to the new
Session. The MCP adapter exchanges it through the existing token-exchange path
in a second short transaction and returns the resulting execution
authentication to the caller. Bootstrap and Session credentials never enter
events, outbox, activities, or logs. Cancellation before either commit rolls
that unit back. If a committed response is lost, replay with the same
idempotency key recovers the same result; a retry with changed input uses a new
key. Normal recovery never requires a Human to run a clean command.

## Web interaction

The Issue Header and Agent execution tab expose one-click `Delegate to Agent`.
When one eligible Agent exists, one click uses that Agent and its approved
capability defaults. When several exist, the action opens a compact chooser;
advanced prompt/capability/budget controls stay optional.

The Agent execution tab owns assignment and the complete Session lifecycle
(`queued` through terminal states). Discussion owns Work Room conversation only.
The UI keeps three visible concepts separate: responsible Human, delegated Agent,
and current Session. It submits the Work Item's responsible Human, preserves the
idempotency key across unknown-result retries, and provides local recovery for
revision, grant, capability, capacity, and assignment conflicts.

The quick sheet uses a wider desktop breakpoint and a sticky execution action;
the full page and narrow layout reuse the same component and mutation path.

Alternatives

Keeping delegation in Discussion was rejected because assignment is a primary
Issue action. Treating an Agent as the Human assignee was rejected because it
removes accountability. Reusing Inbox claim was rejected because Inbox claim is
message coordination and grants no Work Item authority. Requiring
`agent:delegate` for self-claim was rejected because self-claim cannot select a
different Agent. A new claim/owner table was rejected because active executor
Delegation already provides the required invariant. Automatic server-side push
was rejected for this slice; Agents pull through explicit, observable MCP tools.

Consequences

Humans gain a visible forced-assignment action and can correct an autonomous
choice. Agents can continuously discover and accept eligible work without Human
clicks. The same Delegation, Session, event, outbox, Stop, lease, and projection
models remain authoritative. Removing the legacy two-step paths is intentionally
breaking and requires SDK, MCP, protocol, Skill, tests, and route-policy updates
in the same release.

Migration

No database migration is required. Existing Delegations already represent
specific assignments and therefore block self-claim. The current active executor
unique index and executor projection are reused. Production migration still runs
the normal immutable migration manifest and verifies that no pending migration
is skipped.

Spec changes

Update `AGENT_PROTOCOL.md`, `OPENAPI.yaml`, shared Zod contracts, route policy and
generated matrix/bindings, Agent SDK, MCP tools, WorkMesh Skill sources and signed
artifact, Web i18n and E2E coverage. Remove the public two-step delegation routes
and the `start_agent_session` MCP alias.
