# Authenticated complete recovery bundles

Status

Accepted

Context

A PostgreSQL dump does not contain Artifact bodies or retention archive objects.
It also cannot prove that operator-held encryption material still decrypts
provider and Agent webhook secrets. Restoring a database alone can therefore
produce an apparently healthy but incomplete WorkMesh installation.

Decision

A v1 recovery point is one `workmesh-recovery-bundle` directory captured in a
maintenance window after API, Worker, and MCP admission has drained. It contains
a PostgreSQL custom dump, every version of every object in the configured
bucket, delete-marker inventory, object metadata and Object Lock state, a
checksummed migration ledger, database/object counts, release identity, and
secret-decryption verification counts.

Every dump and object body is independently encrypted with AES-256-GCM and has
plaintext and ciphertext SHA-256 metadata. The canonical manifest has a separate
SHA-256 file and HMAC. The backup encryption key and `WORKMESH_MASTER_KEY` remain
operator-owned and are never embedded in the bundle. Restore authenticates the
manifest, checks every encrypted payload, verifies both key fingerprints, and
then permits writes only to an empty database and empty versioned bucket.

Object versions receive new target VersionIds. An authenticated restore journal
maps source to target identities, makes interruption replay safe, and lets
archive rows be remapped transactionally. A source delete marker that represents
current absence is recreated after object versions. PostgreSQL restore is one
`pg_restore --single-transaction` operation. Artifact/archive readability,
checksums, user metadata, live retention/legal hold, secret decryption, database
counts, and migration checksums are verified before a successful recovery
report is written.

Alternatives

Database-only backup was rejected because it loses object state. Unencrypted
bundles were rejected because database dumps and object bodies contain sensitive
customer data. Embedding either operator key was rejected because compromise of
one archive would then disclose its own decryption material. In-place restore
was rejected because it cannot distinguish recovered state from pre-existing
target state. Redis snapshotting was rejected because PostgreSQL plus the
transactional outbox is authoritative and Redis is reconstructible transport
state.

Consequences

Backup requires a write outage and access to PostgreSQL 16 client tools. RPO is
the last successful maintenance-window capture; RTO grows with database size,
object bytes, and available PostgreSQL/S3 throughput. Restore is logical, not
point-in-time recovery. Target object VersionIds and timestamps differ from the
source. Historical delete markers remain in the manifest as evidence, while
only current delete visibility is recreated. Expired Object Lock retention is
not extended; still-active retention and legal hold are preserved and verified.

Migration

The old `packages/db` SQL-file helpers are removed. `pnpm db:backup` and
`pnpm db:restore` now invoke `@workmesh/recovery`. The production API image
contains the compiled recovery package and PostgreSQL 16 client so an operator
can run the exact release image as a one-shot utility on the Compose network.
No database migration is required.

Spec changes

`README.md`, `WORKMESH_PRD.md`, `docs/operations/disaster-recovery.md`,
`docs/operations/migrations.md`, `docs/production-deployment.md`, `docs/CI.md`,
the production API image, and CI define and continuously test this contract.
No REST, event, Agent Protocol, MCP, or OpenAPI surface changes.
