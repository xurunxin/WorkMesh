# Human Control Plane final acceptance and product telemetry

Status: Accepted

## Context

The Human Control Plane now spans Project, Work Item, Attention, Run, governed
control, collaboration, Recovery, canonical navigation, and Evidence surfaces.
Component success alone does not prove the complete Human outcome. The repository
already owns deterministic real-local, mocked-dev, and production-Web plus mocked
API Playwright topologies, a four-viewport visual tour, semantic/keyboard helpers,
and 300-object performance fixtures. WM-UX-013 must make those assets the program
gate rather than create a competing test system.

Product telemetry is useful for validating interaction outcomes, but WorkMesh is
self-hosted and must not export message bodies, prompts, paths, IDs, evidence
metadata, credentials, or hidden reasoning.

## Decision

- `docs/acceptance/human-control-plane-acceptance.json` is the machine-readable
  route/state/test topology and budget specification.
- The existing serial final Playwright runner remains the integration owner for
  root-mixed, mocked-dev, and production-Web plus mocked-API evidence.
- Browser product metrics use bounded W3C Performance entries only. They are
  page-lifetime, first-party, and never transmitted by WorkMesh.
- Metric names and dimensions are closed enums. Durations are clamped; at most
  200 WorkMesh product entries are retained before the product set is cleared.
- `navigator.doNotTrack === "1"` and the deployment/runtime global
  `window.__WORKMESH_DISABLE_PRODUCT_TELEMETRY__ === true` disable collection.
- Attention discovery/response, evidence navigation, and navigation focus
  restoration emit only surface, action class, outcome, broad error class, and
  bounded duration. Resource IDs, URLs, copy, payloads, and correlation IDs are
  excluded.
- Accessibility claims are limited to the automated semantic, keyboard, focus,
  reduced-motion, reflow, forced-colors, and localization checks actually run;
  no complete WCAG conformance claim is made.
- Optional Graph/autonomy evidence follows ADR 0060 and cannot block Stable
  closure while its owning domains are unavailable.

## Alternatives

External analytics and durable raw-event storage were rejected because they add
deployment, consent, retention, cardinality, and privacy obligations unnecessary
for this acceptance program. A new screenshot harness was rejected because the
existing deterministic tour already owns routes, locales, viewports, geometry,
ARIA, focus, and request ledgers.

## Consequences

Operators and tests can read privacy-bounded interaction measures from the page's
Performance Timeline. The data disappears with the document and has no cross-user
identity. Longitudinal aggregation requires a future explicitly governed exporter
and is not claimed here.

## Migration

No database or API migration. Existing pages gain local performance measures.

## Spec changes

This ADR, the local plan, acceptance JSON, final result manifest, and WorkMesh
Project/WorkItems form the dual-track source and evidence for WM-UX-013 and #87.
