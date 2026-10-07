# A designated coordinating Chief over an agent graph

Status

Proposed

Reads with, and does not re-decide: ADR 0004 (actor model), ADR 0012 (MCP domain
boundary), ADR 0013 (lease semantics), ADR 0014 (handoff transaction), ADR 0020
(exact-head approval), ADR 0023 and ADR 0024 (automation versioning and loop
admission), ADR 0037 (agent inbox), ADR 0038 (atomic checksummed migrations),
ADR 0042 (agent client profile and derived capability manifest), ADR 0050 and
ADR 0053 (human attention and governed responses), ADR 0062 (autonomous control
plane and agent lifecycle), ADR 0067 (governed platform tools), ADR 0071 and
ADR 0072 (deployment classes), `CONTEXT.md`.

This ADR **narrows** ADR 0062 for one action type, and **amends** ADR 0037's
inbox recovery semantics. Both are stated explicitly below rather than assumed.

## Correction (2026-10-07, after adversarial review)

The first draft of this ADR claimed that almost everything the Chief needs
already exists, and listed three small schema additions. An adversarial review
(`docs/adr/0078-review.md`, 2 blocking, 6 high, 3 medium) established that this
**understated the work and, in places, overstated the code**. Corrections that
survive into this version:

| First draft | Reality |
| --- | --- |
| "capabilitySchema has 16 items" | **17**. The draft's grouping covered 15 and silently omitted `repo:read` and `artifact:write` |
| "Team Room is one added subject kind" | Wrong. `0001_v1_baseline.sql:599-614` has a `CHECK` with three branches and `enforce_room_subject()` routes any non-`work_item`/`project` value into the session branch and raises `WORK_ROOM_SUBJECT_NOT_FOUND`. A Team room insert is refused by a trigger |
| "created and archived by the same channel commands that already exist" | Wrong. `work_room_channels` has no archive field, and there is no generic channel-archive command |
| "short sessions plus snapshots, deltas and a cursor give incremental reads across sessions" | The parts exist; the **composition does not**. ADR 0033 keeps the durable event cursor, opaque collection cursor and session sequence in different domains, and none of them is a Chief consumer checkpoint |
| "prompt author carries activation" | `agent_session_prompts.authorActorId` records an author, with no activation source, appointment revision, or authorization binding; the existing `prompt()` command is **Human-only** (`apps/api/src/agent/commands.ts:2843-2853`) |
| "a timer trigger is a Chief activator" | `automation_rule_versions.trigger` really supports `{type:'schedule',cron,timezone:'UTC'}` with a bounded five-field cron, but the rule's `start_session`/`delegate_agent` path is bound to a Work Item |
| "The Inbox is unusable because its status has only two states" | Wrong. `inbox_item_receipts` already records `claimed/read/acknowledged/replied`; ACK is not resolve |
| "no coordination mechanism exists" | `agent_coordination_sessions` and a session kind already exist. Only the words *chief*, *orchestrator*, *dispatcher* and *planner_agent* are absent |

The general lesson is recorded because it is the failure mode, not the
corrections: **the presence of parts is not the presence of the property they
compose into.** Every "X plus Y already gives Z" claim below now names the
component that does not yet exist.

## Context

A Team can register many agents, and today only a human decides what runs. Every
coordination primitive in the schema is pairwise: an agent claims a Work Item, an
agent delegates to a child session, an agent hands off to a peer. No party looks
across a Team and says that three agents are stuck on the same thing and one is
idle.

The reference product solves this with a Chief: one standing conversation per
team that grooms todos, chooses what runs and who runs it, and reports progress.
Two properties of that design are worth keeping and one is worth changing.

**Worth keeping: the Chief holds no extra tool permission.** In the live roster
it reports `tools: none` and can still dispatch, confirm and merge, because
dispatch is a platform primitive there rather than a capability. It also never
writes code; every change is a separate build on an agent it chose.

**Worth keeping: progress is queried, not remembered.** The Chief reads build
conversations, the board and the roster, and repeated reads take only what is
new.

