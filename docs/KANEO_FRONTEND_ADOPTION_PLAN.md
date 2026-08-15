# Kaneo 前端移植与借鉴方案

状态：`Active / M0 complete`  
初始分析基线：2026-08-03  
当前执行基线：2026-08-11  
激活证据：WorkMesh dogfood TaskGraph v22 独立 Gate PASS；GEN-1/GEN-3 已完成，GEN-4 已通过 v24 architecture Gate 与 MCP exact completion 达到 Done revision 4；GEN-5 保持 Backlog revision 1 / `coord:paused`，作为下一未激活候选。

## 1. 目标

选择性移植 [usekaneo/kaneo](https://github.com/usekaneo/kaneo) 中已经验证的人类用户体验和前端实现，加速 WorkMesh 从“功能可用的控制面”演进为“人类可长期使用的协作产品”。本计划不引入第二套任务领域模型，也不以 Kaneo 的后端、权限模型或实时协议替换 WorkMesh 的权威边界。

上游执行基线已通过 GEN-3 重新固定：

- 仓库：[usekaneo/kaneo](https://github.com/usekaneo/kaneo)
- 执行提交：[`a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41`](https://github.com/usekaneo/kaneo/commit/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41)
- 最新正式版本：[`v2.17.1`](https://github.com/usekaneo/kaneo/releases/tag/v2.17.1)，tag commit `4d688c9a05cd0508309b579abda3e8eba048f75a`
- 许可证：[MIT](https://github.com/usekaneo/kaneo/blob/a458d8706c9d7a32a8ad485d5c6f3a938e1bfe41/LICENSE)，版权声明 `Copyright (c) 2024 Andrej Acevski`
- 复审报告：[`KANEO_UPSTREAM_REAUDIT.md`](./KANEO_UPSTREAM_REAUDIT.md)
- 机器清单：[`KANEO_EXTRACTION_MANIFEST.json`](./KANEO_EXTRACTION_MANIFEST.json)
- Notice：[`KANEO_THIRD_PARTY_NOTICE.md`](./KANEO_THIRD_PARTY_NOTICE.md)
- 前端架构：[`KANEO_FRONTEND_ARCHITECTURE.md`](./KANEO_FRONTEND_ARCHITECTURE.md)
- 机器合同：[`KANEO_FRONTEND_CONTRACT.json`](./KANEO_FRONTEND_CONTRACT.json)
- 绑定决定：[ADR 0028](./adr/0028-kaneo-frontend-architecture-and-dependency-policy.md)

旧提交 `0efc06f...` 与 `v2.12.1` 代码基线等价；到当前执行提交有 216 commits / 365 paths 漂移。当前 HEAD 比 `v2.17.1` 多 2 commits，但没有 Web 前端差异。

## 2. 核心决策

采用“交互语义 + 组件实现选择性移植”的路线，不做整仓长期 Fork，也不移植 Kaneo 的服务端权威模型。

```text
Kaneo 人类体验与组件
        |
        v
WorkMesh packages/ui 展示组件
        |
        v
apps/web feature adapters / view models
        |
        v
WorkMesh contracts + REST/SSE + domain authority
```

GEN-4 将这条边界冻结为可执行合同：`packages/ui` 只承载 tokens、headless/presentational components 和 accessibility behavior；`apps/web/features/*` 承载 DTO validation/normalization、authority-safe view models、query/command orchestration、optimistic rollback 与 routing integration。依赖采用 staged Gate，不在 M0 预装候选栈。

必须保持的 WorkMesh 不变量：

- Work Item 的责任人始终是 Human；Agent 通过 Delegation 和 Agent Session 执行，不能投影成普通 assignee。
- 工作流状态与 Agent Session 执行状态分开展示、分开变更。
- 所有 mutation 继续遵守身份、会话、委派、能力、资源范围、审批、租约、revision 和 idempotency 约束。
- `Idempotency-Key`、`If-Match`、结构化错误、事务事件/outbox、持久化 SSE cursor 和服务端 Stop enforcement 不得被 UI 乐观状态绕过。
- Agent 的计划、活动、审批、handoff、消息与 artifacts 仍是可审计事实；不持久化隐藏思维链。
- PostgreSQL 仍是持久化权威；Redis、浏览器缓存和前端 store 都只是投影或加速层。

## 3. 当前差距与上游借鉴矩阵

WorkMesh 已有 List/Board、Work Item drawer、Work Room、Agent Session、Inbox、Project Delivery 和 Operations 等功能面，但主要页面仍集中在 `apps/web/app/*.tsx`，共享 `packages/ui` 只有最小 Button，组件系统、交互一致性、富文本、全局导航和响应式体验尚未形成。

| 能力 | Kaneo 参考实现 | WorkMesh 借鉴方式 | 不直接复制的部分 |
| --- | --- | --- | --- |
| Board / List / Backlog | `apps/web/src/components/kanban-board/`、`list-view/`、`backlog-list-view/` | 移植卡片、分组、拖拽、空态、批量操作和键盘交互；接 WorkMesh view model | Kaneo API hooks、路由和任务状态模型 |
| Work Item 详情 | `components/task/task-details-sheet.tsx`、`task-description.tsx` | 重构现有 drawer 为可复用 Sheet/Full Page；保留 responsible human 与 agent execution 双投影 | 单一 assignee 语义、直接 mutation |
| 富文本与讨论 | `components/activity/comment-editor.tsx` | 复用编辑器交互、mentions、附件和草稿体验；通过 WorkMesh contracts 写入 | 未验证 HTML、越权 mention、隐藏推理内容 |
| 全局命令与搜索 | `components/command-palette/` | 增加 command palette、最近访问、Work Item/Project/Agent Session 搜索和快捷创建 | 客户端作为权限判断来源 |
| 通知与集成设置 | `components/account/notification-preferences-settings.tsx` | 借鉴偏好表单、状态反馈和集成引导；服务端执行策略仍归 WorkMesh | Kaneo 通知数据模型和直接外部副作用 |
| MCP 引导 | `packages/mcp`、`apps/api/src/mcp` | 借鉴面向人的安装、配置和诊断 UX | 把 MCP 人类凭证当作 Agent authority、绕过 Agent Session |
| 自托管安装 | `charts/kaneo`、`Dockerfile.kaneo`、`compose.yml` | 借鉴安装向导、配置检查、健康状态和 Helm 使用体验 | 合并 WorkMesh API/Web/Worker/MCP 边界、应用启动时迁移 |
| i18n | `i18n/schema.json` 及生成脚本 | 建立 typed message catalog、缺失键检查和语言切换 | 直接复制文案而不校准领域术语 |

## 4. 目标前端边界

### `packages/ui`

承载无业务权威的展示组件和 tokens：Button、Input、Select、Dialog/Sheet、Popover、Tabs、Badge、Card、Data List、Board primitives、Command Palette、Rich Text primitives、Toast、Skeleton、Empty/Error state。组件通过 props 和回调工作，不调用 WorkMesh API。

### `apps/web`

按 feature 建立 adapter 和 view model，将 WorkMesh DTO 映射为展示模型。建议至少区分：

- `features/work-items`：List、Board、Backlog、详情、过滤器；
- `features/work-room`：人类/Agent 可见消息、计划、活动、审批、handoff、artifacts；
- `features/agents`：Agent、Delegation、Session 控制和执行状态；
- `features/projects`：Project、Milestone、Delivery、依赖与完成建议；
- `features/settings`：通知、集成、MCP 与安装诊断。

数据适配层必须把 `responsibleHuman` 与 `agentExecutions[]` 分开建模，并在 mutation 前携带当前 revision；冲突时显示服务端最新状态与可恢复操作，不静默覆盖。

### `packages/contracts` 与 API

优先复用现有合同。如果 UX 暴露了真实合同缺口，先更新 `OPENAPI.yaml` 和共享 contracts，再实现 route/domain/repository；不得为适配上游组件而在前端伪造第二套持久模型。

## 5. 分阶段实施

### M0 — 激活、来源治理与架构冻结

1. Stable Core GA 和当前正式验收目标完成；负责人明确启动。
2. 重新固定 Kaneo commit/release，生成源码、资产、依赖、许可证清单和 drift 策略。
3. 完成组件依赖决策、前端目录边界、tokens、view model 和测试策略；重大依赖或边界变化写 ADR。GEN-4 的绑定输出为 ADR 0028、`CONTEXT.md`、`KANEO_FRONTEND_ARCHITECTURE.md` 和 `KANEO_FRONTEND_CONTRACT.json`。

### M1 — UI Foundation 与应用壳

1. 建立 `packages/ui` tokens 和无业务组件基线。
2. 重构应用壳、侧栏、顶部导航、响应式布局、Loading/Empty/Error/Toast。
3. 建立 command palette、全局搜索入口和键盘导航骨架。

### M2 — 核心工作管理界面

1. 将 List、Board、Backlog、filters、saved views 迁移到 feature/component 边界。
2. 引入可访问的拖拽与键盘替代操作，失败时回滚乐观投影并呈现冲突。
3. 重构 Work Item Sheet/Full Page，清晰展示 responsible human、delegated agents、session states 和 revision。

### M3 — 人类协作、Agent Work Room 与 Artifacts

1. 引入安全富文本、mentions、comments、草稿与附件交互。
2. 统一 Work Room 的 conversation、plan、activity、decisions、sessions 和 artifacts 信息架构。
3. 改进 Inbox、审批、handoff、通知偏好和可审计状态反馈。

### M4 — MCP、集成与自托管体验

1. 提供面向 Human 的 MCP 安装/配置/连通性诊断，不改变 Agent authority。
2. 建立集成设置和 webhook/notification 健康反馈，外部副作用仍走服务端 outbox/idempotency。
3. 改进安装向导、Compose/Helm 配置说明、迁移/版本兼容检查和运行时健康页。

### M5 — 产品质量与发布验收

1. 完成 typed i18n、领域术语表、响应式和 WCAG 2.2 AA 基线。
2. 覆盖关键组件测试以及人类/Agent 权限、revision 冲突、SSE 重连、Stop enforcement、artifact provenance 的 E2E。
3. 建立性能预算、视觉回归、依赖/许可证审计和上游 drift 检查。

## 6. 启动门槛与当前状态

初始项目和所有执行 Issue 默认保持：

```text
Linear project/status: Backlog
Issue status: Backlog
coord-state: coord:paused
owner: owner:unassigned
assignee: null
cycle / due date: unset
```

Activation Gate 已在 WorkMesh dogfood TaskGraph v22 中完成并由 fresh independent Gate 验证。GEN-3 已通过 v23 final Gate 完成；GEN-4 的 M0 架构冻结已完成并通过 v24 architecture Gate，GEN-5 与其他执行事项继续保持 Backlog/paused，等待后续独立激活路线。

激活时核对的条件：

- [WorkMesh Stable Core GA Gate #1](https://github.com/xurunxin/WorkMesh/issues/1) 已完成；
- 当前正式 soak、release、security 和 acceptance 目标均有持久证据且已关闭；
- 主线基线和部署支持矩阵明确，不在尚未集成的临时分支上开始大规模 UI 重构；
- 负责人确认优先级、首个里程碑和可用开发容量；
- Kaneo 上游来源、许可证、依赖和资产已重新审计；安全扫描按负责人指示跳过，因此不授予安全批准。

## 7. 验收边界

每个移植 Issue 都应满足：

- 可追溯到固定 Kaneo commit、原始文件和许可证；注明“复制、重写或仅借鉴交互”。
- 不削弱 WorkMesh 的 actor、delegation、approval、lease、revision、idempotency、event/outbox 和 durable SSE 边界。
- 键盘可达、焦点可见、读屏标签完整，并有无拖拽替代路径。
- 移动端、窄屏和桌面主要路径可用；Loading、Empty、Error、Conflict、Forbidden 状态齐全。
- 相关 unit/integration/E2E 和必要的视觉回归通过；新增依赖有体积、维护性、许可证与安全评估。
- 若增加或改变 API、事件、数据库或核心不变量，同步更新 spec、contracts、migration 和 ADR。

## 8. 明确不在本计划中的内容

- 移植 Kaneo 后端、数据库 schema、controller、Better Auth 配置或 WebSocket 权威模型；
- 用前端 store、Redis pub/sub 或第三方实时库替代 PostgreSQL + durable SSE；
- 把 Human MCP token、浏览器 session 或普通 assignee 身份授予 Agent；
- 为追求单体部署而合并 API、Web、Worker、MCP 或把不可信代码放入这些进程；
- 在 Stable Core GA 与当前正式验收完成前提前实施本路线图。

## 9. 控制平面记录

原 Linear 项目、里程碑和 Issue 已迁移到 WorkMesh Team `GEN`，并通过 WorkMesh MCP 与 Human Web 体验完成激活验证。当前 Project 为 Active；GEN-1、GEN-3 与 GEN-4 均为 Done，其中 GEN-4 为 revision 4 / `coord:completed`；GEN-5 为 Backlog revision 1 / `coord:paused`，与其余事项继续保持 Post-GA/Paused。后续状态、证据和依赖以 WorkMesh durable control plane 为准。
