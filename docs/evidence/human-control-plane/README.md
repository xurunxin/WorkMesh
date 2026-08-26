# Human Control Plane UI foundation evidence

Issue: #90

ADR and route map: `docs/adr/0052-human-control-plane-information-architecture.md`

Design QA: `design-qa.md`

## Component inventory

Shared `@workmesh/ui` exports:

- navigation and layout: `ProjectControlNavigation`, `ControlCenterSection`;
- Attention: `AttentionCard`, `AttentionListItem`, `AttentionKindBadge`;
- independent semantics: `LifecycleBadge`, `RunHealthBadge`, `RiskBadge`, `UrgencyBadge`, `FreshnessBadge`;
- execution: `RunStatusBar`, `RunDigestCard`, `PlanStepRail`, `ControlCapabilityBar`;
- explanation: `CausalTimeline`, `TechnicalEventGroup`, `ReasonCodeList`, `AffectedResourceList`;
- evidence: `EvidenceReferenceList`, `EvidenceDrawer`;
- authority presentation: `ActorAttribution`, `ConsequencePreviewDialog`.

All components are API-free. Fetching, authorization, projection freshness,
and mutations remain owned by applications and the #88/#89 contracts.

## Migration notes

- Global Needs You, Projects, Agents, Operations, and Settings are first-class destinations.
- Stable Issues and Guidance remain visible as secondary destinations.
- Existing Project `tab=list`, `tab=board`, and `tab=backlog` URLs map to Work without redirects.
- New Project surfaces use additive `surface` URL state and preserve unrelated filters.
- Existing legacy `window.confirm` calls are unchanged outside the new Human Control Plane boundary; new components use `ConsequencePreviewDialog`.
- The reference route is explicitly gated by `WORKMESH_HCP_PREVIEW=1` and can be removed after permanent #91 fixtures cover the inventory.

## Verification summary

Focused verification passed for shared UI typecheck/tests, Web typecheck,
localization table/source validation, URL adapters, global navigation,
fixture behavior, overlay focus restoration, progressive disclosure, and the
preview gate. Responsive measurements and screenshots are listed in
`design-qa.md`.
