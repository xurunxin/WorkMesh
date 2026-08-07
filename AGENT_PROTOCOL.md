# WorkMesh Agent Protocol v0.1

> 本文定义 WorkMesh 平台与外部 Agent、Agent Runner、MCP Client 以及后续 A2A Adapter 的交互契约。  
> 日期：2026-07-22

---

## 1. 目标

协议必须确保：

- Agent 是有身份、有作用域的 Actor；
- 一次执行有明确 Session；
- 人和其他 Agent 能看到计划、状态、动作、证据和结果；
- 所有写操作可追踪、幂等、可停止；
- Agent 可以在不暴露内部模型状态或隐藏思维链的前提下协作；
- Agent 供应商可替换，历史仍保存在 WorkMesh；
- 多 Agent 可以可靠分工、交接和避免重复执行。

## 2. 非目标

- 不规定 Agent 内部使用哪种模型或框架；
- 不要求 Agent 上传原始 Chain of Thought；
- 不负责在 WorkMesh API 容器中运行不可信代码；
- 不把自然语言消息当作唯一机器协议；
- 不把 Lease 当成权限系统；
- 不保证外部副作用可自动回滚。

---

# 3. 身份与认证

## 3.1 Agent Definition

Agent 首次注册提交 Manifest：

```json
{
  "name": "Backend Coder",
  "slug": "backend-coder",
  "provider": "internal",
  "version": "1.3.0",
  "endpointUrl": "https://agent.internal.example/workmesh/events",
  "supportedProtocols": ["native_http", "mcp"],
  "skills": ["code.investigate", "code.implement", "test.run"],
  "requestedCapabilities": [
    "work:read",
    "work:write",
    "plan:write",
    "message:write",
    "artifact:write",
    "repo:read",
    "repo:write_branch",
    "repo:open_pr",
    "ci:run"
  ],
  "outputArtifactTypes": ["commit", "pull_request", "test_report"],
  "maxConcurrency": 3,
  "heartbeatIntervalSeconds": 30,
  "metadata": {
    "runtime": "cloud-runner"
  }
}
```

Admin 审核后产生：

- Agent Actor ID；
- 安装级凭据；
- 批准 Capability；
- Team/Project/Repository 范围；
- Webhook Secret 或公钥；
- 并发和预算上限。

## 3.2 Token 层级

### Installation Token

用途：

- Agent 自身元数据；
- 接收安装/权限变更；
- 请求创建合法 Session；
- 不直接授予任意工作区写权限。

### Session Token

Session 创建时签发，至少包含：

- actor ID；
- session ID；
- delegation ID；
- workspace/team/project/work item scope；
- capability intersection；
- expiry；
- token ID / nonce；
- policy version。

Session Stop、Delegation Revocation、权限变更或到期后，服务端立即拒绝 Token。

## 3.3 请求头

所有写请求：

```http
Authorization: Bearer <session-token>
Idempotency-Key: <uuid-or-stable-operation-id>
X-Correlation-Id: <trace-id>
Content-Type: application/json
```

高冲突资源还要：

```http
If-Match: "revision-4"
```

## 3.4 Agent Connection（v1.1）

Agent 接入走 **Connection 生命周期**，与单 Work Item 的 executor Session 解耦。

发现：

```http
GET /.well-known/workmesh-agent HTTP/1.1
```

公开、不可缓存于代理私有缓存之外，返回：

```json
{
  "protocolVersion": "v1",
  "mcpUrl": "https://workmesh.example.com/mcp/coordination",
  "wellKnownUrl": "https://workmesh.example.com/.well-known/workmesh-agent",
  "apiVersion": "v1",
  "supportedClients": ["codex", "opencode", "pi"],
  "skill": {
    "name": "workmesh",
    "version": "1.1.0",
    "sha256": "sha256:<hex>",
    "signature": "ed25519:<base64>"
  }
}
```

发现端点**永远不返回任何 secret、配对码或安装凭据**。

Connection 生命周期：

1. `POST /api/v1/agent-connections`（Workspace Admin）创建预授权信封，固定 `name`、`agentSlug`、`teamId`、`principalHumanActorId`、`clientType`、`requestedCapabilities`、可选 `grantAgentDelegate`（默认 `false`）。响应包含 `id`、把配对码放在 fragment 里的 `connectUrl`、`pairingCodeExpiresAt`（10 分钟）、`skillVersion` 与 `skillSha256`，以及 `redactedToken: false`。配对码只存 hash。
2. `POST /api/v1/agent-connections/redeem`（Agent，**未鉴权**）用明文配对码 + `agentSlug` + 必需 `Idempotency-Key` 头兑换。服务端在**一个 PostgreSQL 事务**里写 `credential_fingerprints`、标记配对码已用、发出 `agent.connection.pairing_redeemed` 事件与 outbox 行；响应**只返回一次**明文 Installation Token、绑定的 Skill bundle、MCP 配置 blob、`principalHumanActorId`、绑定的 `teamId`。**成功响应以 `Idempotency-Key` 为键保留整个配对码生命周期**：Agent 因网络丢包重放同一 key 拿回完全相同的响应；同 key 不同 code → 拒绝；同 code 不同 key → `AGENT_CONNECTION_PAIRING_CONSUMED`；超阈值暴力猜测 → `AGENT_CONNECTION_PAIRING_LOCKED`。
3. `GET /api/v1/agent-connections/{id}` 返回当前状态、`lastUsedAt`、MCP/Skill 版本、凭据 fingerprint 前缀，明文 Token 永远不返。
4. `PATCH /api/v1/agent-connections/{id}` 允许 Workspace Admin 修改 `name`、`principalHumanActorId`（须仍在绑定 Team）、显示备注；**不能**改 `teamId`、`clientType`、`requestedCapabilities`、`grantAgentDelegate`。扩权只能走 Rotate。`PATCH` 必须带 `If-Match`。
5. `DELETE /api/v1/agent-connections/{id}` 撤销：标记 credential fingerprint revoked、关闭该 Connection 的活跃 Coordination Session、发出 `agent.connection.revoked` 与 outbox 事件；Connection 行保留为不可变审计记录。`DELETE` 必须带 `If-Match`。
6. `POST /api/v1/agent-connections/{id}/rotate` 颁发新配对码和新的 pending 凭据；旧/新凭据重叠 15 分钟。Agent redeem 成功后，**服务端在同事务里把旧 credential fingerprint 标记 `rotated`、新凭据变 `active`，Connection 从 `rotating` 回到 `active`**。这是计划"确认成功后撤销旧凭据"的实现：以"新 redeem 成功"作为撤销旧凭据的触发点，不另设 `/rotate-confirm` 端点。整轮在一个事务里完成，outbox 事件为 `agent.connection.rotated`。

