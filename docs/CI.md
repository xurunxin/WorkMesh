# Continuous integration

The foundational workflow is both the pull-request verification boundary and a
reusable release gate. Release publication is implemented separately so that
ordinary CI retains read-only repository permissions.

## Triggers and permissions

CI runs for every `pull_request` base branch, including stacked pull requests,
for pushes to `main`, by manual `workflow_dispatch`, and through
`workflow_call` from an exact candidate tag, merge queues, and a weekly full run
(Monday 03:00 Asia/Shanghai). Only pull-request runs
share a concurrency group and cancel an older run for the same pull request.
Push and manual runs keep independent run IDs and are never auto-cancelled.

The workflow has only `contents: read`. It does not use
`pull_request_target`, persist checkout credentials, publish packages or images,
create tags or releases, or mutate repository settings.

Node is pinned to the exact patch in `.node-version`. Corepack activates the
root `packageManager` value, `pnpm@9.15.4`, and installation always uses
`pnpm install --frozen-lockfile`. The only dependency cache is pnpm's content
addressed store; `node_modules`, build output, and framework caches are not
cached.

## Change selection and required job graph

`changes` reads the actual PR merge-base/head or main before/after range with
complete Git history. It checks whitespace in that range and runs the selection
and aggregation regression tests with Node's built-in runner, without installing
dependencies. It produces a JSON plan and one explicit boolean per job.

| Change | Checks |
| --- | --- |
| Known prose under `docs/`, root README/AGENTS/CONTRIBUTING/CHANGELOG/LICENSE | `changes` and `Required CI`; no dependency install, builds, unit suites or services |
| Code PR in a workspace | Changed packages and transitive consumers; typecheck/build also include dependencies; relevant integration, E2E and protocol jobs |
| UI/web PR | UI/web source checks and the complete existing browser suite; unrelated DB/API/worker/recovery/protocol suites are skipped |
| API or worker PR | Relevant integration, complete browser acceptance and restored-production recovery; worker changes also run API integration because its fixtures import worker implementations |
| Shared contracts, root/configuration/scripts/lockfile, unknown or removed workspace | Broad dependent checks or full acceptance; unknown paths always use full acceptance |
| Main code push, manual, weekly, merge queue, release-candidate reuse | Full acceptance |

The small Markdown exception list in `scripts/ci-policy.mjs` retains full checks
for generated route policy, release/version policy, release operations and the
coordination ADR/plan that are inputs to executable validators or contract tests.
Runtime Skills and assets never receive the prose exemption. Empty diffs,
invalid event metadata and unavailable Git history fall back to full acceptance.

All seven selected check jobs depend only on `changes`, so service setup and
integration/browser tests can overlap typechecking, builds and unit tests:

- `db-integration` uses its own PostgreSQL 16 test database.
- `api-integration` uses its own PostgreSQL 16 test database plus isolated
  RustFS object storage and a signed-request bucket initialization step.
- `worker-integration` uses its own PostgreSQL 16 test database. The current
  worker integration suites do not require Redis.
- `e2e` uses its own PostgreSQL 16 test database, installs only Playwright
  Chromium, and runs the existing acceptance suite.
- `recovery-integration` uses isolated source and empty target PostgreSQL 16
  databases plus versioned RustFS buckets, restores a complete authenticated
  bundle, and starts the restored API, Worker, and Web for an Agent heartbeat.
- `agent-smoke` exercises SDK construction and protocol/adaptor smoke paths,
  then runs the Agent Collaboration Client Profile suite through Native HTTP
  and MCP reference drivers for Codex-, OpenCode-, and pi-style behaviors. It
  retains JSON, JUnit, and full transcript evidence. It does not prove a live
  provider-backed workflow execution.

`required-ci` runs with `always()` after `changes` and all seven check jobs.
It requires successful classification, `success` for every selected job, and
`skipped` only for jobs explicitly excluded by the plan. A missing plan, missing
result, failure, cancellation, or unplanned skip fails the gate, giving branch
protection one stable aggregate check name when an administrator configures it.
This repository change does not itself modify branch-protection settings.

