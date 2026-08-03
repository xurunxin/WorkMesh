# WorkMesh 1.0

WorkMesh is a self-hosted collaboration control plane for humans and external
coding agents. Version 1.0 has a Stable core for work management, scoped Agent
execution, human-visible collaboration, and governed Git delivery. Optional
Beta and Experimental capabilities are explicit, default-disabled deployment
choices; their presence does not widen identity, delegation, resource, approval,
lease, revision, or idempotency authority.

## 1.0 release contract

WorkMesh server `1.0.0` exposes REST API `1.0`, Agent Protocol `1.0`, MCP server
`1.0.0`, the version-isolated upstream A2A `0.3` adapter, and database schema
baseline `1`. `GET /api/v1/info` is public and returns only those versions, the
schema baseline, and `WORKMESH_BUILD_SHA` (or `unknown`); it never returns
deployment secrets. Authenticated `GET /api/v1/features` returns only the
deployment flag, support tier, and enabled state of non-stable capabilities. It
is not an inventory of every shipped Stable capability.

All Beta and Experimental flags default to `false`. Enabling a flag exposes a
deployment capability but grants no authorization. Disabled API routes return a
structured `FEATURE_DISABLED` only after normal authentication. The API,
worker, Web UI, SDK/MCP adapters all use this registry so disabled work is not
admitted, claimed, executed, or presented as enabled. Migrations are never
conditional on feature flags.

Planning (including notifications), Templates, Costs, Gitea, and the Operations
UI are Beta. Automation, Agent Loops, A2A, and external outbound webhooks are
Experimental. The multi-runtime flag is reserved and has no shipped runtime
path. The Operations UI flag controls only the UI surface; each API and worker
path remains gated by its own capability.

See [Version and support policy](docs/VERSION_POLICY.md) for the complete
Stable/Beta/Experimental capability boundary, compatibility guarantees, flags,
runtime dependencies, and upgrade policy. See
[v1 release policy](docs/V1_RELEASE_POLICY.md) for RC promotion, supply-chain
evidence, limitations, and GA criteria.

## Clean start

1. Copy `.env.example` to `.env`, replace every `CHANGE_ME` value, and generate a unique first-install credential with `pnpm bootstrap:token` for `WORKMESH_BOOTSTRAP_TOKEN`.
2. Run `pnpm install`.
3. Start dependencies: `docker compose up -d postgres redis minio`.
4. Run `pnpm db:migrate`, then either open the web app and complete first install using the bootstrap token or run `pnpm db:seed` after setting both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to unique values of at least 12 characters. Seeding fails closed when either variable is missing or invalid; it never uses a default password. Clean installs and supported pre-v1 upgrades use the atomic, checksummed runner described in [Database migrations](docs/operations/migrations.md).
5. Run `pnpm dev`, then visit `http://localhost:3000`.

For a source-built local container stack, copy `.env.example` to `.env`, replace every `CHANGE_ME` value (including a generated `WORKMESH_BOOTSTRAP_TOKEN`, the 32-byte webhook-encryption key, and both seed admin variables if you intend to seed), then run `docker compose up --build`. The local Compose file runs the one-shot `migrate` service before API/worker and does not seed data automatically. Complete first install in the web app, or run the explicit `pnpm db:seed` command when seed data is desired. API readiness is available at `http://localhost:3001/readyz`.

Production uses the separate `docker-compose.production.yml`, explicit full GHCR application-image references, compiled runtime entrypoints, and fail-closed secrets. Exact-SHA tags are accepted for pre-release validation; immutable digests are preferred for releases. It never builds application images on the deployment host. See [Production container deployment](docs/production-deployment.md) for image publishing, configuration, clean install, readiness, restart, SIGTERM drain, and runtime inspection.

Validate the same environment file that production Compose will consume:

