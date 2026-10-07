# 首轮计划复核处置与交接

本文件是生产者的规划处置记录。三项 blocking 均保留为「待原复核 agent 独立核验」，不声明已独立闭合，不放行完整规格修订或 B/A/D/C/F 实现。总管须在取得缺失输入后，把本轮精确交付 commit 交给原复核者；该 commit 由交付回复提供，工件不自引用尚未生成的 commit。

## 输入与实际结果

- 当前计划：`doc:rZ-zANJldiqLoLjgvdqvm`，完整正文见 [plan.md](plan.md)，来源为用户消息中的平台保存副本及本轮成功的 `edit_plan` 回执，文件与该副本逐字符一致。捕获时间、来源、全文哈希见 [handoff-manifest.json](handoff-manifest.json)。工具没有提供直接 doc 读取或平台版本编号，不能声称独立读回。
- 本轮 Todos 读取见 [todo-inputs.json](todo-inputs.json)：29/29 卡的元数据已采集，含已完成 #1/#2/#10、已关闭 #6；28/29 正文完整。#3 在工具返回 8,000 字符处截断，`spec=null`、`specSha256=null`；保留实际前缀、原始返回及各自哈希，不将其冒称全文。总管需提供 #3 同一 `updatedAt` 的完整源文本，或取得完整读取入口后重新采集。缺失尾部不推断、不补写。逐卡读取时间有实际范围，`atomicSnapshot=false`。
- 最新已核实输入提交为 `dcf355735341bc6daac4101b8c7d0efbaabbe764`，本工作树 base 为 `36c7709a8bd49c640b8dbfa04a09cfb777f943c8`。两者没有冒称一致。该主线提交的 ADR 0078、两轮报告、主计划及原外部报告的完整 blob/正文/SHA-256 保存在 [main-inputs.json](main-inputs.json)，作为只读交接副本。以新正文审查 F2，不按旧检出再判撤权传播、0062 合取、两层上限、用量台账「未修」；各任务覆盖是否充分仍待实际独审。
- 当前 #18 快照仍为 `building`。G1 最终 settled、最终证据经独审与必需检查后实际进入最新 main、Chief 确认规格修订执行，三者都继续作为前置。P1 冻结事实表本轮不重新裁决，#2 完成状态不能代替其实际冻结证据核验。
- 原审查引用的 `doc:BVfhr56cxlVUURaZjatX_` 未获得独立全文读取；当前计划副本不冒作该文档。#6 合并前的原测试/DoD 历史全文仍须执行阶段追回；当前关闭卡完整快照不能替代历史正文。

## 逐 finding 处置

| Finding | 严重性 | 处置 owner | 独立复核状态 |
| --- | --- | --- | --- |
| R1-PR-B01：全 29 卡原文/元数据/哈希及复读 | blocking | R1 收集与记录；总管补源并安排原复核者 | 未闭合：#3 完整源文本及原平台 doc 缺口保留 |
| R1-PR-B02：G1 最终主线门禁与另一 agent | blocking | 总管落实最终门禁；R1 固定审查输入 | 待原复核者核验规划；G1 最终门禁未确认 |
| R1-PR-B03：F 链共同契约与联合验收 | blocking | R1 冻结契约；F3/F4/F5/F6 各执行 owner；总管派发前落实 | 待原复核者核验契约与测试分配；未实施 |
| R1-PR-T04：已有暗色事实 | 原反馈未标严重性 | R1 修订规格；#11/#21 各执行 owner | 代码事实已只读复核；规格修订及回归未实施 |

### R1-PR-B01

原意见要求保存全部 29 卡最新完整 spec、`updatedAt`、状态、来源、哈希，并在执行前再次读取；不能只保存待开始卡的替换正文。计划位置为 `plan.md:3`、`plan.md:15`、`plan.md:30`。

本轮已提交每卡读取原文与公开元数据，没有写入任何令牌或机器配置。截断标记和附件 marker 原样保留在工具原文中；完整 spec 的哈希针对其解码字符串的 UTF-8 字节计算，不对换行或 Unicode 做规范化。#3 的不完整正文不能产生全文哈希，完整性验证因此必须失败，不能写「29/29 全文通过」。