UI 生成给 Human 复制给 Agent 的一句话统一为：

> 连接此 WorkMesh：打开 `<connectUrl>#<pairingCode>`，按返回指令安装 MCP 与 WorkMesh Skill，并调用 `verify_connection`。

fragment 携带配对码，绝不进入代理访问日志；`connectUrl` 的 schema 强制要求 fragment 存在。

## 3.5 Coordination Session（v1.1）

Installation Token 长期有效至撤销，但**不能**直接执行普通 mutation；它的全部工作流是**派生 Coordination Session**。

每次 Coordination MCP 请求：

1. 解析 Installation Token（原始字节，非 `Bearer` 头），定位到唯一 Connection。
2. 在一个 PostgreSQL 事务里重新校验 Agent、Team grant、Delegation、能力集、撤销状态；通过则开启或刷新一条 1 小时（最长 2 小时）的 **Coordination Session**。
3. 该 Session 复用既有 `agent_sessions` 表，新增枚举值 `session_kind = 'coordination'`、`connection_id` 外键、`role = 'coordinator'`、`delegation_scope = 'team'`。
4. Session 到期前自动续期；Connection 撤销后下一次请求即失败关闭，错误码 `COORDINATION_SESSION_CONNECTION_REVOKED`。

Coordination Session 不复用 executor Session 的预算 / 并发 / 单 Delegation 约束；它走的是 Connection × Team 的整组授权。

---

# 4. 事件信封

## 4.1 平台事件

```json
{
  "id": "evt_01J...",
  "type": "agent.session.created",
  "version": 1,
  "workspaceId": "ws_...",
  "aggregate": {
    "type": "agent_session",
    "id": "ses_...",
    "revision": 1
  },
  "actor": {
    "id": "alice_actor_id",
    "kind": "human",
    "displayName": "Alice"
  },
  "subject": {
    "type": "work_item",
    "id": "wi_..."
  },
  "correlationId": "cor_...",
  "causationId": "evt_parent",
  "sessionId": "ses_...",
  "sequence": 1,
  "occurredAt": "2026-07-22T18:30:00Z",
  "visibility": "team",
  "payload": {}
}
```

## 4.2 事件约束

- `id` 全局唯一；
- `type` 使用 dot-separated 命名；
- `version` 为该事件 schema 版本；
- `sequence` 在同一 Session 内单调递增；
- `correlationId` 贯穿一次用户意图；
- `causationId` 指向直接触发事件；
- `payload` 只放事件特有数据；
- Agent 不得覆盖 envelope 中的 Actor 和 Session；
- Event Consumer 必须按 `id` 幂等；
- 系统保证至少一次，不保证恰好一次投递。

## 4.3 核心事件类型

### Work

- `work_item.created`
- `work_item.updated`
- `work_item.status_changed`
- `work_item.relation_added`
- `work_item.deleted`
- `project.updated`
- `milestone.updated`

### Delegation / Session

- `agent.delegation.created`
- `agent.delegation.revoked`
- `agent.session.created`
- `agent.session.prompted`
- `agent.session.acknowledged`
- `agent.session.state_changed`
- `agent.session.stale`
- `agent.session.signal.stop`
- `agent.session.signal.pause`
- `agent.session.signal.resume`
- `agent.session.completed`
- `agent.session.failed`
- `agent.session.canceled`

### Plan / Activity

- `agent.plan.published`
- `agent.plan.changed`
- `agent.plan.step.claimed`
- `agent.plan.step.started`
- `agent.plan.step.blocked`
- `agent.plan.step.completed`
- `agent.activity.appended`
- `agent.tool.started`
- `agent.tool.completed`
- `agent.tool.failed`

### Collaboration

- `message.created`
- `message.response_required`
- `decision.recorded`
- `lease.acquired`
- `lease.renewed`
- `lease.expired`
- `lease.revoked`
- `handoff.requested`
- `handoff.accepted`
- `handoff.rejected`
- `approval.requested`
- `approval.approved`
- `approval.rejected`
- `approval.expired`
- `artifact.published`
- `artifact.reviewed`

