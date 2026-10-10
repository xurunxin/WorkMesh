# M2 受控交付

当前产品候选入口：[中文成果报告](product-report.md)、[18行九类闭合矩阵](product-closure-matrix.md)、[91操作实际入口与边界](product-operation-results.md)、[全部命令结果](product-check-results.json)、[运行源码前后绑定](product-run-source-binding.json)、[Git／工作树双字节索引](product-source-manifest.json)、[资源准备恢复与清理](product-resource-results.json)。本机结果不替代平台成果独审、最新 PR Required CI 或 actual Done/main。产品阶段仅 Todos＋仓库记录，无虚构 WorkMesh 远端事实。

下面保留规划阶段说明，完整原候选在精确Git历史及归档中；“规划未运行产品”是当时状态，不冒当前产品通过或改写已审历史。

## 规划阶段原说明

本包仅是规划候选，停 confirm 供平台另一 Agent 独审；产品实现、产品测试与本候选 Required CI 均未在此包宣称完成。本轮使用 Todos＋仓库记录，不存在真实 WorkMesh Project／WorkItem 同步记录。

## 审阅入口

1. [当前规格](spec.md)、[冻结 M2 全节](frozen-m2.md)、[平台计划同步副本](savedplan.md)与[执行副本](implementation.md)。
2. [Proposed ADR](../../adr/0082-parent-child-status-projection.md)、[父子安全合同](security-contract.md)、[OpenAPI 提案](openapi-proposal.yaml)、[Zod／SDK 提案](dto-proposal.ts)、[policy／binding 提案](policy-proposal.json)。
3. [逐操作矩阵](operation-matrix.md)、[机器决策](operation-decisions.json)、[消费者兼容](compatibility.md)、[子任务闭环](lifecycle.md)。
4. [九类验证及真实运行方案](verification.md)、[原测试逐行承接](acceptance-matrix.json)、[来源与 M1 前置](sources.md)。
5. [本轮修订与静态结果](planning-report.md)、[原三项 blocking 审查](input/original-review.md)、[修订说明](review-repair.md)、[静态回执](static-checks.json)、[来源全文 ZIP](source-snapshot.zip)、[逐成员字节索引](source-manifest.json)及[交付文件索引](artifact-manifest.json)。

## 来源与状态

真实main仍为 `cfce77546b64c2a8d7d12949261c38e2f666d5ae`，本轮修订开工HEAD为已审旧候选 `5356b0619bffe3130a377f68e38a2a89931962a1`；冻结路线为 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d`。source-snapshot.zip保持完整来源原字节，本轮重新逐member／Git对象／工作树核对；[旧候选完整归档](history/reviewed-candidate.zip)及[逐blob索引](history/reviewed-candidate-manifest.json)保52份原件，包括原首败、旧规划和原source ZIP，不用Windows换行展开替Git hash。

当前方案doc:prvLepVgLTOEbRNt56WSU全文来自本轮平台注入saved copy，保于input/platform-injected-revised-plan.md和history/author-revised-plan.md；[原候选到当前正文差异](history/reviewed-to-current-plan.diff)分列。首轮doc:5XFjpFz5JO_Sf6_WBAZD6和旧5356正文均保留，原审查不改写为通过。todos当前Spec完整读回，Saved plan段截断；conversation只给doc链接，不能冒后端计划全文。独立implementation原件仍未取得，implementation.md是当前savedplan的byte-equal仓库执行副本，元数据不足见[provenance](input/provenance.json)。

在本文件的变更预览中使用 preview 按上述顺序审阅。Git 精确交付 head 由最终回复及平台分支给出，正文不循环追写未来自身 commit SHA。
