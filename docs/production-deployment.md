# Production container deployment

Production uses `docker-compose.production.yml`. The existing `docker-compose.yml` remains the local development stack and is not an application-image release contract.

## Refresh only the Web service

For frontend-only changes that do not alter API, event, database, Worker, or MCP contracts, the local source stack can rebuild and replace only Web:

```powershell
docker compose build web
docker compose up -d --no-deps web
```

In production, after selecting an already qualified immutable Web image, update only `WORKMESH_WEB_IMAGE`, pull it, and replace the Web service without restarting its dependencies:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml pull web
docker compose --env-file .env.production -f docker-compose.production.yml up -d --no-deps web
```

This operational shortcut does not create a separate release class. Official RC and GA releases still use the verified four-image manifest and matching release provenance described below; API, Worker, MCP, PostgreSQL, Redis, and object storage are not restarted for an isolated Web refresh.

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

The Web production build runs `pnpm check:workmesh-skill` before Next.js and
fails unless the tracked versioned Skill artifact has the canonical LF UTF-8
bytes, manifest SHA-256, and valid Ed25519 signature. The signing private key is
never part of the image build. The verified `apps/web/public` tree is copied
into the Next.js standalone runtime so `/skills/workmesh-1.1.0.md` is present in
the final image rather than only in the source checkout.

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

Render `infra/s3/worker-retention-policy.template.json` with the exact
`S3_BUCKET` and `WORKMESH_RETENTION_ARCHIVE_PREFIX`, and attach it only to the
Worker object-store identity. The required archive mutation permissions are
conditional `s3:PutObject` and exact-version `s3:PutObjectRetention`; the latter
is required to repair a lock horizon after a delayed losing upload. The
template intentionally excludes object deletion permissions.

Keep the environment file outside source control and readable only by the deployment operator. Put a TLS reverse proxy in front of Web and API. Do not publish PostgreSQL, Redis, or MinIO directly to the internet.

Validate both the repository contract and the fully rendered configuration before changing a running deployment:

```powershell
pnpm validate:production-images --env-file=.env.production
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent config --quiet
```

The validator uses Node's built-in environment-file loader and checks the four
image references from `.env.production` before rendering Compose. It then
starts the exact configured Web image with no external network, requests the
versioned Skill over the container loopback interface without following
redirects, and requires a 200 response whose raw bytes match the tracked
artifact, SHA-256, and Ed25519 signature. The response is also checked for
credential-shaped `wmp_` or `wmi_` values. Without `--env-file`, the same command
builds an ephemeral Web image from the current checkout, runs the identical
runtime probe, and removes only its uniquely labelled container and image. The
Docker daemon and access to any configured private image are therefore required.
Omit `--profile agent` when MCP is not deployed.

### Coordination MCP pre-release deployment

Agent Connections remain behind `WORKMESH_BETA_COORDINATION_MCP` during the
development candidate. Set it to `true` on API, Worker, Web, and MCP through the
shared production Compose feature environment, then start the `agent` profile.
In Coordination mode the MCP container does not need a static Session token or
MCP boundary token: each request authenticates directly with its own
`X-WorkMesh-Installation-Token`. Keep the two legacy MCP variables only when
testing the older exact-Session mode.

Route the public HTTPS origin so `/.well-known/workmesh-agent`, `/mcp`,
`/connect`, and `/skills/` reach the corresponding API/MCP/Web services. With
Tailscale Serve, expose only those HTTPS routes plus the normal Web/API paths;
do not expose PostgreSQL, Redis, MinIO, or MCP port 3002 directly. Validate
discovery and call `verify_connection` before beginning a soak.

The final `v1.1.0-rc.N` must use four digest-pinned images from one exact SHA.
Run the three-client, multi-Agent 24-hour soak on those unchanged images. The
Stable/default-on promotion is a release gate after that evidence passes and
must not rebuild or substitute any image digest.

## Clean installation and upgrade

Authenticate to GHCR on the host, then pull and start the exact revision:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent pull
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent up -d --wait --wait-timeout 240
```

