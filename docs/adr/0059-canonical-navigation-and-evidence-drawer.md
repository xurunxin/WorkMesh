# Canonical navigation and Evidence Drawer

Status: Accepted

## Context

Human Control Plane surfaces expose related Project, Work Item, Run, Plan, Attention, collaboration, Recovery, and evidence facts, but their local route parameters and evidence presentations are inconsistent. URI presence is not validation, and source visibility cannot grant target visibility.

## Decision

Define one typed canonical-route map for supported object identities and one URL-owned Evidence Drawer contract. Existing authorized projections remain authoritative: Run `evidenceDetails` supplies rich producer/Plan/validation/provider facts while Attention, Work Item, collaboration, and Recovery may provide bounded references. Missing relationships remain `unknown`; the client never infers links from text.

The drawer displays a sanitized immutable projection and opens external HTTP(S) links only with `noopener noreferrer`. Every target API continues to authorize independently. Optional Graph/provider targets are emitted only when an owning feature supplies an explicit reference.

## Alternatives

- Surface-specific drawers were rejected because URL, provenance, state, and accessibility semantics would diverge.
- A client-side relationship graph was rejected because it would manufacture authority and links from partial data.

## Consequences

Back/Forward, close, focus, selected evidence, source context, Plan comparison, and filters share a stable route vocabulary. Reference-only evidence degrades honestly to unknown fields. No database migration or new source-of-truth is introduced.

## Migration

Existing URLs remain valid. Surfaces progressively replace direct evidence links with the shared drawer while preserving explicit external-open actions.

## Spec changes

Implements GitHub #98 / WM-UX-011. Local plan: `docs/plan/2026-08-27-canonical-navigation-and-evidence-drawer.md`.
