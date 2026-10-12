# WorkMesh 1.0

中文接口接入从 [API/MCP 接入手册](docs/integration/README.md)开始。
Human 登录、Agent 配对、MCP 身份、可运行示例和恢复均以纯后端入口说明。
接口或功能变更按[文档同步规则](docs/documentation-maintenance.md)同次更新。

WorkMesh is a self-hosted collaboration control plane for humans and external
coding agents. Version 1.0 has a Stable core for work management, scoped Agent
execution, human-visible collaboration, and governed Git delivery. Optional
Beta and Experimental capabilities are explicit, default-disabled deployment
choices; their presence does not widen identity, delegation, resource, approval,
lease, revision, or idempotency authority.

## 1.0 release contract

WorkMesh server `1.0.0` exposes REST API `1.0`, Agent Protocol `1.0`, MCP server
`1.0.0`, the version-isolated upstream A2A `0.3` adapter, and database schema
baseline `1`, Agent Collaboration Client Profile `1.0`, and conformance suite
`1.0`. `GET /api/v1/info` is public and returns only those versions, the
schema baseline, and `WORKMESH_BUILD_SHA` (or `unknown`); it never returns
deployment secrets. Authenticated `GET /api/v1/features` returns only the
deployment flag, support tier, and enabled state of non-stable capabilities. It
is not an inventory of every shipped Stable capability.

An exact Agent Session can negotiate `GET /api/v1/agent-capabilities` (or MCP
`workmesh://agent/capabilities`). Its operations are generated from the same
route-policy, feature, and MCP binding registries used by runtime enforcement;
the manifest never grants authority. See the
[Agent Collaboration Client Profile](docs/AGENT_COLLABORATION_CLIENT_PROFILE.md)
and run `pnpm test:conformance` for Native/MCP JSON, JUnit, and transcript
evidence across Codex-, OpenCode-, and pi-style public behavior fixtures.

All Beta and Experimental flags default to `false`. Enabling a flag exposes a
deployment capability but grants no authorization. Disabled API routes return a
structured `FEATURE_DISABLED` only after normal authentication. The API,
worker, SDK/MCP adapters all use this registry so disabled work is not
admitted, claimed, executed, or presented as enabled. Migrations are never
conditional on feature flags.

Planning (including notifications), Templates, Costs, Gitea, and the Operations
UI are Beta. Automation, Agent Loops, A2A, and external outbound webhooks are
Experimental. The multi-runtime flag is reserved and has no shipped runtime
path. `WORKMESH_BETA_OPERATIONS_UI` is a retained configuration name; the built-in
UI is retired. Each API and worker path remains gated by its own capability.

See [Version and support policy](docs/VERSION_POLICY.md) for the complete
Stable/Beta/Experimental capability boundary, compatibility guarantees, flags,
runtime dependencies, and upgrade policy. See
[v1 release policy](docs/V1_RELEASE_POLICY.md) for RC promotion, supply-chain
evidence, limitations, and GA criteria.

## Clean start

1. Copy `.env.example` to `.env`, replace every `CHANGE_ME` value, and generate a unique first-install credential with `pnpm bootstrap:token` for `WORKMESH_BOOTSTRAP_TOKEN`.
2. Run `pnpm install`.
3. Start dependencies: `docker compose up -d postgres redis minio`.
4. Run `pnpm db:migrate`, then call the installation API with the bootstrap token as described in [Backend deployment](docs/backend-only-deployment.md), or run `pnpm db:seed` after setting both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to unique values of at least 12 characters. Seeding fails closed when either variable is missing or invalid; it never uses a default password. Clean installs and supported pre-v1 upgrades use the atomic, checksummed runner described in [Database migrations](docs/operations/migrations.md).
5. 先运行 `pnpm --filter @workmesh/api dev`，在 `http://localhost:3001/readyz` 核就绪。后台任务与 MCP 按各自配置单独启动；根 `pnpm dev` 要求所有 workspace 的运行配置已就绪。

For a source-built local container stack, copy `.env.example` to `.env`, replace every `CHANGE_ME` value (including a generated `WORKMESH_BOOTSTRAP_TOKEN`, the 32-byte webhook-encryption key, and both seed admin variables if you intend to seed), then run `docker compose up --build`. The local Compose file runs the one-shot `migrate` service before API/worker and does not seed data automatically. Complete first install through the API, or run the explicit `pnpm db:seed` command when seed data is desired. API readiness is available at `http://localhost:3001/readyz`.

Production uses the separate `docker-compose.production.yml`, explicit full GHCR application-image references, compiled runtime entrypoints, and fail-closed secrets. Exact-SHA tags are accepted for pre-release validation; immutable digests are preferred for releases. It never builds application images on the deployment host. See [Production container deployment](docs/production-deployment.md) for image publishing, configuration, clean install, readiness, restart, SIGTERM drain, and runtime inspection.

Validate the same environment file that production Compose will consume:

