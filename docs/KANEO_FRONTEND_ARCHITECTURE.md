# Kaneo-derived frontend architecture for WorkMesh

Status: Binding M1-M5 implementation guide  
Decision: [ADR 0028](./adr/0028-kaneo-frontend-architecture-and-dependency-policy.md)  
Machine contract: [`KANEO_FRONTEND_CONTRACT.json`](./KANEO_FRONTEND_CONTRACT.json)  
Source inventory: [`KANEO_EXTRACTION_MANIFEST.json`](./KANEO_EXTRACTION_MANIFEST.json)

## 1. Outcome and non-goals

The target is a more coherent Human experience over the existing WorkMesh control plane. Kaneo contributes interaction patterns, visual rhythm and selected presentation implementations. WorkMesh remains authoritative for actors, responsibility, Delegations, Sessions, workflow, revision, idempotency, approvals, leases, Stop, events and external effects.

This guide does not authorize:

- Kaneo API clients, routes, stores, controllers, schema, Better Auth or WebSocket authority;
- an API call from `packages/ui`;
- a browser store as a durable source of truth;
- a generic `assignee` or `status` that merges Human and Agent concepts;
- a new dependency outside the phase-specific Gate in the machine contract.

## 2. Module map

```text
apps/web/app/*
  route parsing, layouts, screen composition
        |
        v
apps/web/features/<feature>/index.ts
  public queries, commands, view models and screen contracts
        |                         |
        v                         v
apps/web/features/<feature>/   packages/ui
adapters + projections         tokens + presentational components
        |
        v
apps/web/lib/transport
  cookie/CSRF, HTTP, structured errors, correlation, SSE cursor
        |
        v
WorkMesh REST/SSE -> domain/application -> PostgreSQL/events/outbox
```

The public `index.ts` of a feature is its Interface. Transport DTOs, normalizers, optimistic state, query cache details and command construction are Implementation details. Route code and component tests use the same Interface.

### `packages/ui`

Allowed:

- design tokens: color, typography, spacing, radius, elevation, motion and focus;
- headless/presentational components with controlled state or callbacks;
- accessibility semantics, focus management and reduced-motion behavior;
- generic display models such as `AsyncSurfaceState`, never WorkMesh DTOs.

Forbidden:

- imports from `apps/*`, Next.js navigation/server modules, WorkMesh API clients, `packages/domain`, `packages/db` or mutation contracts;
- fetch/EventSource/browser credential code;
- Kaneo route, hook, store or backend modules;
- persistence of Project, Work Item or Agent Session state.

### `apps/web/features/<feature>`

Recommended shape:

```text
features/work-items/
  index.ts              public Interface
  contracts.ts          feature input/result types
  dto.ts                external DTO validation and normalization
  view-model.ts         authority-safe projections
  queries.ts            pagination and durable refresh orchestration
  commands.ts           revision/idempotency command construction
  optimistic.ts         bounded projection and rollback
  routes.ts             feature route/search serialization
  components/           feature-aware composition using packages/ui
  *.test.ts             Interface and projection tests
```

Do not create every file pre-emptively. Split only when a responsibility exists; keep a single public Interface and local Implementation.

### `apps/web/app`

Routes compose features and own URL/history boundaries. They must not re-declare server DTOs, decide authorization, invent persistence or construct ad hoc mutation headers once a feature has migrated.

## 3. Authority-safe view models

A Work Item surface uses this semantic shape:

```ts
type WorkItemViewModel = {
  id: string
  key: string
  revision: number
  title: string
  workflowState: WorkflowStateView
  responsibleHuman: HumanSummary | null
  agentExecutions: AgentExecutionView[]
  project: ProjectSummary | null
  milestone: MilestoneSummary | null
  permissions: WorkItemActionAvailability
}

type AgentExecutionView = {
  sessionId: string
  agent: AgentSummary
  delegation: DelegationSummary
  executionState: AgentSessionState
  currentStep: PlanStepSummary | null
  controls: AgentControlAvailability
}
```

`permissions` and `controls` are rendering hints derived from authorized responses. They do not grant authority. Every Command is rechecked by the server.

Unknown response fields are ignored. Unknown enum values map to an explicit `unknown` presentation state and remain non-actionable; they are not coerced into a known state.

## 4. Query and projection contract

Queries return a discriminated result rather than `data | undefined`:

- `initial` before a query begins;
- `loading` without prior data;
- `ready` with current data;
- `empty` for an authorized empty collection;
- `refreshing` with stale-visible data and a pending durable refresh;
- `forbidden` for an authenticated but unauthorized response;
- `not_found` and `deleted` where the server distinguishes them;
- `offline` when no response was obtained;
- `reconnecting` while resuming from the last durable event cursor;
- `error` with a safe structured failure.

SSE is invalidation and convergence, not a second database. The client persists only the last safe cursor, rereads durable REST projections after relevant events, tolerates duplicates and never infers a successful mutation from an event alone.

