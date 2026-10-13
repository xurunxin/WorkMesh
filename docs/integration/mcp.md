# MCP 身份与调用

## 选择凭据模式

| 模式 | MCP 边界凭据 | 访问 API 的身份 |
| --- | --- | --- |
| HTTP Coordination | 每个 `/mcp` 请求的 `X-WorkMesh-Installation-Token: <wmi_>` | 本请求从 Connection 派生的 C（Coordination Session，协调会话） |
| HTTP 静态 Session | `Authorization: Bearer <WORKMESH_MCP_ACCESS_TOKEN>` | 服务端配置的准确 E（Execution Session，执行会话）Token |
| 本地 stdio Coordination | 子进程环境 `WORKMESH_INSTALLATION_TOKEN` | 当前 Connection 派生的 C |
| 本地 stdio Session | 子进程环境 `WORKMESH_SESSION_TOKEN` | 准确 E |

HTTP Coordination 服务启用 `WORKMESH_BETA_COORDINATION_MCP=true`，同时清空 `WORKMESH_SESSION_TOKEN` 和 `WORKMESH_MCP_ACCESS_TOKEN`。每个请求只带安装 header，混用 Authorization 拒绝。静态服务则关闭 Coordination，设置彼此独立的 Session Token 和 MCP access token；安装 header 不适用于该模式。

stdio 入口为 `pnpm --filter @workmesh/mcp start:stdio`，须先构建。开发可用 `pnpm --filter @workmesh/mcp exec tsx src/stdio.ts`。两种 stdio 凭据同时设置时启动失败。`WORKMESH_API_URL` 始终指向 API。客户端配置只引用秘密环境名，不将令牌写入可复制配置。

HTTP 使用官方 SDK 1.29.0 的 Streamable HTTP。调用 `POST /mcp`，携 `Content-Type: application/json`、`Accept: application/json, text/event-stream` 和所选模式的凭据。响应可为 JSON 或 SSE，应使用支持该传输的客户端库。

## 先核身份再选工具

客户端按以下顺序引导。官方 `Client.connect` 已完成 initialize 与 initialized 通知；不要另行重放它们。

1. 连接管理员批准且与兑换响应相同的 MCP URL。
2. 调用无目标参数的 `verify_connection`。核 Connection、Team、principal、当前 active 凭据和 bootstrap 回执。
3. 调用 `get_workmesh_context`。核当前身份、Team、workflow states、allowedOperations 和 durable replay cursor。
4. 读取 `tools/list`，按当前 schema 调用具名工具。需要详细资格时调用 `get_agent_discovery`。

工具成功结果为 `structuredContent: { "data": <结果> }`，另含文本内容。错误结果为 `isError: true` 和结构化 `error`。客户端同时检查 JSON-RPC 错误与 tool 错误；仅 HTTP 200 不能证明调用成功。[读取示例](../../packages/conformance/examples/integration-agent.ts)展示实际拆包。

## 资格与能力

REST `GET /api/v1/agent-capabilities?discovery=qualified` 返回准确当前 Session 的资格。MCP `get_agent_discovery` 在 manifest 外增加 adapter 投影。省略 REST discovery 参数仍返回旧 manifest；未知协商值拒绝。

| 字段 | 含义 |
| --- | --- |
| `registered` | adapter 具有兼容 callback |
| `deploymentSupported` | 当前 mode、Coordination 与 installation bridge 支持 |
| `discoverable` | 当前身份满足已知发现条件 |
| `eligible` | 已知前提通过；目标权限仍须调用时检查 |
| `requires_target_check` | owner、scope、批准、Lease、revision 或幂等仍待目标检查 |

`get_workmesh_context.allowedOperations`、`tools/list` 和 resource 发现按同一规则派生。数量不代表授权或验收率。`read-only` 隐藏写工具并拒绝缓存写调用；Human-only 工具对 Agent 隐藏，缓存调用仍返回 `FORBIDDEN`。

C 绑定单一 Team 和 principal。C 读取本人准确 E 的条件变体须通过安装 bridge；目标 Token 局部使用，不覆盖共享身份。直接 E 只读取自身 Session，无需安装 bridge。任意 `sessionId` 或输出 Session ID 都不能授予跨 Session 权限。

## 最小调用

以下为 initialize 后的工具请求。每个 HTTP 请求仍携凭据；实际输入以本次 `tools/list` 的 schema 为准。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": { "name": "verify_connection", "arguments": {} }
}
```

C 可以用 `list_projects` 读取绑定 Team，输入为 `{ "teamId": "<Team UUID>", "limit": 1 }`。分页响应保留 `{items,nextCursor}`；将 `nextCursor` 原样传入 `cursor`。

E 读取 Session 的 tool alias 为 `get_agent_session`、`get_session_context` 和 `get_session_plan`，准确参数名为 `id`。等价 resource 使用 `workmesh://session/<Session UUID>`，其 context/plan 路径追加 `/context` 或 `/plan`。使用 `resources/list` 和 `resources/templates/list` 选择本次可见入口。

写工具通常将 `idempotencyKey` 和 `revision` 传给 SDK，再映射为 REST header。例如 `create_project` 输入为 `teamId/name/idempotencyKey`；该工具要求合法 C、`work:write` 和读写 mode。SDK 的调用选项为 `{ idempotencyKey, ifMatch }`，不能直接当 MCP 参数使用。完整字段看发现 schema；不要为了重连生成新 key。

`claim_work_item` 使用当前 C 认领，返回的新 E 还须兑换并 ACK。`agent:delegate` 仅由管理员明确授予，且必须配合 `grantAgentDelegate`；普通工作能力不会自动获得委派能力。角色、批准、Lease、终态和 Stop 始终由 API 裁决。

## 恢复边界

manifest 不可读时保留原拒绝，不用缓存降级。受保护 401/403、撤权、Stop 和角色拒绝不能靠刷新或换身份重试。`ack_agent_session`、`heartbeat` 与 `stop_ack` 有既有生命周期入口，详见[恢复说明](troubleshooting.md)。

HTTP 每请求重建 client。C 在 Stop 后不能假定仍持有上次目标 E，也不能 refresh 出新 E。受控 Runner 持原有效 E Token 执行 Stop 清理协议。安装用途的 `get_session_execution_result` 用原 action/key 确认准确终态结果，不恢复执行。

## 接入拒绝的恢复字段

SDK 收到 API 的接入拒绝后，将双指令和支持类型保存在 `WorkMeshSdkError.recovery`。MCP 输出前再次按错误码、安全原因和本地目录核对字段。非法新增字段丢弃，原错误保留。MCP 工具失败把通过校验的字段放进 `structuredContent.error` 和文本错误，保留 `correlationId`、`details`、适用的 `currentRevision` 与原 `safeNextAction`。客户端先判断 `isError`，再按[恢复指令](troubleshooting.md)处理。旧响应缺字段时仍保留原拒绝；指令不触发身份刷新、自动恢复或新调用。

安装后的连接器使用 `workmesh-connector run -- <client>`，令牌仍只注入客户端环境。版本化离线产物与当前验证状态见[安装说明](installation.md)。
