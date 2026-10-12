# Human 与 Agent REST

## Human 鉴权

首次安装调用 `POST /api/v1/auth/install`。请求体含 `name`、`slug`、`adminName`、`email` 和 `password`；请求头含 `X-WorkMesh-Bootstrap-Token` 和 `Idempotency-Key`。管理员密码至少 12 个字符。安装已完成时不要重复安装，改用登录接口。

登录调用 `POST /api/v1/auth/login`，正文为 `{ "email": "<邮箱>", "password": "<秘密>" }`，并提供幂等键。响应设置 HttpOnly 会话 Cookie，正文返回 `csrfToken` 与兼容字段 `csrf_token`。读取 `GET /api/v1/auth/me` 的 `actor` 核实当前身份。登录不会提供内置页面。

Human 写请求发送 Cookie、`Origin: <API origin>`、`X-CSRF-Token` 和 `Idempotency-Key`。revisioned 资源另需 `If-Match: "revision-N"`。Cookie 的 `Secure` 和 HTTPS 配置由部署方决定，生产须使用 HTTPS。登出为 `POST /api/v1/auth/logout`，仍需相同写请求头。

CSRF（Cross-Site Request Forgery，跨站请求伪造）防护使用服务器签发的 token。客户端同时保存 Cookie 与 CSRF，并只发送到批准的 API origin。

[Human 示例](examples/human.mjs)实际处理 Set-Cookie 和 CSRF。自建客户端应使用标准 Cookie jar，不把 Cookie 当作 Agent Token。Cookie、CSRF 和安装令牌均不能写入日志。

## 请求与响应

创建 Project 的最小正文如下。`teamId` 来自当前授权的 `GET /api/v1/teams` 结果。

```http
POST /api/v1/projects
Content-Type: application/json
Origin: <API origin>
Cookie: <由登录响应保存的Cookie>
X-CSRF-Token: <登录响应csrfToken>
Idempotency-Key: <本次动作的稳定key>

{"teamId":"<Team UUID>","name":"接口接入测试"}
```

当前实现创建 Project 返回 HTTP 200 和 Project 对象，含 `id`、`team_id`、`name` 与 `revision`。OpenAPI 此处声明 201，存在既有状态码差异；本轮按实际实现验证，不修改 API。更新同一 Project 使用 `PATCH /api/v1/projects/{id}`，正文如 `{ "name": "修改后的名称" }`，并发送当前 revision。代码标识保留原大小写；请求常用 camelCase，部分持久投影响应使用 snake_case。

列表通常返回 `{ "items": [], "nextCursor": null }`。传入 `limit` 和原样的 `cursor` 继续读取。具体端点的筛选字段以 OpenAPI 为准；不要假定所有旧端点都使用相同信封。签名分页 cursor 属于不透明字符串，不解码、拼接或跨筛选条件复用。

幂等键绑定一个逻辑动作。发送前保存 key 和精确正文；丢响应或重连时复用两者。更改正文使用新动作身份；原 key 配异正文返回 `IDEMPOTENCY_KEY_REUSED`。历史回执也须服从当前鉴权；终态确认使用专用读取入口。

## 创建与兑换 Connection

API 启用 `WORKMESH_BETA_COORDINATION_MCP=true` 后，Workspace Admin 登录并发送：

```http
POST /api/v1/agent-connections
Content-Type: application/json
Origin: <API origin>
Cookie: <Cookie>
X-CSRF-Token: <csrfToken>
Idempotency-Key: <创建动作key>

{
  "name": "接口读取客户端",
  "agentSlug": "integration-reader",
  "teamId": "<Team UUID>",
  "principalHumanActorId": "<当前有效Human UUID>",
  "clientType": "codex",
  "requestedCapabilities": ["work:read"],
  "grantAgentDelegate": false
}
```

