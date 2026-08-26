# Human Control Plane UI foundation

Issue: [#90](https://github.com/xurunxin/WorkMesh/issues/90)

Roadmap: [#87](https://github.com/xurunxin/WorkMesh/issues/87)

ADR: `docs/adr/0052-human-control-plane-information-architecture.md`

Depends on: #89, merged as `fba8ec03408beaa032e9e7dc96d3bc8df1c51117`

## Objective

Establish the task-oriented global and Project information architecture plus
API-free attention, run, causality, evidence, freshness, attribution, and
consequence-preview primitives. Preserve Stable workflows and canonical URLs.

## Tasks

1. Publish ADR 0052 and the route/navigation map.
2. Add distinct accessible semantics for lifecycle, health, risk, urgency, and freshness.
3. Add shared Attention, Run, Plan, Timeline, Evidence, attribution, resource, reason, control, and consequence-preview components to `@workmesh/ui`.
4. Add URL-owned Project surface, selection, and drawer adapters.
5. Localize task-oriented global and Project navigation.
6. Implement the selected Option 2 reference surface behind `WORKMESH_HCP_PREVIEW=1`.
7. Verify keyboard/focus, technical disclosure, localization expansion, reduced motion, and 390/768/1440/1920 layouts.

## Tests

- Shared component semantic and source-boundary tests.
- Dialog focus restoration and explicit consequence action tests.
- Route adapter preservation and invalid-value convergence tests.
- Global/Project navigation reachability tests.
- zh-CN and English rendering checks.
- Responsive overflow and representative screenshot evidence.
- Required local lint, typecheck, unit, integration, and E2E gates.

## Definition of done

Issue #90 acceptance evidence links the ADR, component inventory, route tests,
accessibility tests, responsive screenshots, localization evidence, and
migration notes. No database, API, or event contract change is introduced.
