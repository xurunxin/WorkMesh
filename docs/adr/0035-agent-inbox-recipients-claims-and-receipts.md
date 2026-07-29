# Agent Inbox recipients, claims, and receipts

Status

Accepted

Context

The original Inbox projected actionable work only to Human actors. Agent
collaboration used Work Room messages and webhooks, but it did not preserve
whether a message addressed an Agent actor or one exact Agent Session. A
Human-only recipient column and mutable Inbox status could not safely support
multiple concurrent Sessions of the same Agent, live revocation, or auditable
read, acknowledgement, and reply facts.

An Inbox item may disclose message bodies, structured payloads, and Work Room
context. Recipient identity and a Lease are therefore insufficient authority.
Every Agent read or mutation must revalidate the current Session credential,
Session state, Delegation, Agent definition, Team grant, live capability
intersection, and resource scope before detail is returned.

Decision

`inbox_items` remains the unified actionable projection for Humans and Agents.
It records one recipient actor and may additionally record one exact recipient
Session. An actor-targeted Agent item is listed as bounded metadata until one
eligible current Session explicitly claims it. The claim is an immutable,
one-time coordination binding; it never grants authorization. Exact-session
items cannot be claimed or retrieved by a sibling Session. Wrong recipient or
scope is concealed as `NOT_FOUND`.

Claim, acknowledge, and reply are Agent-Session-only commands. They require an
idempotency key, and reply also requires the current Inbox revision through
`If-Match`. List and get remain available to authorized Humans and Agents, but
an Agent receives full detail only when it is the exact recipient or current
claimant. Signed Inbox cursors include the server-derived current Session so a
cursor cannot be replayed by another Session of the same Agent actor.

Claims, acknowledgements, and replies are append-only
`inbox_item_receipts`. `GET` is pure and does not create a read receipt or any
other durable mutation; this stage intentionally exposes no read-receipt
command. Acknowledgement does not resolve a response-required item. A reply
creates an immutable Work Room message, recipient facts, a response-resolution
fact, the compatibility Inbox status projection, domain events, and outbox rows
in one PostgreSQL transaction. Reciprocal replies acquire the two participating
Session locks in deterministic order before idempotency reservation,
authorization, and mutation. Inbox
reply never accepts a Handoff, decides an Approval, releases a Lease, or changes
a Work Item; those remain separate explicit commands.

Exact Work Room recipients are preserved in
`room_message_session_recipients`. Exact-target `room.message.posted` events
are emitted once per target and bind both the target Agent actor and target
Session. Their webhook delivery is bound to that same target Session.
Immediately before an external request, the Worker revalidates the target
actor, Session, Delegation, Agent definition, Team grant, capability
intersection, normalized resource scope, endpoint, and secret. Revoked or
stopped targets are terminally suppressed and audited by error code without
payload disclosure. A separate
`room.message.human_visibility_recorded` event wakes authorized Human Work
Room observers through the normal Team/resource audience while Agent event
queries reject that observer-only event. This keeps Agent-to-Agent messages
realtime-visible to authorized Humans without exposing exact-recipient event
metadata to sibling Agent Sessions.

Normalized resource scope treats an explicitly authorized Work Item as the
Session resource even when that Work Item belongs to a Project. The Project
relationship is re-read from PostgreSQL and may authorize only that Work
Item's related Project room; it does not authorize sibling Work Items.
Project-only Sessions still require an explicit `projectIds` grant. This keeps
standard work-item Session rows compatible without turning duplicate Project
IDs into a second, accidental authorization requirement.

`notifications` remains a reminder and delivery projection. It is not used as
Inbox authority and cannot replace recipient, claim, receipt, or Work Room
facts.

Alternatives

Returning full actor-targeted detail before claim was rejected because
multiple Sessions could disclose and act on the same item concurrently.
Claiming as a side effect of `GET` was rejected because reads must remain
non-mutating. Using Lease ownership as Inbox authority was rejected because a
Lease coordinates execution and does not authorize data access. Reusing only
webhooks was rejected because delivery is at least once and is not the durable
actionable fact. Emitting one generic Agent-visible event for exact recipients
was rejected because sibling Sessions could observe targeted event metadata.

Consequences

Clients gain an explicit claim transition and append-only receipt history.
Actor-targeted work can be coordinated by one Session while live revocation
still immediately blocks later reads and writes. Exact Session addressing
creates one event and outbox record per target plus one observer-only Human
refresh event for an exact-only message. Existing Human Inbox behavior remains
compatible, and status remains a query projection whose revision advances on
every status transition.

The one-time claim is intentionally immutable in this stage. If its winning
Session is later stopped or revoked, authority checks strand the item rather
than transferring it to a sibling Session. There is no reclaim or release
command; adding one requires a separate protocol and audit decision.

Inbox message, actor and exact-Session recipient, receipt, and response-
resolution rows are excluded from generic retention cleanup. Their
`room.message.*` and `inbox.item.*` events are excluded from the ordinary
prunable event allowlist. A future deletion or redaction policy requires an
explicit retention decision rather than reuse of the current generic switches.

REST, Agent SDK, MCP, native tools, OpenAPI, and route policy share the same
list, get, claim, acknowledge, and reply operations. MCP derives Session
identity from its configured token and never accepts an arbitrary Session ID.

Migration

Migration `0027_agent_inbox_receipts.sql` backfills the existing Human
recipient into the unified actor recipient, adds exact recipient and immutable
claim fields, preserves the legacy source Session column, adds composite
Workspace/actor/Session constraints, creates exact Work Room recipient facts
and append-only receipts, and adds separate keyset indexes for exact,
actor-targeted, and claimed items. A compatibility trigger mirrors the legacy
Human recipient column for old producers during rolling deployment, and the
new actor/session receipt trigger rejects receipts outside the actual recipient
or claimant. Applied migrations remain unchanged.

Migration `0028_inbox_receipt_reply_binding.sql` strengthens reply receipts
without editing `0027`. Migration
`0029_legacy_inbox_scope_derivation.sql` backfills Human Inbox rows written by
old producers after `0027` and upgrades the rolling-deploy compatibility
trigger to derive Team scope from the persisted source Session or Work Room.
For old room-message producer shapes, it also derives the durable source room
message when the referenced message exists in the same Workspace. Applied
`0027` and `0028` migrations remain unchanged.

Spec changes

`OPENAPI.yaml`, `SCHEMA.sql`, shared contracts, route-policy artifacts, Agent
SDK, MCP tools, Worker projections, and Stage 2 integration/E2E coverage define
the executable boundary.