**Worth changing: one unbounded conversation per Chief.** A single transcript
only survives by re-reading itself and being compacted by hand. WorkMesh's
continuity primitives — `context_snapshots`, `context_deltas`, and versioned
`guidance_documents` scoped to `workspace`/`team`/`project` — are the correct
carrier, so a Chief here is a bounded session per activation. That is a real
departure, and it is what makes the missing consumption protocol (below) the
single largest piece of work in this ADR.

### The Chief is a harness, not an engine

The reference product's Chief runs on whatever coding harness the host has — its
own machine inventory lists twelve external harnesses plus a built-in one as a
fallback. WorkMesh expresses the same thing differently and more abstractly.

An agent is runnable when it holds a live `agent_connections` row, and
`clientType` is the harness identity; `agentProtocolSchema` is
`native_http | mcp | a2a`. **WorkMesh has no built-in agent runtime**: `harness`,
`builtin` and `pi_agent` appear nowhere in the schema or contracts, and the only
`runtime` field in the database is `usage_records.runtimeMs`. Consequences:

- Appointing an agent backed by one harness is exactly as valid as appointing an
  agent backed by another. The platform does not know or care.
- **If no agent holds a live connection, nothing can run, including a Chief.**
  This is the same absence ADR 0074 reports as the `unknown` runner state, seen
  from the other side.
- The harness supplies the tool loop, in-turn plan-then-act rhythm, context
  compaction, session resume and fork, MCP client plumbing, model selection and
  retry. This ADR specifies none of them. Re-implementing any of them would be
  building a worse Codex.

There are two authority layers and they are not substitutes. The harness governs
inside its own process: its approval policy, its sandbox, when it abandons a long
command. WorkMesh governs outside it: capability, Delegation, scope, Stop. A
harness reporting "approved" is not WorkMesh authorisation, and a WorkMesh Stop
does not by itself make a harness abandon a running command. The order is
WorkMesh first — a session with no valid Delegation never starts, so the harness
is never asked.

ADR 0071 places the Agent Runner on the operator's own machine, so Chief inference
runs there too and the control plane only performs admission and delivery. "No
resident Chief process" means no dedicated long-lived model process; the existing
bounded scheduling and compensation polling is reused, and no new polling model
is introduced.

## Decision

A Team may designate **one Chief**: an agent that composes existing primitives
to coordinate, holds no capability by virtue of the designation, and is denied
the capability to affect the outside world unless a Human separately grants it.

### Designations, not actor kinds

Adding `chief` as a fourth actor kind would require its own grants, visibility
rules and audit story. This ADR instead designates an existing agent.

A new `chief_appointments` table records the designation with `workspaceId`,
`teamId`, `agentId`, `status`, `revision`, `appointedByHumanActorId`,
`appointedAt`, `endedAt`, plus consistency constraints tying workspace, Team,
agent and appointing Human together, and domain events plus outbox rows. A
**partial unique index** on `teamId` where `status = 'active'` makes "at most one
Chief per Team at a time" a database invariant.

The invariant is about **identity**, not about serialised reasoning. A singleton
appointment does not serialise a Team: `agent_definitions.maxConcurrency` and the
multi-session model still allow that agent to run concurrently, and no execution
mutex is created by this ADR.

- Appointment, replacement and ending are Human commands with revisions and
  idempotency keys. No agent may appoint, re-point or end a Chief.
- Replacement ends the prior generation and establishes a new one in the same
  transaction. Sessions from the prior generation keep their audit attribution
  but lose the right to produce new dispatch effects; whether they may finish a
  read-only summary is a separate decision.
- **The appointment grants nothing.** It routes attention.

### Capability: one complete, mutually exclusive classification of all 17

`capabilitySchema` has **17** values. The Chief's delegation is built by
intersecting the agent's existing grants with the coordination default set, so
appointing a Chief neither widens nor narrows anything else about that agent. The
agent's own delegations are untouched.

| Class | Capabilities |
| --- | --- |
| **Coordination default** | `work:read`, `work:write`, `comment:write`, `message:write`, `plan:write`, `agent:delegate` |
| **Requires separate approval** | `repo:read`, `artifact:write`, `repo:write_branch`, `repo:open_pr`, `repo:merge`, `ci:run`, `deploy:staging`, `deploy:production`, `secrets:use`, `automation:manage`, `admin:*` |

