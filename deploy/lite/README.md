# WorkMesh Lite — single-node install

One operator, one device, no registry. This is the install path for a device with
no checkout, no pnpm, and no ability to build anything.

- **Supported floor: 2 GB RAM and at least 512 MB of swap.** A 1 GB device is not
  supported by the current architecture. See the capacity section for why.
- **Not a release class.** The image is one local tag. There is no digest ring, no
  release manifest, and no RC gate. The hardening is the same as the production
  class: read-only root filesystem, non-root `10001:10001`, every Linux capability
  dropped, `no-new-privileges`, and an explicit `noexec` tmpfs.

## What runs where

The device runs the control plane. It does **not** run the Agent Runner or MCP.

| Component | Where | Why |
|---|---|---|
| PostgreSQL, Redis, object store | device | durable state |
| API, Worker, Web | device | control plane, from one image |
| Agent Runner | **your own machine** | untrusted code needs a real OS isolation boundary, which a capped container on a small host is not |
| MCP (optional) | **your own machine** | same reasoning, and it is not needed every day |

The Runner already talks to the control plane over HTTP with an installation
token, so nothing about the protocol changes.

**Point the Runner at the Web origin, not the API port.** The Runner issues
`/api/v1/...` paths (`apps/agent-runner/src/run-session.ts`), and the Web server
proxies `/api` to the API. That is why the Lite compose never publishes `3001`:
the API stays on the internal network and the Runner reaches it through Web.

```bash
# on the machine that runs the Agent Runner
WORKMESH_API_URL=http://<device-lan-ip>:3000
WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP=1
```

`WORKMESH_RUNNER_ALLOW_INTERNAL_HTTP=1` is required for plain HTTP, because the
Runner refuses it by default — that refusal is a deliberate isolation invariant,
not an oversight. With TLS terminated in front of Web, use `https://` and leave
the flag off.

## 1. Build on a workstation

A low-power device cannot run the Next.js production build, so the build happens
elsewhere and moves as a tarball.

```bash
sha=$(git rev-parse HEAD)
docker build -f infra/docker/lite.Dockerfile \
  --build-arg WORKMESH_BUILD_SHA="$sha" \
  --build-arg NEXT_PUBLIC_API_URL="" \
  -t "workmesh-lite:$sha" .

# Prove the image before you trust it: one image, four roles.
sh infra/lite/verify-image-roles.sh "workmesh-lite:$sha"

docker save "workmesh-lite:$sha" | gzip > "workmesh-lite-$sha.tar.gz"
```

`NEXT_PUBLIC_API_URL` is intentionally empty. The Browser then uses a relative
base and the Next server proxies `/api`, which is what keeps the session cookie
first-party. A device can be reached by LAN address, hostname, or tunnel name, and
none of those are knowable at build time.

The verification script is not optional bookkeeping. It is the only check that can
see a wrong path inside the image: the unit tests pin the dispatch table and the
compose validator pins the topology, but neither can see where the trees landed.

## 2. Move it to the device

```bash
scp "workmesh-lite-$sha.tar.gz" user@device:/tmp/
```

## 3. Install on the device

```bash
docker load -i /tmp/workmesh-lite-<sha>.tar.gz
cp .env.lite.example .env.lite
$EDITOR .env.lite
```

Fill in every `CHANGE_ME`. The runtime guard rejects placeholder material, so a
forgotten one stops the service with a clear error instead of starting insecurely.

Generate secrets on any machine with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # WORKMESH_MASTER_KEY
```

`SESSION_SECRET`, `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
`AUTH_RATE_LIMIT_HMAC_KEY`, and the cursor key ring must all be **distinct values**.
The guard rejects exact reuse across named secrets.

`WORKMESH_BOOTSTRAP_TOKEN` comes from `pnpm bootstrap:token` on a workstation.

## 4. Start it

```bash
docker compose --env-file .env.lite -f docker-compose.lite.yml config   # render check
docker compose --env-file .env.lite -f docker-compose.lite.yml up -d
docker compose --env-file .env.lite -f docker-compose.lite.yml ps
```

`migrate` runs as a one-shot before the API starts, so an ordinary `up -d` on a
fresh device is the whole installation. If the schema is behind, re-running
`up -d` re-runs the step; the migration ledger is idempotent.

## 5. First run

Open `http://<device-lan-ip>:3000` and complete installation with the bootstrap
token. The loopback escape hatch (`WORKMESH_BOOTSTRAP_ALLOW_LOOPBACK`) stays
`false` — the token is the only supported path, and the compose validator fails the
build if that literal is ever flipped to `"true"`.

## Networking

The default is a LAN deployment with no TLS: `WORKMESH_BIND_ADDRESS=0.0.0.0`,
`SESSION_COOKIE_SECURE=false`, and only two published ports — Web on `3000` and the
object store on `9000`. PostgreSQL and Redis are never published; the compose
validator fails if you add a port to either.