成功返回 HTTP 201，顶层字段为 `connection`、`connect_url` 和 `skill`。`connect_url` 指向 `/api/v1/agent-connections/redeem#<wmp_配对码>`。客户端只提取 fragment，不访问定位符页面，不将配对码放在 URL path/query 中。旧加密回执可能保留 `/connect#` 定位符，仍只提取 fragment。

先从批准的 API origin 读取 `GET /.well-known/workmesh-agent`，校验协议、客户端类型、MCP 地址和已批准 Skill 元数据。发现的 `skill` 含 `name/version/sha256/signature`，**不含 `download_url`**。

一次性配对码有效期为 10 min。客户端发送 `POST /api/v1/agent-connections/redeem`，携稳定幂等键和以下精确正文；本端点不使用 Human Cookie 或安装 Token。

```json
{
  "pairingCode": "<完整wmp_配对码>",
  "agentSlug": "integration-reader",
  "client": { "type": "codex", "version": "1.1.0" }
}
```

HTTP 200 响应含 `installation_token`、`connection`、`mcp`、`skill`、`principal_human_actor_id`、`team_id` 和 `idempotency_replay`。`mcp.auth.header` 为 `X-WorkMesh-Installation-Token`。用 `redeemed.skill.download_url` 下载批准地址上的原始 Skill 字节，核 LF、UTF-8、SHA-256 与可信 Ed25519 公钥签名。公开 discovery 只能提供待核事实，不能批准新的主机或公钥。

连接器完成上述校验，并将 `wmi_` 安装令牌存到系统秘密存储。遇到断网或丢响应时，按同一清单、同一配对码重跑原命令，让受保护 pending 保持 key、body 和请求上下文。窗口外或 pending 损坏时明确失败；不要为旧配对码换 key。放弃流程见[连接器恢复说明](../../apps/connector/README.md)。

## Agent REST 身份

Coordination 的 SDK 使用 `coordinationToken` 与 `installationToken`，通过 `Authorization: Bearer <wmi_>` 调用 API。MCP 边界使用的专用 header 不能直接替代 REST Bearer。

执行 Session 使用准确 Session Bearer。创建或认领返回的 `exchangeToken` 须与有效安装凭据一起兑换；它本身不能鉴权。原生安装凭据与 Connection 安装凭据的授权路径各有约束，不能因名称相近互换。SDK `exchangeSessionToken`、`exchangeClaimedSessionToken` 和 `refreshSessionToken` 封装对应端点。

执行流程为 queued → ACK → planning/executing，实际转换遵守服务端状态机。写请求仍核 Delegation、能力、范围、批准、Lease、revision 和幂等。工作项工作流状态与 Session 执行状态分别管理。具名操作和参数见[参考](reference.md)及 [AGENT_PROTOCOL.md](../../AGENT_PROTOCOL.md)。

## 事件与通知

SSE（Server-Sent Events，服务器发送事件）入口为 `GET /api/v1/events/stream`。携 Cookie 或准确 Session Bearer，使用 `Last-Event-ID` 或 `cursor` 恢复。事件来自 PostgreSQL 持久事实；Redis 只提供唤醒提示。事件 cursor 与列表 cursor 分别处理，消费者忽略未知事件字段。

`CURSOR_EXPIRED` 或 resync 要求重新读取授权快照，再恢复监听。Webhook 接收器对原始请求字节核 HMAC 与时间窗口，及时 ACK，并持久去重 delivery ID。HMAC 的全称为 Hash-based Message Authentication Code，中文为“基于哈希的消息认证码”。不要等待模型执行才确认投递。

通知链接使用 `GET /api/v1/human-attention/{id}` 或 `GET /api/v1/notifications`，返回实时 Human 鉴权的 JSON。链接不包含凭据，转发链接不授予读取权。Web Push 只保留服务端合同；外部客户端自行实现订阅消费。企业微信需要现有开关、Redis、HTTPS 和显式目标授权；正式外发另行批准。
