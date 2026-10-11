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

API origin 提供 `/.well-known/workmesh-agent` 和固定 `/skills/workmesh-1.1.0.md`。先校验发现元数据，再从兑换响应读取 `redeemed.skill.download_url` 并校验原字节、SHA-256 与 Ed25519 签名。发现不包含下载 URL。MCP origin 由 `PUBLIC_MCP_ORIGIN` 配置，请求使用兑换响应说明的安装凭据 header，按 `initialize → verify_connection → get_workmesh_context` 核实实时身份。

生产部署见 [生产说明](production-deployment.md)，Lite 见 [Lite 说明](../deploy/lite/README.md)。Lite 的 MCP 和 Runner 仍在独立机器运行；API 直接可达，不再借助 Next 代理。

## 通知与后续维护

Web Push 的 config、订阅注册/撤销及 worker 投递接口保持。外部客户端自行消费服务合同，本项目不提供替代页面或 Service Worker。企业微信和 Web Push 的新链接使用现有鉴权 API：attention 来源定位到编码后的复合 ID，其他通知定位到 notifications 查询。链接不携带秘密，返回 JSON；匿名、其他 Human 或失权用户按实时权限拒绝，不提供登录页面。

旧通知 `request_hash` 按原序列化字段完整验证并保留。只有原状态机允许发送的记录渲染新链接，`sending` 和 `uncertain` 不自动重发；显式对账仍受原权限、revision 和状态机约束。

恢复诊断中的 Run、Work Item、Agent 和过期 Approval 读取定位符同样使用现有 `/api/v1/` 路径，返回鉴权 JSON。读取定位符不授予恢复或重新审批权限；原动作门禁继续适用。

接口或功能更新须同次维护说明、配置和示例；完整接入手册初版属于后续文档任务。本次没有增加数据库迁移、领域能力或自动恢复。历史 UI、首败和独审原件保持，当前验收记录区分通过、失败与未测。
