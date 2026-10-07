# Workspace configuration readiness check and the first-run surface

Status

Proposed

Context

WorkMesh already owns every individual step a new operator must take. An
administrator is created once through the authenticated bootstrap credential
(ADR 0031). An Agent is enrolled through a policy or bound to a client through a
connection. A model is configured through `LlmConnection`
(`apps/api/src/workbench-llm-connections.ts`). A project attaches a repository.
Each is correctly governed and each is reachable from the browser.

Nothing states the workspace as a whole. A freshly installed deployment is
indistinguishable from a working one at the level a new operator cares about. The
failure is not an error; it is a correct product that is silent about being
unconfigured.

A tempting fix is a four-fact "can this team run?" gate — a runner, a model, an
agent, a project. Reading the code before proposing it shows that **three of the
four facts are not observable today**, and that the fourth does not mean what the
gate would need it to mean:

**There is no idle-runner liveness fact.** A runner heartbeats only while it has
an assigned Agent Session; with no assignment it never enters the heartbeat loop
(`apps/agent-runner/src/run-session.ts:332-357`), and
`workbench/runner/assignments` reads existing Session, Delegation, and grant rows
rather than a runner registration (`apps/api/src/workbench-runner.ts:88-109`). The
heartbeat lives on the Agent Session (`packages/db/src/schema.ts:321-324`), and a
`RunnerAttempt` is the state of one turn, not a liveness registration. A gate that
required a live runner would therefore report "runner not ready" on every fresh
install forever, and the only way to clear it would be to run work first — which
is the exact inversion a first-run surface must not have. Treating a Session
heartbeat as runner process liveness would be a false signal in the other
direction.

**The model condition is narrower than "a model exists".** Model-backed commands
require `connection.status = 'active'` **and** `model.enabled = true`
(`apps/api/src/workbench-conversations.ts:150-166`).

**An active agent is not a usable one.** It still needs a matching Delegation and
Session to do anything, which is a property of a future command rather than of the
workspace's configuration.

**A project is not a precondition for work.** Projects scope repository-backed
work; non-repository work is legitimate (ADR 0004, ADR 0024,
`AGENT_PROTOCOL.md:1746-1756`). Gating a whole workspace on a repository would
permanently mark a valid non-repository team as blocked.

The reference product makes the dependency visible instead: a banner whose entire
content is the remaining setup items, each linking to the page that resolves it,
above an empty state offering three natural-language starting points.

The self-hosted class raises the stakes. ADR 0071 and ADR 0072 are **Proposed,
not implemented**, and a Lite operator has no colleague to notice that half the
setup is missing and no release process that would have caught it.

Decision

WorkMesh gains a **configuration readiness projection** for a Team and a
first-run surface that renders it. The projection is derived, never stored, and
it makes no claim about execution capability.

### Three evidence classes, never conflated

The projection reports, per check, one of three states, and the distinction is
the whole point:

| Class | Question | Example |
| --- | --- | --- |
| `ready` | is this configured, and is the configuration internally consistent? | an `LlmConnection` is `active` and has at least one `enabled` model |
| `blocked` | is a prerequisite definitely absent, for this caller? | no Agent definition is visible to this caller in this Team |
| `unknown` | does WorkMesh have the evidence to answer, at all? | runner liveness, because no such fact exists outside an assigned session |

A check that cannot be answered is `unknown`, never `blocked`. An operator is told
the difference, because "you have not configured a runner" and "we cannot tell
whether a runner is online" call for different actions, and conflating them would
send a correct operator to configure something that is already configured.

Each check is scoped to a **caller and a Team**, because readiness is not a
workspace-wide property: a personal model is visible to its owner and invisible
to a teammate, and a Team-scoped Agent is not visible from another Team.

### The v1 check set, and the one thing deliberately missing

| Check | v1 state | Source |
| --- | --- | --- |
| Model | `ready` / `blocked` | `LlmConnection.status = 'active'` and at least one `enabled` model, within caller visibility |
| Team | `ready` / `blocked` | at least one visible, active Agent definition |
| Repository-backed work | `ready` / `blocked` / `not_applicable` | at least one Project with an attached repository and base branch, **and** only surfaced when the workbench context is repository-backed |
| Runner liveness | `unknown` in v1 | no fact exists; a durable runner registration and heartbeat is a **separate** task, and this ADR withdraws the zero-migration claim for that reason only if that task is taken |

`not_applicable` is a distinct outcome from `ready` and from `blocked`: a team
doing non-repository work is not misconfigured, and a check that cannot apply
must not render as a failure.

### The gate is advisory in the domain and binding in the interface

A `blocked` projection changes no command's authorization. An operator with a
runner and a model can still create a Work Item, and the domain still refuses a
delegation that lacks a runner exactly as it does today. The projection makes the
dependency legible; it is not a second authorization path, and it never becomes a
run permit. `CONTEXT.md`'s View Model rule already says a projection is not a
source of domain authority, and this is that rule applied.

The interface treats it as binding: unmet checks render as an ordered list in the
workbench conversation area, one row per check, each row a link to the page that
resolves it, ordered by dependency depth so the deepest prerequisite is first. An
empty state grows a primary action **only** when the corresponding check is
unmet. A Project list that is empty in an otherwise configured workspace stays a
plain empty state.