---

# 5. Webhook 投递

## 5.1 请求

```http
POST /workmesh/events HTTP/1.1
Content-Type: application/json
WorkMesh-Delivery-Id: del_...
WorkMesh-Event-Id: evt_...
WorkMesh-Timestamp: 1784745000
WorkMesh-Signature: v1=<hex-hmac>
```

Body 为单个事件或批次：

```json
{
  "events": [
    {
      "id": "evt_...",
      "type": "agent.session.created",
      "version": 1,
      "payload": {}
    }
  ]
}
```

## 5.2 签名

建议：

```text
signed_payload = timestamp + "." + raw_body
signature = HMAC_SHA256(secret, signed_payload)
```

Receiver：

- 使用原始 Body；
- 常量时间比较；
- 时间戳允许窗口默认 5 分钟；
- Delivery ID 去重；
- Secret 可轮换，过渡期支持两个版本。

## 5.3 响应

Agent Endpoint 应在 5 秒内返回：

- `2xx`：已接收；
- `409`：已处理同一 Delivery，也视为成功；
- `429`：限流，平台重试；
- `5xx`：临时失败，平台重试；
- 其他 `4xx`：配置错误，有限重试后 Dead Letter。

Webhook 响应不应等待 Agent 完成工作，只负责入队。

## 5.4 重试

建议：

- 第 1 次立即；
- 30 秒；
- 2 分钟；
- 10 分钟；
- 30 分钟；
- 2 小时；
- 进入 Dead Letter。

每次加随机抖动。Admin 可手动重放。

---

# 6. Session 生命周期协议

## 6.1 创建

平台创建 Session 后发送：

```json
{
  "type": "agent.session.created",
  "sessionId": "ses_123",
  "payload": {
    "sessionToken": "<one-time-exchange-token>",
    "delegation": {
      "role": "executor",
      "principalHumanActorId": "act_human",
      "capabilities": ["work:read", "plan:write", "repo:write_branch"]
    },
    "workItem": {
      "id": "wi_123",
      "identifier": "ENG-42",
      "title": "Fix session stop race",
      "revision": 8
    },
    "contextSnapshotId": "ctx_123",
    "initialPrompt": "Investigate and propose a safe fix.",
    "budget": {
      "maxRuntimeSeconds": 3600,
      "maxChildSessions": 2
    }
  }
}
```

生产实现不应长期把 Bearer Token 放在持久化 Webhook 事件中。推荐发送一次性交换码，Agent 再通过安全端点换取短期 Session Token。

## 6.2 ACK

Agent 应在 10 秒内：

```http
POST /api/v1/agent-sessions/{id}/ack
Idempotency-Key: ses_123:ack:v1
```

```json
{
  "summary": "已接收任务，正在读取上下文并准备计划。",
  "externalUrls": [
    {
      "label": "Runner trace",
      "url": "https://runner.example/sessions/123"
    }
  ]
}
```

ACK 只表示接收，不表示完成计划。

## 6.3 Heartbeat

活跃状态每 30 秒左右：

```json
{
  "currentStepId": "step_...",
  "usage": {
    "runtimeSeconds": 120,
    "inputTokens": 12000,
    "outputTokens": 2300,
    "toolCalls": 6
  }
}
```

平台：

- 更新 `lastHeartbeatAt`；
- 不把每个 Heartbeat 都显示为普通 Activity；
- 超过 stale 阈值产生 `agent.session.stale`；
- stale 不自动终止外部进程，但撤销或暂停权限可由策略决定。

## 6.4 Prompt

人或 Agent 给 Session 追加消息后发送：

```json
{
  "type": "agent.session.prompted",
  "sessionId": "ses_123",
  "payload": {
    "messageId": "msg_...",
    "sender": {
      "id": "act_human",
      "kind": "human"
    },
    "bodyMarkdown": "先不要改数据库 schema，尝试兼容修复。",
    "planRevision": 4,
    "workItemRevision": 8
  }
}
```

Agent 应：

- 将 Prompt 视为新输入；
- 重新检查 Plan/Work Item revision；
- 必要时发布新 Plan Version；
- 不覆盖历史。

## 6.5 完成

```json
{
  "summary": "已修复停止与 Activity 写入之间的竞态，并增加并发测试。",
  "artifactIds": ["art_commit", "art_pr", "art_test"],
  "checks": [
    {
      "name": "unit",
      "command": "pnpm test session-stop",
      "status": "passed",
      "summary": "18 tests passed"
    }
  ],
  "limitations": [
    "尚未在多节点部署下做压力测试"
  ]
}
```

平台校验：

- 必需 Step 已完成或取消有理由；
- 必需 Artifact/Check 存在；
- Session 未处于不可完成状态；
- 子 Session 满足父任务规则；
- Token 有效。

---

# 7. Session 状态转换

允许转换：

| 当前 | 可到达 |
|---|---|
| queued | acknowledged, stale, stopping, canceled |
| acknowledged | planning, executing, stopping, failed |
| planning | executing, awaiting_approval, awaiting_input, blocked, paused, stopping, failed |
| executing | awaiting_input, awaiting_approval, blocked, paused, stopping, completed, failed |
| awaiting_input | executing, paused, stopping, failed |
| awaiting_approval | executing, canceled, paused, stopping, failed |
| blocked | executing, paused, stopping, failed |
| paused | executing, stopping, canceled |
| stopping | canceled |
| stale | acknowledged, canceled, stopping |
| completed | 终态 |
| failed | 终态；Retry 创建新 Session 或显式 transition policy |
| canceled | 终态 |