The production stack waits for the final PostgreSQL TCP server, runs the compiled one-shot migrator, creates the configured object-store bucket, and then starts API and worker. Web and MCP wait for API readiness. The migrator is safe to rerun for a new installation or an already-completed supported upgrade. It verifies the explicit manifest, SHA-256 ledger, and accepted pre-v1 endpoint before applying SQL; see [Database migrations](operations/migrations.md).

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml run --rm migrate
```

Do not use the v1 standalone command directly on an intermediate pre-v1 ledger
ending at migration 29. Such a deployment must first use its compatible pre-v1
release and the maintenance barrier below to reach the final pre-v1 ledger;
the v1 migrator then adopts that final ledger. Migration 30 changes the durable
retention upload state machine and requires the barrier when retention is
already active.

## Migration 29 to 30 maintenance barrier

Publish API, Worker, and Web from one clean exact SHA, resolve their immutable
digests, and update those three `WORKMESH_*_IMAGE` references plus
`WORKMESH_BUILD_SHA` in `.env.production`. If MCP is already enabled in the
running Compose project, publish and update MCP from that same SHA as well.
Digest references are mandatory for every service in the current topology. An
MCP-disabled deployment keeps an immutable MCP image reference so Compose can
render the tracked file, but the executor does not inspect or deploy that image
and does not require MCP tokens.

Before it changes a container, the tracked executor freezes the current
optional-service topology. It resolves the old Worker and uses its Compose
project, config-file, and working-directory labels as the deployment identity.
A label-filtered Docker query must find either no MCP container (disabled) or
exactly one running, non-restarting MCP container with the same deployment
identity (enabled). Multiple, malformed, stopped, restarting, or mismatched MCP
state is ambiguous and fails closed before the Worker is stopped or migration
30 can run. Only an already-enabled MCP topology causes the executor to require
MCP tokens and a target MCP digest, validate its OCI revision, or include the
`agent` profile in later Compose commands. The executor never enables MCP merely
because MCP variables exist in the environment.

The executor renders Compose as JSON exactly once after discovering the topology
and binds each included service to its verified target digest before the
maintenance stop. It writes that complete render into a private POSIX temporary
directory (`0700`) and file (`0600`). Every later Compose operation uses only
the frozen project name and snapshot file; it never rereads the source YAML or
environment file. Before writing, every dollar sign in every rendered JSON
string is encoded as a Compose literal (`$$`), including commands, labels,
paths, healthchecks, URLs, and secrets. The executor immediately renders the
snapshot again. Compose v5.3.1 preserves those protective pairs in `config`
output, so the executor accepts only exact equality or the single reversible
normalization `$$` to `$`, then requires deep equality with the first render
before any update, stop, or migration. The snapshot is removed in a `finally`
path, and a later
invocation removes only dead-PID residual directories that have the current
owner and the expected private mode. Native Windows execution fails closed
because it cannot verify the required POSIX owner.

The executor validates each exact rendered environment with the same pure
helper used by `/app/runtime-guard.mjs`. API and Worker preflight additionally
invoke the same authoritative configuration parsers as application startup. In
execute mode the executor then runs that guard from the exact target image, with
the frozen Compose service environment, for migrate, API, Worker, and Web,
followed by MCP only when MCP is in the frozen topology. Every guard must pass
before `docker update --restart=no` is issued. This includes cross-secret reuse
checks between enabled MCP tokens and all other deployment runtime secrets.
Dry-run mode validates the frozen environments but does not create temporary
guard containers.

The executor is a dry run unless `--execute` is explicitly supplied:

```powershell
pnpm upgrade:retention:production -- --env-file=.env.production
pnpm upgrade:retention:production -- --env-file=.env.production --execute
```

The executable path is intentionally ordered:

1. Inspect API, Worker, and Web target image digests, freeze the current MCP
   membership from auditable Compose/container state, then inspect MCP only when
   that frozen topology is enabled. Require every included OCI revision label
   to equal `WORKMESH_BUILD_SHA`; validate and freeze all later local values,
   including PostgreSQL CLI identifiers; and run the target-image runtime guard
   against the exact rendered migrate, API, Worker, Web, and optional MCP
   service environments before any Docker update or stop.
2. Using that frozen topology, run
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
   Only then force-recreate API and Web plus MCP if and only if MCP was in the
   frozen pre-migration topology. An MCP-disabled upgrade never starts, waits
   for, or verifies MCP and never passes `--profile agent`.

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

## Rollback

Rollback is a forward operation: you deploy a previously known-good revision
again. **Do not treat a schema downgrade as the rollback plan** — migrations are
apply-only, and a reverse migration would destroy facts the domain treats as
immutable. Two independent paths exist, and which one applies depends on whether
the failing revision changed the schema.

### Path A — application rollback (schema unchanged)

When the candidate and the previous release share a schema (the common case for
UI, workbench, and worker changes), roll back by pointing the four image
references and `WORKMESH_BUILD_SHA` at the previous revision and re-creating the
services. PostgreSQL keeps its data; nothing is replayed.

```powershell
# 1. Re-identify the previous good revision and its immutable digests.
$previousSha = '<known-good-40-char-sha>'
docker image inspect "ghcr.io/$namespace/workmesh-api:$previousSha" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'