Consequences that follow from the second row rather than from a slogan:

- A default Chief **cannot read the repository**, so it cannot judge code quality
  directly. If that is wanted, approve `repo:read` deliberately.
- A default Chief **cannot publish an Artifact or its own `review_result`**; it
  may only reference another actor's. Room writes of `review_result` require
  `artifact:write` (`apps/api/src/collaboration/routes.ts:231-255`), and ordinary
  room messages use `work:write` — so the tool name alone does not settle it.
- `ci:run` and `automation:manage` are excluded because they start computation,
  consume quota and can write externally. A Chief is woken by rules a Human
  pre-created; it does not need to manage them and must not be able to widen
  their own trigger rate.
- A Team admin may approve a wider Chief delegation, as a separate audited Human
  act. The **appointment** never widens anything. This resolves the tension
  between "excluded by default" and "may be granted explicitly": the default
  governs the appointment, and every exception is a distinct decision with its
  own audit fact.

A conformance test partitions `capabilitySchema` and fails if any value is
unclassified, so this table cannot drift from the enum.

### The channel is the Work Room and the Inbox together

Adding `team` to `room_subject_kind` is necessary and not sufficient. The
existing database will refuse a Team room, so the subject is extended end to end:

1. A migration entry adds the enum value and **does not use it**; a later entry
   replaces the `CHECK` on `0001_v1_baseline.sql:599-614` and replaces
   `enforce_room_subject()` with an explicit `team` branch that resolves the Team
   in the same workspace, requires `subject_id = team_id`, and requires
   `workItemId`, `projectId` and `sessionId` to be null. The three existing
   subject branches and their unique keys are preserved unchanged.
2. contracts, OpenAPI, the subject type, room discovery, message writes,
   recipient validation, inbox scoping, event resources and audience, and context
   message references all learn the Team subject. **Visibility of the Team room
   itself is checked separately from visibility of the exact-recipient messages
   inside it**; the appointment grants no scope, and discovering a room is not
   reading everything in it.
3. The appointment transaction ensures the standing room exists, keeping the
   existing one-room-per-subject uniqueness. Ending an appointment does **not**
   delete the room or its history. There is no channel-archive command today, so
   this ADR specifies no archival; if it is wanted later it needs its own
   lifecycle, authorisation and migration.
4. Four subject kinds are tested for success and for cross-workspace and
   cross-Team rejection; the three existing kinds must not regress; an ordinary
   execution session must not read a sibling session's private message by way of
   a Team room; and revoking access must converge the room, the inbox, events and
   context together.

The room carries immutable communication facts. **The Inbox is used alongside it,
not rejected**: `inbox_items` is the recipient-facing actionable projection and
`inbox_item_receipts` already records `claimed/read/acknowledged/replied`. A
report guarantees only that the message committed; it returns the message,
inbox and activation references plus whatever response state is known at that
moment. **It does not write an acknowledgement on the Chief's behalf and it does
not block on model latency.**

Two tools are added, both thin over what exists, both on the ADR 0012 boundary:

- **`get_chief`** — a **side-effect-free Query**. Resolves the current Team's
  active Chief, its appointment id and revision, and the standing room id. Without
  it an agent cannot find the Chief, because the room id is not derivable from
  anything it holds.
- **`report_to_chief`** — a **Command**. Posts to that room addressed to the Chief
  actor, records the receipt, and returns the references above. It is idempotent
  on `Idempotency-Key`, refuses any Team the caller is not authorised for, and
  records the sending session so a report is attributable to a real execution
  rather than an anonymous actor.

### Appointment routing is an atomic contract

`get_chief` returning a Chief and `report_to_chief` posting to it are not
atomically related, so the failure cases are specified rather than assumed:

