# M1 受控方案入口

本轮仅方案文档修订，未产品实施。平台计划保持不变，当前注入全文两份一致；按明确反馈同步同 todo/会话分支。终态恢复采用精确原动作来源只读确认，等待采用“结算等待，自动继续”；两项 blocking 具体方案仍须平台另一 Agent 定向复审闭合、Chief confirm 才实施。文档提交或合入不表示整卡完成。

## 完整独审入口

1. [当前完整 spec](current-spec.md)、[steering及两项阻塞](steering.md)、[冻结M1全文](frozen-M1.md)。用户后续裁定覆盖对应原条款，冻结来源与旧报告不改。
2. [savedplan](savedplan.md) / [implementation](implementation.md)：当前完整注入原文一致，[全文绑定](plan-fulltext-binding.json)区分工具截断/version null。
3. [Proposed来源ADR](../../adr/0080-exact-session-execution-result-confirmation.md)、[安全合同](security-contract.md)：实际提交E来源同事务快照、只读身份/live归属/最小DTO，C2提前refresh和双nativeinstall拒绝，旧null/unproven fail closed，不假认Pi内部completion。
4. [Proposed等待ADR](../../adr/0081-pi-execution-wait-continuation.md)、[等待合同](wait-contract.md)、[迁移合同](migration-contract.md)/[DDL提案](schema-proposal.sql)：字段/约束/回填缺口、滚动兼容、锁序与回滚；仅提案，没有执行SQL或改产品SCHEMA。
5. [逐operation索引](operation-index.md)/[完整映射](operation-decisions.json)、[兼容](compatibility.md)、[生命周期](lifecycle.md)：完整M1范围，等待/monitor/唯一续Turn/admission，Stop/finally独立signal原E与残留。
6. [九类DoD及两阻塞真实场景](verification.md)、[来源/字节](sources.md)、[静态门禁](review.md)/[真实静态回执](static-checks.json)。产品测试和RequiredCI尚未运行，静态不代运行。

来源本轮独立refs/heads/main实读仍为e49eda142d61bdd248ddc42ec16f5563abd4bbc6；历史候选69f84207b6cc85a46609bdb781ecb377f4e0d743不是main。[旧Git与工作树原件索引](history/candidate-69-manifest.json)保存gPL、旧错误证明和旧静态首败，不倒改历史。当前完整源在[source manifest](source-manifest.json)/[ZIP](source-snapshot.zip)，不从工具显示前缀重建hash。

成功/拒绝确认零签Token/续Session/receipt/Activity/event/outbox，绕resolveCoordinationIdentity usage/createC Session；原authorization_denials独立审计例外保留。普通terminal E门禁、旧settle恢复、Human控制与批准权限保留；等待续接fresh授权且绝不自动解除pause。

仅Todos和仓库记录；UI/F/TA/真实外发发布/团队权限扩大不在范围。只运行文档归档和静态命令，所有交付路径保留，无服务资源清理。本文件可通过变更审查页预览按钮阅读；最终回复给准确head与Files入口，停confirm供完整独审。
