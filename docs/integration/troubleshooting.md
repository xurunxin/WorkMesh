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

SDK `WorkMeshSdkError` 保留 `code/message/status/details/correlationId` 和适用的 `retry` 元数据。MCP 另提供 `safeNextAction` 提示；该提示不授予权限。当前 SDK 不保证把任意 REST 顶层字段全部转交，客户端须按现有合同读取。B3 未实现字段不能作为恢复前提。

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
