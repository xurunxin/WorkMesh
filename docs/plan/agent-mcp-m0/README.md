# M0受控方案与两项定向复审入口

本目录属于原todo [#54](todo:pMO6s_SmEL_d81kjKm6S1)。仅沿既有授权同步现有平台计划 doc:Qd1Ks9EH9uEvl1JW3O68D 与方案资料，没有edit_plan或创建新计划。提交后停confirm，供另一Agent定向复审领域审计与binding身份两项blocking；不confirm产品、不merge文档完成整卡。前次API/adapter、安装与目标身份路径、RequiredCI接线的已闭边界保持。

1. [savedplan.md](savedplan.md) 与 [implementation.md](implementation.md)：完整当前注入正文，字节相同；[全文绑定](plan-fulltext-binding.json)和平台截断前缀分别核验。
2. [spec.md](spec.md)、[steering.md](steering.md)、[本轮完整反馈](steering-current.md)：完整spec、历史授权和本轮指令。
3. [compatibility.md](compatibility.md)、[合同决策草案](discovery-contract-draft.md)：API资格与adapter投影、直接E自身/独立C目标E变体、旧schema/URI兼容、401和稳定逻辑身份；草案仍Proposed。
4. [operation-index.md](operation-index.md)、[operation-decisions.json](operation-decisions.json)：实际全集的credential/role/state/scope/variant、当前与拟binding、完整输入返回引用、具体正反例及九类适用性。
5. [domain-audit.md](domain-audit.md)、[domain-rules.json](domain-rules.json)：原99待核（43已有binding）的逐项静态审计。仅六项有具体领域差异及M0闭合条件，不再用通用pending作为最终决定。
6. [verification.md](verification.md)、[ci-integration.md](ci-integration.md)：真实客户端/Pi、正反例、九类DoD和现有api-integration Required job接线；这些产品用例尚未运行。
7. [sources.md](sources.md)、[source-manifest.json](source-manifest.json)、[平台观察](platform-observation-q.json)、[generation.json](generation.json)：历史base与实际main不可变blob、平台doc/version null、实际生成时序和工作树差异。
8. [review.md](review.md)、[audit-check-receipt.json](audit-check-receipt.json)、[archive-byte-manifest.json](archive-byte-manifest.json)：本轮实际静态语义和Git字节核验；不冒产品/RequiredCI通过。
9. [旧受控原件索引](history/previous-1bcf-manifest.json)：1bcf/WS全部35文件的Git与读取工作树字节在history/previous-1bcf.zip；原00a5/K7历史索引和原ENOBUFS首败保留。旧sync-check-receipt及platform-observation-current仍仅具有旧轮含义。

静态入口为 `python -X utf8 -B docs/plan/agent-mcp-m0/archive-check.py`，生成入口为 `python -X utf8 -B docs/plan/agent-mcp-m0/audit-generate.py`，旧Node生成入口转接同一受控生成器。所有改动仅本目录；当前与恢复目录保留，无容器、服务、数据库或外发。JSON/脚本按现行CI真实分类，不改CI或属性豁免。提交精确head由交付消息报告，不预填自引用SHA。Markdown可用变更审阅中的预览按钮直接查看。