# 2. Repoint every reference. All four must move together; never mix revisions.
$env:WORKMESH_API_IMAGE    = "ghcr.io/$namespace/workmesh-api@sha256:<previous-api-digest>"
$env:WORKMESH_WORKER_IMAGE = "ghcr.io/$namespace/workmesh-worker@sha256:<previous-worker-digest>"
$env:WORKMESH_MCP_IMAGE    = "ghcr.io/$namespace/workmesh-mcp@sha256:<previous-mcp-digest>"
$env:WORKMESH_WEB_IMAGE    = "ghcr.io/$namespace/workmesh-web@sha256:<previous-web-digest>"
$env:WORKMESH_BUILD_SHA    = $previousSha

# 3. Recreate and wait for readiness rather than trusting the running state.
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent up -d --wait --wait-timeout 240
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

The migrator is idempotent, so leaving it in the compose run is safe; it will
find the ledger already at the current version and apply nothing.

### Path B — data recovery (schema changed, or facts corrupted)

When the failing revision already committed a migration, the old application is
no longer schema-compatible and must not be restarted against the current
database. Recover the data instead, into a clean target, using the authenticated
recovery bundle:

```powershell
# 1. Take a bundle of the current database before changing anything.
$env:WORKMESH_MAINTENANCE_CONFIRMED = '1'   # explicit maintenance-window ack
pnpm db:backup ./.recovery-bundles/rollback-$(Get-Date -Format yyyyMMdd-HHmmss)

# 2. Restore that bundle into a fresh, empty target database and an empty
#    object-lock bucket, then point the deployment at it.
$env:RECOVERY_TARGET_DATABASE_URL = 'postgresql://<user>:<password>@<host>:5432/<fresh-db>'
$env:RECOVERY_TARGET_S3_BUCKET    = '<empty-bucket-with-object-lock>'
pnpm db:restore ./.recovery-bundles/rollback-<timestamp>

# 3. Deploy the known-good revision against the restored target.
```

Both commands refuse to run unless they are pointed at a database whose name
contains `test`, unless the maintenance window is explicitly acknowledged, and
unless no other client is connected. Restore additionally refuses a
non-empty target bucket, or one created without Object Lock. See
[Disaster recovery](operations/disaster-recovery.md) for the bundle format and
the verification the restore performs.

### After either path

- Confirm `/readyz` on API, Worker, MCP, and Web before reopening traffic.
- Reconcile any external effect the failed revision may have started; a rolled
  back application does not undo outbound calls. The outbox and the delivery
  ledgers are the record of what was attempted.
- Record the rolled-back SHA, the reason, and the recovery path used in the
  release notes. Do not delete the failed revision's images; they are the
  evidence for the postmortem.

## Health and lifecycle

Each runtime owns independent endpoints:

| Service | Liveness                       | Readiness                                                              |
| ------- | ------------------------------ | ---------------------------------------------------------------------- |
| API     | `/livez` on port 3001          | PostgreSQL, Redis, and request admission                               |
| Worker  | `/livez` on internal port 3003 | PostgreSQL, Redis/queue transport, object storage, and claim admission |
| MCP     | `/livez` on port 3002          | API readiness and request admission                                    |
| Web     | `/livez` on port 3000          | Web process readiness                                                  |

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

Before an upgrade that includes schema migrations, capture and rehearse the
authenticated PostgreSQL plus object-storage bundle described in
[Complete backup and disaster recovery](operations/disaster-recovery.md).

For an official candidate or GA deployment, do not rebuild these Dockerfiles.
Download `release-manifest.json` from the GitHub Release, verify its Sigstore
bundle, and set every `WORKMESH_*_IMAGE` value to the recorded `name@digest`.
The GA promotion workflow retags the same manifests; the RC and GA digest values
must remain equal. Operational commands and verification identities are in
[Release operations](operations/releases.md).

## 只读模型预置目录

设置 `WORKMESH_BETA_MODEL_PRESETS=true` 后，公开只读 `GET /api/v1/workbench/model-presets` 提供启动时加载的目录。关闭时返回 `FEATURE_DISABLED`，不读取指定目录文件；手工配置始终可用。预置不验证凭据，保存不验证可达性或兼容性；选中仅填可编辑字段，连接保存后仍须显式登记模型和填写能力上限。

加载优先级固定：功能禁用优先；指定 `WORKMESH_MODEL_PRESETS_FILE` 时完整替换内置目录；然后应用所选目录的 `disabledIds`。不合并、不回退、不在请求中写回。启用后文件缺失、坏 JSON、缺必填字段、非法 URL/日期、重复 ID、未知禁用 ID 均阻止 API 启动。文件变更需要重启 API。禁用清单必须引用原始完整文件里的 ID，响应保留禁用 ID、过滤对应 entries。

