Todo #32 "[TA00] 后端与基础设施路线图及范围衔接索引" — latest build conversation (4 message(s)):
Branch: tds/conv-01a134af-ce5c-749a-8ffe-f0d0c8313860. Files on its branch: https://todos.dev/app/project/DzkLDn6UW-IbfoTJzN9Ro/files?ref=tds%2Fconv-01a134af-ce5c-749a-8ffe-f0d0c8313860 — append &path=<repo-relative file> whenever the link text names one file, or it opens on the branch root with nothing selected

[2026-10-13 09:55:00 UTC] (system) Turns from here run on machine Blueberry
[2026-10-13 09:55:00 UTC] (user/plan) [\[TA00\] 后端与基础设施路线图及范围衔接索引](todo:npcqX1i7vai8HivE61gCn)
[2026-10-13 10:04:25 UTC] (assistant/plan/codex/gpt-6.1-sol) (took 563s) 我会先核对仓库协议、现有路线方案和当前待办来源，再拟定只交付路线图与验收索引的执行计划，明确后续产品实现的授权边界。

当前待办列表显示，连接器、MCP 各批次、WebUI 退役和接入文档都已完成。路线图需要逐卡核对剩余增量，并区分“已合入”“已有但未验收”和“待批准”。我会使用仓库固定的 zh-tech-writing 技能整理中文方案。

平台 Git 缓存仍被 `index.lock` 阻塞，我没有处理该锁。通过当前工作树的只读远端查询，已核实 `refs/heads/main` 与本地 HEAD 一致，均为合入 PR #225 的提交。旧范围索引仍含已完成卡的历史安排；新方案会保留原件，重新建立当前状态和依赖，不改其他卡的规格或状态。

计划只交付中文路线图、来源快照和验收责任索引。已核实当前远端 `main` 与工作树一致；执行时将重新取证，保留旧方案及证据，不启动后续功能实现。

Saved plan (doc N_ON4oWLTxvM3OkjhbAok):
## 背景与目标

执行本计划只形成路线图、来源/覆盖/依赖与验收方案文件。

对照当前全部待办、准确主线源码和实际交付证据，明确已合入能力、已有但未验收组合、剩余具体增量、未批准提案和退役 UI。完成本卡仅表示路线图交付，不表示 F／TA 提案获准实施。

## 文件变更

全部新增文件置于 `docs/plan/backend-infrastructure-roadmap/`，历史文件保持原件。

- **`README.md`**：作为路线图入口，列出各整卡的剩余增量、建议执行顺序和批准关口。复用 `backend-agent-mcp-priority/` 的索引结构及 `backend-only/followup-impact.md` 的范围衔接方式，纠正已完成卡仍被列为待交付的历史安排。
- **`spec.md`、`implementation-plan.md`**：分别保存本卡完整当前规格和获确认的计划正文，与平台记录建立稳定引用；不以工具截断前缀冒充全文。
- **`sources/todos/*.md`、`sources/history/*.md`**：按统一格式归档全部当前卡的实际返回，以及可取得的历史方案和关键裁定。保留正文和返回边界；截断、缺源及脱敏单独注明，不补造内容。
- **`sources.md`**：记录卡 ID、读取时间、来源完整性、正文哈希、文件哈希和 Git blob。重新查询真实 `refs/heads/main`，绑定不可变提交及 PR／CI／验收出处；平台缓存锁只登记。旧路线源依次从可达 Git 历史、关联卡和对话取回，仍缺失则列明缺口。
- **`coverage-matrix.md`**：逐保留目标映射领域操作、API／合同、SDK、MCP、Runner、责任卡和证据。沿用 `OPENAPI.yaml` 的 `operationId`，核 `agentMutate`、`evaluateRouteAuthorization`、`deriveOperationEligibility`、`installDiscovery`、`WorkMeshClient` 和 `createWorkMeshTools` 的实际实现。MCP 注册、发现资格、可调用性和验收结果分列，避免重复规划已有组件。
- **`dependencies-and-acceptance.md`**：用 Mermaid 图和表格区分实施前置、最终验收前置及批准关口。逐卡承接测试与 DoD，标明现有用例路径、待创建用例、验收责任和完成依据；保留 H／C／E 隔离、精确审批、Stop、幂等、revision、fencing、事务及 outbox 恢复。可选终端、机器池和托管 Git 不进入核心硬前置，F 链仅保留内部依赖。
- **`verification.md`**：记录来源与覆盖检查、中文自检、实际命令、失败、未测和资源账本；说明本次没有接口或功能变化，因此接入手册、配置和示例无需改动。交付后停在审查关口，等待用户裁定接续。

## 执行约定

沿既有 Todos＋仓库记录例外交付，记录当前缺少 WorkMesh 控制面写工具的事实，不虚构 Project／WorkItem 同步。责任绑定到整卡和模块，实际执行者留待派发确定。

使用仓库固定 zh-tech-writing 副本及其结构、排版参考。涉及未来安全、持久化、设备或权限分歧时，在路线图列出具体待裁定问题，不替后续卡作决定。

业务代码、API 行为、迁移、CI 逻辑、ADR 状态、其他卡规格与状态、凭据申请及发布均在本次范围外。

## 验证与交付

- 重新读取全量看板，逐卡校验来源清单；核主线提交、合入依据和证据绑定。状态变化单独记录，旧 CI 和组件存在均不作为新验收通过。
- 检查每个保留目标都有责任卡、消费者覆盖、测试和完成依据；依赖图无环，不依赖已关闭 UI，不把可选扩展或未来 TA 全套反向设为已完成 MCP 批次的前置。
- 执行 `git diff --check`、`pnpm check:integration-docs`，另核新增路线文件的相对链接、来源哈希和矩阵完整性；接入文档检查器不覆盖新目录，不能代替这些核验。
- 通过 `scripts/ci-policy.mjs` 的 `classifyChanges` 检查实际提交路径，按当前分类运行适用检查并核最新 Required CI。五项仓库检查的通过、计划跳过和未执行分别记录，失败不交付为完成。
- 按 P0／P1 范围提交独立审查。提交全部方案文件，通过变更预览演示来源、覆盖和依赖映射；仅收尾本任务无活动引用的资源，保护共享环境与历史证据。
[2026-10-13 10:05:41 UTC] (user/plan_revision) Confirm plan.

--- In-flight turn (implement, not yet in the record above) ---
[2026-10-13 10:05:41 UTC] running 6m 18s — 我会按已确认计划归档当前来源，编写路线图、覆盖矩阵和验收依赖索引，再完成文档检查与人工验收清单。本轮只修改方案文件。

本轮重新核实的主线仍是 PR #225 的合入提交。我正在读取全部 62 张卡的当前正文；来源归档会分别标注规格和 Saved plan 是否完整，避免把截断方案当作完整交接材料。中文文档继续采用仓库固定的 zh-tech-writing 技能。