Workflow-level path filters are deliberately avoided: GitHub leaves their
required checks pending when the workflow is skipped. See the official
[required-check guidance](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

The source job runs the CI validator, selected source tasks, generated route
policy and both Skill validators, quiet Compose validation, and a final clean
tracked-tree check. `pnpm ci:source` runs lint only where it differs from
typecheck: all current packages use `tsc --noEmit` for both, so CI executes that
check once. Contracts and SDK unit tests run once in the selected unit suites;
`smoke:agents:ci` retains both construction smoke commands and the conformance
job retains all protocol drivers. Local `smoke:agents` keeps its self-contained
SDK test. Theme E2E runs once in the authenticated project, so protected routes
are actually checked instead of checking an anonymous redirect to login.
No behavioral assertions are deleted.

`format:check` is deliberately absent: the repository has
no accepted formatting baseline and introducing one would mechanically touch
about 139 existing files. That work is deferred to Issue #10B or a separate
mechanical pull request.

## Logs, artifacts, and retries

Every job has an explicit timeout and no automatic retry or
`continue-on-error`. Re-run a failed job only after classifying the failure as a
product regression or an infrastructure problem; a rerun does not replace the
original evidence.

Raw command logs are uploaded with `always()` and retained for 14 days. Missing
raw-log paths fail the upload step instead of producing a warning. Jobs with
service containers also capture container logs on failure. E2E additionally
uploads `playwright-report` and `test-results` for 14 days, and missing
Playwright evidence also fails its upload step. A dedicated failure-only service
log upload may use `if-no-files-found: ignore`, because a failed setup can leave
no service container to inspect. Artifact paths are allowlisted and never include
environment files, database dumps, object-storage contents, `node_modules`, or
general workspace archives.

## Local commands

The workflow policy and static structure can be checked without services:

```text
pnpm ci:validate
pnpm ci:test
pnpm ci:source typecheck
pnpm ci:source build
pnpm ci:source test
```

`CI_PACKAGES` may be a JSON array of known workspace names for reproducing a PR
scope. Without it, `ci:source` selects all packages. `--dry-run` prints Turbo's
actual task selection. The existing `lint`, `typecheck`, `test`, integration and
E2E commands remain available as complete local checks.

The production Compose and runtime-startup contract requires a working Docker
daemon and installed dependencies. It runs in the protected release preflight
before any immutable image publication and can be checked locally with:

```text
pnpm validate:production-images
```

Each destructive integration command still fails closed unless
`RUN_INTEGRATION=1` and `DATABASE_URL` names a dedicated database containing
`test`:

```text
pnpm test:integration:db
pnpm test:integration:api
pnpm test:integration:worker
pnpm test:integration:recovery
```

The aggregate `pnpm test:integration` preserves the established order: database,
API, worker, then recovery. Recovery uses separate source and empty target test
databases plus a versioned object-store test bucket. The hosted
`recovery-integration` job also builds and starts the restored API, Worker, and
Web and performs a durable Agent Session heartbeat.

### Local integration prerequisites

CI supplies these variables in `.github/workflows/ci.yml`. Running the same
suites on a workstation needs the same shape, plus two details that are not
obvious from the Compose file:

- `docker-compose.yml` publishes PostgreSQL and object storage to the host but
  **not Redis**. `redis://127.0.0.1:6379` is refused, and the container bridge
  address is not routable from the Docker Desktop host. Publish a Redis on
  `127.0.0.1:6379` before running the suites.
- The authentication rate limiter falls back to low development defaults
  (`30/60/40/8/5`). The Agent Connection pairing route exceeds the endpoint
  burst within a single suite run and returns `429 AUTH_RATE_LIMITED`, which
  then cascades into unrelated fixture failures.

```text
RUN_INTEGRATION=1
DATABASE_URL=postgres://workmesh:<password>@127.0.0.1:5432/workmesh_api_integration_test
REDIS_URL=redis://127.0.0.1:6379
SESSION_SECRET=<at least 32 characters>
WORKMESH_BOOTSTRAP_TOKEN=<explicit test fixture>
WORKMESH_MASTER_KEY=<64 hex characters>
AUTH_RATE_LIMIT_ENDPOINT_BURST=10000
AUTH_RATE_LIMIT_SOCKET_BURST=10000
AUTH_RATE_LIMIT_CLIENT_IP_BURST=10000
AUTH_RATE_LIMIT_SUBJECT_BURST=1000
AUTH_RATE_LIMIT_INSTALL_BURST=100
S3_ENDPOINT=<url>
S3_BUCKET=<bucket>
S3_REGION=<region>
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_FORCE_PATH_STYLE=true
```

`WORKMESH_MASTER_KEY` is required even though `loadConfig` does not declare it:
the auth idempotency envelope derives its AES-256-GCM replay key from it, and a
missing value surfaces as `409 IDEMPOTENCY_REPLAY_UNAVAILABLE` on the first
authentication mutation rather than as a configuration error.

`PAGINATION_CURSOR_KEYS` and `PAGINATION_CURSOR_ACTIVE_KID` stay unset outside
production; the loader then falls back to an ephemeral development key.

Every database name must contain a standalone `test` segment.
`scripts/require-integration-env.mjs` enforces that before any destructive
reset, so keep `workmesh_db_integration_test`, `workmesh_api_integration_test`,
`workmesh_worker_integration_test`, and the recovery source/target databases
separate from any development database.

## Release enforcement

`.github/workflows/release-candidate.yml` accepts only a tag matching
`v1.0.0-rc.N`. It calls this workflow first, then runs dependency, source,
configuration, and secret scanning. Only after those gates pass may the four
production images enter the protected `stable-release` environment. Every
image is scanned before publication; High or Critical findings fail the run.

The candidate record contains the exact commit, lockfile and migration-manifest
hashes, feature registry, image digests, SPDX SBOMs, Sigstore bundles, and GitHub
build/SBOM attestations. A manual `failure_probe=true` dispatch fails in the
read-only validation job before CI, environment admission, package write, tag,
or Release creation. No job uses automatic retry or `continue-on-error`.

`.github/workflows/promote-ga.yml` downloads and verifies the candidate record,
signatures, SBOMs, and registry digests. It retags those exact manifests as
`v1.0.0`, compares every observed digest, and contains no build or dependency
installation command. See [Release operations](operations/releases.md).
