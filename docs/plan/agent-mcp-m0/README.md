# M0受控方案与定向复审入口

本目录属于原todo [#54](todo:pMO6s_SmEL_d81kjKm6S1)，本轮仅按既有授权同步文档，不进入产品。平台当前计划doc:WS-FdgmfTwloZE8hNXvAb已经存在；不再次edit_plan，不创建新计划。提交后停confirm，四项blocking必须由另一Agent定向复审闭合，Chief确认后才进入产品；文档提交不是整卡完成或产品放行。

1. [savedplan.md](savedplan.md) 与 [implementation.md](implementation.md)：本轮注入的完整当前平台计划，正文不增加头尾，字节相同。
2. [spec.md](spec.md) 与 [steering.md](steering.md)：完整当前spec和原授权/审查/本轮同步指令；历史输入未改写。
3. [compatibility.md](compatibility.md)：API资格/adapter名单分工、installation用途、C到E单次Token资格、旧schema兼容与Runner401合同提案；正式ADR前的 [决策草案](discovery-contract-draft.md) 状态为Proposed。
4. [operation-index.md](operation-index.md)、[operation-decisions.json](operation-decisions.json)：实际operation全集、结构化C/E/H/installation决定、当前与拟binding、variant和逐操作反例。
5. [verification.md](verification.md)、[ci-integration.md](ci-integration.md)：九类DoD、真实客户端与现有api-integration Required job的完整接线。
6. [sources.md](sources.md)、[source-manifest.json](source-manifest.json)、[archive-metadata.json](archive-metadata.json)、[generation.json](generation.json)：精确base、最新main增量、doc引用、真实生成时序和Git/工作树字节。
7. [review.md](review.md)、[sync-check-receipt.json](sync-check-receipt.json)、[archive-byte-manifest.json](archive-byte-manifest.json)：本轮实际静态核验及提交绑定，不冒产品/CI通过。
8. [history/original-manifest.json](history/original-manifest.json)：原00a5提交21文件完整可达性及逐blob指纹；旧正文、截断读回、版本null、回执/草案另存history，原首败 [first-byte-check-failure.md](first-byte-check-failure.md) 保持原字节。

JSON和核验脚本仍按现行CI真实分类，不修改CI/属性豁免，不因docs路径冒称prose绿色。受控文档同步之外无产品源码、API、迁移、事件、权限或Web UI变更。当前worktree、恢复目录和原证据保留；实际提交head在最终交付报告，不预填自身SHA。
