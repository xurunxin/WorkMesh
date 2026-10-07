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

This ADR is **parallel** to ADR 0062 rather than a narrowing of it: a Chief
delegation and an autonomy policy are both standing, bounded, revocable grants.
It **amends** ADR 0037's inbox recovery semantics: the claim stays non-transferable
and becomes **non-continuable-by-inheritance**, and recovery is by **audited
re-delivery** rather than by reuse. The choice is recorded below, was settled by
the owner on 2026-10-07, and is not deferred to implementation.

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

A second correction came from the owner after the review, and it is recorded
here because the review got it only half right. Review finding H3 said the draft
had to choose between per-dispatch human decisions and ADR 0062's policy-based
autonomy, and it recommended the per-dispatch option. **That recommendation was
wrong for this product.** The owner settled it: the Chief has autonomous
dispatch authority, a Human revises rather than approves item by item, and once a
goal is handed to the Chief that is a delegation to execute. Per-dispatch human
approval would have produced an officer who asks permission on every errand,
which is the opposite of a coordinator. The draft's "exception to ADR 0062"
framing is therefore **withdrawn**: a Chief delegation is the same kind of thing
as an autonomy policy — standing, bounded, revocable — so the two are parallel
rather than competing. Review finding B1 survives unchanged: a free-text message
is still not a grant.

A third ruling came from the owner on 2026-10-07 and is recorded for the same
reason: the draft left Inbox recovery as a two-way choice to be made before
coding, and the owner chose **audited re-delivery**. The reasoning that makes the
choice legible is one line — *a claim is not transferable ≠ a claim is not
continuable* — and it is stated in full in the section below. The rejected option
(session reuse) is kept in Alternatives so the decision can be re-opened on
evidence rather than on recollection.


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

### Dispatch authority is a standing delegation, and a human message is not one

This is the load-bearing correction, and it is two-sided. A human's message is
**input and provenance evidence**; it is not execution permission. Presenting it
as permission would break the actor model's attribution rule. But the opposite
error is just as damaging: requiring a fresh human decision **per dispatch** turns
the Chief into an officer who asks for permission on every errand, which is not
coordination.

The unit of authority is therefore **one Chief delegation**, not one decision per
dispatch. A Human hands the Chief a goal through a governed command; that creates
or draws on a structured delegation, and inside its bounds the Chief dispatches
autonomously. Each individual dispatch **references** that delegation's id and
revision — so every dispatch is attributable, auditable and revocable, without a
human being in the loop each time.

- **Free text is still not a grant.** A room operation that explicitly confirms
  the required fields may create or extend the delegation. Free text first
  becomes a structured proposal, and only a confirmed proposal becomes a
  delegation.
- The delegation records workspace, Team, `appointmentId` and revision, principal
  Human, the goal or scope it covers, capabilities, resource scope, budget, an
  expiry, and a maximum use count. It is the same shape as any other Delegation
  in `CONTEXT.md`: revocable, bounded, and never implied.
- **Every dispatch carries the delegation reference.** Starting, claiming,
  spawning a child session, retrying, or any other action with execution effect
  verifies in the state-change transaction that a live delegation covers it.
  Capability, Delegation, scope, Stop, lease, revision and idempotency checks all
  still run.
- Execution commands keep the **real** agent as author and cite the delegation.
  An agent-authored command is never written as a Human author.
- Missing, expired, scope-mismatched, exhausted and revoked cases each return a
  specific domain error.
- The Chief **may not widen its own delegation**. Widening is a Human command.

**The Human's levers are revision, not per-item approval.** They are deliberately
not "approve every dispatch":

| Lever | Effect |
| --- | --- |
| Hand the Chief a goal | creates or draws on the delegation; the Chief then executes autonomously against that goal |
| Revise the delegation | narrow capabilities, shrink scope, shorten the window; later dispatches are refused |
| Stop a session or work item | server-enforced; the Chief cannot resume it |
| Revise the work item | correct the Chief's own output |
| Revoke or replace the appointment | the Chief loses the ability to dispatch entirely |
| The two human gates | unchanged: a plan still needs confirmation and a diff still needs review |

