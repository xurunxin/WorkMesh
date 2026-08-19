# AGENTS.md

This repository implements **WorkMesh**, a self-hosted collaboration platform for humans and coding agents.

Read these files before making changes:

1. `WORKMESH_PRD.md`
2. `AGENT_PROTOCOL.md`
3. `OPENAPI.yaml`
4. `SCHEMA.sql`
5. `docs/adr/`

## Repository layout

```text
apps/web        Next.js UI
apps/api        Fastify REST/SSE API
apps/worker     BullMQ workers, outbox, stale/lease jobs
apps/mcp        MCP server/adapter
packages/db     Drizzle schema, migrations, repositories
packages/contracts Zod/OpenAPI/event contracts
packages/domain Framework-independent commands and invariants
packages/agent-sdk TypeScript agent SDK
packages/ui     Shared UI
packages/config Shared typed configuration
packages/observability Logs, metrics, tracing
```

## Setup commands

Use the actual scripts defined in `package.json`; keep this section updated.

```bash
pnpm install
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Required checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
```

Do not claim completion while a required check is failing.

## Domain invariants

- Humans, agents, and services are distinct actor kinds.
- A work item keeps a responsible human; agents act through delegations.
- Work-item workflow status and agent-session execution state are separate.
- Agent activities, plan versions, approvals, handoffs, and domain events are append-only facts.
- Plan steps have stable IDs across revisions.
- Agent mutations require identity, active session, delegation, capability, resource scope, approval where needed, lease where needed, revision, and idempotency.
- Stop is enforced on the server. A stopped session cannot continue ordinary writes.
- A lease coordinates work; it never grants authorization.
- Agent-to-agent work messages are visible to authorized humans.
- Do not request or persist hidden model chain-of-thought. Persist concise operational rationale, actions, tool calls, evidence, risks, and results.
- Untrusted code runs in an external runner, never in the API or web process.
- Each domain mutation updates current state, inserts a domain event, and inserts an outbox row in one PostgreSQL transaction.

## Architecture rules

- Route handlers translate transport input to domain commands; they do not contain business policy.
- Domain packages must not import Next.js, Fastify, React, Redis, or provider SDKs.
- Provider adapters implement interfaces owned by the domain/application layer.
- `packages/contracts` is the shared source for transport DTOs and event schemas.
- PostgreSQL is the durable source of truth. Redis is not authoritative.
- SSE uses durable event cursors; do not rely only on in-memory pub/sub.
- Use transactional outbox for external delivery.
- Webhook consumers and jobs are idempotent.
- Never send an irreversible external request before the database transaction commits.
- Keep secrets out of logs, activities, messages, context snapshots, and artifacts.
- Store time in UTC.
- Use explicit error codes and correlation IDs.
- Use optimistic concurrency for mutable high-conflict resources.

## Coding style

- TypeScript strict mode.
- Avoid `any`; use `unknown` plus validation.
- Use Zod at external boundaries.
- Prefer small pure domain functions and explicit command handlers.
- Use exhaustive checks for state enums.
- Name events in past tense: `agent.session.created`.
- Name commands imperatively: `CreateAgentSession`.
- Use stable machine-readable error codes.
- Add comments for non-obvious invariants, not for obvious syntax.
- Do not perform unrelated large refactors.

## Database changes

- Add a new numbered migration; never edit an applied migration.
- Add constraints and indexes for important invariants.
- Include a backfill strategy when introducing non-null columns.
- Update `SCHEMA.sql` as the consolidated reference after adding migrations.
- Test migration from the previous stage and a clean database.
- Avoid putting the entire domain in unqueryable JSON. JSONB is for extensible metadata and snapshots.

## API changes

- Update `OPENAPI.yaml` and shared contracts first.
- All mutation endpoints require `Idempotency-Key`.
- Use `If-Match` for revisioned resources.
- Return structured errors:
  `{"error":{"code","message","details","correlationId"}}`.
- Keep event versions independent from REST API versions.
- Consumers must ignore unknown event fields.

## Agent protocol

