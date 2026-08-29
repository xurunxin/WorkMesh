# Unified Human Control Plane Web experience

Status: Accepted

## Context

WorkMesh has a complete Human Control Plane, but successive frontend iterations
left multiple navigation systems, duplicated authenticated shells, preview-only
routes, and mixed URL state ownership. Observable failures include clipped long
Project descriptions, Project selection races, a legacy Work layout reached
from the Project Control Center, missing sidebar footers, an Agent detail crash
caused by PostgreSQL enum-array transport, and a Recovery projection query that
assumes every historical evidence value is an array.

The existing Human Control Plane, `@workmesh/ui` tokens, and production page
density are the visual authority. This change does not introduce another theme
or copy a third-party product language.

## Decision

Use one authenticated application shell for every signed-in production route.
It owns brand, title, actor/team context, navigation, realtime state, release
information, sign-out, and desktop/mobile sidebar footer composition. Route
pages supply only their active destination, title, optional team controls, and
content.

Use the existing shared Tabs primitive for mutually exclusive panels. Remove
the independent Project, collaboration-queue, legacy Project-work, and Settings
tab implementations after their consumers migrate. Preserve correct semantics:
App destinations remain links, panel selection remains tabs, and section
indexes remain anchors.

Make the Next router URL the only Project navigation state. A bare Projects URL
may choose the first visible Project once. An explicit missing Project remains
missing and never falls back. Requests are abortable and may commit only while
their Project identity still matches the URL. Project Overview, Work,
Attention, and Runs remain; unimplemented Graph, Activity, and Settings
surfaces are removed. Work owns List, Board, and Backlog.

Long Project narrative is never clipped. On desktop the Project rail and detail
pane are independent scroll owners; on narrow screens the document scrolls
naturally. Code and tables retain bounded horizontal scrolling.

Normalize every Agent Definition response to the documented transport type.
In particular, PostgreSQL `agent_protocol[]` must cross the REST boundary as a
JSON string array, not a PostgreSQL array literal. Validate the response before
rendering, and show a local recovery state for malformed data.

Evaluate Recovery completion evidence by JSON shape. Non-empty legacy arrays or
non-empty current `artifactIds`/`checks` arrays are evidence. Empty, null,
scalar, or malformed values are missing evidence, but can never make the query
fail. An explicit no-artifact reason remains authoritative.

Use the built-in image generation workflow to create one original WorkMesh
brand mark: four nodes forming a W in existing charcoal and cobalt tokens, with
a transparent background. Persist the selected raster source in the repository
and deterministically derive application and browser icons.

Delete runtime-only preview/evidence routes and the embedded Settings Operations
path. They receive no redirects or hidden compatibility renderers.

## Alternatives

Patch each page independently: rejected because it preserves the duplicated
shell, tab, and route-state sources that caused the drift.

Keep legacy views behind redirects or flags: rejected because the selected
migration policy explicitly removes dual paths.

Add a new component library or visual theme: rejected because the accepted
Human Control Plane already provides the product language.

Parse the PostgreSQL enum array only in the Agent detail component: rejected
because every REST response must satisfy the same contract.

## Consequences

Authenticated routes share one composition boundary and one title/brand
contract. Project navigation becomes deterministic and browser-history aware.
Old preview URLs and the Settings Operations compatibility URL return not
found. API and Web deploy together because the Agent transport and Recovery
projection change with the frontend. Worker, MCP, event, and database schemas
do not change.

## Migration

No database migration or backfill is required. Historical Recovery evidence is
read shape-safely in place. Existing Agent rows remain valid; their API
projection is corrected at read boundaries. Preview-only runtime files and
their CSS/tests are deleted after production coverage moves to normal fixtures.

## Spec changes

- Agent REST responses guarantee `supported_protocols: string[]`.
- Canonical Project surfaces are Overview, Work, Attention, and Runs.
- Canonical Work views are List, Board, and Backlog.
- Authenticated document titles follow `<page or entity> · WorkMesh`.
- Local plan: `docs/plan/2026-08-29-human-control-plane-ui-unification.md`.
- WorkMesh control plane: Project `3eb20a28-60c9-4f98-818e-d44de404b0ef`.