The links are the existing canonical routes. No new setup shell, no second
navigation authority, and Back/Forward and focus behaviour are unchanged
(ADR 0059, ADR 0064).

### One surface, not a wizard

No step order, no "step 2 of 4", no stored acknowledgement, no `seen` record. A
wizard is a second information architecture that can disagree with the first and
strands anyone who arrived by another route. The list is order-derived but not
order-enforced: resolve the Project first and the list simply shows fewer items.

Starting prompts under an empty composer are **fixed copy in the existing i18n
bundle**, not a workspace-editable setting. An editable setting would need its
own command, permission, revision, idempotency, and event, and inventing that is
out of scope for a first-run surface; a deployment that wants different copy
forks the string. An earlier draft of this ADR proposed a workspace-level
editable setting and a preset aggregate with a write path; both were withdrawn
because no write contract was defined for them.

## Alternatives

- **A four-fact "can this team run" gate.** Rejected: three of the four facts are
  not observable today, so the gate would report a permanently false negative on
  every fresh install and would make running work the price of learning what is
  missing.
- **A stored `activated_at` timestamp.** Rejected: it drifts. Revoking the only
  model, archiving the only agent, or changing the default repository would leave
  a stale claim that the workspace works. The projection is cheap and cannot lie.
- **Report runner liveness from the Agent Session heartbeat.** Rejected: a
  session heartbeat is evidence about a turn, not about an idle process. It would
  be wrong in the direction that matters, showing a runner as ready when nothing
  is running.
- **Client-side derivation.** Rejected: the client cannot see credential status or
  capability approval, and a readiness answer that is wrong on a stale tab is
  worse than none.
- **Enforcing the gate in the domain as a new precondition.** Rejected: it would
  create two sources of truth for the same fact. The existing refusals are already
  correct and already tested.
- **A dismissible banner with a stored acknowledgement.** Rejected: dismissal
  turns a fact into a preference, and there is no safe per-operator preference
  store for it here.
- **A mandatory setup wizard.** Rejected: duplicates the real information
  architecture and cannot be recovered from when reality diverges.
- **Workspace-editable starting prompts, versioned now.** Deferred, not rejected:
  it is a reasonable product idea that needs its own command and permission
  design. It is not a first-run surface concern.

## Consequences

A new Lite operator learns what is missing, in dependency order, before their
first confusing command rather than after it, and is explicitly told when the
platform does not know rather than being given a confident wrong answer.

The cost is a read model with real obligations: it must stay consistent with the
underlying resource types, respect their visibility rules, and distinguish
`unknown` from `blocked` correctly, which is the failure mode a future
implementer is most likely to get wrong. Because the projection is advisory, a
bug in it produces a misleading banner and never an authorization failure, which
is the correct failure direction.

The honest limitation is in the product, not the design: **WorkMesh cannot tell a
new operator whether a runner is online**, and this ADR does not pretend
otherwise. A durable runner registration and heartbeat, distinct from Session
heartbeat, is the change that would let that check become real, and it carries a
migration, so it is named as follow-up work rather than assumed.

The code-fact audit for this premise is recorded in the [activation plan's P1
evidence ledger](../plan/2026-10-07-activation-onboarding-and-china-ecosystem.md).
The current runner loop sends heartbeats only after resolving a Session
assignment (`apps/agent-runner/src/run-session.ts:331-357`), the assignments route
queries Session/Delegation/grant rows (`apps/api/src/workbench-runner.ts:88-109`),
and heartbeat columns live on `agent_sessions` (`packages/db/src/schema.ts:316-324`).

## Migration

No database migration, no backfill, and no new table. Every fact the projection
reads already exists in the current schema, and the `unknown` result for runner
liveness is precisely what lets that stay true.

The new read model is additive: the API gains a route, the web application gains a
component, and the route-policy manifest gains a row, regenerated with
`pnpm generate:route-policy` (`scripts/generate-route-policy-artifacts.mts`)
rather than hand-edited. The only visible change for an already-configured
workspace is one additional query per workbench load, which the existing
read-model path can absorb or the workbench can fetch lazily on first render.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` and
`pnpm test:e2e` must stay green, and `scripts/validate-ci.mjs` must not need an
exemption. Any statement added to the agent lock inventory is regenerated with
`UPDATE_AGENT_LOCK_MANIFEST=1` and reviewed per statement — not diffed for line
numbers alone, because `statementId` covers the owner and a canonical SQL hash
(`packages/db/src/agent-lock-order-inventory.test.ts:141-167,373-392`).

## Spec changes

- `OPENAPI.yaml` declares the readiness route, its three states per check
  (`ready` / `blocked` / `unknown`, plus `not_applicable`), and the fact that it
  is a query with no write counterpart.
- `CONTEXT.md` gains **Configuration readiness** as a derived View Model,
  explicitly not an authorization input and not a run permit.
- `AGENT_PROTOCOL.md` gains a pointer from the "a session needs an online runner
  and a model" requirement to this projection, so the protocol document and the
  interface stop describing the dependency two different ways.
- `docs/plan/` gains the implementation plan, with the visibility-scoping and
  `unknown`-versus-`blocked` cases called out explicitly.