文件契约为 `{ "version": "operator-catalog", "entries": [...], "disabledIds": [] }`。条目必填 `id/provider/region/apiType/baseUrl/modelId/sourceUrl/checkedAt/confirmationMethod/notes`；`confirmationMethod` 为 `machine` 或 `human`，只表示官方资料的阅读核对。只支持现有 `openai-completions` 和 `openai-responses`。每条需有效核对日期和 HTTPS 官方出处；URL 不含用户信息、查询或片段。完整字段示例可复制 `apps/api/src/data/model-presets.json`，删除不需要的条目或用 disabledIds 禁用，更新目录 version。

目录是公开数据：任何访问 API 的人都能读取其中的部署网关地址、模型、地区和说明。不得写入凭据、令牌、内部秘密或嵌入凭据的 URL；网关认证材料由用户在连接表单填写。共享连接与私有主机保存仍走原有鉴权、normalizeLlmBaseUrl 和 WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST，不因来自目录而授予授权。

Compose 三种部署都传入功能开关与路径。将本地文件通过覆盖文件只读挂载，容器路径必须匹配环境变量：

```yaml
services:
  api:
    environment:
      WORKMESH_BETA_MODEL_PRESETS: "true"
      WORKMESH_MODEL_PRESETS_FILE: /etc/workmesh/model-presets.json
    volumes:
      - ./model-presets.json:/etc/workmesh/model-presets.json:ro
```

保存为 `compose.model-presets.yml`，搭配相应基础 Compose 文件与既有部署 env 运行 `docker compose -f docker-compose.production.yml -f compose.model-presets.yml up -d api`。Lite 改用 `docker-compose.lite.yml`；开发类改用 `docker-compose.yml`。保持文件对容器非 root 用户可读；不要设置 URL 或网络共享路径。未指定路径时使用构建产物中的内置目录，不需要挂载文件。

首批只有八家国内提供方及 OpenAI。北京百炼 Key 与业务空间域名、智谱 Coding Plan、方舟接入点、国内/国际凭据均有条件；不构造模板接入点，不从官方格式支持推出 WorkMesh 兼容。出处与逐家核对结果见 `docs/reviews/c3/official-source-review.md`。维护条目必须复读官方调用说明与模型资料，更新核对日期和目录版本；不调用付费推理或验证凭据 API。

## 企业微信出站提醒

`WORKMESH_EXPERIMENTAL_NOTIFICATION_CHANNELS=true` 在 API/Worker 同时开启后，Worker 注册单一企业微信群组 Webhook 适配器；默认关闭。需要既有 Redis profile、`REDIS_URL` 和可从企业微信打开的 HTTPS `WEB_ORIGIN`（仅 origin，不带路径、凭据、查询或 fragment）。noRedis 不支持该渠道。API 的 `configured_providers` 只报告部署能力，不证明 Worker 健康、凭据有效或已成功投递。

当前 Human 在既有个人渠道设置中管理自己的目标，部署方先确认企业及目标群允许“消息推送（原群机器人）”。目标秘密沿用 C1 加密存储，不能写到配置样例、聊天、日志或证据；完整目标必须是 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<编码后的秘密>`，不接受其它主机、路径、参数、端口、凭据、fragment、重定向或私网 DNS。网络须允许该 HTTPS 主机并维持正常证书验证。

消息只有固定通用提醒和 WorkMesh canonical 登录深链，Markdown 内容最多 4096 UTF-8 字节；不发送事项正文、人员信息、卡片决策或身份绑定。网页登录后按当前 Human 重新鉴权，转发不授予权限。授权撤销先于发送 checkpoint 提交时零外发，提交后的在途请求不能召回。

频控按秘密 HMAC 指纹跨 Worker 与重复 target 共用 Redis Lua：最多 20 份额度、另有串行 token。额度至少保留至实际完成或安全终止后 60 秒；未知或崩溃保留至发送截止上界 D+60 秒。Redis 丢状态共同冷却至少 120 秒，Redis 不可用则停止准入。等待不消耗发送失败预算，也不阻止普通网页读取。不得删除频控 key 来加速重试。

有效成功响应才记 delivered；提供方明确拒绝记安全错误码，已发出后的超时、断连或畸形响应进入 uncertain，不能自动重发。个人设置的既有投递对账入口由当前目标 owner 显式确认 delivered、retry 或 dead；retry 复用原 delivery/effectKey，仍重新准入和鉴权，至少一次不能保证外部恰好一次。

协议核实及官方原始字节见 `docs/plan/c2-wecom/README.md`、`official/retrieval.json` 和无损归档。只出站没有入站签名、绑定或回调时窗依赖。本轮验收仅用 fake provider；真实外发须另获用户明确授权。