每次转换需要：

- Actor；
- reason；
- expected current state；
- revision；
- event；
- optional Activity。

非法转换返回：

```json
{
  "error": {
    "code": "INVALID_SESSION_TRANSITION",
    "message": "Cannot complete a paused session",
    "details": {
      "currentState": "paused",
      "requestedState": "completed"
    },
    "correlationId": "cor_..."
  }
}
```

---

# 8. Plan 协议

## 8.1 发布

```http
PUT /api/v1/agent-sessions/ses_123/plan
If-Match: "revision-3"
Idempotency-Key: ses_123:plan:4
```

```json
{
  "changeSummary": "加入并发回归测试，并把 PR 创建拆为独立步骤。",
  "steps": [
    {
      "id": "9bd5700e-7b3b-4a4e-9fe5-64568b134c5b",
      "title": "复现竞态",
      "status": "completed",
      "ordinal": 0,
      "dependsOn": [],
      "acceptanceCriteria": ["测试在修复前稳定失败"],
      "expectedArtifacts": ["test_report"]
    },
    {
      "id": "30172c28-c5fe-488a-8261-f6940f1d1463",
      "title": "实现服务端停止闸门",
      "status": "in_progress",
      "ordinal": 1,
      "ownerActorId": "agent_backend",
      "dependsOn": [
        "9bd5700e-7b3b-4a4e-9fe5-64568b134c5b"
      ],
      "acceptanceCriteria": [
        "Stop 后所有普通写 API 返回拒绝",
        "允许一次 stopped 清理确认"
      ],
      "expectedArtifacts": ["commit"]
    }
  ]
}
```

## 8.2 稳定 Step ID

- Step ID 在 Plan Version 间保持；
- 文案变化不生成新 ID；
- 真正拆分为不同工作时生成新 ID；
- 删除未开始 Step 可以省略，但系统仍从旧版本保留历史；
- 删除已开始/已完成 Step 应在新版本中标记 canceled/completed。

## 8.3 并发

旧 ETag 返回 409：

```json
{
  "error": {
    "code": "PLAN_REVISION_CONFLICT",
    "message": "Plan has changed",
    "details": {
      "expectedRevision": 3,
      "currentRevision": 4,
      "currentPlanUrl": "/api/v1/agent-sessions/ses_123/plan"
    },
    "correlationId": "cor_..."
  }
}
```

Agent 必须重新读取、合并并发布，不能盲重试覆盖。

## 8.4 Plan 内容边界

可记录：

- 计划步骤；
- 外部可验证目标；
- 风险；
- 依赖；
- 简洁理由；
- 验收条件。

不应记录：

- 模型逐 Token 思考；
- 私有系统 Prompt；
- Secret；
- 不必要个人数据；
- 大量无法验证的自言自语。

---

# 9. Activity 协议

## 9.1 通用结构

```json
{
  "kind": "action_completed",
  "summary": "已运行并发回归测试：18 项通过",
  "detailsMarkdown": "命令：`pnpm test session-stop`",
  "toolInvocation": {
    "toolName": "shell",
    "inputSanitized": {
      "command": "pnpm test session-stop"
    },
    "status": "succeeded",
    "resultSummary": "18 tests passed"
  },
  "artifactIds": ["art_test_report"],
  "references": [
    {
      "type": "plan_step",
      "id": "30172c28-c5fe-488a-8261-f6940f1d1463"
    }
  ],
  "visibility": "team",
  "ephemeral": false
}
```

## 9.2 建议粒度

应发送：

- ACK；
- 计划发布/重大调整；
- 关键工具动作开始和结束；
- 发现的重要证据；
- 需要输入/审批；
- Blocker；
- Artifact；
- 最终结果和错误。

不应发送：

- 每次 Token 生成；
- 每次读取小文件；
- 高频 Heartbeat；
- 重复“仍在工作”；
- 原始超长日志。

## 9.3 Tool Invocation

输入必须先脱敏：

```json
{
  "toolName": "database.query",
  "inputSanitized": {
    "query": "SELECT ...",
    "connection": "[REDACTED]"
  },
  "status": "succeeded",
  "resultSummary": "Returned 14 rows"
}
```

大结果存 Artifact，只在 Activity 放摘要和链接。

---

# 10. Typed Message

## 10.1 请求

```json
{
  "channelId": "channel_eng_42",
  "intent": "ask",
  "bodyMarkdown": "API schema 将 `status` 改为枚举了吗？我需要确认前端兼容策略。",
  "recipientActorIds": ["agent_backend"],
  "references": [
    {
      "type": "plan_step",
      "id": "step_ui"
    },
    {
      "type": "artifact",
      "id": "art_schema"
    }
  ],
  "requiresResponse": true,
  "dueAt": "2026-07-22T20:00:00Z"
}
```

## 10.2 响应

```json
{
  "channelId": "channel_eng_42",
  "intent": "answer",
  "bodyMarkdown": "没有删除旧字符串字段；新增枚举字段并保持一版兼容。",
  "recipientActorIds": ["agent_frontend"],
  "replyToMessageId": "msg_question",
  "structuredPayload": {
    "compatibilityWindow": "one_release"
  }
}
```

