# API/MCP 启动与安装

WorkMesh 的对外入口为 API 与 MCP。内置页面和 Service Worker 已退役；数据库、Redis、对象存储、worker 与外部 Runner 保留。CLI、SDK 和连接器继续消费接口。

## 本地开发

使用 `.node-version` 和 `package.json` 锁定的工具链，复制 `.env.example` 并替换占位值。秘密放在私有环境文件；命令中的值由当前进程环境读取。

```powershell
pnpm install --frozen-lockfile
docker compose up -d postgres redis minio
pnpm db:migrate
pnpm dev
```

API 在 `http://localhost:3001` 提供 `/livez`、`/readyz` 与 REST/SSE。开发 Compose 直接发布 API 端口。`pnpm dev` 不启动页面。修改源码后从本地接口验证实际结果，不用历史 UI 截图代验。

## Human 安装和管理

首次安装保留 bootstrap 校验与幂等要求。在运行 API 的另一个终端读取已有私有环境后执行下例。管理员密码须至少十二个字符；示例不提供默认凭据。`WEB_ORIGIN` 必须与配置的外部 API origin 一致。

```powershell
$origin = $env:WEB_ORIGIN
$install = @{name='WorkMesh';slug='workmesh';adminName='Admin';email=$env:SEED_ADMIN_EMAIL;password=$env:SEED_ADMIN_PASSWORD} | ConvertTo-Json
$reply = Invoke-WebRequest -Uri "$origin/api/v1/auth/install" -Method Post -ContentType 'application/json' -Body $install -SessionVariable human -Headers @{'Idempotency-Key'=[guid]::NewGuid().ToString();'X-WorkMesh-Bootstrap-Token'=$env:WORKMESH_BOOTSTRAP_TOKEN}
$csrf = ($reply.Content | ConvertFrom-Json).csrfToken
Invoke-RestMethod -Uri "$origin/api/v1/auth/me" -WebSession $human
```

已安装环境使用 `POST /api/v1/auth/login`，请求体为 `email` 和 `password`，并提供新的幂等键；响应继续设置 HttpOnly Cookie 与 `csrfToken`。Human 写请求同时发送 Cookie、`X-CSRF-Token` 和 `Idempotency-Key`；有 revision 的资源另发送 `If-Match: "revision-N"`。登出及所有管理能力按 [OPENAPI.yaml](../OPENAPI.yaml) 的既有合同执行。

## Agent 和 MCP

启用既有 `WORKMESH_BETA_COORDINATION_MCP` 后，管理员调用 `POST /api/v1/agent-connections` 指定 Team、principal Human、client type 和最小 capability。`connect_url` 是兑换接口的 fragment 定位符，没有页面。旧加密幂等回执保留原 `/connect#` 定位符字节；客户端同样只提取 fragment，不打开页面。客户端从 fragment 提取一次性配对码，按现有合同兑换；安装凭据存入自己的秘密存储。

API origin 提供 `/.well-known/workmesh-agent` 和固定 `/skills/workmesh-1.1.0.md`。先校验发现元数据，再从兑换响应读取 `redeemed.skill.download_url` 并校验原字节、SHA-256 与 Ed25519 签名。发现不包含下载 URL。MCP origin 由 `PUBLIC_MCP_ORIGIN` 配置，请求使用兑换响应说明的安装凭据 header，按 `initialize → verify_connection → get_workmesh_context` 核实实时身份。Coordination 模式的启动预检与服务均不要求静态 Session/MCP token，并拒绝同时配置这两种模式的凭据；静态模式继续要求完整、独立的凭据。

生产部署见 [生产说明](production-deployment.md)，Lite 见 [Lite 说明](../deploy/lite/README.md)。Lite 的 MCP 和 Runner 仍在独立机器运行；API 直接可达，不再借助 Next 代理。

