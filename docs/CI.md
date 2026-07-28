# Continuous integration

Issue #10A adds one foundational GitHub Actions workflow. It is intentionally a
test and verification boundary, not a release pipeline.

## Triggers and permissions

CI runs for every `pull_request` base branch, including stacked pull requests,
for pushes to `main`, and by manual `workflow_dispatch`. Only pull-request runs
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

`source-gates` must pass before the five constituent jobs start:

- `db-integration` uses its own PostgreSQL 16 test database.
- `api-integration` uses its own PostgreSQL 16 test database plus isolated
  MinIO storage and an `mc` bucket initialization step.
- `worker-integration` uses its own PostgreSQL 16 test database. The current
  worker integration suites do not require Redis.
- `e2e` uses its own PostgreSQL 16 test database, installs only Playwright
  Chromium, and runs the existing acceptance suite.
- `agent-smoke` exercises SDK construction and protocol/adaptor smoke paths. It
  does not prove a live provider-backed workflow execution.

`required-ci` runs with `always()` after `source-gates` and all five constituent
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

Each destructive integration command still fails closed unless
`RUN_INTEGRATION=1` and `DATABASE_URL` names a dedicated database containing
`test`:

```text
pnpm test:integration:db
pnpm test:integration:api
pnpm test:integration:worker
```

The aggregate `pnpm test:integration` preserves the established order: database,
API, then worker. Each constituent command resets only its dedicated test
database before running.

## Deferred beyond Issue #10A

Issue #10A does not implement release or RC automation, tag creation, image
build or publication, package publication, provenance/signing/SBOM generation,
deployment, required-check or branch-protection administration, clean or
five-stage upgrade validation, database plus object-storage backup/restore
validation, recovery or rollback evidence, or the formatting-baseline migration.
Those operational acceptance surfaces remain assigned to Issues #8, #11, #10B,
or later work and must not be inferred from a green `required-ci` result.
