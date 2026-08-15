# Kaneo frontend architecture and dependency policy

Status: Accepted

## Context

WorkMesh is selectively adopting Kaneo's Human-facing interaction patterns after GA. The current Web is intentionally small: route components call a shared fetch helper directly, transport-shaped types are often local to screens, and `packages/ui` exports only a minimal Button. This is fast to understand today but does not yet provide a stable boundary for the M1-M5 redesign.

Copying Kaneo routes, stores, hooks or component dependencies as one stack would create a second application architecture and could blur WorkMesh authority. WorkMesh must continue to distinguish Human responsibility from delegated Agent execution, Work Item workflow state from Agent Session execution state, and client projections from PostgreSQL/API authority.

The PRD previously listed Tailwind, shadcn/ui, TanStack Query/Table and TipTap as a recommended Web stack. The v23 upstream audit showed that several candidates should be conditional, deferred or rejected rather than adopted unconditionally.

## Decision

Use three modules with one-way dependencies:

1. `packages/ui` is a deep presentation Module. Its Interface is typed props, callbacks, slots, accessibility state and design tokens. Its Implementation may use React and explicitly approved headless/presentation dependencies. It never imports Next.js, WorkMesh API clients, contracts, domain commands, database code, Kaneo routes/hooks/stores or browser persistence used as domain authority.
2. `apps/web/features/<feature>` is the application-facing Module. Its public Interface exposes authority-safe view models, queries and commands. Its Implementation owns DTO validation/normalization, cache/projection behavior, optimistic UI with rollback, structured error mapping, stable idempotency ownership and route integration.
3. `apps/web/app` is the routing/composition Module. It selects features, parses route/search state and composes screens. It does not duplicate feature policy or transport shapes.

The transport Adapter in `apps/web` is the single Seam crossed by feature queries and commands. A command accepts an explicit current revision and stable operation identity, sends `If-Match` and `Idempotency-Key`, preserves the full structured error (`code`, `message`, `details`, `correlationId`) and does not blindly retry `409`. Availability shown by a component is never authorization; the server still enforces identity, session, delegation, capability, resource scope, approval, lease, Stop, revision and idempotency.

View models keep these concepts separate:

- `responsibleHuman` is the accountable Human projection and is never replaced by an Agent.
- `agentExecutions[]` contains Delegation/Agent Session projections and does not write workflow state.
- `workflowState` describes the Work Item lifecycle.
- `executionState` exists only inside an Agent execution projection.

Client projection states are explicit: initial/loading, ready, empty, refreshing, forbidden, not found/deleted, conflict, offline and reconnecting. They describe what the client can render, not durable domain state.

Dependency decisions are staged:

- No dependency is installed by GEN-4.
- `@base-ui/react` and `lucide-react` are conditional M1 candidates. They require an isolated component spike, accessibility/Next client-boundary tests, bundle evidence and notice preservation. Brand icons are excluded.
- Radix primitives are a deferred alternate, not a simultaneous second primitive stack. A failed Base UI spike or a missing required primitive is necessary before evaluation.
- shadcn/ui is rejected as an imported application architecture or bulk code-generator baseline. Individual interaction recipes may be rewritten into WorkMesh-owned components with provenance.
- CSS variables and authored CSS remain the M1 baseline. Tailwind is deferred until a measured migration shows lower total styling complexity without global conflicts.
- `@dnd-kit/core` is conditional for M2 only after pointer, keyboard, touch, non-drag, rollback and stale-revision paths are specified.
- TanStack Query and Table are deferred until a feature demonstrates cache/table complexity that existing query modules cannot contain. They may not replace durable cursors or server pagination. TanStack Router is rejected because WorkMesh uses Next App Router.
- TipTap and DOMPurify are deferred to the M3 rich-content contract. The Gate must decide extensions, paste/upload behavior, SSR, sanitization ownership, applicable DOMPurify license and bundle cost.
- Mermaid is deferred to an optional isolated dynamic renderer; Framer Motion is rejected for the foundation; CSS plus reduced-motion behavior is the default.
- i18next is deferred until the WorkMesh glossary and typed catalog contract are ready; Kaneo translations are not copied.

The Module is intentionally deep: feature callers ask for WorkMesh queries/commands and receive WorkMesh view models/result states; pagination, normalization, retries, correlation and rollback remain hidden Implementation details. This increases Leverage and Locality by keeping authority-sensitive behavior in one place. New Seams are introduced only when there is real variation, such as transport or editor implementations; callers and tests cross the same public Interface.

## Alternatives

Adopt Kaneo's frontend stack and stores wholesale. Rejected because it imports a second routing/state/authority model and increases provenance and upgrade coupling.

Keep all DTOs, mutations and presentation in route components. Rejected because every M1-M5 screen would repeat error, revision, idempotency and projection behavior.

Move API-aware components into `packages/ui`. Rejected because shared presentation would become coupled to WorkMesh transport and impossible to exercise independently.

Introduce a generic repository/service abstraction for every endpoint. Rejected because an undifferentiated shallow wrapper adds indirection without hiding meaningful complexity. Feature-specific query and command interfaces are preferred.

Install every likely library before implementation. Rejected because bundle, accessibility, license and maintenance decisions need feature evidence.

## Consequences

M1 starts with tokens and API-free primitives, then migrates the application shell through adapters. M2 introduces Work Item list/board/detail feature modules. M3 adds rich content only after its separate content-safety and dependency Gate. M4 and M5 consume the same view-model and command interfaces.

Some duplication remains temporarily while legacy screens migrate. Route components may continue to use `app/lib` until their feature slice is moved, but new Kaneo-derived work must use the target boundary. The architecture contract and import checks make that debt visible.

Dependency adoption becomes slower at the first use but cheaper to reverse. A conditional decision is not installation approval; the implementing TaskGraph node must provide its own package/lockfile delta, provenance, license, bundle and test evidence.

## Migration

1. M1 creates tokens and presentation primitives in `packages/ui`, plus shared transport result/error types in `apps/web`.
2. M1 migrates shell/loading/empty/error surfaces without changing domain endpoints.
3. M2 moves one vertical Work Item slice at a time into `apps/web/features/work-items`; legacy routes delegate to the new Interface.
4. M2/M3 add Agent execution, collaboration and artifact projections as separate fields rather than extending a generic assignee/status model.
5. Old route-local DTOs and mutation helpers are removed only after parity tests pass. There is no big-bang rewrite.

No database migration is required. GEN-4 changes documentation and control evidence only.

## Spec changes

`WORKMESH_PRD.md` section 18.1 now distinguishes the installed Web baseline from staged dependency candidates and binds selection to this ADR. No REST, event, database or public package contract changes are made by GEN-4.