已有部署升级时保持客户端使用的公共 origin，将该 origin 的代理目标改为 API；直接发布端口的环境用 `API_HOST_PORT` 承接原端口，并令 `WEB_ORIGIN` 与外部 API origin 一致。这样保留既有客户端地址及旧幂等回执的定位符，不修改回执字节、配对码或授权。新配对返回兑换接口定位符；已过期配对仍按原合同拒绝。

## 旧 Web 容器退役

从旧 Lite 或生产栈升级时，删除 Compose 的 `web` 定义不会停止旧容器。先保存原部署配置和备份，记录原 project 与业务卷。按标签列出全部旧 Web 容器，逐个核对完整 ID、镜像、挂载、端口及配置目录，确认属于本次升级。

```sh
docker ps -a --no-trunc --filter label=com.docker.compose.project=<原project> --filter label=com.docker.compose.service=web
docker inspect --format 'id={{.Id}} image={{.Image}} project={{index .Config.Labels "com.docker.compose.project"}} service={{index .Config.Labels "com.docker.compose.service"}} config={{index .Config.Labels "com.docker.compose.project.config_files"}} directory={{index .Config.Labels "com.docker.compose.project.working_dir"}}' <完整容器ID>
docker inspect --format 'mounts={{json .Mounts}} ports={{json .NetworkSettings.Ports}}' <完整容器ID>
docker volume ls --filter label=com.docker.compose.project=<原project>
```

将 inspect 返回的 `com.docker.compose.project.config_files` 与 `com.docker.compose.project.working_dir` 原值传入源码工作站的退役工具。多个 Web 容器须逐一提供 `--container`；脚本拒绝未列出的容器、标签变化和退出失败。

```sh
node scripts/retire-legacy-web.mjs --project=<原project> --container=<完整容器ID> --config-file="<原配置标签值>" --working-directory="<原工作目录标签值>"
```

脚本执行 `docker stop --time 35 <完整容器ID>`，确认停止成功后执行 `docker rm <完整容器ID>`。它不使用 `-v`、强制删除或整栈 `down`。设备没有源码时，核对同样的身份后手工执行这两条 Docker 命令。停止异常时保留容器，先核失败原因，不改用强制删除。

退役回执只保存必要身份、状态和挂载信息，不输出旧容器环境、启动参数、任意标签或卷驱动选项。不要将完整 inspect 的环境和秘密写入日志、聊天或仓库。

重新按原 project/service 标签查询，预期结果为空；逐一确认旧 ID 已不存在，业务卷仍在。将 API 的发布端口和 `WEB_ORIGIN` 设为同一外部地址，再用 `--project-name <原project>` 启动新栈。通过 API 登录核对既有业务记录、发现与配对；原 Web 端口应由 API 承接或关闭。不要使用 `down -v`、`volume prune` 或通用孤儿删除来退役页面。生产数据库的既有升级屏障继续适用。

## 通知与后续维护

Web Push 的 config、订阅注册/撤销及 worker 投递接口保持。外部客户端自行消费服务合同，本项目不提供替代页面或 Service Worker。企业微信和 Web Push 的新链接使用现有鉴权 API：attention 来源定位到编码后的复合 ID，其他通知定位到 notifications 查询。链接不携带秘密，返回 JSON；匿名、无该来源读取权限的其他 Human 或失权用户按实时权限拒绝，不提供登录页面。

旧通知 `request_hash` 按原序列化字段完整验证并保留。只有原状态机允许发送的记录渲染新链接，`sending` 和 `uncertain` 不自动重发；显式对账仍受原权限、revision 和状态机约束。

恢复诊断中的 Run、Work Item、Agent 和过期 Approval 读取定位符同样使用现有 `/api/v1/` 路径，返回鉴权 JSON。读取定位符不授予恢复或重新审批权限；原动作门禁继续适用。

接口或功能更新须同次维护说明、配置和示例；完整接入手册初版属于后续文档任务。本次没有增加数据库迁移、领域能力或自动恢复。历史 UI、首败和独审原件保持，当前验收记录区分通过、失败与未测。
