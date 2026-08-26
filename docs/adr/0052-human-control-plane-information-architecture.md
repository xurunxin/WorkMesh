# Human Control Plane information architecture

Status: Accepted

## Context

WorkMesh exposes durable Project, Work Item, Attention, Agent Session, Plan,
Activity, Evidence, and policy resources. The existing Web navigation mirrors
those implementation surfaces. Human operators therefore need to know internal
resource names before they can answer the product questions that matter: what
needs a decision, what is running, what is at risk, and what was verified.

Issues #88 and #89 established authorized Attention and Control Center read
contracts. Issue #90 defines the product information architecture and the
shared, API-free presentation grammar that consumes those contracts.

## Decision

The global navigation is task-oriented and ordered as follows:

| Destination | Canonical route | Purpose |
| --- | --- | --- |
| Needs You | `/?view=inbox` | Cross-Project Human Attention and current pulse |
| Projects | `/?view=projects` | Project list and Project Control Centers |
| Agents | `/agents` | Agent definitions, connections, Sessions, capability, and health |
| Operations | `/operations` | Advanced planning, automation, usage, templates, and experimental tools |
| Settings | `/settings` | Workspace, Team, workflow, policy, and integration administration |

Stable Issues and Guidance remain reachable during migration as secondary
workspace destinations. Existing query routes continue to work and are not
redirected.

Within a Project, the navigation contract is:

| Destination | Route adapter | Purpose |
| --- | --- | --- |
| Overview | `/?view=projects&project=:id` | Needs You, Running, At Risk, Recently Verified, Ready, and Blocked |
| Work | existing `tab=list`, `tab=board`, and `tab=backlog` routes | Lists, boards, hierarchy, milestones, and saved views |
| Attention | `surface=attention` | Project-scoped Human Attention |
| Runs | `surface=runs` | Active and historical Agent execution |
| Graph | `surface=graph` | Optional Beta engineering graph |
| Activity | `surface=activity` | Human-readable history with technical disclosure |
| Project Settings | `surface=settings` | Project guidance, policy, access, and integrations |

`surface` is an additive adapter owned by the URL. Unknown values converge to
Overview. Selection and drawer identity are also URL-owned, preserve unrelated
query parameters, and use canonical resource IDs. Overlay components restore
focus through the existing shared Dialog and Sheet contracts.

Shared primitives distinguish five semantic dimensions rather than deriving
one generic status:

- lifecycle: what stage an Attention item or Run has reached;
- execution health: whether execution is healthy, degraded, stalled, or failed;
- risk: consequence if the Human chooses incorrectly or does nothing;
- urgency: time sensitivity;
- freshness: how current and complete the projection is.

Color is secondary to text and accessible names. `ActorAttribution` renders
Responsible Human and Active Agent Executor as separate roles, including the
explicit "Agent on behalf of Human" relationship. Technical IDs, reason codes,
correlation data, raw events, and payloads use progressive disclosure.

Destructive controls use `ConsequencePreviewDialog` with a specific final
action label. New Human Control Plane components do not call browser
`prompt`/`confirm`.

The selected #90 reference surface is available only when
`WORKMESH_HCP_PREVIEW=1`. It is deterministic visual evidence, is absent from
production navigation, and has no transport or mutation authority.

## Alternatives

A parallel design-system package was rejected because the existing
`@workmesh/ui` boundary already owns accessibility, overlay focus, tokens, and
responsive behavior. Replacing canonical URLs was rejected because it would
break saved views and browser history. A single generic status badge was
rejected because it conflates state, health, risk, urgency, and freshness.

## Consequences

Later Human Control Plane pages share one visual and semantic vocabulary while
remaining responsible for data loading and command authority. The reference
surface can be removed after permanent production fixtures cover all
components. Existing Stable workflows remain available throughout migration.

## Migration

The global labels and Operations entry ship first. Project destinations are
introduced through the route adapter, with Overview and Work continuing to use
the current Project workspace. Issues, Guidance, and the existing List, Board,
and Backlog routes remain reachable until their later roadmap replacements are
accepted.

## Spec changes

No REST, event, database, or Agent Protocol changes are introduced. The route
map and component inventory are presentation contracts for issue #90.
