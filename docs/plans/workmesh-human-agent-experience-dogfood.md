# WorkMesh Human/Agent Experience Dogfooding Program

Status: TaskGraph v2 repair proposed; v1 execution preserved at sequence 57  
Planning baseline: `origin/main@4ca6d34` (2026-08-09)  
Practice project: `WorkMesh Human Experience — Kaneo UI Adoption`

## 1. Objective

Use the Kaneo UI adoption project as WorkMesh's first sustained self-hosting program:

- Humans plan, inspect, approve, resolve conflicts, and understand progress through Web UI.
- Agents discover scope, create and update work, communicate, publish evidence, and resume safely through MCP.
- Every gap found while executing the project becomes a traceable WorkMesh work item, is repaired through the same control plane, and is independently verified before the blocked path resumes.
- Web and MCP remain adapters over the same contracts and server authority. Neither surface may invent state or bypass identity, delegation, revision, idempotency, approval, lease, Stop, event/outbox, or durable-cursor rules.

The proposed repaired graph is [`docs/workgraphs/workmesh-human-agent-experience-dogfood-v2.yaml`](../workgraphs/workmesh-human-agent-experience-dogfood-v2.yaml). The v1 graph and sequence-57 ExecutionState remain immutable evidence until the owner approves a versioned state migration.

## 2. Evidence baseline

### 2.1 MCP findings from the attempted migration

1. `verify_connection` and `get_current_identity` reported an executing Coordination Session and Team-scoped capabilities, while ordinary reads and heartbeat calls failed. The discovery response therefore described intended authority, not usable live authority.
2. `assertReadableTeam` on the current GA baseline requires an Agent Session to be bound to a Work Item or Project. A Team-scoped Coordination Session intentionally has neither, so `list_teams` returns no usable Team and `list_workflow_states` fails with `RESOURCE_SCOPE_DENIED`.
3. `create_project` succeeded while `get_project` and `list_projects` could not read the result. Read and write authorization are therefore not symmetric for a Coordinator, and an Agent cannot verify idempotent completion after a lost response.
4. `resolveCoordinationIdentity` renews `agent_coordination_sessions`, but several ordinary mutation guards still require an unexpired row in `agent_session_tokens`. This creates two incompatible credential models inside one request path and explains `UNAUTHENTICATED`/`SESSION_NOT_ACTIVE` failures after discovery succeeded.
5. The MCP tool surface requires UUIDs and a workflow `statusId` before creating work. The ADR promises name/identifier resolution, but the current tool schemas do not provide it.
6. WorkMesh already has Project Milestones and `work_items.milestone_id` in REST/contracts, but MCP cannot list, create, or assign milestones. It also lacks native Work Item parent/child and blocker/dependency relations, so the Linear source hierarchy cannot be represented faithfully.
7. The migration has no server-side prepare/apply import workflow, deterministic mapping report, or dry-run. A caller must orchestrate many ordinary mutations and has no atomic, resumable import checkpoint.

The partial target Project created during the failed attempt is `8eb8663b-be1f-489e-b4b2-9fde774ebb5a`. It must be reconciled by source provenance before any retry; it must not be blindly duplicated.

### 2.2 Web findings and evidence limits

The latest source baseline still concentrates the main human workflow in one large `apps/web/app/page.tsx` and one global `styles.css`. Team administration, project creation, issue creation, filters, list/board, project overview, and the Work Item drawer compete in the same shell. This makes the implementation hard to evolve and exposes infrequent administration alongside daily work.

The deployed site redirected the current audit session to `/login`. The login DOM had labeled Email and Password fields and a Sign in button, but screenshot capture timed out and no authenticated Human session was available. Therefore this is not a completed visual audit. Authenticated screenshots, keyboard behavior, focus order, responsive reflow, contrast, and assistive-technology semantics remain mandatory evidence in node `capture-human-flow-baseline`.

### 2.3 Source-of-truth rule

- Execution branches start from the then-current `origin/main`, never from this worktree's stale local `main`.
- `OPENAPI.yaml`, `packages/contracts`, domain commands, migrations, and ADRs define behavior.
- Runtime MCP/Web results, durable events, local CI, and saved screenshots are acceptance evidence.
- A green narrow test does not overrule a contradictory black-box journey.

### 2.4 Practice finding: accepted components are not yet an actual service

The first real Linear-to-WorkMesh migration retry exposed a missing delivery boundary after the v1 component Gates:

1. The independently accepted MCP, planning, and Web changes remain split across isolated uncommitted worktrees. No single release manifest proves that all accepted changes build and run together.
2. The configured remote MCP passes `initialize`, `tools/list`, `verify_connection`, and identity discovery, but it still exposes the pre-import toolset. `get_workmesh_context`, `prepare_project_import`, and `apply_project_import` are absent.
3. The configured credential reports one Team ID in its capability scope while `list_teams` returns zero; direct workflow-state and Work Item reads return `RESOURCE_SCOPE_DENIED`. It behaves like an ordinary resource-anchored Agent Session, not the Team-bound Coordination Connection required for project management.
4. The attempt stopped before any WorkMesh write. The immutable Linear source snapshot contains 1 Project, 6 Milestones, 14 Issues, and 13 blocking relations; the failure transcript is `artifacts/migration/kaneo-import-preflight.json`.

Therefore v2 adds an explicit chain between component Gates and dogfood writes: integrate one candidate, independently verify the exact built artifact, obtain a Human activation decision, activate it on a dedicated reversible dogfood target, issue a fresh Team-bound Connection, and independently verify the actual live MCP before import. A local test or component Gate can no longer stand in for a live-service claim.

## 3. Product principles

### Human-friendly Web

- Default to recognition over configuration: show Projects, current work, blockers, approvals, and Agent activity before administrative forms.
- Give Project, Work Item, Agent Session, and Work Room stable navigable pages. Use a drawer only for quick inspection.
- Keep responsible Human, delegated Agents, workflow status, and Agent Session state visibly separate.
- Make optimistic-concurrency conflicts recoverable: show the server version, the user's draft, and explicit reapply/discard choices.
- Every critical flow has Loading, Empty, Error, Forbidden, Conflict, Expired, and Offline/Reconnecting states.
- Keyboard and non-drag alternatives are first-class. Target WCAG 2.2 AA at 360 px, 768 px, and 1440 px widths.

### Agent-friendly MCP

- A long-lived Connection must transparently mint or renew short-lived Coordination Sessions. Agents never manage executor session tokens for Team coordination.
- Discovery must return live, internally consistent facts. If authority is unusable, `verify_connection` fails with one actionable remediation instead of returning a healthy manifest.
- Ordinary tools accept stable human identifiers (`teamKey`, `project slug`, `WM-123`) as well as UUIDs and return both.
- A single bootstrap call returns identity, Team, workflow states, feature versions, cursor checkpoint, and allowed operations.
- Mutations have deterministic idempotency, explicit revision requirements, actionable structured errors, and read-after-write visibility.
- Planning parity includes Project, Milestone, Work Item hierarchy, blocker/related relations, Project update drafts, Work Room messages, and durable event consumption.
- Large imports use `prepare_project_import` and `apply_project_import`: validate first, return a content hash and normalized plan, then apply idempotently and return a complete source-to-target map. No destructive operation is implied.

## 4. Acceptance scorecard

### Agent journey

1. A Connection runs a 24-hour soak with a request every 10 minutes and crosses at least two Coordination Session renewals without changing client configuration.
2. Rotation overlaps safely; confirmation revokes only the old credential; revoke takes effect on the next request.
3. Bootstrap needs at most three MCP calls and returns a usable Team and default workflow state.
4. Replaying the same import and ordinary mutation keys creates no duplicates and returns the same target mapping.
5. A stale revision returns `REVISION_CONFLICT` with current revision and refetch/rebase guidance.
6. The full Kaneo source shape—1 Project, 6 Milestones, 14 source Issues, hierarchy, blockers, labels, priorities, descriptions, and provenance—is representable without encoding relations only in prose.
7. Durable events resume from the last persisted cursor after MCP process restart and contain the same actor/resource identity shown in Web.

### Human journey

1. A signed-in Human can find the Kaneo Project, understand health/milestones/blockers, and open the next actionable work item without exposing Team administration.
2. Project List/Roadmap, Backlog, Board, Work Item full page, Work Room, Inbox/Approvals, and Agent Connection diagnostics have saved desktop and narrow-screen screenshots.
3. Create/edit/move/comment/approve/conflict-recovery flows pass keyboard-only E2E; drag-and-drop has a visible non-drag alternative.
4. Automated accessibility checks plus manual focus, reading order, zoom/reflow, contrast, and announcement checks meet the recorded WCAG 2.2 AA baseline.
5. MCP failures are visible to Humans as Connection health with last successful call, current session/renewal state, safe remediation, and correlation ID—never the secret.