## 10.3 公开性

- Work Room 消息对有资源权限的人可见；
- Agent 不得用外部不可审计渠道作为唯一工作沟通；
- 外部渠道沟通若影响计划，应回写 Decision/Message；
- Secret 不能放消息正文。

## 10.4 Connection-anchored identity（v1.1）

Coordinator 发出的所有事实（事件、Work Room 消息、Activity、Artifact、Lease、Handoff）都额外带两个**强约束字段**：

- `connectionId`：发起的 Connection。
- `principalHumanActorId`：该 Connection 的责任人 Human。

- `actor.kind` 仍是 `agent`，`actor.id` 仍是 Agent actor；`actor` 不可被 Agent 改写。
- `on_behalf_of_human_actor_id` 字段记录 principal Human。UI 列表、Work Room、SSE 投影、Inbox 全部按"Agent 操作 on behalf of Human"展示。
- Stop / Revoke 永远以 Connection 为单位触发；Coordination Session 不暴露独立的 Stop 入口。
- Agent 不得假装 principal Human，server 在写入前校验；事件 envelope 与 MCP 工具调用均拒绝覆盖这两个字段。

---

# 11. Lease 协议

## 11.1 Claim

```json
{
  "resourceType": "plan_step",
  "resourceId": "30172c28-c5fe-488a-8261-f6940f1d1463",
  "sessionId": "ses_backend",
  "mode": "exclusive",
  "ttlSeconds": 120,
  "metadata": {
    "repository": "acme/workmesh",
    "paths": ["apps/api/src/session/**"]
  }
}
```

## 11.2 冲突

```json
{
  "error": {
    "code": "LEASE_CONFLICT",
    "message": "Resource is already leased",
    "details": {
      "leaseId": "lease_123",
      "holderSessionId": "ses_other",
      "holderActorId": "agent_other",
      "expiresAt": "2026-07-22T18:40:00Z"
    },
    "correlationId": "cor_..."
  }
}
```

## 11.3 Renew

- 使用 Lease revision；
- 最大 TTL 受策略限制；
- Session 非活跃状态不能续租；
- Stop/Cancel 自动失效；
- Worker 定期标记过期并发事件。

## 11.4 Repository Path Lease

后期可把 `resourceId` 规范化为：

```text
repo:<provider>:<owner>/<repo>@<base-sha>:path:<glob>
```

首版只做 Work Item 和 Plan Step Lease，避免过早实现复杂路径重叠算法。

---

# 12. Handoff 协议

## 12.1 创建

```json
{
  "sourceSessionId": "ses_research",
  "targetAgentActorId": "agent_backend",
  "scopeType": "plan_step",
  "scopeId": "step_implement",
  "summary": "根因是 Stop 与 Activity append 缺少服务端统一闸门。",
  "completedWork": [
    "复现竞态",
    "确认数据库事务本身无丢失",
    "定位到授权检查仅发生在客户端"
  ],
  "remainingWork": [
    "增加 session write gate",
    "补并发测试",
    "创建 PR"
  ],
  "contextSnapshotId": "ctx_handoff_4",
  "artifactIds": ["art_repro", "art_trace"],
  "openQuestions": [
    "是否允许停止后的单次 cleanup activity"
  ],
  "risks": [
    "旧 Agent SDK 可能不识别新错误码"
  ],
  "acceptanceCriteria": [
    "Stop 后普通写入被服务端拒绝",
    "旧 SDK 获得可诊断错误"
  ],
  "requestedAction": "实现修复并提交 PR",
  "leaseTransferPolicy": "transfer"
}
```

## 12.2 接受事务

服务端在单一事务中：

- 锁定 Handoff；
- 校验状态 requested；
- 校验目标 Agent；
- 校验 principal human；
- 计算 Capability 交集；
- 创建 Delegation；
- 创建 Session；
- 处理 Lease；
- 写 Domain Event + Outbox；
- 标记 accepted。

外部 Webhook 在事务提交后发送。

## 12.3 拒绝

拒绝需 reason：

- capability_missing；
- budget_insufficient；
- concurrency_limit；
- context_incomplete；
- conflict；
- manual_reject。

Coordinator 或 Human 可选择其他 Agent。

---

# 13. Approval 协议

## 13.1 请求

```json
{
  "sessionId": "ses_backend",
  "approvalType": "merge_pr",
  "actionName": "github.pull_request.merge",
  "actionPayloadSanitized": {
    "repository": "acme/workmesh",
    "pullRequest": 128,
    "method": "squash",
    "headSha": "abc123"
  },
  "actionPayloadHash": "sha256:...",
  "riskLevel": "high",
  "rationaleSummary": "测试与 Reviewer 检查通过，需要合并以完成 ENG-42。",
  "requiredApprovals": 1,
  "expiresAt": "2026-07-22T22:00:00Z"
}
```

## 13.2 消费

批准后执行前必须再次校验：

- status approved；
- 未过期；
- payload hash 完全一致；
- Actor/Session/Repository Scope 仍有效；
- 审批次数满足；
- 未被 consumed。

执行成功后标记 consumed。失败可以按策略保留 approved 供同参数重试，或要求重新审批；此行为必须明确。

---

# 14. Artifact 协议

## 14.1 元数据 Artifact

