# Monorepo and runtime split
Status: Accepted

## Context
Stage 0 needs a strict TypeScript codebase that can keep UI, HTTP API, background delivery and domain rules independently testable.
## Decision
Use pnpm workspaces and Turbo. `apps/web`, `apps/api`, and `apps/worker` are separate runtimes. Framework-independent rules live in `packages/domain`; contracts, database, configuration and observability have separate packages.
## Alternatives
One combined Next server; duplicated business policy in routes and workers.
## Consequences
The API and worker share only package interfaces and PostgreSQL, not in-process state.
## Migration
No data migration is required.
## Spec changes
None.
