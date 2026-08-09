# WorkMesh Agent-first Coordination MCP 实施计划

> 修订记录
> - 2026-08-07 v0.4 — Plan §"一次性配对" 加回 `/rotate-confirm`。v0.3 用 worker 到期替代"确认成功后撤销"被 v3 审查指出不是对原话的忠实澄清。原计划"确认成功后撤销旧凭据"是显式确认步骤，不能用自动过期替代。v0.4：Rotate 颁发新配对码；新旧凭据重叠 15 分钟（`overlap_until` 是真实截止时间）；Admin 在重叠期内任何时间调用 `/rotate-confirm` 仅撤销旧 fingerprint（**Connection 不删、Session 不废、新凭据不撤销**）；如果 Admin 不主动 confirm，worker 在 `overlap_until` 把旧 fingerprint 停用（**仅旧 fingerprint**，新凭据不受影响）。DELETE 仍然是撤销整个 Connection + 全部活跃 Session 的硬路径。`/rotate-confirm` 在 v0.2/v0.3 的讨论里被列为"未批准"，是当时对原计划"确认"二字的解读偏窄；v0.4 把它显式放回计划，作为 v0.2/v0.3 的"撤销旧凭据"操作的真实实现。
> - 2026-08-07 v0.3 — 撤回 v0.2 的"新 redeem 立即撤销旧凭据"语义；恢复 v0.1 的 15 分钟重叠语义：旧凭据在 `overlap_until` 之前一直可用，Admin 通过 DELETE 显式撤销、或者在 15 分钟到期后服务端自动停用。**v0.3 后被 v0.4 取代**：v0.3 把"确认成功后"读作"新 redeem 成功"不够准确；原话是显式确认步骤。
> - 2026-08-07 v0.2 — 把 §"一次性配对" 中的 `/rotate` 一行展开："确认成功后撤销旧凭据" 显式化为"新 redeem 在同事务里把旧凭据标记 `rotated`、新凭据变 `active`"，不另设 `/rotate-confirm` 端点。**v0.2 后被 v0.3 取代**：会让 15 分钟重叠失效。

## 计划批准（Plan Approval）

> **权威版本**：v0.4（本文件最新修订记录第一行）。
> **生效日期**：2026-08-07。
> **批准范围**：
> 1. **公共接口扩展 `/rotate-confirm`** — 原 `D:\下载\PLAN (1).md` v0.1 的 §"一次性配对"只列了 `/rotate`；v0.4 把"确认成功后撤销旧凭据"读作显式 Admin 操作，引入 `/rotate-confirm` 端点（`POST /api/v1/agent-connections/{id}/rotate-confirm`，`If-Match` + `Idempotency-Key`，200/404/409/412/422）。这是 plan v0.4 §"一次性配对" 第 4 条的明确扩展，不是 OpenAPI 的临时变动。
> 2. **Worker 兜底撤销** — `overlap_until` 到期后 worker 自动停用旧 fingerprint 是 plan v0.4 批准的兜底防线（与显式 confirm 走相同结果）。原计划"确认成功后撤销旧凭据"中的"确认"被 v0.4 明确扩展为"显式 Admin 调用或 worker 到期兜底"两种路径。这与"必须由 Admin 显式确认才撤销"是 plan v0.4 做出的明确选择，理由是单点失败（Admin 错过 confirm 窗口）不应让一个处于 rotating 状态的 Connection 永久保留两个有效凭据。
> 3. **单 Connection 单 Team / 单 principal Human 绑定** — Connection 锁定 `teamId` 和 `principalHumanActorId`，不允许通过 PATCH 改 Team，扩权必须新 Connection + DELETE 旧 Connection。Coordination Session/Identity 与 Connection 的 `connection_id` / `team_id` / `agent_actor_id` / `principal_human_actor_id` 必须完全一致（Identity schema 的 8 条 cross-binding 约束）。
> 4. **能力闭合** — Coordination MCP 不引入并行能力枚举；新能力 `agent:delegate` 走 `capabilitySchema`、新 scope `team` 走 `delegationScopeTypeSchema`、新 session kind `coordination` 走 `agentSessionKindSchema`，错误码合并入 `apiErrorCodeSchema`。
>
> **未变更**：原始计划的 endpoint 清单（`/.well-known/workmesh-agent`、`POST /api/v1/agent-connections`、`POST /api/v1/agent-connections/redeem`、`GET/PATCH/DELETE /api/v1/agent-connections/{id}`）在 v0.4 全部保留；`/rotate` 也在 v0.4 保留；`/rotate-confirm` 是 v0.4 唯一新增的端点。

