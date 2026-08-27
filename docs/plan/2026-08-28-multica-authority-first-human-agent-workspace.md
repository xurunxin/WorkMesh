# Multica-inspired authority-first Human-Agent workspace

Spec: `docs/adr/0063-multica-inspired-authority-first-human-agent-workspace.md`

Remote control plane: WorkMesh Project
`0691b1ff-2361-4b45-8d7c-1e3432a3b1ef`, Milestone
`b4fcfeeb-066a-459e-85ae-4baca8949dd2`, GEN-504 through GEN-511.

## M6.0 Baseline, ADR, plan, and control-plane calibration

Create an isolated worktree from the deployed `origin/main`, preserve the dirty
root checkout, publish this ADR/plan and the matching WorkMesh graph, and
reconcile the historical continuation branch selectively. The direct merge is
not retained because current main contains newer accepted Human Control Plane
work and the historical branch overlaps it across routes, styles, tests, and
lockfile state.

Tests: root dirty files unchanged; branch is based on the deployed SHA; no
unresolved merge; local and remote plan bodies, IDs, and dependency edges agree.

DoD: every downstream node has one owner, one mutation region, explicit inputs,
tests, evidence, and a WorkMesh record.

## M6.1 Unified RichContent and responsive layout primitives

Install `react-markdown@10.1.0` and `remark-gfm@4.0.1`; replace the handwritten
parser with safe CommonMark/GFM rendering; add document/compact density, compact
output expansion, code labels/copy, locally scrolling tables/code, and shared
responsive action/table/description/field/overflow primitives.

Tests: H1-H6, soft breaks, nested/task lists, tables, code, quotes, rules,
strikethrough, CJK, URL/path/UUID/hash, images, raw HTML, unsafe protocols, compact
collapse, keyboard copy, and 320-1440px overflow.

DoD: all Human-visible Markdown shares one safe renderer; H1 is semantic; normal
soft wrapping does not create extra paragraphs; no page-level horizontal scroll.

## M6.2 Approval actionability contract and authoritative evaluator

Add the viewer actionability union to OpenAPI and shared contracts. Implement a
domain evaluator used by both Approval read projections and decide-time policy.
Correct the Web decision client to consume the declared wrapped response. Keep
the reason required and keep every decision-time authority check.

Tests: actionable, viewer already decided, expired, terminal/inactive Session,
revoked/expired/mismatched authority, hidden Human, stale revision, quorum,
duplicate idempotency, concurrency, and transaction rollback.

DoD: listed actionability and decide policy share one predicate without turning
the projection into authorization.

## M6.3 Direct Approval decisions, feedback, and recovery

Render direct Approve, Reject, and Other feedback controls on every actionable
row/card. Quick decisions supply stable default reasons. Other feedback selects
approve-with-requirements or reject-with-feedback and requires text. Add per-row
busy/success/error/quorum state, structured error recovery, high-risk scope
confirmation, mobile cards, and shared use by Human Attention and Work Item
detail. Bulk remains secondary and retains individual failures.

Tests: direct actions without selection, both quick decisions, both feedback
paths, high-risk confirmation, quorum pending, 403/409/5xx/network errors, stale
selection cleanup, keyboard/focus/aria-live, and mobile controls.

DoD: every actionable item has visible controls and no click fails silently.

## M6.4 Unified app shell and Project/Issue collection surfaces

Apply the shared typography, spacing, wrapping, action, empty/error/loading, and
responsive contracts to the existing Human Control Plane shell, Projects, and
Issues. Preserve canonical URLs and Human workflow versus Agent execution facts.

Tests: existing route contracts, filters, cards, tables, long localized labels,
desktop/tablet/mobile geometry, focus, and global overflow.

DoD: the collection surfaces read as one product without replacing their
authoritative feature adapters.

## M6.5 WorkItem and Agent project-understanding workspace

Make goal, approved Plan, decisions, risks, freshness, active execution,
approvals, relations, handoffs, activities, and evidence readable through the
same workspace and RichContent boundary. Never request or store hidden model
reasoning.

Tests: current/stale/offline/partial projections; running/stopped/terminal
Sessions; evidence present/missing; approval/handoff; long content; responsive
quick and full detail routes.

DoD: a Human can identify the goal, current Agent context, active work, required
decision, and evidence without reconstructing the state across unrelated pages.

## M6.6 Human Attention consolidation and dogfood journey

Count only actionable Human work, move expired/revoked/inactive sources to
Recovery, and reuse the direct decision component. Run the Fake-Agent journey:
request Approval, quick approve/reject or approve with requirements, deliver the
decision to the Agent, publish result/evidence, and review completion.

Tests: real local and mocked browser topologies, reconnect/resync, durable event
cursor, stale recovery, and Agent-visible approval reason.

DoD: the active queue contains real Human actions and the end-to-end Human-Agent
journey has durable, reproducible evidence.

## M6.7 Integrated visual, accessibility, release, and MCP acceptance

Run focused suites followed by all required local checks. Compare Multica source
screens and the integrated WorkMesh result at matching states and viewports while
checking independent implementation rather than pixel copying. Verify keyboard,
focus, reduced motion, forced colors, touch targets, and overflow.

Build the exact accepted SHA, validate all four `linux/amd64` images and Linux
entrypoints, preserve rollback/config snapshots, deploy, verify Web/API/discovery
and MCP lifecycle, then remove only exact superseded images after acceptance.

Tests: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`,
`pnpm test:e2e`, production image/Compose/Skill checks, `verify_connection`,
`get_current_identity`, Project/WorkItem/activity reads, and a live intake cycle.

DoD: repository, deployed build SHA, public behavior, WorkMesh control plane, and
evidence agree; no required test or known product blocker remains.
