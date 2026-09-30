# Lite single-node self-hosted deployment class

Status: Proposed

## Context

`docker-compose.production.yml` is a release-grade contract: four application
images pinned by GHCR digest, a matching release manifest, one-shot
`migrate` and `minio-init` steps, the same non-root read-only hardening on
every application container, and an RC workflow that gates the composition.
It is the right shape for a shared or long-lived environment.

It is the wrong shape for the other half of the audience: one person, one
device, a home LAN or a small always-on box, and no second operator to run
`validate-production-images` or rotate a digest ring. The current class also
cannot be installed on a weak device at all, for three concrete reasons.

1. **The device cannot build the application.** `web.production.Dockerfile`
   runs a full Next.js production build. On a low-power CPU that is minutes of
   wall clock and multiple gigabytes of peak build memory, and it is the only
   way that image comes into existence. The production class assumes a
   workstation or CI runner performs the build, which is correct, but it means
   the operator needs a registry, a digest, and a pull path even to run a solo
   instance.
2. **Four images multiply the operational surface.** A solo operator must
   build, tag, publish, resolve, and keep four digests aligned with one
   `WORKMESH_BUILD_SHA`. Nothing about the application requires four
   independent artifacts; they exist because each role was built separately.
3. **The default footprint leaves too little headroom.** Six long-running
   services (PostgreSQL, Redis, RustFS, API, Worker, Web) plus an optional MCP
   and Agent Runner is a lot of resident memory for a 1-2 GB device. The
   `agent` profile is the worst offender and the least necessary there.

What actually consumes memory is Node processes, not containers. A container
costs a few megabytes; a Node process costs 100-250 MB. Any design that claims
to lighten the box by merging containers, while still running the same number
of Node runtimes, has not saved anything. The design below is explicit about
which levers are operational and which are real.

## Decision

WorkMesh gains a second, non-release deployment class, **Lite**, for a single
operator on a single device. Lite is additive: `docker-compose.production.yml`
remains the release contract and is unchanged.

### One image, three roles

A new `infra/docker/lite.Dockerfile` produces **one** image that contains the
API, Worker, and Web runtimes at `/opt/workmesh/{api,worker,web}`. The existing
`WORKMESH_SERVICE` environment variable selects the role, and
`infra/docker/entrypoint.sh` dispatches to it. The dispatch mechanism already
exists: `infra/docker/runtime-guard.mjs` validates the per-role configuration
set, and `WORKMESH_SERVICE` is already the production discriminator for `api`
and `worker`. Lite extends it to `web` and adds a `migrate` role that runs
`@workmesh/db` migrations from the same tree.

This is an **operational** saving, not a memory saving: one build on a
workstation, one `docker save` / `docker load` over a USB stick or `scp`, one
tag, no registry, no digest ring, no manifest alignment. Memory is unchanged
because the same three Node runtimes still run.

### The box runs the control plane only

The Agent Runner does not run on a Lite device, and neither does MCP by
default. This is the largest real saving, and it is also a security invariant
rather than a compromise: `AGENTS.md` requires that untrusted code runs in an
external runner and never in the API or web process. An isolated runner needs a
real operating-system isolation boundary, which a resource-capped container on
the same small host is not. The operator runs the Runner and, if wanted, MCP on
their own machine and points them at the box over the LAN. The runner already
reaches the control plane over HTTP with an installation token, so nothing
about the protocol changes.

### Data services are tuned, never weakened

PostgreSQL stays the durable source of truth and RustFS stays the artifact
store; neither can be removed. Three code facts pin this down:

- `packages/config` requires `REDIS_URL`
  (`loadRealtimeRedisHintConfig`, `packages/config/src/index.ts:256`), so
  Redis cannot be dropped even though the realtime path has a
  `NoopWakeSource` fallback (`apps/api/src/realtime/wake-source.ts:82`).
- The auth rate limiter **fails closed**: any store error becomes
  `AuthRateLimitUnavailableError`
  (`apps/api/src/auth-rate-limit/limiter.ts:194`), which rejects the request.
  Removing Redis removes the ability to log in.
