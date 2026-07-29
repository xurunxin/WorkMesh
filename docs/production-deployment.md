# Production container deployment

Production uses `docker-compose.production.yml`. The existing `docker-compose.yml` remains the local development stack and is not an application-image release contract.

## Build and publish an exact revision

Build from a clean checkout of the commit being released. Use the full, lower-case 40-character Git SHA for every pre-release image tag and for `WORKMESH_BUILD_SHA`.

```powershell
$sha = git rev-parse HEAD
$namespace = 'your-ghcr-organization'
$apiUrl = 'https://workmesh.example.com/api'

docker build --build-arg WORKMESH_BUILD_SHA=$sha -f infra/docker/api.production.Dockerfile -t "ghcr.io/$namespace/workmesh-api:$sha" .
docker build --build-arg WORKMESH_BUILD_SHA=$sha -f infra/docker/worker.production.Dockerfile -t "ghcr.io/$namespace/workmesh-worker:$sha" .
docker build --build-arg WORKMESH_BUILD_SHA=$sha -f infra/docker/mcp.production.Dockerfile -t "ghcr.io/$namespace/workmesh-mcp:$sha" .
docker build --build-arg WORKMESH_BUILD_SHA=$sha --build-arg NEXT_PUBLIC_API_URL=$apiUrl -f infra/docker/web.production.Dockerfile -t "ghcr.io/$namespace/workmesh-web:$sha" .

docker push "ghcr.io/$namespace/workmesh-api:$sha"
docker push "ghcr.io/$namespace/workmesh-worker:$sha"
docker push "ghcr.io/$namespace/workmesh-mcp:$sha"
docker push "ghcr.io/$namespace/workmesh-web:$sha"
```

Exact-SHA tags are accepted for pre-release validation. Release deployment uses the immutable digest returned by GHCR after each push. Set the four full references in the production environment:

```powershell
$env:WORKMESH_API_IMAGE = "ghcr.io/$namespace/workmesh-api@sha256:<api-digest>"
$env:WORKMESH_WORKER_IMAGE = "ghcr.io/$namespace/workmesh-worker@sha256:<worker-digest>"
$env:WORKMESH_MCP_IMAGE = "ghcr.io/$namespace/workmesh-mcp@sha256:<mcp-digest>"
$env:WORKMESH_WEB_IMAGE = "ghcr.io/$namespace/workmesh-web@sha256:<web-digest>"
```

Issue #10 RC validation enforces digest-only application references. The exact-SHA tag form remains available before RC to validate unpublished composition, but a release must not use floating tags or rely on tag mutability.

`NEXT_PUBLIC_API_URL` is compiled into the Web bundle. Build a new Web image when that public URL changes. Confirm both provenance labels before publishing:

```powershell
docker image inspect "ghcr.io/$namespace/workmesh-web:$sha" --format '{{json .Config.Labels}}'
```

## Configure

Copy `.env.example` to a deployment-only environment file. At minimum, replace all four full application image references, the exact source SHA, public origins, PostgreSQL and MinIO credentials, session and master keys, bootstrap token, pagination key ring, rate-limit HMAC key, and object-store credentials. Prefer GHCR digest references. When the MCP `agent` profile is used, also set its session and access tokens.

Required production credentials have no usable defaults. Compose can render while the optional MCP profile is disabled; if that profile is started with empty session or access tokens, MCP fails preflight before listening. The containers reject missing values, `CHANGE_ME`-style placeholders, short secrets, invalid key formats, and exact secret reuse. Generate the installation token with:

```powershell
pnpm --silent bootstrap:token
```

Keep the environment file outside source control and readable only by the deployment operator. Put a TLS reverse proxy in front of Web and API. Do not publish PostgreSQL, Redis, or MinIO directly to the internet.

Validate both the repository contract and the fully rendered configuration before changing a running deployment:

```powershell
pnpm validate:production-images --env-file=.env.production
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent config --quiet
```

The validator uses Node's built-in environment-file loader and checks the four image references from `.env.production` before rendering Compose. Omit `--profile agent` when MCP is not deployed.

## Clean installation and upgrade

Authenticate to GHCR on the host, then pull and start the exact revision:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent pull
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent up -d --wait --wait-timeout 240
```

The production stack waits for the final PostgreSQL TCP server, runs the compiled one-shot migrator, creates the configured object-store bucket, and then starts API and worker. Web and MCP wait for API readiness. The migrator is safe to rerun for a new installation:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
```

Do not use that standalone command for an upgrade from migration 29 to 30.
Migration 30 changes the durable retention upload state machine and requires a
maintenance barrier.

## Migration 29 to 30 maintenance barrier

Publish all four application images from one clean exact SHA, resolve their
immutable digests, and update all four `WORKMESH_*_IMAGE` references plus
`WORKMESH_BUILD_SHA` in `.env.production`. Digest references are mandatory for
this upgrade. The tracked executor verifies every target image digest and its
`org.opencontainers.image.revision` label before it changes a container.

