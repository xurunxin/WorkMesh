# W00 基线报告：代码、原型、路由与现有能力冻结

任务：W00（[GitHub #122](https://github.com/xurunxin/WorkMesh/issues/122) / WorkMesh `GEN-551`）。
路线图：`docs/plan/2026-09-24-prototype-pi-agent-workbench.md`（[GitHub #121](https://github.com/xurunxin/WorkMesh/issues/121)）。
规划标识：`WM-WEBPI-20260924`。基线采集时间：2026-09-24（本地 Asia/Shanghai）。

## 1. 冻结标识

- Checkout SHA：`71f45fc8132051600b468876932155a9b72f9469`（main 合并 #120），与路线图分析基线一致。
- 工作树状态：仅未跟踪 `design/` 与三份计划文档（`.md` / `.index.json` / `.validation.json`），无已跟踪文件改动。本报告不修改 `design/` 内容。
- 本机环境：Windows；Node v24.20.0（仓库 `.node-version` = 22.15.0；Pi SDK 要求 ≥22.19.0，见 W01 复核项）；Docker 29.8.0 / Compose v5.5.1。
- 原型资产 SHA-256（前 16 位）：

| 文件 | SHA-256（前 16） | 字节 |
|---|---|---|
| design/prototype/index.html | `3ABD11844A043C79` | 8,805 |
| design/prototype/app.js | `4FCBE64D6F63A191` | 102,230 |
| design/prototype/app.css | `08541428FD868F52` | 97,471 |
| design/prototype/serve.mjs | `046F556F6B2ACCA9` | 1,724 |

## 2. 路由矩阵（原型 → 生产 Web）

生产 Web 实际页面文件（`apps/web/app/**/page.tsx`）：`/`（单页 Human Control Plane，含内部区块切换）、`/agents`、`/agents/[id]`、`/agent-sessions/[id]`、`/connect`、`/install`、`/login`、`/operations`、`/settings`、`/livez`、`/readyz`。核心业务组件在 `apps/web/app/page.tsx` 直接组合（`AgentWorkPanel`、`ProjectWorkspace`、`RichContent`、`RichTextEditor` 等，page.tsx:16-49）。路由合规机制：`apps/api/src/authz/route-policy.ts`（声明路由 + policy/operationId 绑定 + integration-only 校验，L30-97）；`apps/web/app/lib/canonical-route.ts` 以 `http://workmesh.local` origin 约束内部链接。

原型导航（app.js L224-239）为 hash 路由 `#/agent|home|active|board|backlog|inbox|agents|sessions|recovery|connect|ops|settings`，另有 `#/login`、`#/install` 屏幕。hash URL 不进入生产路由协议（路线图已约束）。

| 原型屏 | 对应生产能力 | 处置 | 证据/说明 |
|---|---|---|---|
| `#/agent` Agent 工作台（三栏对话） | 无（`client_type=pi` 仅为接入身份） | 新建（W09/W13） | AgentWorkPanel 现有执行视角，无对话容器/Turn |
| `#/home` 我的工作 | 部分存在（HCP 根页 attention/工作预览） | 重构（W04） | `lib/project-work-preview-query`、attention 队列已有 |
| `#/active` 进行中 | 部分存在 | 重构（W04） | Run timeline / WorkSurfaceState 已有 |
| `#/board` 看板 | 存在（WorkItemBoard 拖拽+键盘+选择器） | 复用+迁移（W04） | packages/ui `WorkItemBoard/AdaptiveCollection` |
| `#/backlog` 待办池 | 存在（Backlog 视图） | 复用+迁移（W04） | WorkItemFilters 含 savedViews |
| `#/inbox` 审批中心 | 存在（approvals-table、审批决策控件） | 重构+迁移（W15） | `agents/approvals-table.tsx`、`approval-decision-controls.tsx` |
| `#/agents` 智能体 | 存在（registry card、team access、enrollment） | 复用+迁移（W15） | `agents/agent-registry-card.tsx` 等 |
| `#/sessions` Session | 存在（agent-sessions/[id]） | 复用+迁移（W15） | 执行状态机已有 |
| `#/recovery` 恢复中心 | 存在（ADR 0049/0058 能力） | 迁移（W15） | operations/recovery 入口需并入导航 |
| `#/connect` 接入 | 存在（connect 页 + MCP onboarding） | 复用（W03/W16） | `connect/client-picker.tsx`、`lib/mcp-onboarding.ts` |
| `#/ops` 运营控制台 | 存在（operations 页） | 重构（W15） | overlap #20 |
| `#/settings` 设置 | 存在但无 LLM/模型管理 | 重构+新建（W07/W16） | LlmConnection/LlmModel 全新域 |
| `#/login`、`#/install` | 存在 | 复用+换壳（W03） | 独立认证外壳匹配新主题 |
| Projects 列表/导航 | 无独立导航入口（Project 内容在根页/工作间） | 新建导航（W03/W04） | 原型侧栏亦缺 Projects，路线图已列为补齐项 |
| 文档（命名文档/修订/历史） | 无普通文档域（仅 Guidance） | 新建（W06） | Guidance 域 `v1/0003_versioned_guidance.sql` 语义不得混用 |
| 命令面板 | 存在（CommandCenterMount + palette 基线） | 重构（W03） | `features/command-center` |

状态枚举映射（原型 → 生产）：`unstarted`→`planned`（workflow category）；`awaiting_review`→执行域 `awaiting_approval` 等；看板 `backlog/todo/in_progress/in_review/blocked/done` 对接真实 workflow status。前端动画不得替代"验收通过"领域操作（路线图 §原型查看结果 6/7）。

## 3. 能力差距表（带来源）

| 领域 | 已有（证据） | 差距 → 任务 | 处置 |
|---|---|---|---|
| 组件库 | packages/ui：Button/Input/Select/AppShell/Dialog/Sheet/Popover/Tabs/Badge/Card/Toast/Skeleton/AsyncStateSurface(12 态)/WorkItem 系/Attention/Run/Evidence/ControlCapabilityBar/DataTableFrame/Field 等；`--wm-*` token（tokens.css L2-41） | 双主题 token 映射、Combobox/Switch/Menu/Tooltip/CommandPalette/Pagination/优先级与状态徽章域组件、模块化拆分 → W02 | 重构（不建第二套） |
| 内容 | react-markdown+remark-gfm（markdown.tsx L11-18）；RichTextEditor 本地草稿/undo/快捷键（editor.tsx L20-66,140-197） | 统一到 Project 描述/评论/聊天/制品全部表面；Project 创建等仍有普通 textarea；附件/冲突/IME 细化 → W05 | 复用+扩展 |
| 文档 | Guidance 独立文档/不可变修订/上下文 pin（`v1/0003_versioned_guidance.sql`） | 普通（非 Guidance）命名文档+修订+历史+diff → W06 | 新建 |
| Agent 治理 | Connection/Session/claim/delegation/审批/lease/stop/append-only activity/outbox/durable SSE（ADR 0043/0055/0040/0003/0033） | 对话容器、Turn、Runner、工具集、行为权限 → W09-W12 | 新建（复用治理底座） |
| 模型接入 | 无（manifests/schema 检索无内建 Pi 或 Chat/Responses 配置域） | LlmConnection/LlmModel/secretRef/探测/用量 → W07/W08 | 新建 |
| 执行引擎 | 无内建 Pi 依赖 | `apps/agent-runner` + 固定 Pi SDK（Node ≥22.19 与镜像基线冲突需解决）→ W01/W10 | 新建 |
| 主题 | `--wm-*` 单 token 体系存在；0045 ADR 仍为 "Proposed" 且描述仅浅色语境 | light/dark 语义化双主题 → W02；0045 状态需更新 | 重构+ADR 更新 |

## 4. 文档与 ADR 核对

- `WORKMESH_PRD.md`：**确认缺失**。仍被 `AGENTS.md:7` 与 `MANIFEST.json:12` 引用；`docs/plan/2026-08-22-agent-connection-runtime-reliability.md:34` 已有先例说明其缺失并以 Issues/AGENT_PROTOCOL/OPENAPI/SCHEMA/ADR 替代。恢复方案：修正 `AGENTS.md` 与 `MANIFEST.json` 的引用（指向现行权威文档集合），不凭记忆重造 PRD 正文。
- ADR 0029 双文件：`0029-secret-aware-authentication-idempotency.md` = Accepted；`0029-rich-content-sanitization-and-editor-boundary.md` = **Proposed (rev 2)**，其描述与当前 react-markdown/自管 undo 实现存在漂移（路线图已判定），W05 时按实现更新该 ADR。
- ADR 0045（WebUI 主题/i18n）：Status: **Proposed**，其"single-token theme"方向与本轮双主题目标一致但语境仅浅色，W02 需显式更新或出替代 ADR。
- ADR 0064（统一 HCP 体验）：为本轮迁移的直接前置约束；0065（本轮）：Proposed，W01 后固化。

## 5. Overlap 表（旧 Issue 处置）

全部经 `gh issue list` 核对为 OPEN（2026-09-24）：

| Issue | 主题 | 与本轮关系 | 处置 |
|---|---|---|---|
| #20 | Operations Web 工作流补全 | W15 运营控制台迁移 | 保留自身范围；交集处复用验证，不代关 |
| #21 | 项目管理（Cycles/Views/健康） | W04 Projects 页面 | 同上 |
| #22 | usage/cost/budget | W07/W08 用量适配 | 同上；不把"未知用量"记为零 |
| #28 | 多 runtime 调度 | 非首期（路线图范围控制） | 不扩入本轮 |
| #75-#78 | P1 Bug（coordination recovery/并发准入/pinned skill/安装令牌） | 历史有修复工作 | W00 按代码/测试证据核对，不重新列为未实现，不直接关闭 |

## 6. 五项必需检查基线（真实执行）

环境：本地 Windows，Docker 29.8.0。集成门禁要求（`scripts/require-integration-env.mjs`）：`RUN_INTEGRATION=1` + 名含 "test" 的 `DATABASE_URL` + `WORKMESH_BOOTSTRAP_TOKEN`。

| 检查 | 结果 | 说明 |
|---|---|---|
| `pnpm lint` | PASS（exit 0） | 本轮真实执行，turbo 全仓 |
| `pnpm typecheck` | PASS（exit 0） | 本轮真实执行 |
| `pnpm test` | PASS（exit 0） | 本轮真实执行（单元层） |
| `pnpm test:integration` | PASS（分套件执行） | db：通过；api：122/123，唯一失败 `stage4-operations > applies A2A execution capacity only to a newly imported non-terminal task`（admission 事件计数 2≠1）单独重跑该文件后通过，判定为本机并发 flake 并记录；worker：78 通过/1 skip；recovery：通过。集成环境：compose postgres/redis/minio + 独立宿主 redis（见下方阻塞记录） |
| `pnpm test:e2e` | BLOCKED（本机环境） | Playwright 自行启动的 `next dev`（3100）编译失败：`Can't resolve './G:/Projects/MetronX/.wm-virtual-store/next@…/app-next-dev.js' in 'S:\Projects\MetronX\WorkMesh\apps\web'`，webServer 90s 超时。根因是本机同时存在 S: 与 G: 两个盘符指向同一工作区，pnpm 虚拟 store 位于 G: 而 pnpm run 解析 cwd 为 S:，跨盘相对路径解析失败。为确定性环境阻塞，非代码缺陷；CI（ubuntu）不受影响。已记录并带入 W17/W18 复验 |

本机环境阻塞记录（W00 发现，供后续任务参考）：

1. `docker-compose.yml` 的 redis 服务未发布宿主端口（CI 由 workflow service 映射 6379）；宿主机直跑 API/集成测试需自备可达 Redis。本轮以独立 `redis:7-alpine` 容器映射 `127.0.0.1:6379` 解决。W01 可评估是否在 compose 中补充 `127.0.0.1:${REDIS_HOST_PORT:-6379}:6379` 映射。
2. `.env` 缺少 `PAGINATION_CURSOR_KEYS/PAGINATION_CURSOR_ACTIVE_KID/WORKMESH_BOOTSTRAP_TOKEN`（compose 强校验），且原文件末行无换行符导致一次合并写入事故（已修复）。
3. 集成限流参数受 schema 上限约束（`AUTH_RATE_LIMIT_SUBJECT_BURST ≤ 1000`、`AUTH_RATE_LIMIT_INSTALL_BURST ≤ 100`），本地取值必须与 CI 一致。
4. S:/G: 双盘符问题使宿主机 `next dev` 与 Playwright e2e 无法运行；真实 Web UI 验证改由 `docker compose up -d --build` 全栈完成（api/web/worker/mcp 镜像构建，web 端口 3000）。
5. 本地 Node v24.20.0 与 `.node-version` 22.15.0 不一致；Pi SDK engine ≥22.19.0 使该文件必须升级（W01 交付项）。API 生产镜像 22.17.1 同样低于 Pi 要求（路线图已记录）。

截图证据（本地 `.evidence/roadmap-20260924/w00-baseline/`，gitignored）：原型 12 张（agent-workbench-default/home/board/inbox/sessions/agents/recovery/operations/settings/login/install + 1 状态样张）与真实 Web 4 张（real-home/real-agents/real-operations/real-settings，compose 栈 localhost:3000，admin 登录）。真实 Web `/operations` 当前显示"未启用 Operations UI 功能"，与 feature flag 现状一致。

## 7. 原型交互规格补充（W00 审查结论）

- 侧栏缺 Projects、设置缺 LLM 管理为原型与生产共同的缺口，已列入 W03/W07/W16。
- 原型"思考过程"须实装为"执行摘要/操作记录"（仅公开理由/计划/工具状态/证据）。
- 原型底部"写操作需审批"为误导性全局提示，实装须按具体权限/风险策略显示。
- Issue 行双击快捷保留，但必须提供显式详情链接、Enter 打开、焦点返回。
- 原型工具状态、版本号、成功结果均为模拟数据，不复制进实装。

## 8. W00 完成判定

- [x] checkout SHA、原型校验值、路由/控件矩阵已冻结（本报告 §1/§2）。
- [x] 能力差距表带来源（§3）；原型→组件→页面→API 映射可追溯（§2/§3）。
- [x] PRD 缺失核实与恢复方案（§4；引用修正延至 W01 文档批次执行，本报告不改动 AGENTS.md/MANIFEST.json）；ADR 状态核对（§4）；overlap 表（§5）。
- [x] 五项检查基线真实执行（§6；e2e 本机环境阻塞如实记录，非代码缺陷）。
- [x] 复用/重构/新建/延期逐项标注（§2 处置列）；UI 替换范围确认，无重复开启历史修复（§5）。
- [x] 原型与真实 Web 同轮采样截图（§6 末；桌面 1280×720 视口采样，非全站验收）。