执行阶段仍须逐卡复读，比较状态、`updatedAt` 和全文哈希，对差异先归因并更新受影响规格/测试映射/门禁；不能覆盖用户更新。闭合所需证据：完整源包、原平台 doc 可追溯交接、关闭卡历史测试/DoD 去向、复读差异，以及原复核者针对精确 commit 的结论。

### R1-PR-B02

原意见指出最终 G1 证据尚未合入、工作树与新主线不一致、旧 CI 不可替代最终门禁，以及缺少不同 agent 的定向复核。计划位置为 `plan.md:5`、`plan.md:9`、`plan.md:32`。

`scripts/verify-build-input-reachability.mjs:15` 的 `checkWorktreeEntry` 会对工作树、base blob、SHA-256、字节数逐项检查；`inspectCommittedFile`（同文件:57）实际读取提交 blob。该脚本现有入口清单不覆盖新增 ADR 0078 及第二轮报告，因此计划另查对应正文/blob，不修改脚本或 G1 历史证据。本轮只是交接新 main 原文，没有运行此脚本并宣布 G1 通过。

闭合所需证据：G1 最终主线提交及 settled/必需检查/独审证据、输入可达性清单与新增文件校验、Chief 的执行确认，以及不同于生产者的原复核 agent 对本轮精确 commit 的定向结论。G1 未满足不阻止本轮已授权规划交接，仍阻止完整规格修订执行。

### R1-PR-B03

原意见指出 F5/F6 删除互锁后仍缺共同契约冻结、F3/F4 接口交接及最终联合验收责任。计划位置为 `plan.md:9`、`plan.md:21`、`plan.md:23`、`plan.md:30`。

实际代码事实：

- `packages/db/migrations/0032_agent_inbox_receipts.sql:92` 的 actor 目标唯一索引与同文件:95 的 session 目标唯一索引均包含 recipient、kind、source_type、source_id，不能靠新输入 ID 自动绕过来源去重。
- `loadAgentItemForUpdate`（`apps/api/src/inbox/routes.ts:167`）验证 agent/活动会话、idempotency，并在事务内调用 `authorizeCommandInTx` 后锁定条目；恢复复用授权/锁定模式，不能把 lease 或 View Model 当授权。
- `registerInboxRoutes`（同文件:806）中的 reply 按 `source_room_message_id` 写入 `room_message_response_resolutions`（同文件:1123），之后更新 Inbox 状态。successor 身份必须与该原逻辑来源的最终 resolution 收敛。
- 新主线 ADR 0078:445 禁止 Stop 后从同一输入重新激活，同文件:470 要求处理结果与 checkpoint 原子关联。上述语义及原收件事实不可因 successor 改变。

用户已选有审计的 successor / re-delivery，规划不重问该选择。R1 在 G1 后的规格修订阶段先共同冻结下列契约，并显式修订 ADR 0037 与 ADR 0078，当前没有执行协议或数据库变更：

| 冻结项 | 必须写明的契约与验收边界 |
| --- | --- |
| 逻辑身份 | 原逻辑来源保持不变；恢复意图与 successor 各有稳定身份及审计关联；保留原 claim、会话归因与收件事实，禁止原地覆盖 `claimedBySessionId` |
| 恢复资格 | 对当前任命代次、实时授权、未解决来源、Stop/撤权/预算逐项判定；新输入 ID 不清除原停止或权限限制，ACK 不等于 resolve |
| 幂等与并发 | 同一恢复意图重放返回同一 successor；原请求与 successor 竞争同一来源最终 resolution；已解决来源不产生新的有效恢复输入；定义锁定顺序与竞争失败结果 |
| 提交协议 | 状态、事件、outbox 同事务；恢复/激活提交结果与 checkpoint 的原子关联明确，外部投递只在提交后发生；事务失败不遗留可继续消费的恢复结果 |
| 来源兼容 | 说明新增恢复关系与既有 recipient/source 唯一键、源消息 resolution 的增量关系，不能把现有迁移已实现的事实当作新恢复机制 |