```powershell
pnpm validate:production-images --env-file=.env.production
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

MCP 按部署选择 Coordination 或静态 Session 模式。Coordination 在 API/MCP 启用
`WORKMESH_BETA_COORDINATION_MCP=true`，清空静态凭据，并使用逐请求安装 header。
静态模式配置准确 Session Token 和独立 MCP access token。通过
`docker compose --profile agent up -d mcp` 启动；默认绑定
`127.0.0.1:${MCP_HOST_PORT:-3002}`。详见[MCP 接入](docs/integration/mcp.md)。

## Container deployment security

The development Compose file is safe for local self-hosting by default: PostgreSQL and API ports bind only to `127.0.0.1`; Redis and the S3-compatible artifact store have no host port. Its development fallbacks are public defaults and must never be used outside a disposable local machine. The production Compose file has no credential fallbacks and adds a fixed non-root identity, read-only application filesystems, dropped capabilities, disabled privilege escalation, and no-exec temporary storage.

Before a persistent or production deployment, create `.env` from `.env.example`, set unique PostgreSQL/artifact-storage passwords, a random `SESSION_SECRET` of at least 32 bytes, and a distinct `WORKMESH_BOOTSTRAP_TOKEN` generated by `pnpm bootstrap:token`; set `SESSION_COOKIE_SECURE=true`, `WEB_ORIGIN` to the externally visible HTTPS origin. Do not commit `.env` or pass secrets through image build arguments; `.dockerignore` excludes it from the image context.

Put a TLS-terminating reverse proxy in front of the loopback-bound API/MCP ports. Configure the proxy to expose only the intended public routes, preserve SSE streaming, and restrict administrative network access. Do not publish PostgreSQL, Redis, or MinIO directly to the internet. If a non-default host port is required locally, use `POSTGRES_PORT`, `API_HOST_PORT`, or `MCP_HOST_PORT` in `.env`.

## Operations

- `pnpm db:create-admin <email> <password> [name]` creates another human admin after installation.
- `pnpm db:backup <new-bundle-directory>` captures an authenticated, AES-256-GCM encrypted PostgreSQL plus object-version recovery bundle; `pnpm db:restore <bundle-directory>` restores only to an empty database and bucket. Both keys and a confirmed maintenance window are required. See [Complete backup and disaster recovery](docs/operations/disaster-recovery.md).
- `pnpm --filter @workmesh/worker repair:executor-projections` transactionally rebuilds the Work Item active-executor read model from authoritative Lease, Session, and delegation rows. See [Active Executor projection repair](docs/operations/active-executor-projections.md).
- Workspace, Team, and Project Guidance is independently versioned; Human administrators manage it through REST while Agent SDK/MCP clients have read-only access. See [Versioned Guidance operations](docs/operations/guidance.md).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm test:conformance` are the project gates.
- `pnpm test:conformance -- --output <directory>` runs the adapter-neutral Native/MCP client profile suite and writes JSON, JUnit, and a full transcript.
- [Continuous integration](docs/CI.md) documents the required GitHub Actions job graph, exact toolchain pins, retained evidence, security thresholds, and release enforcement. [Release operations](docs/operations/releases.md) covers the failure probe, signed RC evidence, final soak handoff, and digest-preserving GA promotion.

## Acceptance commands

Integration tests are destructive only to a dedicated database whose name contains `test`; they fail immediately when `RUN_INTEGRATION=1` or `DATABASE_URL` is absent, or if the database name is not marked as a test database. For the local Compose PostgreSQL instance, create it once with `docker exec workmesh-postgres-1 createdb -U workmesh workmesh_test`.

```powershell
$env:RUN_INTEGRATION = '1'
$env:DATABASE_URL = 'postgres://workmesh:workmesh@localhost:5432/workmesh_test'
$env:SESSION_SECRET = 'acceptance-test-session-secret-0123456789'
$env:WORKMESH_BOOTSTRAP_TOKEN = pnpm --silent bootstrap:token
pnpm test:integration
```

## Security and realtime

Password hashes use Argon2id. Browser authentication uses an opaque HttpOnly cookie, `SameSite=Lax`, configurable `Secure`, and a server-issued CSRF token required for authenticated writes. Every mutation requires `Idempotency-Key`; revisioned resources also require `If-Match: "revision-N"`.

SSE uses `GET /api/v1/events/stream?cursor=N` or `Last-Event-ID`; its source is PostgreSQL `domain_events`. Each successful domain command changes state and writes its event plus outbox row in one transaction. The worker claims outbox rows using `FOR UPDATE SKIP LOCKED` and reclaims timed-out locks.

## Work management

REST clients read humans, projects, work items, comments and saved/built-in views. Built-in views are My Work, Active and Backlog. List filtering accepts team, status, project, priority, responsible human, label, exact identifier and PostgreSQL full-text/trigram search. Revisioned PATCH/DELETE calls use the ETag returned by reads; nullable fields such as descriptions, due dates, project, responsible human, project lead and target date can be explicitly cleared with JSON `null`. A started work item cannot clear its responsible human.

## 后端能力与后续范围

项目长期对外交付 API/MCP。内置 WebUI 和 Service Worker 已退役，Human 仍使用 Cookie 与 CSRF，Web Push 的订阅注册、撤销及 worker 投递合同保留。通知链接返回鉴权 JSON，不包含凭据或登录页面。后续功能以 API/MCP 及必要后端测试验收，并在接口或功能变更时同步文档。

[纯后端部署说明](docs/backend-only-deployment.md)记录安装及入口；[后续逐卡去向](docs/plan/backend-only/followup-impact.md)保留来源和待实施范围。退役已由 PR 222 合入，接入手册沿当前主线编写。后续功能继续按已批准顺序实施。既有 Beta/Experimental 默认关闭及授权边界保持不变。
