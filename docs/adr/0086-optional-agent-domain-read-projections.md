# 可选领域准确 Agent 读取投影与有界消费者

## 状态

Proposed。本次仅规划文件；未获正式独审、未实施、未新增权限。接受前由 Chief 交另一 Agent 审核四项逐条授权证据及 Runner 边界。

## 背景

现行 OpenAPI 和 route policy 已允许 Agent 调用 Initiative rollup、Automation run、Usage summary、A2A task events，但实现仍使用 Human membership 查询。M0 `queryDifferences` 因此明确阻断，不能把零聚合或 Team-null 放行冒作支持。冻结 M4 要求先修后端授权投影，再补 SDK/MCP/必要 Runner。来源精确绑定 [M4 来源清单](../plan/agent-mcp-m4/input/source-manifest.json)，角色/状态/feature不取自口头记忆。

## 决定

在 `apps/api/src/operations/read-projections.ts` 建四个应用层函数，复用 `liveSessionReadPredicate` 并在同语句关联 Delegation 的现行 `principalTeamAuthorityPredicate`。current 凭据、Session、Delegation、definition、Team grant、capability、资源范围与返回正文同 SQL 快照；权限标记保内部。失权拒绝，合法隐藏目标 NOT_FOUND，合法空事实单独处理。Human 返回结构及可见范围保留。

| 投影 | 精确权限交集 | 保留合同 |
| --- | --- | --- |
| Initiative rollup | 与 `listInitiatives` 相同 Team 与 Session.project_id/scoped WorkItem.project_id，仅 linked 授权项目 | 200 可见项目上限、published health、COSTS 开关、decimal currency buckets、unknown；复用 `rollupInitiative` |
| Automation run | run.session_id 精确等于 current Session，与 `listAutomationRuns` 同本人范围，Team-null 不豁免 | 原 run 字段、effects/checkpoints 顺序；不授 origin E 看新 target E |
| Usage summary | 本 Session、本 Agent、精确 Session/item 项目；显式异 scope 参数拒绝 | 原字段和时间区间；totals/buckets 一条语句；无观测或 unknown 不呈完整零成本 |
| A2A task page | active binding/task 精确当前 Session、现行 pinned adapter 与实时共同资格 | 最多扫描 200 原事件、最后扫描 cursor、空映射页推进、原 payload/derived delivery 去重 |

A2A GET 具有既有派生写：初始授权与事件快照后，最终 guarded batch SQL 在 READ COMMITTED 事务重验同凭据/Session/principal/binding/task及固定扫描事件归属，`INSERT ... SELECT ... ON CONFLICT` 写原 outbound deliveries，权限标记与输出在同最终 statement决定。零映射页也重验；失权或故障整个事务回滚。其他三个投影零领域写、不加行锁。没有新领域 event/outbox、表、receipt 或 Idempotency-Key。

SDK/MCP/Runner 与 REST 使用同 DTO、policyfeature 与 derived manifest；发现阻断须在后端合同测试通过后逐条解除。工具 A2A 单页有界，checkpoint 与普通 domain events/集合分页独立。Runner `recordUsage` 关闭额外 Activity 包装，沿命令本身事实；不为 work:read 写偷加 work:write。Runner 保 executing exact E、完整有界正文、原错误包及 ADR0084/0085恢复边界，不新增自动重放动作。

详细安全合同及正反判定见 [安全合同](../plan/agent-mcp-m4/safety-contract.md)，逐操作消费者及测试见 [矩阵](../plan/agent-mcp-m4/operation-matrix.md) 与 [九类验收](../plan/agent-mcp-m4/verification.md)。这些文档是本提案组成部分，仍是待审设计。

## 未采用的做法

不授 Human 身份、membership、通用 Team 汇总、跨 Session 观察或管理权限；不新增无限流、外部连接、Loop 项目归属修复及出站 MCP，这些均越过本批现行合同。

## 影响

合法 Agent 可以读取已获授权的非空事实，先 list 后撤权不再伪成功；Human 消费者保持原字段和范围。A2A 派生写变成原子实时授权批处理，需真实 DB 并发及回滚证据。Loop origin 与 target 分离、projectless Session 不提供项目健康/usage归属，须明确披露；工具数量不证明全功能。

## 迁移

没有数据库迁移或回填；不修改已应用迁移、SCHEMA 表及历史 #53/M0/M5 报告。OpenAPI 原路径使用具名共享 DTO 补类型，保持字段兼容。部署六 feature 仅在本卡独立测试配置启用，生产默认关闭不变。先正式审合同，再实现后端及测试，再适配消费者及验证，最后按原门禁验收。

## 规格变化

现行接口不新增授权范围。对现有 Human membership 查询实现差异的修复，以及 A2A派生写/Runner能力包装的安全约束在本 ADR 明文记录；任何真正新增权限、用户可见范围或跨 Session 读取须另提具体卡。