### Cross-surface journey

1. An MCP mutation becomes visible in Web through durable SSE with Agent and principal-Human attribution.
2. A Human Web mutation appears in MCP event replay with the same revision and identifiers.
3. Project counts, Milestone assignment, hierarchy, blockers, workflow state, and responsible Human agree across REST, MCP, Web, and database constraints.
4. Human-only actions remain unavailable to Agents even if an MCP tool is accidentally registered.

## 5. Delivery sequence and gates

### Gate A — GA baseline and execution authority

- Fast-forward or create a clean worktree from the current `origin/main`.
- Reproduce each migration failure with black-box MCP tests before changing behavior.
- Approve schema changes for Work Item hierarchy/relations and the import contract.

### Phase P0 — Make Coordination MCP truthful and durable

- Unify Coordination identity/credential validation so every request uses the Connection credential to derive and renew one live Team-scoped session.
- Add a dedicated Team-scoped read predicate; do not weaken executor Work Item/Project scoping.
- Make read-after-write and event replay part of the same conformance suite.
- `verify_connection` must execute a live authorization probe, report expiry/renewal state, and fail closed on inconsistency.

Exit gate: the Agent control-plane journey passes, including expiry, rotation, revoke, read/write parity, pagination, idempotency, revision conflict, and durable cursor restart.

### Phase P1 — Add project-planning parity for Agents

- Expose existing Milestone capabilities through contracts/SDK/MCP.
- Add first-class Work Item parent/child and typed relations (`blocks`, `blocked_by`, `related`) with constraints, events, migration, REST, MCP, and Web projections.
- Add identifier resolution and one bootstrap context tool.
- Add prepare/apply import with content-hash replay and a persisted mapping report.

Exit gate: a dry-run proves the exact Kaneo source shape is representable; the apply path is idempotent and produces no orphan relations.

### Phase P1.5 — Assemble, verify, and activate one exact dogfood service

- Classify v1 evidence as reusable, invalidated, superseded, or requiring live re-verification; pin every artifact and source hash.
- Integrate the accepted Coordination, authorization, planning, Agent MCP, and Human Web changes onto the pinned `origin/main` in one isolated release-candidate workspace.
- Build API, MCP, Web, Worker, migrations, and public contracts from one manifest. Run clean/upgrade migrations, restart recovery, public MCP import replay, authority negatives, and authenticated responsive Human journeys against the assembled build.
- Before any target or credential change, present an exact activation/rollback packet for Human approval. The packet binds candidate hash, target, data boundary, exposure, spend, migration, credential reference, revoke path, and rollback.
- Activate only on a dedicated reversible dogfood target. Create a new Team-bound Agent Connection and keep its secret only in the approved environment store.
- From a clean client, compare candidate, build, and runtime fingerprints; require one usable Team, default workflow state, complete tools/schema inventory, structured remediation, durable cursor, and side-effect-free Kaneo prepare.

Exit gate: the actual target—not a fixture or component branch—returns a deterministic 1/6/14/13 prepare plan and passes live identity, scope, lifecycle, restart, and read-after-write checks without REST, database, Web-session, UUID-preseed, or executor-token fallback.

### Phase P2 — Establish the Human Experience foundation

- Split the monolithic page into an application shell and feature-owned routes/view models.
- Move Team administration into Settings; add command palette/global search and consistent feedback states.
- Establish `packages/ui` tokens and accessible headless/presentational primitives without API calls.

Exit gate: authenticated baseline and redesigned shell are compared at identical viewports; keyboard navigation and responsive checks pass.

### Phase P3 — Build Project and Work surfaces, then migrate

- Deliver Project overview/roadmap, Milestones, dependency/hierarchy views, List/Board/Backlog, filters/saved views, and Work Item quick/full views.
- After the P1.5 live Gate, reconcile the partial Project by immutable Linear provenance, then import all Linear records through the actual MCP target.
- Store immutable source provenance and the import mapping in WorkMesh.

Exit gate: source/target counts and relations match; replay changes nothing; every target is readable through MCP and Web.

### Phase P4 — Collaboration, Agent observability, and diagnostics

- Complete Work Room, Inbox, approvals, handoffs, artifacts, plans, activities, and Agent Session presentation.
- Add Human-facing Connection diagnostics and Agent-facing structured remediation errors.

