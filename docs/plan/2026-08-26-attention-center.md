# WM-UX-005 — Human Attention Centers

GitHub source: https://github.com/xurunxin/WorkMesh/issues/92  
Parent roadmap: https://github.com/xurunxin/WorkMesh/issues/87  
Project: WorkMesh Human Control Plane and Explainable Agent UX  
Branch: `codex/wm-ux-005-attention-center`  
Baseline: `5fafec0b8485f250755ea48df869e36d6ebcbbd5`

## Scope and invariants

Build global and Project-scoped Human Attention Centers from the versioned typed
Human Attention projection. Responses remain adapters to existing Decision,
Approval, Work Room, Session recovery, completion-review, and related commands.
The browser does not infer authority, bulk compatibility, lifecycle, or causal
state. Read/seen state remains distinct from source resolution.

No database migration, new authority model, generic response command, or hidden
reasoning surface is introduced.

## T1 — Queue contract and authorized projection

Extend the shared list query and server projection only where required for the
Issue #92 views: responsibility, risk, urgency, actor, expiry/time filters,
active/history status groups, stable pagination, and server-declared response
and bulk compatibility metadata. Preserve live authorization, signed cursors,
bounded queries, source revision, freshness, and exact command mappings.

Tests:

- contract parsing and forward-compatible response metadata;
- authorized global and Project list filters;
- expiry/stale/current lifecycle projection;
- bulk compatibility and prohibited-risk classification;
- cursor/filter tamper and cross-Team denial.

Definition of done:

- every queue fact is typed and server-derived;
- no production filter or action depends on free-text matching;
- bulk compatibility never grants authority and is recomputed per item.

## T2 — Global and Project Attention Center UI

Add one shared queue/detail model with global and Project routes. URL owns scope,
filters, active/history, selected item, and pagination. The list distinguishes
assigned-to-me, visible-to-me, and workspace administration; detail renders
source, reason, attribution, risk, impact, evidence, freshness, revision,
expected next state, and deep links without requiring UUID copying.

Tests:

- route-state parse/write and Back/Forward restoration;
- global and Project filtering/pagination;
- keyboard selection, focus return, semantic labels, and narrow layout;
- realtime refresh, partial collection failure, offline/stale states;
- zh-CN and en copy coverage.

Definition of done:

- global and Project pages use only typed Human Attention items;
- queue and detail share one implementation and preserve Project context;
- stale/offline authority is visible and configured dangerous actions disable.

## T3 — Governed typed response workflows

Implement distinct Decision, Approval, Clarification, Conflict, Recovery, and
Completion Review forms. Each uses the source option's existing authoritative
command, target revision, idempotency, required rationale, and action preview
where Session/resource mutation is involved. Preserve drafts across conflicts.
Support bulk actions only for server-compatible low-risk items; partial failure
keeps failed or stale selections with exact actionable reasons.

Tests:

- each typed workflow request body, revision, and reason behavior;
- expired, superseded, already-decided, unauthorized, and stale recovery;
- mixed bulk selection, double submit, and partial failure retention;
- no `prompt`/`confirm` or client-side authority inference;
- committed/applying/verified/failed reconciliation.

Definition of done:

- responses reuse existing source commands and revalidate current state;
- no prohibited risk class can be bulk-approved;
- drafts and retryable selection survive conflicts and partial failures.

## T4 — Integrated acceptance and evidence

Add deterministic E2E fixtures for Approval, Clarification, stale Decision,
mixed bulk, and realtime disconnect flows. Run focused tests, root lint,
typecheck, unit, integration, and Web E2E. Capture responsive/localized evidence
and record exact results in the GitHub Issue and WorkMesh activity stream.

Tests:

- the five required Issue #92 E2E scenarios;
- accessibility/keyboard and responsive acceptance;
- feature-disable behavior for optional Graph/autonomy integrations;
- required repository checks with exact results.

Definition of done:

- all Issue #92 acceptance criteria are evidenced;
- no known failing required check remains;
- GitHub, local plan, WorkMesh task state, and git history agree.
