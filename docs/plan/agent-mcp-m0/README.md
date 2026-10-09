# M0受控计划交付

本目录是原todo [#54](todo:pMO6s_SmEL_d81kjKm6S1) 的计划归档与独审输入，状态为可审提案。当前只补交文档，不进行产品实现；本轮用户已明确允许仅文档落盘和提交。提交后停在confirm，待另一Agent平台独审及Chief确认。后端独立方向和Human/C/E边界已定，不重问。

## 审阅顺序

1. [savedplan.md](savedplan.md)：现有平台保存计划的完整正文，正文不加头尾、不改版。[implementation.md](implementation.md) 是相同字节的受控实现计划。
2. [spec.md](spec.md)：平台当前完整spec；[steering.md](steering.md) 保留本次补交反馈和授权。
3. [compatibility.md](compatibility.md)：既有计划的发现字段、旧schema兼容、401刷新和真实conformance说明，全部为合同评审输入，不是已接受合同。
4. [operation-index.md](operation-index.md) 与 [operation-decisions.json](operation-decisions.json)：每条实际operation的来源、当前声明、发现决定、具名适配、缺口和测试映射。
5. [verification.md](verification.md)：九类验收及DoD逐项映射；[review.md](review.md) 区分本轮文档核验和未来产品检查。
6. [sources.md](sources.md)、[archive-metadata.json](archive-metadata.json)、[source-manifest.json](source-manifest.json)：精确来源、平台docID、真实时序、Git blob与工作树字节。
7. [check-receipt.json](check-receipt.json)、[archive-byte-manifest.json](archive-byte-manifest.json)、[first-byte-check-failure.md](first-byte-check-failure.md)：真实检查回执、暂存blob字节、CI分类及首败保全。

只在本目录新增文档及归档核验脚本。无产品源码、迁移、API、事件、领域授权或Web UI变更；保留现行消费者相称兼容验证，不以UI改版作为后端任务前提。资源客户端、仅tool客户端和真实Pi工具输入仍是M0验收责任。

JSON材料会按当前CI策略触发其真实分类，不能因为位于docs而冒称所有变更都是prose或沿旧head绿色。本轮不运行无收益的全产品测试，不修改CI或属性文件获得豁免。当前目录和原恢复目录均保留。

## 交付边界

完整savedplan来自本轮消息注入的权威保存副本，与平台todos返回的截断前缀核对一致；工具没有读回该doc全文，版本字段未提供，记录为null。原平台计划ID从conversation实读。本轮不调用edit_plan、不循环生成计划、不预填新docID，也不把当前提交head写入自身生成材料。

复用原方案已记录的Todos＋仓库双轨例外，不伪造WorkMesh Project/WorkItem。#53原方案及历史独审材料保持原语义；本目录本轮静态核验不替代#54的平台独审或产品验收。
