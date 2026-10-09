# M2 受控方案交付

本包仅是规划候选，停 confirm 供平台另一 Agent 独审；产品实现、产品测试与本候选 Required CI 均未在此包宣称完成。本轮使用 Todos＋仓库记录，不存在真实 WorkMesh Project／WorkItem 同步记录。

## 审阅入口

1. [当前规格](spec.md)、[冻结 M2 全节](frozen-m2.md)、[平台计划同步副本](savedplan.md)与[执行副本](implementation.md)。
2. [Proposed ADR](../../adr/0082-parent-child-status-projection.md)、[父子安全合同](security-contract.md)、[OpenAPI 提案](openapi-proposal.yaml)、[Zod／SDK 提案](dto-proposal.ts)、[policy／binding 提案](policy-proposal.json)。
3. [逐操作矩阵](operation-matrix.md)、[机器决策](operation-decisions.json)、[消费者兼容](compatibility.md)、[子任务闭环](lifecycle.md)。
4. [九类验证及真实运行方案](verification.md)、[原测试逐行承接](acceptance-matrix.json)、[来源与 M1 前置](sources.md)。
5. [本轮静态结果](planning-report.md)、[静态回执](static-checks.json)、[来源全文 ZIP](source-snapshot.zip)、[逐成员字节索引](source-manifest.json)及[交付文件索引](artifact-manifest.json)。

## 来源与状态

真实 main 与本轮开工 HEAD 均为 `cfce77546b64c2a8d7d12949261c38e2f666d5ae`；冻结路线为 `c768e1e3db297d8b91b53dd68b60e723a8a40e7d`。source-snapshot.zip 包含按内容寻址的完整 Git blob／工作树原字节，索引逐 path／commit／blob／member 分列，不用 Windows 换行展开代替 Git hash。

原方案 doc:5XFjpFz5JO_Sf6_WBAZD6 的全文来自本轮平台注入 saved copy，原作者正文与完整原答复另存 history。todos 的 Saved plan 返回截断；conversation 只给 doc 链接，不能当后端全文读回。独立 implementation 注入原件未取得，当前 implementation.md 是本 Agent 与修订后 savedplan.md 同内容的仓库副本；取得方式、空元数据和不足见 [输入 provenance](input/provenance.json)。

在本文件的变更预览中使用 preview 按上述顺序审阅。Git 精确交付 head 由最终回复及平台分支给出，正文不循环追写未来自身 commit SHA。
