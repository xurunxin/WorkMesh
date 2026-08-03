# Atomic checksummed v1 migrations

Status

Accepted

Context

The pre-v1 migrator discovered numbered files from the filesystem, let each SQL
file own its transaction, and registered the version afterward. A process loss
between SQL commit and registration could replay non-idempotent DDL. Applied
files also had no durable checksum, and clean installs replayed the full
historical chain.

Decision

Keep the 35 pre-v1 SQL files immutable as a checksummed inventory. Clean v1
installations execute only `v1/0001_v1_baseline.sql`. The generated manifest is
the ordering authority. The runner verifies canonical SHA-256 source checksums,
holds a PostgreSQL session advisory lock, and owns every transaction so SQL and
its `{version, checksum_sha256, applied_at, execution_mode}` registration commit
together.

Five promised pre-v1 endpoints have generated atomic upgrade bundles. The final
pre-v1 endpoint can be adopted without schema replay. Successful adoption keeps
the complete legacy checksum ledger and registers the v1 baseline as `adopted`.
Unknown, partial, non-contiguous, drifted, or unsupported ledgers fail closed.

Alternatives

Continuing filesystem discovery was rejected because ordering and accepted
upgrade states remained implicit. Registering after a migration-owned commit was
rejected because it retains the crash window. Replaying all historical files on
new installations was rejected because enum changes and historical operational
barriers make that chain a poor permanent baseline.

Consequences

Generated baseline and bundle diffs must be reviewed with the manifest. A new
v1 migration is added as `v1/0002+` and never edits the baseline already shipped
to an installation. Checksums make applied-file drift a startup failure. The
test-only `through` path remains available for immutable legacy fixtures but is
not an accepted production endpoint.

Migration

Run `pnpm --filter @workmesh/db generate:v1-baseline` to regenerate derived
artifacts from the immutable inventory. Empty databases record one `applied`
baseline row. Accepted pre-v1 databases execute the matching bundle, receive
checksums for all legacy rows, and record one `adopted` baseline row in the same
transaction.

Spec changes

`SCHEMA.sql`, `docs/VERSION_POLICY.md`, `docs/operations/migrations.md`,
`docs/production-deployment.md`, and `WORKMESH_PRD.md` define the v1 baseline,
accepted endpoints, ledger, atomicity, and operator procedure. No REST, event,
Agent Protocol, MCP, or OpenAPI surface changes.
