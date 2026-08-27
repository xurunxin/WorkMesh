# Optional Graph integration boundary

Status: Accepted

## Context

WM-UX-012 integrates the Human Control Plane with the Graph, graph change-set,
recommendation, and governed-autonomy domains only when those domains exist.
GitHub Issues #46, #48, #49, and #50 are open at this decision point. The current
repository contains no authoritative Graph version, Ready Set, coordination
recommendation, or autonomy policy schema, route, or persistence model.

Stable collaboration must remain complete when these optional domains are absent.
Creating Graph routes, counts, recommendation reasons, rankings, policy modes, or
disabled controls from browser state would disclose or invent authority.

## Decision

- The current support state is `unavailable`, recorded in
  `docs/acceptance/human-control-plane-optional-integrations.json`.
- Stable Project, Work Item, Attention, Run, Inbox, Recovery, delivery, and
  Evidence journeys render without optional placeholders or requests.
- Optional object links are accepted only as explicit, authorized internal hrefs
  returned by the owning server projection. The browser does not construct a
  Graph href from a subject ID or a local `enabled` boolean.
- A future enabled integration must ship its domain contract first and expose the
  exact subject link, tier, freshness, versions, authorization-filtered facts,
  and failure state. Shared Attention, Evidence, freshness, and Recovery
  primitives may render those facts without recomputing them.
- Unavailable, disabled, unauthorized, and degraded optional domains contribute
  no counts, reasons, layout gaps, timing probes, or controls to Stable surfaces.

## Alternatives

Adding UI-owned feature names or fixture-only production routes was rejected
because no server contract could authorize or populate them. Implementing #46,
#48, #49, or #50 inside this UX issue was rejected because it would duplicate the
authority owned by those domain issues.

## Consequences

The Phase 2 integration is deliberately dormant today. The Stable roadmap can
close with explicit disabled/failure-isolation evidence. Enabled Graph canvas,
recommendation feedback, and automatic-action E2E are not claimed until their
owning domain issues ship.

## Migration

No data migration. When an owning domain ships, update the support manifest,
consume its authorized projection and link contract, and add enabled/disabled,
stale, failure-isolation, list fallback, responsive, and non-inference E2E before
exposing navigation.

## Spec changes

This ADR and its machine-readable support manifest are the local source of truth
for WM-UX-012. WorkMesh Project and Work Items mirror the plan and evidence.
