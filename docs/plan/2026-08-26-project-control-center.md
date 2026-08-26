# Project Control Center

Issue: [#91](https://github.com/xurunxin/WorkMesh/issues/91)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADRs: `docs/adr/0051-human-control-plane-read-models.md`, `docs/adr/0052-human-control-plane-information-architecture.md`

Depends on: #89 and #90, merged in `11a2ea964949e87dca19fae39e6bd6d9698d5852`

Visual target: the selected #90 Option 2 Project Control Center reference in
`docs/evidence/human-control-plane/`.

## Objective

Replace the progress-centric Project Overview with a Human Control Center backed
by one authorized, bounded server projection. Put Human decisions, live Agent
runs, execution risk, verified outcomes, and ready/blocked work ahead of generic
progress, while preserving stable Project work, milestone, and URL workflows.

## Tasks

### 1. Authoritative Project digest

- Extend the shared Control Center digest with server-derived actor attribution,
  Work Item, current Plan Step, heartbeat health/freshness, last meaningful
  activity, pending Human action count, and evidence count.
- Treat an outcome as recently verified only when the completed Session has at
  least one linked Artifact; do not infer verification from terminal state.
- Keep the change additive and projection-only. No database migration or new
  browser-side authorization join is introduced.
- Update `OPENAPI.yaml`, shared contracts, the REST projection, and SDK/MCP
  parity where their generated/shared types require it.

### 2. Production Project Overview

- Build the selected Option 2 layout from the #90 shared primitives.
- Load the initial six collections through one
  `GET /api/v1/projects/{projectId}/control-center` request.
- Show Needs You, Running, At Risk, Recently Verified, Ready, and Blocked with
  explicit Human/Agent attribution and semantic lifecycle, health, risk,
  urgency, and freshness states.
- Keep Project List, Board, Backlog, milestones, and administration reachable
  through the canonical Project route contract.

### 3. Recovery, pagination, and realtime

- Keep surface, selected resource, and drawer state in the URL and restore focus
  when detail surfaces close.
- Keep responsible Human, active Agent, risk, Work Item state, and time-window
  filters in the URL and apply them in the server projection so paged results
  remain complete and authoritative.
- Paginate each collection independently through the projection endpoint; do
  not client-filter an incomplete page.
- Refresh only invalidated collections after realtime events and preserve
  current focus, selection, and stable ordering during background refresh.
- Render collection-level loading, empty, error, forbidden, partial, stale,
  offline, and resynchronizing states without hiding healthy collections.
- Preserve the stable Project workflows when the Human Control Plane feature is
  disabled.

### 4. Acceptance and release

- Add contract and API integration coverage for digest truth, evidence-gated
  verification, authorization, project scoping, pagination, and replay.
- Add web tests for the single-request boundary, rendering semantics, URL/focus
  restoration, pagination, partial failure, realtime refresh, and feature-off
  behavior.
- Compare the production surface with the selected reference at 390, 768, 1440,
  and 1920 pixels in zh-CN and English, including keyboard and reduced-motion
  checks.
- Run the required local lint, typecheck, unit, integration, and E2E gates before
  merging. Attach exact command results and screenshots to #91 and WorkMesh.

## Definition of done

- Project Overview opens as the selected Human Control Center and remains useful
  with any individual collection empty, stale, or failed.
- The browser performs one initial Control Center projection request and no N+1
  detail reconstruction.
- Every Running digest identifies its Agent, Work Item when present, current Plan
  Step when present, execution health, last meaningful activity, heartbeat
  freshness, and pending Human action count.
- Recently Verified contains only completed Sessions with linked evidence.
- Human accountability and Agent execution remain visually and semantically
  distinct.
- Project work and milestone routes remain backward compatible.
- Required local checks pass, responsive evidence is attached, and #91 plus the
  #87 roadmap record the merge SHA and acceptance result.

## Expected changes

- Database migrations: none.
- REST API: additive fields on Control Center Project and digest responses.
- Domain events: none; existing targeted invalidations remain authoritative.
- Known boundary: scoped steering and consequence-confirmed mutations remain in
  #94; causal Run Timeline remains in #93.
