# Complete backup and disaster recovery

WorkMesh v1 recovery is a maintenance-window logical backup. One bundle captures
the authoritative PostgreSQL database and every version in the configured S3
bucket. Redis is intentionally excluded: it is non-authoritative transport and
cache state rebuilt from PostgreSQL and the transactional outbox.

## Recovery objectives and boundaries

- RPO is the end time of the most recent successful bundle. Schedule captures
  at the maximum data-loss interval your deployment permits.
- RTO is not a fixed product guarantee. Budget for image/tool startup plus
  database dump/restore and two full object-store passes (copy and readback).
  Record measured `startedAt`/`endedAt` values from backup and recovery reports
  using production-scale rehearsal data.
- The procedure is not PostgreSQL point-in-time recovery and does not capture
  Git providers, external Agent services, DNS/TLS, email, or other external
  systems.
- Session, cursor, bootstrap, S3, database, and backup encryption secrets remain
  in the operator's secret manager. The bundle records key fingerprints and
  encryption parameters, never plaintext credentials or master keys.
- Target object VersionIds and modification times are newly assigned. Every
  object version is restored, and source VersionIds remain in the manifest and
  authenticated mapping journal. Historical delete markers are retained as
  inventory; only markers that define current object absence are recreated.
- Active Object Lock retention and legal hold are preserved. An already-expired
  retention date is not extended during recovery.

## Prerequisites

Use the exact WorkMesh release image or exact source commit that created the
bundle. PostgreSQL `pg_dump` and `pg_restore` must be major version 16. The
backup destination parent must exist, be writable only by the operator/tool
UID, and have enough free space for the encrypted custom dump plus all object
versions. Generate a distinct 32-byte backup key:

```powershell
$env:WORKMESH_BACKUP_ENCRYPTION_KEY = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Store that value and the existing `WORKMESH_MASTER_KEY` in separate protected
secret-manager records. Losing either key makes a valid restore impossible.

## Capture from production Compose

1. Announce the maintenance window. Stop API, Worker, and optional MCP; wait for
   their 35-second drain. Web may remain up as a static maintenance page but the
   API must not accept traffic.

   ```powershell
   docker compose --env-file .env.production -f docker-compose.production.yml stop -t 35 api worker mcp
   ```

2. Confirm no other application or administrative database clients remain. Do
   not terminate unknown clients automatically. Create a new host directory;
   never reuse a prior bundle directory.

3. Run the compiled recovery command from the exact API image on the same
   Compose network. The example bind-mounts a protected `recovery` parent and
   uses the internal MinIO endpoint. The container runs as UID 10001, so grant
   that UID write access to the host parent without making it world-writable.

   ```powershell
   docker compose --env-file .env.production -f docker-compose.production.yml run --rm --no-deps `
     -e WORKMESH_MAINTENANCE_CONFIRMED=1 `
     -e WORKMESH_BACKUP_ENCRYPTION_KEY `
     -e S3_ENDPOINT=http://minio:9000 `
     -v ${PWD}/recovery:/recovery `
     --entrypoint node api `
     node_modules/@workmesh/recovery/dist/scripts/backup.js /recovery/workmesh-2026-08-03T120000Z
   ```

4. Require `backup-report.json`, `manifest.json`, `manifest.sha256`, and
   `manifest.hmac-sha256`. Confirm `failure.json` is absent. Copy the complete
   directory to independent durable storage and retain its backup key according
   to policy. Do not edit any bundle file.

5. Restart API/Worker/Web only after the bundle has been copied and its report
   reviewed. A failed capture remains evidence; create a new directory for the
   next attempt.

The source-checkout equivalent is `pnpm db:backup <new-bundle-directory>` with
`DATABASE_URL`, standard `S3_*`, `WORKMESH_BUILD_SHA`, both keys, and
`WORKMESH_MAINTENANCE_CONFIRMED=1`. If PostgreSQL tools run in a container, set
`WORKMESH_POSTGRES_TOOL_CONTAINER`, `WORKMESH_POSTGRES_TOOL_HOST`, and
`WORKMESH_POSTGRES_TOOL_PORT`.

## Restore into an empty environment

1. Provision a separate target Compose project, database, and bucket. Start only
   PostgreSQL, MinIO, and `minio-init`; do not run migration or start WorkMesh
   application services. The target database and bucket must be empty. Use a
   different endpoint/bucket when rehearsing recovery.

2. Make the manifest and encrypted payload files read-only. Keep the bundle
   directory owner-writable only so the tool can add its authenticated journal
   and recovery reports. Supply the original two keys and run the exact release
   API image. Within the one-shot container, map the target variables from the
   service's database/S3 credentials without printing them:

   ```powershell
   docker compose --env-file .env.recovery-target -f docker-compose.production.yml run --rm --no-deps `
     -e WORKMESH_BACKUP_ENCRYPTION_KEY `
     -v ${PWD}/recovery:/recovery `
     --entrypoint sh api -ec `
     'export RECOVERY_TARGET_DATABASE_URL="$DATABASE_URL";
      export RECOVERY_TARGET_S3_ENDPOINT="http://minio:9000";
      export RECOVERY_TARGET_S3_REGION="$S3_REGION";
      export RECOVERY_TARGET_S3_BUCKET="$S3_BUCKET";
      export RECOVERY_TARGET_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID";
      export RECOVERY_TARGET_S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY";
      export RECOVERY_TARGET_S3_FORCE_PATH_STYLE="$S3_FORCE_PATH_STYLE";
      exec node node_modules/@workmesh/recovery/dist/scripts/restore.js /recovery/workmesh-2026-08-03T120000Z'
   ```

3. A successful `recovery-report-*.json` must show matching database counts,
   restored object/delete-marker counts, Artifact/archive verification, and
   provider/webhook secret verification. The restore journal is HMAC protected.
   Preserve it until acceptance finishes; rerunning the same command resumes or
   revalidates the same target. Never copy a journal to another target.

4. Start API, Worker, and Web with the original runtime key/configuration set.
   Require `/readyz` from API and Worker, Web HTTP readiness, and run an
   authenticated Agent workflow smoke. The CI reference performs a durable
   Agent Session heartbeat after all three restored services start.

5. Keep the original environment untouched until humans verify Artifact
   downloads, archive readback, provider configuration, and Agent operation.
   Cut over DNS/traffic only after sign-off.

## Failure handling and replay

`RECOVERY_MANIFEST_*`, `RECOVERY_PAYLOAD_*`, `RECOVERY_MASTER_KEY_MISMATCH`,
`RECOVERY_WORKMESH_VERSION_INCOMPATIBLE`, `RECOVERY_TARGET_*_NOT_EMPTY`, and
`RECOVERY_POSTGRES_TOOL_FAILED` are hard failures. Preserve the bundle, all
`failure.json`/`recovery-report-*-failed-*.json` files, service logs, and the
target environment. Do not edit checksums, bypass emptiness checks, or load the
dump manually.

An interrupted restore may be rerun only against the same target using its
authenticated journal. A run without a matching journal refuses pre-existing
database or object state. If the journal or target does not match, abandon that
target and provision a new empty one; never delete unknown production data to
make a restore pass.

## Rehearsal and release evidence

`pnpm --filter @workmesh/recovery test:integration` is destructive only to
explicit `*test*` source and target databases. CI runs it with isolated
PostgreSQL and MinIO, checks wrong keys, interruption/resume, complete restore,
repeat validation, non-empty target rejection, missing/truncated payloads,
object/version/checksum/lock metadata, and secret decryption. It then starts the
restored API, Worker, and Web and stores a machine-readable Agent smoke report.
