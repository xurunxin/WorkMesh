# [A1] 就绪投影：三态查询，零迁移（Runner 只能 unknown）

来源卡：[#8](todo:Hxr1xIdh4poZp3F5laGrT)；来源 updatedAt：2026-10-07T15:23:24.979Z；原文 UTF-8 SHA-256：`8dfbbaa305dfb679b4831ac99c7ee726b32a8491844cf9c289a1fbd4d8180d34`。完整原文与读取来源见 execution-inputs.json，非事务快照。

withPlan: true；owner：A1 执行者；源状态：todo；同步：待Chief读回核验。

本批仅用 Todos 编排与仓库保存规格及证据，替代真实WorkMesh双轨记录；其余领域/安全/测试规则不变。当前G1已done，最新主线含最终证据；每次开工仍核验最新main与输入差异。R1完成独审、必需检查及合入后才由Chief放行受影响实现，不能以本文件存在当成功。

## 冻结接口与阶段

调用者与 Team 范围纯查询；模型 active+enabled、可见 active Agent、仓库工作上下文，Runner 永远 unknown；not_applicable 是适用性而非第四种就绪状态。不建活性事实，不产生 Session/receipt/event/outbox，不成为激活授权。

## 定向验收责任

personal/Team/跨workspace 隔离、撤权实时变化；empty/active/disabled 组合；非仓库项 not_applicable；unknown 不误判 blocked；重复GET与失败GET零领域写入；鉴权拒绝保留用户批准的既有authorization_denials审计例外。

测试目标：`apps/api/integration/configuration-readiness.integration.test.ts`（待创建）。九类适用性、全部原测试/DoD去向见 test-coverage.json；未运行不填通过。

## 完整任务正文

## 目标
新装的 WorkMesh 和能用的 WorkMesh 在操作者眼里没有区别：不是报错，而是「一个正确的产品对「我还没配置」保持沉默」。但**四事实「能不能跑」的判据有三个今天不可观测**，硬写会得到永久性的假阴性。

## 背景与证据（已核实，file:line）
- **没有空闲 Runner 的在线事实**：runner 仅在被分配了 Agent Session 时才进入心跳循环（`apps/agent-runner/src/run-session.ts:332-357`），`workbench/runner/assignments` 读的是既有 Session/Delegation/grant（`apps/api/src/workbench-runner.ts:88-109`），心跳挂在 Agent Session 上（`packages/db/src/schema.ts:321-324`）
- 模型条件更窄：需 `connection.status='active'` **且** `model.enabled=true`（`apps/api/src/workbench-conversations.ts:150-166`）
- 活跃 agent ≠ 可用 agent（仍需匹配的 Delegation 与 Session）
- 项目不是所有工作的前提：既有 ADR 0004、0024 与 `AGENT_PROTOCOL.md:1746-1756` 允许非仓库工作

## 交付物
一个只读投影，按调用者与 Team 作用域化，每项检查三态 `ready`/`blocked`/`unknown`，仓库项另有 `not_applicable`。**Runner 项 v1 恒为 `unknown`**。无任何写入端点。

## 约束
- **不是**「能不能跑」的判据，是「配置是否到位」的判据；不得被当作运行许可
- `unknown` 与 `blocked` 严格区分：平台不知道就说不知道
- 按调用者可见性作用域化：个人模型对队友不可见，「看不见」报 unmet 而非「存在但无权」
- 零迁移、零新表（`unknown` 正是让这点成立的原因）
- 链接走既有 canonical 路由，不新开 setup shell

## 测试清单（逐条需填测试文件与用例名后方可开工）
- [ ] 四项检查各自的 happy path
- [ ] 跨 Team 与他人个人模型**不泄露存在性**
- [ ] **无 assignment 的空闲 Runner 不得被报成离线**（`unknown`）
- [ ] 模型 disabled → `blocked`；模型属于他人 → 对该调用者 `blocked` 且不泄露
- [ ] 非仓库工作 → `not_applicable` 而非 `blocked`
- [ ] 断言**无状态/事件/outbox/receipt 写入**（不是「事务计数为 0」）
- [ ] 路由策略矩阵用生成器重生成，不手改

## DoD
投影可用 + 全部作用域与三态断言通过 + 零 schema 变更 + 全量检查全绿。

## 执行依赖与放行

requires：#1、#2、#18、#3；最终验收 additionally requires：无。

本todo原问题已有用户13:34–13:36明确答复，详见末尾同步；依赖及审查门禁保持。

DoD：上面完整源DoD与定向断言全部满足，适用必需检查成功，证据落盘、独立复核及Chief确认；不得以接口存在或历史CI冒称新组合已验收。阶段owner由Chief派发前落实到实际执行者，角色不冒称已任命某agent。

## 总管同步与当前门禁（2026-10-08，Asia/Shanghai）

来源：已独审并合入的 PR203，main `9ac1a2015da1ae20b9693ac8a62aac6f49dca8d7`，第二 parent 为审核 head `550dead055689154359a3406dfce4f0c91c1dad3`，两者 tree 一致；该 head CI383 十项检查全部成功。G1/P1/D0/R1 已完成，本卡仍按上文 requires、阶段验收及授权边界执行。正文中的源状态、待同步说明是文件生成时的历史元数据，不代表当前门禁仍关闭。
本卡完整规格来自 `docs/plan/activation-task-specs/08.md`；完整原文快照为 `docs/reviews/r1/execution-inputs.json`，逐类测试/原测试与 DoD 去向为 `docs/reviews/r1/test-coverage.json`，阶段和依赖映射为 `docs/plan/activation-task-specs/index.json`。总管同步前复读本卡全文与源哈希一致；仓库索引的 syncStatus 保留生成时状态，不声称已写回仓库或真实 WorkMesh。新增范围、真实方案分歧、权限或仓库外发布仍须另批。

## 用户原问题答复同步（2026-10-08 13:39，Asia/Shanghai）

来源：本todo原问题卡13:36用户答复：「显式查询参数（推荐）」「限定当前上下文（推荐）」「保留拒绝审计（推荐）」。按原卡推荐说明workKind=repository|non_repository只作用查询不持久化；指定projectId/workItemId时仓库限定该上下文，未指定才所选Team查询；成功/重复/错误与故障均零领域写入，鉴权拒绝保留既有authorization_denials安全审计。该安全审计例外是用户明确选择，不要求修改Accepted全局鉴权规则；查询仍不变成运行授权，Runner恒unknown。

本卡源SHA/PR203同步状态保留历史，不冒当前全文哈希或仓库已同步。当前main包含D1a actual1078bbc，开工再复读最新main影响，正常整合已落地增量。独审前须提供完整中文计划文件和当前savedplan来源/精确正文hash供另一agent读取，仅平台doc链接不能代可审全文；允许仅计划文档前置提交，产品编码仍须规划独审及Chief确认。实施前同步受影响ADR/仓库spec、保留历史源与完整验收，未提供的平台版本字段如实null不猜、不为自引用重复存新计划。