## 摘要

目标是把 WorkMesh 从"Human 创建任务、Session MCP 执行任务"升级为真正的 Agent-first 协作系统：

- Human 主要负责一次性授权、风险审批、撤销和可视化监督。
- Agent 通过一句配对指令完成 MCP、凭据和 Skill 配置。
- Agent 可长期在获批 Team 内创建、更新和推进 Projects/Issues，并通过 Work Room、Inbox、Handoff 和状态变化协作。
- 精确代码执行仍使用 Delegation、短期 Session、Lease 和证据闭环。
- 保留现有 Session-scoped MCP，新增常驻 Coordination MCP，不让 MCP 成为第二套业务授权系统。

终态验收：Human 在 UI 生成一句接入指令，将其发送给 Codex/OpenCode/pi；Agent 自动完成配对和配置，随后仅通过 MCP 创建 Project、拆分 Issues、启动获准 Agent、协作推进并交付证据。

## 公共接口与安全模型

### 一次性配对

新增：

- `GET /.well-known/workmesh-agent`：公开返回协议版本、MCP URL、支持客户端和 Skill manifest，不包含敏感配置。
- `POST /api/v1/agent-connections`：Workspace Admin 创建预授权信封，固定 Agent 名称、Team、principal Human、能力和客户端类型。
- `POST /api/v1/agent-connections/redeem`：Agent 使用十分钟单用配对码兑换 Installation Token、MCP 配置和固定版本 Skill。**必须带 `Idempotency-Key` 头**；成功响应以 `Idempotency-Key` 为键保存整段配对码生命周期，Agent 因网络丢包重放同一 key 拿回完全相同响应。
- `GET/PATCH/DELETE /api/v1/agent-connections/{id}`：查看、修改非扩权元数据、撤销连接。**PATCH 和 DELETE 必须带 `If-Match`，响应必带 `ETag` 头**。
- `POST /api/v1/agent-connections/{id}/rotate`：生成轮换配对指令；新旧凭据重叠 15 分钟。响应中 `overlap_until` 是真实的截止时间——在此之前旧凭据与新凭据同时可用。Admin 在重叠期内可以调用 `/rotate-confirm` 提前仅撤销旧 fingerprint；如果 Admin 不主动 confirm，worker 在 `overlap_until` 把旧 fingerprint 停用（新凭据不受影响、Connection 不被删、活跃 Session 不废）。`DELETE /api/v1/agent-connections/{id}` 仍然是撤销整个 Connection + 全部活跃 Session 的硬路径。
- `POST /api/v1/agent-connections/{id}/rotate-confirm`：**仅撤销当前 Rotation 引入的旧 fingerprint**，Connection 状态回到 `active`、新凭据保留、活跃 Session 不废。必须带 `If-Match`（Connection 当前 revision）。这是"确认成功后撤销旧凭据"的显式实现；如果 Admin 不调用，15 分钟到期后 worker 走相同结果。

配对码只接受 fragment 携带（路径或 query string 一律拒绝）；URL schema 用正则强制。配对码仅保存 hash，限制尝试次数并使用共享 Redis 限流。

### 常驻协调授权

