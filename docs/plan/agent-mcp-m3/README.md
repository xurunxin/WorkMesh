# M3 产品与受控规划交付

成果独审的三项 blocking 修复入口：[修复与新验证报告](review-fixes-report.md)。当前默认分支、principal／Team 成员资格和 context 第八次领取崩溃终态均按本轮实际源码与回执复审；[旧候选历史原件](review-fixes-history.json) 保留，不能用旧绿色替代当前修复验证。

当前产品入口：[主力整体产品报告](product-report.md)、[四十操作矩阵](product-operation-matrix.md)、[原九类验收](product-acceptance-matrix.md)、[十八恢复行](product-recovery-matrix.md)、[命令及原输出索引](product-check-index.json)、[源字节清单](product-source-manifest.json)、[资源保全清理](product-resources.json)。产品结果以这些实际回执为准；未取得正式成果独审、最新PR Required CI或Done/main，不代表验收。

下文为已审方案的历史规划入口，历史“未运行／停confirm”状态保留其原时点含义。方案候选499ccc1419ba2fbd15171f6ff7c0adc78647c2cc已经独审及Chief确认进入实现，不重复申请规划或实现许可。原文及来源原件继续保留。

## 历史规划交付

状态：规划候选，停 confirm 供 _oY 正式独立方案审查；尚未产品实现，尚未运行 M3 产品测试或取得本候选 Required CI。

本次修订回应三条blocking，先读 [独审修订入口](review-response.md)、[Worker恢复矩阵](worker-recovery.md)、[发送前锁与事务](worker-authority.md)、[reviewer锁内replay](review-replay.md)。原候选原件保全，不称已获重新审查批准。

## 审阅入口

1. [准确 spec](spec.md)、[冻结 M3 全节](frozen-m3.md)、[同步计划](savedplan.md)、[执行副本](implementation.md)。
2. [Proposed ADR](../../adr/0083-exact-provider-action-query-and-review-repository-scope.md)、[精确 action 安全合同](security-contract.md)、[reviewer 范围兼容](scope-compatibility.md)、[OpenAPI 提案](openapi-proposal.yaml)、[DTO 提案](dto-proposal.ts)、[policy 提案](policy-proposal.json)。
3. [操作矩阵](operation-matrix.md)、[机器决策](operation-decisions.json)、[消费者兼容](compatibility.md)、[真实调用链](lifecycle.md)。
4. [九类具体验证](verification.md)、[原九类逐行承接](acceptance-matrix.json)、[来源与读取限制](sources.md)、[来源原字节索引](source-manifest.json)。
5. [本轮核验与首败](planning-report.md)、[静态结果](static-checks.json)、[候选文件指纹](artifact-manifest.json)、[本轮资源](resources.json)。

主线和冻结来源以 source-manifest.json 中精确 Git 对象为准；source-snapshot.zip 保存完整 Git blob 和本轮工作树字节，不将 Windows 换行字节当成历史 Git 原件。

本轮仅修改本目录和 Proposed ADR。实施前先闭独审 blocking/high，并由 Chief confirm；此包不代产品测试、成果独审、最新 PR Required CI 或实际 Done/main。记录只在 Todos＋仓库，不存在真实 WorkMesh Project/WorkItem 同步。

## 演示

在 change review 对本文件点预览，依次打开上述合同、范围兼容、逐操作矩阵和验证入口。全部未来测试标未运行，已有 M2 的通过状态单独归属其原候选。
