# 接口参考

## 权威合同

完整 REST 参数、security、返回状态与 schema 见 [OPENAPI.yaml](../../OPENAPI.yaml)。严格运行时 DTO（Data Transfer Object，数据传输对象）见[共享 Zod 合同](../../packages/contracts/src/index.ts)。[路由策略表](../route-policy-matrix.md)说明 actor、feature 和授权策略；它不能代替实时权限检查。

当前 `POST /api/v1/projects` 的实测成功状态为 200，OpenAPI 声明为 201；这是既有差异，接入客户端按成功的 2xx 与实际正文处理。本轮只记录差异，没有改 API 或合同。配对创建仍按实际 201 验证。

[AGENT_PROTOCOL.md](../../AGENT_PROTOCOL.md)规定 Session、Delegation、Stop、Webhook、Lease 和恢复。[SDK 实现](../../packages/agent-sdk/src/index.ts)、[MCP 注册](../../apps/mcp/src/index.ts)和 [HTTP 入口](../../apps/mcp/src/http.ts)分别确定客户端封装、工具 schema 与凭据模式。历史 ADR 参数若与当前合同不同，以当前合同为准；页面交付按 ADR 0087 退役。

## 常用 REST 入口

表中权限为接入用途说明，详细规则仍按 OpenAPI 和领域命令核验。API origin 承载所有下列路径。

| 方法与路径 | 用途与前提 |
| --- | --- |
| `GET /readyz` | readiness，公开读取 |
| `GET /api/v1/info` | 版本和 build SHA，公开读取 |
| `GET /api/v1/install-status` | 安装状态，公开读取 |
| `POST /api/v1/auth/install` | 首次管理员安装，bootstrap 与幂等 |
| `POST /api/v1/auth/login` | Human 登录与幂等 |
| `GET /api/v1/auth/me` | Human 当前身份 |
| `POST /api/v1/auth/logout` | Human Cookie/CSRF 与幂等 |
| `GET /api/v1/teams` | 当前可见 Team，Human 或合法 Agent |
| `GET /api/v1/teams/{id}/states` | 当前 Team 工作流状态 |
| `GET /api/v1/projects` | 授权 Project 列表 |
| `POST /api/v1/projects` | 创建 Project，合法写身份与幂等 |
| `PATCH /api/v1/projects/{id}` | 更新 Project，revision 与幂等 |
| `GET /api/v1/work-items` | 授权工作项筛选与分页 |
| `POST /api/v1/work-items/{id}/claim` | 合法 C 自认领，准确资源与 revision |
| `POST /api/v1/work-items/{id}/agent-session` | 原子委派并启动，按权限与 revision |
| `GET /.well-known/workmesh-agent` | 公开 discovery，Coordination 开关 |
| `POST /api/v1/agent-connections` | Workspace Admin 创建配对 |
| `POST /api/v1/agent-connections/redeem` | 一次性配对码兑换，幂等 |
| `GET /api/v1/agent-connections/{id}` | 当前合法 Human 管理读取 |
| `POST /api/v1/agent-sessions/{id}/token/exchange` | exchangeToken 与有效安装身份 |
| `POST /api/v1/agent-sessions/{id}/token/refresh` | live 安装授权刷新准确目标 |
| `GET /api/v1/agent-capabilities` | 准确 Agent manifest，可传 `discovery=qualified` |
| `POST /api/v1/agent-sessions/{id}/ack` | 准确 E ACK，幂等 |
| `POST /api/v1/agent-sessions/{id}/state` | E 状态转换，revision 与幂等 |
| `POST /api/v1/agent-sessions/{id}/heartbeat` | 诊断心跳，幂等 |
| `PUT /api/v1/agent-sessions/{id}/plan` | 完整新 Plan 版本，revision 与幂等 |
| `POST /api/v1/agent-sessions/{id}/complete` | summary 与证据或显式原因，角色规则仍适用 |
| `POST /api/v1/agent-sessions/{id}/stop-ack` | 原 E 的停止清理，revision 与幂等 |
| `GET /api/v1/agent-sessions/{id}/execution-result` | 原 action/key 与合法来源确认 |
| `GET /api/v1/events` | 持久事件读取，授权范围 |
| `GET /api/v1/events/stream` | SSE 与持久事件 cursor |
| `GET /api/v1/human-attention/{id}` | 实时授权 attention JSON |
| `GET /api/v1/notifications` | Human 通知 JSON |
| `GET /skills/workmesh-1.1.0.md` | 固定签名 Skill 原字节，地址取自兑换响应 |