同一卡内分阶段，冻结阶段不创建新的循环依赖：

| 阶段 | 责任 owner | 前置/交接 | 验收责任 |
| --- | --- | --- | --- |
| 共同契约冻结 | R1 执行者；总管组织原复核者 | G1/P1 最终输入就绪；ADR 0037/0078 与完整卡正文同一来源 | 逻辑身份、资格、幂等、锁定/事务、checkpoint 与来源 resolution 可测试且无矛盾 |
| F3 激活接口 | #26 F3 执行 owner | F0/F1/F2 的约束与共同契约 | 按逻辑来源/恢复意图去重；Stop、撤权、换届、重放与来源限制生效；输出稳定激活结果 |
| F4 checkpoint 接口 | #27 F4 执行 owner | 共同契约与 F3 提交结果格式；独立于 F6 验收 | 快照水位、结果引用原子关联、撤权过滤、任命代次隔离及容量测量 |
| F5 恢复底层 | #28 F5 执行 owner | F1/F3；共同契约冻结；既有 Inbox fixtures | 重复恢复、原请求/successor 并发回复、原收件审计、授权/Stop 与恢复事务失败；不依赖 F6 工具 |
| F6 全链交付 | #29 F6 执行 owner | F1/F2/F3/F5；联合验收使用已验收的 F3/F4/F5 | 覆盖恢复提交/checkpoint 保存前后崩溃、重放、并发回复、Stop、撤权、换届；REST 到 conformance 完整交付 |

上述 owner 是责任角色，不冒称已分配给某实际 agent；总管须派发前落实。F5→F6 的交接包须包含稳定逻辑来源/恢复意图/结果标识、提交边界、授权失败行为、重放语义与底层 fixtures。F6 不反向成为 F5 底层验收或 F4 独立验收的前置；F6 owner 承担最终联合验收。

闭合所需证据：共同契约的规格实际修订、卡片接口和测试清单分配、责任落实与无环校验，以及原复核者对准确提交的结论。表内验收全部是未来责任，没有任何产品测试预填成功。

### R1-PR-T04

实际代码 `packages/ui/src/tokens.css:94` 已定义 `[data-wm-theme='dark']`；D0 `apps/web/e2e/baselines/d0/README.md:27` 明确支持且默认暗色。新主线主计划也已在 D0 与 D1 部分承认现有明暗切换，但 D-dark 延后项仍需清理语义；不得把它们整体判成尚未修订。计划位置为 `plan.md:19`、`plan.md:23`。

后续撤换 ADR 0077 的陈旧“当前仅亮色”前提及主计划 D-dark 表述，延后范围仅为新增参考暗色值迁移。#11 承担并存槽阶段的明暗切换/暗色 token 消费回归，#21 承担逐面迁移与旧值清理后的同类回归；D0 固定亮色取样不授权删除现有暗色。当前仅复核事实与记录修订责任，没有改权威文档或运行主题产品测试。

## 总管与原复核者核验步骤

1. 以交付回复的精确 commit 读取本目录。先验证计划 SHA-256、逐卡元数据/全文哈希及主线 blob 原文，不能只读聊天总结。
2. 运行 `node docs/reviews/r1/verify-handoff.mjs`。当前须报告 #3 全文缺失，不得当作已通过；`--integrity-only` 只检查已采集字节的完整性，不能替代完整输入门禁。
3. 总管补交缺失源材料后，原复核者逐项判断这三项 blocking 是否在规划层面闭合；独立结论须引用该准确 commit 和 finding ID，不能由生产者代写。
4. 回 confirm 仅限规划交接与下一步规划确认。G1 最终前置、执行前卡片/主线复读及之后的完整规格修订独审、必需检查与放行均保留。

检查实际结果和未运行项见 [checks.md](checks.md)。本轮不新增 WorkMesh Project/WorkItem，Todos＋仓库例外写在 `plan.md:9`。
