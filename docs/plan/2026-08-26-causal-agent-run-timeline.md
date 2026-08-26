# Causal Agent Run Timeline

Issue: [#93](https://github.com/xurunxin/WorkMesh/issues/93)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADR: `docs/adr/0054-causal-agent-run-explanation.md`

Depends on: #89 and #90

## Objective

Let an authorized Human follow one Agent Run from Work Item and Plan through
actions, changes, interventions, evidence, validation, recovery, and outcome using
one server-authored causal story. Preserve exact sanitized provenance through
progressive disclosure and URL-owned navigation.

## Tasks

### 1. Authoritative causal projection

Extend the Run Explanation contract and bounded server projection with ordered Plan
Versions/Steps, stable Step links, actor attribution, phases, trigger facts,
sanitized action/tool facts, affected resources, evidence, validation state,
technical source records, deterministic grouping, and sequence pagination.

Tests: contract limits; authorization; sanitization; grouping invariants; errors and
high-risk actions never collapse; stable cursor; missing evidence is not verified.

Definition of done: the browser receives all causality and provenance needed for the
Run without parsing arbitrary Activity text.

### 2. Shared full and compact Run Timeline

Build one responsive component for the Run header, attribution, health/freshness,
Plan rail, version comparison, causal groups, evidence/change traceability,
validation status, controls, and technical disclosure. Use it from the full Session
page and Work Item-embedded mode.

Tests: semantic rendering; stable Step/group/evidence links; keyboard and screen
reader names; localization expansion; large-timeline rendering.

Definition of done: completion is distinct from verified completion and all durable
evidence remains traceable to its Session and Plan Step when source facts exist.

### 3. URL, realtime, and recovery

Make filters, selected group, Plan comparison, technical visibility, pagination,
and return focus URL-owned. Apply targeted Session invalidations, preserve useful
partial data during refresh/offline state, and recover from stale projections.

Tests: filter combinations; deep links; Back/Forward; focus/scroll restoration;
pagination; realtime resync; stale and partial states.

Definition of done: a copied URL restores the same causal view and realtime updates
do not erase Human context.

### 4. Integrated acceptance and release

Run the required acknowledgement-to-completion fixture including grouped reads,
multi-file change, failed validation, replan, Approval decision, successful
validation, Artifact/commit, and terminal completion. Capture visual, accessibility,
performance, provenance, sanitization, History, and E2E evidence; run repository
gates; open and merge the Issue-specific PR.

Tests: focused API/web suites; required local lint, typecheck, unit, integration,
and E2E gates; 390/768/1440/1920 visual QA.

Definition of done: Issue #93 is closed by a merged PR and WorkMesh activities carry
the exact validation and artifact references.

## Acceptance evidence

- `pnpm lint`: 17/17 packages passed.
- `pnpm typecheck`: 17/17 packages passed.
- `pnpm test`: all non-API packages passed; the API package passed independently
  with 30/30 files and 161/161 tests after the parallel all-repository run exceeded
  existing route-initialization timeouts under resource contention.
- Contracts: 18/18 files, 141/141 tests; Agent SDK: 33/33; MCP: 37/37.
- Real PostgreSQL/Redis integration fixture: 1/1 passed, including source
  provenance, sanitization, filtering, deterministic grouping, and pagination.
- Authenticated browser acceptance: the complete causal story passed together
  with bootstrap dependencies; the 100-group bounded-DOM/pagination scenario and
  390px no-overflow visual check passed.

The PR URL, commit SHA, and WorkMesh activity IDs are recorded at release time so
this local source-of-truth plan does not predict mutable remote identifiers.