Project/Issue 文档、Milestone、relation、Inbox、Room、Approval、Artifact、Git action 和可选功能均在完整 OpenAPI 中。创建文档不等于批准动作，Lease 不授授权，provider 成功后的未知回执不能自动重发。

## 常用 MCP 工具

| 工具 | 参数与身份 |
| --- | --- |
| `verify_connection` | `{}`，当前 C 身份核验 |
| `get_workmesh_context` | `{}`，当前 C 引导与 allowedOperations |
| `get_agent_discovery` | `{}`，当前身份资格与 adapter 投影 |
| `list_teams` | `cursor/limit`，当前合法身份 |
| `list_projects` | `teamId/cursor/limit`，当前 C 与范围 |
| `create_project` | `teamId/name/idempotencyKey`，合法 C 与 `work:write` |
| `get_agent_session` | `id`，准确 E 或合法目标 bridge |
| `get_session_context` | `id`，准确 E 或合法目标 bridge |
| `get_session_plan` | `id`，准确 E 或合法目标 bridge |
| `get_repository_context` | `repositoryId`，合法 scope 与能力 |
| `get_session_execution_result` | `sessionId/action/operationKey`，安装用途与原来源 |

完整工具、resource 与 template 列表由本次 MCP 发现返回。输入名按 schema 大小写使用；不要从 REST 路径参数猜 MCP 参数。`tools/list` 不保证服务端保留的兼容 callback 对当前身份可用。

## 配置与扩展

| 入口 | 说明 |
| --- | --- |
| [环境样例](../../.env.example) | 源码开发与共享配置；秘密占位必须替换 |
| [Lite 环境样例](../../.env.lite.example) | API/worker/migrate 与外部 MCP/Runner |
| [连接器](../../apps/connector/README.md) | 受保护 pending、OS 秘密存储与运行器 |
| [Agent Runner](../agent-runner.md) | 独立进程、安装/Session/Runner 凭据 |
| [Agent 工具权限](../agent-tool-permissions.md) | 能力与授权操作 |
| [灾备](../operations/disaster-recovery.md) | PostgreSQL 与对象存储完整恢复 |

通知、自动化、A2A、模型预置、Git provider 及其他可选能力依照各自 feature 与部署合同。`supportedClients` 声明协议类型，不证明某客户端版本、设备或所有联合链已经通过验收。

## 接入恢复字段参考

| 字段 | 含义 |
| --- | --- |
| `error.next_action` | 客户端可执行的恢复步骤 |
| `error.human_action` | 需转述的一项人工动作；无需人工时为“无需人工操作” |
| `error.supported_clients` | 类型不匹配时返回的部署支持列表；与 discovery 共用来源 |
| `error.details.reason` | 区分 slug、客户端类型与 enrollment policy 不匹配 |
| `WorkMeshSdkError.recovery` | SDK 按错误码、原因和目录核验的恢复字段；非法字段丢弃 |
| `ConnectorError.retryAfterMs` | CLI 为 429/503 保存的安全等待毫秒数，未知时为 `undefined` |

契约为 `AgentConnectionError` 与共享 `agentConnectionErrorResponseSchema`；完整例子见[错误与恢复](troubleshooting.md)。SDK 重试和服务端授权保持原规则。
