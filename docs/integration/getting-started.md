# 环境与快速上手

## 准备服务

取得运行中的 API 地址和 MCP 地址。下表为源码开发默认值，生产值由部署方提供。

| 配置 | 用途 | 本地示例 |
| --- | --- | --- |
| `WEB_ORIGIN` | 对外 API origin、Human 来源检查和通知链接；名称为兼容保留 | `http://localhost:3001` |
| `WORKMESH_API_URL` | SDK、MCP 和 Runner 访问的 API 地址 | `http://127.0.0.1:3001` |
| `PUBLIC_MCP_ORIGIN` | discovery 和兑换返回的外部 MCP origin | `http://localhost:3002` |
| `WORKMESH_BETA_COORDINATION_MCP` | API 的配对能力与 HTTP MCP 的逐请求安装身份 | `true`（默认关闭） |
| `WORKMESH_MCP_MODE` | 发现和调用的读写模式 | `read-only` 或 `read-write` |
| `SESSION_COOKIE_SECURE` | Human Cookie 仅经 HTTPS 传输 | 生产为 `true` |

API 提供 `/.well-known/workmesh-agent` 和签名 Skill。MCP 提供独立的 `/mcp`。不要把 MCP origin 当作 API origin。`PUBLIC_MCP_ORIGIN` 只填 origin，不填 `/mcp`。

本地 HTTP 可用于就绪检查和 Human 读取。Coordination 配对的定位符合同要求 HTTPS，本地配对也须配置可信 TLS（Transport Layer Security，传输层安全）的 API 与 MCP 外部地址。部署方负责证书与反向代理；客户端保持证书校验，不关闭 TLS 验证。

源码环境使用 `.node-version` 的 Node 22.19.0 和 `package.json` 的 pnpm 9.15.4。按[部署说明](../backend-only-deployment.md)安装依赖、迁移和启动服务。宿主运行 pnpm 时，`DATABASE_URL`、`REDIS_URL` 和 S3 地址须指向宿主可达端口；Compose 内的 `redis`、`minio` 主机名供容器使用。首次安装用 bootstrap REST；已有安装直接登录。

首次接入先运行 `pnpm --filter @workmesh/api dev`，需要后台任务时再运行 worker 的 `dev`。MCP 在选择凭据模式后启动。根 `pnpm dev` 会启动所有 workspace，空 Session Token 的静态 MCP 配置会令它失败；不能把默认环境样例当成所有服务已可启动的配置。

```powershell
Invoke-RestMethod "$env:WORKMESH_API_URL/readyz"
Invoke-RestMethod "$env:WORKMESH_API_URL/api/v1/info"
```

预期 readiness 返回 `status=ok`。`info` 返回版本、schema baseline 和 build SHA。健康检查不证明调用者有领域权限。

## 运行 Human 示例

先让秘密管理器向当前进程提供 `WORKMESH_HUMAN_EMAIL` 和 `WORKMESH_HUMAN_PASSWORD`。不要将密码写入命令行、仓库或聊天。示例在内存中保留 Cookie/CSRF，登录后读取本人和可见 Team，最后登出。

```powershell
# 从仓库根目录执行；环境凭据由秘密管理器注入。
node docs/integration/examples/human.mjs
```

输出只含 Actor ID、Team ID 和登出结果。登录请求显式携带 API Origin；写请求同时携带 Cookie、CSRF 和幂等键。源码见 [human.mjs](examples/human.mjs)。

## 配对 Agent

部署方先在 API 与 HTTP MCP 同时启用 Coordination，并清空 `WORKMESH_SESSION_TOKEN` 和 `WORKMESH_MCP_ACCESS_TOKEN`。源码部署须向 API/MCP 进程提供 `WORKMESH_BETA_COORDINATION_MCP=true`，再在独立终端运行 `pnpm --filter @workmesh/mcp dev`。

默认开发 `docker-compose.yml` 不传入 Coordination 开关；在 `.env` 设置为 `true` 也不会切换模式。Coordination 镜像部署使用现有生产配置。先按[生产部署](../production-deployment.md)准备私有 `.env.production`，填写同源提交的三个完整镜像引用、build SHA、所需秘密和两个 HTTPS origin。设置 Coordination 开关并清空上述静态凭据，然后执行：

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent pull api worker mcp
docker compose --env-file .env.production -f docker-compose.production.yml --profile agent up -d --wait --wait-timeout 240 api worker mcp
```

生产配置将开关传入 API、worker 和 MCP。后续查看日志或停止服务仍须带同一环境文件、`-f docker-compose.production.yml` 和 `--profile agent`。已有部署沿用原 Compose project；从旧栈升级先执行旧 Web 退役与适用迁移屏障。

Workspace Admin 按 [REST 配对步骤](rest.md)创建 Connection。管理员通过可信渠道交付完整配对码，以及不含秘密的预期清单。清单须由管理员批准，不从公开 discovery 自动生成信任事实。

复制[预期清单样例](../../apps/connector/examples/expectation.json)，替换全部身份、地址、能力与 Skill pin。MCP 与 Skill 可使用清单批准的不同 HTTPS origin。然后从仓库运行：

```powershell
pnpm --filter @workmesh/connector connect --expect <已批准清单的路径>
pnpm --filter @workmesh/connector exec tsx src/cli.ts run -- <客户端可执行文件> <参数>
```

首条命令在隐藏提示中读取完整 `wmp_` 配对码。连接器核 discovery、响应身份、指纹、Skill 原字节及签名，再执行 MCP 引导。安装令牌持久化到系统秘密存储；输出配置只引用秘密环境名。第二条命令从秘密存储读取令牌，注入子进程 `WORKMESH_INSTALLATION_TOKEN`。

Windows 使用 Credential Manager，macOS 使用 Keychain，Linux 使用 Secret Service。系统后端不可用或目录祖先不安全时，连接器拒绝运行。按[连接器说明](../../apps/connector/README.md)处理；不要关闭权限检查。此处仅提供源码运行方式，不声明设备安装包已经发行。

## 运行 SDK/MCP 读取示例

本示例复用已验证的连接与清单。秘密管理器或连接器 `run` 向进程注入 `WORKMESH_INSTALLATION_TOKEN`，同时提供非秘密的 `WORKMESH_EXPECTATION_FILE` 清单路径。连接器启动后，按输出的配置运行实际客户端；开发者也可在具有同等受保护秘密注入的终端执行：

```powershell
pnpm -C packages/conformance exec tsx examples/integration-agent.ts
```

示例先用 SDK 核当前 Connection，再使用官方 MCP 客户端执行 initialize、`verify_connection`、`get_workmesh_context` 和 `tools/list`。输出只含已核身份、工具数量和 Team ID；不会认领工作或发出外部请求。源码见 [integration-agent.ts](../../packages/conformance/examples/integration-agent.ts)。示例要求先完成连接器的配对与 Skill 验证。