```json
{
  "sessionId": "ses_backend",
  "workItemId": "wi_eng_42",
  "type": "pull_request",
  "title": "Fix server-side session stop gate",
  "uri": "https://github.example/acme/workmesh/pull/128",
  "checksum": "sha256:...",
  "repository": {
    "provider": "github",
    "fullName": "acme/workmesh",
    "baseRef": "main",
    "headRef": "eng-42/fix-session-stop-race",
    "headSha": "abc123"
  },
  "sourceTool": "github",
  "metadata": {
    "number": 128,
    "draft": true
  }
}
```

## 14.2 上传 Artifact

大文件流程：

1. 请求 Upload Intent；
2. 平台返回短期签名上传 URL；
3. Agent 上传到 S3/MinIO；
4. Agent 发布 Artifact metadata；
5. Worker 校验 checksum、大小和 MIME；
6. Artifact 可见。

## 14.3 Provenance

Artifact 必须可追溯到：

- producer Actor；
- Session；
- Tool；
- Repository/ref/sha；
- created_at；
- checksum。

---

# 15. Stop / Pause 的服务端闸门

所有 Agent Mutation 进入 Domain Command Handler 时执行：

```text
authenticate token
load session FOR SHARE
assert token session == target session
assert session state allows command
assert delegation active
assert actor capability
assert resource scope
assert approval if required
assert lease if required
assert revision
assert idempotency
execute transaction
```

当 Session 为 `stopping`、`canceled`、`completed`、`failed`：

- 拒绝 Plan、Message、Artifact、Work Item 修改；
- `stopping` 可允许一次 `stop_ack` 或清理摘要；
- Heartbeat 可接受但不恢复权限；
- Resume 必须由有权限人发出并走状态机。

---

# 16. MCP 映射

## 16.1 设计原则

MCP 用于让现有 Coding Agent 以标准方式读取 WorkMesh Context 和调用工具。WorkMesh 领域模型不应被 MCP transport 细节绑定。

建议提供两个端点：

- Read/Write；
- Read-only。

Authorization 使用标准 HTTP 授权，Session-scoped token 优先。

## 16.2 Resources

### Work Item

URI：

```text
workmesh://work-item/{id}
```

返回：

- 当前字段；
- relation；
- acceptance criteria；
- project/milestone；
- active session 摘要；
- revision；
- links。

### Session Context

```text
workmesh://session/{id}/context
```

返回 Context Manifest，而非把所有内容拼成无边界长文本。

### Plan

```text
workmesh://session/{id}/plan
```

带 revision、Step、依赖、owner 和验收条件。

### Guidance

```text
workmesh://workspace/{id}/guidance
workmesh://team/{id}/guidance
workmesh://project/{id}/guidance
```

## 16.3 Tools

每个 Tool：

- 有 JSON Schema；
- 返回结构化 data；
- mutation 接受 idempotency key；
- 冲突返回 machine-readable code；
- Tool description 明确权限和副作用；
- High-risk tool 不应只靠自然语言提醒。

示例 `append_activity`：

```json
{
  "name": "append_activity",
  "description": "Append an immutable operational activity to the current session.",
  "inputSchema": {
    "type": "object",
    "required": ["sessionId", "kind", "summary", "idempotencyKey"],
    "properties": {
      "sessionId": {"type": "string"},
      "kind": {"type": "string"},
      "summary": {"type": "string"},
      "detailsMarkdown": {"type": "string"},
      "idempotencyKey": {"type": "string"}
    }
  }
}
```

## 16.4 MCP Prompt Templates

可提供：

- `implement_work_item`
- `investigate_bug`
- `review_pull_request`
- `triage_issue`
- `draft_project_update`
- `handoff_work`

Prompt Template 只是建议，不应含 Secret 或不可见平台策略。

---

# 17. A2A Adapter

## 17.1 映射

| A2A | WorkMesh |
|---|---|
| Agent Card | Agent Manifest |
| Task | Agent Session |
| Task status | Session State |
| Message | Typed Message / Prompt |
| Artifact | Artifact |
| Streaming update | Domain Event / SSE |
| Context | Context Snapshot reference |

## 17.2 互操作原则

- Remote Agent 可以保持内部实现不透明；
- WorkMesh 仍要求操作状态、结果和 Artifact；
- Adapter 负责状态名称转换；
- 未知字段保存在 namespaced metadata；
- A2A 版本升级不改变内部 Domain Event；
- 外部 Agent Card 的能力必须映射到平台 Capability 并由 Admin 批准。

## 17.3 Stage 4 适配边界