- `artifactStorageFromEnvironment` constructs an `S3ArtifactStorage` and
  nothing else (`packages/artifact-storage/src/index.ts:480`), and the recovery
  path fails closed with `RECOVERY_TARGET_OBJECT_LOCK_REQUIRED` without
  versioning and Object Lock.

So Lite tunes rather than substitutes:

- **PostgreSQL** runs on the stock image with command-line flags only, no
  custom `postgresql.conf`: `shared_buffers=32MB`,
  `effective_cache_size=192MB`, `work_mem=1MB`,
  `maintenance_work_mem=16MB`, `max_connections=20`, `track_activities=off`,
  `max_worker_processes=2`, `max_parallel_workers=0`,
  `max_parallel_workers_per_gather=0`, `max_wal_size=256MB`,
  `min_wal_size=64MB`, `checkpoint_completion_target=0.9`,
  `statement_timeout=30s`, `idle_in_transaction_session_timeout=30s`,
  `log_min_duration_statement=1000`. `track_activities=off` is the single
  largest shared-memory saving, because that memory is allocated per
  `max_connections` slot. `synchronous_commit` and `fsync` are **not** touched:
  they are durability settings, and they are cheap on an SSD.
- **Redis** drops AOF persistence and keeps a single RDB snapshot
  (`--appendonly no --save "900 1"`). Both of its roles are lossy by design:
  domain-event stream entries are wake hints that PostgreSQL reconciliation
  re-derives, and rate-limit token buckets are rebuilt from empty on restart.
  The stream stays bounded by the existing
  `WORKMESH_REALTIME_REDIS_MAXLEN`, which Lite lowers to `10000`; Lite does
  **not** set `maxmemory`, because a full Redis makes the fail-closed limiter
  reject logins, and an uncapped Redis whose only growth driver is already
  bounded by `MAXLEN` is the smaller and safer failure surface.
- **RustFS** is unchanged, because Object Lock and COMPLIANCE retention are
  invariants rather than tuning.
- **Retention cadence** is relaxed: `WORKMESH_RETENTION_INTERVAL_SECONDS`
  moves from `3600` to `21600` so archive traffic does not compete with the UI
  on a slow disk. `WORKMESH_RETENTION_CLEANUP_ENABLED` and
  `WORKMESH_EVENT_PRUNE_ENABLED` stay `false`.

### Resource caps follow the heap, not the other way round

Every Lite service gets `mem_limit` plus `json-file` log caps
(`max-size: 10m`, `max-file: 3`), because an uncapped `json-file` log is the
ordinary way a small disk fills up.

Each Node role runs with `--max-old-space-size` set **below** its container
`mem_limit`. The ordering is the whole point: V8 garbage-collects under heap
pressure, but the kernel OOM-kills at the cgroup limit. A heap that reaches the
container limit means the process dies without a clean shutdown instead of
collecting. Role targets, to be confirmed by measurement rather than assumed:

| role   | `--max-old-space-size` | `mem_limit` |
| ------ | ---------------------- | ----------- |
| api    | 320 MB                  | 640 MB      |
| worker | 256 MB                  | 448 MB      |
| web    | 256 MB                  | 448 MB      |

### Correction (2026-09-30): the per-role estimates were roughly 2x too high

Measured on the x86_64 OpenWrt gateway that runs the **production** class, which is a
heavier topology than Lite (it also runs MCP and the webhook bridge):

| service | measured resident | the estimate above |
| --- | --- | --- |
| api | 61 MB | 150-250 MB |
| worker | 70 MB | 120-200 MB |
| web | 103 MB | 120-200 MB |
| PostgreSQL (after migrations) | 186 MB | 60-90 MB |
| object store | 84 MB | 20-40 MB |
| Redis | 7 MB | 8-15 MB |
| **total** | **621 MB** | **478-795 MB** |

The Node roles are roughly a third to a half of what this table claimed, which is
the number that matters. The total happens to land inside the range only because
PostgreSQL overran its estimate by more than the application roles underran
theirs, and that offset is not something to rely on.