| Situation | `get_chief` | `report_to_chief` |
| --- | --- | --- |
| Authorised Team, no active Chief | pure Query, returns `chief: null`; creates neither room nor appointment | `CHIEF_NOT_APPOINTED`; no message, no silent promotion to a workspace-level Chief |
| Request targets a Team the caller cannot see | uniform `NOT_FOUND`; does not disclose existence | same `NOT_FOUND`; never forwards. v1 serves one explicitly named Team and has no cross-Team routing |
| Appointment changed between the two calls | returns the current appointment id, revision and room id | the request carries the expected appointment id and revision, re-verified under a lock; a stale value returns `CHIEF_APPOINTMENT_CHANGED` and the caller re-sends under the new intent rather than silently changing recipient |
| Replay of an already committed key | not applicable | returns the original message and recipient under the existing replay rules; a divergent body conflicts |

An idempotency key that spans a Chief change must not deliver twice.

### Dispatch authorisation is a consumable binding, and a human message is not one

This is the load-bearing correction. A human's message is **input and provenance
evidence**; it is not execution permission. Presenting it as permission would
break the actor model's attribution rule, and enforcing "no human decision"
naively would block the Chief from even drafting a task for review.

Both dispatch channels therefore use **one structured dispatch authorisation**,
which a Human confirms through a governed command:

- A room operation that explicitly confirms the required fields may create the
  authorisation directly. **Free text may not.** Free text first becomes a
  structured proposal, and the proposal becomes an authorisation only once
  confirmed.
- The binding records workspace, Team, `appointmentId` and revision, principal
  Human, target Work Item or plan version, target agent, capabilities and scope,
  budget, a canonical action digest, an expiry, and a maximum use count.
- Execution commands keep the **real** agent as author and reference the real
  human decision. An agent-authored command is never written as a Human author.
- A Chief may create a Work Item or plan that **does not start execution**.
  Starting, claiming, spawning a child session, retrying, or any other action
  with execution effect must verify and consume a matching authorisation inside
  the state-change transaction. Capability, Delegation, scope, Stop, lease,
  revision and idempotency checks all still run.
- Missing, expired, digest-mismatched, exhausted and revoked-authorisation cases
  each return a specific domain error.

A single shared guard covers `delegate_work_item`, `claim_work_item`,
`create_child_session`, retry and automation admission, so a check placed only in
`report_to_chief` or in an MCP wrapper can be bypassed through creation, child,
claim and automation entry points. The executing session is **persisted** as
carrying a Chief execution context, so a Chief session that outlives its
appointment cannot silently degrade into an ordinary agent. The existing
Approval hash-and-consume construction is reused, with a dispatch-specific
binding: neither an arbitrary `decisions.status = 'final'` nor a
`room_message.intent = 'decide'` is treated as universal authorisation.

**Relation to ADR 0062.** ADR 0062 allows a policy-authored decision to satisfy an
Approval at any risk level, and the YOLO path records
`approval_decisions.source = 'workspace_policy'`. Chief dispatch is an
**explicit exception**: only a decision whose source is a human satisfies it.
`requestApproval` auto-approval and the pending-approval reconciliation path must
not auto-approve this action type, and a policy-sourced record keeps its own
source rather than being rewritten as human. Every other action keeps ADR 0062's
existing semantics.

### Activation: a real command, because the obvious one is Human-only

`agent_session_prompts` records an author, but the existing `prompt()` command
accepts only a Human, so it cannot carry an agent report or a service timer. All
three activation sources therefore map onto one governed admission that records
the real source kind and id, the initiating actor where one exists, the executing
service actor, the appointment revision, the rule version, and the resulting
session id. **A timer is never presented as a human instruction.**

- **Agent report** — a `report_to_chief` commit, or a room message with
  `requiresResponse` addressed to the Chief.
- **Domain event** — a session reaching a gate, a Work Item changing workflow
  state, a review finishing, a run failing. These already flow through
  `outbox_events`.
