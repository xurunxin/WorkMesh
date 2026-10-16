# 错误与恢复

## 读取结构化错误

REST 错误形状如下，`details` 按错误类别变化。`currentRevision` 在可用时保留；不要假定所有错误都具有它。

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "<公开错误说明>",
    "details": {},
    "correlationId": "<服务端关联ID>"
  },
  "currentRevision": 2
}
```

SDK 和 MCP 在各自的消费边界核对错误码、安全原因、双指令及支持列表与本地恢复目录的一致性。目录外文字、控制串、秘密和原因或列表错配都会丢弃新增恢复字段，原错误仍保留。类型不匹配缺少合法 `details.reason` 时也丢弃恢复字段。

SDK `WorkMeshSdkError` 保留 `code/message/status/details/correlationId` 和适用的 `retry` 元数据。接入错误的双恢复指令及支持类型另保存在 `recovery`。旧响应缺少恢复字段时，`recovery` 为 `undefined`，原错误仍保留。MCP 的 `safeNextAction` 保持原行为；恢复提示不授予权限。

## 接入恢复指令

配对、enrollment 和当前连接身份验证失败时，`error.next_action` 说明客户端动作，`error.human_action` 给出可直接转述的一项人工动作。无需人工介入时，后者为“无需人工操作”。其他 API 路由的安装 header 认证失败也返回这两个字段；其业务错误沿用原恢复规则。

以下响应表示配对的 Agent slug 不匹配。`supported_clients` 与 discovery 的部署列表一致。它不能修复 slug 绑定，也不表示 enrollment policy 允许这些类型。

<!-- b3-recovery-example -->
```json
{
  "error": {
    "code": "AGENT_CONNECTION_CLIENT_TYPE_MISMATCH",
    "message": "Pairing identity does not match its envelope",
    "details": { "reason": "agent_slug_mismatch" },
    "correlationId": "b3-example",
    "next_action": "停止兑换。配对的 Agent slug 绑定不一致，supported_clients 不能修复它；保留原 pending 和旧配置。",
    "human_action": "请管理员签发与当前 Agent slug 匹配的新配对清单。",
    "supported_clients": ["codex", "opencode", "pi", "generic_mcp"]
  }
}
```

`details.reason` 为 `agent_slug_mismatch`、`client_type_mismatch` 或 `enrollment_client_type_denied`。同时猜错 slug 和类型时，先报告 slug。未知类型枚举在输入校验时拒绝；返回 `VALIDATION_ERROR`，不会增加合法配对的 attempts。

错误配对码不会增加合法配对的 attempts。已知配对的 wrong slug 或已知错误类型各增加一次；达到 8 次后，后续兑换返回 `AGENT_CONNECTION_PAIRING_LOCKED`，不再增加该计数。两个兑换操作的 endpoint、subject-client 和失败退避分别按 operationId 隔离；IP 和 socket 预算共享。

连接器 CLI 显示“客户端动作”“人工动作”和适用的部署支持类型。429/503 还显示“等待时长：N 秒（Retry-After）”。CLI 只接纳本地目录中的指令，异常响应沿用安全提示；不打印服务端自由文本或秘密。失败保留 pending 和旧配置，指令不会自动改类型、换 key、刷新身份或重写配置。

有原 pending 时，只重放原 key、精确正文及客户端上下文。取得新配对清单后，按连接器显式 `abandon-pending` 流程处理旧请求。支持类型列表供你核对真实客户端，不允许直接改写已冻结 pending。

SDK 从 `error.recovery` 读取指令。MCP 工具失败将同一字段放进文本错误和 `structuredContent.error`，并保留原 `safeNextAction`。客户端先检查 `isError`，再读取 `next_action` 和 `human_action`。MCP HTTP 边界的凭据模式拒绝仍遵守原传输合同，不保证具有工具错误正文。

CLI 只接受非负整数秒或规范 GMT HTTP-date。日期按收到响应时的时钟计算，过期日期为 0；展示秒数向上取整。负数、溢出、控制串、非法或缺失头不会回显到终端，CLI 显示“等待时长不可用，请停止重试并联系部署管理员”。CLI 本次命令退出失败，不自动等待或重试，pending 和旧配置保持。

例如，429 响应头 `Retry-After: 7` 或 503 响应头 `Retry-After: 7` 都会显示：

```text
等待时长：7 秒（Retry-After）；本命令不会自动重试。
```

HTTP 429 保留 `Retry-After`、`RateLimit-Remaining` 和 `RateLimit-Reset`。等待完整的 `Retry-After`，按原预算重放原请求；SDK 的超预算抑制规则保持。限流存储故障返回 HTTP 503 和 `AUTH_RATE_LIMIT_UNAVAILABLE`，认证失败关闭。

[可运行 Agent 示例](../../packages/conformance/examples/integration-agent.ts)保留 SDK/MCP 错误信息；[接入验收入口](../../packages/conformance/examples/verify-integration.ts)验证真实 API 拒绝、SDK 恢复字段和文档示例。运行 `pnpm verify:integration-examples`，记录在独有测试环境中的结果。

## 按原因处理

| 情况 | 当前处理 |
| --- | --- |
| `UNAUTHENTICATED`、HTTP 401 | 核凭据类型和当前有效性；不把配对码当安装 Token，不混用 MCP header 和 REST Bearer |
| `FORBIDDEN`、`RESOURCE_SCOPE_DENIED`、撤权 | 停止原动作；由当前合法 Human 处理授权，不尝试缓存或换身份绕过 |
| `FEATURE_DISABLED` | 部署方确认开关；开启不代表已授能力 |
| `REVISION_CONFLICT` | 读取当前资源并重新判断意图；新逻辑动作使用新 key 和当前 revision，不盲覆盖 |
| `IDEMPOTENCY_KEY_REUSED` | 原 key 与正文不一致；核本地持久请求身份，不修改原动作后冒重放 |
| 配对过期、已消费或锁定 | 保留原 pending；按连接器恢复或显式放弃流程处理，管理员再签发新码 |
| `CURSOR_EXPIRED`、realtime resync | 重新读取授权快照，恢复独立的事件 cursor 与列表 cursor |
| HTTP 429/503 | 遵守 `Retry-After`，保留 key/body/authorization；不因此 refresh Token |
| `PROVIDER_ACTION_OUTCOME_UNKNOWN` | 核原动作与外部效果；未知结果不能用新 key 重发 |

SDK 默认最多尝试 3 次，对传输失败、429 和可重试的 5xx 有界重试。指数退避初值为 150 ms，上限为 2,000 ms。合法 `Retry-After` 独立接受至 60,000 ms，累计延迟预算为 120,000 ms。超过预算时停止自动重试，`retry` 说明原因。显式拒绝与未知外部效果须按领域规则处理。

## 执行 Session 的恢复

开始执行前，按 live 授权兑换或刷新准确 E Token，再 ACK，读取 revision 并转换状态。显式 stale ACK 使用既有 refresh → ACK 流程；不要先读取会拒绝 stale 的普通 qualified manifest。`acknowledged` 状态只允许原 ACK key/body 回执重放，新 key 仍拒绝。

收到 Stop 后，停止模型、新工具与 steering，等待在途工具静止。清理本人资源后，持原准确有效 E Token、当前 revision 和稳定 key 调用 `POST /api/v1/agent-sessions/{id}/stop-ack`。提交 `cleanupSummary` 与 `residualRisks`；失败或强杀留下的资源如实报告。普通 Lease release 不能替代 stop ACK。

complete 或 stop ACK 已提交却丢响应时，使用 `GET /api/v1/agent-sessions/{id}/execution-result?action=complete|stop_ack&operationKey=<原key>`。SDK 为 `getSessionExecutionResult`，MCP 为 `get_session_execution_result`。入口使用合法原安装来源或合法 Human 读取，核实时权限与原提交来源；普通终态 E 不获写权。`unavailable` 不证明未提交。

Pi 内部完成使用原外层 settle key/body 的原子重放，不具备独立 complete 回执。外部效果未核实时仍保留不确定性，不重复模型或 provider 写动作。等待接续须有现行部署开关和 Runner opt-in；旧消费者默认不接续。

## 保留安全诊断

排障提供 `correlationId`、准确 build SHA、操作名、状态码和无秘密的结果摘要。保留首败，分别记录复验与未测。禁止把 Token、Cookie、配对码、模型密钥、完整 webhook URL 或原始 provider 错误写入活动和仓库。机器间的支持范围与正式第三方外发须单独核验。

发行安装失败、回退和保留配置的卸载见[安装说明](installation.md)。`connect` 不支持 `--dry-run`；安装助手的 `--dry-run` 只读校验发行输入。

## 服务端基础交付候选

版本化服务端包的配置检查、安装、升级、程序回退和独立空目标恢复见 [服务端安装说明](server-installation.md)。当前处于 TA01 实现与验收阶段，尚未形成双架构三画像支持声明；连接器已交付能力沿原安装说明保留。