A single shared guard covers `delegate_work_item`, `claim_work_item`,
`create_child_session`, retry and automation admission, so a check placed only in
`report_to_chief` or in an MCP wrapper can be bypassed through creation, child,
claim and automation entry points. The executing session is **persisted** as
carrying a Chief execution context, so a Chief session that outlives its
appointment or whose delegation was revoked cannot silently degrade into an
ordinary agent. Neither an arbitrary `decisions.status = 'final'` nor a
`room_message.intent = 'decide'` is treated as a delegation.

**Relation to ADR 0062 is a conjunction, not an isomorphism.** A Chief
delegation and an autonomy policy are two different authorisation layers, and
the earlier draft's claim that they are "the same kind of thing" was wrong.

> A **Chief delegation** decides who may initiate dispatch, against which goals,
> resources, capabilities and window. An **Approval autonomy policy** decides only
> whether a specific action that *still requires an Approval* may be approved by
> policy. Execution requires a valid delegation **and** every other identity,
> capability, scope, Stop, revision and lease check passing, **and** — when the
> action needs an Approval — a valid Approval bound to that action. Any one
> refusing refuses. The two are neither an OR nor a fallback.

ADR 0062 is explicit that a policy-authored decision satisfies an Approval only
*after* normal authorisation checks pass, and it cannot bypass delegation,
capability, scope or Stop. The consequence for implementers is the one that
matters: **a policy-approved record is never a credential for creating or
extending a delegation, and an existing delegation is never a reason to skip an
action's Approval.**

Creating or extending a Chief delegation goes through **one dedicated governed
command that requires a capable Human**. `requestApproval` may carry the request
and the notification, but it does not modify the grant. `source` preserves
provenance: a Human actor id appearing in a record is not evidence of a
human confirmation *for this dispatch*.

### The two execution gates are specified, not assumed

The two gates are protected state transitions with concrete bindings, not
"ask a human" in prose:

| | Confirm gate | Review gate |
| --- | --- | --- |
| Transition | plan version → implementation admitted | diff/head → work item accepted |
| Binding | the exact plan version presented | the exact diff or head hash |
| Decidable by | a Human, or a policy if ADR 0062 permits for this action | same |
| Invalidated by | any plan revision, delegation revision change, or scope change | any new head, new base, or new revision |
| Enforced | in the state-change transaction on the server | same |

If these gates are satisfied through ADR 0062-governed Approvals, they are
interpreted under that policy rather than asserted to be unconditionally human.
Where a deployment requires a real person even under YOLO, that is written as a
policy difference scoped to these two gates — not as a general claim that this
ADR changes nothing.

### Two ceilings, not one

The Chief's own authority and the authority it may hand to others are different
things, and conflating them would let a user overestimate the restraint of a
delegated goal.

| Ceiling | Contents | Default |
| --- | --- | --- |
| **Chief's direct capabilities** | what the Chief may do with its own hands | the six coordination capabilities; `repo:write_branch`, `repo:merge`, `artifact:write`, `repo:read`, `ci:run`, `deploy:*`, `secrets:use`, `automation:manage`, `admin:*` require separate approval |
| **Per-goal dispatch ceiling** | which roles, capabilities and resources the Chief may assign **within this goal** | confirmed once, by the Human, when the goal delegation is created |

Every autonomous dispatch computes:

```
effective = target agent's live grants
            ∩ this goal's dispatch ceiling
            ∩ this delegation's revision
```

A target that already holds `repo:merge` does not let a default Chief's
delegation borrow it. The tension is real and is resolved by writing both
defaults explicitly: a Chief that may not touch a repository itself would also
be unable to schedule ordinary code work if the downstream ceiling were always a
subset of its own, so **the two default tables are stated separately and are not
derived from one another**. Widening either ceiling is a separate audited Human
command. A free-text goal statement and the model's own judgement are never
grounds for widening it.

### Revocation has to reach derived work, not only the next dispatch