- Delegation scope 增加 `team`，角色使用现有 `coordinator`。
- 每个连接首期只绑定一个 Team；同一 Agent 可增加多个独立 Team connection，避免跨 Team 混用 Session。
- Installation Token 默认长期有效至撤销，只能建立或刷新协调 Session，不能直接执行普通 mutation。
- Coordination MCP 在后台创建一小时短期协调 Session，并在到期前刷新；API 始终实时检查 Agent、Team grant、Delegation、能力和撤销状态。
- principal Human 默认是创建连接的 Human，也可选择该 Team 的其他有效 Human。
- 新增 `agent:delegate` 能力。默认 Coordinator 不具备；Human 显式授予后，Agent 才能为 Work Item 启动其他 Agent（`start_agent_session`、`delegate_work_item`），且继续受预算、并发、Team access 和负责 Human 约束。`agent:delegate` **不**作用于 `create_child_session`——后者是 plan-step 子 Session，继续使用现有 `work:write`、父 Session/Plan Step scope 与 Team access gate。
- Agent 默认可创建、编辑、评论、改变普通工作状态；Project/Issue 删除、归档、批量 mutation、健康更新发布仍由 Human 执行或批准。
- Agent 创建 Issue 时若未指定 responsible Human，由服务端填充 connection 的 principal Human。

### Coordination MCP

常驻 Streamable HTTP MCP 使用每连接 Installation Token 认证，按请求动态取得协调 Session，不再依赖容器级 `WORKMESH_SESSION_TOKEN`。保留旧的 session-scoped HTTP/stdio 模式作为兼容执行配置。

基础工具：

```text
verify_connection
get_current_identity
list_teams
list_workflow_states
list_projects
get_project
create_project
update_project
list_work_items
get_work_item
create_work_item
update_work_item
list_work_room_messages
post_work_room_message
list_inbox_items
claim_inbox_item
reply_inbox_item
draft_project_update
```

显式授权工具：

```text
delegate_work_item
start_agent_session
create_child_session
offer_handoff
request_approval
```

MCP 层自动生成 Idempotency-Key、注入当前 Session、解析名称到 UUID，并在安全的非冲突字段更新中执行一次 read/merge；真实 revision、授权、状态和事务仍由 REST/domain 层裁决。

## 执行图

```text
A 协议与 ADR
 ├─→ B Team Coordinator 持久化与授权
 │     └─→ C Pairing/Connection API
 ├─→ D SDK 与 MCP 工作管理工具
 └─→ E Skill/客户端接入规范

C ─→ F Human Agent Connections UI
C + D + E ─→ G Codex/OpenCode/pi 接入实现
B + C + D + F + G ─→ H 集成、安全与迁移验证
H ─→ I OpenWrt 预发布、24h 协作 soak 与 v1.1 发布
```

### A. 冻结契约

- 更新 PRD、Agent Protocol、OpenAPI，并新增 Agent Connection/Coordination MCP ADR。
- 固定配对、Team coordinator、凭据轮换、Agent CRUD、破坏性操作和 principal Human 语义。
- 先更新共享 contracts 和 route-policy manifest；后续分支只消费该版本，避免重复定义权限。
- Request DTO 沿用项目 camelCase 约定（`teamId` / `agentSlug`），Response DTO 用 snake_case（`team_id` / `agent_slug`）；well-known 公开 manifest 因客户端在 session 之前读，保留 camelCase（`protocolVersion` / `mcpUrl`）。

### B–C. 后端授权与接入生命周期

- 添加不可变迁移：Team delegation scope、connection/pairing ledger、credential fingerprint、兑换/撤销/轮换状态和审计事件。
- 所有连接、Team grant、Delegation、凭据和 outbox 变化保持同一 PostgreSQL 事务。
- 实现一次性兑换、短期协调 Session 创建/刷新、实时撤权、轮换重叠和 Idempotency-Key 重放。
- 修正 Project/Work Item mutation policy：协调 Agent 可执行常规 CRUD 子集，破坏性操作保持 Human gate。
- 更新 SDK 的类型化 Project、Work Item、Connection 和 coordination-session 方法。