- 首个适配包固定处理 A2A `0.3`；Binding 持久化精确协议版本，后续版本通过新的映射层接入；
- Adapter 在任何 Task 映射、Session 创建或 Context 构造前调用授权回调；
- API 必须实时证明 Binding、Agent、发起人 Team Membership、Agent Team Access、Capability 与 Work Item Resource Scope；
- 授权成功后，Task 才映射为真实 `Agent Session`，不会创建虚构 Work Item；
- Task Envelope、State、Message、Part、File URI 与 Artifact 必须经过严格、限长的 typed validation；Task ID 在 Envelope 与 Event 路径中统一上限为 500 字符；错误返回稳定 `A2A_*` code；
- `deliveryId` 在 Binding 内幂等，并绑定 Binding/协议版本、Team、Work Item、Capability 集合、inbound `sequence` 与 typed Task payload 的完整授权包络；重放必须先根据持久化 Binding、Session、Delegation 与 Task Binding 重新核对，冲突稳定返回 `A2A_DELIVERY_CONFLICT` 且不得泄露跨 Team Session；
- 后续 delivery 在同一事务内锁定并更新既有 Session，状态变化受 WorkMesh Session transition table 约束，重复历史 Message/Artifact 不得重复追加；
- inbound sequence 与 outbound Domain Event cursor 是独立单调域；相同数值不得冲突。Cursor 以十进制字符串传输，避免 JavaScript number 精度损失；
- Message/Prompt、Artifact 与 Task/Session 对应关系写入标准持久表；Streaming 按原始 durable Domain Event 页推进 cursor，即使当前页没有可映射事件；授权撤销后不得继续读取；
- Message、Artifact、Task Status 与 Streaming Update 仅映射为稳定的 WorkMesh Command/Event，不把 A2A Envelope 写入内部领域模型；
- 未知协议版本、状态或能力返回 typed unsupported error，不做静默降级；
- Fake A2A Agent 是确定性验收实现，覆盖 Card、Task、Status、Message、Artifact 与 Streaming 映射。

---

# 18. TypeScript Agent SDK 草案

```ts
import { WorkMeshAgentClient } from '@workmesh/agent-sdk'

const client = new WorkMeshAgentClient({
  baseUrl: process.env.WORKMESH_URL!,
  sessionToken: process.env.WORKMESH_SESSION_TOKEN!,
})

await client.sessions.ack(sessionId, {
  idempotencyKey: `${sessionId}:ack`,
  summary: '已接收，正在准备计划。',
})

const context = await client.sessions.getContext(sessionId)

const plan = await client.plans.publish(sessionId, {
  ifMatch: context.planEtag,
  idempotencyKey: `${sessionId}:plan:1`,
  changeSummary: '初始计划',
  steps: [
    {
      id: crypto.randomUUID(),
      title: '复现问题',
      status: 'in_progress',
      ordinal: 0,
      dependsOn: [],
      acceptanceCriteria: ['获得稳定失败用例'],
      expectedArtifacts: ['test_report'],
    },
  ],
})

const lease = await client.leases.claim({
  idempotencyKey: `${sessionId}:claim:${plan.steps[0].id}`,
  sessionId,
  resourceType: 'plan_step',
  resourceId: plan.steps[0].id,
  mode: 'exclusive',
  ttlSeconds: 120,
})

await client.activities.append(sessionId, {
  idempotencyKey: `${sessionId}:activity:repro-start`,
  kind: 'action_started',
  summary: '开始构造并发复现测试',
})

try {
  // Run work in an external sandbox.
} finally {
  await client.leases.release(lease.id, {
    idempotencyKey: `${sessionId}:release:${lease.id}`,
  })
}
```

SDK 要求：

- 自动重试只用于网络错误、429、可重试 5xx；
- 不自动重试 409；
- 生成 Idempotency-Key helper；
- 暴露 Error Code；
- 支持 AbortSignal；
- 自动刷新 Session Token 但不绕过 Stop；
- 日志默认脱敏。

---

# 19. 协议一致性测试

平台发布一个 Agent Conformance Suite。

## 19.1 必测

- Manifest 注册；
- Webhook HMAC；
- Delivery 重放；
- ACK；
- Heartbeat；
- Activity；
- Plan ETag 冲突；
- Prompt；
- Awaiting Input；
- Approval；
- Stop；
- Stop 后拒写；
- Lease 冲突；
- Handoff；
- Artifact；
- Completion；
- Token 过期；
- Capability denial；
- Connection 配对（单用 / 过期 / 限流 / 同一 Idempotency-Key 重放拿回原响应）；
- Connection 撤销后 Coordination Session 立即失败关闭；
- Team scope delegation 跨 Team 拒绝；
- `agent:delegate` 缺失时拒绝 `start_agent_session` / `delegate_work_item`；**不**作用于 `create_child_session`；
- Coordinator 阻断破坏性操作（删除 / 归档 / 批量 / 健康发布）；
- Coordination MCP 多 Connection 并发隔离；
- Work Item 创建时 `responsible_human_actor_id` 默认填充 principal Human；
- `If-Match` 缺失或 revision 失配时 PATCH / DELETE 拒绝。

## 19.2 Fake Agent

仓库内提供 `apps/fake-agent`：

- 可配置 ACK 延迟；
- 可模拟 stale；
- 可发布计划；
- 可请求输入/审批；
- 可模拟错误；
- 可违反协议，验证服务端闸门；
- 用于 Playwright 和集成测试。

---

# 20. 协议版本

- REST 路径版本 `/api/v1`；
- Event 有独立 `version`；
- Agent Manifest 声明协议版本；
- MCP 遵循协商版本；
- Breaking Change 先并行支持；
- 事件消费者必须忽略未知字段；
- 删除字段需要至少一个兼容周期；
- Capability 名称稳定，不复用旧语义。

---

# 21. 最低接入标准

一个 Agent 被认为“WorkMesh Compatible”，至少必须：

- 有明确 Agent 身份；
- 接收 Session Created；
- 10 秒内 ACK 或给出可配置确认；
- 使用 Session Token；
- 发布至少一种 Activity；
- 发布或明确声明不需要多步 Plan；
- 支持 Prompt；
- 支持 Stop；
- 完成或失败时提供结构化结果；
- 所有写操作幂等；
- 不伪造 Actor；
- 不要求平台存储隐藏思维链；
- 通过 Conformance Suite。