- **Timer** — an `automation_rule` occurrence. Reuse is from ADR 0023 and ADR
  0024, whose loop admission can create a session with no Work Item and carries
  budget, overlap and fencing. The alternative — extending the coordination
  runner — is not chosen here, and neither path is described as an "ordinary
  session", because cross-Work-Item dispatch requires a coordination session, a
  live connection and a principal that **equals the target Work Item's
  Responsible Human** (`apps/api/src/agent/commands.ts:826-886`). A Team has
  several responsible humans, so that equality rule is kept: a Chief dispatches
  under an approved principal, or a mismatched action returns to the Human who
  owns that Work Item. A Team-level Chief identity confers no right to act as any
  principal.

Every activation path de-duplicates its source, excludes the Chief's own events
from its wake set, merges bursts, and enforces a wake rate limit, a queue depth
bound, a per-Team time-window budget, and a dead-letter path with catch-up.
**A per-session budget does not bound a Chief that can activate itself
indefinitely**, so the cumulative budget is enforced across activations. Stopping
a Chief session must not permit a new session to be created from the same input;
a Human-level pause ends the appointment and cancels future admissions, and
admission re-validates immediately before starting.

### Consumption is a protocol that has to be built, not a property that exists

The durable event cursor, the opaque collection cursor and the session sequence
are different domains (ADR 0033), and none is a Chief consumer checkpoint. A new
session has no prior model context, so handing it only a delta and assuming it
knows the unchanged roster is wrong. And a delta alone misses deletions,
revocations and previously unseen objects that become visible later.

The consumption contract is therefore specified:

- The checkpoint key includes at least workspace, Team, **appointment
  generation** and consumer version. The server cursor is a decimal string and is
  never mixed with list cursors.
- A rebuildable baseline is frozen at a version and a waterline, and the
  handoff from snapshot to events is a defined protocol — not two reads stitched
  together — so concurrent writes during a baseline build are neither lost nor
  double-counted.
- Events merge by id into a changed-resource set, handling deletion and
  revocation; when a payload is insufficient the resource is re-read under
  current authorisation.
- "Processed through C" is linked atomically to that batch's committed proposal
  and activation results; dispatch effects remain independently de-duplicated by
  the authorisation binding.
- A session's input is a versioned, size-bounded derived summary plus the delta,
  traceable to its sources and never authoritative.
- `CURSOR_EXPIRED`, a consumer-version change, or an authorisation **expansion**
  triggers a bounded full rebuild. An authorisation **contraction** removes
  invisible data first.

**Incremental read is a capacity requirement with a measured budget, not a
correctness precondition, and bounded full rebuilds are permitted** for first run,
cursor expiry, authorisation change and repair. Any claim about how many agents
make this unusable is unverified and is not made.

### Inbox recovery across short sessions is a choice, and the obvious one is not free

`inbox_item_claims` are non-transferable, and an item whose claiming session is
Stopped or revoked is stranded with no reclaim. A Chief that gets a fresh session
per activation would therefore never see the unfinished item it claimed last time.

v1 must pick one, explicitly:

- **Reuse one non-terminal Chief session** until the item reaches a terminal
  state; or
- **Amend ADR 0037** to introduce an audited successor or re-delivery, keeping
  the original claim attributed to the original session and creating a linked
  new input. Mutating `claimedBySessionId` in place is forbidden.

Which one is chosen is an implementation decision recorded before coding, and the
cost of a new consumption protocol is acknowledged rather than described as
needing no second queue.

### Memory is deferred out of the first version

The threat is real but not unique, and the original framing was wrong in two
directions. Append-only protects the audit trail, not the truth of the text;
redaction protects secrets, not hostile instructions. And the system already
pins guidance into later sessions (`apps/api/src/guidance.ts:229-243`) and
re-feeds prior text into the model marked untrusted
(`apps/agent-runner/src/run-session.ts:113-120`), so this is not the first
future-input surface.

If memory is built, it is **provenance-bearing, non-authoritative data**, never a
standing instruction. Each record binds the writing session, workspace, Team, the
necessary project or resource scope, source references and hashes, a trust
classification, and supersedes or retraction facts. **All sources are re-filtered
against the new session's current permissions**; a source that has lost access,
or whose visibility cannot be proven, is not loaded. This matters because
`agent_team_access` allows one agent to serve several Teams, so memory scoped only
to `(workspaceId, agentId)` would leak across Teams.