The executor is a dry run unless `--execute` is explicitly supplied:

```powershell
pnpm upgrade:retention:production -- --env-file=.env.production
pnpm upgrade:retention:production -- --env-file=.env.production --execute
```

The executable path is intentionally ordered:

1. Inspect all four target image digests and require their OCI revision labels
   to equal `WORKMESH_BUILD_SHA`.
2. Resolve the old Worker by its Compose labels, run
   `docker update --restart=no <old-worker-id>`, then
   `docker compose ... stop -t 35 worker`. The stopped container must report
   exit code 0, `Running=false`, and `Restarting=false`. A daemon interruption,
   timeout, nonzero exit, or exit 137 aborts before the barrier or migration.
   A label-filtered Docker query must also find zero running Worker containers.
3. From the exact target Worker digest, run the read-only command
   `node dist/run-retention-upgrade-barrier.js --expect-through=29`. It requires
   the schema ledger to be exactly through 29 with 30 absent and no active
   retention lease. It fully paginates `ListObjectVersions`, requires zero
   delete markers and a two-way one-to-one match between every retention S3
   `(key, VersionId)` and PostgreSQL, then uses version-pinned HEAD requests to
   verify size, SHA-256, MIME, COMPLIANCE mode, and retain-until. Two complete
   snapshots separated by a delay must have the same digest.
4. Only after the barrier succeeds, run migration 30 from the exact target API
   digest and require exactly one `0030_durable_archive_upload_intents` ledger
   row. Migration 30 also takes a `SHARE ROW EXCLUSIVE` lock on
   `retention_job_state` and raises SQLSTATE `55006` with
   `UPGRADE_BARRIER_RETENTION_CLAIM_ACTIVE` if a residual claim is active.
5. Force-recreate only the target Worker. Verify its actual image ID/digest,
   then require fresh `worker_runtime` rows whose build SHA is the target SHA.
   Only then force-recreate API, MCP, and Web from that same SHA.

The barrier is strictly read-only. An IAM list denial, incomplete pagination,
orphan, missing version, multiple versions under one stable key, delete marker,
HEAD mismatch, or changing snapshot aborts. It never deletes an object and
never automatically adopts an object into PostgreSQL. Barrier and executor
errors contain only stable codes plus, where necessary, an object key,
VersionId, digest, or count; credentials and provider error text are not
printed.

Before migration 30 is committed, an abort leaves the old Worker stopped with
restart disabled. Preserve that state while auditing any unresolved S3
reconciliation. Do not delete the object, generate a replacement key,
automatically adopt a version, or restart the old Worker. After migration 30
is committed, the rollback boundary has been crossed: the old Worker is not
schema-compatible and must not be restarted. Correct the target deployment and
continue forward with the exact target SHA. The executor performs no automatic
rollback and never removes an orphan.

Other upgrades still require one exact application SHA: publish all images,
resolve all four digests, update the four image references and
`WORKMESH_BUILD_SHA`, and do not mix application revisions.

## Health and lifecycle

Each runtime owns independent endpoints:

| Service | Liveness | Readiness |
| --- | --- | --- |
| API | `/livez` on port 3001 | PostgreSQL, Redis, and request admission |
| Worker | `/livez` on internal port 3003 | PostgreSQL, Redis/queue transport, object storage, and claim admission |
| MCP | `/livez` on port 3002 | API readiness and request admission |
| Web | `/livez` on port 3000 | Web process readiness |

The Compose healthchecks use `/readyz`. A healthy liveness response does not mean a service is ready to accept work.

SIGTERM withdraws readiness before shutdown. API and MCP stop admission; worker stops scheduling and claiming, drains its current claimed tick, and closes dependencies. The application deadline is 30 seconds and Compose allows 35 seconds:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml stop -t 35 api worker mcp
```

After restart, wait for health instead of treating the `running` state as readiness:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml restart api worker web
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

## Runtime inspection

Verify identity, image contents, and size on the published artifacts:

```powershell
docker image inspect $env:WORKMESH_API_IMAGE --format 'user={{.Config.User}} revision={{index .Config.Labels "org.opencontainers.image.revision"}} bytes={{.Size}}'
docker run --rm --entrypoint node $env:WORKMESH_API_IMAGE -e "const fs=require('node:fs'); for (const p of ['/app/src','/app/integration','/app/node_modules/.bin/tsx']) if (fs.existsSync(p)) process.exit(1)"
```

Repeat the content check for worker and MCP. For Web, inspect the standalone runtime and confirm the baked API URL label. Inspect running application containers to confirm UID/GID `10001:10001`, read-only root filesystem, `CapDrop: ALL`, `no-new-privileges:true`, and the `/tmp` tmpfs.

Back up PostgreSQL before an upgrade that includes schema migrations. See the repository Operations section for backup and restore commands.