---

# 22. Coordination MCP（v1.1）

Coordination MCP 是常驻 Streamable HTTP MCP 服务，按 Connection 鉴权，按请求派生 Coordination Session。它是 v1.0 既有 session-scoped MCP（`apps/mcp/src/http.ts`、`stdio.ts`）的**并列入口**，不替换它们；v1.0 的 Native HTTP、Webhook、A2A 适配器也都不动。

## 22.1 鉴权与生命周期

- 客户端用原始 Installation Token（不是 `Bearer` 头）调用 `POST {mcpUrl}`；
- 服务端解析 → 校验 Connection、Agent、Team grant、Delegation、能力、撤销状态；
- 通过则开/续一条 1 小时（最长 2 小时）的 Coordination Session；
- Connection 撤销后下一次请求立即失败关闭（`COORDINATION_SESSION_CONNECTION_REVOKED`）。

## 22.2 基础工具（永远允许）

只要 Coordination Session 对应的 Connection 是 `active` 且未撤销，基础工具可调用：

- `verify_connection` — 回传 Connection 身份与当前 pinned Skill 版本。
- `get_current_identity` — 返回 Agent actor、Connection、principal Human、Team、授予的能力集。
- `list_teams`、`list_workflow_states` — Team 与状态只读发现。
- `list_projects`、`get_project`、`create_project`、`update_project` — 限定在绑定 Team；`update_project` 仅允许安全字段。
- `list_work_items`、`get_work_item`、`create_work_item`、`update_work_item` — 限定在绑定 Team；`update_work_item` 仅允许安全字段；Agent 未传 `responsible_human_actor_id` 时由服务端填充 principal Human。
- `list_work_room_messages`、`post_work_room_message`、`list_inbox_items`、`claim_inbox_item`、`reply_inbox_item`。
- `draft_project_update`（发布仍为 Human-only transition）。

## 22.3 显式授权工具（需要匹配能力）

- `delegate_work_item` — 需要 `agent:delegate` 和现有 child session 创建的所有前置条件。
- `start_agent_session` — 需要 `agent:delegate`；派生的是真 executor Session，仍受 `agent:execute`、父→子预算、并发、Team access 约束。
- `create_child_session` — 需要 `agent:execute` 与 Team access；**不**需要 `agent:delegate`。父 Coordinator 是否携带 `agent:delegate` 与能否 `create_child_session` 无关；后者是 plan-step 子 Session，与跨 Work Item 启动其他 Agent 是两件不同的事。
- `offer_handoff` — 需要 Team 写权限。
- `request_approval` — 记录与 Work Item 或 Plan Step 绑定的结构化审批请求；审批由 Human actor 决定。

## 22.4 MCP 层便利（不是授权）

- 工具调用若未传 `Idempotency-Key`，MCP 层用 `sha256(connection_id, tool_name, payload)` 派生稳定 key；显式传入则尊重显式值。
- MCP 层把活跃 Coordination Session 注入每个工具调用，Agent 无需传 `sessionId`。
- Name → UUID 解析：Team slug、project slug、Work Item identifier 在 Session 生命周期内解析一次并缓存；下游 domain 永远只收到 UUID。
- 安全字段 `update_*`：MCP 层在请求事务内做一次 read/merge/write，让 Agent 不必先 GET revision 就能改 `description` 这种不冲突字段；返回最新 revision，Agent 想串联时仍可用 `If-Match`。

## 22.5 与 v1.0 MCP 的边界

- v1.0 session-scoped MCP：每个请求带 `sessionId` Bearer；只覆盖已建立 Session 的子集能力。
- v1.1 Coordination MCP：每请求动态派生 Session；范围绑定 Team 与 Connection；涵盖基础 CRUD + 显式授权工具。
- 两者都**不**是授权层：revision、授权、状态、事务全部由 domain 裁决；MCP 工具描述描述策略，server 强制执行。

## 22.6 协议可观测性

- `agent.connection.created` / `pairing_redeemed` / `rotated` / `revoked`。
- `agent.coordination_session.opened` / `refreshed` / `closed`。
- 错误码（加入 `apiErrorCodeSchema`）：
  - `AGENT_CONNECTION_PAIRING_INVALID | PAIRING_EXPIRED | PAIRING_CONSUMED | PAIRING_LOCKED`
  - `AGENT_CONNECTION_REVOKED | AGENT_CONNECTION_PRIVILEGE_ESCALATION`
  - `AGENT_CONNECTION_NOT_FOUND | AGENT_CONNECTION_CLIENT_TYPE_MISMATCH | AGENT_CONNECTION_TEAM_MISMATCH | AGENT_CONNECTION_INSTALLATION_MISMATCH`
  - `COORDINATION_SESSION_CONNECTION_REVOKED | COORDINATION_SESSION_REFRESH_FAILED | COORDINATION_SESSION_TEAM_SCOPE_DENIED`
  - `AGENT_DELEGATE_NOT_GRANTED | COORDINATOR_DESTRUCTIVE_OPERATION_FORBIDDEN | COORDINATOR_AGENT_DELEGATE_NOT_TRANSITIVE | COORDINATOR_PRINCIPAL_HUMAN_INVALID`
  - `AGENT_SKILL_VERSION_MISMATCH | AGENT_SKILL_SIGNATURE_INVALID`