> Refusing later dispatches is not revocation. A standing delegation spans many
> commits, several executors and several asynchronous queues, so "the delegation
> is revocable" only means something once every derived permission inherits its
> live boundary.

| Situation | Rule |
| --- | --- |
| Revocation vs a concurrent new dispatch | both lock the same delegation revision; a committed revocation must make any **subsequently committed** dispatch fail. Expiry is judged at the final authorisation checkpoint against current time |
| Submitted, not yet started | re-check appointment, delegation and target revision at final admission; if unsatisfied, cancel the start and do not consume budget |
| Running executor, child session, retry | 持久保存来源委派 id/revision、任命代次和逻辑分派。任命结束/换届、撤销/到期或任一委派修订使旧 revision 的全部派生会话失去普通写入和平台管理外发资格，包括只读协调类和另批能力类；不自动降级、不把旧会话改挂新 revision。范围仍满足者可在新 revision 下重新准入 |
| Already inside an external process | only a cancel request is sent and the result recorded. WorkMesh does not claim retroactive withdrawal, and platform Stop does not by itself kill a harness command — that limit already stated here stands |
| After narrowing | the old revision must be re-read; work still inside the new range may resubmit autonomously without per-item approval |

If the product ever intends dispatched work to **survive independently**, that is
named as independent surviving authority, the interface must not describe it as
revoked, and it gets its own stop entry. Editing a Work Item description is never
read as widening the delegation, and never lets an in-flight old target continue.

### Usage is accounted per dispatch, not consumed per grant

A reusable delegation keeps a maximum use count and a budget, so it needs an
explicit accounting contract; the first draft deleted the counting rules along
with the per-dispatch grant and that was wrong.

- Every dispatch has a stable **logical dispatch identity** — its own record, not
  the delegation id. The delegation id and revision are the *authority source*;
  the dispatch identity is the *unit of accounting*.
- Remaining-count check, budget reservation or deduction, and the
  session/event/outbox rows all commit in **one transaction**.
- A replay under the same idempotency key does **not** deduct again.
- One dispatch reaching several entry points is counted once.
- 幂等重放、同一次逻辑分派的多个入口和外发 job 重放不重扣。显式 retry 若新建执行
  Session，必须建立新的逻辑分派，引用前次分派并重新检查当前授权，计一次新使用；不能借
  复用旧分派 id 隐藏新执行成本。建立排队 Session 时同事务预留次数和预算，余量扣除已
  使用及未释放的预留；真正启动时同事务转为已使用。启动前撤权/换届取消准入并释放未
  使用预留，记录取消事实；已开始的真实用量不退回。事务失败没有残留预留；进程重启按
  持久台账和 admission 状态对账，不按计时器盲目释放可能已启动的执行。
- Revising a delegation never silently zeroes usage already recorded.

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
  and activation results. A dispatch has its own stable **dispatch record**; its
  effects are de-duplicated by that record and its idempotency key, never by the
  delegation id - the delegation is the authority source, not the dispatch's
  identity.
- A session's input is a versioned, size-bounded derived summary plus the delta,
  traceable to its sources and never authoritative.
- `CURSOR_EXPIRED`, a consumer-version change, or an authorisation **expansion**
  triggers a bounded full rebuild. An authorisation **contraction** removes
  invisible data first.

**Incremental read is a capacity requirement with a measured budget, not a
correctness precondition, and bounded full rebuilds are permitted** for first run,
cursor expiry, authorisation change and repair. Any claim about how many agents
make this unusable is unverified and is not made.

### Inbox recovery across short sessions is audited re-delivery, not reuse