```powershell
pnpm validate:production-images --env-file=.env.production
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

The MCP HTTP adapter is session scoped and therefore opt-in. After creating an Agent Session, set `WORKMESH_SESSION_TOKEN` and `WORKMESH_MCP_ACCESS_TOKEN`, then start it with `docker compose --profile agent up -d mcp`. It binds to `127.0.0.1:${MCP_HOST_PORT:-3002}` and supports `WORKMESH_MCP_MODE=read-only|read-write`. See `docs/agent-integration.md` for MCP Inspector and fake-agent flows.

## Container deployment security

The development Compose file is safe for local self-hosting by default: PostgreSQL, API, and web ports bind only to `127.0.0.1`; Redis and MinIO have no host port. Its development fallbacks are public defaults and must never be used outside a disposable local machine. The production Compose file has no credential fallbacks and adds a fixed non-root identity, read-only application filesystems, dropped capabilities, disabled privilege escalation, and no-exec temporary storage.

Before a persistent or production deployment, create `.env` from `.env.example`, set unique PostgreSQL/MinIO passwords, a random `SESSION_SECRET` of at least 32 bytes, and a distinct `WORKMESH_BOOTSTRAP_TOKEN` generated by `pnpm bootstrap:token`; set `SESSION_COOKIE_SECURE=true`, `WEB_ORIGIN`, and `NEXT_PUBLIC_API_URL` to the externally visible HTTPS origin. Do not commit `.env` or pass secrets through image build arguments; `.dockerignore` excludes it from the image context.

Put a TLS-terminating reverse proxy in front of the loopback-bound web/API ports. Configure the proxy to expose only the intended public routes, preserve SSE streaming, and restrict administrative network access. Do not publish PostgreSQL, Redis, or MinIO directly to the internet. If a non-default host port is required locally, use `POSTGRES_PORT`, `API_HOST_PORT`, or `WEB_HOST_PORT` in `.env`.

## Operations

- `pnpm db:create-admin <email> <password> [name]` creates another human admin after installation.
- `pnpm db:backup <new-bundle-directory>` captures an authenticated, AES-256-GCM encrypted PostgreSQL plus object-version recovery bundle; `pnpm db:restore <bundle-directory>` restores only to an empty database and bucket. Both keys and a confirmed maintenance window are required. See [Complete backup and disaster recovery](docs/operations/disaster-recovery.md).
- `pnpm --filter @workmesh/worker repair:executor-projections` transactionally rebuilds the Work Item active-executor read model from authoritative Lease, Session, and delegation rows. See [Active Executor projection repair](docs/operations/active-executor-projections.md).
- Workspace, Team, and Project Guidance is independently versioned; Human administrators manage it in the Web Guidance view while Agent SDK/MCP clients have read-only access. See [Versioned Guidance operations](docs/operations/guidance.md).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e` are the project gates.
- [Continuous integration](docs/CI.md) documents the GitHub Actions job graph, exact toolchain pins, retained evidence, and capabilities intentionally deferred beyond foundational CI.

## Acceptance commands

Integration and Playwright acceptance tests are destructive only to a dedicated database whose name contains `test`; they fail immediately when `RUN_INTEGRATION=1` or `DATABASE_URL` is absent, or if the database name is not marked as a test database. For the local Compose PostgreSQL instance, create it once with `docker exec workmesh-postgres-1 createdb -U workmesh workmesh_test`.

```powershell
$env:RUN_INTEGRATION = '1'
$env:DATABASE_URL = 'postgres://workmesh:workmesh@localhost:5432/workmesh_test'
$env:SESSION_SECRET = 'acceptance-test-session-secret-0123456789'
$env:WORKMESH_BOOTSTRAP_TOKEN = pnpm --silent bootstrap:token
pnpm test:integration
pnpm test:e2e
```

The Playwright command resets this database with the test-only `packages/db/scripts/reset-test.ts` before starting API and Web on ports 3101 and 3100. It uses installed Chromium and no API mocks.

## Security and realtime

Password hashes use Argon2id. Browser authentication uses an opaque HttpOnly cookie, `SameSite=Lax`, configurable `Secure`, and a server-issued CSRF token required for authenticated writes. Every mutation requires `Idempotency-Key`; revisioned resources also require `If-Match: "revision-N"`.

SSE uses `GET /api/v1/events/stream?cursor=N` or `Last-Event-ID`; its source is PostgreSQL `domain_events`. Each successful domain command changes state and writes its event plus outbox row in one transaction. The worker claims outbox rows using `FOR UPDATE SKIP LOCKED` and reclaims timed-out locks.

## Work management