### D–G. MCP、Skill 与 Human UI

- MCP 改为请求级身份和客户端实例，支持多个 Agent 并发连接；现有精确 Session 模式继续可用。
- `/agents` 升级为 Agent Connections 向导：客户端、名称、Team、principal Human、权限预设、可选 `agent:delegate`、生成接入句子。
- UI 展示连接状态、最近使用、MCP/Skill 版本、Team scope、credential fingerprint、诊断、撤销和轮换；任何长期 secret 只在 Agent 兑换时出现。
- 官方 `workmesh` Skill 固化 Project/Issue 建模、Responsible Human、状态与 Session 分离、Inbox/Work Room、Lease、Handoff、审批、冲突恢复和证据完成规则。
- Skill 包提供版本、SHA-256 和签名；安装固定版本，不静默自动升级。
- 为 Codex、OpenCode、pi 提供客户端适配器：将 Token 写入各自 secret/env 存储，写入 MCP 配置，安装或引用 Skill，然后调用 `verify_connection`。
- UI 生成的句子统一为："连接此 WorkMesh：打开 `<connect-url>#<pairing-code>`，按返回指令安装 MCP 与 WorkMesh Skill，并调用 `verify_connection`。"

### H–I. 集成与发布

- 由唯一集成 owner 合并 contracts、API、MCP、Web 和 Skill；共享 OpenAPI/route policy 不并行写入。
- 开发阶段使用 `WORKMESH_BETA_COORDINATION_MCP` 隔离；最终 RC 将其提升为 Stable 且默认启用。
- 生产 Compose 默认启动 Coordination MCP，并通过现有 Tailscale HTTPS 暴露 `/mcp` 和发现端点；旧 session MCP 保留独立 profile。
- RC 在 OpenWrt 网关执行三客户端、多 Agent 24h soak；通过后以相同镜像 digest 无重建晋升 `v1.1.0`。

## 测试与验收

- 迁移：clean install、从 v1.0 升级、失败回滚、并发 runner 和 checksum。
- 配对：单用、十分钟过期、猜码限流、并发兑换、**成功响应丢失后同 Idempotency-Key 重放拿回原响应**、secret/log 扫描。
- 授权：跨 Team、撤权、Agent 停用、principal Human 失效、能力收缩、凭据轮换、Session 到期刷新。
- CRUD：Agent 创建 Project/Issue、普通更新、responsible Human 默认值、revision 冲突、重复幂等、事务失败恢复。
- 安全：Agent 无法自扩权；无 `agent:delegate` 时不能启动其他 Agent；删除、归档、批量写和健康发布被阻断。
- MCP：动态多连接隔离、旧 session 模式兼容、read-only 模式、工具与 route-policy 一一绑定。
- 客户端：Codex/OpenCode/pi 均从一句话完成配对、配置、Skill 加载和 `verify_connection`。
- 多 Agent E2E：Coordinator 创建 Project 和五个 Issues，两个 Agent 通过 Work Room/Inbox 协作、状态推进、Handoff、审批和证据完成；Human UI 可实时监督并立即 Stop/Revoke。
- 发布门：lint、typecheck、unit、integration、E2E、build、route-policy、tracked-tree clean、镜像安全扫描、24h soak 全绿。

## 默认约束

- Agent-first 表示日常创建、更新、沟通和推进默认无需 Human 逐次批准；Human 控制扩权、破坏性动作、预算、高风险外部操作和撤销。
- Installation/MCP 凭据长期有效至撤销，但短期 Coordination Session 必须持续刷新并实时验证授权。
- 不向 Agent 提供 Human Cookie，不允许 Agent 冒充 Human；所有事实记录 Agent actor、principal Human 和 Session。
- 不以 Skill 绕过服务端策略；Skill 只解释工具和协作规范。
- 不删除或替换现有 Native HTTP、Webhook、A2A 和精确 Session MCP 接入。
- Beta、Experimental 和 Engineering Graph 功能不会因本需求自动开启。
