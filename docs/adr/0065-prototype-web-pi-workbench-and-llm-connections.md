# Prototype Web UI, Pi Workbench, and user-configured LLM connections

## Status

Proposed — 2026-09-24. 本 ADR 是实施路线图的设计输入。W01 已完成兼容性 Spike（5/5 通过）、Node 基线升级与传输契约冻结，钉住结果见下文"W01 验证结果与钉住基线"；实现版本以此为准。W07 的连接与模型配置实现正在进行，尚未满足整项路线图的发布门槛。

稳定规划标识：`WM-WEBPI-20260924`。本地执行计划：`docs/plan/2026-09-24-prototype-pi-agent-workbench.md`；GitHub 与 WorkMesh 映射见同目录的 `.index.json`。

## Context

当前仓库已经具备 Next.js/React Web、共享 UI、Markdown 编辑/渲染、版本化 Guidance、受控 Agent Session/Connection、MCP、审批、租约、事务 outbox 和持久事件游标。静态原型提供新的暗浅主题、工作台布局、工具/制品卡、审批后果预览与移动布局，但使用模拟数据。用户要求以该原型替换实装 Web，引入 Pi 后端，提供用户自定义 LLM 接入以及 Agent 操作 Skill/文档。

不能把视觉迁移误作后端重写，也不能把已有 `client_type=pi` 配对支持当作内建 Pi Runner。Project/Issue 的普通内容、可引用文档与受控 Guidance 必须保留不同语义。

研究基线为 WorkMesh `71f45fc8132051600b468876932155a9b72f9469`。Pi 固定研究提交 `a7d17e39aaa0091c7573d0790714751956f10bd1` 中包名为 `@earendil-works/pi-coding-agent`，源码包版本 0.87.1，Node engine ≥22.19.0；仓库 `.node-version` 原为 22.15.0，API 生产镜像原为 22.17.1（W01 已升级并钉住，见下文）。

## Decision

1. **保持业务权威。** WorkMesh PostgreSQL/domain/API 保持身份、委派、权限、预算、Session、Stop、审批、工作项和证据的权威。Pi 仅负责模型循环、工具编排和上下文处理，不直接改数据库，不继承 Human cookie，不自行批准权限或结果。
2. **独立 Runner。** 拟新增 `apps/agent-runner`，在独立受限进程/容器嵌入固定 Pi SDK。API/Web 不执行不可信代码。显式提供模型、存储、ResourceLoader 和工具；禁止自动载入宿主全局配置、任意 extension、`!command` 凭据和无边界默认 shell/filesystem 工具。仓库操作通过受限 executor。
3. **分别建模交互和执行。** Conversation/Turn 与既有 AgentSession 显式关联。发送产生事务内消息、执行意图和 outbox；dispatch 在提交后。Runner attempt 使用单 writer/fencing 和稳定操作身份；Pi 模型上下文状态是可重建执行数据，业务恢复依据 WorkMesh 持久事实。未知外部效果先对账再决定重试。
4. **服务端控制。** Stop 先阻断普通写入，再 abort/收束工具并报告结果；pause/resume/steer/follow-up/retry 具有分别定义的语义。retry 新建关联 attempt/session，不重新打开终态历史。Pi 低层事件结束不是业务完成，完成需结果及证据或无制品解释。
5. **双协议上游。** OpenAI-compatible 指连接用户的 Chat Completions 或 Responses endpoint。协议选择显式；分别处理请求、工具 ID、参数分片、事件与终态，归一到 WorkMesh 事件/错误/用量。不得静默切协议或丢弃工具语义。公开向第三方提供 LLM 网关不在本期。
6. **配置与秘密分离。** LlmConnection/LlmModel 具有 owner/scope、revision、API 类型、baseUrl、能力和限制。secretRef 仅在服务端解析；密钥不入浏览器存储、Prompt、公开事件或日志。内网模型经管理员允许的出站策略接入，禁止任意 URL/重定向变成通用内网访问工具。
7. **保留 frontend layering。** `packages/ui` 只持有 token 和 API-free presentation；`features/*` 持有 queries/commands/DTO 与草稿；`app` 持有路由和组合。保留现有图标与基础控件，映射原型的双主题和状态，避免平行库。新方案显式替代历史仅浅色视觉决定，其他领域约束保留。
8. **Markdown 与普通文档。** 复用 RichTextEditor/RichContent。描述/评论仍是 Markdown 原文；普通 Document/Revision 用于 Project/Issue 的命名文档、不可变历史/diff、版本引用与软归档。Guidance 继续复用现有发布/回滚/权限和 context pin，不把文档文本隐式提升为指令或权限。
9. **可信可见性。** 工作台只展示公开执行摘要、计划、工具、用量和证据，不请求、持久化或展示隐藏思维链。制品编辑生成新版本/patch proposal；Human 验收、执行结束与 Issue 工作流完成分别记录。
10. **技能可验证。** Skill 是操作指南，不是授权机制。版本化发布，固定 hash 到上下文；覆盖身份发现、工作拆解、普通编辑、文档、审批申请、交接、恢复和证据。工具 schema、操作指南与 conformance 同步更新。

