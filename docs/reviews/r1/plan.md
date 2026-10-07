## 上下文

独立复核 ADR 0074–0078、全部 29 卡的最新完整 spec、updatedAt 与状态、原外部审查及冻结的 P1 事实表，交付有代码证据的审查报告、处置台账、完整任务规格和修订后主计划。通过 Todos 逐卡读取；缺少读取入口的执行或复核环境使用总管提供的原文、元数据及哈希交接包，未取得的输入明确列缺口。最新主线的 F2 修订是审查输入，不按旧检出重复判未修；历史结论逐条重新核验，不预设通过。

本轮按用户明确要求，仅在当前分支提交规划交接工件：完整 `plan.md`、最新 29 卡元数据/全文/哈希 JSON、逐 finding 处置及检查记录，交总管以精确提交让原复核 agent 核验后回 confirm；三项 blocking 保持待独立复核，权威 ADR、主计划与产品代码不改。G1 最终 settled、最终证据经独审及对应必需检查通过并实际合入最新 main 后，Chief 才确认完整规格修订执行。执行前复读全部 29 卡并核对 updatedAt、正文哈希和状态差异，再固定实际 base；base 必须包含 G1/P1 及最新规格。复用 `scripts/verify-build-input-reachability.mjs` 核对其已有清单，另逐份核对主线 ADR 0078、`0078-review-round2.md`、主计划及首轮报告的 Git blob、完整正文、提交/工作树 SHA-256。工作树与指定 base 不一致不得冒称通过，旧 PR CI 不替代最终门禁；缺失或陈旧输入保持对应门禁关闭。

## 假设与边界

本批采用已批准的 Todos＋仓库例外，保留其他领域、安全与测试约束。R1 执行者负责规格修订与 F3/F4/F5/F6 共同契约冻结；总管负责 Todos 同步、裁决交接及最终放行，并在派发前落实各执行 owner。修订结果须由总管安排另一 agent 定向独立复核，复核者使用同一输入快照与改动提交；同步未读回前记录为待同步。

产品实现、数据库迁移、外部发布和团队权限变更不属于本轮范围。

## 文件变更

- `docs/reviews/r1/`：本轮提交 `plan.md`（与平台计划正文一致）、`todo-inputs.json`（逐卡完整原文、id、seqNum、title、phase、updatedAt、每次读取时间/来源、UTF-8 SHA-256）、`plan-review-response.md`（四条首轮意见逐项处置及待复核状态）、`checks.md` 与可重算哈希的交接清单；保存规划输入快照。后续获准执行前再保存复读快照和差异。当前平台计划引用为 `doc:rZ-zANJldiqLoLjgvdqvm`，正文按本会话保存副本及成功的 `edit_plan` 回执交接，捕获时间、可取得的版本信息和来源在交接清单中记录；没有独立 doc 读取不得声称已读回。原审查引用 `doc:BVfhr56cxlVUURaZjatX_` 若无读取入口，由总管提供可追溯原文交接；不能将摘要冒作已核验正文。保留规划与执行两份输入快照；#6 等已吸收任务的合并前测试/DoD 从历史受控材料追回并逐条映射，取不到列缺口，不宣称迁移完整。

- `docs/reviews/r1-spec-review.md`：新增按严重性分组的 findings、建议砍清单及 blocking/high 处置台账。每条记录实际 `file:line`、来源提交、代码事实、影响、修订建议、owner、受影响任务、处置与复核证据；未证实的问题标待验证，接受风险不写成用户批准。逐条核对领域不变量及既有 ADR 的实际状态，重点检查 0028、0052、0064，并区分两份同编号 0028 文档。

- `docs/adr/0074-*.md` 至 `docs/adr/0078-*.md`：修正独立复核确认的规格矛盾，保留历史来源。B 链对照 `authIdempotentTransaction`（`apps/api/src/auth-idempotency.ts`）及 `buildAgentConnectionInstruction`（`apps/web/app/lib/mcp-onboarding.ts`），核验敏感 pending、完整身份校验与正式配置提交顺序；C 链对照 `createAutomationWorker` 内的 `claimNotifications`、`deliverNotification`（`apps/worker/src/automation.ts`），写清现有投递、reclaim、fence 与新增契约的关系；D 链对照 `toWorkSurfaceItem` 和单项移动适配器，保留真实工作流、执行状态、授权 Attention 与本地草稿的边界。依据 `packages/ui/src/tokens.css` 的 `[data-wm-theme='dark']` 和 D0 `README.md`，撤换 ADR 0077 中“产品当前仅亮色、暗色尚待新增”的陈旧正文，明确产品已有且默认暗色；本批参考值迁移限于亮色，既有暗色能力及 token 解析必须保留。

