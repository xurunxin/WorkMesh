# Database migrations

WorkMesh v1 uses an explicit, checksummed migration manifest. Production code
must call `pnpm db:migrate` (or the compiled one-shot migrator); it must not
execute numbered SQL files or `SCHEMA.sql` directly.

## Schema sources

- `packages/db/migrations/v1/0001_v1_baseline.sql` is the only clean-install
  baseline.
- Root-level `0001_*.sql` through `0035_*.sql` are immutable pre-v1 inventory.
- `packages/db/migrations/upgrades/` contains the five generated, transactional
  pre-v1 upgrade bundles.
- `packages/db/src/migration-manifest.ts` pins ordering and canonical SHA-256
  checksums. Line endings are canonicalized to LF before hashing.

Regenerate derived v1 files only after intentionally adding an immutable
migration source:

```powershell
pnpm --filter @workmesh/db generate:v1-baseline
```

Review the baseline, all affected bundles, and manifest checksum diff together.
Never edit an already-applied root migration.

## Accepted starting states

The runner accepts an empty database, the final immutable pre-v1 ledger ending
at `0035_decision_session_provenance`, or a complete contiguous ledger ending
at exactly one of:

- `0002_stage0_integrity_delivery`;
- `0006_stage1_review_fixes`;
- `0007_stage2_work_rooms_leases_handoffs`;
- `0014_provider_action_kinds`;
- `0021_stage4_a2a_direction_and_prompt_identity`.

All other intermediate, partial, non-contiguous, or unknown ledgers fail closed.
The test-only `applyMigrations(..., { through })` option creates legacy fixtures;
it is not a production upgrade route.

## Atomicity and ledger

The runner holds a PostgreSQL session advisory lock for discovery and execution.
Each v1 migration executes SQL and inserts its ledger row in one runner-owned
transaction. Migration SQL containing top-level `BEGIN`, `COMMIT`, `ROLLBACK`,
or `START TRANSACTION` is rejected. The ledger records:

- `version`;
- `checksum_sha256` as 64 lowercase hexadecimal characters;
- `applied_at` in UTC;
- `execution_mode` as `applied`, `adopted`, or `legacy`.

A supported legacy upgrade executes one generated bundle atomically, fills the
immutable legacy checksum ledger, and registers `0001_v1_baseline` as
`adopted`. A crash before commit leaves both schema and ledger unchanged; after
commit, rerunning observes the registered checksum and does not replay SQL.

## Operator procedure

1. Drain API and Worker admission using the release-specific maintenance guide.
2. Take and verify a PostgreSQL backup. Issue #11 owns the complete database and
   object-storage backup bundle; a database dump alone is not full DR evidence.
3. Inspect the exact ledger:

   ```sql
   SELECT version, checksum_sha256, applied_at, execution_mode
   FROM schema_migrations
   ORDER BY version;
   ```

   Older pre-v1 ledgers legitimately lack checksum and mode columns until the
   runner adopts them.
4. Run `pnpm db:migrate` once from the exact target image or checkout.
5. Run it a second time to prove idempotence, then verify every checksum and
   execution mode before restoring admission.

## Downgrade and restore

WorkMesh has no down migrations. After a v1 migration commits, do not start an
older binary against that database and do not delete or rewrite ledger rows.
Rollback means restoring the verified pre-upgrade backup into an empty database,
then starting the exact application version that created that backup. Database
and object-storage state must be restored from the same maintenance-window
capture; until the complete Issue #11 backup bundle is available, the existing
`pg_dump` helper alone is not sufficient disaster-recovery evidence.

Test a restore before every production upgrade. If migration startup fails,
leave the failed database untouched for diagnosis and restore into a separate
empty target rather than attempting an in-place downgrade.

Do not continue after `MIGRATION_SOURCE_CHECKSUM_MISMATCH`,
`MIGRATION_APPLIED_CHECKSUM_MISMATCH`, `MIGRATION_UNKNOWN_APPLIED_VERSION`,
`MIGRATION_LEGACY_LEDGER_NOT_CONTIGUOUS`, or
`MIGRATION_LEGACY_ENDPOINT_UNSUPPORTED`. Preserve the database and logs for
diagnosis; do not edit the ledger to force an upgrade.