`inbox_items.claimed_by_session_id` is not merely documented as immutable: the
database refuses to change it. `prevent_inbox_claim_rebind()` raises
`INBOX_CLAIM_IMMUTABLE` whenever a claimed row's `claimed_by_session_id` or
`claimed_at` differs from its previous value
(`packages/db/migrations/0032_agent_inbox_receipts.sql:177-190`). ADR 0037 stated
the same intent as policy
(`docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md:99-102`: "adding one
requires a separate protocol and audit decision"). So the in-place transfer that
would have been the cheap option is not cheap, and dropping a shipped trigger to
enable it is not an implementation detail.

v1 therefore takes the second option: **audited re-delivery**, which **amends
ADR 0037**.

**The frame: a claim is not transferable ≠ a claim is not continuable.** A transfer
would make one row carry two attributions — the original Session's claim would read
as the successor's. Re-delivery keeps two rows. The original item, its claim, its
`claimed_at` and every receipt stay bound to the original Session forever, and the
new item is a **new durable fact** whose creation is itself auditable. Nothing
rewrites history; the audit can answer "who held this, and when" for both.

**What re-delivery does, concretely.** When an **actor-targeted** item is still
non-terminal and its claiming Session is terminally suppressed (Stopped, revoked,
or its claim's delegation withdrawn), a new eligible Session of the same Agent
actor may cause a successor item to be created:

- It **reuses the original `kind`**, so the Chief's existing dispatch surface and
  every client that already renders a kind are unchanged, and no `inbox_item_kind`
  value is added.
- It sets `source_type = 'inbox_redelivery'` and `source_id` to the **original
  item's id（直接前驱，首次恢复就是原件）**. `source_type` is `text`, not an enum
  (`packages/db/migrations/0005_stage1_tokens_webhooks_events.sql:35`), so this
  needs no `ALTER TYPE` — unlike the Team room subject, which does.
- That pair is also what makes re-delivery **idempotent by the existing
  constraint**: `inbox_items_actor_target_unique` covers
  `(workspace_id, recipient_actor_id, kind, source_type, source_id)` for
  actor-targeted rows (`0032:92-94`), so a retry collides on exactly one row per
  original item. A duplicate cannot be created by re-running the command, and the
  collision returns the existing successor instead of inserting a second one.

**What re-delivery is forbidden from doing.**

- 重新投递创建命令不得改写、移动或删除前驱、claim 或回执。后续真正完成根来源时，
  既有完成命令可同事务更新整条链的 status/resolved_at/revision 投影；不改变 claim、
  claimed_at 或任何历史回执。这不把重新投递创建本身伪装成 resolve。
- It may not transfer authority. The successor is claimable only under the same
  authority rules as any other item, and a re-delivery grants nothing: if the new
  Session lacks the scope, the item is created for the actor and simply not
  actionable by that Session.
- It may not carry receipts across. `enforce_inbox_receipt_scope()` only accepts a
  receipt from the item's exact recipient Session or its current claiming Session
  (`0032:192-220`), so a new Session's `claimed` receipt lands on the new item and
  the old one keeps its own.
- It is **not available for exact-session items.** `inbox_items_exact_claim_check`
  (`0032:83-84`) confines an exact-session item to that Session, and ADR 0037
  treats that confinement as deliberate. Re-delivering one would silently convert
  an exact address into an actor target, which is the back door this design must
  not open. Exact-session work is recovered by the Human, not by a successor.

**The cost, stated rather than waved away.** This **is** a second queue. A
successor item needs its own listing, its own claim, its own receipt history and a
way for a Human to see that it is a successor rather than duplicate work — the link
is visible to authorized Humans precisely so the board does not show the same task
twice with no explanation. It is also the reason a successor is a *new* item rather
than a status change on the old one: `inbox_item_status` is `('open','resolved')`
(`0005:5`) with `CHECK((status='resolved') = (resolved_at IS NOT NULL))`, and
resolving the original would erase the very "still unfinished" fact the successor
exists to record.

Not claimed: no reuse path is forbidden in principle, and no measurement of which
choice is cheaper at scale has been made. The reuse option is rejected below on
design grounds, not on a benchmark.

This amends ADR 0037's stated position that stranded items stay stranded with "no
reclaim or release command"
(`docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md:99-102`). The amendment
is narrow: the claim remains a one-time, immutable, non-authorizing binding, and no
reclaim or release command is added. What is added is a separate, audited act of
**continuing the work as a new input**, which ADR 0037 explicitly required to be
preceded by a protocol and audit decision — this section is that decision.

#### 恢复链身份、资格与提交协议（F3/F4/F5/F6 共用）

R1 冻结契约，#26 F3 负责激活输入/结果接口，#27 F4 负责 checkpoint 原子提交接口，
#28 F5 负责 Inbox 底层恢复及完成收敛，#29 F6 负责最终联合验收。F5 的底层验收使用现有
Inbox fixtures，不依赖 F6；F6 使用已验收的 F3/F4/F5，不倒置上游依赖。

- 逻辑根为持久 Inbox/source 关联：沿 `source_type='inbox_redelivery'` 的 `source_id`
  追溯直接前驱到首条输入。创建后继时必须保留根来源资源、原收件 actor 和可空的
  `source_room_message_id`；不可把新 input ID 当成新业务请求。链必须同 workspace/
  recipient/kind，服务端验证并禁止环；不能把所有来源硬当 room message。
- 同一前驱的一次恢复意图由既有 actor-target unique 键规范化，重复调用返回同一
  successor；后继将来另一次被终止后，才能以该后继作为前驱创建下一输入。调用者请求
  摘要仍受命令幂等绑定，同 key 异体冲突。锁根来源，再锁前驱/当前授权与任命，统一锁序；
  唯一键不是授权，也不能代替根已解决、recipient、Stop、撤权和换届检查。
- 根非终态、前驱当前获胜 Session 终止、actor-targeted 且请求者当前有权才可恢复；
  exact-session 禁止。恢复创建不 claim、不 ACK、不创建 Session、不主动解除 Stop。
  F3 按根来源与任命代次保留 Stop 抑制，新后继 ID 不能清除同一输入的禁止激活；只有
  有权 Human 的新操作或新获授权任命下重新评估的准入，才可能形成新的合法激活。
- 有 `source_room_message_id` 的链复用唯一 message resolution。Inbox reply、Work Room
  answer、Human resolve 三条完成路径竞争同一个根的最终 resolution，并同事务收敛原件
  和全部后继的 actionable status、事件和 outbox。根已解决后禁止创建/claim/再次回复
  后继；重复完成返回既有结果或明确冲突，不产生两个最终响应。其他 kind 仍由各自既有
  Approval/Handoff/Lease 等源命令完成；ACK 不替代它们，不添加新的决定入口。
- F4 的已处理至 C 与本批已提交激活/恢复结果引用同事务关联；分派有独立逻辑身份去重。
  F6 report 仅返回已提交 message/inbox/activation 引用及当时已知状态，不等模型、不
  伪造回执。联合测试覆盖根/前驱并发恢复、三种完成路径并发回复、恢复及 checkpoint
  提交前后崩溃、Stop、撤权、换届、exact-session 拒绝和重放。

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
| Publish and dispatch a task | `work:write` command citing the live Chief delegation | **autonomous inside the delegation** — no per-item human decision; every dispatch is attributable and revocable by that delegation |
| Correct its own earlier output | `work:write` with revision | it may **not** reassign a Work Item's Responsible Human; that stays a Human-only act |
| Change the goal it was handed | a Human revises the delegation or the work item | the Chief cannot reinterpret a goal into a wider one; scope changes are Human commands |
| Request authority it lacks | `requestApproval`, which already exists in the MCP, SDK and tool surface | only a Human can grant; the Chief cannot self-widen its delegation |
| Re-order or re-route | the delegation first, then a lease, then routing records | a Lease is a coordination claim and grants nothing (ADR 0013); force-release stays Human with a reason |

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
- **Recover a stranded item by reusing one non-terminal Chief session until the
  item is done.** Rejected: it makes the session's lifetime a function of the
  slowest outstanding task, and it re-introduces exactly the situation stop and
  revocation exist to prevent — a live-looking session holding work that no
  current authorisation covers. A long-lived session also makes "stale" and "idle
  but still legitimate" indistinguishable. Re-delivery keeps each attempt inside a
  session whose authorisation is checked at the moment it acts.
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
extension, an appointment table, two tools, a Chief delegation with its dispatch
records and usage ledger, one admission path, and one consumption protocol.

The costs are accepted deliberately. The Chief is the most expensive reader in
the system, so the consumption protocol is the largest single piece of work and
is quantified rather than assumed. A single active appointment is a
single-writer point for judgement; it does not serialise reasoning, and
coordination work may be split by Team without forcing a user to split their
business to scale. 收件恢复已裁定为有审计的重新投递；剩余工作是按上述共同契约实现和
验收，不再把已回答的选择列为开工前二选一。

This ADR adds no authority a Human does not already hold. It reorganises who
exercises it — one Human grants a goal-scoped delegation instead of approving
each errand — and it makes that grant as auditable and revocable as any other
Delegation. It is parallel to ADR 0062's autonomy policies rather than a change
to one.

## Migration

以下增量迁移责任不改已应用 migration；最终 entry 数量由消费、授权和持久关联的契约确定，
不把四类责任硬写成四个 entry。F4 checkpoint 存储与结果原子关联由 F4 自己的增量迁移承担。

1. A new v1 migration entry adds the enum value and does not use it. PostgreSQL
   permits `ADD VALUE` inside a transaction but the value is unusable until that
   transaction commits, so the enum extension and everything that references
   `'team'::room_subject_kind` live in **separate** entries. Each entry is
   transaction-managed by the runner; no `BEGIN` or `COMMIT` is written in the
   file.
2. F0 的后续 entry 仅替换 `CHECK` 和 `enforce_room_subject()` 的 Team 分支；F1 在
   F0 之后以独立增量迁移创建 `chief_appointments` 及部分唯一索引。任命事务负责建房、
   任命状态、事件和 outbox 原子提交，不把 F1 的交付塞回 F0 验收。
3. Further entries add the Chief delegation, its dispatch records and usage
   ledger, and **no** storage change for the Inbox claim: re-delivery reuses
   `inbox_items` as it stands, with `source_type = 'inbox_redelivery'` and
   `source_id` set to the original item id. `inbox_claim_immutable`,
   `inbox_items_exact_claim_check`, `inbox_items_claim_pair_check`,
   `inbox_items_recipient_kind_shape_check` and `enforce_inbox_receipt_scope()`
   are **left exactly as they are**, and `inbox_item_kind` gains no value. The
   only index the design leans on is the existing
   `inbox_items_actor_target_unique`, which is what makes retry idempotent.
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
  revocable Human act, one per Team, granting nothing), **Chief delegation**
  (a standing, bounded, revocable grant that a human message is not), **Dispatch
  record** (the per-dispatch accounting and effect-de-duplication identity),
  and **Agent memory** (provenance-bearing, non-authoritative, filtered by the
  reading session's permissions, deferred from the first version).
- `OPENAPI.yaml` declares the appointment and delegation commands, dispatch
  records with their usage and exhaustion errors, `get_chief` as a Query, and
  `report_to_chief` as a Command, together with the four routing failure codes.
  It declares no per-dispatch authorisation binding, because none exists.
- `AGENTS.md` states that a Team has at most one Chief, that the appointment
  grants no capability, that a Chief dispatches autonomously **inside a
  revocable delegation** rather than per approved decision, that the Human's
  levers are revision and revocation, and that a Chief may not replace a
  Responsible Human.
- `AGENT_PROTOCOL.md` gains the delegation-scoped dispatch rule, the authority-layer
  ordering between the harness and the platform, and the statement that a memory
  is not a standing instruction and is never written from tool output
  automatically.
- `ADR 0037` is amended rather than rewritten: its Consequences section keeps
  "the one-time claim is intentionally immutable" and "there is no reclaim or
  release command" **verbatim**, and gains a short amendment note pointing here
  for the audited re-delivery that allows a successor item. No claim column,
  trigger or check is described as changed.
- `docs/plan/` gains the staged plan. The Inbox recovery choice is **no longer a
  gate** — it is decided above — so the gate that remains on the first Chief
  projection is the consumption protocol.