- Webhook delivery is at least once.
- Verify HMAC using raw request bytes and a timestamp replay window.
- ACK a new session promptly; do not block the webhook receiver on execution.
- Heartbeats are diagnostic and should not flood the main activity timeline.
- Plan updates publish a whole new immutable version.
- Do not silently overwrite a newer plan.
- Stop/pause/resume are state-machine commands, not frontend flags.
- Completion requires a result summary and evidence or an explicit no-artifact explanation.

## Tests

For each domain feature, cover:

- happy path;
- unauthorized actor;
- invalid state transition;
- duplicate idempotency key;
- stale revision;
- transaction failure;
- webhook/job replay;
- concurrent request where applicable;
- server restart/outbox recovery where applicable.

Use a fake agent and fake Git provider for deterministic integration and E2E tests.

## ADRs

Create `docs/adr/NNNN-title.md` when changing:

- a core invariant;
- service boundaries;
- persistence/event semantics;
- protocol behavior;
- security policy;
- a major dependency.

ADR format:

```text
# Title
Status
Context
Decision
Alternatives
Consequences
Migration
Spec changes
```

## Spec, plan, and execution: dual-track (local + WorkMesh)

WorkMesh has two parallel surfaces for planning and execution. Every
spec and every plan is recorded in BOTH places, with the same content
and a stable reference between them. Do not write to one without the
other.

- **Spec / ADR** — `docs/adr/NNNN-title.md` (local) + a WorkMesh
  `Project` (remote). The local file is the source of truth; the
  remote Project carries a pointer to the local file in its
  description and houses the implementation Issues.
- **Plan** — `docs/plan/YYYY-MM-DD-<feature-name>.md` (local) + one
  WorkMesh `WorkItem` per plan task under the matching Project. The
  local file is the source of truth; each WorkItem's description
  contains the matching task's full body, the test list, the DoD
  from the spec, and a `blocks` link to the next gated task.
- **Execution progress** — recorded in the WorkMesh WorkItem
  (`acknowledged` → `planning` / `executing` → `awaiting_review` →
  `completed`), with the matching `append_activity` notes carrying
  test output, screenshots, and any spec divergence. The local
  git history is the durable record of file changes; the WorkMesh
  WorkItem is the durable record of the agent's operational
  rationale. Both must agree.
- **Information retention** — anything the user may want to look up
  later (decisions, tradeoffs, follow-up items, known limitations,
  cross-session context) lives on the WorkMesh `Project` description
  and on the relevant `WorkItem` activity stream. Do not store
  operational context only in the local repo.

Rationale: the local repo answers "what is the code?" and the
WorkMesh Project answers "what work is happening on this code and
why?". The control plane is WorkMesh; the code is git. Keep them in
sync.

## WorkMesh MCP tools to prefer for this project

When working on WorkMesh, prefer the MCP tools over the local CLI
for the following:

- `mcp__workmesh__create_project` — start a new Project for any spec
  that will need tracked work.
- `mcp__workmesh__create_work_item` — one Issue per plan task; carry
  the full body, test list, and DoD in the description.
- `mcp__workmesh__add_work_item_relation` — use `kind: 'blocks'` to
  express a serial dependency between plan tasks.
- `mcp__workmesh__append_activity` — record test output, screenshots,
  and spec divergence on the matching WorkItem.
- `mcp__workmesh__complete_session` / `mcp__workmesh__fail_session` —
  at the end of a delegated Agent Session, record a summary with
  the artifact IDs.

The MCP is the control plane; the git repo is the data plane. The
Project and WorkItem IDs are the durable handoff between them.

- a core invariant;
- service boundaries;
- persistence/event semantics;
- protocol behavior;
- security policy;
- a major dependency.

ADR format:

```text
# Title
Status
Context
Decision
Alternatives
Consequences
Migration
Spec changes
```

## Completion report

At the end of a task, report:

- implemented scope;
- files changed;
- migrations;
- API/events changed;
- tests run and actual results;
- demo steps;
- known limitations;
- any spec divergence.
