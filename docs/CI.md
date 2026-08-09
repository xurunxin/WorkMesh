# Continuous integration

The foundational workflow is both the pull-request verification boundary and a
reusable release gate. Release publication is implemented separately so that
ordinary CI retains read-only repository permissions.

## Triggers and permissions

CI runs for every `pull_request` base branch, including stacked pull requests,
for pushes to `main`, by manual `workflow_dispatch`, and through
`workflow_call` from an exact candidate tag. Only pull-request runs
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

## Required job graph

`source-gates` must pass before the six constituent jobs start:

- `db-integration` uses its own PostgreSQL 16 test database.
- `api-integration` uses its own PostgreSQL 16 test database plus isolated
  MinIO storage and an `mc` bucket initialization step.
- `worker-integration` uses its own PostgreSQL 16 test database. The current
  worker integration suites do not require Redis.
- `e2e` uses its own PostgreSQL 16 test database, installs only Playwright
  Chromium, and runs the existing acceptance suite.
- `recovery-integration` uses isolated source and empty target PostgreSQL 16
  databases plus versioned MinIO buckets, restores a complete authenticated
  bundle, and starts the restored API, Worker, and Web for an Agent heartbeat.
- `agent-smoke` exercises SDK construction and protocol/adaptor smoke paths,
  then runs the Agent Collaboration Client Profile suite through Native HTTP
  and MCP reference drivers for Codex-, OpenCode-, and pi-style behaviors. It
  retains JSON, JUnit, and full transcript evidence. It does not prove a live
  provider-backed workflow execution.

`required-ci` runs with `always()` after `source-gates` and all six constituent
jobs. It succeeds only when every dependency result is `success`, giving branch
protection one stable aggregate check name when an administrator configures it.
This repository change does not itself modify branch-protection settings.

The source job runs the CI validator, lint, typecheck, the contracts package
tests explicitly, build, unit tests, `docker compose config`, and a final clean
tracked-tree check. `format:check` is deliberately absent: the repository has
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
```

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