- `docs/adr/0037-agent-inbox-recipients-claims-and-receipts.md`：与 ADR 0078 同步写入已选 successor / re-delivery 契约。依据 `registerInboxRoutes`、`loadAgentItemForUpdate`、`insertReceipt`（`apps/api/src/inbox/routes.ts`），保留原 claim、收件事实和会话归因。共同契约先冻结原逻辑来源、独立恢复意图及 successor 身份、当前授权与恢复资格、幂等键、锁定与提交边界；同一恢复意图重放返回同一 successor，原条目与 successor 的并发回复竞争同一逻辑来源的最终 resolution，已解决来源不产生新的有效恢复输入。写清与 `0032_agent_inbox_receipts.sql` 的 recipient/source 唯一键及现有按源消息 resolution 的增量关系。F3 按逻辑来源与恢复意图去重，新输入 ID 不清除 Stop、撤权或预算限制；F4 明确恢复/激活结果引用与 checkpoint 的原子关联。恢复不伪造 ACK，ACK 仍不等于 resolve。

- `docs/plan/*-activation-onboarding-and-china-ecosystem.md`：统一任务正文、依赖图、验收矩阵、风险与规格分歧。落实 #5 合并、#20 承接 B4、#11/#21 与 #14/#22 拆分、D2/D3 合并；删除悬空 C4 和无关串行门禁，保留 C1→C2。F0 保持全链前置；在同一卡内区分阶段：R1 先冻结 F3/F4/F5/F6 共同契约，F3/F4 执行 owner 各自验收激活结果和 checkpoint 接口；F5 依赖 F1/F3，使用既有 Inbox fixtures 验收恢复底层，不依赖 F6 工具；F6 再依赖 F1/F2/F3/F5 完成全链交付。#29 F6 执行 owner 负责最终联合验收，须同时使用已验收的 F3/F4/F5，覆盖恢复提交与 checkpoint 保存前后崩溃、重复恢复、原请求/successor 并发回复、Stop、撤权、换届及重放；F4 独立验收不依赖 F6。A2/D4 增加组合验收，布局明确总管不可用态。主计划 D-dark 延后项改为新增参考暗色值迁移的边界，不再称产品缺少暗色；#11/#21 分别承接并存槽和逐面迁移阶段的明暗切换、暗色 token 消费与清理回归。

- `docs/plan/activation-task-specs/*.md` 与 `index.json`：每个待开始任务保存可直接同步的完整正文、原测试条目去向、DoD、owner、`withPlan: true`、方案与改动关口；索引用真实 `todoId` 关联来源、正文哈希、requires、blocks 和同步状态。复核 F2 五入口 guard、授权合取、直接与下游能力上限、派生撤权、逻辑分派用量及精确 plan/head 关口；对照 `agentMutate`、`delegateAndStartAgentSession`、`requestApproval`（`apps/api/src/agent/commands.ts`）核验复用边界。F4 对照 `createEventReader`（`apps/api/src/realtime/event-reader.ts`），落实快照水位、checkpoint、撤权过滤和容量测量验收，不将已有构件称为已实现组合。

## 验证与放行

- 将 AGENTS.md 九类测试逐 feature 映射到现有或明确待新增的测试文件、用例和断言；不适用项写具体理由，未运行项不填通过。迁移升级与空库验收、无源码安装、主题回归及恢复测试完整分配到对应任务。
- 执行前再次逐卡读取全部 29 卡，与规划快照比较 updatedAt、状态及正文 SHA-256；差异先归因并更新受影响规格、测试映射和门禁，涉及设计决定则交总管裁决后重新冻结，不覆盖用户更新。对索引执行 JSON 解析、正文哈希、路径、唯一 ID、原测试/DoD 覆盖、阶段 owner/输入/验收及依赖无环校验；含已关闭 #6 的历史条目去向和 F 链联合测试。人工检查撤回要求仅留在历史记录中。总管同步后重新读取 Todos 全文，逐项核对并记录结果。
- 本轮仅规划交接工件：按当前 AGENTS.md 运行适用的 `pnpm lint`、`pnpm typecheck`、`git diff --check`，并校验完整计划一致性、29 卡元数据/全文/哈希、逐 finding 状态及交接边界；按用户限定不无理由重跑产品全量测试，在检查记录中逐项说明适用性，不把未运行检查写成通过。后续完整规格修订阶段按 `docs/CI.md` 准备专属测试环境和 fake agent/provider，运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e` 及 `git diff --check`；记录实际提交、退出码、失败和跳过项，历史检查不冒作本轮结果。
- blocking/high 全部有 owner 和具体处置；总管安排不同于修订者的另一 agent，针对准确改动提交、全部卡片输入包、处置台账、F 链共同契约/联合验收分配及明暗主题回归分配进行定向独立复核，证据落盘。复核通过、blocking/high 闭合且对应必需检查通过后，总管才确认正常合并与相关实现放行；真实新设计分歧交总管向用户裁决并保留门禁。完成报告列文件、规格变化、检查结果、演示方式、限制及分歧，S1 仅为流程资产。