An agent may propose its own memory but may not promote arbitrary text to trusted
guidance. Limited structured business facts with traceable references may be
saved automatically and remain untrusted evidence; changing behaviour,
trust level or visibility requires Human approval through `guidance_documents`.
Promoting arbitrary natural language is off by default and cannot rely on the
model reporting that something is "not a quote".

Because this is a second cross-session injection surface with its own
permissions, provenance and redaction work, **memory is not required to prove
coordination value and is deferred from the first version.** The first version
proves coordination with the existing immutable context and bounded derived
summaries.

### What the Chief may do about existing work

| Action | Mechanism | Bound |
| --- | --- | --- |
| See status across the Team | a read model over sessions, executor projections and activities, read through the consumption contract | authorised by Team scope only |
| Publish a task | `work:write` command with revision and `Idempotency-Key` | ordinary Work Item invariants apply unchanged |
| Propose a correction | a `propose` message plus a decision record | it may **not** reassign a Work Item's Responsible Human; a Chief proposes, a Human decides |
| Request authority it lacks | `requestApproval`, which already exists in the MCP, SDK and tool surface | only a Human can grant; the Chief cannot self-grant |
| Re-order or re-route | authorisation first, then a lease, then routing records | a Lease is a coordination claim and grants nothing (ADR 0013); force-release stays Human with a reason |

Handoff follows the existing offer and accept flow (ADR 0014); this ADR grants the
Chief no accept authority.

The graph is **derived**, not stored. Nodes are agent definitions and Human
actors; authority edges are Delegations and `agent_team_access`; coordination
edges are leases, handoffs and routing records. The invariant that replaces a
graph store: **routing is not authority.** A Chief may have an edge to every agent
in its Team and still hold no edge that changes a repository, a pipeline or a
credential.

### Delivery is a chain, and a new MCP tool is not its end

A tool that exists in the API is not available to an agent until it has passed
every link. The delivery matrix is REST → contracts and SDK → route-policy and
feature registry → MCP bindings → derived capability manifest (ADR 0042) → tool
adapter (ADR 0067) → conformance. Both tools are tested on both paths, including
unsupported, feature-disabled, revoked, Stopped, retried and payload-limited
cases.

`request_approval` already exists across the MCP, SDK and tool surface, so no
synonymous "ask a human" tool is added; what is added is the precise action
binding and the Team-only session adaptation. In the no-Redis profile the
consumption and authorisation contracts are unchanged, and support is a
compatibility item to be accepted, not an assumption. In the Lite class, Chief
inference requires an external runner and the control plane only admits and
delivers.

The workbench renders an explicit unavailable state when no Chief is appointed or
the feature is off. A layout that shipped before the Chief backend must not imply
that a Chief is available.

## Alternatives

- **Add `chief` as a fourth actor kind.** Rejected: `AGENTS.md` fixes the three
  kinds, and a new kind would need its own grants, visibility and audit story.
- **Give the Chief a `chief:*` capability.** Rejected: a wildcard is the
  opposite of the exclusion this design rests on.
- **Build a separate Chief message store.** Rejected: the Work Room already has
  threads, actor and session addressing, `requiresResponse` and response
  resolution.
- **Reject the Inbox because its status has two states.** Rejected on evidence:
  receipts already carry the intermediate states. The Inbox is used alongside the
  room.
- **One long-lived Chief conversation, compacted by hand.** Rejected: continuity
  belongs to snapshots, deltas and guidance, and a transcript only survives by
  re-reading itself.
- **Let the Chief poll the board on a timer.** Rejected: the cursor exists to
  avoid polling, and a timer-only coordinator is blind to agent reports.
- **Store the graph in a graph database.** Rejected: it duplicates relationships
  the relational model holds exactly.
- **Let the Chief reassign a Responsible Human, or grant capabilities.** Rejected:
  `CONTEXT.md` states responsibility is never replaced by an Agent, and a
  Delegation requires a principal Human.
- **Build a Chief orchestration engine in WorkMesh.** Rejected: the harness
  already provides the loop, compaction, resume and MCP plumbing, and WorkMesh
  has no built-in runtime to host one.
