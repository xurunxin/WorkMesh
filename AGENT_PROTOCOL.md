# WorkMesh Agent Protocol 1.0

> 本文定义 WorkMesh 平台与外部 Agent、Agent Runner、MCP Client 以及后续 A2A Adapter 的交互契约。  
> 日期：2026-07-22

WorkMesh server `1.0.0` implements Agent Protocol `1.0` and MCP server `1.0.0`.
The version-isolated upstream A2A adapter remains pinned to A2A `0.3`; that
upstream version is not the WorkMesh Agent Protocol version. Deployments expose
safe release metadata at public `GET /api/v1/info` and disclose feature support
tiers and enabled state only after authentication at `GET /api/v1/features`.
Beta and Experimental capabilities default disabled and never replace normal
identity, delegation, capability, scope, approval, lease, revision, or
idempotency checks when enabled.

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

`X-Correlation-Id` 是可选的调用方追踪值，最长 200 个字符，只允许 ASCII
字母、数字、点、下划线、冒号、斜杠和连字符；凭证样式的前缀会被拒绝。
授权拒绝审计始终使用服务端生成的 request id，不把调用方值写入不可变账本。

高冲突资源还要：

```http
If-Match: "revision-4"
```

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

集合读取使用 `list_work_items` 和 `list_session_activities`。两者返回完整
`{items,nextCursor}`；调用方必须将 `nextCursor` 原样作为下一次调用的
`cursor`，不得解析或跨 Session、Actor、Route 复用。

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

## 17.3 WorkMesh 1.0 A2A 实验性适配边界

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
- Capability denial。

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

## 集合读取与分页

Agent SDK、MCP 与 Native HTTP 的集合读取统一消费 `{items,nextCursor}`。调用方只能原样回传 `nextCursor`，不得解析、改写或跨 Route、Workspace、Actor、过滤条件复用。页大小默认 50，允许 1 到 200。授权在每一页重新验证；Team Access、Delegation、Capability、Resource Scope 或 Session 撤销后，后续页必须立即缩短或拒绝，Lease 不构成授权。

此不透明游标只用于 REST 资源集合。Domain Event、SSE `Last-Event-ID` 和 A2A Task Event 的十进制 durable cursor 语义保持不变。