## W01 验证结果与钉住基线（2026-09-24）

Spike 工程（仓库外，`G:\Projects\MetronX\wm-pi-spike\`）对 `@earendil-works/pi-coding-agent@0.87.1` 完成 5/5 通过（P1 身份；P2 Chat Completions 多轮工具调用；P3 Responses 具名 SSE 多轮工具调用；P4 无宿主工具泄漏——wire tools 恰为自定义 `get_issue` 且 auth 来自显式提供者；P5 abort→`agent_settled` 收束且上游连接关闭；P6 密封 agent 目录）。运行日志与源码存档于 `.evidence/roadmap-20260924/w01-pi-spike/spike-run-2026-09-24.log`。

**钉住版本：**

- SDK：`@earendil-works/pi-coding-agent` 精确版本 `0.87.1`（license MIT，engines `node >=22.19.0`），不浮动到 upstream main。
- 运行时：`.node-version` = `22.19.0`；`ci.yml` 字面量与 `scripts/validate-ci.mjs` 断言同步为 22.19.0。
- 生产镜像：`infra/docker/{api,worker,web,mcp}.production.Dockerfile` 全部 `FROM node:22.19.0-alpine3.21`（alpine3.22 tag 不存在于该 Node 版本，manifest 探测确认 3.21 可用）。

**Spike 关键发现（影响 Runner 实现）：**

- `ModelRuntime.create()` 默认会在 agent 目录旁写入 `auth.json` 与 `models-store.json`。WorkMesh Runner 模式必须用 `authPath`/`modelsStorePath` 把可写状态重定向到独立 scratch 目录，agent 目录只保留只读 `models.json`（P6 已验证密封）。
- 正确用法：`ModelRuntime.create({ modelsPath, authPath, modelsStorePath, refreshOnCreate })` + `createAgentSession({ model, modelRuntime, sessionManager, noTools: 'builtin', customTools, agentDir })`；customTools 参数 schema 用 TypeBox；`agent_settled` 经 `session.subscribe` 观察；`getLastAssistantText()` 取结果。
- 双协议（`openai-completions` / `openai-responses`）由 models.json 中 provider 的 `api` 字段显式选择，同一自定义工具在两个协议下均正常完成多轮工具调用。

## W07 实施进展与真实模型边界（2026-09-25）

编号迁移 `v1/0009_workbench_llm_connections.sql` 新增 Connection 与 Model 配置表，连接支持 personal/team/workspace 范围，凭据由 API 使用 `WORKMESH_MASTER_KEY` 加密；响应只暴露状态。API 的创建、列表、读取、修订、吊销与模型登记使用现有 Human session、幂等、revision 和事务事件/outbox。模型目录变更也推进连接 revision。设置页新增独立的 Agent 工作台服务接入入口。测试数据库的迁移与权限/加密/幂等/修订集成测试通过。

部署变量 `WORKMESH_LLM_PRIVATE_HOST_ALLOWLIST` 是逗号分隔的精确主机名或 IP。只有 Workspace Admin 且命中该名单时，配置才允许显式私有主机；实际出站请求还须在 W08/W10 的 Runner 边界校验 DNS 解析地址并固定连接目标。当前 API 不向配置目标发送网络请求，故不能把配置保存视为安全的出站探测通过。未配置该变量时，私有主机默认拒绝。

`pnpm test:live:minimax:m3` 使用本地 `MINIMAX_CN_API_KEY` 对中国区 `MiniMax-M3` 实测文本和两类协议的工具调用/工具结果/最终回复，输出仅含状态元数据。Responses 路径以完整历史重建成功；`previous_response_id` 的一次测试返回 HTTP 400，因此 WorkMesh 不把该参数作为恢复依赖。此项只证明真实上游协议调用，不证明 Pi Runner、会话持久化、流式边界、控制权限或生产部署。

`apps/agent-runner` 现将 Pi SDK 固定在 `0.87.1`，其受限探测使用 `noTools: 'builtin'`、唯一只读探测工具、独立 agent/state/work 目录和模型配置中的固定 `$MINIMAX_CN_API_KEY` 环境引用。真实 MiniMax-M3 上，Chat Completions 与 Responses 各完成一次 Pi 工具调用、最终文本与 `agent_settled`。这证明固定 SDK 可驱动两种协议的实际模型循环；该程序仍是探测器，尚无 WorkMesh 会话、授权工具、持久队列、Stop 栅栏或服务镜像，不构成 W08–W10 的完成验收。

**契约冻结（先于实现）：**

- 传输 DTO 与事件：`packages/contracts/src/pi-workbench-contracts.ts` —— Conversation/Turn/RunnerAttempt（单 writer/fencing、队列、幂等、Stop、权限撤销、上下文 pin、恢复协议）、LlmConnection/LlmModel（owner/scope、revision、api 类型、baseUrl、能力/限制、secret 仅服务端解析）、runner 工具调用账本、`workbench.*` 事件（过去时命名）与最小关系模型 `workbenchRelationModel`。新增 13 个显式错误码进入统一 `apiErrorCodeSchema`。DDL 不在本任务（后续编号迁移）。
- `AGENT_PROTOCOL.md` 新增 §25 声明规划边界；`OPENAPI.yaml` 声明本任务无 API 变更，端点由 W06/W07/W09/W10 引入。

**威胁边界（Runner 进程）：**

| 边界项 | 决定 | 证据/机制 |
| --- | --- | --- |
| agent 目录 | 只读 `models.json`，无 auth/session/extension 文件 | P6 密封验证 |
| Pi 可写状态 | 重定向到独立 scratch 目录（`authPath`/`modelsStorePath`） | Spike 源码 + P6 |
| 宿主工具 | `noTools: 'builtin'`；wire tools 恰为显式 customTools | P2/P3/P4 断言 |
| 凭据 | apiKey 由服务端 secretRef 解析后注入 models 配置，不入事件/日志 | 契约 + AGENT_PROTOCOL §25 |
| 上游协议 | 显式 `api` 字段，禁止静默切换 | 契约 `llmApiTypeSchema` |
| Stop | 先阻断普通写入，再 abort/收束并报告结果 | `workbenchStopModeSchema` + 现有 §15 闸门 |
| 权限撤销 | 撤权即时终止进行中 turn（`authority_revoked`） | 契约 `turnStopReasonSchema` |
| 恢复 | 新 attempt 必须先对账未知外部副作用（`external_effects_reconciled`），单 writer fencing | 契约 `runnerAttemptResponseSchema` |

## Alternatives

- 在 API/Web 内运行 Pi：违反不可信执行隔离，影响请求服务可用性，拒绝。
- fork Pi 或将其 TUI 嵌到 Web：形成双 UI/生命周期维护，拒绝；SDK 是本期优先候选，RPC 仅在 W01 证明进程边界需要时替换内部适配。
- 原型 HTML/CSS/JS 整体替换 React：丢失现有权限与 feature 边界，拒绝；迁移视觉和控件语义，保留真实命令。
- 只接 Chat 并机械转换 Responses：无法证明完整工具/流式语义，拒绝。
- 新建 WYSIWYG/实时协同编辑栈：当前 Markdown 基础可复用，本期暂缓；依赖选择必须有实际需求与单独 ADR。
- 用 Guidance 存所有业务文档：混淆指令与说明，扩大 Agent 权限，拒绝。

## Consequences

增加一个 Runner runtime 与若干持久化表/契约，带来镜像、资源隔离、恢复和保留策略责任。新聊天界面同时依赖内容、模型与执行能力，必须先交付一个真实纵向场景，再扩大页面覆盖。组件库和现有 read models 得到复用，原型中未覆盖的 Projects/Models/Documents 按同一风格补齐。

需要新增 API/event/SDK/MCP 契约，但不取消现有 Session 控制与 server authorization。所有 mutation 保留 Idempotency-Key、revision/If-Match（适用时）、当前状态+domain event+outbox 同事务。

## Migration

按 W00–W18 分阶段实施；新 DDL 在 v1/0008 之后分配新编号，更新 SCHEMA.sql 的实际 include 入口，不改已应用 SQL。旧 description、Guidance、Artifacts 不静默迁移或重分类。验证空库、现有库升级、备份恢复、历史数据与 old/new runner fencing。

UI 按纵向功能迁移，替代消费方和测试通过后清除旧样式/组件；若用临时发布开关，需要明确删除任务。最终只有一个生产导航与组件体系。发布包含精确 SHA/镜像、真实 Chat/Responses、停止/重启、浏览器主链与回滚演练，生产发布需届时具体授权。

## Spec changes

- W01 同步 Agent Protocol、OpenAPI/shared contracts、domain states/route policy；最终接口名、编号、事件 payload 以该任务固定稿为准，本 ADR 不冒充已发布接口。
- W06/W07/W09 增加 ordinary documents、LLM settings 和 workbench conversation 的领域契约。
- W10/W11 增加 Runner 执行/恢复与工具 conformance，保留 Connection/Session authority。
- W12 同步 Skill、公开生成物与用户/部署文档。
- 根目录 PRD 缺失、ADR 0029 与当前实现差异、ADR 文件忽略规则由 W00 修复文档基线。

## Definition of done

路线图通用 D1–D7 全部适用。必须具备两类真实上游的多轮工具调用、Project/Issue 文档并发修订、服务端 Stop、进程重启/SSE 恢复、权限与秘密隔离、原型同状态视觉/键盘/手机证据。`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 均通过后，才可进入发布切换。