The object store is published because the Browser uploads straight to it with a
presigned PUT. That is the one reason a Lite deployment exposes a second port.

For TLS, terminate it in front of Web and set `SESSION_COOKIE_SECURE=true`. Caddy
is the cheap option:

```yaml
  caddy:
    image: caddy:2-alpine
    ports: ["443:443", "80:80"]
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy-data:/data"]
```

```caddyfile
workmesh.example.com {
  reverse_proxy web:3000
}
```

Never publish PostgreSQL, Redis, or the object store to the internet from a Lite
device.

## Capacity

Steady-state targets, in descending order, and why they are what they are:

| Role | Target resident |
|---|---|
| api | 150-250 MB (`--max-old-space-size=320`, cap 640 MB) |
| worker | 120-200 MB (`--max-old-space-size=256`, cap 448 MB) |
| web | 120-200 MB (`--max-old-space-size=256`, cap 448 MB) |
| PostgreSQL | 60-90 MB (`shared_buffers=32MB`, `track_activities=off`) |
| object store | 20-40 MB |
| Redis | 8-15 MB (AOF off, stream bounded by `WORKMESH_REALTIME_REDIS_MAXLEN`) |
| **total** | **0.5-0.8 GB**, peak around 1.2 GB |

These are design targets, not measurements. `docs/operations/lite-footprint.md`
holds the measured numbers once a device has been measured; nothing should quote
this table externally before that exists.

Two things that are easy to get wrong:

- **The heap must stay below the container limit.** V8 collects under heap
  pressure; the cgroup limit is a kernel OOM kill. A heap that reaches the limit
  means the process dies without a clean shutdown. The compose validator asserts
  the relationship, not the literals.
- **Memory is in the Node processes, not the containers.** Merging the API and
  Worker into one container saves a few megabytes of container overhead and no
  Node runtime at all.

## Upgrading

```bash
# 1. back up first — a migration is not reverted by rolling back the image
sh deploy/lite/backup.sh /mnt/usb/workmesh-backup

# 2. on the workstation, build and ship the new tag (section 1)

# 3. on the device
docker load -i /tmp/workmesh-lite-<new-sha>.tar.gz
sed -i "s|^WORKMESH_LITE_IMAGE=.*|WORKMESH_LITE_IMAGE=workmesh-lite:<new-sha>|" .env.lite
sed -i "s|^WORKMESH_BUILD_SHA=.*|WORKMESH_BUILD_SHA=<new-sha>|" .env.lite

docker compose --env-file .env.lite -f docker-compose.lite.yml up -d
```

`up -d` replaces `migrate`, then `api`, then `worker`, then `web` in dependency
order. Rollback is the same command with the previous tag, **after** restoring the
backup if the migration already ran.

Keep the previous tag in `.env.lite`. An image is the only rollback mechanism.

## Backup

The device has no checkout, so `pnpm db:backup` is unavailable there.
`deploy/lite/backup.sh` takes a `pg_dump -Fc` of the database and tars the object
store volume; `deploy/lite/restore.sh` reverses it. Because the device is
single-node with local disk, copying the volume directory is a complete artifact
backup and needs no S3 client.

Rehearse the restore, not just the backup. A backup you have never restored is a
hypothesis.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `WORKMESH_SERVICE is invalid` | the role does not exist; check spelling |
| `the dispatch table is unreachable` | the entrypoint ran outside the image, or `@workmesh/config` is missing from the deploy tree |
| `runs from its own image`, exit 64 | you asked for `mcp` or `agent-runner`; those are not in this image |
| `NEXT_PUBLIC_API_URL is required` | `NEXT_API_UPSTREAM` is not set for the Web service, so the Web server is not declared to proxy `/api` |
| `X must not contain placeholder material` | a `CHANGE_ME` value survived into the environment file |
| `X must not reuse Y` | two named secrets share material |
| Web page loads but every asset 404s | the Web role started from the wrong directory; re-run the image verification |
| Login fails immediately, Redis is fine | check `AUTH_RATE_LIMIT_*`; the limiter fails closed and refuses rather than degrading |
| Login fails after a Redis restart | expected: AOF is off, so token buckets rebuild empty |

## Known limitations

- **1 GB is not supported.** Three Node runtimes plus PostgreSQL, Redis, and the
  object store do not fit below that. Two further code changes would change this,
  and both are recorded in `docs/adr/0071-lite-single-node-self-hosted-deployment.md`
  as Tier 0; neither is implemented.
- **A Redis restart clears rate-limit token buckets**, which opens a short
  brute-force window. Accepted for a single administrator on a LAN.
- **Migrations are not reverted** by rolling back the image.
- **The object store is LAN-published** until the filesystem artifact store lands.
- **Windows developers**: run the shell scripts under WSL or Git Bash. `pnpm lint`,
  `typecheck`, and `test` run natively.
