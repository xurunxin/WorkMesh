# 初稿反馈的生产者修订交接

初稿提交为 `f137787faa0979b59dd70668001b09bb5e132421`，实际输入 main 为 `5743f027ec86e8726d2cfdd38e0e038bdebeae49`。本文件逐条交接生产者的修订与证据，不代替 Chief 安排的最终独立成果审查。最终 head 由平台回合结束提交生成，须与 `execution-manifest.json` 核对，不能使用初稿 SHA 冒作最终交付。

| 初稿 finding | 具体修订位置与可核验内容 | 验收责任与现阶段结果 |
| --- | --- | --- |
| R1-H05：分派身份 | `docs/plan/activation-task-specs/27.md:11`、`:41` 使用独立 logical dispatch 记录/幂等身份；ADR 0078 的用量台账和 Migration、主计划共同契约、#25/#27/#29 完整正文及真实 todoId 索引一致。委派 id/revision 仅授权来源；同一 revision 多个合法分派分别记账，同请求重放只产生一次结果/扣量，新 Session retry 新建分派。 | #25 交付记录/台账，#27 交付 checkpoint 同事务结果引用，#29 联合验收。静态校验核对全文哈希、真实 id 与依赖；相关新用例待实现，未用既有全量回归冒作新功能通过。 |
| R1-H06：九类覆盖 | `test-coverage.json`、`test-coverage.md` 按 29 feature 各列九类，139 个适用项分别给具体断言、用例名、实际现有文件或待建 owner；不适用项给该面的边界依据。154 条原 checkbox 与原 DoD 保留全文/哈希/目标 id，原受控合并前条目在 `legacy-requirements.json` 逐条分配。 | 各 feature 执行者负责新增/扩展用例；`verify-specs.mjs` 检查 261 行、适用断言不复制整段、现有文件存在与原条目完整性。#6 额外历史全文缺口单列，不能把受控 B2 条目齐全当未知原卡全文追回。 |
| R1-H07：锁序 | ADR 0078 恢复协议及 `lock-contract.md` 统一无锁 locator → 排序 Session advisory → 既有生命周期前缀 → Chief appointment 前缀 → 完整 authority rank → guard 重验 → root/前驱/稳定后继业务锁。Chief 委派留在 delegation rank；锁集变化整事务回滚，业务锁后不得补低 rank。#24/#25/#28 与主计划/阶段索引同步。 | #28 更新 symbol/statementId 锁清单并验收恢复 × reply/answer/Human resolve/Stop/撤权/换届、双恢复及锁集变化；#29 叠加 checkpoint 崩溃/重放。当前代码证据是既有 `lockReplyParticipantsBeforeReservation`、`lockAgentAuthorityPlan`、post-lock guard；本轮没有新 SQL，不声称未来并发测试已经通过。 |

三项 high 的生产者修订均已落盘，详细位置也写入 `findings.json` 的 `producerEvidence`。现无已知未处置的 blocking/high 修订项；所有 high 的独立闭合状态仍为待最终定向复核。ADR 实际状态逐文件读取并列入 `adr-states.json`，包括两份 0028，不保留“仍须人工读取”与已核验结论矛盾。

本轮五项必需检查已成功，集成 310 通过/2 条件跳过、标准 E2E 65 通过，命令、时间、环境与日志见 `execution-checks.md`/JSON。检查运行基于上述 main 加本轮工作树；仅追加文档证据、覆盖索引修正和静态收尾后不重复运行已成功的全量检查。静态/历史原件/归档校验及完整字节清单另存，不预填最终 PR CI 成功。

继续保留：首次 bootstrap/环境设置失败、run2 中断、可重算的原字节 ZIP 与展示说明、UI 超时未知根因；#6 历史全文来源缺口（R1-M06）；设备矩阵/渠道部署及容量预算的具体可审方案与阶段关口（R1-M05）。这些事项由 Chief 按来源核验、既有授权与真实分歧处理，不默认为覆盖完整或用户批准。本轮不合入、不同步 Todos、不放行产品实现；最终精确 head 成果独审与最新 Required CI 通过后才进入后续获批流程。