The UI reads humans, projects, work items, comments and saved/built-in views from the API. Built-in views are My Work, Active and Backlog. List filtering accepts team, status, project, priority, responsible human, label, exact identifier and PostgreSQL full-text/trigram search. Revisioned PATCH/DELETE calls use the ETag returned by reads; nullable fields such as descriptions, due dates, project, responsible human, project lead and target date can be explicitly cleared with JSON `null`. A started work item cannot clear its responsible human.

## Beta and Experimental operations

When `WORKMESH_BETA_OPERATIONS_UI=true`, open
`http://localhost:3000/operations` for the API-backed optional-capability
surface. Each panel also requires its own feature flag. The page shows
current/upcoming/history Cycles, Initiative rollups, Automation Rules and their
dry-run/pause controls, Loops and run state, usage with explicit unknown-cost
counts, and versioned Templates. It never simulates successful execution
locally: controls call the same API commands used by external clients and
refresh the durable state returned by PostgreSQL.

Rules pin an immutable version at admission. Occurrences are deduplicated, dry-runs cannot create effect rows, workers checkpoint every ordered effect with a fencing token, and exhausted retries enter a durable dead-letter state. Loop admission atomically checks live capability/resource authority, no-overlap, and hard budget before it creates both the Automation Run and one real Agent Session. It does not create a synthetic Work Item.

Project-health publications retain confidence, uncertainty, and immutable typed sources. Agent-authored publications additionally require an exact approval. Usage records are append-only; `costSource=unknown` requires an absent `costMinor`, and Initiative rollups, summaries, and Advanced Views never sum unlike currencies. All minor-unit amounts cross the API as canonical decimal strings and are aggregated with integer arithmetic, so values above JavaScript's safe-integer range are never silently rounded. Advanced View filters use a strict allowlist, and any View that exposes, filters, or orders cost requires an explicit currency. Imported JSON templates are sanitized and remain inert drafts until a human activates them.

The built-in scheduler intentionally supports a bounded five-field UTC cron subset (`*`, `*/n`, exact numbers, comma lists, and ranges); other time zones and extended cron syntax are rejected at validation. Hourly and daily notification preferences defer delivery to the next matching window, but do not yet coalesce multiple notifications into a single digest payload.

### Scheduled triage demonstration

1. Start PostgreSQL, Redis, API, worker, and web; run all migrations through `0021_stage4_a2a_direction_and_prompt_identity.sql`.
2. Create an `agent_run` Template and a pinned Template version, then register an active Agent with Team access and the capabilities required by that Template.
3. Create a Loop with a UTC schedule trigger, `noOverlap: true`, a hard budget, and the pinned `runTemplateVersionId`.
4. Use `POST /api/v1/loops/{id}/run` with a unique `Idempotency-Key` and occurrence key to run it immediately, or let the worker admit the next due schedule.
5. Inspect `GET /api/v1/automation-runs?loopId={id}` and `GET /api/v1/automation-runs/{runId}`. The admitted run, Session, delegation, budget reservation, domain events, and outbox records are committed together.
6. Record Session usage with `POST /api/v1/usage-records`; inspect `GET /api/v1/usage-summary`. End the Session to let worker reconciliation project the terminal result and send the configured failure notification if needed.

The deterministic integration form of this demo is:

```powershell
$env:RUN_INTEGRATION = '1'
$env:DATABASE_URL = 'postgres://workmesh:workmesh-local-postgres-change-me@localhost:5432/workmesh_test'
$env:SESSION_SECRET = 'acceptance-test-session-secret-0123456789'
pnpm --filter @workmesh/worker exec vitest run --config ../../vitest.integration.config.ts --maxWorkers=1 integration/stage4-automation.integration.test.ts
pnpm --filter @workmesh/api exec vitest run --config ../../vitest.integration.config.ts --maxWorkers=1 integration/stage4-operations.integration.test.ts
```

The first suite proves duplicate-trigger suppression, one-time action effects, bounded retry/DLQ, overlap and budget cutoffs, rollback, revocation, and scheduled-triage Session/outbox creation. The second proves Cycle carry-over, currency-safe Initiative/View projections, strict View filters, source-linked health, effect-free dry-run, inert template import, and an authorized fake-A2A task progressing through one real Session while inbound sequence and outbound cursor remain independent.