Two conclusions follow, and the second is the important one:

1. The 0.5-0.8 GB figure for a Lite topology is probably also too high. It has
   still not been measured, and `docs/operations/lite-footprint.md` remains the
   gate for it.
2. **The case for Lite is not a memory case.** The design already said the single
   image is an operational saving, not a memory saving; this measurement makes the
   operational half the whole case. Anyone choosing between a production compose
   and a Lite compose for memory reasons is choosing on a number that was never
   real.

`mem_limit` and the heap-below-cgroup relationship remain correct and are still
enforced by `scripts/validate-lite-compose.mjs`; only the expected resident
figures were wrong.

These numbers are design targets, not measurements. The acceptance gate is
`docs/operations/lite-footprint.md`, produced by re-running
`deploy/lite/measure.sh` on the target device.

### Ingress is optional

Web already proxies `/api`, `/auth`, `/sse`, `/mcp`, and `/.well-known` to the
API upstream (`apps/web/next.config.ts`), which is exactly what keeps the
session cookie first-party. Therefore:

- **LAN-only, no TLS** (the default): bind `WORKMESH_BIND_ADDRESS=0.0.0.0`, set
  `SESSION_COOKIE_SECURE=false`, and publish only Web on `3000`. No reverse
  proxy at all. PostgreSQL, Redis, and RustFS stay unpublished or bound to
  loopback.
- **LAN with TLS**: add Caddy with an internal CA, one container, and keep
  `SESSION_COOKIE_SECURE=true`. Caddy replaces the nginx-plus-certbot pair
  that the production class implies.
- **Never** publish PostgreSQL, Redis, or RustFS to the internet from a Lite
  device.

### Lite is not a release class

Lite uses exact local tags (`workmesh-lite:<40-hex-sha>`), never floating tags
and never digests. It is not covered by `scripts/validate-production-images.mjs`
(that script targets `docker-compose.production.yml` only) and is not gated by
the RC workflow. What Lite **does** keep is the full
`x-app-hardening` baseline from `docker-compose.production.yml`:
`read_only`, non-root `10001:10001`, `cap_drop: [ALL]`,
`no-new-privileges`, and a 64 MB `noexec` `tmpfs` on `/tmp`. Lite drops release
provenance, not hardening. The validator invariant to preserve is that no
change to the production compose or its validator is required to ship Lite.

### Backup on a box that has no source tree

`pnpm db:backup` and `pnpm db:restore` (`@workmesh/recovery`) assume a
checkout, which a Lite device does not have. Lite instead ships two host
scripts: `deploy/lite/backup.sh` takes a `pg_dump -Fc` of `DATABASE_URL` and
tars the RustFS volume directory, and `deploy/lite/restore.sh` reverses it.
Because the box is single-node with local disk, copying the volume directory is
a complete artifact backup and needs no S3 client. The rehearsal is the
retained gate: restore into a scratch database and compare row counts, which is
the same property `@workmesh/recovery` already asserts in integration tests.

## Alternatives

- **Tune `docker-compose.production.yml` in place.** Rejected: it is a
  digest-pinned release contract with an RC gate and a dedicated validator.
  Adding caps, weaker persistence, and tag-based images would silently change
  the meaning of every release.
- **Drop Redis on the box.** Rejected on evidence: `REDIS_URL` is required by
  the config schema and the auth limiter fails closed, so the symptom would be
  a login that cannot succeed. This is a code change with a security
  consequence, not a configuration change.
- **Replace RustFS with a filesystem artifact driver.** Rejected: the artifact
  store has one implementation, and the retention and recovery paths depend on
  S3 versioning, Object Lock, COMPLIANCE retention, and legal hold. RustFS is
  also among the cheapest processes on the box.
- **Merge the Worker into the API container to save memory.** Rejected as
  stated: it saves a few megabytes of container overhead and nothing else. The
  memory-relevant version is running the Worker runtime *inside the API Node
  process*, which is a code change with an availability cost; see below.