Exit gate: a Human can diagnose and repair a simulated expired/revoked/mis-scoped Connection without handling a session token.

### Phase P5 — Execute the Kaneo project as the dogfood loop

For every original execution item:

1. Claim/start from WorkMesh.
2. Publish the implementation plan and evidence through MCP.
3. Review in Web; keep Human gates for scope, security, production, destructive, or irreversible actions.
4. If practice reveals a gap, create a `dogfood-gap` Work Item linked to the discovering item and classify it as `human-web`, `agent-mcp`, `cross-surface`, or `operations`. Pause only the affected subgraph, capture failing-before evidence, repair it with bounded attempts, independently verify it, then resume.
5. Publish a weekly Project update containing passed journeys, new gaps, repaired gaps, remaining blockers, and current conformance score.

Exit gate: all Kaneo delivery work and every blocking dogfood gap are accepted; an independent gap-closure Gate confirms that no gap was silently deleted or closed without a regression; WorkMesh—not Linear—is the active control plane.

## 6. Mapping to the existing Kaneo roadmap

| Existing source | Keep | Added responsibility |
| --- | --- | --- |
| DAR-455 Activation Gate | Yes | Add MCP conformance Gate A and authenticated Web evidence gate. |
| DAR-456 Epic | Yes | Becomes the umbrella for the dogfood program. |
| DAR-457 M0.1 | Yes | Re-audit upstream and freeze source provenance. |
| DAR-458 M0.2 | Yes | Freeze feature architecture plus MCP/Web parity contracts. |
| DAR-459 M1.1 | Yes | UI tokens, primitives, shell, feedback states. |
| DAR-460 M1.2 | Yes | Command palette, navigation, global search, keyboard model. |
| DAR-461 M2.1 | Yes | List/Board/Backlog, filters, saved views, accessible move. |
| DAR-462 M2.2 | Yes | Quick view/full page, hierarchy, blockers, Human/Agent separation. |
| DAR-463 M3.1 | Yes | Rich text, comments, artifacts and provenance. |
| DAR-464 M3.2 | Yes | Work Room, Inbox, approvals, handoffs, notifications. |
| DAR-465 M4.1 | Expand | Connection lifecycle, MCP bootstrap/import/diagnostics and conformance harness. |
| DAR-466 M4.2 | Yes | Integrations, self-host install, health and recovery. |
| DAR-467 M5.1 | Yes | Typed i18n, WCAG 2.2 AA, responsive and terminology. |
| DAR-468 M5.2 | Expand | Cross-surface contract, performance, visual, license, drift and 24-hour MCP soak gates. |

New P0/P1 Work Items must be created before DAR-457 begins: Coordination credential unification, Team-scope authorization parity, planning domain parity, ergonomic MCP bootstrap/import, MCP conformance harness, and authenticated Human flow baseline.

## 7. Dogfood gap contract

Every discovered gap records:

- `discoveredDuringWorkItemId`, surface (`mcp`, `web`, `cross-surface`, `operations`), severity, reproducible journey, correlation IDs, affected contract/version, and screenshot/log/test evidence.
- Whether it blocks the current node or only informs later work.
- A repair acceptance test that fails before the fix and passes afterward.
- Supersession or duplicate links; never silently delete historical evidence.

Stop conditions:

- Stop the affected branch on authority ambiguity, data loss/duplication, secret exposure, irreversible action without approval, or three failed repair attempts.
- Do not stop unrelated branches for a visual polish defect.
- No-progress after two weekly rounds triggers a Human scope/priority review.

## 8. Immediate next handoff

1. Review and approve TaskGraph v2 as a versioned repair; do not mutate the v1 graph or pretend its blocked import passed.
2. Migrate only exact reusable v1 PASS evidence into a new v2 ExecutionState and run `freeze-v2-live-gap-baseline` first.
3. Assemble and independently verify the release candidate locally. This remains reversible and does not authorize commit, merge, deployment, credential issue, or production use.
4. Stop at `approve-dogfood-target-activation` with the exact candidate Gate and activation/rollback packet. Only an explicit Human decision may unlock the dedicated target and Team-bound Connection.
5. After live MCP and Human journey Gates pass, import the immutable Linear snapshot and execute the Kaneo Project entirely through WorkMesh. Linear remains read-only provenance; WorkMesh becomes authoritative only after the final control-plane adoption Gate.

Security scanning remains skipped by explicit Human direction for this run. Functional authority regression evidence is still mandatory, but no node may label it a security approval.