- **Ship memory in the first version.** Deferred: it is a second injection
  surface needing its own permissions, provenance and redaction, and coordination
  can be proven without it.

## Consequences

A Team gains one discoverable coordinator and a real position from which to
author and route work, built almost entirely from components the database already
holds. The additions are narrow in name and substantial in substance: a subject
extension, an appointment table, two tools, one authorisation binding, one
admission path and one consumption protocol.

The costs are accepted deliberately. The Chief is the most expensive reader in
the system, so the consumption protocol is the largest single piece of work and
is quantified rather than assumed. A single active appointment is a
single-writer point for judgement; it does not serialise reasoning, and
coordination work may be split by Team without forcing a user to split their
business to scale. Inbox recovery across short sessions is a genuine open choice
that must be made before coding rather than discovered while coding.

This ADR adds no authority a Human does not already hold. It reorganises who
exercises it, and it makes one deliberate narrowing of ADR 0062 for a single
action type, which is a real change to an Accepted decision and is therefore
stated here rather than assumed.

## Migration

Four additive changes, none touching an applied migration, and the count is not
fixed in advance — the consumption and authorisation contracts determine it.

1. A new v1 migration entry adds the enum value and does not use it. PostgreSQL
   permits `ADD VALUE` inside a transaction but the value is unusable until that
   transaction commits, so the enum extension and everything that references
   `'team'::room_subject_kind` live in **separate** entries. Each entry is
   transaction-managed by the runner; no `BEGIN` or `COMMIT` is written in the
   file.
2. A later entry replaces the `CHECK` and `enforce_room_subject()` per the Team
   branch above, and creates `chief_appointments` with the partial unique index
   and its events and outbox rows.
3. Further entries add the authorisation binding, its consumption, and any
   storage the Inbox recovery choice requires.
4. The v1 manifest records only the **new** entries and `SCHEMA.sql` is updated
  to match. Applied baselines, legacy entries and their checksums are left
  exactly as they are; the published baseline is not regenerated in order to add
  an enum value.

Rollout: deploy a version that can read the new enum with the Chief feature
disabled, let the migrations run, confirm every consumer accepts the new type,
and only then permit Team rooms to be written. Rollback keeps the added enum and
its history, disables the feature, and does not attempt to drop an enum label.

Tested: upgrade from the previous version, an empty-database baseline followed by
the upgrade, failure and re-run on either side of each entry's commit, unchanged
old checksums, and unchanged rows for the three existing subject kinds. Database
migration behaviour was not executed for this ADR and is therefore unobserved.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green. The route-policy matrix is regenerated with
`pnpm generate:route-policy`; any new statement locking an agent-visible row
goes through the agent lock inventory via `UPDATE_AGENT_LOCK_MANIFEST=1` and is
reviewed per statement, not diffed for line numbers.

## Spec changes

- `CONTEXT.md` gains **Chief** (a designated coordinating agent that authors and
  routes work and holds no capability by designation), **Chief appointment** (a
  revocable Human act, one per Team, granting nothing), **Dispatch
  authorisation** (a consumable binding that a human message is not), and **Agent
  memory** (provenance-bearing, non-authoritative, filtered by the reading
  session's permissions, deferred from the first version).
- `OPENAPI.yaml` declares the appointment commands, the authorisation binding and
  its consumption errors, `get_chief` as a Query, and `report_to_chief` as a
  Command, together with the four routing failure codes.
- `AGENTS.md` states that a Team has at most one Chief, that the appointment
  grants no capability, that Chief dispatch is an exception to ADR 0062 requiring
  a human-sourced decision, and that a Chief may not replace a Responsible Human.
- `AGENT_PROTOCOL.md` gains the two-channel dispatch rule, the authority-layer
  ordering between the harness and the platform, and the statement that a memory
  is not a standing instruction and is never written from tool output
  automatically.
- `docs/plan/` gains the staged plan, with the consumption protocol and the Inbox
  recovery choice as gates on the first Chief projection rather than later
  refinements.