- **Serve the SPA from the API with no Web runtime.** Rejected for v1: it needs
  `output: 'export'` plus static serving in Fastify, and it is the highest-risk
  of the three deferred changes. Recorded as Tier 0.
- **Native systemd install, no containers.** Rejected for v1: it avoids
  `dockerd` overhead but multiplies the installation surface by every
  underlying package and gives up the hardened rootfs. Worth revisiting if
  measured `dockerd` overhead is a material share of the footprint.

## Consequences

A solo operator can install, upgrade, and roll back WorkMesh on one weak device
with a USB stick and a text editor, while the release class keeps every property
it has today.

The supported floor is stated honestly: **2 GB RAM plus at least 512 MB of swap
is the Lite minimum, and a 1 GB device is not supported by the current
architecture.** Three Node runtimes plus PostgreSQL, Redis, and RustFS do not
fit below that, and no amount of Compose tuning changes the Node runtimes
themselves.

Two changes would change that answer, and both are deliberately out of scope
for this ADR. They are recorded here so the Lite class has an explicit upgrade
path rather than an implicit ceiling.

- **Tier 0a: embed the Worker runtime in the API process.** The Worker is
  already a set of factories plus a runtime handle
  (`createAgentWebhookWorker`, `createSessionLifecycleWorker`,
  `createProviderActionWorker`, `createArtifactUploadWorker`,
  `createAutomationWorker`, `createRetentionWorker`,
  `createAgentConnectionLifecycleWorker`, `WorkerRuntime`, and
  `createWorkerHealthServer` in `apps/worker/src/index.ts` and
  `apps/worker/src/runtime.ts`), so the seam exists. Saving: one Node runtime,
  roughly 120-200 MB. Cost: an API crash also stops delivery, and per-role heap
  caps collapse into one. Gate: the existing outbox-recovery integration test.
- **Tier 0b: static-export Web and serve it from the API.** The
  `WORKMESH_WEB_SAME_ORIGIN_API=1` path in `apps/web/next.config.ts` already
  models single-origin serving, so this is the supported direction rather than
  a new one. Saving: one Node runtime, roughly 120-200 MB, and the rewrite
  proxy leaves the request path. Cost: asset paths, CSP, and SPA fallback
  routing. Gate: the existing E2E suite.

Both together would target roughly 0.25-0.45 GB idle and make a 1 GB device
viable. Each needs its own ADR when it is actually attempted.

The deliberate cost of Lite is a weaker brute-force window: a Redis restart
resets rate-limit token buckets. On a LAN-only box with one administrator this
is accepted and written down, and it is the same trade the production class
already makes by treating Redis as a lossy hint store.

## Migration

No database migration and no data migration. Lite reads and writes the same
schema as the production class, so an existing instance can be moved by
pointing a Lite compose at the same volumes, and a Lite instance can be moved
back by pointing the production compose at the same volumes.

Upgrade on the device is four steps, none of which need a registry:

1. On a workstation, build the Lite image for the target revision and
   `docker save | gzip` it.
2. Copy the archive to the device and `docker load` it.
3. Update `WORKMESH_LITE_IMAGE` in `.env.lite`, run the `migrate` one-shot,
   then replace `api`, then `worker`, then `web` in that order.
4. Keep the previous tag in the environment file. Rollback is the same command
   with the old tag. A migration is not automatically reverted, so take a
   `backup.sh` run before step 3.

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and
`pnpm test:e2e` must stay green throughout, and `scripts/validate-ci.mjs` and
`scripts/validate-release-workflows.mjs` must not need a Lite exemption.

## Spec changes

- `docs/production-deployment.md` gains a short pointer stating that the Lite
  class exists and is not a release class, so the production document stays
  the single description of the release path.
- `docs/operations/lite-footprint.md` is new and holds the measured numbers,
  the device, and the `measure.sh` output. It is the acceptance gate for the
  2 GB claim, not an aspiration.
- `AGENTS.md` gains a one-line mention in the setup commands that Lite exists
  for a single-operator device, with a pointer to the ADR.
- `README.md` describes the two classes and when to choose each.