Server pagination cursors remain opaque. List, Board and Backlog must use the same query/filter contract and may not replace pagination with whole-dataset browser loading.

## 5. Command and error contract

Each user intent owns one stable idempotency key from first attempt until a definitive response. Network errors, 408, 425, 429 and retryable 5xx may replay the exact request. A `409` is never retried blindly.

Every revisioned command sends the exact current revision as `If-Match`. The result preserves:

```ts
type WorkMeshError = {
  httpStatus: number
  code: string
  message: string
  details: unknown
  correlationId: string
  safeNextAction: 'retry_exact' | 'reload_latest' | 'reauthenticate' | 'request_access' | 'none'
}
```

Conflict recovery:

1. keep the user's unsaved intent locally;
2. show the conflict and correlation ID;
3. load the latest authorized representation;
4. present the changed fields or reload option;
5. create a new command with the latest revision only after the Human confirms the merged intent.

Forbidden and Stop responses clear optimistic state immediately. Approval, lease and action availability are not cached as authority. Sensitive server details are not rendered or stored in telemetry.

## 6. Dependency policy

The machine contract is authoritative for exact dispositions. Summary:

| Candidate | Decision | Earliest phase | Required Gate |
|---|---|---:|---|
| Base UI | conditional | M1 | isolated primitive spike, a11y, Next boundary, bundle |
| Lucide | conditional | M1 | notice, tree-shaking, no brand icons |
| Radix | defer alternate | M1 | only if selected primitive stack fails a requirement |
| shadcn/ui | reject as stack | — | interaction-only rewrite with provenance |
| Tailwind | defer | M1+ | measured CSS migration and conflict/bundle evidence |
| dnd-kit | conditional | M2 | keyboard/touch/non-drag parity and conflict rollback |
| TanStack Query/Table | defer | M2+ | demonstrated complexity, cursor/server pagination preserved |
| TanStack Router | reject | — | Next App Router remains canonical |
| TipTap/DOMPurify | defer | M3 | rich-content, sanitizer/license, SSR and bundle Gate |
| Mermaid | defer | M3+ | isolated dynamic renderer and performance Gate |
| Framer Motion | reject for foundation | — | CSS/reduced motion first |
| i18next | defer | M5 | typed catalog and glossary Gate |

Conditional and deferred do not mean installed. The implementation node must bind an exact package/lockfile delta and current provenance.

## 7. Verification matrix and budgets

Every migrated feature supplies proportionate evidence:

- component: roles, accessible names, focus order, keyboard activation, reduced motion and controlled state;
- unit: DTO normalization, view-model separation, unknown enums, error mapping, stable idempotency and rollback;
- integration: authorized/forbidden, duplicate key, stale revision, transaction failure where applicable, pagination and durable cursor recovery;
- E2E: primary Human journey plus offline/reconnect/conflict recovery and non-pointer alternative;
- visual: desktop, 768 px, 375 px and 320 px; loading, empty, error, forbidden and conflict states;
- accessibility: automated checks plus keyboard, zoom/reflow and screen-reader checklist for release-critical paths.

Default budgets for an individual implementation node:

- no unapproved runtime dependency or unexplained lockfile delta;
- initial shared JavaScript increase no more than 35 KiB gzip per M1 node;
- route-specific JavaScript increase no more than 50 KiB gzip per feature node unless a separate Gate accepts it;
- no single optional editor/diagram dependency in the initial route chunk;
- p95 interactive read target remains under 500 ms and p95 command acknowledgement under 800 ms in the PRD reference environment;
- layout shift target `CLS <= 0.1` for scored journeys;
- no document-level horizontal overflow at 320 px; local strips may scroll with visible affordance.

Budgets are regression thresholds, not claims that the current baseline already meets every target. Each node records before/after measurement with the same build and fixture.

## 8. Incremental migration sequence

1. M1.1: tokens, Button/Input/Select/Dialog/Sheet/Popover/Tabs/Badge/Card/Toast/Skeleton and state surfaces; shell consumes them through props/callbacks.
2. M1.2: command registry and search feature; result visibility remains separate from command authorization.
3. M2.1: Work Item queries and List first, then Board/Backlog on the same projection; add drag only after non-drag commands.
4. M2.2: one Work Item feature model powers Sheet and Full Page; add Agent executions without changing Human responsibility.
5. M3-M5: collaboration, onboarding, i18n and release gates reuse the same transport and result contracts.

A legacy route may delegate to a new feature before its markup is migrated. Delete old helpers only after parity and route-level tests pass. No big-bang branch or second data store is required.

## 9. Review checklist

- Does `packages/ui` remain API/Next/domain-free?
- Does the feature Interface hide DTO and retry Implementation details?
- Are Human responsibility, Agent execution, workflow state and execution state distinct?
- Does each command carry exact revision and stable idempotency through the single transport Seam?
- Are 409, forbidden, Stop, offline and reconnect states visible and recoverable?
- Is every new dependency allowed by the exact phase Gate with provenance and measurements?
- Do route, component and tests cross the same Interface?
